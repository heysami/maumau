import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { definePluginEntry, delegateCompactionToRuntime } from "./api.js";
import type { ContextEngine } from "./api.js";

const LOSSLESS_CLAW_DIR = "lossless-claw";
const CONTINUITY_FILE_DIR = "sessions";
const MAX_CONTINUITY_CHARS = 4_000;
const MAX_RECENT_MESSAGES = 6;

type ContinuitySnapshot = {
  version: 1;
  sessionKey: string;
  updatedAt: string;
  continuity?: string;
  inheritedFrom?: string;
  inheritedAt?: string;
  endedReason?: string;
};

function encodeSessionKey(sessionKey: string): string {
  return encodeURIComponent(sessionKey);
}

function normalizeText(value: string, maxChars = MAX_CONTINUITY_CHARS): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxChars ? `${normalized.slice(0, maxChars - 1)}…` : normalized;
}

function extractMessageText(message: AgentMessage): string | undefined {
  const content = "content" in message ? message.content : undefined;
  if (typeof content === "string") {
    const normalized = normalizeText(content);
    return normalized || undefined;
  }
  if (!Array.isArray(content)) {
    return undefined;
  }

  const chunks: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") {
      continue;
    }
    const typedBlock = block as { text?: unknown; type?: unknown; name?: unknown };
    if (typeof typedBlock.text === "string" && typedBlock.text.trim()) {
      chunks.push(typedBlock.text.trim());
      continue;
    }
    if (typedBlock.type === "toolCall" && typeof typedBlock.name === "string") {
      chunks.push(`[tool:${typedBlock.name}]`);
    }
  }

  if (chunks.length === 0) {
    return undefined;
  }
  return normalizeText(chunks.join(" "));
}

function buildRecentContinuity(messages: AgentMessage[]): string | undefined {
  const recent = messages
    .map((message) => {
      const text = extractMessageText(message);
      if (!text) {
        return undefined;
      }
      const role =
        "role" in message && typeof message.role === "string" && message.role.trim()
          ? message.role.trim()
          : "message";
      return `${role}: ${text}`;
    })
    .filter((value): value is string => Boolean(value))
    .slice(-MAX_RECENT_MESSAGES);

  if (recent.length === 0) {
    return undefined;
  }
  return normalizeText(recent.join("\n"), MAX_CONTINUITY_CHARS);
}

async function readSnapshot(filePath: string): Promise<ContinuitySnapshot | undefined> {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as ContinuitySnapshot;
    if (!parsed || parsed.version !== 1 || typeof parsed.sessionKey !== "string") {
      return undefined;
    }
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw err;
  }
}

async function writeSnapshot(filePath: string, snapshot: ContinuitySnapshot): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

async function removeSnapshot(filePath: string): Promise<void> {
  await fs.rm(filePath, { force: true });
}

class LosslessClawContextEngine implements ContextEngine {
  readonly info = {
    id: "lossless-claw",
    name: "Lossless Claw",
    version: "1.0.0",
    ownsCompaction: false,
  } as const;

  constructor(private readonly rootDir: string) {}

  private resolveSnapshotPath(sessionKey?: string, sessionId?: string): string {
    const key = sessionKey?.trim() || sessionId?.trim() || "unknown";
    return path.join(this.rootDir, CONTINUITY_FILE_DIR, `${encodeSessionKey(key)}.json`);
  }

  async ingest(): Promise<{ ingested: boolean }> {
    return { ingested: false };
  }

  async assemble(params: Parameters<ContextEngine["assemble"]>[0]) {
    const snapshot = await readSnapshot(
      this.resolveSnapshotPath(params.sessionKey, params.sessionId),
    );
    const continuity = snapshot?.continuity?.trim();
    return {
      messages: params.messages,
      estimatedTokens: 0,
      ...(continuity
        ? {
            systemPromptAddition: [
              "## Continuity Recall",
              "Recovered continuity from prior compaction or spawned-session handoff:",
              continuity,
            ].join("\n"),
          }
        : {}),
    };
  }

  async afterTurn(params: Parameters<NonNullable<ContextEngine["afterTurn"]>>[0]): Promise<void> {
    const continuity =
      (typeof params.autoCompactionSummary === "string" && params.autoCompactionSummary.trim()
        ? normalizeText(params.autoCompactionSummary)
        : undefined) ?? buildRecentContinuity(params.messages);
    if (!continuity) {
      return;
    }

    await writeSnapshot(this.resolveSnapshotPath(params.sessionKey, params.sessionId), {
      version: 1,
      sessionKey: params.sessionKey ?? params.sessionId,
      updatedAt: new Date().toISOString(),
      continuity,
    });
  }

  async compact(params: Parameters<ContextEngine["compact"]>[0]) {
    const result = await delegateCompactionToRuntime(params);
    const summary = result.result?.summary?.trim();
    if (summary) {
      await writeSnapshot(this.resolveSnapshotPath(params.sessionKey, params.sessionId), {
        version: 1,
        sessionKey: params.sessionKey ?? params.sessionId,
        updatedAt: new Date().toISOString(),
        continuity: normalizeText(summary),
      });
    }
    return result;
  }

  async prepareSubagentSpawn(
    params: Parameters<NonNullable<ContextEngine["prepareSubagentSpawn"]>>[0],
  ) {
    void params.ttlMs;
    const parentPath = this.resolveSnapshotPath(params.parentSessionKey);
    const childPath = this.resolveSnapshotPath(params.childSessionKey);
    const [parentSnapshot, previousChildSnapshot] = await Promise.all([
      readSnapshot(parentPath),
      readSnapshot(childPath),
    ]);
    if (!parentSnapshot?.continuity?.trim()) {
      return undefined;
    }

    await writeSnapshot(childPath, {
      ...parentSnapshot,
      sessionKey: params.childSessionKey,
      updatedAt: new Date().toISOString(),
      inheritedFrom: params.parentSessionKey,
      inheritedAt: new Date().toISOString(),
    });

    return {
      rollback: async () => {
        if (previousChildSnapshot) {
          await writeSnapshot(childPath, previousChildSnapshot);
          return;
        }
        await removeSnapshot(childPath);
      },
    };
  }

  async onSubagentEnded(
    params: Parameters<NonNullable<ContextEngine["onSubagentEnded"]>>[0],
  ): Promise<void> {
    const childPath = this.resolveSnapshotPath(params.childSessionKey);
    const snapshot = await readSnapshot(childPath);
    if (!snapshot) {
      return;
    }
    await writeSnapshot(childPath, {
      ...snapshot,
      updatedAt: new Date().toISOString(),
      endedReason: params.reason,
    });
  }

  async dispose(): Promise<void> {
    // Nothing to dispose.
  }
}

export default definePluginEntry({
  id: "lossless-claw",
  name: "Lossless Claw",
  description: "Bundled lossless transcript continuity context engine",
  kind: "context-engine",
  register(api) {
    const stateDir = api.runtime.state.resolveStateDir(process.env, os.homedir);
    const rootDir = path.join(stateDir, LOSSLESS_CLAW_DIR);
    api.registerContextEngine("lossless-claw", () => new LosslessClawContextEngine(rootDir));
  },
});

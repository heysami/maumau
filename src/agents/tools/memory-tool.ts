import fs from "node:fs/promises";
import path from "node:path";
import { Type } from "@sinclair/typebox";
import type { MaumauConfig } from "../../config/config.js";
import type { MemoryCitationsMode } from "../../config/types.memory.js";
import {
  readMemoryOverlayPath,
  storeThroughMemoryOverlays,
} from "../../memory/overlay-registry.js";
import type { MemorySearchResult } from "../../memory/types.js";
import type {
  MaumauPluginToolContext,
  MemoryOverlayContext,
  MemoryStoreDurability,
  MemoryStoreTarget,
} from "../../plugins/types.js";
import { parseAgentSessionKey } from "../../routing/session-key.js";
import { resolveAgentWorkspaceDir, resolveSessionAgentId } from "../agent-scope.js";
import { resolveMemorySearchConfig } from "../memory-search.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readNumberParam, readStringParam } from "./common.js";

type MemoryToolRuntime = typeof import("./memory-tool.runtime.js");
type MemorySearchManagerResult = Awaited<
  ReturnType<(typeof import("../../memory/index.js"))["getMemorySearchManager"]>
>;

let memoryToolRuntimePromise: Promise<MemoryToolRuntime> | null = null;

async function loadMemoryToolRuntime(): Promise<MemoryToolRuntime> {
  memoryToolRuntimePromise ??= import("./memory-tool.runtime.js");
  return await memoryToolRuntimePromise;
}

const MemorySearchSchema = Type.Object({
  query: Type.String(),
  maxResults: Type.Optional(Type.Number()),
  minScore: Type.Optional(Type.Number()),
});

const MemoryGetSchema = Type.Object({
  path: Type.String(),
  from: Type.Optional(Type.Number()),
  lines: Type.Optional(Type.Number()),
});

const MemoryStoreSchema = Type.Object({
  text: Type.String(),
  summary: Type.Optional(Type.String()),
  kind: Type.Optional(Type.String()),
  durability: Type.String({ enum: ["daily", "durable"] }),
  target: Type.String({
    enum: ["active-user", "workspace", "group", "global", "provisional"],
  }),
  targetId: Type.Optional(Type.String()),
});

function resolveMemoryToolContext(
  options: {
    config?: MaumauConfig;
    agentSessionKey?: string;
  } & Partial<MaumauPluginToolContext>,
  opts?: { requireSearchConfig?: boolean },
) {
  const cfg = options.config;
  if (!cfg) {
    return null;
  }
  const agentId = resolveSessionAgentId({
    sessionKey: options.agentSessionKey,
    config: cfg,
  });
  if (!agentId) {
    return null;
  }
  if (opts?.requireSearchConfig !== false && !resolveMemorySearchConfig(cfg, agentId)) {
    return null;
  }
  return {
    cfg,
    agentId,
    overlayContext: buildMemoryOverlayContext(options),
    workspaceDir: options.workspaceDir ?? resolveAgentWorkspaceDir(cfg, agentId),
  };
}

function buildMemoryOverlayContext(
  options: {
    config?: MaumauConfig;
    agentSessionKey?: string;
  } & Partial<MaumauPluginToolContext>,
): MemoryOverlayContext {
  return {
    config: options.config,
    workspaceDir: options.workspaceDir,
    agentDir: options.agentDir,
    agentId: options.agentId,
    sessionKey: options.agentSessionKey ?? options.sessionKey,
    sessionId: options.sessionId,
    messageChannel: options.messageChannel,
    agentAccountId: options.agentAccountId,
    requesterSenderId: options.requesterSenderId,
    requesterSenderName: options.requesterSenderName,
    requesterSenderUsername: options.requesterSenderUsername,
    senderIsOwner: options.senderIsOwner,
    conversationId: options.conversationId,
    isGroup: options.isGroup,
    trigger: options.trigger,
    sandboxed: options.sandboxed,
  };
}

async function getMemoryManagerContext(params: { cfg: MaumauConfig; agentId: string }): Promise<
  | {
      manager: NonNullable<MemorySearchManagerResult["manager"]>;
    }
  | {
      error: string | undefined;
    }
> {
  return await getMemoryManagerContextWithPurpose({ ...params, purpose: undefined });
}

async function getMemoryManagerContextWithPurpose(params: {
  cfg: MaumauConfig;
  agentId: string;
  purpose?: "default" | "status";
}): Promise<
  | {
      manager: NonNullable<MemorySearchManagerResult["manager"]>;
    }
  | {
      error: string | undefined;
    }
> {
  const { getMemorySearchManager } = await loadMemoryToolRuntime();
  const { manager, error } = await getMemorySearchManager({
    cfg: params.cfg,
    agentId: params.agentId,
    purpose: params.purpose,
  });
  return manager ? { manager } : { error };
}

function createMemoryTool(params: {
  options: {
    config?: MaumauConfig;
    agentSessionKey?: string;
  } & Partial<MaumauPluginToolContext>;
  label: string;
  name: string;
  description: string;
  parameters: typeof MemorySearchSchema | typeof MemoryGetSchema | typeof MemoryStoreSchema;
  execute: (ctx: {
    cfg: MaumauConfig;
    agentId: string;
    overlayContext: MemoryOverlayContext;
    workspaceDir: string;
  }) => AnyAgentTool["execute"];
  requireSearchConfig?: boolean;
}): AnyAgentTool | null {
  const ctx = resolveMemoryToolContext(params.options, {
    requireSearchConfig: params.requireSearchConfig,
  });
  if (!ctx) {
    return null;
  }
  return {
    label: params.label,
    name: params.name,
    description: params.description,
    parameters: params.parameters,
    execute: params.execute(ctx),
  };
}

export function createMemorySearchTool(options: {
  config?: MaumauConfig;
  agentSessionKey?: string;
  workspaceDir?: string;
  agentDir?: string;
  agentId?: string;
  sessionKey?: string;
  sessionId?: string;
  messageChannel?: string;
  agentAccountId?: string;
  requesterSenderId?: string;
  requesterSenderName?: string;
  requesterSenderUsername?: string;
  senderIsOwner?: boolean;
  conversationId?: string;
  isGroup?: boolean;
  trigger?: string;
  sandboxed?: boolean;
}): AnyAgentTool | null {
  return createMemoryTool({
    options,
    label: "Memory Search",
    name: "memory_search",
    description:
      "Mandatory recall step: semantically search MEMORY.md + memory/*.md (and optional session transcripts) before answering questions about prior work, decisions, dates, people, preferences, or todos; returns top snippets with path + lines. If response has disabled=true, memory retrieval is unavailable and should be surfaced to the user.",
    parameters: MemorySearchSchema,
    execute:
      ({ cfg, agentId }) =>
      async (_toolCallId, params) => {
        const query = readStringParam(params, "query", { required: true });
        const maxResults = readNumberParam(params, "maxResults");
        const minScore = readNumberParam(params, "minScore");
        const { resolveMemoryBackendConfig } = await loadMemoryToolRuntime();
        const memory = await getMemoryManagerContext({ cfg, agentId });
        if ("error" in memory) {
          return jsonResult(buildMemorySearchUnavailableResult(memory.error));
        }
        try {
          const citationsMode = resolveMemoryCitationsMode(cfg);
          const includeCitations = shouldIncludeCitations({
            mode: citationsMode,
            sessionKey: options.agentSessionKey,
          });
          const rawResults = await memory.manager.search(query, {
            maxResults,
            minScore,
            sessionKey: options.agentSessionKey,
          });
          const status = memory.manager.status();
          const decorated = decorateCitations(rawResults, includeCitations);
          const resolved = resolveMemoryBackendConfig({ cfg, agentId });
          const results =
            status.backend === "qmd"
              ? clampResultsByInjectedChars(decorated, resolved.qmd?.limits.maxInjectedChars)
              : decorated;
          const scopedResults = await filterResultsByOverlay(results, options);
          const searchMode = (status.custom as { searchMode?: string } | undefined)?.searchMode;
          return jsonResult({
            results: scopedResults,
            provider: status.provider,
            model: status.model,
            fallback: status.fallback,
            citations: citationsMode,
            mode: searchMode,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return jsonResult(buildMemorySearchUnavailableResult(message));
        }
      },
  });
}

export function createMemoryGetTool(options: {
  config?: MaumauConfig;
  agentSessionKey?: string;
  workspaceDir?: string;
  agentDir?: string;
  agentId?: string;
  sessionKey?: string;
  sessionId?: string;
  messageChannel?: string;
  agentAccountId?: string;
  requesterSenderId?: string;
  requesterSenderName?: string;
  requesterSenderUsername?: string;
  senderIsOwner?: boolean;
  conversationId?: string;
  isGroup?: boolean;
  trigger?: string;
  sandboxed?: boolean;
}): AnyAgentTool | null {
  return createMemoryTool({
    options,
    label: "Memory Get",
    name: "memory_get",
    description:
      "Safe snippet read from MEMORY.md or memory/*.md with optional from/lines; use after memory_search to pull only the needed lines and keep context small.",
    parameters: MemoryGetSchema,
    execute:
      ({ cfg, agentId }) =>
      async (_toolCallId, params) => {
        const relPath = readStringParam(params, "path", { required: true });
        const from = readNumberParam(params, "from", { integer: true });
        const lines = readNumberParam(params, "lines", { integer: true });
        const overlayRead = await readMemoryOverlayPath({
          relPath,
          from: from ?? undefined,
          lines: lines ?? undefined,
          context: buildMemoryOverlayContext(options),
        });
        if (overlayRead?.handled) {
          return jsonResult(
            overlayRead.result ?? {
              path: relPath,
              text: "",
              disabled: true,
              error: "memory overlay returned no result",
            },
          );
        }
        const { readAgentMemoryFile, resolveMemoryBackendConfig } = await loadMemoryToolRuntime();
        const resolved = resolveMemoryBackendConfig({ cfg, agentId });
        if (resolved.backend === "builtin") {
          try {
            const result = await readAgentMemoryFile({
              cfg,
              agentId,
              relPath,
              from: from ?? undefined,
              lines: lines ?? undefined,
            });
            return jsonResult(result);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return jsonResult({ path: relPath, text: "", disabled: true, error: message });
          }
        }
        const memory = await getMemoryManagerContextWithPurpose({
          cfg,
          agentId,
          purpose: "status",
        });
        if ("error" in memory) {
          return jsonResult({ path: relPath, text: "", disabled: true, error: memory.error });
        }
        try {
          const result = await memory.manager.readFile({
            relPath,
            from: from ?? undefined,
            lines: lines ?? undefined,
          });
          return jsonResult(result);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return jsonResult({ path: relPath, text: "", disabled: true, error: message });
        }
      },
  });
}

export function createMemoryStoreTool(options: {
  config?: MaumauConfig;
  agentSessionKey?: string;
  workspaceDir?: string;
  agentDir?: string;
  agentId?: string;
  sessionKey?: string;
  sessionId?: string;
  messageChannel?: string;
  agentAccountId?: string;
  requesterSenderId?: string;
  requesterSenderName?: string;
  requesterSenderUsername?: string;
  senderIsOwner?: boolean;
  conversationId?: string;
  isGroup?: boolean;
  trigger?: string;
  sandboxed?: boolean;
}): AnyAgentTool | null {
  return createMemoryTool({
    options,
    requireSearchConfig: false,
    label: "Memory Store",
    name: "memory_store",
    description:
      "Store durable or daily memory through the active memory stack. Use for facts, decisions, preferences, or summaries worth preserving beyond the current turn.",
    parameters: MemoryStoreSchema,
    execute:
      ({ cfg, agentId, overlayContext, workspaceDir }) =>
      async (_toolCallId, params) => {
        const text = readStringParam(params, "text", { required: true });
        const summary = readStringParam(params, "summary");
        const kind = readStringParam(params, "kind");
        const durability = readStringParam(params, "durability", {
          required: true,
        }) as MemoryStoreDurability;
        const target = readStringParam(params, "target", { required: true }) as MemoryStoreTarget;
        const targetId = readStringParam(params, "targetId");
        const dateStamp = new Date().toISOString().slice(0, 10);

        if (!text.trim()) {
          return jsonResult({
            stored: false,
            disabled: true,
            error: "text is required",
          });
        }

        if (target !== "workspace") {
          const overlayResult = await storeThroughMemoryOverlays({
            context: overlayContext,
            text,
            summary: summary ?? undefined,
            kind: kind ?? undefined,
            durability,
            target,
            targetId: targetId ?? undefined,
            dateStamp,
          });
          if (overlayResult?.handled) {
            return jsonResult({
              stored: overlayResult.stored === true,
              path: overlayResult.path,
              ...(overlayResult.details ? { details: overlayResult.details } : {}),
              ...(overlayResult.disabled ? { disabled: true } : {}),
              ...(overlayResult.error ? { error: overlayResult.error } : {}),
            });
          }
          if (target !== "active-user") {
            return jsonResult({
              stored: false,
              disabled: true,
              error: `No memory overlay handled target ${target}.`,
            });
          }
        }

        const pathResult = await appendWorkspaceMemory({
          cfg,
          agentId,
          workspaceDir,
          text,
          summary: summary ?? undefined,
          kind: kind ?? undefined,
          durability,
          dateStamp,
        });
        return jsonResult({
          stored: true,
          path: pathResult,
          backend: "workspace",
        });
      },
  });
}

function resolveMemoryCitationsMode(cfg: MaumauConfig): MemoryCitationsMode {
  const mode = cfg.memory?.citations;
  if (mode === "on" || mode === "off" || mode === "auto") {
    return mode;
  }
  return "auto";
}

function decorateCitations(results: MemorySearchResult[], include: boolean): MemorySearchResult[] {
  if (!include) {
    return results.map((entry) => ({ ...entry, citation: undefined }));
  }
  return results.map((entry) => {
    const citation = formatCitation(entry);
    const snippet = `${entry.snippet.trim()}\n\nSource: ${citation}`;
    return { ...entry, citation, snippet };
  });
}

function formatCitation(entry: MemorySearchResult): string {
  const lineRange =
    entry.startLine === entry.endLine
      ? `#L${entry.startLine}`
      : `#L${entry.startLine}-L${entry.endLine}`;
  return `${entry.path}${lineRange}`;
}

function clampResultsByInjectedChars(
  results: MemorySearchResult[],
  budget?: number,
): MemorySearchResult[] {
  if (!budget || budget <= 0) {
    return results;
  }
  let remaining = budget;
  const clamped: MemorySearchResult[] = [];
  for (const entry of results) {
    if (remaining <= 0) {
      break;
    }
    const snippet = entry.snippet ?? "";
    if (snippet.length <= remaining) {
      clamped.push(entry);
      remaining -= snippet.length;
    } else {
      const trimmed = snippet.slice(0, Math.max(0, remaining));
      clamped.push({ ...entry, snippet: trimmed });
      break;
    }
  }
  return clamped;
}

function buildMemorySearchUnavailableResult(error: string | undefined) {
  const reason = (error ?? "memory search unavailable").trim() || "memory search unavailable";
  const isQuotaError = /insufficient_quota|quota|429/.test(reason.toLowerCase());
  const warning = isQuotaError
    ? "Memory search is unavailable because the embedding provider quota is exhausted."
    : "Memory search is unavailable due to an embedding/provider error.";
  const action = isQuotaError
    ? "Top up or switch embedding provider, then retry memory_search."
    : "Check embedding provider configuration and retry memory_search.";
  return {
    results: [],
    disabled: true,
    unavailable: true,
    error: reason,
    warning,
    action,
  };
}

function shouldIncludeCitations(params: {
  mode: MemoryCitationsMode;
  sessionKey?: string;
}): boolean {
  if (params.mode === "on") {
    return true;
  }
  if (params.mode === "off") {
    return false;
  }
  // auto: show citations in direct chats; suppress in groups/channels by default.
  const chatType = deriveChatTypeFromSessionKey(params.sessionKey);
  return chatType === "direct";
}

function deriveChatTypeFromSessionKey(sessionKey?: string): "direct" | "group" | "channel" {
  const parsed = parseAgentSessionKey(sessionKey);
  if (!parsed?.rest) {
    return "direct";
  }
  const tokens = new Set(parsed.rest.toLowerCase().split(":").filter(Boolean));
  if (tokens.has("channel")) {
    return "channel";
  }
  if (tokens.has("group")) {
    return "group";
  }
  return "direct";
}

async function filterResultsByOverlay(
  results: MemorySearchResult[],
  options: {
    config?: MaumauConfig;
    agentSessionKey?: string;
  } & Partial<MaumauPluginToolContext>,
): Promise<MemorySearchResult[]> {
  const filtered: MemorySearchResult[] = [];
  const context = buildMemoryOverlayContext(options);
  for (const entry of results) {
    const overlayRead = await readMemoryOverlayPath({
      relPath: entry.path,
      authorizeOnly: true,
      context,
    });
    if (overlayRead?.handled && overlayRead.result?.disabled) {
      continue;
    }
    filtered.push(entry);
  }
  return filtered;
}

async function appendWorkspaceMemory(params: {
  cfg: MaumauConfig;
  agentId: string;
  workspaceDir: string;
  text: string;
  summary?: string;
  kind?: string;
  durability: MemoryStoreDurability;
  dateStamp: string;
}): Promise<string> {
  const workspaceDir = params.workspaceDir || resolveAgentWorkspaceDir(params.cfg, params.agentId);
  const relativePath =
    params.durability === "durable"
      ? "MEMORY.md"
      : path.posix.join("memory", `${params.dateStamp}.md`);
  const absolutePath = path.join(workspaceDir, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  const now = new Date().toISOString();
  const entry = renderWorkspaceMemoryEntry({
    text: params.text,
    summary: params.summary,
    kind: params.kind,
    timestamp: now,
  });
  await fs.appendFile(absolutePath, entry, "utf8");
  return relativePath.replace(/\\/g, "/");
}

function renderWorkspaceMemoryEntry(params: {
  text: string;
  summary?: string;
  kind?: string;
  timestamp: string;
}): string {
  const lines = [`\n## ${params.timestamp}`];
  if (params.summary) {
    lines.push(`Summary: ${params.summary.trim()}`);
  }
  if (params.kind) {
    lines.push(`Kind: ${params.kind.trim()}`);
  }
  lines.push("", params.text.trim(), "");
  return `${lines.join("\n")}\n`;
}

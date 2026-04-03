import fs from "node:fs";
import path from "node:path";
import { SessionManager } from "@mariozechner/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTempHome as withTempHomeBase } from "../../test/helpers/temp-home.js";
import * as configModule from "../config/config.js";
import { clearSessionStoreCacheForTest } from "../config/sessions.js";
import {
  resetAgentEventsForTest,
  resetAgentRunContextForTest,
} from "../infra/agent-events.js";
import type { RuntimeEnv } from "../runtime.js";
import { agentCommand } from "./agent.js";
import * as embeddedModule from "../agents/pi-embedded.js";
import * as modelCatalogModule from "../agents/model-catalog.js";
import * as modelSelectionModule from "../agents/model-selection.js";
import { makeAgentAssistantMessage } from "../agents/test-helpers/agent-message-fixtures.js";
import type { MaumauConfig } from "../config/config.js";

vi.mock("../logging/subsystem.js", () => {
  const createMockLogger = () => ({
    subsystem: "test",
    isEnabled: vi.fn(() => true),
    trace: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    raw: vi.fn(),
    child: vi.fn(() => createMockLogger()),
  });
  return {
    createSubsystemLogger: vi.fn(() => createMockLogger()),
  };
});

vi.mock("../agents/auth-profiles.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../agents/auth-profiles.js")>();
  return {
    ...actual,
    ensureAuthProfileStore: vi.fn(() => ({ version: 1, profiles: {} })),
  };
});

vi.mock("../agents/workspace.js", () => ({
  DEFAULT_AGENT_WORKSPACE_DIR: "/tmp/maumau-workspace",
  DEFAULT_AGENTS_FILENAME: "AGENTS.md",
  DEFAULT_IDENTITY_FILENAME: "IDENTITY.md",
  resolveDefaultAgentWorkspaceDir: () => "/tmp/maumau-workspace",
  ensureAgentWorkspace: vi.fn(async ({ dir }: { dir: string }) => ({ dir })),
}));

vi.mock("../agents/command/session-store.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../agents/command/session-store.js")>();
  return {
    ...actual,
    updateSessionStoreAfterAgentRun: vi.fn(async () => undefined),
  };
});

vi.mock("../agents/skills.js", () => ({
  buildWorkspaceSkillSnapshot: vi.fn(() => undefined),
  loadWorkspaceSkillEntries: vi.fn(() => []),
}));

vi.mock("../agents/skills/refresh.js", () => ({
  getSkillsSnapshotVersion: vi.fn(() => 0),
}));

const runtime: RuntimeEnv = {
  log: vi.fn(),
  error: vi.fn(),
  exit: vi.fn(() => {
    throw new Error("exit");
  }),
};

const loadConfigSpy = vi.spyOn(configModule, "loadConfig");
const readConfigFileSnapshotForWriteSpy = vi.spyOn(configModule, "readConfigFileSnapshotForWrite");
const runEmbeddedPiAgentSpy = vi.spyOn(embeddedModule, "runEmbeddedPiAgent");
const loadModelCatalogSpy = vi.spyOn(modelCatalogModule, "loadModelCatalog");
const isCliProviderSpy = vi.spyOn(modelSelectionModule, "isCliProvider");

async function withTempHome<T>(fn: (home: string) => Promise<T>): Promise<T> {
  return withTempHomeBase(fn, { prefix: "maumau-agent-transcript-" });
}

function mockConfig(home: string, storePath: string) {
  const cfg = {
    agents: {
      defaults: {
        model: { primary: "anthropic/claude-opus-4-5" },
        models: { "anthropic/claude-opus-4-5": {} },
        workspace: path.join(home, "maumau"),
      },
    },
    session: { store: storePath, mainKey: "main" },
  } as MaumauConfig;
  loadConfigSpy.mockReturnValue(cfg);
  return cfg;
}

describe("agentCommand transcript hygiene", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearSessionStoreCacheForTest();
    resetAgentEventsForTest();
    resetAgentRunContextForTest();
    runEmbeddedPiAgentSpy.mockResolvedValue({
      payloads: [{ text: "ok" }],
      meta: {
        durationMs: 5,
      },
    } as never);
    loadModelCatalogSpy.mockResolvedValue([]);
    isCliProviderSpy.mockImplementation(() => false);
    readConfigFileSnapshotForWriteSpy.mockResolvedValue({
      snapshot: { valid: false, resolved: {} as MaumauConfig },
      writeOptions: {},
    } as Awaited<ReturnType<typeof configModule.readConfigFileSnapshotForWrite>>);
  });

  it("keeps internal event prompt context out of the persisted embedded transcript", async () => {
    await withTempHome(async (home) => {
      const store = path.join(home, "sessions.json");
      mockConfig(home, store);
      let usedSessionFile: string | undefined;
      runEmbeddedPiAgentSpy.mockImplementationOnce(async (params) => {
        usedSessionFile = params.sessionFile;
        const sessionManager = SessionManager.open(params.sessionFile);
        sessionManager.appendMessage({
          role: "user",
          content: params.prompt,
          timestamp: Date.now(),
        });
        sessionManager.appendMessage(
          makeAgentAssistantMessage({
            content: [{ type: "text", text: "done" }],
            timestamp: Date.now(),
          }),
        );
        return {
          payloads: [{ text: "done" }],
          meta: {
            durationMs: 5,
          },
        } as never;
      });

      const visiblePrompt = "Please summarize the worker result.";
      await agentCommand(
        {
          message: visiblePrompt,
          to: "+1555",
          internalEvents: [
            {
              type: "task_completion",
              source: "subagent",
              childSessionKey: "agent:main:subagent:child",
              announceType: "subagent task",
              taskLabel: "worker task",
              status: "ok",
              statusLabel: "completed successfully",
              result: "Worker finished cleanly.",
              replyInstruction: "Reply to the user in normal assistant voice.",
            },
          ],
        },
        runtime,
      );

      const saved = JSON.parse(fs.readFileSync(store, "utf-8")) as Record<string, unknown>;
      expect(Object.keys(saved).length).toBeGreaterThan(0);
      const sessionFile = usedSessionFile;
      expect(sessionFile).toBeTruthy();

      const latestUserEntry = SessionManager.open(sessionFile!).getBranch().findLast((entry) => {
        return entry.type === "message" && entry.message.role === "user";
      });
      expect(latestUserEntry?.type).toBe("message");
      if (latestUserEntry?.type !== "message") {
        return;
      }
      expect(latestUserEntry.message.content).toBe(visiblePrompt);
    });
  });
});

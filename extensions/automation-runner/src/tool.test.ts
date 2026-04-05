import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MaumauPluginApi, MaumauPluginToolContext } from "../runtime-api.js";
import { createAutomationTaskTool } from "./tool.js";

type RunResult = {
  stdout: string;
  stderr: string;
  code: number | null;
  signal: NodeJS.Signals | null;
  killed: boolean;
  termination: "exit" | "timeout" | "no-output-timeout" | "signal";
};

function commandResult(stdout: string, code = 0): RunResult {
  return {
    stdout,
    stderr: code === 0 ? "" : stdout,
    code,
    signal: null,
    killed: false,
    termination: "exit",
  };
}

async function withTempDir<T>(run: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-automation-runner-"));
  try {
    return await run(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function createApi(params: {
  pluginConfig?: unknown;
  stateDir: string;
  runCommandWithTimeout: ReturnType<typeof vi.fn>;
}): MaumauPluginApi {
  return {
    pluginConfig: params.pluginConfig,
    config: {
      agents: {
        defaults: {
          workspace: params.stateDir,
        },
      },
      messages: {
        tts: {
          elevenlabs: {
            languageCode: "id",
          },
        },
      },
    },
    runtime: {
      state: {
        resolveStateDir: () => params.stateDir,
      },
      system: {
        runCommandWithTimeout: params.runCommandWithTimeout,
      },
    },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  } as unknown as MaumauPluginApi;
}

function buildTool(params: {
  pluginConfig?: unknown;
  stateDir: string;
  runCommandWithTimeout: ReturnType<typeof vi.fn>;
  context: MaumauPluginToolContext;
}) {
  return createAutomationTaskTool(
    createApi({
      pluginConfig: params.pluginConfig,
      stateDir: params.stateDir,
      runCommandWithTimeout: params.runCommandWithTimeout,
    }),
    params.context,
  );
}

function defaultContext(overrides: Partial<MaumauPluginToolContext> = {}): MaumauPluginToolContext {
  return {
    senderIsOwner: true,
    requesterSenderId: "owner",
    sessionId: "session-1",
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("automation_task", () => {
  it("runs read-only browser steps for owners without an approval pause", async () => {
    await withTempDir(async (stateDir) => {
      const runCommandWithTimeout = vi.fn(async (argv: string[]) => {
        const joined = argv.join(" ");
        if (joined.includes("browser start")) {
          return commandResult('{"ok":true}');
        }
        if (joined.includes("browser snapshot")) {
          return commandResult('{"format":"ai","snapshot":"page snapshot"}');
        }
        throw new Error(`unexpected command: ${joined}`);
      });
      const tool = buildTool({
        pluginConfig: { enabled: true, accessPolicy: { mode: "owner" }, requireApproval: true },
        stateDir,
        runCommandWithTimeout,
        context: defaultContext(),
      });

      const result = await tool.execute("call-1", {
        request: "Inspect the dashboard",
        steps: [{ kind: "snapshot" }],
      });

      expect(result.details).toMatchObject({
        ok: true,
        status: "ok",
        lane: "browser",
        profile: null,
      });
      expect(runCommandWithTimeout).toHaveBeenCalledTimes(2);
    });
  });

  it("falls back to the desktop browser profile for owners when the main browser lane is unavailable", async () => {
    await withTempDir(async (stateDir) => {
      const runCommandWithTimeout = vi.fn(async (argv: string[]) => {
        const joined = argv.join(" ");
        if (joined.includes("browser start") && !joined.includes("--browser-profile")) {
          return commandResult('{"error":"missing browser"}', 1);
        }
        if (joined.includes("--browser-profile desktop browser start")) {
          return commandResult('{"ok":true}');
        }
        if (joined.includes("--browser-profile desktop browser snapshot")) {
          return commandResult('{"format":"ai","snapshot":"desktop fallback snapshot"}');
        }
        throw new Error(`unexpected command: ${joined}`);
      });
      const tool = buildTool({
        pluginConfig: { enabled: true, accessPolicy: { mode: "owner" }, requireApproval: true },
        stateDir,
        runCommandWithTimeout,
        context: defaultContext(),
      });

      const result = await tool.execute("call-1", {
        request: "Inspect the desktop fallback lane",
        steps: [{ kind: "snapshot" }],
      });

      expect(result.details).toMatchObject({
        ok: true,
        status: "ok",
        lane: "desktop-fallback",
        profile: "desktop",
      });
    });
  });

  it("allows allowlisted non-owner senders on the browser lane only", async () => {
    await withTempDir(async (stateDir) => {
      const runCommandWithTimeout = vi.fn(async (argv: string[]) => {
        const joined = argv.join(" ");
        if (joined.includes("browser start")) {
          return commandResult('{"ok":true}');
        }
        if (joined.includes("browser snapshot")) {
          return commandResult('{"format":"ai","snapshot":"allowlist snapshot"}');
        }
        throw new Error(`unexpected command: ${joined}`);
      });
      const tool = buildTool({
        pluginConfig: {
          enabled: true,
          accessPolicy: { mode: "allowlist", allowFrom: ["telegram:user:123"] },
          requireApproval: true,
        },
        stateDir,
        runCommandWithTimeout,
        context: defaultContext({
          senderIsOwner: false,
          requesterSenderId: "telegram:user:123",
        }),
      });

      const result = await tool.execute("call-1", {
        request: "Inspect the page",
        steps: [{ kind: "snapshot" }],
      });

      expect(result.details).toMatchObject({
        ok: true,
        status: "ok",
        lane: "browser",
      });
    });
  });

  it("rejects non-allowlisted non-owner senders", async () => {
    await withTempDir(async (stateDir) => {
      const runCommandWithTimeout = vi.fn();
      const tool = buildTool({
        pluginConfig: {
          enabled: true,
          accessPolicy: { mode: "allowlist", allowFrom: ["telegram:user:123"] },
          requireApproval: true,
        },
        stateDir,
        runCommandWithTimeout,
        context: defaultContext({
          senderIsOwner: false,
          requesterSenderId: "telegram:user:999",
        }),
      });

      await expect(
        tool.execute("call-1", {
          request: "Inspect the page",
          steps: [{ kind: "snapshot" }],
        }),
      ).rejects.toThrow("sender is not on the automation allowlist");
      expect(runCommandWithTimeout).not.toHaveBeenCalled();
    });
  });

  it("requires approval for side-effecting steps and binds resume tokens to the same sender and session", async () => {
    await withTempDir(async (stateDir) => {
      const runCommandWithTimeout = vi.fn(async (argv: string[]) => {
        const joined = argv.join(" ");
        if (joined.includes("browser start")) {
          return commandResult('{"ok":true}');
        }
        if (joined.includes("browser click")) {
          return commandResult('{"ok":true,"url":"https://example.test"}');
        }
        throw new Error(`unexpected command: ${joined}`);
      });
      const ownerContext = defaultContext();
      const tool = buildTool({
        pluginConfig: { enabled: true, accessPolicy: { mode: "owner" }, requireApproval: true },
        stateDir,
        runCommandWithTimeout,
        context: ownerContext,
      });

      const paused = await tool.execute("call-1", {
        request: "Submit the form",
        steps: [{ kind: "click", ref: "submit-button" }],
      });
      expect(paused.details).toMatchObject({
        ok: true,
        status: "needs_approval",
      });
      const token = (
        paused.details as {
          requiresApproval?: { resumeToken?: string };
        }
      ).requiresApproval?.resumeToken;
      expect(typeof token).toBe("string");

      const wrongSenderTool = buildTool({
        pluginConfig: { enabled: true, accessPolicy: { mode: "owner" }, requireApproval: true },
        stateDir,
        runCommandWithTimeout,
        context: defaultContext({ requesterSenderId: "someone-else" }),
      });
      await expect(
        wrongSenderTool.execute("call-2", {
          request: "Submit the form",
          steps: [{ kind: "click", ref: "submit-button" }],
          approvalToken: token,
        }),
      ).rejects.toThrow("approval token belongs to a different sender");

      const resumed = await tool.execute("call-3", {
        request: "Submit the form",
        steps: [{ kind: "click", ref: "submit-button" }],
        approvalToken: token,
      });
      expect(resumed.details).toMatchObject({
        ok: true,
        status: "ok",
        lane: "browser",
      });

      await expect(
        tool.execute("call-4", {
          request: "Submit the form",
          steps: [{ kind: "click", ref: "submit-button" }],
          approvalToken: token,
        }),
      ).rejects.toThrow("approval token not found or already used");
    });
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { MaumauConfig } from "../config/config.js";
import type { HookStatusEntry, HookStatusReport } from "../hooks/hooks-status.js";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import { setupInternalHooks } from "./onboard-hooks.js";

// Mock hook discovery modules
vi.mock("../hooks/hooks-status.js", () => ({
  buildWorkspaceHookStatus: vi.fn(),
}));

vi.mock("../agents/agent-scope.js", () => ({
  resolveAgentWorkspaceDir: vi.fn().mockReturnValue("/mock/workspace"),
  resolveDefaultAgentId: vi.fn().mockReturnValue("main"),
}));

describe("onboard-hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockPrompter = (multiselectValue: string[]): WizardPrompter => ({
    confirm: vi.fn().mockResolvedValue(true),
    note: vi.fn().mockResolvedValue(undefined),
    intro: vi.fn().mockResolvedValue(undefined),
    outro: vi.fn().mockResolvedValue(undefined),
    text: vi.fn().mockResolvedValue(""),
    select: vi.fn().mockResolvedValue(""),
    multiselect: vi.fn().mockResolvedValue(multiselectValue),
    progress: vi.fn().mockReturnValue({
      stop: vi.fn(),
      update: vi.fn(),
    }),
  });

  const createMockRuntime = (): RuntimeEnv => ({
    log: vi.fn(),
    error: vi.fn(),
    exit: vi.fn(),
  });

  const createMockHook = (
    params: {
      name: string;
      description: string;
      filePath: string;
      baseDir: string;
      handlerPath: string;
      hookKey: string;
      emoji: string;
      events: string[];
    },
    eligible: boolean,
  ) => ({
    blockedReason: (eligible
      ? undefined
      : "missing requirements") as HookStatusEntry["blockedReason"],
    ...params,
    source: "maumau-bundled" as const,
    pluginId: undefined,
    homepage: undefined,
    always: false,
    enabledByConfig: eligible,
    requirementsSatisfied: eligible,
    loadable: eligible,
    managedByPlugin: false,
    requirements: {
      bins: [],
      anyBins: [],
      env: [],
      config: ["workspace.dir"],
      os: [],
    },
    missing: {
      bins: [],
      anyBins: [],
      env: [],
      config: eligible ? [] : ["workspace.dir"],
      os: [],
    },
    configChecks: [],
    install: [],
  });

  const createMockHookReport = (eligible = true): HookStatusReport => ({
    workspaceDir: "/mock/workspace",
    managedHooksDir: "/mock/.maumau/hooks",
    hooks: [
      createMockHook(
        {
          name: "session-memory",
          description: "Save session context to memory when /new or /reset command is issued",
          filePath: "/mock/workspace/hooks/session-memory/HOOK.md",
          baseDir: "/mock/workspace/hooks/session-memory",
          handlerPath: "/mock/workspace/hooks/session-memory/handler.js",
          hookKey: "session-memory",
          emoji: "💾",
          events: ["command:new", "command:reset"],
        },
        eligible,
      ),
      createMockHook(
        {
          name: "boot-md",
          description: "Run BOOT.md on gateway startup",
          filePath: "/mock/workspace/hooks/boot-md/HOOK.md",
          baseDir: "/mock/workspace/hooks/boot-md",
          handlerPath: "/mock/workspace/hooks/boot-md/handler.js",
          hookKey: "boot-md",
          emoji: "🚀",
          events: ["gateway:startup"],
        },
        eligible,
      ),
      createMockHook(
        {
          name: "command-logger",
          description: "Log all command events to a centralized audit file",
          filePath: "/mock/workspace/hooks/command-logger/HOOK.md",
          baseDir: "/mock/workspace/hooks/command-logger",
          handlerPath: "/mock/workspace/hooks/command-logger/handler.js",
          hookKey: "command-logger",
          emoji: "📝",
          events: ["command"],
        },
        eligible,
      ),
    ],
  });

  async function runSetupInternalHooks(params: {
    selected: string[];
    cfg?: MaumauConfig;
    eligible?: boolean;
  }) {
    const { buildWorkspaceHookStatus } = await import("../hooks/hooks-status.js");
    vi.mocked(buildWorkspaceHookStatus).mockReturnValue(
      createMockHookReport(params.eligible ?? true),
    );

    const cfg = params.cfg ?? {};
    const prompter = createMockPrompter(params.selected);
    const runtime = createMockRuntime();
    const result = await setupInternalHooks(cfg, runtime, prompter);
    return { result, cfg, prompter };
  }

  describe("setupInternalHooks", () => {
    it("should enable hooks when user selects them", async () => {
      const { result, prompter } = await runSetupInternalHooks({
        selected: ["session-memory"],
      });

      expect(result.hooks?.internal?.enabled).toBe(true);
      expect(result.hooks?.internal?.entries).toEqual({
        "session-memory": { enabled: true },
      });
      expect(prompter.note).toHaveBeenCalledTimes(2);
      expect(prompter.multiselect).toHaveBeenCalledWith({
        message: "Choose optional automations",
        options: [
          { value: "__skip__", label: "Skip for now" },
          {
            value: "session-memory",
            label: "💾 Save chat context for later",
            hint: "When you start fresh with /new or /reset, save the recent session so your agent can remember it later.",
          },
          {
            value: "command-logger",
            label: "📝 Keep a local activity log",
            hint: "Save command activity to a local log file for debugging and audits.",
          },
        ],
      });
    });

    it("should not enable hooks when user skips", async () => {
      const { result, prompter } = await runSetupInternalHooks({
        selected: ["__skip__"],
      });

      expect(result.hooks?.internal).toBeUndefined();
      expect(prompter.note).toHaveBeenCalledTimes(1);
    });

    it("should handle no eligible hooks", async () => {
      const { result, cfg, prompter } = await runSetupInternalHooks({
        selected: [],
        eligible: false,
      });

      expect(result).toEqual(cfg);
      expect(prompter.multiselect).not.toHaveBeenCalled();
      expect(prompter.note).toHaveBeenCalledWith(
        "No beginner-friendly automations are available right now. You can enable advanced ones later.",
        "No Optional Automations",
      );
    });

    it("should preserve existing hooks config when enabled", async () => {
      const cfg: MaumauConfig = {
        hooks: {
          enabled: true,
          path: "/webhook",
          token: "existing-token",
        },
      };
      const { result } = await runSetupInternalHooks({
        selected: ["session-memory"],
        cfg,
      });

      expect(result.hooks?.enabled).toBe(true);
      expect(result.hooks?.path).toBe("/webhook");
      expect(result.hooks?.token).toBe("existing-token");
      expect(result.hooks?.internal?.enabled).toBe(true);
      expect(result.hooks?.internal?.entries).toEqual({
        "session-memory": { enabled: true },
      });
    });

    it("should preserve existing config when user skips", async () => {
      const cfg: MaumauConfig = {
        agents: { defaults: { workspace: "/workspace" } },
      };
      const { result } = await runSetupInternalHooks({
        selected: ["__skip__"],
        cfg,
      });

      expect(result).toEqual(cfg);
      expect(result.agents?.defaults?.workspace).toBe("/workspace");
    });

    it("should show informative notes to user", async () => {
      const { prompter } = await runSetupInternalHooks({
        selected: ["session-memory"],
      });

      const noteCalls = (prompter.note as ReturnType<typeof vi.fn>).mock.calls;
      expect(noteCalls).toHaveLength(2);

      // First note should explain that these are optional and beginner-friendly.
      expect(noteCalls[0][0]).toContain("These are optional automations.");
      expect(noteCalls[0][0]).toContain("Maumau works without them.");
      expect(noteCalls[0][0]).toContain("Advanced automation options can be enabled later.");

      // Second note should confirm configuration
      expect(noteCalls[1][0]).toContain("Enabled 1 automation: Save chat context for later");
      expect(noteCalls[1][0]).toMatch(/(?:maumau|maumau)( --profile isolated)? hooks list/);
    });

    it("should hide advanced hooks from onboarding", async () => {
      const { prompter } = await runSetupInternalHooks({
        selected: ["__skip__"],
      });

      const multiselectArgs = (prompter.multiselect as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(multiselectArgs.options).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ value: "boot-md" })]),
      );
    });
  });
});

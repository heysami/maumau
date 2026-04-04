import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createWizardPrompter as buildWizardPrompter } from "../../test/helpers/wizard-prompter.js";
import { DEFAULT_BOOTSTRAP_FILENAME } from "../agents/workspace.js";
import type { PluginCompatibilityNotice } from "../plugins/status.js";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter, WizardSelectParams } from "./prompts.js";
import { runSetupWizard } from "./setup.js";

const ensureAuthProfileStore = vi.hoisted(() => vi.fn(() => ({ profiles: {} })));
const promptAuthChoiceGrouped = vi.hoisted(() => vi.fn(async () => "skip"));
const applyAuthChoice = vi.hoisted(() => vi.fn(async (args) => ({ config: args.config })));
const resolvePreferredProviderForAuthChoice = vi.hoisted(() => vi.fn(async () => "openai"));
const warnIfModelConfigLooksOff = vi.hoisted(() => vi.fn(async () => {}));
const applyPrimaryModel = vi.hoisted(() => vi.fn((cfg) => cfg));
const promptDefaultModel = vi.hoisted(() => vi.fn(async () => ({ config: null, model: null })));
const promptCustomApiConfig = vi.hoisted(() => vi.fn(async (args) => ({ config: args.config })));
const configureGatewayForSetup = vi.hoisted(() =>
  vi.fn(async (args) => ({
    nextConfig: args.nextConfig,
    settings: {
      port: args.localPort ?? 18789,
      bind: "loopback",
      authMode: "token",
      gatewayToken: "test-token",
      tailscaleMode: "off",
      tailscaleResetOnExit: false,
    },
  })),
);
const finalizeSetupWizard = vi.hoisted(() =>
  vi.fn(async (options) => {
    if (!options.nextConfig?.tools?.web?.search?.provider) {
      await options.prompter.note("Web search was skipped.", "Web search");
    }

    if (options.opts.skipUi) {
      return { launchedTui: false };
    }

    const hatch = await options.prompter.select({
      message: "How do you want to hatch your bot?",
      options: [],
    });
    if (hatch !== "tui") {
      return { launchedTui: false };
    }

    let message: string | undefined;
    try {
      await fs.stat(path.join(options.workspaceDir, DEFAULT_BOOTSTRAP_FILENAME));
      message = "Wake up, my friend!";
    } catch {
      message = undefined;
    }

    await runTui({ deliver: false, message });
    return { launchedTui: true };
  }),
);
const listChannelPlugins = vi.hoisted(() => vi.fn(() => []));
const logConfigUpdated = vi.hoisted(() => vi.fn(() => {}));
const setupInternalHooks = vi.hoisted(() => vi.fn(async (cfg) => cfg));
const applyLocalSetupMultiUserMemoryDefaults = vi.hoisted(() => vi.fn((cfg) => cfg));
const ensureOnboardedMultiUserMemoryArtifacts = vi.hoisted(() => vi.fn(async () => {}));
const applyLocalSetupReflectionReviewerDefaults = vi.hoisted(() => vi.fn((cfg) => cfg));
const ensureOnboardedReflectionReviewerArtifacts = vi.hoisted(() => vi.fn(async () => {}));

const setupChannels = vi.hoisted(() => vi.fn(async (cfg) => cfg));
const setupSkills = vi.hoisted(() => vi.fn(async (cfg) => cfg));
const healthCommand = vi.hoisted(() => vi.fn(async () => {}));
const ensureWorkspaceAndSessions = vi.hoisted(() => vi.fn(async () => {}));
const writeConfigFile = vi.hoisted(() => vi.fn(async () => {}));
const readConfigFileSnapshot = vi.hoisted(() =>
  vi.fn(async () => ({
    path: "/tmp/.maumau/maumau.json",
    exists: false,
    raw: null as string | null,
    parsed: {},
    resolved: {},
    valid: true,
    config: {},
    issues: [] as Array<{ path: string; message: string }>,
    warnings: [] as Array<{ path: string; message: string }>,
    legacyIssues: [] as Array<{ path: string; message: string }>,
  })),
);
const ensureSystemdUserLingerInteractive = vi.hoisted(() => vi.fn(async () => {}));
const isSystemdUserServiceAvailable = vi.hoisted(() => vi.fn(async () => true));
const ensureControlUiAssetsBuilt = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
const runTui = vi.hoisted(() => vi.fn(async (_options: unknown) => {}));
const setupWizardShellCompletion = vi.hoisted(() => vi.fn(async () => {}));
const ensureSetupDefaultModelSelected = vi.hoisted(() => vi.fn(async (args) => args.config));
const probeGatewayReachable = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
const ensureFreshInstallBundledTools = vi.hoisted(() =>
  vi.fn(async () => ({
    attempted: true,
    ok: true,
    fullyReady: true,
    results: [],
  })),
);
const readTailscaleStatusJson = vi.hoisted(() => vi.fn(async () => ({})));
const buildPluginCompatibilityNotices = vi.hoisted(() =>
  vi.fn((): PluginCompatibilityNotice[] => []),
);
const formatPluginCompatibilityNotice = vi.hoisted(() =>
  vi.fn((notice: PluginCompatibilityNotice) => `${notice.pluginId} ${notice.message}`),
);

vi.mock("../commands/onboard-channels.js", () => ({
  setupChannels,
}));

vi.mock("../commands/onboard-skills.js", () => ({
  setupSkills,
}));

vi.mock("../agents/auth-profiles.js", () => ({
  ensureAuthProfileStore,
}));

vi.mock("../commands/auth-choice-prompt.js", () => ({
  promptAuthChoiceGrouped,
}));

vi.mock("../commands/auth-choice.js", () => ({
  applyAuthChoice,
  resolvePreferredProviderForAuthChoice,
  warnIfModelConfigLooksOff,
}));

vi.mock("../commands/model-picker.js", () => ({
  applyPrimaryModel,
  promptDefaultModel,
}));

vi.mock("../commands/onboard-custom.js", () => ({
  promptCustomApiConfig,
}));

vi.mock("../commands/health.js", () => ({
  healthCommand,
}));

vi.mock("../commands/onboard-bundled-tools.js", () => ({
  ensureFreshInstallBundledTools,
}));

vi.mock("../infra/tailscale.js", () => ({
  readTailscaleStatusJson,
}));

vi.mock("../commands/onboard-hooks.js", () => ({
  setupInternalHooks,
}));

vi.mock("../commands/onboard-multi-user-memory.js", () => ({
  applyLocalSetupMultiUserMemoryDefaults,
  ensureOnboardedMultiUserMemoryArtifacts,
}));

vi.mock("../commands/onboard-reflection-reviewer.js", () => ({
  applyLocalSetupReflectionReviewerDefaults,
  ensureOnboardedReflectionReviewerArtifacts,
}));

vi.mock("../config/config.js", () => ({
  DEFAULT_GATEWAY_PORT: 18789,
  resolveGatewayPort: () => 18789,
  readConfigFileSnapshot,
  writeConfigFile,
}));

vi.mock("../commands/onboard-helpers.js", () => ({
  DEFAULT_WORKSPACE: "/tmp/maumau-workspace",
  applyWizardMetadata: (cfg: unknown) => cfg,
  summarizeExistingConfig: () => "summary",
  handleReset: async () => {},
  randomToken: () => "test-token",
  normalizeGatewayTokenInput: (value: unknown) => ({
    ok: true,
    token: typeof value === "string" ? value.trim() : "",
    error: null,
  }),
  validateGatewayPasswordInput: () => ({ ok: true, error: null }),
  ensureWorkspaceAndSessions,
  detectBrowserOpenSupport: vi.fn(async () => ({ ok: false })),
  openUrl: vi.fn(async () => true),
  printWizardHeader: vi.fn(),
  probeGatewayReachable,
  waitForGatewayReachable: vi.fn(async () => {}),
  formatControlUiSshHint: vi.fn(() => "ssh hint"),
  resolveControlUiLinks: vi.fn(() => ({
    httpUrl: "http://127.0.0.1:18789",
    wsUrl: "ws://127.0.0.1:18789",
  })),
}));

vi.mock("../commands/systemd-linger.js", () => ({
  ensureSystemdUserLingerInteractive,
}));

vi.mock("../daemon/systemd.js", () => ({
  isSystemdUserServiceAvailable,
}));

vi.mock("../infra/control-ui-assets.js", () => ({
  ensureControlUiAssetsBuilt,
}));

vi.mock("../plugins/status.js", () => ({
  buildPluginCompatibilityNotices,
  formatPluginCompatibilityNotice,
}));

vi.mock("../channels/plugins/index.js", () => ({
  listChannelPlugins,
}));

vi.mock("../config/logging.js", () => ({
  logConfigUpdated,
}));

vi.mock("../tui/tui.js", () => ({
  runTui,
}));

vi.mock("./setup.gateway-config.js", () => ({
  configureGatewayForSetup,
}));

vi.mock("./setup.finalize.js", () => ({
  finalizeSetupWizard,
}));

vi.mock("./setup.completion.js", () => ({
  setupWizardShellCompletion,
}));

vi.mock("./setup.default-model.js", () => ({
  ensureSetupDefaultModelSelected,
}));

afterEach(() => {
  ensureFreshInstallBundledTools.mockClear();
  applyLocalSetupMultiUserMemoryDefaults.mockClear();
  ensureOnboardedMultiUserMemoryArtifacts.mockClear();
  applyLocalSetupReflectionReviewerDefaults.mockClear();
  ensureOnboardedReflectionReviewerArtifacts.mockClear();
  readTailscaleStatusJson.mockReset();
  readTailscaleStatusJson.mockResolvedValue({});
});

function createRuntime(opts?: { throwsOnExit?: boolean }): RuntimeEnv {
  if (opts?.throwsOnExit) {
    return {
      log: vi.fn(),
      error: vi.fn(),
      exit: vi.fn((code: number) => {
        throw new Error(`exit:${code}`);
      }),
    };
  }

  return {
    log: vi.fn(),
    error: vi.fn(),
    exit: vi.fn(),
  };
}

describe("runSetupWizard", () => {
  let suiteRoot = "";
  let suiteCase = 0;

  beforeAll(async () => {
    suiteRoot = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-onboard-suite-"));
  });

  afterAll(async () => {
    await fs.rm(suiteRoot, { recursive: true, force: true });
    suiteRoot = "";
    suiteCase = 0;
  });

  async function makeCaseDir(prefix: string): Promise<string> {
    const dir = path.join(suiteRoot, `${prefix}${++suiteCase}`);
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }

  it("exits when config is invalid", async () => {
    readConfigFileSnapshot.mockResolvedValueOnce({
      path: "/tmp/.maumau/maumau.json",
      exists: true,
      raw: "{}",
      parsed: {},
      resolved: {},
      valid: false,
      config: {},
      issues: [{ path: "routing.allowFrom", message: "Legacy key" }],
      warnings: [],
      legacyIssues: [{ path: "routing.allowFrom", message: "Legacy key" }],
    });

    const select = vi.fn(
      async (_params: WizardSelectParams<unknown>) => "quickstart",
    ) as unknown as WizardPrompter["select"];
    const prompter = buildWizardPrompter({ select });
    const runtime = createRuntime({ throwsOnExit: true });

    await expect(
      runSetupWizard(
        {
          acceptRisk: true,
          flow: "quickstart",
          authChoice: "skip",
          installDaemon: false,
          skipProviders: true,
          skipSkills: true,
          skipSearch: true,
          skipHealth: true,
          skipUi: true,
        },
        runtime,
        prompter,
      ),
    ).rejects.toThrow("exit:1");

    expect(select).not.toHaveBeenCalled();
    expect(prompter.outro).toHaveBeenCalled();
  });

  it("skips prompts and setup steps when flags are set", async () => {
    ensureSetupDefaultModelSelected.mockClear();
    const intro = vi.fn(async () => {});
    const note = vi.fn(async () => {});
    const select = vi.fn(
      async (_params: WizardSelectParams<unknown>) => "quickstart",
    ) as unknown as WizardPrompter["select"];
    const multiselect: WizardPrompter["multiselect"] = vi.fn(async () => []);
    const prompter = buildWizardPrompter({ intro, note, select, multiselect });
    const runtime = createRuntime({ throwsOnExit: true });

    await runSetupWizard(
      {
        acceptRisk: true,
        embedded: true,
        flow: "quickstart",
        authChoice: "skip",
        installDaemon: false,
        skipProviders: true,
        skipSkills: true,
        skipSearch: true,
        skipHealth: true,
        skipUi: true,
      },
      runtime,
      prompter,
    );

    expect(select).not.toHaveBeenCalled();
    expect(setupChannels).not.toHaveBeenCalled();
    expect(setupSkills).not.toHaveBeenCalled();
    expect(setupInternalHooks).not.toHaveBeenCalled();
    expect(healthCommand).not.toHaveBeenCalled();
    expect(runTui).not.toHaveBeenCalled();
    expect(ensureSetupDefaultModelSelected).toHaveBeenCalled();
    expect(intro).not.toHaveBeenCalled();
    expect(prompter.note).not.toHaveBeenCalledWith("Skipping channel setup.", "Channels");
    expect(prompter.note).not.toHaveBeenCalledWith("Skipping skills setup.", "Skills");
    expect(prompter.note).not.toHaveBeenCalledWith("Skipping search setup.", "Search");
    expect(prompter.note).not.toHaveBeenCalledWith(
      expect.stringContaining("Gateway port:"),
      "QuickStart",
    );
  });

  it("treats embedded local gateway bootstrap config as fresh setup", async () => {
    readConfigFileSnapshot.mockResolvedValueOnce({
      path: "/tmp/.maumau/maumau.json",
      exists: true,
      raw: JSON.stringify({
        meta: {
          lastTouchedVersion: "2026.3.24",
        },
        commands: {
          native: "auto",
          restart: true,
        },
        gateway: {
          mode: "local",
          auth: {
            mode: "token",
            token: "bootstrap-token",
          },
        },
      }),
      parsed: {},
      resolved: {
        meta: {
          lastTouchedVersion: "2026.3.24",
        },
        commands: {
          native: "auto",
          restart: true,
        },
        gateway: {
          mode: "local",
          auth: {
            mode: "token",
            token: "bootstrap-token",
          },
        },
      },
      valid: true,
      config: {
        meta: {
          lastTouchedVersion: "2026.3.24",
        },
        commands: {
          native: "auto",
          restart: true,
        },
        gateway: {
          mode: "local",
          auth: {
            mode: "token",
            token: "bootstrap-token",
          },
        },
      },
      issues: [],
      warnings: [],
      legacyIssues: [],
    });

    const note = vi.fn(async () => {});
    const select = vi.fn(
      async (_params: WizardSelectParams<unknown>) => "keep",
    ) as unknown as WizardPrompter["select"];
    const prompter = buildWizardPrompter({ note, select });
    const runtime = createRuntime({ throwsOnExit: true });

    await runSetupWizard(
      {
        acceptRisk: true,
        embedded: true,
        flow: "quickstart",
        installDaemon: false,
        skipProviders: true,
        skipSkills: true,
        skipSearch: true,
        skipHealth: true,
        skipUi: true,
      },
      runtime,
      prompter,
    );

    expect(note).not.toHaveBeenCalledWith("summary", "Existing config detected");
    expect(select).not.toHaveBeenCalled();
    expect(ensureFreshInstallBundledTools).toHaveBeenCalledWith(
      expect.objectContaining({ freshInstall: true }),
    );
  });

  it("ignores loader-injected defaults when checking embedded bootstrap config", async () => {
    readConfigFileSnapshot.mockResolvedValueOnce({
      path: "/tmp/.maumau/maumau.json",
      exists: true,
      raw: JSON.stringify({
        meta: {
          lastTouchedVersion: "2026.3.24",
        },
        commands: {
          native: "auto",
          restart: true,
        },
        gateway: {
          mode: "local",
          auth: {
            mode: "token",
            token: "bootstrap-token",
          },
        },
      }),
      parsed: {},
      resolved: {
        meta: {
          lastTouchedVersion: "2026.3.24",
        },
        commands: {
          native: "auto",
          restart: true,
        },
        gateway: {
          mode: "local",
          auth: {
            mode: "token",
            token: "bootstrap-token",
          },
        },
      },
      valid: true,
      config: {
        meta: {
          lastTouchedVersion: "2026.3.24",
        },
        commands: {
          native: "auto",
          restart: true,
        },
        gateway: {
          mode: "local",
          auth: {
            mode: "token",
            token: "bootstrap-token",
          },
        },
        agents: {
          defaults: {
            maxConcurrent: 4,
            subagents: {
              maxConcurrent: 8,
            },
          },
        },
        messages: {
          ackReactionScope: "group-mentions",
        },
      },
      issues: [],
      warnings: [],
      legacyIssues: [],
    });

    const note = vi.fn(async () => {});
    const select = vi.fn(
      async (_params: WizardSelectParams<unknown>) => "keep",
    ) as unknown as WizardPrompter["select"];
    const prompter = buildWizardPrompter({ note, select });
    const runtime = createRuntime({ throwsOnExit: true });

    await runSetupWizard(
      {
        acceptRisk: true,
        embedded: true,
        flow: "quickstart",
        installDaemon: false,
        skipProviders: true,
        skipSkills: true,
        skipSearch: true,
        skipHealth: true,
        skipUi: true,
      },
      runtime,
      prompter,
    );

    expect(note).not.toHaveBeenCalledWith("summary", "Existing config detected");
    expect(select).not.toHaveBeenCalled();
  });

  it("treats embedded local in-progress wizard config as fresh setup", async () => {
    readConfigFileSnapshot.mockResolvedValueOnce({
      path: "/tmp/.maumau/maumau.json",
      exists: true,
      raw: "{}",
      parsed: {},
      resolved: {
        wizard: {
          lastRunCommand: "onboard",
          lastRunMode: "local",
        },
        agents: {
          defaults: {
            workspace: "/tmp/maumau-workspace",
            model: "openai/gpt-5.4",
          },
        },
        gateway: {
          mode: "local",
          auth: {
            mode: "token",
            token: "bootstrap-token",
          },
        },
      },
      valid: true,
      config: {
        wizard: {
          lastRunCommand: "onboard",
          lastRunMode: "local",
        },
        agents: {
          defaults: {
            workspace: "/tmp/maumau-workspace",
            model: "openai/gpt-5.4",
          },
        },
        gateway: {
          mode: "local",
          auth: {
            mode: "token",
            token: "bootstrap-token",
          },
        },
      },
      issues: [],
      warnings: [],
      legacyIssues: [],
    });

    const note = vi.fn(async () => {});
    const select = vi.fn(
      async (_params: WizardSelectParams<unknown>) => "keep",
    ) as unknown as WizardPrompter["select"];
    const prompter = buildWizardPrompter({ note, select });
    const runtime = createRuntime({ throwsOnExit: true });

    await runSetupWizard(
      {
        acceptRisk: true,
        embedded: true,
        flow: "quickstart",
        installDaemon: false,
        skipProviders: true,
        skipSkills: true,
        skipSearch: true,
        skipHealth: true,
        skipUi: true,
      },
      runtime,
      prompter,
    );

    expect(note).not.toHaveBeenCalledWith("summary", "Existing config detected");
    expect(select).not.toHaveBeenCalled();
  });

  it("omits clean local reset from embedded onboarding reset choices", async () => {
    readConfigFileSnapshot.mockResolvedValueOnce({
      path: "/tmp/.maumau/maumau.json",
      exists: true,
      raw: "{}",
      parsed: {},
      resolved: {
        gateway: {
          mode: "local",
          auth: {
            mode: "token",
            token: "saved-token",
          },
        },
      },
      valid: true,
      config: {
        gateway: {
          mode: "local",
          auth: {
            mode: "token",
            token: "saved-token",
          },
        },
      },
      issues: [],
      warnings: [],
      legacyIssues: [],
    });

    const select = vi.fn(async (opts: WizardSelectParams<unknown>) => {
      if (String(opts.message).includes("existing setup on this Mac")) {
        return "reset";
      }
      if (String(opts.message).includes("should be erased")) {
        expect(opts.options.map((option) => option.value)).toEqual([
          "config",
          "config+creds+sessions",
          "full",
        ]);
        return "config";
      }
      return "quickstart";
    }) as unknown as WizardPrompter["select"];
    const prompter = buildWizardPrompter({ select });
    const runtime = createRuntime();

    await runSetupWizard(
      {
        acceptRisk: true,
        embedded: true,
        flow: "quickstart",
        mode: "local",
        authChoice: "skip",
        installDaemon: false,
        skipProviders: true,
        skipSkills: true,
        skipSearch: true,
        skipHealth: true,
        skipUi: true,
      },
      runtime,
      prompter,
    );
  });

  it("marks embedded local setup writes as in progress before completion", async () => {
    writeConfigFile.mockClear();

    const prompter = buildWizardPrompter({});
    const runtime = createRuntime();

    await runSetupWizard(
      {
        acceptRisk: true,
        embedded: true,
        flow: "quickstart",
        mode: "local",
        authChoice: "skip",
        installDaemon: false,
        skipProviders: true,
        skipSkills: true,
        skipSearch: true,
        skipHealth: true,
        skipUi: true,
      },
      runtime,
      prompter,
    );

    expect(writeConfigFile).toHaveBeenCalledWith(
      expect.objectContaining({
        wizard: expect.objectContaining({
          lastRunCommand: "onboard",
          lastRunMode: "local",
        }),
      }),
    );
  });

  async function runTuiHatchTest(params: {
    writeBootstrapFile: boolean;
    expectedMessage: string | undefined;
  }) {
    runTui.mockClear();

    const workspaceDir = await makeCaseDir("workspace-");
    if (params.writeBootstrapFile) {
      await fs.writeFile(path.join(workspaceDir, DEFAULT_BOOTSTRAP_FILENAME), "{}");
    }

    const select = vi.fn(async (opts: WizardSelectParams<unknown>) => {
      if (opts.message === "How do you want to hatch your bot?") {
        return "tui";
      }
      return "quickstart";
    }) as unknown as WizardPrompter["select"];

    const prompter = buildWizardPrompter({ select });
    const runtime = createRuntime({ throwsOnExit: true });

    await runSetupWizard(
      {
        acceptRisk: true,
        flow: "quickstart",
        mode: "local",
        workspace: workspaceDir,
        authChoice: "skip",
        skipProviders: true,
        skipSkills: true,
        skipSearch: true,
        skipHealth: true,
        installDaemon: false,
      },
      runtime,
      prompter,
    );

    expect(runTui).toHaveBeenCalledWith(
      expect.objectContaining({
        deliver: false,
        message: params.expectedMessage,
      }),
    );
  }

  it("launches TUI without auto-delivery when hatching", async () => {
    await runTuiHatchTest({ writeBootstrapFile: true, expectedMessage: "Wake up, my friend!" });
  });

  it("offers TUI hatch even without BOOTSTRAP.md", async () => {
    await runTuiHatchTest({ writeBootstrapFile: false, expectedMessage: undefined });
  });

  it("shows the web search hint at the end of setup", async () => {
    const prevBraveKey = process.env.BRAVE_API_KEY;
    delete process.env.BRAVE_API_KEY;

    try {
      const note: WizardPrompter["note"] = vi.fn(async () => {});
      const prompter = buildWizardPrompter({ note });
      const runtime = createRuntime();

      await runSetupWizard(
        {
          acceptRisk: true,
          flow: "quickstart",
          authChoice: "skip",
          installDaemon: false,
          skipProviders: true,
          skipSkills: true,
          skipSearch: true,
          skipHealth: true,
          skipUi: true,
        },
        runtime,
        prompter,
      );

      const calls = (note as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      expect(calls.some((call) => call?.[1] === "Web search")).toBe(true);
    } finally {
      if (prevBraveKey === undefined) {
        delete process.env.BRAVE_API_KEY;
      } else {
        process.env.BRAVE_API_KEY = prevBraveKey;
      }
    }
  });

  it("prompts for a model during explicit interactive Ollama setup", async () => {
    promptDefaultModel.mockClear();
    const prompter = buildWizardPrompter({});
    const runtime = createRuntime();

    await runSetupWizard(
      {
        acceptRisk: true,
        flow: "quickstart",
        authChoice: "ollama",
        installDaemon: false,
        skipSkills: true,
        skipSearch: true,
        skipHealth: true,
        skipUi: true,
      },
      runtime,
      prompter,
    );

    expect(promptDefaultModel).toHaveBeenCalledWith(
      expect.objectContaining({
        allowKeep: false,
      }),
    );
  });

  it("uses the manifest-backed provider catalog for embedded onboarding", async () => {
    promptAuthChoiceGrouped.mockClear();
    const prompter = buildWizardPrompter({});
    const runtime = createRuntime();

    await runSetupWizard(
      {
        acceptRisk: true,
        embedded: true,
        flow: "quickstart",
        installDaemon: false,
        skipSkills: true,
        skipSearch: true,
        skipHealth: true,
        skipUi: true,
      },
      runtime,
      prompter,
    );

    expect(promptAuthChoiceGrouped).toHaveBeenCalledWith(
      expect.objectContaining({
        embedded: true,
        includeRuntimeFallbackProviders: false,
      }),
    );
  });

  it("skips the extra model prompt when auth already set a default model", async () => {
    promptAuthChoiceGrouped.mockClear();
    promptDefaultModel.mockClear();
    promptAuthChoiceGrouped.mockResolvedValueOnce("openai-api-key");
    applyAuthChoice.mockResolvedValueOnce({
      config: {
        agents: {
          defaults: {
            model: "openai/gpt-5.4",
          },
        },
      },
    });

    const prompter = buildWizardPrompter({});
    const runtime = createRuntime();

    await runSetupWizard(
      {
        acceptRisk: true,
        embedded: true,
        flow: "quickstart",
        installDaemon: false,
        skipSkills: true,
        skipSearch: true,
        skipHealth: true,
        skipUi: true,
      },
      runtime,
      prompter,
    );

    expect(promptAuthChoiceGrouped).toHaveBeenCalled();
    expect(promptDefaultModel).not.toHaveBeenCalled();
  });

  it("does not prompt for a model when auth is skipped", async () => {
    promptAuthChoiceGrouped.mockClear();
    promptDefaultModel.mockClear();
    promptAuthChoiceGrouped.mockResolvedValueOnce("skip");

    const prompter = buildWizardPrompter({});
    const runtime = createRuntime();

    await runSetupWizard(
      {
        acceptRisk: true,
        embedded: true,
        flow: "quickstart",
        installDaemon: false,
        skipSkills: true,
        skipSearch: true,
        skipHealth: true,
        skipUi: true,
      },
      runtime,
      prompter,
    );

    expect(promptAuthChoiceGrouped).toHaveBeenCalled();
    expect(promptDefaultModel).not.toHaveBeenCalled();
  });

  it("keeps existing config without re-prompting provider, model, gateway, or channels", async () => {
    promptAuthChoiceGrouped.mockClear();
    promptDefaultModel.mockClear();
    configureGatewayForSetup.mockClear();
    setupChannels.mockClear();
    setupSkills.mockClear();
    setupInternalHooks.mockClear();
    finalizeSetupWizard.mockClear();
    ensureSetupDefaultModelSelected.mockClear();

    readConfigFileSnapshot.mockResolvedValueOnce({
      path: "/tmp/.maumau/maumau.json",
      exists: true,
      raw: "{}",
      parsed: {},
      resolved: {},
      valid: true,
      config: {
        agents: {
          defaults: {
            workspace: "/tmp/existing-workspace",
            model: "gpt-5.4",
          },
        },
        gateway: {
          mode: "local",
          port: 18789,
          bind: "loopback",
          auth: {
            mode: "token",
            token: "saved-token",
          },
        },
      },
      issues: [],
      warnings: [],
      legacyIssues: [],
    });

    const select = vi.fn(async (opts: WizardSelectParams<unknown>) => {
      if (String(opts.message).includes("existing setup on this Mac")) {
        return "keep";
      }
      return "quickstart";
    }) as unknown as WizardPrompter["select"];
    const prompter = buildWizardPrompter({ select });
    const runtime = createRuntime();

    await runSetupWizard(
      {
        acceptRisk: true,
        flow: "quickstart",
        mode: "local",
        installDaemon: false,
        skipUi: true,
      },
      runtime,
      prompter,
    );

    expect(promptAuthChoiceGrouped).not.toHaveBeenCalled();
    expect(promptDefaultModel).not.toHaveBeenCalled();
    expect(ensureSetupDefaultModelSelected).not.toHaveBeenCalled();
    expect(configureGatewayForSetup).not.toHaveBeenCalled();
    expect(setupChannels).not.toHaveBeenCalled();
    expect(setupSkills).not.toHaveBeenCalled();
    expect(setupInternalHooks).not.toHaveBeenCalled();
    expect(finalizeSetupWizard).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceDir: "/tmp/existing-workspace",
        nextConfig: expect.objectContaining({
          agents: expect.objectContaining({
            defaults: expect.objectContaining({
              workspace: "/tmp/existing-workspace",
              model: "gpt-5.4",
            }),
          }),
          gateway: expect.objectContaining({
            auth: expect.objectContaining({
              mode: "token",
              token: "saved-token",
            }),
          }),
        }),
      }),
    );
  });

  it("repairs a missing default model even when keeping existing settings", async () => {
    promptAuthChoiceGrouped.mockClear();
    promptDefaultModel.mockClear();
    configureGatewayForSetup.mockClear();
    setupChannels.mockClear();
    setupSkills.mockClear();
    setupInternalHooks.mockClear();
    finalizeSetupWizard.mockClear();
    writeConfigFile.mockClear();
    logConfigUpdated.mockClear();
    ensureSetupDefaultModelSelected.mockClear();
    ensureSetupDefaultModelSelected.mockImplementationOnce(async (args) => ({
      ...args.config,
      agents: {
        ...args.config.agents,
        defaults: {
          ...args.config.agents?.defaults,
          workspace: "/tmp/existing-workspace",
          model: "openai-codex/gpt-5.4",
        },
      },
    }));

    readConfigFileSnapshot.mockResolvedValueOnce({
      path: "/tmp/.maumau/maumau.json",
      exists: true,
      raw: "{}",
      parsed: {},
      resolved: {},
      valid: true,
      config: {
        agents: {
          defaults: {
            workspace: "/tmp/existing-workspace",
          },
        },
        gateway: {
          mode: "local",
          port: 18789,
          bind: "loopback",
          auth: {
            mode: "token",
            token: "saved-token",
          },
        },
      },
      issues: [],
      warnings: [],
      legacyIssues: [],
    });

    const select = vi.fn(async (opts: WizardSelectParams<unknown>) => {
      if (String(opts.message).includes("existing setup on this Mac")) {
        return "keep";
      }
      return "quickstart";
    }) as unknown as WizardPrompter["select"];
    const prompter = buildWizardPrompter({ select });
    const runtime = createRuntime();

    await runSetupWizard(
      {
        acceptRisk: true,
        flow: "quickstart",
        mode: "local",
        installDaemon: false,
        skipUi: true,
      },
      runtime,
      prompter,
    );

    expect(ensureSetupDefaultModelSelected).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          agents: expect.objectContaining({
            defaults: expect.objectContaining({
              workspace: "/tmp/existing-workspace",
            }),
          }),
        }),
      }),
    );
    expect(writeConfigFile).toHaveBeenCalledWith(
      expect.objectContaining({
        agents: expect.objectContaining({
          defaults: expect.objectContaining({
            model: "openai-codex/gpt-5.4",
          }),
        }),
      }),
    );
    expect(logConfigUpdated).toHaveBeenCalled();
    expect(promptAuthChoiceGrouped).not.toHaveBeenCalled();
    expect(promptDefaultModel).not.toHaveBeenCalled();
    expect(finalizeSetupWizard).toHaveBeenCalledWith(
      expect.objectContaining({
        nextConfig: expect.objectContaining({
          agents: expect.objectContaining({
            defaults: expect.objectContaining({
              model: "openai-codex/gpt-5.4",
            }),
          }),
        }),
      }),
    );
  });

  it("shows plugin compatibility notices for an existing valid config", async () => {
    buildPluginCompatibilityNotices.mockReturnValue([
      {
        pluginId: "legacy-plugin",
        code: "legacy-before-agent-start",
        severity: "warn",
        message:
          "still uses legacy before_agent_start; keep regression coverage on this plugin, and prefer before_model_resolve/before_prompt_build for new work.",
      },
    ]);
    readConfigFileSnapshot.mockResolvedValueOnce({
      path: "/tmp/.maumau/maumau.json",
      exists: true,
      raw: "{}",
      parsed: {},
      resolved: {},
      valid: true,
      config: {
        gateway: {},
      },
      issues: [],
      warnings: [],
      legacyIssues: [],
    });

    const note: WizardPrompter["note"] = vi.fn(async () => {});
    const select = vi.fn(async (opts: WizardSelectParams<unknown>) => {
      if (String(opts.message).includes("existing setup on this Mac")) {
        return "keep";
      }
      return "quickstart";
    }) as unknown as WizardPrompter["select"];
    const prompter = buildWizardPrompter({ note, select });
    const runtime = createRuntime();

    await runSetupWizard(
      {
        acceptRisk: true,
        flow: "quickstart",
        authChoice: "skip",
        installDaemon: false,
        skipProviders: true,
        skipSkills: true,
        skipSearch: true,
        skipHealth: true,
        skipUi: true,
      },
      runtime,
      prompter,
    );

    const calls = (note as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls.some((call) => call?.[1] === "Plugin compatibility")).toBe(true);
    expect(
      calls.some((call) => {
        const body = call?.[0];
        return typeof body === "string" && body.includes("legacy-plugin");
      }),
    ).toBe(true);
  });

  it("resolves gateway.auth.password SecretRef for local setup probe", async () => {
    const previous = process.env.MAUMAU_GATEWAY_PASSWORD;
    process.env.MAUMAU_GATEWAY_PASSWORD = "gateway-ref-password"; // pragma: allowlist secret
    probeGatewayReachable.mockClear();
    readConfigFileSnapshot.mockResolvedValueOnce({
      path: "/tmp/.maumau/maumau.json",
      exists: true,
      raw: "{}",
      parsed: {},
      resolved: {},
      valid: true,
      config: {
        gateway: {
          auth: {
            mode: "password",
            password: {
              source: "env",
              provider: "default",
              id: "MAUMAU_GATEWAY_PASSWORD",
            },
          },
        },
      },
      issues: [],
      warnings: [],
      legacyIssues: [],
    });
    const select = vi.fn(async (opts: WizardSelectParams<unknown>) => {
      if (String(opts.message).includes("existing setup on this Mac")) {
        return "keep";
      }
      return "quickstart";
    }) as unknown as WizardPrompter["select"];
    const prompter = buildWizardPrompter({ select });
    const runtime = createRuntime();

    try {
      await runSetupWizard(
        {
          acceptRisk: true,
          flow: "quickstart",
          mode: "local",
          authChoice: "skip",
          installDaemon: false,
          skipProviders: true,
          skipSkills: true,
          skipSearch: true,
          skipHealth: true,
          skipUi: true,
        },
        runtime,
        prompter,
      );
    } finally {
      if (previous === undefined) {
        delete process.env.MAUMAU_GATEWAY_PASSWORD;
      } else {
        process.env.MAUMAU_GATEWAY_PASSWORD = previous;
      }
    }

    expect(probeGatewayReachable).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "ws://127.0.0.1:18789",
        password: "gateway-ref-password", // pragma: allowlist secret
      }),
    );
  });

  it("passes secretInputMode through to local gateway config step", async () => {
    configureGatewayForSetup.mockClear();
    const prompter = buildWizardPrompter({});
    const runtime = createRuntime();

    await runSetupWizard(
      {
        acceptRisk: true,
        flow: "quickstart",
        mode: "local",
        authChoice: "skip",
        installDaemon: false,
        skipProviders: true,
        skipSkills: true,
        skipSearch: true,
        skipHealth: true,
        skipUi: true,
        secretInputMode: "ref", // pragma: allowlist secret
      },
      runtime,
      prompter,
    );

    expect(configureGatewayForSetup).toHaveBeenCalledWith(
      expect.objectContaining({
        secretInputMode: "ref", // pragma: allowlist secret
      }),
    );
  });

  it("defaults fresh local quickstart to Tailscale Serve when Tailscale is running", async () => {
    configureGatewayForSetup.mockClear();
    readTailscaleStatusJson.mockResolvedValue({
      BackendState: "Running",
      Self: {
        DNSName: "samiadjis-mac-mini.tailnet.ts.net.",
      },
    });
    const prompter = buildWizardPrompter({});
    const runtime = createRuntime();

    await runSetupWizard(
      {
        acceptRisk: true,
        flow: "quickstart",
        mode: "local",
        authChoice: "skip",
        installDaemon: false,
        skipProviders: true,
        skipSkills: true,
        skipSearch: true,
        skipHealth: true,
        skipUi: true,
      },
      runtime,
      prompter,
    );

    expect(configureGatewayForSetup).toHaveBeenCalledWith(
      expect.objectContaining({
        quickstartGateway: expect.objectContaining({
          tailscaleMode: "serve",
        }),
      }),
    );
  });
});

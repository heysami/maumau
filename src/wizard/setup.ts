import { formatCliCommand } from "../cli/command-format.js";
import type {
  GatewayAuthChoice,
  OnboardMode,
  OnboardOptions,
  ResetScope,
} from "../commands/onboard-types.js";
import type { MaumauConfig } from "../config/config.js";
import {
  DEFAULT_GATEWAY_PORT,
  readConfigFileSnapshot,
  resolveGatewayPort,
  writeConfigFile,
} from "../config/config.js";
import { resolveAgentModelPrimaryValue } from "../config/model-input.js";
import { normalizeSecretInputString } from "../config/types.secrets.js";
import {
  buildPluginCompatibilityNotices,
  formatPluginCompatibilityNotice,
} from "../plugins/status.js";
import type { RuntimeEnv } from "../runtime.js";
import { defaultRuntime } from "../runtime.js";
import { resolveUserPath } from "../utils.js";
import { WizardCancelledError, type WizardPrompter } from "./prompts.js";
import { resolveSetupSecretInputString } from "./setup.secret-input.js";
import type {
  GatewayWizardSettings,
  QuickstartGatewayDefaults,
  WizardFlow,
} from "./setup.types.js";

async function requireRiskAcknowledgement(params: {
  opts: OnboardOptions;
  prompter: WizardPrompter;
}) {
  if (params.opts.acceptRisk === true) {
    return;
  }

  await params.prompter.note(
    [
      "Security warning — please read.",
      "",
      "Maumau is a hobby project and still in beta. Expect sharp edges.",
      "By default, Maumau is a personal agent: one trusted operator boundary.",
      "This bot can read files and run actions if tools are enabled.",
      "A bad prompt can trick it into doing unsafe things.",
      "",
      "Maumau is not a hostile multi-tenant boundary by default.",
      "If multiple users can message one tool-enabled agent, they share that delegated tool authority.",
      "",
      "If you’re not comfortable with security hardening and access control, don’t run Maumau.",
      "Ask someone experienced to help before enabling tools or exposing it to the internet.",
      "",
      "Recommended baseline:",
      "- Pairing/allowlists + mention gating.",
      "- Multi-user/shared inbox: split trust boundaries (separate gateway/credentials, ideally separate OS users/hosts).",
      "- Sandbox + least-privilege tools.",
      "- Shared inboxes: isolate DM sessions (`session.dmScope: per-channel-peer`) and keep tool access minimal.",
      "- Keep secrets out of the agent’s reachable filesystem.",
      "- Use the strongest available model for any bot with tools or untrusted inboxes.",
      "",
      "Run regularly:",
      "maumau security audit --deep",
      "maumau security audit --fix",
      "",
      "Must read: https://docs.maumau.ai/gateway/security",
    ].join("\n"),
    "Security",
  );

  const ok = await params.prompter.confirm({
    message:
      "I understand this is personal-by-default and shared/multi-user use requires lock-down. Continue?",
    initialValue: false,
  });
  if (!ok) {
    throw new WizardCancelledError("risk not accepted");
  }
}

function resolveSavedGatewayBind(config: MaumauConfig): GatewayWizardSettings["bind"] {
  const bindRaw = config.gateway?.bind;
  return bindRaw === "loopback" ||
    bindRaw === "lan" ||
    bindRaw === "auto" ||
    bindRaw === "custom" ||
    bindRaw === "tailnet"
    ? bindRaw
    : "loopback";
}

function resolveSavedGatewayAuthMode(config: MaumauConfig): GatewayAuthChoice {
  if (config.gateway?.auth?.mode === "token" || config.gateway?.auth?.mode === "password") {
    return config.gateway.auth.mode;
  }
  if (config.gateway?.auth?.password) {
    return "password";
  }
  return "token";
}

function resolveSavedTailscaleMode(config: MaumauConfig): GatewayWizardSettings["tailscaleMode"] {
  const tailscaleRaw = config.gateway?.tailscale?.mode;
  return tailscaleRaw === "off" || tailscaleRaw === "serve" || tailscaleRaw === "funnel"
    ? tailscaleRaw
    : "off";
}

function shouldTreatEmbeddedGatewayBootstrapAsFreshSetup(
  opts: OnboardOptions,
  config: MaumauConfig,
): boolean {
  if (!opts.embedded || opts.mode === "remote") {
    return false;
  }

  const wizardLastRunAt =
    typeof config.wizard?.lastRunAt === "string" ? config.wizard.lastRunAt.trim() : "";
  const wizardLastRunCommand =
    typeof config.wizard?.lastRunCommand === "string"
      ? config.wizard.lastRunCommand.trim().toLowerCase()
      : "";
  const wizardLastRunMode =
    typeof config.wizard?.lastRunMode === "string"
      ? config.wizard.lastRunMode.trim().toLowerCase()
      : "";

  // Older embedded onboarding builds persisted a partial local setup marker
  // before the final completion metadata was written. Keep treating that shape
  // as fresh setup so interrupted upgrades can still resume cleanly.
  if (!wizardLastRunAt && wizardLastRunCommand === "onboard" && wizardLastRunMode === "local") {
    return true;
  }

  const rootKeys = Object.keys(config).filter((key) => key !== "commands" && key !== "meta");
  if (rootKeys.length !== 1 || rootKeys[0] !== "gateway") {
    return false;
  }

  const gateway = config.gateway;
  if (!gateway || gateway.mode !== "local") {
    return false;
  }

  const gatewayKeys = Object.keys(gateway);
  if (gatewayKeys.some((key) => key !== "mode" && key !== "auth")) {
    return false;
  }

  const auth = gateway.auth;
  if (!auth) {
    return false;
  }

  const authKeys = Object.keys(auth);
  if (authKeys.some((key) => key !== "mode" && key !== "token" && key !== "password")) {
    return false;
  }

  const mode = auth.mode;
  const hasToken = typeof auth.token === "string" && auth.token.trim().length > 0;
  const hasPassword = typeof auth.password === "string" && auth.password.trim().length > 0;

  if (mode === "token") {
    return hasToken && !hasPassword;
  }
  if (mode === "password") {
    return hasPassword && !hasToken;
  }

  return hasToken !== hasPassword;
}

async function resolveRetainedGatewaySettings(params: {
  config: MaumauConfig;
  prompter: WizardPrompter;
}): Promise<GatewayWizardSettings> {
  const { config, prompter } = params;
  const bind = resolveSavedGatewayBind(config);
  const authMode = resolveSavedGatewayAuthMode(config);
  let gatewayToken: string | undefined;

  if (authMode === "token") {
    try {
      gatewayToken = normalizeSecretInputString(
        (await resolveSetupSecretInputString({
          config,
          value: config.gateway?.auth?.token,
          path: "gateway.auth.token",
          env: process.env,
        })) ?? process.env.MAUMAU_GATEWAY_TOKEN,
      );
    } catch (error) {
      await prompter.note(
        [
          "Could not resolve gateway.auth.token SecretRef for the saved setup.",
          error instanceof Error ? error.message : String(error),
        ].join("\n"),
        "Gateway auth",
      );
    }
  }

  return {
    port: resolveGatewayPort(config),
    bind,
    customBindHost: bind === "custom" ? config.gateway?.customBindHost : undefined,
    authMode,
    gatewayToken,
    tailscaleMode: resolveSavedTailscaleMode(config),
    tailscaleResetOnExit: config.gateway?.tailscale?.resetOnExit ?? false,
  };
}

export async function runSetupWizard(
  opts: OnboardOptions,
  runtime: RuntimeEnv = defaultRuntime,
  prompter: WizardPrompter,
) {
  const onboardHelpers = await import("../commands/onboard-helpers.js");
  onboardHelpers.printWizardHeader(runtime);
  if (!opts.embedded) {
    await prompter.intro("Maumau setup");
  }
  await requireRiskAcknowledgement({ opts, prompter });

  const snapshot = await readConfigFileSnapshot();
  let baseConfig: MaumauConfig = snapshot.valid ? (snapshot.exists ? snapshot.config : {}) : {};

  if (snapshot.exists && !snapshot.valid) {
    await prompter.note(onboardHelpers.summarizeExistingConfig(baseConfig), "Invalid config");
    if (snapshot.issues.length > 0) {
      await prompter.note(
        [
          ...snapshot.issues.map((iss) => `- ${iss.path}: ${iss.message}`),
          "",
          "Docs: https://docs.maumau.ai/gateway/configuration",
        ].join("\n"),
        "Config issues",
      );
    }
    await prompter.outro(
      `Config invalid. Run \`${formatCliCommand("maumau doctor")}\` to repair it, then re-run setup.`,
    );
    runtime.exit(1);
    return;
  }

  const treatBootstrapOnlyEmbeddedConfigAsFresh =
    snapshot.valid &&
    snapshot.exists &&
    shouldTreatEmbeddedGatewayBootstrapAsFreshSetup(opts, snapshot.resolved);

  const compatibilityNotices = snapshot.valid
    ? buildPluginCompatibilityNotices({ config: baseConfig })
    : [];
  if (compatibilityNotices.length > 0) {
    await prompter.note(
      [
        `Detected ${compatibilityNotices.length} plugin compatibility notice${compatibilityNotices.length === 1 ? "" : "s"} in the current config.`,
        ...compatibilityNotices
          .slice(0, 4)
          .map((notice) => `- ${formatPluginCompatibilityNotice(notice)}`),
        ...(compatibilityNotices.length > 4
          ? [`- ... +${compatibilityNotices.length - 4} more`]
          : []),
        "",
        `Review: ${formatCliCommand("maumau doctor")}`,
        `Inspect: ${formatCliCommand("maumau plugins inspect --all")}`,
      ].join("\n"),
      "Plugin compatibility",
    );
  }

  const quickstartHint = `Configure details later via ${formatCliCommand("maumau configure")}.`;
  const manualHint = "Configure port, network, Tailscale, and auth options.";
  const explicitFlowRaw = opts.flow?.trim();
  const normalizedExplicitFlow = explicitFlowRaw === "manual" ? "advanced" : explicitFlowRaw;
  if (
    normalizedExplicitFlow &&
    normalizedExplicitFlow !== "quickstart" &&
    normalizedExplicitFlow !== "advanced"
  ) {
    runtime.error("Invalid --flow (use quickstart, manual, or advanced).");
    runtime.exit(1);
    return;
  }
  const explicitFlow: WizardFlow | undefined =
    normalizedExplicitFlow === "quickstart" || normalizedExplicitFlow === "advanced"
      ? normalizedExplicitFlow
      : undefined;
  let flow: WizardFlow =
    explicitFlow ??
    (await prompter.select({
      message: "Setup mode",
      options: [
        { value: "quickstart", label: "QuickStart", hint: quickstartHint },
        { value: "advanced", label: "Manual", hint: manualHint },
      ],
      initialValue: "quickstart",
    }));

  if (opts.mode === "remote" && flow === "quickstart") {
    await prompter.note(
      "QuickStart only supports local gateways. Switching to Manual mode.",
      "QuickStart",
    );
    flow = "advanced";
  }

  let existingConfigAction: "keep" | "modify" | "reset" | undefined;
  if (snapshot.exists && !treatBootstrapOnlyEmbeddedConfigAsFresh) {
    await prompter.note(
      onboardHelpers.summarizeExistingConfig(baseConfig),
      "Existing config detected",
    );

    const action = await prompter.select<"keep" | "modify" | "reset">({
      message:
        "Maumau found existing setup on this Mac. What should setup do with your current settings?",
      options: [
        {
          value: "keep",
          label: "Keep my current settings",
          hint: "Use your saved gateway, model, provider, and channel settings as-is.",
        },
        {
          value: "modify",
          label: "Review and update settings",
          hint: "Start from your current setup, then change anything you want in the next steps.",
        },
        {
          value: "reset",
          label: "Start fresh",
          hint: "Clear saved setup before continuing. You can choose how much to erase next.",
        },
      ],
    });
    existingConfigAction = action;

    if (action === "reset") {
      const workspaceDefault =
        baseConfig.agents?.defaults?.workspace ?? onboardHelpers.DEFAULT_WORKSPACE;
      const resetOptions = [
        {
          value: "config",
          label: "Settings only",
          hint: "Remove saved config, but keep API keys, channel logins, chat sessions, and workspace files.",
        },
        {
          value: "config+creds+sessions",
          label: "Settings, logins, and chat sessions",
          hint: "Remove config, saved credentials, and session history, but keep workspace files.",
        },
        {
          value: "full",
          label: "Everything, including workspace files",
          hint: "Remove config, saved credentials, sessions, and the workspace used by the agent.",
        },
      ];
      if (!opts.embedded) {
        resetOptions.push({
          value: "clean",
          label: "Clean local reset",
          hint: "Remove the local gateway service, app-managed CLI, saved setup, chats, and workspace files on this Mac.",
        });
      }
      const resetScope = (await prompter.select({
        message: "How much of the existing Maumau setup should be erased?",
        options: resetOptions,
      })) as ResetScope;
      await onboardHelpers.handleReset(resetScope, resolveUserPath(workspaceDefault), runtime);
      baseConfig = {};
    }
    if (action === "keep") {
      if (!opts.embedded) {
        await prompter.note(
          "Keeping your saved setup. Setup will skip re-entering providers, models, gateway settings, channels, skills, and automations.",
          "Existing config",
        );
      }
    }
  }
  const shouldKeepExistingConfig = existingConfigAction === "keep";
  const shouldCreateStarterTeam =
    !snapshot.exists || treatBootstrapOnlyEmbeddedConfigAsFresh || existingConfigAction === "reset";
  const detectedFreshInstallTailscaleMode =
    shouldCreateStarterTeam &&
    (opts.mode ?? (flow === "quickstart" ? "local" : undefined)) === "local"
      ? await (async () => {
          const { detectFreshInstallTailscaleMode } = await import("../commands/onboard-config.js");
          return await detectFreshInstallTailscaleMode(baseConfig);
        })()
      : resolveSavedTailscaleMode(baseConfig);

  const quickstartGateway: QuickstartGatewayDefaults = (() => {
    const hasExisting =
      typeof baseConfig.gateway?.port === "number" ||
      baseConfig.gateway?.bind !== undefined ||
      baseConfig.gateway?.auth?.mode !== undefined ||
      baseConfig.gateway?.auth?.token !== undefined ||
      baseConfig.gateway?.auth?.password !== undefined ||
      baseConfig.gateway?.customBindHost !== undefined ||
      baseConfig.gateway?.tailscale?.mode !== undefined;

    const bindRaw = baseConfig.gateway?.bind;
    const bind =
      bindRaw === "loopback" ||
      bindRaw === "lan" ||
      bindRaw === "auto" ||
      bindRaw === "custom" ||
      bindRaw === "tailnet"
        ? bindRaw
        : "loopback";

    let authMode: GatewayAuthChoice = "token";
    if (
      baseConfig.gateway?.auth?.mode === "token" ||
      baseConfig.gateway?.auth?.mode === "password"
    ) {
      authMode = baseConfig.gateway.auth.mode;
    } else if (baseConfig.gateway?.auth?.token) {
      authMode = "token";
    } else if (baseConfig.gateway?.auth?.password) {
      authMode = "password";
    }

    const tailscaleRaw = baseConfig.gateway?.tailscale?.mode;
    const tailscaleMode =
      tailscaleRaw === "off" || tailscaleRaw === "serve" || tailscaleRaw === "funnel"
        ? tailscaleRaw
        : hasExisting
          ? "off"
          : detectedFreshInstallTailscaleMode;

    return {
      hasExisting,
      port: resolveGatewayPort(baseConfig),
      bind,
      authMode,
      tailscaleMode,
      token: baseConfig.gateway?.auth?.token,
      password: baseConfig.gateway?.auth?.password,
      customBindHost: baseConfig.gateway?.customBindHost,
      tailscaleResetOnExit: baseConfig.gateway?.tailscale?.resetOnExit ?? false,
    };
  })();

  if (flow === "quickstart" && !opts.embedded) {
    const formatBind = (value: "loopback" | "lan" | "auto" | "custom" | "tailnet") => {
      if (value === "loopback") {
        return "Loopback (127.0.0.1)";
      }
      if (value === "lan") {
        return "LAN";
      }
      if (value === "custom") {
        return "Custom IP";
      }
      if (value === "tailnet") {
        return "Tailnet (Tailscale IP)";
      }
      return "Auto";
    };
    const formatAuth = (value: GatewayAuthChoice) => {
      if (value === "token") {
        return "Token (default)";
      }
      return "Password";
    };
    const formatTailscale = (value: "off" | "serve" | "funnel") => {
      if (value === "off") {
        return "Off";
      }
      if (value === "serve") {
        return "Serve";
      }
      return "Funnel";
    };
    const formatTailscaleWithSource = (value: "off" | "serve" | "funnel") =>
      !quickstartGateway.hasExisting &&
      value === detectedFreshInstallTailscaleMode &&
      value !== "off"
        ? `${formatTailscale(value)} (detected)`
        : formatTailscale(value);
    const quickstartLines = quickstartGateway.hasExisting
      ? [
          "Keeping your current gateway settings:",
          `Gateway port: ${quickstartGateway.port}`,
          `Gateway bind: ${formatBind(quickstartGateway.bind)}`,
          ...(quickstartGateway.bind === "custom" && quickstartGateway.customBindHost
            ? [`Gateway custom IP: ${quickstartGateway.customBindHost}`]
            : []),
          `Gateway auth: ${formatAuth(quickstartGateway.authMode)}`,
          `Tailscale exposure: ${formatTailscaleWithSource(quickstartGateway.tailscaleMode)}`,
          "Direct to chat channels.",
        ]
      : [
          `Gateway port: ${DEFAULT_GATEWAY_PORT}`,
          "Gateway bind: Loopback (127.0.0.1)",
          "Gateway auth: Token (default)",
          `Tailscale exposure: ${formatTailscaleWithSource(quickstartGateway.tailscaleMode)}`,
          "Direct to chat channels.",
        ];
    await prompter.note(quickstartLines.join("\n"), "QuickStart");
  }

  const localPort = resolveGatewayPort(baseConfig);
  const localUrl = `ws://127.0.0.1:${localPort}`;
  let localGatewayToken = process.env.MAUMAU_GATEWAY_TOKEN;
  try {
    const resolvedGatewayToken = await resolveSetupSecretInputString({
      config: baseConfig,
      value: baseConfig.gateway?.auth?.token,
      path: "gateway.auth.token",
      env: process.env,
    });
    if (resolvedGatewayToken) {
      localGatewayToken = resolvedGatewayToken;
    }
  } catch (error) {
    await prompter.note(
      [
        "Could not resolve gateway.auth.token SecretRef for setup probe.",
        error instanceof Error ? error.message : String(error),
      ].join("\n"),
      "Gateway auth",
    );
  }
  let localGatewayPassword = process.env.MAUMAU_GATEWAY_PASSWORD;
  try {
    const resolvedGatewayPassword = await resolveSetupSecretInputString({
      config: baseConfig,
      value: baseConfig.gateway?.auth?.password,
      path: "gateway.auth.password",
      env: process.env,
    });
    if (resolvedGatewayPassword) {
      localGatewayPassword = resolvedGatewayPassword;
    }
  } catch (error) {
    await prompter.note(
      [
        "Could not resolve gateway.auth.password SecretRef for setup probe.",
        error instanceof Error ? error.message : String(error),
      ].join("\n"),
      "Gateway auth",
    );
  }

  const localProbe = await onboardHelpers.probeGatewayReachable({
    url: localUrl,
    token: localGatewayToken,
    password: localGatewayPassword,
  });
  const remoteUrl = baseConfig.gateway?.remote?.url?.trim() ?? "";
  let remoteGatewayToken = normalizeSecretInputString(baseConfig.gateway?.remote?.token);
  try {
    const resolvedRemoteGatewayToken = await resolveSetupSecretInputString({
      config: baseConfig,
      value: baseConfig.gateway?.remote?.token,
      path: "gateway.remote.token",
      env: process.env,
    });
    if (resolvedRemoteGatewayToken) {
      remoteGatewayToken = resolvedRemoteGatewayToken;
    }
  } catch (error) {
    await prompter.note(
      [
        "Could not resolve gateway.remote.token SecretRef for setup probe.",
        error instanceof Error ? error.message : String(error),
      ].join("\n"),
      "Gateway auth",
    );
  }
  const remoteProbe = remoteUrl
    ? await onboardHelpers.probeGatewayReachable({
        url: remoteUrl,
        token: remoteGatewayToken,
      })
    : null;

  const mode =
    opts.mode ??
    (flow === "quickstart"
      ? "local"
      : ((await prompter.select({
          message: "What do you want to set up?",
          options: [
            {
              value: "local",
              label: "Local gateway (this machine)",
              hint: localProbe.ok
                ? `Gateway reachable (${localUrl})`
                : `No gateway detected (${localUrl})`,
            },
            {
              value: "remote",
              label: "Remote gateway (info-only)",
              hint: !remoteUrl
                ? "No remote URL configured yet"
                : remoteProbe?.ok
                  ? `Gateway reachable (${remoteUrl})`
                  : `Configured but unreachable (${remoteUrl})`,
            },
          ],
        })) as OnboardMode));

  if (mode === "remote") {
    const { logConfigUpdated } = await import("../config/logging.js");
    let nextConfig = baseConfig;
    if (!shouldKeepExistingConfig) {
      const { promptRemoteGatewayConfig } = await import("../commands/onboard-remote.js");
      nextConfig = await promptRemoteGatewayConfig(baseConfig, prompter, {
        secretInputMode: opts.secretInputMode,
      });
    }
    const { applyStarterTeamOnFreshInstall } = await import("../teams/presets.js");
    nextConfig = applyStarterTeamOnFreshInstall(nextConfig, {
      freshInstall: shouldCreateStarterTeam,
    });
    nextConfig = onboardHelpers.applyWizardMetadata(nextConfig, { command: "onboard", mode });
    await writeConfigFile(nextConfig);
    logConfigUpdated(runtime);
    await prompter.outro(
      shouldKeepExistingConfig
        ? "Kept your existing remote gateway settings."
        : "Remote gateway configured.",
    );
    return;
  }

  const defaultWorkspace =
    baseConfig.agents?.defaults?.workspace ?? onboardHelpers.DEFAULT_WORKSPACE;
  const workspaceInput =
    opts.workspace ??
    (flow === "quickstart" || shouldKeepExistingConfig
      ? defaultWorkspace
      : await prompter.text({
          message: "Workspace directory",
          initialValue: defaultWorkspace,
        }));

  const workspaceDir = resolveUserPath(workspaceInput.trim() || onboardHelpers.DEFAULT_WORKSPACE);

  const { applyLocalSetupWorkspaceConfig } = await import("../commands/onboard-config.js");
  let nextConfig: MaumauConfig = applyLocalSetupWorkspaceConfig(baseConfig, workspaceDir, {
    freshInstall: shouldCreateStarterTeam,
  });
  let settings: GatewayWizardSettings;
  const { logConfigUpdated } = await import("../config/logging.js");

  async function repairRetainedDefaultModelIfNeeded(config: MaumauConfig): Promise<MaumauConfig> {
    if (resolveAgentModelPrimaryValue(config.agents?.defaults?.model)) {
      return config;
    }

    const { ensureSetupDefaultModelSelected } = await import("./setup.default-model.js");
    const repaired = await ensureSetupDefaultModelSelected({
      config,
      prompter,
      runtime,
      workspaceDir,
    });

    if (resolveAgentModelPrimaryValue(repaired.agents?.defaults?.model)) {
      return repaired;
    }

    return repaired;
  }

  if (shouldKeepExistingConfig) {
    settings = await resolveRetainedGatewaySettings({
      config: nextConfig,
      prompter,
    });
    nextConfig = await repairRetainedDefaultModelIfNeeded(nextConfig);
  } else {
    const { ensureAuthProfileStore } = await import("../agents/auth-profiles.runtime.js");
    const { promptAuthChoiceGrouped } = await import("../commands/auth-choice-prompt.js");
    const { promptCustomApiConfig } = await import("../commands/onboard-custom.js");
    const { applyAuthChoice, resolvePreferredProviderForAuthChoice, warnIfModelConfigLooksOff } =
      await import("../commands/auth-choice.js");
    const { applyPrimaryModel, promptDefaultModel } = await import("../commands/model-picker.js");
    const { ensureSetupDefaultModelSelected } = await import("./setup.default-model.js");

    const authStore = ensureAuthProfileStore(undefined, {
      allowKeychainPrompt: false,
    });
    const authChoiceFromPrompt = opts.authChoice === undefined;
    const authChoice =
      opts.authChoice ??
      (await promptAuthChoiceGrouped({
        prompter,
        store: authStore,
        includeSkip: true,
        embedded: opts.embedded,
        includeRuntimeFallbackProviders: !opts.embedded,
        config: nextConfig,
        workspaceDir,
      }));

    if (authChoice === "custom-api-key") {
      const customResult = await promptCustomApiConfig({
        prompter,
        runtime,
        config: nextConfig,
        secretInputMode: opts.secretInputMode,
      });
      nextConfig = customResult.config;
    } else {
      const authResult = await applyAuthChoice({
        authChoice,
        config: nextConfig,
        prompter,
        runtime,
        setDefaultModel: true,
        opts: {
          tokenProvider: opts.tokenProvider,
          token: opts.authChoice === "apiKey" && opts.token ? opts.token : undefined,
        },
      });
      nextConfig = authResult.config;

      if (authResult.agentModelOverride) {
        nextConfig = applyPrimaryModel(nextConfig, authResult.agentModelOverride);
      }
    }

    const hasConfiguredDefaultModelAfterAuth = Boolean(
      resolveAgentModelPrimaryValue(nextConfig.agents?.defaults?.model),
    );
    const shouldPromptModelSelection =
      authChoice === "ollama" ||
      (authChoice !== "custom-api-key" &&
        authChoice !== "skip" &&
        authChoiceFromPrompt &&
        !hasConfiguredDefaultModelAfterAuth);
    if (shouldPromptModelSelection) {
      const modelSelection = await promptDefaultModel({
        config: nextConfig,
        prompter,
        // For ollama, don't allow "keep current" since we may need to download the selected model
        allowKeep: authChoice !== "ollama",
        ignoreAllowlist: true,
        includeProviderPluginSetups: true,
        preferredProvider: await resolvePreferredProviderForAuthChoice({
          choice: authChoice,
          config: nextConfig,
          workspaceDir,
        }),
        workspaceDir,
        runtime,
      });
      if (modelSelection.config) {
        nextConfig = modelSelection.config;
      }
      if (modelSelection.model) {
        nextConfig = applyPrimaryModel(nextConfig, modelSelection.model);
      }
    }

    nextConfig = await ensureSetupDefaultModelSelected({
      config: nextConfig,
      prompter,
      runtime,
      workspaceDir,
    });

    await warnIfModelConfigLooksOff(nextConfig, prompter);

    const { configureGatewayForSetup } = await import("./setup.gateway-config.js");
    const gateway = await configureGatewayForSetup({
      flow,
      baseConfig,
      nextConfig,
      localPort,
      quickstartGateway,
      secretInputMode: opts.secretInputMode,
      prompter,
      runtime,
    });
    nextConfig = gateway.nextConfig;
    settings = gateway.settings;

    if (!(opts.skipChannels ?? opts.skipProviders)) {
      const { listChannelPlugins } = await import("../channels/plugins/index.js");
      const { setupChannels } = await import("../commands/onboard-channels.js");
      const quickstartAllowFromChannels =
        flow === "quickstart"
          ? listChannelPlugins()
              .filter((plugin) => plugin.meta.quickstartAllowFrom)
              .map((plugin) => plugin.id)
          : [];
      nextConfig = await setupChannels(nextConfig, runtime, prompter, {
        allowSignalInstall: true,
        forceAllowFromChannels: quickstartAllowFromChannels,
        skipDmPolicyPrompt: flow === "quickstart",
        skipConfirm: flow === "quickstart",
        quickstartDefaults: flow === "quickstart",
        secretInputMode: opts.secretInputMode,
      });
    }
  }

  await onboardHelpers.ensureWorkspaceAndSessions(workspaceDir, runtime, {
    skipBootstrap: Boolean(nextConfig.agents?.defaults?.skipBootstrap),
  });

  if (!opts.embedded && (!shouldKeepExistingConfig || opts.preset === "conversation-automation")) {
    const { maybeApplyConversationAutomationPreset } =
      await import("./setup.conversation-automation.js");
    nextConfig = await maybeApplyConversationAutomationPreset({
      config: nextConfig,
      opts,
      prompter,
    });
  }

  if (!shouldKeepExistingConfig) {
    if (!opts.skipSearch) {
      const { setupSearch } = await import("../commands/onboard-search.js");
      nextConfig = await setupSearch(nextConfig, runtime, prompter, {
        quickstartDefaults: flow === "quickstart",
        secretInputMode: opts.secretInputMode,
        embedded: opts.embedded,
      });
    }

    if (!opts.skipSkills) {
      const { setupSkills } = await import("../commands/onboard-skills.js");
      nextConfig = await setupSkills(nextConfig, workspaceDir, runtime, prompter);
    }

    if (!opts.embedded) {
      // Setup hooks (session memory on /new)
      const { setupInternalHooks } = await import("../commands/onboard-hooks.js");
      nextConfig = await setupInternalHooks(nextConfig, runtime, prompter);
    }
  }

  nextConfig = onboardHelpers.applyWizardMetadata(nextConfig, { command: "onboard", mode });
  await writeConfigFile(nextConfig);
  logConfigUpdated(runtime);
  const { ensureOnboardedMultiUserMemoryArtifacts } =
    await import("../commands/onboard-multi-user-memory.js");
  await ensureOnboardedMultiUserMemoryArtifacts({
    config: nextConfig,
    runtime,
  });
  const { ensureOnboardedReflectionReviewerArtifacts } =
    await import("../commands/onboard-reflection-reviewer.js");
  await ensureOnboardedReflectionReviewerArtifacts({
    config: nextConfig,
    runtime,
  });
  const { ensureLifeImprovementRoutineArtifacts } =
    await import("../teams/life-improvement-routine.js");
  await ensureLifeImprovementRoutineArtifacts({
    config: nextConfig,
  });
  if (mode === "local" && shouldCreateStarterTeam) {
    const { maybeAutoLinkFreshInstallMauworld } =
      await import("../commands/onboard-mauworld.js");
    await maybeAutoLinkFreshInstallMauworld({
      config: nextConfig,
      runtime,
    });
  }

  if (mode === "local" && shouldCreateStarterTeam) {
    const { ensureFreshInstallBundledTools } = await import("../commands/onboard-bundled-tools.js");
    const progress = prompter.progress("Included tools");
    let bundledToolsDoneMessage = "Included tools checked.";
    const bundledTools = await (async () => {
      try {
        progress.update("Installing Google Chrome and Clawd Cursor…");
        const result = await ensureFreshInstallBundledTools({
          freshInstall: true,
          config: nextConfig,
          runtime: {
            log: (message) => progress.update(String(message)),
          },
        });
        bundledToolsDoneMessage = result.fullyReady
          ? "Included tools are ready."
          : result.ok
            ? "Included tools were installed, but some still need setup."
            : "Included tools need attention.";
        return result;
      } finally {
        progress.stop(bundledToolsDoneMessage);
      }
    })();
    if (!bundledTools.fullyReady) {
      await prompter.note(
        [
          "Fresh-install bundled tool setup needs attention:",
          ...bundledTools.results
            .filter(
              (result) =>
                result.status === "failed" ||
                result.status === "installed" ||
                (result.id === "clawd-cursor" && result.status !== "configured"),
            )
            .map((result) => `- ${result.id}: ${result.detail}`),
        ].join("\n"),
        "Included tools",
      );
    }
  }

  const { finalizeSetupWizard } = await import("./setup.finalize.js");
  const { launchedTui } = await finalizeSetupWizard({
    flow,
    opts,
    baseConfig,
    nextConfig,
    workspaceDir,
    settings,
    prompter,
    runtime,
  });
  if (launchedTui) {
    return;
  }
}

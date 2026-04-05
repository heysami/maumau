import { formatCliCommand } from "../../cli/command-format.js";
import type { MaumauConfig } from "../../config/config.js";
import { resolveGatewayPort, writeConfigFile } from "../../config/config.js";
import { logConfigUpdated } from "../../config/logging.js";
import type { RuntimeEnv } from "../../runtime.js";
import { applyConversationAutomationPresetConfig } from "../conversation-automation-preset.js";
import { DEFAULT_GATEWAY_DAEMON_RUNTIME } from "../daemon-runtime.js";
import { ensureFreshInstallBundledTools } from "../onboard-bundled-tools.js";
import {
  applyLocalSetupWorkspaceConfig,
  detectFreshInstallTailscaleMode,
} from "../onboard-config.js";
import { applyOnboardingTailscaleGatewayAuth } from "../onboard-gateway-tailscale-auth.js";
import {
  applyWizardMetadata,
  DEFAULT_WORKSPACE,
  ensureWorkspaceAndSessions,
  resolveControlUiLinks,
  waitForGatewayReachable,
} from "../onboard-helpers.js";
import { ensureOnboardedMultiUserMemoryArtifacts } from "../onboard-multi-user-memory.js";
import { ensureOnboardedReflectionReviewerArtifacts } from "../onboard-reflection-reviewer.js";
import type { OnboardOptions } from "../onboard-types.js";
import { inferAuthChoiceFromFlags } from "./local/auth-choice-inference.js";
import { applyNonInteractiveGatewayConfig } from "./local/gateway-config.js";
import {
  type GatewayHealthFailureDiagnostics,
  logNonInteractiveOnboardingFailure,
  logNonInteractiveOnboardingJson,
} from "./local/output.js";
import { applyNonInteractiveSkillsConfig } from "./local/skills-config.js";
import { resolveNonInteractiveWorkspaceDir } from "./local/workspace.js";

const INSTALL_DAEMON_HEALTH_DEADLINE_MS = 45_000;
const ATTACH_EXISTING_GATEWAY_HEALTH_DEADLINE_MS = 15_000;

async function collectGatewayHealthFailureDiagnostics(): Promise<
  GatewayHealthFailureDiagnostics | undefined
> {
  const diagnostics: GatewayHealthFailureDiagnostics = {};

  try {
    const { resolveGatewayService } = await import("../../daemon/service.js");
    const service = resolveGatewayService();
    const env = process.env as Record<string, string | undefined>;
    const [loaded, runtime] = await Promise.all([
      service.isLoaded({ env }).catch(() => false),
      service.readRuntime(env).catch(() => undefined),
    ]);
    diagnostics.service = {
      label: service.label,
      loaded,
      loadedText: service.loadedText,
      runtimeStatus: runtime?.status,
      state: runtime?.state,
      pid: runtime?.pid,
      lastExitStatus: runtime?.lastExitStatus,
      lastExitReason: runtime?.lastExitReason,
    };
  } catch (err) {
    diagnostics.inspectError = `service diagnostics failed: ${String(err)}`;
  }

  try {
    const { readLastGatewayErrorLine } = await import("../../daemon/diagnostics.js");
    diagnostics.lastGatewayError = (await readLastGatewayErrorLine(process.env)) ?? undefined;
  } catch (err) {
    diagnostics.inspectError = diagnostics.inspectError
      ? `${diagnostics.inspectError}; log diagnostics failed: ${String(err)}`
      : `log diagnostics failed: ${String(err)}`;
  }

  return diagnostics.service || diagnostics.lastGatewayError || diagnostics.inspectError
    ? diagnostics
    : undefined;
}

export async function runNonInteractiveLocalSetup(params: {
  opts: OnboardOptions;
  runtime: RuntimeEnv;
  baseConfig: MaumauConfig;
  freshInstall: boolean;
}) {
  const { opts, runtime, baseConfig, freshInstall } = params;
  const mode = "local" as const;

  const workspaceDir = resolveNonInteractiveWorkspaceDir({
    opts,
    baseConfig,
    defaultWorkspaceDir: DEFAULT_WORKSPACE,
  });

  let nextConfig: MaumauConfig = applyLocalSetupWorkspaceConfig(baseConfig, workspaceDir, {
    freshInstall,
  });

  const inferredAuthChoice = inferAuthChoiceFromFlags(opts);
  if (!opts.authChoice && inferredAuthChoice.matches.length > 1) {
    runtime.error(
      [
        "Multiple API key flags were provided for non-interactive setup.",
        "Use a single provider flag or pass --auth-choice explicitly.",
        `Flags: ${inferredAuthChoice.matches.map((match) => match.label).join(", ")}`,
      ].join("\n"),
    );
    runtime.exit(1);
    return;
  }
  const authChoice = opts.authChoice ?? inferredAuthChoice.choice ?? "skip";
  if (authChoice !== "skip") {
    const { applyNonInteractiveAuthChoice } = await import("./local/auth-choice.js");
    const nextConfigAfterAuth = await applyNonInteractiveAuthChoice({
      nextConfig,
      authChoice,
      opts,
      runtime,
      baseConfig,
    });
    if (!nextConfigAfterAuth) {
      return;
    }
    nextConfig = nextConfigAfterAuth;
  }

  const gatewayBasePort = resolveGatewayPort(baseConfig);
  const detectedFreshInstallTailscaleMode =
    freshInstall && opts.tailscale === undefined
      ? await detectFreshInstallTailscaleMode(baseConfig)
      : undefined;
  const gatewayResult = await applyNonInteractiveGatewayConfig({
    nextConfig,
    opts,
    runtime,
    defaultPort: gatewayBasePort,
    detectedTailscaleMode: detectedFreshInstallTailscaleMode,
  });
  if (!gatewayResult) {
    return;
  }
  nextConfig = gatewayResult.nextConfig;
  let effectiveTailscaleMode = gatewayResult.tailscaleMode;
  if (gatewayResult.tailscaleMode === "serve" || gatewayResult.tailscaleMode === "funnel") {
    const { probeTailscaleExposure } = await import("../../infra/tailscale.js");
    const exposure = await probeTailscaleExposure(gatewayResult.tailscaleMode).catch(() => null);
    if (exposure?.blockedReason === "doctor_failed") {
      const lines = [
        `Tailscale ${gatewayResult.tailscaleMode} is not enabled on this tailnet yet.`,
        exposure.suggestedFix ??
          "Enable the requested Tailscale exposure mode and rerun onboarding.",
      ];
      if (opts.tailscale !== undefined) {
        runtime.error(lines.join("\n"));
        runtime.exit(1);
        return;
      }
      runtime.log([...lines, "Keeping Tailscale exposure off until this is enabled."].join("\n"));
      nextConfig = applyOnboardingTailscaleGatewayAuth({
        cfg: {
          ...nextConfig,
          gateway: {
            ...nextConfig.gateway,
            tailscale: {
              ...nextConfig.gateway?.tailscale,
              mode: "off",
            },
          },
        },
        tailscaleMode: "off",
        authMode: gatewayResult.authMode as "token" | "password",
      });
      effectiveTailscaleMode = "off";
    }
  }

  nextConfig = applyNonInteractiveSkillsConfig({ nextConfig, opts, runtime });
  if (opts.preset === "conversation-automation") {
    nextConfig = applyConversationAutomationPresetConfig(nextConfig, {
      enabled: true,
    });
  }

  nextConfig = applyWizardMetadata(nextConfig, { command: "onboard", mode });
  await writeConfigFile(nextConfig);
  logConfigUpdated(runtime);

  await ensureWorkspaceAndSessions(workspaceDir, runtime, {
    skipBootstrap: Boolean(nextConfig.agents?.defaults?.skipBootstrap),
  });
  await ensureOnboardedMultiUserMemoryArtifacts({
    config: nextConfig,
    runtime,
  });
  await ensureOnboardedReflectionReviewerArtifacts({
    config: nextConfig,
    runtime,
  });

  const bundledTools = await ensureFreshInstallBundledTools({
    freshInstall,
    runtime,
  });
  if (bundledTools.attempted && !bundledTools.ok) {
    runtime.log(
      [
        "Fresh-install bundled tool setup needs attention:",
        ...bundledTools.results
          .filter((result) => result.status === "failed")
          .map((result) => `- ${result.id}: ${result.detail}`),
      ].join("\n"),
    );
  }

  const daemonRuntimeRaw = opts.daemonRuntime ?? DEFAULT_GATEWAY_DAEMON_RUNTIME;
  let daemonInstallStatus:
    | {
        requested: boolean;
        installed: boolean;
        skippedReason?: "systemd-user-unavailable";
      }
    | undefined;
  if (opts.installDaemon) {
    const { installGatewayDaemonNonInteractive } = await import("./local/daemon-install.js");
    const daemonInstall = await installGatewayDaemonNonInteractive({
      nextConfig,
      opts,
      runtime,
      port: gatewayResult.port,
    });
    daemonInstallStatus = daemonInstall.installed
      ? {
          requested: true,
          installed: true,
        }
      : {
          requested: true,
          installed: false,
          skippedReason: daemonInstall.skippedReason,
        };
    if (!daemonInstall.installed && !opts.skipHealth) {
      logNonInteractiveOnboardingFailure({
        opts,
        runtime,
        mode,
        phase: "daemon-install",
        message:
          daemonInstall.skippedReason === "systemd-user-unavailable"
            ? "Gateway service install is unavailable because systemd user services are not reachable in this Linux session."
            : "Gateway service install did not complete successfully.",
        installDaemon: true,
        daemonInstall: {
          requested: true,
          installed: false,
          skippedReason: daemonInstall.skippedReason,
        },
        daemonRuntime: daemonRuntimeRaw,
        hints:
          daemonInstall.skippedReason === "systemd-user-unavailable"
            ? [
                "Fix: rerun without `--install-daemon` for one-shot setup, or enable a working user-systemd session and retry.",
                "If your auth profile uses env-backed refs, keep those env vars set in the shell that runs `maumau gateway run` or `maumau agent --local`.",
              ]
            : [`Run \`${formatCliCommand("maumau gateway status --deep")}\` for more detail.`],
      });
      runtime.exit(1);
      return;
    }
  }

  if (!opts.skipHealth) {
    const { healthCommand } = await import("../health.js");
    const links = resolveControlUiLinks({
      bind: gatewayResult.bind as "auto" | "lan" | "loopback" | "custom" | "tailnet",
      port: gatewayResult.port,
      customBindHost: nextConfig.gateway?.customBindHost,
      basePath: undefined,
    });
    const probe = await waitForGatewayReachable({
      url: links.wsUrl,
      token: gatewayResult.gatewayToken,
      deadlineMs: opts.installDaemon
        ? INSTALL_DAEMON_HEALTH_DEADLINE_MS
        : ATTACH_EXISTING_GATEWAY_HEALTH_DEADLINE_MS,
    });
    if (!probe.ok) {
      const diagnostics = opts.installDaemon
        ? await collectGatewayHealthFailureDiagnostics()
        : undefined;
      logNonInteractiveOnboardingFailure({
        opts,
        runtime,
        mode,
        phase: "gateway-health",
        message: `Gateway did not become reachable at ${links.wsUrl}.`,
        detail: probe.detail,
        gateway: {
          wsUrl: links.wsUrl,
          httpUrl: links.httpUrl,
        },
        installDaemon: Boolean(opts.installDaemon),
        daemonInstall: daemonInstallStatus,
        daemonRuntime: opts.installDaemon ? daemonRuntimeRaw : undefined,
        diagnostics,
        hints: !opts.installDaemon
          ? [
              "Non-interactive local setup only waits for an already-running gateway unless you pass --install-daemon.",
              `Fix: start \`${formatCliCommand("maumau gateway run")}\`, re-run with \`--install-daemon\`, or use \`--skip-health\`.`,
              process.platform === "win32"
                ? "Native Windows managed gateway install tries Scheduled Tasks first and falls back to a per-user Startup-folder login item when task creation is denied."
                : undefined,
            ].filter((value): value is string => Boolean(value))
          : [`Run \`${formatCliCommand("maumau gateway status --deep")}\` for more detail.`],
      });
      runtime.exit(1);
      return;
    }
    await healthCommand({ json: false, timeoutMs: 10_000 }, runtime);
  }

  logNonInteractiveOnboardingJson({
    opts,
    runtime,
    mode,
    workspaceDir,
    authChoice,
    gateway: {
      port: gatewayResult.port,
      bind: gatewayResult.bind,
      authMode: gatewayResult.authMode,
      tailscaleMode: effectiveTailscaleMode,
    },
    installDaemon: Boolean(opts.installDaemon),
    daemonInstall: daemonInstallStatus,
    daemonRuntime: opts.installDaemon ? daemonRuntimeRaw : undefined,
    skipSkills: Boolean(opts.skipSkills),
    skipHealth: Boolean(opts.skipHealth),
    bundledTools: bundledTools.attempted ? bundledTools.results : undefined,
  });

  if (!opts.json) {
    runtime.log(
      `Tip: run \`${formatCliCommand("maumau configure --section web")}\` to store your Brave API key for web_search. Docs: https://docs.maumau.ai/tools/web`,
    );
  }
}

import {
  bootstrapMauworldLinkPublic,
  bootstrapMauworldLinkWithOnboardingSecret,
} from "../../extensions/mauworld/src/client.js";
import { resolveMauworldConfig } from "../../extensions/mauworld/src/config.js";
import { loadMauworldSession } from "../../extensions/mauworld/src/session-store.js";
import { generateInstallUsername } from "../../extensions/mauworld/src/username.js";
import type { MaumauConfig } from "../config/config.js";
import { resolveStateDir } from "../config/paths.js";
import { loadOrCreateDeviceIdentity } from "../infra/device-identity.js";
import type { RuntimeEnv } from "../runtime.js";
import { VERSION } from "../version.js";

export type FreshInstallMauworldAutoLinkResult =
  | { status: "disabled" }
  | { status: "already-linked"; installationId: string }
  | { status: "skipped"; reason: "missing-api-base-url" }
  | { status: "linked"; installationId: string; mode: "onboarding-secret" | "public" }
  | { status: "failed"; message: string };

const DEFAULT_DISPLAY_NAME = "Main Mau Agent";

function resolvePublicDisplayName(configuredDisplayName: string): string {
  // Auto-derive a deterministic per-install handle when the user has not
  // customized displayName. Same machine always lands on the same handle.
  if (configuredDisplayName !== DEFAULT_DISPLAY_NAME) {
    return configuredDisplayName;
  }
  const identity = loadOrCreateDeviceIdentity();
  return generateInstallUsername(identity.deviceId);
}

function flattenMauworldPluginConfig(config: MaumauConfig): Record<string, unknown> {
  const entry = config.plugins?.entries?.mauworld;
  return {
    enabled: entry?.enabled,
    ...entry?.config,
  };
}

export async function maybeAutoLinkFreshInstallMauworld(params: {
  config: MaumauConfig;
  runtime: RuntimeEnv;
}): Promise<FreshInstallMauworldAutoLinkResult> {
  const pluginConfig = resolveMauworldConfig({
    pluginConfig: flattenMauworldPluginConfig(params.config),
  });

  if (!pluginConfig.enabled || !pluginConfig.autoLinkOnFreshInstall) {
    return { status: "disabled" };
  }

  if (!pluginConfig.apiBaseUrl) {
    params.runtime.log("[mauworld] Fresh-install auto-link skipped: apiBaseUrl is not configured.");
    return { status: "skipped", reason: "missing-api-base-url" };
  }

  const stateDir = resolveStateDir();
  const existingSession = await loadMauworldSession(stateDir);
  if (existingSession) {
    return {
      status: "already-linked",
      installationId: existingSession.installationId,
    };
  }

  // Two paths:
  //   - With onboardingSecret: privileged auto-link (admin/internal deploys).
  //   - Without onboardingSecret: public-bootstrap. Every install becomes a
  //     Mauworld user identified by its deterministic deviceId-derived handle.
  if (pluginConfig.onboardingSecret) {
    params.runtime.log(
      "[mauworld] Auto-linking this fresh install to Mauworld via onboarding secret...",
    );
    try {
      const linked = await bootstrapMauworldLinkWithOnboardingSecret({
        apiBaseUrl: pluginConfig.apiBaseUrl,
        timeoutMs: pluginConfig.timeoutMs,
        onboardingSecret: pluginConfig.onboardingSecret,
        stateDir,
        displayName: pluginConfig.displayName,
        clientVersion: VERSION,
      });
      params.runtime.log(
        `[mauworld] Linked fresh install to Mauworld as ${linked.installationId}.`,
      );
      return {
        status: "linked",
        installationId: linked.installationId,
        mode: "onboarding-secret",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      params.runtime.log(`[mauworld] Fresh-install auto-link failed: ${message}`);
      return { status: "failed", message };
    }
  }

  const displayName = resolvePublicDisplayName(pluginConfig.displayName);
  params.runtime.log(
    `[mauworld] Auto-linking this fresh install to Mauworld as @${displayName}...`,
  );
  try {
    const linked = await bootstrapMauworldLinkPublic({
      apiBaseUrl: pluginConfig.apiBaseUrl,
      timeoutMs: pluginConfig.timeoutMs,
      stateDir,
      displayName,
      clientVersion: VERSION,
    });
    params.runtime.log(
      `[mauworld] Linked fresh install to Mauworld as ${linked.installationId} (@${displayName}).`,
    );
    return { status: "linked", installationId: linked.installationId, mode: "public" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    params.runtime.log(`[mauworld] Fresh-install auto-link failed: ${message}`);
    return { status: "failed", message };
  }
}

import type { MaumauConfig } from "../config/config.js";
import { resolveStateDir } from "../config/paths.js";
import type { RuntimeEnv } from "../runtime.js";
import { VERSION } from "../version.js";
import {
  bootstrapMauworldLinkWithOnboardingSecret,
} from "../../extensions/mauworld/src/client.js";
import { resolveMauworldConfig } from "../../extensions/mauworld/src/config.js";
import { loadMauworldSession } from "../../extensions/mauworld/src/session-store.js";

export type FreshInstallMauworldAutoLinkResult =
  | { status: "disabled" }
  | { status: "already-linked"; installationId: string }
  | { status: "skipped"; reason: "missing-api-base-url" | "missing-onboarding-secret" }
  | { status: "linked"; installationId: string }
  | { status: "failed"; message: string };

function flattenMauworldPluginConfig(config: MaumauConfig): Record<string, unknown> {
  const entry = config.plugins?.entries?.mauworld;
  return {
    enabled: entry?.enabled,
    ...(entry?.config ?? {}),
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

  if (!pluginConfig.onboardingSecret) {
    params.runtime.log(
      "[mauworld] Fresh-install auto-link skipped: set plugins.entries.mauworld.config.onboardingSecret or MAUWORLD_ONBOARDING_SECRET.",
    );
    return { status: "skipped", reason: "missing-onboarding-secret" };
  }

  params.runtime.log("[mauworld] Auto-linking this fresh install to Mauworld...");

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
    return { status: "linked", installationId: linked.installationId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    params.runtime.log(`[mauworld] Fresh-install auto-link failed: ${message}`);
    return { status: "failed", message };
  }
}

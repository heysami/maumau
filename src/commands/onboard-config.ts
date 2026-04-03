import { resolveBrowserConfig } from "../browser/config.js";
import { allocateCdpPort, allocateColor, getUsedColors, getUsedPorts } from "../browser/profiles.js";
import type { MaumauConfig } from "../config/config.js";
import type { BrowserProfileConfig } from "../config/config.js";
import type { GatewayTailscaleMode } from "../config/types.gateway.js";
import { readTailscaleStatusJson } from "../infra/tailscale.js";
import type { DmScope } from "../config/types.base.js";
import type { ToolProfileId } from "../config/types.tools.js";
import { applyStarterTeamOnFreshInstall } from "../teams/presets.js";
import { applyLocalSetupMultiUserMemoryDefaults } from "./onboard-multi-user-memory.js";
import { applyLocalSetupReflectionReviewerDefaults } from "./onboard-reflection-reviewer.js";

export const ONBOARDING_DEFAULT_DM_SCOPE: DmScope = "per-channel-peer";
export const ONBOARDING_DEFAULT_TOOLS_PROFILE: ToolProfileId = "coding";
export const ONBOARDING_DEFAULT_OPTIONAL_PLUGIN_TOOLS = ["lobster", "llm-task"] as const;
const DEFAULT_CLAWD_BROWSER_PROFILE_NAMES = ["desktop", "desktop-fallback", "clawd-desktop"] as const;

function hasUsableTailscaleIdentity(status: Record<string, unknown>): boolean {
  const backendState = typeof status.BackendState === "string" ? status.BackendState : "";
  if (backendState !== "Running") {
    return false;
  }
  const self = status.Self;
  if (!self || typeof self !== "object") {
    return false;
  }
  const dnsName = typeof (self as { DNSName?: unknown }).DNSName === "string"
    ? ((self as { DNSName?: string }).DNSName ?? "").trim()
    : "";
  if (dnsName) {
    return true;
  }
  const ips = Array.isArray((self as { TailscaleIPs?: unknown }).TailscaleIPs)
    ? ((self as { TailscaleIPs?: string[] }).TailscaleIPs ?? [])
    : [];
  return ips.some((ip) => typeof ip === "string" && ip.trim().length > 0);
}

export async function detectFreshInstallTailscaleMode(
  config?: MaumauConfig,
): Promise<GatewayTailscaleMode> {
  const configuredMode = config?.gateway?.tailscale?.mode;
  if (configuredMode === "off" || configuredMode === "serve" || configuredMode === "funnel") {
    return configuredMode;
  }
  try {
    const status = await readTailscaleStatusJson();
    return hasUsableTailscaleIdentity(status) ? "serve" : "off";
  } catch {
    return "off";
  }
}

function resolveOnboardingAlsoAllow(
  tools: MaumauConfig["tools"] | undefined,
): string[] | undefined {
  if (Array.isArray(tools?.allow) && tools.allow.length > 0) {
    return tools?.alsoAllow;
  }
  return Array.from(
    new Set([...(tools?.alsoAllow ?? []), ...ONBOARDING_DEFAULT_OPTIONAL_PLUGIN_TOOLS]),
  );
}

function pickFreshInstallClawdProfileName(
  profiles: Record<string, BrowserProfileConfig> | undefined,
): string | undefined {
  const entries = profiles ? Object.entries(profiles) : [];
  const existingClawd = entries.find(([, profile]) => profile?.driver === "clawd")?.[0];
  if (existingClawd) {
    return existingClawd;
  }
  for (const candidate of DEFAULT_CLAWD_BROWSER_PROFILE_NAMES) {
    if (!profiles?.[candidate]) {
      return candidate;
    }
  }
  return undefined;
}

function applyFreshInstallBrowserDefaults(config: MaumauConfig): MaumauConfig {
  const profileName = pickFreshInstallClawdProfileName(config.browser?.profiles);
  if (!profileName) {
    return {
      ...config,
      browser: {
        ...config.browser,
        defaultProfile: config.browser?.defaultProfile ?? "user",
      },
    };
  }

  const resolvedBrowser = resolveBrowserConfig(config.browser, config);
  const cdpPort = allocateCdpPort(
    getUsedPorts(resolvedBrowser.profiles),
    {
      start: resolvedBrowser.cdpPortRangeStart,
      end: resolvedBrowser.cdpPortRangeEnd,
    },
  );
  if (cdpPort === null) {
    return {
      ...config,
      browser: {
        ...config.browser,
        defaultProfile: config.browser?.defaultProfile ?? "user",
      },
    };
  }

  return {
    ...config,
    browser: {
      ...config.browser,
      defaultProfile: config.browser?.defaultProfile ?? "user",
      profiles: {
        ...(config.browser?.profiles ?? {}),
        [profileName]: config.browser?.profiles?.[profileName] ?? {
          driver: "clawd",
          cdpPort,
          color: allocateColor(getUsedColors(resolvedBrowser.profiles)),
        },
      },
    },
  };
}

export function applyLocalSetupWorkspaceConfig(
  baseConfig: MaumauConfig,
  workspaceDir: string,
  options?: { freshInstall?: boolean },
): MaumauConfig {
  return applyStarterTeamOnFreshInstall(
    applyLocalSetupReflectionReviewerDefaults(
      applyLocalSetupMultiUserMemoryDefaults(
        options?.freshInstall === true
          ? applyFreshInstallBrowserDefaults({
              ...baseConfig,
              agents: {
                ...baseConfig.agents,
                defaults: {
                  ...baseConfig.agents?.defaults,
                  workspace: workspaceDir,
                },
              },
              gateway: {
                ...baseConfig.gateway,
                mode: "local",
              },
              session: {
                ...baseConfig.session,
                dmScope: baseConfig.session?.dmScope ?? ONBOARDING_DEFAULT_DM_SCOPE,
              },
              tools: {
                ...baseConfig.tools,
                profile: baseConfig.tools?.profile ?? ONBOARDING_DEFAULT_TOOLS_PROFILE,
                alsoAllow: resolveOnboardingAlsoAllow(baseConfig.tools),
              },
            })
          : {
              ...baseConfig,
              agents: {
                ...baseConfig.agents,
                defaults: {
                  ...baseConfig.agents?.defaults,
                  workspace: workspaceDir,
                },
              },
              gateway: {
                ...baseConfig.gateway,
                mode: "local",
              },
              session: {
                ...baseConfig.session,
                dmScope: baseConfig.session?.dmScope ?? ONBOARDING_DEFAULT_DM_SCOPE,
              },
              tools: {
                ...baseConfig.tools,
                profile: baseConfig.tools?.profile ?? ONBOARDING_DEFAULT_TOOLS_PROFILE,
                alsoAllow: resolveOnboardingAlsoAllow(baseConfig.tools),
              },
            },
      ),
    ),
    { freshInstall: options?.freshInstall === true },
  );
}

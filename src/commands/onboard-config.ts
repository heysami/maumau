import type { MaumauConfig } from "../config/config.js";
import type { DmScope } from "../config/types.base.js";
import type { ToolProfileId } from "../config/types.tools.js";

export const ONBOARDING_DEFAULT_DM_SCOPE: DmScope = "per-channel-peer";
export const ONBOARDING_DEFAULT_TOOLS_PROFILE: ToolProfileId = "coding";
export const ONBOARDING_DEFAULT_OPTIONAL_PLUGIN_TOOLS = ["lobster", "llm-task"] as const;

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

export function applyLocalSetupWorkspaceConfig(
  baseConfig: MaumauConfig,
  workspaceDir: string,
): MaumauConfig {
  return {
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
  };
}

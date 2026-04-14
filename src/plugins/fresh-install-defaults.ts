import type { MaumauConfig, PluginEntryConfig } from "../config/types.js";

export const DEFAULT_MAUWORLD_PLUGIN_ENTRY = {
  enabled: true,
  config: {
    apiBaseUrl: "https://mauworld-api.onrender.com/api",
    autoHeartbeat: true,
    autoLinkOnFreshInstall: true,
    mainAgentId: "main",
    timeoutMs: 15_000,
    displayName: "Main Mau Agent",
  },
} satisfies PluginEntryConfig;

export function applyFreshInstallPluginDefaults(config: MaumauConfig): MaumauConfig {
  const existingMauworldEntry = config.plugins?.entries?.mauworld;

  return {
    ...config,
    plugins: {
      ...config.plugins,
      entries: {
        ...(config.plugins?.entries ?? {}),
        mauworld: {
          ...DEFAULT_MAUWORLD_PLUGIN_ENTRY,
          ...existingMauworldEntry,
          config: {
            ...(DEFAULT_MAUWORLD_PLUGIN_ENTRY.config ?? {}),
            ...(existingMauworldEntry?.config ?? {}),
          },
        },
      },
    },
  };
}

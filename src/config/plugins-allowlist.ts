import type { MaumauConfig } from "./config.js";

export function ensurePluginAllowlisted(cfg: MaumauConfig, pluginId: string): MaumauConfig {
  const allow = cfg.plugins?.allow;
  if (!Array.isArray(allow) || allow.includes(pluginId)) {
    return cfg;
  }
  return {
    ...cfg,
    plugins: {
      ...cfg.plugins,
      allow: [...allow, pluginId],
    },
  };
}

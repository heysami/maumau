import type { MaumauConfig, MaumauPluginApi } from "../api.js";
import { resolveMultiUserMemoryConfig, type MultiUserMemoryConfig } from "./config.js";

export function loadCurrentMaumauConfig(api: MaumauPluginApi): MaumauConfig {
  try {
    return api.runtime.config.loadConfig() as MaumauConfig;
  } catch {
    return api.config as MaumauConfig;
  }
}

export function resolveCurrentMultiUserMemoryConfig(api: MaumauPluginApi): MultiUserMemoryConfig {
  return resolveMultiUserMemoryConfig(loadCurrentMaumauConfig(api));
}

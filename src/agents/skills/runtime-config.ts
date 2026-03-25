import { getRuntimeConfigSnapshot, type MaumauConfig } from "../../config/config.js";

export function resolveSkillRuntimeConfig(config?: MaumauConfig): MaumauConfig | undefined {
  return getRuntimeConfigSnapshot() ?? config;
}

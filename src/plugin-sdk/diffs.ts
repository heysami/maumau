// Narrow plugin-sdk surface for the bundled diffs plugin.
// Keep this list additive and scoped to symbols used under extensions/diffs.

export { definePluginEntry } from "./plugin-entry.js";
export type { MaumauConfig } from "../config/config.js";
export { resolvePreferredMaumauTmpDir } from "../infra/tmp-maumau-dir.js";
export type {
  AnyAgentTool,
  MaumauPluginApi,
  MaumauPluginConfigSchema,
  MaumauPluginToolContext,
  PluginLogger,
} from "../plugins/types.js";

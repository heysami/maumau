import type { PluginRuntime } from "maumau/plugin-sdk/core";
import { createPluginRuntimeStore } from "maumau/plugin-sdk/runtime-store";

const { setRuntime: setDiscordRuntime, getRuntime: getDiscordRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Discord runtime not initialized");
export { getDiscordRuntime, setDiscordRuntime };

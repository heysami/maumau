import type { PluginRuntime } from "maumau/plugin-sdk/core";
import { createPluginRuntimeStore } from "maumau/plugin-sdk/runtime-store";

const { setRuntime: setSlackRuntime, getRuntime: getSlackRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Slack runtime not initialized");
export { getSlackRuntime, setSlackRuntime };

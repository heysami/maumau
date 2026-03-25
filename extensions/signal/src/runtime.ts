import type { PluginRuntime } from "maumau/plugin-sdk/core";
import { createPluginRuntimeStore } from "maumau/plugin-sdk/runtime-store";

const { setRuntime: setSignalRuntime, getRuntime: getSignalRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Signal runtime not initialized");
export { getSignalRuntime, setSignalRuntime };

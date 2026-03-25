import type { PluginRuntime } from "maumau/plugin-sdk/core";
import { createPluginRuntimeStore } from "maumau/plugin-sdk/runtime-store";

const { setRuntime: setTelegramRuntime, getRuntime: getTelegramRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Telegram runtime not initialized");
export { getTelegramRuntime, setTelegramRuntime };

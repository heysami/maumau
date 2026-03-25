import { definePluginEntry } from "maumau/plugin-sdk/plugin-entry";
import type { AnyAgentTool, MaumauPluginApi, MaumauPluginToolFactory } from "./runtime-api.js";
import { createLobsterTool } from "./src/lobster-tool.js";

export default definePluginEntry({
  id: "lobster",
  name: "Lobster",
  description: "Optional local shell helper tools",
  register(api: MaumauPluginApi) {
    api.registerTool(
      ((ctx) => {
        if (ctx.sandboxed) {
          return null;
        }
        return createLobsterTool(api) as AnyAgentTool;
      }) as MaumauPluginToolFactory,
      { optional: true },
    );
  },
});

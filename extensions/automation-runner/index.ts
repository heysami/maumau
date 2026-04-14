import {
  definePluginEntry,
  type MaumauPluginApi,
  type MaumauPluginToolFactory,
  type MaumauPluginToolContext,
} from "./runtime-api.js";
import { createAutomationTaskTool } from "./src/tool.js";

export default definePluginEntry({
  id: "automation-runner",
  name: "Automation Runner",
  description: "Bounded browser-first automation with approval-gated side effects.",
  register(api: MaumauPluginApi) {
    api.registerTool(
      ((context: MaumauPluginToolContext) =>
        createAutomationTaskTool(api, context)) as MaumauPluginToolFactory,
      { optional: true },
    );
  },
});

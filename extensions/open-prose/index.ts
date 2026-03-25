import { definePluginEntry, type MaumauPluginApi } from "./runtime-api.js";

export default definePluginEntry({
  id: "open-prose",
  name: "OpenProse",
  description: "Plugin-shipped prose skills bundle",
  register(_api: MaumauPluginApi) {
    // OpenProse is delivered via plugin-shipped skills.
  },
});

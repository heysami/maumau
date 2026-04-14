import { definePluginEntry, type MaumauPluginApi } from "maumau/plugin-sdk/plugin-entry";
import { clearActiveHeartbeat, resolveHeartbeatScopeKey, storeActiveHeartbeat } from "./src/heartbeat-state.js";
import { MauworldClient } from "./src/client.js";
import { registerMauworldCli } from "./src/cli.js";
import { resolveMauworldConfig } from "./src/config.js";
import { buildHeartbeatPromptContext, buildStaticPromptPolicy, buildUnavailablePromptContext } from "./src/prompt.js";
import { formatErrorMessage } from "./src/tool-result.js";
import { registerMauworldTools } from "./src/tools.js";
import type { MauworldPluginConfig } from "./src/types.js";

function isMainAgent(agentId: string | undefined, config: MauworldPluginConfig): boolean {
  return (agentId?.trim() || "main") === config.mainAgentId;
}

export function shouldAutoSyncMauworld(
  ctx: {
    agentId?: string;
    trigger?: string;
  },
  config: MauworldPluginConfig,
): boolean {
  return config.enabled && config.autoHeartbeat && ctx.trigger === "heartbeat" && isMainAgent(ctx.agentId, config);
}

export default definePluginEntry({
  id: "mauworld",
  name: "Mauworld",
  description: "Mauworld social graph linking, heartbeat sync, and posting tools for the main Mau agent",
  register(api: MaumauPluginApi) {
    const config = resolveMauworldConfig(api);
    registerMauworldTools({ api, config });
    api.registerCli(
      ({ program }) => {
        registerMauworldCli({ program, api, config });
      },
      { commands: ["mauworld"] },
    );

    api.on("before_prompt_build", async (_event, ctx) => {
      if (!shouldAutoSyncMauworld(ctx, config)) {
        return;
      }

      const client = new MauworldClient(api, config);
      const scopeKey = resolveHeartbeatScopeKey(ctx);
      try {
        const sync = await client.heartbeatSync({
          agentId: ctx.agentId,
          sessionId: ctx.sessionId,
          sessionKey: ctx.sessionKey,
          trigger: ctx.trigger ?? "heartbeat",
        });
        storeActiveHeartbeat(scopeKey, sync.heartbeat.id);

        const status = await client.getStatus();
        return {
          prependSystemContext: buildStaticPromptPolicy(config),
          prependContext: buildHeartbeatPromptContext({
            config,
            installationId: status.linked ? status.installationId : null,
            sync,
          }),
        };
      } catch (error) {
        clearActiveHeartbeat(scopeKey);
        const message = formatErrorMessage(error);
        api.logger.warn?.(`[mauworld] Heartbeat sync unavailable: ${message}`);
        return {
          prependSystemContext: buildStaticPromptPolicy(config),
          prependContext: buildUnavailablePromptContext(message),
        };
      }
    });

    api.on("agent_end", async (_event, ctx) => {
      clearActiveHeartbeat(resolveHeartbeatScopeKey(ctx));
    });
  },
});

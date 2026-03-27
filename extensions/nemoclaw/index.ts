import { definePluginEntry, type MaumauPluginApi } from "maumau/plugin-sdk/plugin-entry";
import {
  nemoclawPluginConfigSchema,
  resolveNemoClawPluginConfig,
  type ResolvedNemoClawPluginConfig,
} from "./src/config.js";

type GuardKind = "prompt" | "tool" | "output";

type GuardResponse = {
  allow?: boolean;
  block?: boolean;
  reason?: string;
  content?: string;
  params?: Record<string, unknown>;
  prependContext?: string;
  prependSystemContext?: string;
  appendSystemContext?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeGuardResponse(value: unknown): GuardResponse {
  return isRecord(value) ? (value as GuardResponse) : {};
}

function buildFailClosedPrompt(reason: string): GuardResponse {
  return {
    block: true,
    reason,
    prependContext:
      "The latest request could not be cleared by Maumau Guardrails. Refuse briefly and do not provide unsafe guidance.",
  };
}

async function callGuardrail(
  api: MaumauPluginApi,
  config: ResolvedNemoClawPluginConfig,
  kind: GuardKind,
  path: string,
  payload: Record<string, unknown>,
): Promise<GuardResponse | null> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.authToken) {
    headers.Authorization = `Bearer ${config.authToken}`;
  }

  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        kind,
        payload,
      }),
      signal: AbortSignal.timeout(config.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return normalizeGuardResponse(await response.json());
  } catch (error) {
    const message = `nemoclaw: ${kind} guard failed (${String(error)})`;
    if (!config.failClosed) {
      api.logger.warn?.(`${message}; allowing request`);
      return null;
    }
    api.logger.warn?.(`${message}; failing closed`);
    return buildFailClosedPrompt(message);
  }
}

function toPromptBlockResult(result: GuardResponse): GuardResponse | undefined {
  if (result.block === true || result.allow === false) {
    const reason = result.reason?.trim();
    return {
      prependContext:
        result.content?.trim() ||
        `The latest request was blocked by Maumau Guardrails.${reason ? ` Reason: ${reason}.` : ""} Refuse briefly and do not provide unsafe instructions.`,
    };
  }

  const promptResult: GuardResponse = {};
  if (result.prependContext?.trim()) {
    promptResult.prependContext = result.prependContext.trim();
  }
  if (result.prependSystemContext?.trim()) {
    promptResult.prependSystemContext = result.prependSystemContext.trim();
  }
  if (result.appendSystemContext?.trim()) {
    promptResult.appendSystemContext = result.appendSystemContext.trim();
  }
  return Object.keys(promptResult).length > 0 ? promptResult : undefined;
}

export default definePluginEntry({
  id: "nemoclaw",
  name: "Maumau Guardrails",
  description: "NeMo Guardrails bridge for Maumau prompt, tool, and output policy checks",
  configSchema: nemoclawPluginConfigSchema,
  register(api: MaumauPluginApi) {
    const config = resolveNemoClawPluginConfig(api.pluginConfig);

    if (config.promptGuards) {
      api.on("before_prompt_build", async (event, ctx) => {
        const result = await callGuardrail(api, config, "prompt", config.promptPath, {
          prompt: event.prompt,
          messages: event.messages,
          context: {
            agentId: ctx.agentId,
            sessionKey: ctx.sessionKey,
            sessionId: ctx.sessionId,
            channelId: ctx.channelId,
            trigger: ctx.trigger,
          },
        });
        return result ? toPromptBlockResult(result) : undefined;
      });
    }

    if (config.toolGuards) {
      api.on("before_tool_call", async (event, ctx) => {
        const result = await callGuardrail(api, config, "tool", config.toolPath, {
          toolName: event.toolName,
          params: event.params,
          context: {
            agentId: ctx.agentId,
            sessionKey: ctx.sessionKey,
            sessionId: ctx.sessionId,
            runId: event.runId ?? ctx.runId,
            toolCallId: event.toolCallId ?? ctx.toolCallId,
          },
        });
        if (!result) {
          return;
        }
        if (result.block === true || result.allow === false) {
          return {
            block: true,
            blockReason: result.reason?.trim() || "blocked by nemoclaw",
          };
        }
        if (isRecord(result.params)) {
          return { params: result.params };
        }
      });
    }

    if (config.outputGuards) {
      api.on("message_sending", async (event, ctx) => {
        const result = await callGuardrail(api, config, "output", config.outputPath, {
          to: event.to,
          content: event.content,
          metadata: event.metadata,
          context: {
            channelId: ctx.channelId,
            accountId: ctx.accountId,
            conversationId: ctx.conversationId,
          },
        });
        if (!result) {
          return;
        }
        if (result.block === true || result.allow === false) {
          const content = result.content?.trim();
          return content ? { content } : { cancel: true };
        }
        const content = result.content?.trim();
        if (content) {
          return { content };
        }
      });
    }
  },
});

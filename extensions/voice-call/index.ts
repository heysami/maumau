import { Type } from "@sinclair/typebox";
import {
  definePluginEntry,
  type GatewayRequestHandlerOptions,
  type MaumauPluginApi,
} from "./api.js";
import { registerVoiceCallCli } from "./src/cli.js";
import { createVoiceCallBackend, type VoiceCallBackend } from "./src/backend.js";
import {
  VoiceCallConfigSchema,
  normalizeVoiceCallConfig,
  type VoiceCallConfigInput,
  type VoiceCallStreamingConfig,
  resolveVoiceCallConfig,
  validateProviderConfig,
  type VoiceCallConfig,
} from "./src/config.js";
import type { CoreConfig } from "./src/core-bridge.js";

const SHARED_VOICE_CALL_RUNTIME_STATE = Symbol.for("maumau.voiceCall.sharedRuntimeState");

type SharedVoiceCallRuntimeEntry = {
  runtime: VoiceCallBackend | null;
  runtimePromise: Promise<VoiceCallBackend> | null;
};

type SharedVoiceCallRuntimeState = {
  entries: Map<string, SharedVoiceCallRuntimeEntry>;
};

function getSharedVoiceCallRuntimeState(): SharedVoiceCallRuntimeState {
  const globalState = globalThis as typeof globalThis & {
    [SHARED_VOICE_CALL_RUNTIME_STATE]?: SharedVoiceCallRuntimeState;
  };
  if (!globalState[SHARED_VOICE_CALL_RUNTIME_STATE]) {
    globalState[SHARED_VOICE_CALL_RUNTIME_STATE] = {
      entries: new Map<string, SharedVoiceCallRuntimeEntry>(),
    };
  }
  return globalState[SHARED_VOICE_CALL_RUNTIME_STATE];
}

function getSharedVoiceCallRuntimeEntry(key: string): SharedVoiceCallRuntimeEntry {
  const state = getSharedVoiceCallRuntimeState();
  const existing = state.entries.get(key);
  if (existing) {
    return existing;
  }
  const created: SharedVoiceCallRuntimeEntry = {
    runtime: null,
    runtimePromise: null,
  };
  state.entries.set(key, created);
  return created;
}

function clearSharedVoiceCallRuntimeEntry(key: string): void {
  getSharedVoiceCallRuntimeState().entries.delete(key);
}

function createSharedVoiceCallRuntimeKey(config: VoiceCallConfig): string {
  return JSON.stringify(config);
}

const voiceCallConfigSchema = {
  parse(value: unknown): VoiceCallConfig {
    const raw =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};

    const twilio = raw.twilio as Record<string, unknown> | undefined;
    const legacyFrom = typeof twilio?.from === "string" ? twilio.from : undefined;

    const enabled = typeof raw.enabled === "boolean" ? raw.enabled : true;
    const providerRaw = raw.provider === "log" ? "mock" : raw.provider;
    const provider = providerRaw ?? (enabled ? "mock" : undefined);
    const modeRaw =
      typeof raw.mode === "string" && raw.mode.trim()
        ? raw.mode.trim().toLowerCase()
        : undefined;
    const mode = modeRaw === "vapi" ? "vapi" : "self-hosted";
    const streamingRaw =
      raw.streaming && typeof raw.streaming === "object" && !Array.isArray(raw.streaming)
        ? (raw.streaming as Record<string, unknown>)
        : undefined;
    const streamingOpenAI =
      streamingRaw?.openai &&
      typeof streamingRaw.openai === "object" &&
      !Array.isArray(streamingRaw.openai)
        ? (streamingRaw.openai as Record<string, unknown>)
        : undefined;
    const streamingDeepgram =
      streamingRaw?.deepgram &&
      typeof streamingRaw.deepgram === "object" &&
      !Array.isArray(streamingRaw.deepgram)
        ? (streamingRaw.deepgram as Record<string, unknown>)
        : undefined;

    return normalizeVoiceCallConfig(
      VoiceCallConfigSchema.parse({
        ...raw,
        enabled,
        mode,
        provider,
        fromNumber: raw.fromNumber ?? legacyFrom,
        streaming: streamingRaw
          ? ({
              ...streamingRaw,
              openai: {
                ...streamingOpenAI,
                apiKey:
                  (typeof streamingRaw.openaiApiKey === "string"
                    ? streamingRaw.openaiApiKey
                    : undefined) ??
                  (typeof streamingOpenAI?.apiKey === "string"
                    ? streamingOpenAI.apiKey
                    : undefined),
                model:
                  (typeof streamingRaw.sttModel === "string" ? streamingRaw.sttModel : undefined) ??
                  (typeof streamingOpenAI?.model === "string" ? streamingOpenAI.model : undefined),
                silenceDurationMs:
                  typeof streamingRaw.silenceDurationMs === "number"
                    ? streamingRaw.silenceDurationMs
                    : typeof streamingOpenAI?.silenceDurationMs === "number"
                      ? streamingOpenAI.silenceDurationMs
                      : undefined,
                vadThreshold:
                  typeof streamingRaw.vadThreshold === "number"
                    ? streamingRaw.vadThreshold
                    : typeof streamingOpenAI?.vadThreshold === "number"
                      ? streamingOpenAI.vadThreshold
                      : undefined,
              },
              deepgram: streamingDeepgram,
            } satisfies VoiceCallConfigInput["streaming"])
          : undefined,
      }),
    );
  },
  uiHints: {
    mode: {
      label: "Voice Mode",
      help: "Use vapi for the simple guided setup or self-hosted for direct provider webhooks.",
    },
    "vapi.apiKey": {
      label: "Vapi API Key",
      sensitive: true,
    },
    "vapi.assistantId": { label: "Vapi Assistant ID" },
    "vapi.phoneNumberId": { label: "Vapi Phone Number ID" },
    "vapi.telephonyProvider": {
      label: "Vapi Telephony Provider",
      help: 'Use "twilio" for imported international numbers.',
    },
    "vapi.preferredLanguage": { label: "Preferred Language" },
    "vapi.bridgeMode": {
      label: "Vapi Bridge Mode",
      help: 'Use "auto" for the managed Tailscale Funnel bridge or "manual-public-url" to keep a fixed public callback URL.',
    },
    "vapi.bridgeUrl": { label: "Maumau Bridge URL", advanced: true },
    "vapi.bridgePath": { label: "Maumau Bridge Path", advanced: true },
    "vapi.bridgeAuthToken": {
      label: "Maumau Bridge Auth Token",
      sensitive: true,
      advanced: true,
    },
    "vapi.baseUrl": { label: "Vapi API Base URL", advanced: true },
    provider: {
      label: "Provider",
      help: "Use twilio, telnyx, or mock for dev/no-network.",
    },
    fromNumber: { label: "From Number", placeholder: "+15550001234" },
    toNumber: { label: "Default To Number", placeholder: "+15550001234" },
    inboundPolicy: { label: "Inbound Policy" },
    allowFrom: { label: "Inbound Allowlist" },
    inboundGreeting: { label: "Inbound Greeting", advanced: true },
    "telnyx.apiKey": { label: "Telnyx API Key", sensitive: true },
    "telnyx.connectionId": { label: "Telnyx Connection ID" },
    "telnyx.publicKey": { label: "Telnyx Public Key", sensitive: true },
    "twilio.accountSid": { label: "Twilio Account SID" },
    "twilio.authToken": { label: "Twilio Auth Token", sensitive: true },
    "outbound.defaultMode": { label: "Default Call Mode" },
    "outbound.notifyHangupDelaySec": {
      label: "Notify Hangup Delay (sec)",
      advanced: true,
    },
    "serve.port": { label: "Webhook Port" },
    "serve.bind": { label: "Webhook Bind" },
    "serve.path": { label: "Webhook Path" },
    "tailscale.mode": { label: "Tailscale Mode", advanced: true },
    "tailscale.path": { label: "Tailscale Path", advanced: true },
    "tunnel.provider": { label: "Tunnel Provider", advanced: true },
    "tunnel.ngrokAuthToken": {
      label: "ngrok Auth Token",
      sensitive: true,
      advanced: true,
    },
    "tunnel.ngrokDomain": { label: "ngrok Domain", advanced: true },
    "tunnel.allowNgrokFreeTierLoopbackBypass": {
      label: "Allow ngrok Free Tier (Loopback Bypass)",
      advanced: true,
    },
    "streaming.enabled": { label: "Enable Streaming", advanced: true },
    "streaming.sttProvider": { label: "Realtime STT Provider", advanced: true },
    "streaming.languageCode": { label: "Realtime Language Code", advanced: true },
    "streaming.openai.apiKey": {
      label: "OpenAI Realtime API Key",
      sensitive: true,
      advanced: true,
    },
    "streaming.openai.model": { label: "OpenAI Realtime Model", advanced: true },
    "streaming.deepgram.apiKey": {
      label: "Deepgram Realtime API Key",
      sensitive: true,
      advanced: true,
    },
    "streaming.deepgram.model": { label: "Deepgram Realtime Model", advanced: true },
    "streaming.streamPath": { label: "Media Stream Path", advanced: true },
    "tts.provider": {
      label: "TTS Provider Override",
      help: "Deep-merges with messages.tts (Microsoft is ignored for calls).",
      advanced: true,
    },
    "tts.openai.model": { label: "OpenAI TTS Model", advanced: true },
    "tts.openai.voice": { label: "OpenAI TTS Voice", advanced: true },
    "tts.openai.apiKey": {
      label: "OpenAI API Key",
      sensitive: true,
      advanced: true,
    },
    "tts.elevenlabs.modelId": { label: "ElevenLabs Model ID", advanced: true },
    "tts.elevenlabs.voiceId": { label: "ElevenLabs Voice ID", advanced: true },
    "tts.elevenlabs.apiKey": {
      label: "ElevenLabs API Key",
      sensitive: true,
      advanced: true,
    },
    "tts.elevenlabs.baseUrl": { label: "ElevenLabs Base URL", advanced: true },
    publicUrl: { label: "Public Webhook URL", advanced: true },
    skipSignatureVerification: {
      label: "Skip Signature Verification",
      advanced: true,
    },
    store: { label: "Call Log Store Path", advanced: true },
    responseModel: { label: "Response Model", advanced: true },
    responseSystemPrompt: { label: "Response System Prompt", advanced: true },
    responseTimeoutMs: { label: "Response Timeout (ms)", advanced: true },
  },
};

const VoiceCallToolSchema = Type.Union([
  Type.Object({
    action: Type.Literal("initiate_call"),
    to: Type.Optional(Type.String({ description: "Call target" })),
    message: Type.String({ description: "Intro message" }),
    mode: Type.Optional(Type.Union([Type.Literal("notify"), Type.Literal("conversation")])),
  }),
  Type.Object({
    action: Type.Literal("continue_call"),
    callId: Type.String({ description: "Call ID" }),
    message: Type.String({ description: "Follow-up message" }),
  }),
  Type.Object({
    action: Type.Literal("speak_to_user"),
    callId: Type.String({ description: "Call ID" }),
    message: Type.String({ description: "Message to speak" }),
  }),
  Type.Object({
    action: Type.Literal("end_call"),
    callId: Type.String({ description: "Call ID" }),
  }),
  Type.Object({
    action: Type.Literal("get_status"),
    callId: Type.String({ description: "Call ID" }),
  }),
  Type.Object({
    mode: Type.Optional(Type.Union([Type.Literal("call"), Type.Literal("status")])),
    to: Type.Optional(Type.String({ description: "Call target" })),
    sid: Type.Optional(Type.String({ description: "Call SID" })),
    message: Type.Optional(Type.String({ description: "Optional intro message" })),
  }),
]);

export default definePluginEntry({
  id: "voice-call",
  name: "Voice Call",
  description: "Voice-call plugin with simple Vapi and advanced self-hosted providers",
  configSchema: voiceCallConfigSchema,
  register(api: MaumauPluginApi) {
    const config = resolveVoiceCallConfig(voiceCallConfigSchema.parse(api.pluginConfig));
    const validation = validateProviderConfig(config);
    const sharedRuntimeKey = createSharedVoiceCallRuntimeKey(config);

    if (api.pluginConfig && typeof api.pluginConfig === "object") {
      const raw = api.pluginConfig as Record<string, unknown>;
      const twilio = raw.twilio as Record<string, unknown> | undefined;
      if (raw.provider === "log") {
        api.logger.warn('[voice-call] provider "log" is deprecated; use "mock" instead');
      }
      if (typeof twilio?.from === "string") {
        api.logger.warn("[voice-call] twilio.from is deprecated; use fromNumber instead");
      }
    }

    let runtimePromise: Promise<VoiceCallBackend> | null = null;
    let runtime: VoiceCallBackend | null = null;

    const ensureRuntime = async () => {
      if (!config.enabled) {
        throw new Error("Voice call disabled in plugin config");
      }
      if (!validation.valid) {
        throw new Error(validation.errors.join("; "));
      }
      const sharedRuntime = getSharedVoiceCallRuntimeEntry(sharedRuntimeKey);
      if (sharedRuntime.runtime) {
        runtime = sharedRuntime.runtime;
        runtimePromise ??= sharedRuntime.runtimePromise ?? Promise.resolve(sharedRuntime.runtime);
        return sharedRuntime.runtime;
      }
      if (sharedRuntime.runtimePromise) {
        runtimePromise = sharedRuntime.runtimePromise;
        runtime = await sharedRuntime.runtimePromise;
        return runtime;
      }
      const nextRuntimePromise = createVoiceCallBackend({
        config,
        coreConfig: api.config as CoreConfig,
        agentRuntime: api.runtime.agent,
        ttsRuntime: api.runtime.tts,
        logger: api.logger,
      });
      runtimePromise = nextRuntimePromise;
      sharedRuntime.runtimePromise = nextRuntimePromise;
      try {
        runtime = await nextRuntimePromise;
        sharedRuntime.runtime = runtime;
      } catch (err) {
        // Reset so the next call can retry instead of caching the
        // rejected promise forever (which also leaves the port orphaned
        // if the server started before the failure).  See: #32387
        if (sharedRuntime.runtimePromise === nextRuntimePromise) {
          sharedRuntime.runtimePromise = null;
        }
        runtimePromise = null;
        throw err;
      }
      return runtime;
    };

    const stopSharedRuntime = async () => {
      const sharedRuntime = getSharedVoiceCallRuntimeEntry(sharedRuntimeKey);
      const runtimeToStop =
        runtime ??
        sharedRuntime.runtime ??
        (runtimePromise
          ? await runtimePromise.catch(() => null)
          : sharedRuntime.runtimePromise
            ? await sharedRuntime.runtimePromise.catch(() => null)
            : null);
      try {
        if (runtimeToStop) {
          await runtimeToStop.stop();
        }
      } finally {
        runtimePromise = null;
        runtime = null;
        sharedRuntime.runtime = null;
        sharedRuntime.runtimePromise = null;
        clearSharedVoiceCallRuntimeEntry(sharedRuntimeKey);
      }
    };

    const sendError = (respond: (ok: boolean, payload?: unknown) => void, err: unknown) => {
      respond(false, { error: err instanceof Error ? err.message : String(err) });
    };

    const resolveCallMessageRequest = async (params: GatewayRequestHandlerOptions["params"]) => {
      const callId = typeof params?.callId === "string" ? params.callId.trim() : "";
      const message = typeof params?.message === "string" ? params.message.trim() : "";
      if (!callId || !message) {
        return { error: "callId and message required" } as const;
      }
      const rt = await ensureRuntime();
      return { rt, callId, message } as const;
    };
    const initiateCallAndRespond = async (params: {
      rt: VoiceCallBackend;
      respond: GatewayRequestHandlerOptions["respond"];
      to: string;
      message?: string;
      mode?: "notify" | "conversation";
    }) => {
      const result = await params.rt.actions.initiateCall(params.to, undefined, {
        message: params.message,
        mode: params.mode,
      });
      if (!result.success) {
        params.respond(false, { error: result.error || "initiate failed" });
        return;
      }
      params.respond(true, { callId: result.callId, initiated: true });
    };

    const respondToCallMessageAction = async (params: {
      requestParams: GatewayRequestHandlerOptions["params"];
      respond: GatewayRequestHandlerOptions["respond"];
      action: (
            request: Exclude<Awaited<ReturnType<typeof resolveCallMessageRequest>>, { error: string }>,
          ) => Promise<{
            success: boolean;
            error?: string;
            transcript?: string;
          }>;
      failure: string;
      includeTranscript?: boolean;
    }) => {
      const request = await resolveCallMessageRequest(params.requestParams);
      if ("error" in request) {
        params.respond(false, { error: request.error });
        return;
      }
      const result = await params.action(request);
      if (!result.success) {
        params.respond(false, { error: result.error || params.failure });
        return;
      }
      params.respond(
        true,
        params.includeTranscript
          ? { success: true, transcript: result.transcript }
          : { success: true },
      );
    };

    api.registerGatewayMethod(
      "voicecall.initiate",
      async ({ params, respond }: GatewayRequestHandlerOptions) => {
        try {
          const message = typeof params?.message === "string" ? params.message.trim() : "";
          if (!message) {
            respond(false, { error: "message required" });
            return;
          }
          const rt = await ensureRuntime();
          const to =
            typeof params?.to === "string" && params.to.trim()
              ? params.to.trim()
              : rt.config.toNumber;
          if (!to) {
            respond(false, { error: "to required" });
            return;
          }
          const mode =
            params?.mode === "notify" || params?.mode === "conversation" ? params.mode : undefined;
          await initiateCallAndRespond({
            rt,
            respond,
            to,
            message,
            mode,
          });
        } catch (err) {
          sendError(respond, err);
        }
      },
    );

    api.registerGatewayMethod(
      "voicecall.continue",
      async ({ params, respond }: GatewayRequestHandlerOptions) => {
        try {
          await respondToCallMessageAction({
            requestParams: params,
            respond,
            action: (request) => request.rt.actions.continueCall(request.callId, request.message),
            failure: "continue failed",
            includeTranscript: true,
          });
        } catch (err) {
          sendError(respond, err);
        }
      },
    );

    api.registerGatewayMethod(
      "voicecall.speak",
      async ({ params, respond }: GatewayRequestHandlerOptions) => {
        try {
          await respondToCallMessageAction({
            requestParams: params,
            respond,
            action: (request) => request.rt.actions.speak(request.callId, request.message),
            failure: "speak failed",
          });
        } catch (err) {
          sendError(respond, err);
        }
      },
    );

    api.registerGatewayMethod(
      "voicecall.end",
      async ({ params, respond }: GatewayRequestHandlerOptions) => {
        try {
          const callId = typeof params?.callId === "string" ? params.callId.trim() : "";
          if (!callId) {
            respond(false, { error: "callId required" });
            return;
          }
          const rt = await ensureRuntime();
          const result = await rt.actions.endCall(callId);
          if (!result.success) {
            respond(false, { error: result.error || "end failed" });
            return;
          }
          respond(true, { success: true });
        } catch (err) {
          sendError(respond, err);
        }
      },
    );

    api.registerGatewayMethod(
      "voicecall.status",
      async ({ params, respond }: GatewayRequestHandlerOptions) => {
        try {
          const raw =
            typeof params?.callId === "string"
              ? params.callId.trim()
              : typeof params?.sid === "string"
                ? params.sid.trim()
                : "";
          if (!raw) {
            respond(false, { error: "callId required" });
            return;
          }
          const rt = await ensureRuntime();
          const call =
            (await rt.actions.getCall(raw)) || (await rt.actions.getCallByProviderCallId(raw));
          if (!call) {
            respond(true, { found: false });
            return;
          }
          respond(true, { found: true, call });
        } catch (err) {
          sendError(respond, err);
        }
      },
    );

    api.registerGatewayMethod(
      "voicecall.start",
      async ({ params, respond }: GatewayRequestHandlerOptions) => {
        try {
          const to = typeof params?.to === "string" ? params.to.trim() : "";
          const message = typeof params?.message === "string" ? params.message.trim() : "";
          if (!to) {
            respond(false, { error: "to required" });
            return;
          }
          const rt = await ensureRuntime();
          await initiateCallAndRespond({
            rt,
            respond,
            to,
            message: message || undefined,
          });
        } catch (err) {
          sendError(respond, err);
        }
      },
    );

    api.registerTool({
      name: "voice_call",
      label: "Voice Call",
      description: "Make phone calls and have voice conversations via the voice-call plugin.",
      parameters: VoiceCallToolSchema,
      async execute(_toolCallId, params) {
        const json = (payload: unknown) => ({
          content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
          details: payload,
        });

        try {
          const rt = await ensureRuntime();

          if (typeof params?.action === "string") {
            switch (params.action) {
              case "initiate_call": {
                const message = String(params.message || "").trim();
                if (!message) {
                  throw new Error("message required");
                }
                const to =
                  typeof params.to === "string" && params.to.trim()
                    ? params.to.trim()
                    : rt.config.toNumber;
                if (!to) {
                  throw new Error("to required");
                }
                const result = await rt.actions.initiateCall(to, undefined, {
                  message,
                  mode:
                    params.mode === "notify" || params.mode === "conversation"
                      ? params.mode
                      : undefined,
                });
                if (!result.success) {
                  throw new Error(result.error || "initiate failed");
                }
                return json({ callId: result.callId, initiated: true });
              }
              case "continue_call": {
                const callId = String(params.callId || "").trim();
                const message = String(params.message || "").trim();
                if (!callId || !message) {
                  throw new Error("callId and message required");
                }
                const result = await rt.actions.continueCall(callId, message);
                if (!result.success) {
                  throw new Error(result.error || "continue failed");
                }
                return json({ success: true, transcript: result.transcript });
              }
              case "speak_to_user": {
                const callId = String(params.callId || "").trim();
                const message = String(params.message || "").trim();
                if (!callId || !message) {
                  throw new Error("callId and message required");
                }
                const result = await rt.actions.speak(callId, message);
                if (!result.success) {
                  throw new Error(result.error || "speak failed");
                }
                return json({ success: true });
              }
              case "end_call": {
                const callId = String(params.callId || "").trim();
                if (!callId) {
                  throw new Error("callId required");
                }
                const result = await rt.actions.endCall(callId);
                if (!result.success) {
                  throw new Error(result.error || "end failed");
                }
                return json({ success: true });
              }
              case "get_status": {
                const callId = String(params.callId || "").trim();
                if (!callId) {
                  throw new Error("callId required");
                }
                const call =
                  (await rt.actions.getCall(callId)) ||
                  (await rt.actions.getCallByProviderCallId(callId));
                return json(call ? { found: true, call } : { found: false });
              }
            }
          }

          const mode = params?.mode ?? "call";
          if (mode === "status") {
            const sid = typeof params.sid === "string" ? params.sid.trim() : "";
            if (!sid) {
              throw new Error("sid required for status");
            }
            const call =
              (await rt.actions.getCall(sid)) || (await rt.actions.getCallByProviderCallId(sid));
            return json(call ? { found: true, call } : { found: false });
          }

          const to =
            typeof params.to === "string" && params.to.trim()
              ? params.to.trim()
              : rt.config.toNumber;
          if (!to) {
            throw new Error("to required for call");
          }
          const result = await rt.actions.initiateCall(to, undefined, {
            message:
              typeof params.message === "string" && params.message.trim()
                ? params.message.trim()
                : undefined,
          });
          if (!result.success) {
            throw new Error(result.error || "initiate failed");
          }
          return json({ callId: result.callId, initiated: true });
        } catch (err) {
          return json({
            error: err instanceof Error ? err.message : String(err),
          });
        }
      },
    });

    api.registerCli(
      ({ program }) =>
        registerVoiceCallCli({
          program,
          config,
          ensureRuntime,
          logger: api.logger,
        }),
      { commands: ["voicecall"] },
    );

    if (config.mode === "vapi" && config.vapi.bridgePath) {
      api.registerHttpRoute({
        path: config.vapi.bridgePath,
        auth: "plugin",
        match: "exact",
        handler: async (req, res) => {
          try {
            const rt = await ensureRuntime();
            const handler = rt.httpHandlers.find((entry) => entry.path === config.vapi.bridgePath);
            if (!handler) {
              return false;
            }
            return await handler.handler({ req, res, logger: api.logger });
          } catch (err) {
            api.logger.warn?.(`[voice-call] Vapi bridge failed: ${String(err)}`);
            if (!res.headersSent) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "text/plain; charset=utf-8");
              res.end("Internal Server Error");
            }
            return true;
          }
        },
      });
    }

    api.registerService({
      id: "voicecall",
      start: async () => {
        if (!config.enabled) {
          return;
        }
        try {
          await ensureRuntime();
        } catch (err) {
          api.logger.error(
            `[voice-call] Failed to start backend: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      },
      stop: async () => {
        const sharedRuntime = getSharedVoiceCallRuntimeEntry(sharedRuntimeKey);
        if (
          !runtimePromise &&
          !runtime &&
          !sharedRuntime.runtime &&
          !sharedRuntime.runtimePromise
        ) {
          return;
        }
        await stopSharedRuntime();
      },
    });
  },
});

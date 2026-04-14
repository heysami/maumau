import type { IncomingMessage, ServerResponse } from "node:http";
import type { VoiceCallConfig } from "./config.js";
import type { CoreAgentDeps, CoreConfig } from "./core-bridge.js";
import { createVoiceCallRuntime, type VoiceCallRuntime } from "./runtime.js";
import type { TelephonyTtsRuntime } from "./telephony-tts.js";
import type { CallRecord, CallId, OutboundCallOptions } from "./types.js";
import { VapiBridgeManager } from "./vapi-bridge.js";
import { VapiCallController } from "./vapi-runtime.js";

type Logger = {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
  debug?: (message: string) => void;
};

export type VoiceCallHttpHandlerFactory = {
  handler: (params: {
    req: IncomingMessage;
    res: ServerResponse;
    logger?: Logger;
  }) => Promise<boolean>;
};

export type VoiceCallActions = {
  initiateCall: (
    to: string,
    sessionKey?: string,
    options?: OutboundCallOptions | string,
  ) => Promise<{ callId: CallId; success: boolean; error?: string }>;
  continueCall: (
    callId: CallId,
    message: string,
  ) => Promise<{ success: boolean; transcript?: string; error?: string }>;
  speak: (callId: CallId, message: string) => Promise<{ success: boolean; error?: string }>;
  endCall: (callId: CallId) => Promise<{ success: boolean; error?: string }>;
  getCall: (callId: CallId) => Promise<CallRecord | undefined>;
  getCallByProviderCallId: (providerCallId: string) => Promise<CallRecord | undefined>;
};

export type VoiceCallBackend = {
  kind: "self-hosted" | "vapi";
  config: VoiceCallConfig;
  actions: VoiceCallActions;
  httpHandlers: Array<{ path: string; handler: VoiceCallHttpHandlerFactory["handler"] }>;
  stop: () => Promise<void>;
};

function createUnsupportedActionError(action: "continue" | "speak"): {
  success: false;
  error: string;
} {
  return {
    success: false,
    error: `"${action}" is only available in Advanced self-hosted mode. Switch voice-call mode back to self-hosted to use it.`,
  };
}

function createSelfHostedBackend(runtime: VoiceCallRuntime): VoiceCallBackend {
  return {
    kind: "self-hosted",
    config: runtime.config,
    actions: {
      initiateCall: (to, sessionKey, options) =>
        runtime.manager.initiateCall(to, sessionKey, options),
      continueCall: (callId, message) => runtime.manager.continueCall(callId, message),
      speak: (callId, message) => runtime.manager.speak(callId, message),
      endCall: (callId) => runtime.manager.endCall(callId),
      getCall: async (callId) => runtime.manager.getCall(callId),
      getCallByProviderCallId: async (providerCallId) =>
        runtime.manager.getCallByProviderCallId(providerCallId),
    },
    httpHandlers: [],
    stop: runtime.stop,
  };
}

function createVapiBackend(params: {
  config: VoiceCallConfig;
  coreConfig: CoreConfig;
  agentRuntime: CoreAgentDeps;
  logger?: Logger;
}): VoiceCallBackend {
  const bridgeManager = new VapiBridgeManager({
    config: params.config,
    coreConfig: params.coreConfig,
    logger: params.logger,
  });
  const controller = new VapiCallController({
    config: params.config,
    coreConfig: params.coreConfig,
    agentRuntime: params.agentRuntime,
    bridgeManager,
    logger: params.logger,
  });
  return {
    kind: "vapi",
    config: params.config,
    actions: {
      initiateCall: (to, sessionKey, options) => controller.initiateCall(to, sessionKey, options),
      continueCall: async () => createUnsupportedActionError("continue"),
      speak: async () => createUnsupportedActionError("speak"),
      endCall: (callId) => controller.endCall(callId),
      getCall: (callId) => controller.getCall(callId),
      getCallByProviderCallId: (providerCallId) =>
        controller.getCallByProviderCallId(providerCallId),
    },
    httpHandlers: [
      {
        path: params.config.vapi.bridgePath,
        handler: controller.createBridgeHandler(),
      },
    ],
    stop: async () => {
      await controller.stop();
    },
  };
}

export async function createVoiceCallBackend(params: {
  config: VoiceCallConfig;
  coreConfig: CoreConfig;
  agentRuntime: CoreAgentDeps;
  ttsRuntime?: TelephonyTtsRuntime;
  logger?: Logger;
}): Promise<VoiceCallBackend> {
  if (params.config.mode === "vapi") {
    return createVapiBackend(params);
  }
  return createSelfHostedBackend(
    await createVoiceCallRuntime({
      config: params.config,
      coreConfig: params.coreConfig,
      agentRuntime: params.agentRuntime,
      ttsRuntime: params.ttsRuntime,
      logger: params.logger,
    }),
  );
}

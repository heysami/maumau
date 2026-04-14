import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import {
  isRequestBodyLimitError,
  readRequestBodyWithLimit,
  requestBodyErrorToText,
} from "../api.js";
import { type VoiceCallConfig } from "./config.js";
import type { CoreAgentDeps, CoreConfig } from "./core-bridge.js";
import { findCall, getCallByProviderCallId } from "./manager/lookup.js";
import { persistCallRecord, loadActiveCallsFromStore } from "./manager/store.js";
import { generateVoiceResponse } from "./response-generator.js";
import type { CallId, CallRecord, CallState, EndReason, OutboundCallOptions } from "./types.js";
import { TerminalStates } from "./types.js";
import { resolveUserPath } from "./utils.js";
import { VapiBridgeManager } from "./vapi-bridge.js";
import { VapiClient, type VapiAssistant, type VapiCall } from "./vapi-client.js";

type Logger = {
  info?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
  debug?: (message: string) => void;
};

type VapiToolCall = {
  id: string;
  name: string;
  parameters?: Record<string, unknown>;
};

type VapiToolBridgeHandler = (params: {
  req: IncomingMessage;
  res: ServerResponse;
  logger?: Logger;
}) => Promise<boolean>;

function resolveDefaultStoreBase(config: VoiceCallConfig): string {
  const rawOverride = config.store?.trim();
  if (rawOverride) {
    return resolveUserPath(rawOverride);
  }
  const preferred = path.join(os.homedir(), ".maumau", "voice-calls");
  const resolvedPreferred = resolveUserPath(preferred);
  return resolvedPreferred;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

const VAPI_ASSISTANT_READ_ONLY_KEYS = new Set([
  "id",
  "orgId",
  "createdAt",
  "updatedAt",
  "isServerUrlSecretSet",
  "isServerUrlSet",
]);

function sanitizeAssistantForCall<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeAssistantForCall(entry)) as T;
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const sanitized = Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !VAPI_ASSISTANT_READ_ONLY_KEYS.has(key))
      .map(([key, entryValue]) => [key, sanitizeAssistantForCall(entryValue)]),
  );
  return sanitized as T;
}

function buildLanguageInstruction(preferredLanguage: string): string {
  const normalized = preferredLanguage.trim().toLowerCase();
  if (normalized === "id") {
    return "Use Bahasa Indonesia for all spoken replies unless the caller clearly switches languages.";
  }
  return `Use ${preferredLanguage.trim()} for spoken replies unless the caller clearly switches languages.`;
}

function buildSystemInstruction(params: {
  preferredLanguage: string;
  mode?: "notify" | "conversation";
}): string {
  const instructions = [
    "For every caller request after the greeting, call the maumau_turn tool first.",
    "Pass the caller's latest request verbatim in userMessage.",
    "Use the tool result as the source of truth for what to say next.",
    buildLanguageInstruction(params.preferredLanguage),
  ];
  if (params.mode === "notify") {
    instructions.push(
      "This is a one-way notification. Deliver the opening message once, keep it brief, and end the call immediately after it is spoken.",
    );
  }
  return instructions.join(" ");
}

function mapVapiStatusToState(
  status: string | undefined,
  endedReason: string | undefined,
): CallState {
  const normalizedStatus = status?.trim().toLowerCase();
  switch (normalizedStatus) {
    case "queued":
    case "scheduled":
      return "initiated";
    case "ringing":
      return "ringing";
    case "forwarding":
    case "in-progress":
      return "active";
    case "ended": {
      const normalizedReason = endedReason?.trim().toLowerCase();
      switch (normalizedReason) {
        case "busy":
          return "busy";
        case "voicemail":
          return "voicemail";
        case "no-answer":
        case "timeout":
          return "no-answer";
        case "failed":
        case "error":
          return "failed";
        default:
          return "completed";
      }
    }
    default:
      return "initiated";
  }
}

function mapStateToEndReason(state: CallState): EndReason {
  switch (state) {
    case "busy":
    case "completed":
    case "error":
    case "failed":
    case "hangup-bot":
    case "hangup-user":
    case "no-answer":
    case "timeout":
    case "voicemail":
      return state;
    default:
      return "completed";
  }
}

function buildBridgeTool(params: { bridgeUrl: string; bridgeAuthToken: string }) {
  return {
    type: "function",
    function: {
      name: "maumau_turn",
      description:
        "Call this for every live caller turn to get the exact spoken reply from Maumau, including memory and tool-backed reasoning.",
      parameters: {
        type: "object",
        properties: {
          userMessage: {
            type: "string",
            description: "The caller's most recent spoken request, copied verbatim.",
          },
        },
        required: ["userMessage"],
      },
    },
    server: {
      url: params.bridgeUrl,
      secret: params.bridgeAuthToken,
    },
  };
}

function buildTransientAssistant(params: {
  assistant: VapiAssistant;
  bridgeUrl: string;
  bridgeAuthToken: string;
  preferredLanguage: string;
  openingMessage?: string;
  mode?: "notify" | "conversation";
}): Record<string, unknown> {
  // Vapi assistant fetch responses include read-only metadata fields that
  // `POST /call` rejects when we pass them back in a transient assistant.
  const baseAssistant = sanitizeAssistantForCall(params.assistant);
  const model = asObject(baseAssistant.model) ?? {};
  const existingMessages = Array.isArray(model.messages) ? model.messages : [];
  const existingTools = Array.isArray(model.tools) ? model.tools : [];
  const hasBridgeTool = existingTools.some((entry) => {
    const tool = asObject(entry);
    return asString(asObject(tool?.function)?.name) === "maumau_turn";
  });

  return {
    ...baseAssistant,
    firstMessage: params.openingMessage ?? baseAssistant.firstMessage,
    model: {
      ...model,
      messages: [
        ...existingMessages,
        {
          role: "system",
          content: buildSystemInstruction({
            preferredLanguage: params.preferredLanguage,
            mode: params.mode,
          }),
        },
      ],
      tools: [
        ...existingTools,
        ...(hasBridgeTool
          ? []
          : [
              buildBridgeTool({
                bridgeUrl: params.bridgeUrl,
                bridgeAuthToken: params.bridgeAuthToken,
              }),
            ]),
      ],
    },
    transcriber: {
      ...(asObject(baseAssistant.transcriber) ?? {}),
      language: params.preferredLanguage,
    },
  };
}

function extractToolCallParameters(
  toolCall: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const directParameters = asObject(toolCall.parameters);
  if (directParameters) {
    return directParameters;
  }
  const directArguments = asObject(toolCall.arguments);
  if (directArguments) {
    return directArguments;
  }
  const functionPayload = asObject(toolCall.function);
  return asObject(functionPayload?.parameters) ?? asObject(functionPayload?.arguments) ?? undefined;
}

function buildVapiToolCall(
  id: string,
  name: string,
  parameters?: Record<string, unknown>,
): VapiToolCall {
  return parameters ? { id, name, parameters } : { id, name };
}

function extractToolCalls(message: Record<string, unknown>): VapiToolCall[] {
  const directToolCalls = Array.isArray(message.toolCallList) ? message.toolCallList : [];
  const direct = directToolCalls
    .map((entry) => {
      const object = asObject(entry);
      const id = asString(object?.id);
      const name = asString(object?.name) ?? asString(asObject(object?.function)?.name);
      return id && name
        ? buildVapiToolCall(id, name, extractToolCallParameters(object ?? {}))
        : null;
    })
    .filter((value): value is VapiToolCall => Boolean(value));
  if (direct.length > 0) {
    return direct;
  }

  const wrappedToolCalls = Array.isArray(message.toolWithToolCallList)
    ? message.toolWithToolCallList
    : [];
  return wrappedToolCalls
    .map((entry) => {
      const object = asObject(entry);
      const toolCall = asObject(object?.toolCall) ?? asObject(asObject(object?.toolCall)?.function);
      const functionPayload = asObject(asObject(object?.toolCall)?.function);
      const id =
        asString(asObject(object?.toolCall)?.id) ??
        asString(toolCall?.id) ??
        asString(functionPayload?.id);
      const name =
        asString(object?.name) ??
        asString(asObject(object?.function)?.name) ??
        asString(functionPayload?.name);
      return id && name
        ? buildVapiToolCall(
            id,
            name,
            extractToolCallParameters(asObject(object?.toolCall) ?? {}) ??
              extractToolCallParameters(functionPayload ?? {}),
          )
        : null;
    })
    .filter((value): value is VapiToolCall => Boolean(value));
}

function buildTranscriptFromArtifact(
  message: Record<string, unknown>,
): Array<{ speaker: "user" | "bot"; text: string }> {
  const artifact = asObject(message.artifact);
  const messages = Array.isArray(artifact?.messages) ? artifact.messages : [];
  return messages
    .map((entry) => {
      const object = asObject(entry);
      const role = asString(object?.role)?.toLowerCase();
      const text =
        asString(object?.message) ?? asString(object?.content) ?? asString(object?.transcript);
      if (!text) {
        return null;
      }
      if (role === "assistant") {
        return { speaker: "bot" as const, text };
      }
      if (role === "user") {
        return { speaker: "user" as const, text };
      }
      return null;
    })
    .filter((value): value is { speaker: "user" | "bot"; text: string } => Boolean(value));
}

function buildVoiceConfigForBridge(config: VoiceCallConfig): VoiceCallConfig {
  const preferredLanguage = config.vapi.preferredLanguage.trim();
  const responseSystemPrompt = config.responseSystemPrompt?.trim();
  const languagePrompt = buildLanguageInstruction(preferredLanguage);
  return {
    ...config,
    responseSystemPrompt: responseSystemPrompt
      ? `${responseSystemPrompt}\n\n${languagePrompt}`
      : languagePrompt,
  };
}

function isGatewayDrainingVoiceError(error: string | undefined): boolean {
  if (!error) {
    return false;
  }
  const normalized = error.toLowerCase();
  return normalized.includes("gatewaydrainingerror") || normalized.includes("draining for restart");
}

export class VapiCallController {
  readonly config: VoiceCallConfig;
  private client: VapiClient;
  private coreConfig: CoreConfig;
  private agentRuntime: CoreAgentDeps;
  private bridgeManager: VapiBridgeManager;
  private logger?: Logger;
  private storePath: string;
  private activeCalls = new Map<CallId, CallRecord>();
  private providerCallIdMap = new Map<string, CallId>();

  constructor(params: {
    config: VoiceCallConfig;
    coreConfig: CoreConfig;
    agentRuntime: CoreAgentDeps;
    bridgeManager?: VapiBridgeManager;
    logger?: Logger;
  }) {
    this.config = params.config;
    this.coreConfig = params.coreConfig;
    this.agentRuntime = params.agentRuntime;
    this.bridgeManager =
      params.bridgeManager ??
      new VapiBridgeManager({
        config: params.config,
        coreConfig: params.coreConfig,
        logger: params.logger,
      });
    this.logger = params.logger;
    this.client = new VapiClient({
      apiKey: params.config.vapi.apiKey ?? "",
      baseUrl: params.config.vapi.baseUrl,
      logger: params.logger,
    });
    this.storePath = resolveDefaultStoreBase(params.config);
    fs.mkdirSync(this.storePath, { recursive: true });
    const persisted = loadActiveCallsFromStore(this.storePath);
    this.activeCalls = persisted.activeCalls;
    this.providerCallIdMap = persisted.providerCallIdMap;
  }

  private upsertCall(call: CallRecord): CallRecord {
    this.activeCalls.set(call.callId, call);
    if (call.providerCallId) {
      this.providerCallIdMap.set(call.providerCallId, call.callId);
    }
    persistCallRecord(this.storePath, call);
    return call;
  }

  private toCallRecord(params: {
    call: VapiCall;
    to: string;
    openingMessage?: string;
    existing?: CallRecord;
    sessionKey?: string;
  }): CallRecord {
    const existing = params.existing;
    const state = mapVapiStatusToState(params.call.status, params.call.endedReason);
    const now = Date.now();
    const transcript = [...(existing?.transcript ?? [])];
    if (params.openingMessage && transcript.length === 0) {
      transcript.push({
        timestamp: now,
        speaker: "bot",
        text: params.openingMessage,
        isFinal: true,
      });
    }
    const controlUrl = asString(asObject(params.call.monitor)?.controlUrl);
    const listenUrl = asString(asObject(params.call.monitor)?.listenUrl);
    return {
      callId: params.call.id,
      providerCallId: asString(params.call.phoneCallProviderId) ?? params.call.id,
      provider: "vapi",
      direction: "outbound",
      state,
      from: existing?.from ?? this.config.fromNumber ?? "",
      to: params.call.customer?.number ?? params.to,
      sessionKey: existing?.sessionKey ?? params.sessionKey,
      startedAt: existing?.startedAt ?? now,
      answeredAt:
        existing?.answeredAt ?? (state === "active" || TerminalStates.has(state) ? now : undefined),
      endedAt: TerminalStates.has(state) ? (existing?.endedAt ?? now) : undefined,
      endReason: TerminalStates.has(state) ? mapStateToEndReason(state) : existing?.endReason,
      transcript,
      processedEventIds: existing?.processedEventIds ?? [],
      metadata: {
        ...(existing?.metadata ?? {}),
        controlUrl,
        listenUrl,
        assistantId: params.call.assistantId ?? this.config.vapi.assistantId,
        phoneNumberId: params.call.phoneNumberId ?? this.config.vapi.phoneNumberId,
        preferredLanguage: this.config.vapi.preferredLanguage,
      },
    };
  }

  async initiateCall(
    to: string,
    sessionKey?: string,
    options?: OutboundCallOptions | string,
  ): Promise<{ callId: CallId; success: boolean; error?: string }> {
    const resolvedOptions =
      typeof options === "string" ? ({ message: options } satisfies OutboundCallOptions) : options;
    const baseAssistant = await this.client.getAssistant(this.config.vapi.assistantId ?? "");
    const bridgeUrl = await this.bridgeManager.resolveBridgeUrl();
    const transientAssistant = buildTransientAssistant({
      assistant: baseAssistant,
      bridgeUrl,
      bridgeAuthToken: this.config.vapi.bridgeAuthToken ?? "",
      preferredLanguage: this.config.vapi.preferredLanguage,
      openingMessage: resolvedOptions?.message,
      mode: resolvedOptions?.mode,
    });
    const call = await this.client.createCall({
      assistant: transientAssistant,
      phoneNumberId: this.config.vapi.phoneNumberId,
      customer: {
        number: to,
      },
    });
    const record = this.upsertCall(
      this.toCallRecord({
        call,
        to,
        openingMessage: resolvedOptions?.message,
        sessionKey,
      }),
    );
    return {
      callId: record.callId,
      success: true,
    };
  }

  async endCall(callId: string): Promise<{ success: boolean; error?: string }> {
    const record = await this.resolveCall(callId);
    if (!record) {
      return { success: false, error: `Unknown Vapi call: ${callId}` };
    }
    const controlUrl = asString(record.metadata?.controlUrl);
    if (!controlUrl) {
      return { success: false, error: `Vapi control URL missing for call: ${callId}` };
    }
    await this.client.controlCall(controlUrl, { type: "end-call" });
    const endedCall: CallRecord = {
      ...record,
      state: "hangup-bot",
      endedAt: Date.now(),
      endReason: "hangup-bot",
    };
    this.upsertCall(endedCall);
    return { success: true };
  }

  async getCall(callId: string): Promise<CallRecord | undefined> {
    return this.resolveCall(callId);
  }

  async getCallByProviderCallId(providerCallId: string): Promise<CallRecord | undefined> {
    const local = getCallByProviderCallId({
      activeCalls: this.activeCalls,
      providerCallIdMap: this.providerCallIdMap,
      providerCallId,
    });
    return local ? this.resolveCall(local.callId) : undefined;
  }

  async resolveCall(callIdOrProviderCallId: string): Promise<CallRecord | undefined> {
    const local = findCall({
      activeCalls: this.activeCalls,
      providerCallIdMap: this.providerCallIdMap,
      callIdOrProviderCallId,
    });
    const vapiCallId = local?.callId ?? callIdOrProviderCallId;
    try {
      const remote = await this.client.getCall(vapiCallId);
      return this.upsertCall(
        this.toCallRecord({
          call: remote,
          to: local?.to ?? remote.customer?.number ?? "",
          existing: local,
        }),
      );
    } catch (err) {
      if (local) {
        this.logger?.debug?.(
          `[voice-call] Returning cached Vapi call after lookup failure: ${String(err)}`,
        );
        return local;
      }
      return undefined;
    }
  }

  async stop(): Promise<void> {
    await this.bridgeManager.stop();
  }

  createBridgeHandler(): VapiToolBridgeHandler {
    return async ({ req, res, logger }) => {
      const expectedSecret = this.config.vapi.bridgeAuthToken?.trim();
      const receivedSecret =
        asString(req.headers["x-vapi-secret"]) ??
        (() => {
          const authorization = asString(req.headers.authorization);
          if (!authorization) {
            return undefined;
          }
          return authorization.replace(/^Bearer\s+/i, "").trim() || undefined;
        })();
      if (!expectedSecret || receivedSecret !== expectedSecret) {
        res.statusCode = 401;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("Unauthorized");
        return true;
      }

      let rawBody = "";
      try {
        rawBody = await readRequestBodyWithLimit(req, {
          maxBytes: 512 * 1024,
          timeoutMs: 10_000,
        });
      } catch (error) {
        const statusCode = isRequestBodyLimitError(error) ? error.statusCode : 400;
        const message = isRequestBodyLimitError(error)
          ? requestBodyErrorToText(error.code)
          : error instanceof Error
            ? error.message
            : "Invalid request body";
        res.statusCode = statusCode;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end(message);
        return true;
      }

      let payload: unknown;
      try {
        payload = JSON.parse(rawBody);
      } catch {
        res.statusCode = 400;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("Invalid JSON");
        return true;
      }

      const root = asObject(payload);
      const message = asObject(root?.message);
      const messageType = asString(message?.type);
      if (messageType !== "tool-calls") {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: true }));
        return true;
      }

      const toolCalls = extractToolCalls(message ?? {});
      const call = asObject(message?.call);
      const from =
        asString(asObject(call?.customer)?.number) ??
        asString(asObject(root?.customer)?.number) ??
        "";
      const transcript = buildTranscriptFromArtifact(message ?? {});
      const lastUserTranscript =
        [...transcript].reverse().find((entry) => entry.speaker === "user")?.text ?? "";
      const results: Array<{ name: string; toolCallId: string; result: string }> = [];
      for (const toolCall of toolCalls) {
        if (toolCall.name !== "maumau_turn") {
          continue;
        }
        const userMessage = asString(toolCall.parameters?.userMessage) ?? lastUserTranscript;
        const response = await generateVoiceResponse({
          voiceConfig: buildVoiceConfigForBridge(this.config),
          coreConfig: this.coreConfig,
          agentRuntime: this.agentRuntime,
          callId: asString(call?.id) ?? "vapi-call",
          from,
          transcript,
          userMessage,
        });
        if (isGatewayDrainingVoiceError(response.error)) {
          logger?.warn?.(
            "[voice-call] Vapi bridge hit a transient gateway restart window; returning 503 for retry",
          );
          res.statusCode = 503;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.setHeader("Retry-After", "2");
          res.end("Gateway restarting; retry this tool call shortly.");
          return true;
        }
        results.push({
          name: toolCall.name,
          toolCallId: toolCall.id,
          result: JSON.stringify({
            spoken: response.text ?? "",
            error: response.error,
          }),
        });
      }

      logger?.debug?.(`[voice-call] Vapi bridge handled ${results.length} tool call(s)`);
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ results }));
      return true;
    };
  }
}

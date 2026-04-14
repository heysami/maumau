import type { GatewayBrowserClient } from "../gateway.ts";
import type { ChatAttachment } from "../ui-types.ts";
import {
  abortChatRun,
  handleChatEvent,
  loadChatHistory,
  sendChatMessage,
  type ChatEventPayload,
  type ChatState,
} from "./chat.ts";
import { createMauOfficeSessionTarget, type MauOfficeState } from "./mau-office.ts";

export type MauOfficeChatHost = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  mauOfficeState: MauOfficeState;
  mauOfficeChatOpen: boolean;
  mauOfficeChatMinimized: boolean;
  mauOfficeChatActorId: string | null;
  mauOfficeChatActorLabel: string;
  mauOfficeChatSessionKey: string;
  mauOfficeChatLoading: boolean;
  mauOfficeChatSending: boolean;
  mauOfficeChatMessage: string;
  mauOfficeChatMessages: unknown[];
  mauOfficeChatThinkingLevel: string | null;
  mauOfficeChatAttachments: ChatAttachment[];
  mauOfficeChatRunId: string | null;
  mauOfficeChatStream: string | null;
  mauOfficeChatStreamStartedAt: number | null;
  mauOfficeChatError: string | null;
};

type SessionDefaults = {
  defaultAgentId?: string;
  mainKey?: string;
};

function createChatStateAdapter(host: MauOfficeChatHost): ChatState {
  return {
    get client() {
      return host.client;
    },
    set client(_value: GatewayBrowserClient | null) {},
    get connected() {
      return host.connected;
    },
    set connected(_value: boolean) {},
    get sessionKey() {
      return host.mauOfficeChatSessionKey;
    },
    set sessionKey(value: string) {
      host.mauOfficeChatSessionKey = value;
    },
    get chatLoading() {
      return host.mauOfficeChatLoading;
    },
    set chatLoading(value: boolean) {
      host.mauOfficeChatLoading = value;
    },
    get chatMessages() {
      return host.mauOfficeChatMessages;
    },
    set chatMessages(value: unknown[]) {
      host.mauOfficeChatMessages = value;
    },
    get chatThinkingLevel() {
      return host.mauOfficeChatThinkingLevel;
    },
    set chatThinkingLevel(value: string | null) {
      host.mauOfficeChatThinkingLevel = value;
    },
    get chatSending() {
      return host.mauOfficeChatSending;
    },
    set chatSending(value: boolean) {
      host.mauOfficeChatSending = value;
    },
    get chatMessage() {
      return host.mauOfficeChatMessage;
    },
    set chatMessage(value: string) {
      host.mauOfficeChatMessage = value;
    },
    get chatAttachments() {
      return host.mauOfficeChatAttachments;
    },
    set chatAttachments(value: ChatAttachment[]) {
      host.mauOfficeChatAttachments = value;
    },
    get chatRunId() {
      return host.mauOfficeChatRunId;
    },
    set chatRunId(value: string | null) {
      host.mauOfficeChatRunId = value;
    },
    get chatStream() {
      return host.mauOfficeChatStream;
    },
    set chatStream(value: string | null) {
      host.mauOfficeChatStream = value;
    },
    get chatStreamStartedAt() {
      return host.mauOfficeChatStreamStartedAt;
    },
    set chatStreamStartedAt(value: number | null) {
      host.mauOfficeChatStreamStartedAt = value;
    },
    get lastError() {
      return host.mauOfficeChatError;
    },
    set lastError(value: string | null) {
      host.mauOfficeChatError = value;
    },
  };
}

function resetMauOfficeChatSession(host: MauOfficeChatHost) {
  host.mauOfficeChatLoading = false;
  host.mauOfficeChatSending = false;
  host.mauOfficeChatMessage = "";
  host.mauOfficeChatMessages = [];
  host.mauOfficeChatThinkingLevel = null;
  host.mauOfficeChatAttachments = [];
  host.mauOfficeChatRunId = null;
  host.mauOfficeChatStream = null;
  host.mauOfficeChatStreamStartedAt = null;
  host.mauOfficeChatError = null;
}

export async function openMauOfficeChat(
  host: MauOfficeChatHost,
  actorId: string,
  defaults?: SessionDefaults,
): Promise<boolean> {
  const target = createMauOfficeSessionTarget(host.mauOfficeState, actorId, defaults);
  if (!target) {
    return false;
  }
  const actor = host.mauOfficeState.actors[actorId];
  const nextLabel = actor?.label?.trim() || target;
  const nextSessionKey = target.trim();
  const sessionChanged = host.mauOfficeChatSessionKey !== nextSessionKey;
  host.mauOfficeChatOpen = true;
  host.mauOfficeChatMinimized = false;
  host.mauOfficeChatActorId = actorId;
  host.mauOfficeChatActorLabel = nextLabel;
  host.mauOfficeChatSessionKey = nextSessionKey;
  if (sessionChanged) {
    resetMauOfficeChatSession(host);
  } else {
    host.mauOfficeChatError = null;
  }
  await loadChatHistory(createChatStateAdapter(host));
  return true;
}

export function closeMauOfficeChat(host: MauOfficeChatHost) {
  host.mauOfficeChatOpen = false;
  host.mauOfficeChatMinimized = false;
  host.mauOfficeChatActorId = null;
  host.mauOfficeChatMessage = "";
  host.mauOfficeChatAttachments = [];
  host.mauOfficeChatRunId = null;
  host.mauOfficeChatStream = null;
  host.mauOfficeChatStreamStartedAt = null;
  host.mauOfficeChatError = null;
}

export function toggleMauOfficeChatMinimized(host: MauOfficeChatHost) {
  if (!host.mauOfficeChatOpen) {
    return;
  }
  host.mauOfficeChatMinimized = !host.mauOfficeChatMinimized;
}

export async function sendMauOfficeChat(host: MauOfficeChatHost): Promise<boolean> {
  const message = host.mauOfficeChatMessage.trim();
  if (!message) {
    return false;
  }
  host.mauOfficeChatMessage = "";
  const runId = await sendChatMessage(createChatStateAdapter(host), message);
  if (!runId) {
    host.mauOfficeChatMessage = message;
    return false;
  }
  return true;
}

export async function abortMauOfficeChat(host: MauOfficeChatHost): Promise<boolean> {
  return abortChatRun(createChatStateAdapter(host));
}

export function applyMauOfficeChatEvent(
  host: MauOfficeChatHost,
  payload?: ChatEventPayload,
): ReturnType<typeof handleChatEvent> {
  if (!host.mauOfficeChatOpen || !host.mauOfficeChatSessionKey) {
    return null;
  }
  return handleChatEvent(createChatStateAdapter(host), payload);
}

export function setMauOfficeChatDraft(host: MauOfficeChatHost, next: string) {
  host.mauOfficeChatMessage = next;
}

export async function refreshMauOfficeChatForSessionMessage(
  host: MauOfficeChatHost,
  payload?: { sessionKey?: unknown },
) {
  if (!host.mauOfficeChatOpen || host.mauOfficeChatRunId) {
    return;
  }
  const sessionKey = typeof payload?.sessionKey === "string" ? payload.sessionKey.trim() : "";
  if (!sessionKey || sessionKey !== host.mauOfficeChatSessionKey) {
    return;
  }
  await loadChatHistory(createChatStateAdapter(host));
}

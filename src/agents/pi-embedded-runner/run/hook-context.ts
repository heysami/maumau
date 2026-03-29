import {
  buildTelegramTopicConversationId,
  parseTelegramChatIdFromTarget,
} from "../../../acp/conversation-id.js";
import { resolveConversationIdFromTargets } from "../../../infra/outbound/conversation-id.js";
import type { PluginHookAgentContext } from "../../../plugins/types.js";
import type { RunEmbeddedPiAgentParams } from "./params.js";

type EmbeddedHookContextInput = Pick<
  RunEmbeddedPiAgentParams,
  | "agentId"
  | "sessionKey"
  | "sessionId"
  | "workspaceDir"
  | "messageProvider"
  | "trigger"
  | "messageChannel"
  | "agentAccountId"
  | "senderId"
  | "senderName"
  | "senderUsername"
  | "messageTo"
  | "messageThreadId"
  | "isGroup"
>;

function resolveHookConversationId(params: EmbeddedHookContextInput): string | undefined {
  const channelId = (params.messageChannel ?? params.messageProvider ?? "").trim().toLowerCase();
  const threadId =
    params.messageThreadId != null ? String(params.messageThreadId).trim() : undefined;
  const messageTo = params.messageTo?.trim();

  if (channelId === "telegram" && threadId) {
    const chatId = parseTelegramChatIdFromTarget(messageTo);
    if (chatId) {
      return (
        buildTelegramTopicConversationId({
          chatId,
          topicId: threadId,
        }) ??
        resolveConversationIdFromTargets({
          threadId,
          targets: [messageTo],
        })
      );
    }
  }

  return resolveConversationIdFromTargets({
    threadId,
    targets: [messageTo],
  });
}

// Keep sender-aware plugin hook context assembly in one place so every hook
// phase sees the same inbound identity and conversation metadata.
export function buildEmbeddedHookContext(
  params: EmbeddedHookContextInput,
): PluginHookAgentContext {
  return {
    agentId: params.agentId,
    sessionKey: params.sessionKey,
    sessionId: params.sessionId,
    workspaceDir: params.workspaceDir,
    messageProvider: params.messageProvider ?? undefined,
    trigger: params.trigger,
    channelId: params.messageChannel ?? params.messageProvider ?? undefined,
    accountId: params.agentAccountId ?? undefined,
    requesterSenderId: params.senderId ?? undefined,
    requesterSenderName: params.senderName ?? undefined,
    requesterSenderUsername: params.senderUsername ?? undefined,
    conversationId: resolveHookConversationId(params),
    isGroup: params.isGroup,
  };
}

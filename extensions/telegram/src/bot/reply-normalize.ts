import { resolveSendableOutboundReplyParts } from "maumau/plugin-sdk/reply-payload";
import {
  HEARTBEAT_TOKEN,
  isSilentReplyText,
  SILENT_REPLY_TOKEN,
  stripHeartbeatToken,
  type ReplyPayload,
} from "maumau/plugin-sdk/reply-runtime";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripTrailingSilentToken(text: string, token: string = SILENT_REPLY_TOKEN): string {
  const escaped = escapeRegExp(token);
  return text.replace(new RegExp(`(?:^|\\s+|\\*+)${escaped}\\s*$`), "").trim();
}

export function normalizeTelegramReplyPayload(payload: ReplyPayload): ReplyPayload | null {
  const reply = resolveSendableOutboundReplyParts(payload);
  let text = reply.text;

  if (text) {
    if (isSilentReplyText(text, SILENT_REPLY_TOKEN)) {
      if (!reply.hasMedia) {
        return null;
      }
      text = "";
    }
  }

  if (text?.includes(HEARTBEAT_TOKEN)) {
    const stripped = stripHeartbeatToken(text, { mode: "message" });
    if (stripped.shouldSkip && !reply.hasMedia && !stripped.text.trim()) {
      return null;
    }
    text = stripped.text;
  }

  if (text) {
    if (isSilentReplyText(text, SILENT_REPLY_TOKEN)) {
      if (!reply.hasMedia) {
        return null;
      }
      text = "";
    } else if (text.includes(SILENT_REPLY_TOKEN)) {
      text = stripTrailingSilentToken(text, SILENT_REPLY_TOKEN);
      if (!text && !reply.hasMedia) {
        return null;
      }
    }
  }

  if (!text && reply.hasMedia) {
    text = "";
  }

  return { ...payload, text };
}

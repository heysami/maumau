import { resolveChannelGroupRequireMention } from "maumau/plugin-sdk/channel-policy";
import type { MaumauConfig } from "maumau/plugin-sdk/core";

type GoogleChatGroupContext = {
  cfg: MaumauConfig;
  accountId?: string | null;
  groupId?: string | null;
};

export function resolveGoogleChatGroupRequireMention(params: GoogleChatGroupContext): boolean {
  return resolveChannelGroupRequireMention({
    cfg: params.cfg,
    channel: "googlechat",
    groupId: params.groupId,
    accountId: params.accountId,
  });
}

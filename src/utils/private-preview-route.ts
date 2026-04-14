import { isRequesterRemoteMessagingChannel, normalizeMessageChannel } from "./message-channel.js";

type PrivatePreviewRouteContext = {
  senderIsOwner?: boolean;
  requesterTailscaleLogin?: string | null;
  messageChannel?: string | null;
  groupId?: string | null;
  groupChannel?: string | null;
  groupSpace?: string | null;
};

function isDirectRoute(params: PrivatePreviewRouteContext): boolean {
  return !params.groupId && !params.groupChannel && !params.groupSpace;
}

export function isTrustedOwnerDirectPreviewRoute(params: PrivatePreviewRouteContext): boolean {
  const channel = normalizeMessageChannel(params.messageChannel);
  if (!channel || !isRequesterRemoteMessagingChannel(channel)) {
    return false;
  }
  return params.senderIsOwner === true && isDirectRoute(params);
}

export function isRequesterTrustedForPrivatePreview(params: PrivatePreviewRouteContext): boolean {
  return (
    Boolean(params.requesterTailscaleLogin?.trim()) || isTrustedOwnerDirectPreviewRoute(params)
  );
}

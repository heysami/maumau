import { describe, expect, it } from "vitest";
import {
  isRequesterTrustedForPrivatePreview,
  isTrustedOwnerDirectPreviewRoute,
} from "./private-preview-route.js";

describe("private preview route trust", () => {
  it("trusts external owner direct chats for private preview delivery", () => {
    expect(
      isTrustedOwnerDirectPreviewRoute({
        senderIsOwner: true,
        messageChannel: "telegram",
      }),
    ).toBe(true);
  });

  it("does not trust group chats or non-owner routes", () => {
    expect(
      isTrustedOwnerDirectPreviewRoute({
        senderIsOwner: true,
        messageChannel: "telegram",
        groupId: "group-1",
      }),
    ).toBe(false);
    expect(
      isTrustedOwnerDirectPreviewRoute({
        senderIsOwner: false,
        messageChannel: "telegram",
      }),
    ).toBe(false);
  });

  it("treats explicit tailscale identity as sufficient even without owner chat trust", () => {
    expect(
      isRequesterTrustedForPrivatePreview({
        requesterTailscaleLogin: "sam@tailnet",
        messageChannel: "telegram",
      }),
    ).toBe(true);
  });
});

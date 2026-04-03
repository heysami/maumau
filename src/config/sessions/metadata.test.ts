import { describe, expect, it } from "vitest";
import type { MaumauConfig } from "../config.js";
import { deriveSessionMetaPatch } from "./metadata.js";

describe("deriveSessionMetaPatch", () => {
  it("captures requester trust from inbound context", () => {
    const patch = deriveSessionMetaPatch({
      cfg: {} as MaumauConfig,
      sessionKey: "agent:main:telegram:direct:12345",
      ctx: {
        Provider: "telegram",
        Surface: "telegram",
        ChatType: "direct",
        To: "telegram:12345",
        From: "telegram:12345",
        SenderId: "12345",
        OwnerAllowFrom: ["telegram:12345"],
        RequesterTailscaleLogin: "owner@example.com",
        CommandAuthorized: true,
      },
    });

    expect(patch).toMatchObject({
      requesterSenderIsOwner: true,
      requesterTailscaleLogin: "owner@example.com",
      origin: {
        provider: "telegram",
        surface: "telegram",
        chatType: "direct",
        from: "telegram:12345",
        to: "telegram:12345",
      },
    });
  });
});

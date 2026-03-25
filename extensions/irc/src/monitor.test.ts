import { describe, expect, it } from "vitest";
import { resolveIrcInboundTarget } from "./monitor.js";

describe("irc monitor inbound target", () => {
  it("keeps channel target for group messages", () => {
    expect(
      resolveIrcInboundTarget({
        target: "#maumau",
        senderNick: "alice",
      }),
    ).toEqual({
      isGroup: true,
      target: "#maumau",
      rawTarget: "#maumau",
    });
  });

  it("maps DM target to sender nick and preserves raw target", () => {
    expect(
      resolveIrcInboundTarget({
        target: "maumau-bot",
        senderNick: "alice",
      }),
    ).toEqual({
      isGroup: false,
      target: "alice",
      rawTarget: "maumau-bot",
    });
  });

  it("falls back to raw target when sender nick is empty", () => {
    expect(
      resolveIrcInboundTarget({
        target: "maumau-bot",
        senderNick: " ",
      }),
    ).toEqual({
      isGroup: false,
      target: "maumau-bot",
      rawTarget: "maumau-bot",
    });
  });
});

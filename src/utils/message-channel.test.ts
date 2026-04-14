import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ChannelPlugin } from "../channels/plugins/types.js";
import { setActivePluginRegistry } from "../plugins/runtime.js";
import { createMSTeamsTestPluginBase, createTestRegistry } from "../test-utils/channel-plugins.js";
import {
  isRequesterRemoteMessagingChannel,
  resolveGatewayMessageChannel,
} from "./message-channel.js";

const emptyRegistry = createTestRegistry([]);
const msteamsPlugin: ChannelPlugin = {
  ...createMSTeamsTestPluginBase(),
};

describe("message-channel", () => {
  beforeEach(() => {
    setActivePluginRegistry(emptyRegistry);
  });

  afterEach(() => {
    setActivePluginRegistry(emptyRegistry);
  });

  it("normalizes gateway message channels and rejects unknown values", () => {
    expect(resolveGatewayMessageChannel("discord")).toBe("discord");
    expect(resolveGatewayMessageChannel(" imsg ")).toBe("imessage");
    expect(resolveGatewayMessageChannel("web")).toBeUndefined();
    expect(resolveGatewayMessageChannel("nope")).toBeUndefined();
  });

  it("normalizes plugin aliases when registered", () => {
    setActivePluginRegistry(
      createTestRegistry([{ pluginId: "msteams", plugin: msteamsPlugin, source: "test" }]),
    );
    expect(resolveGatewayMessageChannel("teams")).toBe("msteams");
  });

  it("treats external messaging channels as remote requester surfaces", () => {
    setActivePluginRegistry(
      createTestRegistry([{ pluginId: "msteams", plugin: msteamsPlugin, source: "test" }]),
    );
    expect(isRequesterRemoteMessagingChannel("telegram")).toBe(true);
    expect(isRequesterRemoteMessagingChannel("teams")).toBe(true);
    expect(isRequesterRemoteMessagingChannel("webchat")).toBe(false);
    expect(isRequesterRemoteMessagingChannel("tui")).toBe(false);
    expect(isRequesterRemoteMessagingChannel("voicewake")).toBe(false);
  });
});

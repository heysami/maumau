import { describe, expect, it, vi } from "vitest";
import type { MaumauPluginApi } from "../api.js";
import type { MultiUserMemoryConfig } from "./config.js";
import { maybeBootstrapFirstObservedUser } from "./first-user.js";
import { installDiscordRegistryHooks } from "../../../src/auto-reply/test-helpers/command-auth-registry-fixture.js";

installDiscordRegistryHooks();

function createPluginConfig(): MultiUserMemoryConfig {
  return {
    enabled: true,
    autoDiscover: true,
    defaultLanguage: "en",
    approvalDelivery: {
      mode: "same_session",
    },
    adminUserIds: [],
    users: {},
    groups: {},
  };
}

describe("maybeBootstrapFirstObservedUser", () => {
  it("bootstraps the first observed direct sender as both memory admin and command owner", async () => {
    const writeConfigFile = vi.fn(async () => {});
    const api = {
      config: {},
      runtime: {
        config: {
          loadConfig: () => ({}),
          writeConfigFile,
        },
      },
    } as unknown as MaumauPluginApi;

    const result = await maybeBootstrapFirstObservedUser({
      api,
      pluginConfig: createPluginConfig(),
      channelId: "telegram",
      senderId: "12345",
      senderName: "Sam",
    });

    expect(result?.userId).toBe("sam");
    expect(writeConfigFile).toHaveBeenCalledWith(
      expect.objectContaining({
        commands: {
          ownerAllowFrom: ["telegram:12345"],
        },
      }),
    );
  });

  it("preserves an existing owner allowFrom list", async () => {
    const writeConfigFile = vi.fn(async () => {});
    const api = {
      config: {
        commands: {
          ownerAllowFrom: ["telegram:999"],
        },
      },
      runtime: {
        config: {
          loadConfig: () => ({
            commands: {
              ownerAllowFrom: ["telegram:999"],
            },
          }),
          writeConfigFile,
        },
      },
    } as unknown as MaumauPluginApi;

    await maybeBootstrapFirstObservedUser({
      api,
      pluginConfig: createPluginConfig(),
      channelId: "telegram",
      senderId: "12345",
      senderName: "Sam",
    });

    expect(writeConfigFile).toHaveBeenCalledWith(
      expect.objectContaining({
        commands: {
          ownerAllowFrom: ["telegram:999"],
        },
      }),
    );
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { telegramSetupPlugin } from "../../extensions/telegram/setup-entry.js";
import type { MaumauConfig } from "../config/types.js";
import { createEmptyPluginRegistry } from "../plugins/registry.js";
import { resetPluginRuntimeStateForTest, setActivePluginRegistry } from "../plugins/runtime.js";
import { collectDashboardUserChannels, connectDashboardUserChannel } from "./dashboard-user-channels.js";

const { loadConfigMock, readConfigFileSnapshotForWriteMock, writeConfigFileMock } = vi.hoisted(() => ({
  loadConfigMock: vi.fn<() => MaumauConfig>(),
  readConfigFileSnapshotForWriteMock: vi.fn(),
  writeConfigFileMock: vi.fn(),
}));

vi.mock("../config/config.js", () => ({
  loadConfig: loadConfigMock,
  readConfigFileSnapshotForWrite: readConfigFileSnapshotForWriteMock,
  writeConfigFile: writeConfigFileMock,
}));

const EMPTY_RUNTIME_SNAPSHOT = {
  channels: {},
  channelAccounts: {},
};

describe("collectDashboardUserChannels", () => {
  beforeEach(() => {
    resetPluginRuntimeStateForTest();
    setActivePluginRegistry(createEmptyPluginRegistry());
    loadConfigMock.mockReset();
    loadConfigMock.mockReturnValue({});
    readConfigFileSnapshotForWriteMock.mockReset();
    writeConfigFileMock.mockReset();
  });

  it("includes bundled setup channels when the active setup registry is partial", async () => {
    const registry = createEmptyPluginRegistry();
    registry.channelSetups = [
      {
        pluginId: "telegram",
        plugin: telegramSetupPlugin,
        source: "test",
        enabled: true,
      },
    ];
    setActivePluginRegistry(registry);

    const result = await collectDashboardUserChannels({
      runtimeSnapshot: EMPTY_RUNTIME_SNAPSHOT,
    });

    expect(result.availableChannels.map((channel) => channel.channelId)).toEqual([
      "whatsapp",
      "telegram",
      "discord",
      "imessage",
      "slack",
      "line",
    ]);
  });

  it.each([
    {
      channelId: "telegram",
      fields: {
        botToken: "1234567890:AAExampleTelegramBotToken",
      },
      expectedChannel: {
        enabled: true,
        botToken: "1234567890:AAExampleTelegramBotToken",
        dmPolicy: "open",
        allowFrom: ["*"],
        groups: {
          "*": {
            requireMention: true,
          },
        },
      },
    },
    {
      channelId: "discord",
      fields: {
        token: "discord-bot-token",
      },
      expectedChannel: {
        enabled: true,
        token: "discord-bot-token",
        dmPolicy: "open",
        allowFrom: ["*"],
      },
    },
    {
      channelId: "slack",
      fields: {
        botToken: "xoxb-example",
        appToken: "xapp-example",
      },
      expectedChannel: {
        enabled: true,
        mode: "socket",
        botToken: "xoxb-example",
        appToken: "xapp-example",
        dmPolicy: "open",
        allowFrom: ["*"],
      },
    },
    {
      channelId: "line",
      fields: {
        channelAccessToken: "line-access-token",
        channelSecret: "line-secret",
      },
      expectedChannel: {
        enabled: true,
        channelAccessToken: "line-access-token",
        channelSecret: "line-secret",
        dmPolicy: "open",
        allowFrom: ["*"],
      },
    },
    {
      channelId: "imessage",
      fields: {
        cliPath: "imsg",
      },
      expectedChannel: {
        enabled: true,
        cliPath: "imsg",
        dmPolicy: "open",
        allowFrom: ["*"],
      },
    },
    {
      channelId: "whatsapp",
      fields: {},
      expectedChannel: {
        dmPolicy: "open",
        allowFrom: ["*"],
      },
    },
  ])("applies onboarding quick setup defaults when connecting $channelId", async (testCase) => {
    readConfigFileSnapshotForWriteMock.mockResolvedValue({
      snapshot: {
        config: {},
      },
      writeOptions: {},
    });

    await connectDashboardUserChannel({
      channelId: testCase.channelId,
      fields: testCase.fields,
    });

    expect(writeConfigFileMock).toHaveBeenCalledTimes(1);
    const nextConfig = writeConfigFileMock.mock.calls[0]?.[0] as MaumauConfig;
    const channelConfig = (nextConfig.channels as Record<string, unknown> | undefined)?.[
      testCase.channelId
    ];
    expect(nextConfig.plugins?.entries?.[testCase.channelId]?.enabled).toBe(true);
    expect(channelConfig).toMatchObject(testCase.expectedChannel);
  });
});

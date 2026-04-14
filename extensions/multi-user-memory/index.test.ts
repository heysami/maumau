import { describe, expect, it, vi } from "vitest";
import { createTestPluginApi } from "../../test/helpers/extensions/plugin-api.js";
import plugin from "./index.js";

describe("multi-user-memory plugin register", () => {
  it("registers the admin and approval routes plus prompt hook in full mode", () => {
    const registerTool = vi.fn();
    const registerHttpRoute = vi.fn();
    const registerMemoryPromptSection = vi.fn();
    const on = vi.fn();

    plugin.register(
      createTestPluginApi({
        id: "multi-user-memory",
        name: "Multi-User Memory",
        source: "test",
        config: {},
        runtime: {
          state: {
            resolveStateDir() {
              return "/tmp/maumau-test";
            },
          },
        } as never,
        registerTool,
        registerHttpRoute,
        registerMemoryPromptSection,
        on,
      }),
    );

    expect(registerMemoryPromptSection).toHaveBeenCalledTimes(1);
    expect(registerHttpRoute).toHaveBeenCalledTimes(2);
    expect(registerHttpRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/api/plugins/multi-user-memory/admin",
        auth: "gateway",
        match: "exact",
      }),
    );
    expect(registerHttpRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/plugins/multi-user-memory/approvals",
        auth: "plugin",
        match: "exact",
      }),
    );
    expect(on).toHaveBeenCalledWith("before_prompt_build", expect.any(Function));
    expect(registerTool).toHaveBeenCalledTimes(4);
  });

  it("auto-bootstraps the first direct sender into the first admin user", async () => {
    const on = vi.fn();
    const writeConfigFile = vi.fn(async (nextConfig) => {
      currentConfig = nextConfig;
    });
    let currentConfig = {
      plugins: {
        slots: {
          memory: "multi-user-memory",
        },
        entries: {
          "multi-user-memory": {
            config: {
              enabled: true,
              autoDiscover: true,
              defaultLanguage: "en",
              adminUserIds: [],
              users: {},
              groups: {},
            },
          },
        },
      },
    };

    plugin.register(
      createTestPluginApi({
        id: "multi-user-memory",
        name: "Multi-User Memory",
        source: "test",
        config: currentConfig,
        runtime: {
          state: {
            resolveStateDir() {
              return "/tmp/maumau-test";
            },
          },
          config: {
            loadConfig() {
              return currentConfig;
            },
            writeConfigFile,
          },
        } as never,
        on,
      }),
    );

    const hook = on.mock.calls.find(([eventName]) => eventName === "before_prompt_build")?.[1];
    expect(hook).toBeTypeOf("function");

    const result = await hook(
      { prompt: "Remember that I prefer English replies." },
      {
        agentId: "main",
        sessionKey: "telegram:6925625562",
        channelId: "telegram",
        requesterSenderId: "6925625562",
        requesterSenderName: "Taylor Example",
        requesterSenderUsername: "taylor",
        isGroup: false,
      },
    );

    expect(writeConfigFile).toHaveBeenCalledTimes(1);
    expect(currentConfig.plugins.entries["multi-user-memory"].config).toMatchObject({
      adminUserIds: ["taylor-example"],
      users: {
        "taylor-example": {
          displayName: "Taylor Example",
          preferredLanguage: "en",
          identities: [
            {
              channelId: "telegram",
              senderId: "6925625562",
              senderName: "Taylor Example",
              senderUsername: "taylor",
            },
          ],
        },
      },
    });
    expect(result).toMatchObject({
      prependSystemContext: expect.stringContaining("Active user: Taylor Example"),
    });
  });
});

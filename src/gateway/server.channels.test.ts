import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import type { ChannelPlugin } from "../channels/plugins/types.js";
import { createEmptyPluginRegistry } from "../plugins/registry.js";
import { createChannelTestPluginBase } from "../test-utils/channel-plugins.js";
import { setRegistry } from "./server.agent.gateway-server-agent.mocks.js";
import { createRegistry } from "./server.e2e-registry-helpers.js";
import {
  connectOk,
  installGatewayTestHooks,
  rpcReq,
  startServerWithClient,
} from "./test-helpers.js";

let readConfigFileSnapshot: typeof import("../config/config.js").readConfigFileSnapshot;
let writeConfigFile: typeof import("../config/config.js").writeConfigFile;

installGatewayTestHooks({ scope: "suite" });

const createStubChannelPlugin = (params: {
  id: ChannelPlugin["id"];
  label: string;
  summary?: Record<string, unknown>;
  logoutCleared?: boolean;
}): ChannelPlugin => ({
  ...createChannelTestPluginBase({
    id: params.id,
    label: params.label,
    config: { isConfigured: async () => false },
  }),
  status: {
    buildChannelSummary: async () => ({
      configured: false,
      ...params.summary,
    }),
  },
  gateway: {
    logoutAccount: async () => ({
      cleared: params.logoutCleared ?? false,
      envToken: false,
    }),
  },
});

const telegramPlugin: ChannelPlugin = {
  ...createStubChannelPlugin({
    id: "telegram",
    label: "Telegram",
    summary: { tokenSource: "none", lastProbeAt: null },
    logoutCleared: true,
  }),
  gateway: {
    logoutAccount: async ({ cfg }) => {
      const nextTelegram = cfg.channels?.telegram ? { ...cfg.channels.telegram } : {};
      delete nextTelegram.botToken;
      await writeConfigFile({
        ...cfg,
        channels: {
          ...cfg.channels,
          telegram: nextTelegram,
        },
      });
      return { cleared: true, envToken: false, loggedOut: true };
    },
  },
};

const whatsappSetupPlugin: ChannelPlugin = {
  ...createStubChannelPlugin({ id: "whatsapp", label: "WhatsApp" }),
  gatewayMethods: ["web.login.start", "web.login.wait"],
  gateway: {
    loginWithQrStart: async () => ({
      message: "Scan the QR code in WhatsApp.",
      qrDataUrl: "data:image/png;base64,ZmFrZQ==",
    }),
    loginWithQrWait: async () => ({
      connected: true,
      message: "WhatsApp linked.",
    }),
  },
};

const defaultRegistry = createRegistry([
  {
    pluginId: "whatsapp",
    source: "test",
    plugin: createStubChannelPlugin({ id: "whatsapp", label: "WhatsApp" }),
  },
  {
    pluginId: "telegram",
    source: "test",
    plugin: telegramPlugin,
  },
  {
    pluginId: "signal",
    source: "test",
    plugin: createStubChannelPlugin({
      id: "signal",
      label: "Signal",
      summary: { lastProbeAt: null },
    }),
  },
]);

let server: Awaited<ReturnType<typeof startServerWithClient>>["server"];
let ws: Awaited<ReturnType<typeof startServerWithClient>>["ws"];

beforeAll(async () => {
  ({ readConfigFileSnapshot, writeConfigFile } = await import("../config/config.js"));
  setRegistry(defaultRegistry);
  const started = await startServerWithClient();
  server = started.server;
  ws = started.ws;
  await connectOk(ws);
});

afterAll(async () => {
  ws.close();
  await server.close();
});

describe("gateway server channels", () => {
  test("channels.status returns snapshot without probe", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", undefined);
    setRegistry(defaultRegistry);
    const res = await rpcReq<{
      channels?: Record<
        string,
        {
          configured?: boolean;
          tokenSource?: string;
          probe?: unknown;
          lastProbeAt?: unknown;
          linked?: boolean;
        }
      >;
    }>(ws, "channels.status", { probe: false, timeoutMs: 2000 });
    expect(res.ok).toBe(true);
    const telegram = res.payload?.channels?.telegram;
    const signal = res.payload?.channels?.signal;
    expect(res.payload?.channels?.whatsapp).toBeTruthy();
    expect(telegram?.configured).toBe(false);
    expect(telegram?.tokenSource).toBe("none");
    expect(telegram?.probe).toBeUndefined();
    expect(telegram?.lastProbeAt).toBeNull();
    expect(signal?.configured).toBe(false);
    expect(signal?.probe).toBeUndefined();
    expect(signal?.lastProbeAt).toBeNull();
  });

  test("channels.status includes setup-only channels during fresh setup", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", undefined);
    const setupOnlyRegistry = createEmptyPluginRegistry();
    setupOnlyRegistry.channelSetups = [
      {
        pluginId: "telegram",
        plugin: telegramPlugin,
        source: "test",
        enabled: true,
      },
    ];
    setRegistry(setupOnlyRegistry);

    const res = await rpcReq<{
      channelOrder?: string[];
      channelLabels?: Record<string, string>;
      channels?: Record<string, { configured?: boolean }>;
    }>(ws, "channels.status", { probe: false, timeoutMs: 2000 });

    expect(res.ok).toBe(true);
    expect(res.payload?.channelOrder).toContain("telegram");
    expect(res.payload?.channelLabels?.telegram).toBe("Telegram");
    expect(res.payload?.channels?.telegram?.configured).toBe(false);
  });

  test("channels.status falls back to bundled setup channels when none are loaded", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", undefined);
    setRegistry(createEmptyPluginRegistry());

    const res = await rpcReq<{
      channelOrder?: string[];
      channelLabels?: Record<string, string>;
      channels?: Record<string, { configured?: boolean; linked?: boolean }>;
    }>(ws, "channels.status", { probe: false, timeoutMs: 2000 });

    expect(res.ok).toBe(true);
    expect(res.payload?.channelOrder).toEqual(
      expect.arrayContaining(["whatsapp", "telegram", "discord"]),
    );
    expect(res.payload?.channelLabels?.whatsapp).toBe("WhatsApp");
    expect(res.payload?.channels?.whatsapp).toBeTruthy();
  });

  test("web login falls back to setup-only channels during fresh setup", async () => {
    const setupOnlyRegistry = createEmptyPluginRegistry();
    setupOnlyRegistry.channelSetups = [
      {
        pluginId: "whatsapp",
        plugin: whatsappSetupPlugin,
        source: "test",
        enabled: true,
      },
    ];
    setRegistry(setupOnlyRegistry);

    const start = await rpcReq<{ message?: string; qrDataUrl?: string }>(ws, "web.login.start", {
      force: true,
      timeoutMs: 2_000,
    });
    expect(start.ok).toBe(true);
    expect(start.payload?.message).toBe("Scan the QR code in WhatsApp.");
    expect(start.payload?.qrDataUrl).toBe("data:image/png;base64,ZmFrZQ==");

    const wait = await rpcReq<{ connected?: boolean; message?: string }>(ws, "web.login.wait", {
      timeoutMs: 2_000,
    });
    expect(wait.ok).toBe(true);
    expect(wait.payload?.connected).toBe(true);
    expect(wait.payload?.message).toBe("WhatsApp linked.");
  });

  test("channels.logout reports no session when missing", async () => {
    setRegistry(defaultRegistry);
    const res = await rpcReq<{ cleared?: boolean; channel?: string }>(ws, "channels.logout", {
      channel: "whatsapp",
    });
    expect(res.ok).toBe(true);
    expect(res.payload?.channel).toBe("whatsapp");
    expect(res.payload?.cleared).toBe(false);
  });

  test("channels.logout clears telegram bot token from config", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", undefined);
    setRegistry(defaultRegistry);
    await writeConfigFile({
      channels: {
        telegram: {
          botToken: "123:abc",
          groups: { "*": { requireMention: false } },
        },
      },
    });
    const res = await rpcReq<{
      cleared?: boolean;
      envToken?: boolean;
      channel?: string;
    }>(ws, "channels.logout", { channel: "telegram" });
    expect(res.ok).toBe(true);
    expect(res.payload?.channel).toBe("telegram");
    expect(res.payload?.cleared).toBe(true);
    expect(res.payload?.envToken).toBe(false);

    const snap = await readConfigFileSnapshot();
    expect(snap.valid).toBe(true);
    expect(snap.config?.channels?.telegram?.botToken).toBeUndefined();
    expect(snap.config?.channels?.telegram?.groups?.["*"]?.requireMention).toBe(false);
  });
});

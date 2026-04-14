/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { applySettingsFromUrlMock, applySettingsMock, connectGatewayMock, loadBootstrapMock } =
  vi.hoisted(() => ({
    applySettingsFromUrlMock: vi.fn(),
    applySettingsMock: vi.fn(),
    connectGatewayMock: vi.fn(),
    loadBootstrapMock: vi.fn(),
  }));

vi.mock("./app-gateway.ts", () => ({
  connectGateway: connectGatewayMock,
}));

vi.mock("./controllers/control-ui-bootstrap.ts", () => ({
  loadControlUiBootstrapConfig: loadBootstrapMock,
}));

vi.mock("./app-settings.ts", () => ({
  applySettings: applySettingsMock,
  applySettingsFromUrl: applySettingsFromUrlMock,
  attachThemeListener: vi.fn(),
  detachThemeListener: vi.fn(),
  inferBasePath: vi.fn(() => "/"),
  syncTabWithLocation: vi.fn(),
  syncThemeWithSettings: vi.fn(),
}));

vi.mock("./app-polling.ts", () => ({
  startLogsPolling: vi.fn(),
  startNodesPolling: vi.fn(),
  stopLogsPolling: vi.fn(),
  stopNodesPolling: vi.fn(),
  startDebugPolling: vi.fn(),
  stopDebugPolling: vi.fn(),
}));

vi.mock("./app-scroll.ts", () => ({
  observeTopbar: vi.fn(),
  scheduleChatScroll: vi.fn(),
  scheduleLogsScroll: vi.fn(),
}));

import { handleConnected } from "./app-lifecycle.ts";

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

function createHost() {
  return {
    basePath: "",
    client: null,
    connectGeneration: 0,
    connected: false,
    settings: {
      gatewayUrl: "ws://127.0.0.1:18789",
      token: "stale-token",
      sessionKey: "main",
      lastActiveSessionKey: "main",
      theme: "claw",
      themeMode: "system",
      chatFocusMode: false,
      chatShowThinking: true,
      chatShowToolCalls: true,
      splitRatio: 0.6,
      navCollapsed: false,
      navWidth: 220,
      navGroupsCollapsed: {},
      borderRadius: 50,
    },
    tab: "chat",
    assistantName: "Maumau",
    assistantAvatar: null,
    assistantAgentId: null,
    serverVersion: null,
    chatHasAutoScrolled: false,
    chatManualRefreshInFlight: false,
    chatLoading: false,
    chatMessages: [],
    chatToolMessages: [],
    chatStream: "",
    logsAutoFollow: false,
    logsAtBottom: true,
    logsEntries: [],
    popStateHandler: vi.fn(),
    topbarObserver: null,
  };
}

describe("handleConnected", () => {
  beforeEach(() => {
    applySettingsFromUrlMock.mockReset();
    applySettingsMock.mockReset();
    connectGatewayMock.mockReset();
    loadBootstrapMock.mockReset();
  });

  it("waits for bootstrap load before first gateway connect", async () => {
    let resolveBootstrap!: () => void;
    loadBootstrapMock.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveBootstrap = resolve;
      }),
    );
    connectGatewayMock.mockReset();
    const host = createHost();

    handleConnected(host as never);
    expect(connectGatewayMock).not.toHaveBeenCalled();

    resolveBootstrap();
    await flushMicrotasks();
    expect(connectGatewayMock).toHaveBeenCalledTimes(1);
  });

  it("skips deferred connect when disconnected before bootstrap resolves", async () => {
    let resolveBootstrap!: () => void;
    loadBootstrapMock.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveBootstrap = resolve;
      }),
    );
    connectGatewayMock.mockReset();
    const host = createHost();

    handleConnected(host as never);
    expect(connectGatewayMock).not.toHaveBeenCalled();

    host.connectGeneration += 1;
    resolveBootstrap();
    await flushMicrotasks();

    expect(connectGatewayMock).not.toHaveBeenCalled();
  });

  it("scrubs URL settings before starting the bootstrap fetch", () => {
    loadBootstrapMock.mockResolvedValueOnce(undefined);
    const host = createHost();

    handleConnected(host as never);

    expect(applySettingsFromUrlMock).toHaveBeenCalledTimes(1);
    expect(loadBootstrapMock).toHaveBeenCalledTimes(1);
    expect(applySettingsFromUrlMock.mock.invocationCallOrder[0]).toBeLessThan(
      loadBootstrapMock.mock.invocationCallOrder[0],
    );
  });

  it("applies a refreshed loopback token before the first gateway connect", async () => {
    loadBootstrapMock.mockResolvedValueOnce({
      basePath: "/",
      assistantName: "Maumau",
      assistantAvatar: "/avatar/main",
      assistantAgentId: "main",
      loopbackGatewayToken: "fresh-token",
    });
    const host = createHost();

    handleConnected(host as never);
    await flushMicrotasks();

    expect(applySettingsMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ token: "fresh-token" }),
    );
    expect(applySettingsMock.mock.invocationCallOrder[0]).toBeLessThan(
      connectGatewayMock.mock.invocationCallOrder[0],
    );
  });
});

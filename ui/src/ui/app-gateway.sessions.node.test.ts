import { describe, expect, it, vi } from "vitest";
import type { MauOfficeState } from "./controllers/mau-office.ts";

const loadSessionsMock = vi.fn();
const applyMauOfficeAgentEventMock = vi.fn<
  (state: MauOfficeState, payload: unknown, nowMs?: number) => MauOfficeState
>((state) => state);
const applyMauOfficePresenceMock = vi.fn<
  (state: MauOfficeState, payload: unknown, nowMs?: number) => MauOfficeState
>((state) => state);
const applyMauOfficeSessionMessageEventMock = vi.fn<
  (state: MauOfficeState, payload: unknown, nowMs?: number) => MauOfficeState
>((state) => state);
const applyMauOfficeSessionToolEventMock = vi.fn<
  (state: MauOfficeState, payload: unknown, nowMs?: number) => MauOfficeState
>((state) => state);
const scheduleMauOfficeReloadMock = vi.fn();

vi.mock("./app-chat.ts", () => ({
  CHAT_SESSIONS_ACTIVE_MINUTES: 10,
  flushChatQueueForEvent: vi.fn(),
}));
vi.mock("./app-settings.ts", () => ({
  applySettings: vi.fn(),
  loadCron: vi.fn(),
  refreshActiveTab: vi.fn(),
  setLastActiveSessionKey: vi.fn(),
}));
vi.mock("./app-tool-stream.ts", () => ({
  handleAgentEvent: vi.fn(),
  resetToolStream: vi.fn(),
}));
vi.mock("./controllers/agents.ts", () => ({
  loadAgents: vi.fn(),
  loadToolsCatalog: vi.fn(),
}));
vi.mock("./controllers/assistant-identity.ts", () => ({
  loadAssistantIdentity: vi.fn(),
}));
vi.mock("./controllers/chat.ts", () => ({
  loadChatHistory: vi.fn(),
  handleChatEvent: vi.fn(() => "idle"),
}));
vi.mock("./controllers/devices.ts", () => ({
  loadDevices: vi.fn(),
}));
vi.mock("./controllers/mau-office.ts", () => ({
  applyMauOfficeAgentEvent: applyMauOfficeAgentEventMock,
  applyMauOfficePresence: applyMauOfficePresenceMock,
  applyMauOfficeSessionMessageEvent: applyMauOfficeSessionMessageEventMock,
  applyMauOfficeSessionToolEvent: applyMauOfficeSessionToolEventMock,
  scheduleMauOfficeReload: scheduleMauOfficeReloadMock,
}));
vi.mock("./controllers/exec-approval.ts", () => ({
  addExecApproval: vi.fn(),
  parseExecApprovalRequested: vi.fn(() => null),
  parseExecApprovalResolved: vi.fn(() => null),
  removeExecApproval: vi.fn(),
}));
vi.mock("./controllers/nodes.ts", () => ({
  loadNodes: vi.fn(),
}));
vi.mock("./controllers/sessions.ts", () => ({
  loadSessions: loadSessionsMock,
  subscribeSessions: vi.fn(),
}));
vi.mock("./gateway.ts", () => ({
  GatewayBrowserClient: class {},
  resolveGatewayErrorDetailCode: () => null,
}));

const { handleGatewayEvent } = await import("./app-gateway.ts");

function createHost() {
  return {
    settings: {
      gatewayUrl: "ws://127.0.0.1:18789",
      token: "",
      sessionKey: "main",
      lastActiveSessionKey: "main",
      theme: "claw",
      themeMode: "system",
      chatFocusMode: false,
      chatShowThinking: true,
      chatShowToolCalls: true,
      splitRatio: 0.6,
      navCollapsed: false,
      navWidth: 280,
      navGroupsCollapsed: {},
      borderRadius: 50,
    },
    password: "",
    clientInstanceId: "instance-test",
    client: null,
    connected: true,
    hello: null,
    lastError: null,
    lastErrorCode: null,
    eventLogBuffer: [],
    eventLog: [],
    tab: "overview",
    presenceEntries: [],
    presenceError: null,
    presenceStatus: null,
    agentsLoading: false,
    agentsList: null,
    agentsError: null,
    healthLoading: false,
    healthResult: null,
    healthError: null,
    toolsCatalogLoading: false,
    toolsCatalogError: null,
    toolsCatalogResult: null,
    debugHealth: null,
    assistantName: "Maumau",
    assistantAvatar: null,
    assistantAgentId: null,
    serverVersion: null,
    sessionKey: "main",
    chatRunId: null,
    refreshSessionsAfterChat: new Set<string>(),
    dashboardLoading: false,
    dashboardError: null,
    dashboardSnapshot: null,
    dashboardCalendarResult: null,
    dashboardCalendarAnchorAtMs: null,
    dashboardCalendarView: "month",
    dashboardTeamsLoading: false,
    dashboardTeamsError: null,
    dashboardTeamSnapshots: null,
    dashboardReloadTimer: null,
    mauOfficeLoading: false,
    mauOfficeError: null,
    mauOfficeState: { loaded: false, actorOrder: [], actors: {} },
    mauOfficeReloadTimer: null,
    execApprovalQueue: [],
    execApprovalError: null,
    updateAvailable: null,
  } as unknown as Parameters<typeof handleGatewayEvent>[0];
}

describe("handleGatewayEvent sessions.changed", () => {
  it("reloads sessions when the gateway pushes a sessions.changed event", () => {
    loadSessionsMock.mockReset();
    scheduleMauOfficeReloadMock.mockReset();
    const host = createHost();

    handleGatewayEvent(host, {
      type: "event",
      event: "sessions.changed",
      payload: { sessionKey: "agent:main:main", reason: "patch" },
      seq: 1,
    });

    expect(loadSessionsMock).toHaveBeenCalledTimes(1);
    expect(loadSessionsMock).toHaveBeenCalledWith(host);
    expect(scheduleMauOfficeReloadMock).toHaveBeenCalledWith(host);
  });

  it("routes session.tool events into the MauOffice reducer", () => {
    applyMauOfficeSessionToolEventMock.mockClear();
    const host = createHost();

    handleGatewayEvent(host, {
      type: "event",
      event: "session.tool",
      payload: { sessionKey: "agent:main:main", data: { toolName: "sessions_send" } },
      seq: 2,
    });

    expect(applyMauOfficeSessionToolEventMock).toHaveBeenCalledTimes(1);
    expect(applyMauOfficeSessionToolEventMock.mock.calls[0]?.[1]).toEqual({
      sessionKey: "agent:main:main",
      data: { toolName: "sessions_send" },
    });
  });

  it("routes session.message events into the MauOffice reducer", () => {
    applyMauOfficeSessionMessageEventMock.mockClear();
    const host = createHost();

    handleGatewayEvent(host, {
      type: "event",
      event: "session.message",
      payload: { sessionKey: "agent:main:main", message: { role: "assistant" } },
      seq: 3,
    });

    expect(applyMauOfficeSessionMessageEventMock).toHaveBeenCalledTimes(1);
    expect(applyMauOfficeSessionMessageEventMock.mock.calls[0]?.[1]).toEqual({
      sessionKey: "agent:main:main",
      message: { role: "assistant" },
    });
  });

  it("routes presence events into the MauOffice reducer", () => {
    applyMauOfficePresenceMock.mockClear();
    const host = createHost();
    const presence = [{ id: "gateway", mode: "webchat" }];

    handleGatewayEvent(host, {
      type: "event",
      event: "presence",
      payload: { presence },
      seq: 4,
    });

    expect(applyMauOfficePresenceMock).toHaveBeenCalledTimes(1);
    expect(host.presenceEntries).toEqual(presence);
  });
});

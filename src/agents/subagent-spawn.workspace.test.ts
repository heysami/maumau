import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMainOrchestrationTeamConfig,
  createStarterTeamAgents,
  createStarterTeamConfig,
  MAIN_WORKER_AGENT_ID,
  STARTER_TEAM_ID,
  STARTER_TEAM_MANAGER_AGENT_ID,
} from "../teams/presets.js";
import {
  createDefaultSessionHelperMocks,
  identityDeliveryContext,
} from "./subagent-spawn.test-helpers.js";
import { installAcceptedSubagentGatewayMock } from "./test-helpers/subagent-gateway.js";

type TestAgentConfig = {
  id?: string;
  workspace?: string;
  executionStyle?: string;
  executionWorkerAgentId?: string;
  subagents?: {
    allowAgents?: string[];
  };
};

type TestConfig = {
  agents?: {
    defaults?: {
      executionStyle?: string;
      executionWorkerAgentId?: string;
    };
    list?: TestAgentConfig[];
  };
  teams?: {
    list?: Array<Record<string, unknown>>;
  };
};

const hoisted = vi.hoisted(() => ({
  callGatewayMock: vi.fn(),
  configOverride: {} as Record<string, unknown>,
  registerSubagentRunMock: vi.fn(),
  sessionEntries: {} as Record<string, Record<string, unknown>>,
  hookRunner: {
    hasHooks: vi.fn(() => false),
    runSubagentSpawning: vi.fn(),
  },
}));

let spawnSubagentDirect: typeof import("./subagent-spawn.js").spawnSubagentDirect;

vi.mock("../gateway/call.js", () => ({
  callGateway: (opts: unknown) => hoisted.callGatewayMock(opts),
}));

vi.mock("../config/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/config.js")>();
  return {
    ...actual,
    loadConfig: () => hoisted.configOverride,
  };
});

vi.mock("../gateway/session-utils.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../gateway/session-utils.js")>();
  return {
    ...actual,
    loadSessionEntry: (key: string) => ({ entry: hoisted.sessionEntries[key] ?? {} }),
  };
});

vi.mock("@mariozechner/pi-ai/oauth", async () => {
  const actual = await vi.importActual<typeof import("@mariozechner/pi-ai/oauth")>(
    "@mariozechner/pi-ai/oauth",
  );
  return {
    ...actual,
    getOAuthApiKey: () => "",
    getOAuthProviders: () => [],
  };
});

vi.mock("./subagent-registry.js", () => ({
  countActiveRunsForSession: () => 0,
  registerSubagentRun: (args: unknown) => hoisted.registerSubagentRunMock(args),
}));

vi.mock("./subagent-announce.js", () => ({
  buildSubagentSystemPrompt: () => "system-prompt",
}));

vi.mock("./subagent-depth.js", () => ({
  getSubagentDepthFromSessionStore: () => 0,
}));

vi.mock("./model-selection.js", () => ({
  resolveSubagentSpawnModelSelection: () => undefined,
}));

vi.mock("./sandbox/runtime-status.js", () => ({
  resolveSandboxRuntimeStatus: () => ({ sandboxed: false }),
}));

vi.mock("../plugins/hook-runner-global.js", () => ({
  getGlobalHookRunner: () => hoisted.hookRunner,
}));

vi.mock("../utils/delivery-context.js", () => ({
  normalizeDeliveryContext: identityDeliveryContext,
}));

vi.mock("./tools/sessions-helpers.js", () => createDefaultSessionHelperMocks());

vi.mock("./agent-scope.js", () => ({
  resolveAgentConfig: (cfg: TestConfig, agentId: string) =>
    cfg.agents?.list?.find((entry) => entry.id === agentId),
  resolveDefaultAgentId: () => "main",
  resolveAgentWorkspaceDir: (cfg: TestConfig, agentId: string) =>
    cfg.agents?.list?.find((entry) => entry.id === agentId)?.workspace ??
    `/tmp/workspace-${agentId}`,
}));

function createConfigOverride(overrides?: Record<string, unknown>) {
  return {
    session: {
      mainKey: "main",
      scope: "per-sender",
    },
    agents: {
      list: [
        {
          id: "main",
          workspace: "/tmp/workspace-main",
        },
      ],
    },
    ...overrides,
  };
}

function setupGatewayMock() {
  installAcceptedSubagentGatewayMock(hoisted.callGatewayMock);
}

async function loadFreshSubagentSpawnWorkspaceModuleForTest() {
  vi.resetModules();
  vi.doMock("../gateway/call.js", () => ({
    callGateway: (opts: unknown) => hoisted.callGatewayMock(opts),
  }));
  vi.doMock("../config/config.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../config/config.js")>();
    return {
      ...actual,
      loadConfig: () => hoisted.configOverride,
    };
  });
  vi.doMock("../gateway/session-utils.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../gateway/session-utils.js")>();
    return {
      ...actual,
      loadSessionEntry: (key: string) => ({ entry: hoisted.sessionEntries[key] ?? {} }),
    };
  });
  vi.doMock("./subagent-registry.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./subagent-registry.js")>();
    return {
      ...actual,
      countActiveRunsForSession: () => 0,
      registerSubagentRun: (args: unknown) => hoisted.registerSubagentRunMock(args),
    };
  });
  vi.doMock("./subagent-announce.js", () => ({
    buildSubagentSystemPrompt: () => "system-prompt",
  }));
  vi.doMock("./subagent-depth.js", () => ({
    getSubagentDepthFromSessionStore: () => 0,
  }));
  vi.doMock("./model-selection.js", () => ({
    resolveSubagentSpawnModelSelection: () => undefined,
  }));
  vi.doMock("./sandbox/runtime-status.js", () => ({
    resolveSandboxRuntimeStatus: () => ({ sandboxed: false }),
  }));
  vi.doMock("../plugins/hook-runner-global.js", () => ({
    getGlobalHookRunner: () => hoisted.hookRunner,
  }));
  vi.doMock("../utils/delivery-context.js", () => ({
    normalizeDeliveryContext: identityDeliveryContext,
  }));
  vi.doMock("./tools/sessions-helpers.js", () => createDefaultSessionHelperMocks());
  vi.doMock("./agent-scope.js", () => ({
    resolveAgentConfig: (cfg: TestConfig, agentId: string) =>
      cfg.agents?.list?.find((entry) => entry.id === agentId),
    resolveDefaultAgentId: () => "main",
    resolveAgentWorkspaceDir: (cfg: TestConfig, agentId: string) =>
      cfg.agents?.list?.find((entry) => entry.id === agentId)?.workspace ??
      `/tmp/workspace-${agentId}`,
  }));
  ({ spawnSubagentDirect } = await import("./subagent-spawn.js"));
}

function getRegisteredRun() {
  return hoisted.registerSubagentRunMock.mock.calls.at(0)?.[0] as
    | Record<string, unknown>
    | undefined;
}

async function expectAcceptedWorkspace(params: { agentId: string; expectedWorkspaceDir: string }) {
  const result = await spawnSubagentDirect(
    {
      task: "inspect workspace",
      agentId: params.agentId,
    },
    {
      agentSessionKey: "agent:main:main",
      agentChannel: "telegram",
      agentAccountId: "123",
      agentTo: "456",
      workspaceDir: "/tmp/requester-workspace",
    },
  );

  expect(result.status).toBe("accepted");
  expect(getRegisteredRun()).toMatchObject({
    workspaceDir: params.expectedWorkspaceDir,
  });
}

describe("spawnSubagentDirect workspace inheritance", () => {
  beforeEach(async () => {
    await loadFreshSubagentSpawnWorkspaceModuleForTest();
    hoisted.callGatewayMock.mockClear();
    hoisted.registerSubagentRunMock.mockClear();
    hoisted.sessionEntries = {};
    hoisted.hookRunner.hasHooks.mockReset();
    hoisted.hookRunner.hasHooks.mockImplementation(() => false);
    hoisted.hookRunner.runSubagentSpawning.mockReset();
    hoisted.configOverride = createConfigOverride();
    setupGatewayMock();
  });

  it("uses the target agent workspace for cross-agent spawns", async () => {
    hoisted.configOverride = createConfigOverride({
      agents: {
        list: [
          {
            id: "main",
            workspace: "/tmp/workspace-main",
            subagents: {
              allowAgents: ["ops"],
            },
          },
          {
            id: "ops",
            workspace: "/tmp/workspace-ops",
          },
        ],
      },
    });

    await expectAcceptedWorkspace({
      agentId: "ops",
      expectedWorkspaceDir: "/tmp/workspace-ops",
    });
  });

  it("preserves the inherited workspace for same-agent spawns", async () => {
    await expectAcceptedWorkspace({
      agentId: "main",
      expectedWorkspaceDir: "/tmp/requester-workspace",
    });
  });

  it("allows teams_run to launch the required vibe-coder manager for UI tasks", async () => {
    hoisted.configOverride = createConfigOverride({
      agents: {
        defaults: {
          executionStyle: "orchestrator",
          executionWorkerAgentId: MAIN_WORKER_AGENT_ID,
        },
        list: [
          {
            id: "main",
            workspace: "/tmp/workspace-main",
            executionStyle: "orchestrator",
            executionWorkerAgentId: MAIN_WORKER_AGENT_ID,
            subagents: {
              allowAgents: [MAIN_WORKER_AGENT_ID],
            },
          },
          ...createStarterTeamAgents(),
        ],
      },
      teams: {
        list: [createMainOrchestrationTeamConfig(), createStarterTeamConfig()],
      },
    });

    const result = await spawnSubagentDirect(
      {
        task: "Build a polished responsive web app with visual design and accessibility review.",
        agentId: STARTER_TEAM_MANAGER_AGENT_ID,
        intent: "team_manager",
        skipAllowAgentsCheck: true,
        sessionPatch: {
          teamId: STARTER_TEAM_ID,
          teamRole: "manager",
          subagentMaxSpawnDepth: 2,
        },
      },
      {
        agentSessionKey: "main",
        agentChannel: "telegram",
        agentAccountId: "123",
        agentTo: "456",
        workspaceDir: "/tmp/requester-workspace",
      },
    );

    expect(result.status).toBe("accepted");
    expect(result.childSessionKey).toMatch(
      new RegExp(`^agent:${STARTER_TEAM_MANAGER_AGENT_ID}:subagent:`),
    );
    const patchCall = hoisted.callGatewayMock.mock.calls
      .map((call) => call[0] as { method?: string; params?: Record<string, unknown> })
      .find(
        (entry) =>
          entry.method === "sessions.patch" &&
          entry.params?.teamId === STARTER_TEAM_ID &&
          entry.params?.teamRole === "manager",
      );
    expect(patchCall?.params).toMatchObject({
      spawnDepth: 1,
      subagentMaxSpawnDepth: 2,
      subagentRole: "orchestrator",
      subagentControlScope: "children",
    });
  });

  it("still forbids direct worker delegation for UI tasks from the implicit root team", async () => {
    hoisted.configOverride = createConfigOverride({
      agents: {
        defaults: {
          executionStyle: "orchestrator",
          executionWorkerAgentId: MAIN_WORKER_AGENT_ID,
        },
        list: [
          {
            id: "main",
            workspace: "/tmp/workspace-main",
            executionStyle: "orchestrator",
            executionWorkerAgentId: MAIN_WORKER_AGENT_ID,
          },
          ...createStarterTeamAgents(),
        ],
      },
      teams: {
        list: [createMainOrchestrationTeamConfig(), createStarterTeamConfig()],
      },
    });

    const result = await spawnSubagentDirect(
      {
        task: "Build a polished responsive web app with visual design and accessibility review.",
        agentId: MAIN_WORKER_AGENT_ID,
      },
      {
        agentSessionKey: "main",
        agentChannel: "telegram",
        agentAccountId: "123",
        agentTo: "456",
        workspaceDir: "/tmp/requester-workspace",
      },
    );

    expect(result).toMatchObject({
      status: "forbidden",
      error: expect.stringContaining('teams_run with teamId="vibe-coder"'),
    });
  });

  it("resolves same-team specialist spawns by label for team managers", async () => {
    hoisted.configOverride = createConfigOverride({
      agents: {
        list: createStarterTeamAgents(),
      },
      teams: {
        list: [{ ...createStarterTeamConfig(), implicitForManagerSessions: true }],
      },
    });

    const result = await spawnSubagentDirect(
      {
        task: "Produce the architecture package for the task.",
        label: "system architect",
      },
      {
        agentSessionKey: "agent:vibe-coder-manager:main",
        agentChannel: "telegram",
        agentAccountId: "123",
        agentTo: "456",
        workspaceDir: "/tmp/requester-workspace",
      },
    );

    expect(result.status).toBe("accepted");
    expect(result.childSessionKey).toMatch(/^agent:vibe-coder-system-architect:subagent:/);
    const patchCall = hoisted.callGatewayMock.mock.calls
      .map((call) => call[0] as { method?: string; params?: Record<string, unknown> })
      .find(
        (entry) =>
          entry.method === "sessions.patch" &&
          entry.params?.teamId === STARTER_TEAM_ID &&
          entry.params?.teamRole === "system architect",
      );
    expect(patchCall?.params).toBeTruthy();
  });

  it("forbids team-manager specialist spawns that do not resolve to a configured specialist", async () => {
    hoisted.configOverride = createConfigOverride({
      agents: {
        list: createStarterTeamAgents(),
      },
      teams: {
        list: [{ ...createStarterTeamConfig(), implicitForManagerSessions: true }],
      },
    });

    const result = await spawnSubagentDirect(
      {
        task: "Do the next specialist thing.",
        label: "mystery role",
      },
      {
        agentSessionKey: "agent:vibe-coder-manager:main",
        agentChannel: "telegram",
        agentAccountId: "123",
        agentTo: "456",
        workspaceDir: "/tmp/requester-workspace",
      },
    );

    expect(result).toMatchObject({
      status: "forbidden",
      error: expect.stringContaining("Team managers must target a configured specialist"),
    });
    expect(result.error).toContain("system architect -> vibe-coder-system-architect");
  });

  it("resolves configured specialist labels for custom user-defined teams", async () => {
    hoisted.configOverride = createConfigOverride({
      agents: {
        list: [
          { id: "studio-manager", workspace: "/tmp/workspace-studio-manager" },
          { id: "interaction-planner", workspace: "/tmp/workspace-interaction-planner" },
          { id: "delivery-designer", workspace: "/tmp/workspace-delivery-designer" },
        ],
      },
      teams: {
        list: [
          {
            id: "studio",
            name: "Studio",
            managerAgentId: "studio-manager",
            implicitForManagerSessions: true,
            members: [
              { agentId: "interaction-planner", role: "interaction planner" },
              { agentId: "delivery-designer", role: "delivery designer" },
            ],
            workflows: [{ id: "default", default: true }],
          },
        ],
      },
    });

    const result = await spawnSubagentDirect(
      {
        task: "Create the interaction plan.",
        label: "interaction planner",
      },
      {
        agentSessionKey: "agent:studio-manager:main",
        agentChannel: "telegram",
        agentAccountId: "123",
        agentTo: "456",
        workspaceDir: "/tmp/requester-workspace",
      },
    );

    expect(result.status).toBe("accepted");
    expect(result.childSessionKey).toMatch(/^agent:interaction-planner:subagent:/);
    const patchCall = hoisted.callGatewayMock.mock.calls
      .map((call) => call[0] as { method?: string; params?: Record<string, unknown> })
      .find(
        (entry) =>
          entry.method === "sessions.patch" &&
          entry.params?.teamId === "studio" &&
          entry.params?.teamRole === "interaction planner",
      );
    expect(patchCall?.params).toBeTruthy();
  });

  it("deletes the provisional child session when a non-thread subagent start fails", async () => {
    hoisted.callGatewayMock.mockImplementation(
      async (request: {
        method?: string;
        params?: { key?: string; deleteTranscript?: boolean; emitLifecycleHooks?: boolean };
      }) => {
        if (request.method === "sessions.patch") {
          return { ok: true };
        }
        if (request.method === "agent") {
          throw new Error("spawn startup failed");
        }
        if (request.method === "sessions.delete") {
          return { ok: true };
        }
        return {};
      },
    );

    const result = await spawnSubagentDirect(
      {
        task: "fail after provisional session creation",
      },
      {
        agentSessionKey: "agent:main:main",
        agentChannel: "discord",
        agentAccountId: "acct-1",
        agentTo: "user-1",
        workspaceDir: "/tmp/requester-workspace",
      },
    );

    expect(result).toMatchObject({
      status: "error",
      error: "spawn startup failed",
    });
    expect(result.childSessionKey).toMatch(/^agent:main:subagent:/);
    expect(hoisted.registerSubagentRunMock).not.toHaveBeenCalled();

    const deleteCall = hoisted.callGatewayMock.mock.calls.find(
      ([request]) => (request as { method?: string }).method === "sessions.delete",
    )?.[0] as
      | {
          params?: {
            key?: string;
            deleteTranscript?: boolean;
            emitLifecycleHooks?: boolean;
          };
        }
      | undefined;

    expect(deleteCall?.params).toMatchObject({
      key: result.childSessionKey,
      deleteTranscript: true,
      emitLifecycleHooks: false,
    });
  });

  it("keeps lifecycle hooks enabled when registerSubagentRun fails after thread binding succeeds", async () => {
    hoisted.hookRunner.hasHooks.mockImplementation((name?: string) => name === "subagent_spawning");
    hoisted.hookRunner.runSubagentSpawning.mockResolvedValue({
      status: "ok",
      threadBindingReady: true,
    });
    hoisted.registerSubagentRunMock.mockImplementation(() => {
      throw new Error("registry unavailable");
    });
    hoisted.callGatewayMock.mockImplementation(
      async (request: {
        method?: string;
        params?: { key?: string; deleteTranscript?: boolean; emitLifecycleHooks?: boolean };
      }) => {
        if (request.method === "sessions.patch") {
          return { ok: true };
        }
        if (request.method === "agent") {
          return { runId: "run-thread-register-fail" };
        }
        if (request.method === "sessions.delete") {
          return { ok: true };
        }
        return {};
      },
    );

    const result = await spawnSubagentDirect(
      {
        task: "fail after register with thread binding",
        thread: true,
        mode: "session",
      },
      {
        agentSessionKey: "agent:main:main",
        agentChannel: "discord",
        agentAccountId: "acct-1",
        agentTo: "user-1",
        workspaceDir: "/tmp/requester-workspace",
      },
    );

    expect(result).toMatchObject({
      status: "error",
      error: "Failed to register subagent run: registry unavailable",
      childSessionKey: expect.stringMatching(/^agent:main:subagent:/),
      runId: "run-thread-register-fail",
    });

    const deleteCall = hoisted.callGatewayMock.mock.calls.findLast(
      ([request]) => (request as { method?: string }).method === "sessions.delete",
    )?.[0] as
      | {
          params?: {
            key?: string;
            deleteTranscript?: boolean;
            emitLifecycleHooks?: boolean;
          };
        }
      | undefined;

    expect(deleteCall?.params).toMatchObject({
      key: result.childSessionKey,
      deleteTranscript: true,
      emitLifecycleHooks: true,
    });
  });
});

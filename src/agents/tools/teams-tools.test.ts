import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  const spawnSubagentDirectMock = vi.fn();
  const callGatewayMock = vi.fn();
  const countPendingDescendantRunsMock = vi.fn();
  const getLatestSubagentRunByChildSessionKeyMock = vi.fn();
  const handoffSubagentCompletionToRequesterMock = vi.fn();
  const listDescendantRunsForRequesterMock = vi.fn();
  const resolveSessionTeamContextMock = vi.fn();
  const materializeGeneratedTeamProgramMock = vi.fn();
  return {
    spawnSubagentDirectMock,
    callGatewayMock,
    countPendingDescendantRunsMock,
    getLatestSubagentRunByChildSessionKeyMock,
    handoffSubagentCompletionToRequesterMock,
    listDescendantRunsForRequesterMock,
    resolveSessionTeamContextMock,
    materializeGeneratedTeamProgramMock,
  };
});

let createTeamsListTool: typeof import("./teams-list-tool.js").createTeamsListTool;
let createTeamsRunTool: typeof import("./teams-run-tool.js").createTeamsRunTool;

async function loadFreshTeamsToolsModuleForTest() {
  vi.resetModules();
  vi.doMock("../subagent-spawn.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../subagent-spawn.js")>();
    return {
      ...actual,
      spawnSubagentDirect: (...args: unknown[]) => hoisted.spawnSubagentDirectMock(...args),
    };
  });
  vi.doMock("../../gateway/call.js", () => ({
    callGateway: (...args: unknown[]) => hoisted.callGatewayMock(...args),
  }));
  vi.doMock("../subagent-registry.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../subagent-registry.js")>();
    return {
      ...actual,
      countPendingDescendantRuns: (...args: unknown[]) =>
        hoisted.countPendingDescendantRunsMock(...args),
      getLatestSubagentRunByChildSessionKey: (...args: unknown[]) =>
        hoisted.getLatestSubagentRunByChildSessionKeyMock(...args),
      handoffSubagentCompletionToRequester: (...args: unknown[]) =>
        hoisted.handoffSubagentCompletionToRequesterMock(...args),
      listDescendantRunsForRequester: (...args: unknown[]) =>
        hoisted.listDescendantRunsForRequesterMock(...args),
    };
  });
  vi.doMock("../../teams/runtime.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../teams/runtime.js")>();
    return {
      ...actual,
      resolveSessionTeamContext: (...args: unknown[]) =>
        hoisted.resolveSessionTeamContextMock(...args),
      materializeGeneratedTeamProgram: (...args: unknown[]) =>
        hoisted.materializeGeneratedTeamProgramMock(...args),
    };
  });
  ({ createTeamsListTool } = await import("./teams-list-tool.js"));
  ({ createTeamsRunTool } = await import("./teams-run-tool.js"));
}

const TEST_CONFIG = {
  agents: {
    list: [
      { id: "main", name: "Main" },
      { id: "alpha-manager", name: "Alpha Manager" },
      { id: "alpha-coder", name: "Alpha Coder" },
      { id: "beta-manager", name: "Beta Manager" },
      { id: "gamma-manager", name: "Gamma Manager" },
    ],
  },
  teams: {
    list: [
      {
        id: "alpha",
        name: "Alpha",
        managerAgentId: "alpha-manager",
        members: [{ agentId: "alpha-coder", role: "coder" }],
        crossTeamLinks: [{ type: "team", targetId: "beta" }],
        workflows: [
          {
            id: "default",
            name: "Default Workflow",
            default: true,
          },
          {
            id: "feature-build",
            name: "Feature Build",
            description: "Build product features with coding specialists.",
          },
        ],
      },
      {
        id: "beta",
        name: "Beta",
        managerAgentId: "beta-manager",
        members: [],
        crossTeamLinks: [],
        workflows: [{ id: "default", default: true }],
      },
      {
        id: "gamma",
        name: "Gamma",
        managerAgentId: "gamma-manager",
        members: [],
        crossTeamLinks: [],
        workflows: [{ id: "default", default: true }],
      },
    ],
  },
};

describe("teams tools", () => {
  beforeEach(async () => {
    hoisted.spawnSubagentDirectMock.mockReset().mockResolvedValue({
      status: "accepted",
      childSessionKey: "agent:alpha-manager:subagent:1",
      runId: "run-team-1",
    });
    hoisted.callGatewayMock.mockReset().mockImplementation(async (request: unknown) => {
      const params = request as { method?: string };
      if (params.method === "agent.wait") {
        return { status: "ok" };
      }
      if (params.method === "chat.history") {
        return {
          messages: [
            {
              role: "assistant",
              content: [{ type: "text", text: "Team reply" }],
            },
          ],
        };
      }
      return {};
    });
    hoisted.countPendingDescendantRunsMock.mockReset().mockReturnValue(0);
    hoisted.getLatestSubagentRunByChildSessionKeyMock.mockReset().mockImplementation(
      (sessionKey: string) => ({
        runId: "run-team-1",
        childSessionKey: sessionKey,
        createdAt: 1,
        endedAt: 2,
        cleanupCompletedAt: 3,
      }),
    );
    hoisted.handoffSubagentCompletionToRequesterMock.mockReset().mockReturnValue(true);
    hoisted.listDescendantRunsForRequesterMock.mockReset().mockReturnValue([]);
    hoisted.resolveSessionTeamContextMock.mockReset().mockReturnValue(undefined);
    hoisted.materializeGeneratedTeamProgramMock.mockReset().mockResolvedValue({
      ok: true,
      team: TEST_CONFIG.teams.list[0],
      workflow: TEST_CONFIG.teams.list[0].workflows[1],
      program: 'agent manager:\n  prompt: "Run the team"',
      absolutePath: "/tmp/.maumau/teams/alpha/feature-build.generated.prose",
      relativePath: ".maumau/teams/alpha/feature-build.generated.prose",
    });
    await loadFreshTeamsToolsModuleForTest();
  });

  afterEach(() => {
    vi.doUnmock("../subagent-spawn.js");
    vi.doUnmock("../../gateway/call.js");
    vi.doUnmock("../subagent-registry.js");
    vi.doUnmock("../../teams/runtime.js");
    vi.resetModules();
  });

  it("lists configured teams with per-team runnable status", async () => {
    hoisted.resolveSessionTeamContextMock.mockReturnValue({
      teamId: "alpha",
      teamRole: "manager",
      team: TEST_CONFIG.teams.list[0],
    });

    const tool = createTeamsListTool({
      agentSessionKey: "agent:alpha-manager:main",
      config: TEST_CONFIG,
    });

    const result = await tool.execute("call-list", {});
    expect(result.details).toMatchObject({
      currentTeamId: "alpha",
      currentTeamRole: "manager",
    });
    expect((result.details as { teams?: Array<{ id: string; runnable: boolean }> }).teams).toEqual([
      expect.objectContaining({
        id: "alpha",
        runnable: true,
        workflows: [
          expect.objectContaining({ id: "default", default: true }),
          expect.objectContaining({ id: "feature-build", name: "Feature Build" }),
        ],
      }),
      expect.objectContaining({ id: "beta", runnable: true }),
      expect.objectContaining({ id: "gamma", runnable: false }),
    ]);
  });

  it("runs a team by spawning the manager with generated OpenProse context", async () => {
    const tool = createTeamsRunTool({
      agentSessionKey: "main",
      config: TEST_CONFIG,
      callGateway: (request) => hoisted.callGatewayMock(request),
      subagentRegistry: {
        countPendingDescendantRuns: (sessionKey) =>
          hoisted.countPendingDescendantRunsMock(sessionKey),
        getLatestSubagentRunByChildSessionKey: (sessionKey) =>
          hoisted.getLatestSubagentRunByChildSessionKeyMock(sessionKey),
        handoffSubagentCompletionToRequester: (runId) =>
          hoisted.handoffSubagentCompletionToRequesterMock(runId),
        listDescendantRunsForRequester: (sessionKey) =>
          hoisted.listDescendantRunsForRequesterMock(sessionKey),
      },
    });

    const result = await tool.execute("call-run", {
      teamId: "alpha",
      workflowId: "feature-build",
      task: "Build the feature",
      timeoutSeconds: 1,
    });

    expect(result.details).toMatchObject({
      status: "ok",
      teamId: "alpha",
      workflowId: "feature-build",
      executionRuntime: "openprose",
      managerSessionKey: expect.any(String),
      runId: expect.any(String),
      reply: "Team reply",
      usedAgentIds: ["alpha-manager"],
      qaApprovedBy: [],
      contractSatisfied: true,
      blockingReasons: [],
    });
    expect(hoisted.spawnSubagentDirectMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        agentId: "alpha-manager",
        intent: "team_manager",
        suppressRequesterAnnounce: true,
        skipAllowAgentsCheck: true,
        sessionPatch: {
          subagentMaxSpawnDepth: 2,
          teamId: "alpha",
          teamRole: "manager",
        },
        task: expect.stringContaining("Workflow: Feature Build (feature-build)"),
      }),
      expect.objectContaining({
        agentSessionKey: "main",
      }),
    );
    expect(hoisted.spawnSubagentDirectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        task: expect.stringContaining(
          "prose run .maumau/teams/alpha/feature-build.generated.prose",
        ),
      }),
      expect.anything(),
    );
    expect(hoisted.spawnSubagentDirectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        task: expect.stringContaining(
          "Manager-only work, self-review, or commentary does not satisfy required role participation.",
        ),
      }),
      expect.anything(),
    );
  });

  it("enables late completion handoff when teams_run returns immediately", async () => {
    const tool = createTeamsRunTool({
      agentSessionKey: "main",
      config: TEST_CONFIG,
      callGateway: (request) => hoisted.callGatewayMock(request),
      subagentRegistry: {
        countPendingDescendantRuns: (sessionKey) =>
          hoisted.countPendingDescendantRunsMock(sessionKey),
        getLatestSubagentRunByChildSessionKey: (sessionKey) =>
          hoisted.getLatestSubagentRunByChildSessionKeyMock(sessionKey),
        handoffSubagentCompletionToRequester: (runId) =>
          hoisted.handoffSubagentCompletionToRequesterMock(runId),
        listDescendantRunsForRequester: (sessionKey) =>
          hoisted.listDescendantRunsForRequesterMock(sessionKey),
      },
    });

    const result = await tool.execute("call-run", {
      teamId: "alpha",
      workflowId: "feature-build",
      task: "Build the feature",
      timeoutSeconds: 0,
    });

    expect(result.details).toMatchObject({
      status: "accepted",
      teamId: "alpha",
      workflowId: "feature-build",
      managerSessionKey: "agent:alpha-manager:subagent:1",
      runId: "run-team-1",
    });
    expect(hoisted.handoffSubagentCompletionToRequesterMock).toHaveBeenCalledWith("run-team-1");
  });

  it("follows manager wake continuations before grading the team contract", async () => {
    let waitCalls = 0;
    hoisted.callGatewayMock.mockImplementation(async (request: unknown) => {
      const params = request as { method?: string };
      if (params.method === "agent.wait") {
        waitCalls += 1;
        return { status: "ok" };
      }
      if (params.method === "chat.history") {
        return {
          messages: [
            {
              role: "assistant",
              content: [{ type: "text", text: "Team reply" }],
            },
          ],
        };
      }
      return {};
    });
    hoisted.getLatestSubagentRunByChildSessionKeyMock.mockImplementation((sessionKey: string) => {
      if (waitCalls === 0) {
        return {
          runId: "run-team-1",
          childSessionKey: sessionKey,
          createdAt: 1,
          endedAt: 2,
          wakeOnDescendantSettle: true,
        };
      }
      return {
        runId: "run-team-2",
        childSessionKey: sessionKey,
        createdAt: 3,
        endedAt: 4,
        cleanupCompletedAt: 5,
      };
    });
    hoisted.listDescendantRunsForRequesterMock.mockReturnValue([
      {
        childSessionKey: "agent:alpha-coder:subagent:child-1",
        createdAt: 6,
      },
    ]);

    const tool = createTeamsRunTool({
      agentSessionKey: "main",
      config: TEST_CONFIG,
      callGateway: (request) => hoisted.callGatewayMock(request),
      subagentRegistry: {
        countPendingDescendantRuns: (sessionKey) =>
          hoisted.countPendingDescendantRunsMock(sessionKey),
        getLatestSubagentRunByChildSessionKey: (sessionKey) =>
          hoisted.getLatestSubagentRunByChildSessionKeyMock(sessionKey),
        handoffSubagentCompletionToRequester: (runId) =>
          hoisted.handoffSubagentCompletionToRequesterMock(runId),
        listDescendantRunsForRequester: (sessionKey) =>
          hoisted.listDescendantRunsForRequesterMock(sessionKey),
      },
    });

    const result = await tool.execute("call-run", {
      teamId: "alpha",
      workflowId: "feature-build",
      task: "Build the feature",
      timeoutSeconds: 2,
    });

    expect(result.details).toMatchObject({
      status: "ok",
      usedAgentIds: ["alpha-manager", "alpha-coder"],
    });
    expect(
      hoisted.callGatewayMock.mock.calls
        .map(([request]) => request as { method?: string; params?: { runId?: string } })
        .filter((request) => request.method === "agent.wait")
        .map((request) => request.params?.runId),
    ).toEqual(["run-team-1", "run-team-2"]);
  });

  it("grades team contracts from preserved run metadata after child cleanup deletes the session", async () => {
    const contractConfig = {
      agents: {
        list: [
          { id: "main", name: "Main" },
          { id: "alpha-manager", name: "Alpha Manager" },
          { id: "alpha-coder", name: "Alpha Coder" },
          { id: "alpha-qa", name: "Alpha QA" },
        ],
      },
      teams: {
        list: [
          {
            id: "alpha",
            name: "Alpha",
            managerAgentId: "alpha-manager",
            members: [
              { agentId: "alpha-coder", role: "coder" },
              { agentId: "alpha-qa", role: "technical qa" },
            ],
            crossTeamLinks: [],
            workflows: [
              {
                id: "feature-build",
                name: "Feature Build",
                default: true,
                contract: {
                  requiredRoles: ["coder", "technical qa"],
                  requiredQaRoles: ["technical qa"],
                  requireDelegation: true,
                },
              },
            ],
          },
        ],
      },
    };
    hoisted.materializeGeneratedTeamProgramMock.mockResolvedValue({
      ok: true,
      team: contractConfig.teams.list[0],
      workflow: contractConfig.teams.list[0].workflows[0],
      program: 'agent manager:\n  prompt: "Run the team"',
      absolutePath: "/tmp/.maumau/teams/alpha/feature-build.generated.prose",
      relativePath: ".maumau/teams/alpha/feature-build.generated.prose",
    });
    hoisted.listDescendantRunsForRequesterMock.mockReturnValue([
      {
        childSessionKey: "agent:alpha-coder:subagent:coder-1",
        createdAt: 10,
        endedAt: 11,
        cleanupCompletedAt: 12,
        teamRole: "coder",
      },
      {
        childSessionKey: "agent:alpha-qa:subagent:qa-1",
        createdAt: 13,
        endedAt: 14,
        cleanupCompletedAt: 15,
        teamRole: "technical qa",
        frozenResultText: "QA_APPROVAL: approved",
      },
    ]);

    const tool = createTeamsRunTool({
      agentSessionKey: "main",
      config: contractConfig,
      callGateway: (request) => hoisted.callGatewayMock(request),
      subagentRegistry: {
        countPendingDescendantRuns: (sessionKey) =>
          hoisted.countPendingDescendantRunsMock(sessionKey),
        getLatestSubagentRunByChildSessionKey: (sessionKey) =>
          hoisted.getLatestSubagentRunByChildSessionKeyMock(sessionKey),
        handoffSubagentCompletionToRequester: (runId) =>
          hoisted.handoffSubagentCompletionToRequesterMock(runId),
        listDescendantRunsForRequester: (sessionKey) =>
          hoisted.listDescendantRunsForRequesterMock(sessionKey),
      },
    });

    const result = await tool.execute("call-run-contract-audit", {
      teamId: "alpha",
      workflowId: "feature-build",
      task: "Build the feature",
      timeoutSeconds: 1,
    });

    expect(result.details).toMatchObject({
      status: "ok",
      usedAgentIds: ["alpha-manager", "alpha-coder", "alpha-qa"],
      qaApprovedBy: ["alpha-qa"],
      contractSatisfied: true,
      blockingReasons: [],
    });
  });

  it("returns waiting_timed_out when it stops waiting but the team run is still active", async () => {
    hoisted.callGatewayMock.mockImplementation(async (request: unknown) => {
      const params = request as { method?: string };
      if (params.method === "agent.wait") {
        return { status: "timeout" };
      }
      if (params.method === "chat.history") {
        return { messages: [] };
      }
      return {};
    });
    hoisted.getLatestSubagentRunByChildSessionKeyMock.mockImplementation((sessionKey: string) => ({
      runId: "run-team-1",
      childSessionKey: sessionKey,
      createdAt: 1,
    }));
    hoisted.countPendingDescendantRunsMock.mockReturnValue(2);

    const tool = createTeamsRunTool({
      agentSessionKey: "main",
      config: TEST_CONFIG,
      callGateway: (request) => hoisted.callGatewayMock(request),
      subagentRegistry: {
        countPendingDescendantRuns: (sessionKey) =>
          hoisted.countPendingDescendantRunsMock(sessionKey),
        getLatestSubagentRunByChildSessionKey: (sessionKey) =>
          hoisted.getLatestSubagentRunByChildSessionKeyMock(sessionKey),
        handoffSubagentCompletionToRequester: (runId) =>
          hoisted.handoffSubagentCompletionToRequesterMock(runId),
        listDescendantRunsForRequester: (sessionKey) =>
          hoisted.listDescendantRunsForRequesterMock(sessionKey),
      },
    });

    const result = await tool.execute("call-run-timeout", {
      teamId: "alpha",
      workflowId: "feature-build",
      task: "Build the feature",
      timeoutSeconds: 1,
    });

    expect(result.details).toMatchObject({
      status: "waiting_timed_out",
      teamId: "alpha",
      workflowId: "feature-build",
      executionRuntime: "openprose",
      runSettled: false,
      teamRunStatus: "running",
      waitTimedOutAfterSeconds: 1,
      lateCompletionDelivery: "enabled",
      pendingDescendantRuns: 2,
      managerRunEnded: false,
      managerCleanupCompleted: false,
      managerWakePending: false,
      currentRunId: "run-team-1",
    });
    expect(hoisted.handoffSubagentCompletionToRequesterMock).toHaveBeenCalledWith("run-team-1");
  });

  it("hands late completion delivery to the latest manager continuation run after wake", async () => {
    hoisted.callGatewayMock.mockImplementation(async (request: unknown) => {
      const params = request as { method?: string };
      if (params.method === "agent.wait") {
        return { status: "timeout" };
      }
      if (params.method === "chat.history") {
        return { messages: [] };
      }
      return {};
    });
    hoisted.getLatestSubagentRunByChildSessionKeyMock.mockImplementation((sessionKey: string) => ({
      runId: "run-team-2:wake",
      childSessionKey: sessionKey,
      createdAt: 2,
      endedAt: 3,
      wakeOnDescendantSettle: false,
    }));
    hoisted.countPendingDescendantRunsMock.mockReturnValue(1);
    hoisted.handoffSubagentCompletionToRequesterMock.mockImplementation((runId: string) =>
      runId === "run-team-2:wake",
    );

    const tool = createTeamsRunTool({
      agentSessionKey: "main",
      config: TEST_CONFIG,
      callGateway: (request) => hoisted.callGatewayMock(request),
      subagentRegistry: {
        countPendingDescendantRuns: (sessionKey) =>
          hoisted.countPendingDescendantRunsMock(sessionKey),
        getLatestSubagentRunByChildSessionKey: (sessionKey) =>
          hoisted.getLatestSubagentRunByChildSessionKeyMock(sessionKey),
        handoffSubagentCompletionToRequester: (runId) =>
          hoisted.handoffSubagentCompletionToRequesterMock(runId),
        listDescendantRunsForRequester: (sessionKey) =>
          hoisted.listDescendantRunsForRequesterMock(sessionKey),
      },
    });

    const result = await tool.execute("call-run-timeout-wake", {
      teamId: "alpha",
      workflowId: "feature-build",
      task: "Build the feature",
      timeoutSeconds: 1,
    });

    expect(result.details).toMatchObject({
      status: "waiting_timed_out",
      currentRunId: "run-team-2:wake",
      lateCompletionDelivery: "enabled",
    });
    expect(hoisted.handoffSubagentCompletionToRequesterMock).toHaveBeenNthCalledWith(
      1,
      "run-team-2:wake",
    );
    expect(hoisted.handoffSubagentCompletionToRequesterMock).not.toHaveBeenCalledWith(
      "run-team-1",
    );
  });
});

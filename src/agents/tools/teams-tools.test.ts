import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  const spawnSubagentDirectMock = vi.fn();
  const callGatewayMock = vi.fn();
  const resolveSessionTeamContextMock = vi.fn();
  const materializeGeneratedTeamProgramMock = vi.fn();
  return {
    spawnSubagentDirectMock,
    callGatewayMock,
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
      managerSessionKey: expect.any(String),
      runId: expect.any(String),
      reply: "Team reply",
    });
    expect(hoisted.spawnSubagentDirectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "alpha-manager",
        skipAllowAgentsCheck: true,
        sessionPatch: {
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
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDesignStudioTeamConfig,
  createMainOrchestrationTeamConfig,
  createStarterTeamConfig,
  DESIGN_STUDIO_TEAM_MANAGER_AGENT_ID,
  MAIN_WORKER_AGENT_ID,
  STARTER_TEAM_MANAGER_AGENT_ID,
} from "./presets.js";

const hoisted = vi.hoisted(() => ({
  loadSessionEntryMock: vi.fn(),
}));

vi.mock("../gateway/session-utils.js", () => ({
  loadSessionEntry: (...args: unknown[]) => hoisted.loadSessionEntryMock(...args),
}));

let resolveSessionTeamContext: typeof import("./runtime.js").resolveSessionTeamContext;
let resolvePreferredTeamRunTarget: typeof import("./runtime.js").resolvePreferredTeamRunTarget;

const TEST_CONFIG = {
  agents: {
    list: [{ id: "main" }, { id: MAIN_WORKER_AGENT_ID }, { id: STARTER_TEAM_MANAGER_AGENT_ID }],
  },
  teams: {
    list: [
      createMainOrchestrationTeamConfig(),
      createStarterTeamConfig(),
      createDesignStudioTeamConfig(),
    ],
  },
};

describe("resolveSessionTeamContext", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.doMock("../gateway/session-utils.js", () => ({
      loadSessionEntry: (...args: unknown[]) => hoisted.loadSessionEntryMock(...args),
    }));
    ({ resolvePreferredTeamRunTarget, resolveSessionTeamContext } = await import("./runtime.js"));
    hoisted.loadSessionEntryMock.mockReset().mockReturnValue({ entry: {} });
  });

  it("infers the bundled root team for main manager sessions", () => {
    const result = resolveSessionTeamContext({
      cfg: TEST_CONFIG,
      sessionKey: "main",
    });

    expect(result).toMatchObject({
      teamId: "main",
      teamRole: "manager",
      sessionAgentId: "main",
      team: expect.objectContaining({
        id: "main",
        managerAgentId: "main",
        implicitForManagerSessions: true,
      }),
    });
  });

  it("does not infer a team for member sessions without explicit team metadata", () => {
    const result = resolveSessionTeamContext({
      cfg: TEST_CONFIG,
      sessionKey: `agent:${MAIN_WORKER_AGENT_ID}:main`,
    });

    expect(result).toBeUndefined();
  });

  it("prefers explicit team metadata over the implicit root team", () => {
    hoisted.loadSessionEntryMock.mockReturnValue({
      entry: {
        teamId: "vibe-coder",
        teamRole: "manager",
      },
    });

    const result = resolveSessionTeamContext({
      cfg: TEST_CONFIG,
      sessionKey: "main",
    });

    expect(result).toMatchObject({
      teamId: "vibe-coder",
      teamRole: "manager",
      sessionAgentId: "main",
      team: expect.objectContaining({
        id: "vibe-coder",
        managerAgentId: STARTER_TEAM_MANAGER_AGENT_ID,
      }),
    });
  });

  it("resolves UI specialist routing through the root team's linked teams", () => {
    const cfg = {
      ...TEST_CONFIG,
      agents: {
        list: [
          ...TEST_CONFIG.agents.list,
          { id: "product-studio-manager" },
          { id: "product-studio-system-architect" },
          { id: "product-studio-developer" },
          { id: "product-studio-ui-ux-designer" },
          { id: "product-studio-content-visual-designer" },
          { id: "product-studio-technical-qa" },
          { id: "product-studio-visual-ux-qa" },
        ],
      },
      teams: {
        list: [
          {
            ...createMainOrchestrationTeamConfig(),
            crossTeamLinks: [{ type: "team", targetId: "product-studio" }],
          },
          {
            ...createStarterTeamConfig(),
            id: "product-studio",
            managerAgentId: "product-studio-manager",
            members: createStarterTeamConfig().members?.map((member) => ({
              ...member,
              agentId: member.agentId.replace("vibe-coder", "product-studio"),
            })),
          },
        ],
      },
    };

    const result = resolvePreferredTeamRunTarget({
      cfg,
      managerAgentId: "main",
      preference: "ui_human_facing",
    });

    expect(result).toMatchObject({
      ok: true,
      target: expect.objectContaining({
        managerAgentId: "product-studio-manager",
        team: expect.objectContaining({
          id: "product-studio",
        }),
      }),
    });
  });

  it("resolves design-asset routing through the linked design-studio team", () => {
    const result = resolvePreferredTeamRunTarget({
      cfg: TEST_CONFIG,
      managerAgentId: "main",
      preference: "design_assets",
    });

    expect(result).toMatchObject({
      ok: true,
      target: expect.objectContaining({
        managerAgentId: DESIGN_STUDIO_TEAM_MANAGER_AGENT_ID,
        team: expect.objectContaining({
          id: "design-studio",
        }),
      }),
    });
  });
});

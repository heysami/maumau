import { describe, expect, it } from "vitest";
import {
  MAIN_ORCHESTRATION_TEAM_ID,
  MAIN_WORKER_AGENT_ID,
  STARTER_TEAM_CONTENT_VISUAL_DESIGNER_AGENT_ID,
  STARTER_TEAM_DEVELOPER_AGENT_ID,
  STARTER_TEAM_ID,
  STARTER_TEAM_MANAGER_AGENT_ID,
  STARTER_TEAM_SYSTEM_ARCHITECT_AGENT_ID,
  STARTER_TEAM_TECHNICAL_QA_AGENT_ID,
  STARTER_TEAM_UI_UX_DESIGNER_AGENT_ID,
  STARTER_TEAM_VISUAL_UX_QA_AGENT_ID,
  applyStarterTeamOnFreshInstall,
  ensureStarterTeamConfig,
} from "./presets.js";

describe("ensureStarterTeamConfig", () => {
  it("creates main plus the bundled root team and vibe-coder team on a fresh config", () => {
    const result = ensureStarterTeamConfig({});

    expect(result.agents?.defaults).toMatchObject({
      executionStyle: "orchestrator",
      executionWorkerAgentId: MAIN_WORKER_AGENT_ID,
    });
    expect(result.agents?.list?.map((agent) => agent.id)).toEqual([
      "main",
      MAIN_WORKER_AGENT_ID,
      STARTER_TEAM_MANAGER_AGENT_ID,
      STARTER_TEAM_SYSTEM_ARCHITECT_AGENT_ID,
      STARTER_TEAM_DEVELOPER_AGENT_ID,
      STARTER_TEAM_UI_UX_DESIGNER_AGENT_ID,
      STARTER_TEAM_CONTENT_VISUAL_DESIGNER_AGENT_ID,
      STARTER_TEAM_TECHNICAL_QA_AGENT_ID,
      STARTER_TEAM_VISUAL_UX_QA_AGENT_ID,
    ]);
    expect(result.agents?.list?.find((agent) => agent.id === "main")).toMatchObject({
      default: true,
      executionStyle: "orchestrator",
      executionWorkerAgentId: MAIN_WORKER_AGENT_ID,
      subagents: {
        allowAgents: [MAIN_WORKER_AGENT_ID],
      },
      tools: {
        profile: "messaging",
        alsoAllow: expect.arrayContaining([
          "agents_list",
          "capabilities_list",
          "sessions_spawn",
          "teams_run",
        ]),
      },
    });
    expect(result.teams?.list).toHaveLength(2);
    expect(result.teams?.list?.[0]).toMatchObject({
      id: MAIN_ORCHESTRATION_TEAM_ID,
      managerAgentId: "main",
      implicitForManagerSessions: true,
      members: [{ agentId: MAIN_WORKER_AGENT_ID, role: "execution worker" }],
      crossTeamLinks: [{ type: "team", targetId: STARTER_TEAM_ID }],
      workflows: [
        expect.objectContaining({
          id: "default",
          default: true,
          description:
            "Root orchestration workflow for triage, delegation, and execution routing across bundled workers and linked teams.",
          managerPrompt: expect.stringContaining("root orchestrator"),
        }),
      ],
    });
    expect(result.teams?.list?.[1]).toMatchObject({
      id: STARTER_TEAM_ID,
      managerAgentId: STARTER_TEAM_MANAGER_AGENT_ID,
      description:
        "A starter staged manager-plus-specialists team for architecture, implementation, design, and QA work.",
      members: [
        { agentId: STARTER_TEAM_SYSTEM_ARCHITECT_AGENT_ID, role: "system architect" },
        { agentId: STARTER_TEAM_DEVELOPER_AGENT_ID, role: "developer" },
        { agentId: STARTER_TEAM_UI_UX_DESIGNER_AGENT_ID, role: "ui/ux designer" },
        {
          agentId: STARTER_TEAM_CONTENT_VISUAL_DESIGNER_AGENT_ID,
          role: "content/visual designer",
        },
        { agentId: STARTER_TEAM_TECHNICAL_QA_AGENT_ID, role: "technical qa" },
        { agentId: STARTER_TEAM_VISUAL_UX_QA_AGENT_ID, role: "visual/ux qa" },
      ],
      workflows: [
        expect.objectContaining({
          id: "default",
          default: true,
          description:
            "General-purpose stage-gated architecture, execution, and QA collaboration for the vibe-coder team.",
          managerPrompt: expect.stringContaining("QA verification"),
          contract: {
            requiredRoles: [
              "system architect",
              "developer",
              "ui/ux designer",
              "content/visual designer",
              "technical qa",
              "visual/ux qa",
            ],
            requiredQaRoles: ["technical qa", "visual/ux qa"],
            requireDelegation: true,
          },
        }),
      ],
    });
  });

  it("is idempotent when rerun", () => {
    const first = ensureStarterTeamConfig({});
    const second = ensureStarterTeamConfig(first);

    expect(second).toEqual(first);
    expect(second.agents?.list).toHaveLength(9);
    expect(second.teams?.list).toHaveLength(2);
  });

  it("upgrades an existing main agent into the starter orchestrator contract", () => {
    const result = ensureStarterTeamConfig({
      agents: {
        list: [{ id: "main", default: true, name: "Main" }],
      },
    });

    expect(result.agents?.list?.find((agent) => agent.id === "main")).toEqual(
      expect.objectContaining({
        id: "main",
        default: true,
        name: "Main",
        executionStyle: "orchestrator",
        executionWorkerAgentId: MAIN_WORKER_AGENT_ID,
        subagents: {
          allowAgents: [MAIN_WORKER_AGENT_ID],
        },
        tools: expect.objectContaining({
          profile: "messaging",
          alsoAllow: expect.arrayContaining([
            "sessions_spawn",
            "sessions_yield",
            "subagents",
            "teams_run",
          ]),
        }),
      }),
    );
  });

  it("adds main even when another agent already exists", () => {
    const result = ensureStarterTeamConfig({
      agents: {
        list: [{ id: "memory-curator", name: "Memory Curator" }],
      },
    });

    expect(result.agents?.list?.[0]).toEqual(
      expect.objectContaining({
        id: "main",
        executionStyle: "orchestrator",
        executionWorkerAgentId: MAIN_WORKER_AGENT_ID,
      }),
    );
  });
});

describe("applyStarterTeamOnFreshInstall", () => {
  it("does not rewrite existing installs unless explicitly marked fresh", () => {
    const base = {
      agents: {
        list: [{ id: "main", default: true }],
      },
    };

    expect(applyStarterTeamOnFreshInstall(base, { freshInstall: false })).toEqual(base);
    expect(applyStarterTeamOnFreshInstall(base)).toEqual(base);
  });
});

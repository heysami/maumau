import { describe, expect, it } from "vitest";
import {
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
  it("creates main plus the bundled vibe-coder team on a fresh config", () => {
    const result = ensureStarterTeamConfig({});

    expect(result.agents?.list?.map((agent) => agent.id)).toEqual([
      "main",
      STARTER_TEAM_MANAGER_AGENT_ID,
      STARTER_TEAM_SYSTEM_ARCHITECT_AGENT_ID,
      STARTER_TEAM_DEVELOPER_AGENT_ID,
      STARTER_TEAM_UI_UX_DESIGNER_AGENT_ID,
      STARTER_TEAM_CONTENT_VISUAL_DESIGNER_AGENT_ID,
      STARTER_TEAM_TECHNICAL_QA_AGENT_ID,
      STARTER_TEAM_VISUAL_UX_QA_AGENT_ID,
    ]);
    expect(result.agents?.list?.find((agent) => agent.id === "main")?.default).toBe(true);
    expect(result.teams?.list).toHaveLength(1);
    expect(result.teams?.list?.[0]).toMatchObject({
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
        }),
      ],
    });
  });

  it("is idempotent when rerun", () => {
    const first = ensureStarterTeamConfig({});
    const second = ensureStarterTeamConfig(first);

    expect(second).toEqual(first);
    expect(second.agents?.list).toHaveLength(8);
    expect(second.teams?.list).toHaveLength(1);
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

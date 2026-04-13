import { describe, expect, it } from "vitest";
import {
  DESIGN_STUDIO_TEAM_CONSISTENCY_QA_AGENT_ID,
  DESIGN_STUDIO_TEAM_ID,
  DESIGN_STUDIO_TEAM_IMAGE_VISUAL_DESIGNER_AGENT_ID,
  DESIGN_STUDIO_TEAM_MANAGER_AGENT_ID,
  DESIGN_STUDIO_TEAM_REQUIREMENTS_QA_AGENT_ID,
  DESIGN_STUDIO_TEAM_VECTOR_VISUAL_DESIGNER_AGENT_ID,
  ensureBundledTeamPresetConfig,
  LIFE_IMPROVEMENT_FINANCIAL_COACH_AGENT_ID,
  LIFE_IMPROVEMENT_TEAM_ID,
  LIFE_IMPROVEMENT_TEAM_MANAGER_AGENT_ID,
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
      DESIGN_STUDIO_TEAM_MANAGER_AGENT_ID,
      DESIGN_STUDIO_TEAM_VECTOR_VISUAL_DESIGNER_AGENT_ID,
      DESIGN_STUDIO_TEAM_IMAGE_VISUAL_DESIGNER_AGENT_ID,
      DESIGN_STUDIO_TEAM_REQUIREMENTS_QA_AGENT_ID,
      DESIGN_STUDIO_TEAM_CONSISTENCY_QA_AGENT_ID,
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
    expect(
      result.agents?.list?.find((agent) => agent.id === DESIGN_STUDIO_TEAM_MANAGER_AGENT_ID),
    ).toMatchObject({
      tools: {
        allow: expect.arrayContaining(["read", "sessions_spawn", "sessions_yield"]),
      },
    });
    expect(
      result.agents?.list?.find(
        (agent) => agent.id === DESIGN_STUDIO_TEAM_IMAGE_VISUAL_DESIGNER_AGENT_ID,
      ),
    ).toMatchObject({
      tools: {
        allow: expect.arrayContaining(["image_generate", "sessions_spawn", "sessions_yield"]),
      },
    });
    expect(
      result.agents?.list?.find(
        (agent) => agent.id === DESIGN_STUDIO_TEAM_VECTOR_VISUAL_DESIGNER_AGENT_ID,
      ),
    ).toEqual(
      expect.objectContaining({
        tools: expect.objectContaining({
          allow: expect.arrayContaining(["read", "sessions_spawn", "sessions_yield"]),
        }),
      }),
    );
    expect(
      result.agents?.list?.find(
        (agent) => agent.id === DESIGN_STUDIO_TEAM_VECTOR_VISUAL_DESIGNER_AGENT_ID,
      )?.tools?.allow,
    ).not.toEqual(expect.arrayContaining(["exec", "write", "edit", "apply_patch"]));
    expect(
      result.agents?.list?.find(
        (agent) => agent.id === DESIGN_STUDIO_TEAM_IMAGE_VISUAL_DESIGNER_AGENT_ID,
      )?.tools?.profile,
    ).toBeUndefined();
    expect(result.teams?.list).toHaveLength(3);
    expect(result.teams?.list?.[0]).toMatchObject({
      id: MAIN_ORCHESTRATION_TEAM_ID,
      managerAgentId: "main",
      implicitForManagerSessions: true,
      members: [{ agentId: MAIN_WORKER_AGENT_ID, role: "execution worker" }],
      crossTeamLinks: expect.arrayContaining([
        expect.objectContaining({ type: "team", targetId: STARTER_TEAM_ID }),
        expect.objectContaining({ type: "team", targetId: DESIGN_STUDIO_TEAM_ID }),
      ]),
      workflows: [
        expect.objectContaining({
          id: "default",
          default: true,
          description:
            "Root orchestration workflow for triage, delegation, and execution routing across bundled workers and linked teams.",
          managerPrompt: expect.stringMatching(
            /root orchestrator[\s\S]*choose vibe-coder first as the implementation owner[\s\S]*Choose design-studio first only when the requested deliverable is asset-only/u,
          ),
          lifecycle: expect.objectContaining({
            stages: expect.arrayContaining([
              expect.objectContaining({ id: "working", status: "in_progress" }),
            ]),
          }),
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
      crossTeamLinks: expect.arrayContaining([
        expect.objectContaining({ type: "team", targetId: DESIGN_STUDIO_TEAM_ID }),
      ]),
      workflows: [
        expect.objectContaining({
          id: "default",
          default: true,
          description:
            "General-purpose stage-gated architecture, execution, and QA collaboration for the vibe-coder team.",
          managerPrompt: expect.stringMatching(
            /QA verification[\s\S]*Vibe-coder is the implementation owner[\s\S]*prominent illustration, image, or hero visual[\s\S]*placeholder asset register[\s\S]*Do not satisfy those illustration requirements with vector art[\s\S]*emoji, Unicode symbols, letters, punctuation, or decorative glyphs[\s\S]*lack both a prominent visual anchor and meaningful icon use/u,
          ),
          lifecycle: expect.objectContaining({
            stages: expect.arrayContaining([
              expect.objectContaining({ id: "planning", status: "in_progress" }),
              expect.objectContaining({
                id: "architecture",
                status: "in_progress",
                roles: ["system architect"],
              }),
              expect.objectContaining({
                id: "execution",
                status: "in_progress",
                roles: ["developer", "ui/ux designer", "content/visual designer"],
              }),
              expect.objectContaining({
                id: "qa",
                status: "in_progress",
                roles: ["technical qa", "visual/ux qa"],
              }),
              expect.objectContaining({ id: "manager_confirmation", status: "review" }),
            ]),
          }),
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
    expect(result.teams?.list?.[2]).toMatchObject({
      id: DESIGN_STUDIO_TEAM_ID,
      managerAgentId: DESIGN_STUDIO_TEAM_MANAGER_AGENT_ID,
      description:
        "A bundled asset-design team for design exploration, asset manifests, vector/raster visual generation, and consistency-focused QA. It does not implement webpages, apps, or product code.",
      members: [
        {
          agentId: DESIGN_STUDIO_TEAM_VECTOR_VISUAL_DESIGNER_AGENT_ID,
          role: "vector visual designer",
        },
        {
          agentId: DESIGN_STUDIO_TEAM_IMAGE_VISUAL_DESIGNER_AGENT_ID,
          role: "image visual designer",
        },
        {
          agentId: DESIGN_STUDIO_TEAM_REQUIREMENTS_QA_AGENT_ID,
          role: "requirements qa",
        },
        {
          agentId: DESIGN_STUDIO_TEAM_CONSISTENCY_QA_AGENT_ID,
          role: "consistency qa",
        },
      ],
      workflows: [
        expect.objectContaining({
          id: "default",
          default: true,
          description:
            "Manager-led design exploration for visual asset requirements, option generation, and consistency-focused QA.",
          managerPrompt: expect.stringMatching(
            /This team is asset-only[\s\S]*source of truth for what assets exist[\s\S]*anything explicitly requested as an illustration[\s\S]*hero image or prominent decorative visual[\s\S]*actual icons and simple code-native graphic elements[\s\S]*Emoji, Unicode symbols, letters, punctuation, and decorative glyphs/u,
          ),
          lifecycle: expect.objectContaining({
            stages: expect.arrayContaining([
              expect.objectContaining({ id: "planning", status: "in_progress" }),
              expect.objectContaining({ id: "asset_manifest", status: "in_progress" }),
              expect.objectContaining({
                id: "production",
                status: "in_progress",
                roles: ["vector visual designer", "image visual designer"],
              }),
              expect.objectContaining({
                id: "qa",
                status: "in_progress",
                roles: ["requirements qa", "consistency qa"],
              }),
            ]),
          }),
          contract: {
            requiredRoles: [],
            requiredQaRoles: ["requirements qa", "consistency qa"],
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
    expect(second.agents?.list).toHaveLength(14);
    expect(second.teams?.list).toHaveLength(3);
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

  it("adds the life-improvement team alongside the starter defaults on fresh installs", () => {
    const result = applyStarterTeamOnFreshInstall({}, { freshInstall: true });

    expect(result.teams?.list?.map((team) => team.id)).toEqual(
      expect.arrayContaining([
        MAIN_ORCHESTRATION_TEAM_ID,
        STARTER_TEAM_ID,
        LIFE_IMPROVEMENT_TEAM_ID,
      ]),
    );
    expect(
      result.teams?.list
        ?.find((team) => team.id === MAIN_ORCHESTRATION_TEAM_ID)
        ?.crossTeamLinks?.map((link) => link.targetId),
    ).toEqual(
      expect.arrayContaining([STARTER_TEAM_ID, DESIGN_STUDIO_TEAM_ID, LIFE_IMPROVEMENT_TEAM_ID]),
    );
  });
});

describe("ensureBundledTeamPresetConfig", () => {
  it("adds the life-improvement preset without auto-installing other optional teams", () => {
    const result = ensureBundledTeamPresetConfig({}, LIFE_IMPROVEMENT_TEAM_ID);

    expect(result.agents?.list?.[0]).toMatchObject({
      id: "main",
      executionStyle: "orchestrator",
      executionWorkerAgentId: MAIN_WORKER_AGENT_ID,
    });
    expect(
      result.agents?.list?.find((agent) => agent.id === LIFE_IMPROVEMENT_TEAM_MANAGER_AGENT_ID),
    ).toMatchObject({
      tools: {
        allow: expect.arrayContaining([
          "read",
          "write",
          "memory_search",
          "sessions_spawn",
          "sessions_yield",
        ]),
      },
    });
    expect(
      result.agents?.list?.find((agent) => agent.id === LIFE_IMPROVEMENT_FINANCIAL_COACH_AGENT_ID),
    ).toMatchObject({
      tools: {
        allow: expect.arrayContaining(["browser", "read", "write", "memory_search"]),
      },
    });
    expect(result.agents?.list?.some((agent) => agent.id === STARTER_TEAM_MANAGER_AGENT_ID)).toBe(
      false,
    );
    expect(
      result.agents?.list?.some((agent) => agent.id === DESIGN_STUDIO_TEAM_MANAGER_AGENT_ID),
    ).toBe(false);

    expect(result.teams?.list?.map((team) => team.id)).toEqual([
      MAIN_ORCHESTRATION_TEAM_ID,
      LIFE_IMPROVEMENT_TEAM_ID,
    ]);
    expect(result.teams?.list?.[0]).toMatchObject({
      id: MAIN_ORCHESTRATION_TEAM_ID,
      crossTeamLinks: [
        expect.objectContaining({
          targetId: LIFE_IMPROVEMENT_TEAM_ID,
          type: "team",
        }),
      ],
    });
    expect(result.teams?.list?.[1]).toMatchObject({
      id: LIFE_IMPROVEMENT_TEAM_ID,
      name: "Life Improvement Team",
      managerAgentId: LIFE_IMPROVEMENT_TEAM_MANAGER_AGENT_ID,
      preset: {
        id: LIFE_IMPROVEMENT_TEAM_ID,
        source: "bundled",
      },
      workflows: [
        expect.objectContaining({
          id: "default",
          managerPrompt: expect.stringMatching(
            /first inspect existing app ideas[\s\S]*Only create a net-new app proposal[\s\S]*Update the existing app record instead of duplicating it/u,
          ),
          contract: expect.objectContaining({
            requiredRoles: expect.arrayContaining([
              "life & mindset coach",
              "research assistant",
              "accountability partner",
              "insight & pattern analyst",
              "personal knowledge manager",
            ]),
            requireDelegation: true,
          }),
        }),
      ],
    });
  });
});

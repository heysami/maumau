import { describe, expect, it } from "vitest";
import type { MaumauConfig } from "../config/config.js";
import {
  createDesignStudioTeamAgents,
  createDesignStudioTeamConfig,
  createMainOrchestrationTeamConfig,
  createStarterTeamAgents,
  createStarterTeamConfig,
  MAIN_WORKER_AGENT_ID,
} from "../teams/presets.js";
import {
  isExecutionWorkerAgentId,
  resolveExecutionRouteRequirement,
  shouldOmitCodingAgentSkillForRun,
  taskRequiresDesignAssetTeam,
  taskRequiresSpecialistUiTeam,
} from "./execution-routing.js";

function createReadyVibeCoderConfig(): MaumauConfig {
  return {
    agents: {
      defaults: {
        executionWorkerAgentId: MAIN_WORKER_AGENT_ID,
      },
      list: [
        {
          id: "main",
          executionStyle: "orchestrator",
          executionWorkerAgentId: MAIN_WORKER_AGENT_ID,
        },
        {
          id: MAIN_WORKER_AGENT_ID,
          tools: {
            profile: "coding",
          },
        },
        ...createStarterTeamAgents(),
        ...createDesignStudioTeamAgents(),
      ],
    },
    teams: {
      list: [
        createMainOrchestrationTeamConfig(),
        createStarterTeamConfig(),
        createDesignStudioTeamConfig(),
      ],
    },
  };
}

describe("execution-routing", () => {
  it("routes UI and human-facing build tasks to a specialist team", () => {
    expect(
      taskRequiresSpecialistUiTeam(
        "Build a responsive web app with polished UI, visual design, and accessibility review.",
      ),
    ).toBe(true);
    expect(
      taskRequiresSpecialistUiTeam(
        "Create a playable browser game with a themed interface and human-friendly interactions.",
      ),
    ).toBe(true);
  });

  it("keeps backend-only tasks off the specialist-team route", () => {
    expect(
      taskRequiresSpecialistUiTeam(
        "Fix the Postgres migration for the billing worker and update the queue retry logic.",
      ),
    ).toBe(false);
  });

  it("routes design-asset exploration tasks to the design-studio lane", () => {
    expect(
      taskRequiresDesignAssetTeam(
        "Explore icon and illustration options for the new brand asset pack and maintain visual consistency.",
      ),
    ).toBe(true);
    expect(
      taskRequiresDesignAssetTeam(
        "Create character portraits for the campaign cast and compare illustration options.",
      ),
    ).toBe(true);
  });

  it("reports the linked specialist team as ready for qualifying tasks", () => {
    const requirement = resolveExecutionRouteRequirement({
      cfg: createReadyVibeCoderConfig(),
      task: "Build a landing page with polished visuals and responsive UI.",
      agentId: "main",
    });

    expect(requirement).toEqual({
      kind: "team_openprose",
      requiresTeam: true,
      teamId: "vibe-coder",
      workflowId: "default",
      managerAgentId: "vibe-coder-manager",
      teamRuntime: "openprose",
      reason: "ui_human_facing",
      teamReady: true,
      blockingReasons: [],
    });
  });

  it("keeps the root manager route generic so root OpenProse can choose the linked team", () => {
    const requirement = resolveExecutionRouteRequirement({
      cfg: createReadyVibeCoderConfig(),
      task: "Build a landing page with polished visuals and responsive UI, then collaborate with the design team for any asset subsets that need deeper exploration.",
      agentId: "main",
      sessionKey: "main",
    });

    expect(requirement).toEqual({
      kind: "team_openprose",
      requiresTeam: true,
      teamRuntime: "openprose",
      reason: "ui_human_facing",
      teamReady: true,
      blockingReasons: [],
    });
  });

  it("routes asset-heavy design tasks to design-studio", () => {
    const requirement = resolveExecutionRouteRequirement({
      cfg: createReadyVibeCoderConfig(),
      task: "Generate a set of logo and illustration options, compare them, and keep the brand assets visually consistent.",
      agentId: "main",
    });

    expect(requirement).toEqual({
      kind: "team_openprose",
      requiresTeam: true,
      teamId: "design-studio",
      workflowId: "default",
      managerAgentId: "design-studio-manager",
      teamRuntime: "openprose",
      reason: "design_assets",
      teamReady: true,
      blockingReasons: [],
    });
  });

  it("keeps implemented webpage requests on vibe-coder even when they mention art or illustrations", () => {
    const requirement = resolveExecutionRouteRequirement({
      cfg: createReadyVibeCoderConfig(),
      task: "Create a mobile-friendly webpage for the cast, including character portraits and a polished illustrated theme.",
      agentId: "main",
    });

    expect(requirement).toEqual({
      kind: "team_openprose",
      requiresTeam: true,
      teamId: "vibe-coder",
      workflowId: "default",
      managerAgentId: "vibe-coder-manager",
      teamRuntime: "openprose",
      reason: "ui_human_facing",
      teamReady: true,
      blockingReasons: [],
    });
  });

  it("keeps collaborative implementation briefs on vibe-coder so it can call design-studio later", () => {
    const requirement = resolveExecutionRouteRequirement({
      cfg: createReadyVibeCoderConfig(),
      task: `Build a redesigned static webpage about Mistborn Era 1 main characters for a Telegram/mobile requester. The previous attempt failed because it had no actual visual design. This run should produce the full webpage implementation while collaborating with design-studio later for any asset subsets that need dedicated exploration.

Critical workflow rule:
- Design in code using intentional placeholder visual systems and explicit asset slots/specs.
- If future asset replacement would help, include a concise asset manifest in the output describing what each placeholder represents and how a design team could replace it later.

Core deliverable:
- A visually rich, art-directed static HTML page that feels like a premium fantasy editorial/character showcase.
- Deliver a previewable static artifact in the workspace and return a preview link.`,
      agentId: "main",
    });

    expect(requirement).toEqual({
      kind: "team_openprose",
      requiresTeam: true,
      teamId: "vibe-coder",
      workflowId: "default",
      managerAgentId: "vibe-coder-manager",
      teamRuntime: "openprose",
      reason: "ui_human_facing",
      teamReady: true,
      blockingReasons: [],
    });
  });

  it("keeps workspace bootstrap and persona markdown edits off specialist-team routing", () => {
    const requirement = resolveExecutionRouteRequirement({
      cfg: createReadyVibeCoderConfig(),
      task: "In /Users/example/.maumau/workspace, update the bootstrap/setup files based on this conversation. Update IDENTITY.md and USER.md, delete BOOTSTRAP.md if appropriate, create memory/2026-04-06.md and MEMORY.md if needed, and commit the changes in git.",
      agentId: "main",
    });

    expect(requirement).toEqual({
      kind: "none",
      requiresTeam: false,
      blockingReasons: [],
    });
  });

  it("chooses the root team's linked specialist team instead of a starter id shortcut", () => {
    const customTeam = {
      ...createStarterTeamConfig(),
      id: "product-studio",
      name: "Product Studio",
      managerAgentId: "product-studio-manager",
      members: createStarterTeamConfig().members?.map((member) => ({
        ...member,
        agentId: member.agentId.replace("vibe-coder", "product-studio"),
      })),
    };
    const cfg: MaumauConfig = {
      agents: {
        defaults: {
          executionWorkerAgentId: MAIN_WORKER_AGENT_ID,
        },
        list: [
          {
            id: "main",
            executionStyle: "orchestrator",
            executionWorkerAgentId: MAIN_WORKER_AGENT_ID,
          },
          { id: MAIN_WORKER_AGENT_ID, tools: { profile: "coding" } },
          ...createStarterTeamAgents().map((agent) =>
            agent.id.startsWith("vibe-coder")
              ? { ...agent, id: agent.id.replace("vibe-coder", "product-studio") }
              : agent,
          ),
        ],
      },
      teams: {
        list: [
          {
            ...createMainOrchestrationTeamConfig(),
            crossTeamLinks: [{ type: "team", targetId: "product-studio" }],
          },
          customTeam,
        ],
      },
    };

    const requirement = resolveExecutionRouteRequirement({
      cfg,
      task: "Design and build a polished mobile-friendly dashboard UI.",
      agentId: "main",
    });

    expect(requirement.teamId).toBe("product-studio");
    expect(requirement.managerAgentId).toBe("product-studio-manager");
  });

  it("recognizes configured execution workers", () => {
    expect(isExecutionWorkerAgentId(createReadyVibeCoderConfig(), MAIN_WORKER_AGENT_ID)).toBe(true);
    expect(isExecutionWorkerAgentId(createReadyVibeCoderConfig(), "helper")).toBe(false);
  });

  it("omits the coding-agent skill for orchestrators, execution workers, and subagents", () => {
    const cfg = createReadyVibeCoderConfig();
    expect(
      shouldOmitCodingAgentSkillForRun({
        config: cfg,
        agentId: "main",
        sessionIsSubagent: false,
      }),
    ).toBe(true);
    expect(
      shouldOmitCodingAgentSkillForRun({
        config: cfg,
        agentId: MAIN_WORKER_AGENT_ID,
        sessionIsSubagent: false,
      }),
    ).toBe(true);
    expect(
      shouldOmitCodingAgentSkillForRun({
        config: cfg,
        agentId: "helper",
        sessionIsSubagent: true,
      }),
    ).toBe(true);
    expect(
      shouldOmitCodingAgentSkillForRun({
        config: cfg,
        agentId: "helper",
        sessionIsSubagent: false,
      }),
    ).toBe(false);
  });
});

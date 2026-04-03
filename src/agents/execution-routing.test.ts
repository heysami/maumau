import { describe, expect, it } from "vitest";
import type { MaumauConfig } from "../config/config.js";
import {
  isExecutionWorkerAgentId,
  resolveExecutionRouteRequirement,
  shouldOmitCodingAgentSkillForRun,
  taskRequiresSpecialistUiTeam,
} from "./execution-routing.js";
import {
  createMainOrchestrationTeamConfig,
  createStarterTeamAgents,
  createStarterTeamConfig,
  MAIN_WORKER_AGENT_ID,
} from "../teams/presets.js";

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
      ],
    },
    teams: {
      list: [createMainOrchestrationTeamConfig(), createStarterTeamConfig()],
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
          { id: "main", executionStyle: "orchestrator", executionWorkerAgentId: MAIN_WORKER_AGENT_ID },
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
    expect(
      isExecutionWorkerAgentId(createReadyVibeCoderConfig(), MAIN_WORKER_AGENT_ID),
    ).toBe(true);
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

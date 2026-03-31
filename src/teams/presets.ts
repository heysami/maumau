import type { AgentConfig } from "../config/types.agents.js";
import type { MaumauConfig } from "../config/types.maumau.js";
import type { TeamConfig, TeamWorkflowConfig } from "../config/types.teams.js";
import { DEFAULT_AGENT_ID, normalizeAgentId } from "../routing/session-key.js";
import { DEFAULT_TEAM_WORKFLOW_ID, listTeamWorkflows } from "./model.js";

export const STARTER_TEAM_ID = "vibe-coder";
export const STARTER_TEAM_MANAGER_AGENT_ID = "vibe-coder-manager";
export const STARTER_TEAM_SYSTEM_ARCHITECT_AGENT_ID = "vibe-coder-system-architect";
export const STARTER_TEAM_DEVELOPER_AGENT_ID = "vibe-coder-developer";
export const STARTER_TEAM_UI_UX_DESIGNER_AGENT_ID = "vibe-coder-ui-ux-designer";
export const STARTER_TEAM_CONTENT_VISUAL_DESIGNER_AGENT_ID = "vibe-coder-content-visual-designer";
export const STARTER_TEAM_TECHNICAL_QA_AGENT_ID = "vibe-coder-technical-qa";
export const STARTER_TEAM_VISUAL_UX_QA_AGENT_ID = "vibe-coder-visual-ux-qa";
export const STARTER_TEAM_PRESET_VERSION = 3;

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function hasAgent(list: AgentConfig[], agentId: string): boolean {
  const normalized = normalizeAgentId(agentId);
  return list.some((entry) => normalizeAgentId(entry.id) === normalized);
}

function hasTeam(config: MaumauConfig, teamId: string): boolean {
  return (
    Array.isArray(config.teams?.list) &&
    config.teams.list.some((entry) => entry && entry.id.trim().toLowerCase() === teamId)
  );
}

export function createStarterTeamAgents(): AgentConfig[] {
  return [
    {
      id: STARTER_TEAM_MANAGER_AGENT_ID,
      name: "Vibe Coder Manager",
      tools: {
        profile: "coding",
      },
    },
    {
      id: STARTER_TEAM_SYSTEM_ARCHITECT_AGENT_ID,
      name: "System Architect",
      tools: {
        profile: "coding",
      },
    },
    {
      id: STARTER_TEAM_DEVELOPER_AGENT_ID,
      name: "Developer",
      tools: {
        profile: "coding",
      },
    },
    {
      id: STARTER_TEAM_UI_UX_DESIGNER_AGENT_ID,
      name: "UI/UX Designer",
      tools: {
        profile: "coding",
      },
    },
    {
      id: STARTER_TEAM_CONTENT_VISUAL_DESIGNER_AGENT_ID,
      name: "Content/Visual Designer",
      tools: {
        profile: "coding",
      },
    },
    {
      id: STARTER_TEAM_TECHNICAL_QA_AGENT_ID,
      name: "Technical QA",
      tools: {
        profile: "coding",
      },
    },
    {
      id: STARTER_TEAM_VISUAL_UX_QA_AGENT_ID,
      name: "Visual/UX QA",
      tools: {
        profile: "coding",
      },
    },
  ];
}

export function createStarterTeamConfig(): TeamConfig {
  return {
    id: STARTER_TEAM_ID,
    name: "Vibe Coder",
    description:
      "A starter staged manager-plus-specialists team for architecture, implementation, design, and QA work.",
    managerAgentId: STARTER_TEAM_MANAGER_AGENT_ID,
    members: [
      {
        agentId: STARTER_TEAM_SYSTEM_ARCHITECT_AGENT_ID,
        role: "system architect",
        description:
          "Owns system design, technical decomposition, interfaces, and implementation planning.",
      },
      {
        agentId: STARTER_TEAM_DEVELOPER_AGENT_ID,
        role: "developer",
        description: "Owns implementation, debugging, refactors, and technical execution.",
      },
      {
        agentId: STARTER_TEAM_UI_UX_DESIGNER_AGENT_ID,
        role: "ui/ux designer",
        description: "Owns interaction design, information hierarchy, flows, and usability.",
      },
      {
        agentId: STARTER_TEAM_CONTENT_VISUAL_DESIGNER_AGENT_ID,
        role: "content/visual designer",
        description:
          "Owns product copy, visual direction, layout polish, illustration, and presentation quality.",
      },
      {
        agentId: STARTER_TEAM_TECHNICAL_QA_AGENT_ID,
        role: "technical qa",
        description:
          "Owns technical verification, edge cases, regression checks, and implementation risks.",
      },
      {
        agentId: STARTER_TEAM_VISUAL_UX_QA_AGENT_ID,
        role: "visual/ux qa",
        description:
          "Owns visual consistency, UX polish, accessibility checks, and final experience review.",
      },
    ],
    crossTeamLinks: [],
    workflows: [
      {
        id: DEFAULT_TEAM_WORKFLOW_ID,
        name: "Default Workflow",
        description:
          "General-purpose stage-gated architecture, execution, and QA collaboration for the vibe-coder team.",
        default: true,
        managerPrompt:
          "Run the default lifecycle with explicit stage statuses: architecture first, then execution, then QA verification, then done. The system architect goes first. Developer, UI/UX designer, and content/visual designer work only after architecture approval. Technical QA and visual/UX QA only verify completed work. If QA blocks, send the task back to rework before another QA pass.",
        synthesisPrompt:
          "Synthesize the specialist outputs into one practical answer, highlight tradeoffs and quality risks, and call out anything that still needs a human decision.",
      },
    ],
    preset: {
      id: STARTER_TEAM_ID,
      source: "bundled",
      version: STARTER_TEAM_PRESET_VERSION,
    },
  };
}

export function ensureStarterTeamConfig(baseConfig: MaumauConfig): MaumauConfig {
  const currentAgents = Array.isArray(baseConfig.agents?.list) ? [...baseConfig.agents.list] : [];
  const hasExplicitDefault = currentAgents.some((entry) => entry?.default);
  const nextAgents = currentAgents.length
    ? [...currentAgents]
    : [
        {
          id: DEFAULT_AGENT_ID,
          default: !hasExplicitDefault,
        },
      ];

  for (const agent of createStarterTeamAgents()) {
    if (!hasAgent(nextAgents, agent.id)) {
      nextAgents.push(agent);
    }
  }

  const nextTeams = Array.isArray(baseConfig.teams?.list) ? [...baseConfig.teams.list] : [];
  if (!hasTeam(baseConfig, STARTER_TEAM_ID)) {
    nextTeams.push(createStarterTeamConfig());
  }

  return {
    ...baseConfig,
    agents: {
      ...baseConfig.agents,
      list: nextAgents,
    },
    teams: {
      ...baseConfig.teams,
      list: nextTeams,
    },
  };
}

export function applyStarterTeamOnFreshInstall(
  baseConfig: MaumauConfig,
  options?: { freshInstall?: boolean },
): MaumauConfig {
  if (options?.freshInstall !== true) {
    return baseConfig;
  }
  return ensureStarterTeamConfig(baseConfig);
}

export function createBlankTeamConfig(baseConfig: MaumauConfig): TeamConfig {
  const existingTeamIds = new Set(
    (Array.isArray(baseConfig.teams?.list) ? baseConfig.teams.list : []).map((entry) =>
      entry.id.trim().toLowerCase(),
    ),
  );
  let index = 1;
  let teamId = "team-1";
  while (existingTeamIds.has(teamId)) {
    index += 1;
    teamId = `team-${index}`;
  }

  const configuredAgents = Array.isArray(baseConfig.agents?.list) ? baseConfig.agents.list : [];
  const managerAgentId = normalizeOptionalText(configuredAgents[0]?.id) ?? DEFAULT_AGENT_ID;

  return {
    id: teamId,
    name: `Team ${index}`,
    description: "A custom manager-plus-specialists team.",
    managerAgentId,
    members: [],
    crossTeamLinks: [],
    workflows: [createBlankTeamWorkflowConfig({ id: DEFAULT_TEAM_WORKFLOW_ID })],
    preset: {
      id: "custom",
      source: "user",
      version: 1,
    },
  };
}

export function createBlankTeamWorkflowConfig(params?: {
  id?: string;
  name?: string;
  default?: boolean;
}): TeamWorkflowConfig {
  return {
    id: params?.id ?? DEFAULT_TEAM_WORKFLOW_ID,
    name: params?.name ?? "Default Workflow",
    description: "A manager-plus-specialists workflow for this team.",
    default: params?.default ?? true,
  };
}

export function createNextTeamWorkflowConfig(team: TeamConfig): TeamWorkflowConfig {
  const existingIds = new Set(listTeamWorkflows(team).map((workflow) => workflow.id));
  let index = 1;
  let workflowId = DEFAULT_TEAM_WORKFLOW_ID;
  if (existingIds.has(DEFAULT_TEAM_WORKFLOW_ID)) {
    workflowId = `workflow-${index}`;
    while (existingIds.has(workflowId)) {
      index += 1;
      workflowId = `workflow-${index}`;
    }
  }
  return createBlankTeamWorkflowConfig({
    id: workflowId,
    name: workflowId === DEFAULT_TEAM_WORKFLOW_ID ? "Default Workflow" : `Workflow ${index}`,
    default: existingIds.size === 0,
  });
}

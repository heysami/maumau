import type { AgentConfig } from "../config/types.agents.js";
import type { MaumauConfig } from "../config/types.maumau.js";
import type { TeamConfig, TeamWorkflowConfig } from "../config/types.teams.js";
import { DEFAULT_AGENT_ID, normalizeAgentId } from "../routing/session-key.js";
import { DEFAULT_TEAM_WORKFLOW_ID, listTeamWorkflows } from "./model.js";

export const STARTER_TEAM_ID = "vibe-coder";
export const MAIN_ORCHESTRATION_TEAM_ID = DEFAULT_AGENT_ID;
export const MAIN_WORKER_AGENT_ID = "main-worker";
export const STARTER_TEAM_MANAGER_AGENT_ID = "vibe-coder-manager";
export const STARTER_TEAM_SYSTEM_ARCHITECT_AGENT_ID = "vibe-coder-system-architect";
export const STARTER_TEAM_DEVELOPER_AGENT_ID = "vibe-coder-developer";
export const STARTER_TEAM_UI_UX_DESIGNER_AGENT_ID = "vibe-coder-ui-ux-designer";
export const STARTER_TEAM_CONTENT_VISUAL_DESIGNER_AGENT_ID = "vibe-coder-content-visual-designer";
export const STARTER_TEAM_TECHNICAL_QA_AGENT_ID = "vibe-coder-technical-qa";
export const STARTER_TEAM_VISUAL_UX_QA_AGENT_ID = "vibe-coder-visual-ux-qa";
export const STARTER_TEAM_PRESET_VERSION = 4;
export const MAIN_ORCHESTRATION_TEAM_PRESET_VERSION = 1;
const STARTER_MAIN_AGENT_ALSO_ALLOW = [
  "agents_list",
  "capabilities_list",
  "preview_publish",
  "read",
  "sessions_spawn",
  "sessions_yield",
  "subagents",
  "teams_list",
  "teams_run",
  "web_fetch",
  "web_search",
] as const;

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

function createStarterMainAgent(params?: { hasExplicitDefault?: boolean }): AgentConfig {
  return {
    id: DEFAULT_AGENT_ID,
    default: params?.hasExplicitDefault ? undefined : true,
    executionStyle: "orchestrator",
    executionWorkerAgentId: MAIN_WORKER_AGENT_ID,
    subagents: {
      allowAgents: [MAIN_WORKER_AGENT_ID],
    },
    tools: {
      profile: "messaging",
      alsoAllow: [...STARTER_MAIN_AGENT_ALSO_ALLOW],
    },
  };
}

function mergeStarterMainAgent(
  existing: AgentConfig | undefined,
  params?: { hasExplicitDefault?: boolean },
): AgentConfig {
  const starter = createStarterMainAgent(params);
  const existingTools = existing?.tools;
  const hasExplicitAllow = Array.isArray(existingTools?.allow) && existingTools.allow.length > 0;
  const mergedAlsoAllow = hasExplicitAllow
    ? existingTools?.alsoAllow
    : Array.from(
        new Set([
          ...(existingTools?.alsoAllow ?? []),
          ...starter.tools!.alsoAllow!,
        ]),
      );

  return {
    ...starter,
    ...existing,
    id: DEFAULT_AGENT_ID,
    default: existing?.default ?? starter.default,
    executionStyle: existing?.executionStyle ?? starter.executionStyle,
    executionWorkerAgentId:
      normalizeOptionalText(existing?.executionWorkerAgentId) ?? starter.executionWorkerAgentId,
    subagents: {
      ...starter.subagents,
      ...existing?.subagents,
      allowAgents: Array.from(
        new Set([
          ...(existing?.subagents?.allowAgents ?? []),
          ...(starter.subagents?.allowAgents ?? []),
        ]),
      ),
    },
    tools: {
      ...starter.tools,
      ...existingTools,
      profile: existingTools?.profile ?? starter.tools?.profile,
      ...(hasExplicitAllow ? {} : { alsoAllow: mergedAlsoAllow }),
    },
  };
}

export function createStarterTeamAgents(): AgentConfig[] {
  return [
    {
      id: MAIN_WORKER_AGENT_ID,
      name: "Main Worker",
      tools: {
        profile: "coding",
        alsoAllow: ["browser", "gateway", "nodes"],
      },
    },
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
      },
    ],
    preset: {
      id: STARTER_TEAM_ID,
      source: "bundled",
      version: STARTER_TEAM_PRESET_VERSION,
    },
  };
}

export function createMainOrchestrationTeamConfig(): TeamConfig {
  return {
    id: MAIN_ORCHESTRATION_TEAM_ID,
    name: "Main Orchestration",
    description:
      "The root manager team for the default chat agent. It routes bounded execution to main-worker and escalates UI or staged product work to linked specialist teams.",
    managerAgentId: DEFAULT_AGENT_ID,
    implicitForManagerSessions: true,
    members: [
      {
        agentId: MAIN_WORKER_AGENT_ID,
        role: "execution worker",
        description:
          "Owns bounded execution, implementation, research, browser work, and direct task completion when a full specialist team is not required.",
      },
    ],
    crossTeamLinks: [{ type: "team", targetId: STARTER_TEAM_ID }],
    workflows: [
      {
        id: DEFAULT_TEAM_WORKFLOW_ID,
        name: "Default Workflow",
        description:
          "Root orchestration workflow for triage, delegation, and execution routing across bundled workers and linked teams.",
        default: true,
        managerPrompt:
          "Treat this team as the root orchestrator for the default chat agent. Keep direct replies to casual or lightweight read-only requests. Delegate bounded execution to the execution worker. Route UI, human-facing, or staged product work to the linked specialist teams configured on this root team. Always report which execution path was used.",
        synthesisPrompt:
          "Summarize the delegated outcome, name the worker or linked team used, and include a concise execution receipt with QA and preview/share state when relevant.",
      },
    ],
    preset: {
      id: MAIN_ORCHESTRATION_TEAM_ID,
      source: "bundled",
      version: MAIN_ORCHESTRATION_TEAM_PRESET_VERSION,
    },
  };
}

export function ensureStarterTeamConfig(baseConfig: MaumauConfig): MaumauConfig {
  const currentAgents = Array.isArray(baseConfig.agents?.list) ? [...baseConfig.agents.list] : [];
  const hasExplicitDefault = currentAgents.some((entry) => entry?.default);
  const nextAgents = [...currentAgents];
  const mainIndex = nextAgents.findIndex((entry) => normalizeAgentId(entry.id) === DEFAULT_AGENT_ID);
  if (mainIndex >= 0) {
    nextAgents[mainIndex] = mergeStarterMainAgent(nextAgents[mainIndex], { hasExplicitDefault });
  } else {
    nextAgents.unshift(createStarterMainAgent({ hasExplicitDefault }));
  }

  for (const agent of createStarterTeamAgents()) {
    if (!hasAgent(nextAgents, agent.id)) {
      nextAgents.push(agent);
    }
  }

  const nextTeams = Array.isArray(baseConfig.teams?.list) ? [...baseConfig.teams.list] : [];
  if (!hasTeam(baseConfig, MAIN_ORCHESTRATION_TEAM_ID)) {
    nextTeams.unshift(createMainOrchestrationTeamConfig());
  }
  if (!hasTeam(baseConfig, STARTER_TEAM_ID)) {
    nextTeams.push(createStarterTeamConfig());
  }

  return {
    ...baseConfig,
    agents: {
      ...baseConfig.agents,
      defaults: {
        ...baseConfig.agents?.defaults,
        executionStyle: baseConfig.agents?.defaults?.executionStyle ?? "orchestrator",
        executionWorkerAgentId:
          normalizeOptionalText(baseConfig.agents?.defaults?.executionWorkerAgentId) ??
          MAIN_WORKER_AGENT_ID,
      },
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

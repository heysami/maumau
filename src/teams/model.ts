import type { MaumauConfig } from "../config/config.js";
import type {
  TeamConfig,
  TeamCrossTeamLinkConfig,
  TeamMemberConfig,
  TeamWorkflowBaseConfig,
  TeamWorkflowConfig,
} from "../config/types.teams.js";
import { DEFAULT_AGENT_ID, normalizeAgentId } from "../routing/session-key.js";

export const DEFAULT_TEAM_WORKFLOW_ID = "default";

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function normalizeTeamId(value: string): string {
  const trimmed = value.trim().toLowerCase();
  return trimmed || "team";
}

export function normalizeTeamWorkflowId(value: string): string {
  const trimmed = value.trim().toLowerCase();
  return trimmed || DEFAULT_TEAM_WORKFLOW_ID;
}

export function listConfiguredTeams(cfg: MaumauConfig): TeamConfig[] {
  const list = cfg.teams?.list;
  if (!Array.isArray(list)) {
    return [];
  }
  return list.filter((entry): entry is TeamConfig => Boolean(entry && typeof entry === "object"));
}

export function findTeamConfig(cfg: MaumauConfig, teamId: string): TeamConfig | undefined {
  const normalized = normalizeTeamId(teamId);
  return listConfiguredTeams(cfg).find((entry) => normalizeTeamId(entry.id) === normalized);
}

export function listConfiguredAgentIds(cfg: MaumauConfig): string[] {
  const configured = Array.isArray(cfg.agents?.list) ? cfg.agents.list : [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const entry of configured) {
    const raw = normalizeOptionalText(entry?.id);
    if (!raw) {
      continue;
    }
    const normalized = normalizeAgentId(raw);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    ids.push(normalized);
  }
  if (ids.length === 0) {
    ids.push(DEFAULT_AGENT_ID);
  }
  return ids;
}

export function resolveAgentDisplayName(cfg: MaumauConfig, agentId: string): string {
  const normalized = normalizeAgentId(agentId);
  const configured = Array.isArray(cfg.agents?.list) ? cfg.agents.list : [];
  const match = configured.find((entry) => normalizeAgentId(entry.id) === normalized);
  const name = normalizeOptionalText(match?.name);
  return name ?? normalized;
}

export function listTeamMembers(team: TeamConfig): TeamMemberConfig[] {
  return Array.isArray(team.members) ? team.members : [];
}

function normalizeTeamWorkflowFromBase(
  workflow: TeamWorkflowBaseConfig,
  workflowId = DEFAULT_TEAM_WORKFLOW_ID,
): TeamWorkflowConfig {
  return {
    id: normalizeTeamWorkflowId(workflowId),
    name: normalizeOptionalText(workflow.name),
    description: normalizeOptionalText(workflow.description),
    managerPrompt: normalizeOptionalText(workflow.managerPrompt),
    synthesisPrompt: normalizeOptionalText(workflow.synthesisPrompt),
    default: workflow.default === true || undefined,
  };
}

export function createImplicitTeamWorkflow(team?: Pick<TeamConfig, "id">): TeamWorkflowConfig {
  return {
    id: DEFAULT_TEAM_WORKFLOW_ID,
    name: "Default Workflow",
    description: team?.id
      ? `Default workflow for team "${team.id}".`
      : "Default workflow for this team.",
    default: true,
  };
}

export function listConfiguredTeamWorkflows(team: TeamConfig): TeamWorkflowConfig[] {
  if (!Array.isArray(team.workflows)) {
    return [];
  }
  return team.workflows.filter((entry): entry is TeamWorkflowConfig =>
    Boolean(entry && typeof entry === "object"),
  );
}

export function listTeamWorkflows(team: TeamConfig): TeamWorkflowConfig[] {
  const configured = listConfiguredTeamWorkflows(team);
  if (configured.length > 0) {
    return configured.map((workflow) => normalizeTeamWorkflowFromBase(workflow, workflow.id));
  }
  if (team.workflow && typeof team.workflow === "object") {
    return [
      {
        ...normalizeTeamWorkflowFromBase(team.workflow),
        default: true,
      },
    ];
  }
  return [createImplicitTeamWorkflow(team)];
}

export function resolveDefaultTeamWorkflowId(team: TeamConfig): string {
  const workflows = listTeamWorkflows(team);
  const explicitDefault = workflows.find((workflow) => workflow.default === true);
  if (explicitDefault) {
    return explicitDefault.id;
  }
  const namedDefault = workflows.find(
    (workflow) => normalizeTeamWorkflowId(workflow.id) === DEFAULT_TEAM_WORKFLOW_ID,
  );
  if (namedDefault) {
    return namedDefault.id;
  }
  return workflows[0]?.id ?? DEFAULT_TEAM_WORKFLOW_ID;
}

export function findTeamWorkflow(team: TeamConfig, workflowId?: string): TeamWorkflowConfig {
  const workflows = listTeamWorkflows(team);
  const normalizedWorkflowId = workflowId ? normalizeTeamWorkflowId(workflowId) : undefined;
  if (normalizedWorkflowId) {
    const match = workflows.find(
      (workflow) => normalizeTeamWorkflowId(workflow.id) === normalizedWorkflowId,
    );
    if (match) {
      return match;
    }
  }
  const defaultWorkflowId = resolveDefaultTeamWorkflowId(team);
  return (
    workflows.find(
      (workflow) =>
        normalizeTeamWorkflowId(workflow.id) === normalizeTeamWorkflowId(defaultWorkflowId),
    ) ??
    workflows[0] ??
    createImplicitTeamWorkflow(team)
  );
}

export function listTeamMemberAgentIds(team: TeamConfig): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  const managerId = normalizeOptionalText(team.managerAgentId);
  if (managerId) {
    const normalized = normalizeAgentId(managerId);
    seen.add(normalized);
    ids.push(normalized);
  }
  for (const entry of listTeamMembers(team)) {
    const agentId = normalizeOptionalText(entry.agentId);
    if (!agentId) {
      continue;
    }
    const normalized = normalizeAgentId(agentId);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    ids.push(normalized);
  }
  return ids;
}

export function isAgentInTeam(team: TeamConfig, agentId: string): boolean {
  const normalized = normalizeAgentId(agentId);
  return listTeamMemberAgentIds(team).includes(normalized);
}

export function findTeamMember(team: TeamConfig, agentId: string): TeamMemberConfig | undefined {
  const normalized = normalizeAgentId(agentId);
  return listTeamMembers(team).find((entry) => normalizeAgentId(entry.agentId) === normalized);
}

export function resolveTeamRole(team: TeamConfig, agentId: string): string | undefined {
  const normalized = normalizeAgentId(agentId);
  if (normalizeAgentId(team.managerAgentId) === normalized) {
    return "manager";
  }
  return normalizeOptionalText(findTeamMember(team, normalized)?.role);
}

function listCrossTeamLinks(team: TeamConfig): TeamCrossTeamLinkConfig[] {
  return Array.isArray(team.crossTeamLinks) ? team.crossTeamLinks : [];
}

export function listLinkedTeamIds(team: TeamConfig): string[] {
  return listCrossTeamLinks(team)
    .filter((entry) => entry.type === "team")
    .map((entry) => normalizeTeamId(entry.targetId));
}

export function listLinkedAgentIds(team: TeamConfig): string[] {
  return listCrossTeamLinks(team)
    .filter((entry) => entry.type === "agent")
    .map((entry) => normalizeAgentId(entry.targetId));
}

export function canTeamUseAgent(params: {
  cfg: MaumauConfig;
  sourceTeamId: string;
  targetAgentId: string;
}): boolean {
  const team = findTeamConfig(params.cfg, params.sourceTeamId);
  if (!team) {
    return false;
  }
  const normalizedTargetAgentId = normalizeAgentId(params.targetAgentId);
  if (isAgentInTeam(team, normalizedTargetAgentId)) {
    return true;
  }
  return listLinkedAgentIds(team).includes(normalizedTargetAgentId);
}

export function canTeamUseTeam(params: {
  cfg: MaumauConfig;
  sourceTeamId: string;
  targetTeamId: string;
}): boolean {
  const normalizedSourceTeamId = normalizeTeamId(params.sourceTeamId);
  const normalizedTargetTeamId = normalizeTeamId(params.targetTeamId);
  if (normalizedSourceTeamId === normalizedTargetTeamId) {
    return true;
  }
  const team = findTeamConfig(params.cfg, normalizedSourceTeamId);
  if (!team) {
    return false;
  }
  return listLinkedTeamIds(team).includes(normalizedTargetTeamId);
}

export function listAccessibleTeams(
  cfg: MaumauConfig,
  currentTeamId?: string,
): Array<{ team: TeamConfig; runnable: boolean }> {
  const teams = listConfiguredTeams(cfg);
  if (!currentTeamId) {
    return teams.map((team) => ({ team, runnable: true }));
  }
  return teams.map((team) => ({
    team,
    runnable: canTeamUseTeam({
      cfg,
      sourceTeamId: currentTeamId,
      targetTeamId: team.id,
    }),
  }));
}

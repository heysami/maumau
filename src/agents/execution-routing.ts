import type { MaumauConfig } from "../config/config.js";
import { resolveAgentConfig } from "./agent-scope.js";
import { resolvePreferredTeamRunTarget, resolveSessionTeamContext } from "../teams/runtime.js";

const UI_EXECUTION_ACTION_RE =
  /\b(build|create|make|implement|ship|design|redesign|prototype|code|develop|fix|update|polish|improve|generate)\b/i;
const UI_EXECUTION_STRONG_SURFACE_RE =
  /\b(ui|ux|frontend|front-end|front end|website|web app|webpage|landing page|dashboard|screen|page layout|component library|design system|visual design|interaction design|responsive|accessibility|game|html|css|react|tailwind)\b/i;
const UI_EXECUTION_SUPPORTING_SURFACE_RE =
  /\b(interface|layout|copy|content design|visual|polish|usability|user flow|human interaction|human-facing|user-facing)\b/gi;

export type ExecutionRouteRequirement = {
  kind: "none" | "team_openprose";
  requiresTeam: boolean;
  teamId?: string;
  workflowId?: string;
  managerAgentId?: string;
  teamRuntime?: "openprose";
  reason?: "ui_human_facing";
  teamReady?: boolean;
  blockingReasons: string[];
};

function normalizeForRouting(text: string): string {
  return text.trim().toLowerCase();
}

function countSupportingSurfaceMatches(text: string): number {
  return [...text.matchAll(UI_EXECUTION_SUPPORTING_SURFACE_RE)].length;
}

export function taskRequiresSpecialistUiTeam(task: string): boolean {
  const normalized = normalizeForRouting(task);
  if (!normalized) {
    return false;
  }
  const hasAction = UI_EXECUTION_ACTION_RE.test(normalized);
  if (!hasAction) {
    return false;
  }
  if (UI_EXECUTION_STRONG_SURFACE_RE.test(normalized)) {
    return true;
  }
  return countSupportingSurfaceMatches(normalized) >= 2;
}

export function isExecutionWorkerAgentId(
  cfg: MaumauConfig | undefined,
  agentId: string | undefined,
): boolean {
  const normalized = agentId?.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (cfg?.agents?.defaults?.executionWorkerAgentId?.trim().toLowerCase() === normalized) {
    return true;
  }
  return (cfg?.agents?.list ?? []).some(
    (entry) => entry.executionWorkerAgentId?.trim().toLowerCase() === normalized,
  );
}

export function shouldOmitCodingAgentSkillForRun(params: {
  config?: MaumauConfig;
  agentId?: string;
  sessionIsSubagent?: boolean;
}): boolean {
  if (params.sessionIsSubagent) {
    return true;
  }
  if (isExecutionWorkerAgentId(params.config, params.agentId)) {
    return true;
  }
  const agentConfig =
    params.config && params.agentId ? resolveAgentConfig(params.config, params.agentId) : undefined;
  return agentConfig?.executionStyle === "orchestrator";
}

export function resolveExecutionRouteRequirement(params: {
  cfg?: MaumauConfig;
  task: string;
  sessionKey?: string;
  agentId?: string;
}): ExecutionRouteRequirement {
  if (!taskRequiresSpecialistUiTeam(params.task)) {
    return {
      kind: "none",
      requiresTeam: false,
      blockingReasons: [],
    };
  }

  const cfg: MaumauConfig = params.cfg ?? {};
  const sessionTeamContext = params.sessionKey
    ? resolveSessionTeamContext({
        cfg,
        sessionKey: params.sessionKey,
      })
    : undefined;
  const teamTarget = resolvePreferredTeamRunTarget({
    cfg,
    sourceTeamId: sessionTeamContext?.teamId,
    managerAgentId: params.agentId ?? sessionTeamContext?.sessionAgentId,
    preference: "ui_human_facing",
  });
  if (!teamTarget.ok) {
    return {
      kind: "team_openprose",
      requiresTeam: true,
      teamRuntime: "openprose",
      reason: "ui_human_facing",
      teamReady: false,
      blockingReasons: [teamTarget.error],
    };
  }

  return {
    kind: "team_openprose",
    requiresTeam: true,
    teamId: teamTarget.target.team.id,
    workflowId: teamTarget.target.workflow.id,
    managerAgentId: teamTarget.target.managerAgentId,
    teamRuntime: teamTarget.target.runtime,
    reason: "ui_human_facing",
    teamReady: teamTarget.target.contractReady,
    blockingReasons: teamTarget.target.blockingReasons,
  };
}

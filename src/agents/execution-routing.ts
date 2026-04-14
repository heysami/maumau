import type { MaumauConfig } from "../config/config.js";
import { resolvePreferredTeamRunTarget, resolveSessionTeamContext } from "../teams/runtime.js";
import { resolveAgentConfig } from "./agent-scope.js";

const UI_EXECUTION_ACTION_RE =
  /\b(build|create|make|implement|ship|design|redesign|prototype|code|develop|fix|update|polish|improve|generate)\b/i;
const UI_EXECUTION_STRONG_SURFACE_RE =
  /\b(ui|ux|frontend|front-end|front end|website|web app|webpage|landing page|dashboard|screen|page layout|component library|design system|visual design|interaction design|responsive|accessibility|game|html|css|react|tailwind)\b/i;
const DIRECT_UI_DELIVERABLE_RE =
  /\b(build|create|make|implement|ship|design|redesign|prototype|code|develop|fix|update|polish|improve)\s+(?:a|an|the|new)?\s*(?:responsive|mobile-friendly|interactive|previewable|browser-based|browser)?\s*(?:ui|ux|frontend|website|web app|webpage|landing page|dashboard|screen|page|component library|design system)\b/i;
const UI_EXECUTION_SUPPORTING_SURFACE_RE =
  /\b(interface|layout|copy|content design|visual|polish|usability|user flow|human interaction|human-facing|user-facing)\b/gi;
const UI_IMPLEMENTATION_OWNER_SURFACE_RE =
  /\b(ui|ux|frontend|front-end|front end|website|web app|webpage|landing page|dashboard|screen|page|html|css|react|tailwind)\b/i;
const UI_IMPLEMENTATION_OWNER_OUTPUT_HINT_RE =
  /\b(artifact|preview|deliverable|implementation|implement|implemented|code|coded|build|built|static|ship|full webpage|full page|full app|full screen)\b/i;
const DESIGN_ASSET_ACTION_RE =
  /\b(create|make|design|redesign|generate|explore|brainstorm|concept|iterate|produce|find|compare|choose|draw|illustrate|maintain|refresh|expand)\b/i;
const DESIGN_ASSET_STRONG_SURFACE_RE =
  /\b(asset|assets|image|images|illustration|illustrations|graphic|graphics|icon|icons|logo|logos|brand|branding|style guide|visual system|mood board|moodboard|vector|svg|raster|sprite|sprites|texture|textures|poster|cover art|thumbnail|thumbnails|concept art|character art|portrait|portraits|scene|scenes)\b/i;
const DESIGN_ASSET_SUPPORTING_SURFACE_RE =
  /\b(consistency|consistent|visual consistency|brand consistency|look and feel|palette|typography|imagery|art direction)\b/gi;

export type ExecutionRouteRequirement = {
  kind: "none" | "team_openprose";
  requiresTeam: boolean;
  teamId?: string;
  workflowId?: string;
  managerAgentId?: string;
  teamRuntime?: "openprose";
  reason?: "ui_human_facing" | "design_assets";
  teamReady?: boolean;
  blockingReasons: string[];
};

function normalizeForRouting(text: string): string {
  return text.trim().toLowerCase();
}

function countSupportingSurfaceMatches(text: string): number {
  return [...text.matchAll(UI_EXECUTION_SUPPORTING_SURFACE_RE)].length;
}

function countDesignSupportingSurfaceMatches(text: string): number {
  return [...text.matchAll(DESIGN_ASSET_SUPPORTING_SURFACE_RE)].length;
}

function taskRequiresUiImplementationOwner(task: string): boolean {
  const normalized = normalizeForRouting(task);
  if (!normalized) {
    return false;
  }
  if (!UI_EXECUTION_ACTION_RE.test(normalized)) {
    return false;
  }
  if (DIRECT_UI_DELIVERABLE_RE.test(normalized)) {
    return true;
  }
  return (
    UI_IMPLEMENTATION_OWNER_SURFACE_RE.test(normalized) &&
    UI_IMPLEMENTATION_OWNER_OUTPUT_HINT_RE.test(normalized)
  );
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

export function taskRequiresDesignAssetTeam(task: string): boolean {
  const normalized = normalizeForRouting(task);
  if (!normalized) {
    return false;
  }
  const hasAction = DESIGN_ASSET_ACTION_RE.test(normalized);
  if (!hasAction) {
    return false;
  }
  if (DESIGN_ASSET_STRONG_SURFACE_RE.test(normalized)) {
    return true;
  }
  return countDesignSupportingSurfaceMatches(normalized) >= 2;
}

function resolveExecutionRoutePreference(
  task: string,
): "ui_human_facing" | "design_assets" | undefined {
  const normalized = normalizeForRouting(task);
  if (taskRequiresUiImplementationOwner(normalized)) {
    return "ui_human_facing";
  }
  if (taskRequiresDesignAssetTeam(normalized)) {
    return "design_assets";
  }
  if (taskRequiresSpecialistUiTeam(normalized)) {
    return "ui_human_facing";
  }
  return undefined;
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
  const preference = resolveExecutionRoutePreference(params.task);
  if (!preference) {
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
  const rootManagerOwnsInitialTeamChoice =
    sessionTeamContext?.team?.implicitForManagerSessions === true &&
    sessionTeamContext.teamRole?.trim().toLowerCase() === "manager";
  const teamTarget = resolvePreferredTeamRunTarget({
    cfg,
    sourceTeamId: sessionTeamContext?.teamId,
    managerAgentId: params.agentId ?? sessionTeamContext?.sessionAgentId,
    preference,
  });
  if (!teamTarget.ok) {
    return {
      kind: "team_openprose",
      requiresTeam: true,
      teamRuntime: "openprose",
      reason: preference,
      teamReady: false,
      blockingReasons: [teamTarget.error],
    };
  }

  if (rootManagerOwnsInitialTeamChoice) {
    return {
      kind: "team_openprose",
      requiresTeam: true,
      teamRuntime: teamTarget.target.runtime,
      reason: preference,
      teamReady: teamTarget.target.contractReady,
      blockingReasons: teamTarget.target.blockingReasons,
    };
  }

  return {
    kind: "team_openprose",
    requiresTeam: true,
    teamId: teamTarget.target.team.id,
    workflowId: teamTarget.target.workflow.id,
    managerAgentId: teamTarget.target.managerAgentId,
    teamRuntime: teamTarget.target.runtime,
    reason: preference,
    teamReady: teamTarget.target.contractReady,
    blockingReasons: teamTarget.target.blockingReasons,
  };
}

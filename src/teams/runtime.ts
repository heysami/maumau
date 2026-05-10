import fs from "node:fs/promises";
import path from "node:path";
import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../agents/agent-scope.js";
import { loadConfig, type MaumauConfig } from "../config/config.js";
import type { TeamConfig, TeamWorkflowConfig } from "../config/types.teams.js";
import { loadSessionEntry } from "../gateway/session-utils.js";
import { normalizeAgentId, parseAgentSessionKey } from "../routing/session-key.js";
import { evaluateTeamWorkflowContractReadiness } from "./contracts.js";
import {
  findTeamConfig,
  listConfiguredTeams,
  listLinkedAgentIds,
  listLinkedTeamIds,
  resolveTeamRole,
  canTeamUseTeam,
} from "./model.js";
import { findTeamWorkflow, normalizeTeamWorkflowId } from "./model.js";
import { generateTeamOpenProsePreview } from "./openprose.js";

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function resolveSessionAgentId(params: {
  cfg: MaumauConfig;
  sessionKey: string;
}): string | undefined {
  const parsedAgentId = parseAgentSessionKey(params.sessionKey)?.agentId;
  if (parsedAgentId) {
    return normalizeAgentId(parsedAgentId);
  }
  if (params.sessionKey.trim().toLowerCase() === "main") {
    return normalizeAgentId(resolveDefaultAgentId(params.cfg));
  }
  return undefined;
}

function findImplicitManagerTeam(params: {
  cfg: MaumauConfig;
  managerAgentId?: string;
}): TeamConfig | undefined {
  const normalizedManagerAgentId = normalizeOptionalText(params.managerAgentId);
  if (!normalizedManagerAgentId) {
    return undefined;
  }
  return listConfiguredTeams(params.cfg).find(
    (team) =>
      team.implicitForManagerSessions === true &&
      normalizeAgentId(team.managerAgentId) === normalizedManagerAgentId,
  );
}

export type SessionTeamContext = {
  teamId: string;
  teamRole?: string;
  team?: TeamConfig;
  sessionAgentId?: string;
};

export type ResolvedTeamRunTarget = {
  team: TeamConfig;
  workflow: TeamWorkflowConfig;
  runtime: "openprose";
  managerAgentId: string;
  contractReady: boolean;
  blockingReasons: string[];
  requiredRoles: string[];
  requiredQaRoles: string[];
  requireDelegation: boolean;
};

export type TeamRoutingPreference = "ui_human_facing" | "design_assets";

const UI_HUMAN_FACING_TEAM_HINT_RE =
  /\b(ui|ux|frontend|front-end|front end|accessibility|experience|human|user|dashboard|screen|page|layout|component|responsive|content\/visual|ui\/ux)\b/i;
const PRODUCT_IMPLEMENTATION_TEAM_HINT_RE =
  /\b(architect|developer|implementation|ship|product|technical qa|visual\/ux qa|system architect)\b/i;
const DESIGN_ASSET_TEAM_HINT_RE =
  /\b(asset|manifest|vector|svg|image|raster|illustration|icon|logo|brand|branding|style guide|visual system|consistency|mood board|moodboard|image_generate|requirements qa|consistency qa)\b/i;
const DESIGN_ASSET_SPECIALIST_TEAM_HINT_RE =
  /\b(vector visual designer|image visual designer|requirements qa|consistency qa|image_generate|asset manifest|consistency guide)\b/i;
const ASSET_ONLY_TEAM_HINT_RE =
  /\b(asset-only|asset only|does not implement webpages|does not implement apps|does not implement webpages, apps, screens, or product code)\b/i;
const STAGED_SPECIALIST_TEAM_HINT_RE =
  /\b(qa|quality|review|workflow|manager-led|staged|specialist)\b/i;

function buildTeamRoutingHintText(target: ResolvedTeamRunTarget): string {
  return [
    target.team.name,
    target.team.description,
    target.workflow.name,
    target.workflow.description,
    target.workflow.managerPrompt,
    ...target.requiredRoles,
    ...target.requiredQaRoles,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ");
}

function describeTeamRoutingPreference(preference: TeamRoutingPreference): string {
  if (preference === "ui_human_facing") {
    return "UI/human-facing";
  }
  if (preference === "design_assets") {
    return "design asset";
  }
  return preference;
}

function scoreTeamForRoutingPreference(
  target: ResolvedTeamRunTarget,
  preference: TeamRoutingPreference,
): number {
  const hintText = buildTeamRoutingHintText(target);
  let score = 0;
  if (target.requireDelegation) {
    score += 4;
  }
  if (target.requiredQaRoles.length > 0) {
    score += 3;
  }
  if (preference === "ui_human_facing") {
    if (UI_HUMAN_FACING_TEAM_HINT_RE.test(hintText)) {
      score += 10;
    }
    if (PRODUCT_IMPLEMENTATION_TEAM_HINT_RE.test(hintText)) {
      score += 8;
    }
    if (STAGED_SPECIALIST_TEAM_HINT_RE.test(hintText)) {
      score += 2;
    }
    return score;
  }
  if (DESIGN_ASSET_TEAM_HINT_RE.test(hintText)) {
    score += 12;
  }
  if (DESIGN_ASSET_SPECIALIST_TEAM_HINT_RE.test(hintText)) {
    score += 8;
  }
  if (ASSET_ONLY_TEAM_HINT_RE.test(hintText)) {
    score += 10;
  }
  if (PRODUCT_IMPLEMENTATION_TEAM_HINT_RE.test(hintText)) {
    score -= 8;
  }
  if (STAGED_SPECIALIST_TEAM_HINT_RE.test(hintText)) {
    score += 2;
  }
  return score;
}

function matchesTeamRoutingPreference(
  target: ResolvedTeamRunTarget,
  preference: TeamRoutingPreference,
): boolean {
  return scoreTeamForRoutingPreference(target, preference) > 0;
}

function compareTeamRoutingCandidates(
  left: ResolvedTeamRunTarget,
  right: ResolvedTeamRunTarget,
  preference: TeamRoutingPreference,
): number {
  const readinessDelta = Number(right.contractReady) - Number(left.contractReady);
  if (readinessDelta !== 0) {
    return readinessDelta;
  }
  return (
    scoreTeamForRoutingPreference(right, preference) -
    scoreTeamForRoutingPreference(left, preference)
  );
}

function listCandidateTeamIdsForPreference(params: {
  cfg: MaumauConfig;
  sourceTeamId?: string;
  managerAgentId?: string;
}): string[] {
  const normalizedSourceTeamId = normalizeOptionalText(params.sourceTeamId);
  const sourceTeam = normalizedSourceTeamId
    ? findTeamConfig(params.cfg, normalizedSourceTeamId)
    : findImplicitManagerTeam({
        cfg: params.cfg,
        managerAgentId: params.managerAgentId,
      });
  const teamIds =
    sourceTeam !== undefined
      ? listLinkedTeamIds(sourceTeam)
      : listConfiguredTeams(params.cfg).map((team) => team.id);

  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const teamId of teamIds) {
    const normalized = teamId.trim().toLowerCase();
    if (!normalized || normalized === normalizedSourceTeamId || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    deduped.push(teamId);
  }
  return deduped;
}

export function resolveSessionTeamContext(params: {
  sessionKey?: string;
  cfg?: MaumauConfig;
}): SessionTeamContext | undefined {
  const sessionKey = normalizeOptionalText(params.sessionKey);
  if (!sessionKey) {
    return undefined;
  }
  const cfg = params.cfg ?? loadConfig();
  const entry = loadSessionEntry(sessionKey).entry;
  const teamId = normalizeOptionalText(entry?.teamId);
  const sessionAgentId = resolveSessionAgentId({ cfg, sessionKey });
  if (!teamId) {
    const implicitTeam = findImplicitManagerTeam({
      cfg,
      managerAgentId: sessionAgentId,
    });
    if (!implicitTeam) {
      return undefined;
    }
    return {
      teamId: implicitTeam.id,
      teamRole: "manager",
      team: implicitTeam,
      sessionAgentId,
    };
  }
  return {
    teamId,
    teamRole: normalizeOptionalText(entry?.teamRole),
    team: findTeamConfig(cfg, teamId),
    sessionAgentId: sessionAgentId ? normalizeAgentId(sessionAgentId) : undefined,
  };
}

export function resolveTeamRunTarget(params: {
  cfg?: MaumauConfig;
  teamId: string;
  workflowId?: string;
}): { ok: true; target: ResolvedTeamRunTarget } | { ok: false; error: string } {
  const cfg = params.cfg ?? loadConfig();
  const team = findTeamConfig(cfg, params.teamId);
  if (!team) {
    return {
      ok: false,
      error: `Unknown team: ${params.teamId}`,
    };
  }

  const workflow = findTeamWorkflow(team, params.workflowId);
  if (
    params.workflowId &&
    workflow.id.trim().toLowerCase() !== params.workflowId.trim().toLowerCase()
  ) {
    return {
      ok: false,
      error: `Unknown workflow "${params.workflowId}" for team "${team.id}"`,
    };
  }

  const readiness = evaluateTeamWorkflowContractReadiness({
    cfg,
    team,
    workflow,
  });
  return {
    ok: true,
    target: {
      team,
      workflow,
      runtime: "openprose",
      managerAgentId: team.managerAgentId,
      contractReady: readiness.contractReady,
      blockingReasons: readiness.blockingReasons,
      requiredRoles: readiness.requiredRoles,
      requiredQaRoles: readiness.requiredQaRoles,
      requireDelegation: readiness.requireDelegation,
    },
  };
}

export function resolvePreferredTeamRunTarget(params: {
  cfg?: MaumauConfig;
  sourceTeamId?: string;
  managerAgentId?: string;
  preference: TeamRoutingPreference;
}): { ok: true; target: ResolvedTeamRunTarget } | { ok: false; error: string } {
  const cfg = params.cfg ?? loadConfig();
  const normalizedSourceTeamId = normalizeOptionalText(params.sourceTeamId);
  if (normalizedSourceTeamId && !findTeamConfig(cfg, normalizedSourceTeamId)) {
    return {
      ok: false,
      error: `Active team "${params.sourceTeamId}" is no longer configured.`,
    };
  }
  const candidateTeamIds = listCandidateTeamIdsForPreference({
    cfg,
    sourceTeamId: normalizedSourceTeamId,
    managerAgentId: params.managerAgentId,
  });

  if (candidateTeamIds.length === 0) {
    const preferenceLabel = describeTeamRoutingPreference(params.preference);
    return {
      ok: false,
      error: params.sourceTeamId
        ? `Team "${params.sourceTeamId}" has no linked specialist team configured for ${preferenceLabel} work.`
        : `No configured specialist team is available for ${preferenceLabel} work.`,
    };
  }

  const matches: ResolvedTeamRunTarget[] = [];
  for (const teamId of candidateTeamIds) {
    const resolved = resolveTeamRunTarget({ cfg, teamId });
    if (!resolved.ok) {
      continue;
    }
    if (!matchesTeamRoutingPreference(resolved.target, params.preference)) {
      continue;
    }
    matches.push(resolved.target);
  }

  if (matches.length === 0) {
    const preferenceLabel = describeTeamRoutingPreference(params.preference);
    return {
      ok: false,
      error: params.sourceTeamId
        ? `Team "${params.sourceTeamId}" has no linked specialist team that matches ${preferenceLabel} work.`
        : `No configured specialist team matches ${preferenceLabel} work.`,
    };
  }

  matches.sort((left, right) => compareTeamRoutingCandidates(left, right, params.preference));
  return {
    ok: true,
    target: matches[0],
  };
}

export function resolveTeamAgentAccess(params: {
  cfg: MaumauConfig;
  sourceTeamId: string;
  targetAgentId: string;
}):
  | { allowed: true; scope: "team" | "linked-agent"; teamRole?: string }
  | { allowed: false; error: string } {
  const team = findTeamConfig(params.cfg, params.sourceTeamId);
  if (!team) {
    return {
      allowed: false,
      error: `Active team "${params.sourceTeamId}" is no longer configured.`,
    };
  }
  const normalizedTargetAgentId = normalizeAgentId(params.targetAgentId);
  const teamRole = resolveTeamRole(team, normalizedTargetAgentId);
  if (teamRole) {
    return {
      allowed: true,
      scope: "team",
      teamRole,
    };
  }
  if (listLinkedAgentIds(team).includes(normalizedTargetAgentId)) {
    return {
      allowed: true,
      scope: "linked-agent",
    };
  }
  return {
    allowed: false,
    error:
      `Team "${team.id}" cannot delegate directly to agent "${normalizedTargetAgentId}". ` +
      "Add the agent to the team or create an explicit agent cross-team link.",
  };
}

export function resolveTeamSessionAccess(params: {
  cfg: MaumauConfig;
  sourceTeamId: string;
  targetSessionKey: string;
}): { allowed: true } | { allowed: false; error: string } {
  const team = findTeamConfig(params.cfg, params.sourceTeamId);
  if (!team) {
    return {
      allowed: false,
      error: `Active team "${params.sourceTeamId}" is no longer configured.`,
    };
  }

  const targetSession = loadSessionEntry(params.targetSessionKey).entry;
  const targetTeamId = normalizeOptionalText(targetSession?.teamId);
  if (targetTeamId) {
    const canUseTeam = canTeamUseTeam({
      cfg: params.cfg,
      sourceTeamId: team.id,
      targetTeamId,
    });
    if (canUseTeam) {
      return { allowed: true };
    }
    return {
      allowed: false,
      error: `Team "${team.id}" cannot communicate with team "${targetTeamId}" without an explicit team link.`,
    };
  }

  const targetAgentId = parseAgentSessionKey(params.targetSessionKey)?.agentId;
  if (!targetAgentId) {
    return {
      allowed: false,
      error: "Target session does not belong to an addressable team or agent.",
    };
  }

  const agentAccess = resolveTeamAgentAccess({
    cfg: params.cfg,
    sourceTeamId: team.id,
    targetAgentId,
  });
  if (agentAccess.allowed) {
    return { allowed: true };
  }
  return {
    allowed: false,
    error: agentAccess.error,
  };
}

export function resolveGeneratedTeamProgramRelativePath(
  teamId: string,
  workflowId: string,
): string {
  return path.posix.join(
    ".maumau",
    "teams",
    teamId.trim().toLowerCase(),
    `${normalizeTeamWorkflowId(workflowId)}.generated.prose`,
  );
}

export async function materializeGeneratedTeamProgram(params: {
  cfg?: MaumauConfig;
  teamId: string;
  workflowId?: string;
}): Promise<
  | {
      ok: true;
      team: TeamConfig;
      workflow: TeamWorkflowConfig;
      program: string;
      absolutePath: string;
      relativePath: string;
    }
  | { ok: false; error: string }
> {
  const cfg = params.cfg ?? loadConfig();
  const team = findTeamConfig(cfg, params.teamId);
  if (!team) {
    return {
      ok: false,
      error: `Unknown team: ${params.teamId}`,
    };
  }

  const workflow = findTeamWorkflow(team, params.workflowId);
  if (!workflow) {
    return {
      ok: false,
      error: `Unknown workflow "${params.workflowId}" for team "${team.id}"`,
    };
  }

  const program = generateTeamOpenProsePreview({
    config: cfg,
    team,
    workflowId: workflow.id,
  });
  const relativePath = resolveGeneratedTeamProgramRelativePath(team.id, workflow.id);
  const absolutePath = path.join(resolveAgentWorkspaceDir(cfg, team.managerAgentId), relativePath);

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, `${program}\n`, "utf-8");

  return {
    ok: true,
    team,
    workflow,
    program,
    absolutePath,
    relativePath,
  };
}

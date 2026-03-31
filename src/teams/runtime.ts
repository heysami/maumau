import fs from "node:fs/promises";
import path from "node:path";
import { resolveAgentWorkspaceDir } from "../agents/agent-scope.js";
import { loadConfig, type MaumauConfig } from "../config/config.js";
import type { TeamConfig, TeamWorkflowConfig } from "../config/types.teams.js";
import { loadSessionEntry } from "../gateway/session-utils.js";
import { normalizeAgentId, parseAgentSessionKey } from "../routing/session-key.js";
import { findTeamConfig, listLinkedAgentIds, resolveTeamRole, canTeamUseTeam } from "./model.js";
import { findTeamWorkflow, normalizeTeamWorkflowId } from "./model.js";
import { generateTeamOpenProsePreview } from "./openprose.js";

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

export type SessionTeamContext = {
  teamId: string;
  teamRole?: string;
  team?: TeamConfig;
  sessionAgentId?: string;
};

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
  if (!teamId) {
    return undefined;
  }
  const sessionAgentId = parseAgentSessionKey(sessionKey)?.agentId;
  return {
    teamId,
    teamRole: normalizeOptionalText(entry?.teamRole),
    team: findTeamConfig(cfg, teamId),
    sessionAgentId: sessionAgentId ? normalizeAgentId(sessionAgentId) : undefined,
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

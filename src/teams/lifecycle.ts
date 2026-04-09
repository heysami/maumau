import type { TeamWorkflowBaseConfig, TeamWorkflowConfig } from "../config/types.teams.js";

export const TEAM_WORKFLOW_LIFECYCLE_STATUS_VALUES = [
  "blocked",
  "in_progress",
  "review",
  "done",
  "idle",
] as const;

export type TeamWorkflowLifecycleStageStatus =
  (typeof TEAM_WORKFLOW_LIFECYCLE_STATUS_VALUES)[number];

export type TeamWorkflowLifecycleStage = {
  id: string;
  name?: string;
  status: TeamWorkflowLifecycleStageStatus;
  roles: string[];
};

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeLifecycleStageId(value: string, fallbackIndex: number): string {
  const trimmed = value.trim().toLowerCase();
  if (trimmed) {
    return trimmed;
  }
  return `stage-${fallbackIndex + 1}`;
}

function normalizeLifecycleStageStatus(value: unknown): TeamWorkflowLifecycleStageStatus {
  return TEAM_WORKFLOW_LIFECYCLE_STATUS_VALUES.includes(value as TeamWorkflowLifecycleStageStatus)
    ? (value as TeamWorkflowLifecycleStageStatus)
    : "in_progress";
}

function normalizeLifecycleRoleList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const roles: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const normalized = normalizeOptionalText(entry)?.toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    roles.push(normalized);
  }
  return roles;
}

function humanizeLifecycleStageId(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function resolveConfiguredTeamWorkflowLifecycleStages(
  workflow: Pick<TeamWorkflowBaseConfig, "lifecycle">,
): TeamWorkflowLifecycleStage[] {
  const rawStages = Array.isArray(workflow.lifecycle?.stages) ? workflow.lifecycle.stages : [];
  const stages: TeamWorkflowLifecycleStage[] = [];
  const seen = new Set<string>();
  for (const [index, stage] of rawStages.entries()) {
    if (!stage || typeof stage !== "object") {
      continue;
    }
    const id = normalizeLifecycleStageId(String(stage.id ?? ""), index);
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    const name = normalizeOptionalText(stage.name) ?? humanizeLifecycleStageId(id);
    stages.push({
      id,
      name,
      status: normalizeLifecycleStageStatus(stage.status),
      roles: normalizeLifecycleRoleList(stage.roles),
    });
  }
  return stages;
}

export function resolveTeamWorkflowLifecycleStages(
  workflow: Pick<TeamWorkflowConfig, "id" | "lifecycle">,
): TeamWorkflowLifecycleStage[] {
  const configured = resolveConfiguredTeamWorkflowLifecycleStages(workflow);
  if (configured.length > 0) {
    return configured;
  }
  return [
    {
      id: "working",
      name: "Working",
      status: "in_progress",
      roles: [],
    },
  ];
}

export function findLifecycleStageById(
  workflow: Pick<TeamWorkflowConfig, "id" | "lifecycle">,
  stageId?: string,
): TeamWorkflowLifecycleStage | undefined {
  const normalized = normalizeOptionalText(stageId)?.toLowerCase();
  if (!normalized) {
    return undefined;
  }
  return resolveTeamWorkflowLifecycleStages(workflow).find((stage) => stage.id === normalized);
}

export function findLifecycleStageByRole(
  workflow: Pick<TeamWorkflowConfig, "id" | "lifecycle">,
  role?: string,
): TeamWorkflowLifecycleStage | undefined {
  const normalizedRole = normalizeOptionalText(role)?.toLowerCase();
  if (!normalizedRole) {
    return undefined;
  }
  return resolveTeamWorkflowLifecycleStages(workflow).find((stage) =>
    stage.roles.includes(normalizedRole),
  );
}

export function formatLifecycleProgressLabel(params: {
  completedStepCount: number;
  totalStepCount: number;
  currentStageLabel?: string;
}): string | undefined {
  if (!Number.isFinite(params.totalStepCount) || params.totalStepCount <= 0) {
    return undefined;
  }
  const progress = `${Math.max(0, params.completedStepCount)}/${params.totalStepCount}`;
  const stageLabel = normalizeOptionalText(params.currentStageLabel);
  return stageLabel ? `${progress} · ${stageLabel}` : progress;
}

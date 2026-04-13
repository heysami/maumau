import type { AgentConfig } from "../config/types.agents.js";
import type { TeamConfig } from "../config/types.teams.js";

export const BUSINESS_STATUSES = ["exploring", "active", "paused", "archived"] as const;
export type BusinessStatus = (typeof BUSINESS_STATUSES)[number];

export const PROJECT_STATUSES = [
  "brainstorming",
  "researching",
  "proposed",
  "approved",
  "building",
  "live",
  "paused",
  "archived",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const BUSINESS_BLUEPRINT_APPROVAL_STATUSES = [
  "draft",
  "proposed",
  "approved",
  "applied",
] as const;
export type BusinessBlueprintApprovalStatus = (typeof BUSINESS_BLUEPRINT_APPROVAL_STATUSES)[number];

export type BusinessProjectBlueprintToolRequirements = {
  downloads?: string[];
  integrations?: string[];
  webResearchTopics?: string[];
};

export type BusinessProjectBlueprintWorkspacePlan = {
  relativeDir?: string;
  label?: string;
};

export type BusinessProjectBlueprintApproval = {
  status: BusinessBlueprintApprovalStatus;
  requestedAt?: string;
  approvedAt?: string;
  appliedAt?: string;
  appliedTeamId?: string;
  notes?: string;
};

export type BusinessProjectBlueprint = {
  version: number;
  businessId: string;
  businessName?: string;
  projectId: string;
  projectName: string;
  projectStatus?: ProjectStatus;
  projectTag: string;
  goal?: string;
  scope?: string;
  proposalSummary?: string;
  nextStep?: string;
  appNeeded?: boolean;
  requiresVibeCoder?: boolean;
  requiresDesignStudio?: boolean;
  workspace?: BusinessProjectBlueprintWorkspacePlan;
  toolRequirements?: BusinessProjectBlueprintToolRequirements;
  team: TeamConfig;
  agents: AgentConfig[];
  approval?: BusinessProjectBlueprintApproval;
};

export type BusinessRecord = {
  businessId: string;
  businessName: string;
  status: BusinessStatus;
  moneyGoal?: string;
  targetCustomer?: string;
  problem?: string;
  offer?: string;
  channels?: string;
  constraints?: string;
  currentAssets?: string;
  openQuestions?: string;
  updatedAtMs?: number;
};

export type ProjectRecord = {
  businessId: string;
  businessName?: string;
  projectId: string;
  projectName: string;
  status: ProjectStatus;
  goal?: string;
  scope?: string;
  appNeeded: boolean;
  projectTag: string;
  linkedWorkspace?: string;
  linkedWorkspaceLabel?: string;
  teamId?: string;
  nextStep?: string;
  proposalSummary?: string;
  updatedAtMs?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeStatus<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number],
): T[number] {
  const normalized = normalizeText(value)?.toLowerCase();
  if (!normalized) {
    return fallback;
  }
  return (allowed.find((entry) => entry === normalized) ?? fallback) as T[number];
}

function normalizeBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = normalizeText(value)?.toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (["true", "yes", "y", "1"].includes(normalized)) {
    return true;
  }
  if (["false", "no", "n", "0"].includes(normalized)) {
    return false;
  }
  return undefined;
}

function normalizeWorkspacePlan(value: unknown): BusinessProjectBlueprintWorkspacePlan | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const relativeDir = normalizeText(value.relativeDir);
  const label = normalizeText(value.label);
  if (!relativeDir && !label) {
    return undefined;
  }
  return {
    relativeDir,
    label,
  };
}

function normalizeToolRequirements(
  value: unknown,
): BusinessProjectBlueprintToolRequirements | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const asStringArray = (input: unknown): string[] | undefined => {
    if (!Array.isArray(input)) {
      return undefined;
    }
    const values = input
      .map((entry) => normalizeText(entry))
      .filter((entry): entry is string => Boolean(entry));
    return values.length > 0 ? values : undefined;
  };
  const downloads = asStringArray(value.downloads);
  const integrations = asStringArray(value.integrations);
  const webResearchTopics = asStringArray(value.webResearchTopics);
  if (!downloads && !integrations && !webResearchTopics) {
    return undefined;
  }
  return {
    downloads,
    integrations,
    webResearchTopics,
  };
}

function normalizeApproval(value: unknown): BusinessProjectBlueprintApproval | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return {
    status: normalizeStatus(value.status, BUSINESS_BLUEPRINT_APPROVAL_STATUSES, "draft"),
    requestedAt: normalizeText(value.requestedAt),
    approvedAt: normalizeText(value.approvedAt),
    appliedAt: normalizeText(value.appliedAt),
    appliedTeamId: normalizeText(value.appliedTeamId),
    notes: normalizeText(value.notes),
  };
}

export function parseBusinessProjectBlueprint(
  input: unknown,
): { ok: true; value: BusinessProjectBlueprint } | { ok: false; error: string } {
  let parsed = input;
  if (typeof input === "string") {
    try {
      parsed = JSON.parse(input);
    } catch (error) {
      return {
        ok: false,
        error: `Invalid BLUEPRINT.json: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
  if (!isRecord(parsed)) {
    return { ok: false, error: "Invalid BLUEPRINT.json: expected an object." };
  }

  const versionRaw = parsed.version;
  const version =
    typeof versionRaw === "number" && Number.isFinite(versionRaw) ? Math.trunc(versionRaw) : 1;
  const businessId = normalizeText(parsed.businessId);
  const projectId = normalizeText(parsed.projectId);
  const projectName = normalizeText(parsed.projectName);
  const projectTag = normalizeText(parsed.projectTag);
  if (!businessId) {
    return { ok: false, error: "Invalid BLUEPRINT.json: businessId is required." };
  }
  if (!projectId) {
    return { ok: false, error: "Invalid BLUEPRINT.json: projectId is required." };
  }
  if (!projectName) {
    return { ok: false, error: "Invalid BLUEPRINT.json: projectName is required." };
  }
  if (!projectTag) {
    return { ok: false, error: "Invalid BLUEPRINT.json: projectTag is required." };
  }

  const team = parsed.team;
  if (!isRecord(team)) {
    return { ok: false, error: "Invalid BLUEPRINT.json: team is required." };
  }
  if (!normalizeText(team.id) || !normalizeText(team.managerAgentId)) {
    return {
      ok: false,
      error: "Invalid BLUEPRINT.json: team.id and team.managerAgentId are required.",
    };
  }

  const agents = Array.isArray(parsed.agents) ? parsed.agents : [];
  if (agents.length === 0) {
    return { ok: false, error: "Invalid BLUEPRINT.json: agents must not be empty." };
  }
  const normalizedAgents = agents.filter(isRecord) as AgentConfig[];
  if (normalizedAgents.length !== agents.length) {
    return { ok: false, error: "Invalid BLUEPRINT.json: each agent must be an object." };
  }
  if (
    !normalizedAgents.some(
      (entry) => normalizeText(entry.id) === normalizeText(team.managerAgentId),
    )
  ) {
    return {
      ok: false,
      error: "Invalid BLUEPRINT.json: agents must include the team manager agent.",
    };
  }

  const projectStatus = normalizeStatus(parsed.projectStatus, PROJECT_STATUSES, "proposed");
  return {
    ok: true,
    value: {
      version: Math.max(1, version),
      businessId,
      businessName: normalizeText(parsed.businessName),
      projectId,
      projectName,
      projectStatus,
      projectTag,
      goal: normalizeText(parsed.goal),
      scope: normalizeText(parsed.scope),
      proposalSummary: normalizeText(parsed.proposalSummary),
      nextStep: normalizeText(parsed.nextStep),
      appNeeded: normalizeBoolean(parsed.appNeeded) ?? false,
      requiresVibeCoder: normalizeBoolean(parsed.requiresVibeCoder),
      requiresDesignStudio: normalizeBoolean(parsed.requiresDesignStudio),
      workspace: normalizeWorkspacePlan(parsed.workspace),
      toolRequirements: normalizeToolRequirements(parsed.toolRequirements),
      team: team as TeamConfig,
      agents: normalizedAgents,
      approval: normalizeApproval(parsed.approval),
    },
  };
}

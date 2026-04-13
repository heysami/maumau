import path from "node:path";
import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../agents/agent-scope.js";
import { listBusinessRegistry, resolveBusinessFilePath } from "../business/registry.js";
import type { MaumauConfig } from "../config/types.maumau.js";
import type {
  DashboardAgentAppItem,
  DashboardBusinessField,
  DashboardBusinessItem,
  DashboardBusinessResult,
  DashboardProjectItem,
  DashboardProjectsResult,
  DashboardSavedWorkshopItem,
  DashboardTask,
  DashboardWorkshopItem,
} from "./dashboard-types.js";
import { normalizeDashboardProjectName } from "./dashboard-workshop-saved.js";

const BUSINESS_FIELD_SPECS: Array<{
  key: keyof DashboardBusinessItemFieldSource;
  label: string;
  description: string;
}> = [
  {
    key: "moneyGoal",
    label: "Money goal",
    description: "How this business is meant to make money or what income target matters.",
  },
  {
    key: "targetCustomer",
    label: "Target customer",
    description: "Who this business is for.",
  },
  {
    key: "problem",
    label: "Problem",
    description: "What pain, need, or demand this business is trying to solve.",
  },
  {
    key: "offer",
    label: "Offer",
    description: "What the business plans to sell, deliver, or provide.",
  },
  {
    key: "channels",
    label: "Channels",
    description: "How the business expects to acquire users, customers, or distribution.",
  },
  {
    key: "constraints",
    label: "Constraints",
    description: "Budget, time, capability, or operational limits that shape execution.",
  },
  {
    key: "currentAssets",
    label: "Current assets",
    description:
      "Existing advantages, distribution, product assets, or relationships already in hand.",
  },
  {
    key: "openQuestions",
    label: "Open questions",
    description: "What still needs to be answered before this business is truly clear.",
  },
] as const;

type DashboardBusinessItemFieldSource = {
  moneyGoal?: string;
  targetCustomer?: string;
  problem?: string;
  offer?: string;
  channels?: string;
  constraints?: string;
  currentAssets?: string;
  openQuestions?: string;
};

function normalizeComparableText(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function buildBusinessFields(source: DashboardBusinessItemFieldSource): DashboardBusinessField[] {
  return BUSINESS_FIELD_SPECS.map((spec) => {
    const value = source[spec.key];
    return {
      key: spec.key,
      label: spec.label,
      description: spec.description,
      value,
      status: value ? "recorded" : "missing",
    };
  });
}

function isActiveProjectStatus(status: DashboardProjectItem["status"]): boolean {
  return status !== "paused" && status !== "archived";
}

function normalizeProjectJoinKey(projectTag: string | undefined): string | undefined {
  const normalized = normalizeDashboardProjectName(projectTag);
  return normalized.key;
}

function matchesProjectItem(
  project: Pick<DashboardProjectItem, "projectTag" | "projectName">,
  item: Pick<
    DashboardTask | DashboardWorkshopItem | DashboardSavedWorkshopItem | DashboardAgentAppItem,
    "projectKey" | "projectName"
  >,
): boolean {
  const projectKey = normalizeProjectJoinKey(project.projectTag);
  if (projectKey && item.projectKey && projectKey === item.projectKey) {
    return true;
  }
  const projectName = normalizeComparableText(project.projectName);
  const itemName = normalizeComparableText(item.projectName);
  return Boolean(projectName && itemName && projectName === itemName);
}

export async function collectDashboardBusiness(params: {
  cfg: MaumauConfig;
  nowMs?: number;
}): Promise<DashboardBusinessResult> {
  const generatedAtMs = params.nowMs ?? Date.now();
  const workspaceDir = resolveAgentWorkspaceDir(params.cfg, resolveDefaultAgentId(params.cfg));
  const records = await listBusinessRegistry(workspaceDir);
  return {
    generatedAtMs,
    items: records.map(({ business, projects }) => {
      const fields = buildBusinessFields(business);
      return {
        businessId: business.businessId,
        businessName: business.businessName,
        status: business.status,
        sourceLabel: path.relative(
          workspaceDir,
          resolveBusinessFilePath(workspaceDir, business.businessId),
        ),
        updatedAtMs: business.updatedAtMs,
        recordedFieldCount: fields.filter((field) => field.status === "recorded").length,
        missingFieldCount: fields.filter((field) => field.status === "missing").length,
        projectCount: projects.length,
        activeProjectCount: projects.filter((project) =>
          isActiveProjectStatus(project.project.status),
        ).length,
        fields,
      } satisfies DashboardBusinessItem;
    }),
  };
}

export async function collectDashboardProjects(params: {
  cfg: MaumauConfig;
  tasks: DashboardTask[];
  workshopItems: DashboardWorkshopItem[];
  savedWorkshopItems: DashboardSavedWorkshopItem[];
  agentApps: DashboardAgentAppItem[];
  nowMs?: number;
}): Promise<DashboardProjectsResult> {
  const generatedAtMs = params.nowMs ?? Date.now();
  const workspaceDir = resolveAgentWorkspaceDir(params.cfg, resolveDefaultAgentId(params.cfg));
  const records = await listBusinessRegistry(workspaceDir);
  const items: DashboardProjectItem[] = [];
  for (const { business, projects } of records) {
    for (const entry of projects) {
      const linkedTaskCount = params.tasks.filter((task) =>
        matchesProjectItem(
          { projectTag: entry.project.projectTag, projectName: entry.project.projectName },
          task,
        ),
      ).length;
      const linkedWorkshopCount =
        params.workshopItems.filter((item) =>
          matchesProjectItem(
            { projectTag: entry.project.projectTag, projectName: entry.project.projectName },
            item,
          ),
        ).length +
        params.savedWorkshopItems.filter((item) =>
          matchesProjectItem(
            { projectTag: entry.project.projectTag, projectName: entry.project.projectName },
            item,
          ),
        ).length;
      const linkedAgentAppCount = params.agentApps.filter((item) =>
        matchesProjectItem(
          { projectTag: entry.project.projectTag, projectName: entry.project.projectName },
          item,
        ),
      ).length;
      items.push({
        businessId: business.businessId,
        businessName: business.businessName,
        projectId: entry.project.projectId,
        projectName: entry.project.projectName,
        status: entry.project.status,
        projectTag: entry.project.projectTag,
        appNeeded: entry.project.appNeeded,
        goal: entry.project.goal,
        scope: entry.project.scope,
        teamId: entry.project.teamId ?? entry.blueprint?.approval?.appliedTeamId,
        linkedWorkspace: entry.project.linkedWorkspace,
        linkedWorkspaceLabel:
          entry.project.linkedWorkspaceLabel ??
          (entry.project.linkedWorkspace
            ? path.basename(entry.project.linkedWorkspace)
            : undefined),
        nextStep: entry.project.nextStep,
        proposalSummary: entry.project.proposalSummary,
        updatedAtMs: Math.max(entry.project.updatedAtMs ?? 0, business.updatedAtMs ?? 0),
        blueprintVersion: entry.blueprint?.version,
        blueprintStatus: entry.blueprint
          ? (entry.blueprint.approval?.status ?? "draft")
          : entry.blueprintError
            ? "invalid"
            : "missing",
        blueprintError: entry.blueprintError,
        linkedTaskCount,
        linkedWorkshopCount,
        linkedAgentAppCount,
      });
    }
  }
  return {
    generatedAtMs,
    items: items.toSorted((left, right) => (right.updatedAtMs ?? 0) - (left.updatedAtMs ?? 0)),
  };
}

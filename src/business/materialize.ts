import fs from "node:fs/promises";
import path from "node:path";
import { loadConfig, readConfigFileSnapshotForWrite, writeConfigFile } from "../config/config.js";
import { resolveStateDir } from "../config/paths.js";
import type { AgentConfig } from "../config/types.agents.js";
import type { TeamConfig } from "../config/types.teams.js";
import {
  normalizeDashboardProjectName,
  readDashboardWorkshopStore,
  writeDashboardWorkshopStore,
} from "../gateway/dashboard-workshop-saved.js";
import { refreshStoredDashboardTeamSnapshots } from "../gateway/dashboard.js";
import { DESIGN_STUDIO_TEAM_ID, STARTER_TEAM_ID } from "../teams/presets.js";
import {
  ensureBusinessScaffold,
  loadProjectRecordById,
  resolveBusinessFilePath,
  resolveBusinessRoot,
  upsertAgentAppEntry,
  writeBlueprint,
  writeProjectMarkdown,
} from "./registry.js";
import type { BusinessProjectBlueprint, ProjectStatus } from "./types.js";

type MaterializeBusinessProjectResult = {
  ok: true;
  businessId: string;
  projectId: string;
  projectName: string;
  projectTag: string;
  status: ProjectStatus;
  teamId: string;
  workspaceDir: string;
  createdAgentIds: string[];
  createdTeam: boolean;
  updatedAgentApp: boolean;
};

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function pathLabel(targetPath: string): string {
  const label = path.basename(targetPath);
  return label && label !== "." && label !== path.sep ? label : targetPath;
}

function assertSafeRelativeDir(value: string | undefined): string | undefined {
  const normalized = normalizeText(value);
  if (!normalized) {
    return undefined;
  }
  const resolved = path.posix.normalize(normalized.replaceAll("\\", "/"));
  if (
    resolved.startsWith("../") ||
    resolved.includes("/../") ||
    resolved === ".." ||
    path.isAbsolute(resolved)
  ) {
    throw new Error(`Unsafe workspace.relativeDir: ${value}`);
  }
  return resolved.replace(/^\.\/+/u, "");
}

function resolveProjectWorkspaceDir(stateDir: string, blueprint: BusinessProjectBlueprint): string {
  const explicitRelative = assertSafeRelativeDir(blueprint.workspace?.relativeDir);
  if (explicitRelative) {
    return path.join(stateDir, explicitRelative);
  }
  return path.join(stateDir, "business-projects", blueprint.businessId, blueprint.projectId);
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

async function writeFileAtomic(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now().toString(36)}`;
  await fs.writeFile(tempPath, content, "utf8");
  await fs.rename(tempPath, filePath);
}

function ensureRequiredCrossTeamLinks(
  team: TeamConfig,
  blueprint: BusinessProjectBlueprint,
): TeamConfig {
  const requiredTeamIds = new Set<string>();
  if (blueprint.appNeeded || blueprint.requiresVibeCoder) {
    requiredTeamIds.add(STARTER_TEAM_ID);
  }
  if (blueprint.requiresDesignStudio) {
    requiredTeamIds.add(DESIGN_STUDIO_TEAM_ID);
  }
  const existingLinks = Array.isArray(team.crossTeamLinks) ? [...team.crossTeamLinks] : [];
  for (const teamId of requiredTeamIds) {
    const hasLink = existingLinks.some(
      (entry) => entry.type === "team" && normalizeText(entry.targetId).toLowerCase() === teamId,
    );
    if (!hasLink) {
      existingLinks.push({
        type: "team",
        targetId: teamId,
        description:
          teamId === STARTER_TEAM_ID
            ? "Use for app, tool, and implementation builds tied to this project."
            : "Use for asset-only design work tied to this project.",
      });
    }
  }
  return {
    ...team,
    crossTeamLinks: existingLinks,
  };
}

function normalizeProjectAgents(agents: AgentConfig[], workspaceDir: string): AgentConfig[] {
  return agents.map((agent) => ({
    ...agent,
    id: normalizeText(agent.id),
    name: normalizeText(agent.name) || undefined,
    workspace: workspaceDir,
  }));
}

function stringifyComparable(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function isSameAgentConfig(left: AgentConfig, right: AgentConfig): boolean {
  return stringifyComparable(left) === stringifyComparable(right);
}

function isSameTeamConfig(left: TeamConfig, right: TeamConfig): boolean {
  return stringifyComparable(left) === stringifyComparable(right);
}

async function seedProjectWorkspace(params: {
  workspaceDir: string;
  blueprint: BusinessProjectBlueprint;
  canonicalProjectPath: string;
}): Promise<void> {
  await ensureDir(params.workspaceDir);
  const projectWorkspaceFile = path.join(params.workspaceDir, "PROJECT.md");
  const content = [
    `# ${params.blueprint.projectName}`,
    "",
    `- **Business:** ${params.blueprint.businessName ?? params.blueprint.businessId}`,
    `- **Project tag:** ${params.blueprint.projectTag}`,
    `- **Goal:** ${params.blueprint.goal ?? ""}`,
    `- **Scope:** ${params.blueprint.scope ?? ""}`,
    `- **Canonical dossier:** ${params.canonicalProjectPath}`,
    "",
    "Use this workspace for project execution, project-scoped memory, and implementation artifacts.",
    "",
  ].join("\n");
  await writeFileAtomic(projectWorkspaceFile, content);
}

export async function materializeBusinessProjectBlueprint(params: {
  workspaceDir: string;
  businessId: string;
  projectId: string;
  expectedVersion: number;
  stateDir?: string;
  nowMs?: number;
}): Promise<MaterializeBusinessProjectResult> {
  const nowMs = params.nowMs ?? Date.now();
  const loaded = await loadProjectRecordById(
    params.workspaceDir,
    params.businessId,
    params.projectId,
  );
  if (!loaded) {
    throw new Error(`Unknown project: ${params.businessId}/${params.projectId}`);
  }
  if (!loaded.blueprint) {
    throw new Error(loaded.blueprintError ?? "Project blueprint is missing.");
  }
  const blueprint = loaded.blueprint;
  if (blueprint.version !== params.expectedVersion) {
    throw new Error(
      `Blueprint version mismatch. Expected ${params.expectedVersion}, found ${blueprint.version}.`,
    );
  }
  const approvalStatus = blueprint.approval?.status ?? "draft";
  if (approvalStatus !== "approved" && approvalStatus !== "applied") {
    throw new Error("Blueprint must be approved before it can be materialized.");
  }

  const projectWorkspaceDir = resolveProjectWorkspaceDir(
    params.stateDir ?? resolveStateDir(),
    blueprint,
  );
  const normalizedProjectWorkspaceDir = path.resolve(projectWorkspaceDir);
  await ensureBusinessScaffold({
    workspaceDir: params.workspaceDir,
    businessId: blueprint.businessId,
    businessName: blueprint.businessName ?? loaded.project.businessName ?? blueprint.businessId,
    projectId: blueprint.projectId,
    projectName: blueprint.projectName,
    projectTag: blueprint.projectTag,
  });
  await seedProjectWorkspace({
    workspaceDir: normalizedProjectWorkspaceDir,
    blueprint,
    canonicalProjectPath: loaded.projectPath,
  });

  const normalizedTeam = ensureRequiredCrossTeamLinks(blueprint.team, blueprint);
  const normalizedAgents = normalizeProjectAgents(blueprint.agents, normalizedProjectWorkspaceDir);
  const { snapshot, writeOptions } = await readConfigFileSnapshotForWrite();
  const currentConfig = snapshot.config ?? loadConfig();
  const nextAgents = Array.isArray(currentConfig.agents?.list)
    ? [...currentConfig.agents.list]
    : [];
  const createdAgentIds: string[] = [];
  for (const agent of normalizedAgents) {
    const existingIndex = nextAgents.findIndex((entry) => normalizeText(entry.id) === agent.id);
    if (existingIndex >= 0) {
      if (!isSameAgentConfig(nextAgents[existingIndex], agent)) {
        throw new Error(`Agent id "${agent.id}" already exists with a different config.`);
      }
      continue;
    }
    nextAgents.push(agent);
    createdAgentIds.push(agent.id);
  }

  const nextTeams = Array.isArray(currentConfig.teams?.list) ? [...currentConfig.teams.list] : [];
  const existingTeamIndex = nextTeams.findIndex(
    (entry) => normalizeText(entry.id) === normalizedTeam.id,
  );
  let createdTeam = false;
  if (existingTeamIndex >= 0) {
    if (!isSameTeamConfig(nextTeams[existingTeamIndex], normalizedTeam)) {
      throw new Error(`Team id "${normalizedTeam.id}" already exists with a different config.`);
    }
  } else {
    nextTeams.push(normalizedTeam);
    createdTeam = true;
  }

  const nextConfig = {
    ...currentConfig,
    agents: {
      ...currentConfig.agents,
      list: nextAgents,
    },
    teams: {
      ...currentConfig.teams,
      list: nextTeams,
    },
  };
  await writeConfigFile(nextConfig, writeOptions);
  await refreshStoredDashboardTeamSnapshots({
    cfg: nextConfig,
    stateDir: params.stateDir,
    nowMs,
  });

  const projectBinding = normalizeDashboardProjectName(blueprint.projectTag);
  const workshopStore = await readDashboardWorkshopStore({ stateDir: params.stateDir });
  if (projectBinding.name && projectBinding.key) {
    workshopStore.projectByWorkspace[normalizedProjectWorkspaceDir] = {
      name: projectBinding.name,
      key: projectBinding.key,
      updatedAtMs: nowMs,
    };
    workshopStore.updatedAtMs = nowMs;
    await writeDashboardWorkshopStore(workshopStore, params.stateDir);
  }

  const nextStatus: ProjectStatus =
    blueprint.projectStatus === "proposed" ? "approved" : (blueprint.projectStatus ?? "approved");
  await writeProjectMarkdown({
    workspaceDir: params.workspaceDir,
    businessId: blueprint.businessId,
    businessName: blueprint.businessName ?? loaded.project.businessName,
    projectId: blueprint.projectId,
    projectName: blueprint.projectName,
    status: nextStatus,
    goal: blueprint.goal ?? loaded.project.goal,
    scope: blueprint.scope ?? loaded.project.scope,
    appNeeded: blueprint.appNeeded ?? loaded.project.appNeeded,
    projectTag: blueprint.projectTag,
    linkedWorkspace: normalizedProjectWorkspaceDir,
    teamId: normalizedTeam.id,
    nextStep: blueprint.nextStep ?? loaded.project.nextStep,
    proposalSummary: blueprint.proposalSummary ?? loaded.project.proposalSummary,
  });

  const nextBlueprint: BusinessProjectBlueprint = {
    ...blueprint,
    projectStatus: nextStatus,
    workspace: {
      relativeDir:
        blueprint.workspace?.relativeDir ??
        path.relative(params.stateDir ?? resolveStateDir(), normalizedProjectWorkspaceDir),
      label: blueprint.workspace?.label ?? pathLabel(normalizedProjectWorkspaceDir),
    },
    approval: {
      status: "applied",
      requestedAt: blueprint.approval?.requestedAt,
      approvedAt: blueprint.approval?.approvedAt ?? new Date(nowMs).toISOString(),
      appliedAt: new Date(nowMs).toISOString(),
      appliedTeamId: normalizedTeam.id,
      notes: blueprint.approval?.notes,
    },
  };
  await writeBlueprint({
    workspaceDir: params.workspaceDir,
    businessId: blueprint.businessId,
    projectId: blueprint.projectId,
    blueprint: nextBlueprint,
  });

  let updatedAgentApp = false;
  if (blueprint.appNeeded) {
    await upsertAgentAppEntry({
      workspaceDir: params.workspaceDir,
      title: blueprint.projectName,
      owner: "Business Dev Manager",
      status: "building",
      whyNow: blueprint.proposalSummary,
      howItHelps: blueprint.goal,
      suggestedScope: blueprint.scope,
      projectName: blueprint.projectTag,
      taskTitle: blueprint.nextStep,
    });
    updatedAgentApp = true;
  }

  return {
    ok: true,
    businessId: blueprint.businessId,
    projectId: blueprint.projectId,
    projectName: blueprint.projectName,
    projectTag: blueprint.projectTag,
    status: nextStatus,
    teamId: normalizedTeam.id,
    workspaceDir: normalizedProjectWorkspaceDir,
    createdAgentIds,
    createdTeam,
    updatedAgentApp,
  };
}

export async function ensureBusinessRootExists(workspaceDir: string): Promise<void> {
  await ensureDir(resolveBusinessRoot(workspaceDir));
  const readmePath = path.join(resolveBusinessRoot(workspaceDir), "README.md");
  try {
    await fs.access(readmePath);
  } catch {
    await writeFileAtomic(
      readmePath,
      [
        "# Business Portfolio",
        "",
        "This directory keeps owner-private business and project dossiers.",
        "",
        `- Canonical business dossiers live in \`${path.basename(resolveBusinessFilePath(workspaceDir, "business-id"))}\` files inside each business folder.`,
        "- Project dossiers and BLUEPRINT.json files live under each business/projects directory.",
        "",
      ].join("\n"),
    );
  }
}

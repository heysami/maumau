import fs from "node:fs/promises";
import path from "node:path";
import {
  type BusinessProjectBlueprint,
  type BusinessRecord,
  BUSINESS_STATUSES,
  type BusinessStatus,
  parseBusinessProjectBlueprint,
  PROJECT_STATUSES,
  type ProjectRecord,
  type ProjectStatus,
} from "./types.js";

export const BUSINESS_DIRNAME = "business";
export const BUSINESS_FILENAME = "BUSINESS.md";
export const PROJECTS_DIRNAME = "projects";
export const PROJECT_FILENAME = "PROJECT.md";
export const BLUEPRINT_FILENAME = "BLUEPRINT.json";
export const AGENT_APPS_FILENAME = "AGENT_APPS.md";

export type LoadedBusinessProjectRecord = {
  project: ProjectRecord;
  blueprint?: BusinessProjectBlueprint;
  blueprintError?: string;
  projectPath: string;
  blueprintPath: string;
};

export type LoadedBusinessRecord = {
  business: BusinessRecord;
  businessPath: string;
  projects: LoadedBusinessProjectRecord[];
};

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeComparableText(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function slugifyBusinessKey(value: string): string {
  const normalized = normalizeComparableText(value).replace(/\s+/g, "-");
  return normalized || "business";
}

export function slugifyProjectKey(value: string): string {
  const normalized = normalizeComparableText(value).replace(/\s+/g, "-");
  return normalized || "project";
}

function normalizeEnum<T extends readonly string[]>(
  value: string,
  allowed: T,
  fallback: T[number],
) {
  const normalized = normalizeText(value).toLowerCase();
  return (allowed.find((entry) => entry === normalized) ?? fallback) as T[number];
}

function parseBooleanFlag(value: string): boolean {
  const normalized = normalizeText(value).toLowerCase();
  return ["true", "yes", "y", "1"].includes(normalized);
}

function stripFrontMatter(content: string): string {
  if (!content.startsWith("---")) {
    return content;
  }
  const closing = content.indexOf("\n---", 3);
  if (closing < 0) {
    return content;
  }
  return content.slice(closing + 4).replace(/^\s+/, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeMarkdownFieldValue(value: string | undefined): string | undefined {
  const normalized = value
    ?.split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return undefined;
  }
  const comparable = normalized.replace(/[_*`]/g, "").trim().toLowerCase();
  if (comparable === "(optional)" || comparable === "optional") {
    return undefined;
  }
  return normalized;
}

function isMarkdownFieldBoundary(line: string): boolean {
  const trimmed = line.trimStart();
  return /^-\s+\*\*/u.test(trimmed) || /^#{1,6}\s+/u.test(trimmed) || /^---\s*$/u.test(trimmed);
}

function readMarkdownField(content: string, label: string): string | undefined {
  const lines = stripFrontMatter(content).replace(/\r\n/g, "\n").split("\n");
  const pattern = new RegExp(`^-\\s+\\*\\*${escapeRegExp(label)}:\\*\\*(?:\\s*(.*))?$`, "u");
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index]?.match(pattern);
    if (!match) {
      continue;
    }
    const valueLines: string[] = [];
    if (match[1]) {
      valueLines.push(match[1]);
    }
    for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
      const nextLine = lines[nextIndex] ?? "";
      if (isMarkdownFieldBoundary(nextLine)) {
        break;
      }
      valueLines.push(nextLine);
    }
    return normalizeMarkdownFieldValue(valueLines.join("\n"));
  }
  return undefined;
}

async function readOptionalFile(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
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

export function resolveBusinessRoot(workspaceDir: string): string {
  return path.join(workspaceDir, BUSINESS_DIRNAME);
}

export function resolveBusinessDir(workspaceDir: string, businessId: string): string {
  return path.join(resolveBusinessRoot(workspaceDir), businessId);
}

export function resolveProjectDir(
  workspaceDir: string,
  businessId: string,
  projectId: string,
): string {
  return path.join(resolveBusinessDir(workspaceDir, businessId), PROJECTS_DIRNAME, projectId);
}

export function resolveBusinessFilePath(workspaceDir: string, businessId: string): string {
  return path.join(resolveBusinessDir(workspaceDir, businessId), BUSINESS_FILENAME);
}

export function resolveProjectFilePath(
  workspaceDir: string,
  businessId: string,
  projectId: string,
): string {
  return path.join(resolveProjectDir(workspaceDir, businessId, projectId), PROJECT_FILENAME);
}

export function resolveBlueprintFilePath(
  workspaceDir: string,
  businessId: string,
  projectId: string,
): string {
  return path.join(resolveProjectDir(workspaceDir, businessId, projectId), BLUEPRINT_FILENAME);
}

export function formatBusinessMarkdown(record: {
  businessName: string;
  status?: BusinessStatus;
  moneyGoal?: string;
  targetCustomer?: string;
  problem?: string;
  offer?: string;
  channels?: string;
  constraints?: string;
  currentAssets?: string;
  openQuestions?: string;
}): string {
  return [
    `# ${record.businessName}`,
    "",
    "- **Name:** " + record.businessName,
    `- **Status:** ${record.status ?? "exploring"}`,
    `- **Money goal:** ${record.moneyGoal ?? ""}`,
    `- **Target customer:** ${record.targetCustomer ?? ""}`,
    `- **Problem:** ${record.problem ?? ""}`,
    `- **Offer:** ${record.offer ?? ""}`,
    `- **Channels:** ${record.channels ?? ""}`,
    `- **Constraints:** ${record.constraints ?? ""}`,
    `- **Current assets:** ${record.currentAssets ?? ""}`,
    `- **Open questions:** ${record.openQuestions ?? ""}`,
    "",
    "## Notes",
    "",
    "Use this dossier to keep the venture definition, constraints, and open questions in one place.",
    "",
  ].join("\n");
}

export function formatProjectMarkdown(record: {
  projectName: string;
  businessName?: string;
  status?: ProjectStatus;
  goal?: string;
  scope?: string;
  appNeeded?: boolean;
  projectTag: string;
  linkedWorkspace?: string;
  teamId?: string;
  nextStep?: string;
  proposalSummary?: string;
}): string {
  return [
    `# ${record.projectName}`,
    "",
    `- **Name:** ${record.projectName}`,
    `- **Business:** ${record.businessName ?? ""}`,
    `- **Status:** ${record.status ?? "brainstorming"}`,
    `- **Goal:** ${record.goal ?? ""}`,
    `- **Scope:** ${record.scope ?? ""}`,
    `- **App needed:** ${record.appNeeded ? "yes" : "no"}`,
    `- **Project tag:** ${record.projectTag}`,
    `- **Linked workspace:** ${record.linkedWorkspace ?? ""}`,
    `- **Team:** ${record.teamId ?? ""}`,
    `- **Next step:** ${record.nextStep ?? ""}`,
    `- **Proposal summary:** ${record.proposalSummary ?? ""}`,
    "",
    "## Notes",
    "",
    "Keep the canonical project scope, handoff state, and next actions here.",
    "",
  ].join("\n");
}

function parseBusinessRecord(
  businessId: string,
  content: string,
  updatedAtMs?: number,
): BusinessRecord {
  const businessName = readMarkdownField(content, "Name") ?? businessId;
  return {
    businessId,
    businessName,
    status: normalizeEnum(
      readMarkdownField(content, "Status") ?? "",
      BUSINESS_STATUSES,
      "exploring",
    ),
    moneyGoal: readMarkdownField(content, "Money goal"),
    targetCustomer: readMarkdownField(content, "Target customer"),
    problem: readMarkdownField(content, "Problem"),
    offer: readMarkdownField(content, "Offer"),
    channels: readMarkdownField(content, "Channels"),
    constraints: readMarkdownField(content, "Constraints"),
    currentAssets: readMarkdownField(content, "Current assets"),
    openQuestions: readMarkdownField(content, "Open questions"),
    updatedAtMs,
  };
}

function parseProjectRecord(
  businessId: string,
  projectId: string,
  content: string,
  updatedAtMs?: number,
): ProjectRecord {
  const projectName = readMarkdownField(content, "Name") ?? projectId;
  const linkedWorkspace = readMarkdownField(content, "Linked workspace");
  return {
    businessId,
    businessName: readMarkdownField(content, "Business"),
    projectId,
    projectName,
    status: normalizeEnum(
      readMarkdownField(content, "Status") ?? "",
      PROJECT_STATUSES,
      "brainstorming",
    ),
    goal: readMarkdownField(content, "Goal"),
    scope: readMarkdownField(content, "Scope"),
    appNeeded: parseBooleanFlag(readMarkdownField(content, "App needed") ?? ""),
    projectTag: readMarkdownField(content, "Project tag") ?? slugifyProjectKey(projectName),
    linkedWorkspace,
    linkedWorkspaceLabel: linkedWorkspace ? path.basename(linkedWorkspace) : undefined,
    teamId: readMarkdownField(content, "Team"),
    nextStep: readMarkdownField(content, "Next step"),
    proposalSummary: readMarkdownField(content, "Proposal summary"),
    updatedAtMs,
  };
}

async function loadProjectRecord(
  workspaceDir: string,
  businessId: string,
  businessName: string,
  projectId: string,
): Promise<LoadedBusinessProjectRecord | null> {
  const projectPath = resolveProjectFilePath(workspaceDir, businessId, projectId);
  const blueprintPath = resolveBlueprintFilePath(workspaceDir, businessId, projectId);
  const projectContent = await readOptionalFile(projectPath);
  if (!projectContent) {
    return null;
  }
  const projectStat = await fs.stat(projectPath).catch(() => null);
  const project = parseProjectRecord(businessId, projectId, projectContent, projectStat?.mtimeMs);
  project.businessName = businessName;

  const blueprintContent = await readOptionalFile(blueprintPath);
  if (!blueprintContent) {
    return {
      project,
      projectPath,
      blueprintPath,
    };
  }
  const parsed = parseBusinessProjectBlueprint(blueprintContent);
  if (!parsed.ok) {
    return {
      project,
      blueprintError: parsed.error,
      projectPath,
      blueprintPath,
    };
  }
  return {
    project: {
      ...project,
      projectName: parsed.value.projectName || project.projectName,
      status: parsed.value.projectStatus ?? project.status,
      goal: parsed.value.goal ?? project.goal,
      scope: parsed.value.scope ?? project.scope,
      appNeeded: parsed.value.appNeeded ?? project.appNeeded,
      projectTag: parsed.value.projectTag || project.projectTag,
      nextStep: parsed.value.nextStep ?? project.nextStep,
      proposalSummary: parsed.value.proposalSummary ?? project.proposalSummary,
      teamId: parsed.value.team.id || project.teamId,
    },
    blueprint: parsed.value,
    projectPath,
    blueprintPath,
  };
}

export async function listBusinessRegistry(workspaceDir: string): Promise<LoadedBusinessRecord[]> {
  const businessRoot = resolveBusinessRoot(workspaceDir);
  if (!(await pathExists(businessRoot))) {
    return [];
  }
  const businessEntries = await fs.readdir(businessRoot, { withFileTypes: true });
  const loaded = await Promise.all(
    businessEntries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const businessPath = resolveBusinessFilePath(workspaceDir, entry.name);
        const businessContent = await readOptionalFile(businessPath);
        if (!businessContent) {
          return null;
        }
        const businessStat = await fs.stat(businessPath).catch(() => null);
        const business = parseBusinessRecord(entry.name, businessContent, businessStat?.mtimeMs);
        const projectRoot = path.join(
          resolveBusinessDir(workspaceDir, entry.name),
          PROJECTS_DIRNAME,
        );
        const projectEntries = (await pathExists(projectRoot))
          ? await fs.readdir(projectRoot, { withFileTypes: true })
          : [];
        const projects = (
          await Promise.all(
            projectEntries
              .filter((projectEntry) => projectEntry.isDirectory())
              .map((projectEntry) =>
                loadProjectRecord(
                  workspaceDir,
                  entry.name,
                  business.businessName,
                  projectEntry.name,
                ),
              ),
          )
        ).filter((record): record is LoadedBusinessProjectRecord => Boolean(record));
        return {
          business,
          businessPath,
          projects: projects.toSorted(
            (left, right) => (right.project.updatedAtMs ?? 0) - (left.project.updatedAtMs ?? 0),
          ),
        } satisfies LoadedBusinessRecord;
      }),
  );
  return loaded
    .filter((entry): entry is LoadedBusinessRecord => Boolean(entry))
    .toSorted((left, right) => {
      const leftUpdated = Math.max(
        left.business.updatedAtMs ?? 0,
        ...left.projects.map((project) => project.project.updatedAtMs ?? 0),
      );
      const rightUpdated = Math.max(
        right.business.updatedAtMs ?? 0,
        ...right.projects.map((project) => project.project.updatedAtMs ?? 0),
      );
      return rightUpdated - leftUpdated;
    });
}

export async function loadBusinessRecord(
  workspaceDir: string,
  businessId: string,
): Promise<LoadedBusinessRecord | null> {
  const records = await listBusinessRegistry(workspaceDir);
  return records.find((entry) => entry.business.businessId === businessId) ?? null;
}

export async function loadProjectRecordById(
  workspaceDir: string,
  businessId: string,
  projectId: string,
): Promise<LoadedBusinessProjectRecord | null> {
  const business = await loadBusinessRecord(workspaceDir, businessId);
  return business?.projects.find((entry) => entry.project.projectId === projectId) ?? null;
}

export async function ensureBusinessScaffold(params: {
  workspaceDir: string;
  businessId: string;
  businessName: string;
  projectId?: string;
  projectName?: string;
  projectTag?: string;
}): Promise<void> {
  const businessPath = resolveBusinessFilePath(params.workspaceDir, params.businessId);
  if (!(await pathExists(businessPath))) {
    await writeFileAtomic(
      businessPath,
      formatBusinessMarkdown({
        businessName: params.businessName,
      }),
    );
  }
  if (params.projectId && params.projectName && params.projectTag) {
    const projectPath = resolveProjectFilePath(
      params.workspaceDir,
      params.businessId,
      params.projectId,
    );
    if (!(await pathExists(projectPath))) {
      await writeFileAtomic(
        projectPath,
        formatProjectMarkdown({
          projectName: params.projectName,
          businessName: params.businessName,
          projectTag: params.projectTag,
        }),
      );
    }
  }
}

export async function writeProjectMarkdown(params: {
  workspaceDir: string;
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
  teamId?: string;
  nextStep?: string;
  proposalSummary?: string;
}): Promise<void> {
  const projectPath = resolveProjectFilePath(
    params.workspaceDir,
    params.businessId,
    params.projectId,
  );
  await writeFileAtomic(
    projectPath,
    formatProjectMarkdown({
      projectName: params.projectName,
      businessName: params.businessName,
      status: params.status,
      goal: params.goal,
      scope: params.scope,
      appNeeded: params.appNeeded,
      projectTag: params.projectTag,
      linkedWorkspace: params.linkedWorkspace,
      teamId: params.teamId,
      nextStep: params.nextStep,
      proposalSummary: params.proposalSummary,
    }),
  );
}

export async function writeBlueprint(params: {
  workspaceDir: string;
  businessId: string;
  projectId: string;
  blueprint: BusinessProjectBlueprint;
}): Promise<void> {
  const blueprintPath = resolveBlueprintFilePath(
    params.workspaceDir,
    params.businessId,
    params.projectId,
  );
  await writeFileAtomic(blueprintPath, `${JSON.stringify(params.blueprint, null, 2)}\n`);
}

export async function upsertAgentAppEntry(params: {
  workspaceDir: string;
  title: string;
  owner: string;
  status: "proposed" | "building" | "ready";
  whyNow?: string;
  howItHelps?: string;
  suggestedScope?: string;
  projectName?: string;
  taskTitle?: string;
}): Promise<void> {
  const appsPath = path.join(params.workspaceDir, AGENT_APPS_FILENAME);
  const existing = (await readOptionalFile(appsPath)) ?? "# Agent Apps\n\n";
  const heading = `## ${params.title}`;
  const sectionLines = [
    heading,
    "",
    `- **Owner:** ${params.owner}`,
    `- **Status:** ${params.status}`,
    `- **Why now:** ${params.whyNow ?? ""}`,
    `- **How it helps:** ${params.howItHelps ?? ""}`,
    `- **Suggested scope:** ${params.suggestedScope ?? ""}`,
    ...(params.projectName ? [`- **Project:** ${params.projectName}`] : []),
    ...(params.taskTitle ? [`- **Task title:** ${params.taskTitle}`] : []),
    "",
  ];
  const section = sectionLines.join("\n");
  const sectionPattern = new RegExp(
    `(^|\\n)##\\s+${escapeRegExp(params.title)}\\s*[\\s\\S]*?(?=\\n##\\s+|$)`,
    "u",
  );
  const nextContent = sectionPattern.test(existing)
    ? existing.replace(sectionPattern, `\n${section}`)
    : `${existing.trimEnd()}\n\n${section}`;
  await writeFileAtomic(appsPath, `${nextContent.trimEnd()}\n`);
}

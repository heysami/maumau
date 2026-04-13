import fs from "node:fs/promises";
import path from "node:path";
import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../agents/agent-scope.js";
import type { MaumauConfig } from "../config/types.maumau.js";
import {
  LIFE_IMPROVEMENT_ROLE_SPECS,
  LIFE_IMPROVEMENT_TEAM_MANAGER_AGENT_ID,
} from "../teams/life-improvement-preset.js";
import type {
  DashboardAgentAppItem,
  DashboardAgentAppStatus,
  DashboardSavedWorkshopItem,
  DashboardWorkshopItem,
} from "./dashboard-types.js";
import { normalizeDashboardProjectName } from "./dashboard-workshop-saved.js";

const AGENT_APPS_FILENAME = "AGENT_APPS.md";

type ParsedAgentAppDraft = {
  title: string;
  ownerLabel?: string;
  ownerAgentId?: string;
  status: DashboardAgentAppStatus;
  summary?: string;
  whyNow?: string;
  howItHelps?: string;
  suggestedScope?: string;
  projectName?: string;
  projectKey?: string;
  taskTitle?: string;
  updatedAtMs?: number;
};

type WorkshopCandidate = DashboardWorkshopItem | DashboardSavedWorkshopItem;

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

function slugify(value: string): string {
  return normalizeComparableText(value).replace(/\s+/g, "-");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function parseAgentAppStatus(value: string | undefined): DashboardAgentAppStatus {
  switch (normalizeComparableText(value)) {
    case "building":
    case "in progress":
    case "in-progress":
    case "build":
      return "building";
    case "ready":
    case "shipped":
    case "live":
      return "ready";
    default:
      return "proposed";
  }
}

function buildOwnerLookup(): Map<string, { ownerLabel: string; ownerAgentId: string }> {
  const lookup = new Map<string, { ownerLabel: string; ownerAgentId: string }>();
  for (const role of LIFE_IMPROVEMENT_ROLE_SPECS) {
    const entry = {
      ownerLabel: role.name,
      ownerAgentId: role.agentId,
    };
    lookup.set(normalizeComparableText(role.name), entry);
    lookup.set(normalizeComparableText(role.role), entry);
  }
  const managerEntry = {
    ownerLabel: "Life Improvement Manager",
    ownerAgentId: LIFE_IMPROVEMENT_TEAM_MANAGER_AGENT_ID,
  };
  lookup.set(normalizeComparableText(managerEntry.ownerLabel), managerEntry);
  lookup.set("manager", managerEntry);
  return lookup;
}

const OWNER_LOOKUP = buildOwnerLookup();

function resolveAgentAppOwner(ownerLabel: string | undefined): {
  ownerLabel?: string;
  ownerAgentId?: string;
} {
  const normalized = normalizeComparableText(ownerLabel);
  if (!normalized) {
    return {};
  }
  const matched = OWNER_LOOKUP.get(normalized);
  if (matched) {
    return matched;
  }
  return { ownerLabel: normalizeText(ownerLabel) || undefined };
}

function splitMarkdownSections(content: string): Array<{ title: string; body: string }> {
  const lines = stripFrontMatter(content).replace(/\r\n/g, "\n").split("\n");
  const sections: Array<{ title: string; body: string }> = [];
  let currentTitle: string | null = null;
  let currentLines: string[] = [];
  for (const line of lines) {
    const headingMatch = line.match(/^##+\s+(.+?)\s*$/u);
    if (headingMatch) {
      if (currentTitle) {
        sections.push({ title: currentTitle, body: currentLines.join("\n") });
      }
      currentTitle = headingMatch[1]?.trim() ?? "";
      currentLines = [];
      continue;
    }
    if (currentTitle) {
      currentLines.push(line);
    }
  }
  if (currentTitle) {
    sections.push({ title: currentTitle, body: currentLines.join("\n") });
  }
  return sections.filter((section) => normalizeText(section.title));
}

function parseAgentAppsMarkdown(params: {
  content: string;
  updatedAtMs?: number;
}): ParsedAgentAppDraft[] {
  return splitMarkdownSections(params.content)
    .map((section) => {
      const owner = readMarkdownField(section.body, "Owner");
      const projectName =
        readMarkdownField(section.body, "Project") ??
        readMarkdownField(section.body, "Project name");
      const project = normalizeDashboardProjectName(projectName);
      const { ownerLabel, ownerAgentId } = resolveAgentAppOwner(owner);
      const howItHelps =
        readMarkdownField(section.body, "How it helps") ??
        readMarkdownField(section.body, "How this helps");
      const whyNow = readMarkdownField(section.body, "Why now");
      const suggestedScope =
        readMarkdownField(section.body, "Suggested scope") ??
        readMarkdownField(section.body, "Scope");
      const taskTitle =
        readMarkdownField(section.body, "Task title") ?? readMarkdownField(section.body, "Task");
      const summary = normalizeText(howItHelps || whyNow);
      if (!section.title.trim()) {
        return null;
      }
      return {
        title: section.title.trim(),
        ownerLabel,
        ownerAgentId,
        status: parseAgentAppStatus(readMarkdownField(section.body, "Status")),
        summary: summary || undefined,
        whyNow,
        howItHelps,
        suggestedScope,
        projectName: project.name || undefined,
        projectKey: project.key || undefined,
        taskTitle,
        updatedAtMs: params.updatedAtMs,
      } satisfies ParsedAgentAppDraft;
    })
    .filter((draft): draft is ParsedAgentAppDraft => Boolean(draft));
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

function resolveProjectMatch(
  app: Pick<ParsedAgentAppDraft, "projectKey" | "projectName">,
  item: Pick<WorkshopCandidate, "projectKey" | "projectName">,
): boolean {
  if (app.projectKey && item.projectKey && app.projectKey === item.projectKey) {
    return true;
  }
  const left = normalizeComparableText(app.projectName);
  const right = normalizeComparableText(item.projectName);
  return Boolean(left && right && left === right);
}

function resolveWorkshopCandidateScore(app: ParsedAgentAppDraft, item: WorkshopCandidate): number {
  const appTitle = normalizeComparableText(app.title);
  const appTask = normalizeComparableText(app.taskTitle);
  const itemTitle = normalizeComparableText(item.title);
  const itemTask = normalizeComparableText(item.taskTitle);
  const titleMatch = Boolean(appTitle && (appTitle === itemTitle || appTitle === itemTask));
  const taskMatch = Boolean(appTask && (appTask === itemTask || appTask === itemTitle));
  const projectMatch = resolveProjectMatch(app, item);
  if (!titleMatch && !taskMatch) {
    return 0;
  }
  let score = 0;
  if (projectMatch) {
    score += 4;
  }
  if (titleMatch) {
    score += 6;
  }
  if (taskMatch) {
    score += 8;
  }
  if (item.previewUrl) {
    score += 1;
  }
  return score;
}

function linkWorkshopCandidate(
  app: ParsedAgentAppDraft,
  items: DashboardWorkshopItem[],
  savedItems: DashboardSavedWorkshopItem[],
): { item?: WorkshopCandidate; kind?: "recent" | "saved" } {
  const candidates: Array<{ item: WorkshopCandidate; kind: "recent" | "saved"; score: number }> =
    [];
  for (const item of items) {
    const score = resolveWorkshopCandidateScore(app, item);
    if (score > 0) {
      candidates.push({ item, kind: "recent", score });
    }
  }
  for (const item of savedItems) {
    const score = resolveWorkshopCandidateScore(app, item);
    if (score > 0) {
      candidates.push({ item, kind: "saved", score });
    }
  }
  const best = candidates.toSorted((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return (right.item.updatedAtMs ?? 0) - (left.item.updatedAtMs ?? 0);
  })[0];
  return best ? { item: best.item, kind: best.kind } : {};
}

function buildAgentAppItem(params: {
  draft: ParsedAgentAppDraft;
  linkedItem?: WorkshopCandidate;
  linkedKind?: "recent" | "saved";
}): DashboardAgentAppItem {
  const idBase = `${params.draft.ownerAgentId ?? params.draft.ownerLabel ?? "life-improvement"}:${params.draft.title}`;
  return {
    kind: "agent_app",
    id: `agent-app:${slugify(idBase) || "proposal"}`,
    title: params.draft.title,
    summary: params.draft.summary,
    updatedAtMs: params.linkedItem?.updatedAtMs ?? params.draft.updatedAtMs,
    status: params.draft.status,
    ownerLabel: params.draft.ownerLabel,
    ownerAgentId: params.draft.ownerAgentId,
    whyNow: params.draft.whyNow,
    howItHelps: params.draft.howItHelps,
    suggestedScope: params.draft.suggestedScope,
    sessionKey: params.linkedItem?.sessionKey,
    taskId: params.linkedItem?.taskId,
    taskTitle: params.linkedItem?.taskTitle ?? params.draft.taskTitle,
    previewUrl: params.linkedItem?.previewUrl,
    embedUrl: params.linkedItem?.embedUrl,
    artifactPath: params.linkedItem?.artifactPath,
    embeddable: params.linkedItem?.embeddable ?? false,
    workspaceId: params.linkedItem?.workspaceId,
    workspaceLabel: params.linkedItem?.workspaceLabel,
    projectName: params.linkedItem?.projectName ?? params.draft.projectName,
    projectKey: params.linkedItem?.projectKey ?? params.draft.projectKey,
    linkedWorkshopKind: params.linkedKind,
  };
}

export async function collectDashboardAgentApps(params: {
  cfg: MaumauConfig;
  items: DashboardWorkshopItem[];
  savedItems: DashboardSavedWorkshopItem[];
}): Promise<DashboardAgentAppItem[]> {
  const defaultAgentId = resolveDefaultAgentId(params.cfg);
  const workspaceDir = resolveAgentWorkspaceDir(params.cfg, defaultAgentId);
  const appsPath = path.join(workspaceDir, AGENT_APPS_FILENAME);
  const content = await readOptionalFile(appsPath);
  if (!content) {
    return [];
  }
  const stat = await fs.stat(appsPath).catch(() => null);
  const drafts = parseAgentAppsMarkdown({
    content,
    updatedAtMs: stat?.mtimeMs,
  });
  return drafts
    .map((draft) => {
      const linked = linkWorkshopCandidate(draft, params.items, params.savedItems);
      return buildAgentAppItem({
        draft,
        linkedItem: linked.item,
        linkedKind: linked.kind,
      });
    })
    .toSorted((left, right) => (right.updatedAtMs ?? 0) - (left.updatedAtMs ?? 0));
}

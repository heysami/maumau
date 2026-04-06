import fs from "node:fs/promises";
import path from "node:path";
import type { AssistantMessage } from "@mariozechner/pi-ai";
import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../agents/agent-scope.js";
import {
  completeWithPreparedSimpleCompletionModel,
  prepareSimpleCompletionModelForAgent,
} from "../agents/simple-completion-runtime.js";
import { DEFAULT_MEMORY_FILENAME, DEFAULT_SOUL_FILENAME } from "../agents/workspace.js";
import { type MaumauConfig, loadConfig } from "../config/config.js";
import { resolveStateDir } from "../config/paths.js";
import type { SessionEntry } from "../config/sessions.js";
import { readCronRunLogEntriesPageAll } from "../cron/run-log.js";
import { computeNextRunAtMs } from "../cron/schedule.js";
import type { CronService } from "../cron/service.js";
import type { CronJob } from "../cron/types.js";
import { isWithinDir } from "../infra/path-safety.js";
import { parseAgentSessionKey } from "../routing/session-key.js";
import { hasInterSessionUserProvenance } from "../sessions/input-provenance.js";
import {
  findLifecycleStageById,
  findLifecycleStageByRole,
  formatLifecycleProgressLabel,
  resolveTeamWorkflowLifecycleStages,
} from "../teams/lifecycle.js";
import {
  findTeamWorkflow,
  findTeamConfig,
  listConfiguredTeams,
  listTeamMembers,
  listTeamWorkflows,
  resolveAgentDisplayName,
} from "../teams/model.js";
import { generateTeamOpenProsePreview } from "../teams/openprose.js";
import { resolveSessionTeamContext } from "../teams/runtime.js";
import { resolveGatewayAuth } from "./auth.js";
import type {
  DashboardBlocker,
  DashboardCalendarResult,
  DashboardCalendarView,
  DashboardCalendarEvent,
  DashboardMemoriesResult,
  DashboardRecentMemoryEntry,
  DashboardRoutine,
  DashboardRoutineVisibility,
  DashboardRoutinesResult,
  DashboardSnapshot,
  DashboardTasksResult,
  DashboardTaskStatus,
  DashboardTeamEdge,
  DashboardTeamNode,
  DashboardTeamRun,
  DashboardTeamRunsResult,
  DashboardTeamSnapshot,
  DashboardTeamSnapshotsResult,
  DashboardTodaySnapshot,
  DashboardSavedWorkshopItem,
  DashboardWorkshopItem,
  DashboardWorkshopPreviewLink,
  DashboardWorkshopResult,
  DashboardWorkshopSaveResult,
  DashboardWorkItem,
  DashboardWorkItemBlockerLink,
  DashboardWorkItemSessionLink,
  DashboardWorkItemVisibilityScope,
} from "./dashboard-types.js";
import {
  buildSavedWorkshopEmbedPath,
  copySourceIntoSavedWorkshopStore,
  normalizeDashboardProjectName,
  readDashboardWorkshopStore,
  writeDashboardWorkshopStore,
  type DashboardWorkshopSavedItemRecord,
} from "./dashboard-workshop-saved.js";
import type { ExecApprovalRecord } from "./exec-approval-manager.js";
import {
  buildPreviewEmbedPathFromPreviewUrl,
  resolvePreviewArtifactInfoFromPreviewUrl,
} from "./previews.js";
import {
  listAgentsForGateway,
  listSessionsFromStore,
  loadCombinedSessionStoreForGateway,
  readFirstUserMessageFromTranscript,
  readSessionMessages,
} from "./session-utils.js";

const DASHBOARD_DIRNAME = "dashboard";
const TEAMS_DIRNAME = "teams";
const TEAM_SNAPSHOTS_FILENAME = "snapshots.json";
const WORK_ITEMS_FILENAME = "work-items.json";
const ROUTINE_PREFS_FILENAME = "routine-visibility.json";
const MEMORY_NOTES_DIRNAME = "memory";
const MAX_TASKS = 200;
const MAX_CALENDAR_EVENTS = 300;
const MAX_MEMORY_ACTIVITY = 24;
const MAX_SUMMARY_WORDS = 120;
const SUMMARY_TIMEOUT_MS = 2_500;
const WORK_ITEM_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const CALENDAR_DAY_MS = 24 * 60 * 60 * 1_000;
const MAX_OCCURRENCES_PER_JOB = 96;
const FILE_ARTIFACT_RE = /^FILE:(.+)$/gm;
const WORK_ITEM_LINE_RE = /^WORK_ITEM:(.+)$/gm;
const URL_RE = /https?:\/\/[^\s)>\]]+/gi;
const USER_FACING_ROUTINE_RE =
  /\b(reminder|routine|daily|weekly|morning|evening|standup|check-?in|review|habit|personal|today)\b/i;
const OPS_ROUTINE_RE =
  /\b(maintenance|cleanup|reindex|refresh|heartbeat|probe|health|build|cache|sync|repair|doctor)\b/i;

type LoggerLike = {
  info?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
};

type DashboardDeps = {
  prepareSimpleCompletionModelForAgent: typeof prepareSimpleCompletionModelForAgent;
  completeWithPreparedSimpleCompletionModel: typeof completeWithPreparedSimpleCompletionModel;
};

const dashboardDeps: DashboardDeps = {
  prepareSimpleCompletionModelForAgent,
  completeWithPreparedSimpleCompletionModel,
};

export const __testing = {
  setDepsForTests(overrides: Partial<DashboardDeps>) {
    Object.assign(dashboardDeps, overrides);
  },
  resetDepsForTests() {
    dashboardDeps.prepareSimpleCompletionModelForAgent = prepareSimpleCompletionModelForAgent;
    dashboardDeps.completeWithPreparedSimpleCompletionModel =
      completeWithPreparedSimpleCompletionModel;
  },
  buildWorkshopItemsForTests(
    tasks: DashboardWorkItem[],
    params?: { cfg?: MaumauConfig; nowMs?: number; stateDir?: string },
  ) {
    return buildWorkshopItems(tasks, params ?? {}).then((result) => result.items);
  },
};

type TeamSnapshotStore = {
  version: 1 | 2;
  generatedAtMs: number;
  teamsConfigFingerprint?: string;
  snapshots: DashboardTeamSnapshot[];
};

type DashboardWorkItemStore = {
  version: 1;
  updatedAtMs: number;
  items: DashboardWorkItem[];
};

type DashboardRoutineVisibilityPreference = {
  visibility: DashboardRoutineVisibility;
  updatedAtMs: number;
};

type DashboardRoutineVisibilityStore = {
  version: 1;
  updatedAtMs: number;
  preferences: Record<string, DashboardRoutineVisibilityPreference>;
};

type CollectDashboardSnapshotParams = {
  cfg?: MaumauConfig;
  cron: Pick<CronService, "list" | "status">;
  cronStorePath: string;
  execApprovals?: ReadonlyArray<ExecApprovalRecord>;
  nowMs?: number;
  stateDir?: string;
};

type CollectDashboardCalendarParams = CollectDashboardSnapshotParams & {
  view?: DashboardCalendarView;
  anchorAtMs?: number;
};

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return words.join(" ");
  }
  return `${words.slice(0, maxWords).join(" ")}…`;
}

function createTodayBounds(nowMs: number) {
  const start = new Date(nowMs);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime());
  end.setDate(end.getDate() + 1);
  return {
    startAtMs: start.getTime(),
    endAtMs: end.getTime(),
  };
}

function extractMessageText(message: unknown): string {
  if (!isObject(message)) {
    return "";
  }
  const directText = normalizeText(message.text);
  if (directText) {
    return directText;
  }
  const content = message.content;
  if (!Array.isArray(content)) {
    return "";
  }
  const parts = content
    .map((entry) => {
      if (!isObject(entry)) {
        return "";
      }
      return entry.type === "text" ? normalizeText(entry.text) : "";
    })
    .filter(Boolean);
  return parts.join("\n").trim();
}

function resolveSessionAgentId(cfg: MaumauConfig, sessionKey: string): string {
  const parsed = parseAgentSessionKey(sessionKey);
  return parsed?.agentId?.trim() || resolveDefaultAgentId(cfg);
}

function buildScheduleLabel(job: CronJob): string {
  if (job.schedule.kind === "at") {
    return `Runs once at ${job.schedule.at}`;
  }
  if (job.schedule.kind === "every") {
    const everyMs = job.schedule.everyMs;
    const minutes = Math.max(1, Math.round(everyMs / 60_000));
    if (minutes % 60 === 0) {
      const hours = Math.round(minutes / 60);
      return `Every ${hours} hour${hours === 1 ? "" : "s"}`;
    }
    return `Every ${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  const tz = normalizeText(job.schedule.tz);
  return `Cron: ${job.schedule.expr}${tz ? ` (${tz})` : ""}`;
}

function buildFallbackTeamSummary(params: {
  cfg: MaumauConfig;
  team: ReturnType<typeof listConfiguredTeams>[number];
  workflowId: string;
}): string {
  const workflow = findTeamWorkflow(params.team, params.workflowId);
  const managerName = resolveAgentDisplayName(params.cfg, params.team.managerAgentId);
  const specialists = listTeamMembers(params.team)
    .map((member) => member.role.trim())
    .filter(Boolean);
  const required = workflow.contract?.requiredRoles?.filter(Boolean) ?? [];
  const qaRequired = workflow.contract?.requiredQaRoles?.filter(Boolean) ?? [];
  const specialistLine =
    specialists.length > 0
      ? `Specialists: ${specialists.join(", ")}.`
      : "No specialists are configured yet.";
  const requiredLine =
    required.length > 0
      ? `Required delegated roles: ${required.join(", ")}.`
      : workflow.contract?.requireDelegation
        ? "Delegation is required before the manager can finish."
        : "Delegation is optional for this workflow.";
  const qaLine = qaRequired.length > 0 ? `Required QA roles: ${qaRequired.join(", ")}.` : "";
  return clampWords(
    `${params.team.name?.trim() || params.team.id} is led by ${managerName}. ${workflow.name?.trim() || workflow.id} keeps the manager at the center of delegation. ${specialistLine} ${requiredLine} ${qaLine}`.trim(),
    MAX_SUMMARY_WORDS,
  );
}

function normalizeTeamRole(value: string | undefined): string {
  return normalizeText(value).toLowerCase().replace(/\s+/g, " ");
}

function classifyTeamNodeStage(params: {
  role?: string;
  requiredRoles: Set<string>;
  requiredQaRoles: Set<string>;
}): DashboardTeamNode["stage"] {
  const normalizedRole = normalizeTeamRole(params.role);
  if (!normalizedRole) {
    return "support";
  }
  if (params.requiredQaRoles.has(normalizedRole)) {
    return "qa";
  }
  if (!params.requiredRoles.has(normalizedRole)) {
    return "support";
  }
  if (
    /\b(architect|architecture|planner|planning|strategy|strategist|research)\b/.test(
      normalizedRole,
    )
  ) {
    return "architecture";
  }
  return "execution";
}

function stageIndexForTeamNode(stage: DashboardTeamNode["stage"]): number {
  switch (stage) {
    case "upstream":
      return 0;
    case "manager":
      return 1;
    case "architecture":
      return 2;
    case "execution":
      return 3;
    case "qa":
      return 4;
    case "support":
    default:
      return 5;
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function extractAssistantSummary(message: AssistantMessage): string {
  const parts = message.content
    .map((entry) => (entry.type === "text" ? normalizeText(entry.text) : ""))
    .filter(Boolean);
  return clampWords(parts.join(" "), MAX_SUMMARY_WORDS);
}

async function buildGeneratedTeamSummary(params: {
  cfg: MaumauConfig;
  team: ReturnType<typeof listConfiguredTeams>[number];
  workflowId: string;
  openProsePreview: string;
}): Promise<{ status: DashboardTeamSnapshot["status"]; summary: string; warning?: string }> {
  const fallbackSummary = buildFallbackTeamSummary(params);
  try {
    const prepared = await dashboardDeps.prepareSimpleCompletionModelForAgent({
      cfg: params.cfg,
      agentId: params.team.managerAgentId,
    });
    if ("error" in prepared) {
      return {
        status: "fallback",
        summary: fallbackSummary,
        warning: prepared.error,
      };
    }
    const message = await withTimeout(
      dashboardDeps.completeWithPreparedSimpleCompletionModel({
        model: prepared.model,
        auth: prepared.auth,
        context: {
          systemPrompt:
            "You summarize Maumau team org charts. Return plain text only. Keep it concrete, under 120 words, and emphasize delegation flow, required approvals, and the main specialists involved.",
          messages: [
            {
              role: "user",
              timestamp: Date.now(),
              content: [
                {
                  type: "text",
                  text: [
                    `Team id: ${params.team.id}`,
                    `Team name: ${params.team.name?.trim() || params.team.id}`,
                    `Workflow id: ${params.workflowId}`,
                    `Manager agent id: ${params.team.managerAgentId}`,
                    "",
                    params.openProsePreview,
                  ].join("\n"),
                },
              ],
            },
          ],
        },
        options: {
          maxTokens: 180,
          temperature: 0.1,
        },
      }),
      SUMMARY_TIMEOUT_MS,
      "team summary generation",
    );
    const summary = extractAssistantSummary(message);
    if (!summary) {
      return {
        status: "fallback",
        summary: fallbackSummary,
        warning: "team summary generation returned an empty response",
      };
    }
    return {
      status: "generated",
      summary,
    };
  } catch (error) {
    return {
      status: "fallback",
      summary: fallbackSummary,
      warning: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildTeamSnapshotGraph(params: {
  cfg: MaumauConfig;
  team: ReturnType<typeof listConfiguredTeams>[number];
  workflowId: string;
}): { nodes: DashboardTeamNode[]; edges: DashboardTeamEdge[] } {
  const workflow = findTeamWorkflow(params.team, params.workflowId);
  const nodes: DashboardTeamNode[] = [];
  const edges: DashboardTeamEdge[] = [];
  const requiredRolesList =
    workflow.contract?.requiredRoles?.map((role) => normalizeTeamRole(role)) ?? [];
  const requiredRoles = new Set(requiredRolesList);
  const requiredQaRoles = new Set(
    workflow.contract?.requiredQaRoles?.map((role) => normalizeTeamRole(role)) ?? [],
  );
  const managerId = `${params.team.id}:${workflow.id}:manager:${params.team.managerAgentId}`;
  const managerNode: DashboardTeamNode = {
    id: managerId,
    kind: "manager",
    label: resolveAgentDisplayName(params.cfg, params.team.managerAgentId),
    teamId: params.team.id,
    workflowId: workflow.id,
    agentId: params.team.managerAgentId,
    role: "Manager",
    description: params.team.description?.trim(),
    stage: "manager",
    stageIndex: stageIndexForTeamNode("manager"),
  };
  nodes.push(managerNode);

  const memberNodesByRole = new Map<string, DashboardTeamNode>();
  const supportMemberNodes: DashboardTeamNode[] = [];
  for (const member of listTeamMembers(params.team)) {
    const nodeId = `${params.team.id}:${workflow.id}:member:${member.agentId}:${member.role}`;
    const stage = classifyTeamNodeStage({
      role: member.role,
      requiredRoles,
      requiredQaRoles,
    });
    const node: DashboardTeamNode = {
      id: nodeId,
      kind: "member",
      label: resolveAgentDisplayName(params.cfg, member.agentId),
      teamId: params.team.id,
      workflowId: workflow.id,
      agentId: member.agentId,
      role: member.role,
      description: member.description?.trim(),
      stage,
      stageIndex: stageIndexForTeamNode(stage),
    };
    nodes.push(node);
    memberNodesByRole.set(normalizeTeamRole(member.role), node);
    if (!requiredRoles.has(normalizeTeamRole(member.role))) {
      supportMemberNodes.push(node);
    }
  }

  for (const link of params.team.crossTeamLinks ?? []) {
    const nodeId = `${params.team.id}:${workflow.id}:${link.type}:${link.targetId}`;
    const linkedTeamName =
      link.type === "team"
        ? listConfiguredTeams(params.cfg)
            .find((candidate) => candidate.id === link.targetId)
            ?.name?.trim()
        : undefined;
    nodes.push({
      id: nodeId,
      kind: link.type === "team" ? "linked_team" : "linked_agent",
      label:
        link.type === "team"
          ? linkedTeamName || link.targetId
          : resolveAgentDisplayName(params.cfg, link.targetId),
      teamId: params.team.id,
      workflowId: workflow.id,
      agentId: link.type === "agent" ? link.targetId : undefined,
      role: link.type === "team" ? "Linked Team" : "Linked Agent",
      description: link.description?.trim(),
      stage: "support",
      stageIndex: stageIndexForTeamNode("support"),
    });
    edges.push({
      id: `${managerId}->${nodeId}`,
      from: managerId,
      to: nodeId,
      kind: link.type === "team" ? "links" : "delegates",
      label:
        link.description?.trim() || (link.type === "team" ? "cross-team" : "borrowed specialist"),
    });
  }

  const stageOrder: DashboardTeamNode["stage"][] = ["architecture", "execution", "qa"];
  const stageNodes = new Map<DashboardTeamNode["stage"], DashboardTeamNode[]>();
  for (const role of requiredRolesList) {
    const node = memberNodesByRole.get(role);
    if (!node?.stage) {
      continue;
    }
    const existing = stageNodes.get(node.stage) ?? [];
    if (!existing.some((candidate) => candidate.id === node.id)) {
      existing.push(node);
      stageNodes.set(node.stage, existing);
    }
  }

  const activeStages = stageOrder
    .map((stage) => ({
      stage,
      nodes: stageNodes.get(stage) ?? [],
    }))
    .filter((entry) => entry.nodes.length > 0);

  if (activeStages.length > 0) {
    let previousNodes = [managerNode];
    for (const entry of activeStages) {
      for (const fromNode of previousNodes) {
        for (const toNode of entry.nodes) {
          edges.push({
            id: `${fromNode.id}->${toNode.id}:flow`,
            from: fromNode.id,
            to: toNode.id,
            kind: "flow",
            label: entry.stage,
          });
        }
      }
      previousNodes = entry.nodes;
    }
  } else {
    for (const node of nodes) {
      if (node.kind !== "member") {
        continue;
      }
      edges.push({
        id: `${managerId}->${node.id}`,
        from: managerId,
        to: node.id,
        kind: "delegates",
        label: node.role?.trim() || "specialist",
      });
    }
  }

  for (const node of supportMemberNodes) {
    edges.push({
      id: `${managerId}->${node.id}:support`,
      from: managerId,
      to: node.id,
      kind: "delegates",
      label: node.role?.trim() || "specialist",
    });
  }

  for (const node of stageNodes.get("qa") ?? []) {
    edges.push({
      id: `${node.id}->${managerId}:qa`,
      from: node.id,
      to: managerId,
      kind: "reviews",
      label: "QA approval",
    });
  }

  return { nodes, edges };
}

function resolveDashboardTeamsSnapshotsPath(stateDir = resolveStateDir()): string {
  return path.join(stateDir, DASHBOARD_DIRNAME, TEAMS_DIRNAME, TEAM_SNAPSHOTS_FILENAME);
}

async function writeTeamSnapshotStore(
  store: TeamSnapshotStore,
  stateDir = resolveStateDir(),
): Promise<void> {
  const filePath = resolveDashboardTeamsSnapshotsPath(stateDir);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now().toString(36)}`;
  const payload = `${JSON.stringify(store, null, 2)}\n`;
  await fs.writeFile(tmpPath, payload, "utf8");
  await fs.rename(tmpPath, filePath);
}

async function readStoredTeamSnapshotStore(params?: {
  stateDir?: string;
}): Promise<TeamSnapshotStore | null> {
  const filePath = resolveDashboardTeamsSnapshotsPath(params?.stateDir);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<TeamSnapshotStore>;
    if (!parsed || !Array.isArray(parsed.snapshots)) {
      return null;
    }
    return {
      version: parsed.version === 2 ? 2 : 1,
      generatedAtMs: typeof parsed.generatedAtMs === "number" ? parsed.generatedAtMs : 0,
      teamsConfigFingerprint:
        typeof parsed.teamsConfigFingerprint === "string"
          ? parsed.teamsConfigFingerprint
          : undefined,
      snapshots: parsed.snapshots as DashboardTeamSnapshot[],
    };
  } catch {
    return null;
  }
}

export async function readStoredDashboardTeamSnapshots(params?: {
  stateDir?: string;
}): Promise<DashboardTeamSnapshotsResult> {
  const store = await readStoredTeamSnapshotStore(params);
  if (!store) {
    return { generatedAtMs: 0, snapshots: [] };
  }
  return {
    generatedAtMs: store.generatedAtMs,
    snapshots: store.snapshots,
  };
}

export async function collectDashboardTeamSnapshots(params?: {
  cfg?: MaumauConfig;
  nowMs?: number;
  logger?: LoggerLike;
}): Promise<DashboardTeamSnapshotsResult> {
  const cfg = params?.cfg ?? loadConfig();
  const generatedAtMs = params?.nowMs ?? Date.now();
  const snapshots: DashboardTeamSnapshot[] = [];
  for (const team of listConfiguredTeams(cfg)) {
    for (const workflow of listTeamWorkflows(team)) {
      const lifecycleStages = resolveTeamWorkflowLifecycleStages(workflow).map((stage) => ({
        id: stage.id,
        name: stage.name,
        status: stage.status,
        roles: [...stage.roles],
      }));
      const openProsePreview = generateTeamOpenProsePreview({
        config: cfg,
        team,
        workflowId: workflow.id,
      });
      const graph = buildTeamSnapshotGraph({
        cfg,
        team,
        workflowId: workflow.id,
      });
      const generatedSummary = await buildGeneratedTeamSummary({
        cfg,
        team,
        workflowId: workflow.id,
        openProsePreview,
      });
      if (generatedSummary.warning) {
        params?.logger?.warn?.(
          `[dashboard] teams snapshot fallback for ${team.id}/${workflow.id}: ${generatedSummary.warning}`,
        );
      }
      snapshots.push({
        teamId: team.id,
        teamName: team.name?.trim() || undefined,
        workflowId: workflow.id,
        workflowName: workflow.name?.trim() || undefined,
        generatedAtMs,
        status: generatedSummary.status,
        warnings: generatedSummary.warning ? [generatedSummary.warning] : [],
        summary: generatedSummary.summary,
        openProsePreview,
        lifecycleStages,
        nodes: graph.nodes,
        edges: graph.edges,
      });
    }
  }
  return {
    generatedAtMs,
    snapshots,
  };
}

export async function refreshStoredDashboardTeamSnapshots(params?: {
  cfg?: MaumauConfig;
  stateDir?: string;
  nowMs?: number;
  logger?: LoggerLike;
}): Promise<DashboardTeamSnapshotsResult> {
  const cfg = params?.cfg ?? loadConfig();
  const result = await collectDashboardTeamSnapshots({
    cfg,
    nowMs: params?.nowMs,
    logger: params?.logger,
  });
  const store: TeamSnapshotStore = {
    version: 2,
    generatedAtMs: result.generatedAtMs,
    teamsConfigFingerprint: serializeForChangeCheck(cfg.teams),
    snapshots: result.snapshots,
  };
  await writeTeamSnapshotStore(store, params?.stateDir);
  return result;
}

function serializeForChangeCheck(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function haveTeamsConfigChanged(
  previous: MaumauConfig | undefined,
  next: MaumauConfig,
): boolean {
  return serializeForChangeCheck(previous?.teams) !== serializeForChangeCheck(next.teams);
}

function isPublishedPreviewUrl(value: string | undefined): boolean {
  const normalized = normalizeText(value);
  if (!normalized) {
    return false;
  }
  try {
    const parsed = new URL(normalized, "http://localhost");
    return /^\/(?:preview|share)\//i.test(parsed.pathname);
  } catch {
    return /^\/(?:preview|share)\//i.test(normalized);
  }
}

function parsePreviewArtifacts(messages: unknown[]): {
  previewUrl?: string;
  artifactPath?: string;
} {
  let artifactPath: string | undefined;
  let previewUrl: string | undefined;
  for (const message of messages) {
    const text = extractMessageText(message);
    if (!text) {
      continue;
    }
    if (!artifactPath) {
      const match = FILE_ARTIFACT_RE.exec(text);
      FILE_ARTIFACT_RE.lastIndex = 0;
      if (match?.[1]?.trim()) {
        artifactPath = match[1].trim();
      }
    }
    if (!previewUrl) {
      const urls = text.match(URL_RE) ?? [];
      previewUrl = urls.find((url) => isPublishedPreviewUrl(url));
    }
    if (artifactPath && previewUrl) {
      break;
    }
  }
  return { previewUrl, artifactPath };
}

type TrustedWorkItemEnvelope = {
  title?: string;
  summary?: string;
  teamRun?: {
    kind: "team_run";
    teamId?: string;
    workflowId?: string;
    rootSessionKey?: string;
    event?: "started" | "stage_enter" | "stage_complete" | "blocked" | "completed";
    currentStageId?: string;
    currentStageName?: string;
    completedStageIds?: string[];
    status?: DashboardTaskStatus;
  };
};

type DerivedTaskContext = {
  subject?: string;
  summary?: string;
};

type TrustedTranscriptBlocker = {
  description: string;
  suggestion: string;
};

function parseTrustedWorkItemEnvelope(messages: unknown[]): TrustedWorkItemEnvelope | null {
  for (const message of messages) {
    const text = extractMessageText(message);
    if (!text) {
      continue;
    }
    const match = WORK_ITEM_LINE_RE.exec(text);
    WORK_ITEM_LINE_RE.lastIndex = 0;
    if (!match?.[1]?.trim()) {
      continue;
    }
    try {
      const parsed = JSON.parse(match[1].trim());
      if (!isObject(parsed)) {
        continue;
      }
      const teamRunRaw = isObject(parsed.teamRun) ? parsed.teamRun : null;
      return {
        title: normalizeText(parsed.title) || undefined,
        summary: normalizeText(parsed.summary) || undefined,
        teamRun:
          teamRunRaw && normalizeText(teamRunRaw.kind).toLowerCase() === "team_run"
            ? {
                kind: "team_run",
                teamId: normalizeText(teamRunRaw.teamId) || undefined,
                workflowId: normalizeText(teamRunRaw.workflowId) || undefined,
                rootSessionKey: normalizeText(teamRunRaw.rootSessionKey) || undefined,
                event: (() => {
                  const event = normalizeText(teamRunRaw.event).toLowerCase();
                  return event === "started" ||
                    event === "stage_enter" ||
                    event === "stage_complete" ||
                    event === "blocked" ||
                    event === "completed"
                    ? event
                    : undefined;
                })(),
                currentStageId: normalizeText(teamRunRaw.currentStageId).toLowerCase() || undefined,
                currentStageName: normalizeText(teamRunRaw.currentStageName) || undefined,
                completedStageIds: Array.isArray(teamRunRaw.completedStageIds)
                  ? teamRunRaw.completedStageIds
                      .map((entry) => normalizeText(entry).toLowerCase())
                      .filter(Boolean)
                  : undefined,
                status: (() => {
                  const status = normalizeText(teamRunRaw.status);
                  return status === "blocked" ||
                    status === "in_progress" ||
                    status === "review" ||
                    status === "done" ||
                    status === "idle"
                    ? status
                    : undefined;
                })(),
              }
            : undefined,
      };
    } catch {
      // Ignore malformed envelopes.
    }
  }
  return null;
}

function resolveTrustedTranscriptBlockerSuggestion(description: string): string {
  const teamIdMatch = /teamId=(?:"([^"]+)"|'([^']+)'|`([^`]+)`|([a-z0-9._:-]+))/i.exec(description);
  const teamId = teamIdMatch?.[1] || teamIdMatch?.[2] || teamIdMatch?.[3] || teamIdMatch?.[4];
  if (teamId) {
    return `Open the related session, rerun this through the ${teamId} team, then continue.`;
  }
  if (/\bteams_run\b/i.test(description)) {
    return "Open the related session, rerun this through the recommended team, then continue.";
  }
  const agentIdMatch = /agentId=(?:"([^"]+)"|'([^']+)'|`([^`]+)`|([a-z0-9._:-]+))/i.exec(
    description,
  );
  const agentId = agentIdMatch?.[1] || agentIdMatch?.[2] || agentIdMatch?.[3] || agentIdMatch?.[4];
  if (agentId) {
    return `Open the related session, rerun this through the ${agentId} worker session, then continue.`;
  }
  if (/\bsessions_spawn\b/i.test(description)) {
    return "Open the related session, rerun this through the recommended worker session, then continue.";
  }
  return "Open the related session, follow the tool guidance, then continue.";
}

function stripTranscriptDisplayMarkup(text: string): string {
  return normalizeText(
    text
      .replace(/\[\[[^\]]+\]\]/g, " ")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1"),
  );
}

function joinReadableOptions(items: string[]): string {
  if (items.length === 0) {
    return "";
  }
  if (items.length === 1) {
    return items[0] || "";
  }
  if (items.length === 2) {
    return `${items[0]} or ${items[1]}`;
  }
  return `${items.slice(0, -1).join("; ")}; or ${items.at(-1)}`;
}

function extractAssistantNextStepSuggestion(text: string): string | undefined {
  const normalized = stripTranscriptDisplayMarkup(text);
  if (!normalized) {
    return undefined;
  }
  const headerMatch = /what i can do next:/i.exec(normalized);
  if (headerMatch) {
    const items = normalized
      .slice(headerMatch.index + headerMatch[0].length)
      .split(/\n/)
      .map((line) => {
        const match = /^\s*(?:[-*]|\d+\.)\s+(.+)$/.exec(line.trim());
        return match?.[1] ? stripTranscriptDisplayMarkup(match[1]) : "";
      })
      .filter(Boolean)
      .slice(0, 3);
    if (items.length > 0) {
      return excerptText(`Next options: ${joinReadableOptions(items)}.`, 360);
    }
  }
  const ifYouWantMatch = /if you want,?[^.!?\n]*(?:[.!?]|$)/i.exec(normalized);
  if (ifYouWantMatch?.[0]) {
    return excerptText(ifYouWantMatch[0], 360);
  }
  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => normalizeText(sentence))
    .filter(Boolean);
  const recoverySentence = sentences.find((sentence) =>
    /\b(i(?:'|’)ll|i can|try again|use the required|rerun this|draft|make you|give you)\b/i.test(
      sentence,
    ),
  );
  return recoverySentence ? excerptText(recoverySentence, 360) : undefined;
}

function extractAssistantTranscriptBlocker(text: string): TrustedTranscriptBlocker | null {
  const normalized = stripTranscriptDisplayMarkup(text);
  if (
    !normalized ||
    !/\b(blocked|blocker|refused the job|no preview link exists yet|no workspace changes were made|no [a-z ]+ was created)\b/i.test(
      normalized,
    )
  ) {
    return null;
  }
  const paragraphs = normalized
    .split(/\n\s*\n/)
    .map((paragraph) => normalizeText(paragraph))
    .filter(Boolean);
  const description = excerptText(
    paragraphs.find((paragraph) => /\b(blocked|blocker|refused the job)\b/i.test(paragraph)) ||
      paragraphs[0] ||
      normalized,
    220,
  );
  return {
    description,
    suggestion: extractAssistantNextStepSuggestion(normalized) || description,
  };
}

function isResolvedTranscriptToolStatus(status: string): boolean {
  return (
    status === "accepted" ||
    status === "ok" ||
    status === "done" ||
    status === "completed" ||
    status === "running" ||
    status === "in_progress"
  );
}

function isResolvedAssistantUpdate(text: string): boolean {
  const normalized = stripTranscriptDisplayMarkup(text);
  if (!normalized || /\b(blocked|blocker)\b/i.test(normalized)) {
    return false;
  }
  return (
    /\b(in progress|working on it|done starting|all set|finished|ready)\b/i.test(normalized) ||
    /\bI(?:'|’)ll send (?:it|the result|the preview)\b/i.test(normalized) ||
    /\bI(?:'|’)ve got .* building\b/i.test(normalized)
  );
}

function findTrustedTranscriptBlocker(messages: unknown[]): TrustedTranscriptBlocker | null {
  let activeToolBlocker: TrustedTranscriptBlocker | null = null;
  let activeAssistantBlocker: TrustedTranscriptBlocker | null = null;
  for (const message of messages) {
    if (!isObject(message)) {
      continue;
    }
    const role = normalizeText(message.role).toLowerCase();
    if (role === "toolresult") {
      const details = isObject(message.details) ? message.details : null;
      const status = normalizeText(details?.status).toLowerCase();
      if (status === "forbidden") {
        const description = excerptText(
          normalizeText(details?.error) ||
            extractMessageText(message) ||
            "A required tool action was denied.",
          220,
        );
        activeToolBlocker = {
          description,
          suggestion: resolveTrustedTranscriptBlockerSuggestion(description),
        };
        activeAssistantBlocker = null;
        continue;
      }
      if (isResolvedTranscriptToolStatus(status)) {
        activeToolBlocker = null;
        activeAssistantBlocker = null;
      }
      continue;
    }
    if (role !== "assistant") {
      continue;
    }
    const text = extractMessageText(message);
    const assistantBlocker = extractAssistantTranscriptBlocker(text);
    if (assistantBlocker) {
      activeAssistantBlocker = assistantBlocker;
      activeToolBlocker = null;
      continue;
    }
    if (isResolvedAssistantUpdate(text)) {
      activeToolBlocker = null;
      activeAssistantBlocker = null;
    }
  }
  return activeAssistantBlocker ?? activeToolBlocker;
}

function excerptText(text: string, maxLen = 180): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLen) {
    return normalized;
  }
  return `${normalized.slice(0, maxLen - 1).trim()}…`;
}

function stripTaskControlText(text: string): string {
  return text
    .replace(WORK_ITEM_LINE_RE, " ")
    .replace(FILE_ARTIFACT_RE, " ")
    .replace(URL_RE, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDerivedTaskSubject(subject: string | undefined): string | undefined {
  const trimmed = normalizeText(subject)
    .replace(/^[\s,:;.-]+/, "")
    .replace(/[\s,:;.-]+$/, "");
  if (!trimmed || trimmed.length < 4) {
    return undefined;
  }
  if (
    /^(?:task|work|output|preview|artifact)\b/i.test(trimmed) ||
    /\b(?:complete|completed|done|ready|finished)\b/i.test(trimmed)
  ) {
    return undefined;
  }
  return excerptText(trimmed, 72);
}

function extractTaskSubjectFromLine(line: string): string | undefined {
  const normalized = normalizeText(line);
  if (!normalized) {
    return undefined;
  }
  const patterns = [
    /\bfor ([^.?!:;]{4,120})/i,
    /\babout ([^.?!:;]{4,120})/i,
    /\bof ([^.?!:;]{4,120})/i,
    /^(?:build|built|create|created|design|designed|implement|implemented|review|reviewed|test|tested|qa|verify|verified|fix|fixed|update|updated)\s+([^.?!:;]{4,120})/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(normalized);
    const subject = normalizeDerivedTaskSubject(match?.[1]);
    if (subject) {
      return subject;
    }
  }
  return undefined;
}

function deriveTaskContextFromText(text: string | undefined): DerivedTaskContext {
  const cleaned = stripTaskControlText(normalizeText(text));
  if (!cleaned) {
    return {};
  }
  const candidates = cleaned
    .split(/(?<=[.!?])\s+|\s*\n+\s*/)
    .map((entry) => normalizeText(entry))
    .filter(Boolean)
    .filter(
      (entry) =>
        !/^preview ready\b/i.test(entry) &&
        !/^conversation info\b/i.test(entry) &&
        !/^open (?:preview|tasks|session)\b/i.test(entry) &&
        !/\b(?:assigned to|session done|session running|untrusted metadata)\b/i.test(entry) &&
        !/^[([{]/.test(entry),
    );
  const summary = candidates[0] ? excerptText(candidates[0]) : undefined;
  const subject = candidates
    .map((entry) => extractTaskSubjectFromLine(entry))
    .find((entry): entry is string => Boolean(entry));
  return { subject, summary };
}

function deriveTaskContextFromMessages(messages: unknown[]): DerivedTaskContext {
  let subject: string | undefined;
  let summary: string | undefined;
  for (const message of messages) {
    if (!isObject(message)) {
      continue;
    }
    const role = normalizeText(message.role).toLowerCase();
    if (role !== "assistant" && role !== "user") {
      continue;
    }
    if (role === "user" && hasInterSessionUserProvenance(message)) {
      continue;
    }
    const text = extractMessageText(message);
    if (role === "assistant" && extractAssistantTranscriptBlocker(text)) {
      continue;
    }
    const derived = deriveTaskContextFromText(text);
    if (!subject && role === "user" && derived.subject) {
      subject = derived.subject;
    }
    if (!summary && derived.summary) {
      summary = derived.summary;
    }
    if (subject && summary) {
      break;
    }
  }
  return { subject, summary };
}

function mergeDerivedTaskContext(
  primary: DerivedTaskContext,
  fallback: DerivedTaskContext,
): DerivedTaskContext {
  return {
    subject: primary.subject || fallback.subject,
    summary: primary.summary || fallback.summary,
  };
}

function startOfDay(value: number) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function resolveCalendarWindow(view: DashboardCalendarView, anchorAtMs: number) {
  const anchorDay = startOfDay(anchorAtMs);
  if (view === "day") {
    return {
      view,
      anchorAtMs,
      startAtMs: anchorDay,
      endAtMs: anchorDay + CALENDAR_DAY_MS,
    };
  }
  if (view === "week") {
    const date = new Date(anchorDay);
    date.setDate(date.getDate() - date.getDay());
    const startAtMs = startOfDay(date.getTime());
    return {
      view,
      anchorAtMs,
      startAtMs,
      endAtMs: startAtMs + 7 * CALENDAR_DAY_MS,
    };
  }
  const monthStart = new Date(anchorDay);
  monthStart.setDate(1);
  const monthGridStart = new Date(monthStart.getTime());
  monthGridStart.setDate(monthGridStart.getDate() - monthGridStart.getDay());
  const startAtMs = startOfDay(monthGridStart.getTime());
  return {
    view,
    anchorAtMs,
    startAtMs,
    endAtMs: startAtMs + 42 * CALENDAR_DAY_MS,
  };
}

async function writeDashboardJsonFile(filePath: string, payload: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now().toString(36)}`;
  await fs.writeFile(tmpPath, payload, "utf8");
  await fs.rename(tmpPath, filePath);
}

function resolveDashboardWorkItemsPath(stateDir = resolveStateDir()): string {
  return path.join(stateDir, DASHBOARD_DIRNAME, WORK_ITEMS_FILENAME);
}

function resolveDashboardRoutinePrefsPath(stateDir = resolveStateDir()): string {
  return path.join(stateDir, DASHBOARD_DIRNAME, ROUTINE_PREFS_FILENAME);
}

async function readStoredDashboardWorkItems(params?: {
  stateDir?: string;
}): Promise<DashboardWorkItemStore> {
  const filePath = resolveDashboardWorkItemsPath(params?.stateDir);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<DashboardWorkItemStore>;
    return {
      version: 1,
      updatedAtMs: typeof parsed.updatedAtMs === "number" ? parsed.updatedAtMs : 0,
      items: Array.isArray(parsed.items) ? (parsed.items as DashboardWorkItem[]) : [],
    };
  } catch {
    return {
      version: 1,
      updatedAtMs: 0,
      items: [],
    };
  }
}

async function writeStoredDashboardWorkItems(
  store: DashboardWorkItemStore,
  stateDir = resolveStateDir(),
): Promise<void> {
  const filePath = resolveDashboardWorkItemsPath(stateDir);
  await writeDashboardJsonFile(filePath, `${JSON.stringify(store, null, 2)}\n`);
}

async function readDashboardRoutineVisibilityStore(params?: {
  stateDir?: string;
}): Promise<DashboardRoutineVisibilityStore> {
  const filePath = resolveDashboardRoutinePrefsPath(params?.stateDir);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<DashboardRoutineVisibilityStore>;
    return {
      version: 1,
      updatedAtMs: typeof parsed.updatedAtMs === "number" ? parsed.updatedAtMs : 0,
      preferences: isObject(parsed.preferences)
        ? (parsed.preferences as DashboardRoutineVisibilityStore["preferences"])
        : {},
    };
  } catch {
    return {
      version: 1,
      updatedAtMs: 0,
      preferences: {},
    };
  }
}

async function writeDashboardRoutineVisibilityStore(
  store: DashboardRoutineVisibilityStore,
  stateDir = resolveStateDir(),
): Promise<void> {
  const filePath = resolveDashboardRoutinePrefsPath(stateDir);
  await writeDashboardJsonFile(filePath, `${JSON.stringify(store, null, 2)}\n`);
}

function formatRoleLabel(role: string | undefined): string | undefined {
  const trimmed = normalizeText(role);
  if (!trimmed) {
    return undefined;
  }
  return trimmed
    .split(/[\s/_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeComparableText(value: string | undefined): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function humanizeIdentifier(value: string | undefined): string | undefined {
  const trimmed = normalizeText(value);
  if (!trimmed) {
    return undefined;
  }
  const decoded = (() => {
    try {
      return decodeURIComponent(trimmed);
    } catch {
      return trimmed;
    }
  })();
  const withoutExtension = decoded.replace(/\.[a-z0-9]{1,8}$/i, "");
  const words = withoutExtension
    .split(/[\s._/-]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (words.length === 0) {
    return undefined;
  }
  return words
    .map((word) => {
      if (/^[A-Z0-9]{2,}$/.test(word)) {
        return word;
      }
      const lower = word.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function looksLikeOpaqueArtifactToken(value: string | undefined): boolean {
  const trimmed = normalizeText(value);
  if (!trimmed) {
    return false;
  }
  return /^(?=.*\d)[a-z0-9]{12,}$/i.test(trimmed) || /^[a-f0-9]{8,}$/i.test(trimmed);
}

function resolveArtifactDisplayLabel(params: {
  artifactPath?: string;
  previewUrl?: string;
}): string | undefined {
  const artifactBase = normalizeText(path.basename(params.artifactPath || ""));
  if (artifactBase === "." || artifactBase === "..") {
    return undefined;
  }
  const fallbackFromUrl = (() => {
    const normalizedUrl = normalizeText(params.previewUrl);
    if (!normalizedUrl) {
      return "";
    }
    try {
      const parsed = new URL(normalizedUrl);
      return normalizeText(
        parsed.pathname
          .split("/")
          .map((segment) => segment.trim())
          .filter(Boolean)
          .at(-1),
      );
    } catch {
      return "";
    }
  })();
  if (!artifactBase && looksLikeOpaqueArtifactToken(fallbackFromUrl)) {
    return undefined;
  }
  const label = humanizeIdentifier(artifactBase || fallbackFromUrl);
  if (!label) {
    return undefined;
  }
  const comparable = normalizeComparableText(label);
  if (
    comparable === "preview" ||
    comparable === "index" ||
    comparable === "share" ||
    comparable === "requester"
  ) {
    return undefined;
  }
  if (label.length < 2 || !/[a-z0-9]/i.test(label)) {
    return undefined;
  }
  return label;
}

function looksLikeGenericRoleTaskTitle(value: string | undefined): boolean {
  const normalized = normalizeComparableText(value);
  return (
    normalized === "manager coordination" ||
    normalized === "architecture plan" ||
    normalized === "implementation" ||
    normalized === "ui design" ||
    normalized === "content and visual design" ||
    normalized === "technical qa review" ||
    normalized === "visual qa review" ||
    normalized === "workspace task" ||
    normalized.endsWith(" task")
  );
}

function resolveWorkshopDeduplicationKey(params: {
  previewSourcePath?: string;
  previewDocumentLabel?: string;
  artifactLabel?: string;
  taskTitle?: string;
  artifactPath?: string;
  fallbackId: string;
}): string {
  const normalizedPreviewSourcePath = normalizeComparableText(params.previewSourcePath);
  if (normalizedPreviewSourcePath) {
    return `source:${normalizedPreviewSourcePath}`;
  }
  const normalizedPreviewDocumentLabel = normalizeComparableText(params.previewDocumentLabel);
  if (
    normalizedPreviewDocumentLabel &&
    !looksLikeGenericRoleTaskTitle(params.previewDocumentLabel)
  ) {
    return `preview:${normalizedPreviewDocumentLabel}`;
  }
  const normalizedArtifactLabel = normalizeComparableText(params.artifactLabel);
  if (normalizedArtifactLabel) {
    return `artifact:${normalizedArtifactLabel}`;
  }
  const normalizedTaskTitle = normalizeComparableText(params.taskTitle);
  if (normalizedTaskTitle && !looksLikeGenericRoleTaskTitle(params.taskTitle)) {
    return `task:${normalizedTaskTitle}`;
  }
  const artifactBase = normalizeText(path.basename(params.artifactPath || ""));
  const normalizedArtifactBase = normalizeComparableText(artifactBase);
  if (normalizedArtifactBase && artifactBase !== "." && artifactBase !== "..") {
    return `path:${normalizedArtifactBase}`;
  }
  return `id:${params.fallbackId}`;
}

function resolveRoleTaskTitle(teamRole: string | undefined): string | undefined {
  const normalizedRole = normalizeComparableText(teamRole);
  switch (normalizedRole) {
    case "manager":
      return "Manager coordination";
    case "system architect":
      return "Architecture plan";
    case "developer":
      return "Implementation";
    case "ui ux designer":
      return "UI design";
    case "content visual designer":
      return "Content and visual design";
    case "technical qa":
      return "Technical QA review";
    case "visual ux qa":
      return "Visual QA review";
    default: {
      const roleLabel = formatRoleLabel(teamRole);
      return roleLabel ? `${roleLabel} task` : undefined;
    }
  }
}

function looksLikeLegacyTaskSummary(summary: string | undefined): boolean {
  const normalized = normalizeText(summary);
  if (!normalized) {
    return false;
  }
  return /\b(lane|assigned to|session)\b/i.test(normalized);
}

function looksLikeTrivialStatusSummary(summary: string | undefined): boolean {
  const normalized = normalizeComparableText(summary);
  return (
    normalized === "done" ||
    normalized === "completed" ||
    normalized === "approved" ||
    normalized === "ready"
  );
}

function cleanTaskSummary(summary: string | undefined, title: string): string | undefined {
  const normalized = normalizeText(summary);
  if (!normalized || looksLikeLegacyTaskSummary(normalized)) {
    return undefined;
  }
  const comparableSummary = normalizeComparableText(normalized);
  const comparableTitle = normalizeComparableText(title);
  if (comparableSummary && comparableSummary === comparableTitle) {
    return undefined;
  }
  return excerptText(normalized);
}

function isLegacyTaskTitle(params: {
  title: string;
  teamLabel?: string;
  teamId?: string;
  teamRole?: string;
  assigneeLabel?: string;
}): boolean {
  const teamLabel = params.teamLabel || params.teamId || "Team";
  const roleLabel = formatRoleLabel(params.teamRole) || params.assigneeLabel || "Manager";
  return (
    normalizeComparableText(params.title) === normalizeComparableText(`${teamLabel} ${roleLabel}`)
  );
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname
    .trim()
    .replace(/^\[|\]$/g, "")
    .toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "127.0.0.1" ||
    normalized.startsWith("127.")
  );
}

function resolvePreviewEmbeddable(previewUrl: string | undefined): boolean {
  const normalized = normalizeText(previewUrl);
  if (!normalized) {
    return false;
  }
  if (normalized.startsWith("/") || normalized.startsWith("./") || normalized.startsWith("../")) {
    return true;
  }
  try {
    const parsed = new URL(normalized);
    return (
      parsed.protocol === "http:" || parsed.protocol === "https:" || isLoopbackHost(parsed.hostname)
    );
  } catch {
    return false;
  }
}

function mergeSessionLinks(
  existing: DashboardWorkItemSessionLink[],
  next: DashboardWorkItemSessionLink[],
): DashboardWorkItemSessionLink[] {
  const merged = new Map<string, DashboardWorkItemSessionLink>();
  for (const link of [...existing, ...next]) {
    merged.set(`${link.sessionKey}:${link.kind}`, link);
  }
  return [...merged.values()];
}

function mergeBlockerLinks(
  existing: DashboardWorkItemBlockerLink[],
  next: DashboardWorkItemBlockerLink[],
): DashboardWorkItemBlockerLink[] {
  const merged = new Map<string, DashboardWorkItemBlockerLink>();
  for (const blocker of [...existing, ...next]) {
    merged.set(blocker.id, blocker);
  }
  return [...merged.values()];
}

function countCompletedLifecycleStages(
  stageIds: string[] | undefined,
  workflow: ReturnType<typeof findTeamWorkflow>,
): number {
  if (!Array.isArray(stageIds) || stageIds.length === 0) {
    return 0;
  }
  const validStageIds = new Set(
    resolveTeamWorkflowLifecycleStages(workflow).map((stage) => stage.id),
  );
  const seen = new Set<string>();
  for (const stageId of stageIds) {
    const normalized = normalizeText(stageId).toLowerCase();
    if (!normalized || seen.has(normalized) || !validStageIds.has(normalized)) {
      continue;
    }
    seen.add(normalized);
  }
  return seen.size;
}

function resolveLifecycleDisplayStepCount(
  stages: ReturnType<typeof resolveTeamWorkflowLifecycleStages>,
): number {
  if (stages.length === 0) {
    return 0;
  }
  const hasDoneStage = stages.some((stage) => normalizeText(stage.id).toLowerCase() === "done");
  return hasDoneStage ? stages.length : stages.length + 1;
}

function resolveLifecycleProgressFields(params: {
  cfg: MaumauConfig;
  teamId?: string;
  workflowId?: string;
  teamRole?: string;
  envelope: TrustedWorkItemEnvelope | null;
  fallbackStatus: DashboardTaskStatus;
  rowStatus?: string;
}): Pick<
  DashboardWorkItem,
  | "teamWorkflowId"
  | "teamWorkflowLabel"
  | "currentStageId"
  | "currentStageLabel"
  | "completedStageIds"
  | "completedStepCount"
  | "totalStepCount"
  | "progressLabel"
  | "progressPercent"
> & { status: DashboardTaskStatus } {
  const team = params.teamId ? findTeamConfig(params.cfg, params.teamId) : undefined;
  const workflow = team ? findTeamWorkflow(team, params.workflowId) : undefined;
  const lifecycleStages = workflow ? resolveTeamWorkflowLifecycleStages(workflow) : [];
  const currentStageFromEnvelope = workflow
    ? findLifecycleStageById(workflow, params.envelope?.teamRun?.currentStageId)
    : undefined;
  const currentStageFromRole =
    !currentStageFromEnvelope && workflow
      ? findLifecycleStageByRole(workflow, params.teamRole)
      : undefined;
  const currentStage = currentStageFromEnvelope ?? currentStageFromRole;
  const currentStageLabel =
    params.envelope?.teamRun?.currentStageName || currentStage?.name || undefined;
  const completedStageIds = params.envelope?.teamRun?.completedStageIds?.filter(Boolean) ?? [];
  let completedStepCount = workflow
    ? countCompletedLifecycleStages(completedStageIds, workflow)
    : 0;
  const totalStepCount = resolveLifecycleDisplayStepCount(lifecycleStages);
  if (params.rowStatus === "done" && totalStepCount > 0) {
    completedStepCount = totalStepCount;
  }
  const progressLabel = formatLifecycleProgressLabel({
    completedStepCount,
    totalStepCount,
    currentStageLabel,
  });
  const progressPercent =
    totalStepCount > 0 ? Math.round((completedStepCount / totalStepCount) * 100) : undefined;
  const lifecycleStatus =
    params.envelope?.teamRun?.status || currentStage?.status || params.fallbackStatus;

  return {
    status: lifecycleStatus,
    teamWorkflowId: workflow?.id,
    teamWorkflowLabel: workflow?.name?.trim() || workflow?.id,
    currentStageId: params.envelope?.teamRun?.currentStageId || currentStage?.id,
    currentStageLabel,
    completedStageIds,
    completedStepCount: totalStepCount > 0 ? completedStepCount : undefined,
    totalStepCount: totalStepCount > 0 ? totalStepCount : undefined,
    progressLabel,
    progressPercent,
  };
}

function resolveTaskStatus(params: {
  row: {
    status?: string;
  };
  blockerIds: string[];
}): DashboardTaskStatus {
  if (params.blockerIds.length > 0) {
    return "blocked";
  }
  if (params.row.status === "running") {
    return "in_progress";
  }
  if (
    params.row.status === "failed" ||
    params.row.status === "killed" ||
    params.row.status === "timeout"
  ) {
    return "blocked";
  }
  if (params.row.status === "done") {
    return "done";
  }
  return "idle";
}

async function canonicalizeWorkspaceId(
  rawWorkspaceDir: string | undefined,
): Promise<string | undefined> {
  const normalized = normalizeText(rawWorkspaceDir);
  if (!normalized) {
    return undefined;
  }
  const resolved = path.resolve(normalized);
  try {
    return await fs.realpath(resolved);
  } catch {
    return resolved;
  }
}

function resolveWorkspaceLabel(workspaceId: string | undefined): string | undefined {
  const normalized = normalizeText(workspaceId);
  if (!normalized) {
    return undefined;
  }
  const label = path.basename(normalized);
  return label && label !== "." && label !== path.sep ? label : normalized;
}

async function resolveTrustedWorkspaceMetadata(params: {
  cfg: MaumauConfig;
  agentId: string;
  entry?: SessionEntry;
}): Promise<Pick<DashboardWorkItem, "workspaceId" | "workspaceLabel">> {
  const workspaceId = await canonicalizeWorkspaceId(
    normalizeText(params.entry?.spawnedWorkspaceDir) ||
      resolveAgentWorkspaceDir(params.cfg, params.agentId),
  );
  return {
    workspaceId,
    workspaceLabel: resolveWorkspaceLabel(workspaceId),
  };
}

type DetailedDashboardWorkshopItem = DashboardWorkshopItem & {
  sourceIdentity: string;
  sourceArtifactPath?: string;
};

function resolveProjectBindingForWorkspaceId(
  workspaceId: string | undefined,
  projectByWorkspace: Record<string, { name: string; key: string }>,
): Pick<DashboardWorkItem, "projectName" | "projectKey"> {
  const normalizedWorkspaceId = normalizeText(workspaceId);
  if (!normalizedWorkspaceId) {
    return {};
  }
  const binding = projectByWorkspace[normalizedWorkspaceId];
  if (!binding) {
    return {};
  }
  return {
    projectName: binding.name,
    projectKey: binding.key,
  };
}

function annotateWorkItemsWithProjects(
  items: DashboardWorkItem[],
  projectByWorkspace: Record<string, { name: string; key: string }>,
): DashboardWorkItem[] {
  return items.map((item) => ({
    ...item,
    ...resolveProjectBindingForWorkspaceId(item.workspaceId, projectByWorkspace),
  }));
}

function annotateTeamRunsWithProjects(
  runs: DashboardTeamRun[],
  projectByWorkspace: Record<string, { name: string; key: string }>,
): DashboardTeamRun[] {
  return runs.map((run) => ({
    ...run,
    items: annotateWorkItemsWithProjects(run.items, projectByWorkspace),
  }));
}

function resolveArtifactPathWithinWorkspace(params: {
  workspaceId?: string;
  artifactPath?: string;
}): string | undefined {
  const workspaceId = normalizeText(params.workspaceId);
  const artifactPath = normalizeText(params.artifactPath);
  if (!workspaceId || !artifactPath) {
    return undefined;
  }
  const resolved = path.resolve(workspaceId, artifactPath);
  if (resolved !== workspaceId && !isWithinDir(workspaceId, resolved)) {
    return undefined;
  }
  return resolved;
}

function resolveTrustedTeamContext(
  cfg: MaumauConfig,
  sessionKey: string,
  store: Record<string, SessionEntry>,
): { teamId?: string; teamRole?: string } | null {
  let current = normalizeText(sessionKey);
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const entry = store[current];
    const teamId = normalizeText(entry?.teamId) || undefined;
    const teamRole = normalizeText(entry?.teamRole) || undefined;
    if (teamId || teamRole) {
      return { teamId, teamRole };
    }
    current = normalizeText(entry?.parentSessionKey) || normalizeText(entry?.spawnedBy);
  }
  const implicit = resolveSessionTeamContext({
    cfg,
    sessionKey,
  });
  if (implicit?.teamId || implicit?.teamRole) {
    return {
      teamId: implicit.teamId,
      teamRole: implicit.teamRole,
    };
  }
  return null;
}

function resolveWorkItemId(sessionKey: string): string {
  return `task:${sessionKey}`;
}

function resolveTrustedTaskTitle(params: {
  teamLabel?: string;
  teamId?: string;
  teamRole?: string;
  assigneeLabel?: string;
  envelope: TrustedWorkItemEnvelope | null;
  artifactPath?: string;
  previewUrl?: string;
  subject?: string;
}): string {
  const envelopeTitle = normalizeText(params.envelope?.title);
  if (envelopeTitle) {
    return envelopeTitle;
  }
  const artifactLabel = resolveArtifactDisplayLabel({
    artifactPath: params.artifactPath,
    previewUrl: params.previewUrl,
  });
  if (artifactLabel) {
    return artifactLabel;
  }
  const roleTitle = resolveRoleTaskTitle(params.teamRole);
  if (roleTitle && params.subject) {
    return `${roleTitle} for ${params.subject}`;
  }
  return (
    roleTitle || params.subject || params.teamLabel || params.assigneeLabel || "Workspace task"
  );
}

function resolveTrustedTaskSummary(params: {
  envelope: TrustedWorkItemEnvelope | null;
  title: string;
  artifactPath?: string;
  previewUrl?: string;
  messageSummary?: string;
}): string | undefined {
  const envelopeSummary = cleanTaskSummary(params.envelope?.summary, params.title);
  if (envelopeSummary) {
    return envelopeSummary;
  }
  const artifactLabel = resolveArtifactDisplayLabel({
    artifactPath: params.artifactPath,
    previewUrl: params.previewUrl,
  });
  if (
    artifactLabel &&
    normalizeComparableText(artifactLabel) !== normalizeComparableText(params.title)
  ) {
    return `Output: ${artifactLabel}`;
  }
  const messageSummary = cleanTaskSummary(params.messageSummary, params.title);
  if (messageSummary) {
    return messageSummary;
  }
  return undefined;
}

function refreshDashboardWorkItemCopy(item: DashboardWorkItem): DashboardWorkItem {
  const primaryPreview = item.previewLinks[0];
  const fallbackTitle = resolveTrustedTaskTitle({
    teamLabel: item.teamLabel,
    teamId: item.teamId,
    teamRole: item.teamRole,
    assigneeLabel: item.assigneeLabel,
    envelope: null,
    artifactPath: primaryPreview?.artifactPath,
    previewUrl: primaryPreview?.previewUrl,
  });
  const title =
    !normalizeText(item.title) ||
    isLegacyTaskTitle({
      title: item.title,
      teamLabel: item.teamLabel,
      teamId: item.teamId,
      teamRole: item.teamRole,
      assigneeLabel: item.assigneeLabel,
    })
      ? fallbackTitle
      : item.title;
  const summary =
    cleanTaskSummary(item.summary, title) ||
    resolveTrustedTaskSummary({
      envelope: null,
      title,
      artifactPath: primaryPreview?.artifactPath,
      previewUrl: primaryPreview?.previewUrl,
    });
  return {
    ...item,
    title,
    summary,
  };
}

function buildFailureBlocker(params: {
  taskId: string;
  title: string;
  summary?: string;
  sessionKey: string;
  status?: string;
}): DashboardWorkItemBlockerLink[] {
  if (params.status !== "failed" && params.status !== "killed" && params.status !== "timeout") {
    return [];
  }
  const description =
    cleanTaskSummary(params.summary, params.title) ||
    (params.status === "timeout"
      ? "The session timed out before the task could complete."
      : params.status === "killed"
        ? "The session was stopped before the task could complete."
        : "The session failed before the task could complete.");
  return [
    {
      id: `failure:${params.taskId}`,
      kind: "failure",
      title: `Task blocked: ${params.title}`,
      description,
      suggestion:
        "Open the related session, inspect the latest failure, fix or retry it, then continue.",
      sessionKey: params.sessionKey,
    },
  ];
}

function buildTrustedTranscriptBlocker(params: {
  taskId: string;
  title: string;
  sessionKey: string;
  messages: unknown[];
}): DashboardWorkItemBlockerLink[] {
  const blocker = findTrustedTranscriptBlocker(params.messages);
  if (!blocker) {
    return [];
  }
  return [
    {
      id: `tool-result:${params.taskId}`,
      kind: "failure",
      title: `Task blocked: ${params.title}`,
      description: blocker.description,
      suggestion: blocker.suggestion,
      sessionKey: params.sessionKey,
    },
  ];
}

function buildPreviewLinks(params: {
  taskId: string;
  sessionKey: string;
  updatedAtMs: number;
  previewUrl?: string;
  artifactPath?: string;
}): DashboardWorkshopPreviewLink[] {
  if (!isPublishedPreviewUrl(params.previewUrl)) {
    return [];
  }
  return [
    {
      id: `${params.taskId}:preview:${params.sessionKey}`,
      sessionKey: params.sessionKey,
      previewUrl: params.previewUrl,
      artifactPath: params.artifactPath,
      embeddable: resolvePreviewEmbeddable(params.previewUrl),
      updatedAtMs: params.updatedAtMs,
    },
  ];
}

function mergeWorkItem(
  existing: DashboardWorkItem | undefined,
  candidate: DashboardWorkItem,
): DashboardWorkItem {
  const mergedStatus = candidate.blockerLinks.length > 0 ? "blocked" : candidate.status;
  return {
    ...existing,
    ...candidate,
    status: mergedStatus,
    createdAtMs: existing?.createdAtMs ?? candidate.createdAtMs,
    retainedUntilMs:
      mergedStatus === "done" || mergedStatus === "blocked"
        ? (candidate.endedAtMs ?? candidate.updatedAtMs ?? candidate.createdAtMs) +
          WORK_ITEM_RETENTION_MS
        : undefined,
    sessionLinks: mergeSessionLinks(existing?.sessionLinks ?? [], candidate.sessionLinks),
    // Refresh blockers from the current trusted transcript so stale guidance drops away.
    blockerLinks: candidate.blockerLinks,
    // Refresh previews from the current trusted transcript so stale noise drops away.
    previewLinks: candidate.previewLinks,
  };
}

async function buildCandidateWorkItem(params: {
  cfg: MaumauConfig;
  row: {
    key: string;
    updatedAt: number | null;
    startedAt?: number;
    endedAt?: number;
    status?: string;
    parentSessionKey?: string;
    childSessions?: string[];
  };
  entry: SessionEntry | undefined;
  storePath: string;
  store: Record<string, SessionEntry>;
  agentLabelById: Map<string, string>;
  teamLabelById: Map<string, string>;
  hasPendingApproval: boolean;
  nowMs: number;
}): Promise<DashboardWorkItem | null> {
  if (!params.row.updatedAt) {
    return null;
  }
  const agentId = resolveSessionAgentId(params.cfg, params.row.key);
  const assigneeLabel =
    params.agentLabelById.get(agentId) ?? resolveAgentDisplayName(params.cfg, agentId);
  const messages = params.entry?.sessionId
    ? readSessionMessages(params.entry.sessionId, params.storePath, params.entry.sessionFile)
    : [];
  const orderedMessages = messages.toReversed();
  const promptContext = params.entry?.sessionId
    ? deriveTaskContextFromText(
        readFirstUserMessageFromTranscript(
          params.entry.sessionId,
          params.storePath,
          params.entry.sessionFile,
        ) || undefined,
      )
    : {};
  const messageContext = mergeDerivedTaskContext(
    deriveTaskContextFromMessages(orderedMessages),
    promptContext,
  );
  const envelope = parseTrustedWorkItemEnvelope(orderedMessages);
  const teamContext = resolveTrustedTeamContext(params.cfg, params.row.key, params.store);
  const hasExplicitTeamMetadata = Boolean(params.entry?.teamId || params.entry?.teamRole);
  const hasRelevantImplicitManagerActivity =
    !hasExplicitTeamMetadata &&
    teamContext?.teamRole?.toLowerCase() === "manager" &&
    (Boolean(envelope?.teamRun) || (params.row.childSessions?.length ?? 0) > 0);
  const artifacts = parsePreviewArtifacts(orderedMessages);
  const taskId = resolveWorkItemId(params.row.key);
  const title = resolveTrustedTaskTitle({
    teamLabel: teamContext?.teamId ? params.teamLabelById.get(teamContext.teamId) : undefined,
    teamId: teamContext?.teamId,
    teamRole: teamContext?.teamRole,
    assigneeLabel,
    envelope,
    artifactPath: artifacts.artifactPath,
    previewUrl: artifacts.previewUrl,
    subject: messageContext.subject,
  });
  const summary = resolveTrustedTaskSummary({
    envelope,
    title,
    artifactPath: artifacts.artifactPath,
    previewUrl: artifacts.previewUrl,
    messageSummary: messageContext.summary,
  });
  const blockerLinks = mergeBlockerLinks(
    buildFailureBlocker({
      taskId,
      title,
      summary,
      sessionKey: params.row.key,
      status: params.row.status,
    }),
    buildTrustedTranscriptBlocker({
      taskId,
      title,
      sessionKey: params.row.key,
      messages,
    }),
  );
  const hasDirectBlockerSignal = blockerLinks.length > 0 || params.hasPendingApproval;
  if (
    !teamContext?.teamId &&
    !teamContext?.teamRole &&
    !envelope?.teamRun &&
    !hasDirectBlockerSignal
  ) {
    return null;
  }
  if (
    !hasExplicitTeamMetadata &&
    !hasRelevantImplicitManagerActivity &&
    !envelope?.teamRun &&
    !hasDirectBlockerSignal
  ) {
    return null;
  }
  const status = resolveTaskStatus({
    row: params.row,
    blockerIds: blockerLinks.map((blocker) => blocker.id),
  });
  const lifecycle = resolveLifecycleProgressFields({
    cfg: params.cfg,
    teamId: envelope?.teamRun?.teamId || teamContext?.teamId,
    workflowId: envelope?.teamRun?.workflowId,
    teamRole: teamContext?.teamRole,
    envelope,
    fallbackStatus: status,
    rowStatus: params.row.status,
  });
  const updatedAtMs = params.row.updatedAt ?? params.nowMs;
  const workspace = await resolveTrustedWorkspaceMetadata({
    cfg: params.cfg,
    agentId,
    entry: params.entry,
  });
  return {
    id: taskId,
    sessionKey: params.row.key,
    title,
    summary,
    status: blockerLinks.length > 0 ? "blocked" : lifecycle.status,
    visibilityScope: "global",
    source: envelope
      ? "runtime_envelope"
      : teamContext?.teamId || teamContext?.teamRole
        ? "team_session"
        : "direct_session",
    agentId,
    assigneeLabel,
    teamId: envelope?.teamRun?.teamId || teamContext?.teamId,
    teamLabel:
      envelope?.teamRun?.teamId || teamContext?.teamId
        ? params.teamLabelById.get(envelope?.teamRun?.teamId || teamContext?.teamId || "")
        : undefined,
    teamRole: teamContext?.teamRole,
    teamWorkflowId: lifecycle.teamWorkflowId,
    teamWorkflowLabel: lifecycle.teamWorkflowLabel,
    updatedAtMs,
    startedAtMs: params.row.startedAt,
    endedAtMs: params.row.endedAt,
    createdAtMs: params.row.startedAt ?? updatedAtMs,
    retainedUntilMs:
      lifecycle.status === "done" || lifecycle.status === "blocked"
        ? (params.row.endedAt ?? updatedAtMs) + WORK_ITEM_RETENTION_MS
        : undefined,
    parentSessionKey: params.row.parentSessionKey,
    childSessionKeys: params.row.childSessions,
    blockerIds: blockerLinks.map((blocker) => blocker.id),
    currentStageId: lifecycle.currentStageId,
    currentStageLabel: lifecycle.currentStageLabel,
    completedStageIds: lifecycle.completedStageIds,
    completedStepCount: lifecycle.completedStepCount,
    totalStepCount: lifecycle.totalStepCount,
    progressLabel: lifecycle.progressLabel,
    progressPercent: lifecycle.progressPercent,
    workspaceId: workspace.workspaceId,
    workspaceLabel: workspace.workspaceLabel,
    sessionLinks: [
      {
        sessionKey: params.row.key,
        kind: "primary",
        agentId,
        assigneeLabel,
        teamId: teamContext?.teamId,
        teamRole: teamContext?.teamRole,
      },
    ],
    blockerLinks,
    previewLinks: buildPreviewLinks({
      taskId,
      sessionKey: params.row.key,
      updatedAtMs,
      previewUrl: artifacts.previewUrl,
      artifactPath: artifacts.artifactPath,
    }),
  };
}

function resolveTaskIdForSessionKey(
  sessionKey: string,
  taskIdBySessionKey: Map<string, string>,
  store: Record<string, SessionEntry>,
): string | null {
  let current = normalizeText(sessionKey);
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const taskId = taskIdBySessionKey.get(current);
    if (taskId) {
      return taskId;
    }
    const entry = store[current];
    current = normalizeText(entry?.parentSessionKey) || normalizeText(entry?.spawnedBy);
  }
  return null;
}

function isSessionDescendantOf(
  sessionKey: string,
  ancestorSessionKey: string,
  store: Record<string, SessionEntry>,
): boolean {
  let current = normalizeText(sessionKey);
  const ancestor = normalizeText(ancestorSessionKey);
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    if (current === ancestor) {
      return true;
    }
    seen.add(current);
    const entry = store[current];
    current = normalizeText(entry?.parentSessionKey) || normalizeText(entry?.spawnedBy);
  }
  return false;
}

function resolveRootSessionKey(
  sessionKey: string,
  store: Record<string, SessionEntry>,
): string | undefined {
  let current = normalizeText(sessionKey);
  let last = current;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    last = current;
    const entry = store[current];
    current = normalizeText(entry?.parentSessionKey) || normalizeText(entry?.spawnedBy);
  }
  return last || undefined;
}

function resolveStatusPriority(status: DashboardTaskStatus): number {
  switch (status) {
    case "blocked":
      return 4;
    case "review":
      return 3;
    case "in_progress":
      return 2;
    case "done":
      return 1;
    case "idle":
    default:
      return 0;
  }
}

function mergeRollupStatus(
  current: DashboardTaskStatus,
  next: DashboardTaskStatus,
): DashboardTaskStatus {
  return resolveStatusPriority(next) >= resolveStatusPriority(current) ? next : current;
}

function findNearestAncestorWorkItem(params: {
  sessionKey: string;
  store: Record<string, SessionEntry>;
  itemsBySessionKey: Map<string, DashboardWorkItem>;
  excludedTeamId?: string;
}): DashboardWorkItem | null {
  let current =
    normalizeText(params.store[params.sessionKey]?.parentSessionKey) ||
    normalizeText(params.store[params.sessionKey]?.spawnedBy);
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const item = params.itemsBySessionKey.get(current);
    if (item && item.teamId !== params.excludedTeamId) {
      return item;
    }
    current =
      normalizeText(params.store[current]?.parentSessionKey) ||
      normalizeText(params.store[current]?.spawnedBy);
  }
  return null;
}

function buildTeamRunsFromWorkItems(params: {
  cfg: MaumauConfig;
  items: DashboardWorkItem[];
  store: Record<string, SessionEntry>;
}): { allItems: DashboardWorkItem[]; teamRuns: DashboardTeamRun[] } {
  const itemsById = new Map(params.items.map((item) => [item.id, { ...item }]));
  const itemsBySessionKey = new Map(
    Array.from(itemsById.values()).map((item) => [item.sessionKey, item]),
  );
  const managerItems = Array.from(itemsById.values())
    .filter((item) => normalizeText(item.teamRole).toLowerCase() === "manager" && item.teamId)
    .toSorted((left, right) => {
      const leftDepth = (left.sessionKey.match(/:/g) ?? []).length;
      const rightDepth = (right.sessionKey.match(/:/g) ?? []).length;
      return rightDepth - leftDepth;
    });
  const teamRuns: DashboardTeamRun[] = [];

  for (const managerItem of managerItems) {
    const team = managerItem.teamId ? findTeamConfig(params.cfg, managerItem.teamId) : undefined;
    if (!team) {
      continue;
    }
    const workflow = findTeamWorkflow(team, managerItem.teamWorkflowId);
    const lifecycleStages = resolveTeamWorkflowLifecycleStages(workflow);
    const detailItems = Array.from(itemsById.values())
      .filter(
        (item) =>
          item.teamId === managerItem.teamId &&
          isSessionDescendantOf(item.sessionKey, managerItem.sessionKey, params.store),
      )
      .toSorted((left, right) => (right.updatedAtMs ?? 0) - (left.updatedAtMs ?? 0));
    if (detailItems.length === 0) {
      continue;
    }

    const completedStageIds = managerItem.completedStageIds ?? [];
    const totalStepCount =
      managerItem.totalStepCount ?? resolveLifecycleDisplayStepCount(lifecycleStages);
    const completedStepCount =
      managerItem.completedStepCount ?? (managerItem.status === "done" ? totalStepCount : 0);
    const progressLabel =
      managerItem.progressLabel ??
      formatLifecycleProgressLabel({
        completedStepCount,
        totalStepCount,
        currentStageLabel: managerItem.currentStageLabel,
      });
    const progressPercent =
      managerItem.progressPercent ??
      (totalStepCount > 0 ? Math.round((completedStepCount / totalStepCount) * 100) : undefined);
    const blockerLinks = detailItems.reduce<DashboardWorkItemBlockerLink[]>(
      (merged, item) => mergeBlockerLinks(merged, item.blockerLinks),
      [],
    );
    const rootTask = findNearestAncestorWorkItem({
      sessionKey: managerItem.sessionKey,
      store: params.store,
      itemsBySessionKey,
      excludedTeamId: managerItem.teamId,
    });

    for (const item of detailItems) {
      if (item.id === managerItem.id && !rootTask) {
        continue;
      }
      const current = itemsById.get(item.id);
      if (!current) {
        continue;
      }
      current.visibilityScope = "team_detail";
      itemsById.set(item.id, current);
      itemsBySessionKey.set(item.sessionKey, current);
    }

    if (rootTask) {
      const currentRoot = itemsById.get(rootTask.id);
      if (currentRoot) {
        currentRoot.delegatedTeamRunId = `team-run:${managerItem.sessionKey}`;
        currentRoot.currentStageId = managerItem.currentStageId;
        currentRoot.currentStageLabel = managerItem.currentStageLabel;
        currentRoot.completedStepCount = completedStepCount;
        currentRoot.totalStepCount = totalStepCount || undefined;
        currentRoot.progressLabel = progressLabel;
        currentRoot.progressPercent = progressPercent;
        currentRoot.status =
          blockerLinks.length > 0
            ? "blocked"
            : mergeRollupStatus(currentRoot.status, managerItem.status);
        currentRoot.blockerLinks = mergeBlockerLinks(currentRoot.blockerLinks, blockerLinks);
        currentRoot.blockerIds = currentRoot.blockerLinks.map((blocker) => blocker.id);
        itemsById.set(currentRoot.id, currentRoot);
        itemsBySessionKey.set(currentRoot.sessionKey, currentRoot);
      }
      const currentManager = itemsById.get(managerItem.id);
      if (currentManager) {
        currentManager.visibilityScope = "team_detail";
        itemsById.set(currentManager.id, currentManager);
        itemsBySessionKey.set(currentManager.sessionKey, currentManager);
      }
    } else {
      const currentManager = itemsById.get(managerItem.id);
      if (currentManager && !currentManager.delegatedTeamRunId) {
        currentManager.visibilityScope = "global";
        currentManager.completedStepCount = completedStepCount;
        currentManager.totalStepCount = totalStepCount || undefined;
        currentManager.progressLabel = progressLabel;
        currentManager.progressPercent = progressPercent;
        currentManager.blockerLinks = mergeBlockerLinks(currentManager.blockerLinks, blockerLinks);
        currentManager.blockerIds = currentManager.blockerLinks.map((blocker) => blocker.id);
        currentManager.status = blockerLinks.length > 0 ? "blocked" : currentManager.status;
        itemsById.set(currentManager.id, currentManager);
        itemsBySessionKey.set(currentManager.sessionKey, currentManager);
      }
    }

    teamRuns.push({
      id: `team-run:${managerItem.sessionKey}`,
      managerSessionKey: managerItem.sessionKey,
      rootSessionKey: resolveRootSessionKey(managerItem.sessionKey, params.store),
      rootTaskId: rootTask?.id,
      title: managerItem.title,
      summary: managerItem.summary,
      status: blockerLinks.length > 0 ? "blocked" : managerItem.status,
      teamId: team.id,
      teamName: team.name?.trim() || team.id,
      workflowId: workflow.id,
      workflowName: workflow.name?.trim() || workflow.id,
      updatedAtMs: managerItem.updatedAtMs,
      startedAtMs: managerItem.startedAtMs,
      endedAtMs: managerItem.endedAtMs,
      currentStageId: managerItem.currentStageId,
      currentStageLabel: managerItem.currentStageLabel,
      completedStageIds,
      completedStepCount,
      totalStepCount,
      progressLabel,
      progressPercent,
      blockerLinks,
      items: detailItems.map((item) => itemsById.get(item.id) ?? item),
    });
  }

  return {
    allItems: Array.from(itemsById.values()),
    teamRuns: teamRuns.toSorted(
      (left, right) => (right.updatedAtMs ?? 0) - (left.updatedAtMs ?? 0),
    ),
  };
}

async function reconcileDashboardWorkItems(params: {
  cfg: MaumauConfig;
  nowMs: number;
  stateDir?: string;
  storePath: string;
  store: Record<string, SessionEntry>;
  sessions: Array<{
    key: string;
    updatedAt: number | null;
    startedAt?: number;
    endedAt?: number;
    status?: string;
    parentSessionKey?: string;
    childSessions?: string[];
  }>;
  approvals: ReadonlyArray<ExecApprovalRecord>;
}): Promise<{
  allItems: DashboardWorkItem[];
  globalItems: DashboardWorkItem[];
  teamRuns: DashboardTeamRun[];
}> {
  const existingStore = await readStoredDashboardWorkItems({ stateDir: params.stateDir });
  const existingById = new Map(existingStore.items.map((item) => [item.id, item]));
  const nextById = new Map(existingById);
  const taskIdBySessionKey = new Map<string, string>();
  const activeSessionKeys = new Set(params.sessions.map((row) => row.key));
  const candidateSessionKeys = new Set<string>();
  const approvalSessionKeys = new Set(
    params.approvals.map((approval) => normalizeText(approval.request.sessionKey)).filter(Boolean),
  );
  const agentLabelById = new Map<string, string>();
  for (const agent of listAgentsForGateway(params.cfg).agents) {
    agentLabelById.set(agent.id, agent.identity?.name?.trim() || agent.name?.trim() || agent.id);
  }
  const teamLabelById = new Map(
    listConfiguredTeams(params.cfg).map((team) => [team.id, team.name?.trim() || team.id]),
  );

  for (const row of params.sessions) {
    const entry = params.store[row.key];
    const candidate = await buildCandidateWorkItem({
      cfg: params.cfg,
      row,
      entry,
      storePath: params.storePath,
      store: params.store,
      agentLabelById,
      teamLabelById,
      hasPendingApproval: approvalSessionKeys.has(row.key),
      nowMs: params.nowMs,
    });
    if (!candidate) {
      continue;
    }
    candidateSessionKeys.add(candidate.sessionKey);
    const merged = mergeWorkItem(existingById.get(candidate.id), candidate);
    nextById.set(merged.id, merged);
    for (const link of merged.sessionLinks) {
      taskIdBySessionKey.set(link.sessionKey, merged.id);
    }
  }

  for (const item of existingById.values()) {
    if (
      item.source === "direct_session" &&
      activeSessionKeys.has(item.sessionKey) &&
      !candidateSessionKeys.has(item.sessionKey)
    ) {
      nextById.delete(item.id);
    }
  }

  const approvalBlockersByTaskId = new Map<string, DashboardWorkItemBlockerLink[]>();
  for (const approval of params.approvals) {
    const sessionKey = normalizeText(approval.request.sessionKey);
    if (!sessionKey) {
      continue;
    }
    const taskId = resolveTaskIdForSessionKey(sessionKey, taskIdBySessionKey, params.store);
    if (!taskId) {
      continue;
    }
    const blockers = approvalBlockersByTaskId.get(taskId) ?? [];
    blockers.push({
      id: `approval:${approval.id}`,
      kind: "approval",
      title: "Exec approval needed",
      description: approval.request.command,
      suggestion: "Open the related session, review the request, then approve or reject it.",
      sessionKey,
    });
    approvalBlockersByTaskId.set(taskId, blockers);
  }

  const allRetainedItems = [...nextById.values()]
    .map((item) => {
      const approvalBlockers = approvalBlockersByTaskId.get(item.id) ?? [];
      const nonApprovalBlockers = item.blockerLinks.filter(
        (blocker) => blocker.kind !== "approval",
      );
      const blockerLinks = mergeBlockerLinks(nonApprovalBlockers, approvalBlockers);
      const status = blockerLinks.length > 0 ? "blocked" : item.status;
      const retainedUntilMs =
        status === "done" || status === "blocked"
          ? (item.endedAtMs ?? item.updatedAtMs ?? item.createdAtMs) + WORK_ITEM_RETENTION_MS
          : undefined;
      return {
        ...item,
        status,
        retainedUntilMs,
        blockerLinks,
        blockerIds: blockerLinks.map((blocker) => blocker.id),
      } satisfies DashboardWorkItem;
    })
    .map((item) => refreshDashboardWorkItemCopy(item))
    .filter((item) => (item.retainedUntilMs ?? Number.MAX_SAFE_INTEGER) >= params.nowMs)
    .toSorted((left, right) => (right.updatedAtMs ?? 0) - (left.updatedAtMs ?? 0))
    .slice(0, MAX_TASKS);
  const rolledUp = buildTeamRunsFromWorkItems({
    cfg: params.cfg,
    items: allRetainedItems,
    store: params.store,
  });
  const globalItems = rolledUp.allItems
    .filter((item) => (item.visibilityScope ?? "global") !== "team_detail")
    .toSorted((left, right) => (right.updatedAtMs ?? 0) - (left.updatedAtMs ?? 0))
    .slice(0, MAX_TASKS);

  await writeStoredDashboardWorkItems(
    {
      version: 1,
      updatedAtMs: params.nowMs,
      items: rolledUp.allItems,
    },
    params.stateDir,
  );
  return {
    allItems: rolledUp.allItems,
    globalItems,
    teamRuns: rolledUp.teamRuns,
  };
}

async function collectRecentMemoryEntries(params: {
  cfg: MaumauConfig;
  nowMs: number;
}): Promise<DashboardRecentMemoryEntry[]> {
  const agents = listAgentsForGateway(params.cfg).agents;
  const entries: DashboardRecentMemoryEntry[] = [];
  for (const agent of agents) {
    const agentId = agent.id;
    const workspaceDir = resolveAgentWorkspaceDir(params.cfg, agentId);
    const memoryDir = path.join(workspaceDir, MEMORY_NOTES_DIRNAME);
    let dirEntries: Awaited<ReturnType<typeof fs.readdir>>;
    try {
      dirEntries = await fs.readdir(memoryDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of dirEntries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) {
        continue;
      }
      const absolutePath = path.join(memoryDir, entry.name);
      try {
        const [stat, raw] = await Promise.all([
          fs.stat(absolutePath),
          fs.readFile(absolutePath, "utf8"),
        ]);
        entries.push({
          id: `${agentId}:${entry.name}`,
          agentId,
          title: entry.name,
          path: `${MEMORY_NOTES_DIRNAME}/${entry.name}`,
          updatedAtMs: stat.mtimeMs,
          excerpt: excerptText(raw),
        });
      } catch {
        // Ignore transient file races.
      }
    }
  }
  return entries
    .toSorted((left, right) => right.updatedAtMs - left.updatedAtMs)
    .slice(0, MAX_MEMORY_ACTIVITY);
}

function buildCronBlockers(cronJobs: CronJob[], nowMs: number): DashboardBlocker[] {
  const blockers: DashboardBlocker[] = [];
  for (const job of cronJobs) {
    if (job.state?.lastStatus === "error") {
      blockers.push({
        id: `cron-error:${job.id}`,
        severity: "error",
        title: `Routine failed: ${job.name}`,
        description: job.state.lastError || "The latest routine run failed.",
        suggestion:
          "Open Routines to inspect the failing job and decide whether it needs a fix or a rerun.",
        jobId: job.id,
      });
    }
    if (
      job.enabled &&
      typeof job.state?.nextRunAtMs === "number" &&
      nowMs - job.state.nextRunAtMs > 300_000
    ) {
      blockers.push({
        id: `cron-overdue:${job.id}`,
        severity: "warning",
        title: `Routine overdue: ${job.name}`,
        description: "This routine is past its expected next run time.",
        suggestion:
          "Open Routines to inspect the late job and confirm whether it should run now or be adjusted.",
        jobId: job.id,
      });
    }
  }
  return blockers;
}

function buildApprovalBlockers(approvals: ReadonlyArray<ExecApprovalRecord>): DashboardBlocker[] {
  return approvals.map((approval) => ({
    id: `approval:${approval.id}`,
    severity: "warning",
    title: "Exec approval needed",
    description: approval.request.command,
    suggestion: "Open the related session, review the request, then approve or reject it.",
    sessionKey: approval.request.sessionKey || undefined,
  }));
}

function mergeDashboardBlockers(
  existing: DashboardBlocker[],
  next: DashboardBlocker[],
): DashboardBlocker[] {
  const merged = new Map<string, DashboardBlocker>();
  for (const blocker of [...existing, ...next]) {
    const current = merged.get(blocker.id);
    merged.set(blocker.id, current ? { ...current, ...blocker } : blocker);
  }
  return [...merged.values()];
}

function classifyRoutineVisibility(job: CronJob): DashboardRoutineVisibility {
  if (job.delivery?.mode && job.delivery.mode !== "none") {
    return "user_facing";
  }
  if (
    job.payload.kind === "agentTurn" &&
    (job.payload.deliver || job.sessionTarget === "current")
  ) {
    return "user_facing";
  }
  const haystack = `${job.name} ${normalizeText(job.description)}`.trim();
  if (OPS_ROUTINE_RE.test(haystack)) {
    return "hidden";
  }
  if (USER_FACING_ROUTINE_RE.test(haystack)) {
    return "user_facing";
  }
  return "hidden";
}

async function buildRoutinesFromCronJobs(params: {
  cronJobs: CronJob[];
  stateDir?: string;
  nowMs: number;
}): Promise<DashboardRoutine[]> {
  const store = await readDashboardRoutineVisibilityStore({ stateDir: params.stateDir });
  let changed = false;
  const nextPreferences = { ...store.preferences };
  const routines = params.cronJobs
    .map((job) => {
      const existing = nextPreferences[job.id];
      if (!existing) {
        nextPreferences[job.id] = {
          visibility: classifyRoutineVisibility(job),
          updatedAtMs: params.nowMs,
        };
        changed = true;
      }
      const visibility = nextPreferences[job.id]?.visibility ?? "hidden";
      return {
        id: `routine:${job.id}`,
        sourceJobId: job.id,
        title: job.name,
        description: normalizeText(job.description) || undefined,
        enabled: job.enabled,
        scheduleLabel: buildScheduleLabel(job),
        nextRunAtMs: job.state?.nextRunAtMs,
        lastRunAtMs: job.state?.lastRunAtMs,
        lastStatus: job.state?.lastStatus,
        agentId: normalizeText(job.agentId) || undefined,
        visibility,
        visibilitySource: existing ? "stored" : "fallback",
      } satisfies DashboardRoutine;
    })
    .filter((routine) => routine.visibility === "user_facing")
    .toSorted((left, right) => {
      const leftNext = left.nextRunAtMs ?? Number.MAX_SAFE_INTEGER;
      const rightNext = right.nextRunAtMs ?? Number.MAX_SAFE_INTEGER;
      return leftNext - rightNext;
    });

  if (changed) {
    await writeDashboardRoutineVisibilityStore(
      {
        version: 1,
        updatedAtMs: params.nowMs,
        preferences: nextPreferences,
      },
      params.stateDir,
    );
  }
  return routines;
}

function buildSavedWorkshopItems(params: {
  savedRecords: DashboardWorkshopSavedItemRecord[];
  cfg?: MaumauConfig;
  nowMs?: number;
}): DashboardSavedWorkshopItem[] {
  const resolvedAuth = resolveGatewayAuth({
    authConfig: params.cfg?.gateway?.auth,
    env: process.env,
  });
  return params.savedRecords
    .slice()
    .sort((left, right) => (right.updatedAtMs ?? 0) - (left.updatedAtMs ?? 0))
    .map((record) => ({
      id: record.id,
      title: record.title,
      summary: record.summary,
      taskTitle: record.taskTitle,
      updatedAtMs: record.updatedAtMs,
      savedAtMs: record.savedAtMs,
      agentId: record.agentId,
      previewUrl: buildSavedWorkshopEmbedPath({
        savedItemId: record.id,
        auth: resolvedAuth,
        nowMs: params.nowMs,
      }),
      embedUrl: buildSavedWorkshopEmbedPath({
        savedItemId: record.id,
        auth: resolvedAuth,
        nowMs: params.nowMs,
      }),
      artifactPath: record.artifactPath,
      embeddable: record.embeddable,
      taskStatus: record.taskStatus,
      taskAssigneeLabel: record.taskAssigneeLabel,
      workspaceId: record.workspaceId,
      workspaceLabel: record.workspaceLabel,
      projectName: record.projectName,
      projectKey: record.projectKey,
      taskId: record.taskId,
      sessionKey: record.sessionKey,
    }));
}

async function buildWorkshopItems(
  tasks: DashboardWorkItem[],
  params: { cfg?: MaumauConfig; nowMs?: number; stateDir?: string },
): Promise<{ items: DashboardWorkshopItem[]; savedItems: DashboardSavedWorkshopItem[] }> {
  const workshopStore = await readDashboardWorkshopStore({ stateDir: params.stateDir });
  const savedRecordBySourceIdentity = new Map(
    workshopStore.savedItems.map((record) => [record.sourceIdentity, record] as const),
  );
  const items: Array<DetailedDashboardWorkshopItem & { dedupeKey: string }> = [];
  const resolvedAuth = resolveGatewayAuth({
    authConfig: params.cfg?.gateway?.auth,
    env: process.env,
  });
  for (const task of tasks) {
    for (const preview of task.previewLinks) {
      if (!isPublishedPreviewUrl(preview.previewUrl)) {
        continue;
      }
      const previewInfo = await resolvePreviewArtifactInfoFromPreviewUrl({
        previewUrl: preview.previewUrl,
        stateDir: params.stateDir,
      });
      const previewDocumentLabel = previewInfo?.documentLabel;
      const artifactLabel = resolveArtifactDisplayLabel({
        artifactPath: preview.artifactPath,
        previewUrl: preview.previewUrl,
      });
      const sourceIdentity = resolveWorkshopDeduplicationKey({
        previewSourcePath: previewInfo?.sourcePath,
        previewDocumentLabel,
        artifactLabel,
        taskTitle: task.title,
        artifactPath: preview.artifactPath,
        fallbackId: preview.id,
      });
      const savedRecord = savedRecordBySourceIdentity.get(sourceIdentity);
      const title = previewDocumentLabel || artifactLabel || task.title || "Untitled preview";
      const summaryText = normalizeText(task.summary);
      const artifactSummary =
        summaryText &&
        !/\b(?:lane|assigned to|session)\b/i.test(summaryText) &&
        !looksLikeTrivialStatusSummary(summaryText)
          ? summaryText
          : task.title && !looksLikeGenericRoleTaskTitle(task.title)
            ? `Interactive preview for ${task.title}.`
            : "Interactive preview linked to this workspace task.";
      items.push({
        id: preview.id,
        sessionKey: preview.sessionKey,
        taskId: task.id,
        title,
        summary: artifactSummary,
        taskTitle: task.title,
        updatedAtMs: preview.updatedAtMs,
        agentId: task.agentId,
        previewUrl: preview.previewUrl,
        embedUrl: buildPreviewEmbedPathFromPreviewUrl({
          previewUrl: preview.previewUrl,
          auth: resolvedAuth,
          nowMs: params.nowMs,
        }),
        artifactPath: preview.artifactPath,
        embeddable: preview.embeddable,
        taskStatus: task.status,
        taskAssigneeLabel: task.assigneeLabel,
        workspaceId: task.workspaceId ?? savedRecord?.workspaceId,
        workspaceLabel: task.workspaceLabel ?? savedRecord?.workspaceLabel,
        projectName: task.projectName ?? savedRecord?.projectName,
        projectKey: task.projectKey ?? savedRecord?.projectKey,
        isSaved: Boolean(savedRecord),
        savedItemId: savedRecord?.id,
        savedAtMs: savedRecord?.savedAtMs,
        sourceIdentity,
        sourceArtifactPath:
          previewInfo?.storedPath ||
          resolveArtifactPathWithinWorkspace({
            workspaceId: task.workspaceId,
            artifactPath: preview.artifactPath,
          }),
        dedupeKey: sourceIdentity,
      });
    }
  }
  const deduped = new Map<string, DashboardWorkshopItem>();
  for (const item of items.toSorted(
    (left, right) => (right.updatedAtMs ?? 0) - (left.updatedAtMs ?? 0),
  )) {
    if (!deduped.has(item.dedupeKey)) {
      const {
        dedupeKey: _dedupeKey,
        sourceIdentity: _sourceIdentity,
        sourceArtifactPath: _sourceArtifactPath,
        ...workshopItem
      } = item;
      deduped.set(item.dedupeKey, workshopItem);
    }
  }
  return {
    items: [...deduped.values()],
    savedItems: buildSavedWorkshopItems({
      savedRecords: workshopStore.savedItems,
      cfg: params.cfg,
      nowMs: params.nowMs,
    }),
  };
}

async function resolveWorkshopSaveSource(params: {
  item: DashboardWorkshopItem;
  stateDir?: string;
}): Promise<{ sourceIdentity: string; sourcePath?: string }> {
  const previewInfo = await resolvePreviewArtifactInfoFromPreviewUrl({
    previewUrl: params.item.previewUrl,
    stateDir: params.stateDir,
  });
  const artifactLabel = resolveArtifactDisplayLabel({
    artifactPath: params.item.artifactPath,
    previewUrl: params.item.previewUrl,
  });
  return {
    sourceIdentity: resolveWorkshopDeduplicationKey({
      previewSourcePath: previewInfo?.sourcePath,
      previewDocumentLabel: previewInfo?.documentLabel,
      artifactLabel,
      taskTitle: params.item.taskTitle,
      artifactPath: params.item.artifactPath,
      fallbackId: params.item.id,
    }),
    sourcePath:
      previewInfo?.storedPath ||
      resolveArtifactPathWithinWorkspace({
        workspaceId: params.item.workspaceId,
        artifactPath: params.item.artifactPath,
      }),
  };
}

function buildApprovalCalendarEvents(
  approvals: ReadonlyArray<ExecApprovalRecord>,
): DashboardCalendarEvent[] {
  return approvals
    .map((approval) => ({
      id: `approval:${approval.id}`,
      title: "Exec approval needed",
      kind: "approval_needed",
      status: "needs_action",
      startAtMs: approval.createdAtMs,
      endAtMs: approval.expiresAtMs,
      description: approval.request.command,
      agentId: normalizeText(approval.request.agentId) || undefined,
    }))
    .slice(0, 24);
}

function buildOccurrenceTimestampsForJob(params: {
  job: CronJob;
  startAtMs: number;
  endAtMs: number;
}): number[] {
  const timestamps: number[] = [];
  let cursor = params.startAtMs - 1;
  for (let index = 0; index < MAX_OCCURRENCES_PER_JOB; index += 1) {
    const nextRunAtMs = computeNextRunAtMs(params.job.schedule, cursor);
    if (typeof nextRunAtMs !== "number" || !Number.isFinite(nextRunAtMs)) {
      break;
    }
    if (nextRunAtMs >= params.endAtMs) {
      break;
    }
    if (nextRunAtMs >= params.startAtMs) {
      timestamps.push(nextRunAtMs);
    }
    cursor = nextRunAtMs + 1;
  }
  return timestamps;
}

function resolveRoutineOccurrenceStatus(params: {
  job: CronJob;
  occurrenceAtMs: number;
  nowMs: number;
  cronRuns: Array<{
    ts: number;
    jobId: string;
    status?: "ok" | "error" | "skipped";
    runAtMs?: number;
  }>;
}): DashboardCalendarEvent["status"] {
  const toleranceMs =
    params.job.schedule.kind === "every"
      ? Math.min(Math.max(60_000, params.job.schedule.everyMs / 2), 15 * 60_000)
      : 15 * 60_000;
  const matchedRun = params.cronRuns.find((run) => {
    const runAtMs = run.runAtMs ?? run.ts;
    return Math.abs(runAtMs - params.occurrenceAtMs) <= toleranceMs;
  });
  if (matchedRun?.status === "error") {
    return "error";
  }
  if (
    params.job.state.runningAtMs &&
    Math.abs(params.job.state.runningAtMs - params.occurrenceAtMs) <= toleranceMs
  ) {
    return "running";
  }
  if (matchedRun?.status === "ok" || params.occurrenceAtMs < params.nowMs) {
    return "done";
  }
  return "scheduled";
}

function buildCalendarEvents(params: {
  cronJobs: CronJob[];
  cronRuns: Array<{
    ts: number;
    jobId: string;
    status?: "ok" | "error" | "skipped";
    runAtMs?: number;
  }>;
  routines: DashboardRoutine[];
  approvals: ReadonlyArray<ExecApprovalRecord>;
  view: DashboardCalendarView;
  anchorAtMs: number;
  nowMs: number;
}): DashboardCalendarResult {
  const window = resolveCalendarWindow(params.view, params.anchorAtMs);
  const visibleJobIds = new Set(params.routines.map((routine) => routine.sourceJobId));
  const cronRunsByJobId = new Map<string, Array<(typeof params.cronRuns)[number]>>();
  for (const run of params.cronRuns) {
    const bucket = cronRunsByJobId.get(run.jobId) ?? [];
    bucket.push(run);
    cronRunsByJobId.set(run.jobId, bucket);
  }
  const events: DashboardCalendarEvent[] = [];
  for (const job of params.cronJobs) {
    if (!visibleJobIds.has(job.id)) {
      continue;
    }
    const timestamps = buildOccurrenceTimestampsForJob({
      job,
      startAtMs: window.startAtMs,
      endAtMs: window.endAtMs,
    });
    for (const occurrenceAtMs of timestamps) {
      const status = resolveRoutineOccurrenceStatus({
        job,
        occurrenceAtMs,
        nowMs: params.nowMs,
        cronRuns: cronRunsByJobId.get(job.id) ?? [],
      });
      const haystack = `${job.name} ${normalizeText(job.description)}`;
      events.push({
        id: `routine:${job.id}:${occurrenceAtMs}`,
        title: job.name,
        kind: /remind/i.test(haystack) ? "reminder" : "routine_occurrence",
        status,
        startAtMs: occurrenceAtMs,
        description: buildScheduleLabel(job),
        jobId: job.id,
        routineId: `routine:${job.id}`,
        agentId: normalizeText(job.agentId) || undefined,
      });
    }
  }
  events.push(...buildApprovalCalendarEvents(params.approvals));
  return {
    generatedAtMs: params.nowMs,
    anchorAtMs: window.anchorAtMs,
    startAtMs: window.startAtMs,
    endAtMs: window.endAtMs,
    view: params.view,
    events: events
      .filter((event) => event.startAtMs >= window.startAtMs && event.startAtMs < window.endAtMs)
      .toSorted((left, right) => left.startAtMs - right.startAtMs)
      .slice(0, MAX_CALENDAR_EVENTS),
  };
}

async function collectDashboardDataset(params: CollectDashboardCalendarParams): Promise<{
  snapshot: DashboardSnapshot;
  tasks: DashboardTasksResult;
  teamRuns: DashboardTeamRunsResult;
  workshop: DashboardWorkshopResult;
  calendar: DashboardCalendarResult;
  routines: DashboardRoutinesResult;
  memories: DashboardMemoriesResult;
}> {
  const cfg = params.cfg ?? loadConfig();
  const nowMs = params.nowMs ?? Date.now();
  const { storePath, store } = loadCombinedSessionStoreForGateway(cfg);
  const sessionsResult = listSessionsFromStore({
    cfg,
    storePath,
    store,
    opts: {
      includeGlobal: false,
      includeUnknown: false,
      includeDerivedTitles: false,
      includeLastMessage: false,
      limit: MAX_TASKS,
    },
  });
  const approvals = params.execApprovals ?? [];
  const workItems = await reconcileDashboardWorkItems({
    cfg,
    nowMs,
    stateDir: params.stateDir,
    storePath,
    store,
    sessions: sessionsResult.sessions,
    approvals,
  });
  const workshopStore = await readDashboardWorkshopStore({ stateDir: params.stateDir });
  const annotatedAllItems = annotateWorkItemsWithProjects(
    workItems.allItems,
    workshopStore.projectByWorkspace,
  );
  const annotatedGlobalItems = annotateWorkItemsWithProjects(
    workItems.globalItems,
    workshopStore.projectByWorkspace,
  );
  const annotatedTeamRuns = annotateTeamRunsWithProjects(
    workItems.teamRuns,
    workshopStore.projectByWorkspace,
  );
  const workshop = await buildWorkshopItems(annotatedAllItems, {
    cfg,
    nowMs,
    stateDir: params.stateDir,
  });
  const cronJobs = await params.cron.list({ includeDisabled: true });
  const routines = await buildRoutinesFromCronJobs({
    cronJobs,
    stateDir: params.stateDir,
    nowMs,
  });
  const jobNameById = Object.fromEntries(
    cronJobs
      .filter((job) => normalizeText(job.id) && normalizeText(job.name))
      .map((job) => [job.id, job.name]),
  );
  const cronRunsPage = await readCronRunLogEntriesPageAll({
    storePath: params.cronStorePath,
    limit: 120,
    offset: 0,
    sortDir: "desc",
    jobNameById,
  });
  const calendarResult = buildCalendarEvents({
    cronJobs,
    cronRuns: cronRunsPage.entries,
    routines,
    approvals,
    view: params.view ?? "month",
    anchorAtMs: params.anchorAtMs ?? nowMs,
    nowMs,
  });
  const todayCalendar = buildCalendarEvents({
    cronJobs,
    cronRuns: cronRunsPage.entries,
    routines,
    approvals,
    view: "day",
    anchorAtMs: nowMs,
    nowMs,
  });
  const recentMemory = await collectRecentMemoryEntries({ cfg, nowMs });
  const approvalBlockers = buildApprovalBlockers(approvals);
  const cronBlockers = buildCronBlockers(cronJobs, nowMs);
  const taskBlockers: DashboardBlocker[] = annotatedGlobalItems
    .flatMap((task) =>
      task.blockerLinks.map((blocker) => ({
        id: blocker.id,
        severity: blocker.kind === "approval" ? "warning" : "error",
        title: blocker.title,
        description: blocker.description,
        suggestion: blocker.suggestion,
        sessionKey: blocker.sessionKey,
        taskId: task.id,
      })),
    )
    .slice(0, 24);
  const blockers = mergeDashboardBlockers(
    mergeDashboardBlockers(approvalBlockers, cronBlockers),
    taskBlockers,
  ).slice(0, 32);
  const today: DashboardTodaySnapshot = {
    generatedAtMs: nowMs,
    inProgressTasks: annotatedGlobalItems
      .filter((task) => task.status === "in_progress" || task.status === "review")
      .slice(0, 8),
    scheduledToday: todayCalendar.events,
    blockers,
    recentMemory,
  };

  return {
    snapshot: {
      generatedAtMs: nowMs,
      today,
      tasks: annotatedAllItems,
      workshop: workshop.items,
      workshopSaved: workshop.savedItems,
      calendar: calendarResult.events,
      routines,
      memories: recentMemory,
    },
    tasks: {
      generatedAtMs: nowMs,
      items: annotatedAllItems,
    },
    teamRuns: {
      generatedAtMs: nowMs,
      items: annotatedTeamRuns,
    },
    workshop: {
      generatedAtMs: nowMs,
      items: workshop.items,
      savedItems: workshop.savedItems,
    },
    calendar: calendarResult,
    routines: {
      generatedAtMs: nowMs,
      items: routines,
    },
    memories: {
      generatedAtMs: nowMs,
      entries: recentMemory,
    },
  };
}

export async function collectDashboardSnapshot(
  params: CollectDashboardSnapshotParams,
): Promise<DashboardSnapshot> {
  const dataset = await collectDashboardDataset({
    ...params,
    view: "month",
    anchorAtMs: params.nowMs,
  });
  return dataset.snapshot;
}

export async function collectDashboardToday(
  params: CollectDashboardSnapshotParams,
): Promise<DashboardTodaySnapshot> {
  const dataset = await collectDashboardDataset({
    ...params,
    view: "day",
    anchorAtMs: params.nowMs,
  });
  return dataset.snapshot.today;
}

export async function collectDashboardTasks(
  params: CollectDashboardSnapshotParams,
): Promise<DashboardTasksResult> {
  const dataset = await collectDashboardDataset({
    ...params,
    view: "month",
    anchorAtMs: params.nowMs,
  });
  return dataset.tasks;
}

export async function collectDashboardTeamRuns(
  params: CollectDashboardSnapshotParams,
): Promise<DashboardTeamRunsResult> {
  const dataset = await collectDashboardDataset({
    ...params,
    view: "month",
    anchorAtMs: params.nowMs,
  });
  return dataset.teamRuns;
}

export async function collectDashboardWorkshop(
  params: CollectDashboardSnapshotParams,
): Promise<DashboardWorkshopResult> {
  const dataset = await collectDashboardDataset({
    ...params,
    view: "month",
    anchorAtMs: params.nowMs,
  });
  return dataset.workshop;
}

export async function saveDashboardWorkshop(
  params: CollectDashboardSnapshotParams & {
    itemIds: string[];
    projectName: string;
  },
): Promise<DashboardWorkshopSaveResult> {
  const cfg = params.cfg ?? loadConfig();
  const nowMs = params.nowMs ?? Date.now();
  const project = normalizeDashboardProjectName(params.projectName);
  if (!project.name || !project.key) {
    throw new Error("project name is required");
  }
  const requestedIds = new Set(params.itemIds.map((entry) => normalizeText(entry)).filter(Boolean));
  if (requestedIds.size === 0) {
    throw new Error("select at least one workshop item to save");
  }
  const current = await collectDashboardWorkshop({
    ...params,
    cfg,
    nowMs,
  });
  const selectedItems = current.items.filter((item) => requestedIds.has(item.id));
  if (selectedItems.length === 0) {
    throw new Error("selected workshop items were not found");
  }
  const store = await readDashboardWorkshopStore({ stateDir: params.stateDir });
  const nextSavedById = new Map(store.savedItems.map((record) => [record.id, record]));
  const savedBySourceIdentity = new Map(
    store.savedItems.map((record) => [record.sourceIdentity, record]),
  );
  const nextProjectByWorkspace = { ...store.projectByWorkspace };
  let savedCount = 0;
  let updatedCount = 0;
  const changedWorkspaces = new Set<string>();

  for (const item of selectedItems) {
    const source = await resolveWorkshopSaveSource({
      item,
      stateDir: params.stateDir,
    });
    if (!source.sourcePath) {
      throw new Error(`Could not resolve a readable artifact for "${item.title}".`);
    }
    const existing = savedBySourceIdentity.get(source.sourceIdentity);
    const copied = await copySourceIntoSavedWorkshopStore({
      sourcePath: source.sourcePath,
      id: existing?.id,
      stateDir: params.stateDir,
    });
    if (!copied) {
      throw new Error(`Could not copy the selected artifact for "${item.title}".`);
    }
    if (item.workspaceId) {
      const priorProjectKey = nextProjectByWorkspace[item.workspaceId]?.key;
      nextProjectByWorkspace[item.workspaceId] = {
        name: project.name,
        key: project.key,
        updatedAtMs: nowMs,
      };
      if (priorProjectKey !== project.key) {
        changedWorkspaces.add(item.workspaceId);
      }
    }
    const record: DashboardWorkshopSavedItemRecord = {
      id: copied.id,
      sessionKey: item.sessionKey,
      taskId: item.taskId,
      sourceIdentity: source.sourceIdentity,
      title: item.title,
      summary: item.summary,
      taskTitle: item.taskTitle,
      updatedAtMs: item.updatedAtMs ?? nowMs,
      savedAtMs: existing?.savedAtMs ?? nowMs,
      agentId: item.agentId,
      artifactPath: item.artifactPath,
      embeddable: item.embeddable,
      taskStatus: item.taskStatus,
      taskAssigneeLabel: item.taskAssigneeLabel,
      workspaceId: item.workspaceId,
      workspaceLabel: item.workspaceLabel,
      projectName: project.name,
      projectKey: project.key,
      sourcePreviewUrl: item.previewUrl,
      storedPath: copied.storedPath,
      isDirectory: copied.isDirectory,
      rootFileName: copied.rootFileName,
    };
    nextSavedById.set(record.id, record);
    savedBySourceIdentity.set(source.sourceIdentity, record);
    if (existing) {
      updatedCount += 1;
    } else {
      savedCount += 1;
    }
  }

  const nextSavedItems = Array.from(nextSavedById.values())
    .map((record) => {
      const workspaceProject = record.workspaceId
        ? nextProjectByWorkspace[record.workspaceId]
        : undefined;
      if (!workspaceProject) {
        return record;
      }
      return {
        ...record,
        projectName: workspaceProject.name,
        projectKey: workspaceProject.key,
      };
    })
    .sort((left, right) => (right.updatedAtMs ?? 0) - (left.updatedAtMs ?? 0));

  await writeDashboardWorkshopStore(
    {
      version: 1,
      updatedAtMs: nowMs,
      projectByWorkspace: nextProjectByWorkspace,
      savedItems: nextSavedItems,
    },
    params.stateDir,
  );

  return {
    generatedAtMs: nowMs,
    savedCount,
    updatedCount,
    projectUpdateCount: changedWorkspaces.size,
    workshop: await collectDashboardWorkshop({
      ...params,
      cfg,
      nowMs,
    }),
  };
}

export async function collectDashboardCalendar(
  params: CollectDashboardCalendarParams,
): Promise<DashboardCalendarResult> {
  const dataset = await collectDashboardDataset(params);
  return dataset.calendar;
}

export async function collectDashboardRoutines(
  params: CollectDashboardSnapshotParams,
): Promise<DashboardRoutinesResult> {
  const dataset = await collectDashboardDataset({
    ...params,
    view: "month",
    anchorAtMs: params.nowMs,
  });
  return dataset.routines;
}

export async function collectDashboardMemories(
  params: CollectDashboardSnapshotParams,
): Promise<DashboardMemoriesResult> {
  const dataset = await collectDashboardDataset({
    ...params,
    view: "month",
    anchorAtMs: params.nowMs,
  });
  return dataset.memories;
}

export async function ensureStoredDashboardTeamSnapshots(params?: {
  cfg?: MaumauConfig;
  stateDir?: string;
  nowMs?: number;
  logger?: LoggerLike;
}): Promise<DashboardTeamSnapshotsResult> {
  const cfg = params?.cfg ?? loadConfig();
  const existingStore = await readStoredTeamSnapshotStore({ stateDir: params?.stateDir });
  const existing = existingStore
    ? {
        generatedAtMs: existingStore.generatedAtMs,
        snapshots: existingStore.snapshots,
      }
    : { generatedAtMs: 0, snapshots: [] };
  const fingerprintMatches =
    existingStore?.teamsConfigFingerprint === serializeForChangeCheck(cfg.teams);
  if (
    fingerprintMatches &&
    existing.snapshots.length > 0 &&
    existing.snapshots.every((snapshot) => Array.isArray(snapshot.lifecycleStages))
  ) {
    return existing;
  }
  return await refreshStoredDashboardTeamSnapshots({
    ...params,
    cfg,
  });
}

export function resolveDashboardMemoryEditorFiles(): string[] {
  return [DEFAULT_SOUL_FILENAME, DEFAULT_MEMORY_FILENAME];
}

import { html, nothing } from "lit";
import { formatDurationCompact } from "../../../../src/infra/format-time/format-duration.ts";
import { repeat } from "lit/directives/repeat.js";
import { t } from "../../i18n/index.ts";
import { DEFAULT_MEMORY_FILENAME, DEFAULT_SOUL_FILENAME } from "../agent-workspace-constants.ts";
import { buildExternalLinkRel, EXTERNAL_LINK_TARGET } from "../external-link.ts";
import { formatCost, formatRelativeTimestamp, formatTokens } from "../format.ts";
import { icons } from "../icons.ts";
import {
  DASHBOARD_PAGE_ORDER,
  dashboardPageForTab,
  iconForTab,
  tabForDashboardPage,
  titleForTab,
  type DashboardPage,
  type Tab,
} from "../navigation.ts";
import type {
  AgentsListResult,
  DashboardCalendarResult,
  AttentionItem,
  DashboardCalendarEvent,
  DashboardRecentMemoryEntry,
  DashboardSnapshot,
  DashboardWalletCard,
  DashboardWalletResult,
  DashboardSavedWorkshopItem,
  DashboardTask,
  DashboardTaskFilter,
  DashboardTeamRun,
  DashboardTeamRunsResult,
  DashboardTeamSnapshot,
  DashboardTeamSnapshotsResult,
  ToolsCatalogResult,
  DashboardWorkshopItem,
} from "../types.ts";
import {
  buildAgentContext,
  isAllowedByPolicy,
  matchesList,
  normalizeAgentLabel,
  resolveAgentConfig,
  resolveToolProfile,
  resolveToolSections,
} from "./agents-utils.ts";
import { renderMauOffice } from "./mau-office.ts";

type DashboardProps = {
  tab: Tab;
  loading: boolean;
  error: string | null;
  snapshot: DashboardSnapshot | null;
  walletResult: DashboardWalletResult | null;
  walletStartDate: string;
  walletEndDate: string;
  walletTimeZone: "local" | "utc";
  calendarResult: DashboardCalendarResult | null;
  calendarAnchorAtMs: number | null;
  teamsLoading: boolean;
  teamsError: string | null;
  teamSnapshots: DashboardTeamSnapshotsResult | null;
  teamRunsLoading: boolean;
  teamRunsError: string | null;
  teamRunsResult: DashboardTeamRunsResult | null;
  attentionItems: AttentionItem[];
  basePath: string;
  taskFilter: DashboardTaskFilter;
  taskGroupSelection: string | null;
  doneFromDate: string;
  doneToDate: string;
  workshopSelectedId: string | null;
  workshopTab: "saved" | "recent";
  workshopSelectedIds: Set<string>;
  workshopProjectDraft: string;
  workshopSaving: boolean;
  workshopSaveError: string | null;
  calendarView: "month" | "week" | "day";
  teamSelection: string | null;
  memoryAgentId: string | null;
  agentPanel: "memory" | "scope";
  agentsList: AgentsListResult | null;
  configForm: Record<string, unknown> | null;
  configLoading: boolean;
  agentFilesLoading: boolean;
  agentFilesError: string | null;
  agentFilesList: import("../types.ts").AgentsFilesListResult | null;
  agentFileContents: Record<string, string>;
  agentFileDrafts: Record<string, string>;
  agentFileSaving: boolean;
  toolsCatalogLoading: boolean;
  toolsCatalogError: string | null;
  toolsCatalogResult: ToolsCatalogResult | null;
  mauOfficeLoading: boolean;
  mauOfficeError: string | null;
  mauOfficeState: import("../controllers/mau-office.ts").MauOfficeState;
  mauOfficeChatOpen: boolean;
  mauOfficeChatMinimized: boolean;
  mauOfficeChatActorId: string | null;
  mauOfficeChatActorLabel: string;
  mauOfficeChatSessionKey: string;
  mauOfficeChatLoading: boolean;
  mauOfficeChatSending: boolean;
  mauOfficeChatMessage: string;
  mauOfficeChatMessages: unknown[];
  mauOfficeChatStream: string | null;
  mauOfficeChatStreamStartedAt: number | null;
  mauOfficeChatError: string | null;
  mauOfficeChatPosition: { x: number | null; y: number | null };
  onNavigate: (page: DashboardPage) => void;
  onBackToControl: () => void;
  onRefresh: () => void;
  onRefreshTeams: () => void;
  onOpenTask: (task: DashboardTask) => void;
  onOpenSession: (sessionKey: string) => void;
  onFilterTasks: (filter: DashboardTaskFilter) => void;
  onSelectTaskGroup: (selection: string | null) => void;
  onDoneDateRangeChange: (params: { fromDate?: string; toDate?: string }) => void;
  onSelectWorkshop: (itemId: string) => void;
  onWorkshopTabChange: (tab: "saved" | "recent") => void;
  onToggleWorkshopSelection: (itemId: string, selected: boolean) => void;
  onWorkshopProjectDraftChange: (value: string) => void;
  onSaveWorkshopSelection: () => void;
  onWalletDateRangeChange: (params: { startDate?: string; endDate?: string }) => void;
  onWalletTimeZoneChange: (timeZone: "local" | "utc") => void;
  onWalletPresetSelect: (days: 1 | 7 | 30) => void;
  onCalendarViewChange: (view: "month" | "week" | "day") => void;
  onCalendarNavigate: (direction: -1 | 1) => void;
  onCalendarJumpToday: () => void;
  onCalendarSelectDay: (anchorAtMs: number, view?: "month" | "week" | "day") => void;
  onSelectTeam: (selection: string | null) => void;
  onPromptTeamEdit: (params: {
    teamId: string;
    teamLabel: string;
    workflowId: string;
    workflowLabel: string;
  }) => void;
  onSelectMemoryAgent: (agentId: string) => void;
  onSelectAgentPanel: (panel: "memory" | "scope") => void;
  onMemoryDraftChange: (name: string, content: string) => void;
  onSaveMemoryFile: (name: string) => void;
  onRefreshMauOffice: () => void;
  onMauOfficeRoomFocus: (
    roomId: import("../mau-office-contract.ts").MauOfficeRoomId | "all",
  ) => void;
  onMauOfficeActorOpen: (actorId: string) => void;
  onMauOfficeChatClose: () => void;
  onMauOfficeChatToggleMinimized: () => void;
  onMauOfficeChatDraftChange: (next: string) => void;
  onMauOfficeChatSend: () => void;
  onMauOfficeChatAbort: () => void;
  onMauOfficeChatPositionChange: (position: { x: number; y: number }) => void;
};

const TASK_STATUS_ORDER: DashboardTask["status"][] = [
  "blocked",
  "in_progress",
  "review",
  "done",
  "idle",
];

const CALENDAR_VIEW_LABELS: Record<DashboardProps["calendarView"], string> = {
  month: "calendar.views.month",
  week: "calendar.views.week",
  day: "calendar.views.day",
};

function dt(key: string, params?: Record<string, string>): string {
  return t(`dashboard.${key}`, params);
}

function renderPageToolbar(actions: unknown) {
  if (actions === undefined || actions === null || actions === nothing) {
    return nothing;
  }
  return html`<div class="dashboard-page__actions dashboard-page__toolbar">${actions}</div>`;
}

function renderShellPageActions(props: DashboardProps, page: DashboardPage) {
  switch (page) {
    case "today":
      return html`<button class="btn btn--sm" @click=${props.onRefresh}>${t("common.refresh")}</button>`;
    case "wallet":
      return html`
        ${
          props.walletResult
            ? html`<span class="pill">${formatRelativeTimestamp(props.walletResult.generatedAtMs)}</span>`
            : nothing
        }
        <button class="btn btn--sm" @click=${props.onRefresh}>${t("common.refresh")}</button>
      `;
    case "tasks":
      return html`<button class="btn btn--sm" @click=${props.onRefresh}>${t("common.refresh")}</button>`;
    case "workshop":
      return html`<button class="btn btn--sm" @click=${props.onRefresh}>${t("common.refresh")}</button>`;
    case "routines":
      return html`<button class="btn btn--sm" @click=${props.onRefresh}>${t("common.refresh")}</button>`;
    case "teams":
      return html`
        ${props.teamsLoading ? html`<span class="pill">${dt("shell.refreshing")}</span>` : nothing}
        <button class="btn btn--sm" @click=${props.onRefreshTeams}>${dt("teams.refresh")}</button>
      `;
    case "memories":
      return html`
        <button class="btn btn--sm" @click=${props.onRefresh}>${dt("memories.refreshActivity")}</button>
      `;
    default:
      return nothing;
  }
}

function formatDateTime(value: number | undefined): string {
  if (typeof value !== "number") {
    return t("common.na");
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function formatDayLabel(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(value);
}

function formatDayNumber(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
  }).format(value);
}

function formatMonthLabel(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(value);
}

function formatWeekdayLabel(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
  }).format(value);
}

function formatLongDayLabel(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(value);
}

function formatTimeLabel(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function formatHourLabel(hour: number): string {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
  }).format(date);
}

function isSameDay(left: number, right: number): boolean {
  return startOfDay(left) === startOfDay(right);
}

function isSameMonth(left: number, right: number): boolean {
  const leftDate = new Date(left);
  const rightDate = new Date(right);
  return (
    leftDate.getFullYear() === rightDate.getFullYear() &&
    leftDate.getMonth() === rightDate.getMonth()
  );
}

function resolveCalendarWindow(view: DashboardProps["calendarView"], anchorAtMs: number) {
  const anchorDay = startOfDay(anchorAtMs);
  if (view === "day") {
    return {
      startAtMs: anchorDay,
      endAtMs: anchorDay + 86_400_000,
    };
  }
  if (view === "week") {
    const date = new Date(anchorDay);
    date.setDate(date.getDate() - date.getDay());
    const startAtMs = startOfDay(date.getTime());
    return {
      startAtMs,
      endAtMs: startAtMs + 7 * 86_400_000,
    };
  }
  const monthStart = new Date(anchorDay);
  monthStart.setDate(1);
  const gridStart = new Date(monthStart.getTime());
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());
  const startAtMs = startOfDay(gridStart.getTime());
  return {
    startAtMs,
    endAtMs: startAtMs + 42 * 86_400_000,
  };
}

function resolveCalendarResult(props: DashboardProps): DashboardCalendarResult {
  const requestedAnchorAtMs =
    props.calendarAnchorAtMs ??
    props.calendarResult?.anchorAtMs ??
    props.snapshot?.generatedAtMs ??
    Date.now();
  if (
    props.calendarResult &&
    props.calendarResult.view === props.calendarView &&
    requestedAnchorAtMs >= props.calendarResult.startAtMs &&
    requestedAnchorAtMs < props.calendarResult.endAtMs
  ) {
    return props.calendarResult;
  }
  const window = resolveCalendarWindow(props.calendarView, requestedAnchorAtMs);
  return {
    generatedAtMs: props.snapshot?.generatedAtMs ?? 0,
    anchorAtMs: requestedAnchorAtMs,
    startAtMs: window.startAtMs,
    endAtMs: window.endAtMs,
    view: props.calendarView,
    events: props.snapshot?.calendar ?? [],
  };
}

function formatCalendarRange(calendar: DashboardCalendarResult, anchorAtMs: number): string {
  if (calendar.view === "month") {
    return formatMonthLabel(anchorAtMs);
  }
  if (calendar.view === "day") {
    return formatLongDayLabel(anchorAtMs);
  }
  const end = new Date(calendar.endAtMs - 1);
  return `${formatDayLabel(calendar.startAtMs)} - ${formatDayLabel(end.getTime())}`;
}

function groupCalendarEventsByDay(events: DashboardCalendarEvent[]) {
  const grouped = new Map<number, DashboardCalendarEvent[]>();
  for (const event of events) {
    const day = startOfDay(event.startAtMs);
    const bucket = grouped.get(day) ?? [];
    bucket.push(event);
    grouped.set(day, bucket);
  }
  for (const [day, bucket] of grouped) {
    grouped.set(
      day,
      bucket.toSorted((left, right) => left.startAtMs - right.startAtMs),
    );
  }
  return grouped;
}

function previewLocationLabel(previewUrl: string | undefined): string | null {
  const normalized = previewUrl?.trim();
  if (!normalized) {
    return null;
  }
  if (normalized.startsWith("/")) {
    return dt("workshop.gatewayPreview");
  }
  try {
    const url = new URL(normalized);
    return url.host || url.pathname;
  } catch {
    return normalized;
  }
}

type DashboardWorkshopRenderableItem = DashboardWorkshopItem | DashboardSavedWorkshopItem;

function workshopFrameUrl(item: DashboardWorkshopRenderableItem): string | null {
  const embedUrl = item.embedUrl?.trim();
  if (embedUrl) {
    return embedUrl;
  }
  const normalized = item.previewUrl?.trim();
  if (!normalized) {
    return null;
  }
  if (normalized.startsWith("/")) {
    return normalized;
  }
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const parsed = new URL(normalized, window.location.href);
    if (parsed.origin === window.location.origin) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    return null;
  }
  return null;
}

function workshopArtifactDetail(item: DashboardWorkshopRenderableItem): string | null {
  const artifactPath = item.artifactPath?.trim();
  if (!artifactPath) {
    return null;
  }
  const title = item.title.trim();
  if (normalizeComparableText(artifactPath) === normalizeComparableText(title)) {
    return null;
  }
  return artifactPath;
}

function workshopContextSummary(item: DashboardWorkshopRenderableItem): string {
  return item.summary?.trim() || dt("workshop.defaultSummary");
}

function renderProjectBadge(projectName: string | undefined) {
  const normalized = projectName?.trim();
  if (!normalized) {
    return nothing;
  }
  return html`<span class="pill">${normalized}</span>`;
}

function statusLabel(status: DashboardTask["status"]): string {
  switch (status) {
    case "blocked":
      return dt("status.blocked");
    case "in_progress":
      return dt("status.inProgress");
    case "review":
      return dt("status.review");
    case "done":
      return dt("status.done");
    default:
      return dt("status.waiting");
  }
}

function statusDescription(status: DashboardTask["status"]): string {
  switch (status) {
    case "blocked":
      return dt("statusDescription.blocked");
    case "in_progress":
      return dt("statusDescription.inProgress");
    case "review":
      return dt("statusDescription.review");
    case "done":
      return dt("statusDescription.done");
    default:
      return dt("statusDescription.waiting");
  }
}

function taskTimestampLabel(task: DashboardTask): string {
  if (task.status === "done" && typeof task.endedAtMs === "number") {
    return dt("task.completedAt", { time: formatRelativeTimestamp(task.endedAtMs) });
  }
  if (task.status === "blocked" && typeof task.updatedAtMs === "number") {
    return dt("task.blockedAt", { time: formatRelativeTimestamp(task.updatedAtMs) });
  }
  if (typeof task.updatedAtMs === "number") {
    return formatRelativeTimestamp(task.updatedAtMs);
  }
  return dt("status.waiting");
}

function normalizeComparableText(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function taskContextLine(task: DashboardTask): string {
  const parts = [
    task.assigneeLabel ?? task.agentId ?? dt("task.unassigned"),
    task.teamLabel,
    taskTimestampLabel(task),
  ].filter((part): part is string => Boolean(part?.trim()));
  return parts.join(" · ");
}

function taskSummaryLine(task: DashboardTask): string | null {
  const summary = task.summary?.trim();
  if (!summary) {
    return null;
  }
  const comparableSummary = normalizeComparableText(summary);
  const comparableTitle = normalizeComparableText(task.title);
  if (comparableSummary && comparableSummary === comparableTitle) {
    return null;
  }
  return summary;
}

function renderProgressBar(params: { label?: string; percent?: number; compact?: boolean }) {
  if (typeof params.percent !== "number" || !Number.isFinite(params.percent)) {
    return nothing;
  }
  const clamped = Math.max(0, Math.min(100, params.percent));
  return html`
    <div class="dashboard-progress ${params.compact ? "dashboard-progress--compact" : ""}">
      <div class="dashboard-progress__track" aria-hidden="true">
        <div class="dashboard-progress__fill" style=${`width:${clamped}%`}></div>
      </div>
      ${params.label ? html`<div class="dashboard-progress__label">${params.label}</div>` : nothing}
    </div>
  `;
}

function calendarKindLabel(kind: DashboardCalendarEvent["kind"]): string {
  switch (kind) {
    case "routine_occurrence":
      return dt("calendar.kind.routine");
    case "approval_needed":
      return dt("calendar.kind.approval");
    case "known_activity":
      return dt("calendar.kind.activity");
    default:
      return dt("calendar.kind.reminder");
  }
}

function resolveTaskList(
  snapshot: DashboardSnapshot | null,
  filter: DashboardTaskFilter,
): DashboardTask[] {
  const tasks = snapshot?.tasks ?? [];
  if (!filter) {
    return tasks;
  }
  if (filter.kind === "project") {
    return tasks.filter((task) => task.projectKey === filter.value);
  }
  const matchedSessionKeys = new Set(
    tasks
      .filter((task) => task.id === filter.value || task.sessionKey === filter.value)
      .map((task) => task.sessionKey),
  );
  if (matchedSessionKeys.size > 0) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const task of tasks) {
        if (
          task.parentSessionKey &&
          matchedSessionKeys.has(task.parentSessionKey) &&
          !matchedSessionKeys.has(task.sessionKey)
        ) {
          matchedSessionKeys.add(task.sessionKey);
          changed = true;
        }
      }
    }
    return tasks.filter(
      (task) =>
        task.id === filter.value ||
        task.sessionKey === filter.value ||
        matchedSessionKeys.has(task.sessionKey),
    );
  }
  return tasks.filter(
    (task) =>
      task.id === filter.value ||
      task.sessionKey === filter.value ||
      task.parentSessionKey === filter.value ||
      task.childSessionKeys?.includes(filter.value),
  );
}

function resolveProjectOptions(
  snapshot: DashboardSnapshot | null,
): Array<{ key: string; name: string }> {
  const options = new Map<string, string>();
  for (const item of [
    ...(snapshot?.tasks ?? []),
    ...(snapshot?.workshop ?? []),
    ...(snapshot?.workshopSaved ?? []),
  ]) {
    if (item.projectKey && item.projectName && !options.has(item.projectKey)) {
      options.set(item.projectKey, item.projectName);
    }
  }
  return [...options.entries()]
    .map(([key, name]) => ({ key, name }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function parseDateInputStart(value: string): number | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isFinite(parsed.getTime()) ? parsed.getTime() : null;
}

function parseDateInputEnd(value: string): number | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(`${value}T23:59:59.999`);
  return Number.isFinite(parsed.getTime()) ? parsed.getTime() : null;
}

function taskCompletedWithinRange(task: DashboardTask, fromDate: string, toDate: string): boolean {
  const completedAt = task.endedAtMs ?? task.updatedAtMs ?? task.createdAtMs;
  const start = parseDateInputStart(fromDate);
  const end = parseDateInputEnd(toDate);
  if (start != null && completedAt < start) {
    return false;
  }
  if (end != null && completedAt > end) {
    return false;
  }
  return true;
}

function groupTasks(tasks: DashboardTask[], doneFromDate: string, doneToDate: string) {
  return TASK_STATUS_ORDER.map((status) => ({
    status,
    tasks: tasks.filter(
      (task) =>
        task.status === status &&
        (status !== "done" || taskCompletedWithinRange(task, doneFromDate, doneToDate)),
    ),
  }));
}

function resolveMemoryAgentList(agentsList: AgentsListResult | null) {
  return agentsList?.agents ?? [];
}

function selectionKeyForTeam(snapshot: DashboardTeamSnapshot): string {
  return `${snapshot.teamId}:${snapshot.workflowId}`;
}

type DashboardLifecycleStageLike = NonNullable<DashboardTeamSnapshot["lifecycleStages"]>[number];
const DISPLAY_DONE_STAGE_ID = "done";

type DashboardTaskGroup = {
  key: string;
  kind: "main" | "team";
  title: string;
  subtitle?: string;
  tasks: DashboardTask[];
  lifecycleStages: DashboardLifecycleStageLike[];
  runs: DashboardTeamRun[];
};

function resolveDisplayLifecycleStages(
  stages: DashboardLifecycleStageLike[],
): DashboardLifecycleStageLike[] {
  const hasDoneStage = stages.some(
    (stage) => stage.id.trim().toLowerCase() === DISPLAY_DONE_STAGE_ID,
  );
  if (hasDoneStage) {
    return stages;
  }
  return [
    ...stages,
    {
      id: DISPLAY_DONE_STAGE_ID,
      name: statusLabel("done"),
      status: "done",
      roles: [],
    },
  ];
}

function resolveTaskGroupKey(
  task: Pick<DashboardTask, "teamId" | "teamWorkflowId">,
  snapshots: DashboardTeamSnapshot[],
): string {
  const teamId = task.teamId?.trim();
  const workflowId = task.teamWorkflowId?.trim();
  if (teamId && workflowId) {
    return `${teamId}:${workflowId}`;
  }
  if (teamId) {
    const matchingSnapshots = snapshots.filter((snapshot) => snapshot.teamId === teamId);
    if (matchingSnapshots.length === 1) {
      return selectionKeyForTeam(matchingSnapshots[0]);
    }
    return `${teamId}:default`;
  }
  return "team:default";
}

function compareTaskGroups(a: DashboardTaskGroup, b: DashboardTaskGroup): number {
  if (a.kind !== b.kind) {
    return a.kind === "main" ? -1 : 1;
  }
  return a.title.localeCompare(b.title);
}

function compareTeamRunsByFreshness(a: DashboardTeamRun, b: DashboardTeamRun): number {
  return (b.updatedAtMs ?? 0) - (a.updatedAtMs ?? 0);
}

function shouldShowStandaloneTeamTaskGroup(snapshot: DashboardTeamSnapshot): boolean {
  const normalizedTeamId = snapshot.teamId.trim().toLowerCase();
  const normalizedTeamName = (snapshot.teamName ?? "").trim().toLowerCase();
  return normalizedTeamId !== "main" && normalizedTeamName !== "main orchestration";
}

function resolveTaskGroups(props: DashboardProps, tasks: DashboardTask[]): DashboardTaskGroup[] {
  const teamSnapshots = props.teamSnapshots?.snapshots ?? [];
  const snapshotsByKey = new Map(
    teamSnapshots.map((snapshot) => [selectionKeyForTeam(snapshot), snapshot]),
  );
  const teamRunsByKey = new Map<string, DashboardTeamRun[]>();
  for (const run of props.teamRunsResult?.items ?? []) {
    const key = `${run.teamId}:${run.workflowId}`;
    const bucket = teamRunsByKey.get(key) ?? [];
    bucket.push(run);
    teamRunsByKey.set(key, bucket);
  }

  const groups: DashboardTaskGroup[] = [
    {
      key: "main",
      kind: "main",
      title: dt("tasks.mainSectionTitle"),
      subtitle: dt("tasks.mainSectionSubtitle"),
      tasks: tasks.filter((task) => task.visibilityScope !== "team_detail"),
      lifecycleStages: [],
      runs: [],
    },
  ];
  const teamTasksByKey = new Map<string, DashboardTask[]>();
  for (const task of tasks) {
    if (task.visibilityScope !== "team_detail") {
      continue;
    }
    const key = resolveTaskGroupKey(task, teamSnapshots);
    const bucket = teamTasksByKey.get(key) ?? [];
    bucket.push(task);
    teamTasksByKey.set(key, bucket);
  }

  for (const [key, groupTasks] of teamTasksByKey) {
    const snapshot = snapshotsByKey.get(key);
    const sample = groupTasks[0];
    const teamName = snapshot?.teamName ?? sample?.teamLabel ?? sample?.teamId ?? "Team";
    const workflowName =
      snapshot?.workflowName ?? sample?.teamWorkflowLabel ?? sample?.teamWorkflowId;
    groups.push({
      key,
      kind: "team",
      title: dt("tasks.teamSectionTitle", { team: teamName }),
      subtitle: workflowName,
      tasks: groupTasks,
      lifecycleStages: snapshot?.lifecycleStages ?? [],
      runs: (teamRunsByKey.get(key) ?? []).slice().sort(compareTeamRunsByFreshness),
    });
  }

  const knownGroupKeys = new Set(groups.map((group) => group.key));
  for (const snapshot of teamSnapshots) {
    const key = selectionKeyForTeam(snapshot);
    if (knownGroupKeys.has(key) || !shouldShowStandaloneTeamTaskGroup(snapshot)) {
      continue;
    }
    groups.push({
      key,
      kind: "team",
      title: dt("tasks.teamSectionTitle", { team: snapshot.teamName ?? snapshot.teamId }),
      subtitle: snapshot.workflowName ?? snapshot.workflowId,
      tasks: [],
      lifecycleStages: snapshot.lifecycleStages ?? [],
      runs: (teamRunsByKey.get(key) ?? []).slice().sort(compareTeamRunsByFreshness),
    });
    knownGroupKeys.add(key);
  }

  return groups.toSorted(compareTaskGroups);
}

function nodeTargetsSelectedTeam(nodeId: string, teamId: string): boolean {
  return nodeId.endsWith(`:team:${teamId}`);
}

type DashboardTeamNodeLike = DashboardTeamSnapshot["nodes"][number];
type DashboardTeamEdgeLike = DashboardTeamSnapshot["edges"][number];
type DashboardTeamStage = NonNullable<DashboardTeamNodeLike["stage"]>;

function normalizeTeamRoleLabel(value: string | undefined): string {
  return value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
}

function inferDashboardTeamNodeStage(
  node: DashboardTeamNodeLike,
  reviewEdges: DashboardTeamEdgeLike[],
): DashboardTeamStage {
  if (node.stage) {
    return node.stage;
  }
  if (node.kind === "manager") {
    return "manager";
  }
  if (node.kind === "linked_team" || node.kind === "linked_agent") {
    return "support";
  }
  const normalizedRole = normalizeTeamRoleLabel(node.role);
  if (reviewEdges.some((edge) => edge.from === node.id)) {
    return "qa";
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

function stageOrderForTeam(stage: DashboardTeamStage): number {
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

function compareDashboardTeamNodes(a: DashboardTeamNodeLike, b: DashboardTeamNodeLike): number {
  const orderDelta =
    (a.stageIndex ?? stageOrderForTeam(a.stage ?? "support")) -
    (b.stageIndex ?? stageOrderForTeam(b.stage ?? "support"));
  if (orderDelta !== 0) {
    return orderDelta;
  }
  const roleDelta = normalizeTeamRoleLabel(a.role).localeCompare(normalizeTeamRoleLabel(b.role));
  if (roleDelta !== 0) {
    return roleDelta;
  }
  return a.label.localeCompare(b.label);
}

function stageTitleForTeam(stage: DashboardTeamStage): string {
  switch (stage) {
    case "upstream":
      return dt("teams.stage.upstream");
    case "manager":
      return dt("teams.stage.manager");
    case "architecture":
      return dt("teams.stage.architecture");
    case "execution":
      return dt("teams.stage.execution");
    case "qa":
      return dt("teams.stage.qa");
    case "support":
    default:
      return dt("teams.stage.support");
  }
}

function stageDescriptionForTeam(stage: DashboardTeamStage): string {
  switch (stage) {
    case "upstream":
      return dt("teams.stageDescription.upstream");
    case "architecture":
      return dt("teams.stageDescription.architecture");
    case "execution":
      return dt("teams.stageDescription.execution");
    case "qa":
      return dt("teams.stageDescription.qa");
    case "support":
      return dt("teams.stageDescription.support");
    case "manager":
    default:
      return "";
  }
}

function compareDashboardTeamRunItems(a: DashboardTask, b: DashboardTask): number {
  const aIsManager = normalizeTeamRoleLabel(a.teamRole) === "manager";
  const bIsManager = normalizeTeamRoleLabel(b.teamRole) === "manager";
  if (aIsManager !== bIsManager) {
    return aIsManager ? -1 : 1;
  }
  const updatedDelta = (b.updatedAtMs ?? 0) - (a.updatedAtMs ?? 0);
  if (updatedDelta !== 0) {
    return updatedDelta;
  }
  return a.title.localeCompare(b.title);
}

function teamRunRootTaskTitle(
  run: DashboardTeamRun,
  snapshot: DashboardSnapshot | null,
): string | undefined {
  if (!run.rootTaskId) {
    return undefined;
  }
  return snapshot?.tasks.find((task) => task.id === run.rootTaskId)?.title;
}

function renderTeamRunCard(props: DashboardProps, run: DashboardTeamRun) {
  const rootTaskTitle = teamRunRootTaskTitle(run, props.snapshot);
  const items = run.items.slice().sort(compareDashboardTeamRunItems);
  return html`
    <article class="dashboard-task dashboard-team-run">
      <div class="dashboard-task__header">
        <div class="dashboard-task__header-copy">
          <div class="dashboard-task__eyebrow">${run.workflowName ?? run.workflowId}</div>
          <div class="dashboard-task__title">${run.title}</div>
          <div class="dashboard-task__meta">
            <span>${statusLabel(run.status)}</span>
            ${
              run.updatedAtMs
                ? html`<span>${dt("teams.updated", { time: formatRelativeTimestamp(run.updatedAtMs) })}</span>`
                : nothing
            }
            ${
              rootTaskTitle ? html`<span>${dt("teams.rootTask")}: ${rootTaskTitle}</span>` : nothing
            }
          </div>
        </div>
        <div class="dashboard-task__signals">
          ${
            run.currentStageLabel
              ? html`<span class="dashboard-task__signal">${dt("teams.currentStage")}: ${run.currentStageLabel}</span>`
              : nothing
          }
          <span class="dashboard-task__signal">
            ${dt("teams.roleTaskCount", { count: String(items.length) })}
          </span>
          ${
            run.blockerLinks.length > 0
              ? html`
                <span class="dashboard-task__signal dashboard-task__signal--warn">
                  ${run.blockerLinks.length} ${dt("teams.blockers")}
                </span>
              `
              : nothing
          }
        </div>
      </div>
      ${run.summary ? html`<div class="dashboard-task__summary">${run.summary}</div>` : nothing}
      ${renderProgressBar({
        label: run.progressLabel,
        percent: run.progressPercent,
      })}
      ${
        run.blockerLinks.length > 0
          ? html`
            <div class="dashboard-team-run__blockers">
              <div class="dashboard-org-chart__label">${dt("teams.blockers")}</div>
              ${renderBlockerCards(props, run.blockerLinks.map(taskBlockerToRenderable))}
            </div>
          `
          : nothing
      }
      <div class="dashboard-team-run__items">
        <div class="dashboard-org-chart__label">${dt("teams.roleTasks")}</div>
        <div class="dashboard-team-run__items-grid">
          ${items.map((item) => {
            const summary = taskSummaryLine(item);
            return html`
              <article class="dashboard-note dashboard-team-run__item">
                <div class="dashboard-team-run__item-head">
                  <div>
                    <div class="dashboard-org-chart__label">
                      ${item.teamRole ?? item.assigneeLabel ?? item.agentId ?? dt("task.unassigned")}
                    </div>
                    <div class="dashboard-note__title">${item.title}</div>
                  </div>
                  <span class="pill">${statusLabel(item.status)}</span>
                </div>
                <div class="dashboard-note__meta">
                  <span>${item.assigneeLabel ?? item.agentId ?? dt("task.unassigned")}</span>
                  ${item.currentStageLabel ? html`<span>${item.currentStageLabel}</span>` : nothing}
                  <span>${taskTimestampLabel(item)}</span>
                </div>
                ${summary ? html`<div class="dashboard-note__body">${summary}</div>` : nothing}
                ${renderProgressBar({
                  label: item.progressLabel,
                  percent: item.progressPercent,
                  compact: true,
                })}
              </article>
            `;
          })}
        </div>
      </div>
    </article>
  `;
}

function renderDashboardNav(props: DashboardProps, page: DashboardPage) {
  return html`
    <nav class="dashboard-rail" aria-label=${dt("nav.ariaLabel")}>
      ${repeat(
        DASHBOARD_PAGE_ORDER,
        (entry) => entry,
        (entry) => {
          const tab = tabForDashboardPage(entry);
          const active = entry === page;
          return html`
            <button
              type="button"
              class="dashboard-rail__item ${active ? "dashboard-rail__item--active" : ""}"
              @click=${() => props.onNavigate(entry)}
              aria-current=${active ? "page" : "false"}
              title=${titleForTab(tab)}
            >
              <span class="dashboard-rail__icon" aria-hidden="true">${icons[iconForTab(tab)]}</span>
              <span class="dashboard-rail__label">${titleForTab(tab)}</span>
            </button>
          `;
        },
      )}
    </nav>
  `;
}

type DashboardRenderableBlocker = {
  id: string;
  title: string;
  description: string;
  suggestion?: string;
  severity: "error" | "warning" | "info";
  sessionKey?: string;
  taskId?: string;
  jobId?: string;
};

function taskBlockerSeverity(
  blocker: DashboardTask["blockerLinks"][number],
): DashboardRenderableBlocker["severity"] {
  return blocker.kind === "approval" ? "warning" : "error";
}

function taskBlockerToRenderable(
  blocker: DashboardTask["blockerLinks"][number],
): DashboardRenderableBlocker {
  return {
    id: blocker.id,
    title: blocker.title,
    description: blocker.description,
    suggestion: blocker.suggestion,
    severity: taskBlockerSeverity(blocker),
    sessionKey: blocker.sessionKey,
  };
}

function resolveBlockerAction(
  props: DashboardProps,
  blocker: DashboardRenderableBlocker,
): { label: string; onClick: () => void } | null {
  if (blocker.sessionKey) {
    return {
      label: dt("blockers.openSession"),
      onClick: () => props.onOpenSession(blocker.sessionKey!),
    };
  }
  if (blocker.taskId) {
    return {
      label: dt("blockers.openTask"),
      onClick: () => props.onFilterTasks({ kind: "task", value: blocker.taskId! }),
    };
  }
  if (blocker.jobId) {
    return {
      label: dt("blockers.openRoutines"),
      onClick: () => props.onNavigate("routines"),
    };
  }
  return null;
}

function renderBlockerCards(props: DashboardProps, blockers: DashboardRenderableBlocker[]) {
  return html`
    <div class="dashboard-blocker-stack">
      ${blockers.map((blocker) => {
        const action = resolveBlockerAction(props, blocker);
        return html`
          <article class="dashboard-note dashboard-note--${blocker.severity} dashboard-blocker-card">
            <div class="dashboard-note__title">${blocker.title}</div>
            <div class="dashboard-note__body">${blocker.description}</div>
            ${
              blocker.suggestion
                ? html`
                    <div class="dashboard-blocker-card__suggestion">
                      <div class="dashboard-blocker-card__label">${dt("blockers.nextStep")}</div>
                      <div class="dashboard-note__body">${blocker.suggestion}</div>
                    </div>
                  `
                : nothing
            }
            ${
              action
                ? html`
                    <div class="dashboard-blocker-card__actions">
                      <button type="button" class="btn btn--sm" @click=${action.onClick}>
                        ${action.label}
                      </button>
                    </div>
                  `
                : nothing
            }
          </article>
        `;
      })}
    </div>
  `;
}

function renderBlockerList(props: DashboardProps) {
  const blockers = props.snapshot?.today.blockers ?? [];
  const attention = props.attentionItems.map((item) => ({
    id: `attention:${item.title}`,
    severity: item.severity,
    title: item.title,
    description: item.description,
  }));
  const combined = [...blockers, ...attention].slice(0, 12);
  if (combined.length === 0) {
    return html`<div class="dashboard-empty">${dt("today.blockersEmpty")}</div>`;
  }
  return renderBlockerCards(props, combined);
}

function renderMemoryActivity(entries: DashboardRecentMemoryEntry[]) {
  if (entries.length === 0) {
    return html`<div class="dashboard-empty">${dt("today.memoryEmpty")}</div>`;
  }
  return html`
    <div class="dashboard-list">
      ${entries.map(
        (entry) => html`
          <article class="dashboard-note">
            <div class="dashboard-note__title">${entry.title}</div>
            <div class="dashboard-note__meta">
              <span>${entry.agentId}</span>
              <span>${formatRelativeTimestamp(entry.updatedAtMs)}</span>
            </div>
            ${entry.excerpt ? html`<div class="dashboard-note__body">${entry.excerpt}</div>` : nothing}
          </article>
        `,
      )}
    </div>
  `;
}

function renderDashboardAgentTabs(
  active: DashboardProps["agentPanel"],
  onSelect: DashboardProps["onSelectAgentPanel"],
) {
  const tabs: Array<{ id: DashboardProps["agentPanel"]; label: string }> = [
    { id: "memory", label: "Memory" },
    { id: "scope", label: "Scope" },
  ];
  return html`
    <div class="agent-tabs">
      ${tabs.map(
        (tab) => html`
          <button
            type="button"
            class="agent-tab ${active === tab.id ? "active" : ""}"
            @click=${() => onSelect(tab.id)}
          >
            ${tab.label}
          </button>
        `,
      )}
    </div>
  `;
}

function renderDashboardAgentRules(label: string, values: string[] | null, empty: string) {
  return html`
    <div class="dashboard-agent-scope__rule">
      <div class="dashboard-org-chart__label">${label}</div>
      ${
        values && values.length > 0
          ? html`
              <div class="chip-row" style="margin-top: 8px;">
                ${values.map((value) => html`<span class="chip mono">${value}</span>`)}
              </div>
            `
          : html`<div class="muted" style="margin-top: 8px;">${empty}</div>`
      }
    </div>
  `;
}

function renderDashboardAgentScope(
  props: DashboardProps,
  selectedAgent: AgentsListResult["agents"][number] | null,
  agentId: string | null,
) {
  if (!selectedAgent || !agentId) {
    return html`<div class="dashboard-empty">Select an agent to inspect its scope.</div>`;
  }
  const defaultId = props.agentsList?.defaultId ?? null;
  const context = buildAgentContext(
    selectedAgent,
    props.configForm,
    props.agentFilesList,
    defaultId,
  );
  const config = resolveAgentConfig(props.configForm, agentId);
  const skillAllowlist = Array.isArray(config.entry?.skills)
    ? config.entry.skills.map((entry) => entry.trim()).filter(Boolean)
    : null;
  const agentTools = config.entry?.tools ?? {};
  const globalTools = config.globalTools ?? {};
  const explicitAllowlist =
    Array.isArray(agentTools.allow) && agentTools.allow.length > 0
      ? agentTools.allow.map((entry) => entry.trim()).filter(Boolean)
      : null;
  const alsoAllow = explicitAllowlist
    ? []
    : Array.isArray(agentTools.alsoAllow)
      ? agentTools.alsoAllow.map((entry) => entry.trim()).filter(Boolean)
      : [];
  const deny = explicitAllowlist
    ? []
    : Array.isArray(agentTools.deny)
      ? agentTools.deny.map((entry) => entry.trim()).filter(Boolean)
      : [];
  const profile = agentTools.profile ?? globalTools.profile ?? "full";
  const profileSource = agentTools.profile
    ? "agent override"
    : globalTools.profile
      ? "global default"
      : "default";
  const basePolicy = explicitAllowlist
    ? { allow: explicitAllowlist, deny: Array.isArray(agentTools.deny) ? agentTools.deny : [] }
    : (resolveToolProfile(profile) ?? undefined);
  const runtimeCatalog =
    props.toolsCatalogResult?.agentId === agentId ? props.toolsCatalogResult : null;
  const toolGroups = resolveToolSections(runtimeCatalog).map((section) => {
    const tools = section.tools.map((tool) => {
      const baseAllowed = isAllowedByPolicy(tool.id, basePolicy);
      const extraAllowed = matchesList(tool.id, alsoAllow);
      const denied = matchesList(tool.id, deny);
      const allowed = (baseAllowed || extraAllowed) && !denied;
      return { tool, allowed };
    });
    return {
      ...section,
      tools,
      enabledCount: tools.filter((entry) => entry.allowed).length,
    };
  });
  const totalTools = toolGroups.reduce((sum, group) => sum + group.tools.length, 0);
  const enabledTools = toolGroups.reduce((sum, group) => sum + group.enabledCount, 0);

  return html`
    <div class="dashboard-agent-scope">
      <section class="card">
        <div class="card-title">Agent Context</div>
        <div class="card-sub">Workspace, model, identity, and default routing for this agent.</div>
        <div class="agents-overview-grid" style="margin-top: 16px;">
          <div class="agent-kv">
            <div class="label">Label</div>
            <div>${normalizeAgentLabel(selectedAgent)}</div>
          </div>
          <div class="agent-kv">
            <div class="label">Workspace</div>
            <div class="mono">${context.workspace}</div>
          </div>
          <div class="agent-kv">
            <div class="label">Primary Model</div>
            <div class="mono">${context.model}</div>
          </div>
          <div class="agent-kv">
            <div class="label">Identity</div>
            <div>${context.identityName}</div>
          </div>
          <div class="agent-kv">
            <div class="label">Skills</div>
            <div>${context.skillsLabel}</div>
          </div>
          <div class="agent-kv">
            <div class="label">Default</div>
            <div>${context.isDefault ? "yes" : "no"}</div>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-title">Skills Filter</div>
        <div class="card-sub">Per-agent skill allowlist and inherited defaults.</div>
        ${
          skillAllowlist && skillAllowlist.length > 0
            ? html`
                <div class="chip-row" style="margin-top: 12px;">
                  ${skillAllowlist.map((skill) => html`<span class="chip mono">${skill}</span>`)}
                </div>
              `
            : html`<div class="muted" style="margin-top: 12px;">All skills are enabled for this agent.</div>`
        }
      </section>

      <section class="card">
        <div class="row" style="justify-content: space-between; gap: 12px; flex-wrap: wrap;">
          <div>
            <div class="card-title">Tool Access</div>
            <div class="card-sub">Live tool groups plus config-driven allow and deny rules.</div>
          </div>
          <div class="chip-row">
            <span class="chip mono">${enabledTools}/${totalTools} enabled</span>
            <span class="chip mono">profile:${profile}</span>
            <span class="chip">${profileSource}</span>
          </div>
        </div>
        ${
          props.configLoading && !props.configForm
            ? html`<div class="callout info" style="margin-top: 12px;">Loading gateway config…</div>`
            : nothing
        }
        ${
          !props.configLoading && !props.configForm
            ? html`
                <div class="callout info" style="margin-top: 12px;">
                  Gateway config is unavailable, so this scope view is using runtime defaults only.
                </div>
              `
            : nothing
        }
        ${
          props.toolsCatalogLoading && !runtimeCatalog
            ? html`
                <div class="callout info" style="margin-top: 12px;">Loading runtime tool catalog…</div>
              `
            : nothing
        }
        ${
          props.toolsCatalogError
            ? html`
                <div class="callout info" style="margin-top: 12px;">
                  Tool catalog unavailable. Showing the fallback tool groups instead.
                </div>
              `
            : nothing
        }
        <div class="dashboard-agent-scope__rules">
          ${renderDashboardAgentRules(
            "Explicit allowlist",
            explicitAllowlist,
            "No per-agent tools.allow override.",
          )}
          ${renderDashboardAgentRules("Also allow", alsoAllow, "No extra allow rules.")}
          ${renderDashboardAgentRules("Denied", deny, "No deny rules.")}
        </div>
        <div class="dashboard-agent-scope__groups">
          ${toolGroups.map(
            (group) => html`
              <article class="dashboard-agent-scope__group">
                <div class="row" style="justify-content: space-between; gap: 12px; flex-wrap: wrap;">
                  <div>
                    <div class="card-title">${group.label}</div>
                    <div class="card-sub">${group.enabledCount}/${group.tools.length} enabled</div>
                  </div>
                  ${
                    group.pluginId ? html`<span class="pill mono">${group.pluginId}</span>` : nothing
                  }
                </div>
                <div class="chip-row" style="margin-top: 12px;">
                  ${group.tools.map(
                    (entry) => html`
                      <span class="pill ${entry.allowed ? "" : "danger"}">${entry.tool.label}</span>
                    `,
                  )}
                </div>
              </article>
            `,
          )}
        </div>
      </section>
    </div>
  `;
}

function formatWalletTotal(card: DashboardWalletCard): string {
  if (card.totalUnit === "usd") {
    return formatCost(card.totalValue);
  }
  if (card.totalUnit === "duration_ms") {
    return formatDurationCompact(card.totalValue, { spaced: true }) ?? "0s";
  }
  return new Intl.NumberFormat().format(Math.round(card.totalValue));
}

function walletCardTitle(card: DashboardWalletCard): string {
  switch (card.id) {
    case "llm":
      return "LLM";
    case "twilio":
      return "Twilio";
    case "deepgram-realtime":
      return "Deepgram Realtime";
    case "deepgram-audio":
      return "Deepgram Audio";
    case "elevenlabs":
      return "ElevenLabs";
  }
}

function formatWalletBadge(card: DashboardWalletCard): string {
  const measurement = card.measurement === "exact" ? "Exact" : "Derived";
  const coverage = card.coverage === "full" ? "Full" : "Partial";
  return `${measurement} • ${coverage}`;
}

function renderWalletPage(props: DashboardProps) {
  const presets: Array<{ label: string; days: 1 | 7 | 30 }> = [
    { label: t("usage.presets.today"), days: 1 },
    { label: t("usage.presets.last7d"), days: 7 },
    { label: t("usage.presets.last30d"), days: 30 },
  ];
  const cards = props.walletResult?.cards ?? [];
  const content =
    props.loading && !props.walletResult
      ? html`
        <section class="card dashboard-wallet-card">
          <div class="card-title">${t("usage.loading.title")}</div>
          <div class="card-sub">${t("dashboard.shell.loadingSubtitle")}</div>
        </section>
      `
      : cards.length === 0
        ? html`
          <section class="card dashboard-wallet-card">
            <div class="card-title">${t("usage.empty.title")}</div>
            <div class="card-sub">${t("usage.empty.subtitle")}</div>
          </section>
        `
        : html`
          <section class="dashboard-wallet-grid">
            ${cards.map(
              (card) => html`
                <article class="card dashboard-wallet-card">
                  <div class="dashboard-wallet-card__header">
                    <div>
                      <div class="card-title">${walletCardTitle(card)}</div>
                      <div class="card-sub">${card.totalLabel} • ${card.recordLabel}</div>
                    </div>
                    <span class="pill">${formatWalletBadge(card)}</span>
                  </div>
                  <div class="dashboard-wallet-card__value">${formatWalletTotal(card)}</div>
                  <div class="dashboard-wallet-card__records">
                    ${new Intl.NumberFormat().format(card.records)} ${card.recordLabel.toLowerCase()}
                  </div>
                  ${
                    card.secondaryUnit === "tokens" && typeof card.secondaryValue === "number"
                      ? html`
                        <div class="dashboard-wallet-card__secondary">
                          ${card.secondaryLabel ?? "Tokens"}: ${formatTokens(card.secondaryValue)}
                        </div>
                      `
                      : nothing
                  }
                  ${
                    card.note
                      ? html`<div class="dashboard-wallet-card__note">${card.note}</div>`
                      : nothing
                  }
                </article>
              `,
            )}
          </section>
        `;

  return html`
    <section class="dashboard-page">
      <section class="card dashboard-wallet-controls">
        <div class="dashboard-wallet-controls__presets">
          ${presets.map(
            (preset) => html`
              <button
                type="button"
                class="btn btn--sm"
                @click=${() => props.onWalletPresetSelect(preset.days)}
              >
                ${preset.label}
              </button>
            `,
          )}
        </div>
        <div class="dashboard-wallet-controls__range">
          <label class="dashboard-wallet-controls__field">
            <span>${t("usage.filters.startDate")}</span>
            <input
              class="input"
              type="date"
              .value=${props.walletStartDate}
              @input=${(event: Event) =>
                props.onWalletDateRangeChange({
                  startDate: (event.target as HTMLInputElement).value,
                })}
            />
          </label>
          <label class="dashboard-wallet-controls__field">
            <span>${t("usage.filters.endDate")}</span>
            <input
              class="input"
              type="date"
              .value=${props.walletEndDate}
              @input=${(event: Event) =>
                props.onWalletDateRangeChange({
                  endDate: (event.target as HTMLInputElement).value,
                })}
            />
          </label>
          <div class="dashboard-wallet-controls__field">
            <span>${t("usage.filters.timeZone")}</span>
            <div class="dashboard-wallet-controls__timezones">
              <button
                type="button"
                class="btn btn--sm ${props.walletTimeZone === "local" ? "primary" : ""}"
                @click=${() => props.onWalletTimeZoneChange("local")}
              >
                ${t("usage.filters.timeZoneLocal")}
              </button>
              <button
                type="button"
                class="btn btn--sm ${props.walletTimeZone === "utc" ? "primary" : ""}"
                @click=${() => props.onWalletTimeZoneChange("utc")}
              >
                ${t("usage.filters.timeZoneUtc")}
              </button>
            </div>
          </div>
        </div>
      </section>

      ${content}
    </section>
  `;
}

function renderTodayPage(props: DashboardProps) {
  const today = props.snapshot?.today;
  return html`
    <section class="dashboard-page">
      <div class="dashboard-grid dashboard-grid--today">
        <section class="card">
          <div class="card-title">${dt("today.inProgressTitle")}</div>
          <div class="card-sub">${dt("today.inProgressSubtitle")}</div>
          <div class="dashboard-list">
            ${(today?.inProgressTasks ?? []).map(
              (task) => html`
                <article class="dashboard-task">
                  <div class="dashboard-task__header">
                    <div>
                      <div class="dashboard-task__title">${task.title}</div>
                      <div class="dashboard-task__meta">
                        <span>${task.assigneeLabel ?? task.agentId ?? dt("task.unassigned")}</span>
                        <span>${statusLabel(task.status)}</span>
                      </div>
                    </div>
                    <button class="btn btn--sm" @click=${() => props.onOpenTask(task)}>
                      ${dt("today.open")}
                    </button>
                  </div>
                  ${task.summary ? html`<div class="dashboard-task__summary">${task.summary}</div>` : nothing}
                  ${renderProgressBar({
                    label: task.progressLabel,
                    percent: task.progressPercent,
                    compact: true,
                  })}
                </article>
              `,
            )}
            ${
              (today?.inProgressTasks?.length ?? 0) === 0
                ? html`<div class="dashboard-empty">${dt("today.inProgressEmpty")}</div>`
                : nothing
            }
          </div>
        </section>

        <section class="card">
          <div class="card-title">${dt("today.scheduledTitle")}</div>
          <div class="card-sub">${dt("today.scheduledSubtitle")}</div>
          <div class="dashboard-list">
            ${(today?.scheduledToday ?? []).map(
              (event) => html`
                <article class="dashboard-note">
                  <div class="dashboard-note__title">${event.title}</div>
                  <div class="dashboard-note__meta">
                    <span>${calendarKindLabel(event.kind)}</span>
                    <span>${formatDateTime(event.startAtMs)}</span>
                  </div>
                  ${event.description ? html`<div class="dashboard-note__body">${event.description}</div>` : nothing}
                </article>
              `,
            )}
            ${
              (today?.scheduledToday?.length ?? 0) === 0
                ? html`<div class="dashboard-empty">${dt("today.scheduledEmpty")}</div>`
                : nothing
            }
          </div>
        </section>
        <section class="card">
          <div class="card-title">${dt("today.blockersTitle")}</div>
          <div class="card-sub">${dt("today.blockersSubtitle")}</div>
          ${renderBlockerList(props)}
        </section>
        <section class="card">
          <div class="card-title">${dt("today.memoryTitle")}</div>
          <div class="card-sub">${dt("today.memorySubtitle")}</div>
          ${renderMemoryActivity(today?.recentMemory ?? [])}
        </section>
      </div>
    </section>
  `;
}

function renderWorkflowLifecycle(params: {
  stages: DashboardLifecycleStageLike[];
  currentStageId?: string;
  completedStageIds?: string[];
  status?: DashboardTask["status"] | DashboardTeamRun["status"];
}) {
  if (params.stages.length === 0) {
    return nothing;
  }
  const stages = resolveDisplayLifecycleStages(params.stages);
  const completedStageIds = new Set(
    (params.completedStageIds ?? []).map((stageId) => stageId.trim().toLowerCase()),
  );
  const currentStageId = params.currentStageId?.trim().toLowerCase();
  const isDone = params.status === "done";
  return html`
    <div class="dashboard-lifecycle">
      ${stages.map((stage) => {
        const normalizedStageId = stage.id.trim().toLowerCase();
        const isCurrent = !isDone && normalizedStageId === currentStageId;
        const isCompleted = isDone || completedStageIds.has(normalizedStageId);
        const stateClass = isCurrent
          ? "dashboard-lifecycle__stage--current"
          : isCompleted
            ? "dashboard-lifecycle__stage--complete"
            : "dashboard-lifecycle__stage--pending";
        const rolesLabel = stage.roles
          .map((role) => role.trim())
          .filter(Boolean)
          .join(" · ");
        return html`
          <article class="dashboard-lifecycle__stage ${stateClass}">
            <strong>${stage.name?.trim() || stage.id}</strong>
            ${rolesLabel ? html`<div class="dashboard-note__meta"><span>${rolesLabel}</span></div>` : nothing}
          </article>
        `;
      })}
    </div>
  `;
}

function renderTaskCard(props: DashboardProps, task: DashboardTask) {
  const preview = task.previewLinks[0];
  const summary = taskSummaryLine(task);
  return html`
    <article class="dashboard-task">
      <div class="dashboard-task__header">
        <div class="dashboard-task__header-copy">
          <div class="dashboard-task__title">${task.title}</div>
          <div class="dashboard-task__meta">${taskContextLine(task)}</div>
        </div>
        <div class="dashboard-task__signals">
          ${preview ? html`<span class="dashboard-task__signal">${dt("tasks.preview")}</span>` : nothing}
          ${
            (task.blockerLinks?.length ?? 0) > 0
              ? html`
                <span class="dashboard-task__signal dashboard-task__signal--warn">
                  ${task.blockerLinks.length}
                  ${dt("tasks.blockers")}
                </span>
              `
              : nothing
          }
        </div>
      </div>
      ${summary ? html`<div class="dashboard-task__summary">${summary}</div>` : nothing}
      ${renderProgressBar({
        label: task.progressLabel,
        percent: task.progressPercent,
      })}
      ${
        task.blockerLinks.length > 0
          ? html`
            <div class="dashboard-task__blockers">
              ${renderBlockerCards(props, task.blockerLinks.map(taskBlockerToRenderable))}
            </div>
          `
          : nothing
      }
      <div class="dashboard-task__footer">
        <div class="dashboard-task__actions">
          <button class="btn btn--sm" @click=${() => props.onOpenTask(task)}>
            ${dt("tasks.openSession")}
          </button>
          ${
            preview
              ? html`
                <button
                  class="btn btn--sm"
                  @click=${() => {
                    props.onSelectWorkshop(preview.id);
                    props.onNavigate("workshop");
                  }}
                >
                  ${dt("tasks.preview")}
                </button>
              `
              : nothing
          }
        </div>
      </div>
    </article>
  `;
}

function resolveLifecycleStageIdForTask(
  task: DashboardTask,
  stages: DashboardLifecycleStageLike[],
): string | null {
  const displayStages = resolveDisplayLifecycleStages(stages);
  if (task.status === "done") {
    return displayStages.some((stage) => stage.id.trim().toLowerCase() === DISPLAY_DONE_STAGE_ID)
      ? DISPLAY_DONE_STAGE_ID
      : null;
  }
  const currentStageId = task.currentStageId?.trim().toLowerCase();
  if (
    currentStageId &&
    displayStages.some((stage) => stage.id.trim().toLowerCase() === currentStageId)
  ) {
    return currentStageId;
  }
  const normalizedRole = task.teamRole?.trim().toLowerCase();
  if (!normalizedRole) {
    return null;
  }
  const matchedStage = displayStages.find((stage) =>
    stage.roles.some((role) => role.trim().toLowerCase() === normalizedRole),
  );
  return matchedStage?.id?.trim().toLowerCase() ?? null;
}

function renderTaskKanban(props: DashboardProps, tasks: DashboardTask[]) {
  const grouped = groupTasks(tasks, props.doneFromDate, props.doneToDate);
  return html`
    <div class="dashboard-kanban">
      ${grouped.map(
        (column) => html`
          <section class="dashboard-kanban__column card">
            <header class="dashboard-kanban__header">
              <div class="dashboard-kanban__header-copy">
                <span>${statusLabel(column.status)}</span>
                <span class="dashboard-kanban__hint">${statusDescription(column.status)}</span>
              </div>
              <span class="pill">${column.tasks.length}</span>
            </header>
            <div class="dashboard-kanban__stack">
              ${column.tasks.map((task) => renderTaskCard(props, task))}
              ${column.tasks.length === 0 ? html`<div class="dashboard-empty">${dt("tasks.empty")}</div>` : nothing}
            </div>
          </section>
        `,
      )}
    </div>
  `;
}

function renderLifecycleTaskBoard(props: DashboardProps, group: DashboardTaskGroup) {
  const stages = resolveDisplayLifecycleStages(group.lifecycleStages);
  return html`
    <div class="dashboard-kanban">
      ${stages.map((stage) => {
        const stageId = stage.id.trim().toLowerCase();
        const stageTasks = group.tasks
          .filter((task) => resolveLifecycleStageIdForTask(task, stages) === stageId)
          .toSorted(compareDashboardTeamRunItems);
        const rolesLabel = stage.roles
          .map((role) => role.trim())
          .filter(Boolean)
          .join(" · ");
        return html`
          <section class="dashboard-kanban__column card">
            <header class="dashboard-kanban__header">
              <div class="dashboard-kanban__header-copy">
                <span>${stage.name?.trim() || stage.id}</span>
                ${
                  rolesLabel
                    ? html`<span class="dashboard-kanban__hint">${rolesLabel}</span>`
                    : nothing
                }
              </div>
              <span class="pill">${stageTasks.length}</span>
            </header>
            <div class="dashboard-kanban__stack">
              ${stageTasks.map((task) => renderTaskCard(props, task))}
              ${stageTasks.length === 0 ? html`<div class="dashboard-empty">${dt("tasks.empty")}</div>` : nothing}
            </div>
          </section>
        `;
      })}
    </div>
  `;
}

function renderTasksPage(props: DashboardProps) {
  const tasks = resolveTaskList(props.snapshot, props.taskFilter);
  const projectOptions = resolveProjectOptions(props.snapshot);
  const groups = resolveTaskGroups(props, tasks);
  const selectedGroup =
    groups.find((group) => group.key === props.taskGroupSelection) ??
    groups.find((group) => group.tasks.length > 0) ??
    groups[0] ??
    null;
  return html`
    <section class="dashboard-page">
      ${
        props.taskFilter
          ? renderPageToolbar(html`
              <span class="pill">
                ${
                  props.taskFilter.kind === "project"
                    ? dt("tasks.projectFiltered")
                    : dt("tasks.filtered")
                }
              </span>
              <button class="btn btn--sm" @click=${() => props.onFilterTasks(null)}>
                ${dt("tasks.clearFilter")}
              </button>
            `)
          : nothing
      }
      <div class="dashboard-task-strip">
        <div class="dashboard-task-strip__item">
          <span class="dashboard-task-strip__label">${dt("tasks.total")}</span>
          <strong>${tasks.length}</strong>
        </div>
        <div class="dashboard-task-strip__item">
          <span class="dashboard-task-strip__label">${dt("tasks.active")}</span>
          <strong>${tasks.filter((task) => task.status === "in_progress" || task.status === "review").length}</strong>
        </div>
        <div class="dashboard-task-strip__item">
          <span class="dashboard-task-strip__label">${dt("tasks.blocked")}</span>
          <strong>${tasks.filter((task) => task.status === "blocked").length}</strong>
        </div>
      </div>
      <div class="dashboard-task-filters card">
        <div class="dashboard-task-filters__copy">
          <div>
            <div class="dashboard-org-chart__label">${dt("tasks.doneWindow")}</div>
            <div class="card-sub">${dt("tasks.doneWindowSubtitle")}</div>
          </div>
          <label class="dashboard-task-filters__field">
            <span>${dt("tasks.projectFilter")}</span>
            <select
              class="select"
              .value=${props.taskFilter?.kind === "project" ? props.taskFilter.value : ""}
              @change=${(event: Event) => {
                const value = (event.target as HTMLSelectElement).value;
                props.onFilterTasks(value ? { kind: "project", value } : null);
              }}
            >
              <option value="">${dt("tasks.allProjects")}</option>
              ${projectOptions.map(
                (option) => html`<option value=${option.key}>${option.name}</option>`,
              )}
            </select>
          </label>
        </div>
        <div class="dashboard-task-filters__range">
          <label class="dashboard-task-filters__field">
            <span>${dt("tasks.from")}</span>
            <input
              class="input"
              type="date"
              .value=${props.doneFromDate}
              @input=${(event: Event) =>
                props.onDoneDateRangeChange({
                  fromDate: (event.target as HTMLInputElement).value,
                })}
            />
          </label>
          <label class="dashboard-task-filters__field">
            <span>${dt("tasks.to")}</span>
            <input
              class="input"
              type="date"
              .value=${props.doneToDate}
              @input=${(event: Event) =>
                props.onDoneDateRangeChange({
                  toDate: (event.target as HTMLInputElement).value,
                })}
            />
          </label>
        </div>
      </div>
      <div class="dashboard-task-layout">
        <aside class="dashboard-task-list">
          ${groups.map((group) => {
            const latestRun = group.runs[0];
            const isActive = selectedGroup?.key === group.key;
            return html`
              <button
                type="button"
                class="dashboard-task-list__item ${isActive ? "dashboard-task-list__item--active" : ""}"
                @click=${() => props.onSelectTaskGroup(group.key)}
              >
                <span>${group.title}</span>
                ${group.subtitle ? html`<span>${group.subtitle}</span>` : nothing}
                <span class="dashboard-note__meta">
                  <span>${dt("tasks.taskCount", { count: String(group.tasks.length) })}</span>
                  ${
                    group.lifecycleStages.length > 0
                      ? html`
                        <span>
                          ${dt("teams.stageCount", {
                            count: String(
                              resolveDisplayLifecycleStages(group.lifecycleStages).length,
                            ),
                          })}
                        </span>
                      `
                      : nothing
                  }
                </span>
                ${
                  latestRun?.progressLabel
                    ? html`<span class="dashboard-note__meta"><span>${latestRun.progressLabel}</span></span>`
                    : nothing
                }
              </button>
            `;
          })}
        </aside>
        <section class="dashboard-task-detail card">
          ${
            selectedGroup
              ? html`
                <header class="dashboard-task-group__header">
                  <div>
                    <div class="card-title">${selectedGroup.title}</div>
                    ${selectedGroup.subtitle ? html`<div class="card-sub">${selectedGroup.subtitle}</div>` : nothing}
                  </div>
                  <div class="dashboard-page__actions">
                    <span class="pill">${dt("tasks.taskCount", { count: String(selectedGroup.tasks.length) })}</span>
                    ${
                      selectedGroup.lifecycleStages.length > 0
                        ? html`
                          <span class="pill">
                            ${dt("teams.stageCount", {
                              count: String(
                                resolveDisplayLifecycleStages(selectedGroup.lifecycleStages).length,
                              ),
                            })}
                          </span>
                        `
                        : nothing
                    }
                    ${
                      selectedGroup.runs.length > 0
                        ? html`<span class="pill">${dt("tasks.runCount", { count: String(selectedGroup.runs.length) })}</span>`
                        : nothing
                    }
                    ${
                      selectedGroup.runs[0]?.progressLabel
                        ? html`<span class="pill">${selectedGroup.runs[0].progressLabel}</span>`
                        : nothing
                    }
                  </div>
	                </header>
	                ${
                    selectedGroup.kind === "team" && selectedGroup.lifecycleStages.length > 0
                      ? renderLifecycleTaskBoard(props, selectedGroup)
                      : renderTaskKanban(props, selectedGroup.tasks)
                  }
              `
              : html`<div class="dashboard-empty">${dt("tasks.empty")}</div>`
          }
        </section>
      </div>
    </section>
  `;
}

function renderWorkshopPage(props: DashboardProps) {
  const recentItems = props.snapshot?.workshop ?? [];
  const savedItems = props.snapshot?.workshopSaved ?? [];
  const visibleItems = props.workshopTab === "saved" ? savedItems : recentItems;
  const selected =
    visibleItems.find((item) => item.id === props.workshopSelectedId) ?? visibleItems[0] ?? null;
  const selectedRecentItems = recentItems.filter((item) => props.workshopSelectedIds.has(item.id));
  const normalizedProjectDraft = props.workshopProjectDraft
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
  const projectMismatchCount = selectedRecentItems.filter(
    (item) =>
      item.projectKey && normalizedProjectDraft && item.projectKey !== normalizedProjectDraft,
  ).length;
  const frameUrl = selected ? workshopFrameUrl(selected) : null;
  const artifactDetail = selected ? workshopArtifactDetail(selected) : null;
  return html`
    <section class="dashboard-page">
      <div class="dashboard-workshop__toolbar card">
        <div class="dashboard-segmented" role="tablist" aria-label=${dt("workshop.tabsAriaLabel")}>
          <button
            type="button"
            class="dashboard-segmented__item ${props.workshopTab === "saved" ? "dashboard-segmented__item--active" : ""}"
            @click=${() => props.onWorkshopTabChange("saved")}
          >
            ${dt("workshop.savedTab")}
          </button>
          <button
            type="button"
            class="dashboard-segmented__item ${props.workshopTab === "recent" ? "dashboard-segmented__item--active" : ""}"
            @click=${() => props.onWorkshopTabChange("recent")}
          >
            ${dt("workshop.recentTab")}
          </button>
        </div>
        ${
          props.workshopTab === "recent"
            ? html`
              <div class="dashboard-workshop__savebar">
                <span class="pill">
                  ${dt("workshop.selectedCount", { count: String(selectedRecentItems.length) })}
                </span>
                <label class="dashboard-workshop__project-field">
                  <span>${dt("workshop.projectName")}</span>
                  <input
                    class="input"
                    type="text"
                    .value=${props.workshopProjectDraft}
                    @input=${(event: Event) =>
                      props.onWorkshopProjectDraftChange((event.target as HTMLInputElement).value)}
                  />
                </label>
                <button
                  class="btn btn--sm"
                  ?disabled=${selectedRecentItems.length === 0 || !props.workshopProjectDraft.trim() || props.workshopSaving}
                  @click=${props.onSaveWorkshopSelection}
                >
                  ${props.workshopSaving ? dt("workshop.saving") : dt("workshop.saveSelection")}
                </button>
              </div>
            `
            : nothing
        }
      </div>
      ${
        props.workshopTab === "recent" && projectMismatchCount > 0
          ? html`
            <div class="dashboard-note card">
              <div class="dashboard-note__meta">
                <span>${dt("workshop.projectMismatchWarning", { count: String(projectMismatchCount) })}</span>
              </div>
            </div>
          `
          : nothing
      }
      ${
        props.workshopSaveError
          ? html`
            <div class="dashboard-note card">
              <div class="dashboard-note__meta"><span>${props.workshopSaveError}</span></div>
            </div>
          `
          : nothing
      }
      <div class="dashboard-workshop">
        <aside class="dashboard-workshop__list card">
          ${visibleItems.map((item) => {
            const isRecentItem = props.workshopTab === "recent";
            const recentItem = isRecentItem ? (item as DashboardWorkshopItem) : null;
            return html`
              <div
                class="dashboard-workshop__item ${selected?.id === item.id ? "dashboard-workshop__item--active" : ""}"
              >
                ${
                  recentItem
                    ? html`
                      <label class="dashboard-workshop__select">
                        <input
                          type="checkbox"
                          .checked=${props.workshopSelectedIds.has(recentItem.id)}
                          @click=${(event: Event) => event.stopPropagation()}
                          @change=${(event: Event) =>
                            props.onToggleWorkshopSelection(
                              recentItem.id,
                              (event.target as HTMLInputElement).checked,
                            )}
                        />
                      </label>
                    `
                    : nothing
                }
                <button
                  type="button"
                  class="dashboard-workshop__item-main"
                  @click=${() => props.onSelectWorkshop(item.id)}
                >
                  <span class="dashboard-workshop__item-title">${item.title}</span>
                  <span class="dashboard-workshop__item-meta">${workshopContextSummary(item)}</span>
                  <span class="dashboard-workshop__item-meta">
                    ${statusLabel(item.taskStatus)} ·
                    ${item.updatedAtMs ? formatRelativeTimestamp(item.updatedAtMs) : dt("status.waiting")}
                  </span>
                  <span class="dashboard-workshop__item-pills">
                    ${item.projectName ? renderProjectBadge(item.projectName) : nothing}
                    ${recentItem?.isSaved ? html`<span class="pill">${dt("workshop.savedBadge")}</span>` : nothing}
                    ${
                      props.workshopTab === "saved" && "savedAtMs" in item && item.savedAtMs
                        ? html`<span class="pill">${dt("workshop.savedAt", { time: formatRelativeTimestamp(item.savedAtMs) })}</span>`
                        : nothing
                    }
                  </span>
                </button>
              </div>
            `;
          })}
          ${
            visibleItems.length === 0
              ? html`
                <div class="dashboard-empty">
                  ${props.workshopTab === "saved" ? dt("workshop.savedEmpty") : dt("workshop.recentEmpty")}
                </div>
              `
              : nothing
          }
        </aside>
        <section class="dashboard-workshop__preview card">
          ${
            selected
              ? html`
                <div class="dashboard-workshop__hero">
                  <div>
                    <div class="card-title">${selected.title}</div>
                    <div class="card-sub">${workshopContextSummary(selected)}</div>
                  </div>
                  <div class="dashboard-page__actions">
                    <span class="pill">${statusLabel(selected.taskStatus)}</span>
                    ${selected.projectName ? renderProjectBadge(selected.projectName) : nothing}
                    ${
                      props.workshopTab === "saved"
                        ? html`<span class="pill">${dt("workshop.savedBadge")}</span>`
                        : (selected as DashboardWorkshopItem).isSaved
                          ? html`<span class="pill">${dt("workshop.savedBadge")}</span>`
                          : nothing
                    }
                  </div>
                </div>
                <div class="dashboard-workshop__actions">
                  <button
                    class="btn btn--sm"
                    @click=${() =>
                      props.onFilterTasks(
                        selected.projectKey
                          ? { kind: "project", value: selected.projectKey }
                          : selected.taskId
                            ? { kind: "task", value: selected.taskId }
                            : null,
                      )}
                  >
                    ${dt("workshop.filterTasks")}
                  </button>
                  <button class="btn btn--sm" @click=${() => props.onNavigate("tasks")}>
                    ${dt("workshop.openTasks")}
                  </button>
                  ${
                    selected.previewUrl
                      ? html`
                        <a
                          class="btn btn--sm"
                          href=${selected.previewUrl}
                          target=${EXTERNAL_LINK_TARGET}
                          rel=${buildExternalLinkRel()}
                        >
                          ${dt("workshop.openPreview")}
                        </a>
                      `
                      : nothing
                  }
                </div>
                <div class="dashboard-workshop__meta-grid">
                  <div class="dashboard-workshop__meta-card">
                    <div class="dashboard-org-chart__label">${dt("workshop.artifact")}</div>
                    <strong>${selected.title}</strong>
                    ${
                      artifactDetail
                        ? html`<div class="dashboard-note__meta"><span>${artifactDetail}</span></div>`
                        : nothing
                    }
                    <div class="dashboard-note__meta">
                      <span>${
                        frameUrl
                          ? dt("workshop.livePreviewInDashboard")
                          : selected.previewUrl
                            ? dt("workshop.livePreviewAvailable")
                            : dt("workshop.noLivePreviewYet")
                      }</span>
                    </div>
                  </div>
                  <div class="dashboard-workshop__meta-card">
                    <div class="dashboard-org-chart__label">${dt("workshop.previewLink")}</div>
                    <strong>${previewLocationLabel(selected.previewUrl) ?? dt("workshop.notPublished")}</strong>
                    ${
                      selected.previewUrl
                        ? html`<div class="dashboard-note__meta"><span>${selected.previewUrl}</span></div>`
                        : nothing
                    }
                  </div>
                  <div class="dashboard-workshop__meta-card">
                    <div class="dashboard-org-chart__label">${dt("workshop.currentProject")}</div>
                    <strong>${selected.projectName ?? dt("workshop.notTagged")}</strong>
                    ${
                      selected.workspaceLabel
                        ? html`<div class="dashboard-note__meta"><span>${selected.workspaceLabel}</span></div>`
                        : nothing
                    }
                  </div>
                  ${
                    selected.taskTitle
                      ? html`
                        <div class="dashboard-workshop__meta-card">
                          <div class="dashboard-org-chart__label">${dt("workshop.sourceTask")}</div>
                          <strong>${selected.taskTitle}</strong>
                          ${
                            selected.taskAssigneeLabel
                              ? html`<div class="dashboard-note__meta"><span>${selected.taskAssigneeLabel}</span></div>`
                              : nothing
                          }
                        </div>
                      `
                      : nothing
                  }
                </div>
                ${
                  frameUrl
                    ? html`
                      <div class="dashboard-workshop__frame-wrap">
                        <iframe
                          class="dashboard-workshop__frame"
                          src=${frameUrl}
                          title=${selected.title}
                          loading="lazy"
                        ></iframe>
                      </div>
                    `
                    : html`
                      <div class="dashboard-workshop__external">
                        ${
                          selected.previewUrl
                            ? dt("workshop.externalPreview")
                            : selected.artifactPath
                              ? dt("workshop.externalArtifactOnly", { path: selected.artifactPath })
                              : dt("workshop.externalNoPreview")
                        }
                      </div>
                    `
                }
              `
              : html`
                <div class="dashboard-empty">
                  ${props.workshopTab === "saved" ? dt("workshop.chooseSaved") : dt("workshop.chooseItem")}
                </div>
              `
          }
        </section>
      </div>
    </section>
  `;
}

function startOfDay(value: number) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function renderCalendarPage(props: DashboardProps) {
  const calendar = resolveCalendarResult(props);
  const anchorAtMs = props.calendarAnchorAtMs ?? calendar.anchorAtMs;
  const selectedDay = startOfDay(anchorAtMs);
  const todayStart = startOfDay(Date.now());
  const dayMs = 86_400_000;
  const visibleDays = Array.from(
    { length: Math.max(1, Math.round((calendar.endAtMs - calendar.startAtMs) / dayMs)) },
    (_, index) => calendar.startAtMs + index * dayMs,
  );
  const eventsByDay = groupCalendarEventsByDay(calendar.events);
  const hourSlots = Array.from({ length: 24 }, (_, hour) => hour);
  return html`
    <section class="dashboard-page">
      <div class="dashboard-calendar__header">
        <div class="dashboard-calendar__summary">
          <div class="dashboard-calendar__range">${formatCalendarRange(calendar, anchorAtMs)}</div>
          <div class="dashboard-note__meta dashboard-calendar__meta">
            <span>${dt("calendar.visibleItems", { count: String(calendar.events.length) })}</span>
            <span>${dt("calendar.selectedDay", { day: formatLongDayLabel(selectedDay) })}</span>
          </div>
        </div>
        <div class="dashboard-calendar__controls">
          <div class="dashboard-segmented">
            ${(Object.keys(CALENDAR_VIEW_LABELS) as Array<DashboardProps["calendarView"]>).map(
              (view) => html`
                <button
                  type="button"
                  class="dashboard-segmented__item ${props.calendarView === view ? "dashboard-segmented__item--active" : ""}"
                  @click=${() => props.onCalendarViewChange(view)}
                >
                  ${dt(CALENDAR_VIEW_LABELS[view])}
                </button>
              `,
            )}
          </div>
          <div class="dashboard-calendar__nav">
            <button class="btn btn--sm" @click=${() => props.onCalendarNavigate(-1)}>${dt("calendar.prev")}</button>
            <button class="btn btn--sm" @click=${props.onCalendarJumpToday}>${dt("calendar.today")}</button>
            <button class="btn btn--sm" @click=${() => props.onCalendarNavigate(1)}>${dt("calendar.next")}</button>
          </div>
        </div>
      </div>
      ${
        calendar.view === "month"
          ? html`
              <div class="dashboard-calendar-month-shell">
                <div class="dashboard-calendar-month card">
                  <div class="dashboard-calendar-month__weekdays">
                    ${visibleDays
                      .slice(0, 7)
                      .map(
                        (day) =>
                          html`<div class="dashboard-calendar-month__weekday">${formatWeekdayLabel(day)}</div>`,
                      )}
                  </div>
                  <div class="dashboard-calendar-month__grid">
                    ${visibleDays.map((day) => {
                      const dayEvents = eventsByDay.get(day) ?? [];
                      const visibleEventCount = 4;
                      const overflowCount = Math.max(0, dayEvents.length - visibleEventCount);
                      return html`
                        <button
                          type="button"
                          class="dashboard-calendar-month__cell ${!isSameMonth(day, anchorAtMs) ? "dashboard-calendar-month__cell--outside" : ""} ${isSameDay(day, selectedDay) ? "dashboard-calendar-month__cell--selected" : ""} ${isSameDay(day, todayStart) ? "dashboard-calendar-month__cell--today" : ""}"
                          @click=${() => props.onCalendarSelectDay(day)}
                        >
                          <div class="dashboard-calendar-month__cell-header">
                            <span class="dashboard-calendar-month__date">${formatDayNumber(day)}</span>
                            ${
                              dayEvents.length > 0
                                ? html`<span class="dashboard-calendar-month__count">${dayEvents.length}</span>`
                                : nothing
                            }
                          </div>
                          <div class="dashboard-calendar-month__items">
                            ${dayEvents.slice(0, visibleEventCount).map(
                              (event) => html`
                                <div class="dashboard-calendar-month__item">
                                  <span class="dashboard-calendar-month__item-time">${formatTimeLabel(event.startAtMs)}</span>
                                  <span class="dashboard-calendar-month__item-title">${event.title}</span>
                                </div>
                              `,
                            )}
                            ${
                              overflowCount > 0
                                ? html`<div class="dashboard-calendar-month__more">${dt("calendar.moreItems", { count: String(overflowCount) })}</div>`
                                : nothing
                            }
                          </div>
                        </button>
                      `;
                    })}
                  </div>
                </div>
              </div>
            `
          : html`
              <div class="dashboard-timegrid-wrap card">
                <div
                  class="dashboard-timegrid dashboard-timegrid--${calendar.view}"
                  style=${
                    calendar.view === "week"
                      ? "grid-template-columns: 76px repeat(7, minmax(150px, 1fr));"
                      : "grid-template-columns: 76px minmax(0, 1fr);"
                  }
                >
                  <div class="dashboard-timegrid__corner"></div>
                  ${visibleDays.map(
                    (day) => html`
                      <button
                        type="button"
                        class="dashboard-timegrid__day ${isSameDay(day, todayStart) ? "dashboard-timegrid__day--today" : ""}"
                        @click=${() =>
                          calendar.view === "week"
                            ? props.onCalendarSelectDay(day, "day")
                            : props.onCalendarSelectDay(day)}
                      >
                        <span class="dashboard-timegrid__day-main">${formatWeekdayLabel(day)}</span>
                        <span class="dashboard-timegrid__day-sub">${formatDayLabel(day)}</span>
                      </button>
                    `,
                  )}
                  ${hourSlots.map(
                    (hour) => html`
                      <div class="dashboard-timegrid__time">${formatHourLabel(hour)}</div>
                      ${visibleDays.map((day) => {
                        const dayEvents = (eventsByDay.get(day) ?? []).filter(
                          (event) => new Date(event.startAtMs).getHours() === hour,
                        );
                        return html`
                          <div class="dashboard-timegrid__slot ${isSameDay(day, todayStart) ? "dashboard-timegrid__slot--today" : ""}">
                            ${dayEvents.map(
                              (event) => html`
                                <article class="dashboard-timegrid__event dashboard-timegrid__event--${event.status}">
                                  <div class="dashboard-timegrid__event-time">${formatTimeLabel(event.startAtMs)}</div>
                                  <div class="dashboard-timegrid__event-title">${event.title}</div>
                                  <div class="dashboard-timegrid__event-meta">${calendarKindLabel(event.kind)}</div>
                                </article>
                              `,
                            )}
                          </div>
                        `;
                      })}
                    `,
                  )}
                </div>
              </div>
            `
      }
    </section>
  `;
}

function renderRoutinesPage(props: DashboardProps) {
  const routines = props.snapshot?.routines ?? [];
  return html`
    <section class="dashboard-page">
      <div class="dashboard-list dashboard-list--cards">
        ${routines.map(
          (routine) => html`
            <article class="dashboard-note">
              <div class="dashboard-note__title">${routine.title}</div>
              <div class="dashboard-note__meta">
                <span>${routine.enabled ? t("common.enabled") : dt("routines.paused")}</span>
                <span>${routine.scheduleLabel}</span>
              </div>
              ${routine.description ? html`<div class="dashboard-note__body">${routine.description}</div>` : nothing}
              <div class="dashboard-note__meta">
                <span>${dt("routines.nextRun", { time: formatDateTime(routine.nextRunAtMs) })}</span>
                <span>${dt("routines.lastRun", {
                  time: routine.lastRunAtMs
                    ? formatRelativeTimestamp(routine.lastRunAtMs)
                    : dt("routines.never"),
                })}</span>
              </div>
            </article>
          `,
        )}
        ${routines.length === 0 ? html`<div class="dashboard-empty">${dt("routines.empty")}</div>` : nothing}
      </div>
    </section>
  `;
}

function renderTeamsPage(props: DashboardProps) {
  const snapshots = props.teamSnapshots?.snapshots ?? [];
  const selected =
    snapshots.find((entry) => selectionKeyForTeam(entry) === props.teamSelection) ??
    snapshots[0] ??
    null;
  const selectedTeamId = selected?.teamId ?? null;
  const manager = selected?.nodes.find((node) => node.kind === "manager") ?? null;
  const nodesById = new Map((selected?.nodes ?? []).map((node) => [node.id, node]));
  const reviewEdges = (selected?.edges ?? []).filter((edge) => edge.kind === "reviews");
  const linkEdges = (selected?.edges ?? []).filter((edge) => edge.kind === "links");
  const members = (selected?.nodes ?? [])
    .filter((node): node is DashboardTeamNodeLike => node.kind === "member")
    .slice()
    .sort(compareDashboardTeamNodes);
  const workflowStages = (["architecture", "execution", "qa"] as const)
    .map((stage) => ({
      stage,
      nodes: members.filter((member) => inferDashboardTeamNodeStage(member, reviewEdges) === stage),
    }))
    .filter((entry) => entry.nodes.length > 0);
  const supportMembers = members.filter(
    (member) => inferDashboardTeamNodeStage(member, reviewEdges) === "support",
  );
  const linked = linkEdges
    .map((edge) => ({
      edge,
      node: nodesById.get(edge.to),
    }))
    .filter(
      (
        entry,
      ): entry is {
        edge: (typeof linkEdges)[number];
        node: DashboardTeamSnapshot["nodes"][number];
      } => Boolean(entry.node),
    );
  const reviewers = reviewEdges
    .map((edge) => ({
      edge,
      node: nodesById.get(edge.from),
    }))
    .filter(
      (
        entry,
      ): entry is {
        edge: (typeof reviewEdges)[number];
        node: DashboardTeamSnapshot["nodes"][number];
      } => Boolean(entry.node),
    );
  const inboundLinks = selected && selectedTeamId
    ? snapshots
        .filter((snapshot) => selectionKeyForTeam(snapshot) !== selectionKeyForTeam(selected))
        .flatMap((snapshot) =>
          snapshot.edges
            .filter((edge) => edge.kind === "links")
            .map((edge) => ({
              edge,
              node: snapshot.nodes.find((candidate) => candidate.id === edge.to),
              snapshot,
            }))
            .filter(
              (
                entry,
              ): entry is {
                edge: DashboardTeamSnapshot["edges"][number];
                node: DashboardTeamSnapshot["nodes"][number];
                snapshot: DashboardTeamSnapshot;
              } =>
                Boolean(entry.node) &&
                entry.node.kind === "linked_team" &&
                nodeTargetsSelectedTeam(entry.node.id, selectedTeamId),
            ),
        )
    : [];
  const lifecycleStages = selected?.lifecycleStages ?? [];
  const delegateCount = members.length;
  const selectedRuns = selected
    ? (props.teamRunsResult?.items ?? []).filter(
        (run) => run.teamId === selected.teamId && run.workflowId === selected.workflowId,
      )
    : [];
  const latestRun = selectedRuns[0];
  const stageCount =
    lifecycleStages.length > 0
      ? resolveDisplayLifecycleStages(lifecycleStages).length
      : workflowStages.length > 0
        ? workflowStages.length
        : members.length > 0
          ? 1
          : 0;
  return html`
    <section class="dashboard-page">
      ${props.teamsError ? html`<div class="callout danger">${props.teamsError}</div>` : nothing}
      <div class="dashboard-team-layout">
        <aside class="dashboard-team-list">
          ${snapshots.map(
            (snapshot) => html`
              <button
                type="button"
                class="dashboard-team-list__item ${selected && selectionKeyForTeam(snapshot) === selectionKeyForTeam(selected) ? "dashboard-team-list__item--active" : ""}"
                @click=${() => props.onSelectTeam(selectionKeyForTeam(snapshot))}
              >
                <span>${snapshot.teamName ?? snapshot.teamId}</span>
                <span>${snapshot.workflowName ?? snapshot.workflowId}</span>
              </button>
            `,
          )}
          ${snapshots.length === 0 ? html`<div class="dashboard-empty">${dt("teams.empty")}</div>` : nothing}
        </aside>
        <section class="dashboard-team-detail card">
          ${
            selected
              ? html`
                <div class="dashboard-workshop__hero">
                  <div>
                    <div class="card-title">${selected.teamName ?? selected.teamId}</div>
                    <div class="card-sub">
                      ${selected.workflowName ?? selected.workflowId} · ${
                        selected.status === "generated"
                          ? dt("teams.generatedSummary")
                          : dt("teams.fallbackSummary")
                      }
                    </div>
                  </div>
                  <div class="dashboard-page__actions">
                    <button
                      class="btn btn--sm"
                      type="button"
                      @click=${() =>
                        props.onPromptTeamEdit({
                          teamId: selected.teamId,
                          teamLabel: selected.teamName ?? selected.teamId,
                          workflowId: selected.workflowId,
                          workflowLabel: selected.workflowName ?? selected.workflowId,
                        })}
                    >
                      Prompt Changes
                    </button>
                    <span class="pill">${manager?.label ?? dt("teams.noManager")}</span>
                    <span class="pill">${dt("teams.delegateCount", { count: String(delegateCount) })}</span>
                    <span class="pill">${dt("teams.stageCount", { count: String(stageCount) })}</span>
                  </div>
                </div>
                ${
                  lifecycleStages.length > 0
                    ? html`
                      <section class="dashboard-team-runs card">
                        <div class="dashboard-page__header">
                          <div>
                            <div class="card-title">${dt("teams.lifecycleTitle")}</div>
                            <div class="card-sub">${dt("teams.lifecycleSubtitle")}</div>
                          </div>
                          <div class="dashboard-page__actions">
                            ${
                              latestRun?.progressLabel
                                ? html`<span class="pill">${latestRun.progressLabel}</span>`
                                : nothing
                            }
                          </div>
                        </div>
                        ${renderWorkflowLifecycle({
                          stages: lifecycleStages,
                          currentStageId: latestRun?.currentStageId,
                          completedStageIds: latestRun?.completedStageIds,
                          status: latestRun?.status,
                        })}
                      </section>
                    `
                    : nothing
                }
                <div class="dashboard-org-chart">
                  <section class="dashboard-org-chart__core">
                    ${
                      inboundLinks.length > 0
                        ? html`
                          <section class="dashboard-org-chart__stage dashboard-org-chart__stage--upstream">
                            <div class="dashboard-org-chart__stage-header">
                              <div class="dashboard-org-chart__arrow">${stageTitleForTeam("upstream")}</div>
                              <div class="card-sub">${stageDescriptionForTeam("upstream")}</div>
                            </div>
                            <div class="dashboard-org-chart__stage-nodes dashboard-org-chart__stage-nodes--compact">
                              ${inboundLinks.map(
                                ({ edge, snapshot }) => html`
                                  <article class="dashboard-org-chart__node dashboard-org-chart__node--linked">
                                    <div class="dashboard-org-chart__label">${dt("teams.upstreamTeam")}</div>
                                    <strong>${snapshot.teamName ?? snapshot.teamId}</strong>
                                    <div class="dashboard-note__meta">
                                      <span>${snapshot.workflowName ?? snapshot.workflowId}</span>
                                      ${edge.label ? html`<span>${edge.label}</span>` : nothing}
                                    </div>
                                  </article>
                                `,
                              )}
                            </div>
                          </section>
                          <div class="dashboard-org-chart__flow-connector" aria-hidden="true"></div>
                        `
                        : nothing
                    }
                    <div class="dashboard-org-chart__lane">
                      <article class="dashboard-org-chart__node dashboard-org-chart__node--manager">
                        <div class="dashboard-org-chart__label">${dt("teams.stage.manager")}</div>
                        <strong>${manager?.label ?? dt("task.unassigned")}</strong>
                        ${
                          selected.teamName
                            ? html`<div class="dashboard-note__meta"><span>${selected.teamName}</span></div>`
                            : nothing
                        }
                      </article>
                    </div>
                    ${
                      workflowStages.length > 0
                        ? workflowStages.map(
                            (entry) => html`
                            <div class="dashboard-org-chart__flow-connector" aria-hidden="true"></div>
                            <section class="dashboard-org-chart__stage">
                              <div class="dashboard-org-chart__stage-header">
                                <div class="dashboard-org-chart__arrow">${stageTitleForTeam(entry.stage)}</div>
                                <div class="card-sub">${stageDescriptionForTeam(entry.stage)}</div>
                              </div>
                              <div
                                class="dashboard-org-chart__stage-nodes ${
                                  entry.nodes.length === 1
                                    ? "dashboard-org-chart__stage-nodes--single"
                                    : ""
                                }"
                              >
                                ${entry.nodes.map(
                                  (member) => html`
                                    <article class="dashboard-org-chart__node">
                                      <div class="dashboard-org-chart__label">${member.role ?? dt("teams.specialist")}</div>
                                      <strong>${member.label}</strong>
                                      ${
                                        member.description
                                          ? html`<div class="dashboard-note__body">${member.description}</div>`
                                          : nothing
                                      }
                                    </article>
                                  `,
                                )}
                              </div>
                            </section>
                          `,
                          )
                        : members.length > 0
                          ? html`
                            <div class="dashboard-org-chart__flow-connector" aria-hidden="true"></div>
                            <section class="dashboard-org-chart__stage">
                              <div class="dashboard-org-chart__stage-header">
                                <div class="dashboard-org-chart__arrow">${dt("teams.specialists")}</div>
                                <div class="card-sub">${dt("teams.simpleSpecialistFallback")}</div>
                              </div>
                              <div class="dashboard-org-chart__stage-nodes">
                                ${members.map(
                                  (member) => html`
                                    <article class="dashboard-org-chart__node">
                                      <div class="dashboard-org-chart__label">${member.role ?? dt("teams.specialist")}</div>
                                      <strong>${member.label}</strong>
                                    </article>
                                  `,
                                )}
                              </div>
                            </section>
                          `
                          : html`<div class="dashboard-empty">${dt("teams.noSpecialists")}</div>`
                    }
                  </section>
                  <div class="dashboard-org-chart__support">
                    ${
                      supportMembers.length > 0
                        ? html`
                          <section class="dashboard-org-chart__lane-card">
                            <div class="dashboard-org-chart__arrow">${dt("teams.supportSpecialists")}</div>
                            <div class="dashboard-org-chart__linked">
                              ${supportMembers.map(
                                (member) => html`
                                  <article class="dashboard-org-chart__node">
                                    <div class="dashboard-org-chart__label">${member.role ?? dt("teams.stage.support")}</div>
                                    <strong>${member.label}</strong>
                                    ${
                                      member.description
                                        ? html`<div class="dashboard-note__body">${member.description}</div>`
                                        : nothing
                                    }
                                  </article>
                                `,
                              )}
                            </div>
                          </section>
                        `
                        : nothing
                    }
                    ${
                      linked.length > 0
                        ? html`
                          <section class="dashboard-org-chart__lane-card">
                            <div class="dashboard-org-chart__arrow">${dt("teams.outboundLinks")}</div>
                            <div class="dashboard-org-chart__linked">
                              ${linked.map(
                                ({ edge, node }) => html`
                                  <article class="dashboard-org-chart__node dashboard-org-chart__node--linked">
                                    <div class="dashboard-org-chart__label">${node.role ?? node.kind}</div>
                                    <strong>${node.label}</strong>
                                    ${edge.label ? html`<div class="dashboard-note__meta"><span>${edge.label}</span></div>` : nothing}
                                  </article>
                                `,
                              )}
                            </div>
                          </section>
                        `
                        : nothing
                    }
                    ${
                      reviewers.length > 0
                        ? html`
                          <section class="dashboard-org-chart__lane-card">
                            <div class="dashboard-org-chart__arrow">${dt("teams.reviewLoop")}</div>
                            <div class="dashboard-org-chart__reviews">
                              ${reviewers.map(
                                ({ edge, node }) => html`
                                  <div class="dashboard-org-chart__review">
                                    <span class="dashboard-org-chart__review-node">${node.label}</span>
                                    <span class="dashboard-org-chart__review-arrow">→</span>
                                    <span class="dashboard-org-chart__review-target">${manager?.label ?? dt("teams.stage.manager")}</span>
                                    ${edge.label ? html`<span class="pill">${edge.label}</span>` : nothing}
                                  </div>
                                `,
                              )}
                            </div>
                          </section>
                        `
                        : nothing
                    }
                  </div>
                </div>
                <div class="dashboard-team-summary">
                  <div class="dashboard-org-chart__label">${dt("teams.workflowSummary")}</div>
                  <p>${selected.summary}</p>
                </div>
                ${
                  selected.warnings.length > 0
                    ? html`
                      <div class="callout" style="margin-top: 16px;">
                        ${selected.warnings.map((warning) => html`<div>${warning}</div>`)}
                      </div>
                    `
                    : nothing
                }
              `
              : html`<div class="dashboard-empty">${dt("teams.selectWorkflow")}</div>`
          }
        </section>
      </div>
    </section>
  `;
}

function renderMemoriesPage(props: DashboardProps) {
  const agents = resolveMemoryAgentList(props.agentsList);
  const selectedAgentExists = Boolean(
    props.memoryAgentId && agents.some((agent) => agent.id === props.memoryAgentId),
  );
  const resolvedAgentId =
    (selectedAgentExists ? props.memoryAgentId : null) ??
    props.agentsList?.defaultId ??
    agents[0]?.id ??
    null;
  const selectedAgent = resolvedAgentId
    ? (agents.find((agent) => agent.id === resolvedAgentId) ?? null)
    : null;
  const recentActivity = (props.snapshot?.memories ?? []).filter(
    (entry) => !resolvedAgentId || entry.agentId === resolvedAgentId,
  );
  const editableFiles = [DEFAULT_SOUL_FILENAME, DEFAULT_MEMORY_FILENAME];
  return html`
    <section class="dashboard-page">
      <div class="dashboard-memory-layout">
        <section class="card">
          <div class="card-title">${dt("memories.agents")}</div>
          <div class="card-sub">${dt("memories.agentsSubtitle")}</div>
          <div class="dashboard-memory__agent-list">
            ${agents.map(
              (agent) => html`
                <button
                  type="button"
                  class="dashboard-memory__agent-item ${resolvedAgentId === agent.id ? "dashboard-memory__agent-item--active" : ""}"
                  @click=${() => props.onSelectMemoryAgent(agent.id)}
                >
                  <span>${normalizeAgentLabel(agent)}</span>
                  <span>${agent.id}</span>
                </button>
              `,
            )}
          </div>
          ${props.agentFilesError ? html`<div class="callout danger" style="margin-top: 16px;">${props.agentFilesError}</div>` : nothing}
          <div class="dashboard-memory__activity">
            <div class="dashboard-org-chart__label">${dt("memories.recentNotes")}</div>
            ${renderMemoryActivity(recentActivity)}
          </div>
        </section>
        <section class="dashboard-memory__editors">
          ${renderDashboardAgentTabs(props.agentPanel, props.onSelectAgentPanel)}
          ${
            props.agentPanel === "memory"
              ? html`
                  ${
                    props.agentFilesLoading &&
                    Object.keys(props.agentFileContents).length === 0 &&
                    Object.keys(props.agentFileDrafts).length === 0
                      ? html`
                          <div class="callout info">Loading agent memory files…</div>
                        `
                      : nothing
                  }
                  ${editableFiles.map((name) => {
                    const base = props.agentFileContents[name] ?? "";
                    const draft = props.agentFileDrafts[name] ?? base;
                    const dirty = draft !== base;
                    return html`
                      <article class="card">
                        <div class="dashboard-memory__editor-header">
                          <div>
                            <div class="card-title">${name}</div>
                            <div class="card-sub">${
                              name === DEFAULT_SOUL_FILENAME
                                ? dt("memories.soulSubtitle")
                                : dt("memories.memorySubtitle")
                            }</div>
                          </div>
                          <button
                            class="btn btn--sm"
                            ?disabled=${props.agentFilesLoading || props.agentFileSaving || !dirty}
                            @click=${() => props.onSaveMemoryFile(name)}
                          >
                            ${props.agentFileSaving && dirty ? dt("memories.saving") : dt("memories.save")}
                          </button>
                        </div>
                        <textarea
                          class="dashboard-memory__textarea"
                          .value=${draft}
                          @input=${(event: Event) =>
                            props.onMemoryDraftChange(
                              name,
                              (event.target as HTMLTextAreaElement).value,
                            )}
                        ></textarea>
                      </article>
                    `;
                  })}
                `
              : renderDashboardAgentScope(props, selectedAgent, resolvedAgentId)
          }
        </section>
      </div>
    </section>
  `;
}

export function renderDashboard(props: DashboardProps) {
  const page = dashboardPageForTab(props.tab) ?? "today";
  const shellPageActions = renderShellPageActions(props, page);
  return html`
    <div class="dashboard-shell">
      <header class="dashboard-shell__header">
        <div>
          <div class="dashboard-shell__eyebrow">${dt("shell.eyebrow")}</div>
          <h1 class="dashboard-shell__title">${titleForTab(props.tab)}</h1>
        </div>
        <div class="dashboard-shell__actions">
          ${props.error ? html`<span class="pill danger">${props.error}</span>` : nothing}
          ${props.loading ? html`<span class="pill">${dt("shell.refreshing")}</span>` : nothing}
          ${shellPageActions}
          <button class="btn btn--sm" @click=${props.onBackToControl}>
            ${dt("shell.goToAdvance")}
          </button>
        </div>
      </header>

      ${renderDashboardNav(props, page)}

      <main class="dashboard-shell__content">
        ${
          page === "today"
            ? renderTodayPage(props)
            : page === "wallet"
              ? renderWalletPage(props)
            : page === "mau-office"
              ? renderMauOffice({
                  loading: props.mauOfficeLoading,
                  error: props.mauOfficeError,
                  state: props.mauOfficeState,
                  basePath: props.basePath,
                  chatWindow: {
                    open: props.mauOfficeChatOpen,
                    minimized: props.mauOfficeChatMinimized,
                    actorId: props.mauOfficeChatActorId,
                    actorLabel: props.mauOfficeChatActorLabel,
                    sessionKey: props.mauOfficeChatSessionKey,
                    loading: props.mauOfficeChatLoading,
                    sending: props.mauOfficeChatSending,
                    draft: props.mauOfficeChatMessage,
                    messages: props.mauOfficeChatMessages,
                    stream: props.mauOfficeChatStream,
                    streamStartedAt: props.mauOfficeChatStreamStartedAt,
                    error: props.mauOfficeChatError,
                    position: props.mauOfficeChatPosition,
                  },
                  onRefresh: props.onRefreshMauOffice,
                  onRoomFocus: props.onMauOfficeRoomFocus,
                  onActorOpen: props.onMauOfficeActorOpen,
                  onChatClose: props.onMauOfficeChatClose,
                  onChatToggleMinimized: props.onMauOfficeChatToggleMinimized,
                  onChatDraftChange: props.onMauOfficeChatDraftChange,
                  onChatSend: props.onMauOfficeChatSend,
                  onChatAbort: props.onMauOfficeChatAbort,
                  onChatPositionChange: props.onMauOfficeChatPositionChange,
                })
              : page === "tasks"
                ? renderTasksPage(props)
                : page === "workshop"
                  ? renderWorkshopPage(props)
                  : page === "calendar"
                    ? renderCalendarPage(props)
                    : page === "routines"
                      ? renderRoutinesPage(props)
                      : page === "teams"
                        ? renderTeamsPage(props)
                        : renderMemoriesPage(props)
        }
      </main>
    </div>
  `;
}

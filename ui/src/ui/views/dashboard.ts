import { html, nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { t } from "../../i18n/index.ts";
import { DEFAULT_MEMORY_FILENAME, DEFAULT_SOUL_FILENAME } from "../agent-workspace-constants.ts";
import { buildExternalLinkRel, EXTERNAL_LINK_TARGET } from "../external-link.ts";
import { formatRelativeTimestamp } from "../format.ts";
import { icons } from "../icons.ts";
import {
  DASHBOARD_PAGE_ORDER,
  dashboardPageForTab,
  iconForTab,
  subtitleForTab,
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
  DashboardTask,
  DashboardTeamSnapshot,
  DashboardTeamSnapshotsResult,
} from "../types.ts";
import { renderMauOffice } from "./mau-office.ts";

type DashboardProps = {
  tab: Tab;
  loading: boolean;
  error: string | null;
  snapshot: DashboardSnapshot | null;
  calendarResult: DashboardCalendarResult | null;
  calendarAnchorAtMs: number | null;
  teamsLoading: boolean;
  teamsError: string | null;
  teamSnapshots: DashboardTeamSnapshotsResult | null;
  attentionItems: AttentionItem[];
  basePath: string;
  taskFilter: string | null;
  doneFromDate: string;
  doneToDate: string;
  workshopSelectedId: string | null;
  calendarView: "month" | "week" | "day";
  teamSelection: string | null;
  memoryAgentId: string | null;
  agentsList: AgentsListResult | null;
  agentFilesLoading: boolean;
  agentFilesError: string | null;
  agentFileContents: Record<string, string>;
  agentFileDrafts: Record<string, string>;
  agentFileSaving: boolean;
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
  onFilterTasks: (taskId: string | null) => void;
  onDoneDateRangeChange: (params: { fromDate?: string; toDate?: string }) => void;
  onSelectWorkshop: (itemId: string) => void;
  onCalendarViewChange: (view: "month" | "week" | "day") => void;
  onCalendarNavigate: (direction: -1 | 1) => void;
  onCalendarJumpToday: () => void;
  onCalendarSelectDay: (anchorAtMs: number, view?: "month" | "week" | "day") => void;
  onSelectTeam: (selection: string | null) => void;
  onSelectMemoryAgent: (agentId: string) => void;
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
  month: "dashboard.calendar.views.month",
  week: "dashboard.calendar.views.week",
  day: "dashboard.calendar.views.day",
};

function dt(key: string, params?: Record<string, string>): string {
  return t(`dashboard.${key}`, params);
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

function workshopFrameUrl(item: DashboardSnapshot["workshop"][number]): string | null {
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

function workshopArtifactDetail(item: DashboardSnapshot["workshop"][number]): string | null {
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

function workshopContextSummary(item: DashboardSnapshot["workshop"][number]): string {
  return item.summary?.trim() || dt("workshop.defaultSummary");
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
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
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

function resolveTaskList(snapshot: DashboardSnapshot | null, filter: string | null): DashboardTask[] {
  const tasks = snapshot?.tasks ?? [];
  if (!filter) {
    return tasks;
  }
  return tasks.filter(
    (task) =>
      task.id === filter ||
      task.sessionKey === filter ||
      task.parentSessionKey === filter ||
      task.childSessionKeys?.includes(filter),
  );
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
    tasks: tasks.filter((task) =>
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
  if (/\b(architect|architecture|planner|planning|strategy|strategist|research)\b/.test(normalizedRole)) {
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
  const orderDelta = (a.stageIndex ?? stageOrderForTeam(a.stage ?? "support")) -
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
  return html`
    <div class="dashboard-list">
      ${combined.map(
        (item) => html`
          <article class="dashboard-note dashboard-note--${item.severity}">
            <div class="dashboard-note__title">${item.title}</div>
            <div class="dashboard-note__body">${item.description}</div>
          </article>
        `,
      )}
    </div>
  `;
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

function renderTodayPage(props: DashboardProps) {
  const today = props.snapshot?.today;
  return html`
    <section class="dashboard-page">
      <div class="dashboard-hero card">
        <div>
          <div class="card-title">${titleForTab("dashboardToday")}</div>
          <div class="card-sub">
            ${today
              ? dt("today.summary", {
                  active: String(today.inProgressTasks.length),
                  scheduled: String(today.scheduledToday.length),
                  blockers: String(today.blockers.length),
                })
              : dt("today.loading")}
          </div>
        </div>
        <div class="dashboard-hero__actions">
          <button class="btn btn--sm" @click=${props.onRefresh}>${t("common.refresh")}</button>
          <button class="btn btn--sm" @click=${props.onBackToControl}>
            ${dt("shell.goToAdvance")}
          </button>
        </div>
      </div>

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
                </article>
              `,
            )}
            ${(today?.inProgressTasks?.length ?? 0) === 0
              ? html`<div class="dashboard-empty">${dt("today.inProgressEmpty")}</div>`
              : nothing}
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
            ${(today?.scheduledToday?.length ?? 0) === 0
              ? html`<div class="dashboard-empty">${dt("today.scheduledEmpty")}</div>`
              : nothing}
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

function renderTasksPage(props: DashboardProps) {
  const tasks = resolveTaskList(props.snapshot, props.taskFilter);
  const grouped = groupTasks(tasks, props.doneFromDate, props.doneToDate);
  return html`
    <section class="dashboard-page">
      <div class="dashboard-page__header">
        <div>
          <div class="card-title">${titleForTab("dashboardTasks")}</div>
          <div class="card-sub">${subtitleForTab("dashboardTasks")}</div>
        </div>
        <div class="dashboard-page__actions">
          ${props.taskFilter
            ? html`
                <span class="pill">${dt("tasks.filtered")}</span>
                <button class="btn btn--sm" @click=${() => props.onFilterTasks(null)}>
                  ${dt("tasks.clearFilter")}
                </button>
              `
            : nothing}
          <button class="btn btn--sm" @click=${props.onRefresh}>${t("common.refresh")}</button>
        </div>
      </div>
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
        <div>
          <div class="dashboard-org-chart__label">${dt("tasks.doneWindow")}</div>
          <div class="card-sub">${dt("tasks.doneWindowSubtitle")}</div>
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
                ${column.tasks.map((task) => {
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
                          ${(task.blockerLinks?.length ?? 0) > 0
                            ? html`
                                <span class="dashboard-task__signal dashboard-task__signal--warn">
                                  ${task.blockerLinks.length}
                                  ${dt("tasks.blockers")}
                                </span>
                              `
                            : nothing}
                        </div>
                      </div>
                      ${summary ? html`<div class="dashboard-task__summary">${summary}</div>` : nothing}
                      <div class="dashboard-task__footer">
                        <div class="dashboard-task__actions">
                          <button class="btn btn--sm" @click=${() => props.onOpenTask(task)}>
                            ${dt("tasks.openSession")}
                          </button>
                          ${preview
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
                            : nothing}
                        </div>
                      </div>
                    </article>
                  `;
                })}
                ${column.tasks.length === 0 ? html`<div class="dashboard-empty">${dt("tasks.empty")}</div>` : nothing}
              </div>
            </section>
          `,
        )}
      </div>
    </section>
  `;
}

function renderWorkshopPage(props: DashboardProps) {
  const items = props.snapshot?.workshop ?? [];
  const selected =
    items.find((item) => item.id === props.workshopSelectedId) ??
    items[0] ??
    null;
  const frameUrl = selected ? workshopFrameUrl(selected) : null;
  const artifactDetail = selected ? workshopArtifactDetail(selected) : null;
  return html`
    <section class="dashboard-page">
      <div class="dashboard-page__header">
        <div>
          <div class="card-title">${titleForTab("dashboardWorkshop")}</div>
          <div class="card-sub">${subtitleForTab("dashboardWorkshop")}</div>
        </div>
        <div class="dashboard-page__actions">
          <button class="btn btn--sm" @click=${props.onRefresh}>${t("common.refresh")}</button>
        </div>
      </div>
      <div class="dashboard-workshop">
        <aside class="dashboard-workshop__list card">
          ${items.map(
            (item) => html`
              <button
                type="button"
                class="dashboard-workshop__item ${selected?.id === item.id ? "dashboard-workshop__item--active" : ""}"
                @click=${() => props.onSelectWorkshop(item.id)}
              >
                <span class="dashboard-workshop__item-title">${item.title}</span>
                <span class="dashboard-workshop__item-meta">
                  ${workshopContextSummary(item)}
                </span>
                <span class="dashboard-workshop__item-meta">
                  ${statusLabel(item.taskStatus)} ·
                  ${item.updatedAtMs ? formatRelativeTimestamp(item.updatedAtMs) : dt("status.waiting")}
                </span>
              </button>
            `,
          )}
          ${items.length === 0 ? html`<div class="dashboard-empty">${dt("workshop.empty")}</div>` : nothing}
        </aside>
        <section class="dashboard-workshop__preview card">
          ${selected
            ? html`
                <div class="dashboard-workshop__hero">
                  <div>
                    <div class="card-title">${selected.title}</div>
                    <div class="card-sub">${workshopContextSummary(selected)}</div>
                  </div>
                  <div class="dashboard-page__actions">
                    <span class="pill">${statusLabel(selected.taskStatus)}</span>
                  </div>
                </div>
                <div class="dashboard-workshop__actions">
                  <button class="btn btn--sm" @click=${() => props.onFilterTasks(selected.taskId)}>
                    ${dt("workshop.filterTasks")}
                  </button>
                  <button class="btn btn--sm" @click=${() => props.onNavigate("tasks")}>
                    ${dt("workshop.openTasks")}
                  </button>
                  ${selected.previewUrl
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
                    : nothing}
                </div>
                <div class="dashboard-workshop__meta-grid">
                  <div class="dashboard-workshop__meta-card">
                    <div class="dashboard-org-chart__label">${dt("workshop.artifact")}</div>
                    <strong>${selected.title}</strong>
                    ${artifactDetail
                      ? html`<div class="dashboard-note__meta"><span>${artifactDetail}</span></div>`
                      : nothing}
                    <div class="dashboard-note__meta">
                      <span>${frameUrl
                        ? dt("workshop.livePreviewInDashboard")
                        : selected.previewUrl
                          ? dt("workshop.livePreviewAvailable")
                          : dt("workshop.noLivePreviewYet")}</span>
                    </div>
                  </div>
                  <div class="dashboard-workshop__meta-card">
                    <div class="dashboard-org-chart__label">${dt("workshop.previewLink")}</div>
                    <strong>${previewLocationLabel(selected.previewUrl) ?? dt("workshop.notPublished")}</strong>
                    ${selected.previewUrl
                      ? html`<div class="dashboard-note__meta"><span>${selected.previewUrl}</span></div>`
                      : nothing}
                  </div>
                  ${selected.taskTitle
                    ? html`
                        <div class="dashboard-workshop__meta-card">
                          <div class="dashboard-org-chart__label">${dt("workshop.sourceTask")}</div>
                          <strong>${selected.taskTitle}</strong>
                          ${selected.taskAssigneeLabel
                            ? html`<div class="dashboard-note__meta"><span>${selected.taskAssigneeLabel}</span></div>`
                            : nothing}
                        </div>
                      `
                    : nothing}
                </div>
                ${frameUrl
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
                        ${selected.previewUrl
                          ? dt("workshop.externalPreview")
                          : selected.artifactPath
                            ? dt("workshop.externalArtifactOnly", { path: selected.artifactPath })
                            : dt("workshop.externalNoPreview")}
                      </div>
                    `}
              `
            : html`<div class="dashboard-empty">${dt("workshop.chooseItem")}</div>`}
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
  const selectedDayEvents = eventsByDay.get(selectedDay) ?? [];
  const hourSlots = Array.from({ length: 24 }, (_, hour) => hour);
  return html`
    <section class="dashboard-page">
      <div class="dashboard-page__header">
        <div>
          <div class="card-title">${titleForTab("dashboardCalendar")}</div>
          <div class="card-sub">${subtitleForTab("dashboardCalendar")}</div>
        </div>
        <div class="dashboard-page__actions">
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
      <div class="dashboard-calendar__toolbar card">
        <div>
          <div class="dashboard-calendar__range">${formatCalendarRange(calendar, anchorAtMs)}</div>
          <div class="card-sub">
            ${dt("calendar.toolbarSubtitle")}
          </div>
        </div>
        <div class="dashboard-note__meta">
          <span>${dt("calendar.visibleItems", { count: String(calendar.events.length) })}</span>
          <span>${dt("calendar.selectedDay", { day: formatLongDayLabel(selectedDay) })}</span>
        </div>
      </div>
      ${
        calendar.view === "month"
          ? html`
              <div class="dashboard-calendar-month-shell">
                <div class="dashboard-calendar-month card">
                  <div class="dashboard-calendar-month__weekdays">
                    ${visibleDays.slice(0, 7).map(
                      (day) => html`<div class="dashboard-calendar-month__weekday">${formatWeekdayLabel(day)}</div>`,
                    )}
                  </div>
                  <div class="dashboard-calendar-month__grid">
                    ${visibleDays.map((day) => {
                      const dayEvents = eventsByDay.get(day) ?? [];
                      const overflowCount = Math.max(0, dayEvents.length - 3);
                      return html`
                        <button
                          type="button"
                          class="dashboard-calendar-month__cell ${!isSameMonth(day, anchorAtMs) ? "dashboard-calendar-month__cell--outside" : ""} ${isSameDay(day, selectedDay) ? "dashboard-calendar-month__cell--selected" : ""} ${isSameDay(day, todayStart) ? "dashboard-calendar-month__cell--today" : ""}"
                          @click=${() => props.onCalendarSelectDay(day)}
                        >
                          <div class="dashboard-calendar-month__cell-header">
                            <span class="dashboard-calendar-month__date">${formatDayNumber(day)}</span>
                            ${dayEvents.length > 0
                              ? html`<span class="dashboard-calendar-month__count">${dayEvents.length}</span>`
                              : nothing}
                          </div>
                          <div class="dashboard-calendar-month__items">
                            ${dayEvents.slice(0, 3).map(
                              (event) => html`
                                <div class="dashboard-calendar-month__item">
                                  <span class="dashboard-calendar-month__item-time">${formatTimeLabel(event.startAtMs)}</span>
                                  <span class="dashboard-calendar-month__item-title">${event.title}</span>
                                </div>
                              `,
                            )}
                            ${overflowCount > 0
                              ? html`<div class="dashboard-calendar-month__more">${dt("calendar.moreItems", { count: String(overflowCount) })}</div>`
                              : nothing}
                          </div>
                        </button>
                      `;
                    })}
                  </div>
                </div>
                <aside class="dashboard-calendar-agenda card">
                  <div class="card-title">${formatLongDayLabel(selectedDay)}</div>
                  <div class="card-sub">
                    ${selectedDayEvents.length === 0
                      ? dt("calendar.nothingScheduled")
                      : dt("calendar.scheduledCount", { count: String(selectedDayEvents.length) })}
                  </div>
                  <div class="dashboard-calendar-agenda__list">
                    ${selectedDayEvents.map(
                      (event) => html`
                        <article class="dashboard-calendar__event dashboard-calendar__event--${event.status}">
                          <div class="dashboard-calendar__event-title">${event.title}</div>
                          <div class="dashboard-calendar__event-meta">
                            <span>${formatTimeLabel(event.startAtMs)}</span>
                            <span>${calendarKindLabel(event.kind)}</span>
                          </div>
                          ${event.description
                            ? html`<div class="dashboard-note__body">${event.description}</div>`
                            : nothing}
                        </article>
                      `,
                    )}
                    ${selectedDayEvents.length === 0
                      ? html`<div class="dashboard-empty">${dt("calendar.pickDifferentDay")}</div>`
                      : nothing}
                  </div>
                </aside>
              </div>
            `
          : html`
              <div class="dashboard-timegrid-wrap card">
                <div
                  class="dashboard-timegrid dashboard-timegrid--${calendar.view}"
                  style=${calendar.view === "week"
                    ? "grid-template-columns: 76px repeat(7, minmax(150px, 1fr));"
                    : "grid-template-columns: 76px minmax(0, 1fr);"}
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
      <div class="dashboard-page__header">
        <div>
          <div class="card-title">${titleForTab("dashboardRoutines")}</div>
          <div class="card-sub">${subtitleForTab("dashboardRoutines")}</div>
        </div>
        <button class="btn btn--sm" @click=${props.onRefresh}>${t("common.refresh")}</button>
      </div>
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
                  time: routine.lastRunAtMs ? formatRelativeTimestamp(routine.lastRunAtMs) : dt("routines.never"),
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
      (entry): entry is { edge: typeof linkEdges[number]; node: DashboardTeamSnapshot["nodes"][number] } =>
        Boolean(entry.node),
    );
  const reviewers = reviewEdges
    .map((edge) => ({
      edge,
      node: nodesById.get(edge.from),
    }))
    .filter(
      (entry): entry is { edge: typeof reviewEdges[number]; node: DashboardTeamSnapshot["nodes"][number] } =>
        Boolean(entry.node),
    );
  const inboundLinks =
    selected
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
                (entry): entry is {
                  edge: DashboardTeamSnapshot["edges"][number];
                  node: DashboardTeamSnapshot["nodes"][number];
                  snapshot: DashboardTeamSnapshot;
                } =>
                  Boolean(entry.node) &&
                  entry.node.kind === "linked_team" &&
                  nodeTargetsSelectedTeam(entry.node.id, selected.teamId),
              ),
          )
      : [];
  const delegateCount = members.length;
  const stageCount = workflowStages.length > 0 ? workflowStages.length : members.length > 0 ? 1 : 0;
  return html`
    <section class="dashboard-page">
      <div class="dashboard-page__header">
        <div>
          <div class="card-title">${titleForTab("dashboardTeams")}</div>
          <div class="card-sub">${subtitleForTab("dashboardTeams")}</div>
        </div>
        <div class="dashboard-page__actions">
          <button class="btn btn--sm" @click=${props.onRefreshTeams}>${dt("teams.refresh")}</button>
          ${props.teamsLoading ? html`<span class="pill">${dt("shell.refreshing")}</span>` : nothing}
        </div>
      </div>
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
          ${selected
            ? html`
                <div class="dashboard-workshop__hero">
                  <div>
                    <div class="card-title">${selected.teamName ?? selected.teamId}</div>
                    <div class="card-sub">
                      ${selected.workflowName ?? selected.workflowId} · ${selected.status === "generated"
                        ? dt("teams.generatedSummary")
                        : dt("teams.fallbackSummary")}
                    </div>
                  </div>
                  <div class="dashboard-page__actions">
                    <span class="pill">${manager?.label ?? dt("teams.noManager")}</span>
                    <span class="pill">${dt("teams.delegateCount", { count: String(delegateCount) })}</span>
                    <span class="pill">${dt("teams.stageCount", { count: String(stageCount) })}</span>
                  </div>
                </div>
                <div class="dashboard-org-chart">
                  <section class="dashboard-org-chart__core">
                    ${inboundLinks.length > 0
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
                      : nothing}
                    <div class="dashboard-org-chart__lane">
                      <article class="dashboard-org-chart__node dashboard-org-chart__node--manager">
                        <div class="dashboard-org-chart__label">${dt("teams.stage.manager")}</div>
                        <strong>${manager?.label ?? dt("task.unassigned")}</strong>
                        ${selected.teamName
                          ? html`<div class="dashboard-note__meta"><span>${selected.teamName}</span></div>`
                          : nothing}
                      </article>
                    </div>
                    ${workflowStages.length > 0
                      ? workflowStages.map(
                          (entry) => html`
                            <div class="dashboard-org-chart__flow-connector" aria-hidden="true"></div>
                            <section class="dashboard-org-chart__stage">
                              <div class="dashboard-org-chart__stage-header">
                                <div class="dashboard-org-chart__arrow">${stageTitleForTeam(entry.stage)}</div>
                                <div class="card-sub">${stageDescriptionForTeam(entry.stage)}</div>
                              </div>
                              <div
                                class="dashboard-org-chart__stage-nodes ${entry.nodes.length === 1
                                  ? "dashboard-org-chart__stage-nodes--single"
                                  : ""}"
                              >
                                ${entry.nodes.map(
                                  (member) => html`
                                    <article class="dashboard-org-chart__node">
                                      <div class="dashboard-org-chart__label">${member.role ?? dt("teams.specialist")}</div>
                                      <strong>${member.label}</strong>
                                      ${member.description
                                        ? html`<div class="dashboard-note__body">${member.description}</div>`
                                        : nothing}
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
                        : html`<div class="dashboard-empty">${dt("teams.noSpecialists")}</div>`}
                  </section>
                  <div class="dashboard-org-chart__support">
                    ${supportMembers.length > 0
                      ? html`
                          <section class="dashboard-org-chart__lane-card">
                            <div class="dashboard-org-chart__arrow">${dt("teams.supportSpecialists")}</div>
                            <div class="dashboard-org-chart__linked">
                              ${supportMembers.map(
                                (member) => html`
                                  <article class="dashboard-org-chart__node">
                                    <div class="dashboard-org-chart__label">${member.role ?? dt("teams.stage.support")}</div>
                                    <strong>${member.label}</strong>
                                    ${member.description
                                      ? html`<div class="dashboard-note__body">${member.description}</div>`
                                      : nothing}
                                  </article>
                                `,
                              )}
                            </div>
                          </section>
                        `
                      : nothing}
                    ${linked.length > 0
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
                      : nothing}
                    ${reviewers.length > 0
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
                      : nothing}
                  </div>
                </div>
                <div class="dashboard-team-summary">
                  <div class="dashboard-org-chart__label">${dt("teams.workflowSummary")}</div>
                  <p>${selected.summary}</p>
                </div>
                ${selected.warnings.length > 0
                  ? html`
                      <div class="callout" style="margin-top: 16px;">
                        ${selected.warnings.map((warning) => html`<div>${warning}</div>`)}
                      </div>
                    `
                  : nothing}
              `
            : html`<div class="dashboard-empty">${dt("teams.selectWorkflow")}</div>`}
        </section>
      </div>
    </section>
  `;
}

function renderMemoriesPage(props: DashboardProps) {
  const agents = resolveMemoryAgentList(props.agentsList);
  const resolvedAgentId =
    props.memoryAgentId ?? props.agentsList?.defaultId ?? agents[0]?.id ?? null;
  const recentActivity = (props.snapshot?.memories ?? []).filter(
    (entry) => !resolvedAgentId || entry.agentId === resolvedAgentId,
  );
  const editableFiles = [DEFAULT_SOUL_FILENAME, DEFAULT_MEMORY_FILENAME];
  return html`
    <section class="dashboard-page">
      <div class="dashboard-page__header">
        <div>
          <div class="card-title">${titleForTab("dashboardMemories")}</div>
          <div class="card-sub">${subtitleForTab("dashboardMemories")}</div>
        </div>
        <div class="dashboard-page__actions">
          <button class="btn btn--sm" @click=${props.onRefresh}>${dt("memories.refreshActivity")}</button>
        </div>
      </div>
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
                  <span>${agent.identity?.name ?? agent.name ?? agent.id}</span>
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
          ${editableFiles.map((name) => {
            const base = props.agentFileContents[name] ?? "";
            const draft = props.agentFileDrafts[name] ?? base;
            const dirty = draft !== base;
            return html`
              <article class="card">
                <div class="dashboard-memory__editor-header">
                  <div>
                    <div class="card-title">${name}</div>
                    <div class="card-sub">${name === DEFAULT_SOUL_FILENAME
                      ? dt("memories.soulSubtitle")
                      : dt("memories.memorySubtitle")}</div>
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
                    props.onMemoryDraftChange(name, (event.target as HTMLTextAreaElement).value)}
                ></textarea>
              </article>
            `;
          })}
        </section>
      </div>
    </section>
  `;
}

export function renderDashboard(props: DashboardProps) {
  const page = dashboardPageForTab(props.tab) ?? "today";
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
          <button class="btn btn--sm" @click=${props.onBackToControl}>
            ${dt("shell.goToAdvance")}
          </button>
        </div>
      </header>

      ${renderDashboardNav(props, page)}

      <main class="dashboard-shell__content">
        ${page === "today"
          ? renderTodayPage(props)
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
                      : renderMemoriesPage(props)}
      </main>
    </div>
  `;
}

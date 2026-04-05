export type DashboardWorkItemStatus = "blocked" | "in_progress" | "review" | "done" | "idle";

export type DashboardWorkItemSource =
  | "team_session"
  | "approval_linked"
  | "runtime_envelope";

export type DashboardWorkItemSessionLinkKind = "primary" | "child" | "approval";

export type DashboardWorkItemSessionLink = {
  sessionKey: string;
  kind: DashboardWorkItemSessionLinkKind;
  agentId?: string;
  assigneeLabel?: string;
  teamId?: string;
  teamRole?: string;
};

export type DashboardWorkItemBlockerKind = "approval" | "failure";

export type DashboardWorkItemBlockerLink = {
  id: string;
  kind: DashboardWorkItemBlockerKind;
  title: string;
  description: string;
  sessionKey?: string;
};

export type DashboardWorkshopPreviewLink = {
  id: string;
  sessionKey: string;
  previewUrl?: string;
  artifactPath?: string;
  embeddable: boolean;
  updatedAtMs: number;
};

export type DashboardWorkItem = {
  id: string;
  sessionKey: string;
  title: string;
  summary?: string;
  status: DashboardWorkItemStatus;
  source: DashboardWorkItemSource;
  agentId?: string;
  assigneeLabel?: string;
  teamId?: string;
  teamLabel?: string;
  teamRole?: string;
  updatedAtMs?: number;
  startedAtMs?: number;
  endedAtMs?: number;
  createdAtMs: number;
  retainedUntilMs?: number;
  parentSessionKey?: string;
  childSessionKeys?: string[];
  blockerIds?: string[];
  sessionLinks: DashboardWorkItemSessionLink[];
  blockerLinks: DashboardWorkItemBlockerLink[];
  previewLinks: DashboardWorkshopPreviewLink[];
};

export type DashboardTask = DashboardWorkItem;
export type DashboardTaskStatus = DashboardWorkItemStatus;

export type DashboardWorkshopItem = {
  id: string;
  sessionKey: string;
  taskId: string;
  title: string;
  summary?: string;
  taskTitle?: string;
  updatedAtMs?: number;
  agentId?: string;
  previewUrl?: string;
  embedUrl?: string;
  artifactPath?: string;
  embeddable: boolean;
  taskStatus: DashboardWorkItemStatus;
  taskAssigneeLabel?: string;
};

export type DashboardCalendarEventKind =
  | "routine_occurrence"
  | "reminder"
  | "approval_needed"
  | "known_activity";

export type DashboardCalendarEventStatus =
  | "scheduled"
  | "running"
  | "done"
  | "error"
  | "needs_action";

export type DashboardCalendarEvent = {
  id: string;
  title: string;
  kind: DashboardCalendarEventKind;
  status: DashboardCalendarEventStatus;
  startAtMs: number;
  endAtMs?: number;
  description?: string;
  jobId?: string;
  routineId?: string;
  agentId?: string;
  taskId?: string;
};

export type DashboardRoutineVisibility = "user_facing" | "hidden";

export type DashboardRoutine = {
  id: string;
  sourceJobId: string;
  title: string;
  description?: string;
  enabled: boolean;
  scheduleLabel: string;
  nextRunAtMs?: number;
  lastRunAtMs?: number;
  lastStatus?: "ok" | "error" | "skipped";
  agentId?: string;
  visibility: DashboardRoutineVisibility;
  visibilitySource: "stored" | "fallback";
};

export type DashboardRecentMemoryEntry = {
  id: string;
  agentId: string;
  title: string;
  path: string;
  updatedAtMs: number;
  excerpt?: string;
};

export type DashboardBlockerSeverity = "error" | "warning" | "info";

export type DashboardBlocker = {
  id: string;
  severity: DashboardBlockerSeverity;
  title: string;
  description: string;
  sessionKey?: string;
  jobId?: string;
  taskId?: string;
};

export type DashboardTodaySnapshot = {
  generatedAtMs: number;
  inProgressTasks: DashboardWorkItem[];
  scheduledToday: DashboardCalendarEvent[];
  blockers: DashboardBlocker[];
  recentMemory: DashboardRecentMemoryEntry[];
};

export type DashboardTasksResult = {
  generatedAtMs: number;
  items: DashboardWorkItem[];
};

export type DashboardWorkshopResult = {
  generatedAtMs: number;
  items: DashboardWorkshopItem[];
};

export type DashboardCalendarView = "month" | "week" | "day";

export type DashboardCalendarResult = {
  generatedAtMs: number;
  anchorAtMs: number;
  startAtMs: number;
  endAtMs: number;
  view: DashboardCalendarView;
  events: DashboardCalendarEvent[];
};

export type DashboardRoutinesResult = {
  generatedAtMs: number;
  items: DashboardRoutine[];
};

export type DashboardMemoriesResult = {
  generatedAtMs: number;
  entries: DashboardRecentMemoryEntry[];
};

export type DashboardTeamNodeKind = "manager" | "member" | "linked_team" | "linked_agent";

export type DashboardTeamNodeStage =
  | "upstream"
  | "manager"
  | "architecture"
  | "execution"
  | "qa"
  | "support";

export type DashboardTeamNode = {
  id: string;
  kind: DashboardTeamNodeKind;
  label: string;
  teamId: string;
  workflowId: string;
  agentId?: string;
  role?: string;
  description?: string;
  stage?: DashboardTeamNodeStage;
  stageIndex?: number;
};

export type DashboardTeamEdgeKind = "delegates" | "reviews" | "links" | "flow";

export type DashboardTeamEdge = {
  id: string;
  from: string;
  to: string;
  kind: DashboardTeamEdgeKind;
  label?: string;
};

export type DashboardTeamSnapshotStatus = "generated" | "fallback";

export type DashboardTeamSnapshot = {
  teamId: string;
  teamName?: string;
  workflowId: string;
  workflowName?: string;
  generatedAtMs: number;
  status: DashboardTeamSnapshotStatus;
  warnings: string[];
  summary: string;
  openProsePreview: string;
  nodes: DashboardTeamNode[];
  edges: DashboardTeamEdge[];
};

export type DashboardTeamSnapshotsResult = {
  generatedAtMs: number;
  snapshots: DashboardTeamSnapshot[];
};

export type DashboardSnapshot = {
  generatedAtMs: number;
  today: DashboardTodaySnapshot;
  tasks: DashboardWorkItem[];
  workshop: DashboardWorkshopItem[];
  calendar: DashboardCalendarEvent[];
  routines: DashboardRoutine[];
  memories: DashboardRecentMemoryEntry[];
};

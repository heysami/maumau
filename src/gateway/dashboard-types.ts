export type DashboardWorkItemStatus = "blocked" | "in_progress" | "review" | "done" | "idle";
export type DashboardWorkItemVisibilityScope = "global" | "team_detail";

export type DashboardWorkItemSource =
  | "team_session"
  | "approval_linked"
  | "runtime_envelope"
  | "direct_session";

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
  suggestion?: string;
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
  visibilityScope?: DashboardWorkItemVisibilityScope;
  source: DashboardWorkItemSource;
  agentId?: string;
  assigneeLabel?: string;
  teamId?: string;
  teamLabel?: string;
  teamRole?: string;
  teamWorkflowId?: string;
  teamWorkflowLabel?: string;
  updatedAtMs?: number;
  startedAtMs?: number;
  endedAtMs?: number;
  createdAtMs: number;
  retainedUntilMs?: number;
  parentSessionKey?: string;
  childSessionKeys?: string[];
  blockerIds?: string[];
  delegatedTeamRunId?: string;
  currentStageId?: string;
  currentStageLabel?: string;
  completedStageIds?: string[];
  completedStepCount?: number;
  totalStepCount?: number;
  progressLabel?: string;
  progressPercent?: number;
  workspaceId?: string;
  workspaceLabel?: string;
  projectName?: string;
  projectKey?: string;
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
  workspaceId?: string;
  workspaceLabel?: string;
  projectName?: string;
  projectKey?: string;
  isSaved?: boolean;
  savedItemId?: string;
  savedAtMs?: number;
};

export type DashboardSavedWorkshopItem = {
  id: string;
  sessionKey?: string;
  taskId?: string;
  title: string;
  summary?: string;
  taskTitle?: string;
  updatedAtMs?: number;
  savedAtMs: number;
  agentId?: string;
  previewUrl?: string;
  embedUrl?: string;
  artifactPath?: string;
  embeddable: boolean;
  taskStatus: DashboardWorkItemStatus;
  taskAssigneeLabel?: string;
  workspaceId?: string;
  workspaceLabel?: string;
  projectName?: string;
  projectKey?: string;
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
  suggestion?: string;
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
  savedItems: DashboardSavedWorkshopItem[];
};

export type DashboardWorkshopSaveResult = {
  generatedAtMs: number;
  savedCount: number;
  updatedCount: number;
  projectUpdateCount: number;
  workshop: DashboardWorkshopResult;
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

export type DashboardUserChannelAccessPolicy = "allowlist" | "open" | "disabled";

export type DashboardUserChannelCapabilityFlags = {
  users: boolean;
  dmSenders: boolean;
  groupSenders: boolean;
  chats: boolean;
  overrides: boolean;
};

export type DashboardUserChannelNoteBlock = {
  title: string;
  lines: string[];
};

export type DashboardUserChannelConnectField = {
  key: string;
  label: string;
  placeholder?: string;
  required: boolean;
  secret?: boolean;
  helpTitle?: string;
  helpLines?: string[];
  currentValue?: string;
};

export type DashboardUserChannelEditableList = {
  label: string;
  placeholder?: string;
  helpTitle?: string;
  helpLines?: string[];
  entries: string[];
  policy?: DashboardUserChannelAccessPolicy;
};

export type DashboardUserChannelOverride = {
  label: string;
  entries: string[];
};

export type DashboardUserChannelUserRow = {
  userId: string;
  userLabel: string;
  identityLabel: string;
  senderId: string;
  senderName?: string;
  senderUsername?: string;
  accountId?: string;
  groupLabels: string[];
  active: boolean;
};

export type DashboardUserChannelQuickSetupKind =
  | "whatsapp"
  | "single-secret"
  | "dual-secret"
  | "single-text";

export type DashboardUserChannelQuickSetupGuidance = {
  identity: string;
  requirements: string[];
  setupSteps: string[];
  artifacts: string[];
};

export type DashboardUserChannelQuickSetupCard = {
  kind: DashboardUserChannelQuickSetupKind;
  sectionTitle: string;
  title: string;
  headline: string;
  message: string;
  badge: string;
  buttonTitle?: string;
  existingCredentialNote?: string;
  setupNote: string;
};

export type DashboardUserChannelConnectSpec = {
  channelId: string;
  label: string;
  detailLabel: string;
  systemImage?: string;
  guidance: DashboardUserChannelQuickSetupGuidance;
  quickSetup: DashboardUserChannelQuickSetupCard;
  fields: DashboardUserChannelConnectField[];
};

export type DashboardUserChannelAccount = {
  accountId: string;
  name?: string | null;
  defaultAccount: boolean;
  configured: boolean;
  linked: boolean;
  enabled: boolean;
  running: boolean;
  connected: boolean;
  users: DashboardUserChannelUserRow[];
  capabilities: DashboardUserChannelCapabilityFlags;
  dmSenders?: DashboardUserChannelEditableList;
  groupSenders?: DashboardUserChannelEditableList;
  chats?: DashboardUserChannelEditableList;
  overrides: DashboardUserChannelOverride[];
};

export type DashboardUserChannel = {
  channelId: string;
  label: string;
  detailLabel: string;
  systemImage?: string;
  accounts: DashboardUserChannelAccount[];
};

export type DashboardUserChannelsResult = {
  generatedAtMs: number;
  channels: DashboardUserChannel[];
  availableChannels: DashboardUserChannelConnectSpec[];
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

export type DashboardTeamLifecycleStage = {
  id: string;
  name?: string;
  status: DashboardWorkItemStatus;
  roles: string[];
};

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
  lifecycleStages?: DashboardTeamLifecycleStage[];
  nodes: DashboardTeamNode[];
  edges: DashboardTeamEdge[];
};

export type DashboardTeamSnapshotsResult = {
  generatedAtMs: number;
  snapshots: DashboardTeamSnapshot[];
};

export type DashboardTeamRun = {
  id: string;
  managerSessionKey: string;
  rootSessionKey?: string;
  rootTaskId?: string;
  title: string;
  summary?: string;
  status: DashboardWorkItemStatus;
  teamId: string;
  teamName?: string;
  workflowId: string;
  workflowName?: string;
  updatedAtMs?: number;
  startedAtMs?: number;
  endedAtMs?: number;
  currentStageId?: string;
  currentStageLabel?: string;
  completedStageIds: string[];
  completedStepCount: number;
  totalStepCount: number;
  progressLabel?: string;
  progressPercent?: number;
  blockerLinks: DashboardWorkItemBlockerLink[];
  items: DashboardWorkItem[];
};

export type DashboardTeamRunsResult = {
  generatedAtMs: number;
  items: DashboardTeamRun[];
};

export type DashboardWalletCardId =
  | "llm"
  | "twilio"
  | "deepgram-realtime"
  | "deepgram-audio"
  | "elevenlabs";

export type DashboardWalletCard = {
  id: DashboardWalletCardId;
  records: number;
  recordLabel: string;
  totalValue: number;
  totalUnit: "usd" | "duration_ms" | "characters";
  totalLabel: string;
  measurement: "exact" | "derived";
  coverage: "full" | "partial";
  secondaryValue?: number;
  secondaryUnit?: "tokens";
  secondaryLabel?: string;
  note?: string;
  missingTotals?: number;
};

export type DashboardWalletResult = {
  generatedAtMs: number;
  startDate: string;
  endDate: string;
  cards: DashboardWalletCard[];
};

export type DashboardSnapshot = {
  generatedAtMs: number;
  today: DashboardTodaySnapshot;
  tasks: DashboardWorkItem[];
  workshop: DashboardWorkshopItem[];
  workshopSaved: DashboardSavedWorkshopItem[];
  calendar: DashboardCalendarEvent[];
  routines: DashboardRoutine[];
  memories: DashboardRecentMemoryEntry[];
};

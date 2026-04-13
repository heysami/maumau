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

export type DashboardAgentAppStatus = "proposed" | "building" | "ready";

export type DashboardAgentAppItem = {
  kind: "agent_app";
  id: string;
  title: string;
  summary?: string;
  updatedAtMs?: number;
  status: DashboardAgentAppStatus;
  ownerLabel?: string;
  ownerAgentId?: string;
  whyNow?: string;
  howItHelps?: string;
  suggestedScope?: string;
  sessionKey?: string;
  taskId?: string;
  taskTitle?: string;
  previewUrl?: string;
  embedUrl?: string;
  artifactPath?: string;
  embeddable: boolean;
  workspaceId?: string;
  workspaceLabel?: string;
  projectName?: string;
  projectKey?: string;
  linkedWorkshopKind?: "recent" | "saved";
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

export type DashboardCalendarActivityScope = "user" | "group" | "global";

export type DashboardCalendarEvent = {
  id: string;
  title: string;
  kind: DashboardCalendarEventKind;
  status: DashboardCalendarEventStatus;
  startAtMs: number;
  endAtMs?: number;
  description?: string;
  activityScope?: DashboardCalendarActivityScope;
  jobId?: string;
  routineId?: string;
  agentId?: string;
  taskId?: string;
};

export type DashboardRoutineVisibility = "user_facing" | "hidden";
export type DashboardRoutineScheduleKind = "at" | "every" | "cron";
export type DashboardRoutinePreviewView = "day" | "week" | "month";

export type DashboardRoutinePreview = {
  view: DashboardRoutinePreviewView;
  anchorAtMs: number;
  startAtMs: number;
  endAtMs: number;
  runAtMs: number[];
};

export type DashboardRoutine = {
  id: string;
  sourceJobId: string;
  title: string;
  description?: string;
  enabled: boolean;
  scheduleKind: DashboardRoutineScheduleKind;
  scheduleLabel: string;
  preview: DashboardRoutinePreview;
  nextRunAtMs?: number;
  lastRunAtMs?: number;
  lastStatus?: "ok" | "error" | "skipped";
  agentId?: string;
  visibility: DashboardRoutineVisibility;
  visibilitySource: "stored" | "fallback";
};

export type DashboardLifeProfileStage = "foundational" | "growth" | "later";
export type DashboardLifeProfileStatus = "recorded" | "missing" | "future";

export type DashboardLifeProfileField = {
  key: string;
  label: string;
  description: string;
  stage: DashboardLifeProfileStage;
  status: DashboardLifeProfileStatus;
  value?: string;
};

export type DashboardLifeProfileNeed = {
  fieldKey: string;
  label: string;
  description: string;
  stage: DashboardLifeProfileStage;
  status: DashboardLifeProfileStatus;
  value?: string;
  why: string;
};

export type DashboardLifeProfileAgent = {
  agentId: string;
  name: string;
  role: string;
  domainId: string;
  domainLabel: string;
  covers: string;
  relatesTo: string;
  recordedCount: number;
  missingCount: number;
  futureCount: number;
  needs: DashboardLifeProfileNeed[];
};

export type DashboardLifeProfileResult = {
  generatedAtMs: number;
  teamConfigured: boolean;
  bootstrapPending: boolean;
  sourceStatus: "loaded" | "missing";
  sourceLabel: string;
  recordedFieldCount: number;
  missingFieldCount: number;
  futureFieldCount: number;
  recordedNeedCount: number;
  missingNeedCount: number;
  futureNeedCount: number;
  fields: DashboardLifeProfileField[];
  agents: DashboardLifeProfileAgent[];
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
  agentApps: DashboardAgentAppItem[];
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

export type DashboardBusinessStatus = "exploring" | "active" | "paused" | "archived";
export type DashboardProjectStatus =
  | "brainstorming"
  | "researching"
  | "proposed"
  | "approved"
  | "building"
  | "live"
  | "paused"
  | "archived";
export type DashboardBusinessFieldStatus = "recorded" | "missing";
export type DashboardBlueprintStatus =
  | "missing"
  | "invalid"
  | "draft"
  | "proposed"
  | "approved"
  | "applied";

export type DashboardBusinessField = {
  key: string;
  label: string;
  description: string;
  value?: string;
  status: DashboardBusinessFieldStatus;
};

export type DashboardBusinessItem = {
  businessId: string;
  businessName: string;
  status: DashboardBusinessStatus;
  sourceLabel: string;
  updatedAtMs?: number;
  recordedFieldCount: number;
  missingFieldCount: number;
  projectCount: number;
  activeProjectCount: number;
  fields: DashboardBusinessField[];
};

export type DashboardProjectItem = {
  businessId: string;
  businessName: string;
  projectId: string;
  projectName: string;
  status: DashboardProjectStatus;
  projectTag: string;
  appNeeded: boolean;
  goal?: string;
  scope?: string;
  teamId?: string;
  linkedWorkspace?: string;
  linkedWorkspaceLabel?: string;
  nextStep?: string;
  proposalSummary?: string;
  updatedAtMs?: number;
  blueprintVersion?: number;
  blueprintStatus: DashboardBlueprintStatus;
  blueprintError?: string;
  linkedTaskCount: number;
  linkedWorkshopCount: number;
  linkedAgentAppCount: number;
};

export type DashboardBusinessResult = {
  generatedAtMs: number;
  items: DashboardBusinessItem[];
};

export type DashboardProjectsResult = {
  generatedAtMs: number;
  items: DashboardProjectItem[];
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
  | "vapi"
  | "deepgram-realtime"
  | "deepgram-audio"
  | "elevenlabs";

export type DashboardWalletSpendGranularity = "day" | "week" | "month" | "year";
export type DashboardWalletSpendBreakdown = "category" | "merchant";

export type DashboardWalletSpendSegment = {
  key: string;
  label: string;
  totalValue: number;
  records: number;
};

export type DashboardWalletSpendBar = {
  key: string;
  label: string;
  startAtMs: number;
  endAtMs: number;
  totalValue: number;
  records: number;
  segments: DashboardWalletSpendSegment[];
};

export type DashboardWalletSpendChart = {
  granularity: DashboardWalletSpendGranularity;
  breakdown: DashboardWalletSpendBreakdown;
  currency: string;
  totalValue: number;
  totalRecords: number;
  maxBarValue: number;
  bars: DashboardWalletSpendBar[];
  legend: DashboardWalletSpendSegment[];
};

export type DashboardWalletSpendResult = {
  records: number;
  lastRecordedAtMs?: number;
  currencies: string[];
  charts: DashboardWalletSpendChart[];
  note?: string;
};

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
  spending: DashboardWalletSpendResult;
};

export type DashboardSnapshot = {
  generatedAtMs: number;
  today: DashboardTodaySnapshot;
  tasks: DashboardWorkItem[];
  workshop: DashboardWorkshopItem[];
  workshopSaved: DashboardSavedWorkshopItem[];
  workshopAgentApps: DashboardAgentAppItem[];
  calendar: DashboardCalendarEvent[];
  routines: DashboardRoutine[];
  lifeProfile: DashboardLifeProfileResult;
  memories: DashboardRecentMemoryEntry[];
};

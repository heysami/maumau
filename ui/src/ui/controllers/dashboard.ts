import type { GatewayBrowserClient } from "../gateway.ts";
import type { Tab } from "../navigation.ts";
import { dashboardPageForTab } from "../navigation.ts";
import type {
  DashboardBusinessResult,
  ConfigSnapshot,
  DashboardCalendarResult,
  DashboardMemoriesResult,
  DashboardProjectsResult,
  DashboardRoutinesResult,
  DashboardSnapshot,
  DashboardTaskFilter,
  DashboardTasksResult,
  DashboardUserChannelsResult,
  DashboardTeamRunsResult,
  DashboardTeamSnapshotsResult,
  DashboardTodaySnapshot,
  DashboardWalletResult,
  DashboardWorkshopResult,
  DashboardWorkshopSaveResult,
} from "../types.ts";
import { serializeConfigForm } from "./config/form-utils.ts";

type DashboardHost = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  tab: Tab;
  dashboardCalendarView: "month" | "week" | "day";
  dashboardCalendarAnchorAtMs: number | null;
  dashboardLoading: boolean;
  dashboardError: string | null;
  dashboardSnapshot: DashboardSnapshot | null;
  dashboardWalletLoading: boolean;
  dashboardWalletError: string | null;
  dashboardWalletResult: DashboardWalletResult | null;
  dashboardWalletStartDate: string;
  dashboardWalletEndDate: string;
  dashboardWalletTimeZone: "local" | "utc";
  dashboardCalendarResult: DashboardCalendarResult | null;
  dashboardBusinessResult: DashboardBusinessResult | null;
  dashboardProjectsResult: DashboardProjectsResult | null;
  dashboardUserChannelsResult: DashboardUserChannelsResult | null;
  dashboardUserChannelId: string | null;
  dashboardUserChannelAccountId: string | null;
  dashboardTeamsLoading: boolean;
  dashboardTeamsError: string | null;
  dashboardTeamSnapshots: DashboardTeamSnapshotsResult | null;
  dashboardTeamRunsLoading: boolean;
  dashboardTeamRunsError: string | null;
  dashboardTeamRuns: DashboardTeamRunsResult | null;
  dashboardTaskFilter: DashboardTaskFilter;
  dashboardWorkshopSelectedId: string | null;
  dashboardWorkshopTab: "saved" | "recent" | "agent-apps";
  dashboardWorkshopSelectedIds: Set<string>;
  dashboardWorkshopProjectDraft: string;
  dashboardWorkshopSaving: boolean;
  dashboardWorkshopSaveError: string | null;
  dashboardReloadTimer: number | null;
  configForm: Record<string, unknown> | null;
  configSnapshot: ConfigSnapshot | null;
  configFormDirty: boolean;
  configFormMode: "form" | "raw";
  configRaw: string;
};

type DashboardDateInterpretationParams = { mode: "utc" } | { mode: "specific"; utcOffset: string };

function formatUtcOffset(timezoneOffsetMinutes: number): string {
  const offsetFromUtcMinutes = -timezoneOffsetMinutes;
  const sign = offsetFromUtcMinutes >= 0 ? "+" : "-";
  const absMinutes = Math.abs(offsetFromUtcMinutes);
  const hours = Math.floor(absMinutes / 60);
  const minutes = absMinutes % 60;
  return minutes === 0
    ? `UTC${sign}${hours}`
    : `UTC${sign}${hours}:${minutes.toString().padStart(2, "0")}`;
}

function buildDashboardDateInterpretationParams(
  timeZone: "local" | "utc",
): DashboardDateInterpretationParams {
  if (timeZone === "utc") {
    return { mode: "utc" };
  }
  return {
    mode: "specific",
    utcOffset: formatUtcOffset(new Date().getTimezoneOffset()),
  };
}

function clearReloadTimer(host: DashboardHost) {
  if (host.dashboardReloadTimer == null) {
    return;
  }
  clearTimeout(host.dashboardReloadTimer);
  host.dashboardReloadTimer = null;
}

function createEmptyDashboardSnapshot(): DashboardSnapshot {
  return {
    generatedAtMs: 0,
    today: {
      generatedAtMs: 0,
      inProgressTasks: [],
      scheduledToday: [],
      blockers: [],
      recentMemory: [],
    },
    tasks: [],
    workshop: [],
    workshopSaved: [],
    workshopAgentApps: [],
    calendar: [],
    routines: [],
    lifeProfile: {
      generatedAtMs: 0,
      teamConfigured: false,
      bootstrapPending: false,
      sourceStatus: "missing",
      sourceLabel: "main/USER.md",
      recordedFieldCount: 0,
      missingFieldCount: 0,
      futureFieldCount: 0,
      recordedNeedCount: 0,
      missingNeedCount: 0,
      futureNeedCount: 0,
      fields: [],
      agents: [],
    },
    memories: [],
  };
}

function ensureDashboardSnapshot(host: DashboardHost): DashboardSnapshot {
  if (!host.dashboardSnapshot) {
    host.dashboardSnapshot = createEmptyDashboardSnapshot();
  }
  return host.dashboardSnapshot;
}

function applyToday(snapshot: DashboardSnapshot, today: DashboardTodaySnapshot) {
  snapshot.today = today;
  snapshot.generatedAtMs = Math.max(snapshot.generatedAtMs, today.generatedAtMs);
}

function applyTasks(snapshot: DashboardSnapshot, result: DashboardTasksResult) {
  snapshot.tasks = result.items;
  snapshot.generatedAtMs = Math.max(snapshot.generatedAtMs, result.generatedAtMs);
}

function applyWorkshop(snapshot: DashboardSnapshot, result: DashboardWorkshopResult) {
  snapshot.workshop = result.items;
  snapshot.workshopSaved = result.savedItems;
  snapshot.workshopAgentApps = result.agentApps;
  snapshot.generatedAtMs = Math.max(snapshot.generatedAtMs, result.generatedAtMs);
}

function synchronizeWorkshopState(
  host: DashboardHost,
  result: DashboardWorkshopResult,
  opts?: { preferSaved?: boolean; defaultToSaved?: boolean },
) {
  const hasSaved = result.savedItems.length > 0;
  const hasRecent = result.items.length > 0;
  const hasAgentApps = result.agentApps.length > 0;
  if (opts?.preferSaved && hasSaved) {
    host.dashboardWorkshopTab = "saved";
  } else if (opts?.defaultToSaved && hasSaved) {
    host.dashboardWorkshopTab = "saved";
  } else if (host.dashboardWorkshopTab === "saved" && hasSaved) {
    host.dashboardWorkshopTab = "saved";
  } else if (host.dashboardWorkshopTab === "recent" && hasRecent) {
    host.dashboardWorkshopTab = "recent";
  } else if (host.dashboardWorkshopTab === "agent-apps" && hasAgentApps) {
    host.dashboardWorkshopTab = "agent-apps";
  } else if (hasRecent) {
    host.dashboardWorkshopTab = "recent";
  } else if (hasAgentApps) {
    host.dashboardWorkshopTab = "agent-apps";
  } else if (hasSaved) {
    host.dashboardWorkshopTab = "saved";
  } else {
    host.dashboardWorkshopTab = "recent";
  }
  const activeItems =
    host.dashboardWorkshopTab === "saved"
      ? result.savedItems
      : host.dashboardWorkshopTab === "agent-apps"
        ? result.agentApps
        : result.items;
  if (!activeItems.some((item) => item.id === host.dashboardWorkshopSelectedId)) {
    host.dashboardWorkshopSelectedId = activeItems[0]?.id ?? null;
  }
  const nextSelectedIds = new Set(
    [...host.dashboardWorkshopSelectedIds].filter((itemId) =>
      result.items.some((item) => item.id === itemId),
    ),
  );
  host.dashboardWorkshopSelectedIds = nextSelectedIds;
}

function applyCalendar(snapshot: DashboardSnapshot, result: DashboardCalendarResult) {
  snapshot.calendar = result.events;
  snapshot.generatedAtMs = Math.max(snapshot.generatedAtMs, result.generatedAtMs);
}

function applyRoutines(snapshot: DashboardSnapshot, result: DashboardRoutinesResult) {
  snapshot.routines = result.items;
  snapshot.generatedAtMs = Math.max(snapshot.generatedAtMs, result.generatedAtMs);
}

function applyMemories(snapshot: DashboardSnapshot, result: DashboardMemoriesResult) {
  snapshot.memories = result.entries;
  snapshot.generatedAtMs = Math.max(snapshot.generatedAtMs, result.generatedAtMs);
}

function synchronizeUserChannelSelection(
  host: Pick<
    DashboardHost,
    "dashboardUserChannelsResult" | "dashboardUserChannelId" | "dashboardUserChannelAccountId"
  >,
) {
  const channels = host.dashboardUserChannelsResult?.channels ?? [];
  if (channels.length === 0) {
    host.dashboardUserChannelId = null;
    host.dashboardUserChannelAccountId = null;
    return;
  }
  const selectedChannel =
    channels.find((channel) => channel.channelId === host.dashboardUserChannelId) ?? channels[0];
  host.dashboardUserChannelId = selectedChannel.channelId;
  const selectedAccount =
    selectedChannel.accounts.find(
      (account) => account.accountId === host.dashboardUserChannelAccountId,
    ) ??
    selectedChannel.accounts.find((account) => account.defaultAccount) ??
    selectedChannel.accounts[0] ??
    null;
  host.dashboardUserChannelAccountId = selectedAccount?.accountId ?? null;
}

function resolveDashboardDraftConfigRaw(host: DashboardHost): string | undefined {
  if (!host.configFormDirty) {
    return undefined;
  }
  if (host.configFormMode === "raw") {
    const raw = host.configRaw.trim();
    return raw ? host.configRaw : undefined;
  }
  if (host.configForm) {
    return serializeConfigForm(host.configForm);
  }
  const snapshotConfig = host.configSnapshot?.config;
  if (snapshotConfig && typeof snapshotConfig === "object") {
    return serializeConfigForm(snapshotConfig as Record<string, unknown>);
  }
  return undefined;
}

async function loadDashboardPageData(host: DashboardHost): Promise<void> {
  if (!host.client || !host.connected) {
    return;
  }
  const page = dashboardPageForTab(host.tab);
  switch (page) {
    case "wallet": {
      const result = await host.client.request<DashboardWalletResult>("dashboard.wallet", {
        startDate: host.dashboardWalletStartDate,
        endDate: host.dashboardWalletEndDate,
        ...buildDashboardDateInterpretationParams(host.dashboardWalletTimeZone),
      });
      host.dashboardWalletResult = result;
      return;
    }
    case "today": {
      const snapshot = ensureDashboardSnapshot(host);
      const today = await host.client.request<DashboardTodaySnapshot>("dashboard.today", {});
      applyToday(snapshot, today);
      return;
    }
    case "tasks": {
      const snapshot = ensureDashboardSnapshot(host);
      const tasks = await host.client.request<DashboardTasksResult>("dashboard.tasks", {});
      applyTasks(snapshot, tasks);
      return;
    }
    case "workshop": {
      const snapshot = ensureDashboardSnapshot(host);
      const hasWorkshopData = Boolean(
        snapshot.workshop.length ||
        snapshot.workshopSaved.length ||
        snapshot.workshopAgentApps.length,
      );
      const workshop = await host.client.request<DashboardWorkshopResult>("dashboard.workshop", {});
      applyWorkshop(snapshot, workshop);
      synchronizeWorkshopState(host, workshop, { defaultToSaved: !hasWorkshopData });
      return;
    }
    case "calendar": {
      const snapshot = ensureDashboardSnapshot(host);
      const calendar = await host.client.request<DashboardCalendarResult>("dashboard.calendar", {
        view: host.dashboardCalendarView,
        anchorAtMs: host.dashboardCalendarAnchorAtMs ?? undefined,
      });
      applyCalendar(snapshot, calendar);
      host.dashboardCalendarResult = calendar;
      return;
    }
    case "routines": {
      const snapshot = ensureDashboardSnapshot(host);
      const routines = await host.client.request<DashboardRoutinesResult>("dashboard.routines", {});
      applyRoutines(snapshot, routines);
      return;
    }
    case "business": {
      host.dashboardBusinessResult = await host.client.request<DashboardBusinessResult>(
        "dashboard.business",
        {},
      );
      host.dashboardProjectsResult = await host.client.request<DashboardProjectsResult>(
        "dashboard.projects",
        {},
      );
      return;
    }
    case "projects": {
      host.dashboardBusinessResult = await host.client.request<DashboardBusinessResult>(
        "dashboard.business",
        {},
      );
      host.dashboardProjectsResult = await host.client.request<DashboardProjectsResult>(
        "dashboard.projects",
        {},
      );
      return;
    }
    case "profile": {
      host.dashboardSnapshot = await host.client.request<DashboardSnapshot>(
        "dashboard.snapshot",
        {},
      );
      return;
    }
    case "user-channels": {
      const result = await host.client.request<DashboardUserChannelsResult>(
        "dashboard.userChannels",
        {},
      );
      host.dashboardUserChannelsResult = result;
      synchronizeUserChannelSelection(host);
      return;
    }
    case "memories": {
      const snapshot = ensureDashboardSnapshot(host);
      const memories = await host.client.request<DashboardMemoriesResult>("dashboard.memories", {});
      applyMemories(snapshot, memories);
      return;
    }
    default:
      return;
  }
}

export async function loadDashboardTeamSnapshots(
  host: DashboardHost,
  opts?: { quiet?: boolean },
): Promise<void> {
  if (!host.client || !host.connected || (host.dashboardTeamsLoading && !opts?.quiet)) {
    return;
  }
  host.dashboardTeamsLoading = true;
  if (!opts?.quiet) {
    host.dashboardTeamsError = null;
  }
  try {
    const rawConfig = resolveDashboardDraftConfigRaw(host);
    const res = await host.client.request<DashboardTeamSnapshotsResult>(
      "dashboard.teams.snapshot",
      rawConfig ? { rawConfig } : {},
    );
    host.dashboardTeamSnapshots = res;
    host.dashboardTeamsError = null;
  } catch (error) {
    host.dashboardTeamsError = String(error);
  } finally {
    host.dashboardTeamsLoading = false;
  }
}

export async function loadDashboardTeamRuns(
  host: DashboardHost,
  opts?: { quiet?: boolean },
): Promise<void> {
  if (!host.client || !host.connected || (host.dashboardTeamRunsLoading && !opts?.quiet)) {
    return;
  }
  host.dashboardTeamRunsLoading = true;
  if (!opts?.quiet) {
    host.dashboardTeamRunsError = null;
  }
  try {
    const res = await host.client.request<DashboardTeamRunsResult>("dashboard.teams.runs", {});
    host.dashboardTeamRuns = res;
    host.dashboardTeamRunsError = null;
  } catch (error) {
    host.dashboardTeamRunsError = String(error);
  } finally {
    host.dashboardTeamRunsLoading = false;
  }
}

export async function loadDashboardData(
  host: DashboardHost,
  opts?: { includeTeams?: boolean; quiet?: boolean },
): Promise<void> {
  const page = dashboardPageForTab(host.tab);
  const isWalletPage = page === "wallet";
  const isLoading = isWalletPage ? host.dashboardWalletLoading : host.dashboardLoading;
  if (!host.client || !host.connected || (isLoading && !opts?.quiet)) {
    return;
  }
  if (isWalletPage) {
    host.dashboardWalletLoading = true;
    if (!opts?.quiet) {
      host.dashboardWalletError = null;
    }
  } else {
    host.dashboardLoading = true;
    if (!opts?.quiet) {
      host.dashboardError = null;
    }
  }
  try {
    await loadDashboardPageData(host);
    if (isWalletPage) {
      host.dashboardWalletError = null;
    } else {
      host.dashboardError = null;
    }
  } catch (error) {
    if (isWalletPage) {
      host.dashboardWalletError = String(error);
    } else {
      host.dashboardError = String(error);
    }
  } finally {
    if (isWalletPage) {
      host.dashboardWalletLoading = false;
    } else {
      host.dashboardLoading = false;
    }
  }
  if (!isWalletPage && (opts?.includeTeams || host.tab === "dashboardTasks")) {
    await loadDashboardTeamSnapshots(host, opts);
    await loadDashboardTeamRuns(host, opts);
  }
}

export async function saveDashboardWorkshopSelection(host: DashboardHost): Promise<void> {
  if (!host.client || !host.connected || host.dashboardWorkshopSaving) {
    return;
  }
  const itemIds = [...host.dashboardWorkshopSelectedIds];
  const projectName = host.dashboardWorkshopProjectDraft.trim();
  if (itemIds.length === 0 || !projectName) {
    return;
  }
  host.dashboardWorkshopSaving = true;
  host.dashboardWorkshopSaveError = null;
  try {
    const result = await host.client.request<DashboardWorkshopSaveResult>(
      "dashboard.workshop.save",
      {
        itemIds,
        projectName,
      },
    );
    const snapshot = ensureDashboardSnapshot(host);
    applyWorkshop(snapshot, result.workshop);
    host.dashboardWorkshopSelectedIds = new Set();
    synchronizeWorkshopState(host, result.workshop, { preferSaved: true });
  } catch (error) {
    host.dashboardWorkshopSaveError = String(error);
  } finally {
    host.dashboardWorkshopSaving = false;
  }
}

export async function connectDashboardUserChannel(
  host: Pick<
    DashboardHost,
    | "client"
    | "connected"
    | "dashboardLoading"
    | "dashboardError"
    | "dashboardUserChannelsResult"
    | "dashboardUserChannelId"
    | "dashboardUserChannelAccountId"
  >,
  params: {
    channelId: string;
    fields: Record<string, string>;
    dmPolicy?: string;
    allowFrom?: string;
    chatPolicy?: string;
    chatEntries?: string;
  },
): Promise<void> {
  if (!host.client || !host.connected) {
    return;
  }
  host.dashboardLoading = true;
  host.dashboardError = null;
  try {
    await host.client.request("dashboard.userChannels.connect", params);
    const result = await host.client.request<DashboardUserChannelsResult>(
      "dashboard.userChannels",
      {},
    );
    host.dashboardUserChannelsResult = result;
    host.dashboardUserChannelId = params.channelId;
    synchronizeUserChannelSelection(host);
    host.dashboardError = null;
  } catch (error) {
    host.dashboardError = String(error);
  } finally {
    host.dashboardLoading = false;
  }
}

export async function setDashboardUserChannelAllowlist(
  host: Pick<
    DashboardHost,
    | "client"
    | "connected"
    | "dashboardLoading"
    | "dashboardError"
    | "dashboardUserChannelsResult"
    | "dashboardUserChannelId"
    | "dashboardUserChannelAccountId"
  >,
  params: {
    channelId: string;
    accountId: string;
    scope: "dm" | "group";
    entries: string;
  },
): Promise<void> {
  if (!host.client || !host.connected) {
    return;
  }
  host.dashboardLoading = true;
  host.dashboardError = null;
  try {
    await host.client.request("dashboard.userChannels.allowlist.set", params);
    const result = await host.client.request<DashboardUserChannelsResult>(
      "dashboard.userChannels",
      {},
    );
    host.dashboardUserChannelsResult = result;
    host.dashboardUserChannelId = params.channelId;
    host.dashboardUserChannelAccountId = params.accountId;
    synchronizeUserChannelSelection(host);
    host.dashboardError = null;
  } catch (error) {
    host.dashboardError = String(error);
  } finally {
    host.dashboardLoading = false;
  }
}

export async function setDashboardUserChannelChats(
  host: Pick<
    DashboardHost,
    | "client"
    | "connected"
    | "dashboardLoading"
    | "dashboardError"
    | "dashboardUserChannelsResult"
    | "dashboardUserChannelId"
    | "dashboardUserChannelAccountId"
  >,
  params: {
    channelId: string;
    accountId: string;
    policy: "allowlist" | "open" | "disabled";
    entries: string;
  },
): Promise<void> {
  if (!host.client || !host.connected) {
    return;
  }
  host.dashboardLoading = true;
  host.dashboardError = null;
  try {
    await host.client.request("dashboard.userChannels.chats.set", params);
    const result = await host.client.request<DashboardUserChannelsResult>(
      "dashboard.userChannels",
      {},
    );
    host.dashboardUserChannelsResult = result;
    host.dashboardUserChannelId = params.channelId;
    host.dashboardUserChannelAccountId = params.accountId;
    synchronizeUserChannelSelection(host);
    host.dashboardError = null;
  } catch (error) {
    host.dashboardError = String(error);
  } finally {
    host.dashboardLoading = false;
  }
}

export function scheduleDashboardReload(
  host: DashboardHost,
  opts?: { delayMs?: number; includeTeams?: boolean },
) {
  clearReloadTimer(host);
  host.dashboardReloadTimer = Number(
    globalThis.setTimeout(
      () => {
        host.dashboardReloadTimer = null;
        void loadDashboardData(host, { includeTeams: opts?.includeTeams, quiet: true });
      },
      Math.max(0, opts?.delayMs ?? 120),
    ),
  );
}

export function clearScheduledDashboardReload(host: DashboardHost) {
  clearReloadTimer(host);
}

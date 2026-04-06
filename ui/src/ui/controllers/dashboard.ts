import type { GatewayBrowserClient } from "../gateway.ts";
import type { Tab } from "../navigation.ts";
import { dashboardPageForTab } from "../navigation.ts";
import type {
  ConfigSnapshot,
  DashboardCalendarResult,
  DashboardMemoriesResult,
  DashboardRoutinesResult,
  DashboardSnapshot,
  DashboardTaskFilter,
  DashboardTasksResult,
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
  dashboardTeamsLoading: boolean;
  dashboardTeamsError: string | null;
  dashboardTeamSnapshots: DashboardTeamSnapshotsResult | null;
  dashboardTeamRunsLoading: boolean;
  dashboardTeamRunsError: string | null;
  dashboardTeamRuns: DashboardTeamRunsResult | null;
  dashboardTaskFilter: DashboardTaskFilter;
  dashboardWorkshopSelectedId: string | null;
  dashboardWorkshopTab: "saved" | "recent";
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

type DashboardDateInterpretationParams =
  | { mode: "utc" }
  | { mode: "specific"; utcOffset: string };

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
    calendar: [],
    routines: [],
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
  snapshot.generatedAtMs = Math.max(snapshot.generatedAtMs, result.generatedAtMs);
}

function synchronizeWorkshopState(
  host: DashboardHost,
  result: DashboardWorkshopResult,
  opts?: { preferSaved?: boolean; defaultToSaved?: boolean },
) {
  if (opts?.preferSaved && result.savedItems.length > 0) {
    host.dashboardWorkshopTab = "saved";
  } else if (result.savedItems.length === 0) {
    host.dashboardWorkshopTab = "recent";
  } else if (opts?.defaultToSaved) {
    host.dashboardWorkshopTab = "saved";
  } else if (host.dashboardWorkshopTab !== "saved" && host.dashboardWorkshopTab !== "recent") {
    host.dashboardWorkshopTab = "saved";
  }
  const activeItems = host.dashboardWorkshopTab === "saved" ? result.savedItems : result.items;
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
      const hasWorkshopData = Boolean(snapshot.workshop.length || snapshot.workshopSaved.length);
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

export function scheduleDashboardReload(
  host: DashboardHost,
  opts?: { delayMs?: number; includeTeams?: boolean },
) {
  clearReloadTimer(host);
  host.dashboardReloadTimer = globalThis.setTimeout(
    () => {
      host.dashboardReloadTimer = null;
      void loadDashboardData(host, { includeTeams: opts?.includeTeams, quiet: true });
    },
    Math.max(0, opts?.delayMs ?? 120),
  );
}

export function clearScheduledDashboardReload(host: DashboardHost) {
  clearReloadTimer(host);
}

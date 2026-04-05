import type { Tab } from "../navigation.ts";
import { dashboardPageForTab } from "../navigation.ts";
import type { GatewayBrowserClient } from "../gateway.ts";
import type {
  DashboardCalendarResult,
  DashboardMemoriesResult,
  DashboardRoutinesResult,
  DashboardSnapshot,
  DashboardTasksResult,
  DashboardTeamSnapshotsResult,
  DashboardTodaySnapshot,
  DashboardWorkshopResult,
} from "../types.ts";

type DashboardHost = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  tab: Tab;
  dashboardCalendarView: "month" | "week" | "day";
  dashboardCalendarAnchorAtMs: number | null;
  dashboardLoading: boolean;
  dashboardError: string | null;
  dashboardSnapshot: DashboardSnapshot | null;
  dashboardCalendarResult: DashboardCalendarResult | null;
  dashboardTeamsLoading: boolean;
  dashboardTeamsError: string | null;
  dashboardTeamSnapshots: DashboardTeamSnapshotsResult | null;
  dashboardReloadTimer: number | null;
};

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
  snapshot.generatedAtMs = Math.max(snapshot.generatedAtMs, result.generatedAtMs);
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

async function loadDashboardPageData(
  host: DashboardHost,
): Promise<void> {
  if (!host.client || !host.connected) {
    return;
  }
  const snapshot = ensureDashboardSnapshot(host);
  const page = dashboardPageForTab(host.tab);
  switch (page) {
    case "today": {
      const today = await host.client.request<DashboardTodaySnapshot>("dashboard.today", {});
      applyToday(snapshot, today);
      return;
    }
    case "tasks": {
      const tasks = await host.client.request<DashboardTasksResult>("dashboard.tasks", {});
      applyTasks(snapshot, tasks);
      return;
    }
    case "workshop": {
      const workshop = await host.client.request<DashboardWorkshopResult>("dashboard.workshop", {});
      applyWorkshop(snapshot, workshop);
      return;
    }
    case "calendar": {
      const calendar = await host.client.request<DashboardCalendarResult>("dashboard.calendar", {
        view: host.dashboardCalendarView,
        anchorAtMs: host.dashboardCalendarAnchorAtMs ?? undefined,
      });
      applyCalendar(snapshot, calendar);
      host.dashboardCalendarResult = calendar;
      return;
    }
    case "routines": {
      const routines = await host.client.request<DashboardRoutinesResult>("dashboard.routines", {});
      applyRoutines(snapshot, routines);
      return;
    }
    case "memories": {
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
    const res = await host.client.request<DashboardTeamSnapshotsResult>(
      "dashboard.teams.snapshot",
      {},
    );
    host.dashboardTeamSnapshots = res;
    host.dashboardTeamsError = null;
  } catch (error) {
    host.dashboardTeamsError = String(error);
  } finally {
    host.dashboardTeamsLoading = false;
  }
}

export async function loadDashboardData(
  host: DashboardHost,
  opts?: { includeTeams?: boolean; quiet?: boolean },
): Promise<void> {
  if (!host.client || !host.connected || (host.dashboardLoading && !opts?.quiet)) {
    return;
  }
  host.dashboardLoading = true;
  if (!opts?.quiet) {
    host.dashboardError = null;
  }
  try {
    await loadDashboardPageData(host);
    host.dashboardError = null;
  } catch (error) {
    host.dashboardError = String(error);
  } finally {
    host.dashboardLoading = false;
  }
  if (opts?.includeTeams || host.tab === "dashboardTeams") {
    await loadDashboardTeamSnapshots(host, opts);
  }
}

export function scheduleDashboardReload(
  host: DashboardHost,
  opts?: { delayMs?: number; includeTeams?: boolean },
) {
  clearReloadTimer(host);
  host.dashboardReloadTimer = globalThis.setTimeout(() => {
    host.dashboardReloadTimer = null;
    void loadDashboardData(host, { includeTeams: opts?.includeTeams, quiet: true });
  }, Math.max(0, opts?.delayMs ?? 120));
}

export function clearScheduledDashboardReload(host: DashboardHost) {
  clearReloadTimer(host);
}

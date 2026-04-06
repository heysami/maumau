import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadDashboardData,
  loadDashboardTeamSnapshots,
  saveDashboardWorkshopSelection,
} from "./dashboard.ts";

function createHost() {
  return {
    client: {
      request: vi.fn().mockResolvedValue({
        generatedAtMs: 123,
        snapshots: [],
      }),
    },
    connected: true,
    tab: "dashboardTeams",
    dashboardCalendarView: "month" as const,
    dashboardCalendarAnchorAtMs: null,
    dashboardLoading: false,
    dashboardError: null,
    dashboardSnapshot: null,
    dashboardWalletLoading: false,
    dashboardWalletError: null,
    dashboardWalletResult: null,
    dashboardWalletStartDate: "2026-03-01",
    dashboardWalletEndDate: "2026-03-30",
    dashboardWalletTimeZone: "local" as const,
    dashboardCalendarResult: null,
    dashboardTeamsLoading: false,
    dashboardTeamsError: null,
    dashboardTeamSnapshots: null,
    dashboardTeamRunsLoading: false,
    dashboardTeamRunsError: null,
    dashboardTeamRuns: null,
    dashboardTaskFilter: null,
    dashboardWorkshopSelectedId: null,
    dashboardWorkshopTab: "recent" as const,
    dashboardWorkshopSelectedIds: new Set<string>(),
    dashboardWorkshopProjectDraft: "",
    dashboardWorkshopSaving: false,
    dashboardWorkshopSaveError: null,
    dashboardReloadTimer: null,
    configForm: null,
    configSnapshot: null,
    configFormDirty: false,
    configFormMode: "form" as const,
    configRaw: "",
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("loadDashboardTeamSnapshots", () => {
  it("sends the dirty form draft config when available", async () => {
    const host = createHost();
    host.configFormDirty = true;
    host.configForm = {
      teams: {
        list: [
          {
            id: "vibe-coder",
            managerAgentId: "vibe-coder-manager",
            workflows: [
              {
                id: "default",
                lifecycle: {
                  stages: [
                    {
                      id: "planning",
                      name: "Planning",
                      status: "in_progress",
                      roles: [],
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    };

    await loadDashboardTeamSnapshots(host);

    expect(host.client.request).toHaveBeenCalledWith("dashboard.teams.snapshot", {
      rawConfig:
        "{\n" +
        '  "teams": {\n' +
        '    "list": [\n' +
        "      {\n" +
        '        "id": "vibe-coder",\n' +
        '        "managerAgentId": "vibe-coder-manager",\n' +
        '        "workflows": [\n' +
        "          {\n" +
        '            "id": "default",\n' +
        '            "lifecycle": {\n' +
        '              "stages": [\n' +
        "                {\n" +
        '                  "id": "planning",\n' +
        '                  "name": "Planning",\n' +
        '                  "status": "in_progress",\n' +
        '                  "roles": []\n' +
        "                }\n" +
        "              ]\n" +
        "            }\n" +
        "          }\n" +
        "        ]\n" +
        "      }\n" +
        "    ]\n" +
        "  }\n" +
        "}\n",
    });
  });

  it("uses the raw draft while editing raw config mode", async () => {
    const host = createHost();
    host.configFormDirty = true;
    host.configFormMode = "raw";
    host.configRaw = '{ "teams": { "list": [] } }\n';

    await loadDashboardTeamSnapshots(host);

    expect(host.client.request).toHaveBeenCalledWith("dashboard.teams.snapshot", {
      rawConfig: '{ "teams": { "list": [] } }\n',
    });
  });

  it("omits draft params when the config is clean", async () => {
    const host = createHost();

    await loadDashboardTeamSnapshots(host);

    expect(host.client.request).toHaveBeenCalledWith("dashboard.teams.snapshot", {});
  });
});

describe("dashboard workshop controller state", () => {
  it("loads wallet data with local date interpretation by default", async () => {
    const host = createHost();
    host.tab = "dashboardWallet";
    vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(-480);
    host.client.request = vi.fn().mockResolvedValue({
      generatedAtMs: 123,
      startDate: "2026-03-01",
      endDate: "2026-03-30",
      cards: [],
    });

    await loadDashboardData(host);

    expect(host.client.request).toHaveBeenCalledWith("dashboard.wallet", {
      startDate: "2026-03-01",
      endDate: "2026-03-30",
      mode: "specific",
      utcOffset: "UTC+8",
    });
    expect(host.dashboardWalletResult?.cards).toEqual([]);
    expect(host.dashboardSnapshot).toBeNull();
  });

  it("loads wallet data in UTC mode when selected", async () => {
    const host = createHost();
    host.tab = "dashboardWallet";
    host.dashboardWalletTimeZone = "utc";
    host.client.request = vi.fn().mockResolvedValue({
      generatedAtMs: 123,
      startDate: "2026-03-01",
      endDate: "2026-03-30",
      cards: [],
    });

    await loadDashboardData(host);

    expect(host.client.request).toHaveBeenCalledWith("dashboard.wallet", {
      startDate: "2026-03-01",
      endDate: "2026-03-30",
      mode: "utc",
    });
  });

  it("defaults workshop to saved when saved items are available", async () => {
    const host = createHost();
    host.tab = "dashboardWorkshop";
    host.client.request = vi.fn(async (method: string) => {
      if (method === "dashboard.workshop") {
        return {
          generatedAtMs: 123,
          items: [],
          savedItems: [
            {
              id: "saved:1",
              title: "Saved preview",
              taskStatus: "done",
              savedAtMs: 123,
              embeddable: false,
            },
          ],
        };
      }
      throw new Error(`unexpected method ${method}`);
    });

    await loadDashboardData(host);

    expect(host.dashboardWorkshopTab).toBe("saved");
    expect(host.dashboardWorkshopSelectedId).toBe("saved:1");
  });

  it("keeps workshop on recent when there are no saved items", async () => {
    const host = createHost();
    host.tab = "dashboardWorkshop";
    host.client.request = vi.fn(async (method: string) => {
      if (method === "dashboard.workshop") {
        return {
          generatedAtMs: 123,
          items: [
            {
              id: "workshop:1",
              title: "Recent preview",
              taskId: "task:1",
              taskStatus: "done",
              sessionKey: "main",
              embeddable: false,
            },
          ],
          savedItems: [],
        };
      }
      throw new Error(`unexpected method ${method}`);
    });

    await loadDashboardData(host);

    expect(host.dashboardWorkshopTab).toBe("recent");
    expect(host.dashboardWorkshopSelectedId).toBe("workshop:1");
  });

  it("saves selected workshop items, clears selection, and switches to saved", async () => {
    const host = createHost();
    host.dashboardSnapshot = {
      generatedAtMs: 1,
      today: {
        generatedAtMs: 1,
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
    host.dashboardWorkshopSelectedIds = new Set(["workshop:1"]);
    host.dashboardWorkshopProjectDraft = "Alpha";
    host.client.request = vi.fn(async (method: string, params?: unknown) => {
      if (method === "dashboard.workshop.save") {
        expect(params).toEqual({
          itemIds: ["workshop:1"],
          projectName: "Alpha",
        });
        return {
          generatedAtMs: 123,
          savedCount: 1,
          updatedCount: 0,
          projectUpdateCount: 1,
          workshop: {
            generatedAtMs: 123,
            items: [],
            savedItems: [
              {
                id: "saved:1",
                title: "Saved preview",
                taskStatus: "done",
                savedAtMs: 123,
                embeddable: false,
              },
            ],
          },
        };
      }
      throw new Error(`unexpected method ${method}`);
    });

    await saveDashboardWorkshopSelection(host);

    expect(host.dashboardWorkshopSaving).toBe(false);
    expect(host.dashboardWorkshopSaveError).toBeNull();
    expect(host.dashboardWorkshopSelectedIds.size).toBe(0);
    expect(host.dashboardWorkshopTab).toBe("saved");
    expect(host.dashboardWorkshopSelectedId).toBe("saved:1");
    expect(host.dashboardSnapshot?.workshopSaved).toHaveLength(1);
  });
});

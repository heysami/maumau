import { afterEach, describe, expect, it, vi } from "vitest";
import type { GatewayBrowserClient } from "../gateway.ts";
import {
  loadDashboardData,
  loadDashboardTeamSnapshots,
  saveDashboardWorkshopSelection,
} from "./dashboard.ts";

type DashboardTestHost = Parameters<typeof loadDashboardData>[0] & {
  client: GatewayBrowserClient & {
    request: ReturnType<typeof vi.fn>;
  };
};

function setClientRequest(
  host: DashboardTestHost,
  implementation: (...args: unknown[]) => Promise<unknown>,
) {
  host.client.request = vi.fn(implementation) as DashboardTestHost["client"]["request"];
}

function createHost(): DashboardTestHost {
  return {
    client: {
      request: vi.fn().mockResolvedValue({
        generatedAtMs: 123,
        snapshots: [],
      }),
    } as unknown as DashboardTestHost["client"],
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
    dashboardWalletTimeZone: "local",
    dashboardCalendarResult: null,
    dashboardBusinessResult: null,
    dashboardProjectsResult: null,
    dashboardUserChannelsResult: null,
    dashboardUserChannelId: null,
    dashboardUserChannelAccountId: null,
    dashboardTeamsLoading: false,
    dashboardTeamsError: null,
    dashboardTeamSnapshots: null,
    dashboardTeamRunsLoading: false,
    dashboardTeamRunsError: null,
    dashboardTeamRuns: null,
    dashboardTaskFilter: null,
    dashboardWorkshopSelectedId: null,
    dashboardWorkshopTab: "recent",
    dashboardWorkshopSelectedIds: new Set<string>(),
    dashboardWorkshopProjectDraft: "",
    dashboardWorkshopSaving: false,
    dashboardWorkshopSaveError: null,
    dashboardReloadTimer: null,
    configForm: null,
    configSnapshot: null,
    configFormDirty: false,
    configFormMode: "form",
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
    setClientRequest(host, async () => ({
      generatedAtMs: 123,
      startDate: "2026-03-01",
      endDate: "2026-03-30",
      cards: [],
      spending: {
        records: 0,
        currencies: [],
        charts: [],
      },
    }));

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
    setClientRequest(host, async () => ({
      generatedAtMs: 123,
      startDate: "2026-03-01",
      endDate: "2026-03-30",
      cards: [],
      spending: {
        records: 0,
        currencies: [],
        charts: [],
      },
    }));

    await loadDashboardData(host);

    expect(host.client.request).toHaveBeenCalledWith("dashboard.wallet", {
      startDate: "2026-03-01",
      endDate: "2026-03-30",
      mode: "utc",
    });
  });

  it("loads user channel data and chooses the first configured account", async () => {
    const host = createHost();
    host.tab = "dashboardUserChannels";
    setClientRequest(host, async () => ({
      generatedAtMs: 123,
      channels: [
        {
          channelId: "discord",
          label: "Discord",
          detailLabel: "Discord",
          accounts: [
            {
              accountId: "default",
              defaultAccount: true,
              configured: true,
              linked: false,
              enabled: true,
              running: false,
              connected: false,
              users: [],
              capabilities: {
                users: true,
                dmSenders: true,
                groupSenders: false,
                chats: true,
                overrides: false,
              },
              overrides: [],
            },
          ],
        },
      ],
      availableChannels: [],
    }));

    await loadDashboardData(host);

    expect(host.client.request).toHaveBeenCalledWith("dashboard.userChannels", {});
    expect(host.dashboardUserChannelId).toBe("discord");
    expect(host.dashboardUserChannelAccountId).toBe("default");
  });

  it("defaults workshop to saved when saved items are available", async () => {
    const host = createHost();
    host.tab = "dashboardWorkshop";
    setClientRequest(host, async (method) => {
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
          agentApps: [],
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
    setClientRequest(host, async (method) => {
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
          agentApps: [],
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
      workshopAgentApps: [],
      calendar: [],
      routines: [],
      lifeProfile: {
        generatedAtMs: 1,
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
    host.dashboardWorkshopSelectedIds = new Set(["workshop:1"]);
    host.dashboardWorkshopProjectDraft = "Alpha";
    setClientRequest(host, async (method, params) => {
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
            agentApps: [],
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

  it("uses the agent apps tab when there are no saved or recent workshop items", async () => {
    const host = createHost();
    host.tab = "dashboardWorkshop";
    setClientRequest(host, async (method) => {
      if (method === "dashboard.workshop") {
        return {
          generatedAtMs: 123,
          items: [],
          savedItems: [],
          agentApps: [
            {
              kind: "agent_app",
              id: "agent-app:reset-board",
              title: "Reset board",
              status: "proposed",
              ownerLabel: "Accountability Partner",
              embeddable: false,
            },
          ],
        };
      }
      throw new Error(`unexpected method ${method}`);
    });

    await loadDashboardData(host);

    expect(host.dashboardWorkshopTab).toBe("agent-apps");
    expect(host.dashboardWorkshopSelectedId).toBe("agent-app:reset-board");
  });
});

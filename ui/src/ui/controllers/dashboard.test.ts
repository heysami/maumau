import { describe, expect, it, vi } from "vitest";
import { loadDashboardTeamSnapshots } from "./dashboard.ts";

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
    dashboardCalendarResult: null,
    dashboardTeamsLoading: false,
    dashboardTeamsError: null,
    dashboardTeamSnapshots: null,
    dashboardTeamRunsLoading: false,
    dashboardTeamRunsError: null,
    dashboardTeamRuns: null,
    dashboardReloadTimer: null,
    configForm: null,
    configSnapshot: null,
    configFormDirty: false,
    configFormMode: "form" as const,
    configRaw: "",
  };
}

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
        '{\n' +
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
        '}\n',
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

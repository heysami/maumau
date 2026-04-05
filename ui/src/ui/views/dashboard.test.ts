/* @vitest-environment jsdom */

import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import type {
  DashboardSnapshot,
  DashboardTask,
  DashboardTeamRun,
  DashboardTeamRunsResult,
  DashboardTeamSnapshotsResult,
} from "../types.ts";
import { createEmptyMauOfficeState } from "../controllers/mau-office.ts";
import { renderDashboard } from "./dashboard.ts";

function buildTask(overrides: Partial<DashboardTask> = {}): DashboardTask {
  return {
    id: "task:root",
    sessionKey: "main",
    title: "Build checkout flow",
    status: "in_progress",
    source: "runtime_envelope",
    createdAtMs: 1,
    sessionLinks: [],
    blockerLinks: [],
    previewLinks: [],
    ...overrides,
  };
}

function buildSnapshot(tasks: DashboardTask[]): DashboardSnapshot {
  return {
    generatedAtMs: 1,
    today: {
      generatedAtMs: 1,
      inProgressTasks: tasks.filter((task) => task.status === "in_progress" || task.status === "review"),
      scheduledToday: [],
      blockers: [],
      recentMemory: [],
    },
    tasks,
    workshop: [],
    calendar: [],
    routines: [],
    memories: [],
  };
}

function buildTeamSnapshots(): DashboardTeamSnapshotsResult {
  return {
    generatedAtMs: 1,
    snapshots: [
      {
        teamId: "vibe-coder",
        teamName: "Vibe Coder",
        workflowId: "default",
        workflowName: "Default Workflow",
        generatedAtMs: 1,
        status: "generated",
        warnings: [],
        summary: "Stage-gated team for planning, implementation, and QA.",
        openProsePreview: "agent manager:",
        lifecycleStages: [
          { id: "planning", name: "Planning", status: "in_progress", roles: ["manager"] },
          { id: "architecture", name: "Architecture", status: "in_progress", roles: ["system architect"] },
          { id: "execution", name: "Execution", status: "in_progress", roles: ["developer", "designer"] },
          { id: "qa", name: "QA", status: "in_progress", roles: ["technical qa"] },
          { id: "manager_confirmation", name: "Manager Confirmation", status: "review", roles: ["manager"] },
        ],
        nodes: [
          {
            id: "vibe-coder:manager",
            kind: "manager",
            label: "Vibe Coder Manager",
            teamId: "vibe-coder",
            workflowId: "default",
          },
          {
            id: "vibe-coder:developer",
            kind: "member",
            label: "Developer",
            teamId: "vibe-coder",
            workflowId: "default",
            role: "developer",
            stage: "execution",
          },
        ],
        edges: [],
      },
    ],
  };
}

function buildTeamRuns(): DashboardTeamRunsResult {
  const manager = buildTask({
    id: "task:manager",
    sessionKey: "agent:vibe-coder-manager:subagent:1",
    title: "Build checkout flow",
    teamId: "vibe-coder",
    teamLabel: "Vibe Coder",
    teamRole: "manager",
    assigneeLabel: "Vibe Coder Manager",
    visibilityScope: "team_detail",
    currentStageId: "qa",
    currentStageLabel: "QA",
    progressLabel: "3/6 · QA",
    progressPercent: 50,
  });
  const qa = buildTask({
    id: "task:qa",
    sessionKey: "agent:vibe-coder-technical-qa:subagent:1",
    title: "Technical QA for checkout flow",
    teamId: "vibe-coder",
    teamLabel: "Vibe Coder",
    teamRole: "technical qa",
    assigneeLabel: "Technical QA",
    visibilityScope: "team_detail",
    currentStageId: "qa",
    currentStageLabel: "QA",
    progressLabel: "3/6 · QA",
    progressPercent: 50,
  });

  const run: DashboardTeamRun = {
    id: "team-run:agent:vibe-coder-manager:subagent:1",
    managerSessionKey: manager.sessionKey,
    rootSessionKey: "main",
    rootTaskId: "task:root",
    title: "Build checkout flow",
    summary: "Architecture is complete and QA is verifying the implementation.",
    status: "in_progress",
    teamId: "vibe-coder",
    teamName: "Vibe Coder",
    workflowId: "default",
    workflowName: "Default Workflow",
    updatedAtMs: 1,
    currentStageId: "qa",
    currentStageLabel: "QA",
    completedStageIds: ["planning", "architecture", "execution"],
    completedStepCount: 3,
    totalStepCount: 6,
    progressLabel: "3/6 · QA",
    progressPercent: 50,
    blockerLinks: [],
    items: [manager, qa],
  };

  return {
    generatedAtMs: 1,
    items: [run],
  };
}

function buildProps(
  overrides: Partial<Parameters<typeof renderDashboard>[0]> = {},
): Parameters<typeof renderDashboard>[0] {
  return {
    tab: "dashboardTasks",
    loading: false,
    error: null,
    snapshot: buildSnapshot([]),
    calendarResult: null,
    calendarAnchorAtMs: null,
    teamsLoading: false,
    teamsError: null,
    teamSnapshots: buildTeamSnapshots(),
    teamRunsLoading: false,
    teamRunsError: null,
    teamRunsResult: buildTeamRuns(),
    attentionItems: [],
    basePath: "",
    taskFilter: null,
    taskGroupSelection: null,
    doneFromDate: "",
    doneToDate: "",
    workshopSelectedId: null,
    calendarView: "month",
    teamSelection: "vibe-coder:default",
    memoryAgentId: null,
    agentsList: null,
    agentFilesLoading: false,
    agentFilesError: null,
    agentFileContents: {},
    agentFileDrafts: {},
    agentFileSaving: false,
    mauOfficeLoading: false,
    mauOfficeError: null,
    mauOfficeState: createEmptyMauOfficeState(),
    mauOfficeChatOpen: false,
    mauOfficeChatMinimized: false,
    mauOfficeChatActorId: null,
    mauOfficeChatActorLabel: "",
    mauOfficeChatSessionKey: "",
    mauOfficeChatLoading: false,
    mauOfficeChatSending: false,
    mauOfficeChatMessage: "",
    mauOfficeChatMessages: [],
    mauOfficeChatStream: null,
    mauOfficeChatStreamStartedAt: null,
    mauOfficeChatError: null,
    mauOfficeChatPosition: { x: null, y: null },
    onNavigate: vi.fn(),
    onBackToControl: vi.fn(),
    onRefresh: vi.fn(),
    onRefreshTeams: vi.fn(),
    onOpenTask: vi.fn(),
    onFilterTasks: vi.fn(),
    onSelectTaskGroup: vi.fn(),
    onDoneDateRangeChange: vi.fn(),
    onSelectWorkshop: vi.fn(),
    onCalendarViewChange: vi.fn(),
    onCalendarNavigate: vi.fn(),
    onCalendarJumpToday: vi.fn(),
    onCalendarSelectDay: vi.fn(),
    onSelectTeam: vi.fn(),
    onPromptTeamEdit: vi.fn(),
    onSelectMemoryAgent: vi.fn(),
    onMemoryDraftChange: vi.fn(),
    onSaveMemoryFile: vi.fn(),
    onRefreshMauOffice: vi.fn(),
    onMauOfficeRoomFocus: vi.fn(),
    onMauOfficeActorOpen: vi.fn(),
    onMauOfficeChatClose: vi.fn(),
    onMauOfficeChatToggleMinimized: vi.fn(),
    onMauOfficeChatDraftChange: vi.fn(),
    onMauOfficeChatSend: vi.fn(),
    onMauOfficeChatAbort: vi.fn(),
    onMauOfficeChatPositionChange: vi.fn(),
    ...overrides,
  };
}

describe("dashboard view", () => {
  it("shows the configured team task entry even when there are no delegated team tasks yet", async () => {
    const container = document.createElement("div");

    render(
      renderDashboard(
        buildProps({
          tab: "dashboardTasks",
          snapshot: buildSnapshot([]),
          taskGroupSelection: "vibe-coder:default",
          teamRunsResult: {
            generatedAtMs: 1,
            items: [],
          },
        }),
      ),
      container,
    );
    await Promise.resolve();

    expect(container.textContent).toContain("Main Tasks");
    expect(container.textContent).toContain("Vibe Coder Tasks");
    expect(container.textContent).toContain("Planning");
    expect(container.textContent).toContain("Architecture");
    expect(container.textContent).toContain("QA");
    expect(container.textContent).toContain("Manager Confirmation");
    expect(container.textContent).toContain("Done");
    expect(container.textContent).not.toContain("Needs approval or intervention.");
    expect(container.textContent).not.toContain("Created, but not actively running yet.");
  });

  it("shows root work and delegated team work in separate task sections", async () => {
    const container = document.createElement("div");
    const teamRuns = buildTeamRuns();
    const [managerTask, qaTask] = teamRuns.items[0].items;
    const rootTask = buildTask({
      progressLabel: "3/6 · QA",
      progressPercent: 50,
      delegatedTeamRunId: "team-run:agent:vibe-coder-manager:subagent:1",
    });

    render(
      renderDashboard(
        buildProps({
          tab: "dashboardTasks",
          snapshot: buildSnapshot([rootTask, managerTask, qaTask]),
          taskGroupSelection: "vibe-coder:default",
          teamRunsResult: teamRuns,
        }),
      ),
      container,
    );
    await Promise.resolve();

    expect(container.textContent).toContain("Main Tasks");
    expect(container.textContent).toContain("Vibe Coder Tasks");
    expect(container.textContent).toContain("3/6 · QA");
    expect(container.textContent).toContain("Technical QA for checkout flow");
    expect(container.textContent).toContain("Planning");
    expect(container.textContent).toContain("Architecture");
    expect(container.textContent).toContain("Execution");
    expect(container.textContent).toContain("QA");
    expect(container.textContent).toContain("Manager Confirmation");
    expect(container.textContent).toContain("Done");
    expect(container.textContent).not.toContain("Lifecycle");
    expect(container.textContent).not.toContain("Needs approval or intervention.");
    expect(container.textContent).not.toContain("Created, but not actively running yet.");
  });

  it("shows structured lifecycle stages on the Teams page without task execution detail", async () => {
    const container = document.createElement("div");
    const teamRuns = buildTeamRuns();
    const [managerTask, qaTask] = teamRuns.items[0].items;
    const rootTask = buildTask({
      progressLabel: "3/6 · QA",
      progressPercent: 50,
      delegatedTeamRunId: "team-run:agent:vibe-coder-manager:subagent:1",
    });

    render(
      renderDashboard(
        buildProps({
          tab: "dashboardTeams",
          snapshot: buildSnapshot([rootTask, managerTask, qaTask]),
          teamRunsResult: teamRuns,
        }),
      ),
      container,
    );
    await Promise.resolve();

    expect(container.textContent).toContain("Workflow lifecycle");
    expect(container.textContent).toContain("Planning");
    expect(container.textContent).toContain("Manager Confirmation");
    expect(container.textContent).toContain("Done");
    expect(container.textContent).toContain("6 stages");
    expect(container.textContent).toContain("Prompt Changes");
    expect(container.textContent).not.toContain("Live team runs");
    expect(container.textContent).not.toContain("Technical QA for checkout flow");
    expect(container.textContent).not.toContain("Root task: Build checkout flow");
    expect(container.textContent).not.toContain("Role tasks");
  });

  it("does not show static in-progress bucket labels on lifecycle cards without a live run", async () => {
    const container = document.createElement("div");

    render(
      renderDashboard(
        buildProps({
          tab: "dashboardTeams",
          snapshot: buildSnapshot([]),
          teamRunsResult: {
            generatedAtMs: 1,
            items: [],
          },
        }),
      ),
      container,
    );
    await Promise.resolve();

    expect(container.textContent).toContain("Workflow lifecycle");
    expect(container.textContent).toContain("Planning");
    expect(container.textContent).toContain("Manager Confirmation");
    expect(container.textContent).toContain("Done");
    expect(container.textContent).not.toContain("In Progress");
    expect(container.textContent).not.toContain("Review");
  });

  it("routes completed team tasks into the terminal done lifecycle column", async () => {
    const container = document.createElement("div");
    const doneTask = buildTask({
      id: "task:done-team",
      sessionKey: "agent:vibe-coder-manager:subagent:done",
      title: "Finalize launch polish",
      status: "done",
      teamId: "vibe-coder",
      teamLabel: "Vibe Coder",
      teamRole: "manager",
      assigneeLabel: "Vibe Coder Manager",
      visibilityScope: "team_detail",
    });

    render(
      renderDashboard(
        buildProps({
          tab: "dashboardTasks",
          snapshot: buildSnapshot([doneTask]),
          taskGroupSelection: "vibe-coder:default",
          teamRunsResult: {
            generatedAtMs: 1,
            items: [],
          },
        }),
      ),
      container,
    );
    await Promise.resolve();

    expect(container.textContent).toContain("Done");
    expect(container.textContent).toContain("Finalize launch polish");
  });
});

/* @vitest-environment jsdom */

import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import { createEmptyMauOfficeState } from "../controllers/mau-office.ts";
import type {
  DashboardAgentAppItem,
  DashboardCalendarFilters,
  DashboardSavedWorkshopItem,
  DashboardSnapshot,
  DashboardTask,
  DashboardTeamRun,
  DashboardTeamRunsResult,
  DashboardTeamSnapshotsResult,
  DashboardWalletResult,
  DashboardWorkshopItem,
} from "../types.ts";
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
      inProgressTasks: tasks.filter(
        (task) => task.status === "in_progress" || task.status === "review",
      ),
      scheduledToday: [],
      blockers: [],
      recentMemory: [],
    },
    tasks,
    workshop: [],
    workshopSaved: [],
    workshopAgentApps: [],
    calendar: [],
    routines: [],
    lifeProfile: {
      generatedAtMs: 1,
      teamConfigured: true,
      bootstrapPending: false,
      sourceStatus: "loaded",
      sourceLabel: "main/USER.md",
      recordedFieldCount: 2,
      missingFieldCount: 1,
      futureFieldCount: 1,
      recordedNeedCount: 2,
      missingNeedCount: 1,
      futureNeedCount: 1,
      fields: [
        {
          key: "daily_weekly_rhythm",
          label: "Daily / weekly rhythm",
          description: "What a normal day and week actually look like.",
          stage: "foundational",
          status: "recorded",
          value: "Wake 7, office 9:30 to 10, finish 7 to 7:30.",
        },
        {
          key: "support_needs",
          label: "What they want more help with",
          description: "Where they actively want support or relief.",
          stage: "foundational",
          status: "recorded",
          value: "Organization, reminders, and planning.",
        },
        {
          key: "hobbies_interests",
          label: "Hobbies / interests",
          description: "What they enjoy, follow, or return to for energy.",
          stage: "growth",
          status: "future",
        },
        {
          key: "family_context",
          label: "Family / siblings / parents",
          description: "Family structure, obligations, and relevant dynamics.",
          stage: "later",
          status: "future",
        },
      ],
      agents: [
        {
          agentId: "life-improvement-life-mindset-coach",
          name: "Life & Mindset Coach",
          role: "life & mindset coach",
          domainId: "self_identity",
          domainLabel: "Self & Identity",
          covers: "Purpose, vision, values, direction, goal-setting, and identity.",
          relatesTo: "Every other domain as the foundation.",
          recordedCount: 2,
          missingCount: 0,
          futureCount: 1,
          needs: [
            {
              fieldKey: "daily_weekly_rhythm",
              label: "Daily / weekly rhythm",
              description: "What a normal day and week actually look like.",
              stage: "foundational",
              status: "recorded",
              value: "Wake 7, office 9:30 to 10, finish 7 to 7:30.",
              why: "Life & Mindset Coach needs this so recommendations fit the person's real rhythm instead of an idealized plan.",
            },
            {
              fieldKey: "support_needs",
              label: "What they want more help with",
              description: "Where they actively want support or relief.",
              stage: "foundational",
              status: "recorded",
              value: "Organization, reminders, and planning.",
              why: "Life & Mindset Coach needs this so the role focuses on the help the user actually wants.",
            },
            {
              fieldKey: "hobbies_interests",
              label: "Hobbies / interests",
              description: "What they enjoy, follow, or return to for energy.",
              stage: "growth",
              status: "future",
              why: "Life & Mindset Coach needs this so the role can build around interests that genuinely energize the user.",
            },
          ],
        },
        {
          agentId: "life-improvement-physical-activity-coach",
          name: "Physical Activity Coach",
          role: "physical activity coach",
          domainId: "physical_health",
          domainLabel: "Physical Health",
          covers: "Exercise, movement, gym, yoga, sports, and posture.",
          relatesTo: "Nutrition, sleep, mental health, and energy.",
          recordedCount: 1,
          missingCount: 0,
          futureCount: 1,
          needs: [
            {
              fieldKey: "daily_weekly_rhythm",
              label: "Daily / weekly rhythm",
              description: "What a normal day and week actually look like.",
              stage: "foundational",
              status: "recorded",
              value: "Wake 7, office 9:30 to 10, finish 7 to 7:30.",
              why: "Physical Activity Coach needs this so recommendations fit the person's real rhythm instead of an idealized plan.",
            },
            {
              fieldKey: "hobbies_interests",
              label: "Hobbies / interests",
              description: "What they enjoy, follow, or return to for energy.",
              stage: "growth",
              status: "future",
              why: "Physical Activity Coach needs this so the role can build around interests that genuinely energize the user.",
            },
          ],
        },
      ],
    },
    memories: [],
  };
}

function buildWorkshopItem(overrides: Partial<DashboardWorkshopItem> = {}): DashboardWorkshopItem {
  return {
    id: "workshop:recent",
    title: "Preview sandbox",
    taskId: "task:root",
    taskStatus: "done",
    sessionKey: "main",
    previewUrl: "https://example.com/demo",
    embeddable: false,
    updatedAtMs: 1,
    ...overrides,
  };
}

function buildSavedWorkshopItem(
  overrides: Partial<DashboardSavedWorkshopItem> = {},
): DashboardSavedWorkshopItem {
  return {
    id: "saved:1",
    title: "Saved preview",
    taskStatus: "done",
    savedAtMs: 2,
    embeddable: false,
    previewUrl: "/dashboard-workshop-embed/saved/saved:1/123/sig/",
    ...overrides,
  };
}

function buildAgentAppItem(overrides: Partial<DashboardAgentAppItem> = {}): DashboardAgentAppItem {
  return {
    kind: "agent_app",
    id: "agent-app:1",
    title: "Focus helper",
    status: "proposed",
    ownerLabel: "Accountability Partner",
    whyNow: "Daily routines need a lighter checkpoint.",
    howItHelps: "Turns vague follow-through into a visible next step.",
    suggestedScope: "One focused checklist with reset state.",
    embeddable: false,
    updatedAtMs: 3,
    ...overrides,
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
          {
            id: "architecture",
            name: "Architecture",
            status: "in_progress",
            roles: ["system architect"],
          },
          {
            id: "execution",
            name: "Execution",
            status: "in_progress",
            roles: ["developer", "designer"],
          },
          { id: "qa", name: "QA", status: "in_progress", roles: ["technical qa"] },
          {
            id: "manager_confirmation",
            name: "Manager Confirmation",
            status: "review",
            roles: ["manager"],
          },
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
  const defaultCalendarFilters: DashboardCalendarFilters = {
    cron: true,
    userActivity: true,
    groupActivity: true,
    approvals: true,
  };
  return {
    tab: "dashboardTasks",
    loading: false,
    error: null,
    snapshot: buildSnapshot([]),
    walletResult: null,
    walletStartDate: "2026-03-01",
    walletEndDate: "2026-03-30",
    walletTimeZone: "local",
    walletGranularity: "day",
    walletBreakdown: "category",
    walletCurrency: "USD",
    calendarResult: null,
    calendarAnchorAtMs: null,
    userChannelsResult: null,
    userChannelId: null,
    userChannelAccountId: null,
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
    workshopTab: "recent",
    workshopSelectedIds: new Set(),
    workshopProjectDraft: "",
    workshopSaving: false,
    workshopSaveError: null,
    calendarView: "month",
    calendarFilters: defaultCalendarFilters,
    routineSelection: null,
    profileSelection: null,
    teamSelection: "vibe-coder:default",
    memoryAgentId: null,
    agentPanel: "memory",
    agentsList: null,
    configForm: null,
    configLoading: false,
    agentFilesLoading: false,
    agentFilesError: null,
    agentFilesList: null,
    agentFileContents: {},
    agentFileDrafts: {},
    agentFileSaving: false,
    toolsCatalogLoading: false,
    toolsCatalogError: null,
    toolsCatalogResult: null,
    whatsappMessage: null,
    whatsappQrDataUrl: null,
    whatsappBusy: false,
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
    onOpenSession: vi.fn(),
    onFilterTasks: vi.fn(),
    onSelectTaskGroup: vi.fn(),
    onDoneDateRangeChange: vi.fn(),
    onSelectWorkshop: vi.fn(),
    onWorkshopTabChange: vi.fn(),
    onToggleWorkshopSelection: vi.fn(),
    onWorkshopProjectDraftChange: vi.fn(),
    onSaveWorkshopSelection: vi.fn(),
    onWalletDateRangeChange: vi.fn(),
    onWalletTimeZoneChange: vi.fn(),
    onWalletGranularityChange: vi.fn(),
    onWalletBreakdownChange: vi.fn(),
    onWalletCurrencyChange: vi.fn(),
    onWalletPresetSelect: vi.fn(),
    onCalendarViewChange: vi.fn(),
    onCalendarNavigate: vi.fn(),
    onCalendarJumpToday: vi.fn(),
    onCalendarFiltersChange: vi.fn(),
    onSelectRoutine: vi.fn(),
    onSelectProfileAgent: vi.fn(),
    onCalendarSelectDay: vi.fn(),
    onSelectUserChannel: vi.fn(),
    onSelectUserChannelAccount: vi.fn(),
    onOpenUserManagement: vi.fn(),
    onConnectUserChannel: vi.fn(),
    onSaveUserChannelAllowlist: vi.fn(),
    onSaveUserChannelChats: vi.fn(),
    onStartWhatsApp: vi.fn(),
    onSelectTeam: vi.fn(),
    onPromptTeamEdit: vi.fn(),
    onSelectMemoryAgent: vi.fn(),
    onSelectAgentPanel: vi.fn(),
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

function buildWalletResult(overrides: Partial<DashboardWalletResult> = {}): DashboardWalletResult {
  return {
    generatedAtMs: 1,
    startDate: "2026-03-01",
    endDate: "2026-03-30",
    cards: [
      {
        id: "llm",
        records: 42,
        recordLabel: "Usage records",
        totalValue: 12.34,
        totalUnit: "usd",
        totalLabel: "Cost",
        measurement: "exact",
        coverage: "full",
        secondaryValue: 123_456,
        secondaryUnit: "tokens",
        secondaryLabel: "Tokens",
      },
      {
        id: "deepgram-audio",
        records: 2,
        recordLabel: "Requests",
        totalValue: 90_000,
        totalUnit: "duration_ms",
        totalLabel: "Audio time",
        measurement: "derived",
        coverage: "partial",
        note: "1 record(s) are missing duration totals.",
        missingTotals: 1,
      },
    ],
    spending: {
      records: 4,
      lastRecordedAtMs: 2,
      currencies: ["USD"],
      note: "1 receipt(s) use the recorded day because the receipt date could not be parsed.",
      charts: [
        {
          granularity: "day",
          breakdown: "category",
          currency: "USD",
          totalValue: 76.48,
          totalRecords: 4,
          maxBarValue: 31,
          bars: [
            {
              key: "2026-03-01",
              label: "Mar 1",
              startAtMs: 1,
              endAtMs: 2,
              totalValue: 31,
              records: 2,
              segments: [
                { key: "groceries", label: "Groceries", totalValue: 22, records: 1 },
                { key: "software", label: "Software", totalValue: 9, records: 1 },
              ],
            },
            {
              key: "2026-03-02",
              label: "Mar 2",
              startAtMs: 3,
              endAtMs: 4,
              totalValue: 45.48,
              records: 2,
              segments: [
                { key: "travel", label: "Travel", totalValue: 18.5, records: 1 },
                { key: "shopping", label: "Shopping", totalValue: 26.98, records: 1 },
              ],
            },
          ],
          legend: [
            { key: "shopping", label: "Shopping", totalValue: 26.98, records: 1 },
            { key: "groceries", label: "Groceries", totalValue: 22, records: 1 },
            { key: "travel", label: "Travel", totalValue: 18.5, records: 1 },
            { key: "software", label: "Software", totalValue: 9, records: 1 },
          ],
        },
        {
          granularity: "day",
          breakdown: "merchant",
          currency: "USD",
          totalValue: 76.48,
          totalRecords: 4,
          maxBarValue: 31,
          bars: [
            {
              key: "2026-03-01",
              label: "Mar 1",
              startAtMs: 1,
              endAtMs: 2,
              totalValue: 31,
              records: 2,
              segments: [
                { key: "whole-foods", label: "Whole Foods", totalValue: 22, records: 1 },
                { key: "netflix", label: "Netflix", totalValue: 9, records: 1 },
              ],
            },
          ],
          legend: [
            { key: "whole-foods", label: "Whole Foods", totalValue: 22, records: 1 },
            { key: "netflix", label: "Netflix", totalValue: 9, records: 1 },
          ],
        },
        {
          granularity: "week",
          breakdown: "category",
          currency: "USD",
          totalValue: 76.48,
          totalRecords: 4,
          maxBarValue: 76.48,
          bars: [
            {
              key: "2026-w09",
              label: "Mar 1",
              startAtMs: 1,
              endAtMs: 7,
              totalValue: 76.48,
              records: 4,
              segments: [
                { key: "shopping", label: "Shopping", totalValue: 26.98, records: 1 },
                { key: "groceries", label: "Groceries", totalValue: 22, records: 1 },
                { key: "travel", label: "Travel", totalValue: 18.5, records: 1 },
                { key: "software", label: "Software", totalValue: 9, records: 1 },
              ],
            },
          ],
          legend: [
            { key: "shopping", label: "Shopping", totalValue: 26.98, records: 1 },
            { key: "groceries", label: "Groceries", totalValue: 22, records: 1 },
            { key: "travel", label: "Travel", totalValue: 18.5, records: 1 },
            { key: "software", label: "Software", totalValue: 9, records: 1 },
          ],
        },
        {
          granularity: "month",
          breakdown: "category",
          currency: "USD",
          totalValue: 76.48,
          totalRecords: 4,
          maxBarValue: 76.48,
          bars: [
            {
              key: "2026-03",
              label: "Mar 2026",
              startAtMs: 1,
              endAtMs: 31,
              totalValue: 76.48,
              records: 4,
              segments: [
                { key: "shopping", label: "Shopping", totalValue: 26.98, records: 1 },
                { key: "groceries", label: "Groceries", totalValue: 22, records: 1 },
                { key: "travel", label: "Travel", totalValue: 18.5, records: 1 },
                { key: "software", label: "Software", totalValue: 9, records: 1 },
              ],
            },
          ],
          legend: [
            { key: "shopping", label: "Shopping", totalValue: 26.98, records: 1 },
            { key: "groceries", label: "Groceries", totalValue: 22, records: 1 },
            { key: "travel", label: "Travel", totalValue: 18.5, records: 1 },
            { key: "software", label: "Software", totalValue: 9, records: 1 },
          ],
        },
        {
          granularity: "year",
          breakdown: "category",
          currency: "USD",
          totalValue: 76.48,
          totalRecords: 4,
          maxBarValue: 76.48,
          bars: [
            {
              key: "2026",
              label: "2026",
              startAtMs: 1,
              endAtMs: 365,
              totalValue: 76.48,
              records: 4,
              segments: [
                { key: "shopping", label: "Shopping", totalValue: 26.98, records: 1 },
                { key: "groceries", label: "Groceries", totalValue: 22, records: 1 },
                { key: "travel", label: "Travel", totalValue: 18.5, records: 1 },
                { key: "software", label: "Software", totalValue: 9, records: 1 },
              ],
            },
          ],
          legend: [
            { key: "shopping", label: "Shopping", totalValue: 26.98, records: 1 },
            { key: "groceries", label: "Groceries", totalValue: 22, records: 1 },
            { key: "travel", label: "Travel", totalValue: 18.5, records: 1 },
            { key: "software", label: "Software", totalValue: 9, records: 1 },
          ],
        },
      ],
    },
    ...overrides,
  };
}

function clickButton(container: HTMLElement, selector: string) {
  const button = container.querySelector<HTMLButtonElement>(selector);
  expect(button).not.toBeNull();
  button?.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
}

describe("dashboard view", () => {
  it("renders the wallet cards with totals, records, and partial notes", async () => {
    const container = document.createElement("div");

    render(
      renderDashboard(
        buildProps({
          tab: "dashboardWallet",
          snapshot: null,
          walletResult: buildWalletResult(),
        }),
      ),
      container,
    );
    await Promise.resolve();

    expect(container.textContent).toContain("Wallet");
    expect(container.textContent).toContain("LLM");
    expect(container.textContent).toContain("$12.34");
    expect(container.textContent).toContain("42 usage records");
    expect(container.textContent).toContain("Tokens: 123k");
    expect(container.textContent).toContain("Deepgram Audio");
    expect(container.textContent).toContain("Partial");
    expect(container.textContent).toContain("1 record(s) are missing duration totals.");
  });

  it("renders the wallet spending chart and supports category breakdown labels", async () => {
    const container = document.createElement("div");

    render(
      renderDashboard(
        buildProps({
          tab: "dashboardWallet",
          snapshot: null,
          walletResult: buildWalletResult(),
          walletGranularity: "day",
          walletBreakdown: "category",
          walletCurrency: "USD",
        }),
      ),
      container,
    );
    await Promise.resolve();

    expect(container.textContent).toContain("Spending Breakdown");
    expect(container.textContent).toContain("Split by");
    expect(container.textContent).toContain("Bucket by");
    expect(container.textContent).toContain("Category");
    expect(container.textContent).toContain("Merchant");
    expect(container.textContent).toContain("Shopping");
    expect(container.textContent).toContain("Groceries");
    expect(container.textContent).toContain("Collected");
  });

  it("keeps the shell title as the only page title and resolves calendar view labels", async () => {
    const container = document.createElement("div");

    render(
      renderDashboard(
        buildProps({
          tab: "dashboardCalendar",
        }),
      ),
      container,
    );
    await Promise.resolve();

    expect(container.querySelector(".dashboard-shell__title")?.textContent).toBe("Calendar");
    expect(container.querySelector(".dashboard-page__header .card-title")).toBeNull();
    expect(container.querySelector(".dashboard-page__toolbar")).toBeNull();
    expect(container.querySelector(".dashboard-calendar__header")).not.toBeNull();
    expect(container.querySelector(".dashboard-calendar-agenda")).toBeNull();
    expect(container.textContent).not.toContain(
      "Month, week, and day views for routines, cron, and activity.",
    );
    expect(container.textContent).not.toContain(
      "User-facing reminders, routines, and approvals across the selected window.",
    );
    expect(container.querySelector(".dashboard-calendar__header.card")).toBeNull();

    const viewLabels = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".dashboard-segmented__item"),
    ).map((button) => button.textContent?.trim());
    expect(viewLabels).toEqual(["Month", "Week", "Day"]);
    expect(container.textContent).not.toContain("dashboard.dashboard.calendar.views.month");
  });

  it("renders routines as a left nav with a cadence preview for the selected item", async () => {
    const container = document.createElement("div");
    const mondayAtMs = new Date(2026, 3, 13, 9, 0, 0, 0).getTime();
    const sundayAtMs = new Date(2026, 3, 12, 0, 0, 0, 0).getTime();

    render(
      renderDashboard(
        buildProps({
          tab: "dashboardRoutines",
          routineSelection: "routine:weekly-planning",
          snapshot: {
            ...buildSnapshot([]),
            routines: [
              {
                id: "routine:daily-review",
                sourceJobId: "daily-review",
                title: "Daily review",
                description: "Morning reset and priority check.",
                enabled: true,
                scheduleKind: "every",
                scheduleLabel: "Every 24 hours",
                preview: {
                  view: "day",
                  anchorAtMs: mondayAtMs,
                  startAtMs: new Date(2026, 3, 13, 0, 0, 0, 0).getTime(),
                  endAtMs: new Date(2026, 3, 14, 0, 0, 0, 0).getTime(),
                  runAtMs: [mondayAtMs],
                },
                nextRunAtMs: mondayAtMs,
                lastRunAtMs: mondayAtMs - 86_400_000,
                visibility: "user_facing",
                visibilitySource: "stored",
              },
              {
                id: "routine:weekly-planning",
                sourceJobId: "weekly-planning",
                title: "Weekly planning",
                description: "Reset the week and line up commitments.",
                enabled: true,
                scheduleKind: "cron",
                scheduleLabel: "Cron: 0 9 * * 1",
                preview: {
                  view: "week",
                  anchorAtMs: mondayAtMs,
                  startAtMs: sundayAtMs,
                  endAtMs: sundayAtMs + 7 * 86_400_000,
                  runAtMs: [mondayAtMs],
                },
                nextRunAtMs: mondayAtMs,
                lastRunAtMs: mondayAtMs - 7 * 86_400_000,
                visibility: "user_facing",
                visibilitySource: "stored",
              },
            ],
          },
        }),
      ),
      container,
    );
    await Promise.resolve();

    expect(container.querySelector(".dashboard-routines__list")).not.toBeNull();
    expect(container.querySelector(".dashboard-routines__item--active")?.textContent).toContain(
      "Weekly planning",
    );
    expect(container.querySelector(".dashboard-timegrid--week")).not.toBeNull();
    expect(container.textContent).toContain("Reset the week and line up commitments.");
    expect(container.textContent).toContain("Schedule");
  });

  it("filters calendar categories in week view", async () => {
    const container = document.createElement("div");
    const dayAtMs = new Date(2026, 3, 11, 0, 0, 0, 0).getTime();

    render(
      renderDashboard(
        buildProps({
          tab: "dashboardCalendar",
          calendarView: "week",
          calendarAnchorAtMs: dayAtMs,
          calendarFilters: {
            cron: false,
            userActivity: true,
            groupActivity: false,
            approvals: false,
          },
          calendarResult: {
            generatedAtMs: 1,
            anchorAtMs: dayAtMs,
            startAtMs: dayAtMs,
            endAtMs: dayAtMs + 7 * 86_400_000,
            view: "week",
            events: [
              {
                id: "routine:1",
                title: "Daily review",
                kind: "routine_occurrence",
                status: "scheduled",
                startAtMs: dayAtMs + 8 * 60 * 60 * 1_000,
              },
              {
                id: "activity:user",
                title: "Gym session",
                kind: "known_activity",
                status: "scheduled",
                startAtMs: dayAtMs + 9 * 60 * 60 * 1_000,
                activityScope: "user",
              },
              {
                id: "activity:group",
                title: "Family trip",
                kind: "known_activity",
                status: "scheduled",
                startAtMs: dayAtMs + 10 * 60 * 60 * 1_000,
                activityScope: "group",
              },
              {
                id: "approval:1",
                title: "Exec approval needed",
                kind: "approval_needed",
                status: "needs_action",
                startAtMs: dayAtMs + 11 * 60 * 60 * 1_000,
              },
            ],
          },
        }),
      ),
      container,
    );
    await Promise.resolve();

    expect(container.textContent).toContain("Gym session");
    expect(container.textContent).not.toContain("Daily review");
    expect(container.textContent).not.toContain("Family trip");
    expect(container.textContent).not.toContain("Exec approval needed");
  });

  it("rolls month-view cron entries into a single daily count", async () => {
    const container = document.createElement("div");
    const dayAtMs = new Date(2026, 3, 11, 0, 0, 0, 0).getTime();
    const monthStartAtMs = new Date(2026, 2, 29, 0, 0, 0, 0).getTime();

    render(
      renderDashboard(
        buildProps({
          tab: "dashboardCalendar",
          calendarView: "month",
          calendarAnchorAtMs: dayAtMs,
          calendarResult: {
            generatedAtMs: 1,
            anchorAtMs: dayAtMs,
            startAtMs: monthStartAtMs,
            endAtMs: monthStartAtMs + 42 * 86_400_000,
            view: "month",
            events: [
              {
                id: "routine:1",
                title: "Morning review",
                kind: "routine_occurrence",
                status: "scheduled",
                startAtMs: dayAtMs + 8 * 60 * 60 * 1_000,
              },
              {
                id: "routine:2",
                title: "Evening check-in",
                kind: "reminder",
                status: "scheduled",
                startAtMs: dayAtMs + 18 * 60 * 60 * 1_000,
              },
              {
                id: "approval:1",
                title: "Travel approval",
                kind: "approval_needed",
                status: "needs_action",
                startAtMs: dayAtMs + 12 * 60 * 60 * 1_000,
              },
            ],
          },
        }),
      ),
      container,
    );
    await Promise.resolve();

    expect(container.textContent).toContain("Cron 2");
    expect(container.textContent).toContain("Travel approval");
    expect(container.textContent).not.toContain("Morning review");
    expect(container.textContent).not.toContain("Evening check-in");
  });

  it("keeps simple refresh actions in the shell header instead of a separate spacer row", async () => {
    const container = document.createElement("div");

    render(
      renderDashboard(
        buildProps({
          tab: "dashboardToday",
        }),
      ),
      container,
    );
    await Promise.resolve();

    expect(container.querySelector(".dashboard-page__toolbar")).toBeNull();
    expect(container.querySelector(".dashboard-shell__actions")?.textContent).toContain("Refresh");
    expect(container.querySelector(".dashboard-shell__actions")?.textContent).toContain(
      "Go to Advance Dashboard",
    );
  });

  it("renders the dashboard agents scope tab for the selected agent", async () => {
    const container = document.createElement("div");

    render(
      renderDashboard(
        buildProps({
          tab: "dashboardMemories",
          agentPanel: "scope",
          memoryAgentId: "main",
          agentsList: {
            defaultId: "main",
            mainKey: "main",
            scope: "workspace",
            agents: [
              {
                id: "main",
                name: "Operator",
                identity: { name: "Operator" },
              },
            ],
          } as Parameters<typeof renderDashboard>[0]["agentsList"],
          configForm: {
            agents: {
              defaults: {
                workspace: "/tmp/default",
                model: "openai/gpt-5.4",
              },
              list: [
                {
                  id: "main",
                  name: "Operator",
                  skills: ["memory-core", "review"],
                  tools: {
                    profile: "coding",
                    alsoAllow: ["message"],
                    deny: ["web_fetch"],
                  },
                },
              ],
            },
          },
          agentFilesList: {
            agentId: "main",
            workspace: "/tmp/main",
            files: [],
          },
          toolsCatalogResult: {
            agentId: "main",
            profiles: [{ id: "coding", label: "Coding" }],
            groups: [
              {
                id: "web",
                label: "Web",
                source: "core",
                tools: [
                  {
                    id: "web_fetch",
                    label: "web_fetch",
                    description: "Fetch web content",
                    source: "core",
                    defaultProfiles: ["full"],
                  },
                  {
                    id: "message",
                    label: "message",
                    description: "Send messages",
                    source: "core",
                    defaultProfiles: ["messaging"],
                  },
                ],
              },
            ],
          } as Parameters<typeof renderDashboard>[0]["toolsCatalogResult"],
        }),
      ),
      container,
    );
    await Promise.resolve();

    expect(container.textContent).toContain("Agents");
    expect(container.textContent).toContain("Agent Context");
    expect(container.textContent).toContain("Tool Access");
    expect(container.textContent).toContain("Denied");
    expect(container.textContent).toContain("web_fetch");
    expect(container.textContent).toContain("message");
  });

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

  it("shows the recent workshop save bar, saved badges, and project mismatch warning", async () => {
    const container = document.createElement("div");

    render(
      renderDashboard(
        buildProps({
          tab: "dashboardWorkshop",
          snapshot: {
            ...buildSnapshot([]),
            workshop: [
              buildWorkshopItem({
                id: "workshop:recent-1",
                title: "Recent preview",
                projectName: "Alpha",
                projectKey: "alpha",
                isSaved: true,
              }),
            ],
          },
          workshopTab: "recent",
          workshopSelectedId: "workshop:recent-1",
          workshopSelectedIds: new Set(["workshop:recent-1"]),
          workshopProjectDraft: "Beta",
        }),
      ),
      container,
    );
    await Promise.resolve();

    expect(container.textContent).toContain("Save Selection");
    expect(container.textContent).toContain("Recent preview");
    expect(container.textContent).toContain("Saved");
    expect(container.textContent).toContain("already belong to another project");
  });

  it("renders saved workshop items from the saved tab by default", async () => {
    const container = document.createElement("div");

    render(
      renderDashboard(
        buildProps({
          tab: "dashboardWorkshop",
          snapshot: {
            ...buildSnapshot([]),
            workshopSaved: [
              buildSavedWorkshopItem({ title: "Saved playground", projectName: "Alpha" }),
            ],
          },
          workshopTab: "saved",
          workshopSelectedId: "saved:1",
        }),
      ),
      container,
    );
    await Promise.resolve();

    expect(container.textContent).toContain("Saved playground");
    expect(container.textContent).toContain("Saved");
    expect(container.textContent).toContain("Alpha");
  });

  it("renders agent apps with owner and proposal context", async () => {
    const container = document.createElement("div");

    render(
      renderDashboard(
        buildProps({
          tab: "dashboardWorkshop",
          snapshot: {
            ...buildSnapshot([]),
            workshopAgentApps: [buildAgentAppItem({ title: "Focus helper" })],
          },
          workshopTab: "agent-apps",
          workshopSelectedId: "agent-app:1",
        }),
      ),
      container,
    );
    await Promise.resolve();

    expect(container.textContent).toContain("Agent Apps");
    expect(container.textContent).toContain("Focus helper");
    expect(container.textContent).toContain("Accountability Partner");
    expect(container.textContent).toContain("Turns vague follow-through into a visible next step");
  });

  it("filters the task board by project when a project filter is active", async () => {
    const container = document.createElement("div");
    const alphaTask = buildTask({ title: "Alpha task", projectName: "Alpha", projectKey: "alpha" });
    const betaTask = buildTask({
      id: "task:beta",
      sessionKey: "beta",
      title: "Beta task",
      projectName: "Beta",
      projectKey: "beta",
    });

    render(
      renderDashboard(
        buildProps({
          tab: "dashboardTasks",
          snapshot: buildSnapshot([alphaTask, betaTask]),
          taskFilter: { kind: "project", value: "alpha" },
        }),
      ),
      container,
    );
    await Promise.resolve();

    expect(container.textContent).toContain("Alpha task");
    expect(container.textContent).not.toContain("Beta task");
    expect(container.textContent).toContain("All projects");
  });

  it("renders blocker details and a recommended next step on blocked task cards", async () => {
    const container = document.createElement("div");
    const blockedTask = buildTask({
      status: "blocked",
      blockerLinks: [
        {
          id: "failure:task:root",
          kind: "failure",
          title: "Task blocked: Build checkout flow",
          description: "TypeError: checkout schema was undefined.",
          suggestion:
            "Open the related session, inspect the latest failure, fix or retry it, then continue.",
          sessionKey: "main",
        },
      ],
    });

    render(
      renderDashboard(
        buildProps({
          tab: "dashboardTasks",
          snapshot: buildSnapshot([blockedTask]),
        }),
      ),
      container,
    );
    await Promise.resolve();

    expect(container.textContent).toContain("TypeError: checkout schema was undefined.");
    expect(container.textContent).toContain("Recommended next step");
    expect(container.textContent).toContain(
      "Open the related session, inspect the latest failure, fix or retry it, then continue.",
    );
  });

  it("opens the related session from a today blocker CTA", async () => {
    const container = document.createElement("div");
    const onOpenSession = vi.fn();

    render(
      renderDashboard(
        buildProps({
          tab: "dashboardToday",
          snapshot: {
            ...buildSnapshot([]),
            today: {
              generatedAtMs: 1,
              inProgressTasks: [],
              scheduledToday: [],
              recentMemory: [],
              blockers: [
                {
                  id: "approval:1",
                  severity: "warning",
                  title: "Exec approval needed",
                  description: "Approve the deploy command.",
                  suggestion:
                    "Open the related session, review the request, then approve or reject it.",
                  sessionKey: "agent:main:subagent:designer",
                },
              ],
            },
          },
          onOpenSession,
        }),
      ),
      container,
    );
    await Promise.resolve();

    clickButton(container, ".dashboard-blocker-card__actions button");
    expect(onOpenSession).toHaveBeenCalledWith("agent:main:subagent:designer");
  });

  it("routes today blocker CTAs to tasks or routines when session jumps are unavailable", async () => {
    const container = document.createElement("div");
    const onFilterTasks = vi.fn();
    const onNavigate = vi.fn();

    render(
      renderDashboard(
        buildProps({
          tab: "dashboardToday",
          snapshot: {
            ...buildSnapshot([]),
            today: {
              generatedAtMs: 1,
              inProgressTasks: [],
              scheduledToday: [],
              recentMemory: [],
              blockers: [
                {
                  id: "failure:task:root",
                  severity: "error",
                  title: "Task blocked: Build checkout flow",
                  description: "QA reported a blocking regression.",
                  suggestion:
                    "Open the related task to inspect the blocker and coordinate the next fix.",
                  taskId: "task:root",
                },
                {
                  id: "cron-error:daily-review",
                  severity: "warning",
                  title: "Routine failed: Daily review",
                  description: "The latest routine run failed.",
                  suggestion:
                    "Open Routines to inspect the failing job and decide whether it needs a fix or a rerun.",
                  jobId: "daily-review",
                },
              ],
            },
          },
          onFilterTasks,
          onNavigate,
        }),
      ),
      container,
    );
    await Promise.resolve();

    const buttons = container.querySelectorAll<HTMLButtonElement>(
      ".dashboard-blocker-card__actions button",
    );
    expect(buttons).toHaveLength(2);

    buttons[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    buttons[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));

    expect(onFilterTasks).toHaveBeenCalledWith({ kind: "task", value: "task:root" });
    expect(onNavigate).toHaveBeenCalledWith("routines");
  });

  it("keeps non-blocked task cards free of blocker guidance", async () => {
    const container = document.createElement("div");

    render(
      renderDashboard(
        buildProps({
          tab: "dashboardTasks",
          snapshot: buildSnapshot([buildTask()]),
        }),
      ),
      container,
    );
    await Promise.resolve();

    expect(container.textContent).not.toContain("Recommended next step");
  });

  it("shows onboarding quick setup channels and keeps advanced channels out of this picker", async () => {
    const container = document.createElement("div");

    render(
      renderDashboard(
        buildProps({
          tab: "dashboardUserChannels",
          snapshot: null,
          userChannelsResult: {
            generatedAtMs: 1,
            channels: [],
            availableChannels: [
              {
                channelId: "whatsapp",
                label: "WhatsApp",
                detailLabel: "WhatsApp Web",
                fields: [],
                guidance: {
                  identity: "A WhatsApp number or linked device becomes the agent identity.",
                  requirements: [
                    "A phone number or WhatsApp account that will belong to the agent.",
                  ],
                  setupSteps: ["Back in Maumau, press Link WhatsApp to show the QR code."],
                  artifacts: ["You do not paste a token for WhatsApp."],
                },
                quickSetup: {
                  kind: "whatsapp",
                  sectionTitle: "Bot identity",
                  title: "WhatsApp Agent",
                  headline: "No number linked yet",
                  message: "Link the WhatsApp number or linked device the bot will use.",
                  badge: "Not linked",
                  setupNote: "Advanced access or routing changes stay in full Settings → Channels.",
                },
              },
              {
                channelId: "discord",
                label: "Discord",
                detailLabel: "Discord Bot",
                fields: [
                  {
                    key: "token",
                    label: "Discord bot token",
                    placeholder: "Paste the Discord bot token",
                    required: true,
                    secret: true,
                  },
                ],
                guidance: {
                  identity: "A Discord bot application becomes the agent identity.",
                  requirements: ["A Discord account."],
                  setupSteps: [
                    "Go to discord.com/developers/applications and click New Application.",
                  ],
                  artifacts: ["What you paste here: the Discord bot token."],
                },
                quickSetup: {
                  kind: "single-secret",
                  sectionTitle: "Bot identity",
                  title: "Discord Agent",
                  headline: "No bot token saved yet",
                  message: "Paste the Discord bot token from the Developer Portal.",
                  badge: "Needs token",
                  buttonTitle: "Save Discord bot",
                  setupNote:
                    "Onboarding opens Discord DMs so people can message the bot immediately after you invite or install it.",
                },
              },
            ],
          },
        }),
      ),
      container,
    );
    await Promise.resolve();

    expect(container.textContent).toContain("Quick setup channels");
    expect(container.textContent).toContain("Discord");
    expect(container.textContent).toContain("WhatsApp");
    expect(container.textContent).toContain(
      "More channels and advanced channel settings live in Settings",
    );
    expect(container.textContent).toContain("Not linked");
    expect(container.textContent).toContain("Not configured");
    expect(container.textContent).not.toContain("Signal");
  });

  it("shows the onboarding waiting-for-scan whatsapp state when a QR is active", async () => {
    const container = document.createElement("div");

    render(
      renderDashboard(
        buildProps({
          tab: "dashboardUserChannels",
          snapshot: null,
          whatsappQrDataUrl: "data:image/png;base64,ZmFrZQ==",
          userChannelsResult: {
            generatedAtMs: 1,
            channels: [],
            availableChannels: [
              {
                channelId: "whatsapp",
                label: "WhatsApp",
                detailLabel: "WhatsApp Web",
                fields: [],
                guidance: {
                  identity: "A WhatsApp number or linked device becomes the agent identity.",
                  requirements: [
                    "A phone number or WhatsApp account that will belong to the agent.",
                  ],
                  setupSteps: ["Back in Maumau, press Link WhatsApp to show the QR code."],
                  artifacts: ["You do not paste a token for WhatsApp."],
                },
                quickSetup: {
                  kind: "whatsapp",
                  sectionTitle: "Bot identity",
                  title: "WhatsApp Agent",
                  headline: "No number linked yet",
                  message: "Link the WhatsApp number or linked device the bot will use.",
                  badge: "Not linked",
                  setupNote: "Advanced access or routing changes stay in full Settings → Channels.",
                },
              },
            ],
          },
        }),
      ),
      container,
    );
    await Promise.resolve();

    expect(container.textContent).toContain("Waiting for scan");
    expect(container.textContent).toContain(
      "Scan the QR with the WhatsApp number or linked device the bot will use.",
    );
  });

  it("renders the life profile dashboard page with field coverage and per-agent needs", async () => {
    const container = document.createElement("div");

    render(
      renderDashboard(
        buildProps({
          tab: "dashboardProfile",
          profileSelection: "life-improvement-life-mindset-coach",
        }),
      ),
      container,
    );
    await Promise.resolve();

    expect(container.textContent).toContain("Life Profile");
    expect(container.textContent).toContain("Profile Coverage");
    expect(container.textContent).toContain("Canonical Profile Map");
    expect(container.textContent).toContain("Life Improvement Agents");
    expect(container.textContent).toContain("Life & Mindset Coach");
    expect(container.textContent).toContain("Daily / weekly rhythm");
    expect(container.textContent).toContain("Why this role needs it");
    expect(container.textContent).toContain("Organization, reminders, and planning.");
  });
});

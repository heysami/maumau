import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MaumauConfig } from "../config/types.maumau.js";
import type { CronJob } from "../cron/types.js";
import {
  LIFE_IMPROVEMENT_FINANCE_SYNC_JOB_NAME,
  LIFE_IMPROVEMENT_ROUTINE_JOB_NAME,
} from "../teams/life-improvement-routine.js";
import {
  ensureBundledTeamPresetConfig,
  ensureStarterTeamConfig,
  LIFE_IMPROVEMENT_TEAM_ID,
  STARTER_TEAM_MANAGER_AGENT_ID,
  STARTER_TEAM_SYSTEM_ARCHITECT_AGENT_ID,
  STARTER_TEAM_TECHNICAL_QA_AGENT_ID,
} from "../teams/presets.js";
import { readDashboardWorkshopStore } from "./dashboard-workshop-saved.js";
import {
  __testing,
  collectDashboardCalendar,
  collectDashboardRoutines,
  collectDashboardSnapshot,
  collectDashboardTeamSnapshots,
  collectDashboardTeamRuns,
  collectDashboardTasks,
  collectDashboardWorkshop,
  ensureStoredDashboardTeamSnapshots,
  readStoredDashboardTeamSnapshots,
  refreshStoredDashboardTeamSnapshots,
  saveDashboardWorkshop,
} from "./dashboard.js";
import type { ExecApprovalRecord } from "./exec-approval-manager.js";
import {
  AUTH_TOKEN,
  createRequest,
  createResponse,
  createTestGatewayServer,
  dispatchRequest,
} from "./server-http.test-harness.js";

function buildCronJob(params: {
  id: string;
  name: string;
  nowMs: number;
  description?: string;
  schedule?: CronJob["schedule"];
  nextRunAtMs?: number;
}): CronJob {
  return {
    id: params.id,
    name: params.name,
    description: params.description,
    enabled: true,
    createdAtMs: params.nowMs - 60_000,
    updatedAtMs: params.nowMs - 5_000,
    schedule: params.schedule ?? {
      kind: "every",
      everyMs: 3_600_000,
      anchorMs: params.nowMs - 3_600_000,
    },
    sessionTarget: "main",
    wakeMode: "now",
    payload: { kind: "systemEvent", text: "tick" },
    state: {
      nextRunAtMs: params.nextRunAtMs,
      lastRunAtMs: params.nowMs - 7_200_000,
      lastStatus: "ok",
    },
  };
}

function buildCronStatus() {
  return {
    enabled: true,
    storePath: "/tmp/cron-store.json",
    jobs: 0,
    nextWakeAtMs: null,
  };
}

async function writeSessionStore(
  storePath: string,
  entries: Record<string, Record<string, unknown>>,
): Promise<void> {
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(storePath, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
}

async function writeTranscript(
  storePath: string,
  sessionFile: string,
  text: string,
): Promise<void> {
  await writeTranscriptMessages(storePath, sessionFile, [{ role: "assistant", text }]);
}

async function writeTranscriptMessages(
  storePath: string,
  sessionFile: string,
  messages: Array<{ role: "assistant" | "user"; text: string }>,
): Promise<void> {
  await writeTranscriptEntries(
    storePath,
    sessionFile,
    messages.map((message) => ({
      role: message.role,
      content: [{ type: "text", text: message.text }],
    })),
  );
}

async function writeTranscriptEntries(
  storePath: string,
  sessionFile: string,
  messages: unknown[],
): Promise<void> {
  const transcriptPath = path.join(path.dirname(storePath), sessionFile);
  await fs.writeFile(
    transcriptPath,
    `${messages
      .map((message, index) =>
        JSON.stringify({
          id: `msg-${index + 1}`,
          message: {
            ...(message as Record<string, unknown>),
            timestamp:
              typeof (message as { timestamp?: unknown }).timestamp === "number"
                ? (message as { timestamp: number }).timestamp
                : Date.now() + index,
          },
        }),
      )
      .join("\n")}\n`,
    "utf8",
  );
}

describe("dashboard aggregations", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    __testing.resetDepsForTests();
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (!dir) {
        continue;
      }
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps plain conversations out of tasks while deriving trusted work items from team sessions", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-dashboard-"));
    tempDirs.push(tempRoot);
    const nowMs = Date.UTC(2026, 3, 5, 0, 30, 0);
    const storePath = path.join(tempRoot, "sessions.json");
    const workspaceDir = path.join(tempRoot, "workspace-main");
    const memoryDir = path.join(workspaceDir, "memory");
    await fs.mkdir(memoryDir, { recursive: true });
    await fs.writeFile(
      path.join(memoryDir, "2026-04-05.md"),
      "# Daily Note\nRemember the dashboard reset.\n",
      "utf8",
    );

    await writeSessionStore(storePath, {
      main: {
        sessionId: "sess-main",
        sessionFile: "sess-main.jsonl",
        updatedAt: nowMs - 2_000,
        startedAt: nowMs - 60_000,
        status: "running",
      },
      "agent:main:subagent:designer": {
        sessionId: "sess-designer",
        sessionFile: "sess-designer.jsonl",
        updatedAt: nowMs - 1_000,
        startedAt: nowMs - 45_000,
        status: "running",
        teamId: "vibe-coder",
        teamRole: "ui/ux designer",
        spawnedBy: "main",
        parentSessionKey: "main",
      },
    });
    await writeTranscript(
      storePath,
      "sess-main.jsonl",
      'Conversation info (untrusted metadata): ```json {"foo":"bar"}```\nPreview ready at https://example.com/preview/not-a-task',
    );
    await writeTranscript(
      storePath,
      "sess-designer.jsonl",
      "Preview ready at https://example.com/preview/task-123\nFILE:artifacts/preview.html",
    );

    const cfg = {
      agents: {
        default: "main",
        defaults: {
          workspace: workspaceDir,
        },
      },
      session: {
        store: storePath,
      },
    } as MaumauConfig;

    const approvals: ExecApprovalRecord[] = [
      {
        id: "approval-1",
        createdAtMs: nowMs - 30_000,
        expiresAtMs: nowMs + 300_000,
        request: {
          command: "Approve the UI preview publish",
          sessionKey: "agent:main:subagent:designer",
          agentId: "main",
        },
      },
    ];

    const snapshot = await collectDashboardSnapshot({
      cfg,
      nowMs,
      stateDir: tempRoot,
      cronStorePath: path.join(tempRoot, "cron-store.json"),
      execApprovals: approvals,
      cron: {
        list: async () => [
          buildCronJob({
            id: "routine-daily-standup",
            name: "Daily standup",
            nowMs,
            nextRunAtMs: nowMs + 3_600_000,
          }),
        ],
        status: async () => buildCronStatus(),
      },
    });

    expect(snapshot.tasks).toHaveLength(1);
    expect(snapshot.tasks[0]?.sessionKey).toBe("agent:main:subagent:designer");
    expect(snapshot.tasks[0]?.title).toBe("UI design");
    expect(snapshot.tasks[0]?.summary).toBeUndefined();
    expect(snapshot.tasks[0]?.blockerLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "approval:approval-1",
          suggestion: "Open the related session, review the request, then approve or reject it.",
        }),
      ]),
    );
    expect(snapshot.today.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "approval:approval-1",
          suggestion: "Open the related session, review the request, then approve or reject it.",
          taskId: "task:agent:main:subagent:designer",
        }),
      ]),
    );
    expect(snapshot.tasks.some((task) => task.sessionKey === "main")).toBe(false);
    expect(snapshot.workshop).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          taskId: "task:agent:main:subagent:designer",
          title: "UI design",
          previewUrl: "https://example.com/preview/task-123",
          embeddable: true,
        }),
      ]),
    );
    expect(snapshot.today.scheduledToday.some((event) => event.kind === "approval_needed")).toBe(
      true,
    );
    expect(
      snapshot.today.scheduledToday.some((event) => event.title.includes("Conversation info")),
    ).toBe(false);
  });

  it("builds life profile coverage from USER.md for life-improvement agents", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-dashboard-life-profile-"));
    tempDirs.push(tempRoot);
    const nowMs = Date.UTC(2026, 3, 12, 15, 0, 0);
    const storePath = path.join(tempRoot, "sessions.json");
    const workspaceDir = path.join(tempRoot, "workspace-main");
    await fs.mkdir(workspaceDir, { recursive: true });
    await writeSessionStore(storePath, {});
    await fs.writeFile(
      path.join(workspaceDir, "USER.md"),
      `# USER.md - About Your Human

- **Name:** Sam
- **What to call them:** Sam
- **Timezone:** Asia/Singapore

## Life Snapshot

- **Daily / weekly rhythm:** Wake 7, office 9:30 to 10, finish 7 to 7:30.
- **Current priorities:** Stay more consistent and less chaotic.
- **What they want more help with:** Organization, reminders, and planning.
- **Work / school / purpose:** Office work during the week.
- **Home / routines / organization:** Weekends are mostly recovery and resetting.
`,
      "utf8",
    );
    const cfg = ensureBundledTeamPresetConfig(
      {
        agents: {
          defaults: {
            workspace: workspaceDir,
          },
        },
        session: {
          store: storePath,
        },
      } satisfies MaumauConfig,
      LIFE_IMPROVEMENT_TEAM_ID,
    );

    const snapshot = await collectDashboardSnapshot({
      cfg,
      nowMs,
      stateDir: tempRoot,
      cronStorePath: path.join(tempRoot, "cron-store.json"),
      cron: {
        list: async () => [],
        status: async () => buildCronStatus(),
      },
    });

    expect(snapshot.lifeProfile.teamConfigured).toBe(true);
    expect(snapshot.lifeProfile.sourceStatus).toBe("loaded");
    expect(snapshot.lifeProfile.sourceLabel).toBe("main/USER.md");
    expect(snapshot.lifeProfile.recordedFieldCount).toBeGreaterThanOrEqual(5);
    expect(snapshot.lifeProfile.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "daily_weekly_rhythm",
          status: "recorded",
          value: expect.stringContaining("office 9:30"),
        }),
        expect.objectContaining({
          key: "hobbies_interests",
          status: "future",
        }),
      ]),
    );
    const lifeCoach = snapshot.lifeProfile.agents.find(
      (agent) => agent.agentId === "life-improvement-life-mindset-coach",
    );
    expect(lifeCoach).toBeDefined();
    expect(lifeCoach?.needs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldKey: "support_needs",
          status: "recorded",
          why: expect.stringContaining("Life & Mindset Coach"),
          value: expect.stringContaining("Organization"),
        }),
        expect.objectContaining({
          fieldKey: "hobbies_interests",
          status: "future",
        }),
      ]),
    );
  });

  it("prefers assistant follow-up advice for direct-session blockers", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-dashboard-direct-blocker-"));
    tempDirs.push(tempRoot);
    const nowMs = Date.UTC(2026, 3, 6, 3, 30, 0);
    const storePath = path.join(tempRoot, "sessions.json");
    const sessionKey = "agent:main:telegram:direct:6925625562";

    await writeSessionStore(storePath, {
      [sessionKey]: {
        sessionId: "sess-telegram-direct",
        sessionFile: "sess-telegram-direct.jsonl",
        updatedAt: nowMs - 1_000,
        startedAt: nowMs - 60_000,
        status: "running",
      },
    });
    await writeTranscriptEntries(storePath, "sess-telegram-direct.jsonl", [
      {
        role: "user",
        content: [{ type: "text", text: "Build checkout confirmation page." }],
      },
      {
        role: "toolResult",
        toolName: "sessions_spawn",
        content: [
          {
            type: "text",
            text: '{\n  "status": "forbidden",\n  "error": "This task requires UI/human-facing team execution. Use teams_run with teamId=\\"design-studio\\" instead of sessions_spawn."\n}',
          },
        ],
        details: {
          status: "forbidden",
          error:
            'This task requires UI/human-facing team execution. Use teams_run with teamId="design-studio" instead of sessions_spawn.',
        },
      },
      {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "[[reply_to_current]] I'm blocked from doing that directly from here.\n\nIf you want, I can try again through the required team path.",
          },
        ],
      },
    ]);

    const cfg = {
      agents: {
        default: "main",
      },
      session: {
        store: storePath,
      },
    } as MaumauConfig;

    const snapshot = await collectDashboardSnapshot({
      cfg,
      nowMs,
      stateDir: tempRoot,
      cronStorePath: path.join(tempRoot, "cron-store.json"),
      cron: {
        list: async () => [],
        status: async () => buildCronStatus(),
      },
    });

    expect(snapshot.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sessionKey,
          source: "direct_session",
          status: "blocked",
          title: "checkout confirmation page",
          blockerLinks: expect.arrayContaining([
            expect.objectContaining({
              id: `tool-result:task:${sessionKey}`,
              description: "I'm blocked from doing that directly from here.",
              suggestion: "If you want, I can try again through the required team path.",
            }),
          ]),
        }),
      ]),
    );
    expect(snapshot.today.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `tool-result:task:${sessionKey}`,
          taskId: `task:${sessionKey}`,
          sessionKey,
          suggestion: "If you want, I can try again through the required team path.",
        }),
      ]),
    );
  });

  it("clears stale direct-session blockers after later recovery progress", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-dashboard-direct-clear-"));
    tempDirs.push(tempRoot);
    const nowMs = Date.UTC(2026, 3, 6, 4, 0, 0);
    const storePath = path.join(tempRoot, "sessions.json");
    const sessionKey = "agent:main:telegram:direct:6925625562";

    await writeSessionStore(storePath, {
      [sessionKey]: {
        sessionId: "sess-telegram-recovered",
        sessionFile: "sess-telegram-recovered.jsonl",
        updatedAt: nowMs - 1_000,
        startedAt: nowMs - 60_000,
        status: "running",
      },
    });
    await writeTranscriptEntries(storePath, "sess-telegram-recovered.jsonl", [
      {
        role: "user",
        content: [{ type: "text", text: "Build the Mistborn page." }],
      },
      {
        role: "toolResult",
        toolName: "teams_run",
        content: [
          {
            type: "text",
            text: '{\n  "status": "forbidden",\n  "error": "This task requires asset-only design team execution. Use teams_run with teamId=\\"design-studio\\" instead of sessions_spawn."\n}',
          },
        ],
        details: {
          status: "forbidden",
          error:
            'This task requires asset-only design team execution. Use teams_run with teamId="design-studio" instead of sessions_spawn.',
        },
      },
      {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "The preferred team path was blocked. I'll use the required design team instead.",
          },
        ],
      },
    ]);

    const cfg = {
      agents: {
        default: "main",
      },
      session: {
        store: storePath,
      },
    } as MaumauConfig;

    const blockedSnapshot = await collectDashboardSnapshot({
      cfg,
      nowMs,
      stateDir: tempRoot,
      cronStorePath: path.join(tempRoot, "cron-store.json"),
      cron: {
        list: async () => [],
        status: async () => buildCronStatus(),
      },
    });

    expect(blockedSnapshot.tasks.some((task) => task.sessionKey === sessionKey)).toBe(true);

    await writeTranscriptEntries(storePath, "sess-telegram-recovered.jsonl", [
      {
        role: "user",
        content: [{ type: "text", text: "Build the Mistborn page." }],
      },
      {
        role: "toolResult",
        toolName: "teams_run",
        content: [
          {
            type: "text",
            text: '{\n  "status": "forbidden",\n  "error": "This task requires asset-only design team execution. Use teams_run with teamId=\\"design-studio\\" instead of sessions_spawn."\n}',
          },
        ],
        details: {
          status: "forbidden",
          error:
            'This task requires asset-only design team execution. Use teams_run with teamId="design-studio" instead of sessions_spawn.',
        },
      },
      {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "The preferred team path was blocked. I'll use the required design team instead.",
          },
        ],
      },
      {
        role: "toolResult",
        toolName: "teams_run",
        content: [{ type: "text", text: '{\n  "status": "accepted"\n}' }],
        details: {
          status: "accepted",
        },
      },
      {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "It's in progress now - I've got the design team building the page and I'll send the result when it's ready.",
          },
        ],
      },
    ]);

    const snapshot = await collectDashboardSnapshot({
      cfg,
      nowMs: nowMs + 60_000,
      stateDir: tempRoot,
      cronStorePath: path.join(tempRoot, "cron-store.json"),
      cron: {
        list: async () => [],
        status: async () => buildCronStatus(),
      },
    });

    expect(snapshot.tasks.some((task) => task.sessionKey === sessionKey)).toBe(false);
    expect(snapshot.today.blockers.some((blocker) => blocker.sessionKey === sessionKey)).toBe(
      false,
    );
  });

  it("uses the latest assistant blocker options after an earlier blocked handoff was retried", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-dashboard-direct-latest-"));
    tempDirs.push(tempRoot);
    const nowMs = Date.UTC(2026, 3, 6, 4, 15, 0);
    const storePath = path.join(tempRoot, "sessions.json");
    const sessionKey = "agent:main:telegram:direct:6925625562";

    await writeSessionStore(storePath, {
      [sessionKey]: {
        sessionId: "sess-telegram-latest-blocker",
        sessionFile: "sess-telegram-latest-blocker.jsonl",
        updatedAt: nowMs - 1_000,
        startedAt: nowMs - 60_000,
        status: "running",
      },
    });
    await writeTranscriptEntries(storePath, "sess-telegram-latest-blocker.jsonl", [
      {
        role: "user",
        content: [{ type: "text", text: "Build the Mistborn page." }],
      },
      {
        role: "toolResult",
        toolName: "teams_run",
        content: [
          {
            type: "text",
            text: '{\n  "status": "forbidden",\n  "error": "This task requires asset-only design team execution. Use teams_run with teamId=\\"design-studio\\" instead of sessions_spawn."\n}',
          },
        ],
        details: {
          status: "forbidden",
          error:
            'This task requires asset-only design team execution. Use teams_run with teamId="design-studio" instead of sessions_spawn.',
        },
      },
      {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "The preferred team path was blocked. I'll use the required design team instead.",
          },
        ],
      },
      {
        role: "toolResult",
        toolName: "teams_run",
        content: [{ type: "text", text: '{\n  "status": "accepted"\n}' }],
        details: {
          status: "accepted",
        },
      },
      {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "It's in progress now - I've got the design team building the page and I'll send the result when it's ready.",
          },
        ],
      },
      {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "[[reply_to_current]] I hit a routing blocker: the team I'm required to use here is asset-only, and it refused the job because this is actual webpage implementation, not just design assets.\n\nWhat I can do next:\n1. make you a Mistborn design brief instead\n2. try again once the implementation lane is available for webpage building\n3. just give you the full page content + structure here so it's ready to turn into a site fast",
          },
        ],
      },
    ]);

    const cfg = {
      agents: {
        default: "main",
      },
      session: {
        store: storePath,
      },
    } as MaumauConfig;

    const snapshot = await collectDashboardSnapshot({
      cfg,
      nowMs,
      stateDir: tempRoot,
      cronStorePath: path.join(tempRoot, "cron-store.json"),
      cron: {
        list: async () => [],
        status: async () => buildCronStatus(),
      },
    });

    expect(snapshot.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sessionKey,
          status: "blocked",
          blockerLinks: expect.arrayContaining([
            expect.objectContaining({
              description:
                "I hit a routing blocker: the team I'm required to use here is asset-only, and it refused the job because this is actual webpage implementation, not just design assets.",
              suggestion:
                "Next options: make you a Mistborn design brief instead; try again once the implementation lane is available for webpage building; or just give you the full page content + structure here so it's ready to turn into a site fast.",
            }),
          ]),
        }),
      ]),
    );
  });

  it("ignores work-item control payloads when extracting transcript blockers", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-dashboard-work-item-"));
    tempDirs.push(tempRoot);
    const nowMs = Date.UTC(2026, 3, 13, 9, 0, 0);
    const storePath = path.join(tempRoot, "sessions.json");
    const sessionKey = `agent:${STARTER_TEAM_MANAGER_AGENT_ID}:main`;

    await writeSessionStore(storePath, {
      [sessionKey]: {
        sessionId: "sess-manager-work-item-blocked",
        sessionFile: "sess-manager-work-item-blocked.jsonl",
        updatedAt: nowMs - 1_000,
        startedAt: nowMs - 60_000,
        status: "running",
        teamId: "vibe-coder",
        teamRole: "manager",
      },
    });
    await writeTranscriptMessages(storePath, "sess-manager-work-item-blocked.jsonl", [
      {
        role: "assistant",
        text: 'WORK_ITEM:{"title":"Fit Tee Landing Preview","summary":"Private preview publish needs the artifact inspected before manager confirmation.","teamRun":{"kind":"team_run","teamId":"vibe-coder","workflowId":"default","event":"blocked","currentStageId":"manager_confirmation","currentStageName":"Manager Confirmation","completedStageIds":["planning","architecture","execution","qa"],"status":"blocked"}}',
      },
    ]);

    const cfg = ensureStarterTeamConfig({
      session: {
        store: storePath,
      },
    } as MaumauConfig);

    const tasks = await collectDashboardTasks({
      cfg,
      nowMs,
      stateDir: tempRoot,
      cronStorePath: path.join(tempRoot, "cron-store.json"),
      cron: {
        list: async () => [],
        status: async () => buildCronStatus(),
      },
    });

    expect(tasks.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sessionKey,
          title: "Fit Tee Landing Preview",
          status: "blocked",
          summary: "Private preview publish needs the artifact inspected before manager confirmation.",
          blockerLinks: [],
        }),
      ]),
    );
  });

  it("adds actionable failure blockers to tasks and today's blocker list", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-dashboard-failure-"));
    tempDirs.push(tempRoot);
    const nowMs = Date.UTC(2026, 3, 5, 2, 0, 0);
    const storePath = path.join(tempRoot, "sessions.json");
    const sessionKey = "agent:main:subagent:developer";

    await writeSessionStore(storePath, {
      [sessionKey]: {
        sessionId: "sess-failed-task",
        sessionFile: "sess-failed-task.jsonl",
        updatedAt: nowMs - 1_000,
        startedAt: nowMs - 60_000,
        endedAt: nowMs - 500,
        status: "failed",
        teamId: "vibe-coder",
        teamRole: "developer",
      },
    });
    await writeTranscriptMessages(storePath, "sess-failed-task.jsonl", [
      {
        role: "user",
        text: "Implement the subscription checkout page.",
      },
      {
        role: "assistant",
        text: "TypeError: checkout schema was undefined.",
      },
    ]);

    const cfg = {
      agents: {
        default: "main",
      },
      session: {
        store: storePath,
      },
    } as MaumauConfig;

    const snapshot = await collectDashboardSnapshot({
      cfg,
      nowMs,
      stateDir: tempRoot,
      cronStorePath: path.join(tempRoot, "cron-store.json"),
      cron: {
        list: async () => [],
        status: async () => buildCronStatus(),
      },
    });

    expect(snapshot.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sessionKey,
          status: "blocked",
          blockerLinks: expect.arrayContaining([
            expect.objectContaining({
              id: `failure:task:${sessionKey}`,
              description: "TypeError: checkout schema was undefined.",
              suggestion:
                "Open the related session, inspect the latest failure, fix or retry it, then continue.",
            }),
          ]),
        }),
      ]),
    );
    expect(snapshot.today.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `failure:task:${sessionKey}`,
          taskId: `task:${sessionKey}`,
          suggestion:
            "Open the related session, inspect the latest failure, fix or retry it, then continue.",
        }),
      ]),
    );
  });

  it("does not mark advisory mentions of blocker as active blockers", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-dashboard-advisory-qa-"));
    tempDirs.push(tempRoot);
    const nowMs = Date.UTC(2026, 3, 5, 2, 30, 0);
    const storePath = path.join(tempRoot, "sessions.json");
    const sessionKey = "agent:main:subagent:visual-qa";

    await writeSessionStore(storePath, {
      [sessionKey]: {
        sessionId: "sess-visual-qa",
        sessionFile: "sess-visual-qa.jsonl",
        updatedAt: nowMs - 1_000,
        startedAt: nowMs - 60_000,
        endedAt: nowMs - 500,
        status: "done",
        teamId: "vibe-coder",
        teamRole: "visual/ux qa",
      },
    });
    await writeTranscriptMessages(storePath, "sess-visual-qa.jsonl", [
      {
        role: "user",
        text: "QA the Indonesia page copy.",
      },
      {
        role: "assistant",
        text: `Verdict:
- For readability and structure, this passes.
- Only blocker would be if the parent wants a stricter diff-scoped approval standard.
- Keep the current wording and ship it.`,
      },
    ]);

    const cfg = {
      agents: {
        default: "main",
      },
      session: {
        store: storePath,
      },
    } as MaumauConfig;

    const snapshot = await collectDashboardSnapshot({
      cfg,
      nowMs,
      stateDir: tempRoot,
      cronStorePath: path.join(tempRoot, "cron-store.json"),
      cron: {
        list: async () => [],
        status: async () => buildCronStatus(),
      },
    });

    expect(snapshot.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sessionKey,
          status: "done",
          blockerLinks: [],
        }),
      ]),
    );
    expect(snapshot.today.blockers.some((blocker) => blocker.sessionKey === sessionKey)).toBe(
      false,
    );
  });

  it("drops stale blockers when a newer named-session rerun succeeds on another agent", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-dashboard-rerun-"));
    tempDirs.push(tempRoot);
    const nowMs = Date.UTC(2026, 3, 11, 4, 0, 0);
    const storePath = path.join(tempRoot, "sessions.json");
    const oldSessionKey = "agent:main:daily-reflection-curation";
    const newSessionKey = "agent:reviewer:daily-reflection-curation";
    const oldChildSessionKey = "agent:vibe-coder-manager:subagent:old-daily";

    await writeSessionStore(storePath, {
      [oldSessionKey]: {
        sessionId: "sess-daily-old",
        sessionFile: "sess-daily-old.jsonl",
        updatedAt: nowMs - 120_000,
        startedAt: nowMs - 300_000,
        endedAt: nowMs - 120_000,
        status: "done",
      },
      [newSessionKey]: {
        sessionId: "sess-daily-new",
        sessionFile: "sess-daily-new.jsonl",
        updatedAt: nowMs - 1_000,
        startedAt: nowMs - 60_000,
        endedAt: nowMs - 1_000,
        status: "done",
      },
      [oldChildSessionKey]: {
        sessionId: "sess-daily-old-child",
        sessionFile: "sess-daily-old-child.jsonl",
        updatedAt: nowMs - 110_000,
        startedAt: nowMs - 240_000,
        endedAt: nowMs - 110_000,
        status: "done",
        parentSessionKey: oldSessionKey,
        teamId: "vibe-coder",
        teamRole: "manager",
      },
    });
    await writeTranscriptMessages(storePath, "sess-daily-old.jsonl", [
      {
        role: "assistant",
        text: "I'm blocked from doing that directly from here.",
      },
    ]);
    await writeTranscriptMessages(storePath, "sess-daily-new.jsonl", [
      {
        role: "assistant",
        text: "All set. Wrote today's daily reflection note.",
      },
    ]);
    await writeTranscriptMessages(storePath, "sess-daily-old-child.jsonl", [
      {
        role: "assistant",
        text: "Technical QA blocked approval.",
      },
    ]);

    const cfg = {
      agents: {
        default: "main",
        list: [{ id: "reviewer" }],
      },
      session: {
        store: storePath,
      },
    } as MaumauConfig;

    const snapshot = await collectDashboardSnapshot({
      cfg,
      nowMs,
      stateDir: tempRoot,
      cronStorePath: path.join(tempRoot, "cron-store.json"),
      cron: {
        list: async () => [],
        status: async () => buildCronStatus(),
      },
    });

    expect(snapshot.tasks.some((task) => task.sessionKey === oldSessionKey)).toBe(false);
    expect(snapshot.tasks.some((task) => task.sessionKey === oldChildSessionKey)).toBe(false);
    expect(snapshot.today.blockers.some((blocker) => blocker.sessionKey === oldSessionKey)).toBe(
      false,
    );
    expect(
      snapshot.today.blockers.some((blocker) => blocker.sessionKey === oldChildSessionKey),
    ).toBe(false);
  });

  it("retains completed work items and expands daily routines across the visible month", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-dashboard-retain-"));
    tempDirs.push(tempRoot);
    const nowMs = Date.UTC(2026, 3, 5, 8, 0, 0);
    const storePath = path.join(tempRoot, "sessions.json");

    await writeSessionStore(storePath, {
      "agent:main:subagent:system-architect": {
        sessionId: "sess-arch",
        sessionFile: "sess-arch.jsonl",
        updatedAt: nowMs - 10_000,
        startedAt: nowMs - 120_000,
        endedAt: nowMs - 5_000,
        status: "done",
        teamId: "vibe-coder",
        teamRole: "system architect",
      },
    });
    await writeTranscript(storePath, "sess-arch.jsonl", "Design task complete.");

    const cfg = {
      agents: {
        default: "main",
      },
      session: {
        store: storePath,
      },
    } as MaumauConfig;

    const firstTasks = await collectDashboardTasks({
      cfg,
      nowMs,
      stateDir: tempRoot,
      cronStorePath: path.join(tempRoot, "cron-store.json"),
      cron: {
        list: async () => [],
        status: async () => buildCronStatus(),
      },
    });
    expect(firstTasks.items.map((item) => item.sessionKey)).toContain(
      "agent:main:subagent:system-architect",
    );

    await writeSessionStore(storePath, {});

    const retainedTasks = await collectDashboardTasks({
      cfg,
      nowMs: nowMs + 60_000,
      stateDir: tempRoot,
      cronStorePath: path.join(tempRoot, "cron-store.json"),
      cron: {
        list: async () => [],
        status: async () => buildCronStatus(),
      },
    });
    expect(retainedTasks.items.map((item) => item.sessionKey)).toContain(
      "agent:main:subagent:system-architect",
    );
    expect(retainedTasks.items[0]?.status).toBe("done");
    expect(retainedTasks.items[0]?.title).toBe("Architecture plan");

    const calendar = await collectDashboardCalendar({
      cfg,
      nowMs,
      stateDir: tempRoot,
      view: "month",
      anchorAtMs: nowMs,
      cronStorePath: path.join(tempRoot, "cron-store.json"),
      cron: {
        list: async () => [
          buildCronJob({
            id: "daily-review",
            name: "Daily review",
            nowMs,
            schedule: {
              kind: "every",
              everyMs: 24 * 60 * 60 * 1_000,
              anchorMs: Date.UTC(2026, 2, 29, 8, 0, 0),
            },
            nextRunAtMs: Date.UTC(2026, 3, 6, 8, 0, 0),
          }),
        ],
        status: async () => buildCronStatus(),
      },
    });

    const dailyOccurrences = calendar.events.filter((event) => event.jobId === "daily-review");
    expect(dailyOccurrences.length).toBeGreaterThan(10);
    expect(
      new Set(dailyOccurrences.map((event) => new Date(event.startAtMs).getUTCDate())).size,
    ).toBeGreaterThan(10);
  });

  it("classifies routine preview windows from cron cadence", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-dashboard-routines-"));
    tempDirs.push(tempRoot);
    const nowMs = Date.UTC(2026, 3, 12, 8, 0, 0);

    const routines = await collectDashboardRoutines({
      nowMs,
      stateDir: tempRoot,
      cronStorePath: path.join(tempRoot, "cron-store.json"),
      cron: {
        list: async () => [
          buildCronJob({
            id: "daily-review",
            name: "Daily review",
            nowMs,
            schedule: {
              kind: "every",
              everyMs: 24 * 60 * 60 * 1_000,
              anchorMs: Date.UTC(2026, 3, 11, 8, 0, 0),
            },
            nextRunAtMs: Date.UTC(2026, 3, 13, 8, 0, 0),
          }),
          buildCronJob({
            id: "weekly-planning",
            name: "Weekly planning",
            nowMs,
            schedule: {
              kind: "cron",
              expr: "0 9 * * 1",
              tz: "UTC",
            },
            nextRunAtMs: Date.UTC(2026, 3, 13, 9, 0, 0),
          }),
        ],
        status: async () => buildCronStatus(),
      },
    });

    expect(routines.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceJobId: "daily-review",
          scheduleKind: "every",
          preview: expect.objectContaining({
            view: "day",
            runAtMs: expect.arrayContaining([Date.UTC(2026, 3, 13, 8, 0, 0)]),
          }),
        }),
        expect.objectContaining({
          sourceJobId: "weekly-planning",
          scheduleKind: "cron",
          preview: expect.objectContaining({
            view: "week",
            runAtMs: expect.arrayContaining([Date.UTC(2026, 3, 13, 9, 0, 0)]),
          }),
        }),
      ]),
    );
  });

  it("keeps managed life-improvement routines visible in the routines list", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-dashboard-life-routines-"));
    tempDirs.push(tempRoot);
    const nowMs = Date.UTC(2026, 3, 12, 8, 0, 0);

    const routines = await collectDashboardRoutines({
      nowMs,
      stateDir: tempRoot,
      cronStorePath: path.join(tempRoot, "cron-store.json"),
      cron: {
        list: async () => [
          buildCronJob({
            id: "life-check-in",
            name: LIFE_IMPROVEMENT_ROUTINE_JOB_NAME,
            description:
              "Daily heartbeat-backed personal check-in routine that updates an incremental life profile.",
            nowMs,
            schedule: {
              kind: "cron",
              expr: "0 10 * * *",
              tz: "Asia/Singapore",
            },
            nextRunAtMs: Date.UTC(2026, 3, 13, 2, 0, 0),
          }),
          buildCronJob({
            id: "life-expense-sync",
            name: LIFE_IMPROVEMENT_FINANCE_SYNC_JOB_NAME,
            description:
              "Daily quiet finance collection that lets the financial coach gather receipt-based spending from email and persist normalized expenses into wallet history.",
            nowMs,
            schedule: {
              kind: "cron",
              expr: "15 8 * * *",
              tz: "Asia/Singapore",
            },
            nextRunAtMs: Date.UTC(2026, 3, 13, 0, 15, 0),
          }),
        ],
        status: async () => buildCronStatus(),
      },
    });

    expect(routines.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceJobId: "life-check-in",
          title: LIFE_IMPROVEMENT_ROUTINE_JOB_NAME,
          visibility: "user_facing",
        }),
        expect.objectContaining({
          sourceJobId: "life-expense-sync",
          title: LIFE_IMPROVEMENT_FINANCE_SYNC_JOB_NAME,
          visibility: "user_facing",
        }),
      ]),
    );
  });

  it("repairs stale hidden routine visibility for managed life-improvement jobs", async () => {
    const tempRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "maumau-dashboard-life-routines-migrate-"),
    );
    tempDirs.push(tempRoot);
    const nowMs = Date.UTC(2026, 3, 12, 8, 0, 0);
    await fs.mkdir(path.join(tempRoot, "dashboard"), { recursive: true });
    await fs.writeFile(
      path.join(tempRoot, "dashboard", "routine-visibility.json"),
      JSON.stringify(
        {
          version: 1,
          updatedAtMs: nowMs - 60_000,
          preferences: {
            "life-check-in": {
              visibility: "hidden",
              updatedAtMs: nowMs - 60_000,
            },
            "life-expense-sync": {
              visibility: "hidden",
              updatedAtMs: nowMs - 60_000,
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const routines = await collectDashboardRoutines({
      nowMs,
      stateDir: tempRoot,
      cronStorePath: path.join(tempRoot, "cron-store.json"),
      cron: {
        list: async () => [
          buildCronJob({
            id: "life-check-in",
            name: LIFE_IMPROVEMENT_ROUTINE_JOB_NAME,
            description:
              "Daily heartbeat-backed personal check-in routine that updates an incremental life profile.",
            nowMs,
            schedule: {
              kind: "cron",
              expr: "0 10 * * *",
              tz: "Asia/Singapore",
            },
            nextRunAtMs: Date.UTC(2026, 3, 13, 2, 0, 0),
          }),
          buildCronJob({
            id: "life-expense-sync",
            name: LIFE_IMPROVEMENT_FINANCE_SYNC_JOB_NAME,
            description:
              "Daily quiet finance collection that lets the financial coach gather receipt-based spending from email and persist normalized expenses into wallet history.",
            nowMs,
            schedule: {
              kind: "cron",
              expr: "15 8 * * *",
              tz: "Asia/Singapore",
            },
            nextRunAtMs: Date.UTC(2026, 3, 13, 0, 15, 0),
          }),
        ],
        status: async () => buildCronStatus(),
      },
    });

    expect(routines.items.map((routine) => routine.sourceJobId)).toEqual(
      expect.arrayContaining(["life-check-in", "life-expense-sync"]),
    );

    const visibilityStore = JSON.parse(
      await fs.readFile(path.join(tempRoot, "dashboard", "routine-visibility.json"), "utf8"),
    ) as {
      preferences: Record<string, { visibility: string }>;
    };
    expect(visibilityStore.preferences["life-check-in"]?.visibility).toBe("user_facing");
    expect(visibilityStore.preferences["life-expense-sync"]?.visibility).toBe("user_facing");
  });

  it("projects user activities and agreed routines into calendar known-activity events", async () => {
    const tempRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "maumau-dashboard-calendar-activity-"),
    );
    tempDirs.push(tempRoot);
    const nowMs = Date.UTC(2026, 3, 13, 12, 0, 0);
    const storePath = path.join(tempRoot, "sessions.json");
    const workspaceDir = path.join(tempRoot, "workspace-main");
    await fs.mkdir(workspaceDir, { recursive: true });
    await fs.writeFile(
      path.join(workspaceDir, "USER.md"),
      `# USER.md - About Your Human

- **Name:** Sami
- **What to call them:** Sami
- **Timezone:** Asia/Singapore

## Life Snapshot

- **Daily / weekly rhythm:** Usually wakes around 7. Works roughly 9-6 on weekdays. Weekends are for chilling.
- **What they want more help with:** Organization, reminders, check-ins, and recurring nudges.
- **Work / school / purpose:** Standard weekday work rhythm, roughly 9-6.
`,
      "utf8",
    );
    await writeSessionStore(storePath, {
      "agent:main:telegram:direct:6925625562": {
        sessionId: "sess-telegram",
        sessionFile: "sess-telegram.jsonl",
        updatedAt: nowMs - 60_000,
        startedAt: nowMs - 600_000,
        status: "running",
        channel: "telegram",
      },
    });
    await writeTranscriptMessages(storePath, "sess-telegram.jsonl", [
      {
        role: "assistant",
        text: `**Morning check-in**

**Midday reset**

**Evening shutdown**

- **Weekly reset:** inbox/admin and planning.`,
      },
    ]);

    const cfg = ensureBundledTeamPresetConfig(
      {
        agents: {
          defaults: {
            workspace: workspaceDir,
          },
        },
        session: {
          store: storePath,
        },
      } satisfies MaumauConfig,
      LIFE_IMPROVEMENT_TEAM_ID,
    );

    const calendar = await collectDashboardCalendar({
      cfg,
      nowMs,
      stateDir: tempRoot,
      view: "week",
      anchorAtMs: nowMs,
      cronStorePath: path.join(tempRoot, "cron-store.json"),
      cron: {
        list: async () => [],
        status: async () => buildCronStatus(),
      },
    });

    expect(calendar.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Wake up",
          kind: "known_activity",
          activityScope: "user",
        }),
        expect.objectContaining({
          title: "Work",
          kind: "known_activity",
          activityScope: "user",
          endAtMs: expect.any(Number),
        }),
        expect.objectContaining({
          title: "Morning check-in",
          kind: "known_activity",
          activityScope: "user",
        }),
        expect.objectContaining({
          title: "Midday reset",
          kind: "known_activity",
          activityScope: "user",
        }),
        expect.objectContaining({
          title: "Evening shutdown",
          kind: "known_activity",
          activityScope: "user",
        }),
        expect.objectContaining({
          title: "Weekly reset",
          kind: "known_activity",
          activityScope: "user",
        }),
      ]),
    );
  });

  it("uses the task subject from prompt/output context instead of only the role label", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-dashboard-context-"));
    tempDirs.push(tempRoot);
    const nowMs = Date.UTC(2026, 3, 5, 9, 0, 0);
    const storePath = path.join(tempRoot, "sessions.json");

    await writeSessionStore(storePath, {
      "agent:main:subagent:designer": {
        sessionId: "sess-designer-context",
        sessionFile: "sess-designer-context.jsonl",
        updatedAt: nowMs - 1_000,
        startedAt: nowMs - 30_000,
        endedAt: nowMs - 500,
        status: "done",
        teamId: "vibe-coder",
        teamRole: "ui/ux designer",
      },
    });
    await writeTranscriptMessages(storePath, "sess-designer-context.jsonl", [
      {
        role: "user",
        text: "Design the landing page for the Mistborn book microsite.",
      },
      {
        role: "assistant",
        text: "Completed the polished hero and layout for the Mistborn book microsite.",
      },
    ]);

    const cfg = {
      agents: {
        default: "main",
      },
      session: {
        store: storePath,
      },
    } as MaumauConfig;

    const tasks = await collectDashboardTasks({
      cfg,
      nowMs,
      stateDir: tempRoot,
      cronStorePath: path.join(tempRoot, "cron-store.json"),
      cron: {
        list: async () => [],
        status: async () => buildCronStatus(),
      },
    });

    expect(tasks.items[0]).toEqual(
      expect.objectContaining({
        title: "UI design for the Mistborn book microsite",
        summary: "Completed the polished hero and layout for the Mistborn book microsite.",
      }),
    );
  });

  it("stores deterministic team snapshots when generated summaries fall back", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-dashboard-teams-"));
    tempDirs.push(tempRoot);
    const logger = { warn: vi.fn() };
    const cfg = ensureStarterTeamConfig({} as MaumauConfig);

    __testing.setDepsForTests({
      prepareSimpleCompletionModelForAgent: vi.fn(async () => ({
        error: "no simple completion model available",
      })),
    });

    const result = await refreshStoredDashboardTeamSnapshots({
      cfg,
      stateDir: tempRoot,
      nowMs: 1_717_171_717_000,
      logger,
    });

    expect(result.snapshots.length).toBeGreaterThan(0);
    expect(result.snapshots[0]).toEqual(
      expect.objectContaining({
        status: "fallback",
        generatedAtMs: 1_717_171_717_000,
      }),
    );
    expect(result.snapshots[0]?.warnings).toContain("no simple completion model available");
    expect(result.snapshots[0]?.nodes.length).toBeGreaterThan(0);
    expect(result.snapshots[0]?.edges.length).toBeGreaterThan(0);
    expect(logger.warn).toHaveBeenCalled();

    const vibeCoderSnapshot = result.snapshots.find((snapshot) => snapshot.teamId === "vibe-coder");
    expect(vibeCoderSnapshot).toBeTruthy();
    expect(vibeCoderSnapshot?.nodes.find((node) => node.role === "system architect")?.stage).toBe(
      "architecture",
    );
    expect(vibeCoderSnapshot?.nodes.find((node) => node.role === "developer")?.stage).toBe(
      "execution",
    );
    expect(vibeCoderSnapshot?.nodes.find((node) => node.role === "technical qa")?.stage).toBe("qa");
    expect(vibeCoderSnapshot?.edges.some((edge) => edge.kind === "flow")).toBe(true);
    expect(
      vibeCoderSnapshot?.edges.some(
        (edge) =>
          edge.kind === "reviews" &&
          vibeCoderSnapshot.nodes.find((node) => node.id === edge.from)?.role === "technical qa",
      ),
    ).toBe(true);

    const persisted = await readStoredDashboardTeamSnapshots({ stateDir: tempRoot });
    expect(persisted).toEqual(result);
  });

  it("can preview draft team snapshots without overwriting the stored dashboard snapshot file", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-dashboard-team-preview-"));
    tempDirs.push(tempRoot);
    const cfg = ensureStarterTeamConfig({} as MaumauConfig);
    const vibeCoder = cfg.teams?.list?.find((team) => team.id === "vibe-coder");
    const defaultWorkflow = vibeCoder?.workflows?.find((workflow) => workflow.id === "default");
    const managerConfirmationStage = defaultWorkflow?.lifecycle?.stages?.find(
      (stage) => stage.id === "manager_confirmation",
    );
    if (managerConfirmationStage) {
      managerConfirmationStage.name = "Final Review";
    }

    __testing.setDepsForTests({
      prepareSimpleCompletionModelForAgent: vi.fn(async () => ({
        error: "no simple completion model available",
      })),
    });

    const preview = await collectDashboardTeamSnapshots({
      cfg,
      nowMs: 1_717_171_718_000,
    });

    const previewSnapshot = preview.snapshots.find((snapshot) => snapshot.teamId === "vibe-coder");
    expect(
      previewSnapshot?.lifecycleStages?.find((stage) => stage.id === "manager_confirmation"),
    ).toEqual(
      expect.objectContaining({
        name: "Final Review",
      }),
    );

    const persisted = await readStoredDashboardTeamSnapshots({ stateDir: tempRoot });
    expect(persisted).toEqual({ generatedAtMs: 0, snapshots: [] });
  });

  it("refreshes stale stored team snapshots when the saved teams config changed", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-dashboard-team-fingerprint-"));
    tempDirs.push(tempRoot);
    const baseCfg = ensureStarterTeamConfig({} as MaumauConfig);
    const updatedCfg = ensureStarterTeamConfig({} as MaumauConfig);
    const updatedTeam = updatedCfg.teams?.list?.find((team) => team.id === "vibe-coder");
    const updatedWorkflow = updatedTeam?.workflows?.find((workflow) => workflow.id === "default");
    const updatedStage = updatedWorkflow?.lifecycle?.stages?.find(
      (stage) => stage.id === "manager_confirmation",
    );
    if (updatedStage) {
      updatedStage.name = "Final Review";
    }

    __testing.setDepsForTests({
      prepareSimpleCompletionModelForAgent: vi.fn(async () => ({
        error: "no simple completion model available",
      })),
    });

    await refreshStoredDashboardTeamSnapshots({
      cfg: baseCfg,
      stateDir: tempRoot,
      nowMs: 1_717_171_719_000,
    });

    const refreshed = await ensureStoredDashboardTeamSnapshots({
      cfg: updatedCfg,
      stateDir: tempRoot,
      nowMs: 1_717_171_720_000,
    });

    expect(
      refreshed.snapshots
        .find((snapshot) => snapshot.teamId === "vibe-coder")
        ?.lifecycleStages?.find((stage) => stage.id === "manager_confirmation")?.name,
    ).toBe("Final Review");
  });

  it("rolls delegated team lifecycle progress into the root task and keeps child team tasks in team detail", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-dashboard-team-runs-"));
    tempDirs.push(tempRoot);
    const nowMs = Date.UTC(2026, 3, 5, 11, 0, 0);
    const storePath = path.join(tempRoot, "sessions.json");
    const rootSessionKey = "agent:main:main";
    const managerSessionKey = `agent:${STARTER_TEAM_MANAGER_AGENT_ID}:subagent:run-1`;
    const architectSessionKey = `agent:${STARTER_TEAM_SYSTEM_ARCHITECT_AGENT_ID}:subagent:run-1`;
    const qaSessionKey = `agent:${STARTER_TEAM_TECHNICAL_QA_AGENT_ID}:subagent:run-1`;

    await writeSessionStore(storePath, {
      [rootSessionKey]: {
        sessionId: "sess-main-team-run",
        sessionFile: "sess-main-team-run.jsonl",
        updatedAt: nowMs - 500,
        startedAt: nowMs - 120_000,
        status: "running",
        childSessions: [managerSessionKey],
      },
      [managerSessionKey]: {
        sessionId: "sess-vibe-manager",
        sessionFile: "sess-vibe-manager.jsonl",
        updatedAt: nowMs - 300,
        startedAt: nowMs - 90_000,
        status: "running",
        teamId: "vibe-coder",
        teamRole: "manager",
        parentSessionKey: rootSessionKey,
        spawnedBy: rootSessionKey,
        childSessions: [architectSessionKey, qaSessionKey],
      },
      [architectSessionKey]: {
        sessionId: "sess-vibe-architect",
        sessionFile: "sess-vibe-architect.jsonl",
        updatedAt: nowMs - 10_000,
        startedAt: nowMs - 80_000,
        endedAt: nowMs - 8_000,
        status: "done",
        teamId: "vibe-coder",
        teamRole: "system architect",
        parentSessionKey: managerSessionKey,
        spawnedBy: managerSessionKey,
      },
      [qaSessionKey]: {
        sessionId: "sess-vibe-qa",
        sessionFile: "sess-vibe-qa.jsonl",
        updatedAt: nowMs - 200,
        startedAt: nowMs - 15_000,
        status: "running",
        teamId: "vibe-coder",
        teamRole: "technical qa",
        parentSessionKey: managerSessionKey,
        spawnedBy: managerSessionKey,
      },
    });

    await writeTranscriptMessages(storePath, "sess-main-team-run.jsonl", [
      {
        role: "user",
        text: "Build the subscription upgrade checkout flow with a clear confirmation page.",
      },
      {
        role: "assistant",
        text: "Delegating the staged implementation to the vibe-coder team.",
      },
    ]);
    await writeTranscriptMessages(storePath, "sess-vibe-manager.jsonl", [
      {
        role: "assistant",
        text: 'WORK_ITEM:{"title":"Build the subscription upgrade checkout flow","summary":"Architecture is complete and QA is verifying the implementation.","teamRun":{"kind":"team_run","teamId":"vibe-coder","workflowId":"default","rootSessionKey":"agent:main:main","event":"stage_enter","currentStageId":"qa","currentStageName":"QA","completedStageIds":["planning","architecture","execution"],"status":"in_progress"}}',
      },
    ]);
    await writeTranscriptMessages(storePath, "sess-vibe-architect.jsonl", [
      {
        role: "user",
        text: "Plan the subscription upgrade checkout flow.",
      },
      {
        role: "assistant",
        text: "Completed the checkout architecture and handoff notes.",
      },
    ]);
    await writeTranscriptMessages(storePath, "sess-vibe-qa.jsonl", [
      {
        role: "user",
        text: "Verify the checkout flow before release.",
      },
      {
        role: "assistant",
        text: "Running final QA verification on the checkout flow.",
      },
    ]);

    const cfg = ensureStarterTeamConfig({
      agents: {
        defaults: {
          workspace: tempRoot,
        },
      },
      session: {
        store: storePath,
      },
    } as MaumauConfig);

    const tasks = await collectDashboardTasks({
      cfg,
      nowMs,
      stateDir: tempRoot,
      cronStorePath: path.join(tempRoot, "cron-store.json"),
      cron: {
        list: async () => [],
        status: async () => buildCronStatus(),
      },
    });
    const teamRuns = await collectDashboardTeamRuns({
      cfg,
      nowMs,
      stateDir: tempRoot,
      cronStorePath: path.join(tempRoot, "cron-store.json"),
      cron: {
        list: async () => [],
        status: async () => buildCronStatus(),
      },
    });

    expect(tasks.items.map((item) => item.sessionKey)).toContain(rootSessionKey);
    expect(tasks.items.map((item) => item.sessionKey)).toContain(managerSessionKey);
    expect(tasks.items.map((item) => item.sessionKey)).toContain(qaSessionKey);

    const rootTask = tasks.items.find((item) => item.sessionKey === rootSessionKey);
    expect(rootTask).toEqual(
      expect.objectContaining({
        delegatedTeamRunId: `team-run:${managerSessionKey}`,
        currentStageId: "qa",
        currentStageLabel: "QA",
        completedStepCount: 3,
        totalStepCount: 6,
        progressLabel: "3/6 · QA",
        progressPercent: 50,
        status: "in_progress",
      }),
    );
    expect(tasks.items.find((item) => item.sessionKey === managerSessionKey)).toEqual(
      expect.objectContaining({
        visibilityScope: "team_detail",
        currentStageId: "qa",
        progressLabel: "3/6 · QA",
      }),
    );
    expect(tasks.items.find((item) => item.sessionKey === qaSessionKey)).toEqual(
      expect.objectContaining({
        visibilityScope: "team_detail",
        currentStageId: "qa",
        currentStageLabel: "QA",
      }),
    );

    const vibeRun = teamRuns.items.find((item) => item.teamId === "vibe-coder");
    expect(vibeRun).toEqual(
      expect.objectContaining({
        managerSessionKey,
        rootTaskId: `task:${rootSessionKey}`,
        currentStageId: "qa",
        completedStepCount: 3,
        totalStepCount: 6,
        progressLabel: "3/6 · QA",
        status: "in_progress",
      }),
    );
    expect(vibeRun?.items.map((item) => item.sessionKey)).toEqual(
      expect.arrayContaining([managerSessionKey, architectSessionKey, qaSessionKey]),
    );
    expect(vibeRun?.items.every((item) => item.visibilityScope === "team_detail")).toBe(true);
  });

  it("maps review only from lifecycle stages instead of child session fanout", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-dashboard-review-"));
    tempDirs.push(tempRoot);
    const nowMs = Date.UTC(2026, 3, 5, 12, 0, 0);
    const storePath = path.join(tempRoot, "sessions.json");
    const rootSessionKey = "agent:main:main";
    const managerSessionKey = `agent:${STARTER_TEAM_MANAGER_AGENT_ID}:subagent:run-review`;
    const architectSessionKey = `agent:${STARTER_TEAM_SYSTEM_ARCHITECT_AGENT_ID}:subagent:run-review`;

    await writeSessionStore(storePath, {
      [rootSessionKey]: {
        sessionId: "sess-main-review",
        sessionFile: "sess-main-review.jsonl",
        updatedAt: nowMs - 500,
        startedAt: nowMs - 120_000,
        status: "running",
        childSessions: [managerSessionKey],
      },
      [managerSessionKey]: {
        sessionId: "sess-vibe-manager-review",
        sessionFile: "sess-vibe-manager-review.jsonl",
        updatedAt: nowMs - 300,
        startedAt: nowMs - 90_000,
        status: "running",
        teamId: "vibe-coder",
        teamRole: "manager",
        parentSessionKey: rootSessionKey,
        spawnedBy: rootSessionKey,
        childSessions: [architectSessionKey],
      },
      [architectSessionKey]: {
        sessionId: "sess-vibe-architect-review",
        sessionFile: "sess-vibe-architect-review.jsonl",
        updatedAt: nowMs - 1_000,
        startedAt: nowMs - 40_000,
        endedAt: nowMs - 800,
        status: "done",
        teamId: "vibe-coder",
        teamRole: "system architect",
        parentSessionKey: managerSessionKey,
        spawnedBy: managerSessionKey,
      },
    });

    await writeTranscriptMessages(storePath, "sess-main-review.jsonl", [
      {
        role: "user",
        text: "Ship the billing settings refresh.",
      },
    ]);
    await writeTranscriptMessages(storePath, "sess-vibe-manager-review.jsonl", [
      {
        role: "assistant",
        text: 'WORK_ITEM:{"title":"Ship the billing settings refresh","teamRun":{"kind":"team_run","teamId":"vibe-coder","workflowId":"default","rootSessionKey":"agent:main:main","event":"stage_enter","currentStageId":"manager_confirmation","currentStageName":"Manager Confirmation","completedStageIds":["planning","architecture","execution","qa"]}}',
      },
    ]);
    await writeTranscriptMessages(storePath, "sess-vibe-architect-review.jsonl", [
      {
        role: "assistant",
        text: "Architecture complete.",
      },
    ]);

    const cfg = ensureStarterTeamConfig({
      session: {
        store: storePath,
      },
    } as MaumauConfig);

    const tasks = await collectDashboardTasks({
      cfg,
      nowMs,
      stateDir: tempRoot,
      cronStorePath: path.join(tempRoot, "cron-store.json"),
      cron: {
        list: async () => [],
        status: async () => buildCronStatus(),
      },
    });

    expect(tasks.items.find((item) => item.sessionKey === rootSessionKey)).toEqual(
      expect.objectContaining({
        currentStageId: "manager_confirmation",
        status: "review",
      }),
    );
  });

  it("falls back to a single visible stage for legacy teams without lifecycle config", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-dashboard-legacy-team-"));
    tempDirs.push(tempRoot);
    const nowMs = Date.UTC(2026, 3, 5, 13, 0, 0);
    const storePath = path.join(tempRoot, "sessions.json");

    await writeSessionStore(storePath, {
      "agent:alpha-manager:main": {
        sessionId: "sess-alpha-manager",
        sessionFile: "sess-alpha-manager.jsonl",
        updatedAt: nowMs - 500,
        startedAt: nowMs - 20_000,
        status: "running",
        teamId: "alpha",
        teamRole: "manager",
      },
    });
    await writeTranscriptMessages(storePath, "sess-alpha-manager.jsonl", [
      {
        role: "user",
        text: "Handle the legacy alpha task.",
      },
      {
        role: "assistant",
        text: "Working through the legacy team flow.",
      },
    ]);

    const tasks = await collectDashboardTasks({
      cfg: {
        agents: {
          list: [{ id: "alpha-manager", name: "Alpha Manager" }],
        },
        teams: {
          list: [
            {
              id: "alpha",
              name: "Alpha",
              managerAgentId: "alpha-manager",
              members: [],
            },
          ],
        },
        session: {
          store: storePath,
        },
      } as MaumauConfig,
      nowMs,
      stateDir: tempRoot,
      cronStorePath: path.join(tempRoot, "cron-store.json"),
      cron: {
        list: async () => [],
        status: async () => buildCronStatus(),
      },
    });

    expect(tasks.items[0]).toEqual(
      expect.objectContaining({
        sessionKey: "agent:alpha-manager:main",
        totalStepCount: 2,
        completedStepCount: 0,
        progressLabel: "0/2",
        status: "in_progress",
      }),
    );
  });

  it("does not crash workshop item derivation when dashboard callers omit cfg", async () => {
    const items = await __testing.buildWorkshopItemsForTests(
      [
        {
          id: "task:preview",
          sessionKey: "agent:main:subagent:designer",
          title: "UI design",
          status: "done",
          source: "team_session",
          createdAtMs: 1,
          sessionLinks: [],
          blockerLinks: [],
          previewLinks: [
            {
              id: "preview-1",
              sessionKey: "agent:main:subagent:designer",
              previewUrl: "https://example.com/preview/task-123",
              artifactPath: "artifacts/preview.html",
              embeddable: true,
              updatedAtMs: 2,
            },
          ],
        },
      ],
      { nowMs: 3 },
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toEqual(
      expect.objectContaining({
        title: "UI design",
        previewUrl: "https://example.com/preview/task-123",
        embedUrl: undefined,
      }),
    );
  });

  it("collects agent app proposals from AGENT_APPS.md and links them to workshop previews", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-dashboard-agent-apps-"));
    tempDirs.push(tempRoot);
    const nowMs = Date.UTC(2026, 3, 13, 1, 0, 0);
    const storePath = path.join(tempRoot, "sessions.json");
    const workspaceDir = path.join(tempRoot, "workspace-main");
    await fs.mkdir(workspaceDir, { recursive: true });
    await writeSessionStore(storePath, {
      "agent:main:subagent:designer": {
        sessionId: "sess-designer",
        sessionFile: "sess-designer.jsonl",
        updatedAt: nowMs - 1_000,
        startedAt: nowMs - 45_000,
        status: "running",
        teamId: "vibe-coder",
        teamRole: "ui/ux designer",
        spawnedBy: "main",
        parentSessionKey: "main",
      },
    });
    await writeTranscript(
      storePath,
      "sess-designer.jsonl",
      "Preview ready at https://example.com/preview/task-focus-helper\nFILE:artifacts/focus-helper.html",
    );
    await fs.writeFile(
      path.join(workspaceDir, "AGENT_APPS.md"),
      `# Agent Apps

## Focus helper
- **Owner:** Accountability Partner
- **Status:** proposed
- **Why now:** The user needs a lighter daily follow-through loop.
- **How it helps:** Turns vague follow-through into a visible next step.
- **Suggested scope:** One focused checklist with reset state.
- **Task title:** UI design
`,
      "utf8",
    );

    const cfg = {
      agents: {
        default: "main",
        defaults: {
          workspace: workspaceDir,
        },
      },
      session: {
        store: storePath,
      },
    } as MaumauConfig;

    const workshop = await collectDashboardWorkshop({
      cfg,
      nowMs,
      stateDir: tempRoot,
      cronStorePath: path.join(tempRoot, "cron-store.json"),
      cron: {
        list: async () => [],
        status: async () => buildCronStatus(),
      },
    });

    expect(workshop.agentApps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "agent_app",
          title: "Focus helper",
          ownerLabel: "Accountability Partner",
          ownerAgentId: "life-improvement-accountability-partner",
          status: "proposed",
          whyNow: expect.stringContaining("lighter daily follow-through"),
          howItHelps: expect.stringContaining("visible next step"),
          suggestedScope: expect.stringContaining("focused checklist"),
          previewUrl: "https://example.com/preview/task-focus-helper",
          linkedWorkshopKind: "recent",
        }),
      ]),
    );
  });

  it("ignores non-preview URLs when deriving workshop items", async () => {
    const items = await __testing.buildWorkshopItemsForTests(
      [
        {
          id: "task:qa",
          sessionKey: "agent:main:subagent:qa",
          title: "Visual QA review",
          status: "done",
          source: "team_session",
          createdAtMs: 1,
          sessionLinks: [],
          blockerLinks: [],
          previewLinks: [
            {
              id: "preview-noise",
              sessionKey: "agent:main:subagent:qa",
              previewUrl: "https://fonts.googleapis.com/css2?family=Inter",
              artifactPath: "mistborn-preview",
              embeddable: true,
              updatedAtMs: 2,
            },
          ],
        },
      ],
      { nowMs: 3 },
    );

    expect(items).toEqual([]);
  });

  it("prefers the published preview document title for workshop artifacts", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-dashboard-preview-label-"));
    tempDirs.push(tempRoot);
    const leaseId = "previewlabel123";
    const leaseDir = path.join(tempRoot, "previews", "leases", leaseId);
    await fs.mkdir(path.join(leaseDir, "content"), { recursive: true });
    await fs.writeFile(
      path.join(leaseDir, "lease.json"),
      `${JSON.stringify(
        {
          id: leaseId,
          visibility: "private",
          sourcePath: "/tmp/mistborn-page",
          storedPath: path.join(leaseDir, "content"),
          isDirectory: true,
          recipientHintSource: "fallback",
          recipientHintNormalizedSlug: "requester",
          recipientHintMaskedSlug: "req-er",
          recipientHintDisplayLabel: "requester",
          recipientHintVerified: false,
          createdAt: new Date(0).toISOString(),
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await fs.writeFile(
      path.join(leaseDir, "content", "index.html"),
      "<html><head><title>Mistborn</title></head><body><h1>Mistborn</h1></body></html>",
      "utf8",
    );

    const items = await __testing.buildWorkshopItemsForTests(
      [
        {
          id: "task:manager",
          sessionKey: "agent:main",
          title: "Manager coordination",
          status: "done",
          source: "team_session",
          createdAtMs: 1,
          sessionLinks: [],
          blockerLinks: [],
          previewLinks: [
            {
              id: "preview-manager",
              sessionKey: "agent:main",
              previewUrl: `https://example.com/preview/for-req-er/${leaseId}/`,
              artifactPath: ".",
              embeddable: true,
              updatedAtMs: 2,
            },
          ],
        },
      ],
      { nowMs: 3, stateDir: tempRoot },
    );

    expect(items[0]).toEqual(
      expect.objectContaining({
        title: "Mistborn",
        summary: "Interactive preview linked to this workspace task.",
      }),
    );
  });

  it("dedupes repeated workshop publishes of the same artifact down to the latest item", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-dashboard-preview-dedupe-"));
    tempDirs.push(tempRoot);

    const writeLeasePreview = async (leaseId: string, title: string, sourcePath: string) => {
      const leaseDir = path.join(tempRoot, "previews", "leases", leaseId);
      await fs.mkdir(path.join(leaseDir, "content"), { recursive: true });
      await fs.writeFile(
        path.join(leaseDir, "lease.json"),
        `${JSON.stringify(
          {
            id: leaseId,
            visibility: "private",
            sourcePath,
            storedPath: path.join(leaseDir, "content"),
            isDirectory: true,
            recipientHintSource: "fallback",
            recipientHintNormalizedSlug: "requester",
            recipientHintMaskedSlug: "req-er",
            recipientHintDisplayLabel: "requester",
            recipientHintVerified: false,
            createdAt: new Date(0).toISOString(),
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      await fs.writeFile(
        path.join(leaseDir, "content", "index.html"),
        `<html><head><title>${title}</title></head><body><h1>${title}</h1></body></html>`,
        "utf8",
      );
    };

    await writeLeasePreview("preview-old", "Mistborn Series Guide", "/tmp/mistborn-series-guide");
    await writeLeasePreview("preview-new", "Mistborn Series Guide", "/tmp/mistborn-series-guide");

    const items = await __testing.buildWorkshopItemsForTests(
      [
        {
          id: "task:old",
          sessionKey: "agent:main:old",
          title: "Mistborn Page Preview Copy",
          status: "done",
          source: "team_session",
          createdAtMs: 1,
          sessionLinks: [],
          blockerLinks: [],
          previewLinks: [
            {
              id: "preview-old-item",
              sessionKey: "agent:main:old",
              previewUrl: "https://example.com/preview/for-req-er/preview-old/",
              artifactPath: "mistborn-page-preview-copy",
              embeddable: true,
              updatedAtMs: 10,
            },
          ],
        },
        {
          id: "task:new",
          sessionKey: "agent:main:new",
          title: "Mistborn Page Preview Copy",
          status: "done",
          source: "team_session",
          createdAtMs: 1,
          sessionLinks: [],
          blockerLinks: [],
          previewLinks: [
            {
              id: "preview-new-item",
              sessionKey: "agent:main:new",
              previewUrl: "https://example.com/preview/for-req-er/preview-new/",
              artifactPath: "mistborn-page-preview-copy",
              embeddable: true,
              updatedAtMs: 20,
            },
          ],
        },
      ],
      { nowMs: 30, stateDir: tempRoot },
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toEqual(
      expect.objectContaining({
        title: "Mistborn Series Guide",
        previewUrl: "https://example.com/preview/for-req-er/preview-new/",
      }),
    );
  });

  it("prefers spawned workspace paths and persists project bindings when saving workshop items", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-dashboard-save-project-"));
    tempDirs.push(tempRoot);
    const nowMs = Date.UTC(2026, 3, 6, 9, 0, 0);
    const storePath = path.join(tempRoot, "sessions.json");
    const defaultWorkspace = path.join(tempRoot, "workspace-default");
    const spawnedWorkspace = path.join(tempRoot, "workspace-spawned");
    const siteDir = path.join(spawnedWorkspace, "site");
    const sessionKey = "agent:main:subagent:designer";
    const taskId = `task:${sessionKey}`;
    const workshopItemId = `${taskId}:preview:${sessionKey}`;
    const leaseId = "preview-save-project";
    const previewUrl = `https://example.com/preview/for-req-er/${leaseId}/`;
    await fs.mkdir(siteDir, { recursive: true });
    await fs.mkdir(defaultWorkspace, { recursive: true });
    await fs.writeFile(
      path.join(siteDir, "index.html"),
      "<html><body>saved workspace</body></html>\n",
      "utf8",
    );
    await writeSessionStore(storePath, {
      [sessionKey]: {
        sessionId: "sess-designer",
        sessionFile: "sess-designer.jsonl",
        updatedAt: nowMs,
        startedAt: nowMs - 60_000,
        endedAt: nowMs - 5_000,
        status: "done",
        teamId: "vibe-coder",
        teamRole: "ui/ux designer",
        spawnedWorkspaceDir: spawnedWorkspace,
      },
    });
    await writeTranscript(
      storePath,
      "sess-designer.jsonl",
      `Preview ready at ${previewUrl}\nFILE:site`,
    );
    const leaseDir = path.join(tempRoot, "previews", "leases", leaseId);
    await fs.mkdir(path.join(leaseDir, "content"), { recursive: true });
    await fs.writeFile(
      path.join(leaseDir, "lease.json"),
      `${JSON.stringify(
        {
          id: leaseId,
          visibility: "private",
          sourcePath: siteDir,
          storedPath: path.join(leaseDir, "content"),
          isDirectory: true,
          recipientHintSource: "fallback",
          recipientHintNormalizedSlug: "requester",
          recipientHintMaskedSlug: "req-er",
          recipientHintDisplayLabel: "requester",
          recipientHintVerified: false,
          createdAt: new Date(nowMs - 60_000).toISOString(),
          expiresAt: new Date(nowMs + 60_000).toISOString(),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await fs.writeFile(
      path.join(leaseDir, "content", "index.html"),
      "<html><body>saved workspace</body></html>\n",
      "utf8",
    );

    const cfg = {
      agents: {
        default: "main",
        defaults: {
          workspace: defaultWorkspace,
        },
      },
      session: {
        store: storePath,
      },
    } as MaumauConfig;

    const saved = await saveDashboardWorkshop({
      cfg,
      nowMs,
      stateDir: tempRoot,
      cronStorePath: path.join(tempRoot, "cron-store.json"),
      itemIds: [workshopItemId],
      projectName: "Alpha Project",
      cron: {
        list: async () => [],
        status: async () => buildCronStatus(),
      },
    });

    expect(saved.savedCount).toBe(1);
    expect(saved.updatedCount).toBe(0);
    const workshopStore = await readDashboardWorkshopStore({ stateDir: tempRoot });
    const resolvedSpawnedWorkspace = await fs.realpath(spawnedWorkspace);
    expect(workshopStore.savedItems).toHaveLength(1);
    expect(workshopStore.projectByWorkspace[resolvedSpawnedWorkspace]).toEqual(
      expect.objectContaining({
        name: "Alpha Project",
        key: "alpha project",
      }),
    );

    const tasks = await collectDashboardTasks({
      cfg,
      nowMs,
      stateDir: tempRoot,
      cronStorePath: path.join(tempRoot, "cron-store.json"),
      cron: {
        list: async () => [],
        status: async () => buildCronStatus(),
      },
    });

    expect(tasks.items[0]).toEqual(
      expect.objectContaining({
        workspaceId: resolvedSpawnedWorkspace,
        projectName: "Alpha Project",
        projectKey: "alpha project",
      }),
    );

    const resaved = await saveDashboardWorkshop({
      cfg,
      nowMs: nowMs + 5_000,
      stateDir: tempRoot,
      cronStorePath: path.join(tempRoot, "cron-store.json"),
      itemIds: [workshopItemId],
      projectName: "Beta Project",
      cron: {
        list: async () => [],
        status: async () => buildCronStatus(),
      },
    });
    expect(resaved.savedCount).toBe(0);
    expect(resaved.updatedCount).toBe(1);
    const updatedStore = await readDashboardWorkshopStore({ stateDir: tempRoot });
    expect(updatedStore.savedItems).toHaveLength(1);
    expect(updatedStore.savedItems[0]).toEqual(
      expect.objectContaining({
        projectName: "Beta Project",
        projectKey: "beta project",
      }),
    );
  });

  it("serves saved workshop previews after the original preview lease is removed", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-dashboard-saved-preview-"));
    tempDirs.push(tempRoot);
    const nowMs = Date.UTC(2026, 3, 6, 9, 30, 0);
    const storePath = path.join(tempRoot, "sessions.json");
    const workspaceDir = path.join(tempRoot, "workspace");
    const siteDir = path.join(workspaceDir, "site");
    const sessionKey = "agent:main:subagent:designer";
    const taskId = `task:${sessionKey}`;
    const workshopItemId = `${taskId}:preview:${sessionKey}`;
    const leaseId = "preview-saved-http";
    const previewUrl = `https://example.com/preview/for-req-er/${leaseId}/`;
    await fs.mkdir(siteDir, { recursive: true });
    await fs.writeFile(
      path.join(siteDir, "index.html"),
      "<html><body>durable saved preview</body></html>\n",
      "utf8",
    );
    await writeSessionStore(storePath, {
      [sessionKey]: {
        sessionId: "sess-designer",
        sessionFile: "sess-designer.jsonl",
        updatedAt: nowMs,
        startedAt: nowMs - 60_000,
        status: "running",
        teamId: "vibe-coder",
        teamRole: "ui/ux designer",
        spawnedWorkspaceDir: workspaceDir,
      },
    });
    await writeTranscript(
      storePath,
      "sess-designer.jsonl",
      `Preview ready at ${previewUrl}\nFILE:site`,
    );
    const leaseDir = path.join(tempRoot, "previews", "leases", leaseId);
    await fs.mkdir(path.join(leaseDir, "content"), { recursive: true });
    await fs.writeFile(
      path.join(leaseDir, "lease.json"),
      `${JSON.stringify(
        {
          id: leaseId,
          visibility: "private",
          sourcePath: siteDir,
          storedPath: path.join(leaseDir, "content"),
          isDirectory: true,
          recipientHintSource: "fallback",
          recipientHintNormalizedSlug: "requester",
          recipientHintMaskedSlug: "req-er",
          recipientHintDisplayLabel: "requester",
          recipientHintVerified: false,
          createdAt: new Date(nowMs - 60_000).toISOString(),
          expiresAt: new Date(nowMs + 60_000).toISOString(),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await fs.writeFile(
      path.join(leaseDir, "content", "index.html"),
      "<html><body>durable saved preview</body></html>\n",
      "utf8",
    );

    const cfg = {
      agents: {
        default: "main",
        defaults: {
          workspace: workspaceDir,
        },
      },
      gateway: {
        auth: {
          mode: "token",
          token: "test-token",
        },
      },
      session: {
        store: storePath,
      },
    } as MaumauConfig;

    const saveResult = await saveDashboardWorkshop({
      cfg,
      nowMs,
      stateDir: tempRoot,
      cronStorePath: path.join(tempRoot, "cron-store.json"),
      itemIds: [workshopItemId],
      projectName: "Alpha Project",
      cron: {
        list: async () => [],
        status: async () => buildCronStatus(),
      },
    });
    const savedPreviewUrl = saveResult.workshop.savedItems[0]?.previewUrl;
    expect(savedPreviewUrl).toContain("/dashboard-workshop-embed/saved/");

    await fs.rm(path.join(tempRoot, "previews", "leases", leaseId), {
      recursive: true,
      force: true,
    });

    const previousStateDir = process.env.MAUMAU_STATE_DIR;
    process.env.MAUMAU_STATE_DIR = tempRoot;
    try {
      const server = createTestGatewayServer({ resolvedAuth: AUTH_TOKEN });
      const response = createResponse();
      await dispatchRequest(
        server,
        createRequest({
          path: new URL(savedPreviewUrl ?? "http://localhost/invalid", "http://localhost").pathname,
        }),
        response.res,
      );
      await new Promise((resolve) => setTimeout(resolve, 25));
      expect(response.res.statusCode).toBe(200);
      expect(response.getBody()).toContain("durable saved preview");
    } finally {
      if (previousStateDir === undefined) {
        delete process.env.MAUMAU_STATE_DIR;
      } else {
        process.env.MAUMAU_STATE_DIR = previousStateDir;
      }
    }

    const workshop = await collectDashboardWorkshop({
      cfg,
      nowMs: nowMs + 1_000,
      stateDir: tempRoot,
      cronStorePath: path.join(tempRoot, "cron-store.json"),
      cron: {
        list: async () => [],
        status: async () => buildCronStatus(),
      },
    });
    expect(workshop.savedItems[0]).toEqual(
      expect.objectContaining({
        projectName: "Alpha Project",
      }),
    );
  });
});

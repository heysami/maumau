import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MaumauConfig } from "../config/types.maumau.js";
import type { CronJob } from "../cron/types.js";
import type { ExecApprovalRecord } from "./exec-approval-manager.js";
import {
  __testing,
  collectDashboardCalendar,
  collectDashboardSnapshot,
  collectDashboardTasks,
  readStoredDashboardTeamSnapshots,
  refreshStoredDashboardTeamSnapshots,
} from "./dashboard.js";
import { ensureStarterTeamConfig } from "../teams/presets.js";

function buildCronJob(params: {
  id: string;
  name: string;
  nowMs: number;
  schedule?: CronJob["schedule"];
  nextRunAtMs?: number;
}): CronJob {
  return {
    id: params.id,
    name: params.name,
    enabled: true,
    createdAtMs: params.nowMs - 60_000,
    updatedAtMs: params.nowMs - 5_000,
    schedule:
      params.schedule ?? {
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

async function writeSessionStore(
  storePath: string,
  entries: Record<string, Record<string, unknown>>,
): Promise<void> {
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(storePath, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
}

async function writeTranscript(storePath: string, sessionFile: string, text: string): Promise<void> {
  await writeTranscriptMessages(storePath, sessionFile, [{ role: "assistant", text }]);
}

async function writeTranscriptMessages(
  storePath: string,
  sessionFile: string,
  messages: Array<{ role: "assistant" | "user"; text: string }>,
): Promise<void> {
  const transcriptPath = path.join(path.dirname(storePath), sessionFile);
  await fs.writeFile(
    transcriptPath,
    `${messages
      .map((message, index) =>
        JSON.stringify({
          id: `msg-${index + 1}`,
          message: {
            role: message.role,
            content: [{ type: "text", text: message.text }],
            timestamp: Date.now() + index,
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
      "Conversation info (untrusted metadata): ```json {\"foo\":\"bar\"}```\nPreview ready at https://example.com/preview/not-a-task",
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
        status: async () => ({ enabled: true }),
      },
    });

    expect(snapshot.tasks).toHaveLength(1);
    expect(snapshot.tasks[0]?.sessionKey).toBe("agent:main:subagent:designer");
    expect(snapshot.tasks[0]?.title).toBe("UI design");
    expect(snapshot.tasks[0]?.summary).toBeUndefined();
    expect(snapshot.tasks[0]?.blockerLinks).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "approval:approval-1" })]),
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
    expect(snapshot.today.scheduledToday.some((event) => event.title.includes("Conversation info"))).toBe(
      false,
    );
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
        status: async () => ({ enabled: true }),
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
        status: async () => ({ enabled: true }),
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
        status: async () => ({ enabled: true }),
      },
    });

    const dailyOccurrences = calendar.events.filter((event) => event.jobId === "daily-review");
    expect(dailyOccurrences.length).toBeGreaterThan(10);
    expect(new Set(dailyOccurrences.map((event) => new Date(event.startAtMs).getUTCDate())).size).toBeGreaterThan(10);
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
        status: async () => ({ enabled: true }),
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
    expect(
      vibeCoderSnapshot?.nodes.find((node) => node.role === "system architect")?.stage,
    ).toBe("architecture");
    expect(vibeCoderSnapshot?.nodes.find((node) => node.role === "developer")?.stage).toBe(
      "execution",
    );
    expect(vibeCoderSnapshot?.nodes.find((node) => node.role === "technical qa")?.stage).toBe(
      "qa",
    );
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
});

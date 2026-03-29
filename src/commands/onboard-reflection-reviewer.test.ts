import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../agents/agent-scope.js";
import type { MaumauConfig } from "../config/config.js";
import { loadCronStore } from "../cron/store.js";
import { DEFAULT_AGENT_ID } from "../routing/session-key.js";
import type { RuntimeEnv } from "../runtime.js";
import { withEnvAsync } from "../test-utils/env.js";
import {
  applyLocalSetupReflectionReviewerDefaults,
  ensureOnboardedReflectionReviewerArtifacts,
  REFLECTION_DAILY_JOB_NAME,
  REFLECTION_REVIEWER_AGENT_ID,
  REFLECTION_WEEKLY_JOB_NAME,
} from "./onboard-reflection-reviewer.js";

describe("onboard reflection reviewer", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
    );
  });

  function makeRuntime(): RuntimeEnv {
    return {
      log: vi.fn(),
      error: vi.fn(),
      exit: vi.fn(),
    };
  }

  it("creates the daily and weekly reflection jobs once", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-reflection-state-"));
    tempDirs.push(stateDir);
    const workspaceDir = path.join(stateDir, "workspace");
    const cronStorePath = path.join(stateDir, "cron", "jobs.json");
    const seeded = applyLocalSetupReflectionReviewerDefaults({
      agents: {
        defaults: {
          workspace: workspaceDir,
        },
      },
      cron: {
        store: cronStorePath,
      },
    } satisfies MaumauConfig);

    await withEnvAsync({ MAUMAU_STATE_DIR: stateDir }, async () => {
      await ensureOnboardedReflectionReviewerArtifacts({
        config: seeded,
        runtime: makeRuntime(),
      });
      await ensureOnboardedReflectionReviewerArtifacts({
        config: seeded,
        runtime: makeRuntime(),
      });
    });

    await expect(fs.stat(path.join(workspaceDir, "reviews", "daily"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(workspaceDir, "reviews", "weekly"))).resolves.toBeTruthy();

    const cronStore = await loadCronStore(cronStorePath);
    const dailyJobs = cronStore.jobs.filter((job) => job.name === REFLECTION_DAILY_JOB_NAME);
    const weeklyJobs = cronStore.jobs.filter((job) => job.name === REFLECTION_WEEKLY_JOB_NAME);

    expect(dailyJobs).toHaveLength(1);
    expect(weeklyJobs).toHaveLength(1);
    expect(dailyJobs[0]).toMatchObject({
      sessionTarget: "session:daily-reflection-curation",
      wakeMode: "now",
      delivery: { mode: "none" },
      schedule: {
        kind: "cron",
        expr: "0 17 * * *",
      },
      payload: {
        kind: "agentTurn",
      },
    });
    expect(weeklyJobs[0]).toMatchObject({
      sessionTarget: "session:weekly-reflection",
      wakeMode: "now",
      delivery: { mode: "none" },
      schedule: {
        kind: "cron",
        expr: "0 18 * * 0",
      },
      payload: {
        kind: "agentTurn",
      },
    });
  });

  it("moves reflection jobs to a dedicated reviewer agent when the default agent is sandbox-clamped", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-reflection-reviewer-"));
    tempDirs.push(stateDir);
    const workspaceDir = path.join(stateDir, "workspace");
    const cronStorePath = path.join(stateDir, "cron", "jobs.json");
    const seeded = applyLocalSetupReflectionReviewerDefaults({
      agents: {
        defaults: {
          workspace: workspaceDir,
          sandbox: {
            mode: "all",
            sessionToolsVisibility: "spawned",
          },
        },
      },
      cron: {
        store: cronStorePath,
      },
    } satisfies MaumauConfig);
    let reviewerWorkspace = "";

    expect(seeded.agents?.list?.find((agent) => agent.id === REFLECTION_REVIEWER_AGENT_ID)).toMatchObject(
      {
        id: REFLECTION_REVIEWER_AGENT_ID,
        sandbox: { mode: "off" },
      },
    );
    expect(resolveDefaultAgentId(seeded)).toBe(DEFAULT_AGENT_ID);

    await withEnvAsync({ MAUMAU_STATE_DIR: stateDir }, async () => {
      await ensureOnboardedReflectionReviewerArtifacts({
        config: seeded,
        runtime: makeRuntime(),
      });
      reviewerWorkspace = resolveAgentWorkspaceDir(seeded, REFLECTION_REVIEWER_AGENT_ID);
    });

    await expect(fs.stat(path.join(reviewerWorkspace, "reviews", "daily"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(reviewerWorkspace, "reviews", "weekly"))).resolves.toBeTruthy();

    const cronStore = await loadCronStore(cronStorePath);
    const reflectionJobs = cronStore.jobs.filter(
      (job) => job.name === REFLECTION_DAILY_JOB_NAME || job.name === REFLECTION_WEEKLY_JOB_NAME,
    );
    expect(reflectionJobs).toHaveLength(2);
    expect(reflectionJobs.every((job) => job.agentId === REFLECTION_REVIEWER_AGENT_ID)).toBe(true);
  });
});

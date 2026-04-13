import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { MaumauConfig } from "../config/types.maumau.js";
import { loadCronStore } from "../cron/store.js";
import { LIFE_IMPROVEMENT_TEAM_ID } from "./life-improvement-preset.js";
import { LIFE_IMPROVEMENT_FINANCIAL_COACH_AGENT_ID } from "./life-improvement-preset.js";
import {
  ensureLifeImprovementRoutineArtifacts,
  LIFE_IMPROVEMENT_FINANCE_SYNC_CRON_EXPR,
  LIFE_IMPROVEMENT_FINANCE_SYNC_JOB_NAME,
  LIFE_IMPROVEMENT_ROUTINE_CRON_EXPR,
  LIFE_IMPROVEMENT_ROUTINE_JOB_NAME,
} from "./life-improvement-routine.js";
import { ensureBundledTeamPresetConfig } from "./presets.js";

describe("life improvement routine artifacts", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
    );
  });

  it("creates the managed life-improvement routines for check-ins and finance sync", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-life-routine-"));
    tempDirs.push(stateDir);
    const cronStorePath = path.join(stateDir, "cron", "jobs.json");
    const config = ensureBundledTeamPresetConfig(
      {
        cron: {
          store: cronStorePath,
        },
      } satisfies MaumauConfig,
      LIFE_IMPROVEMENT_TEAM_ID,
    );

    await ensureLifeImprovementRoutineArtifacts({ config });
    await ensureLifeImprovementRoutineArtifacts({ config });

    const cronStore = await loadCronStore(cronStorePath);
    const checkInJobs = cronStore.jobs.filter(
      (job) => job.name === LIFE_IMPROVEMENT_ROUTINE_JOB_NAME,
    );
    const financeJobs = cronStore.jobs.filter(
      (job) => job.name === LIFE_IMPROVEMENT_FINANCE_SYNC_JOB_NAME,
    );

    expect(checkInJobs).toHaveLength(1);
    expect(financeJobs).toHaveLength(1);
    expect(checkInJobs[0]).toMatchObject({
      name: LIFE_IMPROVEMENT_ROUTINE_JOB_NAME,
      description: expect.stringContaining("Daily heartbeat-backed personal check-in routine"),
      enabled: true,
      sessionTarget: "main",
      wakeMode: "now",
      schedule: {
        kind: "cron",
        expr: LIFE_IMPROVEMENT_ROUTINE_CRON_EXPR,
      },
      payload: {
        kind: "systemEvent",
        text: expect.stringContaining(`"${LIFE_IMPROVEMENT_TEAM_ID}" team`),
      },
    });
    expect(checkInJobs[0]?.payload.kind).toBe("systemEvent");
    expect(checkInJobs[0]?.payload.text).toContain("HEARTBEAT_OK");
    expect(checkInJobs[0]?.payload.text).toContain("one focused, skippable prompt");
    expect(checkInJobs[0]?.payload.text).toContain("Treat the profile as incremental");
    expect(checkInJobs[0]?.payload.text).toContain("start with day-to-day life and routines");
    expect(checkInJobs[0]?.payload.text).toContain("AGENT_APPS.md");
    expect(checkInJobs[0]?.payload.text).toContain("Do not force app ideas");
    expect(checkInJobs[0]?.payload.text).toContain("review any existing app ideas");
    expect(checkInJobs[0]?.payload.text).toContain(
      "update its current section instead of adding a duplicate",
    );

    expect(financeJobs[0]).toMatchObject({
      agentId: LIFE_IMPROVEMENT_FINANCIAL_COACH_AGENT_ID,
      name: LIFE_IMPROVEMENT_FINANCE_SYNC_JOB_NAME,
      description: expect.stringContaining("Daily quiet finance collection"),
      enabled: true,
      sessionTarget: "isolated",
      wakeMode: "now",
      schedule: {
        kind: "cron",
        expr: LIFE_IMPROVEMENT_FINANCE_SYNC_CRON_EXPR,
      },
      delivery: {
        mode: "none",
      },
      payload: {
        kind: "agentTurn",
        message: expect.stringContaining("persistToWallet=true"),
        thinking: "low",
        timeoutSeconds: 240,
      },
    });
    expect(financeJobs[0]?.payload.kind).toBe("agentTurn");
    expect(financeJobs[0]?.payload.message).toContain("Financial Coach & Assistant");
    expect(financeJobs[0]?.payload.message).toContain("receipt_digest");
    expect(financeJobs[0]?.payload.message).toContain("HEARTBEAT_OK");
  });

  it("removes the managed routine when the life-improvement team is no longer configured", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-life-routine-remove-"));
    tempDirs.push(stateDir);
    const cronStorePath = path.join(stateDir, "cron", "jobs.json");
    const enabledConfig = ensureBundledTeamPresetConfig(
      {
        cron: {
          store: cronStorePath,
        },
      } satisfies MaumauConfig,
      LIFE_IMPROVEMENT_TEAM_ID,
    );

    await ensureLifeImprovementRoutineArtifacts({ config: enabledConfig });

    await ensureLifeImprovementRoutineArtifacts({
      config: {
        cron: {
          store: cronStorePath,
        },
        teams: {
          list: [],
        },
      } satisfies MaumauConfig,
    });

    const cronStore = await loadCronStore(cronStorePath);
    expect(cronStore.jobs.some((job) => job.name === LIFE_IMPROVEMENT_ROUTINE_JOB_NAME)).toBe(
      false,
    );
    expect(cronStore.jobs.some((job) => job.name === LIFE_IMPROVEMENT_FINANCE_SYNC_JOB_NAME)).toBe(
      false,
    );
  });
});

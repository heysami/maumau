import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MaumauConfig } from "../config/config.js";
import { loadCronStore } from "../cron/store.js";
import type { RuntimeEnv } from "../runtime.js";
import { withEnvAsync } from "../test-utils/env.js";
import {
  applyLocalSetupMultiUserMemoryDefaults,
  ensureOnboardedMultiUserMemoryArtifacts,
  MULTI_USER_MEMORY_CURATOR_AGENT_ID,
  MULTI_USER_MEMORY_CURATOR_JOB_NAME,
} from "./onboard-multi-user-memory.js";

describe("onboard multi-user-memory", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
    );
  });

  it("creates the hidden curator workspace files and daily cron job once", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-curator-state-"));
    tempDirs.push(stateDir);
    const workspaceDir = path.join(stateDir, "workspace");
    const cronStorePath = path.join(stateDir, "cron", "jobs.json");
    const runtime: RuntimeEnv = {
      log: vi.fn(),
      error: vi.fn(),
      exit: vi.fn(),
    };
    const seeded = applyLocalSetupMultiUserMemoryDefaults({
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
      await ensureOnboardedMultiUserMemoryArtifacts({
        config: seeded,
        runtime,
      });
      await ensureOnboardedMultiUserMemoryArtifacts({
        config: seeded,
        runtime,
      });
    });

    const curatorWorkspace = path.join(stateDir, `workspace-${MULTI_USER_MEMORY_CURATOR_AGENT_ID}`);
    expect(await fs.readFile(path.join(curatorWorkspace, "AGENTS.md"), "utf-8")).toContain(
      "run `multi_user_memory_curate`",
    );
    expect(await fs.readFile(path.join(curatorWorkspace, "USER.md"), "utf-8")).toContain(
      "internal multi-user memory curator",
    );
    expect(await fs.readFile(path.join(curatorWorkspace, "HEARTBEAT.md"), "utf-8")).toContain(
      "call `multi_user_memory_curate` once",
    );

    const cronStore = await loadCronStore(cronStorePath);
    const curatorJobs = cronStore.jobs.filter(
      (job) =>
        job.agentId === MULTI_USER_MEMORY_CURATOR_AGENT_ID &&
        job.name === MULTI_USER_MEMORY_CURATOR_JOB_NAME,
    );
    expect(curatorJobs).toHaveLength(1);
    expect(curatorJobs[0]).toMatchObject({
      sessionTarget: "isolated",
      wakeMode: "now",
      delivery: { mode: "none" },
      payload: {
        kind: "agentTurn",
        thinking: "minimal",
        lightContext: true,
      },
    });
    if (curatorJobs[0]?.payload.kind === "agentTurn") {
      expect(curatorJobs[0].payload.message).toContain("multi_user_memory_curate");
    }
  });
});

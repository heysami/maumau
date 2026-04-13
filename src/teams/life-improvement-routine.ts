import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { MaumauConfig } from "../config/types.maumau.js";
import { createJob } from "../cron/service/jobs.js";
import { createCronServiceState } from "../cron/service/state.js";
import { loadCronStore, resolveCronStorePath, saveCronStore } from "../cron/store.js";
import type { CronJob, CronJobCreate, CronJobPatch } from "../cron/types.js";
import {
  LIFE_IMPROVEMENT_FINANCIAL_COACH_AGENT_ID,
  LIFE_IMPROVEMENT_TEAM_ID,
} from "./life-improvement-preset.js";

export const LIFE_IMPROVEMENT_ROUTINE_JOB_NAME = "Life improvement check-in";
export const LIFE_IMPROVEMENT_ROUTINE_CRON_EXPR = "0 10 * * *";
export const LIFE_IMPROVEMENT_FINANCE_SYNC_JOB_NAME = "Life improvement expense sync";
export const LIFE_IMPROVEMENT_FINANCE_SYNC_CRON_EXPR = "15 8 * * *";

const LIFE_IMPROVEMENT_ROUTINE_MARKER = "life-improvement-check-in/v1";
const LIFE_IMPROVEMENT_FINANCE_SYNC_MARKER = "life-improvement-expense-sync/v1";
const LIFE_IMPROVEMENT_ROUTINE_DESCRIPTION =
  "Daily heartbeat-backed personal check-in routine that updates an incremental life profile, gently asks for optional context when helpful, and suggests a small next improvement.";
const LIFE_IMPROVEMENT_FINANCE_SYNC_DESCRIPTION =
  "Daily quiet finance collection that lets the financial coach gather receipt-based spending from email and persist normalized expenses into wallet history.";

const LIFE_IMPROVEMENT_ROUTINE_SYSTEM_EVENT = [
  `Life improvement routine (${LIFE_IMPROVEMENT_ROUTINE_MARKER}).`,
  `If the "${LIFE_IMPROVEMENT_TEAM_ID}" team is configured, use teams_run with that team for this scheduled check-in.`,
  "Review the current user dossier, related-people context, dependency notes, and active priorities.",
  "Treat the profile as incremental. Do not try to collect every life domain at once.",
  "Look for one high-leverage improvement that would realistically help the user next.",
  "Also decide whether a tiny user-specific app, tracker, planner, generator, or interactive helper would materially help right now.",
  'Before proposing a new app, review any existing app ideas in "AGENT_APPS.md", relevant workshop outputs, and existing user-facing helpers in the workspace.',
  "Prefer improving, extending, or refocusing an existing app when it already covers most of the need.",
  'Only when there is a concrete fit, create or update "AGENT_APPS.md" in the main workspace with one concise section containing: Owner, Status, Why now, How it helps, Suggested scope, and optional Project or Task title.',
  "If an existing app is the right base, update its current section instead of adding a duplicate new one.",
  "Do not force app ideas. If no app would clearly help, leave AGENT_APPS.md unchanged.",
  "When you need more context, guide instead of interrogating. Ask at most one focused, skippable prompt at a time, and do not bury it as a tiny note at the end of a long unrelated reply.",
  "Use a slow getting-to-know-you arc: start with day-to-day life and routines, then later move into hobbies, exercise, and work or study shape, and only later into family context such as siblings or parents if it feels natural and welcome.",
  "Keep the tone brief, warm, and non-pushy, and make it easy for the user to skip answering.",
  "If no user-facing follow-up is needed, reply HEARTBEAT_OK.",
].join(" ");

const LIFE_IMPROVEMENT_FINANCE_SYNC_MESSAGE = [
  `Life improvement finance receipt sync (${LIFE_IMPROVEMENT_FINANCE_SYNC_MARKER}).`,
  `You are the Financial Coach & Assistant for the "${LIFE_IMPROVEMENT_TEAM_ID}" team running a quiet daily finance collection pass.`,
  'Use the browser tool with action="receipt_digest" and persistToWallet=true so normalized receipt spending is stored in wallet history for dashboard charts.',
  "Use the configured default local host browser profile unless a different local host profile is clearly required.",
  "Capture only receipt-based spending that can be normalized confidently. Let wallet fingerprinting handle deduplication instead of trying to deduplicate manually.",
  "Do not message the user from this cron run and do not turn this into a general coaching conversation.",
  "If Gmail is signed out, the local browser profile is unavailable, or browser access is blocked, stop with a short explanation and do not ask the user follow-up questions.",
  "Reply with a concise summary of what was recorded, or HEARTBEAT_OK if there was nothing new to add.",
].join(" ");

type LifeImprovementManagedJobSpec = {
  create: (config: MaumauConfig) => CronJobCreate;
  matches: (job: Pick<CronJob, "name" | "payload">) => boolean;
  patch: (config: MaumauConfig) => CronJobPatch;
};

type LifeImprovementRoutineCronClient = {
  add: (input: CronJobCreate) => Promise<unknown>;
  list: (opts?: { includeDisabled?: boolean }) => Promise<CronJob[]>;
  remove: (id: string) => Promise<unknown>;
  update: (id: string, patch: CronJobPatch) => Promise<unknown>;
};

function hasLifeImprovementTeam(config: MaumauConfig): boolean {
  return (
    config.teams?.list?.some(
      (team) => team?.id?.trim().toLowerCase() === LIFE_IMPROVEMENT_TEAM_ID,
    ) ?? false
  );
}

function resolveLifeImprovementRoutineTimezone(config: MaumauConfig): string {
  const configured = config.agents?.defaults?.userTimezone?.trim();
  return configured || Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function buildLifeImprovementRoutineCreate(config: MaumauConfig): CronJobCreate {
  return {
    name: LIFE_IMPROVEMENT_ROUTINE_JOB_NAME,
    description: LIFE_IMPROVEMENT_ROUTINE_DESCRIPTION,
    enabled: true,
    schedule: {
      kind: "cron",
      expr: LIFE_IMPROVEMENT_ROUTINE_CRON_EXPR,
      tz: resolveLifeImprovementRoutineTimezone(config),
    },
    sessionTarget: "main",
    wakeMode: "now",
    payload: {
      kind: "systemEvent",
      text: LIFE_IMPROVEMENT_ROUTINE_SYSTEM_EVENT,
    },
  };
}

function buildLifeImprovementRoutinePatch(config: MaumauConfig): CronJobPatch {
  return {
    agentId: null,
    sessionKey: null,
    description: LIFE_IMPROVEMENT_ROUTINE_DESCRIPTION,
    enabled: true,
    schedule: {
      kind: "cron",
      expr: LIFE_IMPROVEMENT_ROUTINE_CRON_EXPR,
      tz: resolveLifeImprovementRoutineTimezone(config),
    },
    sessionTarget: "main",
    wakeMode: "now",
    payload: {
      kind: "systemEvent",
      text: LIFE_IMPROVEMENT_ROUTINE_SYSTEM_EVENT,
    },
    // main-session jobs treat mode="none" as an instruction to clear direct delivery config
    // and rely on heartbeat routing instead.
    delivery: {
      mode: "none",
    },
  };
}

function buildLifeImprovementFinanceSyncCreate(config: MaumauConfig): CronJobCreate {
  return {
    agentId: LIFE_IMPROVEMENT_FINANCIAL_COACH_AGENT_ID,
    name: LIFE_IMPROVEMENT_FINANCE_SYNC_JOB_NAME,
    description: LIFE_IMPROVEMENT_FINANCE_SYNC_DESCRIPTION,
    enabled: true,
    schedule: {
      kind: "cron",
      expr: LIFE_IMPROVEMENT_FINANCE_SYNC_CRON_EXPR,
      tz: resolveLifeImprovementRoutineTimezone(config),
    },
    sessionTarget: "isolated",
    wakeMode: "now",
    payload: {
      kind: "agentTurn",
      message: LIFE_IMPROVEMENT_FINANCE_SYNC_MESSAGE,
      thinking: "low",
      timeoutSeconds: 240,
    },
    delivery: {
      mode: "none",
    },
  };
}

function buildLifeImprovementFinanceSyncPatch(config: MaumauConfig): CronJobPatch {
  return {
    agentId: LIFE_IMPROVEMENT_FINANCIAL_COACH_AGENT_ID,
    sessionKey: null,
    description: LIFE_IMPROVEMENT_FINANCE_SYNC_DESCRIPTION,
    enabled: true,
    schedule: {
      kind: "cron",
      expr: LIFE_IMPROVEMENT_FINANCE_SYNC_CRON_EXPR,
      tz: resolveLifeImprovementRoutineTimezone(config),
    },
    sessionTarget: "isolated",
    wakeMode: "now",
    payload: {
      kind: "agentTurn",
      message: LIFE_IMPROVEMENT_FINANCE_SYNC_MESSAGE,
      thinking: "low",
      timeoutSeconds: 240,
    },
    delivery: {
      mode: "none",
    },
  };
}

function isLifeImprovementRoutineJob(job: Pick<CronJob, "name" | "payload">): boolean {
  if (job.name === LIFE_IMPROVEMENT_ROUTINE_JOB_NAME) {
    return true;
  }
  return (
    job.payload.kind === "systemEvent" && job.payload.text.includes(LIFE_IMPROVEMENT_ROUTINE_MARKER)
  );
}

function isLifeImprovementFinanceSyncJob(job: Pick<CronJob, "name" | "payload">): boolean {
  if (job.name === LIFE_IMPROVEMENT_FINANCE_SYNC_JOB_NAME) {
    return true;
  }
  return (
    job.payload.kind === "agentTurn" &&
    job.payload.message.includes(LIFE_IMPROVEMENT_FINANCE_SYNC_MARKER)
  );
}

const LIFE_IMPROVEMENT_MANAGED_JOB_SPECS: readonly LifeImprovementManagedJobSpec[] = [
  {
    create: buildLifeImprovementRoutineCreate,
    matches: isLifeImprovementRoutineJob,
    patch: buildLifeImprovementRoutinePatch,
  },
  {
    create: buildLifeImprovementFinanceSyncCreate,
    matches: isLifeImprovementFinanceSyncJob,
    patch: buildLifeImprovementFinanceSyncPatch,
  },
] as const;

function isLifeImprovementManagedJob(job: Pick<CronJob, "name" | "payload">): boolean {
  return LIFE_IMPROVEMENT_MANAGED_JOB_SPECS.some((spec) => spec.matches(job));
}

async function syncManagedLifeImprovementJobViaCron(params: {
  config: MaumauConfig;
  cron: LifeImprovementRoutineCronClient;
  jobs: CronJob[];
  spec: LifeImprovementManagedJobSpec;
}) {
  const managedJobs = params.jobs.filter(params.spec.matches);

  const [primary, ...duplicates] = managedJobs;
  if (!primary) {
    await params.cron.add(params.spec.create(params.config));
  } else {
    await params.cron.update(primary.id, params.spec.patch(params.config));
  }
  await Promise.all(duplicates.map((job) => params.cron.remove(job.id)));
}

async function syncLifeImprovementRoutineViaCron(params: {
  config: MaumauConfig;
  cron: LifeImprovementRoutineCronClient;
}) {
  const jobs = await params.cron.list({ includeDisabled: true });
  const managedJobs = jobs.filter(isLifeImprovementManagedJob);

  if (!hasLifeImprovementTeam(params.config)) {
    await Promise.all(managedJobs.map((job) => params.cron.remove(job.id)));
    return;
  }

  for (const spec of LIFE_IMPROVEMENT_MANAGED_JOB_SPECS) {
    await syncManagedLifeImprovementJobViaCron({
      config: params.config,
      cron: params.cron,
      jobs,
      spec,
    });
  }
}

function createQuietCronState(config: MaumauConfig, storePath: string) {
  return createCronServiceState({
    log: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    storePath,
    cronEnabled: true,
    defaultAgentId: config.agents?.default?.trim() || "main",
    enqueueSystemEvent() {},
    requestHeartbeatNow() {},
    async runIsolatedAgentJob() {
      return { status: "ok" };
    },
  });
}

function syncManagedLifeImprovementJobInStore(params: {
  config: MaumauConfig;
  existing: CronJob;
  spec: LifeImprovementManagedJobSpec;
  storePath: string;
}) {
  const { existing } = params;
  const nowMs = Date.now();
  const desired = params.spec.create(params.config);
  const desiredSchedule = desired.schedule;
  const scheduleChanged = !isDeepStrictEqual(existing.schedule, desiredSchedule);
  const enabledChanged = existing.enabled !== desired.enabled;
  let changed = false;

  if (existing.name !== desired.name) {
    existing.name = desired.name;
    changed = true;
  }
  if (existing.description !== desired.description) {
    existing.description = desired.description;
    changed = true;
  }
  if (enabledChanged) {
    existing.enabled = desired.enabled;
    changed = true;
  }
  if (scheduleChanged) {
    existing.schedule = desiredSchedule;
    changed = true;
  }
  if (existing.deleteAfterRun !== desired.deleteAfterRun) {
    existing.deleteAfterRun = desired.deleteAfterRun;
    changed = true;
  }
  if (existing.sessionTarget !== desired.sessionTarget) {
    existing.sessionTarget = desired.sessionTarget;
    changed = true;
  }
  if (existing.wakeMode !== desired.wakeMode) {
    existing.wakeMode = desired.wakeMode;
    changed = true;
  }
  if (!isDeepStrictEqual(existing.payload, desired.payload)) {
    existing.payload = desired.payload;
    changed = true;
  }
  if (existing.agentId !== desired.agentId) {
    existing.agentId = desired.agentId;
    changed = true;
  }
  if (existing.sessionKey !== desired.sessionKey) {
    existing.sessionKey = desired.sessionKey;
    changed = true;
  }
  if (!isDeepStrictEqual(existing.delivery, desired.delivery)) {
    existing.delivery = desired.delivery;
    changed = true;
  }
  if (!isDeepStrictEqual(existing.failureAlert, desired.failureAlert)) {
    existing.failureAlert = desired.failureAlert;
    changed = true;
  }
  if (typeof existing.state.runningAtMs === "number") {
    existing.state.runningAtMs = undefined;
    changed = true;
  }

  if (
    scheduleChanged ||
    enabledChanged ||
    !Number.isFinite(existing.state.nextRunAtMs ?? Number.NaN)
  ) {
    const quietState = createQuietCronState(params.config, params.storePath);
    const desiredJob = createJob(quietState, desired);
    existing.state.nextRunAtMs = desiredJob.state.nextRunAtMs;
    changed = true;
  }

  if (changed) {
    existing.updatedAtMs = nowMs;
  }
  return changed;
}

async function syncLifeImprovementRoutineViaStore(config: MaumauConfig) {
  const storePath = resolveCronStorePath(config.cron?.store);
  const store = await loadCronStore(storePath);
  const managedJobs = store.jobs.filter(isLifeImprovementManagedJob);

  if (!hasLifeImprovementTeam(config)) {
    if (managedJobs.length === 0) {
      return;
    }
    store.jobs = store.jobs.filter((job) => !isLifeImprovementManagedJob(job));
    await saveCronStore(storePath, store);
    return;
  }

  const quietState = createQuietCronState(config, storePath);
  let changed = false;
  for (const spec of LIFE_IMPROVEMENT_MANAGED_JOB_SPECS) {
    const matchingJobs = store.jobs.filter(spec.matches);
    const [primary, ...duplicates] = matchingJobs;

    if (!primary) {
      store.jobs.push(createJob(quietState, spec.create(config)));
      changed = true;
    } else {
      changed =
        syncManagedLifeImprovementJobInStore({
          config,
          existing: primary,
          spec,
          storePath,
        }) || changed;
    }

    if (duplicates.length > 0) {
      const duplicateIds = new Set(duplicates.map((job) => job.id));
      store.jobs = store.jobs.filter((job) => !duplicateIds.has(job.id));
      changed = true;
    }
  }

  if (changed) {
    await saveCronStore(storePath, store);
  }
}

export async function ensureLifeImprovementRoutineArtifacts(params: {
  config: MaumauConfig;
  cron?: LifeImprovementRoutineCronClient;
  cronStorePath?: string;
  logger?: { warn?: (message: string) => void };
}) {
  try {
    const expectedStorePath = resolveCronStorePath(params.config.cron?.store);
    const canUseLiveCron =
      params.cron &&
      typeof params.cronStorePath === "string" &&
      path.resolve(params.cronStorePath) === expectedStorePath;

    if (canUseLiveCron) {
      await syncLifeImprovementRoutineViaCron({
        config: params.config,
        cron: params.cron,
      });
      return;
    }

    await syncLifeImprovementRoutineViaStore(params.config);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    params.logger?.warn?.(`[life-improvement] failed to sync managed routines: ${message}`);
  }
}

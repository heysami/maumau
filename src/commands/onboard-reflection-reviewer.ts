import fs from "node:fs/promises";
import path from "node:path";
import { resolveDefaultAgentId } from "../agents/agent-scope.js";
import { resolveAgentWorkspaceDir } from "../agents/agent-scope.js";
import type { MaumauConfig } from "../config/config.js";
import { createJob } from "../cron/service/jobs.js";
import { createCronServiceState } from "../cron/service/state.js";
import { loadCronStore, resolveCronStorePath, saveCronStore } from "../cron/store.js";
import type { CronSessionTarget } from "../cron/types.js";
import { DEFAULT_AGENT_ID, normalizeAgentId } from "../routing/session-key.js";
import type { RuntimeEnv } from "../runtime.js";
import { ensureWorkspaceAndSessions } from "./onboard-helpers.js";

export const REFLECTION_REVIEWER_AGENT_ID = "reviewer";
export const REFLECTION_REVIEWER_AGENT_NAME = "Reflection Reviewer";
export const REFLECTION_DAILY_JOB_NAME = "Daily reflection curation";
export const REFLECTION_WEEKLY_JOB_NAME = "Weekly reflection reviewer";

const DAILY_REFLECTION_PROMPT = `You are the daily reflection curator for this Maumau gateway.

Review user-facing sessions across agents and workspaces on this gateway.
Do this work directly in this session. Do not delegate to teams or subagents unless a required tool is unavailable here. You may inspect sessions, memory, and current public information when needed, and you may write today's daily note. Do not edit code, config, bootstrap/personality files, cron, plugins, or any workspace files except reviews/daily/YYYY-MM-DD.md.

1. Use sessions_list with activeMinutes=1440, kinds=["main","group","other"], limit=200, messageLimit=0.
2. Treat kind other rows as possible direct user sessions. Skip operational or internal chatter such as cron, hook, node, subagent, ACP, heartbeat, rows whose channel is internal, and rows whose key, label, or display name are clearly operational.
3. Inspect up to the latest 200 non-tool messages per remaining candidate with sessions_history(includeTools=false).
4. Extract struggles, delights, durable preferences, and candidate fixes. Paraphrase safely; do not quote sensitive text unless clearly safe.
5. Use memory_search or memory_get only when helpful.
6. Distill user-specific learnings into memory_store. Use target="active-user". Use durability="durable" for stable preferences or long-lived facts, and durability="daily" for short-horizon session context.
7. If a fact looks useful beyond one user, do not write directly to group or global memory. Instead use multi_user_memory_curate so shared proposals stay approval-gated.
8. Write or update reviews/daily/YYYY-MM-DD.md with these sections exactly: Day summary, Top struggles, Top delights, Durable preferences, Candidate fixes, Research follow-ups, Weekly carry-forward.
9. Always write the daily file, even on calm days. Keep calm days brief and explicitly say the day was calm.
10. Do not send chat. Reply only NO_REPLY.`;

const WEEKLY_REFLECTION_PROMPT = `You are the weekly reflection reviewer for this Maumau gateway.

Review user-facing sessions across agents and workspaces on this gateway.
Do this work directly in this session. Do not delegate to teams or subagents unless a required tool is unavailable here. You may inspect daily notes, sessions, memory, and current public information when needed, and you may write the weekly report. Do not edit code, config, bootstrap/personality files, cron, plugins, or any workspace files except reviews/weekly/YYYY-WW.md.

1. Read the latest 7 daily notes under reviews/daily/.
2. If coverage is missing or incomplete, use sessions_list with activeMinutes=10080, kinds=["main","group","other"], limit=200, messageLimit=0, then inspect up to the latest 200 non-tool messages with sessions_history(includeTools=false).
3. Treat kind other rows as possible direct user sessions. Skip operational or internal chatter such as cron, hook, node, subagent, ACP, heartbeat, rows whose channel is internal, and rows whose key, label, or display name are clearly operational.
4. Synthesize the week from daily notes first, then use raw sessions only to fill gaps or validate high-impact claims.
5. Extract top struggles, delights, recurring do's and don'ts, suggested personality edits, tooling or plugin opportunities, recommended solutions or experiments, research-backed recommendations, and next-week tasks. Paraphrase safely; do not quote sensitive text unless clearly safe.
6. Use memory_search or memory_get only when helpful. Use web_search or web_fetch only for up to 3 high-leverage items that need current verification, and include links in the report.
7. Distill stable user learnings into memory_store with target="active-user" and durability="durable". Use durability="daily" only for short-lived context that should not survive long.
8. If you identify cross-user or group-relevant facts, use multi_user_memory_curate to queue approval-gated shared-memory proposals instead of writing group/global memory directly.
9. Write reviews/weekly/YYYY-WW.md with these sections exactly: Week overview, Top struggles, Top delights, Recurring do's, Recurring don'ts, Suggested personality edits, Suggested tooling/plugin opportunities, Recommended solutions / experiments, Research-backed recommendations, Next-week task plan.
10. Always write the weekly report, even on calm weeks. Keep calm weeks brief and explicitly say the week was calm.
11. If the report is worth surfacing and the default main session has usable deliveryContext with explicit target info, send one concise main-chat summary naming the report path and 2 to 4 highest-leverage findings. Otherwise skip chat.
12. Reply only NO_REPLY.`;

function resolveReviewTimezone(config: MaumauConfig): string {
  const configured = config.agents?.defaults?.userTimezone?.trim();
  return configured || Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function shouldUseDedicatedReviewerAgent(_config: MaumauConfig): boolean {
  return true;
}

function ensureReviewerAgent(config: MaumauConfig): MaumauConfig {
  const currentAgents = Array.isArray(config.agents?.list) ? config.agents.list : [];
  const reviewerIndex = currentAgents.findIndex(
    (entry) => normalizeAgentId(entry?.id) === REFLECTION_REVIEWER_AGENT_ID,
  );
  const reviewerWorkspace =
    currentAgents[reviewerIndex]?.workspace?.trim() || config.agents?.defaults?.workspace?.trim();
  const reviewerAgent = {
    id: REFLECTION_REVIEWER_AGENT_ID,
    name: REFLECTION_REVIEWER_AGENT_NAME,
    executionStyle: "direct" as const,
    ...(reviewerWorkspace ? { workspace: reviewerWorkspace } : {}),
    sandbox: {
      ...(reviewerIndex >= 0 && currentAgents[reviewerIndex]?.sandbox
        ? currentAgents[reviewerIndex].sandbox
        : {}),
      mode: "off" as const,
    },
  };
  if (reviewerIndex >= 0) {
    const nextAgents = [...currentAgents];
    nextAgents[reviewerIndex] = {
      ...currentAgents[reviewerIndex],
      ...reviewerAgent,
    };
    return {
      ...config,
      agents: {
        ...config.agents,
        list: nextAgents,
      },
    };
  }
  const hasExplicitDefault = currentAgents.some((entry) => entry?.default);
  return {
    ...config,
    agents: {
      ...config.agents,
      list: [
        ...(currentAgents.length === 0
          ? [
              {
                id: DEFAULT_AGENT_ID,
                default: !hasExplicitDefault,
              },
            ]
          : []),
        ...currentAgents,
        reviewerAgent,
      ],
    },
  };
}

export function applyLocalSetupReflectionReviewerDefaults(baseConfig: MaumauConfig): MaumauConfig {
  const agentToAgent = baseConfig.tools?.agentToAgent;
  const withToolDefaults: MaumauConfig = {
    ...baseConfig,
    tools: {
      ...baseConfig.tools,
      sessions: {
        ...baseConfig.tools?.sessions,
        visibility: baseConfig.tools?.sessions?.visibility ?? "all",
      },
      agentToAgent: {
        ...agentToAgent,
        enabled: agentToAgent?.enabled ?? true,
        allow: Array.isArray(agentToAgent?.allow) ? agentToAgent.allow : ["*"],
      },
    },
  };
  return shouldUseDedicatedReviewerAgent(withToolDefaults)
    ? ensureReviewerAgent(withToolDefaults)
    : withToolDefaults;
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
    defaultAgentId: resolveDefaultAgentId(config),
    enqueueSystemEvent() {},
    requestHeartbeatNow() {},
    async runIsolatedAgentJob() {
      return { status: "ok" };
    },
  });
}

function resolveReflectionJobAgentId(config: MaumauConfig): string | undefined {
  return shouldUseDedicatedReviewerAgent(config) ? REFLECTION_REVIEWER_AGENT_ID : undefined;
}

function syncManagedReflectionJob(params: {
  job: ReturnType<typeof createJob>;
  agentId: string;
  description: string;
  sessionTarget: CronSessionTarget;
  message: string;
}) {
  let changed = false;
  const { job } = params;

  if (job.agentId !== params.agentId) {
    job.agentId = params.agentId;
    changed = true;
  }
  if (job.description !== params.description) {
    job.description = params.description;
    changed = true;
  }
  if (job.sessionTarget !== params.sessionTarget) {
    job.sessionTarget = params.sessionTarget;
    changed = true;
  }
  if (job.wakeMode !== "now") {
    job.wakeMode = "now";
    changed = true;
  }
  if (job.payload.kind !== "agentTurn") {
    job.payload = {
      kind: "agentTurn",
      message: params.message,
    };
    changed = true;
  } else if (job.payload.message !== params.message) {
    job.payload = {
      ...job.payload,
      message: params.message,
    };
    changed = true;
  }
  if (!job.delivery || job.delivery.mode !== "none") {
    job.delivery = { mode: "none" };
    changed = true;
  }
  if (typeof job.state?.runningAtMs === "number") {
    job.state.runningAtMs = undefined;
    changed = true;
  }

  if (changed) {
    job.updatedAtMs = Date.now();
  }
  return changed;
}

async function ensureReflectionWorkspace(
  workspaceDir: string,
  runtime: RuntimeEnv,
  agentId?: string,
) {
  const quietRuntime: RuntimeEnv = {
    ...runtime,
    log() {},
  };
  await ensureWorkspaceAndSessions(workspaceDir, quietRuntime, { agentId });
  await Promise.all([
    fs.mkdir(path.join(workspaceDir, "reviews", "daily"), { recursive: true }),
    fs.mkdir(path.join(workspaceDir, "reviews", "weekly"), { recursive: true }),
  ]);
}

export async function ensureOnboardedReflectionReviewerArtifacts(params: {
  config: MaumauConfig;
  runtime: RuntimeEnv;
}): Promise<void> {
  const managedConfig = ensureReviewerAgent(params.config);
  const jobAgentId = resolveReflectionJobAgentId(managedConfig);
  const workspaceDir = resolveAgentWorkspaceDir(
    managedConfig,
    jobAgentId ?? resolveDefaultAgentId(params.config),
  );
  await ensureReflectionWorkspace(workspaceDir, params.runtime, jobAgentId);

  const storePath = resolveCronStorePath(managedConfig.cron?.store);
  const store = await loadCronStore(storePath);
  const state = createQuietCronState(managedConfig, storePath);
  const tz = resolveReviewTimezone(managedConfig);

  let changed = false;
  const managedDaily = store.jobs.find((job) => job.name === REFLECTION_DAILY_JOB_NAME);
  const managedWeekly = store.jobs.find((job) => job.name === REFLECTION_WEEKLY_JOB_NAME);

  if (!managedDaily) {
    store.jobs.push(
      createJob(state, {
        ...(jobAgentId ? { agentId: jobAgentId } : {}),
        name: REFLECTION_DAILY_JOB_NAME,
        description: "Daily cross-agent reflection curation job.",
        enabled: true,
        schedule: {
          kind: "cron",
          expr: "0 17 * * *",
          tz,
        },
        sessionTarget: "session:daily-reflection-curation",
        wakeMode: "now",
        payload: {
          kind: "agentTurn",
          message: DAILY_REFLECTION_PROMPT,
        },
        delivery: {
          mode: "none",
        },
      }),
    );
    changed = true;
  } else if (jobAgentId) {
    changed =
      syncManagedReflectionJob({
        job: managedDaily,
        agentId: jobAgentId,
        description: "Daily cross-agent reflection curation job.",
        sessionTarget: "session:daily-reflection-curation",
        message: DAILY_REFLECTION_PROMPT,
      }) || changed;
  }

  if (!managedWeekly) {
    store.jobs.push(
      createJob(state, {
        ...(jobAgentId ? { agentId: jobAgentId } : {}),
        name: REFLECTION_WEEKLY_JOB_NAME,
        description: "Weekly cross-agent reflection synthesis job.",
        enabled: true,
        schedule: {
          kind: "cron",
          expr: "0 18 * * 0",
          tz,
        },
        sessionTarget: "session:weekly-reflection",
        wakeMode: "now",
        payload: {
          kind: "agentTurn",
          message: WEEKLY_REFLECTION_PROMPT,
        },
        delivery: {
          mode: "none",
        },
      }),
    );
    changed = true;
  } else if (jobAgentId) {
    changed =
      syncManagedReflectionJob({
        job: managedWeekly,
        agentId: jobAgentId,
        description: "Weekly cross-agent reflection synthesis job.",
        sessionTarget: "session:weekly-reflection",
        message: WEEKLY_REFLECTION_PROMPT,
      }) || changed;
  }

  if (changed) {
    await saveCronStore(storePath, store);
  }
}

import fs from "node:fs/promises";
import path from "node:path";
import { resolveDefaultAgentId } from "../agents/agent-scope.js";
import { resolveAgentWorkspaceDir } from "../agents/agent-scope.js";
import type { MaumauConfig } from "../config/config.js";
import { createJob } from "../cron/service/jobs.js";
import { createCronServiceState } from "../cron/service/state.js";
import { loadCronStore, resolveCronStorePath, saveCronStore } from "../cron/store.js";
import { DEFAULT_AGENT_ID, normalizeAgentId } from "../routing/session-key.js";
import type { RuntimeEnv } from "../runtime.js";
import { ensureWorkspaceAndSessions } from "./onboard-helpers.js";

export const REFLECTION_REVIEWER_AGENT_ID = "reviewer";
export const REFLECTION_REVIEWER_AGENT_NAME = "Reflection Reviewer";
export const REFLECTION_DAILY_JOB_NAME = "Daily reflection curation";
export const REFLECTION_WEEKLY_JOB_NAME = "Weekly reflection reviewer";

const DAILY_REFLECTION_PROMPT = `You are the daily reflection curator for this Maumau gateway.

Review user-facing sessions across agents and workspaces on this gateway.
Stay plan-only. You may inspect sessions, memory, and current public information when needed, and you may write today's daily note. Do not edit code, config, bootstrap/personality files, cron, plugins, or any workspace files except reviews/daily/YYYY-MM-DD.md.

1. Use sessions_list with activeMinutes=1440, kinds=["main","group","other"], limit=200, messageLimit=0.
2. Treat kind other rows as possible direct user sessions. Skip operational or internal chatter such as cron, hook, node, subagent, ACP, heartbeat, rows whose channel is internal, and rows whose key, label, or display name are clearly operational.
3. Inspect up to the latest 200 non-tool messages per remaining candidate with sessions_history(includeTools=false).
4. Extract struggles, delights, durable preferences, and candidate fixes. Paraphrase safely; do not quote sensitive text unless clearly safe.
5. Use memory_search or memory_get only when helpful.
6. Write or update reviews/daily/YYYY-MM-DD.md with these sections exactly: Day summary, Top struggles, Top delights, Durable preferences, Candidate fixes, Research follow-ups, Weekly carry-forward.
7. Always write the daily file, even on calm days. Keep calm days brief and explicitly say the day was calm.
8. Do not send chat. Reply only NO_REPLY.`;

const WEEKLY_REFLECTION_PROMPT = `You are the weekly reflection reviewer for this Maumau gateway.

Review user-facing sessions across agents and workspaces on this gateway.
Stay plan-only. You may inspect daily notes, sessions, memory, and current public information when needed, and you may write the weekly report. Do not edit code, config, bootstrap/personality files, cron, plugins, or any workspace files except reviews/weekly/YYYY-WW.md.

1. Read the latest 7 daily notes under reviews/daily/.
2. If coverage is missing or incomplete, use sessions_list with activeMinutes=10080, kinds=["main","group","other"], limit=200, messageLimit=0, then inspect up to the latest 200 non-tool messages with sessions_history(includeTools=false).
3. Treat kind other rows as possible direct user sessions. Skip operational or internal chatter such as cron, hook, node, subagent, ACP, heartbeat, rows whose channel is internal, and rows whose key, label, or display name are clearly operational.
4. Synthesize the week from daily notes first, then use raw sessions only to fill gaps or validate high-impact claims.
5. Extract top struggles, delights, recurring do's and don'ts, suggested personality edits, tooling or plugin opportunities, recommended solutions or experiments, research-backed recommendations, and next-week tasks. Paraphrase safely; do not quote sensitive text unless clearly safe.
6. Use memory_search or memory_get only when helpful. Use web_search or web_fetch only for up to 3 high-leverage items that need current verification, and include links in the report.
7. Write reviews/weekly/YYYY-WW.md with these sections exactly: Week overview, Top struggles, Top delights, Recurring do's, Recurring don'ts, Suggested personality edits, Suggested tooling/plugin opportunities, Recommended solutions / experiments, Research-backed recommendations, Next-week task plan.
8. Always write the weekly report, even on calm weeks. Keep calm weeks brief and explicitly say the week was calm.
9. If the report is worth surfacing and the default main session has usable deliveryContext with explicit target info, send one concise main-chat summary naming the report path and 2 to 4 highest-leverage findings. Otherwise skip chat.
10. Reply only NO_REPLY.`;

function resolveReviewTimezone(config: MaumauConfig): string {
  const configured = config.agents?.defaults?.userTimezone?.trim();
  return configured || Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function shouldUseDedicatedReviewerAgent(config: MaumauConfig): boolean {
  const defaultAgentId = resolveDefaultAgentId(config);
  const sandbox = config.agents?.defaults?.sandbox;
  const mode = sandbox?.mode ?? "off";
  const sandboxed =
    mode === "all" ||
    (mode === "non-main" && normalizeAgentId(defaultAgentId) !== DEFAULT_AGENT_ID);
  if (!sandboxed) {
    return false;
  }
  return (sandbox?.sessionToolsVisibility ?? "spawned") === "spawned";
}

function ensureReviewerAgent(config: MaumauConfig): MaumauConfig {
  const currentAgents = Array.isArray(config.agents?.list) ? config.agents.list : [];
  if (currentAgents.some((entry) => normalizeAgentId(entry?.id) === REFLECTION_REVIEWER_AGENT_ID)) {
    return config;
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
        {
          id: REFLECTION_REVIEWER_AGENT_ID,
          name: REFLECTION_REVIEWER_AGENT_NAME,
          sandbox: {
            mode: "off",
          },
        },
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

function hasReflectionJob(jobs: Array<{ name?: string | null }>, name: string): boolean {
  return jobs.some((job) => job?.name === name);
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
  const jobAgentId = resolveReflectionJobAgentId(params.config);
  const workspaceDir = resolveAgentWorkspaceDir(
    params.config,
    jobAgentId ?? resolveDefaultAgentId(params.config),
  );
  await ensureReflectionWorkspace(workspaceDir, params.runtime, jobAgentId);

  const storePath = resolveCronStorePath(params.config.cron?.store);
  const store = await loadCronStore(storePath);
  const state = createQuietCronState(params.config, storePath);
  const tz = resolveReviewTimezone(params.config);

  let changed = false;

  if (!hasReflectionJob(store.jobs, REFLECTION_DAILY_JOB_NAME)) {
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
  }

  if (!hasReflectionJob(store.jobs, REFLECTION_WEEKLY_JOB_NAME)) {
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
  }

  if (changed) {
    await saveCronStore(storePath, store);
  }
}

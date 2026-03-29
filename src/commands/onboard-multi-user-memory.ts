import fs from "node:fs/promises";
import path from "node:path";
import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../agents/agent-scope.js";
import {
  DEFAULT_AGENTS_FILENAME,
  DEFAULT_HEARTBEAT_FILENAME,
  DEFAULT_USER_FILENAME,
} from "../agents/workspace.js";
import type { MaumauConfig } from "../config/config.js";
import { createJob } from "../cron/service/jobs.js";
import { createCronServiceState } from "../cron/service/state.js";
import { loadCronStore, resolveCronStorePath, saveCronStore } from "../cron/store.js";
import { DEFAULT_LANGUAGE_ID, normalizeLanguageId, type LanguageId } from "../i18n/languages.js";
import { DEFAULT_AGENT_ID } from "../routing/session-key.js";
import type { RuntimeEnv } from "../runtime.js";
import type { AgentConfig } from "../config/types.agents.js";
import { ensureWorkspaceAndSessions } from "./onboard-helpers.js";

export const MULTI_USER_MEMORY_PLUGIN_ID = "multi-user-memory";
export const MULTI_USER_MEMORY_CURATOR_AGENT_ID = "memory-curator";
export const MULTI_USER_MEMORY_CURATOR_AGENT_NAME = "Memory Curator";
export const MULTI_USER_MEMORY_CURATOR_JOB_NAME = "Daily Memory Curation";
const MULTI_USER_MEMORY_CURATOR_JOB_PROMPT = [
  "Run `multi_user_memory_curate` exactly once with `maxItems` set to 20.",
  "Only queue proposals when a private fact materially affects how other users should act,",
  "respond, plan, or understand context, and only for the narrowest affected group.",
  'If nothing qualifies, reply with exactly "No new sharing proposals."',
  "If proposals were queued, reply with a short summary of the count and target groups only.",
].join(" ");
const MULTI_USER_MEMORY_CURATOR_AGENT_GUIDE = `<!-- maumau:auto-generated memory curator -->
# Memory Curator

You are an internal Maumau system agent for multi-user memory curation.

Your only job is to run \`multi_user_memory_curate\` and briefly report the outcome.

Rules:
- Only create sharing proposals when a private fact materially affects other users.
- Always target the narrowest affected group.
- Never copy private facts directly into shared memory.
- Never create or edit shared memory manually.
- Never take unrelated actions, contact users, or use unrelated tools.
- If nothing qualifies, reply with exactly "No new sharing proposals."
`;
const MULTI_USER_MEMORY_CURATOR_USER_NOTE = `<!-- maumau:auto-generated memory curator -->
This workspace belongs to Maumau's internal multi-user memory curator. Treat every human user's
private memory as sensitive and keep it private unless an approved proposal promotes it.
`;
const MULTI_USER_MEMORY_CURATOR_HEARTBEAT_NOTE = `<!-- maumau:auto-generated memory curator -->
On scheduled runs, call \`multi_user_memory_curate\` once and return only a brief outcome summary.
`;

type PluginConfigRecord = Record<string, unknown>;

function resolveOnboardingDefaultLanguage(env: NodeJS.ProcessEnv = process.env): LanguageId {
  return (
    normalizeLanguageId(env.MAUMAU_DEFAULT_LANGUAGE) ??
    normalizeLanguageId(env.LC_ALL) ??
    normalizeLanguageId(env.LC_MESSAGES) ??
    normalizeLanguageId(env.LANG) ??
    DEFAULT_LANGUAGE_ID
  );
}

function ensurePluginConfigRecord(baseConfig: MaumauConfig): PluginConfigRecord {
  const entry = baseConfig.plugins?.entries?.[MULTI_USER_MEMORY_PLUGIN_ID];
  const current =
    entry?.config && typeof entry.config === "object" && !Array.isArray(entry.config)
      ? (entry.config as PluginConfigRecord)
      : {};
  const currentDelivery =
    current.approvalDelivery &&
    typeof current.approvalDelivery === "object" &&
    !Array.isArray(current.approvalDelivery)
      ? (current.approvalDelivery as PluginConfigRecord)
      : {};
  return {
    enabled: current.enabled ?? true,
    autoDiscover: current.autoDiscover ?? true,
    defaultLanguage:
      normalizeLanguageId(
        typeof current.defaultLanguage === "string" ? current.defaultLanguage : "",
      ) ?? resolveOnboardingDefaultLanguage(),
    approvalDelivery: {
      mode:
        typeof currentDelivery.mode === "string" && currentDelivery.mode.trim()
          ? currentDelivery.mode
          : "same_session",
      ...(typeof currentDelivery.channelId === "string" && currentDelivery.channelId.trim()
        ? { channelId: currentDelivery.channelId.trim() }
        : {}),
      ...(typeof currentDelivery.accountId === "string" && currentDelivery.accountId.trim()
        ? { accountId: currentDelivery.accountId.trim() }
        : {}),
      ...(typeof currentDelivery.to === "string" && currentDelivery.to.trim()
        ? { to: currentDelivery.to.trim() }
        : {}),
    },
    curatorAgentId:
      typeof current.curatorAgentId === "string" && current.curatorAgentId.trim()
        ? current.curatorAgentId.trim()
        : MULTI_USER_MEMORY_CURATOR_AGENT_ID,
    adminUserIds: Array.isArray(current.adminUserIds) ? current.adminUserIds : [],
    users:
      current.users && typeof current.users === "object" && !Array.isArray(current.users)
        ? current.users
        : {},
    groups:
      current.groups && typeof current.groups === "object" && !Array.isArray(current.groups)
        ? current.groups
        : {},
    ...(typeof current.approvalCenterBaseUrl === "string" && current.approvalCenterBaseUrl.trim()
      ? { approvalCenterBaseUrl: current.approvalCenterBaseUrl.trim() }
      : {}),
  };
}

function resolveCuratorAgentId(pluginConfig: PluginConfigRecord): string {
  return typeof pluginConfig.curatorAgentId === "string" && pluginConfig.curatorAgentId.trim()
    ? pluginConfig.curatorAgentId.trim()
    : MULTI_USER_MEMORY_CURATOR_AGENT_ID;
}

function createCuratorAgentConfig(curatorAgentId: string): AgentConfig {
  return {
    id: curatorAgentId,
    name: MULTI_USER_MEMORY_CURATOR_AGENT_NAME,
    thinkingDefault: "minimal",
    reasoningDefault: "off",
    tools: {
      allow: ["multi_user_memory_curate"],
    },
  };
}

function ensureCuratorAgent(config: MaumauConfig, curatorAgentId: string): MaumauConfig {
  const currentAgents = Array.isArray(config.agents?.list) ? config.agents.list : [];
  if (currentAgents.some((entry) => entry?.id === curatorAgentId)) {
    return config;
  }
  const curatorAgent = createCuratorAgentConfig(curatorAgentId);
  const nextAgents =
    currentAgents.length === 0
      ? [
          {
            id: DEFAULT_AGENT_ID,
            default: true,
            name: "Main",
          } satisfies AgentConfig,
          curatorAgent,
        ]
      : [...currentAgents, curatorAgent];
  return {
    ...config,
    agents: {
      ...config.agents,
      list: nextAgents,
    },
  };
}

export function applyLocalSetupMultiUserMemoryDefaults(baseConfig: MaumauConfig): MaumauConfig {
  const currentSlot =
    typeof baseConfig.plugins?.slots?.memory === "string"
      ? baseConfig.plugins.slots.memory.trim()
      : "";
  if (currentSlot && currentSlot !== MULTI_USER_MEMORY_PLUGIN_ID) {
    return baseConfig;
  }

  const pluginConfig = ensurePluginConfigRecord(baseConfig);
  const withCuratorAgent = ensureCuratorAgent(
    {
      ...baseConfig,
      plugins: {
        ...baseConfig.plugins,
        slots: {
          ...baseConfig.plugins?.slots,
          memory: MULTI_USER_MEMORY_PLUGIN_ID,
        },
        entries: {
          ...baseConfig.plugins?.entries,
          [MULTI_USER_MEMORY_PLUGIN_ID]: {
            ...baseConfig.plugins?.entries?.[MULTI_USER_MEMORY_PLUGIN_ID],
            config: pluginConfig,
          },
        },
      },
    },
    resolveCuratorAgentId(pluginConfig),
  );
  return withCuratorAgent;
}

async function writeFileIfMissing(filePath: string, content: string): Promise<void> {
  try {
    await fs.writeFile(filePath, content, { encoding: "utf-8", flag: "wx" });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
      throw err;
    }
  }
}

async function ensureCuratorWorkspaceFiles(workspaceDir: string): Promise<void> {
  await Promise.all([
    writeFileIfMissing(
      path.join(workspaceDir, DEFAULT_AGENTS_FILENAME),
      MULTI_USER_MEMORY_CURATOR_AGENT_GUIDE,
    ),
    writeFileIfMissing(
      path.join(workspaceDir, DEFAULT_USER_FILENAME),
      MULTI_USER_MEMORY_CURATOR_USER_NOTE,
    ),
    writeFileIfMissing(
      path.join(workspaceDir, DEFAULT_HEARTBEAT_FILENAME),
      MULTI_USER_MEMORY_CURATOR_HEARTBEAT_NOTE,
    ),
  ]);
}

function hasExistingCuratorJob(params: {
  jobs: Array<{ agentId?: string | null; payload?: { kind?: string; message?: string } }>;
  curatorAgentId: string;
}): boolean {
  return params.jobs.some(
    (job) =>
      job?.agentId === params.curatorAgentId &&
      job?.payload?.kind === "agentTurn" &&
      typeof job.payload.message === "string" &&
      job.payload.message.includes("multi_user_memory_curate"),
  );
}

export async function ensureOnboardedMultiUserMemoryArtifacts(params: {
  config: MaumauConfig;
  runtime: RuntimeEnv;
}): Promise<void> {
  const currentSlot =
    typeof params.config.plugins?.slots?.memory === "string"
      ? params.config.plugins.slots.memory.trim()
      : "";
  if (currentSlot !== MULTI_USER_MEMORY_PLUGIN_ID) {
    return;
  }

  const pluginConfig = ensurePluginConfigRecord(params.config);
  const curatorAgentId = resolveCuratorAgentId(pluginConfig);
  const curatorWorkspaceDir = resolveAgentWorkspaceDir(params.config, curatorAgentId);
  const quietRuntime: RuntimeEnv = {
    ...params.runtime,
    log() {},
  };

  await ensureWorkspaceAndSessions(curatorWorkspaceDir, quietRuntime, {
    skipBootstrap: true,
    agentId: curatorAgentId,
  });
  await ensureCuratorWorkspaceFiles(curatorWorkspaceDir);

  const storePath = resolveCronStorePath(params.config.cron?.store);
  const store = await loadCronStore(storePath);
  if (hasExistingCuratorJob({ jobs: store.jobs, curatorAgentId })) {
    return;
  }

  const state = createCronServiceState({
    log: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    storePath,
    cronEnabled: true,
    defaultAgentId: resolveDefaultAgentId(params.config),
    enqueueSystemEvent() {},
    requestHeartbeatNow() {},
    async runIsolatedAgentJob() {
      return { status: "ok" };
    },
  });

  const job = createJob(state, {
    agentId: curatorAgentId,
    name: MULTI_USER_MEMORY_CURATOR_JOB_NAME,
    description: "System-generated daily multi-user memory curation job.",
    enabled: true,
    schedule: {
      kind: "cron",
      expr: "17 3 * * *",
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    sessionTarget: "isolated",
    wakeMode: "now",
    payload: {
      kind: "agentTurn",
      message: MULTI_USER_MEMORY_CURATOR_JOB_PROMPT,
      thinking: "minimal",
      lightContext: true,
    },
    delivery: {
      mode: "none",
    },
  });
  store.jobs.push(job);
  await saveCronStore(storePath, store);
}

import { normalizeThinkLevel, type ThinkLevel } from "../auto-reply/thinking.js";
import type { MaumauConfig } from "../config/config.js";
import type { AgentDefaultsConfig } from "../config/types.agent-defaults.js";
import { resolveAgentConfig } from "./agent-scope.js";

export type BackgroundAutomationConfig = AgentDefaultsConfig["background"];
export type HeartbeatAutomationConfig = AgentDefaultsConfig["heartbeat"];

export type ResolvedAutomationPolicy = {
  background?: BackgroundAutomationConfig;
  heartbeat?: HeartbeatAutomationConfig;
};

export type ResolvedAutomationDefaults = {
  model?: string;
  thinking?: ThinkLevel;
};

function trimModelRef(raw?: string): string | undefined {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

function mergeConfig<T extends Record<string, unknown>>(
  defaults?: T,
  overrides?: T,
): T | undefined {
  if (!defaults && !overrides) {
    return undefined;
  }
  return { ...defaults, ...overrides } as T;
}

export function resolveAutomationPolicy(
  cfg: MaumauConfig,
  agentId?: string,
): ResolvedAutomationPolicy {
  const agentCfg = agentId ? resolveAgentConfig(cfg, agentId) : undefined;
  return {
    background: mergeConfig(cfg.agents?.defaults?.background, agentCfg?.background),
    heartbeat: mergeConfig(cfg.agents?.defaults?.heartbeat, agentCfg?.heartbeat),
  };
}

export function resolveBackgroundAutomationDefaults(
  policy: ResolvedAutomationPolicy,
): ResolvedAutomationDefaults {
  return {
    model: trimModelRef(policy.background?.model),
    thinking: normalizeThinkLevel(policy.background?.thinking),
  };
}

export function resolveHeartbeatAutomationDefaults(
  policy: ResolvedAutomationPolicy,
): ResolvedAutomationDefaults {
  const background = resolveBackgroundAutomationDefaults(policy);
  return {
    model: trimModelRef(policy.heartbeat?.model) ?? background.model,
    thinking: normalizeThinkLevel(policy.heartbeat?.thinking) ?? background.thinking,
  };
}

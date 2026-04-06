import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { type MaumauConfig, loadConfig } from "../config/config.js";
import {
  discoverAllSessions,
  loadCostUsageSummary,
  loadSessionCostSummary,
} from "../infra/session-cost-usage.js";
import { readWalletEvents, type WalletEvent } from "../infra/wallet-events.js";
import { resolveUserPath } from "../utils.js";
import type { DashboardWalletCard, DashboardWalletResult } from "./dashboard-types.js";
import { formatDateYmd, type DateInterpretation } from "./date-range.js";
import { listAgentsForGateway } from "./session-utils.js";

type CollectDashboardWalletParams = {
  cfg?: MaumauConfig;
  startMs: number;
  endMs: number;
  interpretation?: DateInterpretation;
  nowMs?: number;
  stateDir?: string;
};

type VoiceCallSnapshot = {
  callId: string;
  provider?: string;
  startedAt?: number;
  answeredAt?: number;
  endedAt?: number;
  metadata?: Record<string, unknown>;
};

type WalletRealtimeSession = {
  provider: "deepgram-realtime";
  streamSid: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
};

type WalletRealtimeActiveSession = {
  provider: "deepgram-realtime";
  streamSid: string;
  startedAt: number;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toStringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function clipDurationMs(
  startMs: number | undefined,
  endMs: number | undefined,
  rangeStartMs: number,
  rangeEndMs: number,
): number {
  if (
    startMs === undefined ||
    endMs === undefined ||
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs)
  ) {
    return 0;
  }
  const clippedStart = Math.max(startMs, rangeStartMs);
  const clippedEnd = Math.min(endMs, rangeEndMs);
  if (clippedEnd <= clippedStart) {
    return 0;
  }
  return clippedEnd - clippedStart;
}

function overlapsRange(
  startMs: number | undefined,
  endMs: number | undefined,
  rangeStartMs: number,
  rangeEndMs: number,
): boolean {
  if (
    startMs === undefined ||
    endMs === undefined ||
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs)
  ) {
    return false;
  }
  return startMs <= rangeEndMs && endMs >= rangeStartMs;
}

function resolveVoiceCallStorePath(cfg: MaumauConfig): string {
  const rawStore = (
    cfg.plugins?.entries?.["voice-call"]?.config as
      | { store?: unknown }
      | undefined
  )?.store;
  if (typeof rawStore === "string" && rawStore.trim()) {
    return resolveUserPath(rawStore);
  }
  return resolveUserPath(path.join(os.homedir(), ".maumau", "voice-calls"));
}

async function discoverAllSessionsForWallet(params: {
  config: MaumauConfig;
  startMs: number;
  endMs: number;
}): Promise<Array<{ sessionId: string; sessionFile: string; agentId: string }>> {
  const agents = listAgentsForGateway(params.config).agents;
  const discovered = await Promise.all(
    agents.map(async (agent) => {
      const sessions = await discoverAllSessions({
        agentId: agent.id,
        startMs: params.startMs,
        endMs: params.endMs,
      });
      return sessions.map((session) => ({
        sessionId: session.sessionId,
        sessionFile: session.sessionFile,
        agentId: agent.id,
      }));
    }),
  );
  return discovered.flat();
}

async function collectLlmCard(params: {
  config: MaumauConfig;
  startMs: number;
  endMs: number;
}): Promise<DashboardWalletCard> {
  const [costSummary, sessions] = await Promise.all([
    loadCostUsageSummary({
      startMs: params.startMs,
      endMs: params.endMs,
      config: params.config,
    }),
    discoverAllSessionsForWallet(params),
  ]);

  let records = 0;
  for (const session of sessions) {
    const summary = await loadSessionCostSummary({
      sessionId: session.sessionId,
      sessionFile: session.sessionFile,
      config: params.config,
      agentId: session.agentId,
      startMs: params.startMs,
      endMs: params.endMs,
    });
    if (!summary) {
      continue;
    }
    records += (summary.modelUsage ?? []).reduce((sum, entry) => sum + entry.count, 0);
  }

  return {
    id: "llm",
    records,
    recordLabel: "Usage records",
    totalValue: costSummary.totals.totalCost,
    totalUnit: "usd",
    totalLabel: "Cost",
    measurement: "exact",
    coverage: "full",
    secondaryValue: costSummary.totals.totalTokens,
    secondaryUnit: "tokens",
    secondaryLabel: "Tokens",
  };
}

function parseVoiceCallSnapshot(value: unknown): VoiceCallSnapshot | null {
  if (!isObject(value)) {
    return null;
  }
  const callId = toStringValue(value.callId);
  if (!callId) {
    return null;
  }
  return {
    callId,
    provider: toStringValue(value.provider),
    startedAt: toFiniteNumber(value.startedAt),
    answeredAt: toFiniteNumber(value.answeredAt),
    endedAt: toFiniteNumber(value.endedAt),
    metadata: isObject(value.metadata) ? value.metadata : undefined,
  };
}

async function readLatestVoiceCallSnapshots(
  config: MaumauConfig,
): Promise<Map<string, VoiceCallSnapshot>> {
  const logPath = path.join(resolveVoiceCallStorePath(config), "calls.jsonl");
  try {
    const raw = await fs.readFile(logPath, "utf8");
    const latest = new Map<string, VoiceCallSnapshot>();
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      try {
        const parsed = parseVoiceCallSnapshot(JSON.parse(trimmed));
        if (parsed) {
          latest.set(parsed.callId, parsed);
        }
      } catch {
        // Ignore malformed log lines.
      }
    }
    return latest;
  } catch {
    return new Map();
  }
}

function collectTwilioCard(params: {
  calls: Iterable<VoiceCallSnapshot>;
  startMs: number;
  endMs: number;
  nowMs: number;
}): DashboardWalletCard {
  let records = 0;
  let totalValue = 0;
  for (const call of params.calls) {
    if (call.provider !== "twilio") {
      continue;
    }
    const callEndMs = call.endedAt ?? params.nowMs;
    if (!overlapsRange(call.startedAt, callEndMs, params.startMs, params.endMs)) {
      continue;
    }
    records += 1;
    if (call.answeredAt !== undefined) {
      totalValue += clipDurationMs(call.answeredAt, callEndMs, params.startMs, params.endMs);
    }
  }
  return {
    id: "twilio",
    records,
    recordLabel: "Calls",
    totalValue,
    totalUnit: "duration_ms",
    totalLabel: "Connected time",
    measurement: "derived",
    coverage: "full",
  };
}

function parseWalletRealtimeSession(value: unknown): WalletRealtimeSession | null {
  if (!isObject(value) || value.provider !== "deepgram-realtime") {
    return null;
  }
  const streamSid = toStringValue(value.streamSid);
  const startedAt = toFiniteNumber(value.startedAt);
  const endedAt = toFiniteNumber(value.endedAt);
  const durationMs = toFiniteNumber(value.durationMs);
  if (!streamSid || startedAt === undefined || endedAt === undefined || durationMs === undefined) {
    return null;
  }
  return {
    provider: "deepgram-realtime",
    streamSid,
    startedAt,
    endedAt,
    durationMs,
  };
}

function parseWalletRealtimeActiveSession(value: unknown): WalletRealtimeActiveSession | null {
  if (!isObject(value) || value.provider !== "deepgram-realtime") {
    return null;
  }
  const streamSid = toStringValue(value.streamSid);
  const startedAt = toFiniteNumber(value.startedAt);
  if (!streamSid || startedAt === undefined) {
    return null;
  }
  return {
    provider: "deepgram-realtime",
    streamSid,
    startedAt,
  };
}

function collectDeepgramRealtimeCard(params: {
  calls: Iterable<VoiceCallSnapshot>;
  startMs: number;
  endMs: number;
  nowMs: number;
}): DashboardWalletCard {
  let records = 0;
  let totalValue = 0;
  for (const call of params.calls) {
    const walletRealtime = isObject(call.metadata?.walletRealtimeStt)
      ? (call.metadata?.walletRealtimeStt as Record<string, unknown>)
      : null;
    if (!walletRealtime) {
      continue;
    }
    const sessions = Array.isArray(walletRealtime.sessions) ? walletRealtime.sessions : [];
    for (const rawSession of sessions) {
      const session = parseWalletRealtimeSession(rawSession);
      if (!session) {
        continue;
      }
      if (!overlapsRange(session.startedAt, session.endedAt, params.startMs, params.endMs)) {
        continue;
      }
      records += 1;
      totalValue += clipDurationMs(
        session.startedAt,
        session.endedAt,
        params.startMs,
        params.endMs,
      );
    }
    const activeSession = parseWalletRealtimeActiveSession(walletRealtime.activeSession);
    if (!activeSession) {
      continue;
    }
    const activeEndMs = call.endedAt ?? params.nowMs;
    if (!overlapsRange(activeSession.startedAt, activeEndMs, params.startMs, params.endMs)) {
      continue;
    }
    records += 1;
    totalValue += clipDurationMs(
      activeSession.startedAt,
      activeEndMs,
      params.startMs,
      params.endMs,
    );
  }

  return {
    id: "deepgram-realtime",
    records,
    recordLabel: "Streams",
    totalValue,
    totalUnit: "duration_ms",
    totalLabel: "Audio time",
    measurement: "derived",
    coverage: "partial",
    note: "Historical coverage begins when Wallet realtime telemetry is available.",
  };
}

function collectDeepgramAudioCard(params: {
  events: WalletEvent[];
  startMs: number;
  endMs: number;
}): DashboardWalletCard {
  const deepgramEvents = params.events.filter(
    (event): event is Extract<WalletEvent, { kind: "deepgram-audio" }> =>
      event.kind === "deepgram-audio" &&
      event.completedAtMs >= params.startMs &&
      event.completedAtMs <= params.endMs,
  );
  const missingTotals = deepgramEvents.filter((event) => event.durationMs === undefined).length;
  const totalValue = deepgramEvents.reduce((sum, event) => sum + (event.durationMs ?? 0), 0);
  const notes: string[] = ["Historical coverage begins when Wallet audio telemetry is available."];
  if (missingTotals > 0) {
    notes.push(`${missingTotals} record(s) are missing duration totals.`);
  }
  return {
    id: "deepgram-audio",
    records: deepgramEvents.length,
    recordLabel: "Requests",
    totalValue,
    totalUnit: "duration_ms",
    totalLabel: "Audio time",
    measurement: "derived",
    coverage: "partial",
    missingTotals,
    note: notes.join(" "),
  };
}

function collectElevenLabsCard(params: {
  events: WalletEvent[];
  startMs: number;
  endMs: number;
}): DashboardWalletCard {
  const events = params.events.filter(
    (event): event is Extract<WalletEvent, { kind: "elevenlabs" }> =>
      event.kind === "elevenlabs" &&
      event.completedAtMs >= params.startMs &&
      event.completedAtMs <= params.endMs,
  );
  return {
    id: "elevenlabs",
    records: events.length,
    recordLabel: "Requests",
    totalValue: events.reduce((sum, event) => sum + event.characters, 0),
    totalUnit: "characters",
    totalLabel: "Characters",
    measurement: "exact",
    coverage: "partial",
    note: "Historical coverage begins when Wallet TTS telemetry is available.",
  };
}

export async function collectDashboardWallet(
  params: CollectDashboardWalletParams,
): Promise<DashboardWalletResult> {
  const config = params.cfg ?? loadConfig();
  const nowMs = params.nowMs ?? Date.now();
  const [llm, calls, events] = await Promise.all([
    collectLlmCard({
      config,
      startMs: params.startMs,
      endMs: params.endMs,
    }),
    readLatestVoiceCallSnapshots(config),
    readWalletEvents(params.stateDir),
  ]);

  const callValues = Array.from(calls.values());
  const twilio = collectTwilioCard({
    calls: callValues,
    startMs: params.startMs,
    endMs: params.endMs,
    nowMs,
  });
  const deepgramRealtime = collectDeepgramRealtimeCard({
    calls: callValues,
    startMs: params.startMs,
    endMs: params.endMs,
    nowMs,
  });
  const deepgramAudio = collectDeepgramAudioCard({
    events,
    startMs: params.startMs,
    endMs: params.endMs,
  });
  const elevenlabs = collectElevenLabsCard({
    events,
    startMs: params.startMs,
    endMs: params.endMs,
  });

  return {
    generatedAtMs: nowMs,
    startDate: formatDateYmd(params.startMs, params.interpretation),
    endDate: formatDateYmd(params.endMs, params.interpretation),
    cards: [llm, twilio, deepgramRealtime, deepgramAudio, elevenlabs],
  };
}

export const __test = {
  clipDurationMs,
  overlapsRange,
  resolveVoiceCallStorePath,
  readLatestVoiceCallSnapshots,
  collectTwilioCard,
  collectDeepgramRealtimeCard,
  collectDeepgramAudioCard,
  collectElevenLabsCard,
};

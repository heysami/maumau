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
import type {
  DashboardWalletCard,
  DashboardWalletResult,
  DashboardWalletSpendBar,
  DashboardWalletSpendBreakdown,
  DashboardWalletSpendChart,
  DashboardWalletSpendGranularity,
  DashboardWalletSpendResult,
  DashboardWalletSpendSegment,
} from "./dashboard-types.js";
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
  cost?: number;
  costUsd?: number;
  costs?: unknown[];
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

type ExpenseWalletEvent = Extract<WalletEvent, { kind: "expense" }>;

type WalletSpendBarAccumulator = {
  startAtMs: number;
  endAtMs: number;
  totalValue: number;
  records: number;
  segments: Map<string, DashboardWalletSpendSegment>;
};

const DAY_MS = 24 * 60 * 60 * 1_000;
const MAX_WALLET_SPEND_SEGMENTS = 6;
// Vapi's platform fee is billed at $0.05/minute when exact per-call cost is unavailable.
const DEFAULT_VAPI_ESTIMATED_USD_PER_MINUTE = 0.05;

type TelephonyWalletRoute = "self-hosted" | "vapi";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toLooseFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
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
  const rawStore = (cfg.plugins?.entries?.["voice-call"]?.config as { store?: unknown } | undefined)
    ?.store;
  if (typeof rawStore === "string" && rawStore.trim()) {
    return resolveUserPath(rawStore);
  }
  return resolveUserPath(path.join(os.homedir(), ".maumau", "voice-calls"));
}

function resolveTelephonyWalletRoute(config: MaumauConfig): TelephonyWalletRoute {
  const rawConfig = config.plugins?.entries?.["voice-call"]?.config;
  if (!isObject(rawConfig)) {
    return "self-hosted";
  }
  return toStringValue(rawConfig.mode)?.toLowerCase() === "vapi" ? "vapi" : "self-hosted";
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
    cost: toLooseFiniteNumber(value.cost),
    costUsd: toLooseFiniteNumber(value.costUsd),
    costs: Array.isArray(value.costs) ? value.costs : undefined,
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

function sumVapiCosts(value: unknown): number | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  let total = 0;
  let count = 0;
  for (const entry of value) {
    if (!isObject(entry)) {
      continue;
    }
    const cost = toLooseFiniteNumber(entry.cost);
    if (cost === undefined) {
      continue;
    }
    total += cost;
    count += 1;
  }
  return count > 0 ? total : undefined;
}

function extractVapiCallCostUsd(call: VoiceCallSnapshot): number | undefined {
  const metadata = call.metadata;
  return (
    call.costUsd ??
    call.cost ??
    sumVapiCosts(call.costs) ??
    toLooseFiniteNumber(metadata?.vapiCostUsd) ??
    toLooseFiniteNumber(metadata?.costUsd) ??
    toLooseFiniteNumber(metadata?.cost) ??
    sumVapiCosts(metadata?.costs)
  );
}

function collectVapiCard(params: {
  calls: Iterable<VoiceCallSnapshot>;
  startMs: number;
  endMs: number;
  nowMs: number;
}): DashboardWalletCard {
  let records = 0;
  let totalValue = 0;
  let missingTotals = 0;
  for (const call of params.calls) {
    if (call.provider !== "vapi") {
      continue;
    }
    const billableStartMs = call.answeredAt ?? call.startedAt;
    const billableEndMs = call.endedAt ?? params.nowMs;
    if (!overlapsRange(billableStartMs, billableEndMs, params.startMs, params.endMs)) {
      continue;
    }
    records += 1;
    const clippedDurationMs = clipDurationMs(
      billableStartMs,
      billableEndMs,
      params.startMs,
      params.endMs,
    );
    const exactCostUsd = extractVapiCallCostUsd(call);
    if (exactCostUsd !== undefined) {
      const billableDurationMs = clipDurationMs(
        billableStartMs,
        billableEndMs,
        billableStartMs,
        billableEndMs,
      );
      if (
        billableDurationMs > 0 &&
        clippedDurationMs > 0 &&
        clippedDurationMs < billableDurationMs
      ) {
        totalValue += exactCostUsd * (clippedDurationMs / billableDurationMs);
      } else {
        totalValue += exactCostUsd;
      }
      continue;
    }
    missingTotals += 1;
    totalValue += (clippedDurationMs / 60_000) * DEFAULT_VAPI_ESTIMATED_USD_PER_MINUTE;
  }

  const noteParts = ["Uses Vapi-reported call cost when available."];
  if (missingTotals > 0) {
    noteParts.push(
      `${String(missingTotals)} call(s) are estimated from billable duration because exact Vapi cost telemetry was unavailable.`,
    );
  }

  return {
    id: "vapi",
    records,
    recordLabel: "Calls",
    totalValue,
    totalUnit: "usd",
    totalLabel: missingTotals > 0 ? "Estimated cost" : "Cost",
    measurement: missingTotals > 0 ? "derived" : "exact",
    coverage: missingTotals > 0 ? "partial" : "full",
    missingTotals: missingTotals > 0 ? missingTotals : undefined,
    note: noteParts.join(" "),
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

function hasWalletCardActivity(card: DashboardWalletCard): boolean {
  return (
    card.records > 0 ||
    card.totalValue > 0 ||
    (card.secondaryValue ?? 0) > 0 ||
    (card.missingTotals ?? 0) > 0
  );
}

function normalizeWalletSpendKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function titleCaseWords(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function resolveWalletSpendLabel(
  event: ExpenseWalletEvent,
  breakdown: DashboardWalletSpendBreakdown,
): string {
  return breakdown === "category" ? titleCaseWords(event.category) : event.merchant;
}

function resolveWalletSpendBreakdownKey(
  event: ExpenseWalletEvent,
  breakdown: DashboardWalletSpendBreakdown,
): string {
  return normalizeWalletSpendKey(breakdown === "category" ? event.category : event.merchant);
}

function resolveWalletSpendEventAtMs(event: ExpenseWalletEvent): number {
  return event.occurredAtMs ?? event.completedAtMs;
}

function toShiftedDate(ms: number, interpretation: DateInterpretation = { mode: "utc" }): Date {
  if (interpretation.mode === "specific") {
    return new Date(ms + interpretation.utcOffsetMinutes * 60 * 1_000);
  }
  return new Date(ms);
}

function getShiftedParts(ms: number, interpretation: DateInterpretation = { mode: "utc" }) {
  const shifted = toShiftedDate(ms, interpretation);
  if (interpretation.mode === "gateway") {
    return {
      year: shifted.getFullYear(),
      monthIndex: shifted.getMonth(),
      day: shifted.getDate(),
      weekday: shifted.getDay(),
    };
  }
  return {
    year: shifted.getUTCFullYear(),
    monthIndex: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  };
}

function fromShiftedParts(
  year: number,
  monthIndex: number,
  day: number,
  interpretation: DateInterpretation = { mode: "utc" },
): number {
  if (interpretation.mode === "gateway") {
    return new Date(year, monthIndex, day).getTime();
  }
  if (interpretation.mode === "specific") {
    return Date.UTC(year, monthIndex, day) - interpretation.utcOffsetMinutes * 60 * 1_000;
  }
  return Date.UTC(year, monthIndex, day);
}

function startOfWalletSpendBucket(
  ms: number,
  granularity: DashboardWalletSpendGranularity,
  interpretation: DateInterpretation = { mode: "utc" },
): number {
  const parts = getShiftedParts(ms, interpretation);
  if (granularity === "day") {
    return fromShiftedParts(parts.year, parts.monthIndex, parts.day, interpretation);
  }
  if (granularity === "week") {
    const dayStart = fromShiftedParts(parts.year, parts.monthIndex, parts.day, interpretation);
    const mondayOffset = (parts.weekday + 6) % 7;
    return dayStart - mondayOffset * DAY_MS;
  }
  if (granularity === "month") {
    return fromShiftedParts(parts.year, parts.monthIndex, 1, interpretation);
  }
  return fromShiftedParts(parts.year, 0, 1, interpretation);
}

function addWalletSpendBucket(
  startAtMs: number,
  granularity: DashboardWalletSpendGranularity,
  interpretation: DateInterpretation = { mode: "utc" },
): number {
  if (granularity === "day") {
    return startAtMs + DAY_MS;
  }
  if (granularity === "week") {
    return startAtMs + 7 * DAY_MS;
  }
  const parts = getShiftedParts(startAtMs, interpretation);
  if (granularity === "month") {
    if (parts.monthIndex === 11) {
      return fromShiftedParts(parts.year + 1, 0, 1, interpretation);
    }
    return fromShiftedParts(parts.year, parts.monthIndex + 1, 1, interpretation);
  }
  return fromShiftedParts(parts.year + 1, 0, 1, interpretation);
}

function listWalletSpendBucketStarts(params: {
  startMs: number;
  endMs: number;
  granularity: DashboardWalletSpendGranularity;
  interpretation?: DateInterpretation;
}): number[] {
  const interpretation = params.interpretation ?? { mode: "utc" };
  const lastStart = startOfWalletSpendBucket(params.endMs, params.granularity, interpretation);
  const starts: number[] = [];
  let cursor = startOfWalletSpendBucket(params.startMs, params.granularity, interpretation);
  while (cursor <= lastStart) {
    starts.push(cursor);
    const next = addWalletSpendBucket(cursor, params.granularity, interpretation);
    if (next <= cursor) {
      break;
    }
    cursor = next;
  }
  return starts;
}

function formatWalletSpendBucketLabel(
  startAtMs: number,
  granularity: DashboardWalletSpendGranularity,
  interpretation: DateInterpretation = { mode: "utc" },
): string {
  const shiftedMs =
    interpretation.mode === "specific"
      ? startAtMs + interpretation.utcOffsetMinutes * 60 * 1_000
      : startAtMs;
  const baseOptions = interpretation.mode === "gateway" ? {} : { timeZone: "UTC" as const };
  if (granularity === "year") {
    return new Intl.DateTimeFormat(undefined, {
      ...baseOptions,
      year: "numeric",
    }).format(shiftedMs);
  }
  if (granularity === "month") {
    return new Intl.DateTimeFormat(undefined, {
      ...baseOptions,
      month: "short",
      year: "numeric",
    }).format(shiftedMs);
  }
  if (granularity === "week") {
    return new Intl.DateTimeFormat(undefined, {
      ...baseOptions,
      month: "short",
      day: "numeric",
    }).format(shiftedMs);
  }
  return new Intl.DateTimeFormat(undefined, {
    ...baseOptions,
    month: "short",
    day: "numeric",
  }).format(shiftedMs);
}

function dedupeExpenseEvents(
  events: WalletEvent[],
  params: { startMs: number; endMs: number },
): ExpenseWalletEvent[] {
  const deduped = new Map<string, ExpenseWalletEvent>();
  for (const event of events) {
    if (event.kind !== "expense") {
      continue;
    }
    const eventAtMs = resolveWalletSpendEventAtMs(event);
    if (eventAtMs < params.startMs || eventAtMs > params.endMs) {
      continue;
    }
    const existing = deduped.get(event.fingerprint);
    if (!existing || existing.completedAtMs < event.completedAtMs) {
      deduped.set(event.fingerprint, event);
    }
  }
  return Array.from(deduped.values()).sort(
    (left, right) => resolveWalletSpendEventAtMs(left) - resolveWalletSpendEventAtMs(right),
  );
}

function buildWalletSpendCharts(params: {
  events: WalletEvent[];
  startMs: number;
  endMs: number;
  interpretation?: DateInterpretation;
}): DashboardWalletSpendResult {
  const interpretation = params.interpretation ?? { mode: "utc" };
  const expenses = dedupeExpenseEvents(params.events, params);
  if (expenses.length === 0) {
    return {
      records: 0,
      currencies: [],
      charts: [],
      note: "No receipt-based spending has been recorded yet.",
    };
  }

  const groupedByCurrency = new Map<string, ExpenseWalletEvent[]>();
  for (const event of expenses) {
    const currency = event.currency.trim().toUpperCase();
    const existing = groupedByCurrency.get(currency) ?? [];
    existing.push(event);
    groupedByCurrency.set(currency, existing);
  }

  const charts: DashboardWalletSpendChart[] = [];
  let fallbackDateCount = 0;
  for (const event of expenses) {
    if (event.occurredAtMs === undefined) {
      fallbackDateCount += 1;
    }
  }

  for (const [currency, currencyEvents] of groupedByCurrency) {
    for (const breakdown of ["category", "merchant"] as const) {
      const totalsBySegment = new Map<
        string,
        { label: string; totalValue: number; records: number }
      >();
      for (const event of currencyEvents) {
        const key = resolveWalletSpendBreakdownKey(event, breakdown);
        const label = resolveWalletSpendLabel(event, breakdown);
        const existing = totalsBySegment.get(key) ?? { label, totalValue: 0, records: 0 };
        existing.totalValue += event.amountValue;
        existing.records += 1;
        totalsBySegment.set(key, existing);
      }
      const topKeys = new Set(
        [...totalsBySegment.entries()]
          .sort((left, right) => right[1].totalValue - left[1].totalValue)
          .slice(0, MAX_WALLET_SPEND_SEGMENTS)
          .map(([key]) => key),
      );

      for (const granularity of ["day", "week", "month", "year"] as const) {
        const bucketStarts = listWalletSpendBucketStarts({
          startMs: params.startMs,
          endMs: params.endMs,
          granularity,
          interpretation,
        });
        const bars = new Map<string, WalletSpendBarAccumulator>(
          bucketStarts.map((startAtMs) => [
            String(startAtMs),
            {
              startAtMs,
              endAtMs: addWalletSpendBucket(startAtMs, granularity, interpretation) - 1,
              totalValue: 0,
              records: 0,
              segments: new Map(),
            },
          ]),
        );
        const legend = new Map<string, DashboardWalletSpendSegment>();

        for (const event of currencyEvents) {
          const barStart = startOfWalletSpendBucket(
            resolveWalletSpendEventAtMs(event),
            granularity,
            interpretation,
          );
          const bar = bars.get(String(barStart));
          if (!bar) {
            continue;
          }
          const rawKey = resolveWalletSpendBreakdownKey(event, breakdown);
          const rawLabel = resolveWalletSpendLabel(event, breakdown);
          const key = topKeys.has(rawKey) ? rawKey : "__other__";
          const label = topKeys.has(rawKey) ? rawLabel : "Other";
          const existingSegment = bar.segments.get(key) ?? {
            key,
            label,
            totalValue: 0,
            records: 0,
          };
          existingSegment.totalValue += event.amountValue;
          existingSegment.records += 1;
          bar.totalValue += event.amountValue;
          bar.records += 1;
          bar.segments.set(key, existingSegment);

          const legendSegment = legend.get(key) ?? {
            key,
            label,
            totalValue: 0,
            records: 0,
          };
          legendSegment.totalValue += event.amountValue;
          legendSegment.records += 1;
          legend.set(key, legendSegment);
        }

        const finalizedBars: DashboardWalletSpendBar[] = bucketStarts.map((startAtMs) => {
          const bar = bars.get(String(startAtMs));
          const segments = [...(bar?.segments.values() ?? [])].sort(
            (left, right) => right.totalValue - left.totalValue,
          );
          return {
            key: String(startAtMs),
            label: formatWalletSpendBucketLabel(startAtMs, granularity, interpretation),
            startAtMs,
            endAtMs: bar?.endAtMs ?? startAtMs,
            totalValue: bar?.totalValue ?? 0,
            records: bar?.records ?? 0,
            segments,
          };
        });

        charts.push({
          granularity,
          breakdown,
          currency,
          totalValue: currencyEvents.reduce((sum, event) => sum + event.amountValue, 0),
          totalRecords: currencyEvents.length,
          maxBarValue: Math.max(...finalizedBars.map((bar) => bar.totalValue), 0),
          bars: finalizedBars,
          legend: [...legend.values()].sort((left, right) => right.totalValue - left.totalValue),
        });
      }
    }
  }

  return {
    records: expenses.length,
    lastRecordedAtMs: Math.max(...expenses.map((event) => event.completedAtMs)),
    currencies: [...groupedByCurrency.keys()].sort(),
    charts,
    note:
      fallbackDateCount > 0
        ? `${String(fallbackDateCount)} receipt(s) use the recorded day because the receipt date could not be parsed.`
        : undefined,
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
  const telephonyCard =
    resolveTelephonyWalletRoute(config) === "vapi"
      ? collectVapiCard({
          calls: callValues,
          startMs: params.startMs,
          endMs: params.endMs,
          nowMs,
        })
      : collectTwilioCard({
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
  const supplementalCards = [deepgramRealtime, deepgramAudio, elevenlabs].filter(
    hasWalletCardActivity,
  );

  return {
    generatedAtMs: nowMs,
    startDate: formatDateYmd(params.startMs, params.interpretation),
    endDate: formatDateYmd(params.endMs, params.interpretation),
    cards: [llm, telephonyCard, ...supplementalCards],
    spending: buildWalletSpendCharts({
      events,
      startMs: params.startMs,
      endMs: params.endMs,
      interpretation: params.interpretation,
    }),
  };
}

export const __test = {
  clipDurationMs,
  overlapsRange,
  resolveVoiceCallStorePath,
  resolveTelephonyWalletRoute,
  readLatestVoiceCallSnapshots,
  collectTwilioCard,
  collectVapiCard,
  collectDeepgramRealtimeCard,
  collectDeepgramAudioCard,
  collectElevenLabsCard,
};

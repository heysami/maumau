import fs from "node:fs/promises";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";

export type WalletEvent =
  | {
      kind: "deepgram-audio";
      completedAtMs: number;
      provider: "deepgram";
      durationMs?: number;
    }
  | {
      kind: "elevenlabs";
      completedAtMs: number;
      provider: "elevenlabs";
      characters: number;
      mode: "standard" | "telephony";
    }
  | {
      kind: "expense";
      completedAtMs: number;
      source: "email_receipt";
      fingerprint: string;
      merchant: string;
      category: string;
      currency: string;
      amountValue: number;
      occurredAtMs?: number;
      subject?: string;
      dateText?: string;
    };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseWalletEvent(value: unknown): WalletEvent | null {
  if (!isObject(value)) {
    return null;
  }
  const completedAtMs = toFiniteNumber(value.completedAtMs);
  if (completedAtMs === undefined) {
    return null;
  }
  if (value.kind === "deepgram-audio" && value.provider === "deepgram") {
    return {
      kind: "deepgram-audio",
      completedAtMs,
      provider: "deepgram",
      durationMs: toFiniteNumber(value.durationMs),
    };
  }
  if (
    value.kind === "elevenlabs" &&
    value.provider === "elevenlabs" &&
    (value.mode === "standard" || value.mode === "telephony")
  ) {
    const characters = toFiniteNumber(value.characters);
    if (characters === undefined) {
      return null;
    }
    return {
      kind: "elevenlabs",
      completedAtMs,
      provider: "elevenlabs",
      characters,
      mode: value.mode,
    };
  }
  if (value.kind === "expense" && value.source === "email_receipt") {
    const fingerprint =
      typeof value.fingerprint === "string" && value.fingerprint.trim()
        ? value.fingerprint.trim()
        : undefined;
    const merchant =
      typeof value.merchant === "string" && value.merchant.trim()
        ? value.merchant.trim()
        : undefined;
    const category =
      typeof value.category === "string" && value.category.trim()
        ? value.category.trim()
        : undefined;
    const currency =
      typeof value.currency === "string" && value.currency.trim()
        ? value.currency.trim()
        : undefined;
    const amountValue = toFiniteNumber(value.amountValue);
    if (!fingerprint || !merchant || !category || !currency || amountValue === undefined) {
      return null;
    }
    return {
      kind: "expense",
      completedAtMs,
      source: "email_receipt",
      fingerprint,
      merchant,
      category,
      currency,
      amountValue,
      occurredAtMs: toFiniteNumber(value.occurredAtMs),
      subject:
        typeof value.subject === "string" && value.subject.trim()
          ? value.subject.trim()
          : undefined,
      dateText:
        typeof value.dateText === "string" && value.dateText.trim()
          ? value.dateText.trim()
          : undefined,
    };
  }
  return null;
}

export function resolveWalletEventsPath(stateDir = resolveStateDir()): string {
  return path.join(stateDir, "usage", "wallet-events.jsonl");
}

export async function appendWalletEvent(event: WalletEvent, stateDir = resolveStateDir()) {
  try {
    const filePath = resolveWalletEventsPath(stateDir);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.appendFile(filePath, `${JSON.stringify(event)}\n`, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[wallet-events] Failed to persist wallet event: ${message}`);
  }
}

export async function readWalletEvents(stateDir = resolveStateDir()): Promise<WalletEvent[]> {
  const filePath = resolveWalletEventsPath(stateDir);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return parseWalletEvent(JSON.parse(line));
        } catch {
          return null;
        }
      })
      .filter((event): event is WalletEvent => event !== null);
  } catch {
    return [];
  }
}

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../infra/session-cost-usage.js", () => ({
  discoverAllSessions: vi.fn(),
  loadCostUsageSummary: vi.fn(),
  loadSessionCostSummary: vi.fn(),
}));

import {
  discoverAllSessions,
  loadCostUsageSummary,
  loadSessionCostSummary,
} from "../infra/session-cost-usage.js";
import { appendWalletEvent } from "../infra/wallet-events.js";
import { collectDashboardWallet } from "./dashboard-wallet.js";

describe("collectDashboardWallet", () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-wallet-"));
    vi.clearAllMocks();
    vi.mocked(loadCostUsageSummary).mockResolvedValue({
      updatedAt: Date.now(),
      startDate: "2026-03-01",
      endDate: "2026-03-30",
      daily: [],
      totals: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 4_500,
        totalCost: 12.5,
        inputCost: 0,
        outputCost: 0,
        cacheReadCost: 0,
        cacheWriteCost: 0,
        missingCostEntries: 0,
      },
    } as never);
    vi.mocked(discoverAllSessions).mockResolvedValue([
      {
        sessionId: "session-1",
        sessionFile: path.join(tempRoot, "session-1.jsonl"),
        mtime: 1,
      },
    ] as never);
    vi.mocked(loadSessionCostSummary).mockResolvedValue({
      modelUsage: [
        {
          count: 3,
          totals: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            totalCost: 0,
            inputCost: 0,
            outputCost: 0,
            cacheReadCost: 0,
            cacheWriteCost: 0,
            missingCostEntries: 0,
          },
        },
      ],
    } as never);
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("aggregates llm, twilio, deepgram, and elevenlabs wallet cards", async () => {
    const voiceCallStore = path.join(tempRoot, "voice-calls");
    await fs.mkdir(voiceCallStore, { recursive: true });
    await fs.writeFile(
      path.join(voiceCallStore, "calls.jsonl"),
      [
        JSON.stringify({
          callId: "call-1",
          provider: "twilio",
          startedAt: 500,
          answeredAt: 600,
          endedAt: 1200,
        }),
        JSON.stringify({
          callId: "call-1",
          provider: "twilio",
          startedAt: 500,
          answeredAt: 1500,
          endedAt: 4500,
          metadata: {
            walletRealtimeStt: {
              sessions: [
                {
                  provider: "deepgram-realtime",
                  streamSid: "stream-1",
                  startedAt: 2000,
                  endedAt: 2600,
                  durationMs: 600,
                },
              ],
              activeSession: {
                provider: "deepgram-realtime",
                streamSid: "stream-2",
                startedAt: 4000,
              },
            },
          },
        }),
        JSON.stringify({
          callId: "call-2",
          provider: "twilio",
          startedAt: 4800,
          endedAt: 5200,
        }),
      ].join("\n"),
      "utf8",
    );

    await appendWalletEvent(
      {
        kind: "deepgram-audio",
        completedAtMs: 3000,
        provider: "deepgram",
        durationMs: 90_000,
      },
      tempRoot,
    );
    await appendWalletEvent(
      {
        kind: "deepgram-audio",
        completedAtMs: 3200,
        provider: "deepgram",
      },
      tempRoot,
    );
    await appendWalletEvent(
      {
        kind: "elevenlabs",
        completedAtMs: 3500,
        provider: "elevenlabs",
        characters: 123,
        mode: "standard",
      },
      tempRoot,
    );
    await appendWalletEvent(
      {
        kind: "elevenlabs",
        completedAtMs: 3600,
        provider: "elevenlabs",
        characters: 10,
        mode: "telephony",
      },
      tempRoot,
    );

    const result = await collectDashboardWallet({
      cfg: {
        plugins: {
          entries: {
            "voice-call": {
              config: {
                store: voiceCallStore,
              },
            },
          },
        },
      } as never,
      startMs: 1000,
      endMs: 5000,
      nowMs: 5000,
      stateDir: tempRoot,
    });

    expect(result.startDate).toBe("1970-01-01");
    expect(result.endDate).toBe("1970-01-01");
    expect(result.cards).toEqual([
      expect.objectContaining({
        id: "llm",
        records: 3,
        totalValue: 12.5,
        secondaryValue: 4_500,
        coverage: "full",
      }),
      expect.objectContaining({
        id: "twilio",
        records: 2,
        totalValue: 3000,
        measurement: "derived",
        coverage: "full",
      }),
      expect.objectContaining({
        id: "deepgram-realtime",
        records: 2,
        totalValue: 1100,
        coverage: "partial",
      }),
      expect.objectContaining({
        id: "deepgram-audio",
        records: 2,
        totalValue: 90_000,
        missingTotals: 1,
        coverage: "partial",
      }),
      expect.objectContaining({
        id: "elevenlabs",
        records: 2,
        totalValue: 133,
        coverage: "partial",
      }),
    ]);
  });
});

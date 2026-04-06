import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../dashboard-wallet.js", () => ({
  collectDashboardWallet: vi.fn().mockResolvedValue({
    generatedAtMs: 1,
    startDate: "2026-03-08",
    endDate: "2026-04-06",
    cards: [],
  }),
}));

import { collectDashboardWallet } from "../dashboard-wallet.js";
import { dashboardHandlers } from "./dashboard.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function createHandlerOptions(params: Record<string, unknown> = {}) {
  return {
    req: {} as never,
    params,
    client: null,
    isWebchatConnect: () => false,
    respond: vi.fn(),
    context: {} as never,
  };
}

describe("dashboard.wallet handler", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("defaults to the last 30 days in UTC when no explicit range is provided", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-06T12:00:00.000Z"));
    const options = createHandlerOptions();

    await dashboardHandlers["dashboard.wallet"](options);

    expect(collectDashboardWallet).toHaveBeenCalledWith({
      startMs: Date.UTC(2026, 2, 8),
      endMs: Date.UTC(2026, 3, 6) + DAY_MS - 1,
      interpretation: { mode: "utc" },
    });
    expect(options.respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        startDate: "2026-03-08",
        endDate: "2026-04-06",
      }),
      undefined,
    );
  });

  it("passes specific UTC offset interpretation through to wallet collection", async () => {
    const options = createHandlerOptions({
      startDate: "2026-03-01",
      endDate: "2026-03-02",
      mode: "specific",
      utcOffset: "UTC+8",
    });

    await dashboardHandlers["dashboard.wallet"](options);

    expect(collectDashboardWallet).toHaveBeenCalledWith({
      startMs: Date.UTC(2026, 2, 1) - 8 * 60 * 60 * 1000,
      endMs: Date.UTC(2026, 2, 2) - 8 * 60 * 60 * 1000 + DAY_MS - 1,
      interpretation: { mode: "specific", utcOffsetMinutes: 480 },
    });
  });
});

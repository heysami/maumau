import { beforeEach, describe, expect, it, vi } from "vitest";
import { runGmailReceiptDigest } from "./browser-tool.receipts.js";

const listSessionCapabilities = vi.fn();

function createBrowserDeps() {
  return {
    browserAct: vi.fn(async () => ({ ok: true })),
    browserNavigate: vi.fn(async () => ({ ok: true })),
    browserOpenTab: vi.fn(async () => ({ targetId: "tab-1" })),
    browserStart: vi.fn(async () => ({ ok: true })),
    browserStatus: vi.fn(async () => ({ running: true })),
    browserTabs: vi.fn(async () => []),
  };
}

describe("runGmailReceiptDigest", () => {
  beforeEach(() => {
    listSessionCapabilities.mockReset();
  });

  it("uses the existing-session browser lane when it is ready", async () => {
    listSessionCapabilities.mockResolvedValueOnce([
      {
        id: "browser-existing-session",
        kind: "browser",
        declared: true,
        exposedToSession: true,
        installed: true,
        ready: true,
      },
    ]);
    const deps = createBrowserDeps();
    deps.browserAct.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({
      result: {
        state: "ready",
        items: [
          {
            merchant: "Netflix",
            amount: "US$12.99",
            subject: "Netflix receipt",
            snippet: "Monthly subscription",
          },
        ],
      },
    });

    const result = await runGmailReceiptDigest({
      cfg: {},
      baseUrl: undefined,
      deps,
      capabilityOpts: {
        senderIsOwner: true,
      },
      listSessionCapabilities,
    });

    expect(result.capabilityId).toBe("browser-existing-session");
    expect(result.capabilityPathUsed).toBe("Browser existing-session");
    expect(result.usedFallback).toBe(false);
    expect(result.items).toEqual([
      expect.objectContaining({
        merchant: "Netflix",
        amount: "US$12.99",
        category: "software",
      }),
    ]);
    expect(result.totalsByCurrency).toEqual({ USD: 12.99 });
    expect(deps.browserStatus).toHaveBeenCalledWith(undefined, { profile: "user" });
    expect(deps.browserOpenTab).toHaveBeenCalledWith(
      undefined,
      expect.stringContaining("https://mail.google.com/mail/u/0/#search/"),
      { profile: "user" },
    );
  });

  it("falls back to the clawd cursor lane when the existing-session browser is insufficient", async () => {
    listSessionCapabilities.mockResolvedValueOnce([
      {
        id: "browser-existing-session",
        kind: "browser",
        declared: true,
        exposedToSession: true,
        installed: true,
        ready: true,
      },
      {
        id: "clawd-cursor",
        kind: "desktop",
        declared: true,
        exposedToSession: true,
        installed: true,
        ready: true,
      },
    ]);
    const deps = createBrowserDeps();
    deps.browserOpenTab
      .mockResolvedValueOnce({ targetId: "tab-user" })
      .mockResolvedValueOnce({ targetId: "tab-clawd" });
    deps.browserAct
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        result: {
          state: "sign_in_required",
          items: [],
        },
      })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        result: {
          state: "ready",
          items: [
            {
              merchant: "Amazon",
              amount: "$42.50",
              subject: "Your Amazon.com order",
              snippet: "Order total",
            },
          ],
        },
      });

    const result = await runGmailReceiptDigest({
      cfg: {
        browser: {
          profiles: {
            desktop: {
              driver: "clawd",
            },
          },
        },
      },
      baseUrl: undefined,
      deps,
      capabilityOpts: {
        senderIsOwner: true,
      },
      listSessionCapabilities,
    });

    expect(result.capabilityId).toBe("clawd-cursor");
    expect(result.capabilityPathUsed).toBe("Clawd Cursor desktop control");
    expect(result.usedFallback).toBe(true);
    expect(result.fallbackReason).toContain("signed-in Gmail view");
    expect(deps.browserStatus).toHaveBeenNthCalledWith(1, undefined, { profile: "user" });
    expect(deps.browserStatus).toHaveBeenNthCalledWith(2, undefined, { profile: "desktop" });
    expect(deps.browserOpenTab).toHaveBeenNthCalledWith(
      2,
      undefined,
      expect.stringContaining("https://mail.google.com/mail/u/0/#search/"),
      { profile: "desktop" },
    );
  });

  it("fails with a precise readiness fix when neither lane is ready", async () => {
    listSessionCapabilities.mockResolvedValueOnce([
      {
        id: "browser-existing-session",
        kind: "browser",
        declared: true,
        exposedToSession: true,
        installed: true,
        ready: false,
        blockedReason: "doctor_failed",
        suggestedFix: "Reconnect Chrome MCP to the signed-in browser session.",
      },
      {
        id: "clawd-cursor",
        kind: "desktop",
        declared: true,
        exposedToSession: true,
        installed: true,
        ready: false,
        blockedReason: "not_configured",
        suggestedFix: 'Configure a browser profile with driver "clawd" for this fallback lane.',
      },
    ]);

    await expect(
      runGmailReceiptDigest({
        cfg: {},
        baseUrl: undefined,
        deps: createBrowserDeps(),
        capabilityOpts: {
          senderIsOwner: true,
        },
        listSessionCapabilities,
      }),
    ).rejects.toThrow(
      "Browser existing-session is not ready (doctor_failed). Reconnect Chrome MCP to the signed-in browser session.",
    );
  });
});

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { BrowserActionTabResult, BrowserActResponse } from "../../browser/client-actions.js";
import type { BrowserStatus, BrowserTab } from "../../browser/client.js";
import { readWalletEvents } from "../../infra/wallet-events.js";
import { runGmailReceiptDigest } from "./browser-tool.receipts.js";

function createBrowserDeps(): Parameters<typeof runGmailReceiptDigest>[0]["deps"] {
  return {
    browserAct: vi.fn(async (): Promise<BrowserActResponse> => ({ ok: true, targetId: "tab-1" })),
    browserNavigate: vi.fn(
      async (): Promise<BrowserActionTabResult> => ({ ok: true, targetId: "tab-1" }),
    ),
    browserOpenTab: vi.fn(
      async (): Promise<BrowserTab> => ({
        targetId: "tab-1",
        title: "Gmail",
        url: "https://mail.google.com",
      }),
    ),
    browserStart: vi.fn(async (): Promise<void> => {}),
    browserStatus: vi.fn(
      async (): Promise<BrowserStatus> => ({
        enabled: true,
        running: true,
        pid: 1,
        cdpPort: 9333,
        cdpUrl: "http://127.0.0.1:9333",
        chosenBrowser: "Chrome",
        userDataDir: "/tmp/maumau-browser",
        color: "#336699",
        headless: false,
        attachOnly: false,
      }),
    ),
    browserTabs: vi.fn(async () => []),
  };
}

function createBrowserConfigWithDesktopProfile() {
  return {
    browser: {
      profiles: {
        desktop: {
          cdpPort: 9333,
          color: "#336699",
          driver: "clawd" as const,
        },
      },
    },
  };
}

function createBrowserConfigWithRemoteProfile() {
  return {
    browser: {
      defaultProfile: "remote",
      profiles: {
        remote: {
          cdpUrl: "http://10.0.0.25:9222",
          color: "#884422",
        },
      },
    },
  };
}

describe("runGmailReceiptDigest", () => {
  it("uses the configured default local profile when profile is omitted", async () => {
    const deps = createBrowserDeps();
    vi.mocked(deps.browserAct)
      .mockResolvedValueOnce({ ok: true, targetId: "tab-1" })
      .mockResolvedValueOnce({
        ok: true,
        targetId: "tab-1",
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
    });

    expect(result.capabilityId).toBe("browser-profile:maumau");
    expect(result.capabilityPathUsed).toBe('Browser profile "maumau"');
    expect(result.usedFallback).toBe(false);
    expect(result.items).toEqual([
      expect.objectContaining({
        merchant: "Netflix",
        amount: "US$12.99",
        category: "software",
      }),
    ]);
    expect(result.totalsByCurrency).toEqual({ USD: 12.99 });
    expect(deps.browserStatus).toHaveBeenCalledWith(undefined, { profile: "maumau" });
    expect(deps.browserOpenTab).toHaveBeenCalledWith(
      undefined,
      expect.stringContaining("https://mail.google.com/mail/u/0/#search/"),
      { profile: "maumau" },
    );
  });

  it("uses an explicitly requested existing-session profile", async () => {
    const deps = createBrowserDeps();
    vi.mocked(deps.browserAct)
      .mockResolvedValueOnce({ ok: true, targetId: "tab-1" })
      .mockResolvedValueOnce({
        ok: true,
        targetId: "tab-1",
        result: {
          state: "ready",
          items: [
            {
              merchant: "Apple",
              amount: "$9.99",
              subject: "Apple receipt",
              snippet: "Subscription renewal",
            },
          ],
        },
      });

    const result = await runGmailReceiptDigest({
      cfg: {},
      baseUrl: undefined,
      deps,
      profile: "user",
    });

    expect(result.capabilityId).toBe("browser-profile:user");
    expect(result.capabilityPathUsed).toBe('Browser profile "user" (existing-session)');
    expect(result.usedFallback).toBe(false);
    expect(deps.browserOpenTab).toHaveBeenCalledWith(
      undefined,
      expect.stringContaining("https://mail.google.com/mail/u/0/#search/"),
      { profile: "user" },
    );
  });

  it("uses an explicitly requested configured local profile", async () => {
    const deps = createBrowserDeps();
    vi.mocked(deps.browserAct)
      .mockResolvedValueOnce({ ok: true, targetId: "tab-1" })
      .mockResolvedValueOnce({
        ok: true,
        targetId: "tab-1",
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
      cfg: createBrowserConfigWithDesktopProfile(),
      baseUrl: undefined,
      deps,
      profile: "desktop",
    });

    expect(result.capabilityId).toBe("browser-profile:desktop");
    expect(result.capabilityPathUsed).toBe('Browser profile "desktop"');
    expect(result.usedFallback).toBe(false);
    expect(deps.browserStatus).toHaveBeenCalledWith(undefined, { profile: "desktop" });
    expect(deps.browserOpenTab).toHaveBeenCalledWith(
      undefined,
      expect.stringContaining("https://mail.google.com/mail/u/0/#search/"),
      { profile: "desktop" },
    );
  });

  it("fails with the selected profile error when that profile is unavailable", async () => {
    const deps = createBrowserDeps();
    vi.mocked(deps.browserStatus).mockRejectedValueOnce(new Error("Chrome MCP unavailable"));

    await expect(
      runGmailReceiptDigest({
        cfg: {},
        baseUrl: undefined,
        deps,
        profile: "user",
      }),
    ).rejects.toThrow(
      'Browser profile "user" (existing-session) was unavailable. Chrome MCP unavailable',
    );
  });

  it("rejects remote profiles for receipt_digest", async () => {
    const deps = createBrowserDeps();

    await expect(
      runGmailReceiptDigest({
        cfg: createBrowserConfigWithRemoteProfile(),
        baseUrl: undefined,
        deps,
      }),
    ).rejects.toThrow(
      'receipt_digest requires a local host browser profile. Profile "remote" is remote.',
    );
  });

  it("can persist normalized receipt entries into wallet history", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "maumau-wallet-events-"));
    const originalStateDir = process.env.MAUMAU_STATE_DIR;
    const deps = createBrowserDeps();
    vi.mocked(deps.browserAct)
      .mockResolvedValueOnce({ ok: true, targetId: "tab-1" })
      .mockResolvedValueOnce({
        ok: true,
        targetId: "tab-1",
        result: {
          state: "ready",
          items: [
            {
              merchant: "Netflix",
              amount: "US$12.99",
              subject: "Netflix receipt",
              snippet: "Monthly subscription",
              dateText: "Apr 10",
            },
            {
              merchant: "Unknown",
              subject: "Missing amount",
            },
          ],
        },
      });

    process.env.MAUMAU_STATE_DIR = stateDir;

    try {
      const result = await runGmailReceiptDigest({
        cfg: {},
        baseUrl: undefined,
        deps,
        persistToWallet: true,
      });

      expect(result.persistedToWallet).toEqual({
        candidates: 1,
        recorded: 1,
      });
      await expect(readWalletEvents(stateDir)).resolves.toEqual([
        expect.objectContaining({
          kind: "expense",
          source: "email_receipt",
          merchant: "Netflix",
          category: "software",
          currency: "USD",
          amountValue: 12.99,
        }),
      ]);
    } finally {
      if (originalStateDir === undefined) {
        delete process.env.MAUMAU_STATE_DIR;
      } else {
        process.env.MAUMAU_STATE_DIR = originalStateDir;
      }
      await fs.rm(stateDir, { recursive: true, force: true });
    }
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { loginMiniMaxPortalOAuth } from "./oauth.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function requestFormValue(init: RequestInit | undefined, key: string): string | null {
  const body = init?.body;
  if (typeof body !== "string") {
    return null;
  }
  return new URLSearchParams(body).get(key);
}

describe("loginMiniMaxPortalOAuth", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a manual approval note when browser open returns false", async () => {
    const progress = { update: vi.fn(), stop: vi.fn() };
    const note = vi.fn(async () => {});
    const openUrl = vi.fn(async () => false);
    const expiresAt = Date.now() + 60_000;
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const state = requestFormValue(init, "state");
      if (state) {
        return jsonResponse({
          user_code: "ABCD-1234",
          verification_uri: "https://platform.minimax.io/verify",
          expired_in: expiresAt,
          interval: 2000,
          state,
        });
      }
      return jsonResponse({
        status: "success",
        access_token: "access-token",
        refresh_token: "refresh-token",
        expired_in: 3600,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await loginMiniMaxPortalOAuth({
      openUrl,
      note,
      progress,
      region: "global",
    });

    expect(result.access).toBe("access-token");
    expect(openUrl).toHaveBeenCalledWith("https://platform.minimax.io/verify");
    expect(
      note.mock.calls.some(
        (call) =>
          call[1] === "MiniMax OAuth" &&
          String(call[0]).includes("Browser did not open automatically.") &&
          String(call[0]).includes("https://platform.minimax.io/verify") &&
          String(call[0]).includes("ABCD-1234"),
      ),
    ).toBe(true);
    expect(progress.update).toHaveBeenCalledWith("Waiting for MiniMax OAuth approval…");
  });

  it("shows a manual approval note when browser open throws", async () => {
    const progress = { update: vi.fn(), stop: vi.fn() };
    const note = vi.fn(async () => {});
    const openUrl = vi.fn(async () => {
      throw new Error("browser blocked");
    });
    const expiresAt = Date.now() + 60_000;
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const state = requestFormValue(init, "state");
      if (state) {
        return jsonResponse({
          user_code: "WXYZ-9876",
          verification_uri: "https://platform.minimax.io/verify",
          expired_in: expiresAt,
          interval: 2000,
          state,
        });
      }
      return jsonResponse({
        status: "success",
        access_token: "access-token",
        refresh_token: "refresh-token",
        expired_in: 3600,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await loginMiniMaxPortalOAuth({
      openUrl,
      note,
      progress,
      region: "global",
    });

    expect(result.refresh).toBe("refresh-token");
    expect(
      note.mock.calls.some(
        (call) =>
          call[1] === "MiniMax OAuth" &&
          String(call[0]).includes("Browser did not open automatically.") &&
          String(call[0]).includes("WXYZ-9876"),
      ),
    ).toBe(true);
    expect(progress.update).toHaveBeenCalledWith("Waiting for MiniMax OAuth approval…");
  });
});

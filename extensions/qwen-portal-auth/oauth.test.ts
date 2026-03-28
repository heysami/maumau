import { afterEach, describe, expect, it, vi } from "vitest";
import { loginQwenPortalOAuth } from "./oauth.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("loginQwenPortalOAuth", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a manual approval note when browser open returns false", async () => {
    const progress = { update: vi.fn(), stop: vi.fn() };
    const note = vi.fn(async (_message: string, _title?: string) => {});
    const openUrl = vi.fn(async () => false);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          device_code: "device-code",
          user_code: "QWEN-1234",
          verification_uri: "https://chat.qwen.ai/device",
          verification_uri_complete: "https://chat.qwen.ai/device?user_code=QWEN-1234",
          expires_in: 60,
          interval: 2,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "access-token",
          refresh_token: "refresh-token",
          expires_in: 3600,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await loginQwenPortalOAuth({
      openUrl,
      note,
      progress,
    });

    expect(result.access).toBe("access-token");
    expect(openUrl).toHaveBeenCalledWith("https://chat.qwen.ai/device?user_code=QWEN-1234");
    expect(
      note.mock.calls.some(
        (call) =>
          call[1] === "Qwen OAuth" &&
          String(call[0]).includes("Browser did not open automatically.") &&
          String(call[0]).includes("https://chat.qwen.ai/device?user_code=QWEN-1234") &&
          String(call[0]).includes("QWEN-1234"),
      ),
    ).toBe(true);
    expect(progress.update).toHaveBeenCalledWith("Waiting for Qwen OAuth approval…");
  });

  it("shows a manual approval note when browser open throws", async () => {
    const progress = { update: vi.fn(), stop: vi.fn() };
    const note = vi.fn(async (_message: string, _title?: string) => {});
    const openUrl = vi.fn(async () => {
      throw new Error("browser blocked");
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          device_code: "device-code",
          user_code: "QWEN-5678",
          verification_uri: "https://chat.qwen.ai/device",
          expires_in: 60,
          interval: 2,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "access-token",
          refresh_token: "refresh-token",
          expires_in: 3600,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await loginQwenPortalOAuth({
      openUrl,
      note,
      progress,
    });

    expect(result.refresh).toBe("refresh-token");
    expect(
      note.mock.calls.some(
        (call) =>
          call[1] === "Qwen OAuth" &&
          String(call[0]).includes("Browser did not open automatically.") &&
          String(call[0]).includes("QWEN-5678"),
      ),
    ).toBe(true);
    expect(progress.update).toHaveBeenCalledWith("Waiting for Qwen OAuth approval…");
  });
});

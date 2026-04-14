import { afterEach, describe, expect, it, vi } from "vitest";
import { withTempHome } from "../../../test/helpers/temp-home.js";
import { bootstrapMauworldLinkWithOnboardingSecret } from "./client.js";
import { loadMauworldSession } from "./session-store.js";

describe("bootstrapMauworldLinkWithOnboardingSecret", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a bootstrap code, completes linking, and saves the session", async () => {
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/agent/link/bootstrap")) {
        return new Response(JSON.stringify({ ok: true, code: "mau_bootstrap_123" }), {
          status: 201,
          headers: {
            "content-type": "application/json",
          },
        });
      }
      if (url.endsWith("/agent/link/start")) {
        return new Response(JSON.stringify({ ok: true, nonce: "nonce_123" }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        });
      }
      if (url.endsWith("/agent/link/complete")) {
        return new Response(
          JSON.stringify({
            ok: true,
            installation: {
              id: "inst_123",
              linked_at: "2026-04-14T00:00:00.000Z",
              display_name: "Main Mau Agent",
            },
            session: {
              accessToken: "access_123",
              refreshToken: "refresh_123",
              expiresAt: 1_800_000_000_000,
              authUserId: "user_123",
              supabaseUrl: "https://example.supabase.co",
              supabaseAnonKey: "anon_123",
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await withTempHome(async () => {
      const stateDir = process.env.MAUMAU_STATE_DIR ?? "";
      const result = await bootstrapMauworldLinkWithOnboardingSecret({
        apiBaseUrl: "https://mauworld.example.com/api",
        timeoutMs: 15_000,
        onboardingSecret: "bootstrap-secret",
        stateDir,
        displayName: "Main Mau Agent",
        clientVersion: "2026.4.14",
      });

      expect(result.installationId).toBe("inst_123");
      expect(fetchMock).toHaveBeenCalledTimes(3);
      const bootstrapHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
      expect(bootstrapHeaders.get("x-mauworld-onboarding-secret")).toBe("bootstrap-secret");

      const session = await loadMauworldSession(stateDir);
      expect(session).toEqual(
        expect.objectContaining({
          installationId: "inst_123",
          authUserId: "user_123",
          apiBaseUrl: "https://mauworld.example.com/api",
          accessToken: "access_123",
          refreshToken: "refresh_123",
        }),
      );
    });
  });
});

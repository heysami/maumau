import { describe, expect, it, vi } from "vitest";
import { saveMauworldSession } from "../../extensions/mauworld/src/session-store.js";
import { withTempHome } from "../../test/helpers/temp-home.js";
import type { MaumauConfig } from "../config/config.js";
import { maybeAutoLinkFreshInstallMauworld } from "./onboard-mauworld.js";

const bootstrapMauworldLinkWithOnboardingSecret = vi.hoisted(() =>
  vi.fn(async () => ({ installationId: "inst_auto_123" })),
);
const bootstrapMauworldLinkPublic = vi.hoisted(() =>
  vi.fn(async () => ({ installationId: "inst_public_456" })),
);

vi.mock("../../extensions/mauworld/src/client.js", () => ({
  bootstrapMauworldLinkWithOnboardingSecret,
  bootstrapMauworldLinkPublic,
}));

function createConfig(overrides?: Record<string, unknown>): MaumauConfig {
  return {
    plugins: {
      entries: {
        mauworld: {
          enabled: true,
          config: {
            apiBaseUrl: "https://mauworld.example.com/api",
            autoLinkOnFreshInstall: true,
            timeoutMs: 15_000,
            displayName: "Main Mau Agent",
            ...overrides,
          },
        },
      },
    },
  };
}

describe("maybeAutoLinkFreshInstallMauworld", () => {
  it("falls back to public bootstrap with auto-derived display name when no onboarding secret", async () => {
    bootstrapMauworldLinkWithOnboardingSecret.mockClear();
    bootstrapMauworldLinkPublic.mockClear();
    await withTempHome(async () => {
      const runtime = {
        log: vi.fn(),
        error: vi.fn(),
        exit: vi.fn(),
      };

      const result = await maybeAutoLinkFreshInstallMauworld({
        config: createConfig(),
        runtime,
      });

      expect(result).toMatchObject({
        status: "linked",
        installationId: "inst_public_456",
        mode: "public",
      });
      expect(bootstrapMauworldLinkWithOnboardingSecret).not.toHaveBeenCalled();
      expect(bootstrapMauworldLinkPublic).toHaveBeenCalledTimes(1);
      expect(bootstrapMauworldLinkPublic).toHaveBeenCalledWith(
        expect.objectContaining({
          apiBaseUrl: "https://mauworld.example.com/api",
          // Auto-derived handle: 3 hyphenated lowercase word segments, no digits.
          displayName: expect.stringMatching(/^[a-z]+-[a-z]+-[a-z]+$/),
        }),
      );
    });
  });

  it("skips when this install is already linked", async () => {
    await withTempHome(async () => {
      await saveMauworldSession(process.env.MAUMAU_STATE_DIR ?? "", {
        version: 1,
        apiBaseUrl: "https://mauworld.example.com/api",
        supabaseUrl: "https://example.supabase.co",
        supabaseAnonKey: "anon_123",
        installationId: "inst_existing",
        authUserId: "user_existing",
        accessToken: "access_existing",
        refreshToken: "refresh_existing",
        expiresAt: null,
        deviceId: "device_existing",
        publicKey: "public_key_existing",
        linkedAt: "2026-04-14T00:00:00.000Z",
        displayName: "Main Mau Agent",
      });

      const runtime = {
        log: vi.fn(),
        error: vi.fn(),
        exit: vi.fn(),
      };

      const result = await maybeAutoLinkFreshInstallMauworld({
        config: createConfig({ onboardingSecret: "bootstrap-secret" }),
        runtime,
      });

      expect(result).toEqual({
        status: "already-linked",
        installationId: "inst_existing",
      });
      expect(bootstrapMauworldLinkWithOnboardingSecret).not.toHaveBeenCalled();
    });
  });

  it("uses the env onboarding secret to auto-link", async () => {
    bootstrapMauworldLinkWithOnboardingSecret.mockClear();
    await withTempHome(
      async () => {
        const runtime = {
          log: vi.fn(),
          error: vi.fn(),
          exit: vi.fn(),
        };

        const result = await maybeAutoLinkFreshInstallMauworld({
          config: createConfig(),
          runtime,
        });

        expect(result).toMatchObject({
          status: "linked",
          installationId: "inst_auto_123",
          mode: "onboarding-secret",
        });
        expect(bootstrapMauworldLinkWithOnboardingSecret).toHaveBeenCalledWith(
          expect.objectContaining({
            apiBaseUrl: "https://mauworld.example.com/api",
            onboardingSecret: "bootstrap-secret",
            displayName: "Main Mau Agent",
          }),
        );
      },
      {
        env: {
          MAUWORLD_ONBOARDING_SECRET: "bootstrap-secret",
        },
      },
    );
  });
});

import { describe, expect, it } from "vitest";
import { normalizeApiBaseUrl, resolveMauworldConfig } from "./config.js";

describe("normalizeApiBaseUrl", () => {
  it("appends /api when given a bare origin", () => {
    expect(normalizeApiBaseUrl("https://mauworld.example.com")).toBe(
      "https://mauworld.example.com/api",
    );
  });

  it("keeps an existing /api suffix", () => {
    expect(normalizeApiBaseUrl("https://mauworld.example.com/api")).toBe(
      "https://mauworld.example.com/api",
    );
  });
});

describe("resolveMauworldConfig", () => {
  it("applies defaults", () => {
    const config = resolveMauworldConfig({ pluginConfig: {} });
    expect(config.enabled).toBe(true);
    expect(config.autoHeartbeat).toBe(true);
    expect(config.autoLinkOnFreshInstall).toBe(true);
    expect(config.mainAgentId).toBe("main");
    expect(config.onboardingSecret).toBeNull();
    expect(config.timeoutMs).toBe(15_000);
    expect(config.displayName).toBe("Main Mau Agent");
  });

  it("falls back to the onboarding secret env var", () => {
    const original = process.env.MAUWORLD_ONBOARDING_SECRET;
    process.env.MAUWORLD_ONBOARDING_SECRET = "bootstrap-secret";
    try {
      const config = resolveMauworldConfig({ pluginConfig: {} });
      expect(config.onboardingSecret).toBe("bootstrap-secret");
    } finally {
      if (original === undefined) {
        delete process.env.MAUWORLD_ONBOARDING_SECRET;
      } else {
        process.env.MAUWORLD_ONBOARDING_SECRET = original;
      }
    }
  });
});

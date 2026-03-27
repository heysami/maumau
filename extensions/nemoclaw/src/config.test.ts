import { afterEach, describe, expect, it } from "vitest";
import { resolveNemoClawPluginConfig } from "./config.js";

const ENV_VARS = ["NEMOCLAW_BASE_URL", "NEMO_GUARDRAILS_BASE_URL", "NEMO_GUARDRAILS_URL"] as const;

afterEach(() => {
  for (const envVar of ENV_VARS) {
    delete process.env[envVar];
  }
});

describe("resolveNemoClawPluginConfig", () => {
  it("keeps guards dormant by default when no sidecar is configured", () => {
    const config = resolveNemoClawPluginConfig(undefined);

    expect(config.baseUrl).toBe("http://127.0.0.1:8000");
    expect(config.promptGuards).toBe(false);
    expect(config.toolGuards).toBe(false);
    expect(config.outputGuards).toBe(false);
  });

  it("enables guards when baseUrl is configured explicitly", () => {
    const config = resolveNemoClawPluginConfig({
      baseUrl: "http://guardrails.local:9000/",
    });

    expect(config.baseUrl).toBe("http://guardrails.local:9000");
    expect(config.promptGuards).toBe(true);
    expect(config.toolGuards).toBe(true);
    expect(config.outputGuards).toBe(true);
  });

  it("enables guards when the sidecar URL comes from the environment", () => {
    process.env.NEMOCLAW_BASE_URL = "http://env-guardrails.local:7000";

    const config = resolveNemoClawPluginConfig(undefined);

    expect(config.baseUrl).toBe("http://env-guardrails.local:7000");
    expect(config.promptGuards).toBe(true);
    expect(config.toolGuards).toBe(true);
    expect(config.outputGuards).toBe(true);
  });

  it("preserves explicit guard overrides without requiring an endpoint override", () => {
    const config = resolveNemoClawPluginConfig({
      promptGuards: true,
      toolGuards: false,
    });

    expect(config.baseUrl).toBe("http://127.0.0.1:8000");
    expect(config.promptGuards).toBe(true);
    expect(config.toolGuards).toBe(false);
    expect(config.outputGuards).toBe(false);
  });
});

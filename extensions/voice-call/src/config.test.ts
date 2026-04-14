import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  validateProviderConfig,
  normalizeVoiceCallConfig,
  resolveVoiceCallConfig,
  type VoiceCallConfig,
} from "./config.js";
import { createVoiceCallBaseConfig } from "./test-fixtures.js";

function createBaseConfig(provider: "telnyx" | "twilio" | "plivo" | "mock"): VoiceCallConfig {
  return createVoiceCallBaseConfig({ provider });
}

function requireElevenLabsTtsConfig(config: Pick<VoiceCallConfig, "tts">) {
  const tts = config.tts;
  if (!tts?.elevenlabs) {
    throw new Error("voice-call config did not preserve nested elevenlabs TTS config");
  }
  return { tts, elevenlabs: tts.elevenlabs };
}

describe("validateProviderConfig", () => {
  const originalEnv = { ...process.env };
  const clearProviderEnv = () => {
    delete process.env.VAPI_API_KEY;
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TELNYX_API_KEY;
    delete process.env.TELNYX_CONNECTION_ID;
    delete process.env.TELNYX_PUBLIC_KEY;
    delete process.env.PLIVO_AUTH_ID;
    delete process.env.PLIVO_AUTH_TOKEN;
    delete process.env.OPENAI_API_KEY;
    delete process.env.DEEPGRAM_API_KEY;
  };

  beforeEach(() => {
    clearProviderEnv();
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });

  describe("provider credential sources", () => {
    it("passes validation when credentials come from config or environment", () => {
      for (const provider of ["twilio", "telnyx", "plivo"] as const) {
        clearProviderEnv();
        const fromConfig = createBaseConfig(provider);
        if (provider === "twilio") {
          fromConfig.twilio = { accountSid: "AC123", authToken: "secret" };
        } else if (provider === "telnyx") {
          fromConfig.telnyx = {
            apiKey: "KEY123",
            connectionId: "CONN456",
            publicKey: "public-key",
          };
        } else {
          fromConfig.plivo = { authId: "MA123", authToken: "secret" };
        }
        expect(validateProviderConfig(fromConfig)).toMatchObject({ valid: true, errors: [] });

        clearProviderEnv();
        if (provider === "twilio") {
          process.env.TWILIO_ACCOUNT_SID = "AC123";
          process.env.TWILIO_AUTH_TOKEN = "secret";
        } else if (provider === "telnyx") {
          process.env.TELNYX_API_KEY = "KEY123";
          process.env.TELNYX_CONNECTION_ID = "CONN456";
          process.env.TELNYX_PUBLIC_KEY = "public-key";
        } else {
          process.env.PLIVO_AUTH_ID = "MA123";
          process.env.PLIVO_AUTH_TOKEN = "secret";
        }
        const fromEnv = resolveVoiceCallConfig(createBaseConfig(provider));
        expect(validateProviderConfig(fromEnv)).toMatchObject({ valid: true, errors: [] });
      }
    });
  });

  describe("twilio provider", () => {
    it("passes validation with mixed config and env vars", () => {
      process.env.TWILIO_AUTH_TOKEN = "secret";
      let config = createBaseConfig("twilio");
      config.twilio = { accountSid: "AC123" };
      config = resolveVoiceCallConfig(config);

      const result = validateProviderConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("fails validation when required twilio credentials are missing", () => {
      process.env.TWILIO_AUTH_TOKEN = "secret";
      const missingSid = validateProviderConfig(resolveVoiceCallConfig(createBaseConfig("twilio")));
      expect(missingSid.valid).toBe(false);
      expect(missingSid.errors).toContain(
        "plugins.entries.voice-call.config.twilio.accountSid is required (or set TWILIO_ACCOUNT_SID env)",
      );

      delete process.env.TWILIO_AUTH_TOKEN;
      process.env.TWILIO_ACCOUNT_SID = "AC123";
      const missingToken = validateProviderConfig(
        resolveVoiceCallConfig(createBaseConfig("twilio")),
      );
      expect(missingToken.valid).toBe(false);
      expect(missingToken.errors).toContain(
        "plugins.entries.voice-call.config.twilio.authToken is required (or set TWILIO_AUTH_TOKEN env)",
      );
    });
  });

  describe("telnyx provider", () => {
    it("fails validation when apiKey is missing everywhere", () => {
      process.env.TELNYX_CONNECTION_ID = "CONN456";
      let config = createBaseConfig("telnyx");
      config = resolveVoiceCallConfig(config);

      const result = validateProviderConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "plugins.entries.voice-call.config.telnyx.apiKey is required (or set TELNYX_API_KEY env)",
      );
    });

    it("requires a public key unless signature verification is skipped", () => {
      const missingPublicKey = createBaseConfig("telnyx");
      missingPublicKey.inboundPolicy = "allowlist";
      missingPublicKey.telnyx = { apiKey: "KEY123", connectionId: "CONN456" };
      const missingPublicKeyResult = validateProviderConfig(missingPublicKey);
      expect(missingPublicKeyResult.valid).toBe(false);
      expect(missingPublicKeyResult.errors).toContain(
        "plugins.entries.voice-call.config.telnyx.publicKey is required (or set TELNYX_PUBLIC_KEY env)",
      );

      const withPublicKey = createBaseConfig("telnyx");
      withPublicKey.inboundPolicy = "allowlist";
      withPublicKey.telnyx = {
        apiKey: "KEY123",
        connectionId: "CONN456",
        publicKey: "public-key",
      };
      expect(validateProviderConfig(withPublicKey)).toMatchObject({ valid: true, errors: [] });

      const skippedVerification = createBaseConfig("telnyx");
      skippedVerification.skipSignatureVerification = true;
      skippedVerification.telnyx = { apiKey: "KEY123", connectionId: "CONN456" };
      expect(validateProviderConfig(skippedVerification)).toMatchObject({
        valid: true,
        errors: [],
      });
    });
  });

  describe("plivo provider", () => {
    it("fails validation when authId is missing everywhere", () => {
      process.env.PLIVO_AUTH_TOKEN = "secret";
      let config = createBaseConfig("plivo");
      config = resolveVoiceCallConfig(config);

      const result = validateProviderConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "plugins.entries.voice-call.config.plivo.authId is required (or set PLIVO_AUTH_ID env)",
      );
    });
  });

  describe("disabled config", () => {
    it("skips validation when enabled is false", () => {
      const config = createBaseConfig("twilio");
      config.enabled = false;

      const result = validateProviderConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe("vapi mode", () => {
    it("does not inject a direct OpenAI response model override by default", () => {
      const resolved = resolveVoiceCallConfig({
        enabled: true,
        mode: "vapi",
        vapi: {
          apiKey: "vapi-key",
          assistantId: "assistant-1",
          phoneNumberId: "phone-1",
          bridgeMode: "auto",
          bridgeAuthToken: "bridge-secret",
        },
      });

      expect(resolved.responseModel).toBeUndefined();
    });

    it("defaults absent mode to self-hosted for backward compatibility", () => {
      const resolved = resolveVoiceCallConfig({
        enabled: true,
        provider: "twilio",
      });

      expect(resolved.mode).toBe("self-hosted");
    });

    it("resolves the VAPI_API_KEY environment variable and validates the simple path", () => {
      process.env.VAPI_API_KEY = "vapi-env-key";

      const resolved = resolveVoiceCallConfig({
        enabled: true,
        mode: "vapi",
        vapi: {
          assistantId: "assistant-1",
          phoneNumberId: "phone-1",
          bridgeMode: "auto",
          bridgeAuthToken: "bridge-secret",
        },
      });

      expect(resolved.vapi.apiKey).toBe("vapi-env-key");
      expect(validateProviderConfig(resolved)).toMatchObject({ valid: true, errors: [] });
    });

    it("infers auto bridge mode from the legacy private ts.net bridge url", () => {
      const resolved = resolveVoiceCallConfig({
        enabled: true,
        mode: "vapi",
        vapi: {
          apiKey: "vapi-key",
          assistantId: "assistant-1",
          phoneNumberId: "phone-1",
          bridgeUrl: "https://demo.ts.net/plugins/voice-call/vapi",
          bridgeAuthToken: "bridge-secret",
        },
      });

      expect(resolved.vapi.bridgeMode).toBe("auto");
      expect(validateProviderConfig(resolved)).toMatchObject({ valid: true, errors: [] });
    });

    it("requires a bridge url only when manual bridge mode is selected", () => {
      const autoResult = validateProviderConfig(
        resolveVoiceCallConfig({
          enabled: true,
          mode: "vapi",
          vapi: {
            apiKey: "vapi-key",
            assistantId: "assistant-1",
            phoneNumberId: "phone-1",
            bridgeMode: "auto",
            bridgeAuthToken: "bridge-secret",
          },
        }),
      );
      expect(autoResult).toMatchObject({ valid: true, errors: [] });

      const manualResult = validateProviderConfig(
        resolveVoiceCallConfig({
          enabled: true,
          mode: "vapi",
          vapi: {
            apiKey: "vapi-key",
            assistantId: "assistant-1",
            phoneNumberId: "phone-1",
            bridgeMode: "manual-public-url",
            bridgeAuthToken: "bridge-secret",
          },
        }),
      );
      expect(manualResult.valid).toBe(false);
      expect(manualResult.errors).toContain(
        "plugins.entries.voice-call.config.vapi.bridgeUrl is required",
      );
    });

    it("requires the Vapi-specific fields when vapi mode is selected", () => {
      const result = validateProviderConfig(
        resolveVoiceCallConfig({
          enabled: true,
          mode: "vapi",
          vapi: {},
        }),
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "plugins.entries.voice-call.config.vapi.apiKey is required (or set VAPI_API_KEY env)",
      );
      expect(result.errors).toContain(
        "plugins.entries.voice-call.config.vapi.assistantId is required",
      );
      expect(result.errors).toContain(
        "plugins.entries.voice-call.config.vapi.phoneNumberId is required",
      );
      expect(result.errors).toContain(
        "plugins.entries.voice-call.config.vapi.bridgeAuthToken is required",
      );
    });
  });
});

describe("normalizeVoiceCallConfig", () => {
  it("fills nested runtime defaults from a partial config boundary", () => {
    const normalized = normalizeVoiceCallConfig({
      enabled: true,
      provider: "mock",
      streaming: {
        enabled: true,
        streamPath: "/custom-stream",
      },
    });

    expect(normalized.serve.path).toBe("/voice/webhook");
    expect(normalized.streaming.streamPath).toBe("/custom-stream");
    expect(normalized.streaming.openai.model).toBe("gpt-4o-transcribe");
    expect(normalized.streaming.deepgram.model).toBe("nova-3");
    expect(normalized.tunnel.provider).toBe("none");
    expect(normalized.webhookSecurity.allowedHosts).toEqual([]);
  });

  it("maps legacy openai streaming fields into the nested provider config", () => {
    const normalized = normalizeVoiceCallConfig({
      streaming: {
        enabled: true,
        openaiApiKey: "legacy-openai-key",
        sttModel: "gpt-4o-mini-transcribe",
        silenceDurationMs: 600,
        vadThreshold: 0.25,
      } as unknown as VoiceCallConfig["streaming"] & Record<string, unknown>,
    });

    expect(normalized.streaming.sttProvider).toBe("openai-realtime");
    expect(normalized.streaming.openai.apiKey).toBe("legacy-openai-key");
    expect(normalized.streaming.openai.model).toBe("gpt-4o-mini-transcribe");
    expect(normalized.streaming.openai.silenceDurationMs).toBe(600);
    expect(normalized.streaming.openai.vadThreshold).toBe(0.25);
  });

  it("resolves realtime provider API keys from the environment", () => {
    process.env.OPENAI_API_KEY = "env-openai-realtime";
    process.env.DEEPGRAM_API_KEY = "env-deepgram-realtime";

    const openaiResolved = resolveVoiceCallConfig({
      streaming: {
        enabled: true,
        sttProvider: "openai-realtime",
      },
    });
    expect(openaiResolved.streaming.openai.apiKey).toBe("env-openai-realtime");

    const deepgramResolved = resolveVoiceCallConfig({
      streaming: {
        enabled: true,
        sttProvider: "deepgram-realtime",
        languageCode: "id",
        deepgram: {
          model: "nova-3",
        },
      },
    });
    expect(deepgramResolved.streaming.deepgram.apiKey).toBe("env-deepgram-realtime");
    expect(deepgramResolved.streaming.languageCode).toBe("id");
  });

  it("accepts partial nested TTS overrides and preserves nested objects", () => {
    const normalized = normalizeVoiceCallConfig({
      tts: {
        provider: "elevenlabs",
        elevenlabs: {
          apiKey: {
            source: "env",
            provider: "elevenlabs",
            id: "ELEVENLABS_API_KEY",
          },
          voiceSettings: {
            speed: 1.1,
          },
        },
      },
    });

    const { tts, elevenlabs } = requireElevenLabsTtsConfig(normalized);
    expect(tts.provider).toBe("elevenlabs");
    expect(elevenlabs.apiKey).toEqual({
      source: "env",
      provider: "elevenlabs",
      id: "ELEVENLABS_API_KEY",
    });
    expect(elevenlabs.voiceSettings).toEqual({ speed: 1.1 });
  });

  it("normalizes the Vapi subtree with mode-aware defaults", () => {
    const normalized = normalizeVoiceCallConfig({
      mode: "vapi",
      vapi: {
        assistantId: "assistant-1",
      },
    });

    expect(normalized.mode).toBe("vapi");
    expect(normalized.vapi.telephonyProvider).toBe("twilio");
    expect(normalized.vapi.bridgePath).toBe("/plugins/voice-call/vapi");
    expect(normalized.vapi.baseUrl).toBe("https://api.vapi.ai");
    expect(normalized.vapi.assistantId).toBe("assistant-1");
  });
});

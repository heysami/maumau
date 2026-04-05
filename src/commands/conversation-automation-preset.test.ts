import { describe, expect, it } from "vitest";
import type { MaumauConfig } from "../config/config.js";
import {
  applyConversationAutomationPresetConfig,
  readConversationAutomationPresetState,
} from "./conversation-automation-preset.js";

describe("conversation automation preset", () => {
  it("applies the bundled automation and telephony defaults", () => {
    const next = applyConversationAutomationPresetConfig({} as MaumauConfig, {
      enabled: true,
      telephonyEnabled: true,
      telephonyProvider: "twilio",
      sttProvider: "deepgram-realtime",
      allowFrom: ["telegram:user:123", "+628123456789"],
      languageId: "id",
    });

    expect(next.tools?.alsoAllow).toEqual(
      expect.arrayContaining(["automation-runner", "voice-call"]),
    );
    expect(next.skills?.allowBundled).toContain("conversation-automation");

    const automationRunner = next.plugins?.entries?.["automation-runner"];
    expect(automationRunner?.enabled).toBe(true);
    expect(automationRunner?.config).toMatchObject({
      enabled: true,
      accessPolicy: {
        mode: "allowlist",
        allowFrom: ["telegram:user:123", "+628123456789"],
      },
      requireApproval: true,
    });

    const voiceCall = next.plugins?.entries?.["voice-call"];
    expect(voiceCall?.enabled).toBe(true);
    expect(voiceCall?.config).toMatchObject({
      enabled: true,
      provider: "twilio",
      inboundPolicy: "allowlist",
      allowFrom: ["+628123456789"],
      streaming: {
        enabled: true,
        sttProvider: "deepgram-realtime",
        languageCode: "id",
        deepgram: {
          model: "nova-3",
        },
      },
      tts: {
        provider: "elevenlabs",
        elevenlabs: {
          modelId: "eleven_multilingual_v2",
          languageCode: "id",
        },
      },
    });
  });

  it("does not rewrite voice settings unless telephony defaults are requested", () => {
    const next = applyConversationAutomationPresetConfig(
      {
        plugins: {
          entries: {
            "voice-call": {
              enabled: true,
              config: {
                enabled: true,
                provider: "custom-provider",
                inboundPolicy: "open",
                allowFrom: ["+15551234567"],
                streaming: {
                  enabled: true,
                  sttProvider: "deepgram-realtime",
                  languageCode: "id",
                },
              },
            },
          },
        },
      } as MaumauConfig,
      {
        enabled: true,
      },
    );

    expect(next.plugins?.entries?.["voice-call"]).toMatchObject({
      enabled: true,
      config: {
        enabled: true,
        provider: "custom-provider",
        inboundPolicy: "open",
        allowFrom: ["+15551234567"],
        streaming: {
          enabled: true,
          sttProvider: "deepgram-realtime",
          languageCode: "id",
        },
      },
    });
    expect(next.tools?.alsoAllow).not.toContain("voice-call");
  });

  it("removes the bundled skill and tool allowlists when the preset is disabled", () => {
    const next = applyConversationAutomationPresetConfig(
      {
        tools: { alsoAllow: ["automation-runner", "browser"] },
        skills: { allowBundled: ["conversation-automation", "summarize"] },
        plugins: {
          entries: {
            "voice-call": {
              enabled: true,
              config: {
                enabled: true,
                provider: "custom-provider",
              },
            },
          },
        },
      } as MaumauConfig,
      {
        enabled: false,
      },
    );

    expect(next.tools?.alsoAllow).toEqual(["browser"]);
    expect(next.skills?.allowBundled).toEqual(["summarize"]);
    expect(next.plugins?.entries?.["automation-runner"]).toMatchObject({
      enabled: false,
      config: {
        enabled: false,
        accessPolicy: { mode: "disabled", allowFrom: [] },
      },
    });
    expect(next.plugins?.entries?.["voice-call"]).toMatchObject({
      enabled: true,
      config: {
        enabled: true,
        provider: "custom-provider",
      },
    });
  });

  it("reads preset state back from config", () => {
    const state = readConversationAutomationPresetState(
      applyConversationAutomationPresetConfig(
        {
          messages: {
            tts: {
              elevenlabs: {
                languageCode: "id",
              },
            },
          },
        } as MaumauConfig,
        {
          enabled: true,
          allowFrom: ["telegram:user:123"],
        },
      ),
    );

    expect(state).toEqual({
      enabled: true,
      active: true,
      telephonyEnabled: false,
      telephonyProvider: "twilio",
      sttProvider: "deepgram-realtime",
      languageId: "id",
      allowFrom: ["telegram:user:123"],
      accessMode: "allowlist",
    });
  });

  it("treats custom voice-call config as outside the preset telephony defaults", () => {
    const state = readConversationAutomationPresetState({
      plugins: {
        entries: {
          "voice-call": {
            enabled: true,
            config: {
              enabled: true,
              provider: "custom-provider",
              streaming: {
                enabled: true,
                sttProvider: "deepgram",
              },
              tts: {
                provider: "openai",
                elevenlabs: {
                  modelId: "custom-model",
                },
              },
            },
          },
        },
      },
    } as MaumauConfig);

    expect(state.telephonyEnabled).toBe(false);
    expect(state.telephonyProvider).toBe("twilio");
    expect(state.sttProvider).toBe("deepgram-realtime");
  });

  it("reads supported preset telephony providers back from config", () => {
    const state = readConversationAutomationPresetState({
      plugins: {
        entries: {
          "voice-call": {
            enabled: true,
            config: {
              enabled: true,
              provider: "telnyx",
              streaming: {
                enabled: true,
                sttProvider: "deepgram-realtime",
              },
              tts: {
                provider: "elevenlabs",
                elevenlabs: {
                  modelId: "eleven_multilingual_v2",
                },
              },
            },
          },
        },
      },
    } as MaumauConfig);

    expect(state.telephonyEnabled).toBe(true);
    expect(state.telephonyProvider).toBe("telnyx");
  });
});

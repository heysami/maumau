import { describe, expect, it, vi } from "vitest";
import type { OnboardOptions } from "../commands/onboard-types.js";
import type { MaumauConfig } from "../config/config.js";
import type { WizardPrompter, WizardSelectParams } from "./prompts.js";
import { maybeApplyConversationAutomationPreset } from "./setup.conversation-automation.js";

function createPrompter(params: {
  select: WizardPrompter["select"];
  confirm?: WizardPrompter["confirm"];
}): WizardPrompter {
  return {
    intro: vi.fn(async () => {}),
    outro: vi.fn(async () => {}),
    note: vi.fn(async () => {}),
    openUrl: vi.fn(async () => true),
    select: params.select,
    multiselect: vi.fn(async () => []),
    text: vi.fn(async () => ""),
    confirm: params.confirm ?? vi.fn(async () => false),
    progress: vi.fn(() => ({ update: vi.fn(), stop: vi.fn() })),
  };
}

describe("maybeApplyConversationAutomationPreset", () => {
  it("prompts for the selected phone provider before writing telephony defaults", async () => {
    const select = vi.fn(
      async (
        params: WizardSelectParams<
          | "standard"
          | "conversation-automation"
          | "twilio"
          | "telnyx"
          | "plivo"
          | "deepgram-realtime"
          | "openai-realtime"
        >,
      ) => {
        if (params.message === "Setup preset") {
          return "conversation-automation";
        }
        if (params.message === "Phone provider") {
          expect(params.options.map((option) => option.value)).toEqual([
            "twilio",
            "telnyx",
            "plivo",
          ]);
          return "plivo";
        }
        if (params.message === "Realtime speech-to-text") {
          return "openai-realtime";
        }
        throw new Error(`Unexpected select prompt: ${params.message}`);
      },
    ) as unknown as WizardPrompter["select"];
    const confirm = vi.fn(async () => true) as unknown as WizardPrompter["confirm"];
    const prompter = createPrompter({ select, confirm });

    const nextConfig = await maybeApplyConversationAutomationPreset({
      config: {} as MaumauConfig,
      opts: {} as OnboardOptions,
      prompter,
    });

    expect(nextConfig.plugins?.entries?.["voice-call"]).toMatchObject({
      enabled: true,
      config: {
        enabled: true,
        provider: "plivo",
        streaming: {
          enabled: true,
          sttProvider: "openai-realtime",
        },
        tts: {
          provider: "elevenlabs",
          elevenlabs: {
            modelId: "eleven_multilingual_v2",
          },
        },
      },
    });
  });
});

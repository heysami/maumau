import {
  applyConversationAutomationPresetConfig,
  CONVERSATION_AUTOMATION_PRESET_ID,
  CONVERSATION_AUTOMATION_STT_PROVIDER_DEEPGRAM,
  CONVERSATION_AUTOMATION_STT_PROVIDER_OPENAI,
  CONVERSATION_AUTOMATION_TELEPHONY_PROVIDER_PLIVO,
  CONVERSATION_AUTOMATION_TELEPHONY_PROVIDER_TELNYX,
  CONVERSATION_AUTOMATION_TELEPHONY_PROVIDER_TWILIO,
  readConversationAutomationPresetState,
} from "../commands/conversation-automation-preset.js";
import type { OnboardOptions } from "../commands/onboard-types.js";
import type { MaumauConfig } from "../config/config.js";
import type { WizardPrompter } from "./prompts.js";

type SetupPresetChoice = "standard" | typeof CONVERSATION_AUTOMATION_PRESET_ID;

function summarizeAllowFrom(allowFrom: string[]): string {
  if (allowFrom.length === 0) {
    return "Owner-only automation";
  }
  return `Allowlisted senders/callers: ${allowFrom.join(", ")}`;
}

function formatTelephonyProviderLabel(provider: "twilio" | "telnyx" | "plivo"): string {
  switch (provider) {
    case CONVERSATION_AUTOMATION_TELEPHONY_PROVIDER_TWILIO:
      return "Twilio";
    case CONVERSATION_AUTOMATION_TELEPHONY_PROVIDER_TELNYX:
      return "Telnyx";
    case CONVERSATION_AUTOMATION_TELEPHONY_PROVIDER_PLIVO:
      return "Plivo";
  }
}

export async function maybeApplyConversationAutomationPreset(params: {
  config: MaumauConfig;
  opts: OnboardOptions;
  prompter: WizardPrompter;
}): Promise<MaumauConfig> {
  if (params.opts.embedded) {
    return params.config;
  }

  const currentState = readConversationAutomationPresetState(params.config);
  const presetRequested = params.opts.preset === CONVERSATION_AUTOMATION_PRESET_ID;

  const choice = presetRequested
    ? CONVERSATION_AUTOMATION_PRESET_ID
    : await params.prompter.select<SetupPresetChoice>({
        message: "Setup preset",
        initialValue: currentState.active ? CONVERSATION_AUTOMATION_PRESET_ID : "standard",
        options: [
          {
            value: "standard",
            label: "Standard setup",
            hint: "Keep regular chat, channels, search, and skills setup only.",
          },
          {
            value: CONVERSATION_AUTOMATION_PRESET_ID,
            label: "Conversation + Automation",
            hint: "Adds a bounded automation worker with approvals, browser-first execution, and optional telephony.",
          },
        ],
      });

  if (choice !== CONVERSATION_AUTOMATION_PRESET_ID) {
    return params.config;
  }

  await params.prompter.note(
    [
      "Conversation + Automation adds a bounded automation worker.",
      "Browser automation is the default lane when browser control is available.",
      "Desktop fallback stays owner-only.",
      "Side-effecting steps require explicit approval before they continue.",
      "Optional voice-call defaults can also be prepared here.",
    ].join("\n"),
    "Conversation + Automation",
  );

  const telephonyEnabled = await params.prompter.confirm({
    message: "Prepare voice-call defaults too?",
    initialValue: currentState.telephonyEnabled,
  });
  const telephonyProvider = telephonyEnabled
    ? await params.prompter.select({
        message: "Phone provider",
        initialValue: currentState.telephonyProvider,
        options: [
          {
            value: CONVERSATION_AUTOMATION_TELEPHONY_PROVIDER_TWILIO,
            label: "Twilio",
            hint: "Good default when you want a mainstream phone provider path.",
          },
          {
            value: CONVERSATION_AUTOMATION_TELEPHONY_PROVIDER_TELNYX,
            label: "Telnyx",
            hint: "Use Telnyx if you already have Call Control set up there.",
          },
          {
            value: CONVERSATION_AUTOMATION_TELEPHONY_PROVIDER_PLIVO,
            label: "Plivo",
            hint: "Use Plivo if your phone number and webhook flow already live there.",
          },
        ],
      })
    : currentState.telephonyProvider;
  const sttProvider = telephonyEnabled
    ? await params.prompter.select({
        message: "Realtime speech-to-text",
        initialValue: currentState.sttProvider,
        options: [
          {
            value: CONVERSATION_AUTOMATION_STT_PROVIDER_DEEPGRAM,
            label: "Deepgram Nova-3",
            hint: "Recommended for Indonesian and code-switching.",
          },
          {
            value: CONVERSATION_AUTOMATION_STT_PROVIDER_OPENAI,
            label: "OpenAI Realtime",
            hint: "Use OpenAI for call transcription instead.",
          },
        ],
      })
    : currentState.sttProvider;

  const nextConfig = applyConversationAutomationPresetConfig(params.config, {
    enabled: true,
    telephonyEnabled,
    telephonyProvider,
    sttProvider,
    allowFrom: currentState.allowFrom,
  });

  await params.prompter.note(
    [
      "Conversation + Automation preset enabled.",
      summarizeAllowFrom(currentState.allowFrom),
      telephonyEnabled
        ? `Voice defaults: ${formatTelephonyProviderLabel(telephonyProvider)} + ${sttProvider === CONVERSATION_AUTOMATION_STT_PROVIDER_DEEPGRAM ? "Deepgram Nova-3" : "OpenAI Realtime"} + ElevenLabs multilingual v2.`
        : "Voice defaults: off for now.",
    ].join("\n"),
    "Conversation + Automation",
  );

  return nextConfig;
}

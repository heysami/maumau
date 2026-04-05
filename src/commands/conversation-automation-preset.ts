import type { MaumauConfig } from "../config/config.js";
import { DEFAULT_LANGUAGE_ID, normalizeLanguageId, type LanguageId } from "../i18n/languages.js";

export const CONVERSATION_AUTOMATION_PRESET_ID = "conversation-automation" as const;
export const CONVERSATION_AUTOMATION_TELEPHONY_PROVIDER_TWILIO = "twilio" as const;
export const CONVERSATION_AUTOMATION_TELEPHONY_PROVIDER_TELNYX = "telnyx" as const;
export const CONVERSATION_AUTOMATION_TELEPHONY_PROVIDER_PLIVO = "plivo" as const;
export const CONVERSATION_AUTOMATION_TELEPHONY_PROVIDER_DEFAULT =
  CONVERSATION_AUTOMATION_TELEPHONY_PROVIDER_TWILIO;
export const CONVERSATION_AUTOMATION_STT_PROVIDER_OPENAI = "openai-realtime" as const;
export const CONVERSATION_AUTOMATION_STT_PROVIDER_DEEPGRAM = "deepgram-realtime" as const;

export type ConversationAutomationPresetId = typeof CONVERSATION_AUTOMATION_PRESET_ID;
export type ConversationAutomationTelephonyProviderId =
  | typeof CONVERSATION_AUTOMATION_TELEPHONY_PROVIDER_TWILIO
  | typeof CONVERSATION_AUTOMATION_TELEPHONY_PROVIDER_TELNYX
  | typeof CONVERSATION_AUTOMATION_TELEPHONY_PROVIDER_PLIVO;
export type ConversationAutomationRealtimeSttProviderId =
  | typeof CONVERSATION_AUTOMATION_STT_PROVIDER_OPENAI
  | typeof CONVERSATION_AUTOMATION_STT_PROVIDER_DEEPGRAM;

export type ConversationAutomationPresetOptions = {
  enabled?: boolean;
  telephonyEnabled?: boolean;
  telephonyProvider?: ConversationAutomationTelephonyProviderId;
  sttProvider?: ConversationAutomationRealtimeSttProviderId;
  allowFrom?: string[] | string;
  languageId?: string;
};

export type ConversationAutomationPresetState = {
  enabled: boolean;
  active: boolean;
  telephonyEnabled: boolean;
  telephonyProvider: ConversationAutomationTelephonyProviderId;
  sttProvider: ConversationAutomationRealtimeSttProviderId;
  languageId: LanguageId;
  allowFrom: string[];
  accessMode: "disabled" | "owner" | "allowlist";
};

const AUTOMATION_RUNNER_PLUGIN_ID = "automation-runner";
const VOICE_CALL_PLUGIN_ID = "voice-call";
const CONVERSATION_AUTOMATION_BUNDLED_SKILLS = ["conversation-automation"] as const;
const CONVERSATION_AUTOMATION_OPTIONAL_TOOLS = [AUTOMATION_RUNNER_PLUGIN_ID] as const;
const CONVERSATION_AUTOMATION_TELEPHONY_OPTIONAL_TOOLS = [VOICE_CALL_PLUGIN_ID] as const;
const E164_RE = /^\+[1-9]\d{1,14}$/;

function uniqueTrimmed(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (!value) {
      continue;
    }
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }
  return result;
}

export function normalizeConversationAutomationAllowFrom(
  value: string[] | string | undefined,
): string[] {
  if (Array.isArray(value)) {
    return uniqueTrimmed(value);
  }
  if (typeof value !== "string") {
    return [];
  }
  return uniqueTrimmed(value.split(/[\n,]/g));
}

function resolveConversationAutomationLanguageId(
  config: MaumauConfig,
  override: string | undefined,
): LanguageId {
  return (
    normalizeLanguageId(override) ??
    normalizeLanguageId(config.messages?.tts?.elevenlabs?.languageCode) ??
    normalizeLanguageId(
      (
        config.plugins?.entries?.[VOICE_CALL_PLUGIN_ID]?.config as {
          streaming?: { languageCode?: string };
        } | null
      )?.streaming?.languageCode,
    ) ??
    DEFAULT_LANGUAGE_ID
  );
}

function resolveVoiceLanguageCode(languageId: LanguageId): string {
  if (languageId === "pt-BR") {
    return "pt";
  }
  if (languageId === "zh-CN" || languageId === "zh-TW") {
    return "zh";
  }
  return languageId;
}

function resolvePhoneAllowFrom(allowFrom: string[]): string[] {
  return allowFrom.filter((entry) => E164_RE.test(entry));
}

function resolveConversationAutomationTelephonyProvider(
  value: unknown,
): ConversationAutomationTelephonyProviderId {
  return value === CONVERSATION_AUTOMATION_TELEPHONY_PROVIDER_TWILIO ||
    value === CONVERSATION_AUTOMATION_TELEPHONY_PROVIDER_TELNYX ||
    value === CONVERSATION_AUTOMATION_TELEPHONY_PROVIDER_PLIVO
    ? value
    : CONVERSATION_AUTOMATION_TELEPHONY_PROVIDER_DEFAULT;
}

function resolveConversationAutomationSttProvider(
  value: unknown,
): ConversationAutomationRealtimeSttProviderId {
  return value === CONVERSATION_AUTOMATION_STT_PROVIDER_OPENAI ||
    value === CONVERSATION_AUTOMATION_STT_PROVIDER_DEEPGRAM
    ? value
    : CONVERSATION_AUTOMATION_STT_PROVIDER_DEEPGRAM;
}

function mergeToolsAllowlist(
  existing: string[] | undefined,
  additions: readonly string[],
): string[] {
  return uniqueTrimmed([...(existing ?? []), ...additions]);
}

function mergeBundledSkillAllowlist(
  existing: string[] | undefined,
  additions: readonly string[],
): string[] {
  return uniqueTrimmed([...(existing ?? []), ...additions]);
}

function removeConfiguredValues(
  existing: string[] | undefined,
  removals: readonly string[],
): string[] | undefined {
  if (!existing) {
    return existing;
  }
  const removalKeys = new Set(removals.map((value) => value.toLowerCase()));
  const next = existing.filter((value) => !removalKeys.has(value.trim().toLowerCase()));
  return next.length > 0 ? uniqueTrimmed(next) : undefined;
}

export function applyConversationAutomationPresetConfig(
  config: MaumauConfig,
  options: ConversationAutomationPresetOptions = {},
): MaumauConfig {
  const enabled = options.enabled ?? true;
  const allowFrom = normalizeConversationAutomationAllowFrom(options.allowFrom);
  const accessMode: ConversationAutomationPresetState["accessMode"] = !enabled
    ? "disabled"
    : allowFrom.length > 0
      ? "allowlist"
      : "owner";
  const telephonyEnabled =
    options.telephonyEnabled === undefined ? undefined : enabled && options.telephonyEnabled === true;
  const telephonyProvider = resolveConversationAutomationTelephonyProvider(
    options.telephonyProvider,
  );
  const sttProvider = resolveConversationAutomationSttProvider(options.sttProvider);
  const languageId = resolveConversationAutomationLanguageId(config, options.languageId);
  const voiceLanguageCode = resolveVoiceLanguageCode(languageId);
  const automationEntry = config.plugins?.entries?.[AUTOMATION_RUNNER_PLUGIN_ID];
  const voiceCallEntry = config.plugins?.entries?.[VOICE_CALL_PLUGIN_ID];
  const phoneAllowFrom = resolvePhoneAllowFrom(allowFrom);
  const automationToolsAllow = enabled
    ? mergeToolsAllowlist(config.tools?.alsoAllow, CONVERSATION_AUTOMATION_OPTIONAL_TOOLS)
    : removeConfiguredValues(config.tools?.alsoAllow, CONVERSATION_AUTOMATION_OPTIONAL_TOOLS);
  const toolsAllow =
    telephonyEnabled === true
      ? mergeToolsAllowlist(automationToolsAllow, CONVERSATION_AUTOMATION_TELEPHONY_OPTIONAL_TOOLS)
      : automationToolsAllow;

  const nextConfig: MaumauConfig = {
    ...config,
    tools: {
      ...config.tools,
      alsoAllow: toolsAllow,
    },
    skills: {
      ...config.skills,
      allowBundled: enabled
        ? mergeBundledSkillAllowlist(
            config.skills?.allowBundled,
            CONVERSATION_AUTOMATION_BUNDLED_SKILLS,
          )
        : removeConfiguredValues(
            config.skills?.allowBundled,
            CONVERSATION_AUTOMATION_BUNDLED_SKILLS,
          ),
    },
    plugins: {
      ...config.plugins,
      entries: {
        ...config.plugins?.entries,
        [AUTOMATION_RUNNER_PLUGIN_ID]: {
          ...automationEntry,
          enabled,
          config: {
            ...automationEntry?.config,
            enabled,
            accessPolicy: {
              ...(
                automationEntry?.config as {
                  accessPolicy?: { mode?: string; allowFrom?: string[] };
                } | null
              )?.accessPolicy,
              mode: accessMode,
              allowFrom,
            },
            requireApproval: true,
          },
        },
      },
    },
  };

  if (telephonyEnabled === undefined) {
    return nextConfig;
  }

  const voiceCallConfig = (voiceCallEntry?.config as
    | {
        enabled?: boolean;
        inboundPolicy?: string;
        allowFrom?: string[];
        provider?: string;
        streaming?: Record<string, unknown>;
        tts?: Record<string, unknown>;
      }
    | undefined) ?? { enabled: false };
  const existingStreaming = (voiceCallConfig.streaming as
    | {
        openai?: Record<string, unknown>;
        deepgram?: Record<string, unknown>;
      }
    | undefined) ?? {};
  const existingTts = (voiceCallConfig.tts as
    | {
        elevenlabs?: Record<string, unknown>;
      }
    | undefined) ?? {};

  return {
    ...nextConfig,
    plugins: {
      ...nextConfig.plugins,
      entries: {
        ...nextConfig.plugins?.entries,
        [VOICE_CALL_PLUGIN_ID]: {
          ...voiceCallEntry,
          enabled: telephonyEnabled,
          config: {
            ...voiceCallConfig,
            enabled: telephonyEnabled,
            ...(telephonyEnabled
              ? {
                  provider: telephonyProvider,
                  inboundPolicy: phoneAllowFrom.length > 0 ? "allowlist" : "disabled",
                  allowFrom: phoneAllowFrom,
                  streaming: {
                    ...existingStreaming,
                    enabled: true,
                    sttProvider,
                    languageCode: voiceLanguageCode,
                    ...(sttProvider === CONVERSATION_AUTOMATION_STT_PROVIDER_DEEPGRAM
                      ? {
                          deepgram: {
                            ...existingStreaming.deepgram,
                            model: "nova-3",
                          },
                        }
                      : {}),
                  },
                  tts: {
                    ...existingTts,
                    provider: "elevenlabs",
                    elevenlabs: {
                      ...existingTts.elevenlabs,
                      modelId: "eleven_multilingual_v2",
                      languageCode: voiceLanguageCode,
                    },
                  },
                }
              : {}),
          },
        },
      },
    },
  };
}

export function readConversationAutomationPresetState(
  config: MaumauConfig,
): ConversationAutomationPresetState {
  const automationEntry = config.plugins?.entries?.[AUTOMATION_RUNNER_PLUGIN_ID];
  const automationConfig = (automationEntry?.config as
    | {
        enabled?: boolean;
        accessPolicy?: {
          mode?: "disabled" | "owner" | "allowlist";
          allowFrom?: string[];
        };
      }
    | undefined) ?? { enabled: false };
  const telephonyEntry = config.plugins?.entries?.[VOICE_CALL_PLUGIN_ID];
  const telephonyConfig = telephonyEntry?.config as
    | {
        enabled?: boolean;
        provider?: unknown;
        streaming?: {
          sttProvider?: unknown;
        };
        tts?: {
          provider?: unknown;
          elevenlabs?: {
            modelId?: unknown;
          };
        };
      }
    | undefined;
  const telephonyProvider = resolveConversationAutomationTelephonyProvider(
    telephonyConfig?.provider,
  );
  const sttProvider = resolveConversationAutomationSttProvider(
    telephonyConfig?.streaming?.sttProvider,
  );
  const telephonyEnabled =
    telephonyEntry?.enabled === true &&
    (telephonyConfig?.enabled ?? true) &&
    (telephonyProvider === CONVERSATION_AUTOMATION_TELEPHONY_PROVIDER_TWILIO ||
      telephonyProvider === CONVERSATION_AUTOMATION_TELEPHONY_PROVIDER_TELNYX ||
      telephonyProvider === CONVERSATION_AUTOMATION_TELEPHONY_PROVIDER_PLIVO) &&
    telephonyConfig?.tts?.provider === "elevenlabs" &&
    telephonyConfig?.tts?.elevenlabs?.modelId === "eleven_multilingual_v2" &&
    (sttProvider === CONVERSATION_AUTOMATION_STT_PROVIDER_OPENAI ||
      sttProvider === CONVERSATION_AUTOMATION_STT_PROVIDER_DEEPGRAM);
  const allowFrom = normalizeConversationAutomationAllowFrom(
    automationConfig.accessPolicy?.allowFrom,
  );
  const accessMode =
    automationConfig.accessPolicy?.mode === "disabled" ||
    automationConfig.accessPolicy?.mode === "owner" ||
    automationConfig.accessPolicy?.mode === "allowlist"
      ? automationConfig.accessPolicy.mode
      : automationEntry?.enabled
        ? allowFrom.length > 0
          ? "allowlist"
          : "owner"
        : "disabled";
  const enabled =
    automationEntry?.enabled === true && (automationConfig.enabled ?? automationEntry?.enabled);
  const languageId = resolveConversationAutomationLanguageId(config, undefined);

  return {
    enabled,
    active: enabled,
    telephonyEnabled,
    telephonyProvider,
    sttProvider,
    languageId,
    allowFrom,
    accessMode,
  };
}

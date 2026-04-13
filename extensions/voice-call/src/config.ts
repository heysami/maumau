import { z } from "zod";
import { TtsAutoSchema, TtsConfigSchema, TtsModeSchema, TtsProviderSchema } from "../api.js";
import { deepMergeDefined } from "./deep-merge.js";

// -----------------------------------------------------------------------------
// Phone Number Validation
// -----------------------------------------------------------------------------

/**
 * E.164 phone number format: +[country code][number]
 * Examples use 555 prefix (reserved for fictional numbers)
 */
export const E164Schema = z
  .string()
  .regex(/^\+[1-9]\d{1,14}$/, "Expected E.164 format, e.g. +15550001234");

// -----------------------------------------------------------------------------
// Inbound Policy
// -----------------------------------------------------------------------------

/**
 * Controls how inbound calls are handled:
 * - "disabled": Block all inbound calls (outbound only)
 * - "allowlist": Only accept calls from numbers in allowFrom
 * - "pairing": Unknown callers can request pairing (future)
 * - "open": Accept all inbound calls (dangerous!)
 */
export const InboundPolicySchema = z.enum(["disabled", "allowlist", "pairing", "open"]);
export type InboundPolicy = z.infer<typeof InboundPolicySchema>;

// -----------------------------------------------------------------------------
// Provider-Specific Configuration
// -----------------------------------------------------------------------------

export const TelnyxConfigSchema = z
  .object({
    /** Telnyx API v2 key */
    apiKey: z.string().min(1).optional(),
    /** Telnyx connection ID (from Call Control app) */
    connectionId: z.string().min(1).optional(),
    /** Public key for webhook signature verification */
    publicKey: z.string().min(1).optional(),
  })
  .strict();
export type TelnyxConfig = z.infer<typeof TelnyxConfigSchema>;

export const TwilioConfigSchema = z
  .object({
    /** Twilio Account SID */
    accountSid: z.string().min(1).optional(),
    /** Twilio Auth Token */
    authToken: z.string().min(1).optional(),
  })
  .strict();
export type TwilioConfig = z.infer<typeof TwilioConfigSchema>;

export const PlivoConfigSchema = z
  .object({
    /** Plivo Auth ID (starts with MA/SA) */
    authId: z.string().min(1).optional(),
    /** Plivo Auth Token */
    authToken: z.string().min(1).optional(),
  })
  .strict();
export type PlivoConfig = z.infer<typeof PlivoConfigSchema>;

// -----------------------------------------------------------------------------
// STT/TTS Configuration
// -----------------------------------------------------------------------------

export const SttConfigSchema = z
  .object({
    /** STT provider (currently only OpenAI supported) */
    provider: z.literal("openai").default("openai"),
    /** Whisper model to use */
    model: z.string().min(1).default("whisper-1"),
  })
  .strict()
  .default({ provider: "openai", model: "whisper-1" });
export type SttConfig = z.infer<typeof SttConfigSchema>;

export { TtsAutoSchema, TtsConfigSchema, TtsModeSchema, TtsProviderSchema };
export type VoiceCallTtsConfig = z.infer<typeof TtsConfigSchema>;

// -----------------------------------------------------------------------------
// Webhook Server Configuration
// -----------------------------------------------------------------------------

export const VoiceCallServeConfigSchema = z
  .object({
    /** Port to listen on */
    port: z.number().int().positive().default(3334),
    /** Bind address */
    bind: z.string().default("127.0.0.1"),
    /** Webhook path */
    path: z.string().min(1).default("/voice/webhook"),
  })
  .strict()
  .default({ port: 3334, bind: "127.0.0.1", path: "/voice/webhook" });
export type VoiceCallServeConfig = z.infer<typeof VoiceCallServeConfigSchema>;

export const VoiceCallTailscaleConfigSchema = z
  .object({
    /**
     * Tailscale exposure mode:
     * - "off": No Tailscale exposure
     * - "serve": Tailscale serve (private to tailnet)
     * - "funnel": Tailscale funnel (public HTTPS)
     */
    mode: z.enum(["off", "serve", "funnel"]).default("off"),
    /** Path for Tailscale serve/funnel (should usually match serve.path) */
    path: z.string().min(1).default("/voice/webhook"),
  })
  .strict()
  .default({ mode: "off", path: "/voice/webhook" });
export type VoiceCallTailscaleConfig = z.infer<typeof VoiceCallTailscaleConfigSchema>;

// -----------------------------------------------------------------------------
// Tunnel Configuration (unified ngrok/tailscale)
// -----------------------------------------------------------------------------

export const VoiceCallTunnelConfigSchema = z
  .object({
    /**
     * Tunnel provider:
     * - "none": No tunnel (use publicUrl if set, or manual setup)
     * - "ngrok": Use ngrok for public HTTPS tunnel
     * - "tailscale-serve": Tailscale serve (private to tailnet)
     * - "tailscale-funnel": Tailscale funnel (public HTTPS)
     */
    provider: z.enum(["none", "ngrok", "tailscale-serve", "tailscale-funnel"]).default("none"),
    /** ngrok auth token (optional, enables longer sessions and more features) */
    ngrokAuthToken: z.string().min(1).optional(),
    /** ngrok custom domain (paid feature, e.g., "myapp.ngrok.io") */
    ngrokDomain: z.string().min(1).optional(),
    /**
     * Allow ngrok free tier compatibility mode.
     * When true, forwarded headers may be trusted for loopback requests
     * to reconstruct the public ngrok URL used for signing.
     *
     * IMPORTANT: This does NOT bypass signature verification.
     */
    allowNgrokFreeTierLoopbackBypass: z.boolean().default(false),
  })
  .strict()
  .default({ provider: "none", allowNgrokFreeTierLoopbackBypass: false });
export type VoiceCallTunnelConfig = z.infer<typeof VoiceCallTunnelConfigSchema>;

// -----------------------------------------------------------------------------
// Webhook Security Configuration
// -----------------------------------------------------------------------------

export const VoiceCallWebhookSecurityConfigSchema = z
  .object({
    /**
     * Allowed hostnames for webhook URL reconstruction.
     * Only these hosts are accepted from forwarding headers.
     */
    allowedHosts: z.array(z.string().min(1)).default([]),
    /**
     * Trust X-Forwarded-* headers without a hostname allowlist.
     * WARNING: Only enable if you trust your proxy configuration.
     */
    trustForwardingHeaders: z.boolean().default(false),
    /**
     * Trusted proxy IP addresses. Forwarded headers are only trusted when
     * the remote IP matches one of these addresses.
     */
    trustedProxyIPs: z.array(z.string().min(1)).default([]),
  })
  .strict()
  .default({ allowedHosts: [], trustForwardingHeaders: false, trustedProxyIPs: [] });
export type WebhookSecurityConfig = z.infer<typeof VoiceCallWebhookSecurityConfigSchema>;

// -----------------------------------------------------------------------------
// Outbound Call Configuration
// -----------------------------------------------------------------------------

/**
 * Call mode determines how outbound calls behave:
 * - "notify": Deliver message and auto-hangup after delay (one-way notification)
 * - "conversation": Stay open for back-and-forth until explicit end or timeout
 */
export const CallModeSchema = z.enum(["notify", "conversation"]);
export type CallMode = z.infer<typeof CallModeSchema>;

export const OutboundConfigSchema = z
  .object({
    /** Default call mode for outbound calls */
    defaultMode: CallModeSchema.default("notify"),
    /** Seconds to wait after TTS before auto-hangup in notify mode */
    notifyHangupDelaySec: z.number().int().nonnegative().default(3),
  })
  .strict()
  .default({ defaultMode: "notify", notifyHangupDelaySec: 3 });
export type OutboundConfig = z.infer<typeof OutboundConfigSchema>;

// -----------------------------------------------------------------------------
// Streaming Configuration (OpenAI Realtime STT)
// -----------------------------------------------------------------------------

export const VoiceCallStreamingOpenAIConfigSchema = z
  .object({
    /** OpenAI API key for Realtime API (uses OPENAI_API_KEY env if not set) */
    apiKey: z.string().min(1).optional(),
    /** OpenAI transcription model (default: gpt-4o-transcribe) */
    model: z.string().min(1).default("gpt-4o-transcribe"),
    /** VAD silence duration in ms before considering speech ended */
    silenceDurationMs: z.number().int().positive().default(800),
    /** VAD threshold 0-1 (higher = less sensitive) */
    vadThreshold: z.number().min(0).max(1).default(0.5),
  })
  .strict()
  .default({
    model: "gpt-4o-transcribe",
    silenceDurationMs: 800,
    vadThreshold: 0.5,
  });
export type VoiceCallStreamingOpenAIConfig = z.infer<typeof VoiceCallStreamingOpenAIConfigSchema>;

export const VoiceCallStreamingDeepgramConfigSchema = z
  .object({
    /** Deepgram API key (uses DEEPGRAM_API_KEY env if not set) */
    apiKey: z.string().min(1).optional(),
    /** Deepgram realtime model (default: nova-3) */
    model: z.string().min(1).default("nova-3"),
    /** Silence pause before endpointing emits speech_final */
    endpointingMs: z.number().int().positive().default(300),
    /** Emit interim transcripts while speech is still ongoing */
    interimResults: z.boolean().default(true),
  })
  .strict()
  .default({
    model: "nova-3",
    endpointingMs: 300,
    interimResults: true,
  });
export type VoiceCallStreamingDeepgramConfig = z.infer<
  typeof VoiceCallStreamingDeepgramConfigSchema
>;

export const VoiceCallStreamingConfigSchema = z
  .object({
    /** Enable real-time audio streaming (requires WebSocket support) */
    enabled: z.boolean().default(false),
    /** STT provider for real-time transcription */
    sttProvider: z.enum(["openai-realtime", "deepgram-realtime"]).default("openai-realtime"),
    /** Shared language hint used by the selected realtime STT provider */
    languageCode: z.string().min(1).optional(),
    /** OpenAI realtime-specific settings */
    openai: VoiceCallStreamingOpenAIConfigSchema,
    /** Deepgram realtime-specific settings */
    deepgram: VoiceCallStreamingDeepgramConfigSchema,
    /** WebSocket path for media stream connections */
    streamPath: z.string().min(1).default("/voice/stream"),
    /**
     * Close unauthenticated media stream sockets if no valid `start` frame arrives in time.
     * Protects against pre-auth idle connection hold attacks.
     */
    preStartTimeoutMs: z.number().int().positive().default(5000),
    /** Maximum number of concurrently pending (pre-start) media stream sockets. */
    maxPendingConnections: z.number().int().positive().default(32),
    /** Maximum pending media stream sockets per source IP. */
    maxPendingConnectionsPerIp: z.number().int().positive().default(4),
    /** Hard cap for all open media stream sockets (pending + active). */
    maxConnections: z.number().int().positive().default(128),
  })
  .strict()
  .default({
    enabled: false,
    sttProvider: "openai-realtime",
    openai: {
      model: "gpt-4o-transcribe",
      silenceDurationMs: 800,
      vadThreshold: 0.5,
    },
    deepgram: {
      model: "nova-3",
      endpointingMs: 300,
      interimResults: true,
    },
    streamPath: "/voice/stream",
    preStartTimeoutMs: 5000,
    maxPendingConnections: 32,
    maxPendingConnectionsPerIp: 4,
    maxConnections: 128,
  });
export type VoiceCallStreamingConfig = z.infer<typeof VoiceCallStreamingConfigSchema>;

// -----------------------------------------------------------------------------
// Vapi Configuration
// -----------------------------------------------------------------------------

export const VoiceCallModeSchema = z.enum(["self-hosted", "vapi"]).default("self-hosted");
export type VoiceCallMode = z.infer<typeof VoiceCallModeSchema>;

export const VapiTelephonyProviderSchema = z.literal("twilio").default("twilio");
export type VapiTelephonyProvider = z.infer<typeof VapiTelephonyProviderSchema>;

export const VapiBridgeModeSchema = z.enum(["auto", "manual-public-url"]).default("auto");
export type VapiBridgeMode = z.infer<typeof VapiBridgeModeSchema>;

export const VoiceCallVapiConfigSchema = z
  .object({
    /** Enable the Vapi-backed call path when mode=vapi */
    enabled: z.boolean().default(true),
    /** Vapi private API key */
    apiKey: z.string().min(1).optional(),
    /** Saved Vapi assistant to use as the base assistant */
    assistantId: z.string().min(1).optional(),
    /** Imported Vapi phone number ID */
    phoneNumberId: z.string().min(1).optional(),
    /** Imported telephony provider backing the Vapi number */
    telephonyProvider: VapiTelephonyProviderSchema,
    /** Preferred reply language passed into the transient assistant */
    preferredLanguage: z.string().min(1).default("en"),
    /** Whether Maumau should auto-publish the Vapi bridge or use a fixed public URL */
    bridgeMode: VapiBridgeModeSchema,
    /** Public HTTPS URL Vapi should call for Maumau tool turns */
    bridgeUrl: z.string().url().optional(),
    /** Gateway route path that serves the Vapi bridge */
    bridgePath: z.string().min(1).default("/plugins/voice-call/vapi"),
    /** Shared secret used to authenticate Vapi callbacks to the bridge */
    bridgeAuthToken: z.string().min(1).optional(),
    /** Optional Vapi API base URL override */
    baseUrl: z.string().url().default("https://api.vapi.ai"),
  })
  .strict()
  .default({
    enabled: true,
    telephonyProvider: "twilio",
    preferredLanguage: "en",
    bridgeMode: "auto",
    bridgePath: "/plugins/voice-call/vapi",
    baseUrl: "https://api.vapi.ai",
  });
export type VoiceCallVapiConfig = z.infer<typeof VoiceCallVapiConfigSchema>;

// -----------------------------------------------------------------------------
// Main Voice Call Configuration
// -----------------------------------------------------------------------------

export const VoiceCallConfigSchema = z
  .object({
    /** Enable voice call functionality */
    enabled: z.boolean().default(false),

    /** Runtime mode: direct self-hosted telephony vs Vapi-managed calls */
    mode: VoiceCallModeSchema,

    /** Active provider (telnyx, twilio, plivo, or mock) */
    provider: z.enum(["telnyx", "twilio", "plivo", "mock"]).optional(),

    /** Vapi-backed configuration */
    vapi: VoiceCallVapiConfigSchema,

    /** Telnyx-specific configuration */
    telnyx: TelnyxConfigSchema.optional(),

    /** Twilio-specific configuration */
    twilio: TwilioConfigSchema.optional(),

    /** Plivo-specific configuration */
    plivo: PlivoConfigSchema.optional(),

    /** Phone number to call from (E.164) */
    fromNumber: E164Schema.optional(),

    /** Default phone number to call (E.164) */
    toNumber: E164Schema.optional(),

    /** Inbound call policy */
    inboundPolicy: InboundPolicySchema.default("disabled"),

    /** Allowlist of phone numbers for inbound calls (E.164) */
    allowFrom: z.array(E164Schema).default([]),

    /** Greeting message for inbound calls */
    inboundGreeting: z.string().optional(),

    /** Outbound call configuration */
    outbound: OutboundConfigSchema,

    /** Maximum call duration in seconds */
    maxDurationSeconds: z.number().int().positive().default(300),

    /**
     * Maximum age of a call in seconds before it is automatically reaped.
     * Catches calls stuck in unexpected states (e.g., notify-mode calls that
     * never receive a terminal webhook). Set to 0 to disable.
     * Default: 0 (disabled). Recommended: 120-300 for production.
     */
    staleCallReaperSeconds: z.number().int().nonnegative().default(0),

    /** Silence timeout for end-of-speech detection (ms) */
    silenceTimeoutMs: z.number().int().positive().default(800),

    /** Timeout for user transcript (ms) */
    transcriptTimeoutMs: z.number().int().positive().default(180000),

    /** Ring timeout for outbound calls (ms) */
    ringTimeoutMs: z.number().int().positive().default(30000),

    /** Maximum concurrent calls */
    maxConcurrentCalls: z.number().int().positive().default(1),

    /** Webhook server configuration */
    serve: VoiceCallServeConfigSchema,

    /** Tailscale exposure configuration (legacy, prefer tunnel config) */
    tailscale: VoiceCallTailscaleConfigSchema,

    /** Tunnel configuration (unified ngrok/tailscale) */
    tunnel: VoiceCallTunnelConfigSchema,

    /** Webhook signature reconstruction and proxy trust configuration */
    webhookSecurity: VoiceCallWebhookSecurityConfigSchema,

    /** Real-time audio streaming configuration */
    streaming: VoiceCallStreamingConfigSchema,

    /** Public webhook URL override (if set, bypasses tunnel auto-detection) */
    publicUrl: z.string().url().optional(),

    /** Skip webhook signature verification (development only, NOT for production) */
    skipSignatureVerification: z.boolean().default(false),

    /** STT configuration */
    stt: SttConfigSchema,

    /** TTS override (deep-merges with core messages.tts) */
    tts: TtsConfigSchema,

    /** Store path for call logs */
    store: z.string().optional(),

    /**
     * Optional model override for generating voice responses.
     * When omitted, calls inherit the main Maumau agent default model.
     */
    responseModel: z.string().optional(),

    /** System prompt for voice responses */
    responseSystemPrompt: z.string().optional(),

    /** Timeout for response generation in ms (default 30s) */
    responseTimeoutMs: z.number().int().positive().default(30000),
  })
  .strict();

export type VoiceCallConfig = z.infer<typeof VoiceCallConfigSchema>;
type DeepPartial<T> =
  T extends Array<infer U>
    ? DeepPartial<U>[]
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T;
export type VoiceCallConfigInput = DeepPartial<VoiceCallConfig>;

// -----------------------------------------------------------------------------
// Configuration Helpers
// -----------------------------------------------------------------------------

const DEFAULT_VOICE_CALL_CONFIG = VoiceCallConfigSchema.parse({});

function cloneDefaultVoiceCallConfig(): VoiceCallConfig {
  return structuredClone(DEFAULT_VOICE_CALL_CONFIG);
}

function normalizeVoiceCallTtsConfig(
  defaults: VoiceCallTtsConfig,
  overrides: DeepPartial<NonNullable<VoiceCallTtsConfig>> | undefined,
): VoiceCallTtsConfig {
  if (!defaults && !overrides) {
    return undefined;
  }

  return TtsConfigSchema.parse(deepMergeDefined(defaults ?? {}, overrides ?? {}));
}

function normalizeStreamingConfigInput(
  streaming: DeepPartial<VoiceCallStreamingConfig> | undefined,
): DeepPartial<VoiceCallStreamingConfig> | undefined {
  if (!streaming) {
    return streaming;
  }

  const raw =
    typeof streaming === "object" && streaming !== null
      ? (streaming as Record<string, unknown>)
      : {};
  const openaiInput =
    raw.openai && typeof raw.openai === "object" && !Array.isArray(raw.openai)
      ? (raw.openai as Record<string, unknown>)
      : {};
  const deepgramInput =
    raw.deepgram && typeof raw.deepgram === "object" && !Array.isArray(raw.deepgram)
      ? (raw.deepgram as Record<string, unknown>)
      : {};
  const normalizedOpenAI: Record<string, unknown> = { ...openaiInput };
  const normalizedDeepgram: Record<string, unknown> = { ...deepgramInput };

  const legacyOpenAIApiKey = typeof raw.openaiApiKey === "string" ? raw.openaiApiKey : undefined;
  const legacyOpenAIModel = typeof raw.sttModel === "string" ? raw.sttModel : undefined;
  const legacySilenceDurationMs =
    typeof raw.silenceDurationMs === "number" ? raw.silenceDurationMs : undefined;
  const legacyVadThreshold = typeof raw.vadThreshold === "number" ? raw.vadThreshold : undefined;

  if (legacyOpenAIApiKey) {
    normalizedOpenAI.apiKey = legacyOpenAIApiKey;
  }
  if (legacyOpenAIModel) {
    normalizedOpenAI.model = legacyOpenAIModel;
  }
  if (legacySilenceDurationMs != null) {
    normalizedOpenAI.silenceDurationMs = legacySilenceDurationMs;
  }
  if (legacyVadThreshold != null) {
    normalizedOpenAI.vadThreshold = legacyVadThreshold;
  }

  return {
    ...streaming,
    openai: normalizedOpenAI,
    deepgram: normalizedDeepgram,
  };
}

function inferLegacyVapiBridgeMode(params: {
  configuredMode?: VapiBridgeMode;
  bridgeUrl: string | undefined;
}): VapiBridgeMode {
  if (typeof params.configuredMode === "string" && params.configuredMode.trim()) {
    return params.configuredMode === "manual-public-url" ? "manual-public-url" : "auto";
  }
  const bridgeUrl = params.bridgeUrl?.trim();
  if (!bridgeUrl) {
    return "auto";
  }
  try {
    const parsed = new URL(bridgeUrl);
    const host = parsed.hostname.trim().toLowerCase();
    const port = parsed.port ? Number(parsed.port) : undefined;
    if (host.endsWith(".ts.net") && (port == null || port === 443 || port === 8443)) {
      return "auto";
    }
  } catch {}
  return "manual-public-url";
}

export function normalizeVoiceCallConfig(config: VoiceCallConfigInput): VoiceCallConfig {
  const defaults = cloneDefaultVoiceCallConfig();
  const normalizedStreamingInput = normalizeStreamingConfigInput(config.streaming);
  return {
    ...defaults,
    ...config,
    allowFrom: config.allowFrom ?? defaults.allowFrom,
    outbound: { ...defaults.outbound, ...config.outbound },
    vapi: {
      ...defaults.vapi,
      ...config.vapi,
    },
    serve: { ...defaults.serve, ...config.serve },
    tailscale: { ...defaults.tailscale, ...config.tailscale },
    tunnel: { ...defaults.tunnel, ...config.tunnel },
    webhookSecurity: {
      ...defaults.webhookSecurity,
      ...config.webhookSecurity,
      allowedHosts: config.webhookSecurity?.allowedHosts ?? defaults.webhookSecurity.allowedHosts,
      trustedProxyIPs:
        config.webhookSecurity?.trustedProxyIPs ?? defaults.webhookSecurity.trustedProxyIPs,
    },
    streaming: {
      ...defaults.streaming,
      ...normalizedStreamingInput,
      openai: {
        ...defaults.streaming.openai,
        ...normalizedStreamingInput?.openai,
      },
      deepgram: {
        ...defaults.streaming.deepgram,
        ...normalizedStreamingInput?.deepgram,
      },
    },
    stt: { ...defaults.stt, ...config.stt },
    tts: normalizeVoiceCallTtsConfig(defaults.tts, config.tts),
  };
}

/**
 * Resolves the configuration by merging environment variables into missing fields.
 * Returns a new configuration object with environment variables applied.
 */
export function resolveVoiceCallConfig(config: VoiceCallConfigInput): VoiceCallConfig {
  const resolved = normalizeVoiceCallConfig(config);

  resolved.vapi = resolved.vapi ?? {
    enabled: true,
    telephonyProvider: "twilio",
    preferredLanguage: "en",
    bridgeMode: "auto",
    bridgePath: "/plugins/voice-call/vapi",
    baseUrl: "https://api.vapi.ai",
  };
  resolved.vapi.apiKey = resolved.vapi.apiKey ?? process.env.VAPI_API_KEY;
  resolved.vapi.bridgeMode = inferLegacyVapiBridgeMode({
    configuredMode: config.vapi?.bridgeMode,
    bridgeUrl: resolved.vapi.bridgeUrl,
  });

  // Telnyx
  if (resolved.mode === "self-hosted" && resolved.provider === "telnyx") {
    resolved.telnyx = resolved.telnyx ?? {};
    resolved.telnyx.apiKey = resolved.telnyx.apiKey ?? process.env.TELNYX_API_KEY;
    resolved.telnyx.connectionId = resolved.telnyx.connectionId ?? process.env.TELNYX_CONNECTION_ID;
    resolved.telnyx.publicKey = resolved.telnyx.publicKey ?? process.env.TELNYX_PUBLIC_KEY;
  }

  // Twilio
  if (resolved.mode === "self-hosted" && resolved.provider === "twilio") {
    resolved.twilio = resolved.twilio ?? {};
    resolved.twilio.accountSid = resolved.twilio.accountSid ?? process.env.TWILIO_ACCOUNT_SID;
    resolved.twilio.authToken = resolved.twilio.authToken ?? process.env.TWILIO_AUTH_TOKEN;
  }

  // Plivo
  if (resolved.mode === "self-hosted" && resolved.provider === "plivo") {
    resolved.plivo = resolved.plivo ?? {};
    resolved.plivo.authId = resolved.plivo.authId ?? process.env.PLIVO_AUTH_ID;
    resolved.plivo.authToken = resolved.plivo.authToken ?? process.env.PLIVO_AUTH_TOKEN;
  }

  // Tunnel Config
  resolved.tunnel = resolved.tunnel ?? {
    provider: "none",
    allowNgrokFreeTierLoopbackBypass: false,
  };
  resolved.tunnel.allowNgrokFreeTierLoopbackBypass =
    resolved.tunnel.allowNgrokFreeTierLoopbackBypass ?? false;
  resolved.tunnel.ngrokAuthToken = resolved.tunnel.ngrokAuthToken ?? process.env.NGROK_AUTHTOKEN;
  resolved.tunnel.ngrokDomain = resolved.tunnel.ngrokDomain ?? process.env.NGROK_DOMAIN;

  // Webhook Security Config
  resolved.webhookSecurity = resolved.webhookSecurity ?? {
    allowedHosts: [],
    trustForwardingHeaders: false,
    trustedProxyIPs: [],
  };
  resolved.webhookSecurity.allowedHosts = resolved.webhookSecurity.allowedHosts ?? [];
  resolved.webhookSecurity.trustForwardingHeaders =
    resolved.webhookSecurity.trustForwardingHeaders ?? false;
  resolved.webhookSecurity.trustedProxyIPs = resolved.webhookSecurity.trustedProxyIPs ?? [];

  resolved.streaming.openai = resolved.streaming.openai ?? {
    model: "gpt-4o-transcribe",
    silenceDurationMs: 800,
    vadThreshold: 0.5,
  };
  resolved.streaming.openai.apiKey = resolved.streaming.openai.apiKey ?? process.env.OPENAI_API_KEY;
  resolved.streaming.deepgram = resolved.streaming.deepgram ?? {
    model: "nova-3",
    endpointingMs: 300,
    interimResults: true,
  };
  resolved.streaming.deepgram.apiKey =
    resolved.streaming.deepgram.apiKey ?? process.env.DEEPGRAM_API_KEY;

  return normalizeVoiceCallConfig(resolved);
}

/**
 * Validate that the configuration has all required fields for the selected provider.
 */
export function validateProviderConfig(config: VoiceCallConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!config.enabled) {
    return { valid: true, errors: [] };
  }

  if (config.mode === "vapi") {
    if (!config.vapi?.enabled) {
      return { valid: true, errors: [] };
    }

    if (!config.vapi?.apiKey) {
      errors.push(
        "plugins.entries.voice-call.config.vapi.apiKey is required (or set VAPI_API_KEY env)",
      );
    }
    if (!config.vapi?.assistantId) {
      errors.push("plugins.entries.voice-call.config.vapi.assistantId is required");
    }
    if (!config.vapi?.phoneNumberId) {
      errors.push("plugins.entries.voice-call.config.vapi.phoneNumberId is required");
    }
    if (config.vapi?.telephonyProvider !== "twilio") {
      errors.push(
        'plugins.entries.voice-call.config.vapi.telephonyProvider must be "twilio" for the simple Vapi path',
      );
    }
    if (config.vapi?.bridgeMode === "manual-public-url" && !config.vapi?.bridgeUrl) {
      errors.push("plugins.entries.voice-call.config.vapi.bridgeUrl is required");
    }
    if (!config.vapi?.bridgeAuthToken) {
      errors.push("plugins.entries.voice-call.config.vapi.bridgeAuthToken is required");
    }

    return { valid: errors.length === 0, errors };
  }

  if (!config.provider) {
    errors.push("plugins.entries.voice-call.config.provider is required");
  }

  if (!config.fromNumber && config.provider !== "mock") {
    errors.push("plugins.entries.voice-call.config.fromNumber is required");
  }

  if (config.provider === "telnyx") {
    if (!config.telnyx?.apiKey) {
      errors.push(
        "plugins.entries.voice-call.config.telnyx.apiKey is required (or set TELNYX_API_KEY env)",
      );
    }
    if (!config.telnyx?.connectionId) {
      errors.push(
        "plugins.entries.voice-call.config.telnyx.connectionId is required (or set TELNYX_CONNECTION_ID env)",
      );
    }
    if (!config.skipSignatureVerification && !config.telnyx?.publicKey) {
      errors.push(
        "plugins.entries.voice-call.config.telnyx.publicKey is required (or set TELNYX_PUBLIC_KEY env)",
      );
    }
  }

  if (config.provider === "twilio") {
    if (!config.twilio?.accountSid) {
      errors.push(
        "plugins.entries.voice-call.config.twilio.accountSid is required (or set TWILIO_ACCOUNT_SID env)",
      );
    }
    if (!config.twilio?.authToken) {
      errors.push(
        "plugins.entries.voice-call.config.twilio.authToken is required (or set TWILIO_AUTH_TOKEN env)",
      );
    }
  }

  if (config.provider === "plivo") {
    if (!config.plivo?.authId) {
      errors.push(
        "plugins.entries.voice-call.config.plivo.authId is required (or set PLIVO_AUTH_ID env)",
      );
    }
    if (!config.plivo?.authToken) {
      errors.push(
        "plugins.entries.voice-call.config.plivo.authToken is required (or set PLIVO_AUTH_TOKEN env)",
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

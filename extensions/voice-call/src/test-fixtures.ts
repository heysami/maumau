import type { VoiceCallConfig } from "./config.js";

export function createVoiceCallBaseConfig(params?: {
  provider?: "telnyx" | "twilio" | "plivo" | "mock";
  tunnelProvider?: "none" | "ngrok";
}): VoiceCallConfig {
  return {
    enabled: true,
    mode: "self-hosted",
    provider: params?.provider ?? "mock",
    vapi: {
      enabled: true,
      telephonyProvider: "twilio",
      preferredLanguage: "en",
      bridgeMode: "auto",
      bridgePath: "/plugins/voice-call/vapi",
      baseUrl: "https://api.vapi.ai",
    },
    fromNumber: "+15550001234",
    inboundPolicy: "disabled",
    allowFrom: [],
    outbound: { defaultMode: "notify", notifyHangupDelaySec: 3 },
    maxDurationSeconds: 300,
    staleCallReaperSeconds: 600,
    silenceTimeoutMs: 800,
    transcriptTimeoutMs: 180000,
    ringTimeoutMs: 30000,
    maxConcurrentCalls: 1,
    serve: { port: 3334, bind: "127.0.0.1", path: "/voice/webhook" },
    tailscale: { mode: "off", path: "/voice/webhook" },
    tunnel: {
      provider: params?.tunnelProvider ?? "none",
      allowNgrokFreeTierLoopbackBypass: false,
    },
    webhookSecurity: {
      allowedHosts: [],
      trustForwardingHeaders: false,
      trustedProxyIPs: [],
    },
    streaming: {
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
    },
    skipSignatureVerification: false,
    stt: { provider: "openai", model: "whisper-1" },
    tts: {
      provider: "openai",
      openai: { model: "gpt-4o-mini-tts", voice: "coral" },
    },
    responseTimeoutMs: 30000,
  };
}

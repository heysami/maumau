import type { MaumauPluginApi } from "../api.js";
import type { VoiceCallTtsConfig } from "./config.js";

export type CoreConfig = {
  agents?: {
    defaults?: {
      model?: string | { primary?: string };
    };
  };
  session?: {
    store?: string;
  };
  messages?: {
    tts?: VoiceCallTtsConfig;
  };
  [key: string]: unknown;
};

export type CoreAgentDeps = MaumauPluginApi["runtime"]["agent"];

import WebSocket from "ws";
import type { RealtimeSTTProvider, RealtimeSTTSession } from "./stt-realtime.js";

export interface DeepgramRealtimeSTTConfig {
  apiKey: string;
  model?: string;
  languageCode?: string;
  endpointingMs?: number;
  interimResults?: boolean;
}

export class DeepgramRealtimeSTTProvider implements RealtimeSTTProvider {
  readonly name = "deepgram-realtime";
  private readonly apiKey: string;
  private readonly model: string;
  private readonly languageCode?: string;
  private readonly endpointingMs: number;
  private readonly interimResults: boolean;

  constructor(config: DeepgramRealtimeSTTConfig) {
    if (!config.apiKey) {
      throw new Error("Deepgram API key required for realtime STT");
    }
    this.apiKey = config.apiKey;
    this.model = config.model || "nova-3";
    this.languageCode = config.languageCode?.trim() || undefined;
    this.endpointingMs = config.endpointingMs ?? 300;
    this.interimResults = config.interimResults ?? true;
  }

  createSession(): RealtimeSTTSession {
    return new DeepgramRealtimeSTTSession({
      apiKey: this.apiKey,
      model: this.model,
      languageCode: this.languageCode,
      endpointingMs: this.endpointingMs,
      interimResults: this.interimResults,
    });
  }
}

class DeepgramRealtimeSTTSession implements RealtimeSTTSession {
  private static readonly KEEP_ALIVE_INTERVAL_MS = 3000;

  private ws: WebSocket | null = null;
  private connected = false;
  private closed = false;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private finalizedSegments: string[] = [];
  private onTranscriptCallback: ((transcript: string) => void) | null = null;
  private onPartialCallback: ((partial: string) => void) | null = null;
  private onSpeechStartCallback: (() => void) | null = null;

  constructor(
    private readonly config: {
      apiKey: string;
      model: string;
      languageCode?: string;
      endpointingMs: number;
      interimResults: boolean;
    },
  ) {}

  async connect(): Promise<void> {
    this.closed = false;
    const searchParams = new URLSearchParams({
      model: this.config.model,
      encoding: "mulaw",
      sample_rate: "8000",
      channels: "1",
      punctuate: "true",
      vad_events: "true",
      interim_results: this.config.interimResults ? "true" : "false",
      endpointing: String(this.config.endpointingMs),
    });
    if (this.config.languageCode) {
      searchParams.set("language", this.config.languageCode);
    }
    const url = `wss://api.deepgram.com/v1/listen?${searchParams.toString()}`;

    await new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(url, {
        headers: {
          Authorization: `Token ${this.config.apiKey}`,
        },
      });

      this.ws.on("open", () => {
        this.connected = true;
        this.startKeepAlive();
        resolve();
      });

      this.ws.on("message", (data: Buffer) => {
        try {
          const event = JSON.parse(data.toString());
          this.handleEvent(event);
        } catch (error) {
          console.error("[DeepgramRealtimeSTT] Failed to parse event:", error);
        }
      });

      this.ws.on("error", (error) => {
        if (!this.connected) {
          reject(error);
          return;
        }
        console.error("[DeepgramRealtimeSTT] WebSocket error:", error);
      });

      this.ws.on("close", () => {
        this.stopKeepAlive();
        this.connected = false;
      });

      setTimeout(() => {
        if (!this.connected) {
          reject(new Error("Deepgram realtime STT connection timeout"));
        }
      }, 10_000);
    });
  }

  private startKeepAlive(): void {
    this.stopKeepAlive();
    this.keepAliveTimer = setInterval(() => {
      if (this.ws?.readyState !== WebSocket.OPEN) {
        return;
      }
      this.ws.send(JSON.stringify({ type: "KeepAlive" }));
    }, DeepgramRealtimeSTTSession.KEEP_ALIVE_INTERVAL_MS);
    this.keepAliveTimer.unref?.();
  }

  private stopKeepAlive(): void {
    if (!this.keepAliveTimer) {
      return;
    }
    clearInterval(this.keepAliveTimer);
    this.keepAliveTimer = null;
  }

  private emitFinalTranscript(): void {
    const transcript = this.finalizedSegments.join(" ").trim();
    this.finalizedSegments = [];
    if (transcript) {
      this.onTranscriptCallback?.(transcript);
    }
  }

  private handleEvent(event: {
    type?: string;
    is_final?: boolean;
    speech_final?: boolean;
    channel?: {
      alternatives?: Array<{ transcript?: string }>;
    };
  }): void {
    const type = event.type ?? "Results";
    if (type === "SpeechStarted") {
      this.onSpeechStartCallback?.();
      return;
    }
    if (type === "UtteranceEnd") {
      this.emitFinalTranscript();
      return;
    }
    if (type !== "Results") {
      return;
    }

    const transcript = event.channel?.alternatives?.[0]?.transcript?.trim() ?? "";
    if (!transcript) {
      return;
    }

    if (event.is_final) {
      this.finalizedSegments.push(transcript);
      if (event.speech_final) {
        this.emitFinalTranscript();
      }
      return;
    }

    const partial = [...this.finalizedSegments, transcript].join(" ").trim();
    if (partial) {
      this.onPartialCallback?.(partial);
    }
  }

  sendAudio(audio: Buffer): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      return;
    }
    this.ws.send(audio);
  }

  onPartial(callback: (partial: string) => void): void {
    this.onPartialCallback = callback;
  }

  onTranscript(callback: (transcript: string) => void): void {
    this.onTranscriptCallback = callback;
  }

  onSpeechStart(callback: () => void): void {
    this.onSpeechStartCallback = callback;
  }

  async waitForTranscript(timeoutMs = 30_000): Promise<string> {
    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.onTranscriptCallback = null;
        reject(new Error("Transcript timeout"));
      }, timeoutMs);

      this.onTranscriptCallback = (transcript) => {
        clearTimeout(timeout);
        this.onTranscriptCallback = null;
        resolve(transcript);
      };
    });
  }

  close(): void {
    this.closed = true;
    this.stopKeepAlive();
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "Finalize" }));
    }
    this.ws?.close();
    this.ws = null;
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }
}

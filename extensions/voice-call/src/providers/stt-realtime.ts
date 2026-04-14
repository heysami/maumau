export interface RealtimeSTTSession {
  connect(): Promise<void>;
  sendAudio(audio: Buffer): void;
  waitForTranscript(timeoutMs?: number): Promise<string>;
  onPartial(callback: (partial: string) => void): void;
  onTranscript(callback: (transcript: string) => void): void;
  onSpeechStart(callback: () => void): void;
  close(): void;
  isConnected(): boolean;
}

export interface RealtimeSTTProvider {
  readonly name: string;
  createSession(): RealtimeSTTSession;
}

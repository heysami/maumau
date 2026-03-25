import { transcribeFirstAudio as transcribeFirstAudioImpl } from "maumau/plugin-sdk/media-runtime";

type TranscribeFirstAudio = typeof import("maumau/plugin-sdk/media-runtime").transcribeFirstAudio;

export async function transcribeFirstAudio(
  ...args: Parameters<TranscribeFirstAudio>
): ReturnType<TranscribeFirstAudio> {
  return await transcribeFirstAudioImpl(...args);
}

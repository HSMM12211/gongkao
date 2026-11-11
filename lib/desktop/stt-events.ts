import type { LocalSpeechRuntimeHealth } from "@/types/local-speech-runtime"

export const STT_STATUS_EVENT = "stt://status"
export const STT_TRANSCRIPT_EVENT = "stt://transcript"

export type DesktopSpeechStatus = LocalSpeechRuntimeHealth["status"]

export type DesktopSpeechStatusPayload = LocalSpeechRuntimeHealth & {
  audioLevel?: number[]
}

export type DesktopSpeechTranscriptPayload = {
  kind: "partial" | "final"
  text: string
  durationMs?: number
}

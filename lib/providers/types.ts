import type { AiDiagnosis, AiProviderSettings, SpeechProviderSettings } from "@/lib/storage/schema"

export type { AiDiagnosis, AiProviderSettings, SpeechProviderSettings }

export type TranscriptionResult = {
  text: string
  provider: "mock" | "api" | "local"
  durationMs: number
}

export type SpeechTranscriptionRequest = {
  audioBlob?: Blob
  seedText: string
  settings: SpeechProviderSettings
}

export type AiDiagnosisRequest = {
  question: {
    title: string
    type: string
    material: string
    prompt: string
    keywords: string[]
    aiAnswer: string
  }
  answer: string
  settings: AiProviderSettings
}

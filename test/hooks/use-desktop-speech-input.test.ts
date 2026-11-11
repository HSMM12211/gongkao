import { describe, expect, it } from "vitest"
import {
  appendFinalTranscript,
  reduceDesktopSpeechStatus,
  shouldUseDesktopSpeechInput,
} from "@/hooks/use-desktop-speech-input"

describe("desktop speech input helpers", () => {
  it("appends final transcript without duplicating whitespace", () => {
    expect(appendFinalTranscript("", " 你好 ")).toBe("你好")
    expect(appendFinalTranscript("你好", " 世界 ")).toBe("你好世界")
  })

  it("uses desktop speech only for local mode when desktop runtime is available", () => {
    expect(shouldUseDesktopSpeechInput("local", true)).toBe(true)
    expect(shouldUseDesktopSpeechInput("api", true)).toBe(false)
    expect(shouldUseDesktopSpeechInput("local", false)).toBe(false)
  })

  it("does not overwrite text when empty speech is reported", () => {
    const current = {
      status: "recording" as const,
      transcript: "already typed",
      isProcessing: true,
    }

    const next = reduceDesktopSpeechStatus(current, {
      status: "empty-speech",
      endpoint: "tauri://local-stt",
      engine: "whisper-rs",
      message: "No clear speech was detected",
    })

    expect(next.transcript).toBe("already typed")
    expect(next.status).toBe("empty-speech")
    expect(next.isProcessing).toBe(false)
  })

  it("marks processing while stop waits for final transcript", () => {
    const current = {
      status: "recording" as const,
      transcript: "",
      isProcessing: false,
    }

    const next = reduceDesktopSpeechStatus(current, {
      status: "processing",
      endpoint: "tauri://local-stt",
      engine: "whisper-rs",
      message: "Recognizing local speech",
    })

    expect(next.status).toBe("processing")
    expect(next.isProcessing).toBe(true)
  })

  it("surfaces missing microphone status as a visible error", () => {
    const current = {
      status: "recording" as const,
      transcript: "",
      isProcessing: true,
    }

    const next = reduceDesktopSpeechStatus(current, {
      status: "mic-not-found",
      endpoint: "tauri://local-stt",
      engine: "whisper-rs",
      message: "microphone input device was not found",
    })

    expect(next.status).toBe("mic-not-found")
    expect(next.isProcessing).toBe(false)
    expect(next.error).toBe("microphone input device was not found")
  })
})

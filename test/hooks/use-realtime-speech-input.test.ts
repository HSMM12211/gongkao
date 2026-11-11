import { describe, expect, it } from "vitest"
import { getMicrophoneErrorMessage, joinFinalSpeechSegments } from "@/hooks/use-realtime-speech-input"

describe("use realtime speech input helpers", () => {
  it("joins final speech segments without adding duplicate whitespace", () => {
    expect(joinFinalSpeechSegments([" 推进治理 ", "", "现代化"])).toBe("推进治理现代化")
  })

  it("maps microphone permission errors to user-facing text", () => {
    expect(getMicrophoneErrorMessage(new DOMException("denied", "NotAllowedError"))).toBe("麦克风权限被拒绝")
  })
})

import { describe, expect, it } from "vitest"
import { getSpeechErrorMessage, isLocalSpeechUnavailableInBrowser } from "@/lib/providers/speech-errors"

describe("speech error helpers", () => {
  it("extracts Tauri serialized error messages", () => {
    expect(getSpeechErrorMessage({ code: "model-missing", message: "Please download a local ASR model." }, "fallback")).toBe(
      "Please download a local ASR model.",
    )
  })

  it("uses string errors before falling back", () => {
    expect(getSpeechErrorMessage("microphone permission denied", "fallback")).toBe("microphone permission denied")
    expect(getSpeechErrorMessage(null, "fallback")).toBe("fallback")
  })

  it("rewrites Windows connection timeout errors into actionable ASR guidance", () => {
    expect(
      getSpeechErrorMessage(
        {
          code: "runtime-failed",
          message: "由于连接方在一段时间后没有正确答复或连接的主机没有反应，连接尝试失败。 (os error 10060)",
        },
        "fallback",
      ),
    ).toContain("语音识别连接超时")
  })

  it("treats local speech as unavailable in browser-only development mode", () => {
    expect(isLocalSpeechUnavailableInBrowser("local", false)).toBe(true)
    expect(isLocalSpeechUnavailableInBrowser("local", true)).toBe(false)
    expect(isLocalSpeechUnavailableInBrowser("api", false)).toBe(false)
  })
})

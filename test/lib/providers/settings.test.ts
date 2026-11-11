import { describe, expect, it } from "vitest"
import {
  DEFAULT_AI_SETTINGS,
  DEFAULT_SPEECH_SETTINGS,
  getSpeechSettingsFields,
  normalizeSpeechSettings,
  validateAiSettings,
  validateSpeechSettings,
} from "@/lib/providers/settings"

describe("provider settings validation", () => {
  it("accepts mock mode with empty endpoints", () => {
    expect(validateSpeechSettings(DEFAULT_SPEECH_SETTINGS)).toEqual([])
    expect(validateAiSettings(DEFAULT_AI_SETTINGS)).toEqual([])
  })

  it("allows blank speech API endpoint because official Volc ASR has a default", () => {
    expect(validateSpeechSettings({ ...DEFAULT_SPEECH_SETTINGS, mode: "api", apiEndpoint: "" })).toEqual([])
    expect(validateAiSettings({ ...DEFAULT_AI_SETTINGS, mode: "api", apiEndpoint: "" })).toEqual([
      "API 模式需要填写 AI API Endpoint",
    ])
  })

  it("does not require users to configure a local speech endpoint", () => {
    expect(validateSpeechSettings({ ...DEFAULT_SPEECH_SETTINGS, mode: "local", localEndpoint: "" })).toEqual([])
    expect(validateAiSettings({ ...DEFAULT_AI_SETTINGS, mode: "local", localEndpoint: "" })).toEqual([
      "本地模式需要填写 AI 本地服务 Endpoint",
    ])
  })

  it("accepts official Volc ASR websocket endpoints in api settings", () => {
    expect(
      validateSpeechSettings({
        ...DEFAULT_SPEECH_SETTINGS,
        mode: "api",
        apiEndpoint: "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async",
      }),
    ).toEqual([])
  })

  it("rejects non-official speech API endpoints in api settings", () => {
    expect(
      validateSpeechSettings({
        ...DEFAULT_SPEECH_SETTINGS,
        mode: "api",
        apiEndpoint: "https://example.com/transcribe",
      })[0],
    ).toContain("火山官方 ASR Endpoint 必须使用官方 wss 地址")
  })

  it("normalizes legacy API endpoint values back to official Volc ASR", () => {
    expect(
      normalizeSpeechSettings({
        ...DEFAULT_SPEECH_SETTINGS,
        mode: "api",
        apiEndpoint: "https://example.com/transcribe",
      }).apiEndpoint,
    ).toBe("wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async")
  })

  it("shows only the fields required by the selected speech mode", () => {
    expect(getSpeechSettingsFields("mock")).toEqual({
      apiEndpoint: false,
      apiKey: false,
      volcResourceId: false,
      localStatus: false,
      localAdvancedDiagnostics: false,
      relayHint: false,
    })
    expect(getSpeechSettingsFields("api")).toEqual({
      apiEndpoint: true,
      apiKey: true,
      volcResourceId: true,
      localStatus: false,
      localAdvancedDiagnostics: false,
      relayHint: true,
    })
    expect(getSpeechSettingsFields("local")).toEqual({
      apiEndpoint: false,
      apiKey: false,
      volcResourceId: false,
      localStatus: true,
      localAdvancedDiagnostics: true,
      relayHint: false,
    })
  })

  it("normalizes legacy speech settings with managed local realtime defaults", () => {
    expect(
      normalizeSpeechSettings({
        mode: "local",
        apiEndpoint: "",
        apiKey: "",
        localEndpoint: "http://127.0.0.1:8001/transcribe",
      }),
    ).toMatchObject({
      mode: "local",
      localRuntime: {
        managed: true,
        realtimeEndpoint: "ws://127.0.0.1:8787/stt",
        engine: "vosk-streaming",
        sampleRate: 16000,
        chunkMs: 200,
        showAdvancedDiagnostics: false,
      },
    })
  })
})

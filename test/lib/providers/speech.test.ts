import { describe, expect, it } from "vitest"
import {
  assertSupportedSpeechEndpoint,
  buildWebSocketRelayStartMessage,
  extractTranscriptionText,
  getSpeechTransportKind,
  normalizeVolcAsrEndpoint,
  testSpeechConnection,
  transcribeSpeech,
  transcribeWithMock,
} from "@/lib/providers/speech"
import { DEFAULT_SPEECH_SETTINGS } from "@/lib/providers/settings"

describe("speech provider helpers", () => {
  it("returns seed text for mock transcription", async () => {
    await expect(transcribeWithMock("夯实基础设施")).resolves.toEqual({
      text: "夯实基础设施",
      provider: "mock",
      durationMs: 0,
    })
  })

  it("classifies speech API endpoints", () => {
    expect(getSpeechTransportKind("https://example.com/transcribe")).toBe("http-upload")
    expect(getSpeechTransportKind("ws://127.0.0.1:8787/asr")).toBe("websocket-relay")
    expect(getSpeechTransportKind("wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async")).toBe(
      "volc-official",
    )
    expect(() =>
      assertSupportedSpeechEndpoint("wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async"),
    ).not.toThrow()
  })

  it("normalizes official Volc ASR endpoints and rejects legacy API hosts", () => {
    expect(normalizeVolcAsrEndpoint("")).toBe("wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async")
    expect(normalizeVolcAsrEndpoint(" wss://openspeech.bytedance.com/api/v3/sauc/bigmodel ")).toBe(
      "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel",
    )
    expect(() => normalizeVolcAsrEndpoint("https://example.com/transcribe")).toThrow(
      "火山官方 ASR Endpoint 必须使用官方 wss 地址",
    )
  })

  it("extracts transcription text from common response shapes", () => {
    expect(extractTranscriptionText({ text: "推进数字乡村" })).toBe("推进数字乡村")
    expect(extractTranscriptionText({ result: { text: "夯实基层治理" } })).toBe("夯实基层治理")
    expect(extractTranscriptionText({ transcript: "优化公共服务" })).toBe("优化公共服务")
  })

  it("builds a WebSocket relay start message without Volc headers in the browser", () => {
    expect(
      buildWebSocketRelayStartMessage({
        apiKey: "token",
        seedText: "数字乡村",
        mimeType: "audio/webm;codecs=opus",
        chunkMs: 200,
      }),
    ).toEqual({
      type: "start",
      provider: "volc-bigasr-relay",
      apiKey: "token",
      seedText: "数字乡村",
      mimeType: "audio/webm;codecs=opus",
      chunkMs: 200,
    })
  })

  it("requires the desktop bridge for official Volc ASR websocket transcription", async () => {
    await expect(
      transcribeSpeech({
        audioBlob: new Blob(["audio"], { type: "audio/webm" }),
        seedText: "数字乡村",
        settings: {
          ...DEFAULT_SPEECH_SETTINGS,
          mode: "api",
          apiEndpoint: "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async",
          apiKey: "token",
        },
      }),
    ).rejects.toThrow("火山官方 ASR 需要桌面应用中转")
  })

  it("tests mock speech connection without network calls", async () => {
    const result = await testSpeechConnection({
      ...DEFAULT_SPEECH_SETTINGS,
      mode: "mock",
      apiEndpoint: "",
      apiKey: "",
    })

    expect(result).toEqual({
      ok: true,
      message: "模拟识别可用",
      transportKind: "mock",
    })
  })

  it("tests local HTTP speech endpoints with a lightweight HEAD request", async () => {
    const calls: Array<{ endpoint: string; init?: RequestInit }> = []
    const fetchImpl: typeof fetch = async (endpoint, init) => {
      calls.push({ endpoint: String(endpoint), init })
      return new Response(null, { status: 204 })
    }

    const result = await testSpeechConnection(
      {
        ...DEFAULT_SPEECH_SETTINGS,
        mode: "local",
        localEndpoint: "https://example.com/transcribe",
        apiKey: "token",
      },
      { fetchImpl },
    )

    expect(result.ok).toBe(true)
    expect(result.transportKind).toBe("http-upload")
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      endpoint: "https://example.com/transcribe",
      init: {
        method: "HEAD",
        headers: undefined,
      },
    })
  })

  it("rejects failed local HTTP speech connection tests", async () => {
    const fetchImpl: typeof fetch = async () => new Response(null, { status: 401 })

    await expect(
      testSpeechConnection(
        {
          ...DEFAULT_SPEECH_SETTINGS,
          mode: "local",
          localEndpoint: "https://example.com/transcribe",
          apiKey: "bad-token",
        },
        { fetchImpl },
      ),
    ).rejects.toThrow("语音识别服务已响应，但鉴权失败")
  })
})

import { describe, expect, it } from "vitest"
import {
  buildRealtimeStartMessage,
  createRealtimeSpeechSession,
  parseRealtimeSpeechMessage,
} from "@/lib/providers/speech-realtime"

describe("realtime speech protocol", () => {
  it("builds a local realtime start message", () => {
    expect(
      buildRealtimeStartMessage({
        sessionId: "abc",
        engine: "vosk-streaming",
        language: "zh-CN",
        sampleRate: 16000,
        chunkMs: 200,
        modelPath: "models/vosk-model-small-cn-0.22",
      }),
    ).toEqual({
      type: "start",
      sessionId: "abc",
      engine: "vosk",
      language: "zh-CN",
      sampleRate: 16000,
      chunkMs: 200,
      modelPath: "models/vosk-model-small-cn-0.22",
    })
  })

  it("parses partial and final server messages", () => {
    expect(parseRealtimeSpeechMessage(JSON.stringify({ type: "partial", text: "推进" }))).toEqual({
      type: "partial",
      text: "推进",
    })
    expect(parseRealtimeSpeechMessage(JSON.stringify({ type: "final", text: "推进治理现代化" }))).toEqual({
      type: "final",
      text: "推进治理现代化",
    })
  })

  it("parses error server messages", () => {
    expect(parseRealtimeSpeechMessage(JSON.stringify({ type: "error", message: "模型缺失" }))).toEqual({
      type: "error",
      message: "模型缺失",
    })
  })

  it("sends start and binary audio frames through an injected websocket", async () => {
    const sent: unknown[] = []

    class FakeWebSocket {
      static OPEN = 1
      readyState = FakeWebSocket.OPEN
      onopen: (() => void) | null = null
      onmessage: ((event: { data: unknown }) => void) | null = null
      onerror: (() => void) | null = null
      onclose: (() => void) | null = null

      constructor(readonly endpoint: string) {
        setTimeout(() => this.onopen?.(), 0)
      }

      send(data: unknown) {
        sent.push(data)
      }

      close() {
        this.onclose?.()
      }
    }

    const startMessage = buildRealtimeStartMessage({
      sessionId: "abc",
      engine: "vosk-streaming",
      language: "zh-CN",
      sampleRate: 16000,
      chunkMs: 200,
      modelPath: "models/vosk-model-small-cn-0.22",
    })
    const session = createRealtimeSpeechSession({
      endpoint: "ws://127.0.0.1:8787/stt",
      startMessage,
      webSocketCtor: FakeWebSocket as unknown as typeof WebSocket,
    })

    const audio = new ArrayBuffer(4)
    await session.open()
    await session.sendAudio(audio)
    session.stop()

    expect(sent[0]).toBe(JSON.stringify(startMessage))
    expect(sent[1]).toBe(audio)
    expect(sent[2]).toBe(JSON.stringify({ type: "stop", sessionId: "abc" }))
  })
})

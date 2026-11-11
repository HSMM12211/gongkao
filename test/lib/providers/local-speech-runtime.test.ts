import { describe, expect, it } from "vitest"
import { DEFAULT_SPEECH_SETTINGS } from "@/lib/providers/settings"
import {
  ensureLocalSpeechRuntime,
  getInternalLocalSpeechEndpoint,
  probeLocalSpeechRuntime,
  shouldRequireSpeechEndpoint,
} from "@/lib/providers/local-speech-runtime"
import type { LocalSpeechRuntimeBridge } from "@/types/local-speech-runtime"

describe("local speech runtime facade", () => {
  it("uses the managed internal realtime endpoint", () => {
    expect(getInternalLocalSpeechEndpoint(DEFAULT_SPEECH_SETTINGS)).toBe("ws://127.0.0.1:8787/stt")
  })

  it("delegates startup to a desktop bridge when one is available", async () => {
    const bridge: LocalSpeechRuntimeBridge = {
      ensureStarted: async () => ({
        status: "ready",
        endpoint: "ws://127.0.0.1:8787/stt",
        engine: "vosk-streaming",
        message: "本地语音识别可用",
      }),
      restart: async () => {
        throw new Error("not used")
      },
      getHealth: async () => {
        throw new Error("not used")
      },
    }

    await expect(ensureLocalSpeechRuntime(DEFAULT_SPEECH_SETTINGS, { bridge })).resolves.toMatchObject({
      status: "ready",
      message: "本地语音识别可用",
    })
  })

  it("probes the managed websocket endpoint in browser development mode", async () => {
    class FakeWebSocket {
      static OPEN = 1
      readyState = FakeWebSocket.OPEN
      onopen: (() => void) | null = null
      onmessage: ((event: { data: unknown }) => void) | null = null
      onerror: (() => void) | null = null

      constructor(readonly endpoint: string) {
        setTimeout(() => this.onopen?.(), 0)
      }

      send(data: unknown) {
        if (data === JSON.stringify({ type: "ping" })) {
          setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: "ready" }) }), 0)
        }
      }

      close() {}
    }

    await expect(
      probeLocalSpeechRuntime(DEFAULT_SPEECH_SETTINGS, {
        webSocketCtor: FakeWebSocket as unknown as typeof WebSocket,
        timeoutMs: 50,
      }),
    ).resolves.toMatchObject({
      status: "ready",
      endpoint: "ws://127.0.0.1:8787/stt",
    })
  })

  it("does not require endpoint fields for local mode", () => {
    expect(shouldRequireSpeechEndpoint("local")).toBe(false)
  })

  it("requires endpoint fields for cloud or service modes", () => {
    expect(shouldRequireSpeechEndpoint("api")).toBe(true)
    expect(shouldRequireSpeechEndpoint("websocket")).toBe(true)
    expect(shouldRequireSpeechEndpoint("faster-whisper")).toBe(true)
  })
})

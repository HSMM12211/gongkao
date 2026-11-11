"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { downsampleFloat32, floatToPcm16, pcm16ToArrayBuffer } from "@/lib/audio/pcm"
import { ensureLocalSpeechRuntime, getInternalLocalSpeechEndpoint } from "@/lib/providers/local-speech-runtime"
import {
  buildRealtimeStartMessage,
  createRealtimeSpeechSession,
  type RealtimeSpeechSession,
  type RealtimeSpeechState,
} from "@/lib/providers/speech-realtime"
import { loadSpeechSettings } from "@/lib/providers/settings"

export type RealtimeSpeechInputResult = {
  state: RealtimeSpeechState
  recording: boolean
  partialText: string
  finalText: string
  error: string | null
  start: () => Promise<void>
  stop: () => Promise<string>
  cancel: () => void
}

type AudioContextWithClose = AudioContext & {
  close: () => Promise<void>
}

export function joinFinalSpeechSegments(segments: string[]) {
  return segments.map((segment) => segment.trim()).filter(Boolean).join("")
}

export function getMicrophoneErrorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === "NotAllowedError") return "麦克风权限被拒绝"
  if (error instanceof DOMException && error.name === "NotFoundError") return "未检测到麦克风设备"
  return error instanceof Error ? error.message : "麦克风启动失败"
}

function concatFloat32(chunks: Float32Array[], length: number) {
  const output = new Float32Array(length)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.length
  }
  return output
}

export function useRealtimeSpeechInput(): RealtimeSpeechInputResult {
  const [state, setState] = useState<RealtimeSpeechState>("idle")
  const [partialText, setPartialText] = useState("")
  const [finalText, setFinalText] = useState("")
  const [error, setError] = useState<string | null>(null)

  const audioContextRef = useRef<AudioContextWithClose | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const workletRef = useRef<AudioWorkletNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const sessionRef = useRef<RealtimeSpeechSession | null>(null)
  const finalSegmentsRef = useRef<string[]>([])
  const pendingChunksRef = useRef<Float32Array[]>([])
  const pendingLengthRef = useRef(0)
  const closeResolverRef = useRef<(() => void) | null>(null)

  const cleanup = useCallback(() => {
    closeResolverRef.current?.()
    closeResolverRef.current = null
    sessionRef.current?.close()
    sessionRef.current = null
    workletRef.current?.disconnect()
    workletRef.current = null
    sourceRef.current?.disconnect()
    sourceRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    void audioContextRef.current?.close().catch(() => undefined)
    audioContextRef.current = null
    pendingChunksRef.current = []
    pendingLengthRef.current = 0
  }, [])

  const flushAudio = useCallback(async () => {
    const session = sessionRef.current
    if (!session || pendingLengthRef.current === 0) return
    const merged = concatFloat32(pendingChunksRef.current, pendingLengthRef.current)
    pendingChunksRef.current = []
    pendingLengthRef.current = 0
    await session.sendAudio(pcm16ToArrayBuffer(floatToPcm16(merged)))
  }, [])

  const start = useCallback(async () => {
    if (state === "connecting" || state === "recording" || state === "processing") return

    setState("connecting")
    setError(null)
    setPartialText("")
    setFinalText("")
    finalSegmentsRef.current = []

    try {
      const settings = await loadSpeechSettings()
      if (settings.mode !== "local" || settings.localRuntime.engine !== "vosk-streaming") {
        throw new Error("请先在设置中切换到本地服务")
      }

      const health = await ensureLocalSpeechRuntime(settings)
      if (health.status !== "ready") {
        throw new Error(health.message)
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("当前环境不支持麦克风录音")
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const audioContext = new AudioContext() as AudioContextWithClose
      await audioContext.audioWorklet.addModule("/worklets/pcm-recorder.worklet.js")

      const sessionId = crypto.randomUUID()
      const session = createRealtimeSpeechSession({
        endpoint: getInternalLocalSpeechEndpoint(settings),
        startMessage: buildRealtimeStartMessage({
          sessionId,
          engine: settings.localRuntime.engine,
          language: "zh-CN",
          sampleRate: settings.localRuntime.sampleRate,
          chunkMs: settings.localRuntime.chunkMs,
          modelPath: settings.localRuntime.modelPath,
        }),
        onPartial: setPartialText,
        onFinal: (text) => {
          if (!text.trim()) return
          finalSegmentsRef.current.push(text)
          const joined = joinFinalSpeechSegments(finalSegmentsRef.current)
          setFinalText(joined)
          setPartialText("")
        },
        onRefined: (text) => {
          if (!text.trim()) return
          finalSegmentsRef.current = [text]
          setFinalText(text.trim())
        },
        onError: (err) => {
          const message = err.message || "本地离线识别启动失败"
          setError(message)
          setState("error")
        },
        onClose: () => {
          closeResolverRef.current?.()
          closeResolverRef.current = null
        },
      })

      await session.open()

      const source = audioContext.createMediaStreamSource(stream)
      const worklet = new AudioWorkletNode(audioContext, "pcm-recorder")
      const targetSamples = Math.max(1, Math.round((settings.localRuntime.sampleRate * settings.localRuntime.chunkMs) / 1000))

      worklet.port.onmessage = (event: MessageEvent<Float32Array>) => {
        const downsampled = downsampleFloat32(event.data, audioContext.sampleRate, settings.localRuntime.sampleRate)
        pendingChunksRef.current.push(downsampled)
        pendingLengthRef.current += downsampled.length
        if (pendingLengthRef.current >= targetSamples) {
          void flushAudio().catch((err) => {
            const message = err instanceof Error ? err.message : "本地实时语音发送失败"
            setError(message)
            setState("error")
            cleanup()
          })
        }
      }

      source.connect(worklet)
      worklet.connect(audioContext.destination)

      streamRef.current = stream
      audioContextRef.current = audioContext
      sourceRef.current = source
      workletRef.current = worklet
      sessionRef.current = session
      setState("recording")
    } catch (err) {
      cleanup()
      const message = getMicrophoneErrorMessage(err)
      setError(message)
      setState("error")
      throw new Error(message)
    }
  }, [cleanup, flushAudio, state])

  const stop = useCallback(async () => {
    if (state !== "recording" && state !== "error") return joinFinalSpeechSegments(finalSegmentsRef.current)

    setState("processing")
    try {
      await flushAudio()
      const closePromise = new Promise<void>((resolve) => {
        closeResolverRef.current = resolve
      })
      sessionRef.current?.stop()
      await Promise.race([closePromise, new Promise<void>((resolve) => setTimeout(resolve, 1_200))])
      return joinFinalSpeechSegments(finalSegmentsRef.current)
    } finally {
      cleanup()
      setState("idle")
    }
  }, [cleanup, flushAudio, state])

  const cancel = useCallback(() => {
    cleanup()
    setPartialText("")
    setFinalText("")
    finalSegmentsRef.current = []
    setState("idle")
  }, [cleanup])

  useEffect(() => cleanup, [cleanup])

  return {
    state,
    recording: state === "recording",
    partialText,
    finalText,
    error,
    start,
    stop,
    cancel,
  }
}

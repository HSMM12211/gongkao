"use client"

import { useRef, useState } from "react"
import { createTauriSpeechRuntime, type TauriSpeechRuntime } from "@/lib/desktop/tauri-speech-runtime"
import { downsampleFloat32, floatToPcm16, pcm16ToArrayBuffer } from "@/lib/audio/pcm"
import { loadSpeechSettings } from "@/lib/providers/settings"
import {
  createSpeechRelaySession,
  getSpeechEndpoint,
  assertSupportedSpeechEndpoint,
  SPEECH_STREAM_CHUNK_MS,
  transcribeSpeech,
  type SpeechRelaySession,
  VOLC_ASR_DESKTOP_BRIDGE_ERROR,
  DEFAULT_VOLC_ASR_RESOURCE_ID,
} from "@/lib/providers/speech"
import { getSpeechErrorMessage } from "@/lib/providers/speech-errors"

type AudioContextWithClose = AudioContext & {
  close: () => Promise<void>
}

function isTauriDesktopEnvironment() {
  if (typeof window === "undefined") return false
  return "__TAURI_INTERNALS__" in window || "__TAURI_IPC__" in window
}

async function loadDesktopRuntime(): Promise<TauriSpeechRuntime> {
  const [{ invoke }, { listen }] = await Promise.all([
    import("@tauri-apps/api/core"),
    import("@tauri-apps/api/event"),
  ])
  return createTauriSpeechRuntime({ invoke, listen })
}

function mergePcmChunks(chunks: Uint8Array[], length: number) {
  const output = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  return output
}

export function useSpeechTranscription(seedText: string) {
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const relaySessionRef = useRef<SpeechRelaySession | null>(null)
  const relayErrorRef = useRef<Error | null>(null)
  const mimeTypeRef = useRef("audio/webm")
  const volcPcmModeRef = useRef(false)
  const volcPcmChunksRef = useRef<Uint8Array[]>([])
  const volcPcmLengthRef = useRef(0)
  const volcAudioContextRef = useRef<AudioContextWithClose | null>(null)
  const volcWorkletRef = useRef<AudioWorkletNode | null>(null)
  const volcSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const volcGainRef = useRef<GainNode | null>(null)

  const cleanupVolcPcmCapture = () => {
    volcWorkletRef.current?.disconnect()
    volcWorkletRef.current = null
    volcSourceRef.current?.disconnect()
    volcSourceRef.current = null
    volcGainRef.current?.disconnect()
    volcGainRef.current = null
    void volcAudioContextRef.current?.close().catch(() => undefined)
    volcAudioContextRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  const startRecording = async () => {
    setError(null)
    const settings = await loadSpeechSettings()
    relayErrorRef.current = null

    if (settings.mode === "mock") {
      setRecording(true)
      chunksRef.current = []
      return
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("当前环境不支持麦克风录音")
    }

    const endpoint = getSpeechEndpoint(settings)
    const transportKind = assertSupportedSpeechEndpoint(endpoint)

    if (settings.mode === "api" && transportKind === "volc-official" && !isTauriDesktopEnvironment()) {
      throw new Error(VOLC_ASR_DESKTOP_BRIDGE_ERROR)
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    if (settings.mode === "api" && transportKind === "volc-official") {
      const audioContext = new AudioContext() as AudioContextWithClose
      await audioContext.audioWorklet.addModule("/worklets/pcm-recorder.worklet.js")
      const source = audioContext.createMediaStreamSource(stream)
      const worklet = new AudioWorkletNode(audioContext, "pcm-recorder")
      const gain = audioContext.createGain()
      gain.gain.value = 0

      volcPcmModeRef.current = true
      volcPcmChunksRef.current = []
      volcPcmLengthRef.current = 0
      streamRef.current = stream
      volcAudioContextRef.current = audioContext
      volcSourceRef.current = source
      volcWorkletRef.current = worklet
      volcGainRef.current = gain

      worklet.port.onmessage = (event: MessageEvent<Float32Array>) => {
        const downsampled = downsampleFloat32(event.data, audioContext.sampleRate, 16_000)
        const pcm = new Uint8Array(pcm16ToArrayBuffer(floatToPcm16(downsampled)))
        volcPcmChunksRef.current.push(pcm)
        volcPcmLengthRef.current += pcm.byteLength
      }

      source.connect(worklet)
      worklet.connect(gain)
      gain.connect(audioContext.destination)
      setRecording(true)
      return
    }

    const recorder = new MediaRecorder(stream)
    const mimeType = recorder.mimeType || "audio/webm"
    mimeTypeRef.current = mimeType
    const relaySession =
      transportKind === "websocket-relay"
        ? createSpeechRelaySession({
            endpoint,
            apiKey: settings.mode === "api" ? settings.apiKey : "",
            seedText,
            provider: settings.mode,
            mimeType,
          })
        : null

    chunksRef.current = []
    relaySessionRef.current = relaySession
    streamRef.current = stream
    recorderRef.current = recorder

    recorder.ondataavailable = (event) => {
      if (event.data.size === 0) return
      chunksRef.current.push(event.data)
      if (relaySessionRef.current) {
        void relaySessionRef.current.sendChunk(event.data).catch((err) => {
          const message = err instanceof Error ? err.message : "语音识别中转发送失败"
          relayErrorRef.current = err instanceof Error ? err : new Error(message)
          setError(message)
          relaySessionRef.current?.abort()
          relaySessionRef.current = null
          if (recorder.state !== "inactive") {
            try {
              recorder.stop()
            } catch {
              // Recorder may already be stopping after the user releases the key.
            }
          }
        })
      }
    }

    recorder.start(SPEECH_STREAM_CHUNK_MS)
    setRecording(true)
  }

  const stopRecording = async () => {
    const settings = await loadSpeechSettings()
    setRecording(false)
    setTranscribing(true)
    setError(null)

    try {
      const audioBlob = await new Promise<Blob | undefined>((resolve) => {
        if (volcPcmModeRef.current) {
          resolve(undefined)
          return
        }

        const recorder = recorderRef.current
        if (!recorder || settings.mode === "mock") {
          resolve(undefined)
          return
        }

        recorder.onstop = () => {
          resolve(new Blob(chunksRef.current, { type: mimeTypeRef.current }))
        }
        if (recorder.state === "inactive") {
          resolve(new Blob(chunksRef.current, { type: mimeTypeRef.current }))
        } else {
          recorder.stop()
        }
      })

      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      recorderRef.current = null

      if (volcPcmModeRef.current) {
        cleanupVolcPcmCapture()
        volcPcmModeRef.current = false
        const audioPcm = mergePcmChunks(volcPcmChunksRef.current, volcPcmLengthRef.current)
        volcPcmChunksRef.current = []
        volcPcmLengthRef.current = 0
        if (audioPcm.byteLength < 3_200) {
          throw new Error("未识别到有效语音，请靠近麦克风后重试")
        }
        const runtime = await loadDesktopRuntime()
        return runtime.transcribeVolcAsrPcm({
          endpoint: getSpeechEndpoint(settings),
          apiKey: settings.apiKey,
          resourceId: settings.volcResourceId || DEFAULT_VOLC_ASR_RESOURCE_ID,
          audioPcm: Array.from(audioPcm),
          sampleRate: 16_000,
        })
      }

      if (relayErrorRef.current) {
        throw relayErrorRef.current
      }

      const relaySession = relaySessionRef.current
      if (relaySession) {
        relaySessionRef.current = null
        const result = await relaySession.finish()
        return result.text
      }

      const result = await transcribeSpeech({ audioBlob, seedText, settings })
      return result.text
    } catch (err) {
      const message = getSpeechErrorMessage(err, "语音识别失败")
      setError(message)
      throw new Error(message)
    } finally {
      relaySessionRef.current = null
      relayErrorRef.current = null
      if (volcPcmModeRef.current) {
        cleanupVolcPcmCapture()
        volcPcmModeRef.current = false
      }
      setTranscribing(false)
    }
  }

  return {
    recording,
    transcribing,
    error,
    startRecording,
    stopRecording,
  }
}

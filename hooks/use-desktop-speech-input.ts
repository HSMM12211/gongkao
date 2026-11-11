"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createTauriSpeechRuntime, type TauriSpeechRuntime } from "@/lib/desktop/tauri-speech-runtime"
import type { DesktopSpeechStatusPayload, DesktopSpeechTranscriptPayload } from "@/lib/desktop/stt-events"
import type {
  LocalSpeechMicrophoneDiagnostic,
  LocalSpeechRuntimeHealth,
  LocalSpeechRuntimeStatus,
} from "@/types/local-speech-runtime"

export type DesktopSpeechViewState = {
  status: LocalSpeechRuntimeStatus
  transcript: string
  error?: string
  isProcessing: boolean
}

export function appendFinalTranscript(previous: string, next: string) {
  const trimmed = next.trim()
  if (!trimmed) return previous
  return previous ? `${previous}${trimmed}` : trimmed
}

export function shouldUseDesktopSpeechInput(mode: "mock" | "api" | "local", desktopAvailable: boolean) {
  return mode === "local" && desktopAvailable
}

export function reduceDesktopSpeechStatus(
  current: DesktopSpeechViewState,
  payload: DesktopSpeechStatusPayload,
): DesktopSpeechViewState {
  if (payload.status === "empty-speech") {
    return { ...current, status: "empty-speech", isProcessing: false }
  }
  if (payload.status === "mic-denied" || payload.status === "mic-not-found") {
    return {
      ...current,
      status: payload.status,
      isProcessing: false,
      error: payload.message,
    }
  }
  return {
    ...current,
    status: payload.status,
    isProcessing: payload.status === "processing",
    error: payload.status === "failed" ? payload.message : undefined,
  }
}

function isTauriDesktopEnvironment() {
  if (typeof window === "undefined") return false
  return "__TAURI_INTERNALS__" in window || "__TAURI_IPC__" in window
}

async function loadRuntime() {
  const [{ invoke }, { listen }] = await Promise.all([
    import("@tauri-apps/api/core"),
    import("@tauri-apps/api/event"),
  ])
  return createTauriSpeechRuntime({ invoke, listen })
}

export function useDesktopSpeechInput() {
  const [available, setAvailable] = useState(false)
  const [status, setStatus] = useState<LocalSpeechRuntimeStatus>("unknown")
  const [recording, setRecording] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [partialText, setPartialText] = useState("")
  const [finalText, setFinalText] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [audioLevel, setAudioLevel] = useState<number[]>([])
  const [health, setHealth] = useState<LocalSpeechRuntimeHealth | null>(null)
  const [microphoneDiagnostic, setMicrophoneDiagnostic] = useState<LocalSpeechMicrophoneDiagnostic | null>(null)

  const runtimeRef = useRef<TauriSpeechRuntime | null>(null)
  const finalTextRef = useRef("")
  const partialTextRef = useRef("")
  const unlistenRef = useRef<(() => Promise<void> | void)[]>([])

  const cleanupListeners = useCallback(async () => {
    const unlisteners = unlistenRef.current
    unlistenRef.current = []
    await Promise.all(
      unlisteners.map(async (unlisten) => {
        await unlisten()
      }),
    )
  }, [])

  const getRuntime = useCallback(async () => {
    if (runtimeRef.current) return runtimeRef.current
    const runtime = await loadRuntime()
    runtimeRef.current = runtime
    return runtime
  }, [])

  const syncText = useCallback((nextPartial: string, nextFinal?: string) => {
    partialTextRef.current = nextPartial
    setPartialText(nextPartial)
    if (typeof nextFinal === "string") {
      finalTextRef.current = nextFinal
      setFinalText(nextFinal)
    }
  }, [])

  useEffect(() => {
    const desktop = isTauriDesktopEnvironment()
    setAvailable(desktop)
    if (desktop) {
      void getRuntime()
        .then((runtime) => runtime.health())
        .then((nextHealth) => {
          setHealth(nextHealth)
          setStatus(nextHealth.status)
        })
        .catch(() => {
          setStatus("failed")
        })
    }
    return () => {
      void cleanupListeners()
    }
  }, [cleanupListeners, getRuntime])

  const applyStatus = useCallback((payload: DesktopSpeechStatusPayload) => {
    setHealth(payload)
    setStatus(payload.status)
    setAudioLevel(payload.audioLevel ?? [])
    setRecording(payload.status === "recording")
    setProcessing(payload.status === "processing")
    if (payload.status === "empty-speech") {
      setError("未检测到清晰语音，请靠近麦克风后重试。")
      return
    }
    if (payload.status === "mic-denied") {
      setError(payload.message || "麦克风权限被拒绝，请在系统设置中允许访问。")
      return
    }
    if (payload.status === "mic-not-found") {
      setError(payload.message)
      return
    }
    if (payload.status === "failed" || payload.status === "model-missing" || payload.status === "vad-model-missing") {
      setError(payload.message)
      return
    }
    if (payload.status !== "busy") {
      setError(null)
    }
  }, [])

  const applyTranscript = useCallback(
    (payload: DesktopSpeechTranscriptPayload) => {
      if (payload.kind === "partial") {
        syncText(payload.text, finalTextRef.current)
        return
      }
      const merged = appendFinalTranscript(finalTextRef.current, payload.text)
      if (merged !== finalTextRef.current) {
        syncText("", merged)
      }
    },
    [syncText],
  )

  const registerListeners = useCallback(async () => {
    const runtime = await getRuntime()
    const unlistenStatus = await runtime.onStatus(applyStatus)
    const unlistenTranscript = await runtime.onTranscript(applyTranscript)
    unlistenRef.current.push(unlistenStatus, unlistenTranscript)
  }, [applyStatus, applyTranscript, getRuntime])

  const refreshDiagnostics = useCallback(async () => {
    if (!available) return null
    const runtime = await getRuntime()
    const [nextHealth, nextDiagnostic] = await Promise.all([
      runtime.health(),
      runtime.listInputDevices(),
    ])
    setHealth(nextHealth)
    setStatus(nextHealth.status)
    setMicrophoneDiagnostic(nextDiagnostic)
    return { health: nextHealth, microphoneDiagnostic: nextDiagnostic }
  }, [available, getRuntime])

  const start = useCallback(async () => {
    if (!available) {
      throw new Error("当前环境不支持桌面离线语音识别")
    }
    setError(null)
    setProcessing(false)
    syncText("", "")
    await cleanupListeners()
    try {
      await registerListeners()
      const runtime = await getRuntime()
      const nextHealth = await runtime.start()
      setHealth(nextHealth)
      setStatus("recording")
      setRecording(true)
    } catch (error) {
      setRecording(false)
      await cleanupListeners()
      throw error
    }
  }, [available, cleanupListeners, getRuntime, registerListeners, syncText])

  const stop = useCallback(async () => {
    if (!available) return ""
    setRecording(false)
    setProcessing(true)
    setStatus("processing")
    try {
      const runtime = await getRuntime()
      const text = await runtime.stop()
      const trimmed = text.trim()
      const merged = trimmed && !finalTextRef.current.endsWith(trimmed)
        ? appendFinalTranscript(finalTextRef.current, trimmed)
        : finalTextRef.current || trimmed
      finalTextRef.current = merged
      setFinalText(merged)
      return merged
    } finally {
      setProcessing(false)
      await cleanupListeners()
      setPartialText("")
      partialTextRef.current = ""
    }
  }, [available, cleanupListeners, getRuntime])

  const cancel = useCallback(async () => {
    if (!available) return
    setRecording(false)
    setProcessing(false)
    setStatus("ready")
    setError(null)
    finalTextRef.current = ""
    partialTextRef.current = ""
    setPartialText("")
    setFinalText("")
    await cleanupListeners()
    const runtime = await getRuntime()
    const nextHealth = await runtime.cancel()
    setHealth(nextHealth)
  }, [available, cleanupListeners, getRuntime])

  const restart = useCallback(async () => {
    const runtime = await getRuntime()
    const nextHealth = await runtime.restart()
    setHealth(nextHealth)
    setStatus(nextHealth.status)
    return nextHealth
  }, [getRuntime])

  const openMicrophonePrivacySettings = useCallback(async () => {
    const runtime = await getRuntime()
    await runtime.openMicrophonePrivacySettings()
  }, [getRuntime])

  const resetTranscript = useCallback(() => {
    finalTextRef.current = ""
    partialTextRef.current = ""
    setPartialText("")
    setFinalText("")
  }, [])

  const transcript = useMemo(() => appendFinalTranscript(finalText, partialText), [finalText, partialText])

  return {
    available,
    isAvailable: available,
    status,
    message: health?.message ?? "",
    recording,
    isRecording: recording,
    processing,
    isProcessing: processing,
    partialText,
    finalText,
    transcript,
    error,
    audioLevel,
    health,
    microphoneDiagnostic,
    start,
    stop,
    cancel,
    restart,
    refreshDiagnostics,
    openMicrophonePrivacySettings,
    resetTranscript,
  }
}

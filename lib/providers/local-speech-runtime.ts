import type { SpeechProviderSettings } from "@/lib/storage/schema"
import type { LocalSpeechRuntimeBridge, LocalSpeechRuntimeHealth } from "@/types/local-speech-runtime"
import { createTauriSpeechRuntime } from "@/lib/desktop/tauri-speech-runtime"

declare global {
  interface Window {
    gongkaoLocalSpeech?: LocalSpeechRuntimeBridge
    __TAURI_INTERNALS__?: unknown
    __TAURI_IPC__?: unknown
  }
}

type RuntimeFacadeOptions = {
  bridge?: LocalSpeechRuntimeBridge
  webSocketCtor?: typeof WebSocket
  timeoutMs?: number
}

export function getInternalLocalSpeechEndpoint(settings: SpeechProviderSettings) {
  return settings.localRuntime.realtimeEndpoint
}

function getRuntimeBridge(options?: RuntimeFacadeOptions) {
  if (options?.bridge) return options.bridge
  if (typeof window !== "undefined") return window.gongkaoLocalSpeech
  return undefined
}

function isTauriDesktopEnvironment() {
  if (typeof window === "undefined") return false
  return "__TAURI_INTERNALS__" in window || "__TAURI_IPC__" in window
}

async function getOrCreateTauriBridge() {
  if (typeof window === "undefined") return undefined
  if (window.gongkaoLocalSpeech) return window.gongkaoLocalSpeech
  if (!isTauriDesktopEnvironment()) return undefined
  const [{ invoke }, { listen }] = await Promise.all([
    import("@tauri-apps/api/core"),
    import("@tauri-apps/api/event"),
  ])
  const bridge = createTauriSpeechRuntime({ invoke, listen })
  window.gongkaoLocalSpeech = bridge
  return bridge
}

export function shouldRequireSpeechEndpoint(mode: string) {
  return mode === "api" || mode === "websocket" || mode === "faster-whisper"
}

export async function getManagedLocalSpeechBridge(options?: RuntimeFacadeOptions) {
  return getRuntimeBridge(options) ?? (await getOrCreateTauriBridge())
}

export async function ensureLocalSpeechRuntime(
  settings: SpeechProviderSettings,
  options?: RuntimeFacadeOptions,
): Promise<LocalSpeechRuntimeHealth> {
  const bridge = getRuntimeBridge(options)
  if (bridge) return bridge.ensureStarted()
  const desktopBridge = await getOrCreateTauriBridge()
  if (desktopBridge) return desktopBridge.ensureStarted()
  return probeLocalSpeechRuntime(settings, options)
}

export async function restartLocalSpeechRuntime(
  settings: SpeechProviderSettings,
  options?: RuntimeFacadeOptions,
): Promise<LocalSpeechRuntimeHealth> {
  const bridge = getRuntimeBridge(options)
  if (bridge) return bridge.restart()
  const desktopBridge = await getOrCreateTauriBridge()
  if (desktopBridge) return desktopBridge.restart()
  return probeLocalSpeechRuntime(settings, options)
}

export async function listLocalSpeechInputDevices(options?: RuntimeFacadeOptions) {
  const bridge = await getManagedLocalSpeechBridge(options)
  return bridge?.listInputDevices?.()
}

export async function openLocalSpeechMicrophonePrivacySettings(options?: RuntimeFacadeOptions) {
  const bridge = await getManagedLocalSpeechBridge(options)
  await bridge?.openMicrophonePrivacySettings?.()
}

export async function saveLocalSpeechLastCaptureForDebug(options?: RuntimeFacadeOptions) {
  const bridge = await getManagedLocalSpeechBridge(options)
  return bridge?.saveLastCaptureForDebug?.()
}

export function probeLocalSpeechRuntime(
  settings: SpeechProviderSettings,
  options: RuntimeFacadeOptions = {},
): Promise<LocalSpeechRuntimeHealth> {
  const endpoint = getInternalLocalSpeechEndpoint(settings)
  const webSocketCtor = options.webSocketCtor ?? (typeof WebSocket !== "undefined" ? WebSocket : undefined)

  if (!webSocketCtor) {
    return Promise.resolve({
      status: "failed",
      endpoint,
      engine: "vosk-streaming",
      message: "当前环境不支持本地实时语音连接",
    })
  }

  return new Promise((resolve) => {
    let settled = false
    const socket = new webSocketCtor(endpoint)
    const finish = (health: LocalSpeechRuntimeHealth) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        socket.close()
      } catch {
        // The socket may already be closed by a fake implementation or browser cleanup.
      }
      resolve(health)
    }
    const timer = setTimeout(() => {
      finish({
        status: "failed",
        endpoint,
        engine: "vosk-streaming",
        message: "本地离线识别启动失败，应用正在尝试重新启动。若仍不可用，请在设置页检查本地识别状态。",
      })
    }, options.timeoutMs ?? 2_000)

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: "ping" }))
    }

    socket.onmessage = () => {
      finish({
        status: "ready",
        endpoint,
        engine: "vosk-streaming",
        message: "本地语音识别可用",
      })
    }

    socket.onerror = () => {
      finish({
        status: "failed",
        endpoint,
        engine: "vosk-streaming",
        message: "本地离线识别启动失败，应用正在尝试重新启动。若仍不可用，请在设置页检查本地识别状态。",
      })
    }
  })
}

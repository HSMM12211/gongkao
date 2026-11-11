import type { LocalSpeechRuntimeHealth } from "@/types/local-speech-runtime"

export type SttRuntimeManager = {
  ensureStarted: () => Promise<LocalSpeechRuntimeHealth>
  restart: () => Promise<LocalSpeechRuntimeHealth>
  stop: () => Promise<void>
}

export const LOCAL_STT_RUNTIME_CONTRACT = {
  endpoint: "ws://127.0.0.1:8787/stt",
  engine: "vosk-streaming",
  modelPath: "models/vosk-model-small-cn-0.22",
} as const

export function createMissingDesktopRuntimeManager(): SttRuntimeManager {
  const health: LocalSpeechRuntimeHealth = {
    status: "failed",
    endpoint: LOCAL_STT_RUNTIME_CONTRACT.endpoint,
    engine: LOCAL_STT_RUNTIME_CONTRACT.engine,
    message: "当前构建尚未接入桌面端本地语音运行时",
  }

  return {
    ensureStarted: async () => health,
    restart: async () => health,
    stop: async () => undefined,
  }
}

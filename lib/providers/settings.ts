import { providerSettingsRepository } from "@/lib/storage/repositories"
import {
  DEFAULT_VOLC_ASR_RESOURCE_ID,
  VOLC_ASR_ENDPOINT,
  normalizeVolcAsrEndpoint,
} from "@/lib/providers/speech"
import type { AiProviderSettings, LocalSpeechEngine, ProviderMode, SpeechProviderSettings } from "@/lib/storage/schema"

export const DEFAULT_SPEECH_SETTINGS: SpeechProviderSettings = {
  mode: "mock",
  apiEndpoint: VOLC_ASR_ENDPOINT,
  apiKey: "",
  volcResourceId: DEFAULT_VOLC_ASR_RESOURCE_ID,
  localEndpoint: "http://127.0.0.1:8001/transcribe",
  localRuntime: {
    managed: true,
    engine: "vosk-streaming",
    realtimeEndpoint: "ws://127.0.0.1:8787/stt",
    httpEndpoint: "http://127.0.0.1:8001/transcribe",
    modelPath: "models/vosk-model-small-cn-0.22",
    sampleRate: 16000,
    chunkMs: 200,
    showAdvancedDiagnostics: false,
  },
}

export const DEFAULT_AI_SETTINGS: AiProviderSettings = {
  mode: "mock",
  apiEndpoint: "",
  apiKey: "",
  apiModel: "gpt-4.1-mini",
  localEndpoint: "http://127.0.0.1:11434/api/chat",
  localModel: "qwen2.5",
}

function normalizeSpeechApiEndpoint(value: string | undefined, mode: ProviderMode | undefined) {
  const endpoint = value ?? DEFAULT_SPEECH_SETTINGS.apiEndpoint
  if (mode !== "api") return endpoint

  try {
    return normalizeVolcAsrEndpoint(endpoint)
  } catch {
    return VOLC_ASR_ENDPOINT
  }
}

export function getSpeechSettingsFields(mode: ProviderMode) {
  return {
    apiEndpoint: mode === "api",
    apiKey: mode === "api",
    volcResourceId: mode === "api",
    localStatus: mode === "local",
    localAdvancedDiagnostics: mode === "local",
    relayHint: mode === "api",
  }
}

export function normalizeSpeechSettings(
  value: Partial<SpeechProviderSettings> | null | undefined,
): SpeechProviderSettings {
  const legacy = value as
    | (Partial<SpeechProviderSettings> & {
        localRealtimeEndpoint?: string
        localEngine?: LocalSpeechEngine
        localModelPath?: string
        sampleRate?: number
        chunkMs?: number
      })
    | null
    | undefined

  return {
    ...DEFAULT_SPEECH_SETTINGS,
    ...(value ?? {}),
    apiEndpoint: normalizeSpeechApiEndpoint(value?.apiEndpoint, value?.mode),
    volcResourceId: value?.volcResourceId ?? DEFAULT_SPEECH_SETTINGS.volcResourceId,
    localRuntime: {
      ...DEFAULT_SPEECH_SETTINGS.localRuntime,
      ...(value?.localRuntime ?? {}),
      managed: true,
      engine: value?.localRuntime?.engine ?? legacy?.localEngine ?? DEFAULT_SPEECH_SETTINGS.localRuntime.engine,
      realtimeEndpoint:
        value?.localRuntime?.realtimeEndpoint ??
        legacy?.localRealtimeEndpoint ??
        DEFAULT_SPEECH_SETTINGS.localRuntime.realtimeEndpoint,
      modelPath: value?.localRuntime?.modelPath ?? legacy?.localModelPath ?? DEFAULT_SPEECH_SETTINGS.localRuntime.modelPath,
      sampleRate:
        value?.localRuntime?.sampleRate ?? legacy?.sampleRate ?? DEFAULT_SPEECH_SETTINGS.localRuntime.sampleRate,
      chunkMs: value?.localRuntime?.chunkMs ?? legacy?.chunkMs ?? DEFAULT_SPEECH_SETTINGS.localRuntime.chunkMs,
      showAdvancedDiagnostics: value?.localRuntime?.showAdvancedDiagnostics ?? false,
    },
  }
}

export function validateSpeechSettings(settings: SpeechProviderSettings): string[] {
  if (settings.mode === "api") {
    try {
      normalizeVolcAsrEndpoint(settings.apiEndpoint)
    } catch (error) {
      return [error instanceof Error ? error.message : "火山官方 ASR Endpoint 无效"]
    }
  }
  return []
}

export function validateAiSettings(settings: AiProviderSettings): string[] {
  if (settings.mode === "api" && !settings.apiEndpoint.trim()) {
    return ["API 模式需要填写 AI API Endpoint"]
  }
  if (settings.mode === "local" && !settings.localEndpoint.trim()) {
    return ["本地模式需要填写 AI 本地服务 Endpoint"]
  }
  return []
}

export async function loadSpeechSettings() {
  return normalizeSpeechSettings(await providerSettingsRepository.getSpeechSettings())
}

export async function saveSpeechSettings(settings: SpeechProviderSettings) {
  let normalized = settings
  if (settings.mode === "api") {
    try {
      normalized = { ...settings, apiEndpoint: normalizeVolcAsrEndpoint(settings.apiEndpoint) }
    } catch (error) {
      return [error instanceof Error ? error.message : "火山官方 ASR Endpoint 无效"]
    }
  }
  const errors = validateSpeechSettings(normalized)
  if (errors.length > 0) return errors
  await providerSettingsRepository.saveSpeechSettings(normalized)
  return []
}

export async function loadAiSettings() {
  return (await providerSettingsRepository.getAiSettings()) ?? DEFAULT_AI_SETTINGS
}

export async function saveAiSettings(settings: AiProviderSettings) {
  const errors = validateAiSettings(settings)
  if (errors.length > 0) return errors
  await providerSettingsRepository.saveAiSettings(settings)
  return []
}

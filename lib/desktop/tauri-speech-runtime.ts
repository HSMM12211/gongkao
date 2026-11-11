import type {
  LocalAsrDownloadProgress,
  LocalAsrModelInfo,
  LocalSpeechMicrophoneDiagnostic,
  LocalSpeechRuntimeBridge,
  LocalSpeechRuntimeHealth,
} from "@/types/local-speech-runtime"
import {
  STT_STATUS_EVENT,
  STT_TRANSCRIPT_EVENT,
  type DesktopSpeechStatusPayload,
  type DesktopSpeechTranscriptPayload,
} from "@/lib/desktop/stt-events"

export type TauriSpeechRuntimeApi = {
  invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T>
  listen?: <T>(event: string, handler: (event: { payload: T }) => void) => Promise<() => void>
}

export type TauriSpeechRuntime = LocalSpeechRuntimeBridge & {
  isAvailable: () => Promise<boolean>
  health: () => Promise<LocalSpeechRuntimeHealth>
  start: () => Promise<LocalSpeechRuntimeHealth>
  stop: () => Promise<string>
  cancel: () => Promise<LocalSpeechRuntimeHealth>
  listInputDevices: () => Promise<LocalSpeechMicrophoneDiagnostic>
  openMicrophonePrivacySettings: () => Promise<void>
  saveLastCaptureForDebug: () => Promise<string>
  listLocalAsrModels: () => Promise<LocalAsrModelInfo[]>
  getSelectedLocalAsrModel: () => Promise<string | null>
  downloadLocalAsrModel: (modelId: string) => Promise<void>
  cancelLocalAsrModelDownload: (modelId: string) => Promise<void>
  deleteLocalAsrModel: (modelId: string) => Promise<LocalSpeechRuntimeHealth>
  selectLocalAsrModel: (modelId: string) => Promise<LocalSpeechRuntimeHealth>
  testVolcAsrConnection: (options: {
    endpoint: string
    apiKey: string
    resourceId: string
  }) => Promise<{
    ok: boolean
    message: string
    requestId: string
    logId?: string
  }>
  transcribeVolcAsrPcm: (options: {
    endpoint: string
    apiKey: string
    resourceId: string
    audioPcm: number[]
    sampleRate: number
  }) => Promise<string>
  onStatus: (handler: (payload: DesktopSpeechStatusPayload) => void) => Promise<() => void>
  onTranscript: (handler: (payload: DesktopSpeechTranscriptPayload) => void) => Promise<() => void>
  onModelDownloadProgress: (handler: (payload: LocalAsrDownloadProgress) => void) => Promise<() => void>
  onModelChanged: (handler: () => void) => Promise<() => void>
}

export function createTauriSpeechRuntime(api: TauriSpeechRuntimeApi): TauriSpeechRuntime {
  const health = () => api.invoke<LocalSpeechRuntimeHealth>("stt_health")
  const requireListen = () => {
    if (!api.listen) throw new Error("Tauri event listener is unavailable")
    return api.listen
  }

  return {
    isAvailable: async () => true,
    ensureStarted: health,
    restart: () => api.invoke<LocalSpeechRuntimeHealth>("stt_restart"),
    getHealth: health,
    health,
    start: () => api.invoke<LocalSpeechRuntimeHealth>("stt_start"),
    stop: () => api.invoke<string>("stt_stop"),
    cancel: () => api.invoke<LocalSpeechRuntimeHealth>("stt_cancel"),
    listInputDevices: () => api.invoke<LocalSpeechMicrophoneDiagnostic>("stt_list_input_devices"),
    openMicrophonePrivacySettings: () => api.invoke<void>("stt_open_microphone_privacy_settings"),
    saveLastCaptureForDebug: () => api.invoke<string>("stt_save_last_capture_for_debug"),
    listLocalAsrModels: () => api.invoke<LocalAsrModelInfo[]>("stt_list_models"),
    getSelectedLocalAsrModel: () => api.invoke<string | null>("stt_get_selected_model"),
    downloadLocalAsrModel: (modelId) => api.invoke<void>("stt_download_model", { modelId }),
    cancelLocalAsrModelDownload: (modelId) => api.invoke<void>("stt_cancel_model_download", { modelId }),
    deleteLocalAsrModel: (modelId) => api.invoke<LocalSpeechRuntimeHealth>("stt_delete_model", { modelId }),
    selectLocalAsrModel: (modelId) => api.invoke<LocalSpeechRuntimeHealth>("stt_select_model", { modelId }),
    testVolcAsrConnection: (options) => api.invoke("stt_volc_test_connection", options),
    transcribeVolcAsrPcm: (options) => api.invoke("stt_volc_transcribe_pcm", options),
    onStatus: (handler) =>
      requireListen()<DesktopSpeechStatusPayload>(STT_STATUS_EVENT, (event) => handler(event.payload)),
    onTranscript: (handler) =>
      requireListen()<DesktopSpeechTranscriptPayload>(STT_TRANSCRIPT_EVENT, (event) => handler(event.payload)),
    onModelDownloadProgress: (handler) =>
      requireListen()<LocalAsrDownloadProgress>("stt://model-download-progress", (event) => handler(event.payload)),
    onModelChanged: async (handler) => {
      const listen = requireListen()
      const unlisteners = await Promise.all([
        listen("stt://model-download-complete", () => handler()),
        listen("stt://model-download-failed", () => handler()),
        listen("stt://model-download-cancelled", () => handler()),
        listen("stt://model-extraction-completed", () => handler()),
        listen("stt://model-deleted", () => handler()),
        listen("stt://model-selection-changed", () => handler()),
      ])
      return () => {
        for (const unlisten of unlisteners) unlisten()
      }
    },
  }
}

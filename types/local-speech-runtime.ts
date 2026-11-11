export type LocalSpeechRuntimeStatus =
  | "unknown"
  | "starting"
  | "ready"
  | "recording"
  | "processing"
  | "empty-speech"
  | "mic-denied"
  | "mic-not-found"
  | "model-missing"
  | "vad-model-missing"
  | "busy"
  | "failed"

export type LocalSpeechRuntimeHealth = {
  status: LocalSpeechRuntimeStatus
  endpoint: string
  engine:
    | "vosk-streaming"
    | "whisper-rs"
    | "transcribe-rs"
    | "transcribe-rs/whisper"
    | "transcribe-rs/parakeet"
    | "transcribe-rs/moonshine"
    | "transcribe-rs/moonshine-streaming"
    | "transcribe-rs/sensevoice"
    | "transcribe-rs/gigaam"
    | "transcribe-rs/canary"
    | "transcribe-rs/cohere"
  message: string
  modelLabel?: string
  modelPath?: string
  vadLabel?: string
  vadPath?: string
  deviceLabel?: string
  bundled?: boolean
  lastLatencyMs?: number
  lastCaptureSamples?: number
}

export type LocalAsrEngineType =
  | "whisper"
  | "parakeet"
  | "moonshine"
  | "moonshine-streaming"
  | "sense-voice"
  | "gigaam"
  | "canary"
  | "cohere"

export type LocalAsrModelInfo = {
  id: string
  name: string
  description: string
  filename: string
  url?: string
  sha256?: string
  sizeMb: number
  isDownloaded: boolean
  isDownloading: boolean
  partialSize: number
  isDirectory: boolean
  engineType: LocalAsrEngineType
  accuracyScore: number
  speedScore: number
  supportsTranslation: boolean
  isRecommended: boolean
  supportedLanguages: string[]
  supportsLanguageSelection: boolean
  isCustom: boolean
}

export type LocalAsrDownloadProgress = {
  modelId: string
  downloaded: number
  total: number
  percentage: number
}

export type LocalSpeechInputDevice = {
  id: string
  label: string
  isDefault: boolean
}

export type LocalSpeechMicrophoneDiagnostic = {
  status: LocalSpeechRuntimeStatus | "ready"
  message: string
  defaultDevice?: LocalSpeechInputDevice
  devices: LocalSpeechInputDevice[]
}

export type LocalSpeechRuntimeBridge = {
  ensureStarted: () => Promise<LocalSpeechRuntimeHealth>
  restart: () => Promise<LocalSpeechRuntimeHealth>
  getHealth: () => Promise<LocalSpeechRuntimeHealth>
  start?: () => Promise<LocalSpeechRuntimeHealth>
  stop?: () => Promise<string>
  cancel?: () => Promise<LocalSpeechRuntimeHealth>
  listInputDevices?: () => Promise<LocalSpeechMicrophoneDiagnostic>
  openMicrophonePrivacySettings?: () => Promise<void>
  saveLastCaptureForDebug?: () => Promise<string>
  listLocalAsrModels?: () => Promise<LocalAsrModelInfo[]>
  getSelectedLocalAsrModel?: () => Promise<string | null>
  downloadLocalAsrModel?: (modelId: string) => Promise<void>
  cancelLocalAsrModelDownload?: (modelId: string) => Promise<void>
  deleteLocalAsrModel?: (modelId: string) => Promise<LocalSpeechRuntimeHealth>
  selectLocalAsrModel?: (modelId: string) => Promise<LocalSpeechRuntimeHealth>
  onModelDownloadProgress?: (handler: (payload: LocalAsrDownloadProgress) => void) => Promise<() => void>
  onModelChanged?: (handler: () => void) => Promise<() => void>
}

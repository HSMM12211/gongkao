export const DB_NAME = "shenlun-local-mvp"
export const DB_VERSION = 7

export const STORES = {
  reviewStates: "reviewStates",
  reviewEvents: "reviewEvents",
  practiceAttempts: "practiceAttempts",
  copybookItems: "copybookItems",
  providerSettings: "providerSettings",
  materialSources: "materialSources",
  importedFlashcards: "importedFlashcards",
  importedQuestions: "importedQuestions",
  agentRuns: "agentRuns",
  materialInboxDrafts: "materialInboxDrafts",
  agentSettings: "agentSettings",
  shenlunDocuments: "shenlunDocuments",
  shenlunExamPapers: "shenlunExamPapers",
  shenlunMaterialPassages: "shenlunMaterialPassages",
  shenlunTrainingQuestions: "shenlunTrainingQuestions",
  shenlunAnswerKeys: "shenlunAnswerKeys",
  shenlunScoringPoints: "shenlunScoringPoints",
  shenlunTrainingSessions: "shenlunTrainingSessions",
  shenlunTrainingAnswers: "shenlunTrainingAnswers",
  shenlunDiagnoses: "shenlunDiagnoses",
  shenlunCalibrationSnapshots: "shenlunCalibrationSnapshots",
  shenlunExpressionAssets: "shenlunExpressionAssets",
  shenlunExpressionExercises: "shenlunExpressionExercises",
  shenlunCalibrationReports: "shenlunCalibrationReports",
  shenlunLearningProvenance: "shenlunLearningProvenance",
  shenlunAbilityTags: "shenlunAbilityTags",
  shenlunTopicAssets: "shenlunTopicAssets",
  shenlunLearningProfiles: "shenlunLearningProfiles",
  shenlunLearningTasks: "shenlunLearningTasks",
  shenlunLearningPlans: "shenlunLearningPlans",
  shenlunQuestionBankItems: "shenlunQuestionBankItems",
  shenlunQuestionBankImportBatches: "shenlunQuestionBankImportBatches",
} as const

export type StoreName = (typeof STORES)[keyof typeof STORES]

export type ReviewGrade = "again" | "hard" | "good" | "easy"

export type ReviewState = {
  cardId: string
  dueAt: string
  intervalDays: number
  ease: number
  repetitions: number
  lapses: number
  updatedAt: string
}

export type ReviewEvent = {
  id: string
  cardId: string
  reviewedAt: string
  input: string
  hitCount: number
  keywordCount: number
  grade: ReviewGrade
  nextDueAt: string
}

export type AiDiagnosis = {
  score: number
  keywordHits: string[]
  missingKeywords: string[]
  logicIssues: string[]
  languageSuggestions: { original: string; revised: string; reason: string }[]
  modelAnswer: string
  copybookText: string
}

export type PracticeAttempt = {
  id: string
  questionId: string
  createdAt: string
  mode: "type" | "voice-full" | "voice-outline"
  answer: string
  score: number
  keywordHit: number
  keywordCount: number
  diagnosis: AiDiagnosis
  copybookText: string
}

export type CopybookItem = {
  id: string
  source: "seed" | "practice-attempt" | "manual"
  sourceId: string
  title: string
  questionId?: string
  text: string
  tags: string[]
  createdAt: string
}

export type ProviderMode = "mock" | "api" | "local"

export type LocalSpeechEngine = "vosk-streaming" | "whispercpp-batch" | "faster-whisper-http"

export type LocalSpeechRuntimeSettings = {
  managed: true
  engine: LocalSpeechEngine
  realtimeEndpoint: string
  httpEndpoint: string
  modelPath: string
  sampleRate: number
  chunkMs: number
  showAdvancedDiagnostics: boolean
}

export type SpeechProviderSettings = {
  mode: ProviderMode
  apiEndpoint: string
  apiKey: string
  volcResourceId: string
  // Legacy compatibility for old saved local settings. Do not expose this to normal users.
  localEndpoint: string
  localRuntime: LocalSpeechRuntimeSettings
}

export type AiProviderSettings = {
  mode: ProviderMode
  apiEndpoint: string
  apiKey: string
  apiModel: string
  localEndpoint: string
  localModel: string
}

export type ProviderSettingsRecord =
  | { id: "speech"; value: SpeechProviderSettings }
  | { id: "ai"; value: AiProviderSettings }

export type MaterialSourceType = "text" | "markdown" | "pdf"

export type MaterialSource = {
  id: string
  title: string
  sourceType: MaterialSourceType
  originalName?: string
  createdAt: string
  text: string
  summary: string
  tags: string[]
}

export type ImportedFlashcard = {
  id: string
  sourceId: string
  front: string
  keywords: string[]
  category: "金句" | "规范词" | "对策"
  createdAt: string
}

export type ImportedQuestion = {
  id: string
  sourceId: string
  title: string
  type: "概括题" | "对策题" | "综合分析" | "应用文" | "大作文"
  material: string
  prompt: string
  keywords: string[]
  aiAnswer: string
  createdAt: string
}

export type AgentAdapterId = "codex" | "claude"
export type AgentRunStatus = "queued" | "running" | "validating" | "waiting_review" | "completed" | "failed" | "cancelled"

export type AgentRunRecord = {
  id: string
  adapterId: AgentAdapterId
  skillId: string
  status: AgentRunStatus
  title: string
  startedAt: string
  endedAt?: string
  workspacePath: string
  summary: string
  error?: string
  hasTrace?: boolean
}

export type MaterialInboxStatus = "pending" | "imported" | "rejected"

export type MaterialInboxDraft = {
  id: string
  runId: string
  status: MaterialInboxStatus
  createdAt: string
  outputJson: string
  validationErrors: string[]
  validationWarnings?: string[]
}

export type AgentSettings = {
  id: "agent"
  value: {
    defaultAdapterId: AgentAdapterId
    defaultSkillId: string
    defaultModel: string
    defaultReasoning: "default" | "medium" | "high" | "xhigh"
  }
}

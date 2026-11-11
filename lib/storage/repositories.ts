import { deleteItem, getItem, listItems, putItem } from "@/lib/storage/idb"
import {
  STORES,
  type AiProviderSettings,
  type AgentRunRecord,
  type AgentSettings,
  type CopybookItem,
  type ImportedFlashcard,
  type ImportedQuestion,
  type MaterialInboxDraft,
  type MaterialSource,
  type PracticeAttempt,
  type ProviderSettingsRecord,
  type ReviewEvent,
  type ReviewState,
  type SpeechProviderSettings,
} from "@/lib/storage/schema"

export const reviewRepository = {
  getStates: () => listItems<ReviewState>(STORES.reviewStates),
  saveState: (state: ReviewState) => putItem(STORES.reviewStates, state),
  saveEvent: (event: ReviewEvent) => putItem(STORES.reviewEvents, event),
  getEvents: () => listItems<ReviewEvent>(STORES.reviewEvents),
}

export const practiceRepository = {
  getAttempts: () => listItems<PracticeAttempt>(STORES.practiceAttempts),
  saveAttempt: (attempt: PracticeAttempt) => putItem(STORES.practiceAttempts, attempt),
}

export const copybookRepository = {
  getItems: () => listItems<CopybookItem>(STORES.copybookItems),
  saveItem: (item: CopybookItem) => putItem(STORES.copybookItems, item),
  deleteItem: (id: string) => deleteItem(STORES.copybookItems, id),
}

export const providerSettingsRepository = {
  getSpeechSettings: async () => {
    const record = await getItem<ProviderSettingsRecord>(STORES.providerSettings, "speech")
    return record?.id === "speech" ? (record.value as SpeechProviderSettings) : undefined
  },
  saveSpeechSettings: (value: SpeechProviderSettings) =>
    putItem<ProviderSettingsRecord>(STORES.providerSettings, { id: "speech", value }),
  getAiSettings: async () => {
    const record = await getItem<ProviderSettingsRecord>(STORES.providerSettings, "ai")
    return record?.id === "ai" ? (record.value as AiProviderSettings) : undefined
  },
  saveAiSettings: (value: AiProviderSettings) =>
    putItem<ProviderSettingsRecord>(STORES.providerSettings, { id: "ai", value }),
}

export const materialRepository = {
  getSources: () => listItems<MaterialSource>(STORES.materialSources),
  getFlashcards: () => listItems<ImportedFlashcard>(STORES.importedFlashcards),
  getQuestions: () => listItems<ImportedQuestion>(STORES.importedQuestions),
  saveImportBundle: async ({
    source,
    flashcards,
    questions,
    copybookItems = [],
  }: {
    source: MaterialSource
    flashcards: ImportedFlashcard[]
    questions: ImportedQuestion[]
    copybookItems?: CopybookItem[]
  }) => {
    await putItem(STORES.materialSources, source)
    await Promise.all([
      ...flashcards.map((flashcard) => putItem(STORES.importedFlashcards, flashcard)),
      ...questions.map((question) => putItem(STORES.importedQuestions, question)),
      ...copybookItems.map((item) => putItem(STORES.copybookItems, item)),
    ])
  },
}

export const agentRepository = {
  getRuns: () => listItems<AgentRunRecord>(STORES.agentRuns),
  saveRun: (run: AgentRunRecord) => putItem(STORES.agentRuns, run),
  getSettings: async () => {
    const record = await getItem<AgentSettings>(STORES.agentSettings, "agent")
    return record?.id === "agent" ? record.value : undefined
  },
  saveSettings: (value: AgentSettings["value"]) => putItem<AgentSettings>(STORES.agentSettings, { id: "agent", value }),
}

export const materialInboxRepository = {
  getDrafts: () => listItems<MaterialInboxDraft>(STORES.materialInboxDrafts),
  saveDraft: (draft: MaterialInboxDraft) => putItem(STORES.materialInboxDrafts, draft),
  markImported: async (id: string) => {
    const draft = await getItem<MaterialInboxDraft>(STORES.materialInboxDrafts, id)
    if (!draft) return
    await putItem<MaterialInboxDraft>(STORES.materialInboxDrafts, { ...draft, status: "imported" })
  },
  rejectDraft: async (id: string) => {
    const draft = await getItem<MaterialInboxDraft>(STORES.materialInboxDrafts, id)
    if (!draft) return
    await putItem<MaterialInboxDraft>(STORES.materialInboxDrafts, { ...draft, status: "rejected" })
  },
  deleteDraft: (id: string) => deleteItem(STORES.materialInboxDrafts, id),
}

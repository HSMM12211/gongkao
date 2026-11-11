import type { PdfSkillParseProgressPayload } from "@/lib/desktop/material-parser-runtime"
import {
  MATERIAL_WORKBENCH_STATE_KEY,
  serializeMaterialWorkbenchState,
  type MaterialWorkbenchState,
} from "@/lib/agent/material-workbench-state"
import type { MaterialChatMessage } from "@/lib/agent/material-chat"
import type { ShenlunDocumentType } from "@/lib/shenlun/types"
import type { AgentRunEvent } from "@/types/agent-runtime"

export type UploadedFileStatus = "idle" | "ready" | "parsing" | "parsed" | "failed"

export type MaterialRunCenterItem = {
  id: string
  title: string
  skillId: string
  adapterLabel: string
  status: "queued" | "running" | "validating" | "waiting_review" | "completed" | "failed" | "cancelled"
  startedAt: string
  workspacePath?: string
  summary: string
  logs: string[]
  hasTrace?: boolean
}

export type MaterialWorkbenchSessionSnapshot = MaterialWorkbenchState & {
  shenlunDocumentType: ShenlunDocumentType
  selectedMaterialFile: File | null
  selectedMaterialFiles: File[]
  uploadedFileStatus: UploadedFileStatus
  pdfParseProgress: PdfSkillParseProgressPayload | null
  pdfParseLogs: string[]
  processing: boolean
  activeRunId: string
  agentEvents: AgentRunEvent[]
  runQueue: MaterialRunCenterItem[]
  chatMessages: MaterialChatMessage[]
  updatedAt: number
}

type SessionListener = (snapshot: MaterialWorkbenchSessionSnapshot) => void

const DEFAULT_SELECTION = {
  flashcards: true,
  questions: true,
  copybookItems: true,
}

const DEFAULT_SESSION: MaterialWorkbenchSessionSnapshot = {
  title: "",
  rawText: "",
  fileName: "",
  selectedSkillId: "",
  commandPrompt: "",
  skillInputValues: {},
  selection: DEFAULT_SELECTION,
  sourceInput: null,
  draft: null,
  shenlunDocumentType: "commentary",
  selectedMaterialFile: null,
  selectedMaterialFiles: [],
  uploadedFileStatus: "idle",
  pdfParseProgress: null,
  pdfParseLogs: [],
  processing: false,
  activeRunId: "",
  agentEvents: [],
  runQueue: [],
  chatMessages: [],
  updatedAt: 0,
}

let snapshot: MaterialWorkbenchSessionSnapshot = { ...DEFAULT_SESSION }
const listeners = new Set<SessionListener>()

export function getMaterialWorkbenchSessionSnapshot(): MaterialWorkbenchSessionSnapshot {
  return cloneSnapshot(snapshot)
}

export function hasMaterialWorkbenchSession(): boolean {
  return snapshot.updatedAt > 0
}

export function patchMaterialWorkbenchSession(patch: Partial<MaterialWorkbenchSessionSnapshot>): MaterialWorkbenchSessionSnapshot {
  snapshot = cloneSnapshot({
    ...snapshot,
    ...patch,
    updatedAt: Date.now(),
  })
  persistEditableSnapshot(snapshot)
  listeners.forEach((listener) => listener(getMaterialWorkbenchSessionSnapshot()))
  return getMaterialWorkbenchSessionSnapshot()
}

export function subscribeMaterialWorkbenchSession(listener: SessionListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function resetMaterialWorkbenchSession(): MaterialWorkbenchSessionSnapshot {
  snapshot = { ...DEFAULT_SESSION }
  persistEditableSnapshot(snapshot)
  listeners.forEach((listener) => listener(getMaterialWorkbenchSessionSnapshot()))
  return getMaterialWorkbenchSessionSnapshot()
}

function persistEditableSnapshot(current: MaterialWorkbenchSessionSnapshot) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(
      MATERIAL_WORKBENCH_STATE_KEY,
      serializeMaterialWorkbenchState({
        title: current.title,
        rawText: current.rawText,
        fileName: current.fileName,
        selectedSkillId: current.selectedSkillId,
        commandPrompt: current.commandPrompt,
        skillInputValues: current.skillInputValues,
        selection: current.selection,
        sourceInput: current.sourceInput,
        draft: current.draft,
        chatMessages: current.chatMessages,
      }),
    )
  } catch {
    // Browsers can reject localStorage in private or restricted modes. The in-memory session still works.
  }
}

function cloneSnapshot(current: MaterialWorkbenchSessionSnapshot): MaterialWorkbenchSessionSnapshot {
  return {
    ...current,
    selectedMaterialFiles: [...current.selectedMaterialFiles],
    skillInputValues: { ...current.skillInputValues },
    selection: { ...current.selection },
    pdfParseLogs: [...current.pdfParseLogs],
    agentEvents: [...current.agentEvents],
    runQueue: current.runQueue.map((task) => ({ ...task, logs: [...task.logs] })),
    chatMessages: current.chatMessages.map((message) => ({
      ...message,
      events: message.events ? [...message.events] : undefined,
      attachments: message.attachments ? [...message.attachments] : undefined,
      outputSummary: message.outputSummary
        ? {
            ...message.outputSummary,
            warnings: message.outputSummary.warnings ? [...message.outputSummary.warnings] : undefined,
          }
        : undefined,
      taskPlan: message.taskPlan
        ? {
            ...message.taskPlan,
            skill: {
              ...message.taskPlan.skill,
              permissions: [...message.taskPlan.skill.permissions],
            },
            context: {
              ...message.taskPlan.context,
              warnings: [...message.taskPlan.context.warnings],
            },
            toolRoute: {
              ...message.taskPlan.toolRoute,
              fallbackToolIds: [...message.taskPlan.toolRoute.fallbackToolIds],
              reasons: [...message.taskPlan.toolRoute.reasons],
              warnings: [...message.taskPlan.toolRoute.warnings],
              permissions: [...message.taskPlan.toolRoute.permissions],
            },
            memory: {
              ...message.taskPlan.memory,
              warnings: [...message.taskPlan.memory.warnings],
            },
            workflow: {
              ...message.taskPlan.workflow,
              roles: [...message.taskPlan.workflow.roles],
              warnings: [...message.taskPlan.workflow.warnings],
            },
            expectedArtifacts: [...message.taskPlan.expectedArtifacts],
            warnings: [...message.taskPlan.warnings],
          }
        : undefined,
    })),
  }
}

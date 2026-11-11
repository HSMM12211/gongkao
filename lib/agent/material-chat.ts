import type { AgentRunEvent, AgentRunEventKind } from "@/types/agent-runtime"
import type { AgentTaskPlan } from "@/lib/agent/orchestrator"

export const MAX_MATERIAL_CHAT_EVENTS = 80
export const MAX_MATERIAL_CHAT_MESSAGES = 12

export type MaterialChatStatus =
  | "queued"
  | "streaming"
  | "validating"
  | "waiting_review"
  | "completed"
  | "failed"
  | "cancelled"

export type MaterialChatEventType =
  | "thinking_delta"
  | "text_delta"
  | "tool_call"
  | "tool_result"
  | "file_write"
  | "validation"
  | "inbox"
  | "status"
  | "error"

export type MaterialChatEventSeverity = "muted" | "info" | "success" | "warning" | "error"

export type MaterialChatEvent = {
  id: string
  runId: string
  type: MaterialChatEventType
  label: string
  message: string
  timestamp: string
  severity: MaterialChatEventSeverity
  rawKind?: AgentRunEventKind
}

export type MaterialChatAttachment = {
  id: string
  name: string
  kind: "file" | "context"
  status: "ready" | "parsing" | "parsed" | "failed" | "bound"
}

export type MaterialChatOutputSummary = {
  inboxDraftId?: string
  questionCount?: number
  flashcardCount?: number
  sourceCount?: number
  warnings?: string[]
}

export type MaterialChatMessage = {
  id: string
  role: "user" | "assistant"
  runId?: string
  content: string
  createdAt: string
  status?: MaterialChatStatus
  events?: MaterialChatEvent[]
  attachments?: MaterialChatAttachment[]
  outputSummary?: MaterialChatOutputSummary
  taskPlan?: AgentTaskPlan
}

type CreateUserMessageInput = {
  content: string
  attachments?: MaterialChatAttachment[]
  now?: string
  id?: string
}

type CreateAssistantMessageInput = {
  content?: string
  runId?: string
  now?: string
  id?: string
  status?: MaterialChatStatus
  taskPlan?: AgentTaskPlan
}

type CreateLocalEventInput = {
  runId: string
  type: MaterialChatEventType
  label: string
  message: string
  severity?: MaterialChatEventSeverity
  timestamp?: string
  rawKind?: AgentRunEventKind
}

export function createMaterialUserMessage(input: CreateUserMessageInput): MaterialChatMessage {
  const createdAt = input.now ?? new Date().toISOString()
  return {
    id: input.id ?? createMaterialChatId("user", createdAt),
    role: "user",
    content: input.content.trim() || "整理已上传素材",
    createdAt,
    attachments: input.attachments ?? [],
  }
}

export function createMaterialAssistantMessage(input: CreateAssistantMessageInput = {}): MaterialChatMessage {
  const createdAt = input.now ?? new Date().toISOString()
  return {
    id: input.id ?? createMaterialChatId("assistant", createdAt),
    role: "assistant",
    runId: input.runId,
    content: input.content ?? "正在等待本地 CLI 接手任务...",
    createdAt,
    status: input.status ?? "queued",
    events: [],
    taskPlan: input.taskPlan,
  }
}

export function materialChatEventFromRunEvent(event: AgentRunEvent): MaterialChatEvent {
  const mapped = mapRunEventKind(event.kind, event.message)
  return {
    id: createMaterialChatId(event.kind, `${event.runId}-${event.timestamp}-${event.message}`),
    runId: event.runId,
    type: mapped.type,
    label: mapped.label,
    message: event.message,
    timestamp: event.timestamp,
    severity: mapped.severity,
    rawKind: event.kind,
  }
}

export function createMaterialChatEvent(input: CreateLocalEventInput): MaterialChatEvent {
  const timestamp = input.timestamp ?? new Date().toISOString()
  return {
    id: createMaterialChatId(input.type, `${input.runId}-${timestamp}-${input.message}`),
    runId: input.runId,
    type: input.type,
    label: input.label,
    message: input.message,
    timestamp,
    severity: input.severity ?? "info",
    rawKind: input.rawKind,
  }
}

export function updateAssistantMessageFromRunEvent(message: MaterialChatMessage, event: AgentRunEvent): MaterialChatMessage {
  return appendMaterialChatEvent(message, materialChatEventFromRunEvent(event), {
    status: statusFromRunEvent(event.kind, event.message, message.status),
    runId: event.runId,
  })
}

export function appendMaterialChatEvent(
  message: MaterialChatMessage,
  event: MaterialChatEvent,
  patch: Partial<Pick<MaterialChatMessage, "status" | "runId" | "content" | "outputSummary">> = {},
): MaterialChatMessage {
  const nextEvents = [...(message.events ?? []), event].slice(-MAX_MATERIAL_CHAT_EVENTS)
  const nextContent = patch.content ?? contentFromEvent(event, message.content)
  return {
    ...message,
    ...patch,
    content: nextContent,
    events: nextEvents,
  }
}

export function updateMaterialChatMessage(
  messages: MaterialChatMessage[],
  messageId: string,
  updater: (message: MaterialChatMessage) => MaterialChatMessage,
): MaterialChatMessage[] {
  return messages.map((message) => (message.id === messageId ? updater(message) : message)).slice(-MAX_MATERIAL_CHAT_MESSAGES)
}

export function appendMaterialChatMessages(
  messages: MaterialChatMessage[],
  nextMessages: MaterialChatMessage[],
): MaterialChatMessage[] {
  return [...messages, ...nextMessages].slice(-MAX_MATERIAL_CHAT_MESSAGES)
}

export function buildMaterialChatFileAttachments(input: {
  fileName?: string
  fileCount?: number
  status?: MaterialChatAttachment["status"]
}): MaterialChatAttachment[] {
  const name = input.fileName?.trim()
  if (!name) return []
  const suffix = input.fileCount && input.fileCount > 1 ? `${input.fileCount} 个文件` : "文件"
  return [
    {
      id: createMaterialChatId("file", `${name}-${input.status ?? "ready"}`),
      name: `${suffix}：${name}`,
      kind: "file",
      status: input.status ?? "ready",
    },
  ]
}

function mapRunEventKind(
  kind: AgentRunEventKind,
  message: string,
): Pick<MaterialChatEvent, "type" | "label" | "severity"> {
  if (kind === "thinking_delta") return { type: "thinking_delta", label: "思考", severity: "info" }
  if (kind === "tool_call") return { type: "tool_call", label: "工具调用", severity: "info" }
  if (kind === "tool_result") return { type: "tool_result", label: "观察结果", severity: "muted" }
  if (kind === "file_write") return { type: "file_write", label: "文件产物", severity: "success" }
  if (kind === "failed" || kind === "agent_error") {
    return { type: "error", label: "运行失败", severity: "error" }
  }
  if (kind === "validating" || /validat|material-draft|schema|校验|验证/u.test(message)) {
    return { type: "validation", label: "结果校验", severity: "info" }
  }
  if (kind === "waiting_review") return { type: "inbox", label: "Inbox 待审核", severity: "success" }
  if (kind === "stderr" && isBenignCliStatusMessage(message)) {
    return { type: "status", label: "CLI 状态", severity: "muted" }
  }
  if (kind === "stderr") {
    return { type: "status", label: "CLI 诊断输出", severity: "warning" }
  }
  if (kind === "text_delta" || kind === "stdout" || kind === "agent") {
    return { type: "text_delta", label: kind === "stdout" ? "CLI 输出" : "Agent 输出", severity: "info" }
  }
  if (kind === "completed" || kind === "done") return { type: "status", label: "CLI 完成", severity: "success" }
  if (kind === "cancelled") return { type: "status", label: "已取消", severity: "warning" }
  if (kind === "queued") return { type: "status", label: "排队", severity: "muted" }
  if (kind === "running") return { type: "status", label: "本地 CLI 已启动", severity: "info" }
  if (kind === "context_planning") return { type: "status", label: "上下文规划", severity: "info" }
  if (kind === "planning") return { type: "status", label: "任务规划", severity: "info" }
  return { type: "status", label: "运行状态", severity: "info" }
}

function statusFromRunEvent(kind: AgentRunEventKind, message: string, current: MaterialChatMessage["status"]): MaterialChatStatus {
  if (kind === "queued") return "queued"
  if (kind === "completed" || kind === "done") return "validating"
  if (kind === "validating") return "validating"
  if (kind === "waiting_review") return "waiting_review"
  if (kind === "stderr" && isBenignCliStatusMessage(message)) {
    return current === "waiting_review" || current === "failed" || current === "cancelled" ? current : "streaming"
  }
  if (kind === "stderr") {
    return current === "waiting_review" || current === "failed" || current === "cancelled" ? current : "streaming"
  }
  if (kind === "failed" || kind === "agent_error") return "failed"
  if (kind === "cancelled") return "cancelled"
  return current === "waiting_review" || current === "failed" || current === "cancelled" ? current : "streaming"
}

function contentFromEvent(event: MaterialChatEvent, current: string): string {
  if (event.type === "inbox") return event.message
  if (event.type === "validation") return "正在校验 Agent 生成的候选素材..."
  if (event.type === "error") return event.message
  if (event.type === "file_write") return `已生成文件产物：${event.message}`
  if (event.type === "tool_call") return `正在调用工具：${event.message}`
  if (event.type === "thinking_delta") return "本地 CLI 正在思考和整理素材..."
  if (event.type === "text_delta" && event.message.trim()) return event.message
  return current
}

function isBenignCliStatusMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase()
  return (
    normalized === "reading prompt from stdin..." ||
    normalized === "thread.started" ||
    normalized === "turn.started" ||
    normalized === "turn.completed" ||
    normalized === "agent run started."
  )
}

function createMaterialChatId(prefix: string, seed: string) {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0
  }
  return `${prefix}-${hash.toString(36)}`
}

import { loadTauriAgentRuntime } from "@/lib/desktop/tauri-agent-runtime"
import type {
  AgentRunEvent,
  AgentRunEventKind,
  MaterialAgentRunResult,
  StartedAgentRun,
  StartMaterialAgentRunRequest,
} from "@/types/agent-runtime"

type ChatRunSseEvent =
  | { event: "start"; data: StartedAgentRun & Record<string, unknown> }
  | { event: AgentRunEventKind; data: AgentRunEvent }
  | { event: "agent"; data: { runId: string; type: string; message: string; timestamp: string; raw?: unknown } }
  | { event: "end"; data: { status: "completed" | "failed" | "cancelled"; result?: MaterialAgentRunResult; message?: string } }
  | { event: "error"; data: { message: string } }

export type MaterialChatRunCallbacks = {
  onStarted?: (run: StartedAgentRun) => void | Promise<void>
  onEvent?: (event: AgentRunEvent) => void
  onFrame?: (event: ChatRunSseEvent) => void
}

const AGENT_IDLE_TIMEOUT_MS = 10 * 60 * 1000

export async function runMaterialAgentChat(
  request: StartMaterialAgentRunRequest,
  callbacks: MaterialChatRunCallbacks = {},
): Promise<MaterialAgentRunResult> {
  if (isDesktopTauriRuntime()) {
    return runTauriMaterialAgentChat(request, callbacks)
  }
  return runHttpMaterialAgentChat(request, callbacks)
}

export function isDesktopTauriRuntime() {
  if (typeof window === "undefined") return false
  return "__TAURI_INTERNALS__" in window || "__TAURI_IPC__" in window
}

async function runTauriMaterialAgentChat(
  request: StartMaterialAgentRunRequest,
  callbacks: MaterialChatRunCallbacks,
): Promise<MaterialAgentRunResult> {
  const runtime = await loadTauriAgentRuntime()
  let trackedRunId = ""
  const pendingEvents: AgentRunEvent[] = []
  let unlisten: (() => void) | undefined
  let startedRun: StartedAgentRun | undefined
  let resolveCompletion!: () => void
  let rejectCompletion!: (error: Error) => void
  let idleTimeout: number | undefined
  let completionSettled = false
  const completion = new Promise<void>((resolve, reject) => {
    resolveCompletion = resolve
    rejectCompletion = reject
  })

  const clearIdleTimeout = () => {
    if (idleTimeout !== undefined) window.clearTimeout(idleTimeout)
    idleTimeout = undefined
  }

  const rejectRun = (error: Error) => {
    if (completionSettled) return
    completionSettled = true
    clearIdleTimeout()
    rejectCompletion(error)
  }

  const resolveRun = () => {
    if (completionSettled) return
    completionSettled = true
    clearIdleTimeout()
    resolveCompletion()
  }

  const resetIdleTimeout = () => {
    if (completionSettled) return
    clearIdleTimeout()
    idleTimeout = window.setTimeout(
      () => rejectRun(new Error("Agent 长时间没有输出，请检查本地 CLI 状态。")),
      AGENT_IDLE_TIMEOUT_MS,
    )
  }
  resetIdleTimeout()

  const consumeEvent = (event: AgentRunEvent) => {
    if (!trackedRunId) {
      pendingEvents.push(event)
      return
    }
    if (event.runId !== trackedRunId) return
    resetIdleTimeout()
    callbacks.onEvent?.(event)
    if (event.kind === "completed") resolveRun()
    if (event.kind === "failed" || event.kind === "agent_error" || event.kind === "cancelled") {
      rejectRun(new Error(event.message))
    }
  }

  try {
    unlisten = await runtime.onRunEvent(consumeEvent)
    startedRun = await runtime.startMaterialRun(request)
    trackedRunId = startedRun.runId
    resetIdleTimeout()
    await callbacks.onStarted?.(startedRun)
    pendingEvents.forEach(consumeEvent)
    await completion
    return await runtime.getMaterialRunResult(startedRun.runId)
  } finally {
    clearIdleTimeout()
    unlisten?.()
  }
}

async function runHttpMaterialAgentChat(
  request: StartMaterialAgentRunRequest,
  callbacks: MaterialChatRunCallbacks,
): Promise<MaterialAgentRunResult> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  })
  if (!response.ok || !response.body) {
    throw new Error(await response.text().catch(() => "Agent API request failed."))
  }

  let finalResult: MaterialAgentRunResult | undefined
  let finalError: Error | undefined
  const decoder = new TextDecoder()
  let buffer = ""

  const reader = response.body.getReader()
  for (;;) {
    const { value, done } = await reader.read()
    if (value) {
      buffer += decoder.decode(value, { stream: !done })
      const frames = buffer.split(/\r?\n\r?\n/)
      buffer = frames.pop() ?? ""
      for (const frame of frames) {
        const event = parseSseFrame(frame)
        if (!event) continue
        callbacks.onFrame?.(event)
        if (event.event === "start") {
          await callbacks.onStarted?.(event.data)
        } else if (isAgentRunEventFrame(event)) {
          callbacks.onEvent?.(event.data)
        } else if (event.event === "error") {
          finalError = new Error(event.data.message)
        } else if (event.event === "end") {
          if (event.data.result) finalResult = event.data.result
          if (event.data.status !== "completed") {
            finalError = new Error(event.data.message || "Agent run failed.")
          }
        }
      }
    }
    if (done) break
  }

  if (finalError) throw finalError
  if (!finalResult) throw new Error("Agent run completed without material-draft.json.")
  return finalResult
}

function isAgentRunEventFrame(event: ChatRunSseEvent): event is { event: AgentRunEventKind; data: AgentRunEvent } {
  return (
    event.event !== "start" &&
    event.event !== "end" &&
    event.event !== "error" &&
    event.event !== "agent" &&
    typeof (event as { data?: { kind?: unknown } }).data?.kind === "string"
  )
}

function parseSseFrame(frame: string): ChatRunSseEvent | null {
  const lines = frame.split(/\r?\n/)
  let event = "message"
  const dataLines: string[] = []
  for (const line of lines) {
    if (line.startsWith("event:")) event = line.slice("event:".length).trim()
    if (line.startsWith("data:")) dataLines.push(line.slice("data:".length).trimStart())
  }
  if (dataLines.length === 0) return null
  try {
    return { event, data: JSON.parse(dataLines.join("\n")) } as ChatRunSseEvent
  } catch {
    return null
  }
}

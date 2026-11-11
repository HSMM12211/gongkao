import type { AgentRunEvent } from "@/types/agent-runtime"

export const AGENT_TRACE_FILE_NAME = "trace.jsonl"

export type AgentTracePhase =
  | "queued"
  | "context_planning"
  | "planning"
  | "running"
  | "tool_calling"
  | "observing"
  | "artifact_written"
  | "validating"
  | "waiting_review"
  | "completed"
  | "failed"
  | "cancelled"

export type AgentTraceSeverity = "muted" | "info" | "success" | "warning" | "error"

export type AgentTraceStep = {
  runId: string
  kind: AgentRunEvent["kind"]
  phase: AgentTracePhase
  label: string
  message: string
  severity: AgentTraceSeverity
  timestamp: string
  eventType?: string
  raw?: unknown
}

export function traceStepFromRunEvent(event: AgentRunEvent): AgentTraceStep {
  const mapped = mapRunEventToTrace(event)
  return {
    runId: event.runId,
    kind: event.kind,
    timestamp: event.timestamp,
    eventType: event.eventType,
    raw: event.raw,
    ...mapped,
  }
}

export function parseTraceJsonl(raw: string): AgentRunEvent[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => safeParseRunEvent(line))
    .filter((event): event is AgentRunEvent => Boolean(event))
}

export function hasTraceContent(raw: string | undefined | null): boolean {
  return Boolean(raw?.split(/\r?\n/).some((line) => line.trim().length > 0))
}

function safeParseRunEvent(line: string): AgentRunEvent | undefined {
  try {
    const parsed = JSON.parse(line) as Partial<AgentRunEvent>
    if (!parsed.runId || !parsed.kind || !parsed.message || !parsed.timestamp) return undefined
    return {
      runId: parsed.runId,
      kind: parsed.kind as AgentRunEvent["kind"],
      message: parsed.message,
      timestamp: parsed.timestamp,
      eventType: parsed.eventType,
      raw: parsed.raw,
    }
  } catch {
    return undefined
  }
}

function mapRunEventToTrace(event: AgentRunEvent): Omit<AgentTraceStep, "runId" | "kind" | "timestamp" | "eventType" | "raw"> {
  if (event.kind === "queued") {
    return { phase: "queued", label: "Queued", message: event.message, severity: "muted" }
  }
  if (event.kind === "context_planning") {
    return { phase: "context_planning", label: "Context planning", message: event.message, severity: "info" }
  }
  if (event.kind === "planning") {
    return { phase: "planning", label: "Plan", message: event.message, severity: "info" }
  }
  if (event.kind === "running") {
    return { phase: "running", label: "CLI started", message: event.message, severity: "info" }
  }
  if (event.kind === "tool_call") {
    return { phase: "tool_calling", label: "Tool call", message: event.message, severity: "info" }
  }
  if (event.kind === "tool_result") {
    return { phase: "observing", label: "Observation", message: event.message, severity: "muted" }
  }
  if (event.kind === "file_write") {
    return { phase: "artifact_written", label: "Artifact written", message: event.message, severity: "success" }
  }
  if (event.kind === "validating" || (event.kind === "log" && /validat|material-draft|schema|校验|验证/u.test(event.message))) {
    return { phase: "validating", label: "Output validation", message: event.message, severity: "info" }
  }
  if (event.kind === "waiting_review") {
    return { phase: "waiting_review", label: "Waiting review", message: event.message, severity: "success" }
  }
  if (event.kind === "completed" || event.kind === "done") {
    return { phase: "completed", label: "Completed", message: event.message, severity: "success" }
  }
  if (event.kind === "failed" || event.kind === "agent_error") {
    return { phase: "failed", label: event.kind === "agent_error" ? "Agent error" : "Failed", message: event.message, severity: "error" }
  }
  if (event.kind === "cancelled") {
    return { phase: "cancelled", label: "Cancelled", message: event.message, severity: "warning" }
  }
  if (event.kind === "stderr") {
    return { phase: "observing", label: "CLI diagnostic", message: event.message, severity: "warning" }
  }
  if (event.kind === "thinking_delta") {
    return { phase: "observing", label: "CLI thinking", message: event.message, severity: "info" }
  }
  if (event.kind === "text_delta" || event.kind === "agent" || event.kind === "stdout") {
    return { phase: "observing", label: event.kind === "stdout" ? "CLI output" : "Agent stream", message: event.message, severity: "info" }
  }
  return { phase: "running", label: "Runtime log", message: event.message, severity: "info" }
}

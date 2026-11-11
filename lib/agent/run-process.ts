import type { AgentRunEvent } from "@/types/agent-runtime"
import { traceStepFromRunEvent, type AgentTracePhase, type AgentTraceSeverity } from "@/lib/agent/trace"

export type AgentRunProcessStage =
  | "idle"
  | AgentTracePhase

export type AgentRunProcessSeverity = AgentTraceSeverity

export type AgentRunProcessStep = {
  id: string
  stage: AgentRunProcessStage
  label: string
  message: string
  severity: AgentRunProcessSeverity
  timestamp?: string
}

export function buildAgentRunProcessTimeline(events: AgentRunEvent[]): AgentRunProcessStep[] {
  if (events.length === 0) {
    return [
      {
        id: "idle",
        stage: "idle",
        label: "Waiting",
        message: "Start an Agent run to see observable CLI progress here.",
        severity: "muted",
      },
    ]
  }

  return events.map((event, index) => {
    const mapped = mapAgentRunEvent(event)
    return {
      id: `${index}-${mapped.stage}-${event.timestamp}`,
      ...mapped,
      timestamp: event.timestamp,
    }
  })
}

function mapAgentRunEvent(event: AgentRunEvent): Omit<AgentRunProcessStep, "id" | "timestamp"> {
  const step = traceStepFromRunEvent(event)
  return {
    stage: step.phase,
    label: step.label,
    message: step.message,
    severity: step.severity,
  }
}

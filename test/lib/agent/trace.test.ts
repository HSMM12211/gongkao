import { describe, expect, it } from "vitest"

import { hasTraceContent, parseTraceJsonl, traceStepFromRunEvent } from "@/lib/agent/trace"
import type { AgentRunEvent } from "@/types/agent-runtime"

describe("agent trace helpers", () => {
  it("maps tool and artifact events to harness phases", () => {
    expect(traceStepFromRunEvent(event("tool_call", "shell: npm test")).phase).toBe("tool_calling")
    expect(traceStepFromRunEvent(event("tool_result", "completed: npm test")).phase).toBe("observing")
    expect(traceStepFromRunEvent(event("file_write", "material-draft.json")).phase).toBe("artifact_written")
  })

  it("detects validation and review boundary events", () => {
    expect(traceStepFromRunEvent(event("log", "validating material-draft.json")).phase).toBe("validating")
    expect(traceStepFromRunEvent(event("waiting_review", "输出已校验，等待人工审核")).phase).toBe("waiting_review")
  })

  it("parses jsonl while ignoring malformed records", () => {
    const raw = [
      JSON.stringify(event("running", "Agent run started.")),
      "{not json",
      JSON.stringify({ runId: "run-1", kind: "completed" }),
      JSON.stringify(event("completed", "done")),
    ].join("\n")

    const parsed = parseTraceJsonl(raw)

    expect(parsed).toHaveLength(2)
    expect(parsed.map((item) => item.kind)).toEqual(["running", "completed"])
  })

  it("detects non-empty trace content", () => {
    expect(hasTraceContent("\n\n")).toBe(false)
    expect(hasTraceContent("\n{}\n")).toBe(true)
  })
})

function event(kind: AgentRunEvent["kind"], message: string): AgentRunEvent {
  return {
    runId: "run-1",
    kind,
    message,
    timestamp: "2026-06-03T00:00:00.000Z",
  }
}

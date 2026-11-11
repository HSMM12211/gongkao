import { describe, expect, it } from "vitest"

import { buildAgentRunProcessTimeline } from "@/lib/agent/run-process"
import type { AgentRunEvent } from "@/types/agent-runtime"

describe("agent run process timeline", () => {
  it("turns observable CLI events into user-facing process steps", () => {
    const steps = buildAgentRunProcessTimeline([
      event("running", "Agent run started."),
      event("stdout", "Reading SKILL.md and preparing material draft"),
      event("log", "validating material-draft.json"),
      event("completed", "Agent run completed."),
    ])

    expect(steps.map((step) => step.stage)).toEqual(["running", "observing", "validating", "completed"])
    expect(steps[1]?.label).toBe("CLI output")
    expect(steps[2]?.message).toContain("validating")
  })

  it("maps thinking, tools, artifacts, and review boundary into harness phases", () => {
    const steps = buildAgentRunProcessTimeline([
      event("thinking_delta", "I need to inspect the staged skill."),
      event("tool_call", "shell: Get-Content SKILL.md"),
      event("tool_result", "completed: Get-Content SKILL.md"),
      event("file_write", "material-draft.json"),
      event("waiting_review", "输出已校验，等待人工审核入库。"),
    ])

    expect(steps.map((step) => step.stage)).toEqual([
      "observing",
      "tool_calling",
      "observing",
      "artifact_written",
      "waiting_review",
    ])
    expect(steps[4]?.severity).toBe("success")
  })

  it("keeps stderr as diagnostic output while failed events stay terminal errors", () => {
    const steps = buildAgentRunProcessTimeline([
      event("stderr", "model failed"),
      event("failed", "material-draft.json was not found"),
    ])

    expect(steps.map((step) => step.severity)).toEqual(["warning", "error"])
    expect(steps[0]?.label).toBe("CLI diagnostic")
    expect(steps[1]?.stage).toBe("failed")
  })

  it("returns an idle placeholder when no events have arrived", () => {
    const steps = buildAgentRunProcessTimeline([])

    expect(steps).toEqual([
      {
        id: "idle",
        stage: "idle",
        label: "Waiting",
        message: "Start an Agent run to see observable CLI progress here.",
        severity: "muted",
      },
    ])
  })
})

function event(kind: AgentRunEvent["kind"], message: string): AgentRunEvent {
  return {
    runId: "run-1",
    kind,
    message,
    timestamp: "2026-06-02T00:00:00.000Z",
  }
}

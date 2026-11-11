import { describe, expect, it } from "vitest"

import { reconcileAgentRunRecord } from "@/lib/agent/run-status-sync"
import type { AgentRunRecord } from "@/lib/storage/schema"

const runningRun: AgentRunRecord = {
  id: "run-1",
  adapterId: "codex",
  skillId: "gongkao-smoke-test-skill",
  status: "running",
  title: "Skill Runtime Smoke Test",
  startedAt: "2026-05-27T13:51:26.000Z",
  workspacePath: "C:\\Users\\djy\\AppData\\Roaming\\com.gongkao.shenlun\\agent-runs\\run-1",
  summary: "Agent 正在处理素材",
}

describe("agent run status reconciliation", () => {
  it("marks stale running records completed when the workspace has a valid material draft", () => {
    const reconciled = reconcileAgentRunRecord(
      runningRun,
      {
        status: "completed",
        summary: "material-draft.json 已生成",
        hasMaterialDraft: true,
        hasReport: true,
        hasTrace: true,
      },
      "2026-05-27T14:02:00.000Z",
    )

    expect(reconciled).toEqual({
      ...runningRun,
      status: "completed",
      endedAt: "2026-05-27T14:02:00.000Z",
      summary: "material-draft.json 已生成",
      error: undefined,
      hasTrace: true,
    })
  })

  it("marks stale running records failed when the workspace timed out without output", () => {
    const reconciled = reconcileAgentRunRecord(
      runningRun,
      {
        status: "failed",
        summary: "material-draft.json 未生成",
        error: "Agent run appears stale.",
        hasMaterialDraft: false,
        hasReport: false,
        hasTrace: true,
      },
      "2026-05-27T14:02:00.000Z",
    )

    expect(reconciled.status).toBe("failed")
    expect(reconciled.endedAt).toBe("2026-05-27T14:02:00.000Z")
    expect(reconciled.error).toBe("Agent run appears stale.")
    expect(reconciled.hasTrace).toBe(true)
  })

  it("does not rewrite terminal run records", () => {
    const completed: AgentRunRecord = { ...runningRun, status: "completed", endedAt: "2026-05-27T13:55:00.000Z" }

    expect(
      reconcileAgentRunRecord(
        completed,
        { status: "failed", summary: "material-draft.json 未生成", hasMaterialDraft: false, hasReport: false, hasTrace: true },
        "2026-05-27T14:02:00.000Z",
      ),
    ).toBe(completed)
  })

  it("recovers failed records when a previously rejected material draft now probes as completed", () => {
    const failed: AgentRunRecord = {
      ...runningRun,
      status: "failed",
      endedAt: "2026-06-02T22:12:00.000Z",
      summary: "material-draft.json is not valid JSON",
      error: "material-draft.json is not valid JSON",
    }

    const reconciled = reconcileAgentRunRecord(
      failed,
      {
        status: "completed",
        summary: "material-draft.json 已生成",
        hasMaterialDraft: true,
        hasReport: true,
        hasTrace: true,
      },
      "2026-06-02T22:50:00.000Z",
    )

    expect(reconciled.status).toBe("completed")
    expect(reconciled.summary).toBe("material-draft.json 已生成")
    expect(reconciled.error).toBeUndefined()
    expect(reconciled.hasTrace).toBe(true)
  })

  it("does not rewrite unrelated failed records", () => {
    const failed: AgentRunRecord = {
      ...runningRun,
      status: "failed",
      summary: "Agent process exited with code 1.",
      error: "Agent process exited with code 1.",
    }

    expect(
      reconcileAgentRunRecord(
        failed,
        { status: "completed", summary: "material-draft.json 已生成", hasMaterialDraft: true, hasReport: true, hasTrace: true },
        "2026-06-02T22:50:00.000Z",
      ),
    ).toBe(failed)
  })
})

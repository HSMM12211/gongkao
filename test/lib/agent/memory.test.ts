import { describe, expect, it } from "vitest"

import { buildAgentMemorySnapshot } from "@/lib/agent/memory"
import type { AgentRunRecord, MaterialInboxDraft, MaterialSource } from "@/lib/storage/schema"

describe("agent memory snapshot", () => {
  it("builds bounded recent summaries and asset warnings", () => {
    const runs: AgentRunRecord[] = [
      run("1", "failed"),
      run("2", "failed"),
      run("3", "running"),
      run("4", "waiting_review"),
      run("5", "completed"),
      run("6", "completed"),
    ]
    const drafts: MaterialInboxDraft[] = [draft("pending"), draft("imported")]

    const memory = buildAgentMemorySnapshot({
      runs,
      inboxDrafts: drafts,
      sources: [],
      learningAssetStats: { topics: 0, provenance: 0, needsReview: 2 },
      limit: 3,
    })

    expect(memory.recentRuns).toHaveLength(3)
    expect(memory.assets.pendingInbox).toBe(1)
    expect(memory.warnings.join("\n")).toContain("素材库为空")
    expect(memory.warnings.join("\n")).toContain("需要复核")
  })
})

function run(id: string, status: AgentRunRecord["status"]): AgentRunRecord {
  return {
    id,
    adapterId: "codex",
    skillId: "gongkao-material-parser",
    status,
    title: `run-${id}`,
    startedAt: `2026-06-03T00:00:0${id}.000Z`,
    workspacePath: `C:/runs/${id}`,
    summary: `summary-${id}`,
    hasTrace: true,
  }
}

function draft(status: MaterialInboxDraft["status"]): MaterialInboxDraft {
  return {
    id: `draft-${status}`,
    runId: "run",
    status,
    createdAt: "2026-06-03T00:00:00.000Z",
    outputJson: "{}",
    validationErrors: [],
  }
}

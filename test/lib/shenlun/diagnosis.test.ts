import { describe, expect, it } from "vitest"

import { createDeterministicDiagnosis, validateDiagnosis } from "@/lib/shenlun/diagnosis"
import type { ScoringPoint, TrainingQuestion, TrainingSession } from "@/lib/shenlun/types"

describe("shenlun diagnosis", () => {
  it("accepts fixed issue tags and scoring point hits", () => {
    const result = validateDiagnosis({
      id: "d-1",
      sessionId: "s-1",
      questionId: "q-1",
      score: 72,
      scoringPointHits: [{ scoringPointId: "sp-1", hit: true, evidence: "完善基础设施" }],
      issueTags: ["empty_countermeasure", "time_allocation_failed"],
      structureComments: ["层次基本清晰，但对策展开不足。"],
      languageSuggestions: [],
      createdAt: "2026-05-27T08:30:00.000Z",
    })

    expect(result.ok).toBe(true)
  })

  it("rejects unknown issue tags", () => {
    const result = validateDiagnosis({
      id: "d-1",
      sessionId: "s-1",
      questionId: "q-1",
      scoringPointHits: [],
      issueTags: ["random_problem"],
      structureComments: [],
      languageSuggestions: [],
      createdAt: "2026-05-27T08:30:00.000Z",
    })

    expect(result.ok).toBe(false)
  })

  it("creates deterministic scoring-point diagnosis", () => {
    const question: TrainingQuestion = {
      id: "q-1",
      materialIds: [],
      type: "countermeasure",
      title: "对策题",
      prompt: "提出对策",
      wordLimit: 60,
      suggestedMinutes: 25,
      scoringPointIds: ["sp-1", "sp-2"],
      createdAt: "2026-05-27T00:00:00.000Z",
    }
    const points: ScoringPoint[] = [
      { id: "sp-1", questionId: "q-1", text: "完善数字基础设施", weight: 1, aliases: ["基础设施"] },
      { id: "sp-2", questionId: "q-1", text: "提升群众数字素养", weight: 1, aliases: ["数字素养"] },
    ]
    const session: TrainingSession = {
      id: "s-1",
      mode: "timed_single",
      questionIds: ["q-1"],
      startedAt: "2026-05-27T08:00:00.000Z",
      status: "submitted",
      totalLimitSeconds: 1500,
      stageTimings: [{ stage: "reading", startedAt: "2026-05-27T08:00:00.000Z", durationSeconds: 510, exceeded: true }],
    }

    const diagnosis = createDeterministicDiagnosis({
      session,
      question,
      answerText: "应完善基础设施。",
      scoringPoints: points,
      now: "2026-05-27T08:30:00.000Z",
    })

    expect(diagnosis.scoringPointHits).toEqual([
      { scoringPointId: "sp-1", hit: true, evidence: "完善数字基础设施" },
      { scoringPointId: "sp-2", hit: false },
    ])
    expect(diagnosis.issueTags).toContain("missing_points")
    expect(diagnosis.issueTags).toContain("time_allocation_failed")
  })
})

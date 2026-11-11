import { describe, expect, it } from "vitest"

import { buildCalibrationReport } from "@/lib/shenlun/calibration-report"
import type { ShenlunDiagnosis, TrainingQuestion, TrainingSession } from "@/lib/shenlun/types"

describe("shenlun calibration report", () => {
  it("builds a period report with type breakdown and training plan", () => {
    const sessions: TrainingSession[] = [
      {
        id: "s-1",
        mode: "timed_single",
        questionIds: ["q-1"],
        startedAt: "2026-05-28T08:00:00.000Z",
        endedAt: "2026-05-28T08:30:00.000Z",
        status: "diagnosed",
        totalLimitSeconds: 1500,
        stageTimings: [{ stage: "reading", startedAt: "2026-05-28T08:00:00.000Z", endedAt: "2026-05-28T08:10:00.000Z", durationSeconds: 600, exceeded: true }],
      },
    ]
    const questions: TrainingQuestion[] = [
      {
        id: "q-1",
        materialIds: [],
        type: "countermeasure",
        title: "对策题",
        prompt: "作答",
        suggestedMinutes: 25,
        scoringPointIds: [],
        createdAt: "2026-05-28T08:00:00.000Z",
      },
    ]
    const diagnoses: ShenlunDiagnosis[] = [
      {
        id: "d-1",
        sessionId: "s-1",
        questionId: "q-1",
        score: 68,
        scoringPointHits: [],
        issueTags: ["empty_countermeasure", "time_allocation_failed"],
        structureComments: [],
        languageSuggestions: [],
        createdAt: "2026-05-28T08:30:00.000Z",
      },
    ]

    const report = buildCalibrationReport({
      sessions,
      questions,
      diagnoses,
      periodStart: "2026-05-01T00:00:00.000Z",
      periodEnd: "2026-05-31T23:59:59.000Z",
      now: "2026-05-28T09:00:00.000Z",
    })

    expect(report.trainingCount).toBe(1)
    expect(report.questionTypeBreakdown.countermeasure.count).toBe(1)
    expect(report.timeControl.exceededStageCount).toBe(1)
    expect(report.trainingPlan.join("\n")).toContain("对策")
  })
})

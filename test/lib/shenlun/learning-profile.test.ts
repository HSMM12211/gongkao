import { describe, expect, it } from "vitest"

import { buildDefaultLearningProfile, recalibrateLearningProfile } from "@/lib/shenlun/learning-profile"
import type { ShenlunDiagnosis, TrainingSession } from "@/lib/shenlun/types"

const diagnosis: ShenlunDiagnosis = {
  id: "diagnosis-1",
  sessionId: "session-1",
  questionId: "question-1",
  score: 62,
  scoringPointHits: [
    { scoringPointId: "point-1", hit: false },
    { scoringPointId: "point-2", hit: true, evidence: "完善基础设施" },
  ],
  issueTags: ["missing_points", "empty_countermeasure", "time_allocation_failed"],
  structureComments: [],
  languageSuggestions: [],
  createdAt: "2026-06-01T00:20:00.000Z",
}

const session: TrainingSession = {
  id: "session-1",
  mode: "timed_single",
  questionIds: ["question-1"],
  startedAt: "2026-06-01T00:00:00.000Z",
  endedAt: "2026-06-01T00:20:00.000Z",
  status: "diagnosed",
  totalLimitSeconds: 900,
  stageTimings: [
    {
      stage: "writing",
      startedAt: "2026-06-01T00:00:00.000Z",
      endedAt: "2026-06-01T00:20:00.000Z",
      durationSeconds: 1200,
      exceeded: true,
    },
  ],
}

describe("shenlun learning profile", () => {
  it("creates a default beginner profile with neutral ability scores", () => {
    const profile = buildDefaultLearningProfile("2026-06-01T00:00:00.000Z")

    expect(profile.stage).toBe("beginner")
    expect(profile.dailyAvailableMinutes).toBe(40)
    expect(profile.abilityScores.summary).toBe(50)
    expect(profile.abilityScores.countermeasure).toBe(50)
  })

  it("recalibrates ability scores from diagnosis issue tags and timing", () => {
    const profile = buildDefaultLearningProfile("2026-06-01T00:00:00.000Z")
    const recalibrated = recalibrateLearningProfile(profile, {
      diagnoses: [diagnosis],
      sessions: [session],
      now: "2026-06-01T00:30:00.000Z",
    })

    expect(recalibrated.issueTagCounts.missing_points).toBe(1)
    expect(recalibrated.issueTagCounts.empty_countermeasure).toBe(1)
    expect(recalibrated.abilityScores.countermeasure).toBeLessThan(50)
    expect(recalibrated.abilityScores.timeControl).toBeLessThan(50)
    expect(recalibrated.recentSessionIds).toEqual(["session-1"])
  })
})

import { describe, expect, it } from "vitest"

import { buildCalibrationSnapshot } from "@/lib/shenlun/calibration"
import type { ShenlunDiagnosis } from "@/lib/shenlun/types"

describe("shenlun calibration", () => {
  it("aggregates top issue tags and advice", () => {
    const diagnoses: ShenlunDiagnosis[] = [
      {
        id: "d-1",
        sessionId: "s-1",
        questionId: "q-1",
        scoringPointHits: [],
        issueTags: ["empty_countermeasure", "time_allocation_failed"],
        structureComments: [],
        languageSuggestions: [],
        createdAt: "2026-05-27T08:30:00.000Z",
      },
      {
        id: "d-2",
        sessionId: "s-2",
        questionId: "q-2",
        scoringPointHits: [],
        issueTags: ["empty_countermeasure"],
        structureComments: [],
        languageSuggestions: [],
        createdAt: "2026-05-28T08:30:00.000Z",
      },
    ]

    const snapshot = buildCalibrationSnapshot({
      diagnoses,
      periodStart: "2026-05-27T00:00:00.000Z",
      periodEnd: "2026-05-28T23:59:59.000Z",
      now: "2026-05-28T23:59:59.000Z",
    })

    expect(snapshot.topIssueTags[0]).toMatchObject({ tag: "empty_countermeasure", count: 2 })
    expect(snapshot.nextTrainingAdvice.join("\n")).toContain("对策")
  })
})

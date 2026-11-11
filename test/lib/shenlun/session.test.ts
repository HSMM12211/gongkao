import { describe, expect, it } from "vitest"

import { startTimedSingleSession, submitTrainingSession, transitionStage } from "@/lib/shenlun/session"

describe("shenlun training session state machine", () => {
  it("starts a timed single-question session", () => {
    const session = startTimedSingleSession({
      questionId: "q-1",
      totalLimitSeconds: 1500,
      now: "2026-05-27T08:00:00.000Z",
    })

    expect(session.mode).toBe("timed_single")
    expect(session.status).toBe("running")
    expect(session.questionIds).toEqual(["q-1"])
    expect(session.stageTimings[0].stage).toBe("reading")
  })

  it("records elapsed stage time when transitioning stages", () => {
    const session = startTimedSingleSession({
      questionId: "q-1",
      totalLimitSeconds: 1500,
      now: "2026-05-27T08:00:00.000Z",
    })

    const next = transitionStage(session, {
      nextStage: "outline",
      now: "2026-05-27T08:08:30.000Z",
      stageLimitSeconds: 480,
    })

    expect(next.stageTimings[0]).toMatchObject({
      stage: "reading",
      endedAt: "2026-05-27T08:08:30.000Z",
      durationSeconds: 510,
      exceeded: true,
    })
    expect(next.stageTimings[1].stage).toBe("outline")
  })

  it("submits a running session", () => {
    const session = startTimedSingleSession({
      questionId: "q-1",
      totalLimitSeconds: 1500,
      now: "2026-05-27T08:00:00.000Z",
    })

    const submitted = submitTrainingSession(session, "2026-05-27T08:25:00.000Z")

    expect(submitted.status).toBe("submitted")
    expect(submitted.endedAt).toBe("2026-05-27T08:25:00.000Z")
  })
})

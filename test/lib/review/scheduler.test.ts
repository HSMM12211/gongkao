import { describe, expect, it } from "vitest"
import { scheduleReview } from "@/lib/review/scheduler"

describe("scheduleReview", () => {
  it("schedules a new good review for tomorrow", () => {
    const now = new Date("2026-05-21T08:00:00.000Z")
    const next = scheduleReview(undefined, "good", now)

    expect(next.intervalDays).toBe(1)
    expect(next.repetitions).toBe(1)
    expect(next.lapses).toBe(0)
    expect(next.dueAt).toBe("2026-05-22T08:00:00.000Z")
  })

  it("resets interval when graded again", () => {
    const now = new Date("2026-05-21T08:00:00.000Z")
    const next = scheduleReview(
      {
        cardId: "f1",
        dueAt: "2026-05-21T08:00:00.000Z",
        intervalDays: 6,
        ease: 2.5,
        repetitions: 3,
        lapses: 0,
        updatedAt: "2026-05-20T08:00:00.000Z",
      },
      "again",
      now,
    )

    expect(next.intervalDays).toBe(0)
    expect(next.lapses).toBe(1)
    expect(next.dueAt).toBe("2026-05-21T08:10:00.000Z")
  })
})

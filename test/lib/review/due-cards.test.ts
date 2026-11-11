import { describe, expect, it } from "vitest"
import { getDueCards, getNextDueAt } from "@/lib/review/due-cards"
import type { Flashcard } from "@/lib/data"
import type { ReviewState } from "@/lib/storage/schema"

const cards: Flashcard[] = [
  { id: "f1", category: "对策", front: "A", keywords: ["A"] },
  { id: "f2", category: "金句", front: "B", keywords: ["B"] },
  { id: "f3", category: "规范词", front: "C", keywords: ["C"] },
]

describe("due-card helpers", () => {
  it("treats unseen and overdue cards as due", () => {
    const states: ReviewState[] = [
      {
        cardId: "f1",
        dueAt: "2026-05-20T08:00:00.000Z",
        intervalDays: 1,
        ease: 2.5,
        repetitions: 1,
        lapses: 0,
        updatedAt: "2026-05-19T08:00:00.000Z",
      },
      {
        cardId: "f2",
        dueAt: "2026-05-22T08:00:00.000Z",
        intervalDays: 1,
        ease: 2.5,
        repetitions: 1,
        lapses: 0,
        updatedAt: "2026-05-21T08:00:00.000Z",
      },
    ]

    expect(getDueCards(cards, states, new Date("2026-05-21T08:00:00.000Z")).map((card) => card.id)).toEqual([
      "f1",
      "f3",
    ])
  })

  it("returns the earliest future due time", () => {
    expect(
      getNextDueAt([
        {
          cardId: "f1",
          dueAt: "2026-05-23T08:00:00.000Z",
          intervalDays: 2,
          ease: 2.5,
          repetitions: 1,
          lapses: 0,
          updatedAt: "2026-05-21T08:00:00.000Z",
        },
        {
          cardId: "f2",
          dueAt: "2026-05-22T08:00:00.000Z",
          intervalDays: 1,
          ease: 2.5,
          repetitions: 1,
          lapses: 0,
          updatedAt: "2026-05-21T08:00:00.000Z",
        },
      ]),
    ).toBe("2026-05-22T08:00:00.000Z")
  })
})

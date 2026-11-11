import { describe, expect, it } from "vitest"
import { importedFlashcardToFlashcard, importedQuestionToQuestion } from "@/lib/material/adapters"
import type { ImportedFlashcard, ImportedQuestion } from "@/lib/storage/schema"

describe("material data adapters", () => {
  it("converts imported flashcards to runtime flashcards", () => {
    const imported: ImportedFlashcard = {
      id: "card-1",
      sourceId: "source-1",
      front: "核心抓手？",
      keywords: ["基础设施"],
      category: "对策",
      createdAt: "2026-05-21T08:00:00.000Z",
    }

    expect(importedFlashcardToFlashcard(imported)).toEqual({
      id: "imported-card-1",
      front: "核心抓手？",
      keywords: ["基础设施"],
      category: "对策",
    })
  })

  it("converts imported questions to runtime questions", () => {
    const imported: ImportedQuestion = {
      id: "q-1",
      sourceId: "source-1",
      title: "提出对策",
      type: "对策题",
      material: "材料",
      prompt: "要求",
      keywords: ["基础设施"],
      aiAnswer: "答案",
      createdAt: "2026-05-21T08:00:00.000Z",
    }

    expect(importedQuestionToQuestion(imported)).toEqual({
      id: "imported-q-1",
      title: "提出对策",
      type: "对策题",
      material: "材料",
      prompt: "要求",
      keywords: ["基础设施"],
      aiAnswer: "答案",
    })
  })
})

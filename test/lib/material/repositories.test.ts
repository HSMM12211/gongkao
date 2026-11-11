import "fake-indexeddb/auto"
import { beforeEach, describe, expect, it } from "vitest"
import { DB_NAME, type ImportedFlashcard, type ImportedQuestion, type MaterialSource } from "@/lib/storage/schema"
import { materialRepository } from "@/lib/storage/repositories"

async function deleteDb(name: string) {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => resolve()
  })
}

describe("material repositories", () => {
  beforeEach(async () => {
    await deleteDb(DB_NAME)
  })

  it("stores imported material source, flashcards, and questions", async () => {
    const source: MaterialSource = {
      id: "source-1",
      title: "数字乡村热点资料",
      sourceType: "text",
      originalName: "数字乡村.txt",
      createdAt: "2026-05-21T08:00:00.000Z",
      text: "推进数字乡村建设。",
      summary: "数字乡村建设是乡村振兴的重要抓手。",
      tags: ["乡村振兴", "数字治理"],
    }
    const flashcard: ImportedFlashcard = {
      id: "card-1",
      sourceId: source.id,
      front: "推进数字乡村建设的抓手是什么？",
      keywords: ["基础设施", "数字素养"],
      category: "对策",
      createdAt: source.createdAt,
    }
    const question: ImportedQuestion = {
      id: "q-import-1",
      sourceId: source.id,
      title: "请就如何推进数字乡村建设提出对策建议",
      type: "对策题",
      material: "推进数字乡村建设。",
      prompt: "要求：对策具体，不超过300字。",
      keywords: ["夯实基础设施", "提升数字素养"],
      aiAnswer: "推进数字乡村建设，需多措并举。",
      createdAt: source.createdAt,
    }

    await materialRepository.saveImportBundle({
      source,
      flashcards: [flashcard],
      questions: [question],
    })

    expect(await materialRepository.getSources()).toEqual([source])
    expect(await materialRepository.getFlashcards()).toEqual([flashcard])
    expect(await materialRepository.getQuestions()).toEqual([question])
  })
})

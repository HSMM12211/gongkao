import "fake-indexeddb/auto"
import { beforeEach, describe, expect, it } from "vitest"

import { shenlunRepository } from "@/lib/shenlun/repositories"
import type { LearningAssetProvenance, QuestionBankImportBatch, QuestionBankItem, ShenlunDocument, TopicAsset, TrainingQuestion } from "@/lib/shenlun/types"
import { DB_NAME } from "@/lib/storage/schema"

async function deleteDb(name: string) {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => resolve()
  })
}

describe("shenlun repositories", () => {
  beforeEach(async () => {
    await deleteDb(DB_NAME)
  })

  it("stores parsed document and training questions", async () => {
    const document: ShenlunDocument = {
      id: "doc-1",
      title: "2025 省考申论真题",
      documentType: "exam_paper",
      sourceType: "pdf",
      rawText: "材料一：数字乡村建设需要提升基层治理能力。",
      createdAt: "2026-05-27T00:00:00.000Z",
      parseStatus: "parsed",
    }
    const question: TrainingQuestion = {
      id: "q-1",
      documentId: "doc-1",
      materialIds: [],
      type: "countermeasure",
      title: "数字乡村对策题",
      prompt: "请提出推进数字乡村建设的对策。",
      suggestedMinutes: 25,
      scoringPointIds: [],
      createdAt: "2026-05-27T00:00:00.000Z",
    }

    await shenlunRepository.saveDocument(document)
    await shenlunRepository.saveQuestion(question)

    expect(await shenlunRepository.getDocuments()).toEqual([document])
    expect(await shenlunRepository.getQuestions()).toEqual([question])
  })

  it("stores learning provenance and topic assets", async () => {
    const provenance: LearningAssetProvenance = {
      id: "prov-1",
      sourceDocumentId: "doc-1",
      sourceType: "document",
      confidence: 0.9,
      reviewState: "ready",
      createdAt: "2026-06-01T00:00:00.000Z",
    }
    const topic: TopicAsset = {
      id: "topic-1",
      documentId: "doc-1",
      title: "数字乡村",
      category: "policy_theme",
      summary: "数字乡村建设材料",
      tags: ["数字乡村"],
      provenanceId: "prov-1",
      createdAt: "2026-06-01T00:00:00.000Z",
    }

    await shenlunRepository.saveLearningProvenance(provenance)
    await shenlunRepository.saveTopicAsset(topic)

    expect(await shenlunRepository.getLearningProvenance()).toEqual([provenance])
    expect(await shenlunRepository.getTopicAssets()).toEqual([topic])
  })

  it("stores question bank items and import batches", async () => {
    const item: QuestionBankItem = {
      id: "bank-1",
      sourceId: "doc-1",
      sourceTitle: "2025 Province Exam",
      sourceType: "document",
      sourceDocumentId: "doc-1",
      trainingQuestionId: "q-1",
      materialIds: ["m-1"],
      scoringPointIds: ["s-1"],
      practiceCategory: "past_paper",
      type: "countermeasure",
      title: "Digital village measures",
      prompt: "Propose measures.",
      materialPreview: "Digital village material.",
      standardAnswer: "Improve infrastructure.",
      rubric: {
        answerSource: "document",
        answerText: "Improve infrastructure.",
        trusted: true,
        points: [{ id: "s-1", text: "Improve infrastructure", weight: 1, keywords: ["infrastructure"] }],
      },
      abilityTags: ["countermeasure"],
      topicTags: ["digital village"],
      difficulty: "medium",
      estimatedMinutes: 25,
      reviewState: "ready",
      provenanceIds: ["prov-1"],
      confidence: 0.9,
      warnings: [],
      createdAt: "2026-06-03T08:00:00.000Z",
      updatedAt: "2026-06-03T08:00:00.000Z",
    }
    const batch: QuestionBankImportBatch = {
      id: "batch-1",
      sourceId: "doc-1",
      sourceTitle: "2025 Province Exam",
      sourceType: "document",
      parserSource: "mineru-skill",
      createdAt: "2026-06-03T08:00:00.000Z",
      itemIds: ["bank-1"],
      readyCount: 1,
      needsReviewCount: 0,
      ignoredDuplicateCount: 0,
      questionCount: 1,
      passageCount: 1,
      rubricCount: 1,
      warnings: [],
      status: "ready",
    }

    await shenlunRepository.saveQuestionBankItem(item)
    await shenlunRepository.saveQuestionBankImportBatch(batch)

    expect(await shenlunRepository.getQuestionBankItems()).toEqual([item])
    expect(await shenlunRepository.getQuestionBankImportBatches()).toEqual([batch])
  })
})

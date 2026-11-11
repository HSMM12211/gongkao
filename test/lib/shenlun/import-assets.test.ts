import "fake-indexeddb/auto"
import { beforeEach, describe, expect, it } from "vitest"

import { parseExamDocumentText } from "@/lib/shenlun/document-parser"
import { saveParsedShenlunDocumentOutput } from "@/lib/shenlun/import-assets"
import { shenlunRepository } from "@/lib/shenlun/repositories"
import { DB_NAME } from "@/lib/storage/schema"

async function deleteDb(name: string) {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => resolve()
  })
}

describe("shenlun import assets", () => {
  beforeEach(async () => {
    await deleteDb(DB_NAME)
  })

  it("persists parser output as trainable assets", async () => {
    const parsed = parseExamDocumentText({
      title: "2025 省考申论真题",
      sourceType: "pdf",
      rawText: [
        "材料一：数字乡村建设需要补齐基础设施短板。",
        "问题一：请提出推进数字乡村建设的对策。",
        "参考答案：补齐基础设施短板。",
        "评分要点：补齐基础设施短板。",
      ].join("\n"),
    })

    await saveParsedShenlunDocumentOutput(parsed, {
      idPrefix: "source-1",
      createdAt: "2026-05-28T08:00:00.000Z",
    })

    expect(await shenlunRepository.getDocuments()).toHaveLength(1)
    expect(await shenlunRepository.getPassages()).toHaveLength(1)
    expect(await shenlunRepository.getQuestions()).toHaveLength(1)
    expect(await shenlunRepository.getScoringPoints()).toHaveLength(1)
    expect((await shenlunRepository.getExamPapers())[0].questionIds).toHaveLength(1)
    expect(await shenlunRepository.getLearningProvenance()).toHaveLength(1)
    expect(await shenlunRepository.getQuestionBankItems()).toEqual([
      expect.objectContaining({
        sourceDocumentId: "shenlun-doc-source-1",
        trainingQuestionId: "shenlun-question-source-1-q1",
        practiceCategory: "past_paper",
        reviewState: "ready",
      }),
    ])
    expect(await shenlunRepository.getQuestionBankImportBatches()).toEqual([
      expect.objectContaining({
        sourceId: "shenlun-doc-source-1",
        questionCount: 1,
        readyCount: 1,
      }),
    ])
    expect(await shenlunRepository.getAbilityTags()).toEqual([
      expect.objectContaining({
        targetType: "question",
        dimension: "countermeasure",
      }),
    ])
    expect(await shenlunRepository.getTopicAssets()).toEqual([
      expect.objectContaining({
        documentId: "shenlun-doc-source-1",
        category: "policy_theme",
      }),
    ])
  })
})

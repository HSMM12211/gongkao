import { describe, expect, it } from "vitest"

import { deriveLearningAssetsFromParserOutput, reviewStateForDerivedAsset } from "@/lib/shenlun/learning-assets"
import type { ShenlunDocumentParserOutput } from "@/lib/shenlun/parser-output"

const parsed: ShenlunDocumentParserOutput = {
  document: {
    title: "数字乡村申论材料",
    documentType: "exam_paper",
    sourceType: "pdf",
    rawText: "材料一：数字乡村建设需要完善基础设施、提升数字素养。问题一：请提出对策。",
  },
  examPapers: [
    {
      title: "数字乡村申论材料",
      totalMinutes: 120,
      materialRefs: ["m1"],
      questionRefs: ["q1"],
    },
  ],
  passages: [
    {
      ref: "m1",
      order: 1,
      text: "数字乡村建设需要完善基础设施、提升数字素养。",
      tags: ["数字乡村", "基层治理"],
    },
  ],
  questions: [
    {
      ref: "q1",
      materialRefs: ["m1"],
      type: "countermeasure",
      title: "数字乡村对策题",
      prompt: "请提出推进数字乡村建设的对策。",
      suggestedMinutes: 25,
      scoringPointRefs: ["s1"],
    },
  ],
  answerKeys: [
    {
      questionRef: "q1",
      answerText: "完善基础设施，提升数字素养。",
      source: "document",
    },
  ],
  scoringPoints: [
    {
      ref: "s1",
      questionRef: "q1",
      text: "完善基础设施",
      weight: 1,
      aliases: ["基础设施"],
    },
  ],
  warnings: [],
}

describe("shenlun learning assets", () => {
  it("derives provenance, ability tags and topic assets from parser output", () => {
    const assets = deriveLearningAssetsFromParserOutput(parsed, {
      idPrefix: "source-1",
      documentId: "doc-1",
      questionIdByRef: new Map([["q1", "question-1"]]),
      passageIdByRef: new Map([["m1", "passage-1"]]),
      scoringPointIdByRef: new Map([["s1", "point-1"]]),
      createdAt: "2026-06-01T00:00:00.000Z",
    })

    expect(assets.provenance).toHaveLength(1)
    expect(assets.abilityTags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetId: "question-1",
          dimension: "countermeasure",
          provenanceId: assets.provenance[0].id,
        }),
      ]),
    )
    expect(assets.topicAssets[0]).toMatchObject({
      documentId: "doc-1",
      title: "数字乡村",
      category: "policy_theme",
      provenanceId: assets.provenance[0].id,
    })
  })

  it("requires review for ai generated scoring assets", () => {
    expect(reviewStateForDerivedAsset("ai_generated", true)).toBe("needs_review")
    expect(reviewStateForDerivedAsset("document", true)).toBe("ready")
  })
})

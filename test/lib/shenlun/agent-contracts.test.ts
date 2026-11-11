import { describe, expect, it } from "vitest"

import { parseAgentDiagnosisOutput, parseAgentExamParseOutput } from "@/lib/shenlun/agent-contracts"

describe("shenlun agent contracts", () => {
  it("accepts valid exam parse output", () => {
    const result = parseAgentExamParseOutput(
      JSON.stringify({
        document: {
          title: "2025 省考申论真题",
          documentType: "exam_paper",
          sourceType: "pdf",
          rawText: "材料一：数字乡村建设需要补齐基础设施短板。",
        },
        examPapers: [{ title: "2025 省考申论真题", totalMinutes: 150, materialRefs: ["m1"], questionRefs: ["q1"] }],
        passages: [{ ref: "m1", order: 1, text: "数字乡村建设需要补齐基础设施短板。", tags: ["数字乡村"] }],
        questions: [
          {
            ref: "q1",
            materialRefs: ["m1"],
            type: "countermeasure",
            title: "数字乡村对策题",
            prompt: "请提出对策。",
            suggestedMinutes: 25,
            scoringPointRefs: ["s1"],
          },
        ],
        answerKeys: [{ questionRef: "q1", answerText: "补齐基础设施短板。", source: "document" }],
        scoringPoints: [{ ref: "s1", questionRef: "q1", text: "补齐基础设施短板", weight: 1, aliases: ["基础设施"] }],
        warnings: [],
      }),
    )

    expect(result.ok).toBe(true)
  })

  it("rejects unknown diagnosis issue tags", () => {
    const result = parseAgentDiagnosisOutput(
      JSON.stringify({
        diagnosis: {
          score: 80,
          scoringPointHits: [],
          issueTags: ["unknown_issue"],
          structureComments: [],
          languageSuggestions: [],
          modelAnswer: "示范答案",
        },
      }),
      { sessionId: "s-1", questionId: "q-1", now: "2026-05-28T00:00:00.000Z" },
    )

    expect(result.ok).toBe(false)
  })
})

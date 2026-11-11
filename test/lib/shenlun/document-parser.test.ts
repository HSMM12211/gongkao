import { describe, expect, it } from "vitest"

import { parseExamDocumentText } from "@/lib/shenlun/document-parser"

describe("shenlun document parser", () => {
  it("extracts passages, questions, answer keys and scoring points from exam text", () => {
    const output = parseExamDocumentText({
      title: "2025 省考申论真题",
      sourceType: "pdf",
      originalName: "2025-shenlun.pdf",
      rawText: [
        "材料一：数字乡村建设需要补齐基础设施短板，提升群众数字素养。",
        "材料二：部分地区存在数据壁垒，基层人才支撑不足。",
        "问题一：根据给定资料，请提出推进数字乡村建设的对策。要求：不超过300字。",
        "参考答案：一是补齐基础设施短板。二是提升数字素养。三是打破数据壁垒。",
        "评分要点：补齐基础设施短板；提升数字素养；打破数据壁垒。",
      ].join("\n"),
    })

    expect(output.passages).toHaveLength(2)
    expect(output.questions).toHaveLength(1)
    expect(output.answerKeys[0].answerText).toContain("补齐基础设施")
    expect(output.scoringPoints.map((point) => point.text)).toContain("打破数据壁垒")
    expect(output.warnings).toEqual([])
    expect(output.abilityTags?.[0]).toMatchObject({
      targetRef: "q1",
      dimension: "countermeasure",
    })
    expect(output.topicAssets?.[0]).toMatchObject({
      category: "policy_theme",
      relatedQuestionRefs: ["q1"],
    })
  })

  it("keeps warnings when text has materials but no questions", () => {
    const output = parseExamDocumentText({
      title: "资料",
      sourceType: "text",
      rawText: "材料一：基层治理需要提升数字化能力。",
    })

    expect(output.passages).toHaveLength(1)
    expect(output.questions).toHaveLength(1)
    expect(output.warnings.join("\n")).toContain("未识别到明确题目")
  })
  it("uses MinerU layout blocks to keep page-aware passages", () => {
    const output = parseExamDocumentText({
      title: "2025 省考申论真题",
      sourceType: "pdf",
      rawText: "材料一：数字乡村建设需要补齐基础设施短板。\n问题一：请提出对策。",
      layoutBlocks: [
        { id: "b1", pageNumber: 1, order: 1, blockType: "heading", text: "材料一" },
        { id: "b2", pageNumber: 1, order: 2, blockType: "paragraph", text: "数字乡村建设需要补齐基础设施短板。" },
        { id: "b3", pageNumber: 2, order: 3, blockType: "heading", text: "问题一" },
        { id: "b4", pageNumber: 2, order: 4, blockType: "paragraph", text: "请提出推进数字乡村建设的对策。要求：不超过300字。" },
      ],
    })

    expect(output.passages[0]).toMatchObject({
      pageStart: 1,
      pageEnd: 1,
      text: "数字乡村建设需要补齐基础设施短板。",
    })
    expect(output.questions[0]).toMatchObject({
      prompt: "请提出推进数字乡村建设的对策。要求：不超过300字。",
      wordLimit: 300,
    })
  })
})

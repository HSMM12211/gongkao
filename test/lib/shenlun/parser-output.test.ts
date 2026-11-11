import { describe, expect, it } from "vitest"

import { parseShenlunDocumentOutput } from "@/lib/shenlun/parser-output"

describe("shenlun parser output", () => {
  it("accepts a structured exam paper parse result", () => {
    const result = parseShenlunDocumentOutput({
      document: {
        title: "2025 省考申论真题",
        documentType: "exam_paper",
        sourceType: "pdf",
        rawText: "材料一：数字乡村建设需要提升基层治理能力，并完善公共服务供给。",
      },
      examPapers: [
        {
          title: "2025 省考申论真题",
          totalMinutes: 150,
          materialRefs: ["m1"],
          questionRefs: ["q1"],
        },
      ],
      passages: [
        {
          ref: "m1",
          order: 1,
          text: "数字乡村建设需要提升基层治理能力，并完善公共服务供给。",
          tags: ["数字乡村"],
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
          answerText: "完善基础设施，提升数字素养，强化数据治理。",
          source: "document",
        },
      ],
      scoringPoints: [
        {
          ref: "s1",
          questionRef: "q1",
          text: "完善数字基础设施",
          weight: 1,
          aliases: ["基础设施"],
        },
      ],
      warnings: [],
    })

    expect(result.ok).toBe(true)
  })

  it("accepts optional learning asset sections with provenance", () => {
    const result = parseShenlunDocumentOutput({
      document: {
        title: "2025 省考申论真题",
        documentType: "exam_paper",
        sourceType: "pdf",
        rawText: "材料一：数字乡村建设需要提升基层治理能力，并完善公共服务供给。",
      },
      examPapers: [
        {
          title: "2025 省考申论真题",
          totalMinutes: 150,
          materialRefs: ["m1"],
          questionRefs: ["q1"],
        },
      ],
      passages: [
        {
          ref: "m1",
          order: 1,
          text: "数字乡村建设需要提升基层治理能力，并完善公共服务供给。",
          tags: ["数字乡村"],
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
          answerText: "完善基础设施，提升数字素养，强化数据治理。",
          source: "document",
        },
      ],
      scoringPoints: [
        {
          ref: "s1",
          questionRef: "q1",
          text: "完善数字基础设施",
          weight: 1,
          aliases: ["基础设施"],
        },
      ],
      provenance: [
        {
          ref: "p1",
          sourceType: "document",
          confidence: 0.95,
          reviewState: "ready",
          pageStart: 1,
          pageEnd: 1,
        },
      ],
      abilityTags: [
        {
          ref: "ability-q1",
          targetRef: "q1",
          dimension: "countermeasure",
          label: "对策提出",
          provenanceRef: "p1",
          confidence: 0.9,
        },
      ],
      topicAssets: [
        {
          ref: "topic-1",
          title: "数字乡村",
          category: "policy_theme",
          summary: "围绕数字乡村建设的治理、设施和服务主题。",
          tags: ["数字乡村", "基层治理"],
          provenanceRef: "p1",
          relatedQuestionRefs: ["q1"],
          relatedPassageRefs: ["m1"],
        },
      ],
      warnings: [],
    })

    expect(result.ok).toBe(true)
  })

  it("accepts multiple trainable questions from one parsed source", () => {
    const result = parseShenlunDocumentOutput({
      document: {
        title: "2025 Province Exam",
        documentType: "exam_paper",
        sourceType: "pdf",
        rawText: "Material content is long enough for a parser output fixture.",
      },
      examPapers: [
        {
          title: "2025 Province Exam",
          totalMinutes: 150,
          materialRefs: ["m1"],
          questionRefs: ["q1", "q2"],
        },
      ],
      passages: [
        {
          ref: "m1",
          order: 1,
          text: "Digital village construction requires better public services and governance coordination.",
          tags: ["digital village"],
        },
      ],
      questions: [
        {
          ref: "q1",
          materialRefs: ["m1"],
          type: "countermeasure",
          title: "Measures",
          prompt: "Propose measures.",
          suggestedMinutes: 25,
          scoringPointRefs: [],
        },
        {
          ref: "q2",
          materialRefs: ["m1"],
          type: "analysis",
          title: "Analysis",
          prompt: "Analyze the causes.",
          suggestedMinutes: 25,
          scoringPointRefs: [],
        },
      ],
      answerKeys: [],
      scoringPoints: [],
      warnings: [],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.questions).toHaveLength(2)
  })

  it("rejects invalid learning asset confidence", () => {
    const result = parseShenlunDocumentOutput({
      document: {
        title: "2025 省考申论真题",
        documentType: "exam_paper",
        sourceType: "pdf",
        rawText: "材料一：数字乡村建设需要提升基层治理能力，并完善公共服务供给。",
      },
      examPapers: [],
      passages: [
        {
          ref: "m1",
          order: 1,
          text: "数字乡村建设需要提升基层治理能力，并完善公共服务供给。",
          tags: [],
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
          scoringPointRefs: [],
        },
      ],
      answerKeys: [],
      scoringPoints: [],
      provenance: [
        {
          ref: "p1",
          sourceType: "document",
          confidence: 1.5,
          reviewState: "ready",
        },
      ],
      warnings: [],
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.join("\n")).toContain("provenance.0.confidence")
  })

  it("rejects parser output without trainable questions", () => {
    const result = parseShenlunDocumentOutput({
      document: {
        title: "空文档",
        documentType: "exam_paper",
        sourceType: "pdf",
        rawText: "只有材料内容，没有题目，不能形成训练闭环。",
      },
      examPapers: [],
      passages: [],
      questions: [],
      answerKeys: [],
      scoringPoints: [],
      warnings: [],
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.join("\n")).toContain("questions")
  })
})

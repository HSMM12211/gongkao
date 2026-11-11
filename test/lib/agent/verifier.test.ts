import { describe, expect, it } from "vitest"

import { verifyAgentMaterialOutput } from "@/lib/agent/verifier"
import type { AgentMaterialOutput } from "@/lib/material/types"

describe("agent business verifier", () => {
  it("warns when long pdf output has too few questions and references", () => {
    const result = verifyAgentMaterialOutput({
      output: output({ sourceType: "pdf", references: 1, questions: 1, flashcards: 1 }),
      originalSourceChars: 120_000,
      finalSourceChars: 30_000,
    })

    expect(result.ok).toBe(true)
    expect(result.reviewRecommendation).toBe("needs_review")
    expect(result.warnings.join("\n")).toContain("长文档")
    expect(result.warnings.join("\n")).toContain("裁剪")
  })

  it("rejects output without trainable questions", () => {
    const result = verifyAgentMaterialOutput({
      output: output({ references: 1, questions: 0, flashcards: 3 }),
    })

    expect(result.ok).toBe(false)
    expect(result.errors.join("\n")).toContain("缺少可训练题目")
    expect(result.reviewRecommendation).toBe("rejected")
  })

  it("passes complete output as ready", () => {
    const result = verifyAgentMaterialOutput({
      output: output({ references: 4, questions: 6, flashcards: 8, confidence: 0.9 }),
      originalSourceChars: 20_000,
    })

    expect(result.ok).toBe(true)
    expect(result.warnings).toHaveLength(0)
    expect(result.reviewRecommendation).toBe("ready")
  })
})

function output({
  sourceType = "text",
  references,
  questions,
  flashcards,
  confidence = 0.82,
}: {
  sourceType?: "text" | "markdown" | "pdf"
  references: number
  questions: number
  flashcards: number
  confidence?: number
}): AgentMaterialOutput {
  return {
    schemaVersion: 1,
    source: {
      title: "source",
      sourceType,
      text: "source text".repeat(20),
      references: Array.from({ length: references }, (_, index) => ({
        title: `ref-${index + 1}`,
        accessedAt: "2026-06-03T00:00:00.000Z",
        excerpt: `excerpt-${index + 1}`,
      })),
    },
    draft: {
      topic: "topic",
      summary: "summary",
      tags: ["tag"],
      keywords: ["a", "b", "c"],
      goldenSentences: [],
      flashcards: Array.from({ length: flashcards }, (_, index) => ({
        front: `card-${index + 1}`,
        keywords: ["key"],
        category: "规范词",
      })),
      practiceQuestions: Array.from({ length: questions }, (_, index) => ({
        type: "概括题",
        title: `question-${index + 1}`,
        material: "material",
        prompt: "prompt",
        keywords: ["key"],
        modelAnswer: "answer",
      })),
      copybookItems: [],
    },
    report: {
      summary: "report",
      warnings: [],
      confidence,
    },
  }
}

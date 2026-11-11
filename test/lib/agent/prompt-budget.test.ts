import { describe, expect, it } from "vitest"
import { applyPromptBudget, estimatePromptBudget, materialAgentPromptBudgetLimits } from "@/lib/agent/prompt-budget"

describe("prompt budget", () => {
  it("keeps short source text unchanged", () => {
    const result = applyPromptBudget({
      prompt: "整理数字乡村",
      sourceText: "这是一段较短的素材文本，用于生成专题摘要和金句。",
      maxSourceChars: 100,
      hardMaxTotalChars: 500,
    })

    expect(result.blocked).toBe(false)
    expect(result.sourceText).toContain("较短的素材文本")
    expect(result.warnings).toEqual([])
  })

  it("trims long source text and records a warning", () => {
    const longSource = "基层治理".repeat(120)
    const result = applyPromptBudget({
      prompt: "生成专题 Wiki",
      sourceText: longSource,
      maxSourceChars: 80,
      hardMaxTotalChars: 500,
    })

    expect(result.blocked).toBe(false)
    expect(result.sourceText.length).toBeLessThan(longSource.length)
    expect(result.warnings[0]).toContain("已自动裁剪来源正文")
  })

  it("blocks when the composed prompt remains over hard limit", () => {
    const result = applyPromptBudget({
      prompt: "用户要求".repeat(200),
      sourceText: "素材".repeat(200),
      maxSourceChars: 60,
      hardMaxTotalChars: 120,
    })

    expect(result.blocked).toBe(true)
    expect(result.errors[0]).toContain("上下文仍超过预算")
  })

  it("estimates total context size", () => {
    expect(
      estimatePromptBudget({
        prompt: "abc",
        sourceText: "defgh",
        skillInstructionChars: 10,
        referencesChars: 20,
      }).totalChars,
    ).toBe(38)
  })

  it("allows full OCR PDF text that fits the long-document budget", () => {
    const sourceText = "OCR PDF page text\n".repeat(7_500)
    const limits = materialAgentPromptBudgetLimits({
      sourceType: "pdf",
      sourceChars: sourceText.length,
    })
    const result = applyPromptBudget({
      prompt: "Generate a complete question set from this PDF.",
      sourceText,
      skillInstructionChars: 6000,
      referencesChars: 300,
      ...limits,
    })

    expect(limits.maxSourceChars).toBeGreaterThanOrEqual(160_000)
    expect(result.blocked).toBe(false)
    expect(result.sourceText).toBe(sourceText)
    expect(result.warnings).toEqual([])
  })
})

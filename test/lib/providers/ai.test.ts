import { describe, expect, it } from "vitest"
import { createMockDiagnosis, parseAiDiagnosis } from "@/lib/providers/ai"
import { DEFAULT_AI_SETTINGS } from "@/lib/providers/settings"

const question = {
  title: "请就如何推进数字乡村建设提出对策建议",
  type: "对策题",
  material: "材料",
  prompt: "要求",
  keywords: ["夯实基础设施", "提升数字素养"],
  aiAnswer: "一是夯实基础设施。二是提升数字素养。",
}

describe("AI provider helpers", () => {
  it("creates deterministic mock diagnosis from keyword hits", async () => {
    const diagnosis = await createMockDiagnosis({
      question,
      answer: "应夯实基础设施。",
      settings: DEFAULT_AI_SETTINGS,
    })

    expect(diagnosis.keywordHits).toEqual(["夯实基础设施"])
    expect(diagnosis.missingKeywords).toEqual(["提升数字素养"])
    expect(diagnosis.modelAnswer).toBe(question.aiAnswer)
    expect(diagnosis.copybookText).toBe(question.aiAnswer)
  })

  it("parses valid JSON diagnosis", () => {
    const parsed = parseAiDiagnosis(
      JSON.stringify({
        score: 88,
        keywordHits: ["夯实基础设施"],
        missingKeywords: [],
        logicIssues: ["结构可更清晰"],
        languageSuggestions: [{ original: "搞", revised: "推进", reason: "更规范" }],
        modelAnswer: "示范答案",
        copybookText: "示范答案",
      }),
    )

    expect(parsed?.score).toBe(88)
    expect(parsed?.languageSuggestions[0].revised).toBe("推进")
  })

  it("returns null for invalid JSON diagnosis", () => {
    expect(parseAiDiagnosis("不是 JSON")).toBeNull()
  })
})

import { describe, expect, it } from "vitest"
import { parseAgentMaterialOutput, toMaterialDraftFromAgentOutput } from "@/lib/agent/material-output"

const validOutput = {
  schemaVersion: 1,
  source: {
    title: "Digital village policy material",
    sourceType: "text",
    originalName: "agent://gongkao-hotspot-collector",
    text: "Digital village construction should improve infrastructure, data sharing, public services, and local governance capacity.",
    references: [
      {
        title: "Policy file",
        url: "https://example.gov.cn/policy",
        publisher: "State Council",
        publishedAt: "2026-05-01",
        accessedAt: "2026-05-26T10:00:00.000Z",
        snapshotPath: "source-snapshots/001.md",
        excerpt: "Policy excerpt.",
      },
    ],
  },
  draft: {
    topic: "Digital village construction",
    summary: "A structured public-exam material draft.",
    source: "agent",
    tags: ["digital village", "rural revitalization"],
    keywords: ["infrastructure", "digital literacy", "data sharing"],
    goldenSentences: ["Use digital governance to modernize rural public services."],
    flashcards: [{ front: "What are the core measures?", keywords: ["infrastructure"], category: "对策" }],
    practiceQuestions: [
      {
        type: "对策题",
        title: "Suggest measures for digital village construction",
        material: "Digital village construction material.",
        prompt: "Give specific and targeted measures.",
        keywords: ["infrastructure"],
        modelAnswer: "Improve infrastructure, improve literacy, and improve data governance.",
      },
    ],
    copybookItems: [{ title: "Standard expression", text: "Modernize rural public services.", tags: ["digital village"] }],
  },
  report: {
    summary: "Generated one complete material draft.",
    warnings: [],
    confidence: 0.82,
  },
}

describe("agent material output", () => {
  it("parses valid agent material output", () => {
    const parsed = parseAgentMaterialOutput(JSON.stringify(validOutput))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.source.references[0].publisher).toBe("State Council")
    expect(toMaterialDraftFromAgentOutput(parsed.value).topic).toBe("Digital village construction")
  })

  it("parses agent output with a UTF-8 BOM prefix", () => {
    const parsed = parseAgentMaterialOutput(`\uFEFF${JSON.stringify(validOutput)}`)
    expect(parsed.ok).toBe(true)
  })

  it("normalizes local pdf agent output aliases before validation", () => {
    const output = {
      schemaVersion: 1,
      source: {
        title: "实战公考-理论速讲-资料分析",
        sourceType: "pdf",
        originalName: "实战公考-理论速讲-资料分析.pdf",
        text: "资料分析理论速讲，包含尾数法、截位法、增长率、比重、拉动增长和容斥问题等内容。",
        references: [
          {
            title: "实战公考-理论速讲-资料分析.pdf",
            sourceType: "pdf",
            locator: "PDF全文摘录，页码约1-108",
            note: "用于生成资料分析学习材料草稿",
          },
        ],
      },
      draft: {
        topic: "资料分析理论速讲",
        summary: "围绕资料分析速算技巧和高频公式形成训练素材。",
        tags: ["资料分析", "公考行测"],
        keywords: ["尾数法", "增长率", "比重"],
        goldenSentences: ["资料分析先判题型，再选算法。"],
        flashcards: [
          {
            category: "规范词",
            front: "尾数法适用于什么题型？",
            back: "常见于多主体求和、求差，选项尾数不一致时使用。",
          },
        ],
        practiceQuestions: [
          {
            type: "综合分析",
            question: "资料分析多主体求和题中应如何选择速算方法？",
            answer: "先看选项尾数和主体位数，再选择尾数法、截位法等方法。",
            difficulty: "基础",
          },
        ],
        copybookItems: [
          {
            text: "资料分析先判题型，再选算法。",
            source: "讲义摘录",
          },
        ],
      },
    }

    const parsed = parseAgentMaterialOutput(JSON.stringify(output))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.source.references[0].accessedAt).toEqual(expect.any(String))
    expect(parsed.value.source.references[0].excerpt).toBe("用于生成资料分析学习材料草稿")
    expect(parsed.value.draft.flashcards[0].keywords).toContain("常见于多主体求和、求差，选项尾数不一致时使用。")
    expect(parsed.value.draft.practiceQuestions[0].title).toBe("资料分析多主体求和题中应如何选择速算方法？")
    expect(parsed.value.draft.copybookItems[0].title).toBe("讲义摘录")
  })

  it("rejects output without references and enough source text", () => {
    const invalid = {
      ...validOutput,
      source: { ...validOutput.source, text: "short", references: [] },
    }
    const parsed = parseAgentMaterialOutput(JSON.stringify(invalid))
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.errors.join("\n")).toContain("source.text")
    expect(parsed.errors.join("\n")).toContain("references")
  })
})

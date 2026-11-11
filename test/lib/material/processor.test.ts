import { describe, expect, it } from "vitest"
import { buildImportBundle, createMockMaterialDraft, parseMaterialDraft, validateMaterialDraft } from "@/lib/material/processor"

describe("material processor", () => {
  it("creates a structured mock draft from source text", async () => {
    const draft = await createMockMaterialDraft("数字乡村建设要夯实基础设施，提升数字素养，打破数据壁垒。")

    expect(draft.topic).toContain("数字乡村")
    expect(draft.keywords.length).toBeGreaterThanOrEqual(3)
    expect(draft.flashcards[0].front).toContain("核心")
    expect(draft.practiceQuestions[0].type).toBe("对策题")
    expect(draft.copybookItems[0].text.length).toBeGreaterThan(0)
  })

  it("validates required import fields", () => {
    expect(
      validateMaterialDraft({
        topic: "",
        summary: "",
        tags: [],
        keywords: [],
        goldenSentences: [],
        flashcards: [],
        practiceQuestions: [],
        copybookItems: [],
      }),
    ).toEqual(["缺少热点主题", "至少需要 3 个关键词", "至少需要 1 张闪卡", "至少需要 1 道练习题"])
  })

  it("parses valid JSON draft and rejects invalid JSON", () => {
    const raw = JSON.stringify({
      topic: "数字乡村",
      summary: "摘要",
      tags: ["乡村振兴"],
      keywords: ["基础设施", "数字素养", "数据共享"],
      goldenSentences: ["以数字化赋能乡村治理现代化。"],
      flashcards: [{ front: "核心抓手？", keywords: ["基础设施"], category: "对策" }],
      practiceQuestions: [
        {
          type: "对策题",
          title: "提出对策",
          material: "材料",
          prompt: "要求",
          keywords: ["基础设施"],
          modelAnswer: "答案",
        },
      ],
      copybookItems: [{ title: "临摹", text: "规范表达", tags: ["乡村振兴"] }],
    })

    expect(parseMaterialDraft(raw)?.topic).toBe("数字乡村")
    expect(parseMaterialDraft("not json")).toBeNull()
  })

  it("keeps MinerU layout metadata in import bundles", async () => {
    const draft = await createMockMaterialDraft("数字乡村建设需要补齐基础设施短板，提升数字素养，打破数据壁垒。")
    const bundle = buildImportBundle(
      {
        title: "exam",
        sourceType: "pdf",
        originalName: "exam.pdf",
        text: "材料一\n数字乡村建设需要补齐基础设施短板。",
        layoutBlocks: [
          { id: "b1", pageNumber: 1, order: 1, blockType: "heading", text: "材料一" },
          { id: "b2", pageNumber: 1, order: 2, blockType: "paragraph", text: "数字乡村建设需要补齐基础设施短板。" },
        ],
        pages: [{ pageNumber: 1, text: "材料一\n数字乡村建设需要补齐基础设施短板。", blockIds: ["b1", "b2"] }],
      },
      draft,
    )

    expect(bundle.source.layoutBlocks?.map((block) => block.id)).toEqual(["b1", "b2"])
    expect(bundle.source.pages?.[0].blockIds).toEqual(["b1", "b2"])
  })
})

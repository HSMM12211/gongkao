import { describe, expect, it } from "vitest"

import { parseAgentMaterialOutput } from "@/lib/agent/material-output"

describe("gongkao smoke test skill output", () => {
  it("documents a minimal valid material-draft payload", () => {
    const output = {
      schemaVersion: 1,
      source: {
        title: "Skill Runtime Smoke Test",
        sourceType: "text",
        text: "This is a smoke-test material source for Gongkao Agent runtime validation.",
        references: [
          {
            title: "Local smoke-test input",
            publisher: "Gongkao Desktop",
            accessedAt: "2026-05-27",
            excerpt: "Smoke-test material source for runtime validation.",
          },
        ],
      },
      draft: {
        topic: "Skill Runtime Smoke Test",
        summary: "The Agent runtime can read the Skill instruction and produce a valid structured material draft.",
        tags: ["smoke-test", "runtime"],
        keywords: ["Skill", "Agent", "material-draft"],
        goldenSentences: ["基础能力稳定，复杂工作流才有可靠落点。"],
        flashcards: [
          {
            front: "Skill 冒烟测试验证哪条链路？",
            keywords: ["Skill", "隔离工作区", "结构化输出"],
            category: "对策",
          },
        ],
        practiceQuestions: [
          {
            type: "综合分析",
            title: "Skill 运行链路验证",
            material: "应用通过本地 CLI Agent 执行 Skill，并读取 material-draft.json。",
            prompt: "请简要分析为什么需要先做冒烟测试。",
            keywords: ["稳定性", "可观测", "闭环"],
            modelAnswer:
              "冒烟测试能够用最小任务验证 Skill 发现、隔离工作区、CLI 调用和结构化输出是否贯通，便于在复杂素材采集前快速定位基础链路问题。",
          },
        ],
        copybookItems: [
          {
            title: "运行稳定",
            text: "基础能力稳定，复杂工作流才有可靠落点。",
            tags: ["smoke-test"],
          },
        ],
      },
      report: {
        summary: "Smoke test completed.",
        warnings: [],
        confidence: 0.9,
      },
    }

    const result = parseAgentMaterialOutput(JSON.stringify(output))
    expect(result).toEqual({ ok: true, value: expect.any(Object) })
  })
})

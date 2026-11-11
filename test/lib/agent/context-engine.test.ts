import { describe, expect, it } from "vitest"

import { buildAgentContextMap } from "@/lib/agent/context-engine"
import type { MaterialContextPayload } from "@/lib/agent/context-mentions"

const emptyContext: MaterialContextPayload = {
  skillIds: [],
  topicIds: [],
  fileIds: [],
  sourceIds: [],
  questionTypes: [],
  tags: [],
  unknownMentions: [],
}

describe("agent context engine", () => {
  it("uses full source mode for short uncropped text", () => {
    const map = buildAgentContextMap({
      title: "短素材",
      sourceType: "text",
      sourceText: "基层治理需要完善网格化服务和数字化协同。".repeat(20),
      boundContext: emptyContext,
    })

    expect(map.mode).toBe("full_source")
    expect(map.snippets).toHaveLength(0)
  })

  it("uses snippets for long text and records warnings", () => {
    const map = buildAgentContextMap({
      title: "长 PDF",
      sourceType: "pdf",
      originalName: "paper.pdf",
      sourceText: ["第一章 概述", "政策背景".repeat(5000), "第二章 题目", "作答要求".repeat(5000)].join("\n\n"),
      boundContext: emptyContext,
      promptBudget: {
        originalSourceChars: 80_000,
        finalSourceChars: 30_000,
        totalChars: 36_000,
        warnings: ["已自动裁剪来源正文：80000 -> 30000 字"],
      },
    })

    expect(map.mode).toBe("snippets")
    expect(map.snippets.length).toBeGreaterThan(0)
    expect(map.warnings.join("\n")).toContain("上下文地图")
    expect(map.budget.warnings[0]).toContain("裁剪")
  })
})

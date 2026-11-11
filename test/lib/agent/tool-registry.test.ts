import { describe, expect, it } from "vitest"

import { buildAgentToolPlan, getAgentToolDefinition } from "@/lib/agent/tool-registry"

describe("agent tool registry", () => {
  it("selects pdf extraction with mineru fallback for pdf sources", () => {
    const plan = buildAgentToolPlan({
      sourceType: "pdf",
      originalName: "paper.pdf",
      sourceChars: 120_000,
      instruction: "解析文档入库",
      skillId: "gongkao-material-parser",
      adapterCapabilities: ["fileRead", "fileWrite", "structuredOutput"],
    })

    expect(plan.primaryToolId).toBe("pdf.extract")
    expect(plan.fallbackToolIds).toContain("pdf.ocr.mineru")
    expect(plan.fallbackToolIds).toContain("memory.retrieve")
  })

  it("selects material parsing for text sources", () => {
    const plan = buildAgentToolPlan({
      sourceType: "text",
      sourceChars: 3000,
      instruction: "整理素材",
      skillId: "gongkao-material-parser",
    })

    expect(plan.primaryToolId).toBe("material.parse")
    expect(plan.tools.map((tool) => tool.id)).toContain("memory.retrieve")
  })

  it("adds source verification when requested", () => {
    const plan = buildAgentToolPlan({
      sourceType: "markdown",
      sourceChars: 3000,
      instruction: "核验来源可靠性",
      skillId: "gongkao-source-verifier",
    })

    expect(plan.fallbackToolIds).toContain("source.verify")
    expect(getAgentToolDefinition("source.verify").failureMode).toBe("retryable")
  })
})

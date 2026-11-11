import { describe, expect, it } from "vitest"

import { buildAgentTaskPlan, summarizeAgentTaskPlan, taskPlanWarningMessages } from "@/lib/agent/orchestrator"
import type { AgentContextMap } from "@/lib/agent/context-engine"
import type { AgentMemorySnapshot } from "@/lib/agent/memory"
import type { AgentToolPlan } from "@/lib/agent/tool-registry"
import type { AgentWorkflowPlan } from "@/lib/agent/workflow-plan"

describe("agent orchestrator", () => {
  it("builds a review-bound task plan from harness inputs", () => {
    const plan = buildAgentTaskPlan({
      runGoal: "解析 PDF 入库",
      skill: {
        id: "gongkao-material-parser",
        name: "政策文件解析器",
        trust: "trusted",
        source: "built-in",
        requiredPermissions: ["promptInject", "fileRead"],
      },
      contextMap: contextMap({ originalChars: 80000, providedChars: 30000 }),
      toolPlan: toolPlan(),
      memory: memory(),
      workflowPlan: workflowPlan(),
    })

    expect(plan.reviewRequired).toBe(true)
    expect(plan.skill.id).toBe("gongkao-material-parser")
    expect(plan.context.originalSourceChars).toBe(80000)
    expect(plan.context.providedSourceChars).toBe(30000)
    expect(plan.toolRoute.primaryToolId).toBe("pdf.extract")
    expect(plan.toolRoute.fallbackToolIds).toContain("pdf.ocr.mineru")
    expect(plan.toolRoute.permissions).toContain("fileWrite")
    expect(plan.memory.pendingInbox).toBe(2)
    expect(plan.expectedArtifacts).toContain("material-draft.json")
  })

  it("summarizes the plan for assistant display", () => {
    const plan = buildAgentTaskPlan({
      runGoal: "整理素材",
      skill: { id: "gongkao-hotspot-collector", name: "热点采集器" },
      contextMap: contextMap({ originalChars: 1000, providedChars: 1000 }),
      toolPlan: toolPlan(),
      memory: memory(),
      workflowPlan: workflowPlan(),
    })

    const summary = summarizeAgentTaskPlan(plan)

    expect(summary).toContain("任务：整理素材")
    expect(summary).toContain("Skill：热点采集器")
    expect(summary).toContain("工具路径：pdf.extract")
    expect(summary).toContain("Inbox 人工确认")
  })

  it("deduplicates bounded warning messages", () => {
    const plan = buildAgentTaskPlan({
      runGoal: "整理素材",
      skill: { id: "gongkao-hotspot-collector", name: "热点采集器" },
      contextMap: contextMap({ warnings: ["裁剪", "裁剪"] }),
      toolPlan: { ...toolPlan(), warnings: ["能力缺失", "能力缺失"] },
      memory: { ...memory(), warnings: ["素材库为空", "素材库为空"] },
      workflowPlan: { ...workflowPlan(), warnings: ["多角色仅计划"] },
    })

    expect(taskPlanWarningMessages(plan)).toEqual(["裁剪", "能力缺失", "素材库为空", "多角色仅计划"])
  })
})

function contextMap(input: { originalChars?: number; providedChars?: number; warnings?: string[] } = {}): AgentContextMap {
  const originalChars = input.originalChars ?? 1000
  const providedChars = input.providedChars ?? 1000
  return {
    mode: originalChars > providedChars ? "snippets" : "full_source",
    source: {
      title: "资料分析讲义",
      sourceType: "pdf",
      originalName: "source.pdf",
      originalChars,
      providedChars,
      estimatedSections: 8,
    },
    snippets: [],
    boundContext: {
      skillIds: [],
      topicIds: [],
      fileIds: [],
      sourceIds: [],
      questionTypes: [],
      tags: [],
      unknownMentions: [],
    },
    budget: {
      originalSourceChars: originalChars,
      finalSourceChars: providedChars,
      totalChars: providedChars + 4000,
      warnings: input.warnings ?? [],
    },
    warnings: input.warnings ?? (originalChars > providedChars ? ["已使用片段模式，不能声称完整覆盖。"] : []),
  }
}

function toolPlan(): AgentToolPlan {
  return {
    primaryToolId: "pdf.extract",
    fallbackToolIds: ["pdf.ocr.mineru", "memory.retrieve"],
    reasons: ["PDF 来源优先使用本地 PDF Skill。"],
    warnings: [],
    tools: [
      {
        id: "pdf.extract",
        name: "PDF 提取",
        description: "提取 PDF",
        inputSchema: "pdf",
        outputSchema: "text",
        requiredPermissions: ["promptInject", "fileRead", "fileWrite"],
        requiredCapabilities: ["fileRead", "fileWrite", "structuredOutput"],
        timeoutMs: 1000,
        failureMode: "fallback",
      },
      {
        id: "pdf.ocr.mineru",
        name: "MinerU",
        description: "OCR",
        inputSchema: "pdf",
        outputSchema: "markdown",
        requiredPermissions: ["promptInject", "fileRead", "fileWrite"],
        requiredCapabilities: ["fileRead", "fileWrite", "structuredOutput"],
        timeoutMs: 1000,
        failureMode: "manualReviewRequired",
      },
    ],
  }
}

function memory(): AgentMemorySnapshot {
  return {
    recentRuns: [{ id: "run-1", title: "近期任务", status: "failed", summary: "失败", hasTrace: true }],
    assets: { sources: 3, pendingInbox: 2, topics: 4, provenance: 5, needsReview: 1 },
    warnings: ["有 2 条候选素材等待确认。"],
  }
}

function workflowPlan(): AgentWorkflowPlan {
  return {
    mode: "planner_executor_evaluator",
    roles: [
      { id: "planner", responsibility: "拆分任务" },
      { id: "executor", responsibility: "生成候选" },
      { id: "evaluator", responsibility: "验证结果" },
    ],
    reason: "PDF 任务较复杂。",
    warnings: ["当前版本先生成多角色计划。"],
  }
}

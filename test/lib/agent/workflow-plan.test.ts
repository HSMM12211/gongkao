import { describe, expect, it } from "vitest"

import { buildAgentWorkflowPlan } from "@/lib/agent/workflow-plan"

describe("agent workflow plan", () => {
  it("uses single agent for simple text tasks", () => {
    const plan = buildAgentWorkflowPlan({
      sourceType: "text",
      sourceChars: 3000,
      instruction: "整理素材",
      skillId: "gongkao-material-parser",
    })

    expect(plan.mode).toBe("single_agent")
    expect(plan.roles.map((role) => role.id)).toEqual(["executor"])
  })

  it("uses planner executor evaluator for complex pdf tasks", () => {
    const plan = buildAgentWorkflowPlan({
      sourceType: "pdf",
      sourceChars: 120_000,
      instruction: "完整分类入库并生成题库",
      skillId: "gongkao-question-generator",
    })

    expect(plan.mode).toBe("planner_executor_evaluator")
    expect(plan.roles.map((role) => role.id)).toEqual(["planner", "executor", "evaluator"])
  })
})

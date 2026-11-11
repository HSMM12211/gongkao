import type { MaterialSourceType } from "@/lib/storage/schema"

export type AgentWorkflowMode = "single_agent" | "planner_executor_evaluator"

export type AgentWorkflowRole = {
  id: "planner" | "executor" | "evaluator"
  responsibility: string
}

export type AgentWorkflowPlan = {
  mode: AgentWorkflowMode
  roles: AgentWorkflowRole[]
  reason: string
  warnings: string[]
}

export function buildAgentWorkflowPlan(input: {
  sourceType: MaterialSourceType
  sourceChars: number
  instruction: string
  skillId: string
}): AgentWorkflowPlan {
  const complex =
    input.sourceType === "pdf" ||
    input.sourceChars > 60_000 ||
    /完整|长文档|题库|学习计划|多来源|批量|分类入库/.test(input.instruction) ||
    input.skillId.includes("question") ||
    input.skillId.includes("source-verifier")

  if (!complex) {
    return {
      mode: "single_agent",
      roles: [{ id: "executor", responsibility: "按当前 Skill 生成候选素材，并等待应用校验。" }],
      reason: "任务规模较小，使用单 Agent 可以减少延迟和复杂度。",
      warnings: [],
    }
  }

  return {
    mode: "planner_executor_evaluator",
    roles: [
      { id: "planner", responsibility: "拆分来源、工具、上下文和目标产物。" },
      { id: "executor", responsibility: "调用工具并生成候选 artifacts。" },
      { id: "evaluator", responsibility: "检查覆盖率、题库质量、来源和复核风险，不写正式库。" },
    ],
    reason: "任务涉及长文档、PDF、题库或多来源处理，采用 planner/executor/evaluator 角色计划。",
    warnings: ["当前版本先生成多角色计划并共享 trace，后续可升级为多进程 Agent 编排。"],
  }
}

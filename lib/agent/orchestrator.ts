import type { AgentContextMap } from "@/lib/agent/context-engine"
import type { AgentMemorySnapshot } from "@/lib/agent/memory"
import type { AgentToolPlan } from "@/lib/agent/tool-registry"
import type { AgentWorkflowPlan } from "@/lib/agent/workflow-plan"
import type { AgentSkillInfo } from "@/types/agent-runtime"
import type { MaterialSkillPermission, MaterialSkillSource, MaterialSkillTrust } from "@/lib/agent/skill-inputs"

export type AgentTaskPlan = {
  runGoal: string
  skill: {
    id: string
    name: string
    trust?: MaterialSkillTrust
    source?: MaterialSkillSource
    permissions: MaterialSkillPermission[]
  }
  context: {
    title: string
    sourceType: string
    originalName?: string
    mode: AgentContextMap["mode"]
    originalSourceChars: number
    providedSourceChars: number
    estimatedSections: number
    warnings: string[]
  }
  toolRoute: {
    primaryToolId: string
    fallbackToolIds: string[]
    reasons: string[]
    warnings: string[]
    permissions: MaterialSkillPermission[]
  }
  memory: {
    recentRuns: number
    pendingInbox: number
    sources: number
    topics: number
    needsReview: number
    warnings: string[]
  }
  workflow: {
    mode: AgentWorkflowPlan["mode"]
    roles: string[]
    reason: string
    warnings: string[]
  }
  expectedArtifacts: string[]
  reviewRequired: boolean
  warnings: string[]
}

export type AgentTaskPlanInput = {
  runGoal: string
  skill: Pick<AgentSkillInfo, "id" | "name"> & {
    trust?: MaterialSkillTrust
    source?: MaterialSkillSource
    requiredPermissions?: MaterialSkillPermission[]
  }
  contextMap: AgentContextMap
  toolPlan: AgentToolPlan
  memory: AgentMemorySnapshot
  workflowPlan: AgentWorkflowPlan
  expectedArtifacts?: string[]
}

export function buildAgentTaskPlan(input: AgentTaskPlanInput): AgentTaskPlan {
  const permissions = unique([
    ...(input.skill.requiredPermissions ?? []),
    ...input.toolPlan.tools.flatMap((tool) => tool.requiredPermissions),
  ])
  const warnings = unique([
    ...input.contextMap.warnings,
    ...input.toolPlan.warnings,
    ...input.memory.warnings,
    ...input.workflowPlan.warnings,
  ])

  return {
    runGoal: input.runGoal.trim() || "整理公考素材并生成候选学习资产",
    skill: {
      id: input.skill.id,
      name: input.skill.name,
      trust: input.skill.trust,
      source: input.skill.source,
      permissions,
    },
    context: {
      title: input.contextMap.source.title,
      sourceType: input.contextMap.source.sourceType,
      originalName: input.contextMap.source.originalName,
      mode: input.contextMap.mode,
      originalSourceChars: input.contextMap.source.originalChars,
      providedSourceChars: input.contextMap.source.providedChars,
      estimatedSections: input.contextMap.source.estimatedSections,
      warnings: input.contextMap.warnings,
    },
    toolRoute: {
      primaryToolId: input.toolPlan.primaryToolId,
      fallbackToolIds: input.toolPlan.fallbackToolIds,
      reasons: input.toolPlan.reasons,
      warnings: input.toolPlan.warnings,
      permissions,
    },
    memory: {
      recentRuns: input.memory.recentRuns.length,
      pendingInbox: input.memory.assets.pendingInbox,
      sources: input.memory.assets.sources,
      topics: input.memory.assets.topics,
      needsReview: input.memory.assets.needsReview,
      warnings: input.memory.warnings,
    },
    workflow: {
      mode: input.workflowPlan.mode,
      roles: input.workflowPlan.roles.map((role) => `${role.id}: ${role.responsibility}`),
      reason: input.workflowPlan.reason,
      warnings: input.workflowPlan.warnings,
    },
    expectedArtifacts: input.expectedArtifacts ?? ["material-draft.json", "report.md", "Inbox 候选素材"],
    reviewRequired: true,
    warnings,
  }
}

export function summarizeAgentTaskPlan(plan: AgentTaskPlan): string {
  const fallback = plan.toolRoute.fallbackToolIds.length > 0 ? `，兜底：${plan.toolRoute.fallbackToolIds.join("、")}` : ""
  const coverage =
    plan.context.originalSourceChars > plan.context.providedSourceChars
      ? `原文 ${plan.context.originalSourceChars} 字，本次提供 ${plan.context.providedSourceChars} 字`
      : `正文 ${plan.context.providedSourceChars} 字`
  return [
    `任务：${plan.runGoal}`,
    `Skill：${plan.skill.name}`,
    `上下文：${plan.context.mode}，${coverage}`,
    `工具路径：${plan.toolRoute.primaryToolId}${fallback}`,
    `工作流：${plan.workflow.mode}`,
    `产物：${plan.expectedArtifacts.join("、")}`,
    plan.reviewRequired ? "正式入库前需要 Inbox 人工确认。" : "",
  ]
    .filter(Boolean)
    .join("\n")
}

export function taskPlanWarningMessages(plan: AgentTaskPlan): string[] {
  return unique(plan.warnings).slice(0, 8)
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items.filter(Boolean)))
}

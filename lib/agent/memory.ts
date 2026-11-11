import type { AgentRunRecord, MaterialInboxDraft, MaterialSource } from "@/lib/storage/schema"

export type AgentMemorySnapshot = {
  recentRuns: Array<{
    id: string
    title: string
    status: string
    summary: string
    hasTrace: boolean
  }>
  assets: {
    sources: number
    pendingInbox: number
    topics: number
    provenance: number
    needsReview: number
  }
  warnings: string[]
}

export function buildAgentMemorySnapshot(input: {
  runs: AgentRunRecord[]
  inboxDrafts: MaterialInboxDraft[]
  sources: MaterialSource[]
  learningAssetStats: {
    topics: number
    provenance: number
    needsReview: number
  }
  limit?: number
}): AgentMemorySnapshot {
  const limit = input.limit ?? 5
  const recentRuns = input.runs
    .slice()
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, limit)
    .map((run) => ({
      id: run.id,
      title: run.title,
      status: run.status,
      summary: run.summary,
      hasTrace: Boolean(run.hasTrace),
    }))

  const pendingInbox = input.inboxDrafts.filter((draft) => draft.status === "pending").length
  const warnings: string[] = []
  if (input.sources.length === 0) warnings.push("本地素材库为空，建议先导入真题、讲义或政策评论。")
  if (input.learningAssetStats.topics === 0) warnings.push("暂无专题资产，Agent 应优先沉淀主题结构。")
  if (input.learningAssetStats.needsReview > 0) warnings.push(`有 ${input.learningAssetStats.needsReview} 条学习资产需要复核。`)
  if (recentRuns.filter((run) => run.status === "failed").length >= 2) warnings.push("近期 Agent 失败较多，建议优先检查工具链和输出合同。")
  if (pendingInbox > 0) warnings.push(`Inbox 中还有 ${pendingInbox} 条候选素材等待确认。`)

  return {
    recentRuns,
    assets: {
      sources: input.sources.length,
      pendingInbox,
      topics: input.learningAssetStats.topics,
      provenance: input.learningAssetStats.provenance,
      needsReview: input.learningAssetStats.needsReview,
    },
    warnings,
  }
}

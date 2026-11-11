import type { AgentMaterialOutput } from "@/lib/material/types"

export type AgentBusinessVerification = {
  ok: boolean
  warnings: string[]
  errors: string[]
  confidence: number
  reviewRecommendation: "ready" | "needs_review" | "rejected"
}

export function verifyAgentMaterialOutput(input: {
  output: AgentMaterialOutput
  originalSourceChars?: number
  finalSourceChars?: number
  sourceType?: string
}): AgentBusinessVerification {
  const warnings = [...input.output.report.warnings]
  const errors: string[] = []
  const sourceType = input.sourceType ?? input.output.source.sourceType
  const originalSourceChars = input.originalSourceChars ?? input.output.source.text.length
  const questionCount = input.output.draft.practiceQuestions.length
  const flashcardCount = input.output.draft.flashcards.length
  const referenceCount = input.output.source.references.length
  const longDocument = sourceType === "pdf" || originalSourceChars > 60_000

  if (referenceCount === 0) {
    errors.push("缺少来源引用，不能进入审核入库。")
  }
  if (questionCount === 0) {
    errors.push("缺少可训练题目，不能进入申论训练闭环。")
  }

  if (longDocument && questionCount < 3) {
    warnings.push("长文档只生成了少量题目，可能没有完整覆盖章节或题型。")
  }
  if (longDocument && referenceCount < 3) {
    warnings.push("长文档来源引用覆盖不足，建议复核页码或章节范围。")
  }
  if (flashcardCount < 3) {
    warnings.push("温故卡数量偏少，建议补充规范词、对策和金句。")
  }
  if (input.finalSourceChars && originalSourceChars > input.finalSourceChars) {
    warnings.push("Agent 只处理了裁剪后的上下文，未覆盖的原文不应被视为已完整解析。")
  }
  if (input.output.report.confidence < 0.65) {
    warnings.push("Agent 自评置信度偏低，建议人工复核后再导入。")
  }

  const confidencePenalty = Math.min(0.4, warnings.length * 0.06 + errors.length * 0.2)
  const confidence = Math.max(0, Math.min(1, input.output.report.confidence - confidencePenalty))
  const reviewRecommendation =
    errors.length > 0 ? "rejected" : warnings.length > 0 || confidence < 0.7 ? "needs_review" : "ready"

  return {
    ok: errors.length === 0,
    warnings: unique(warnings),
    errors,
    confidence,
    reviewRecommendation,
  }
}

function unique(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)))
}

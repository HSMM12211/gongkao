import type { ExpressionAsset, ExpressionExercise, ShenlunDiagnosis } from "@/lib/shenlun/types"

export function extractExpressionAssets({
  documentId,
  rawText,
  now,
}: {
  documentId: string
  rawText: string
  now: string
}): ExpressionAsset[] {
  return rawText
    .split(/[。！？\n]/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 12)
    .filter((sentence) => /(坚持|推动|提升|完善|健全|补齐|提质增效|惠及|问题导向|人民群众)/.test(sentence))
    .slice(0, 12)
    .map((sentence, index) => ({
      id: `expr-${documentId}-${index}`,
      documentId,
      sourceText: sentence,
      expression: normalizeExpression(sentence),
      scenario: inferScenario(sentence),
      tags: inferExpressionTags(sentence),
      createdAt: now,
    }))
}

export function createExpressionExercise({ asset, now }: { asset: ExpressionAsset; now: string }): ExpressionExercise {
  return {
    id: crypto.randomUUID(),
    assetId: asset.id,
    prompt: `请把表达“${asset.expression}”迁移到一个申论作答场景中，要求语义贴合、表达规范、分条清晰。`,
    createdAt: now,
  }
}

export function evaluateExpressionRewrite({
  exercise,
  answerText,
  now,
}: {
  exercise: ExpressionExercise
  answerText: string
  now: string
}): ShenlunDiagnosis {
  const issueTags: ShenlunDiagnosis["issueTags"] = []
  if (answerText.trim().length < 30) issueTags.push("weak_structure")
  if (/(搞|很多|想办法|不错)/.test(answerText)) issueTags.push("colloquial_expression")
  if (!/(坚持|推动|提升|完善|健全|补齐|提质增效|问题导向)/.test(answerText)) issueTags.push("missing_points")
  if (issueTags.length === 0) issueTags.push("weak_structure")

  return {
    id: crypto.randomUUID(),
    sessionId: exercise.id,
    questionId: exercise.assetId,
    score: Math.max(55, 88 - issueTags.length * 8),
    scoringPointHits: [],
    issueTags,
    structureComments: [
      issueTags.includes("missing_points")
        ? "迁移表达没有保留原句的政策语义，需要把关键词嵌入具体场景。"
        : "表达迁移基本成立，后续可继续强化分条和场景贴合度。",
    ],
    languageSuggestions: issueTags.includes("colloquial_expression")
      ? [{ original: "想办法", revised: "多措并举", reason: "申论表达应使用规范政策语汇。" }]
      : [],
    modelAnswer: `围绕题目场景，应坚持问题导向，补齐短板弱项，推动工作提质增效。`,
    createdAt: now,
  }
}

function normalizeExpression(sentence: string) {
  return sentence.replace(/\s+/g, "").slice(0, 80)
}

function inferScenario(sentence: string): ExpressionAsset["scenario"] {
  if (/对策|完善|健全|补齐|推动|提升/.test(sentence)) return "countermeasure"
  if (/分析|根源|原因|关系/.test(sentence)) return "analysis"
  if (/首先|一方面|另一方面/.test(sentence)) return "essay"
  if (/总之|归根结底|最终/.test(sentence)) return "closing"
  return "opening"
}

function inferExpressionTags(sentence: string) {
  const tags = ["规范表达"]
  if (/治理|基层|群众/.test(sentence)) tags.push("基层治理")
  if (/数字|数据|乡村/.test(sentence)) tags.push("数字治理")
  if (/民生|人民|服务/.test(sentence)) tags.push("民生服务")
  return Array.from(new Set(tags))
}

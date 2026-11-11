import { z } from "zod"
import type { ScoringPoint, ShenlunDiagnosis, ShenlunIssueTag, TrainingQuestion, TrainingSession } from "@/lib/shenlun/types"

const IssueTagSchema = z.enum([
  "missing_points",
  "wrong_material_location",
  "inaccurate_summary",
  "empty_countermeasure",
  "weak_structure",
  "colloquial_expression",
  "word_count_failed",
  "wrong_question_type",
  "time_allocation_failed",
])

const DiagnosisSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  questionId: z.string().min(1),
  score: z.number().min(0).max(100).optional(),
  scoringPointHits: z.array(
    z.object({
      scoringPointId: z.string().min(1),
      hit: z.boolean(),
      evidence: z.string().optional(),
    }),
  ),
  issueTags: z.array(IssueTagSchema),
  structureComments: z.array(z.string()),
  languageSuggestions: z.array(
    z.object({
      original: z.string(),
      revised: z.string(),
      reason: z.string(),
    }),
  ),
  modelAnswer: z.string().optional(),
  createdAt: z.string().min(1),
})

export function validateDiagnosis(input: unknown) {
  const result = DiagnosisSchema.safeParse(input)
  if (!result.success) {
    return {
      ok: false as const,
      errors: result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
    }
  }
  return { ok: true as const, value: result.data }
}

export function createDeterministicDiagnosis({
  session,
  question,
  answerText,
  scoringPoints,
  now,
}: {
  session: TrainingSession
  question: TrainingQuestion
  answerText: string
  scoringPoints: ScoringPoint[]
  now: string
}): ShenlunDiagnosis {
  const normalizedAnswer = normalizeText(answerText)
  const scoringPointHits = scoringPoints.map((point) => {
    const candidates = [point.text, ...point.aliases].map(normalizeText).filter(Boolean)
    const hit = candidates.some((candidate) => normalizedAnswer.includes(candidate))
    return hit
      ? {
          scoringPointId: point.id,
          hit,
          evidence: point.text,
        }
      : {
          scoringPointId: point.id,
          hit,
        }
  })
  const missed = scoringPointHits.some((item) => !item.hit)
  const issueTags = new Set<ShenlunIssueTag>()
  if (missed) issueTags.add("missing_points")
  if (question.type === "countermeasure" && isEmptyCountermeasure(answerText)) issueTags.add("empty_countermeasure")
  if (question.wordLimit && countChineseAwareChars(answerText) > question.wordLimit) issueTags.add("word_count_failed")
  if (session.stageTimings.some((timing) => timing.exceeded)) issueTags.add("time_allocation_failed")
  if (answerText.includes("搞") || answerText.includes("很多") || answerText.includes("想办法")) {
    issueTags.add("colloquial_expression")
  }
  if (answerText.trim().length < 30) issueTags.add("weak_structure")
  if (issueTags.size === 0) issueTags.add("weak_structure")

  const hitCount = scoringPointHits.filter((item) => item.hit).length
  const baseScore = scoringPoints.length === 0 ? 68 : Math.round((hitCount / scoringPoints.length) * 70 + 20)
  const penalties = (issueTags.has("word_count_failed") ? 8 : 0) + (issueTags.has("time_allocation_failed") ? 6 : 0)
  const score = Math.max(35, Math.min(95, baseScore - penalties))

  return {
    id: crypto.randomUUID(),
    sessionId: session.id,
    questionId: question.id,
    score,
    scoringPointHits,
    issueTags: Array.from(issueTags),
    structureComments: buildStructureComments(Array.from(issueTags), scoringPoints.length, hitCount),
    languageSuggestions: buildLanguageSuggestions(answerText),
    modelAnswer: buildModelAnswer(question, scoringPoints),
    createdAt: now,
  }
}

export function countChineseAwareChars(text: string): number {
  return text.replace(/\s/g, "").length
}

function normalizeText(text: string): string {
  return text.replace(/\s/g, "").toLowerCase()
}

function isEmptyCountermeasure(text: string): boolean {
  const actionWords = ["完善", "健全", "推进", "加强", "提升", "建立", "优化", "强化", "落实", "统筹"]
  return actionWords.filter((word) => text.includes(word)).length < 2
}

function buildStructureComments(tags: ShenlunIssueTag[], totalPoints: number, hitCount: number): string[] {
  const comments: string[] = []
  if (totalPoints > 0) comments.push(`评分要点命中 ${hitCount}/${totalPoints}，后续复盘应优先补齐遗漏要点。`)
  if (tags.includes("empty_countermeasure")) comments.push("对策展开偏空，应写清主体、动作、路径和落点。")
  if (tags.includes("time_allocation_failed")) comments.push("存在阶段超时，建议把读材料和列提纲时间压缩到建议范围内。")
  if (tags.includes("weak_structure")) comments.push("答案结构还不够稳定，建议使用分条表达并保持同类项并列。")
  return comments.length > 0 ? comments : ["结构基本完整，继续保持材料定位和分条表达。"]
}

function buildLanguageSuggestions(answerText: string): ShenlunDiagnosis["languageSuggestions"] {
  const pairs = [
    { original: "搞", revised: "推进", reason: "口语化表达应替换为规范动词。" },
    { original: "很多", revised: "诸多", reason: "申论表达应保持书面化和概括性。" },
    { original: "想办法", revised: "多措并举", reason: "对策表达应更稳定、更具政策语感。" },
  ]
  return pairs.filter((pair) => answerText.includes(pair.original))
}

function buildModelAnswer(question: TrainingQuestion, scoringPoints: ScoringPoint[]): string {
  if (scoringPoints.length === 0) return `围绕“${question.title}”，应坚持问题导向，分条提出有针对性的措施。`
  return scoringPoints.map((point, index) => `${index + 1}. ${point.text}。`).join("\n")
}

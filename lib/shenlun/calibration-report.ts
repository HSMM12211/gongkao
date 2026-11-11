import type { CalibrationReport, ShenlunDiagnosis, ShenlunIssueTag, ShenlunQuestionType, TrainingQuestion, TrainingSession } from "@/lib/shenlun/types"

const QUESTION_TYPES: ShenlunQuestionType[] = ["summary", "countermeasure", "analysis", "implementation", "essay"]

export function buildCalibrationReport({
  sessions,
  questions,
  diagnoses,
  periodStart,
  periodEnd,
  now,
}: {
  sessions: TrainingSession[]
  questions: TrainingQuestion[]
  diagnoses: ShenlunDiagnosis[]
  periodStart: string
  periodEnd: string
  now: string
}): CalibrationReport {
  const periodDiagnoses = diagnoses.filter((diagnosis) => diagnosis.createdAt >= periodStart && diagnosis.createdAt <= periodEnd)
  const scores = periodDiagnoses.map((diagnosis) => diagnosis.score ?? 0)
  const topIssueTags = buildTopIssueTags(periodDiagnoses)
  const stageTimings = sessions.flatMap((session) => session.stageTimings)
  const exceededStageCount = stageTimings.filter((timing) => timing.exceeded).length

  return {
    id: crypto.randomUUID(),
    createdAt: now,
    periodStart,
    periodEnd,
    trainingCount: sessions.filter((session) => session.startedAt >= periodStart && session.startedAt <= periodEnd).length,
    averageScore: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0,
    questionTypeBreakdown: buildTypeBreakdown(questions, periodDiagnoses),
    topIssueTags,
    timeControl: {
      totalStageCount: stageTimings.length,
      exceededStageCount,
      exceededRatio: stageTimings.length === 0 ? 0 : exceededStageCount / stageTimings.length,
    },
    trainingPlan: buildTrainingPlan(topIssueTags),
  }
}

function buildTopIssueTags(diagnoses: ShenlunDiagnosis[]): CalibrationReport["topIssueTags"] {
  const counts = new Map<ShenlunIssueTag, number>()
  let total = 0
  for (const diagnosis of diagnoses) {
    for (const tag of diagnosis.issueTags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
      total += 1
    }
  }
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count, ratio: total === 0 ? 0 : count / total }))
    .sort((a, b) => b.count - a.count)
}

function buildTypeBreakdown(questions: TrainingQuestion[], diagnoses: ShenlunDiagnosis[]): CalibrationReport["questionTypeBreakdown"] {
  const result = Object.fromEntries(QUESTION_TYPES.map((type) => [type, { count: 0, averageScore: 0 }])) as CalibrationReport["questionTypeBreakdown"]
  for (const type of QUESTION_TYPES) {
    const typedQuestions = questions.filter((question) => question.type === type)
    const typedDiagnoses = diagnoses.filter((diagnosis) => typedQuestions.some((question) => question.id === diagnosis.questionId))
    const scores = typedDiagnoses.map((diagnosis) => diagnosis.score ?? 0)
    result[type] = {
      count: typedQuestions.length,
      averageScore: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0,
    }
  }
  return result
}

function buildTrainingPlan(topIssueTags: Array<{ tag: ShenlunIssueTag; count: number }>) {
  const plan: string[] = []
  if (topIssueTags.some((item) => item.tag === "empty_countermeasure")) plan.push("安排 2 次对策题专项训练，要求每条对策写清主体、动作、路径和落点。")
  if (topIssueTags.some((item) => item.tag === "missing_points")) plan.push("复盘材料定位，训练按段提取问题、原因、影响、对策要点。")
  if (topIssueTags.some((item) => item.tag === "time_allocation_failed")) plan.push("进行 1 次整套考场模式，重点压缩阅读和提纲时间。")
  if (topIssueTags.some((item) => item.tag === "colloquial_expression")) plan.push("完成 1 组评论转表达训练，沉淀规范表达。")
  return plan.length > 0 ? plan : ["维持每周 3 次单题训练和 1 次复盘，继续沉淀表达资产。"]
}

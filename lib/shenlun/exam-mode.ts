import type { ExamPaper, ExamSummary, ShenlunDiagnosis, ShenlunIssueTag, ShenlunQuestionType, TrainingAnswer, TrainingQuestion, TrainingSession } from "@/lib/shenlun/types"
import { countChineseAwareChars } from "@/lib/shenlun/diagnosis"

const QUESTION_TYPES: ShenlunQuestionType[] = ["summary", "countermeasure", "analysis", "implementation", "essay"]

export function startExamSession({ paper, now }: { paper: ExamPaper; now: string }): TrainingSession {
  return {
    id: crypto.randomUUID(),
    mode: "exam",
    questionIds: paper.questionIds,
    startedAt: now,
    status: "running",
    totalLimitSeconds: paper.totalMinutes * 60,
    stageTimings: [{ stage: "reading", startedAt: now, durationSeconds: 0, exceeded: false }],
  }
}

export function submitExamSessionAnswers(
  session: TrainingSession,
  { answersByQuestionId, now }: { answersByQuestionId: Record<string, string>; now: string },
): { session: TrainingSession; answers: TrainingAnswer[] } {
  const endedSession: TrainingSession = {
    ...session,
    status: "submitted",
    endedAt: now,
    stageTimings: session.stageTimings.map((timing, index, all) => {
      if (index !== all.length - 1 || timing.endedAt) return timing
      const durationSeconds = Math.max(0, Math.round((Date.parse(now) - Date.parse(timing.startedAt)) / 1000))
      return { ...timing, endedAt: now, durationSeconds, exceeded: durationSeconds > session.totalLimitSeconds }
    }),
  }
  const answers = session.questionIds
    .map((questionId) => ({ questionId, answerText: answersByQuestionId[questionId]?.trim() ?? "" }))
    .filter((item) => item.answerText)
    .map<TrainingAnswer>((item) => ({
      id: crypto.randomUUID(),
      sessionId: session.id,
      questionId: item.questionId,
      answerText: item.answerText,
      wordCount: countChineseAwareChars(item.answerText),
      submittedAt: now,
    }))

  return { session: endedSession, answers }
}

export function buildExamSummary({
  sessionId,
  questions,
  diagnoses,
}: {
  sessionId: string
  questions: TrainingQuestion[]
  diagnoses: ShenlunDiagnosis[]
}): ExamSummary {
  const relatedDiagnoses = diagnoses.filter((diagnosis) => diagnosis.sessionId === sessionId || questions.some((question) => question.id === diagnosis.questionId))
  const scoreValues = relatedDiagnoses.map((diagnosis) => diagnosis.score ?? 0)
  const hitTotals = relatedDiagnoses.reduce(
    (acc, diagnosis) => {
      acc.hit += diagnosis.scoringPointHits.filter((item) => item.hit).length
      acc.total += diagnosis.scoringPointHits.length
      return acc
    },
    { hit: 0, total: 0 },
  )
  const issueCounts = new Map<ShenlunIssueTag, number>()
  for (const diagnosis of relatedDiagnoses) {
    for (const tag of diagnosis.issueTags) issueCounts.set(tag, (issueCounts.get(tag) ?? 0) + 1)
  }

  return {
    sessionId,
    totalQuestions: questions.length,
    answeredQuestions: relatedDiagnoses.length,
    averageScore: scoreValues.length ? Math.round(scoreValues.reduce((sum, score) => sum + score, 0) / scoreValues.length) : 0,
    scoringPointHitRatio: hitTotals.total === 0 ? 0 : hitTotals.hit / hitTotals.total,
    issueTags: Array.from(issueCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count),
    questionTypeBreakdown: buildTypeBreakdown(questions, relatedDiagnoses),
  }
}

function buildTypeBreakdown(questions: TrainingQuestion[], diagnoses: ShenlunDiagnosis[]): ExamSummary["questionTypeBreakdown"] {
  const result = Object.fromEntries(QUESTION_TYPES.map((type) => [type, { count: 0, averageScore: 0 }])) as ExamSummary["questionTypeBreakdown"]
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

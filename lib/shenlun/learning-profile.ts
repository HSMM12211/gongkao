import type {
  ShenlunAbilityDimension,
  ShenlunDiagnosis,
  ShenlunIssueTag,
  TrainingSession,
  UserLearningProfile,
} from "@/lib/shenlun/types"

const DEFAULT_ABILITY_SCORE = 50

export function buildDefaultLearningProfile(now: string): UserLearningProfile {
  return {
    id: "default",
    targetExam: "申论",
    stage: "beginner",
    dailyAvailableMinutes: 40,
    weeklyAvailableDays: 5,
    abilityScores: {
      readingExtraction: DEFAULT_ABILITY_SCORE,
      summary: DEFAULT_ABILITY_SCORE,
      analysis: DEFAULT_ABILITY_SCORE,
      countermeasure: DEFAULT_ABILITY_SCORE,
      implementationFormat: DEFAULT_ABILITY_SCORE,
      essayIdeation: DEFAULT_ABILITY_SCORE,
      formalExpression: DEFAULT_ABILITY_SCORE,
      timeControl: DEFAULT_ABILITY_SCORE,
    },
    topicCoverage: {},
    questionTypePerformance: {
      summary: { count: 0, averageScore: 0 },
      countermeasure: { count: 0, averageScore: 0 },
      analysis: { count: 0, averageScore: 0 },
      implementation: { count: 0, averageScore: 0 },
      essay: { count: 0, averageScore: 0 },
    },
    issueTagCounts: {},
    recentSessionIds: [],
    updatedAt: now,
  }
}

export function recalibrateLearningProfile(
  profile: UserLearningProfile,
  {
    diagnoses,
    sessions,
    now,
  }: {
    diagnoses: ShenlunDiagnosis[]
    sessions: TrainingSession[]
    now: string
  },
): UserLearningProfile {
  const issueTagCounts: Partial<Record<ShenlunIssueTag, number>> = { ...profile.issueTagCounts }
  for (const diagnosis of diagnoses) {
    for (const tag of diagnosis.issueTags) {
      issueTagCounts[tag] = (issueTagCounts[tag] ?? 0) + 1
    }
  }

  const abilityScores = { ...profile.abilityScores }
  applyIssuePenalty(abilityScores, issueTagCounts, "wrong_material_location", "readingExtraction")
  applyIssuePenalty(abilityScores, issueTagCounts, "inaccurate_summary", "summary")
  applyIssuePenalty(abilityScores, issueTagCounts, "empty_countermeasure", "countermeasure")
  applyIssuePenalty(abilityScores, issueTagCounts, "weak_structure", "analysis")
  applyIssuePenalty(abilityScores, issueTagCounts, "colloquial_expression", "formalExpression")
  applyIssuePenalty(abilityScores, issueTagCounts, "time_allocation_failed", "timeControl")
  applyIssuePenalty(abilityScores, issueTagCounts, "missing_points", "readingExtraction")

  const exceededCount = sessions.reduce((count, session) => count + session.stageTimings.filter((timing) => timing.exceeded).length, 0)
  if (exceededCount > 0) {
    abilityScores.timeControl = clampScore(abilityScores.timeControl - Math.min(25, exceededCount * 8))
  }

  const recentSessionIds = sessions
    .slice()
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, 10)
    .map((session) => session.id)

  return {
    ...profile,
    abilityScores,
    issueTagCounts,
    recentSessionIds,
    updatedAt: now,
  }
}

function applyIssuePenalty(
  scores: Record<ShenlunAbilityDimension, number>,
  issueTagCounts: Partial<Record<ShenlunIssueTag, number>>,
  tag: ShenlunIssueTag,
  dimension: ShenlunAbilityDimension,
) {
  const count = issueTagCounts[tag] ?? 0
  if (count === 0) return
  scores[dimension] = clampScore(scores[dimension] - Math.min(30, count * 10))
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)))
}

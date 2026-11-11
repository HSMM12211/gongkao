import { describe, expect, it } from "vitest"

import { buildDefaultLearningProfile } from "@/lib/shenlun/learning-profile"
import { generateDailyLearningPlan, generateWeeklyLearningPlan } from "@/lib/shenlun/learning-plan"
import type { QuestionBankItem, TopicAsset, TrainingQuestion, UserLearningProfile } from "@/lib/shenlun/types"

const question: TrainingQuestion = {
  id: "question-1",
  documentId: "doc-1",
  materialIds: ["passage-1"],
  type: "countermeasure",
  title: "数字乡村对策题",
  prompt: "请提出推进数字乡村建设的对策。",
  suggestedMinutes: 25,
  scoringPointIds: ["point-1"],
  createdAt: "2026-06-01T00:00:00.000Z",
}

const topic: TopicAsset = {
  id: "topic-1",
  documentId: "doc-1",
  title: "数字乡村",
  category: "policy_theme",
  summary: "数字乡村建设中的基础设施、数字素养和基层治理。",
  tags: ["数字乡村", "基层治理"],
  provenanceId: "prov-1",
  createdAt: "2026-06-01T00:00:00.000Z",
}

const bankItem: QuestionBankItem = {
  id: "bank-1",
  sourceId: "doc-1",
  sourceTitle: "2025 Province Exam",
  sourceType: "document",
  sourceDocumentId: "doc-1",
  trainingQuestionId: "question-1",
  materialIds: ["passage-1"],
  scoringPointIds: ["point-1"],
  practiceCategory: "past_paper",
  type: "countermeasure",
  title: "Digital village question bank item",
  prompt: "Propose measures to improve digital village governance.",
  materialPreview: "Digital village material.",
  standardAnswer: "Improve infrastructure.",
  rubric: {
    answerSource: "document",
    answerText: "Improve infrastructure.",
    trusted: true,
    points: [{ id: "point-1", text: "Improve infrastructure", weight: 1, keywords: ["infrastructure"] }],
  },
  abilityTags: ["countermeasure"],
  topicTags: ["digital village"],
  difficulty: "medium",
  estimatedMinutes: 25,
  reviewState: "ready",
  provenanceIds: ["prov-1"],
  confidence: 0.9,
  warnings: [],
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
}

describe("shenlun learning plan", () => {
  it("returns an import recommendation when no usable assets exist", () => {
    const profile = buildDefaultLearningProfile("2026-06-01T00:00:00.000Z")
    const result = generateDailyLearningPlan({
      profile,
      questions: [],
      topicAssets: [],
      diagnoses: [],
      sessions: [],
      now: "2026-06-01T08:00:00.000Z",
    })

    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0]).toMatchObject({
      taskType: "import_more_assets",
      priority: "high",
    })
    expect(result.warnings[0]).toContain("导入")
  })

  it("generates a daily plan within the user's time budget", () => {
    const profile: UserLearningProfile = {
      ...buildDefaultLearningProfile("2026-06-01T00:00:00.000Z"),
      dailyAvailableMinutes: 30,
      abilityScores: {
        ...buildDefaultLearningProfile("2026-06-01T00:00:00.000Z").abilityScores,
        countermeasure: 35,
      },
    }

    const result = generateDailyLearningPlan({
      profile,
      questions: [question],
      topicAssets: [topic],
      diagnoses: [],
      sessions: [],
      now: "2026-06-01T08:00:00.000Z",
    })

    expect(result.plan.totalEstimatedMinutes).toBeLessThanOrEqual(30)
    expect(result.tasks[0].questionIds).toContain("question-1")
    expect(result.tasks[0].rationale).toContain("对策")
  })

  it("prefers ready question bank items that match the weakest ability", () => {
    const profile: UserLearningProfile = {
      ...buildDefaultLearningProfile("2026-06-01T00:00:00.000Z"),
      dailyAvailableMinutes: 30,
      abilityScores: {
        ...buildDefaultLearningProfile("2026-06-01T00:00:00.000Z").abilityScores,
        countermeasure: 30,
      },
    }

    const result = generateDailyLearningPlan({
      profile,
      questions: [],
      questionBankItems: [bankItem],
      topicAssets: [topic],
      diagnoses: [],
      sessions: [],
      now: "2026-06-01T08:00:00.000Z",
    })

    expect(result.tasks[0].questionBankItemIds).toEqual(["bank-1"])
    expect(result.tasks[0].questionIds).toEqual(["question-1"])
    expect(result.tasks[0].title).toBe("Digital village question bank item")
    expect(result.tasks[0].rationale).toContain("question bank")
  })

  it("generates a weekly plan from repeated daily tasks", () => {
    const profile = buildDefaultLearningProfile("2026-06-01T00:00:00.000Z")
    const result = generateWeeklyLearningPlan({
      profile,
      questions: [question],
      topicAssets: [topic],
      diagnoses: [],
      sessions: [],
      now: "2026-06-01T08:00:00.000Z",
    })

    expect(result.plan.scope).toBe("weekly")
    expect(result.tasks.length).toBeGreaterThanOrEqual(1)
    expect(result.plan.rationale).toContain("周")
  })
})

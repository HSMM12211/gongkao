import { describe, expect, it } from "vitest"

import { buildExamSummary, startExamSession, submitExamSessionAnswers } from "@/lib/shenlun/exam-mode"
import type { ExamPaper, ShenlunDiagnosis, TrainingQuestion } from "@/lib/shenlun/types"

describe("shenlun exam mode", () => {
  it("starts and submits a full exam session", () => {
    const paper: ExamPaper = {
      id: "paper-1",
      documentId: "doc-1",
      title: "2025 省考申论真题",
      totalMinutes: 150,
      materialIds: ["m-1"],
      questionIds: ["q-1", "q-2"],
      createdAt: "2026-05-28T08:00:00.000Z",
    }
    const session = startExamSession({ paper, now: "2026-05-28T08:00:00.000Z" })

    const submitted = submitExamSessionAnswers(session, {
      answersByQuestionId: { "q-1": "答案一", "q-2": "答案二" },
      now: "2026-05-28T10:20:00.000Z",
    })

    expect(session.mode).toBe("exam")
    expect(submitted.session.status).toBe("submitted")
    expect(submitted.answers).toHaveLength(2)
    expect(submitted.answers[0].wordCount).toBeGreaterThan(0)
  })

  it("summarizes exam diagnoses by question type and score", () => {
    const questions: TrainingQuestion[] = [
      {
        id: "q-1",
        materialIds: [],
        type: "summary",
        title: "概括题",
        prompt: "概括",
        suggestedMinutes: 20,
        scoringPointIds: [],
        createdAt: "2026-05-28T08:00:00.000Z",
      },
    ]
    const diagnoses: ShenlunDiagnosis[] = [
      {
        id: "d-1",
        sessionId: "s-1",
        questionId: "q-1",
        score: 76,
        scoringPointHits: [],
        issueTags: ["missing_points"],
        structureComments: [],
        languageSuggestions: [],
        createdAt: "2026-05-28T10:00:00.000Z",
      },
    ]

    const summary = buildExamSummary({ sessionId: "s-1", questions, diagnoses })

    expect(summary.averageScore).toBe(76)
    expect(summary.questionTypeBreakdown.summary.count).toBe(1)
  })
})

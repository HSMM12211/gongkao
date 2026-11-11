import "fake-indexeddb/auto"
import { beforeEach, describe, expect, it } from "vitest"

import { buildCalibrationSnapshot } from "@/lib/shenlun/calibration"
import { createDeterministicDiagnosis } from "@/lib/shenlun/diagnosis"
import { shenlunRepository } from "@/lib/shenlun/repositories"
import { startTimedSingleSession, submitTrainingSession, transitionStage } from "@/lib/shenlun/session"
import type { MaterialPassage, ScoringPoint, ShenlunDocument, TrainingAnswer, TrainingQuestion } from "@/lib/shenlun/types"
import { DB_NAME } from "@/lib/storage/schema"

async function deleteDb(name: string) {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => resolve()
  })
}

describe("shenlun vertical training flow", () => {
  beforeEach(async () => {
    await deleteDb(DB_NAME)
  })

  it("links imported exam assets to timed training, diagnosis, and calibration", async () => {
    const createdAt = "2026-05-27T08:00:00.000Z"
    const document: ShenlunDocument = {
      id: "doc-1",
      title: "2025 省考申论真题",
      documentType: "exam_paper",
      sourceType: "pdf",
      rawText: "材料一：数字乡村建设需要补齐基础设施短板，提升数字素养。",
      createdAt,
      parseStatus: "parsed",
    }
    const passage: MaterialPassage = {
      id: "m-1",
      documentId: document.id,
      order: 1,
      text: document.rawText,
      tags: ["数字乡村"],
    }
    const point: ScoringPoint = {
      id: "sp-1",
      questionId: "q-1",
      text: "补齐基础设施短板",
      weight: 1,
      aliases: ["基础设施"],
    }
    const question: TrainingQuestion = {
      id: "q-1",
      documentId: document.id,
      materialIds: [passage.id],
      type: "countermeasure",
      title: "数字乡村对策题",
      prompt: "请提出推进数字乡村建设的对策。",
      suggestedMinutes: 25,
      scoringPointIds: [point.id],
      createdAt,
    }

    await shenlunRepository.saveDocument(document)
    await shenlunRepository.savePassage(passage)
    await shenlunRepository.saveQuestion(question)
    await shenlunRepository.saveScoringPoint(point)

    const session = startTimedSingleSession({
      questionId: question.id,
      totalLimitSeconds: 1500,
      now: createdAt,
    })
    const staged = transitionStage(session, {
      nextStage: "writing",
      now: "2026-05-27T08:05:00.000Z",
      stageLimitSeconds: 480,
    })
    const submitted = submitTrainingSession(staged, "2026-05-27T08:20:00.000Z")
    const answer: TrainingAnswer = {
      id: "answer-1",
      sessionId: submitted.id,
      questionId: question.id,
      answerText: "一是补齐基础设施短板，完善网络和平台建设。二是提升群众数字素养。",
      wordCount: 34,
      submittedAt: submitted.endedAt!,
    }
    const diagnosis = createDeterministicDiagnosis({
      session: submitted,
      question,
      answerText: answer.answerText,
      scoringPoints: [point],
      now: submitted.endedAt!,
    })
    const snapshot = buildCalibrationSnapshot({
      diagnoses: [diagnosis],
      periodStart: createdAt,
      periodEnd: submitted.endedAt!,
      now: submitted.endedAt!,
    })

    await shenlunRepository.saveSession({ ...submitted, status: "diagnosed" })
    await shenlunRepository.saveAnswer(answer)
    await shenlunRepository.saveDiagnosis(diagnosis)
    await shenlunRepository.saveCalibrationSnapshot(snapshot)

    expect(await shenlunRepository.getQuestions()).toHaveLength(1)
    expect((await shenlunRepository.getSessions())[0].status).toBe("diagnosed")
    expect((await shenlunRepository.getDiagnoses())[0].scoringPointHits).toEqual([
      { scoringPointId: point.id, hit: true, evidence: point.text },
    ])
    expect((await shenlunRepository.getCalibrationSnapshots())[0].abilityScores.countermeasure).toBeGreaterThan(0)
  })
})

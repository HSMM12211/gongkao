import { describe, expect, it } from "vitest"

import { createExpressionExercise, evaluateExpressionRewrite, extractExpressionAssets } from "@/lib/shenlun/expression"

describe("shenlun expression transfer", () => {
  it("extracts reusable expression assets from commentary", () => {
    const assets = extractExpressionAssets({
      documentId: "doc-1",
      rawText: "要坚持问题导向，补齐治理短板，推动公共服务提质增效。让发展成果更多更公平惠及人民群众。",
      now: "2026-05-28T08:00:00.000Z",
    })

    expect(assets.length).toBeGreaterThan(0)
    expect(assets[0].expression).toContain("问题导向")
  })

  it("creates and evaluates an expression transfer exercise", () => {
    const asset = extractExpressionAssets({
      documentId: "doc-1",
      rawText: "要坚持问题导向，补齐治理短板，推动公共服务提质增效。",
      now: "2026-05-28T08:00:00.000Z",
    })[0]
    const exercise = createExpressionExercise({ asset, now: "2026-05-28T08:01:00.000Z" })
    const diagnosis = evaluateExpressionRewrite({
      exercise,
      answerText: "推进数字乡村建设，要坚持问题导向，补齐基础设施短板，推动服务提质增效。",
      now: "2026-05-28T08:05:00.000Z",
    })

    expect(exercise.prompt).toContain("迁移")
    expect(diagnosis.issueTags).not.toContain("colloquial_expression")
  })
})

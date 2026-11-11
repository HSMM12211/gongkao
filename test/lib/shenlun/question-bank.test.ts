import { describe, expect, it } from "vitest"

import { buildParsedShenlunAssetRecords } from "@/lib/shenlun/import-assets"
import {
  buildQuestionBankRecordsFromParsedOutput,
  selectReadyQuestionBankItems,
  summarizeQuestionBankItems,
} from "@/lib/shenlun/question-bank"
import type { ShenlunDocumentParserOutput } from "@/lib/shenlun/parser-output"

const baseOutput: ShenlunDocumentParserOutput = {
  document: {
    title: "2025 Province Exam",
    documentType: "exam_paper",
    sourceType: "pdf",
    originalName: "exam.pdf",
    rawText: "Material one discusses digital village services and grassroots governance. Question one asks for measures. Question two asks for analysis.",
  },
  examPapers: [
    {
      title: "2025 Province Exam",
      totalMinutes: 150,
      materialRefs: ["m1"],
      questionRefs: ["q1", "q2"],
    },
  ],
  passages: [
    {
      ref: "m1",
      order: 1,
      title: "Material 1",
      text: "Digital village services should improve infrastructure, public services, and grassroots governance capacity.",
      pageStart: 1,
      pageEnd: 2,
      tags: ["digital village", "grassroots governance"],
    },
  ],
  questions: [
    {
      ref: "q1",
      materialRefs: ["m1"],
      type: "countermeasure",
      title: "Digital village measures",
      prompt: "Propose measures to improve digital village public services.",
      suggestedMinutes: 25,
      scoringPointRefs: ["s1"],
    },
    {
      ref: "q2",
      materialRefs: ["m1"],
      type: "analysis",
      title: "Governance analysis",
      prompt: "Analyze why grassroots digital governance remains difficult.",
      suggestedMinutes: 25,
      scoringPointRefs: ["s2"],
    },
  ],
  answerKeys: [
    {
      ref: "a-q1",
      questionRef: "q1",
      answerText: "Improve infrastructure and public services.",
      source: "document",
    },
    {
      ref: "a-q2",
      questionRef: "q2",
      answerText: "The difficulty comes from capability, data, and coordination gaps.",
      source: "document",
    },
  ],
  scoringPoints: [
    {
      ref: "s1",
      questionRef: "q1",
      text: "Improve digital infrastructure",
      weight: 1,
      aliases: ["infrastructure"],
    },
    {
      ref: "s2",
      questionRef: "q2",
      text: "Explain coordination gaps",
      weight: 1,
      aliases: ["coordination"],
    },
  ],
  provenance: [
    {
      ref: "p1",
      sourceType: "document",
      parserSource: "mineru-skill",
      pageStart: 1,
      pageEnd: 2,
      confidence: 0.92,
      reviewState: "ready",
    },
  ],
  abilityTags: [
    {
      ref: "ability-q1",
      targetRef: "q1",
      dimension: "countermeasure",
      label: "Countermeasure",
      provenanceRef: "p1",
      confidence: 0.9,
    },
    {
      ref: "ability-q2",
      targetRef: "q2",
      dimension: "analysis",
      label: "Analysis",
      provenanceRef: "p1",
      confidence: 0.9,
    },
  ],
  topicAssets: [
    {
      ref: "topic-1",
      title: "Digital Village",
      category: "policy_theme",
      summary: "Digital village governance and services.",
      tags: ["digital village"],
      provenanceRef: "p1",
      relatedQuestionRefs: ["q1", "q2"],
      relatedPassageRefs: ["m1"],
    },
  ],
  warnings: [],
}

function buildRecords(output: ShenlunDocumentParserOutput = baseOutput) {
  return buildParsedShenlunAssetRecords(output, {
    idPrefix: "source-1",
    createdAt: "2026-06-03T08:00:00.000Z",
  })
}

describe("shenlun question bank", () => {
  it("normalizes every parsed question into a standard bank item", () => {
    const result = buildQuestionBankRecordsFromParsedOutput(baseOutput, buildRecords(), {
      idPrefix: "source-1",
      createdAt: "2026-06-03T08:00:00.000Z",
      parserSource: "mineru-skill",
    })

    expect(result.items).toHaveLength(2)
    expect(result.batch).toMatchObject({
      readyCount: 2,
      needsReviewCount: 0,
      ignoredDuplicateCount: 0,
      questionCount: 2,
      status: "ready",
    })
    expect(result.items[0]).toMatchObject({
      practiceCategory: "past_paper",
      reviewState: "ready",
      sourceDocumentId: "shenlun-doc-source-1",
      trainingQuestionId: "shenlun-question-source-1-q1",
      materialIds: ["shenlun-passage-source-1-m1"],
      scoringPointIds: ["shenlun-point-source-1-s1"],
      provenanceIds: ["shenlun-provenance-source-1-p1"],
      rubric: expect.objectContaining({ trusted: true, answerSource: "document" }),
    })
  })

  it("marks items without trusted scoring data as needing review", () => {
    const output: ShenlunDocumentParserOutput = {
      ...baseOutput,
      answerKeys: [],
      scoringPoints: [],
      questions: [
        {
          ...baseOutput.questions[0],
          scoringPointRefs: [],
        },
      ],
      warnings: ["No answer key detected"],
    }
    const result = buildQuestionBankRecordsFromParsedOutput(output, buildRecords(output), {
      idPrefix: "source-2",
      createdAt: "2026-06-03T08:00:00.000Z",
      parserSource: "local-deterministic",
    })

    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({
      reviewState: "needs_review",
      scoringPointIds: [],
      rubric: expect.objectContaining({ trusted: false, answerSource: "missing" }),
    })
    expect(result.items[0].warnings.join("\n")).toContain("scoring")
    expect(result.batch.status).toBe("needs_review")
  })

  it("deduplicates repeated questions inside one import batch", () => {
    const output: ShenlunDocumentParserOutput = {
      ...baseOutput,
      questions: [
        baseOutput.questions[0],
        {
          ...baseOutput.questions[0],
          ref: "q-duplicate",
          scoringPointRefs: ["s1"],
        },
      ],
    }
    const result = buildQuestionBankRecordsFromParsedOutput(output, buildRecords(output), {
      idPrefix: "source-3",
      createdAt: "2026-06-03T08:00:00.000Z",
      parserSource: "mineru-skill",
    })

    expect(result.items).toHaveLength(1)
    expect(result.batch.ignoredDuplicateCount).toBe(1)
    expect(result.batch.warnings.join("\n")).toContain("duplicate")
  })

  it("selects and summarizes ready items for practice", () => {
    const result = buildQuestionBankRecordsFromParsedOutput(baseOutput, buildRecords(), {
      idPrefix: "source-1",
      createdAt: "2026-06-03T08:00:00.000Z",
      parserSource: "mineru-skill",
    })
    const selected = selectReadyQuestionBankItems(result.items, {
      questionType: "countermeasure",
      practiceCategory: "past_paper",
      ability: "countermeasure",
    })
    const summary = summarizeQuestionBankItems(result.items)

    expect(selected).toHaveLength(1)
    expect(selected[0].title).toBe("Digital village measures")
    expect(summary.ready).toBe(2)
    expect(summary.byType.countermeasure).toBe(1)
    expect(summary.byCategory.past_paper).toBe(2)
  })
})

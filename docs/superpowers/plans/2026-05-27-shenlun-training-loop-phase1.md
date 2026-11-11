# 申论训练闭环 Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first SDD vertical slice: offline Shenlun exam material becomes structured training assets, then powers one timed single-question training session with diagnosis and basic calibration.

**Architecture:** Add a dedicated Shenlun domain layer instead of overloading existing generic material types. Store parsed documents, questions, answer keys, scoring points, sessions, answers, diagnoses, and calibration snapshots in IndexedDB. Keep AI/Agent parsing output behind schema validation and human-review boundaries.

**Tech Stack:** Next.js App Router, React, TypeScript, IndexedDB wrapper in `lib/storage`, Zod schema validation, Vitest, Tauri/Rust unchanged except if later Agent parsing needs desktop file access.

---

## Scope

This plan implements Phase 1 only.

Included:

- Clean Shenlun domain types.
- IndexedDB stores and repositories.
- Structured parser output schema for imported exam documents.
- Left nav label upgrade from “申论演练舱” to “申论训练闭环”.
- A page-level Shenlun training shell with internal tabs.
- Timed single-question training state machine.
- Diagnosis schema and issue-tag validation.
- Basic calibration aggregation from diagnoses.

Excluded:

- Full exam mode.
- Commentary-to-expression transfer.
- Full AI scoring implementation.
- Public web crawling.
- Desktop installer generation until implementation is verified.

## File Map

Create:

- `lib/shenlun/types.ts`  
  Owns clean domain types and enums for Shenlun training.

- `lib/shenlun/parser-output.ts`  
  Owns Zod schema for Agent/AI structured document parse output.

- `lib/shenlun/session.ts`  
  Owns timed training session state transitions and stage timing helpers.

- `lib/shenlun/diagnosis.ts`  
  Owns diagnosis validation and issue-tag helpers.

- `lib/shenlun/calibration.ts`  
  Owns aggregation from diagnosis history into calibration snapshots.

- `lib/shenlun/repositories.ts`  
  Owns repository functions over new IndexedDB stores.

- `test/lib/shenlun/parser-output.test.ts`
- `test/lib/shenlun/session.test.ts`
- `test/lib/shenlun/diagnosis.test.ts`
- `test/lib/shenlun/calibration.test.ts`
- `test/lib/shenlun/repositories.test.ts`

Modify:

- `lib/storage/schema.ts`  
  Add new store names and clean Shenlun persisted types. Increment `DB_VERSION`.

- `lib/storage/idb.ts`  
  Ensure new stores are created during upgrade.

- `components/app-shell.tsx`  
  Rename left nav entry to “申论训练闭环”; keep one entry only.

- `app/practice/page.tsx` or new route under existing practice entry  
  Add internal Shenlun Training Loop shell. Prefer reusing `/practice` to avoid route churn unless existing page becomes too crowded.

- `lib/storage/repositories.ts`  
  Keep existing repositories stable. Do not mix Shenlun training assets into generic material repositories.

---

## Task 1: Domain Types

**Files:**

- Create: `lib/shenlun/types.ts`
- Test: no runtime test; type correctness is verified by `npx tsc --noEmit`

- [ ] **Step 1: Create clean domain enums and types**

Create `lib/shenlun/types.ts`:

```ts
export type ShenlunDocumentType =
  | "exam_paper"
  | "single_question"
  | "answer_key"
  | "policy_file"
  | "commentary"
  | "lecture"
  | "personal_note"

export type ShenlunQuestionType =
  | "summary"
  | "countermeasure"
  | "analysis"
  | "implementation"
  | "essay"

export type ShenlunIssueTag =
  | "missing_points"
  | "wrong_material_location"
  | "inaccurate_summary"
  | "empty_countermeasure"
  | "weak_structure"
  | "colloquial_expression"
  | "word_count_failed"
  | "wrong_question_type"
  | "time_allocation_failed"

export type TrainingStage = "reading" | "marking" | "outline" | "writing" | "review"

export type ShenlunDocument = {
  id: string
  title: string
  documentType: ShenlunDocumentType
  sourceType: "pdf" | "markdown" | "text"
  originalName?: string
  rawText: string
  createdAt: string
  parseStatus: "pending" | "parsed" | "needs_review" | "failed"
  parseError?: string
}

export type ExamPaper = {
  id: string
  documentId: string
  title: string
  year?: number
  province?: string
  examName?: string
  totalMinutes: number
  materialIds: string[]
  questionIds: string[]
  createdAt: string
}

export type MaterialPassage = {
  id: string
  documentId: string
  paperId?: string
  order: number
  title?: string
  text: string
  pageStart?: number
  pageEnd?: number
  tags: string[]
}

export type TrainingQuestion = {
  id: string
  documentId?: string
  paperId?: string
  materialIds: string[]
  type: ShenlunQuestionType
  title: string
  prompt: string
  wordLimit?: number
  suggestedMinutes: number
  answerKeyId?: string
  scoringPointIds: string[]
  createdAt: string
}

export type AnswerKey = {
  id: string
  questionId: string
  answerText: string
  source: "document" | "manual" | "ai_generated"
  createdAt: string
}

export type ScoringPoint = {
  id: string
  questionId: string
  text: string
  weight: number
  aliases: string[]
}

export type TrainingStageTiming = {
  stage: TrainingStage
  startedAt: string
  endedAt?: string
  durationSeconds: number
  exceeded: boolean
}

export type TrainingSession = {
  id: string
  mode: "timed_single" | "exam" | "expression_transfer"
  questionIds: string[]
  startedAt: string
  endedAt?: string
  status: "draft" | "running" | "submitted" | "diagnosed" | "abandoned"
  totalLimitSeconds: number
  stageTimings: TrainingStageTiming[]
}

export type TrainingAnswer = {
  id: string
  sessionId: string
  questionId: string
  answerText: string
  wordCount: number
  submittedAt: string
}

export type ShenlunDiagnosis = {
  id: string
  sessionId: string
  questionId: string
  score?: number
  scoringPointHits: Array<{
    scoringPointId: string
    hit: boolean
    evidence?: string
  }>
  issueTags: ShenlunIssueTag[]
  structureComments: string[]
  languageSuggestions: Array<{
    original: string
    revised: string
    reason: string
  }>
  modelAnswer?: string
  createdAt: string
}

export type CalibrationSnapshot = {
  id: string
  createdAt: string
  periodStart: string
  periodEnd: string
  abilityScores: {
    readingExtraction: number
    summary: number
    analysis: number
    countermeasure: number
    documentFormat: number
    essayIdeation: number
    formalExpression: number
    timeControl: number
  }
  topIssueTags: Array<{
    tag: ShenlunIssueTag
    count: number
    ratio: number
  }>
  nextTrainingAdvice: string[]
}
```

- [ ] **Step 2: Type-check**

Run:

```bash
npx.cmd tsc --noEmit
```

Expected: pass.

---

## Task 2: Parser Output Schema

**Files:**

- Create: `lib/shenlun/parser-output.ts`
- Test: `test/lib/shenlun/parser-output.test.ts`

- [ ] **Step 1: Write failing parser schema tests**

Create `test/lib/shenlun/parser-output.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { parseShenlunDocumentOutput } from "@/lib/shenlun/parser-output"

describe("shenlun parser output", () => {
  it("accepts a structured exam paper parse result", () => {
    const result = parseShenlunDocumentOutput({
      document: {
        title: "2025 省考申论真题",
        documentType: "exam_paper",
        sourceType: "pdf",
        rawText: "材料一：数字乡村建设需要提升基层治理能力。",
      },
      examPapers: [
        {
          title: "2025 省考申论真题",
          totalMinutes: 150,
          materialRefs: ["m1"],
          questionRefs: ["q1"],
        },
      ],
      passages: [{ ref: "m1", order: 1, text: "数字乡村建设需要提升基层治理能力。", tags: ["数字乡村"] }],
      questions: [
        {
          ref: "q1",
          materialRefs: ["m1"],
          type: "countermeasure",
          title: "数字乡村对策题",
          prompt: "请提出推进数字乡村建设的对策。",
          suggestedMinutes: 25,
          scoringPointRefs: ["s1"],
        },
      ],
      answerKeys: [{ questionRef: "q1", answerText: "完善基础设施，提升数字素养。", source: "document" }],
      scoringPoints: [{ ref: "s1", questionRef: "q1", text: "完善数字基础设施", weight: 1, aliases: ["基础设施"] }],
      warnings: [],
    })

    expect(result.ok).toBe(true)
  })

  it("rejects parser output without trainable questions", () => {
    const result = parseShenlunDocumentOutput({
      document: {
        title: "空文档",
        documentType: "exam_paper",
        sourceType: "pdf",
        rawText: "只有材料，没有题目。",
      },
      examPapers: [],
      passages: [],
      questions: [],
      answerKeys: [],
      scoringPoints: [],
      warnings: [],
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.join("\n")).toContain("questions")
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npm.cmd run test -- test/lib/shenlun/parser-output.test.ts
```

Expected: fail because `@/lib/shenlun/parser-output` does not exist.

- [ ] **Step 3: Implement schema**

Create `lib/shenlun/parser-output.ts`:

```ts
import { z } from "zod"

const DocumentSchema = z.object({
  title: z.string().min(1),
  documentType: z.enum(["exam_paper", "single_question", "answer_key", "policy_file", "commentary", "lecture", "personal_note"]),
  sourceType: z.enum(["pdf", "markdown", "text"]),
  originalName: z.string().optional(),
  rawText: z.string().min(10),
})

const ParserOutputSchema = z.object({
  document: DocumentSchema,
  examPapers: z.array(
    z.object({
      title: z.string().min(1),
      year: z.number().optional(),
      province: z.string().optional(),
      examName: z.string().optional(),
      totalMinutes: z.number().int().positive(),
      materialRefs: z.array(z.string().min(1)),
      questionRefs: z.array(z.string().min(1)),
    }),
  ),
  passages: z.array(
    z.object({
      ref: z.string().min(1),
      order: z.number().int().nonnegative(),
      title: z.string().optional(),
      text: z.string().min(10),
      pageStart: z.number().int().positive().optional(),
      pageEnd: z.number().int().positive().optional(),
      tags: z.array(z.string()),
    }),
  ),
  questions: z
    .array(
      z.object({
        ref: z.string().min(1),
        materialRefs: z.array(z.string().min(1)),
        type: z.enum(["summary", "countermeasure", "analysis", "implementation", "essay"]),
        title: z.string().min(1),
        prompt: z.string().min(1),
        wordLimit: z.number().int().positive().optional(),
        suggestedMinutes: z.number().int().positive(),
        answerKeyRef: z.string().optional(),
        scoringPointRefs: z.array(z.string()).default([]),
      }),
    )
    .min(1),
  answerKeys: z.array(
    z.object({
      ref: z.string().optional(),
      questionRef: z.string().min(1),
      answerText: z.string().min(1),
      source: z.enum(["document", "manual", "ai_generated"]),
    }),
  ),
  scoringPoints: z.array(
    z.object({
      ref: z.string().min(1),
      questionRef: z.string().min(1),
      text: z.string().min(1),
      weight: z.number().positive(),
      aliases: z.array(z.string()),
    }),
  ),
  warnings: z.array(z.string()),
})

export type ShenlunDocumentParserOutput = z.infer<typeof ParserOutputSchema>

export type ParseShenlunDocumentOutputResult =
  | { ok: true; value: ShenlunDocumentParserOutput }
  | { ok: false; errors: string[] }

export function parseShenlunDocumentOutput(input: unknown): ParseShenlunDocumentOutputResult {
  const result = ParserOutputSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, errors: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) }
  }
  return { ok: true, value: result.data }
}
```

- [ ] **Step 4: Run parser tests**

Run:

```bash
npm.cmd run test -- test/lib/shenlun/parser-output.test.ts
```

Expected: pass.

---

## Task 3: Storage Stores And Repositories

**Files:**

- Modify: `lib/storage/schema.ts`
- Modify: `lib/storage/idb.ts`
- Create: `lib/shenlun/repositories.ts`
- Test: `test/lib/shenlun/repositories.test.ts`

- [ ] **Step 1: Write repository test**

Create `test/lib/shenlun/repositories.test.ts`:

```ts
import "fake-indexeddb/auto"
import { beforeEach, describe, expect, it } from "vitest"

import { DB_NAME } from "@/lib/storage/schema"
import { shenlunRepository } from "@/lib/shenlun/repositories"
import type { ShenlunDocument, TrainingQuestion } from "@/lib/shenlun/types"

async function deleteDb(name: string) {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => resolve()
  })
}

describe("shenlun repositories", () => {
  beforeEach(async () => {
    await deleteDb(DB_NAME)
  })

  it("stores parsed document and training questions", async () => {
    const document: ShenlunDocument = {
      id: "doc-1",
      title: "2025 省考申论真题",
      documentType: "exam_paper",
      sourceType: "pdf",
      rawText: "材料一：数字乡村建设需要提升基层治理能力。",
      createdAt: "2026-05-27T00:00:00.000Z",
      parseStatus: "parsed",
    }
    const question: TrainingQuestion = {
      id: "q-1",
      documentId: "doc-1",
      materialIds: [],
      type: "countermeasure",
      title: "数字乡村对策题",
      prompt: "请提出推进数字乡村建设的对策。",
      suggestedMinutes: 25,
      scoringPointIds: [],
      createdAt: "2026-05-27T00:00:00.000Z",
    }

    await shenlunRepository.saveDocument(document)
    await shenlunRepository.saveQuestion(question)

    expect(await shenlunRepository.getDocuments()).toEqual([document])
    expect(await shenlunRepository.getQuestions()).toEqual([question])
  })
})
```

- [ ] **Step 2: Verify failure**

Run:

```bash
npm.cmd run test -- test/lib/shenlun/repositories.test.ts
```

Expected: fail because repositories/stores do not exist.

- [ ] **Step 3: Add store names and types**

Modify `lib/storage/schema.ts`:

- Increment `DB_VERSION` by 1.
- Add store names:

```ts
shenlunDocuments: "shenlunDocuments",
shenlunExamPapers: "shenlunExamPapers",
shenlunMaterialPassages: "shenlunMaterialPassages",
shenlunTrainingQuestions: "shenlunTrainingQuestions",
shenlunAnswerKeys: "shenlunAnswerKeys",
shenlunScoringPoints: "shenlunScoringPoints",
shenlunTrainingSessions: "shenlunTrainingSessions",
shenlunTrainingAnswers: "shenlunTrainingAnswers",
shenlunDiagnoses: "shenlunDiagnoses",
shenlunCalibrationSnapshots: "shenlunCalibrationSnapshots",
```

- [ ] **Step 4: Ensure stores are created**

Modify `lib/storage/idb.ts` so every value in `STORES` is created if missing. If the file already iterates `Object.values(STORES)`, only the schema change is needed.

- [ ] **Step 5: Implement repository**

Create `lib/shenlun/repositories.ts`:

```ts
import { listItems, putItem } from "@/lib/storage/idb"
import { STORES } from "@/lib/storage/schema"
import type {
  AnswerKey,
  CalibrationSnapshot,
  ExamPaper,
  MaterialPassage,
  ScoringPoint,
  ShenlunDiagnosis,
  ShenlunDocument,
  TrainingAnswer,
  TrainingQuestion,
  TrainingSession,
} from "@/lib/shenlun/types"

export const shenlunRepository = {
  getDocuments: () => listItems<ShenlunDocument>(STORES.shenlunDocuments),
  saveDocument: (document: ShenlunDocument) => putItem(STORES.shenlunDocuments, document),
  getExamPapers: () => listItems<ExamPaper>(STORES.shenlunExamPapers),
  saveExamPaper: (paper: ExamPaper) => putItem(STORES.shenlunExamPapers, paper),
  getPassages: () => listItems<MaterialPassage>(STORES.shenlunMaterialPassages),
  savePassage: (passage: MaterialPassage) => putItem(STORES.shenlunMaterialPassages, passage),
  getQuestions: () => listItems<TrainingQuestion>(STORES.shenlunTrainingQuestions),
  saveQuestion: (question: TrainingQuestion) => putItem(STORES.shenlunTrainingQuestions, question),
  getAnswerKeys: () => listItems<AnswerKey>(STORES.shenlunAnswerKeys),
  saveAnswerKey: (answerKey: AnswerKey) => putItem(STORES.shenlunAnswerKeys, answerKey),
  getScoringPoints: () => listItems<ScoringPoint>(STORES.shenlunScoringPoints),
  saveScoringPoint: (point: ScoringPoint) => putItem(STORES.shenlunScoringPoints, point),
  getSessions: () => listItems<TrainingSession>(STORES.shenlunTrainingSessions),
  saveSession: (session: TrainingSession) => putItem(STORES.shenlunTrainingSessions, session),
  getAnswers: () => listItems<TrainingAnswer>(STORES.shenlunTrainingAnswers),
  saveAnswer: (answer: TrainingAnswer) => putItem(STORES.shenlunTrainingAnswers, answer),
  getDiagnoses: () => listItems<ShenlunDiagnosis>(STORES.shenlunDiagnoses),
  saveDiagnosis: (diagnosis: ShenlunDiagnosis) => putItem(STORES.shenlunDiagnoses, diagnosis),
  getCalibrationSnapshots: () => listItems<CalibrationSnapshot>(STORES.shenlunCalibrationSnapshots),
  saveCalibrationSnapshot: (snapshot: CalibrationSnapshot) => putItem(STORES.shenlunCalibrationSnapshots, snapshot),
}
```

- [ ] **Step 6: Run repository tests**

Run:

```bash
npm.cmd run test -- test/lib/shenlun/repositories.test.ts
```

Expected: pass.

---

## Task 4: Session State Machine

**Files:**

- Create: `lib/shenlun/session.ts`
- Test: `test/lib/shenlun/session.test.ts`

- [ ] **Step 1: Write failing state-machine tests**

Create `test/lib/shenlun/session.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { startTimedSingleSession, transitionStage, submitTrainingSession } from "@/lib/shenlun/session"

describe("shenlun training session state machine", () => {
  it("starts a timed single-question session", () => {
    const session = startTimedSingleSession({
      questionId: "q-1",
      totalLimitSeconds: 1500,
      now: "2026-05-27T08:00:00.000Z",
    })

    expect(session.mode).toBe("timed_single")
    expect(session.status).toBe("running")
    expect(session.questionIds).toEqual(["q-1"])
    expect(session.stageTimings[0].stage).toBe("reading")
  })

  it("records elapsed stage time when transitioning stages", () => {
    const session = startTimedSingleSession({
      questionId: "q-1",
      totalLimitSeconds: 1500,
      now: "2026-05-27T08:00:00.000Z",
    })

    const next = transitionStage(session, {
      nextStage: "outline",
      now: "2026-05-27T08:08:30.000Z",
      stageLimitSeconds: 480,
    })

    expect(next.stageTimings[0]).toMatchObject({
      stage: "reading",
      endedAt: "2026-05-27T08:08:30.000Z",
      durationSeconds: 510,
      exceeded: true,
    })
    expect(next.stageTimings[1].stage).toBe("outline")
  })

  it("submits a running session", () => {
    const session = startTimedSingleSession({
      questionId: "q-1",
      totalLimitSeconds: 1500,
      now: "2026-05-27T08:00:00.000Z",
    })

    const submitted = submitTrainingSession(session, "2026-05-27T08:25:00.000Z")

    expect(submitted.status).toBe("submitted")
    expect(submitted.endedAt).toBe("2026-05-27T08:25:00.000Z")
  })
})
```

- [ ] **Step 2: Verify failure**

Run:

```bash
npm.cmd run test -- test/lib/shenlun/session.test.ts
```

Expected: fail because module does not exist.

- [ ] **Step 3: Implement state helpers**

Create `lib/shenlun/session.ts`:

```ts
import type { TrainingSession, TrainingStage } from "@/lib/shenlun/types"

export function startTimedSingleSession({
  questionId,
  totalLimitSeconds,
  now,
}: {
  questionId: string
  totalLimitSeconds: number
  now: string
}): TrainingSession {
  return {
    id: crypto.randomUUID(),
    mode: "timed_single",
    questionIds: [questionId],
    startedAt: now,
    status: "running",
    totalLimitSeconds,
    stageTimings: [
      {
        stage: "reading",
        startedAt: now,
        durationSeconds: 0,
        exceeded: false,
      },
    ],
  }
}

export function transitionStage(
  session: TrainingSession,
  {
    nextStage,
    now,
    stageLimitSeconds,
  }: {
    nextStage: TrainingStage
    now: string
    stageLimitSeconds: number
  },
): TrainingSession {
  const stageTimings = [...session.stageTimings]
  const current = stageTimings[stageTimings.length - 1]
  const durationSeconds = Math.max(0, Math.round((Date.parse(now) - Date.parse(current.startedAt)) / 1000))
  stageTimings[stageTimings.length - 1] = {
    ...current,
    endedAt: now,
    durationSeconds,
    exceeded: durationSeconds > stageLimitSeconds,
  }
  stageTimings.push({
    stage: nextStage,
    startedAt: now,
    durationSeconds: 0,
    exceeded: false,
  })
  return { ...session, stageTimings }
}

export function submitTrainingSession(session: TrainingSession, now: string): TrainingSession {
  return {
    ...session,
    status: "submitted",
    endedAt: now,
  }
}
```

- [ ] **Step 4: Run session tests**

Run:

```bash
npm.cmd run test -- test/lib/shenlun/session.test.ts
```

Expected: pass.

---

## Task 5: Diagnosis And Calibration

**Files:**

- Create: `lib/shenlun/diagnosis.ts`
- Create: `lib/shenlun/calibration.ts`
- Test: `test/lib/shenlun/diagnosis.test.ts`
- Test: `test/lib/shenlun/calibration.test.ts`

- [ ] **Step 1: Write diagnosis test**

Create `test/lib/shenlun/diagnosis.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { validateDiagnosis } from "@/lib/shenlun/diagnosis"

describe("shenlun diagnosis", () => {
  it("accepts fixed issue tags and scoring point hits", () => {
    const result = validateDiagnosis({
      id: "d-1",
      sessionId: "s-1",
      questionId: "q-1",
      score: 72,
      scoringPointHits: [{ scoringPointId: "sp-1", hit: true, evidence: "完善基础设施" }],
      issueTags: ["empty_countermeasure", "time_allocation_failed"],
      structureComments: ["层次基本清楚，但对策展开不足。"],
      languageSuggestions: [],
      createdAt: "2026-05-27T08:30:00.000Z",
    })

    expect(result.ok).toBe(true)
  })

  it("rejects unknown issue tags", () => {
    const result = validateDiagnosis({
      id: "d-1",
      sessionId: "s-1",
      questionId: "q-1",
      scoringPointHits: [],
      issueTags: ["random_problem"],
      structureComments: [],
      languageSuggestions: [],
      createdAt: "2026-05-27T08:30:00.000Z",
    })

    expect(result.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Write calibration test**

Create `test/lib/shenlun/calibration.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { buildCalibrationSnapshot } from "@/lib/shenlun/calibration"
import type { ShenlunDiagnosis } from "@/lib/shenlun/types"

describe("shenlun calibration", () => {
  it("aggregates top issue tags and advice", () => {
    const diagnoses: ShenlunDiagnosis[] = [
      {
        id: "d-1",
        sessionId: "s-1",
        questionId: "q-1",
        scoringPointHits: [],
        issueTags: ["empty_countermeasure", "time_allocation_failed"],
        structureComments: [],
        languageSuggestions: [],
        createdAt: "2026-05-27T08:30:00.000Z",
      },
      {
        id: "d-2",
        sessionId: "s-2",
        questionId: "q-2",
        scoringPointHits: [],
        issueTags: ["empty_countermeasure"],
        structureComments: [],
        languageSuggestions: [],
        createdAt: "2026-05-28T08:30:00.000Z",
      },
    ]

    const snapshot = buildCalibrationSnapshot({
      diagnoses,
      periodStart: "2026-05-27T00:00:00.000Z",
      periodEnd: "2026-05-28T23:59:59.000Z",
      now: "2026-05-28T23:59:59.000Z",
    })

    expect(snapshot.topIssueTags[0]).toMatchObject({ tag: "empty_countermeasure", count: 2 })
    expect(snapshot.nextTrainingAdvice.join("\n")).toContain("对策")
  })
})
```

- [ ] **Step 3: Verify failure**

Run:

```bash
npm.cmd run test -- test/lib/shenlun/diagnosis.test.ts test/lib/shenlun/calibration.test.ts
```

Expected: fail because modules do not exist.

- [ ] **Step 4: Implement diagnosis validator**

Create `lib/shenlun/diagnosis.ts`:

```ts
import { z } from "zod"

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
    return { ok: false as const, errors: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) }
  }
  return { ok: true as const, value: result.data }
}
```

- [ ] **Step 5: Implement calibration aggregation**

Create `lib/shenlun/calibration.ts`:

```ts
import type { CalibrationSnapshot, ShenlunDiagnosis, ShenlunIssueTag } from "@/lib/shenlun/types"

export function buildCalibrationSnapshot({
  diagnoses,
  periodStart,
  periodEnd,
  now,
}: {
  diagnoses: ShenlunDiagnosis[]
  periodStart: string
  periodEnd: string
  now: string
}): CalibrationSnapshot {
  const counts = new Map<ShenlunIssueTag, number>()
  let totalTags = 0
  for (const diagnosis of diagnoses) {
    for (const tag of diagnosis.issueTags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
      totalTags += 1
    }
  }

  const topIssueTags = Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count, ratio: totalTags === 0 ? 0 : count / totalTags }))
    .sort((a, b) => b.count - a.count)

  return {
    id: crypto.randomUUID(),
    createdAt: now,
    periodStart,
    periodEnd,
    abilityScores: {
      readingExtraction: scoreFromMissing(topIssueTags, "wrong_material_location"),
      summary: scoreFromMissing(topIssueTags, "inaccurate_summary"),
      analysis: 70,
      countermeasure: scoreFromMissing(topIssueTags, "empty_countermeasure"),
      documentFormat: 70,
      essayIdeation: 70,
      formalExpression: scoreFromMissing(topIssueTags, "colloquial_expression"),
      timeControl: scoreFromMissing(topIssueTags, "time_allocation_failed"),
    },
    topIssueTags,
    nextTrainingAdvice: buildAdvice(topIssueTags),
  }
}

function scoreFromMissing(topIssueTags: Array<{ tag: ShenlunIssueTag; ratio: number }>, tag: ShenlunIssueTag): number {
  const ratio = topIssueTags.find((item) => item.tag === tag)?.ratio ?? 0
  return Math.max(40, Math.round(85 - ratio * 60))
}

function buildAdvice(topIssueTags: Array<{ tag: ShenlunIssueTag; count: number }>): string[] {
  const advice: string[] = []
  if (topIssueTags.some((item) => item.tag === "empty_countermeasure")) {
    advice.push("优先完成 1 道对策题限时训练，要求每条对策包含主体、动作和落点。")
  }
  if (topIssueTags.some((item) => item.tag === "time_allocation_failed")) {
    advice.push("进行一次五阶段时间感训练，重点压缩读材料和列提纲时间。")
  }
  if (advice.length === 0) advice.push("保持每周至少 3 次申论训练，并持续沉淀规范表达。")
  return advice
}
```

- [ ] **Step 6: Run tests**

Run:

```bash
npm.cmd run test -- test/lib/shenlun/diagnosis.test.ts test/lib/shenlun/calibration.test.ts
```

Expected: pass.

---

## Task 6: Navigation And Training Shell

**Files:**

- Modify: `components/app-shell.tsx`
- Modify: `app/practice/page.tsx`

- [ ] **Step 1: Update left nav label**

In `components/app-shell.tsx`, locate the existing “申论演练舱” navigation item. Change only its visible label to:

```text
申论训练闭环
```

Keep the route stable unless the component already defines a clean route abstraction.

- [ ] **Step 2: Add internal tabs to the practice page**

In `app/practice/page.tsx`, add an internal section near the top with these tabs:

```text
今日训练
时间感训练
复盘诊断
评论转表达
考场模式
阶段校准
```

Phase 1 active content only needs:

- 今日训练 summary card
- 时间感训练 list of available imported questions
- 复盘诊断 placeholder fed by saved diagnoses
- 阶段校准 summary fed by calibration snapshots

Do not implement full exam mode or commentary transfer yet. Their tabs can show concise “后续阶段接入” empty states.

- [ ] **Step 3: Run build**

Run:

```bash
npm.cmd run build
```

Expected: pass.

---

## Task 7: End-To-End Vertical Flow

**Files:**

- Modify: `app/materials/page.tsx` or a focused child component under `components/materials/`
- Modify: `app/practice/page.tsx`
- Use repositories from `lib/shenlun/repositories.ts`

- [ ] **Step 1: Add document type selection during material import**

In the material import UI, add a document type selector with these values:

```text
真题套卷 -> exam_paper
单题材料 -> single_question
参考答案 / 评分标准 -> answer_key
政策文件 -> policy_file
评论文章 -> commentary
讲义资料 -> lecture
个人笔记 -> personal_note
```

Default to `commentary` for generic text and `exam_paper` when the filename contains `真题` or `申论`.

- [ ] **Step 2: Store parsed exam output**

For Phase 1, support a manual/structured import path:

- If parser output is available from Agent, validate with `parseShenlunDocumentOutput`.
- Save document, passages, questions, answer keys, and scoring points through `shenlunRepository`.
- If parser output fails validation, store an inbox draft warning and do not create training assets.

- [ ] **Step 3: Show imported questions in training shell**

In the “时间感训练” tab, list `shenlunRepository.getQuestions()`.

Each item shows:

- title
- type
- suggestedMinutes
- whether scoring points exist

- [ ] **Step 4: Start a timed single session**

When user clicks “开始训练”:

- call `startTimedSingleSession`
- save session through `shenlunRepository.saveSession`
- show material text, prompt, stage timer, and answer textarea

- [ ] **Step 5: Submit answer**

On submit:

- save `TrainingAnswer`
- mark session submitted with `submitTrainingSession`
- for Phase 1, generate a basic deterministic diagnosis:
  - scoring point hit if answer contains scoring point text or alias
  - add `missing_points` if any scoring point is missed
  - add `word_count_failed` if word limit exists and answer exceeds it
  - add `time_allocation_failed` if any stage exceeded
- save `ShenlunDiagnosis`
- build and save a basic `CalibrationSnapshot`

- [ ] **Step 6: Verify vertical flow manually**

Manual checklist:

```text
Open 素材知识库
Import or create one exam-paper style asset
Confirm one TrainingQuestion exists
Open 申论训练闭环
Start 时间感训练
Submit answer
See diagnosis issue tags
Open 阶段校准
See updated top issue tags and advice
```

---

## Task 8: Final Verification

- [ ] **Step 1: Run unit tests**

```bash
npm.cmd run test
```

Expected: all tests pass.

- [ ] **Step 2: Run TypeScript check**

```bash
npx.cmd tsc --noEmit
```

Expected: pass.

- [ ] **Step 3: Run production build**

```bash
npm.cmd run build
```

Expected: pass.

- [ ] **Step 4: Run Rust tests**

```bash
cargo test --no-default-features
```

Working directory:

```text
D:\cursor-demo\gongkao\src-tauri
```

Expected: pass.

- [ ] **Step 5: Desktop package**

Only after all checks pass:

```bash
npm.cmd run desktop:build
```

Expected installer:

```text
D:\cursor-demo\gongkao\src-tauri\target\release\bundle\nsis\申论 AI 智能修炼_0.1.0_x64-setup.exe
```

---

## Self-Review

Spec coverage:

- Left nav single entry: Task 6.
- Offline document linkage: Tasks 3 and 7.
- Structured exam assets: Tasks 1, 2, 3.
- Timed single training: Tasks 4 and 7.
- Diagnosis: Task 5 and 7.
- Basic calibration: Task 5 and 7.
- Commentary transfer and full exam mode: intentionally deferred to Phase 2/3 per SDD scope.

Placeholder scan:

- No TBD markers.
- Deferred features are explicitly out of Phase 1 scope.

Type consistency:

- Domain types originate in `lib/shenlun/types.ts`.
- Repositories import those types.
- Parser output uses refs so parser schema stays decoupled from persisted IDs.

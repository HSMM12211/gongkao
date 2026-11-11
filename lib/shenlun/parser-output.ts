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
  provenance: z
    .array(
      z.object({
        ref: z.string().min(1),
        sourceType: z.enum(["document", "user", "ai_generated", "skill_generated"]),
        parserSource: z.string().optional(),
        pageStart: z.number().int().positive().optional(),
        pageEnd: z.number().int().positive().optional(),
        textStart: z.number().int().nonnegative().optional(),
        textEnd: z.number().int().nonnegative().optional(),
        confidence: z.number().min(0).max(1),
        reviewState: z.enum(["ready", "needs_review", "corrected", "ignored"]),
      }),
    )
    .optional(),
  abilityTags: z
    .array(
      z.object({
        ref: z.string().min(1),
        targetRef: z.string().optional(),
        dimension: z.enum([
          "readingExtraction",
          "summary",
          "analysis",
          "countermeasure",
          "implementationFormat",
          "essayIdeation",
          "formalExpression",
          "timeControl",
        ]),
        label: z.string().min(1),
        provenanceRef: z.string().optional(),
        confidence: z.number().min(0).max(1).optional(),
      }),
    )
    .optional(),
  topicAssets: z
    .array(
      z.object({
        ref: z.string().min(1),
        title: z.string().min(1),
        category: z.enum(["policy_theme", "governance_case", "problem", "countermeasure", "quote", "expression"]),
        summary: z.string().min(1),
        tags: z.array(z.string()),
        provenanceRef: z.string().min(1),
        relatedQuestionRefs: z.array(z.string()).optional(),
        relatedPassageRefs: z.array(z.string()).optional(),
      }),
    )
    .optional(),
  warnings: z.array(z.string()),
})

export type ShenlunDocumentParserOutput = z.infer<typeof ParserOutputSchema>

export type ParseShenlunDocumentOutputResult =
  | { ok: true; value: ShenlunDocumentParserOutput }
  | { ok: false; errors: string[] }

export function parseShenlunDocumentOutput(input: unknown): ParseShenlunDocumentOutputResult {
  const result = ParserOutputSchema.safeParse(input)
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
    }
  }
  return { ok: true, value: result.data }
}

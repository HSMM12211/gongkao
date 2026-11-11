import { z } from "zod"

import { parseShenlunDocumentOutput } from "@/lib/shenlun/parser-output"
import { validateDiagnosis } from "@/lib/shenlun/diagnosis"
import type { ShenlunDiagnosis } from "@/lib/shenlun/types"

export type AgentContractResult<T> = { ok: true; value: T } | { ok: false; errors: string[] }

export function parseAgentExamParseOutput(raw: string): AgentContractResult<ReturnType<typeof parseShenlunDocumentOutput> extends { ok: true; value: infer T } ? T : never> {
  const json = parseJson(raw)
  if (!json.ok) return json
  const result = parseShenlunDocumentOutput(json.value)
  return result.ok ? { ok: true, value: result.value as never } : { ok: false, errors: result.errors }
}

const AgentDiagnosisSchema = z.object({
  diagnosis: z.object({
    score: z.number().min(0).max(100).optional(),
    scoringPointHits: z.array(
      z.object({
        scoringPointId: z.string(),
        hit: z.boolean(),
        evidence: z.string().optional(),
      }),
    ),
    issueTags: z.array(
      z.enum([
        "missing_points",
        "wrong_material_location",
        "inaccurate_summary",
        "empty_countermeasure",
        "weak_structure",
        "colloquial_expression",
        "word_count_failed",
        "wrong_question_type",
        "time_allocation_failed",
      ]),
    ),
    structureComments: z.array(z.string()),
    languageSuggestions: z.array(
      z.object({
        original: z.string(),
        revised: z.string(),
        reason: z.string(),
      }),
    ),
    modelAnswer: z.string().optional(),
  }),
})

export function parseAgentDiagnosisOutput(
  raw: string,
  context: { sessionId: string; questionId: string; now: string },
): AgentContractResult<ShenlunDiagnosis> {
  const json = parseJson(raw)
  if (!json.ok) return json
  const parsed = AgentDiagnosisSchema.safeParse(json.value)
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`) }
  }
  const diagnosis = {
    id: crypto.randomUUID(),
    sessionId: context.sessionId,
    questionId: context.questionId,
    createdAt: context.now,
    ...parsed.data.diagnosis,
  }
  const validation = validateDiagnosis(diagnosis)
  return validation.ok ? { ok: true, value: validation.value } : { ok: false, errors: validation.errors }
}

function parseJson(raw: string): AgentContractResult<unknown> {
  try {
    return { ok: true, value: JSON.parse(raw) }
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : "Invalid JSON"] }
  }
}

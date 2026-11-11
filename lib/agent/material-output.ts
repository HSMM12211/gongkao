import { z } from "zod"
import type { AgentMaterialOutput, MaterialDraft } from "@/lib/material/types"

const FlashcardCategorySchema = z.enum(["金句", "规范词", "对策"])
const QuestionTypeSchema = z.enum(["概括题", "对策题", "综合分析", "应用文", "大作文"])
const SourceTypeSchema = z.enum(["text", "markdown", "pdf"])

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function asTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const stringValue = asTrimmedString(value)
    if (stringValue) return stringValue
  }
  return undefined
}

function stringList(value: unknown): string[] {
  const rawItems = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,\n;，、]/) : []
  return Array.from(
    new Set(
      rawItems
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean),
    ),
  )
}

function withFallbacks(items: string[], fallbacks: unknown[], minCount: number): string[] {
  const normalized = [...items]
  for (const fallback of fallbacks) {
    const value = asTrimmedString(fallback)
    if (value && !normalized.includes(value)) normalized.push(value)
    if (normalized.length >= minCount) break
  }
  return normalized
}

function excerpt(text: unknown, fallback: string, maxLength = 180): string {
  const normalized = (asTrimmedString(text) ?? fallback).replace(/\s+/g, " ").trim()
  return normalized.slice(0, maxLength) || fallback
}

function arrayRecords(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function sourceType(value: unknown): z.infer<typeof SourceTypeSchema> {
  const parsed = SourceTypeSchema.safeParse(value)
  return parsed.success ? parsed.data : "text"
}

function flashcardCategory(value: unknown): z.infer<typeof FlashcardCategorySchema> {
  const parsed = FlashcardCategorySchema.safeParse(value)
  return parsed.success ? parsed.data : FlashcardCategorySchema.options[1]
}

function questionType(value: unknown): z.infer<typeof QuestionTypeSchema> {
  const parsed = QuestionTypeSchema.safeParse(value)
  return parsed.success ? parsed.data : QuestionTypeSchema.options[2]
}

function urlOrUndefined(value: unknown): string | undefined {
  const url = asTrimmedString(value)
  if (!url) return undefined
  try {
    return new URL(url).toString()
  } catch {
    return undefined
  }
}

function confidence(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5
}

const MaterialDraftSchema: z.ZodType<MaterialDraft> = z.object({
  topic: z.string().min(1),
  summary: z.string().min(1),
  source: z.string().optional(),
  tags: z.array(z.string().min(1)).min(1),
  keywords: z.array(z.string().min(1)).min(3),
  goldenSentences: z.array(z.string().min(1)),
  flashcards: z
    .array(
      z.object({
        front: z.string().min(1),
        keywords: z.array(z.string().min(1)).min(1),
        category: FlashcardCategorySchema,
      }),
    )
    .min(1),
  practiceQuestions: z
    .array(
      z.object({
        type: QuestionTypeSchema,
        title: z.string().min(1),
        material: z.string().min(1),
        prompt: z.string().min(1),
        keywords: z.array(z.string().min(1)).min(1),
        modelAnswer: z.string().min(1),
      }),
    )
    .min(1),
  copybookItems: z.array(
    z.object({
      title: z.string().min(1),
      text: z.string().min(1),
      tags: z.array(z.string().min(1)),
    }),
  ),
})

export const AgentMaterialOutputSchema = z
  .object({
    schemaVersion: z.literal(1),
    source: z.object({
      title: z.string().min(1),
      sourceType: z.enum(["text", "markdown", "pdf"]),
      originalName: z.string().optional(),
      text: z.string().min(20),
      references: z
        .array(
          z.object({
            title: z.string().min(1),
            url: z.string().url().optional(),
            publisher: z.string().optional(),
            publishedAt: z.string().optional(),
            accessedAt: z.string().min(1),
            snapshotPath: z.string().optional(),
            excerpt: z.string().min(1),
          }),
        )
        .min(1),
    }),
    draft: MaterialDraftSchema,
    report: z.object({
      summary: z.string().min(1),
      warnings: z.array(z.string()),
      confidence: z.number().min(0).max(1),
    }),
  })
  .transform((value) => value as AgentMaterialOutput)

function normalizeReferences(source: JsonRecord): unknown {
  const sourceTitle = firstString(source.title, source.originalName) ?? "Local material source"
  const sourceText = firstString(source.text) ?? sourceTitle
  const references = arrayRecords(source.references)
  if (references.length === 0) return source.references

  return references.map((reference) => {
    const title = firstString(reference.title, reference.name, sourceTitle) ?? sourceTitle
    const referenceExcerpt =
      firstString(reference.excerpt, reference.note, reference.locator, reference.description) ?? excerpt(sourceText, title)
    return {
      title,
      url: urlOrUndefined(reference.url),
      publisher: firstString(reference.publisher, reference.source, reference.author),
      publishedAt: firstString(reference.publishedAt, reference.published_at, reference.date),
      accessedAt: firstString(reference.accessedAt, reference.accessed_at) ?? new Date().toISOString(),
      snapshotPath: firstString(reference.snapshotPath, reference.snapshot_path, reference.path),
      excerpt: referenceExcerpt,
    }
  })
}

function normalizeDraft(draft: JsonRecord, source: JsonRecord): JsonRecord {
  const topic = firstString(draft.topic, source.title, source.originalName) ?? "Local material"
  const summary = firstString(draft.summary, draft.description) ?? excerpt(source.text, topic)
  const tags = withFallbacks(stringList(draft.tags), [topic, source.sourceType], 1)
  const keywords = withFallbacks(stringList(draft.keywords), [topic, ...tags, source.title], 3)
  const goldenSentences = stringList(draft.goldenSentences)

  const flashcards = arrayRecords(draft.flashcards)
    .map((item) => {
      const front = firstString(item.front, item.title, item.question, item.back)
      if (!front) return null
      return {
        front,
        keywords: withFallbacks(stringList(item.keywords), [item.back, front, ...keywords], 1),
        category: flashcardCategory(item.category),
      }
    })
    .filter(Boolean)

  const practiceQuestions = arrayRecords(draft.practiceQuestions)
    .map((item) => {
      const title = firstString(item.title, item.question, item.prompt)
      const prompt = firstString(item.prompt, item.question, title)
      const modelAnswer = firstString(item.modelAnswer, item.answer, item.referenceAnswer, item.analysis)
      if (!title || !prompt || !modelAnswer) return null
      return {
        type: questionType(item.type),
        title,
        material: firstString(item.material, item.context, source.text) ?? summary,
        prompt,
        keywords: withFallbacks(stringList(item.keywords), keywords, 1),
        modelAnswer,
      }
    })
    .filter(Boolean)

  const copybookItems = arrayRecords(draft.copybookItems)
    .map((item, index) => {
      const text = firstString(item.text, item.sentence, item.content)
      if (!text) return null
      return {
        title: firstString(item.title, item.name, item.source) ?? `Copybook item ${index + 1}`,
        text,
        tags: withFallbacks(stringList(item.tags), tags, 1),
      }
    })
    .filter(Boolean)

  return {
    ...draft,
    topic,
    summary,
    source: asTrimmedString(draft.source),
    tags,
    keywords,
    goldenSentences,
    flashcards,
    practiceQuestions,
    copybookItems,
  }
}

function normalizeAgentMaterialOutput(parsed: unknown): unknown {
  if (!isRecord(parsed)) return parsed
  const source = isRecord(parsed.source) ? parsed.source : {}
  const draft = isRecord(parsed.draft) ? parsed.draft : {}
  const report = isRecord(parsed.report) ? parsed.report : {}
  const normalizedSource = {
    ...source,
    title: firstString(source.title, source.originalName, draft.topic) ?? "Local material source",
    sourceType: sourceType(source.sourceType),
    originalName: asTrimmedString(source.originalName),
    text: firstString(source.text) ?? "",
    references: normalizeReferences(source),
  }

  return {
    ...parsed,
    schemaVersion: 1,
    source: normalizedSource,
    draft: normalizeDraft(draft, normalizedSource),
    report: {
      summary: firstString(report.summary) ?? "Agent output normalized for material review.",
      warnings: stringList(report.warnings),
      confidence: confidence(report.confidence),
    },
  }
}

export type ParseAgentMaterialOutputResult =
  | { ok: true; value: AgentMaterialOutput }
  | { ok: false; errors: string[] }

function stripJsonBom(raw: string): string {
  return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
}

export function parseAgentMaterialOutput(raw: string): ParseAgentMaterialOutputResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(stripJsonBom(raw))
  } catch {
    return { ok: false, errors: ["material-draft.json is not valid JSON"] }
  }

  const result = AgentMaterialOutputSchema.safeParse(normalizeAgentMaterialOutput(parsed))
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    }
  }

  return { ok: true, value: result.data }
}

export function toMaterialDraftFromAgentOutput(output: AgentMaterialOutput): MaterialDraft {
  return output.draft
}

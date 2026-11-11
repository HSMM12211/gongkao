import type { ShenlunDocumentParserOutput } from "@/lib/shenlun/parser-output"
import type {
  AbilityTag,
  AnswerKey,
  ExamPaper,
  LearningAssetProvenance,
  MaterialPassage,
  PracticeCategory,
  QuestionBankAnswerSource,
  QuestionBankDifficulty,
  QuestionBankImportBatch,
  QuestionBankItem,
  QuestionBankReviewState,
  QuestionBankRubric,
  QuestionBankSourceType,
  ScoringPoint,
  ShenlunAbilityDimension,
  ShenlunDocument,
  ShenlunDocumentType,
  ShenlunQuestionType,
  TopicAsset,
  TrainingQuestion,
} from "@/lib/shenlun/types"

type ParsedAssetRecords = {
  document: ShenlunDocument
  examPapers: ExamPaper[]
  passages: MaterialPassage[]
  questions: TrainingQuestion[]
  answerKeys: AnswerKey[]
  scoringPoints: ScoringPoint[]
  provenance: LearningAssetProvenance[]
  abilityTags: AbilityTag[]
  topicAssets: TopicAsset[]
}

type BuildQuestionBankOptions = {
  idPrefix: string
  createdAt: string
  parserSource?: string
}

export type BuildQuestionBankResult = {
  items: QuestionBankItem[]
  batch: QuestionBankImportBatch
}

export type SelectQuestionBankOptions = {
  questionType?: ShenlunQuestionType | "all"
  practiceCategory?: PracticeCategory | "all"
  ability?: ShenlunAbilityDimension | "all"
  topicTag?: string
  includeNeedsReview?: boolean
}

export function buildQuestionBankRecordsFromParsedOutput(
  output: ShenlunDocumentParserOutput,
  records: ParsedAssetRecords,
  options: BuildQuestionBankOptions,
): BuildQuestionBankResult {
  const seen = new Set<string>()
  const items: QuestionBankItem[] = []
  const warnings = [...output.warnings]
  let ignoredDuplicateCount = 0

  for (const question of output.questions) {
    const duplicateKey = buildDuplicateKey(question)
    if (seen.has(duplicateKey)) {
      ignoredDuplicateCount += 1
      warnings.push(`Ignored duplicate question: ${question.ref}`)
      continue
    }
    seen.add(duplicateKey)

    const item = buildQuestionBankItem(output, records, question, options)
    items.push(item)
  }

  const readyCount = items.filter((item) => item.reviewState === "ready").length
  const needsReviewCount = items.filter((item) => item.reviewState === "draft" || item.reviewState === "needs_review").length
  const status: QuestionBankImportBatch["status"] =
    items.length === 0 ? "failed" : readyCount === items.length ? "ready" : needsReviewCount > 0 ? "needs_review" : "draft"

  return {
    items,
    batch: {
      id: `question-bank-batch-${options.idPrefix}`,
      sourceId: records.document.id,
      sourceTitle: output.document.title,
      sourceType: sourceTypeForDocument(output.document.sourceType),
      parserSource: options.parserSource ?? inferParserSource(records.provenance),
      createdAt: options.createdAt,
      itemIds: items.map((item) => item.id),
      readyCount,
      needsReviewCount,
      ignoredDuplicateCount,
      questionCount: output.questions.length,
      passageCount: output.passages.length,
      rubricCount: output.scoringPoints.length,
      warnings,
      status,
    },
  }
}

export function selectReadyQuestionBankItems(items: QuestionBankItem[], options: SelectQuestionBankOptions = {}): QuestionBankItem[] {
  return items
    .filter((item) => (options.includeNeedsReview ? item.reviewState !== "ignored" && item.reviewState !== "archived" : item.reviewState === "ready"))
    .filter((item) => !options.questionType || options.questionType === "all" || item.type === options.questionType)
    .filter((item) => !options.practiceCategory || options.practiceCategory === "all" || item.practiceCategory === options.practiceCategory)
    .filter((item) => !options.ability || options.ability === "all" || item.abilityTags.includes(options.ability))
    .filter((item) => !options.topicTag || item.topicTags.includes(options.topicTag))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function summarizeQuestionBankItems(items: QuestionBankItem[]) {
  const byType = emptyQuestionTypeCounts()
  const byCategory = emptyCategoryCounts()
  let ready = 0
  let needsReview = 0

  for (const item of items) {
    byType[item.type] += 1
    byCategory[item.practiceCategory] += 1
    if (item.reviewState === "ready") ready += 1
    if (item.reviewState === "draft" || item.reviewState === "needs_review") needsReview += 1
  }

  return {
    total: items.length,
    ready,
    needsReview,
    byType,
    byCategory,
  }
}

export function questionBankItemToTrainingQuestion(item: QuestionBankItem): TrainingQuestion {
  return {
    id: item.trainingQuestionId ?? item.id,
    documentId: item.sourceDocumentId,
    materialIds: item.materialIds,
    type: item.type,
    title: item.title,
    prompt: item.prompt,
    wordLimit: item.wordLimit,
    suggestedMinutes: item.estimatedMinutes,
    answerKeyId: item.answerKeyId,
    scoringPointIds: item.scoringPointIds,
    createdAt: item.createdAt,
  }
}

function buildQuestionBankItem(
  output: ShenlunDocumentParserOutput,
  records: ParsedAssetRecords,
  question: ShenlunDocumentParserOutput["questions"][number],
  options: BuildQuestionBankOptions,
): QuestionBankItem {
  const trainingQuestion = records.questions.find((item) => item.id.endsWith(`-${question.ref}`))
  const questionId = trainingQuestion?.id ?? `shenlun-question-${options.idPrefix}-${question.ref}`
  const materialIds = question.materialRefs.map((ref) => findRecordId(records.passages, ref, options.idPrefix, "shenlun-passage")).filter(Boolean)
  const answerKey = records.answerKeys.find((item) => item.questionId === questionId)
  const scoringPoints = records.scoringPoints.filter((item) => item.questionId === questionId)
  const provenanceIds = provenanceIdsForQuestion(records, question, output, options.idPrefix)
  const abilityTags = abilityTagsForQuestion(records.abilityTags, questionId, question.type)
  const topicTags = topicTagsForQuestion(records.topicAssets, questionId, materialIds, output)
  const rubric = buildRubric(answerKey, scoringPoints)
  const itemWarnings = itemWarningsForQuestion(output, rubric, provenanceIds)
  const confidence = confidenceForQuestion(records.provenance, output)
  const reviewState = reviewStateForQuestion(output, rubric, provenanceIds, confidence)
  const pageRange = pageRangeForMaterials(records.passages, materialIds)

  return {
    id: `question-bank-item-${options.idPrefix}-${question.ref}`,
    sourceId: records.document.id,
    sourceTitle: output.document.title,
    sourceType: sourceTypeForDocument(output.document.sourceType),
    sourceDocumentId: records.document.id,
    trainingQuestionId: questionId,
    materialIds,
    answerKeyId: answerKey?.id,
    scoringPointIds: scoringPoints.map((point) => point.id),
    practiceCategory: practiceCategoryForDocument(output.document.documentType, reviewState),
    type: question.type,
    title: question.title,
    prompt: question.prompt,
    materialPreview: materialPreview(records.passages, materialIds),
    standardAnswer: answerKey?.answerText,
    rubric,
    abilityTags,
    topicTags,
    difficulty: difficultyForQuestion(question),
    estimatedMinutes: question.suggestedMinutes,
    wordLimit: question.wordLimit,
    reviewState,
    provenanceIds,
    pageStart: pageRange.pageStart,
    pageEnd: pageRange.pageEnd,
    confidence,
    warnings: itemWarnings,
    createdAt: options.createdAt,
    updatedAt: options.createdAt,
  }
}

function buildRubric(answerKey: AnswerKey | undefined, scoringPoints: ScoringPoint[]): QuestionBankRubric {
  const answerSource: QuestionBankAnswerSource = answerKey?.source ?? "missing"
  const points = scoringPoints.map((point) => ({
    id: point.id,
    text: point.text,
    weight: point.weight,
    keywords: point.aliases.length > 0 ? point.aliases : [point.text],
  }))
  const trusted = (answerSource === "document" || answerSource === "manual") && points.length > 0

  return {
    answerSource,
    answerText: answerKey?.answerText,
    points,
    trusted,
  }
}

function reviewStateForQuestion(
  output: ShenlunDocumentParserOutput,
  rubric: QuestionBankRubric,
  provenanceIds: string[],
  confidence: number,
): QuestionBankReviewState {
  if (provenanceIds.length === 0) return "needs_review"
  if (!rubric.trusted) return "needs_review"
  if (output.warnings.length > 0) return "needs_review"
  if (confidence < 0.75) return "needs_review"
  return "ready"
}

function itemWarningsForQuestion(output: ShenlunDocumentParserOutput, rubric: QuestionBankRubric, provenanceIds: string[]): string[] {
  const warnings = [...output.warnings]
  if (provenanceIds.length === 0) warnings.push("Question bank item is missing provenance.")
  if (rubric.answerSource === "missing") warnings.push("Question bank item is missing answer key.")
  if (rubric.points.length === 0) warnings.push("Question bank item is missing scoring points.")
  if (!rubric.trusted) warnings.push("Question bank item needs review before authoritative scoring.")
  return Array.from(new Set(warnings))
}

function buildDuplicateKey(question: ShenlunDocumentParserOutput["questions"][number]): string {
  return `${normalizeComparableText(question.prompt)}::${question.materialRefs.slice().sort().join(",")}`
}

function findRecordId(records: Array<{ id: string }>, ref: string, idPrefix: string, prefix: string): string {
  return records.find((item) => item.id.endsWith(`-${ref}`))?.id ?? `${prefix}-${idPrefix}-${ref}`
}

function provenanceIdsForQuestion(
  records: ParsedAssetRecords,
  question: ShenlunDocumentParserOutput["questions"][number],
  output: ShenlunDocumentParserOutput,
  idPrefix: string,
): string[] {
  const explicitRefs = new Set<string>()
  for (const tag of output.abilityTags ?? []) {
    if (tag.targetRef === question.ref && tag.provenanceRef) explicitRefs.add(tag.provenanceRef)
  }
  for (const topic of output.topicAssets ?? []) {
    if (topic.relatedQuestionRefs?.includes(question.ref) && topic.provenanceRef) explicitRefs.add(topic.provenanceRef)
  }

  const explicitIds = [...explicitRefs].map((ref) => `shenlun-provenance-${idPrefix}-${ref}`)
  const validExplicitIds = explicitIds.filter((id) => records.provenance.some((item) => item.id === id))
  if (validExplicitIds.length > 0) return validExplicitIds
  return records.provenance[0] ? [records.provenance[0].id] : []
}

function abilityTagsForQuestion(tags: AbilityTag[], questionId: string, type: ShenlunQuestionType): ShenlunAbilityDimension[] {
  const dimensions = tags.filter((tag) => tag.targetId === questionId).map((tag) => tag.dimension)
  if (dimensions.length > 0) return unique(dimensions)
  return [abilityForQuestionType(type)]
}

function topicTagsForQuestion(topicAssets: TopicAsset[], questionId: string, materialIds: string[], output: ShenlunDocumentParserOutput): string[] {
  const tags = topicAssets
    .filter(
      (topic) =>
        topic.relatedQuestionIds?.includes(questionId) ||
        topic.relatedPassageIds?.some((passageId) => materialIds.includes(passageId)) ||
        topic.documentId,
    )
    .flatMap((topic) => [topic.title, ...topic.tags])
  if (tags.length > 0) return uniqueStrings(tags)
  return uniqueStrings(output.passages.flatMap((passage) => passage.tags))
}

function materialPreview(passages: MaterialPassage[], materialIds: string[]): string {
  const text = passages
    .filter((passage) => materialIds.includes(passage.id))
    .map((passage) => passage.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
  return text.slice(0, 220)
}

function confidenceForQuestion(provenance: LearningAssetProvenance[], output: ShenlunDocumentParserOutput): number {
  if (provenance.length === 0) return output.warnings.length > 0 ? 0.65 : 0.75
  return Math.min(...provenance.map((item) => item.confidence))
}

function pageRangeForMaterials(passages: MaterialPassage[], materialIds: string[]): { pageStart?: number; pageEnd?: number } {
  const linked = passages.filter((passage) => materialIds.includes(passage.id))
  const starts = linked.map((passage) => passage.pageStart).filter((page): page is number => typeof page === "number")
  const ends = linked.map((passage) => passage.pageEnd).filter((page): page is number => typeof page === "number")
  return {
    pageStart: starts.length > 0 ? Math.min(...starts) : undefined,
    pageEnd: ends.length > 0 ? Math.max(...ends) : undefined,
  }
}

function difficultyForQuestion(question: ShenlunDocumentParserOutput["questions"][number]): QuestionBankDifficulty {
  if (question.type === "essay" || question.suggestedMinutes >= 40) return "hard"
  if (question.suggestedMinutes <= 20) return "easy"
  return "medium"
}

function practiceCategoryForDocument(documentType: ShenlunDocumentType, reviewState: QuestionBankReviewState): PracticeCategory {
  if (reviewState === "draft") return "draft_review"
  if (documentType === "exam_paper" || documentType === "single_question") return "past_paper"
  if (documentType === "commentary" || documentType === "policy_file" || documentType === "lecture") return "material_to_question"
  if (documentType === "answer_key") return "weakness_drill"
  return "topic_drill"
}

function sourceTypeForDocument(sourceType: ShenlunDocumentParserOutput["document"]["sourceType"]): QuestionBankSourceType {
  if (sourceType === "text") return "text"
  return "document"
}

function inferParserSource(provenance: LearningAssetProvenance[]): string {
  return provenance.find((item) => item.parserSource)?.parserSource ?? "local-deterministic"
}

function abilityForQuestionType(type: ShenlunQuestionType): ShenlunAbilityDimension {
  if (type === "countermeasure") return "countermeasure"
  if (type === "analysis") return "analysis"
  if (type === "implementation") return "implementationFormat"
  if (type === "essay") return "essayIdeation"
  return "summary"
}

function emptyQuestionTypeCounts(): Record<ShenlunQuestionType, number> {
  return {
    summary: 0,
    countermeasure: 0,
    analysis: 0,
    implementation: 0,
    essay: 0,
  }
}

function emptyCategoryCounts(): Record<PracticeCategory, number> {
  return {
    past_paper: 0,
    topic_drill: 0,
    weakness_drill: 0,
    material_to_question: 0,
    expression_transfer: 0,
    draft_review: 0,
  }
}

function normalizeComparableText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "").replace(/[^\p{L}\p{N}]/gu, "")
}

function unique<T extends string>(values: T[]): T[] {
  return Array.from(new Set(values))
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

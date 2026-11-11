import type { ShenlunDocumentParserOutput } from "@/lib/shenlun/parser-output"
import type {
  AbilityTag,
  AssetReviewState,
  LearningAssetProvenance,
  LearningAssetSourceType,
  ShenlunAbilityDimension,
  ShenlunQuestionType,
  TopicAsset,
  TopicAssetCategory,
} from "@/lib/shenlun/types"

type DeriveLearningAssetsInput = {
  idPrefix: string
  documentId: string
  questionIdByRef: Map<string, string>
  passageIdByRef: Map<string, string>
  scoringPointIdByRef: Map<string, string>
  createdAt: string
}

export function reviewStateForDerivedAsset(sourceType: LearningAssetSourceType, scoringRelated: boolean): AssetReviewState {
  return scoringRelated && (sourceType === "ai_generated" || sourceType === "skill_generated") ? "needs_review" : "ready"
}

export function deriveLearningAssetsFromParserOutput(
  output: ShenlunDocumentParserOutput,
  input: DeriveLearningAssetsInput,
): {
  provenance: LearningAssetProvenance[]
  abilityTags: AbilityTag[]
  topicAssets: TopicAsset[]
} {
  const provenance = buildProvenance(output, input)
  const fallbackProvenanceId = provenance[0]?.id
  const provenanceIdByRef = new Map((output.provenance ?? []).map((item) => [item.ref, `shenlun-provenance-${input.idPrefix}-${item.ref}`]))
  const abilityTags = buildAbilityTags(output, input, fallbackProvenanceId, provenanceIdByRef)
  const topicAssets = buildTopicAssets(output, input, fallbackProvenanceId, provenanceIdByRef)
  return { provenance, abilityTags, topicAssets }
}

function buildProvenance(output: ShenlunDocumentParserOutput, input: DeriveLearningAssetsInput): LearningAssetProvenance[] {
  if (output.provenance?.length) {
    return output.provenance.map((item) => ({
      id: `shenlun-provenance-${input.idPrefix}-${item.ref}`,
      sourceDocumentId: input.documentId,
      sourceType: item.sourceType,
      parserSource: item.parserSource,
      pageStart: item.pageStart,
      pageEnd: item.pageEnd,
      textStart: item.textStart,
      textEnd: item.textEnd,
      confidence: item.confidence,
      reviewState: item.reviewState,
      createdAt: input.createdAt,
    }))
  }

  const firstPage = output.passages.map((passage) => passage.pageStart).find((page): page is number => typeof page === "number")
  const lastPage = [...output.passages].reverse().map((passage) => passage.pageEnd).find((page): page is number => typeof page === "number")
  return [
    {
      id: `shenlun-provenance-${input.idPrefix}-document`,
      sourceDocumentId: input.documentId,
      sourceType: "document",
      parserSource: "local-deterministic",
      pageStart: firstPage,
      pageEnd: lastPage,
      confidence: output.warnings.length > 0 ? 0.65 : 0.85,
      reviewState: output.warnings.length > 0 ? "needs_review" : "ready",
      createdAt: input.createdAt,
    },
  ]
}

function buildAbilityTags(
  output: ShenlunDocumentParserOutput,
  input: DeriveLearningAssetsInput,
  fallbackProvenanceId: string | undefined,
  provenanceIdByRef: Map<string, string>,
): AbilityTag[] {
  if (output.abilityTags?.length) {
    return output.abilityTags
      .map((item): AbilityTag | null => {
        const targetId =
          (item.targetRef && (input.questionIdByRef.get(item.targetRef) ?? input.scoringPointIdByRef.get(item.targetRef))) ||
          input.questionIdByRef.get(output.questions[0]?.ref ?? "")
        if (!targetId) return null
        return {
          id: `shenlun-ability-${input.idPrefix}-${item.ref}`,
          targetId,
          targetType: input.scoringPointIdByRef.has(item.targetRef ?? "") ? "scoring_point" : "question",
          dimension: item.dimension,
          label: item.label,
          provenanceId: item.provenanceRef ? provenanceIdByRef.get(item.provenanceRef) : fallbackProvenanceId,
          confidence: item.confidence ?? 0.8,
          createdAt: input.createdAt,
        } satisfies AbilityTag
      })
      .filter((item): item is AbilityTag => item !== null)
  }

  return output.questions.map((question) => ({
    id: `shenlun-ability-${input.idPrefix}-${question.ref}`,
    targetId: input.questionIdByRef.get(question.ref) ?? `shenlun-question-${input.idPrefix}-${question.ref}`,
    targetType: "question",
    dimension: abilityDimensionForQuestionType(question.type),
    label: abilityLabelForQuestionType(question.type),
    provenanceId: fallbackProvenanceId,
    confidence: 0.75,
    createdAt: input.createdAt,
  }))
}

function buildTopicAssets(
  output: ShenlunDocumentParserOutput,
  input: DeriveLearningAssetsInput,
  fallbackProvenanceId: string | undefined,
  provenanceIdByRef: Map<string, string>,
): TopicAsset[] {
  if (output.topicAssets?.length) {
    return output.topicAssets.map((item) => ({
      id: `shenlun-topic-${input.idPrefix}-${item.ref}`,
      documentId: input.documentId,
      title: item.title,
      category: item.category,
      summary: item.summary,
      tags: item.tags,
      provenanceId: provenanceIdByRef.get(item.provenanceRef) ?? fallbackProvenanceId ?? `shenlun-provenance-${input.idPrefix}-document`,
      relatedQuestionIds: item.relatedQuestionRefs?.map((ref) => input.questionIdByRef.get(ref)).filter((id): id is string => Boolean(id)),
      relatedPassageIds: item.relatedPassageRefs?.map((ref) => input.passageIdByRef.get(ref)).filter((id): id is string => Boolean(id)),
      createdAt: input.createdAt,
    }))
  }

  const topics = uniqueStrings(output.passages.flatMap((passage) => passage.tags).filter(Boolean))
  const fallbackTitle = topics[0] ?? inferTopicTitle(output.document.title, output.document.rawText)
  return [
    {
      id: `shenlun-topic-${input.idPrefix}-0`,
      documentId: input.documentId,
      title: fallbackTitle,
      category: inferTopicCategory(output.document.documentType),
      summary: summarizeTopic(output.document.rawText, fallbackTitle),
      tags: topics.length ? topics : [fallbackTitle],
      provenanceId: fallbackProvenanceId ?? `shenlun-provenance-${input.idPrefix}-document`,
      relatedQuestionIds: output.questions.map((question) => input.questionIdByRef.get(question.ref)).filter((id): id is string => Boolean(id)),
      relatedPassageIds: output.passages.map((passage) => input.passageIdByRef.get(passage.ref)).filter((id): id is string => Boolean(id)),
      createdAt: input.createdAt,
    },
  ]
}

export function abilityDimensionForQuestionType(type: ShenlunQuestionType): ShenlunAbilityDimension {
  if (type === "countermeasure") return "countermeasure"
  if (type === "analysis") return "analysis"
  if (type === "implementation") return "implementationFormat"
  if (type === "essay") return "essayIdeation"
  return "summary"
}

function abilityLabelForQuestionType(type: ShenlunQuestionType): string {
  const labels: Record<ShenlunQuestionType, string> = {
    summary: "概括归纳",
    countermeasure: "对策提出",
    analysis: "综合分析",
    implementation: "贯彻执行",
    essay: "文章写作",
  }
  return labels[type]
}

function inferTopicCategory(documentType: string): TopicAssetCategory {
  if (documentType === "commentary" || documentType === "policy_file") return "policy_theme"
  if (documentType === "answer_key") return "countermeasure"
  return "policy_theme"
}

function inferTopicTitle(title: string, rawText: string): string {
  const candidates = ["数字乡村", "基层治理", "新质生产力", "乡村振兴", "营商环境", "公共服务"]
  return candidates.find((candidate) => title.includes(candidate) || rawText.includes(candidate)) ?? (title.slice(0, 12) || "申论素材")
}

function summarizeTopic(rawText: string, title: string): string {
  const compact = rawText.replace(/\s+/g, "")
  return compact.length > 0 ? compact.slice(0, 120) : `${title}相关申论素材`
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

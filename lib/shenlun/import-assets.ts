import type { ShenlunDocumentParserOutput } from "@/lib/shenlun/parser-output"
import { deriveLearningAssetsFromParserOutput } from "@/lib/shenlun/learning-assets"
import { buildQuestionBankRecordsFromParsedOutput } from "@/lib/shenlun/question-bank"
import { shenlunRepository } from "@/lib/shenlun/repositories"
import type {
  AbilityTag,
  AnswerKey,
  ExamPaper,
  LearningAssetProvenance,
  MaterialPassage,
  QuestionBankImportBatch,
  QuestionBankItem,
  ScoringPoint,
  ShenlunDocument,
  TopicAsset,
  TrainingQuestion,
} from "@/lib/shenlun/types"

export async function saveParsedShenlunDocumentOutput(
  output: ShenlunDocumentParserOutput,
  options: { idPrefix: string; createdAt: string },
) {
  const records = buildParsedShenlunAssetRecords(output, options)

  await shenlunRepository.saveDocument(records.document)
  for (const passage of records.passages) await shenlunRepository.savePassage(passage)
  for (const question of records.questions) await shenlunRepository.saveQuestion(question)
  for (const answerKey of records.answerKeys) await shenlunRepository.saveAnswerKey(answerKey)
  for (const scoringPoint of records.scoringPoints) await shenlunRepository.saveScoringPoint(scoringPoint)
  for (const paper of records.examPapers) await shenlunRepository.saveExamPaper(paper)
  for (const provenance of records.provenance) await shenlunRepository.saveLearningProvenance(provenance)
  for (const tag of records.abilityTags) await shenlunRepository.saveAbilityTag(tag)
  for (const topic of records.topicAssets) await shenlunRepository.saveTopicAsset(topic)
  for (const item of records.questionBankItems) await shenlunRepository.saveQuestionBankItem(item)
  await shenlunRepository.saveQuestionBankImportBatch(records.questionBankImportBatch)

  return records
}

export function buildParsedShenlunAssetRecords(
  output: ShenlunDocumentParserOutput,
  { idPrefix, createdAt }: { idPrefix: string; createdAt: string },
): {
  document: ShenlunDocument
  examPapers: ExamPaper[]
  passages: MaterialPassage[]
  questions: TrainingQuestion[]
  answerKeys: AnswerKey[]
  scoringPoints: ScoringPoint[]
  provenance: LearningAssetProvenance[]
  abilityTags: AbilityTag[]
  topicAssets: TopicAsset[]
  questionBankItems: QuestionBankItem[]
  questionBankImportBatch: QuestionBankImportBatch
} {
  const documentId = `shenlun-doc-${idPrefix}`
  const passageIdByRef = new Map(output.passages.map((passage) => [passage.ref, `shenlun-passage-${idPrefix}-${passage.ref}`]))
  const questionIdByRef = new Map(output.questions.map((question) => [question.ref, `shenlun-question-${idPrefix}-${question.ref}`]))
  const scoringPointIdByRef = new Map(output.scoringPoints.map((point) => [point.ref, `shenlun-point-${idPrefix}-${point.ref}`]))

  const passages: MaterialPassage[] = output.passages.map((passage) => ({
    id: passageIdByRef.get(passage.ref)!,
    documentId,
    order: passage.order,
    title: passage.title,
    text: passage.text,
    pageStart: passage.pageStart,
    pageEnd: passage.pageEnd,
    tags: passage.tags,
  }))
  const scoringPoints: ScoringPoint[] = output.scoringPoints.map((point) => ({
    id: scoringPointIdByRef.get(point.ref)!,
    questionId: questionIdByRef.get(point.questionRef) ?? `shenlun-question-${idPrefix}-${point.questionRef}`,
    text: point.text,
    weight: point.weight,
    aliases: point.aliases,
  }))
  const answerKeys: AnswerKey[] = output.answerKeys.map((answerKey, index) => ({
    id: `shenlun-answer-${idPrefix}-${answerKey.ref ?? index}`,
    questionId: questionIdByRef.get(answerKey.questionRef) ?? `shenlun-question-${idPrefix}-${answerKey.questionRef}`,
    answerText: answerKey.answerText,
    source: answerKey.source,
    createdAt,
  }))
  const answerKeyIdByQuestionId = new Map(answerKeys.map((answerKey) => [answerKey.questionId, answerKey.id]))
  const questions: TrainingQuestion[] = output.questions.map((question) => {
    const questionId = questionIdByRef.get(question.ref)!
    return {
      id: questionId,
      documentId,
      paperId: output.examPapers[0] ? `shenlun-paper-${idPrefix}-0` : undefined,
      materialIds: question.materialRefs.map((ref) => passageIdByRef.get(ref)).filter((id): id is string => Boolean(id)),
      type: question.type,
      title: question.title,
      prompt: question.prompt,
      wordLimit: question.wordLimit,
      suggestedMinutes: question.suggestedMinutes,
      answerKeyId: answerKeyIdByQuestionId.get(questionId),
      scoringPointIds: question.scoringPointRefs.map((ref) => scoringPointIdByRef.get(ref)).filter((id): id is string => Boolean(id)),
      createdAt,
    }
  })
  const examPapers: ExamPaper[] = output.examPapers.map((paper, index) => ({
    id: `shenlun-paper-${idPrefix}-${index}`,
    documentId,
    title: paper.title,
    year: paper.year,
    province: paper.province,
    examName: paper.examName,
    totalMinutes: paper.totalMinutes,
    materialIds: paper.materialRefs.map((ref) => passageIdByRef.get(ref)).filter((id): id is string => Boolean(id)),
    questionIds: paper.questionRefs.map((ref) => questionIdByRef.get(ref)).filter((id): id is string => Boolean(id)),
    createdAt,
  }))
  const learningAssets = deriveLearningAssetsFromParserOutput(output, {
    idPrefix,
    documentId,
    questionIdByRef,
    passageIdByRef,
    scoringPointIdByRef,
    createdAt,
  })
  const questionBank = buildQuestionBankRecordsFromParsedOutput(
    output,
    {
      document: {
        id: documentId,
        title: output.document.title,
        documentType: output.document.documentType,
        sourceType: output.document.sourceType,
        originalName: output.document.originalName,
        rawText: output.document.rawText,
        createdAt,
        parseStatus: output.warnings.length > 0 ? "needs_review" : "parsed",
        parseError: output.warnings.length > 0 ? output.warnings.join("\n") : undefined,
      },
      examPapers,
      passages,
      questions,
      answerKeys,
      scoringPoints,
      provenance: learningAssets.provenance,
      abilityTags: learningAssets.abilityTags,
      topicAssets: learningAssets.topicAssets,
    },
    {
      idPrefix,
      createdAt,
    },
  )

  return {
    document: {
      id: documentId,
      title: output.document.title,
      documentType: output.document.documentType,
      sourceType: output.document.sourceType,
      originalName: output.document.originalName,
      rawText: output.document.rawText,
      createdAt,
      parseStatus: output.warnings.length > 0 ? "needs_review" : "parsed",
      parseError: output.warnings.length > 0 ? output.warnings.join("\n") : undefined,
    },
    examPapers,
    passages,
    questions,
    answerKeys,
    scoringPoints,
    provenance: learningAssets.provenance,
    abilityTags: learningAssets.abilityTags,
    topicAssets: learningAssets.topicAssets,
    questionBankItems: questionBank.items,
    questionBankImportBatch: questionBank.batch,
  }
}

export type ShenlunDocumentType =
  | "exam_paper"
  | "single_question"
  | "answer_key"
  | "policy_file"
  | "commentary"
  | "lecture"
  | "personal_note"

export type ShenlunQuestionType = "summary" | "countermeasure" | "analysis" | "implementation" | "essay"

export type ShenlunAbilityDimension =
  | "readingExtraction"
  | "summary"
  | "analysis"
  | "countermeasure"
  | "implementationFormat"
  | "essayIdeation"
  | "formalExpression"
  | "timeControl"

export type LearningAssetSourceType = "document" | "user" | "ai_generated" | "skill_generated"

export type AssetReviewState = "ready" | "needs_review" | "corrected" | "ignored"

export type TopicAssetCategory = "policy_theme" | "governance_case" | "problem" | "countermeasure" | "quote" | "expression"

export type LearningTaskType =
  | "reading_extraction"
  | "scoring_recall"
  | "single_question_writing"
  | "expression_rewrite"
  | "timed_practice"
  | "review_mistakes"
  | "import_more_assets"

export type QuestionBankSourceType = "document" | "web" | "text" | "skill_generated" | "manual" | "ai_generated"

export type PracticeCategory =
  | "past_paper"
  | "topic_drill"
  | "weakness_drill"
  | "material_to_question"
  | "expression_transfer"
  | "draft_review"

export type QuestionBankReviewState = "draft" | "needs_review" | "ready" | "ignored" | "archived"

export type QuestionBankDifficulty = "easy" | "medium" | "hard"

export type QuestionBankAnswerSource = "document" | "manual" | "ai_generated" | "skill_generated" | "missing"

export type QuestionBankRubricPoint = {
  id: string
  text: string
  weight: number
  keywords: string[]
}

export type QuestionBankRubric = {
  answerSource: QuestionBankAnswerSource
  answerText?: string
  points: QuestionBankRubricPoint[]
  trusted: boolean
}

export type QuestionBankItem = {
  id: string
  sourceId: string
  sourceTitle: string
  sourceType: QuestionBankSourceType
  sourceDocumentId?: string
  trainingQuestionId?: string
  materialIds: string[]
  answerKeyId?: string
  scoringPointIds: string[]
  practiceCategory: PracticeCategory
  type: ShenlunQuestionType
  title: string
  prompt: string
  materialPreview: string
  standardAnswer?: string
  rubric: QuestionBankRubric
  abilityTags: ShenlunAbilityDimension[]
  topicTags: string[]
  difficulty: QuestionBankDifficulty
  estimatedMinutes: number
  wordLimit?: number
  reviewState: QuestionBankReviewState
  provenanceIds: string[]
  pageStart?: number
  pageEnd?: number
  confidence: number
  warnings: string[]
  createdAt: string
  updatedAt: string
}

export type QuestionBankImportBatch = {
  id: string
  sourceId: string
  sourceTitle: string
  sourceType: QuestionBankSourceType
  parserSource: string
  createdAt: string
  itemIds: string[]
  readyCount: number
  needsReviewCount: number
  ignoredDuplicateCount: number
  questionCount: number
  passageCount: number
  rubricCount: number
  warnings: string[]
  status: "draft" | "ready" | "needs_review" | "failed"
}

export type UserLearningStage = "beginner" | "improving" | "sprint"

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

export type ExpressionAsset = {
  id: string
  documentId: string
  sourceText: string
  expression: string
  scenario: "countermeasure" | "analysis" | "essay" | "opening" | "closing"
  tags: string[]
  createdAt: string
}

export type ExpressionExercise = {
  id: string
  assetId: string
  prompt: string
  userRewrite?: string
  diagnosisId?: string
  createdAt: string
}

export type ExamSummary = {
  sessionId: string
  totalQuestions: number
  answeredQuestions: number
  averageScore: number
  scoringPointHitRatio: number
  issueTags: Array<{
    tag: ShenlunIssueTag
    count: number
  }>
  questionTypeBreakdown: Record<ShenlunQuestionType, { count: number; averageScore: number }>
}

export type CalibrationReport = {
  id: string
  createdAt: string
  periodStart: string
  periodEnd: string
  trainingCount: number
  averageScore: number
  questionTypeBreakdown: Record<ShenlunQuestionType, { count: number; averageScore: number }>
  topIssueTags: Array<{
    tag: ShenlunIssueTag
    count: number
    ratio: number
  }>
  timeControl: {
    totalStageCount: number
    exceededStageCount: number
    exceededRatio: number
  }
  trainingPlan: string[]
}

export type LearningAssetProvenance = {
  id: string
  sourceDocumentId: string
  sourceType: LearningAssetSourceType
  parserSource?: string
  pageStart?: number
  pageEnd?: number
  textStart?: number
  textEnd?: number
  confidence: number
  reviewState: AssetReviewState
  createdAt: string
}

export type AbilityTag = {
  id: string
  targetId: string
  targetType: "question" | "scoring_point" | "topic" | "diagnosis"
  dimension: ShenlunAbilityDimension
  label: string
  provenanceId?: string
  confidence: number
  createdAt: string
}

export type TopicAsset = {
  id: string
  documentId: string
  title: string
  category: TopicAssetCategory
  summary: string
  tags: string[]
  provenanceId: string
  relatedQuestionIds?: string[]
  relatedPassageIds?: string[]
  createdAt: string
}

export type UserLearningProfile = {
  id: string
  targetExam: string
  stage: UserLearningStage
  dailyAvailableMinutes: number
  weeklyAvailableDays: number
  abilityScores: Record<ShenlunAbilityDimension, number>
  topicCoverage: Record<string, number>
  questionTypePerformance: Record<ShenlunQuestionType, { count: number; averageScore: number }>
  issueTagCounts: Partial<Record<ShenlunIssueTag, number>>
  recentSessionIds: string[]
  updatedAt: string
}

export type LearningTask = {
  id: string
  taskType: LearningTaskType
  title: string
  description: string
  estimatedMinutes: number
  abilityTagIds: string[]
  topicAssetIds?: string[]
  questionIds?: string[]
  questionBankItemIds?: string[]
  diagnosisIds?: string[]
  priority: "high" | "medium" | "low"
  rationale: string
  status: "pending" | "running" | "completed" | "skipped"
  createdAt: string
}

export type LearningPlan = {
  id: string
  profileId: string
  scope: "daily" | "weekly"
  title: string
  generatedAt: string
  totalEstimatedMinutes: number
  taskIds: string[]
  rationale: string
  assetGapWarnings: string[]
}

export const SHENLUN_DOCUMENT_TYPE_LABELS: Record<ShenlunDocumentType, string> = {
  exam_paper: "真题套卷",
  single_question: "单题材料",
  answer_key: "参考答案 / 评分标准",
  policy_file: "政策文件",
  commentary: "评论文章",
  lecture: "讲义资料",
  personal_note: "个人笔记",
}

export const SHENLUN_QUESTION_TYPE_LABELS: Record<ShenlunQuestionType, string> = {
  summary: "概括题",
  countermeasure: "对策题",
  analysis: "综合分析",
  implementation: "应用文",
  essay: "大作文",
}

export const SHENLUN_ISSUE_TAG_LABELS: Record<ShenlunIssueTag, string> = {
  missing_points: "要点遗漏",
  wrong_material_location: "定位偏差",
  inaccurate_summary: "概括不准",
  empty_countermeasure: "对策空泛",
  weak_structure: "结构松散",
  colloquial_expression: "表达口语化",
  word_count_failed: "字数失控",
  wrong_question_type: "题型判断错误",
  time_allocation_failed: "时间分配失控",
}

export const TRAINING_STAGE_LABELS: Record<TrainingStage, string> = {
  reading: "读材料",
  marking: "标注",
  outline: "列提纲",
  writing: "作答",
  review: "自查",
}

export const TRAINING_STAGE_LIMIT_SECONDS: Record<TrainingStage, number> = {
  reading: 480,
  marking: 240,
  outline: 240,
  writing: 420,
  review: 120,
}

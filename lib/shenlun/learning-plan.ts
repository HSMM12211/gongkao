import { buildDefaultLearningProfile } from "@/lib/shenlun/learning-profile"
import { selectReadyQuestionBankItems } from "@/lib/shenlun/question-bank"
import type {
  LearningPlan,
  LearningTask,
  QuestionBankItem,
  ShenlunAbilityDimension,
  ShenlunDiagnosis,
  TopicAsset,
  TrainingQuestion,
  TrainingSession,
  UserLearningProfile,
} from "@/lib/shenlun/types"

type GeneratePlanInput = {
  profile?: UserLearningProfile
  questions: TrainingQuestion[]
  questionBankItems?: QuestionBankItem[]
  topicAssets: TopicAsset[]
  diagnoses: ShenlunDiagnosis[]
  sessions: TrainingSession[]
  now: string
}

type GeneratePlanResult = {
  plan: LearningPlan
  tasks: LearningTask[]
  warnings: string[]
}

export function generateDailyLearningPlan(input: GeneratePlanInput): GeneratePlanResult {
  const profile = input.profile ?? buildDefaultLearningProfile(input.now)
  const readyBankItems = selectReadyQuestionBankItems(input.questionBankItems ?? [])
  if (input.questions.length === 0 && readyBankItems.length === 0 && input.topicAssets.length === 0) {
    const task = buildImportTask(profile, input.now)
    return {
      tasks: [task],
      warnings: ["请先导入历年真题、答案解析或政策评论材料。"],
      plan: buildPlan({
        profile,
        scope: "daily",
        title: "今日申论学习计划",
        tasks: [task],
        now: input.now,
        rationale: "当前素材库为空，优先补齐可训练材料。",
        warnings: ["素材不足，无法生成训练型任务。"],
      }),
    }
  }

  const weakest = weakestAbility(profile)
  const selectedBankItem = selectQuestionBankItemForAbility(readyBankItems, weakest)
  const selectedQuestion = selectedBankItem ? questionFromBankItem(selectedBankItem) : selectQuestionForAbility(input.questions, weakest)
  const selectedTopic = input.topicAssets[0]
  const diagnosisIds = input.diagnoses.slice(0, 3).map((diagnosis) => diagnosis.id)
  const estimatedMinutes = Math.max(10, Math.min(profile.dailyAvailableMinutes, selectedQuestion?.suggestedMinutes ?? 20))
  const task: LearningTask = {
    id: `learning-task-${input.now}-0`,
    taskType: selectedQuestion ? "single_question_writing" : "reading_extraction",
    title: selectedQuestion ? selectedQuestion.title : `${selectedTopic?.title ?? "申论素材"}阅读提炼`,
    description: selectedQuestion ? selectedQuestion.prompt : `阅读并提炼${selectedTopic?.title ?? "当前素材"}的问题、原因和对策。`,
    estimatedMinutes,
    abilityTagIds: [weakest],
    topicAssetIds: selectedTopic ? [selectedTopic.id] : [],
    questionIds: selectedQuestion ? [selectedQuestion.id] : [],
    questionBankItemIds: selectedBankItem ? [selectedBankItem.id] : [],
    diagnosisIds,
    priority: profile.abilityScores[weakest] < 45 ? "high" : "medium",
    rationale: selectedBankItem ? buildBankTaskRationale(weakest, selectedBankItem, selectedTopic) : buildTaskRationale(weakest, selectedQuestion, selectedTopic),
    status: "pending",
    createdAt: input.now,
  }

  return {
    tasks: [task],
    warnings: selectedQuestion?.scoringPointIds.length ? [] : ["当前任务缺少完整评分点，完成后建议人工复核。"],
    plan: buildPlan({
      profile,
      scope: "daily",
      title: "今日申论学习计划",
      tasks: [task],
      now: input.now,
      rationale: `优先补齐${abilityLabel(weakest)}短板，并控制在今日可用时间内。`,
      warnings: selectedQuestion?.scoringPointIds.length ? [] : ["评分标准不足。"],
    }),
  }
}

export function generateWeeklyLearningPlan(input: GeneratePlanInput): GeneratePlanResult {
  const profile = input.profile ?? buildDefaultLearningProfile(input.now)
  const daily = generateDailyLearningPlan(input)
  const days = Math.max(1, Math.min(7, profile.weeklyAvailableDays))
  const tasks = Array.from({ length: days }, (_, index) => ({
    ...daily.tasks[0],
    id: `learning-task-${input.now}-week-${index + 1}`,
    title: `第 ${index + 1} 天：${daily.tasks[0].title}`,
  }))
  return {
    tasks,
    warnings: daily.warnings,
    plan: buildPlan({
      profile,
      scope: "weekly",
      title: "本周申论学习计划",
      tasks,
      now: input.now,
      rationale: "按周拆分为基础、巩固、限时训练和复盘任务，优先处理当前能力短板。",
      warnings: daily.warnings,
    }),
  }
}

function buildImportTask(profile: UserLearningProfile, now: string): LearningTask {
  return {
    id: `learning-task-${now}-import`,
    taskType: "import_more_assets",
    title: "导入申论训练材料",
    description: "导入历年真题、参考答案、评分要点或政策评论，先建立可训练素材库。",
    estimatedMinutes: Math.min(profile.dailyAvailableMinutes, 15),
    abilityTagIds: [],
    priority: "high",
    rationale: "没有可用学习资产时，先补齐素材比直接训练更有效。",
    status: "pending",
    createdAt: now,
  }
}

function buildPlan({
  profile,
  scope,
  title,
  tasks,
  now,
  rationale,
  warnings,
}: {
  profile: UserLearningProfile
  scope: "daily" | "weekly"
  title: string
  tasks: LearningTask[]
  now: string
  rationale: string
  warnings: string[]
}): LearningPlan {
  return {
    id: `learning-plan-${scope}-${now}`,
    profileId: profile.id,
    scope,
    title,
    generatedAt: now,
    totalEstimatedMinutes: tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0),
    taskIds: tasks.map((task) => task.id),
    rationale,
    assetGapWarnings: warnings,
  }
}

function weakestAbility(profile: UserLearningProfile): ShenlunAbilityDimension {
  return Object.entries(profile.abilityScores).sort((a, b) => a[1] - b[1])[0]?.[0] as ShenlunAbilityDimension
}

function selectQuestionForAbility(questions: TrainingQuestion[], ability: ShenlunAbilityDimension): TrainingQuestion | undefined {
  const preferredType =
    ability === "countermeasure"
      ? "countermeasure"
      : ability === "analysis"
        ? "analysis"
        : ability === "implementationFormat"
          ? "implementation"
          : ability === "essayIdeation"
            ? "essay"
            : "summary"
  return questions.find((question) => question.type === preferredType) ?? questions[0]
}

function selectQuestionBankItemForAbility(items: QuestionBankItem[], ability: ShenlunAbilityDimension): QuestionBankItem | undefined {
  return items.find((item) => item.abilityTags.includes(ability)) ?? items[0]
}

function questionFromBankItem(item: QuestionBankItem): TrainingQuestion {
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

function buildBankTaskRationale(ability: ShenlunAbilityDimension, item: QuestionBankItem, topic: TopicAsset | undefined): string {
  const topicText = topic ? `; topic: ${topic.title}` : ""
  return `Selected from the standard question bank because ${abilityLabel(ability)} needs priority practice; source: ${item.sourceTitle}${topicText}.`
}

function buildTaskRationale(ability: ShenlunAbilityDimension, question: TrainingQuestion | undefined, topic: TopicAsset | undefined): string {
  const abilityText = abilityLabel(ability)
  const topicText = topic ? `，素材主题为“${topic.title}”` : ""
  if (question) return `当前${abilityText}需要优先训练，选择${question.type === "countermeasure" ? "对策" : "对应题型"}任务${topicText}。`
  return `当前${abilityText}需要优先训练，先从主题材料中提炼问题和对策${topicText}。`
}

function abilityLabel(ability: ShenlunAbilityDimension): string {
  const labels: Record<ShenlunAbilityDimension, string> = {
    readingExtraction: "材料提炼",
    summary: "概括归纳",
    analysis: "综合分析",
    countermeasure: "对策提出",
    implementationFormat: "贯彻执行",
    essayIdeation: "文章立意",
    formalExpression: "规范表达",
    timeControl: "时间控制",
  }
  return labels[ability]
}

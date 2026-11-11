"use client"

import { useEffect, useMemo, useState } from "react"
import type { LucideIcon } from "lucide-react"
import {
  AlertCircle,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Clock3,
  FileText,
  Highlighter,
  Layers3,
  PenLine,
  RotateCcw,
  Send,
  Target,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { InlineDictationTextarea } from "@/components/speech/inline-dictation-textarea"
import { appendDictationText } from "@/lib/speech/inline-dictation"
import { buildCalibrationSnapshot } from "@/lib/shenlun/calibration"
import { buildCalibrationReport } from "@/lib/shenlun/calibration-report"
import { countChineseAwareChars, createDeterministicDiagnosis } from "@/lib/shenlun/diagnosis"
import { buildExamSummary, startExamSession, submitExamSessionAnswers } from "@/lib/shenlun/exam-mode"
import { createExpressionExercise, evaluateExpressionRewrite, extractExpressionAssets } from "@/lib/shenlun/expression"
import { buildDefaultLearningProfile, recalibrateLearningProfile } from "@/lib/shenlun/learning-profile"
import { generateDailyLearningPlan } from "@/lib/shenlun/learning-plan"
import { summarizeQuestionBankItems } from "@/lib/shenlun/question-bank"
import { shenlunRepository } from "@/lib/shenlun/repositories"
import { startTimedSingleSession, submitTrainingSession, transitionStage } from "@/lib/shenlun/session"
import {
  SHENLUN_ISSUE_TAG_LABELS,
  SHENLUN_QUESTION_TYPE_LABELS,
  TRAINING_STAGE_LABELS,
  TRAINING_STAGE_LIMIT_SECONDS,
  type CalibrationReport,
  type CalibrationSnapshot,
  type ExamPaper,
  type ExamSummary,
  type ExpressionAsset,
  type ExpressionExercise,
  type LearningPlan,
  type LearningTask,
  type MaterialPassage,
  type QuestionBankItem,
  type QuestionBankReviewState,
  type ScoringPoint,
  type ShenlunDiagnosis,
  type ShenlunDocument,
  type TopicAsset,
  type TrainingAnswer,
  type TrainingQuestion,
  type TrainingSession,
  type TrainingStage,
  type UserLearningProfile,
} from "@/lib/shenlun/types"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type TrainingTab = "today" | "time" | "diagnosis" | "expression" | "exam" | "calibration"

const STAGES: TrainingStage[] = ["reading", "marking", "outline", "writing", "review"]

export default function PracticePage() {
  const [activeTab, setActiveTab] = useState<TrainingTab>("today")
  const [documents, setDocuments] = useState<ShenlunDocument[]>([])
  const [papers, setPapers] = useState<ExamPaper[]>([])
  const [questions, setQuestions] = useState<TrainingQuestion[]>([])
  const [passages, setPassages] = useState<MaterialPassage[]>([])
  const [scoringPoints, setScoringPoints] = useState<ScoringPoint[]>([])
  const [sessions, setSessions] = useState<TrainingSession[]>([])
  const [diagnoses, setDiagnoses] = useState<ShenlunDiagnosis[]>([])
  const [snapshots, setSnapshots] = useState<CalibrationSnapshot[]>([])
  const [reports, setReports] = useState<CalibrationReport[]>([])
  const [expressionAssets, setExpressionAssets] = useState<ExpressionAsset[]>([])
  const [expressionExercises, setExpressionExercises] = useState<ExpressionExercise[]>([])
  const [topicAssets, setTopicAssets] = useState<TopicAsset[]>([])
  const [questionBankItems, setQuestionBankItems] = useState<QuestionBankItem[]>([])
  const [learningProfile, setLearningProfile] = useState<UserLearningProfile | null>(null)
  const [learningPlan, setLearningPlan] = useState<LearningPlan | null>(null)
  const [learningTasks, setLearningTasks] = useState<LearningTask[]>([])
  const [activeQuestionId, setActiveQuestionId] = useState("")
  const [currentSession, setCurrentSession] = useState<TrainingSession | null>(null)
  const [answer, setAnswer] = useState("")
  const [latestDiagnosis, setLatestDiagnosis] = useState<ShenlunDiagnosis | null>(null)
  const [selectedPaperId, setSelectedPaperId] = useState("")
  const [examSession, setExamSession] = useState<TrainingSession | null>(null)
  const [examAnswers, setExamAnswers] = useState<Record<string, string>>({})
  const [examSummary, setExamSummary] = useState<ExamSummary | null>(null)
  const [activeExpressionAssetId, setActiveExpressionAssetId] = useState("")
  const [expressionExercise, setExpressionExercise] = useState<ExpressionExercise | null>(null)
  const [expressionAnswer, setExpressionAnswer] = useState("")
  const [tick, setTick] = useState(Date.now())

  useEffect(() => {
    void refreshTrainingData()
  }, [])

  useEffect(() => {
    if (!currentSession || currentSession.status !== "running") return
    const timer = window.setInterval(() => setTick(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [currentSession])

  const refreshTrainingData = async () => {
    try {
      const [
        nextDocuments,
        nextPapers,
        nextQuestions,
        nextPassages,
        nextPoints,
        nextSessions,
        nextDiagnoses,
        nextSnapshots,
        nextExpressionAssets,
        nextExpressionExercises,
        nextReports,
        nextTopicAssets,
        nextQuestionBankItems,
        nextProfiles,
        nextLearningPlans,
        nextLearningTasks,
      ] = await Promise.all([
        shenlunRepository.getDocuments(),
        shenlunRepository.getExamPapers(),
        shenlunRepository.getQuestions(),
        shenlunRepository.getPassages(),
        shenlunRepository.getScoringPoints(),
        shenlunRepository.getSessions(),
        shenlunRepository.getDiagnoses(),
        shenlunRepository.getCalibrationSnapshots(),
        shenlunRepository.getExpressionAssets(),
        shenlunRepository.getExpressionExercises(),
        shenlunRepository.getCalibrationReports(),
        shenlunRepository.getTopicAssets(),
        shenlunRepository.getQuestionBankItems(),
        shenlunRepository.getLearningProfiles(),
        shenlunRepository.getLearningPlans(),
        shenlunRepository.getLearningTasks(),
      ])
      const sortedQuestions = nextQuestions.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      const sortedPapers = nextPapers.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      const sortedQuestionBankItems = nextQuestionBankItems.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      setDocuments(nextDocuments.sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
      setPapers(sortedPapers)
      setQuestions(sortedQuestions)
      setPassages(nextPassages)
      setScoringPoints(nextPoints)
      setSessions(nextSessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt)))
      setDiagnoses(nextDiagnoses.sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
      setSnapshots(nextSnapshots.sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
      setExpressionAssets(nextExpressionAssets.sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
      setExpressionExercises(nextExpressionExercises.sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
      setReports(nextReports.sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
      setTopicAssets(nextTopicAssets.sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
      setQuestionBankItems(sortedQuestionBankItems)
      const profile = nextProfiles[0] ?? buildDefaultLearningProfile(new Date().toISOString())
      setLearningProfile(profile)
      const sortedPlans = nextLearningPlans.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
      setLearningPlan(sortedPlans[0] ?? null)
      setLearningTasks(nextLearningTasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
      const firstReadyBankQuestionId = sortedQuestionBankItems.find((item) => item.reviewState === "ready" && item.trainingQuestionId)?.trainingQuestionId
      setActiveQuestionId((current) => current || firstReadyBankQuestionId || sortedQuestions[0]?.id || "")
      setSelectedPaperId((current) => current || sortedPapers[0]?.id || "")
      setActiveExpressionAssetId((current) => current || nextExpressionAssets[0]?.id || "")
    } catch (error) {
      console.error(error)
      toast.error("读取申论训练资产失败")
    }
  }

  const activeQuestion = useMemo(
    () => questions.find((question) => question.id === activeQuestionId) ?? questions[0],
    [activeQuestionId, questions],
  )
  const activePassages = useMemo(() => {
    if (!activeQuestion) return []
    return passages
      .filter((passage) => activeQuestion.materialIds.includes(passage.id))
      .sort((a, b) => a.order - b.order)
  }, [activeQuestion, passages])
  const activeScoringPoints = useMemo(() => {
    if (!activeQuestion) return []
    return scoringPoints.filter((point) => activeQuestion.scoringPointIds.includes(point.id))
  }, [activeQuestion, scoringPoints])
  const selectedPaper = useMemo(() => papers.find((paper) => paper.id === selectedPaperId) ?? papers[0], [papers, selectedPaperId])
  const selectedPaperQuestions = useMemo(() => {
    if (!selectedPaper) return []
    return selectedPaper.questionIds.map((id) => questions.find((question) => question.id === id)).filter((question): question is TrainingQuestion => Boolean(question))
  }, [questions, selectedPaper])
  const activeExpressionAsset = useMemo(
    () => expressionAssets.find((asset) => asset.id === activeExpressionAssetId) ?? expressionAssets[0],
    [activeExpressionAssetId, expressionAssets],
  )
  const currentStage = currentSession?.stageTimings[currentSession.stageTimings.length - 1]?.stage ?? "reading"
  const currentStageStartedAt = currentSession?.stageTimings[currentSession.stageTimings.length - 1]?.startedAt
  const currentStageElapsed = currentStageStartedAt ? Math.max(0, Math.round((tick - Date.parse(currentStageStartedAt)) / 1000)) : 0
  const currentStageLimit = TRAINING_STAGE_LIMIT_SECONDS[currentStage]
  const latestSnapshot = snapshots[0]
  const latestReport = reports[0]
  const today = new Date().toISOString().slice(0, 10)
  const todaySessions = sessions.filter((session) => session.startedAt.slice(0, 10) === today)
  const questionBankSummary = useMemo(() => summarizeQuestionBankItems(questionBankItems), [questionBankItems])
  const visibleLearningPlan = useMemo(() => {
    if (learningPlan && learningTasks.length > 0) return { plan: learningPlan, tasks: learningTasks.filter((task) => learningPlan.taskIds.includes(task.id)) }
    const generated = generateDailyLearningPlan({
      profile: learningProfile ?? buildDefaultLearningProfile(new Date().toISOString()),
      questions,
      questionBankItems,
      topicAssets,
      diagnoses,
      sessions,
      now: new Date().toISOString(),
    })
    return { plan: generated.plan, tasks: generated.tasks }
  }, [diagnoses, learningPlan, learningProfile, learningTasks, questionBankItems, questions, sessions, topicAssets])

  const startQuestion = async (questionId: string) => {
    const question = questions.find((item) => item.id === questionId)
    if (!question) return
    const now = new Date().toISOString()
    const session = startTimedSingleSession({
      questionId,
      totalLimitSeconds: question.suggestedMinutes * 60,
      now,
    })
    await shenlunRepository.saveSession(session)
    setActiveQuestionId(questionId)
    setCurrentSession(session)
    setAnswer("")
    setLatestDiagnosis(null)
    setActiveTab("time")
    setTick(Date.now())
    toast.success("已开始单题时间感训练")
  }

  const switchStage = async (nextStage: TrainingStage) => {
    if (!currentSession || currentSession.status !== "running") return
    if (currentStage === nextStage) return
    const now = new Date().toISOString()
    const nextSession = transitionStage(currentSession, {
      nextStage,
      now,
      stageLimitSeconds: TRAINING_STAGE_LIMIT_SECONDS[currentStage],
    })
    await shenlunRepository.saveSession(nextSession)
    setCurrentSession(nextSession)
    setTick(Date.now())
  }

  const submitAnswer = async () => {
    if (!activeQuestion) return
    if (!answer.trim()) {
      toast.error("请先完成作答")
      return
    }
    const now = new Date().toISOString()
    const baseSession =
      currentSession ??
      startTimedSingleSession({
        questionId: activeQuestion.id,
        totalLimitSeconds: activeQuestion.suggestedMinutes * 60,
        now,
      })
    const submittedSession = finalizeSessionWithStageLimit(submitTrainingSession(baseSession, now))
    const diagnosis = createDeterministicDiagnosis({
      session: submittedSession,
      question: activeQuestion,
      answerText: answer,
      scoringPoints: activeScoringPoints,
      now,
    })
    const diagnosedSession: TrainingSession = { ...submittedSession, status: "diagnosed" }
    const trainingAnswer: TrainingAnswer = {
      id: crypto.randomUUID(),
      sessionId: diagnosedSession.id,
      questionId: activeQuestion.id,
      answerText: answer,
      wordCount: countChineseAwareChars(answer),
      submittedAt: now,
    }

    await shenlunRepository.saveAnswer(trainingAnswer)
    await shenlunRepository.saveSession(diagnosedSession)
    await shenlunRepository.saveDiagnosis(diagnosis)
    await persistCalibrationArtifacts({
      nextSessions: [diagnosedSession, ...sessions.filter((item) => item.id !== diagnosedSession.id)],
      nextDiagnoses: [diagnosis, ...diagnoses.filter((item) => item.id !== diagnosis.id)],
      now,
    })

    setCurrentSession(diagnosedSession)
    setLatestDiagnosis(diagnosis)
    setDiagnoses((current) => [diagnosis, ...current.filter((item) => item.id !== diagnosis.id)])
    setSessions((current) => [diagnosedSession, ...current.filter((item) => item.id !== diagnosedSession.id)])
    setActiveTab("diagnosis")
    toast.success("已生成本地结构化诊断")
  }

  const startSelectedExam = async () => {
    if (!selectedPaper) return
    const now = new Date().toISOString()
    const session = startExamSession({ paper: selectedPaper, now })
    await shenlunRepository.saveSession(session)
    setExamSession(session)
    setExamAnswers(Object.fromEntries(selectedPaper.questionIds.map((questionId) => [questionId, ""])))
    setExamSummary(null)
    setActiveTab("exam")
    toast.success("已进入整套考场模式")
  }

  const submitExam = async () => {
    if (!examSession) {
      toast.error("请先开始考场模式")
      return
    }
    const now = new Date().toISOString()
    const submitted = submitExamSessionAnswers(examSession, {
      answersByQuestionId: examAnswers,
      now,
    })
    const nextDiagnoses: ShenlunDiagnosis[] = []
    for (const answerItem of submitted.answers) {
      const question = questions.find((item) => item.id === answerItem.questionId)
      if (!question) continue
      const points = scoringPoints.filter((point) => question.scoringPointIds.includes(point.id))
      const diagnosis = createDeterministicDiagnosis({
        session: submitted.session,
        question,
        answerText: answerItem.answerText,
        scoringPoints: points,
        now,
      })
      await shenlunRepository.saveAnswer(answerItem)
      await shenlunRepository.saveDiagnosis(diagnosis)
      nextDiagnoses.push(diagnosis)
    }
    const diagnosedSession: TrainingSession = { ...submitted.session, status: "diagnosed" }
    await shenlunRepository.saveSession(diagnosedSession)
    const allDiagnoses = [...nextDiagnoses, ...diagnoses]
    const summary = buildExamSummary({
      sessionId: diagnosedSession.id,
      questions: selectedPaperQuestions,
      diagnoses: nextDiagnoses,
    })
    await persistCalibrationArtifacts({
      nextSessions: [diagnosedSession, ...sessions.filter((item) => item.id !== diagnosedSession.id)],
      nextDiagnoses: allDiagnoses,
      now,
    })
    setExamSession(diagnosedSession)
    setExamSummary(summary)
    setDiagnoses(allDiagnoses)
    setSessions((current) => [diagnosedSession, ...current.filter((item) => item.id !== diagnosedSession.id)])
    toast.success("整套考场模式已交卷并生成诊断")
  }

  const generateExpressionAssets = async () => {
    const sourceDocuments = documents.filter((document) => ["commentary", "policy_file", "lecture", "personal_note"].includes(document.documentType))
    if (sourceDocuments.length === 0) {
      toast.error("请先在素材知识库导入评论文章或政策文件")
      return
    }
    const now = new Date().toISOString()
    const generated = sourceDocuments.flatMap((document) =>
      extractExpressionAssets({
        documentId: document.id,
        rawText: document.rawText,
        now,
      }),
    )
    if (generated.length === 0) {
      toast.error("没有从现有文档中提取到可迁移表达")
      return
    }
    for (const asset of generated) await shenlunRepository.saveExpressionAsset(asset)
    setExpressionAssets((current) => [...generated, ...current.filter((asset) => !generated.some((item) => item.id === asset.id))])
    setActiveExpressionAssetId(generated[0].id)
    toast.success(`已提取 ${generated.length} 条表达资产`)
  }

  const startExpressionExercise = async () => {
    if (!activeExpressionAsset) return
    const now = new Date().toISOString()
    const exercise = createExpressionExercise({ asset: activeExpressionAsset, now })
    await shenlunRepository.saveExpressionExercise(exercise)
    setExpressionExercise(exercise)
    setExpressionAnswer("")
    toast.success("已生成表达迁移训练")
  }

  const submitExpressionExercise = async () => {
    if (!expressionExercise) {
      toast.error("请先生成表达迁移训练")
      return
    }
    if (!expressionAnswer.trim()) {
      toast.error("请先完成表达改写")
      return
    }
    const now = new Date().toISOString()
    const diagnosis = evaluateExpressionRewrite({
      exercise: expressionExercise,
      answerText: expressionAnswer,
      now,
    })
    const savedExercise: ExpressionExercise = {
      ...expressionExercise,
      userRewrite: expressionAnswer,
      diagnosisId: diagnosis.id,
    }
    const expressionSession: TrainingSession = {
      id: expressionExercise.id,
      mode: "expression_transfer",
      questionIds: [expressionExercise.assetId],
      startedAt: expressionExercise.createdAt,
      endedAt: now,
      status: "diagnosed",
      totalLimitSeconds: 600,
      stageTimings: [{ stage: "writing", startedAt: expressionExercise.createdAt, endedAt: now, durationSeconds: Math.max(0, Math.round((Date.parse(now) - Date.parse(expressionExercise.createdAt)) / 1000)), exceeded: false }],
    }
    await shenlunRepository.saveExpressionExercise(savedExercise)
    await shenlunRepository.saveSession(expressionSession)
    await shenlunRepository.saveDiagnosis(diagnosis)
    await persistCalibrationArtifacts({
      nextSessions: [expressionSession, ...sessions],
      nextDiagnoses: [diagnosis, ...diagnoses],
      now,
    })
    setExpressionExercise(savedExercise)
    setExpressionExercises((current) => [savedExercise, ...current.filter((item) => item.id !== savedExercise.id)])
    setDiagnoses((current) => [diagnosis, ...current])
    setLatestDiagnosis(diagnosis)
    toast.success("表达迁移诊断已生成")
  }

  const persistCalibrationArtifacts = async ({
    nextSessions,
    nextDiagnoses,
    now,
  }: {
    nextSessions: TrainingSession[]
    nextDiagnoses: ShenlunDiagnosis[]
    now: string
  }) => {
    const periodStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const snapshot = buildCalibrationSnapshot({
      diagnoses: nextDiagnoses,
      periodStart,
      periodEnd: now,
      now,
    })
    const report = buildCalibrationReport({
      sessions: nextSessions,
      questions,
      diagnoses: nextDiagnoses,
      periodStart,
      periodEnd: now,
      now,
    })
    const baseProfile = learningProfile ?? buildDefaultLearningProfile(now)
    const profile = recalibrateLearningProfile(baseProfile, {
      diagnoses: nextDiagnoses,
      sessions: nextSessions,
      now,
    })
    const generatedPlan = generateDailyLearningPlan({
      profile,
      questions,
      questionBankItems,
      topicAssets,
      diagnoses: nextDiagnoses,
      sessions: nextSessions,
      now,
    })
    await shenlunRepository.saveCalibrationSnapshot(snapshot)
    await shenlunRepository.saveCalibrationReport(report)
    await shenlunRepository.saveLearningProfile(profile)
    for (const task of generatedPlan.tasks) await shenlunRepository.saveLearningTask(task)
    await shenlunRepository.saveLearningPlan(generatedPlan.plan)
    setSnapshots((current) => [snapshot, ...current])
    setReports((current) => [report, ...current])
    setLearningProfile(profile)
    setLearningPlan(generatedPlan.plan)
    setLearningTasks((current) => [...generatedPlan.tasks, ...current.filter((task) => !generatedPlan.tasks.some((item) => item.id === task.id))])
  }

  const resetCurrentTraining = () => {
    setCurrentSession(null)
    setAnswer("")
    setLatestDiagnosis(null)
    setTick(Date.now())
  }

  const updateQuestionBankReviewState = async (itemId: string, reviewState: QuestionBankReviewState) => {
    const item = questionBankItems.find((entry) => entry.id === itemId)
    if (!item) return
    const nextItem: QuestionBankItem = {
      ...item,
      reviewState,
      updatedAt: new Date().toISOString(),
      warnings: reviewState === "ready" ? [] : item.warnings,
    }
    await shenlunRepository.saveQuestionBankItem(nextItem)
    setQuestionBankItems((current) => current.map((entry) => (entry.id === itemId ? nextItem : entry)))
    toast.success(reviewState === "ready" ? "题库项已批准进入练习池" : "题库项已忽略")
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-serif text-2xl font-bold tracking-tight">
            <PenLine className="size-6 text-primary" />
            申论训练闭环
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            从素材知识库调用离线真题与表达素材，完成单题训练、整套考场、表达迁移、复盘诊断和阶段校准。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <MetricPill label="可训练题目" value={questions.length} />
          <MetricPill label="标准题库" value={questionBankSummary.ready} />
          <MetricPill label="真题套卷" value={papers.length} />
          <MetricPill label="表达资产" value={expressionAssets.length} />
          <MetricPill label="今日训练" value={todaySessions.length} />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TrainingTab)}>
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="today">今日训练</TabsTrigger>
          <TabsTrigger value="time">时间感训练</TabsTrigger>
          <TabsTrigger value="diagnosis">复盘诊断</TabsTrigger>
          <TabsTrigger value="expression">评论转表达</TabsTrigger>
          <TabsTrigger value="exam">考场模式</TabsTrigger>
          <TabsTrigger value="calibration">阶段校准</TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="mt-5">
          <TodayPanel
            activeQuestion={activeQuestion}
            activeScoringPoints={activeScoringPoints}
            questions={questions}
            questionBankItems={questionBankItems}
            questionBankSummary={questionBankSummary}
            diagnoses={diagnoses}
            snapshots={snapshots}
            learningPlan={visibleLearningPlan.plan}
            learningTasks={visibleLearningPlan.tasks}
            onUpdateQuestionBankReviewState={(itemId, reviewState) => void updateQuestionBankReviewState(itemId, reviewState)}
            onStartQuestion={startQuestion}
            onGoTime={() => setActiveTab("time")}
          />
        </TabsContent>

        <TabsContent value="time" className="mt-5">
          <TimedSinglePanel
            questions={questions}
            passages={activePassages}
            scoringPoints={scoringPoints}
            activeQuestion={activeQuestion}
            activeQuestionId={activeQuestionId}
            activeScoringPoints={activeScoringPoints}
            answer={answer}
            currentSession={currentSession}
            currentStage={currentStage}
            currentStageElapsed={currentStageElapsed}
            currentStageLimit={currentStageLimit}
            onSelectQuestion={setActiveQuestionId}
            onStartQuestion={startQuestion}
            onReset={resetCurrentTraining}
            onSwitchStage={switchStage}
            onAnswerChange={setAnswer}
            onSubmit={submitAnswer}
          />
        </TabsContent>

        <TabsContent value="diagnosis" className="mt-5">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
            <DiagnosisCard diagnosis={latestDiagnosis ?? diagnoses[0]} scoringPoints={scoringPoints} />
            <RecentDiagnosisCard diagnoses={diagnoses} />
          </div>
        </TabsContent>

        <TabsContent value="expression" className="mt-5">
          <ExpressionPanel
            assets={expressionAssets}
            activeAsset={activeExpressionAsset}
            exercise={expressionExercise}
            answer={expressionAnswer}
            onGenerateAssets={generateExpressionAssets}
            onSelectAsset={setActiveExpressionAssetId}
            onStartExercise={startExpressionExercise}
            onAnswerChange={setExpressionAnswer}
            onSubmit={submitExpressionExercise}
          />
        </TabsContent>

        <TabsContent value="exam" className="mt-5">
          <ExamModePanel
            papers={papers}
            selectedPaper={selectedPaper}
            questions={selectedPaperQuestions}
            passages={passages}
            selectedPaperId={selectedPaperId}
            examSession={examSession}
            examAnswers={examAnswers}
            summary={examSummary}
            onSelectPaper={setSelectedPaperId}
            onStart={startSelectedExam}
            onAnswerChange={(questionId, value) => setExamAnswers((current) => ({ ...current, [questionId]: value }))}
            onSubmit={submitExam}
          />
        </TabsContent>

        <TabsContent value="calibration" className="mt-5">
          <CalibrationPanel snapshot={latestSnapshot} report={latestReport} onBuild={() => void persistCalibrationArtifacts({ nextSessions: sessions, nextDiagnoses: diagnoses, now: new Date().toISOString() })} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function TodayPanel({
  activeQuestion,
  activeScoringPoints,
  questions,
  questionBankItems,
  questionBankSummary,
  diagnoses,
  snapshots,
  learningPlan,
  learningTasks,
  onUpdateQuestionBankReviewState,
  onStartQuestion,
  onGoTime,
}: {
  activeQuestion: TrainingQuestion | undefined
  activeScoringPoints: ScoringPoint[]
  questions: TrainingQuestion[]
  questionBankItems: QuestionBankItem[]
  questionBankSummary: ReturnType<typeof summarizeQuestionBankItems>
  diagnoses: ShenlunDiagnosis[]
  snapshots: CalibrationSnapshot[]
  learningPlan: LearningPlan
  learningTasks: LearningTask[]
  onUpdateQuestionBankReviewState: (itemId: string, reviewState: QuestionBankReviewState) => void
  onStartQuestion: (questionId: string) => void
  onGoTime: () => void
}) {
  const reviewItems = questionBankItems.filter((item) => item.reviewState === "draft" || item.reviewState === "needs_review").slice(0, 4)
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="size-4 text-primary" />
            今日建议
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeQuestion ? (
            <div className="rounded-md border bg-muted/20 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{SHENLUN_QUESTION_TYPE_LABELS[activeQuestion.type]}</Badge>
                <Badge variant="outline">{activeQuestion.suggestedMinutes} 分钟</Badge>
                <Badge variant={activeScoringPoints.length > 0 ? "secondary" : "outline"}>
                  {activeScoringPoints.length} 个评分点
                </Badge>
              </div>
              <h2 className="mt-3 font-serif text-xl font-bold">{activeQuestion.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{activeQuestion.prompt}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={() => onStartQuestion(activeQuestion.id)}>
                  <Clock3 className="size-4" />
                  开始训练
                </Button>
                <Button variant="outline" onClick={onGoTime}>
                  查看题目池
                </Button>
              </div>
            </div>
          ) : (
            <EmptyState icon={FileText} title="还没有可训练真题" desc="请先到素材知识库导入 PDF / 文本，并选择“真题套卷”或“单题材料”。" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="size-4 text-primary" />
            闭环进度
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ProgressRow label="入库题目" value={Math.min(100, questions.length * 20)} detail={`${questions.length} 道`} />
          <ProgressRow label="已诊断" value={questions.length ? Math.min(100, (diagnoses.length / questions.length) * 100) : 0} detail={`${diagnoses.length} 次`} />
          <ProgressRow label="阶段校准" value={snapshots.length > 0 ? 100 : 0} detail={snapshots.length > 0 ? "已生成" : "待训练"} />
        </CardContent>
      </Card>

      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="size-4 text-primary" />
            标准题库
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <StatBox label="Ready" value={questionBankSummary.ready} />
            <StatBox label="待复核" value={questionBankSummary.needsReview} />
            <StatBox label="真题演练" value={questionBankSummary.byCategory.past_paper} />
            <StatBox label="素材转题" value={questionBankSummary.byCategory.material_to_question} />
            <StatBox label="总题量" value={questionBankSummary.total} />
          </div>
          {questionBankItems.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">概括 {questionBankSummary.byType.summary}</Badge>
              <Badge variant="outline">对策 {questionBankSummary.byType.countermeasure}</Badge>
              <Badge variant="outline">分析 {questionBankSummary.byType.analysis}</Badge>
              <Badge variant="outline">应用文 {questionBankSummary.byType.implementation}</Badge>
              <Badge variant="outline">作文 {questionBankSummary.byType.essay}</Badge>
            </div>
          ) : (
            <p className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
              暂无标准题库项。上传 PDF、网页或文本后，解析结果会先归一化成标准题库，再进入练习和学习计划。
            </p>
          )}
          {reviewItems.length > 0 ? (
            <div className="space-y-2">
              <div className="text-sm font-medium">待复核候选</div>
              {reviewItems.map((item) => (
                <div key={item.id} className="flex flex-wrap items-start justify-between gap-3 rounded-md border bg-background p-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium">{item.title}</div>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{item.prompt}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Badge variant="outline">{item.reviewState}</Badge>
                      <Badge variant="outline">{item.warnings.length} warnings</Badge>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="outline" onClick={() => onUpdateQuestionBankReviewState(item.id, "ignored")}>
                      忽略
                    </Button>
                    <Button size="sm" onClick={() => onUpdateQuestionBankReviewState(item.id, "ready")}>
                      批准
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers3 className="size-4 text-primary" />
            个性化学习计划
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border bg-muted/20 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{learningPlan.scope === "weekly" ? "周计划" : "今日计划"}</Badge>
              <Badge variant="outline">{learningPlan.totalEstimatedMinutes} 分钟</Badge>
              {learningPlan.assetGapWarnings.map((warning) => (
                <Badge key={warning} variant="outline" className="border-amber-300 text-amber-700">
                  {warning}
                </Badge>
              ))}
            </div>
            <h3 className="mt-3 font-serif text-lg font-bold">{learningPlan.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{learningPlan.rationale}</p>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {learningTasks.map((task) => (
              <div key={task.id} className="rounded-md border bg-background p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium">{task.title}</div>
                  <Badge variant={task.priority === "high" ? "default" : "outline"}>{task.estimatedMinutes}m</Badge>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{task.description}</p>
                <p className="mt-2 text-xs text-primary">{task.rationale}</p>
                {task.questionIds?.[0] ? (
                  <Button size="sm" variant="outline" className="mt-3" onClick={() => onStartQuestion(task.questionIds![0])}>
                    开始该任务
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function TimedSinglePanel({
  questions,
  passages,
  scoringPoints,
  activeQuestion,
  activeQuestionId,
  activeScoringPoints,
  answer,
  currentSession,
  currentStage,
  currentStageElapsed,
  currentStageLimit,
  onSelectQuestion,
  onStartQuestion,
  onReset,
  onSwitchStage,
  onAnswerChange,
  onSubmit,
}: {
  questions: TrainingQuestion[]
  passages: MaterialPassage[]
  scoringPoints: ScoringPoint[]
  activeQuestion: TrainingQuestion | undefined
  activeQuestionId: string
  activeScoringPoints: ScoringPoint[]
  answer: string
  currentSession: TrainingSession | null
  currentStage: TrainingStage
  currentStageElapsed: number
  currentStageLimit: number
  onSelectQuestion: (questionId: string) => void
  onStartQuestion: (questionId: string) => void
  onReset: () => void
  onSwitchStage: (stage: TrainingStage) => void
  onAnswerChange: (value: string) => void
  onSubmit: () => void
}) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="size-4 text-primary" />
            题目池
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {questions.length === 0 ? (
            <EmptyState icon={FileText} title="暂无题目" desc="入库后的真题会显示在这里。" compact />
          ) : (
            questions.map((question) => {
              const pointCount = scoringPoints.filter((point) => question.scoringPointIds.includes(point.id)).length
              return (
                <button
                  key={question.id}
                  type="button"
                  onClick={() => onSelectQuestion(question.id)}
                  className={cn(
                    "w-full rounded-md border bg-background p-3 text-left transition-colors hover:bg-muted/40",
                    activeQuestionId === question.id && "border-primary/50 bg-primary/5",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{question.title}</div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{question.prompt}</p>
                    </div>
                    <Badge variant="outline" className="shrink-0">
                      {question.suggestedMinutes}m
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Badge variant="secondary">{SHENLUN_QUESTION_TYPE_LABELS[question.type]}</Badge>
                    <Badge variant="outline">{pointCount} 评分点</Badge>
                  </div>
                </button>
              )
            })
          )}
        </CardContent>
      </Card>

      <Card className="min-h-[640px]">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock3 className="size-4 text-primary" />
            单题时间感训练
          </CardTitle>
          {activeQuestion ? (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onReset}>
                <RotateCcw className="size-4" />
                重置
              </Button>
              <Button size="sm" onClick={() => onStartQuestion(activeQuestion.id)}>
                开始
              </Button>
            </div>
          ) : null}
        </CardHeader>
        <CardContent>
          {activeQuestion ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="space-y-4">
                <QuestionCard question={activeQuestion} />
                <PassageCard passages={passages} />
              </div>

              <div className="space-y-4">
                <StageTimer
                  currentSession={currentSession}
                  currentStage={currentStage}
                  currentStageElapsed={currentStageElapsed}
                  currentStageLimit={currentStageLimit}
                  onSwitchStage={onSwitchStage}
                />

                <InlineDictationTextarea
                  value={answer}
                  onValueChange={onAnswerChange}
                  onTranscript={(text) => {
                    onAnswerChange(appendDictationText(answer, text, answer.trim() ? "\n" : ""))
                  }}
                  previewSeparator={answer.trim() ? "\n" : ""}
                  seedText={activeScoringPoints.slice(0, 4).map((point) => point.text).join("、")}
                  placeholder="在这里作答。需要口述时，点击右下角麦克风，文字会实时写入文本框。"
                  className="min-h-[300px] resize-none font-serif text-[15px] leading-relaxed"
                  footer={({ dictationButton }) => (
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                      <div className="text-xs text-muted-foreground">
                        字数：<span className="font-mono">{countChineseAwareChars(answer)}</span>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => onAnswerChange("")}>
                          清空
                        </Button>
                        <Button size="sm" disabled={!answer.trim()} onClick={onSubmit}>
                          <Send className="size-4" />
                          提交诊断
                        </Button>
                        {dictationButton}
                      </div>
                    </div>
                  )}
                />
              </div>
            </div>
          ) : (
            <EmptyState icon={FileText} title="请选择题目" desc="从左侧题目池选择一题开始训练。" />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ExpressionPanel({
  assets,
  activeAsset,
  exercise,
  answer,
  onGenerateAssets,
  onSelectAsset,
  onStartExercise,
  onAnswerChange,
  onSubmit,
}: {
  assets: ExpressionAsset[]
  activeAsset: ExpressionAsset | undefined
  exercise: ExpressionExercise | null
  answer: string
  onGenerateAssets: () => void
  onSelectAsset: (assetId: string) => void
  onStartExercise: () => void
  onAnswerChange: (value: string) => void
  onSubmit: () => void
}) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers3 className="size-4 text-primary" />
            表达资产
          </CardTitle>
          <Button size="sm" variant="outline" onClick={onGenerateAssets}>
            提取
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {assets.length === 0 ? (
            <EmptyState icon={PenLine} title="暂无表达资产" desc="从评论文章、政策文件中提取后会显示在这里。" compact />
          ) : (
            assets.map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => onSelectAsset(asset.id)}
                className={cn("w-full rounded-md border bg-background p-3 text-left text-sm hover:bg-muted/40", activeAsset?.id === asset.id && "border-primary/50 bg-primary/5")}
              >
                <div className="line-clamp-2 font-medium">{asset.expression}</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Badge variant="outline">{asset.scenario}</Badge>
                  {asset.tags.slice(0, 2).map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </button>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <PenLine className="size-4 text-primary" />
            评论转表达训练
          </CardTitle>
          <Button size="sm" disabled={!activeAsset} onClick={onStartExercise}>
            生成训练
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {activeAsset ? (
            <div className="rounded-md border bg-muted/20 p-4 text-sm">
              <div className="mb-1 text-xs text-muted-foreground">原始表达</div>
              <p className="font-serif leading-relaxed">{activeAsset.sourceText}</p>
              <div className="mt-3 mb-1 text-xs text-muted-foreground">迁移表达</div>
              <p className="font-serif font-medium leading-relaxed">{activeAsset.expression}</p>
            </div>
          ) : null}
          {exercise ? (
            <>
              <div className="rounded-md border bg-background p-3 text-sm">{exercise.prompt}</div>
              <Textarea
                value={answer}
                onChange={(event) => onAnswerChange(event.target.value)}
                placeholder="把上方表达迁移到一个申论作答场景中..."
                className="min-h-[260px] font-serif leading-relaxed"
              />
              <div className="flex justify-end">
                <Button disabled={!answer.trim()} onClick={onSubmit}>
                  <Send className="size-4" />
                  提交表达诊断
                </Button>
              </div>
            </>
          ) : (
            <EmptyState icon={PenLine} title="尚未生成训练" desc="选择一条表达资产后点击“生成训练”。" />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ExamModePanel({
  papers,
  selectedPaper,
  questions,
  passages,
  selectedPaperId,
  examSession,
  examAnswers,
  summary,
  onSelectPaper,
  onStart,
  onAnswerChange,
  onSubmit,
}: {
  papers: ExamPaper[]
  selectedPaper: ExamPaper | undefined
  questions: TrainingQuestion[]
  passages: MaterialPassage[]
  selectedPaperId: string
  examSession: TrainingSession | null
  examAnswers: Record<string, string>
  summary: ExamSummary | null
  onSelectPaper: (paperId: string) => void
  onStart: () => void
  onAnswerChange: (questionId: string, value: string) => void
  onSubmit: () => void
}) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock3 className="size-4 text-primary" />
            真题套卷
          </CardTitle>
          <Button size="sm" disabled={!selectedPaper} onClick={onStart}>
            开始
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {papers.length === 0 ? (
            <EmptyState icon={FileText} title="暂无套卷" desc="导入真题套卷后会显示在这里。" compact />
          ) : (
            papers.map((paper) => (
              <button
                key={paper.id}
                type="button"
                onClick={() => onSelectPaper(paper.id)}
                className={cn("w-full rounded-md border bg-background p-3 text-left text-sm hover:bg-muted/40", selectedPaperId === paper.id && "border-primary/50 bg-primary/5")}
              >
                <div className="font-medium">{paper.title}</div>
                <div className="mt-2 flex gap-1">
                  <Badge variant="outline">{paper.totalMinutes} 分钟</Badge>
                  <Badge variant="secondary">{paper.questionIds.length} 题</Badge>
                </div>
              </button>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="size-4 text-primary" />
            整套作答
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {examSession ? <Badge variant="secondary">状态：{examSession.status}</Badge> : <Badge variant="outline">未开始</Badge>}
          {questions.length === 0 ? (
            <EmptyState icon={FileText} title="当前套卷没有题目" desc="请检查真题解析结果。" />
          ) : (
            questions.map((question, index) => {
              const questionPassages = passages.filter((passage) => question.materialIds.includes(passage.id))
              return (
                <section key={question.id} className="rounded-md border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>第 {index + 1} 题</Badge>
                    <Badge variant="outline">{SHENLUN_QUESTION_TYPE_LABELS[question.type]}</Badge>
                    <Badge variant="outline">{question.suggestedMinutes} 分钟</Badge>
                  </div>
                  <h3 className="mt-3 font-serif text-lg font-bold">{question.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed">{question.prompt}</p>
                  <details className="mt-3 rounded-md border bg-muted/20 p-3 text-sm">
                    <summary className="cursor-pointer font-medium">查看材料</summary>
                    <div className="mt-2 space-y-2 font-serif leading-loose">
                      {questionPassages.map((passage) => (
                        <p key={passage.id}>{passage.text}</p>
                      ))}
                    </div>
                  </details>
                  <Textarea
                    value={examAnswers[question.id] ?? ""}
                    onChange={(event) => onAnswerChange(question.id, event.target.value)}
                    placeholder="本题作答..."
                    className="mt-3 min-h-[180px] font-serif leading-relaxed"
                  />
                </section>
              )
            })
          )}
          {questions.length > 0 ? (
            <div className="flex justify-end">
              <Button disabled={!examSession} onClick={onSubmit}>
                <Send className="size-4" />
                交卷诊断
              </Button>
            </div>
          ) : null}
          {summary ? <ExamSummaryCard summary={summary} /> : null}
        </CardContent>
      </Card>
    </div>
  )
}

function CalibrationPanel({
  snapshot,
  report,
  onBuild,
}: {
  snapshot: CalibrationSnapshot | undefined
  report: CalibrationReport | undefined
  onBuild: () => void
}) {
  if (!snapshot && !report) {
    return (
      <div className="space-y-4">
        <Button onClick={onBuild}>生成阶段校准报告</Button>
        <EmptyState icon={BarChart3} title="暂无阶段校准" desc="完成训练并生成诊断后，系统会汇总错因频次、能力分和下一阶段建议。" />
      </div>
    )
  }

  const scoreRows = snapshot
    ? ([
        ["阅读提取", snapshot.abilityScores.readingExtraction],
        ["概括能力", snapshot.abilityScores.summary],
        ["分析能力", snapshot.abilityScores.analysis],
        ["对策能力", snapshot.abilityScores.countermeasure],
        ["公文格式", snapshot.abilityScores.documentFormat],
        ["文章立意", snapshot.abilityScores.essayIdeation],
        ["规范表达", snapshot.abilityScores.formalExpression],
        ["时间控制", snapshot.abilityScores.timeControl],
      ] as const)
    : []

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="size-4 text-primary" />
            能力校准
          </CardTitle>
          <Button size="sm" variant="outline" onClick={onBuild}>
            重新生成
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {scoreRows.map(([label, value]) => (
            <ProgressRow key={label} label={label} value={value} detail={`${value}`} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">周期报告</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {report ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                <StatBox label="训练量" value={report.trainingCount} />
                <StatBox label="均分" value={report.averageScore} />
                <StatBox label="超时阶段" value={report.timeControl.exceededStageCount} />
              </div>
              <div className="space-y-2">
                {report.trainingPlan.map((item) => (
                  <div key={item} className="rounded-md border bg-muted/20 p-3 text-sm leading-relaxed">
                    {item}
                  </div>
                ))}
              </div>
            </>
          ) : null}
          {snapshot?.topIssueTags.slice(0, 5).map((item) => (
            <div key={item.tag} className="flex items-center justify-between rounded-md border bg-background p-3 text-sm">
              <span>{SHENLUN_ISSUE_TAG_LABELS[item.tag]}</span>
              <Badge variant="outline">{item.count} 次</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function QuestionCard({ question }: { question: TrainingQuestion }) {
  return (
    <div className="rounded-md border bg-muted/20 p-4">
      <div className="flex flex-wrap gap-2">
        <Badge>{SHENLUN_QUESTION_TYPE_LABELS[question.type]}</Badge>
        <Badge variant="outline">{question.suggestedMinutes} 分钟</Badge>
        {question.wordLimit ? <Badge variant="outline">限 {question.wordLimit} 字</Badge> : null}
      </div>
      <h2 className="mt-3 font-serif text-lg font-bold">{question.title}</h2>
      <p className="mt-2 text-sm leading-relaxed">{question.prompt}</p>
    </div>
  )
}

function PassageCard({ passages }: { passages: MaterialPassage[] }) {
  return (
    <div className="rounded-md border p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        <Highlighter className="size-4 text-primary" />
        给定材料
      </div>
      <div className="max-h-[360px] space-y-4 overflow-auto font-serif text-sm leading-loose">
        {passages.length === 0 ? (
          <p className="text-muted-foreground">当前题目没有绑定材料段落。</p>
        ) : (
          passages.map((passage) => (
            <article key={passage.id}>
              {passage.title ? <h3 className="mb-1 font-bold">{passage.title}</h3> : null}
              <p>{passage.text}</p>
            </article>
          ))
        )}
      </div>
    </div>
  )
}

function StageTimer({
  currentSession,
  currentStage,
  currentStageElapsed,
  currentStageLimit,
  onSwitchStage,
}: {
  currentSession: TrainingSession | null
  currentStage: TrainingStage
  currentStageElapsed: number
  currentStageLimit: number
  onSwitchStage: (stage: TrainingStage) => void
}) {
  return (
    <div className="rounded-md border p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium">五阶段计时</div>
        <Badge variant={currentSession?.status === "running" ? "secondary" : "outline"}>
          {currentSession?.status === "running" ? "进行中" : "未开始"}
        </Badge>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {STAGES.map((stage) => (
          <Button
            key={stage}
            type="button"
            size="sm"
            variant={currentStage === stage ? "default" : "outline"}
            className="px-1 text-xs"
            disabled={!currentSession || currentSession.status !== "running"}
            onClick={() => onSwitchStage(stage)}
          >
            {TRAINING_STAGE_LABELS[stage]}
          </Button>
        ))}
      </div>
      <div className="mt-3">
        <div className="mb-1 flex justify-between text-xs text-muted-foreground">
          <span>{TRAINING_STAGE_LABELS[currentStage]}</span>
          <span>
            {formatDuration(currentStageElapsed)} / {formatDuration(currentStageLimit)}
          </span>
        </div>
        <Progress value={Math.min(100, (currentStageElapsed / currentStageLimit) * 100)} />
      </div>
    </div>
  )
}

function DiagnosisCard({
  diagnosis,
  scoringPoints,
}: {
  diagnosis: ShenlunDiagnosis | undefined
  scoringPoints: ScoringPoint[]
}) {
  if (!diagnosis) {
    return <EmptyState icon={AlertCircle} title="暂无复盘诊断" desc="完成一次训练后，系统会展示评分点命中、错因标签和表达建议。" />
  }
  const pointMap = new Map(scoringPoints.map((point) => [point.id, point]))
  const hitCount = diagnosis.scoringPointHits.filter((item) => item.hit).length

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CheckCircle2 className="size-4 text-primary" />
          结构化诊断
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-3 gap-3">
          <StatBox label="得分" value={diagnosis.score ?? "--"} />
          <StatBox label="评分点" value={`${hitCount}/${diagnosis.scoringPointHits.length}`} />
          <StatBox label="错因" value={diagnosis.issueTags.length} />
        </div>
        <section>
          <div className="mb-2 text-sm font-medium">评分点命中</div>
          <div className="space-y-2">
            {diagnosis.scoringPointHits.length === 0 ? (
              <p className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">该训练暂无评分点。</p>
            ) : (
              diagnosis.scoringPointHits.map((hit) => (
                <div key={hit.scoringPointId} className="flex items-start gap-2 rounded-md border bg-background p-3 text-sm">
                  <Badge variant={hit.hit ? "secondary" : "outline"}>{hit.hit ? "命中" : "遗漏"}</Badge>
                  <div>
                    <div className="font-medium">{pointMap.get(hit.scoringPointId)?.text ?? hit.scoringPointId}</div>
                    {hit.evidence ? <p className="mt-1 text-xs text-muted-foreground">证据：{hit.evidence}</p> : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
        <section>
          <div className="mb-2 text-sm font-medium">错因标签</div>
          <div className="flex flex-wrap gap-2">
            {diagnosis.issueTags.map((tag) => (
              <Badge key={tag} variant="outline">
                {SHENLUN_ISSUE_TAG_LABELS[tag]}
              </Badge>
            ))}
          </div>
        </section>
        <section>
          <div className="mb-2 text-sm font-medium">结构建议</div>
          <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
            {diagnosis.structureComments.map((comment) => (
              <li key={comment} className="rounded-md border bg-muted/20 p-3">
                {comment}
              </li>
            ))}
          </ul>
        </section>
      </CardContent>
    </Card>
  )
}

function RecentDiagnosisCard({ diagnoses }: { diagnoses: ShenlunDiagnosis[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertCircle className="size-4 text-primary" />
          最近诊断
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {diagnoses.length === 0 ? (
          <EmptyState icon={AlertCircle} title="暂无诊断" desc="提交一次训练后会生成诊断记录。" compact />
        ) : (
          diagnoses.slice(0, 8).map((diagnosis) => (
            <div key={diagnosis.id} className="rounded-md border bg-background p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">得分 {diagnosis.score ?? "--"}</span>
                <span className="text-xs text-muted-foreground">{new Date(diagnosis.createdAt).toLocaleString()}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {diagnosis.issueTags.map((tag) => (
                  <Badge key={tag} variant="outline">
                    {SHENLUN_ISSUE_TAG_LABELS[tag]}
                  </Badge>
                ))}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

function ExamSummaryCard({ summary }: { summary: ExamSummary }) {
  return (
    <div className="rounded-md border bg-muted/20 p-4">
      <div className="mb-3 text-sm font-medium">整卷诊断汇总</div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatBox label="均分" value={summary.averageScore} />
        <StatBox label="已答" value={`${summary.answeredQuestions}/${summary.totalQuestions}`} />
        <StatBox label="命中率" value={`${Math.round(summary.scoringPointHitRatio * 100)}%`} />
        <StatBox label="错因数" value={summary.issueTags.length} />
      </div>
    </div>
  )
}

function finalizeSessionWithStageLimit(session: TrainingSession): TrainingSession {
  const stageTimings = session.stageTimings.map((timing) => ({
    ...timing,
    exceeded: timing.durationSeconds > TRAINING_STAGE_LIMIT_SECONDS[timing.stage],
  }))
  return { ...session, stageTimings }
}

function MetricPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-full border bg-card px-4 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-2 font-mono font-semibold">{value}</span>
    </div>
  )
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border bg-background p-3 text-center">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-serif text-xl font-bold text-primary">{value}</div>
    </div>
  )
}

function ProgressRow({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">{detail}</span>
      </div>
      <Progress value={Math.max(0, Math.min(100, value))} />
    </div>
  )
}

function EmptyState({
  icon: Icon,
  title,
  desc,
  compact = false,
}: {
  icon: LucideIcon
  title: string
  desc: string
  compact?: boolean
}) {
  return (
    <div className={cn("rounded-md border bg-muted/30 text-center text-muted-foreground", compact ? "p-5" : "p-8")}>
      <Icon className="mx-auto mb-3 size-9 opacity-50" />
      <div className="font-medium text-foreground">{title}</div>
      <p className="mt-1 text-sm">{desc}</p>
    </div>
  )
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${minutes}:${String(rest).padStart(2, "0")}`
}

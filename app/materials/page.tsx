"use client"

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type SetStateAction } from "react"
import {
  AlertTriangle,
  ArrowUp,
  Bot,
  BookOpen,
  Boxes,
  CheckCircle2,
  Clock3,
  Database,
  Download,
  FileCheck2,
  FileText,
  FolderOpen,
  Import,
  Inbox,
  Layers3,
  Loader2,
  Network,
  RefreshCw,
  ScrollText,
  Search,
  ShieldAlert,
  Sparkles,
  Square,
  Tags,
  Upload,
  X,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { MaterialsSecondaryNav } from "@/components/materials/materials-secondary-nav"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { capabilityLabel, displayAgentStatus, displayModelSource } from "@/lib/agent/capabilities"
import { runMaterialAgentChat } from "@/lib/agent/chat-runner"
import { displayAgentExecutor } from "@/lib/agent/executor-settings"
import { canStartMaterialAgentRun, loadTauriAgentRuntime } from "@/lib/agent/material-run"
import { parseAgentMaterialOutput, toMaterialDraftFromAgentOutput } from "@/lib/agent/material-output"
import {
  MATERIAL_WORKBENCH_STATE_KEY,
  parseMaterialWorkbenchState,
  serializeMaterialWorkbenchState,
} from "@/lib/agent/material-workbench-state"
import {
  getMaterialWorkbenchSessionSnapshot,
  hasMaterialWorkbenchSession,
  patchMaterialWorkbenchSession,
  subscribeMaterialWorkbenchSession,
  type MaterialRunCenterItem as RunCenterItem,
  type MaterialWorkbenchSessionSnapshot,
  type UploadedFileStatus,
} from "@/lib/agent/material-workbench-session"
import { refreshAgentRunStatuses } from "@/lib/agent/run-status-sync"
import { buildAgentRunProcessTimeline, type AgentRunProcessStep } from "@/lib/agent/run-process"
import { buildAgentToolPlan, type AgentToolPlan } from "@/lib/agent/tool-registry"
import { buildAgentContextMap, type AgentContextMap } from "@/lib/agent/context-engine"
import { buildAgentMemorySnapshot, type AgentMemorySnapshot } from "@/lib/agent/memory"
import { buildAgentWorkflowPlan, type AgentWorkflowPlan } from "@/lib/agent/workflow-plan"
import { buildAgentTaskPlan, summarizeAgentTaskPlan, taskPlanWarningMessages } from "@/lib/agent/orchestrator"
import { verifyAgentMaterialOutput } from "@/lib/agent/verifier"
import {
  appendMaterialChatEvent,
  appendMaterialChatMessages,
  buildMaterialChatFileAttachments,
  createMaterialAssistantMessage,
  createMaterialChatEvent,
  createMaterialUserMessage,
  updateAssistantMessageFromRunEvent,
  updateMaterialChatMessage,
  type MaterialChatEvent,
  type MaterialChatMessage,
} from "@/lib/agent/material-chat"
import {
  buildMaterialContextEntities,
  buildMaterialContextPayload,
  buildMaterialComposerContextGroups,
  findActiveSkillMention,
  parseMaterialMentions,
  type MaterialContextEntity,
  type MaterialContextPayload,
} from "@/lib/agent/context-mentions"
import { applyPromptBudget, materialAgentPromptBudgetLimits } from "@/lib/agent/prompt-budget"
import {
  BUILTIN_MATERIAL_SKILLS,
  getMaterialSkillDefinition,
  normalizeSkillInputValues,
  validateSkillExecution,
  type MaterialSkillDefinition,
  type MaterialSkillInput,
  type MaterialSkillInputValues,
} from "@/lib/agent/skill-inputs"
import { extractMaterialFile } from "@/lib/material/file"
import {
  loadTauriMaterialParserRuntime,
  type MineruRuntimeStatus,
  type PdfSkillParseProgressPayload,
} from "@/lib/desktop/material-parser-runtime"
import { buildImportBundle, processMaterialText, validateMaterialDraft } from "@/lib/material/processor"
import { cleanMaterialText, inferSourceTypeFromFileName } from "@/lib/material/text"
import { parseExamDocumentText } from "@/lib/shenlun/document-parser"
import { saveParsedShenlunDocumentOutput } from "@/lib/shenlun/import-assets"
import { useRuntime } from "@/lib/runtime-store"
import {
  agentRepository,
  copybookRepository,
  materialInboxRepository,
  materialRepository,
} from "@/lib/storage/repositories"
import { shenlunRepository } from "@/lib/shenlun/repositories"
import {
  SHENLUN_DOCUMENT_TYPE_LABELS,
  type AnswerKey,
  type ExamPaper,
  type MaterialPassage,
  type ScoringPoint,
  type ShenlunDocument,
  type ShenlunDocumentType,
  type ShenlunQuestionType,
  type TrainingQuestion,
} from "@/lib/shenlun/types"
import type { AgentRunRecord, MaterialInboxDraft, MaterialSource } from "@/lib/storage/schema"
import type { AgentAdapterId as PersistedAgentAdapterId } from "@/lib/storage/schema"
import type { MaterialDraft, MaterialFileInput, MaterialImportBundle } from "@/lib/material/types"
import type { AgentRunEvent, AgentSkillInfo, StartMaterialAgentRunRequest } from "@/types/agent-runtime"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type ImportSelection = {
  flashcards: boolean
  questions: boolean
  copybookItems: boolean
}

const QUICK_ACTIONS = [
  {
    label: "热点采集",
    skillId: "gongkao-hotspot-collector",
    prompt: "@Skill:热点采集器 @专题:基层治理 @来源:人民网 采集近30天基层治理现代化热点，生成专题摘要、金句、温故卡和对策题。",
  },
  {
    label: "本地解析",
    skillId: "gongkao-material-parser",
    prompt: "@Skill:政策文件解析器 解析当前粘贴或上传的政策材料，提炼问题、对策、关键词和规范表达。",
  },
  {
    label: "专题 Wiki",
    skillId: "gongkao-topic-wiki-curator",
    prompt: "@专题:数字乡村 把已收集资料整理为专题 Wiki，补充背景、政策依据、对策框架和关系线索。",
  },
  {
    label: "真题演练",
    skillId: "gongkao-question-generator",
    prompt: "@题型:对策题 基于当前素材生成一道对策题，附关键词、作答要求和示范答案。",
  },
  {
    label: "金句温故",
    skillId: "gongkao-material-parser",
    prompt: "@标签:基层治理 从当前素材中提炼可背诵金句，并转化为温故卡。",
  },
  {
    label: "字帖摘抄",
    skillId: "gongkao-copybook-extractor",
    prompt: "从金句库挑选适合临摹的短句，生成字帖摘抄候选。",
  },
  {
    label: "来源核验",
    skillId: "gongkao-source-verifier",
    prompt: "@来源:人民网 核验当前素材来源、发布主体、发布时间和引用片段可靠性。",
  },
  {
    label: "批量入库",
    skillId: "gongkao-topic-wiki-curator",
    prompt: "把当前候选素材批量整理成专题、来源、金句、温故卡、题目和字帖摘抄，全部先进入 Inbox。",
  },
]

const SAMPLE_PROJECTS = [
  { title: "数字乡村建设", tag: "专题 Wiki", summary: "基础设施、数字素养、数据治理、乡村产业融合。", sources: 12, cards: 28, questions: 9 },
  { title: "基层治理现代化", tag: "热点追踪", summary: "网格治理、矛盾化解、群众路线、服务型政府。", sources: 8, cards: 16, questions: 4 },
  { title: "新质生产力", tag: "真题素材", summary: "科技创新、产业升级、人才支撑、制度供给。", sources: 5, cards: 11, questions: 4 },
]

const KNOWLEDGE_LAYERS = [
  { title: "专题库", icon: Layers3, desc: "主题节点、标签、摘要、来源链路。" },
  { title: "来源库", icon: FileCheck2, desc: "网页、PDF、政策文件、真题材料。" },
  { title: "金句库", icon: ScrollText, desc: "按主题、场景、表达强度沉淀。" },
  { title: "温故卡", icon: BookOpen, desc: "遗忘曲线复习的关键词卡片。" },
  { title: "题型库", icon: FileText, desc: "概括题、对策题、综合分析题。" },
  { title: "字帖摘抄", icon: Tags, desc: "可勾选打包为 A4 米字格。" },
  { title: "Inbox 待审核", icon: Inbox, desc: "Agent 输出先暂存，人工确认后入库。" },
  { title: "关系图谱", icon: Network, desc: "主题、政策、题型、表达之间的关联。" },
]

const SHENLUN_DOCUMENT_TYPE_OPTIONS: ShenlunDocumentType[] = [
  "exam_paper",
  "single_question",
  "answer_key",
  "policy_file",
  "commentary",
  "lecture",
  "personal_note",
]

export default function MaterialsPage() {
  const { agentExecutor, agentAdapters, agentAdaptersChecking, refreshAgentAdapters } = useRuntime()
  const activeAdapter = agentAdapters.find((adapter) => adapter.id === agentExecutor.adapterId) ?? agentAdapters[0]
  const [title, setTitleState] = useState("")
  const [rawText, setRawTextState] = useState("")
  const [fileName, setFileNameState] = useState("")
  const [draft, setDraftState] = useState<MaterialDraft | null>(null)
  const [sourceInput, setSourceInputState] = useState<MaterialFileInput | null>(null)
  const [shenlunDocumentType, setShenlunDocumentTypeState] = useState<ShenlunDocumentType>("commentary")
  const [processing, setProcessingState] = useState(false)
  const [mineruStatus, setMineruStatus] = useState<MineruRuntimeStatus | null>(null)
  const [mineruInstalling, setMineruInstalling] = useState(false)
  const [mineruInstallLogs, setMineruInstallLogs] = useState<string[]>([])
  const [selectedMaterialFile, setSelectedMaterialFileState] = useState<File | null>(null)
  const [selectedMaterialFiles, setSelectedMaterialFilesState] = useState<File[]>([])
  const [uploadedFileStatus, setUploadedFileStatusState] = useState<UploadedFileStatus>("idle")
  const [pdfParseProgress, setPdfParseProgressState] = useState<PdfSkillParseProgressPayload | null>(null)
  const [pdfParseLogs, setPdfParseLogsState] = useState<string[]>([])
  const [skills, setSkills] = useState<AgentSkillInfo[]>(fallbackAgentSkills())
  const [selectedSkillId, setSelectedSkillIdState] = useState("gongkao-hotspot-collector")
  const [commandPrompt, setCommandPromptState] = useState("")
  const commandTextareaRef = useRef<HTMLTextAreaElement>(null)
  const [commandCursor, setCommandCursor] = useState(0)
  const [skillInputValues, setSkillInputValuesState] = useState<MaterialSkillInputValues>({})
  const [agentEvents, setAgentEventsState] = useState<AgentRunEvent[]>([])
  const [activeRunId, setActiveRunIdState] = useState("")
  const [runQueue, setRunQueueState] = useState<RunCenterItem[]>([])
  const [chatMessages, setChatMessagesState] = useState<MaterialChatMessage[]>([])
  const [storedRuns, setStoredRuns] = useState<AgentRunRecord[]>([])
  const [inboxDrafts, setInboxDrafts] = useState<MaterialInboxDraft[]>([])
  const [importingInboxDraftId, setImportingInboxDraftId] = useState("")
  const [sources, setSources] = useState<MaterialSource[]>([])
  const [sourceCounts, setSourceCounts] = useState<Record<string, { cards: number; questions: number; copybook: number }>>({})
  const [learningAssetStats, setLearningAssetStats] = useState({ provenance: 0, topics: 0, needsReview: 0 })
  const [workbenchRestored, setWorkbenchRestored] = useState(false)
  const [selection, setSelectionState] = useState<ImportSelection>({
    flashcards: true,
    questions: true,
    copybookItems: true,
  })
  const mountedRef = useRef(false)
  const fileParseVersionRef = useRef(0)

  const setTitle = (action: SetStateAction<string>) =>
    setSyncedWorkbenchState(action, getMaterialWorkbenchSessionSnapshot().title, setTitleState, (value) => ({ title: value }), mountedRef)
  const setRawText = (action: SetStateAction<string>) =>
    setSyncedWorkbenchState(action, getMaterialWorkbenchSessionSnapshot().rawText, setRawTextState, (value) => ({ rawText: value }), mountedRef)
  const setFileName = (action: SetStateAction<string>) =>
    setSyncedWorkbenchState(action, getMaterialWorkbenchSessionSnapshot().fileName, setFileNameState, (value) => ({ fileName: value }), mountedRef)
  const setDraft = (action: SetStateAction<MaterialDraft | null>) =>
    setSyncedWorkbenchState(action, getMaterialWorkbenchSessionSnapshot().draft, setDraftState, (value) => ({ draft: value }), mountedRef)
  const setSourceInput = (action: SetStateAction<MaterialFileInput | null>) =>
    setSyncedWorkbenchState(action, getMaterialWorkbenchSessionSnapshot().sourceInput, setSourceInputState, (value) => ({ sourceInput: value }), mountedRef)
  const setShenlunDocumentType = (action: SetStateAction<ShenlunDocumentType>) =>
    setSyncedWorkbenchState(
      action,
      getMaterialWorkbenchSessionSnapshot().shenlunDocumentType,
      setShenlunDocumentTypeState,
      (value) => ({ shenlunDocumentType: value }),
      mountedRef,
    )
  const setProcessing = (action: SetStateAction<boolean>) =>
    setSyncedWorkbenchState(action, getMaterialWorkbenchSessionSnapshot().processing, setProcessingState, (value) => ({ processing: value }), mountedRef)
  const setSelectedMaterialFile = (action: SetStateAction<File | null>) =>
    setSyncedWorkbenchState(
      action,
      getMaterialWorkbenchSessionSnapshot().selectedMaterialFile,
      setSelectedMaterialFileState,
      (value) => ({ selectedMaterialFile: value }),
      mountedRef,
    )
  const setSelectedMaterialFiles = (action: SetStateAction<File[]>) =>
    setSyncedWorkbenchState(
      action,
      getMaterialWorkbenchSessionSnapshot().selectedMaterialFiles,
      setSelectedMaterialFilesState,
      (value) => ({ selectedMaterialFiles: value }),
      mountedRef,
    )
  const setUploadedFileStatus = (action: SetStateAction<UploadedFileStatus>) =>
    setSyncedWorkbenchState(
      action,
      getMaterialWorkbenchSessionSnapshot().uploadedFileStatus,
      setUploadedFileStatusState,
      (value) => ({ uploadedFileStatus: value }),
      mountedRef,
    )
  const setPdfParseProgress = (action: SetStateAction<PdfSkillParseProgressPayload | null>) =>
    setSyncedWorkbenchState(
      action,
      getMaterialWorkbenchSessionSnapshot().pdfParseProgress,
      setPdfParseProgressState,
      (value) => ({ pdfParseProgress: value }),
      mountedRef,
    )
  const setPdfParseLogs = (action: SetStateAction<string[]>) =>
    setSyncedWorkbenchState(action, getMaterialWorkbenchSessionSnapshot().pdfParseLogs, setPdfParseLogsState, (value) => ({ pdfParseLogs: value }), mountedRef)
  const setSelectedSkillId = (action: SetStateAction<string>) =>
    setSyncedWorkbenchState(
      action,
      getMaterialWorkbenchSessionSnapshot().selectedSkillId,
      setSelectedSkillIdState,
      (value) => ({ selectedSkillId: value }),
      mountedRef,
    )
  const setCommandPrompt = (action: SetStateAction<string>) =>
    setSyncedWorkbenchState(
      action,
      getMaterialWorkbenchSessionSnapshot().commandPrompt,
      setCommandPromptState,
      (value) => ({ commandPrompt: value }),
      mountedRef,
    )
  const setSkillInputValues = (action: SetStateAction<MaterialSkillInputValues>) =>
    setSyncedWorkbenchState(
      action,
      getMaterialWorkbenchSessionSnapshot().skillInputValues,
      setSkillInputValuesState,
      (value) => ({ skillInputValues: value }),
      mountedRef,
    )
  const setAgentEvents = (action: SetStateAction<AgentRunEvent[]>) =>
    setSyncedWorkbenchState(action, getMaterialWorkbenchSessionSnapshot().agentEvents, setAgentEventsState, (value) => ({ agentEvents: value }), mountedRef)
  const setActiveRunId = (action: SetStateAction<string>) =>
    setSyncedWorkbenchState(action, getMaterialWorkbenchSessionSnapshot().activeRunId, setActiveRunIdState, (value) => ({ activeRunId: value }), mountedRef)
  const setRunQueue = (action: SetStateAction<RunCenterItem[]>) =>
    setSyncedWorkbenchState(action, getMaterialWorkbenchSessionSnapshot().runQueue, setRunQueueState, (value) => ({ runQueue: value }), mountedRef)
  const setChatMessages = (action: SetStateAction<MaterialChatMessage[]>) =>
    setSyncedWorkbenchState(
      action,
      getMaterialWorkbenchSessionSnapshot().chatMessages,
      setChatMessagesState,
      (value) => ({ chatMessages: value }),
      mountedRef,
    )
  const setSelection = (action: SetStateAction<ImportSelection>) =>
    setSyncedWorkbenchState(action, getMaterialWorkbenchSessionSnapshot().selection, setSelectionState, (value) => ({ selection: value }), mountedRef)

  const materialContextEntities = useMemo(() => buildMaterialContextEntities(skills), [skills])
  const mentionResult = useMemo(
    () => parseMaterialMentions(commandPrompt, materialContextEntities),
    [commandPrompt, materialContextEntities],
  )
  const composerContextGroups = useMemo(
    () => buildMaterialComposerContextGroups(mentionResult),
    [mentionResult],
  )
  const activeSkillMention = useMemo(
    () => findActiveSkillMention(commandPrompt, commandCursor, materialContextEntities),
    [commandCursor, commandPrompt, materialContextEntities],
  )
  const visibleUnknownMentions = useMemo(
    () =>
      mentionResult.unknown.filter(
        (mention) => !(activeSkillMention && activeSkillMention.matches.length > 0 && activeSkillMention.token === mention),
      ),
    [activeSkillMention, mentionResult.unknown],
  )
  const contextPayload = useMemo(() => buildMaterialContextPayload(mentionResult), [mentionResult])
  const availableSkillIds = useMemo(() => new Set(skills.map((skill) => skill.id)), [skills])
  const boundSkillId = contextPayload.skillIds.find((skillId) => availableSkillIds.has(skillId))
  const currentSkillId =
    boundSkillId ?? (availableSkillIds.has(selectedSkillId) ? selectedSkillId : skills[0]?.id ?? selectedSkillId)
  const currentSkill = useMemo(
    () => materialSkillDefinitionFor(currentSkillId, skills),
    [currentSkillId, skills],
  )
  const normalizedSkillInputs = useMemo(() => {
    const inferredTopic = skillInputValues.topic || title.trim() || inferTopic(commandPrompt)
    return normalizeSkillInputValues(currentSkill, {
      ...skillInputValues,
      ...(inferredTopic ? { topic: inferredTopic } : {}),
    })
  }, [commandPrompt, currentSkill, skillInputValues, title])
  const promptBudget = useMemo(
    () => {
      const sourceType = sourceInput?.sourceType ?? (fileName ? inferSourceTypeFromFileName(fileName) : undefined)
      const sourceText = cleanMaterialText(rawText)
      const limits = materialAgentPromptBudgetLimits({
        sourceType,
        sourceChars: sourceText.length,
      })
      return applyPromptBudget({
        prompt: commandPrompt,
        sourceText,
        skillInstructionChars: 6000,
        referencesChars: mentionResult.known.length * 300,
        ...limits,
      })
    },
    [commandPrompt, fileName, mentionResult.known.length, rawText, sourceInput?.sourceType],
  )
  const harnessPreview = useMemo(() => {
    const previewSourceText = cleanMaterialText(sourceInput?.text || rawText)
    const previewSourceType = sourceInput?.sourceType ?? (fileName ? inferSourceTypeFromFileName(fileName) : "text")
    const toolPlan = buildAgentToolPlan({
      sourceType: previewSourceType,
      originalName: fileName || sourceInput?.originalName,
      sourceChars: previewSourceText.length,
      instruction: commandPrompt,
      skillId: currentSkill.id,
      adapterCapabilities: activeAdapter?.capabilities ?? [],
    })
    const workflowPlan = buildAgentWorkflowPlan({
      sourceType: previewSourceType,
      sourceChars: previewSourceText.length,
      instruction: commandPrompt,
      skillId: currentSkill.id,
    })
    const memory = buildAgentMemorySnapshot({
      runs: storedRuns,
      inboxDrafts,
      sources,
      learningAssetStats,
    })
    return {
      sourceChars: previewSourceText.length,
      sourceType: previewSourceType,
      toolPlan,
      workflowPlan,
      memory,
    }
  }, [
    activeAdapter?.capabilities,
    commandPrompt,
    currentSkill.id,
    fileName,
    inboxDrafts,
    learningAssetStats,
    rawText,
    sourceInput,
    sources,
    storedRuns,
  ])

  useEffect(() => {
    let cancelled = false
    void loadTauriAgentRuntime()
      .then(async (runtime) => {
        const runtimeSkills = await runtime.listManagedSkills().catch(() => runtime.listSkills())
        if (!cancelled && runtimeSkills.length > 0) {
          const enriched = mergeRuntimeSkills(runtimeSkills, false).filter((skill) => skill.enabled !== false)
          setSkills(enriched)
          setSelectedSkillId((current) => (enriched.some((skill) => skill.id === current) ? current : enriched[0]?.id ?? current))
        }
      })
      .catch(() => {
        if (!cancelled) setSkills(fallbackAgentSkills())
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    void refreshLocalData()
  }, [])

  useEffect(() => {
    void refreshMineruStatus()
  }, [])

  useEffect(() => {
    mountedRef.current = true

    const applySnapshot = (snapshot: ReturnType<typeof getMaterialWorkbenchSessionSnapshot>) => {
      const hasUserWorkbenchContent =
        snapshot.title.trim().length > 0 ||
        snapshot.rawText.trim().length > 0 ||
        snapshot.fileName.trim().length > 0 ||
        Boolean(snapshot.sourceInput) ||
        Boolean(snapshot.draft) ||
        Boolean(snapshot.selectedMaterialFile) ||
        snapshot.selectedMaterialFiles.length > 0
      const nextCommandPrompt =
        !hasUserWorkbenchContent && snapshot.commandPrompt === QUICK_ACTIONS[0].prompt ? "" : snapshot.commandPrompt

      setTitleState(snapshot.title)
      setRawTextState(snapshot.rawText)
      setFileNameState(snapshot.fileName)
      setSelectedSkillIdState(snapshot.selectedSkillId || "gongkao-hotspot-collector")
      setCommandPromptState(nextCommandPrompt)
      setSkillInputValuesState(snapshot.skillInputValues)
      setSelectionState(snapshot.selection)
      setSourceInputState(snapshot.sourceInput)
      setDraftState(snapshot.draft)
      setShenlunDocumentTypeState(snapshot.shenlunDocumentType)
      setSelectedMaterialFileState(snapshot.selectedMaterialFile)
      setSelectedMaterialFilesState(snapshot.selectedMaterialFiles)
      setUploadedFileStatusState(snapshot.uploadedFileStatus)
      setPdfParseProgressState(snapshot.pdfParseProgress)
      setPdfParseLogsState(snapshot.pdfParseLogs)
      setProcessingState(snapshot.processing)
      setActiveRunIdState(snapshot.activeRunId)
      setAgentEventsState(snapshot.agentEvents)
      setRunQueueState(snapshot.runQueue)
      setChatMessagesState(snapshot.chatMessages)
    }

    if (hasMaterialWorkbenchSession()) {
      applySnapshot(getMaterialWorkbenchSessionSnapshot())
    } else {
      const restored = parseMaterialWorkbenchState(
        typeof window === "undefined" ? null : window.localStorage.getItem(MATERIAL_WORKBENCH_STATE_KEY),
      )
      if (restored) {
        applySnapshot(
          patchMaterialWorkbenchSession({
            ...restored,
            uploadedFileStatus: restored.sourceInput ? "parsed" : "idle",
          }),
        )
      } else {
        applySnapshot(
          patchMaterialWorkbenchSession({
            selectedSkillId: "gongkao-hotspot-collector",
            commandPrompt: "",
            selection: {
              flashcards: true,
              questions: true,
              copybookItems: true,
            },
          }),
        )
      }
    }

    const unsubscribe = subscribeMaterialWorkbenchSession(applySnapshot)
    setWorkbenchRestored(true)
    return () => {
      mountedRef.current = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!workbenchRestored || typeof window === "undefined") return
    window.localStorage.setItem(
      MATERIAL_WORKBENCH_STATE_KEY,
      serializeMaterialWorkbenchState({
        title,
        rawText,
        fileName,
        selectedSkillId,
        commandPrompt,
        skillInputValues,
        selection,
        sourceInput,
        draft,
        chatMessages,
      }),
    )
  }, [
    chatMessages,
    commandPrompt,
    draft,
    fileName,
    rawText,
    selectedSkillId,
    selection,
    skillInputValues,
    sourceInput,
    title,
    workbenchRestored,
  ])

  const refreshLocalData = async () => {
    try {
      const [nextRuns, nextInbox, nextSources, flashcards, questions, copybookItems, provenance, topicAssets] = await Promise.all([
        agentRepository.getRuns(),
        materialInboxRepository.getDrafts(),
        materialRepository.getSources(),
        materialRepository.getFlashcards(),
        materialRepository.getQuestions(),
        copybookRepository.getItems(),
        shenlunRepository.getLearningProvenance(),
        shenlunRepository.getTopicAssets(),
      ])
      const syncedRuns = await refreshAgentRunStatuses(nextRuns)
      setStoredRuns(syncedRuns.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 8))
      setInboxDrafts(nextInbox.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8))
      setSources(nextSources.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6))
      const counts: Record<string, { cards: number; questions: number; copybook: number }> = {}
      for (const source of nextSources) counts[source.id] = { cards: 0, questions: 0, copybook: 0 }
      for (const card of flashcards) counts[card.sourceId] = { ...(counts[card.sourceId] ?? { cards: 0, questions: 0, copybook: 0 }), cards: (counts[card.sourceId]?.cards ?? 0) + 1 }
      for (const question of questions) counts[question.sourceId] = { ...(counts[question.sourceId] ?? { cards: 0, questions: 0, copybook: 0 }), questions: (counts[question.sourceId]?.questions ?? 0) + 1 }
      for (const item of copybookItems) counts[item.sourceId] = { ...(counts[item.sourceId] ?? { cards: 0, questions: 0, copybook: 0 }), copybook: (counts[item.sourceId]?.copybook ?? 0) + 1 }
      setSourceCounts(counts)
      setLearningAssetStats({
        provenance: provenance.length,
        topics: topicAssets.length,
        needsReview: provenance.filter((item) => item.reviewState === "needs_review").length,
      })
    } catch {
      // IndexedDB is not available during some static previews. The sample cards still render.
    }
  }

  const refreshMineruStatus = async () => {
    try {
      const runtime = await loadTauriMaterialParserRuntime()
      setMineruStatus(await runtime.getMineruStatus())
    } catch {
      setMineruStatus(null)
    }
  }

  const processInput = async (input: MaterialFileInput) => {
    const cleaned = cleanMaterialText(input.text)
    if (cleaned.length < 20) {
      toast.error("素材文本太短，无法生成训练内容")
      return
    }

    setProcessing(true)
    try {
      const nextDraft = await processMaterialText(cleaned)
      const errors = validateMaterialDraft(nextDraft)
      if (errors.length > 0) {
        toast.error(errors[0])
        return
      }
      const inferredDocumentType = inferShenlunDocumentType(`${input.originalName ?? ""} ${input.title} ${cleaned.slice(0, 160)}`)
      if (shenlunDocumentType === "commentary" && inferredDocumentType !== "commentary") {
        setShenlunDocumentType(inferredDocumentType)
      }
      setSourceInput({ ...input, text: cleaned })
      setDraft(nextDraft)
      toast.success("素材已加工完成，请确认导入内容")
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : "素材加工失败")
    } finally {
      setProcessing(false)
    }
  }

  const handleTextProcess = async () => {
    await processInput({
      title: title.trim() || "粘贴素材",
      sourceType: "text",
      text: rawText,
    })
  }

  const handleFile = (file: File | undefined) => {
    if (!file) return
    const sourceType = inferSourceTypeFromFileName(file.name)
    fileParseVersionRef.current += 1
    setSelectedMaterialFile(file)
    setSelectedMaterialFiles([file])
    setUploadedFileStatus("ready")
    setFileName(file.name)
    setSourceInput(null)
    setDraft(null)
    setRawText("")
    setPdfParseLogs([])
    setPdfParseProgress(null)
    setTitle((current) => current || file.name.replace(/\.[^.]+$/, ""))
    toast.success(sourceType === "pdf" ? "PDF 已上传，点击开始整理后再解析" : "文件已上传，点击开始整理后再解析")
  }

  const handleFiles = (files: FileList | File[] | null | undefined) => {
    const nextFiles = Array.from(files ?? []).filter(Boolean)
    if (nextFiles.length === 0) return
    if (nextFiles.length === 1) {
      handleFile(nextFiles[0])
      return
    }

    const primaryFile = nextFiles[0] ?? null
    fileParseVersionRef.current += 1
    setSelectedMaterialFile(primaryFile)
    setSelectedMaterialFiles(nextFiles)
    setUploadedFileStatus("ready")
    setFileName(formatMaterialFileQueueName(nextFiles))
    setSourceInput(null)
    setDraft(null)
    setRawText("")
    setPdfParseLogs([])
    setPdfParseProgress(null)
    setTitle((current) => current || (primaryFile ? primaryFile.name.replace(/\.[^.]+$/, "") : "批量素材"))
    toast.success(`已选择 ${nextFiles.length} 个文件，点击开始整理后会按顺序解析`)
  }

  const clearParsedMaterialFile = () => {
    fileParseVersionRef.current += 1
    const fileTitle = fileName.replace(/\.[^.]+$/, "")
    setSelectedMaterialFile(null)
    setSelectedMaterialFiles([])
    setUploadedFileStatus("idle")
    setFileName("")
    setSourceInput(null)
    setDraft(null)
    setRawText("")
    setPdfParseLogs([])
    setPdfParseProgress(null)
    if (fileTitle) {
      setTitle((current) => (current === fileTitle ? "" : current))
    }
    toast.success("已移除当前解析文档")
  }

  const parseSelectedMaterialFile = async (file: File): Promise<MaterialFileInput> => {
    const parseVersion = fileParseVersionRef.current
    const sourceType = inferSourceTypeFromFileName(file.name)
    const parseRunId = sourceType === "pdf" && isDesktopTauriEnvironment() ? createPdfParseRunId() : undefined
    let unlistenPdfParseProgress: (() => void) | undefined
    if (parseRunId) {
      setPdfParseLogs([])
      setPdfParseProgress({
        runId: parseRunId,
        parser: "codex-pdf-skill",
        stage: "preparing",
        status: "running",
        message: "Waiting for Codex PDF Skill parser to start.",
        percentage: 5,
      })
      try {
        const runtime = await loadTauriMaterialParserRuntime()
        unlistenPdfParseProgress = await runtime.onPdfSkillParseProgress((progress) => {
          if (fileParseVersionRef.current !== parseVersion) return
          if (progress.runId !== parseRunId) return
          setPdfParseProgress(progress)
          if (progress.logLine) {
            setPdfParseLogs((current) => [...current, progress.logLine as string].slice(-12))
          }
        })
      } catch {
        // Browser mode still falls back to PDF.js and does not emit desktop progress events.
      }
    }
    setUploadedFileStatus("parsing")
    try {
      const input = await extractMaterialFile(file, { parseRunId })
      if (fileParseVersionRef.current !== parseVersion) {
        const staleError = new Error("Current material file parse was cleared.")
        staleError.name = "StaleMaterialFileParseError"
        throw staleError
      }
      const cleaned = cleanMaterialText(input.text)
      if (cleaned.length < 20) {
        throw new Error("文件解析后文本太短，无法生成训练内容；请检查 PDF 是否为空白或加密")
      }
      const parsedInput = { ...input, text: cleaned }
      const inferredDocumentType = inferShenlunDocumentType(`${file.name} ${input.title} ${cleaned.slice(0, 160)}`)
      setShenlunDocumentType(inferredDocumentType)
      setTitle((current) => current || input.title)
      setRawText(cleaned)
      setSourceInput(parsedInput)
      setUploadedFileStatus("parsed")
      toast.success("文件解析完成，已写入当前对话")
      return parsedInput
    } catch (error) {
      if (fileParseVersionRef.current !== parseVersion || (error instanceof Error && error.name === "StaleMaterialFileParseError")) {
        throw error
      }
      console.error(error)
      setUploadedFileStatus("failed")
      if (parseRunId) {
        const message = error instanceof Error ? error.message : "PDF parse failed."
        setPdfParseProgress((current) =>
          current?.runId === parseRunId
            ? {
                ...current,
                stage: "failed",
                status: "failed",
                message,
                percentage: 100,
              }
            : current,
        )
      }
      toast.error(error instanceof Error ? error.message : "文件解析失败；请检查 Codex CLI、PDF Skill 和本地 PDF 依赖是否可用")
      throw error
    } finally {
      unlistenPdfParseProgress?.()
    }
  }

  const parseSelectedMaterialFiles = async (files: File[]): Promise<MaterialFileInput> => {
    const parseVersion = fileParseVersionRef.current
    setUploadedFileStatus("parsing")
    setPdfParseLogs([])
    setPdfParseProgress(null)
    const parsedFiles: MaterialFileInput[] = []

    for (let index = 0; index < files.length; index += 1) {
      if (fileParseVersionRef.current !== parseVersion) {
        const staleError = new Error("Current material file parse was cleared.")
        staleError.name = "StaleMaterialFileParseError"
        throw staleError
      }
      const file = files[index] as File
      setFileName(`${formatMaterialFileQueueName(files)} · ${index + 1}/${files.length} ${file.name}`)
      parsedFiles.push(await parseSelectedMaterialFile(file))
    }

    const combinedInput = combineMaterialFileInputs(parsedFiles, files)
    setFileName(combinedInput.originalName ?? formatMaterialFileQueueName(files))
    setRawText(combinedInput.text)
    setSourceInput(combinedInput)
    setUploadedFileStatus("parsed")
    setShenlunDocumentType(inferShenlunDocumentType(`${combinedInput.title} ${combinedInput.text.slice(0, 160)}`))
    toast.success(`已解析 ${files.length} 个文件，已合并写入当前对话`)
    return combinedInput
  }

  const installMineruRuntime = async () => {
    setMineruInstalling(true)
    setMineruInstallLogs([])
    try {
      const runtime = await loadTauriMaterialParserRuntime()
      const result = await runtime.installMineruRuntime({ useChinaMirror: true })
      setMineruStatus(result.status)
      setMineruInstallLogs(result.logs)
      if (!result.status.ready) {
        toast.error("MinerU 安装完成但验证未通过，请查看安装日志")
        return
      }
      toast.success("本地 PDF 解析引擎已就绪")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "MinerU 安装失败")
    } finally {
      setMineruInstalling(false)
    }
  }

  const handleAgentProcess = async () => {
    if (skills.length === 0) {
      toast.error("请先在 Skill 管理中启用至少一个素材 Skill")
      return
    }
    let runSourceInput = sourceInput
    let runRawText = rawText
    let runFileName = fileName
    let runTitle = title.trim()
    const queuedMaterialFiles = selectedMaterialFiles.length > 0 ? selectedMaterialFiles : selectedMaterialFile ? [selectedMaterialFile] : []
    const queuedFileName = formatMaterialFileQueueName(queuedMaterialFiles)

    if (
      queuedMaterialFiles.length > 0 &&
      (uploadedFileStatus !== "parsed" || sourceInput?.originalName !== queuedFileName)
    ) {
      setProcessing(true)
      try {
        const parsedFile =
          queuedMaterialFiles.length > 1
            ? await parseSelectedMaterialFiles(queuedMaterialFiles)
            : await parseSelectedMaterialFile(queuedMaterialFiles[0] as File)
        runSourceInput = parsedFile
        runRawText = parsedFile.text
        runFileName = parsedFile.originalName ?? queuedFileName
        runTitle = title.trim() || parsedFile.title
      } catch {
        setProcessing(false)
        return
      }
    }

    const runInferredTopic = skillInputValues.topic || runTitle || inferTopic(commandPrompt)
    const runNormalizedSkillInputs = normalizeSkillInputValues(currentSkill, {
      ...skillInputValues,
      ...(runInferredTopic ? { topic: runInferredTopic } : {}),
    })
    const skillValidation = validateSkillExecution(
      currentSkill,
      runNormalizedSkillInputs,
      activeAdapter?.capabilities ?? [],
    )
    if (!skillValidation.ok) {
      toast.error(skillValidation.errors[0])
      setProcessing(false)
      return
    }
    const runSourceType = runSourceInput?.sourceType ?? (runFileName ? inferSourceTypeFromFileName(runFileName) : "text")
    const runSourceText = cleanMaterialText(runRawText)
    const runBudgetLimits = materialAgentPromptBudgetLimits({
      sourceType: runSourceType,
      sourceChars: runSourceText.length,
    })
    const runPromptBudget = applyPromptBudget({
      prompt: commandPrompt,
      sourceText: runSourceText,
      skillInstructionChars: 6000,
      referencesChars: mentionResult.known.length * 300,
      ...runBudgetLimits,
    })
    if (runPromptBudget.blocked) {
      toast.error(runPromptBudget.errors[0])
      setProcessing(false)
      return
    }

    const cleanedSource = runPromptBudget.sourceText
    const runToolPlan = buildAgentToolPlan({
      sourceType: runSourceType,
      originalName: runFileName || runSourceInput?.originalName,
      sourceChars: runSourceText.length,
      instruction: commandPrompt,
      skillId: currentSkill.id,
      adapterCapabilities: activeAdapter?.capabilities ?? [],
    })
    const runMemory = buildAgentMemorySnapshot({
      runs: storedRuns,
      inboxDrafts,
      sources,
      learningAssetStats,
    })
    const runWorkflowPlan = buildAgentWorkflowPlan({
      sourceType: runSourceType,
      sourceChars: runSourceText.length,
      instruction: commandPrompt,
      skillId: currentSkill.id,
    })
    const runContextMap = buildAgentContextMap({
      title: runTitle || runSourceInput?.title || String(runNormalizedSkillInputs.topic ?? "Agent 采集素材"),
      sourceType: runSourceType,
      originalName: runFileName || runSourceInput?.originalName,
      sourceText: cleanedSource,
      boundContext: contextPayload,
      promptBudget: {
        originalSourceChars: cleanMaterialText(runRawText).length,
        finalSourceChars: cleanedSource.length,
        totalChars: runPromptBudget.estimate.totalChars,
        warnings: runPromptBudget.warnings,
      },
    })
    const runGoal = commandPrompt.trim() || `整理 ${runTitle || runSourceInput?.title || "当前素材"}`
    const runTaskPlan = buildAgentTaskPlan({
      runGoal,
      skill: {
        id: currentSkill.id,
        name: currentSkill.name,
        trust: currentSkill.trust,
        source: currentSkill.source,
        requiredPermissions: [...currentSkill.requiredPermissions],
      },
      contextMap: runContextMap,
      toolPlan: runToolPlan,
      memory: runMemory,
      workflowPlan: runWorkflowPlan,
    })
    const harnessContext = {
      taskPlan: runTaskPlan,
      toolPlan: runToolPlan,
      contextMap: runContextMap,
      memory: runMemory,
      workflowPlan: runWorkflowPlan,
    }
    const request: StartMaterialAgentRunRequest = {
      adapterId: agentExecutor.adapterId,
      model: agentExecutor.model,
      reasoning: agentExecutor.reasoning,
      skillId: currentSkill.id,
      title: runTitle || runSourceInput?.title || String(runNormalizedSkillInputs.topic ?? "Agent 采集素材"),
      topic: String(runNormalizedSkillInputs.topic ?? (runTitle || inferTopic(commandPrompt) || "公考热点素材")),
      sourceText: cleanedSource,
      sourceType: runSourceType,
      originalName: runFileName || runSourceInput?.originalName || undefined,
      userInstruction: commandPrompt,
      skillInputValues: runNormalizedSkillInputs,
      context: {
        ...contextPayload,
        harness: harnessContext,
      },
      requiredCapabilities: currentSkill.requiredCapabilities,
      adapterCapabilities: activeAdapter?.capabilities ?? [],
      skillTrust: currentSkill.trust,
      skillSource: currentSkill.source,
      requiredPermissions: [...currentSkill.requiredPermissions],
      promptBudget: {
        originalSourceChars: cleanMaterialText(runRawText).length,
        finalSourceChars: cleanedSource.length,
        totalChars: runPromptBudget.estimate.totalChars,
        warnings: runPromptBudget.warnings,
      },
    }

    const errors = canStartMaterialAgentRun(request)
    if (errors.length > 0) {
      toast.error(errors[0])
      setProcessing(false)
      return
    }
    for (const warning of runPromptBudget.warnings) toast.warning(warning)

    const submittedPrompt = commandPrompt
    const tempRunId = `queued-${Date.now()}`
    const userChatMessage = createMaterialUserMessage({
      content: submittedPrompt,
      attachments: buildMaterialChatFileAttachments({
        fileName: runFileName || runSourceInput?.originalName || queuedFileName,
        fileCount: queuedMaterialFiles.length,
        status: runSourceInput ? "parsed" : queuedMaterialFiles.length > 0 ? "ready" : undefined,
      }),
    })
    const assistantChatMessage = createMaterialAssistantMessage({
      content: summarizeAgentTaskPlan(runTaskPlan),
      status: "queued",
      taskPlan: runTaskPlan,
    })
    const assistantMessageId = assistantChatMessage.id
    setChatMessages((current) => appendMaterialChatMessages(current, [userChatMessage, assistantChatMessage]))
    appendAssistantChatEvent(
      assistantMessageId,
      createMaterialChatEvent({
        runId: tempRunId,
        type: "status",
        label: "任务计划",
        message: summarizeAgentTaskPlan(runTaskPlan),
        severity: "info",
      }),
    )
    for (const warning of taskPlanWarningMessages(runTaskPlan)) {
      appendAssistantChatEvent(
        assistantMessageId,
        createMaterialChatEvent({
          runId: tempRunId,
          type: "validation",
          label: "计划提示",
          message: warning,
          severity: "warning",
        }),
      )
    }
    setCommandPrompt("")

    setProcessing(true)
    setAgentEvents([])
    setActiveRunId("")
    upsertRunTask({
      id: tempRunId,
      title: request.title,
      skillId: request.skillId,
      adapterLabel: displayAgentExecutor(agentExecutor),
      status: "queued",
      startedAt: new Date().toISOString(),
      summary: "等待 Tauri Agent runtime 创建隔离工作区",
      logs: ["queued: 准备创建 run workspace"],
    })
    appendRunLog(tempRunId, `tool-plan: ${runToolPlan.primaryToolId} -> ${runToolPlan.fallbackToolIds.join(", ") || "no fallback"}`)
    appendRunLog(tempRunId, `workflow: ${runWorkflowPlan.mode}`)

    let clearRunTimeout: (() => void) | undefined
    let startedRun: { runId: string; workspacePath: string } | undefined
    try {
      const timeout = window.setTimeout(
        () => toast.error("Agent 运行超时，请检查本地 CLI 状态。"),
        10 * 60 * 1000,
      )
      clearRunTimeout = () => window.clearTimeout(timeout)
      const result = await runMaterialAgentChat(request, {
        onStarted: async (started) => {
          startedRun = started
          setActiveRunId(started.runId)
          replaceRunTaskId(tempRunId, started.runId, started.workspacePath)
          updateRunTask(started.runId, { status: "running", summary: "Agent 正在处理素材", hasTrace: true })
          const startedEvent = appendLocalRunEvent(started.runId, "running", `本地 CLI 已启动，工作区：${started.workspacePath}`)
          appendRunEventToAssistant(assistantMessageId, startedEvent)
          await agentRepository.saveRun({
            id: started.runId,
            adapterId: toPersistedAdapterId(request.adapterId),
            skillId: request.skillId,
            status: "running",
            title: request.title,
            startedAt: new Date().toISOString(),
            workspacePath: started.workspacePath,
            summary: "Agent 正在处理素材",
            hasTrace: true,
          })
        },
        onEvent: (event) => {
          setAgentEvents((current) => [...current, event].slice(-120))
          appendRunLog(event.runId, `[${event.kind}] ${event.message}`)
          appendRunEventToAssistant(assistantMessageId, event)
          if (event.kind === "completed") {
            updateRunTask(event.runId, { status: "validating", summary: "正在读取并校验 material-draft.json" })
          }
        },
      })
      if (startedRun) {
        const validationEvent = appendLocalRunEvent(startedRun.runId, "validating", "正在读取并校验 material-draft.json")
        appendRunEventToAssistant(assistantMessageId, validationEvent)
        updateRunTask(startedRun.runId, { status: "validating", summary: "正在读取并校验 material-draft.json" })
      }
      const completedRun = startedRun ?? { runId: result.runId, workspacePath: result.workspacePath }
      const parsed = parseAgentMaterialOutput(result.outputJson)
      if (!parsed.ok) {
        const summary = parsed.errors[0] ?? "Agent 输出未通过校验"
        appendRunEventToAssistant(assistantMessageId, appendLocalRunEvent(completedRun.runId, "failed", summary))
        await materialInboxRepository.saveDraft({
          id: crypto.randomUUID(),
          runId: completedRun.runId,
          status: "pending",
          createdAt: new Date().toISOString(),
          outputJson: result.outputJson,
          validationErrors: parsed.errors,
        })
        await agentRepository.saveRun({
          id: completedRun.runId,
          adapterId: toPersistedAdapterId(request.adapterId),
          skillId: request.skillId,
          status: "failed",
          title: request.title,
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
          workspacePath: result.workspacePath,
          summary,
          error: summary,
          hasTrace: true,
        })
        updateRunTask(completedRun.runId, { status: "failed", summary, hasTrace: true })
        toast.error(summary)
        await refreshLocalData()
        return
      }

      const nextDraft = toMaterialDraftFromAgentOutput(parsed.value)
      const draftErrors = validateMaterialDraft(nextDraft)
      if (draftErrors.length > 0) {
        const summary = draftErrors[0]
        appendRunEventToAssistant(assistantMessageId, appendLocalRunEvent(completedRun.runId, "failed", summary))
        await agentRepository.saveRun({
          id: completedRun.runId,
          adapterId: toPersistedAdapterId(request.adapterId),
          skillId: request.skillId,
          status: "failed",
          title: request.title,
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
          workspacePath: result.workspacePath,
          summary,
          error: summary,
          hasTrace: true,
        })
        updateRunTask(completedRun.runId, { status: "failed", summary, hasTrace: true })
        toast.error(summary)
        return
      }

      setSourceInput(parsed.value.source)
      setDraft(nextDraft)
      const businessVerification = verifyAgentMaterialOutput({
        output: parsed.value,
        sourceType: runSourceType,
        originalSourceChars: cleanMaterialText(runRawText).length,
        finalSourceChars: cleanedSource.length,
      })
      if (!businessVerification.ok) {
        const summary = businessVerification.errors[0] ?? "Agent 输出未通过业务校验"
        appendRunEventToAssistant(assistantMessageId, appendLocalRunEvent(completedRun.runId, "failed", summary))
        await materialInboxRepository.saveDraft({
          id: crypto.randomUUID(),
          runId: completedRun.runId,
          status: "pending",
          createdAt: new Date().toISOString(),
          outputJson: JSON.stringify(parsed.value, null, 2),
          validationErrors: businessVerification.errors,
          validationWarnings: businessVerification.warnings,
        })
        await agentRepository.saveRun({
          id: completedRun.runId,
          adapterId: toPersistedAdapterId(request.adapterId),
          skillId: request.skillId,
          status: "failed",
          title: request.title,
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
          workspacePath: result.workspacePath,
          summary,
          error: summary,
          hasTrace: true,
        })
        updateRunTask(completedRun.runId, { status: "failed", summary, hasTrace: true })
        toast.error(summary)
        await refreshLocalData()
        return
      }
      const inboxDraftId = crypto.randomUUID()
      await materialInboxRepository.saveDraft({
        id: inboxDraftId,
        runId: completedRun.runId,
        status: "pending",
        createdAt: new Date().toISOString(),
        outputJson: JSON.stringify(parsed.value, null, 2),
        validationErrors: [],
        validationWarnings: businessVerification.warnings,
      })
      await agentRepository.saveRun({
        id: completedRun.runId,
        adapterId: toPersistedAdapterId(request.adapterId),
        skillId: request.skillId,
        status: "waiting_review",
        title: request.title,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        workspacePath: result.workspacePath,
        summary:
          businessVerification.warnings.length > 0
            ? `候选素材已通过结构校验，业务复核提示 ${businessVerification.warnings.length} 条`
            : "候选素材已通过校验，等待确认入库",
        hasTrace: true,
      })
      for (const warning of businessVerification.warnings) {
        const warningEvent = appendLocalRunEvent(completedRun.runId, "log", `业务校验提示：${warning}`)
        appendAssistantChatEvent(
          assistantMessageId,
          createMaterialChatEvent({
            runId: completedRun.runId,
            type: "validation",
            label: "业务校验提示",
            message: warning,
            severity: "warning",
            timestamp: warningEvent.timestamp,
            rawKind: "log",
          }),
        )
      }
      const waitingReviewEvent = appendLocalRunEvent(completedRun.runId, "waiting_review", "候选素材已通过校验并进入 Inbox，等待人工确认入库")
      appendRunEventToAssistant(assistantMessageId, waitingReviewEvent)
      updateAssistantChatMessage(assistantMessageId, (message) => ({
        ...message,
        status: "waiting_review",
        outputSummary: {
          inboxDraftId,
          questionCount: nextDraft.practiceQuestions.length,
          flashcardCount: nextDraft.flashcards.length,
          sourceCount: 1,
          warnings: businessVerification.warnings,
        },
      }))
      updateRunTask(completedRun.runId, {
        status: "waiting_review",
        summary:
          businessVerification.warnings.length > 0
            ? `候选素材已进入 Inbox，需复核 ${businessVerification.warnings.length} 条提示`
            : "候选素材已进入 Inbox，等待确认入库",
        hasTrace: true,
      })
      await refreshLocalData()
      toast.success("Agent 已生成候选素材，请确认后入库")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Agent 素材处理失败"
      const failedRunId = startedRun?.runId ?? (activeRunId || tempRunId)
      appendRunEventToAssistant(assistantMessageId, appendLocalRunEvent(failedRunId, "failed", message))
      updateRunTask(failedRunId, { status: "failed", summary: message, hasTrace: Boolean(startedRun) })
      if (startedRun) {
        await agentRepository.saveRun({
          id: startedRun.runId,
          adapterId: toPersistedAdapterId(request.adapterId),
          skillId: request.skillId,
          status: "failed",
          title: request.title,
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
          workspacePath: startedRun.workspacePath,
          summary: message,
          error: message,
          hasTrace: true,
        })
      }
      toast.error(message)
    } finally {
      clearRunTimeout?.()
      setProcessing(false)
    }
  }

  const cancelActiveRun = async () => {
    if (!activeRunId) return
    try {
      const runtime = await loadTauriAgentRuntime()
      await runtime.cancelRun(activeRunId)
      updateRunTask(activeRunId, { status: "cancelled", summary: "用户已取消任务" })
      toast.success("已请求取消 Agent 任务")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "取消失败")
    }
  }

  const markInboxRunImported = async (runId: string) => {
    const drafts = await materialInboxRepository.getDrafts()
    await Promise.all(
      drafts
        .filter((item) => item.runId === runId && item.status === "pending")
        .map((item) => materialInboxRepository.markImported(item.id)),
    )
  }

  const saveImportedDraft = async ({
    draft,
    sourceInput,
    documentType,
    inboxDraftId,
    runId,
    titleOverride,
  }: {
    draft: MaterialDraft
    sourceInput: MaterialFileInput
    documentType: ShenlunDocumentType
    inboxDraftId?: string
    runId?: string
    titleOverride?: string
  }) => {
    const bundle = buildImportBundle(
      {
        ...sourceInput,
        title: titleOverride?.trim() || sourceInput.title || draft.topic,
        sourceType: sourceInput.originalName ? inferSourceTypeFromFileName(sourceInput.originalName) : sourceInput.sourceType,
      },
      draft,
    )

    await materialRepository.saveImportBundle({
      source: bundle.source,
      flashcards: selection.flashcards ? bundle.flashcards : [],
      questions: selection.questions ? bundle.questions : [],
      copybookItems: selection.copybookItems ? bundle.copybookItems : [],
    })

    await saveShenlunTrainingAssets({
      bundle,
      documentType,
      includeQuestions: selection.questions,
    })

    if (inboxDraftId) {
      await materialInboxRepository.markImported(inboxDraftId)
    } else if (runId) {
      await markInboxRunImported(runId)
    }

    await refreshLocalData()
  }

  const importDraft = async () => {
    if (!draft || !sourceInput) return

    await saveImportedDraft({
      draft,
      sourceInput,
      documentType: shenlunDocumentType,
      runId: activeRunId,
      titleOverride: title,
    })
    toast.success(
      shenlunDocumentType === "exam_paper" || shenlunDocumentType === "single_question"
        ? "素材已导入，并同步生成申论训练资产"
        : "素材已导入本地题库",
    )
  }

  const importInboxDraft = async (inboxDraft: MaterialInboxDraft) => {
    if (importingInboxDraftId) return

    const parsed = parseAgentMaterialOutput(inboxDraft.outputJson)
    if (!parsed.ok) {
      toast.error(parsed.errors[0] ?? "候选素材未通过结构校验，无法入库")
      return
    }

    const nextDraft = toMaterialDraftFromAgentOutput(parsed.value)
    const draftErrors = validateMaterialDraft(nextDraft)
    if (draftErrors.length > 0) {
      toast.error(draftErrors[0])
      return
    }

    const nextSourceInput: MaterialFileInput = parsed.value.source
    const inferredDocumentType = inferShenlunDocumentType(
      `${nextSourceInput.originalName ?? ""} ${nextSourceInput.title} ${nextSourceInput.text.slice(0, 160)}`,
    )
    const nextDocumentType =
      shenlunDocumentType === "commentary" && inferredDocumentType !== "commentary"
        ? inferredDocumentType
        : shenlunDocumentType

    setImportingInboxDraftId(inboxDraft.id)
    try {
      await saveImportedDraft({
        draft: nextDraft,
        sourceInput: nextSourceInput,
        documentType: nextDocumentType,
        inboxDraftId: inboxDraft.id,
        runId: inboxDraft.runId,
      })
      setSourceInput(nextSourceInput)
      setDraft(nextDraft)
      setTitle(nextSourceInput.title || nextDraft.topic)
      setShenlunDocumentType(nextDocumentType)
      toast.success(
        nextDocumentType === "exam_paper" || nextDocumentType === "single_question"
          ? "候选素材已入库，并同步生成申论训练资产"
          : "候选素材已导入本地题库",
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "候选素材入库失败")
    } finally {
      setImportingInboxDraftId("")
    }
  }

  const applyQuickAction = (action: (typeof QUICK_ACTIONS)[number]) => {
    if (!availableSkillIds.has(action.skillId)) {
      toast.error("该 Skill 尚未启用，请先到 Skill 管理中开启")
      return
    }
    setSelectedSkillId(action.skillId)
    setCommandPrompt(action.prompt)
    setSkillInputValues((current) => ({
      ...current,
      topic: inferTopic(action.prompt) || current.topic,
    }))
  }

  const updateCommandCursor = (target: HTMLTextAreaElement) => {
    setCommandCursor(target.selectionStart ?? target.value.length)
  }

  const completeSkillMention = (match: MaterialContextEntity) => {
    if (!activeSkillMention) return
    const replacement = `@Skill:${match.value} `
    const nextPrompt =
      commandPrompt.slice(0, activeSkillMention.tokenStart) +
      replacement +
      commandPrompt.slice(activeSkillMention.tokenEnd)
    const nextCursor = activeSkillMention.tokenStart + replacement.length

    setCommandPrompt(nextPrompt)
    setCommandCursor(nextCursor)
    setSelectedSkillId(match.value)
    window.requestAnimationFrame(() => {
      commandTextareaRef.current?.focus()
      commandTextareaRef.current?.setSelectionRange(nextCursor, nextCursor)
    })
  }

  const handleCommandKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Tab" || !activeSkillMention || activeSkillMention.matches.length === 0) return
    event.preventDefault()
    if (activeSkillMention.matches.length === 1) {
      completeSkillMention(activeSkillMention.matches[0])
    }
  }

  const upsertRunTask = (task: RunCenterItem) => {
    setRunQueue((current) => [task, ...current.filter((item) => item.id !== task.id)].slice(0, 8))
  }

  const replaceRunTaskId = (oldId: string, newId: string, workspacePath: string) => {
    setRunQueue((current) =>
      current.map((task) => (task.id === oldId ? { ...task, id: newId, workspacePath } : task)),
    )
  }

  const updateRunTask = (id: string, patch: Partial<RunCenterItem>) => {
    setRunQueue((current) => current.map((task) => (task.id === id ? { ...task, ...patch } : task)))
  }

  const appendRunLog = (id: string, line: string) => {
    setRunQueue((current) =>
      current.map((task) => (task.id === id ? { ...task, logs: [...task.logs, line].slice(-8) } : task)),
    )
  }

  const updateAssistantChatMessage = (messageId: string, updater: (message: MaterialChatMessage) => MaterialChatMessage) => {
    setChatMessages((current) => updateMaterialChatMessage(current, messageId, updater))
  }

  const appendAssistantChatEvent = (
    messageId: string,
    event: MaterialChatEvent,
    patch?: Partial<Pick<MaterialChatMessage, "status" | "runId" | "content" | "outputSummary">>,
  ) => {
    updateAssistantChatMessage(messageId, (message) => appendMaterialChatEvent(message, event, patch))
  }

  const appendRunEventToAssistant = (messageId: string, event: AgentRunEvent) => {
    updateAssistantChatMessage(messageId, (message) => updateAssistantMessageFromRunEvent(message, event))
  }

  const appendLocalRunEvent = (runId: string, kind: AgentRunEvent["kind"], message: string) => {
    const event = createLocalAgentRunEvent(runId, kind, message)
    setAgentEvents((current) => [...current, event].slice(-120))
    appendRunLog(runId, `[${event.kind}] ${event.message}`)
    return event
  }

  const recentProjects = sources.length > 0 ? sources.slice(0, 3) : null
  const displayedRunQueue = runQueue.length > 0 ? runQueue : storedRuns.map(runRecordToCenterItem).slice(0, 3)
  const runProcessSteps = useMemo(() => buildAgentRunProcessTimeline(agentEvents), [agentEvents])

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-6 lg:p-8">
      <MaterialsSecondaryNav />
      <section className="overflow-hidden rounded-lg border bg-card shadow-sm">
        <div className="bg-[radial-gradient(circle_at_15%_0%,rgba(140,0,0,0.07),transparent_35%),radial-gradient(circle_at_82%_15%,rgba(0,77,64,0.07),transparent_32%)] p-5 lg:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <Badge className="bg-primary/10 text-primary hover:bg-primary/10">素材知识库 · Agent 工作台</Badge>
              <h1 className="mt-4 font-serif text-3xl font-bold tracking-tight">今天要积累什么申论素材？</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                输入主题、网址、文件线索或直接粘贴材料。Agent 只生成候选素材，最终入库仍由本应用校验、预览和确认。
              </p>
            </div>
            <div className="rounded-md border bg-background/80 p-3 text-xs text-muted-foreground">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-foreground">{displayAgentExecutor(agentExecutor)}</div>
                  <div className="mt-1">{activeAdapter ? displayAgentStatus(activeAdapter) : "Agent 状态未知"}</div>
                  {activeAdapter?.version ? <div className="mt-1 truncate text-[11px]">{activeAdapter.version}</div> : null}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label="重新检测本地 Agent 状态"
                  disabled={agentAdaptersChecking}
                  onClick={refreshAgentAdapters}
                >
                  <RefreshCw className={cn("size-3.5", agentAdaptersChecking && "animate-spin")} />
                </Button>
              </div>
              {activeAdapter?.path ? <div className="mt-2 max-w-[360px] truncate text-[11px]">{activeAdapter.path}</div> : null}
            </div>
          </div>

          <MaterialChatPane
            messages={chatMessages}
            traceSteps={runProcessSteps}
            activeRunId={activeRunId}
            processing={processing}
          />

          <div className="mt-5 rounded-lg border bg-background p-2 shadow-sm transition-shadow focus-within:border-primary/60 focus-within:shadow-md">
            <div className="flex flex-wrap items-center justify-between gap-3 px-2 pb-2 pt-1">
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Bot className="size-4" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">{currentSkill.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{currentSkill.scenario} · {currentSkill.outputs.slice(0, 3).join(" / ")}</div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="h-7 rounded-full bg-background px-3">
                  {displayAgentExecutor(agentExecutor)}
                </Badge>
                <Badge variant="outline" className="h-7 rounded-full bg-background px-3">
                  {promptBudget.estimate.totalChars.toLocaleString()} chars
                </Badge>
              </div>
            </div>

            {(uploadedFileStatus !== "idle" && fileName) ||
            composerContextGroups.length > 0 ||
            visibleUnknownMentions.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 border-t border-dashed px-2 py-2">
                <UploadedFileStatusBadge fileName={fileName} status={uploadedFileStatus} onClear={clearParsedMaterialFile} />
                {composerContextGroups.map((group) =>
                  group.items.map((mention) => (
                    <Badge key={mention.id} variant="outline" className="gap-1 rounded-md bg-muted/30">
                      <span className="text-muted-foreground">{group.label}</span>
                      <span>{mention.label}</span>
                    </Badge>
                  )),
                )}
                {visibleUnknownMentions.map((mention) => (
                  <Badge key={mention} variant="outline" className="rounded-md border-destructive/30 text-destructive">
                    未识别 {mention}
                  </Badge>
                ))}
              </div>
            ) : null}

            <div className="relative">
              <Textarea
                ref={commandTextareaRef}
                value={commandPrompt}
                onChange={(event) => {
                  setCommandPrompt(event.target.value)
                  updateCommandCursor(event.target)
                }}
                onClick={(event) => updateCommandCursor(event.currentTarget)}
                onKeyDown={handleCommandKeyDown}
                onKeyUp={(event) => updateCommandCursor(event.currentTarget)}
                onSelect={(event) => updateCommandCursor(event.currentTarget)}
                placeholder="例如：@Skill:热点采集器 @专题:数字乡村 采集近30天热点，整理成专题 Wiki、金句、温故卡和对策题。"
                spellCheck={false}
                className="min-h-[112px] max-h-[34vh] resize-none overflow-y-auto border-0 bg-transparent px-2 py-3 text-[15px] leading-relaxed shadow-none focus-visible:ring-0"
              />
              {activeSkillMention && activeSkillMention.matches.length > 0 ? (
                <div className="absolute left-2 top-[calc(100%-4px)] z-20 w-[min(460px,calc(100%-1rem))] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-xl">
                  <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">Skill suggestions</div>
                  <div className="max-h-64 overflow-auto py-1 text-xs">
                    {activeSkillMention.matches.map((match, index) => {
                      const primaryLabel = shouldDisplaySkillId(activeSkillMention.prefix) ? match.value : match.label || match.value
                      return (
                        <button
                          key={match.id}
                          type="button"
                          onClick={() => completeSkillMention(match)}
                          className={`flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left transition-colors hover:bg-primary/10 hover:text-primary ${
                            index === 0 ? "bg-primary/10 text-primary" : "text-foreground"
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{primaryLabel}</span>
                            <span className="block truncate text-[11px] text-muted-foreground">{match.value}</span>
                          </span>
                          <span className="shrink-0 rounded border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">
                            Tab
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-dashed px-2 py-2">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <Label
                  className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border bg-background text-muted-foreground shadow-xs transition-colors hover:border-primary/40 hover:bg-muted/40 hover:text-primary"
                  title="上传文件"
                  aria-label="上传文件"
                >
                  <Upload className="size-4" />
                  <input
                    className="hidden"
                    type="file"
                    accept=".txt,.md,.pdf"
                    multiple
                    onChange={(event) => {
                      handleFiles(event.target.files)
                      event.currentTarget.value = ""
                    }}
                  />
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9 shrink-0 rounded-full text-muted-foreground hover:text-primary"
                  title="绑定 Skill、专题、来源、题型和标签"
                  aria-label="绑定 Skill、专题、来源、题型和标签"
                  onClick={() => {
                    const textarea = commandTextareaRef.current
                    if (!textarea) return
                    const start = textarea.selectionStart ?? commandPrompt.length
                    const nextPrompt = `${commandPrompt.slice(0, start)}@${commandPrompt.slice(start)}`
                    setCommandPrompt(nextPrompt)
                    const nextCursor = start + 1
                    setCommandCursor(nextCursor)
                    requestAnimationFrame(() => {
                      textarea.focus()
                      textarea.setSelectionRange(nextCursor, nextCursor)
                    })
                  }}
                >
                  <span className="text-sm font-semibold">@</span>
                </Button>
              </div>
              <Button
                type="button"
                size="icon"
                onClick={handleAgentProcess}
                disabled={processing}
                aria-label={processing ? "正在整理" : "开始整理"}
                title={processing ? "正在整理" : "开始整理"}
                className="size-9 shrink-0 rounded-full"
              >
                {processing ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
              </Button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {QUICK_ACTIONS.map((action) => (
              <Button
                key={action.label}
                type="button"
                variant={currentSkill.id === action.skillId ? "secondary" : "outline"}
                size="sm"
                className="rounded-full"
                disabled={!availableSkillIds.has(action.skillId)}
                onClick={() => applyQuickAction(action)}
              >
                {action.label}
              </Button>
            ))}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <section className="rounded-lg border bg-card p-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="font-serif text-lg font-bold">最近素材工程</h2>
                <p className="mt-1 text-xs text-muted-foreground">持续更新的专题素材库，而不是一次性长文本。</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => void refreshLocalData()}>
                <RefreshCw className="size-4" />
                刷新
              </Button>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              {recentProjects
                ? recentProjects.map((source) => (
                    <ProjectCard
                      key={source.id}
                      title={source.title}
                      tag={source.sourceType.toUpperCase()}
                      summary={source.summary || source.text.slice(0, 56)}
                      sources={1}
                      cards={sourceCounts[source.id]?.cards ?? 0}
                      questions={sourceCounts[source.id]?.questions ?? 0}
                    />
                  ))
                : SAMPLE_PROJECTS.map((project) => <ProjectCard key={project.title} {...project} />)}
            </div>
          </section>

          <section className="rounded-lg border bg-card p-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="font-serif text-lg font-bold">知识库分层</h2>
                <p className="mt-1 text-xs text-muted-foreground">把素材拆成可复用资产，供温故、演练、字帖复用。</p>
              </div>
              <Badge variant="outline">本地 IndexedDB</Badge>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
              {KNOWLEDGE_LAYERS.map((layer) => {
                const Icon = layer.icon
                return (
                  <div key={layer.title} className="rounded-md border bg-background p-4">
                    <div className="mb-3 flex size-9 items-center justify-center rounded-md bg-secondary/10 text-secondary">
                      <Icon className="size-4" />
                    </div>
                    <div className="text-sm font-medium">{layer.title}</div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{layer.desc}</p>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="rounded-lg border bg-card p-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="font-serif text-lg font-bold">官方素材工作流</h2>
                <p className="mt-1 text-xs text-muted-foreground">Skill 是可复用任务包。结构化输入负责稳定参数，自由 prompt 负责补充要求。</p>
              </div>
              <Badge variant="outline">隔离工作区执行</Badge>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {skills.length === 0 ? (
                <div className="rounded-md border bg-muted/30 p-6 text-center text-sm text-muted-foreground lg:col-span-2">
                  当前没有已启用的素材 Skill。
                  <Button variant="outline" size="sm" className="mt-3" asChild>
                    <a href="/materials/skills">前往 Skill 管理</a>
                  </Button>
                </div>
              ) : (
                skills.map((skill) => {
                  const definition = materialSkillDefinitionFor(skill.id, skills)
                  return (
                    <SkillCard
                      key={skill.id}
                      skill={definition}
                      selected={currentSkill.id === definition.id}
                      onSelect={() => setSelectedSkillId(definition.id)}
                    />
                  )
                })
              )}
            </div>
          </section>

          <section className="rounded-lg border bg-card p-5">
            <Tabs defaultValue="inputs">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-serif text-lg font-bold">输入与审核</h2>
                  <p className="mt-1 text-xs text-muted-foreground">粘贴、上传和 Agent 候选都必须经过预览确认再入库。</p>
                </div>
                <TabsList>
                  <TabsTrigger value="inputs">结构化输入</TabsTrigger>
                  <TabsTrigger value="source">资料来源</TabsTrigger>
                  <TabsTrigger value="preview">加工预览</TabsTrigger>
                  <TabsTrigger value="inbox">Inbox</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="inputs" className="mt-4 space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="title">素材标题</Label>
                    <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="如：数字乡村建设热点资料" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>申论文档类型</Label>
                    <Select value={shenlunDocumentType} onValueChange={(value) => setShenlunDocumentType(value as ShenlunDocumentType)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SHENLUN_DOCUMENT_TYPE_OPTIONS.map((type) => (
                          <SelectItem key={type} value={type}>
                            {SHENLUN_DOCUMENT_TYPE_LABELS[type]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>当前 Skill</Label>
                    <div className="flex h-10 items-center rounded-md border bg-muted/30 px-3 text-sm">
                      {currentSkill.name}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {currentSkill.inputs.map((input) => (
                    <SkillInputField
                      key={input.name}
                      input={input}
                      value={normalizedSkillInputs[input.name]}
                      onChange={(value) => setSkillInputValues((current) => ({ ...current, [input.name]: value }))}
                    />
                  ))}
                </div>
                <TrustAndBudgetPanel skill={currentSkill} budgetWarnings={promptBudget.warnings} totalChars={promptBudget.estimate.totalChars} />
                <HarnessPlanPanel preview={harnessPreview} />
              </TabsContent>

              <TabsContent value="source" className="mt-4">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="space-y-3">
                    <Label htmlFor="rawText">粘贴文本</Label>
                    <Textarea
                      id="rawText"
                      value={rawText}
                      onChange={(e) => setRawText(e.target.value)}
                      placeholder="粘贴政策文件、热点文章、课程讲义等文本..."
                      className="min-h-[300px] font-serif leading-relaxed"
                    />
                    <Button disabled={processing || !rawText.trim()} onClick={handleTextProcess}>
                      {processing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                      本地规则加工
                    </Button>
                  </div>
                  <div className="rounded-md border-2 border-dashed bg-muted/30 p-8 text-center">
                    <Upload className="mx-auto size-10 text-muted-foreground" />
                    <p className="mt-3 text-sm text-muted-foreground">选择 TXT / MD / 文字型 PDF 文件</p>
                    <Input
                      type="file"
                      accept=".txt,.md,.markdown,.pdf,text/plain,text/markdown,application/pdf"
                      multiple
                      className="mt-4"
                      onChange={(event) => {
                        handleFiles(event.target.files)
                        event.currentTarget.value = ""
                      }}
                    />
                    <MineruRuntimePanel
                      status={mineruStatus}
                      installing={mineruInstalling}
                      logs={mineruInstallLogs}
                      pendingFileName={fileName}
                      onInstall={() => void installMineruRuntime()}
                      onRefresh={() => void refreshMineruStatus()}
                    />
                    <PdfParseProgressPanel progress={pdfParseProgress} logs={pdfParseLogs} fileName={fileName} />
                    <UploadedFileStatusPanel fileName={fileName} status={uploadedFileStatus} onClear={clearParsedMaterialFile} />
                    <div className="mt-4 rounded-md bg-background p-3 text-left text-xs text-muted-foreground">
                      长 PDF 会先进入预算估算；正文过长时只传摘要与关键片段，原文保留在运行工作区。
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="preview" className="mt-4">
                <DraftPreview
                  draft={draft}
                  selection={selection}
                  setSelection={setSelection}
                  onImport={importDraft}
                />
              </TabsContent>

              <TabsContent value="inbox" className="mt-4">
                <InboxPanel
                  drafts={inboxDrafts}
                  importingDraftId={importingInboxDraftId}
                  onImport={(draft) => void importInboxDraft(draft)}
                />
              </TabsContent>
            </Tabs>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-lg border bg-card p-5">
            <h2 className="font-serif text-lg font-bold">Agent 运行中心</h2>
            <p className="mt-1 text-xs text-muted-foreground">队列、日志、取消、重试和输出路径统一在这里处理。</p>
            <div className="mt-4 rounded-md border bg-muted/20 p-3 text-xs">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium">{displayAgentExecutor(agentExecutor)}</div>
                  <div className="mt-1 text-muted-foreground">
                    {activeAdapter ? displayAgentStatus(activeAdapter) : "状态未知"}
                  </div>
                  {activeAdapter?.version ? (
                    <div className="mt-1 truncate text-[11px] text-muted-foreground">{activeAdapter.version}</div>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label="重新检测本地 Agent 状态"
                  disabled={agentAdaptersChecking}
                  onClick={refreshAgentAdapters}
                >
                  <RefreshCw className={cn("size-3.5", agentAdaptersChecking && "animate-spin")} />
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {(activeAdapter?.capabilities ?? []).slice(0, 5).map((capability) => (
                  <Badge key={capability} variant="outline" className="h-5 px-1.5 text-[10px]">
                    {capabilityLabel(capability)}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {displayedRunQueue.length === 0 ? (
                <EmptyState icon={Clock3} title="暂无运行任务" desc="从上方启动 Agent 后，这里会显示实时日志。" />
              ) : (
                displayedRunQueue.map((task) => <RunTaskCard key={task.id} task={task} />)
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" disabled={!activeRunId || !processing} onClick={cancelActiveRun}>
                <Square className="size-4" />
                取消
              </Button>
              <Button variant="outline" size="sm" disabled={processing} onClick={handleAgentProcess}>
                <RefreshCw className="size-4" />
                重试
              </Button>
            </div>
          </section>

          <section className="rounded-lg border bg-card p-5">
            <h2 className="font-serif text-lg font-bold">今日素材脉搏</h2>
            <p className="mt-1 text-xs text-muted-foreground">进入知识库后的第一眼状态。</p>
            <div className="mt-4 space-y-3">
              <PulseRow label="待审核" value={`${inboxDrafts.filter((draftItem) => draftItem.status === "pending").length} 条候选素材`} action="处理" />
              <PulseRow label="需温故" value={`${Math.max(18, sources.length * 3)} 张关键词卡片`} action="复习" />
              <PulseRow label="可演练" value={`${Math.max(4, sources.length)} 道新题已生成`} action="进入" />
              <PulseRow label="学习资产" value={`${learningAssetStats.topics} 个主题 · ${learningAssetStats.provenance} 条来源`} action={learningAssetStats.needsReview ? "复核" : "查看"} />
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}

function fallbackAgentSkills(): AgentSkillInfo[] {
  return BUILTIN_MATERIAL_SKILLS.map((skill) => ({
    id: skill.id,
    name: skill.id,
    description: skill.description,
    path: `skills/${skill.id}`,
    triggers: [skill.scenario],
    enabled: true,
    source: skill.source,
    trust: skill.trust,
    inputs: skill.inputs,
    outputs: skill.outputs,
    requiredCapabilities: skill.requiredCapabilities,
    requiredPermissions: [...skill.requiredPermissions],
  }))
}

function mergeRuntimeSkills(runtimeSkills: AgentSkillInfo[], includeFallback = true): AgentSkillInfo[] {
  const byId = new Map(includeFallback ? fallbackAgentSkills().map((skill) => [skill.id, skill]) : [])
  for (const skill of runtimeSkills) {
    const definition = getMaterialSkillDefinition(skill.id)
    byId.set(skill.id, {
      ...skill,
      enabled: skill.enabled,
      source: definition?.source ?? skill.source ?? "user-local",
      trust: definition?.trust ?? skill.trust ?? "restricted",
      inputs: definition?.inputs ?? skill.inputs ?? [{ name: "topic", label: "主题", type: "string", required: true }],
      outputs: definition?.outputs ?? skill.outputs ?? ["候选素材"],
      requiredCapabilities: definition?.requiredCapabilities ?? skill.requiredCapabilities ?? ["fileRead", "fileWrite", "structuredOutput"],
      requiredPermissions: definition?.requiredPermissions ? [...definition.requiredPermissions] : skill.requiredPermissions ?? ["promptInject", "fileRead", "fileWrite"],
    })
  }
  return Array.from(byId.values())
}

function materialSkillDefinitionFor(id: string, skills: AgentSkillInfo[]): MaterialSkillDefinition {
  const builtIn = getMaterialSkillDefinition(id)
  const runtimeSkill = skills.find((skill) => skill.id === id)
  if (builtIn) {
    return {
      ...builtIn,
      source: runtimeSkill?.source ?? builtIn.source,
      trust: runtimeSkill?.trust ?? builtIn.trust,
      inputs: runtimeSkill?.inputs?.length ? runtimeSkill.inputs : builtIn.inputs,
      outputs: runtimeSkill?.outputs?.length ? runtimeSkill.outputs : builtIn.outputs,
      requiredCapabilities: runtimeSkill?.requiredCapabilities?.length ? runtimeSkill.requiredCapabilities : builtIn.requiredCapabilities,
      requiredPermissions: runtimeSkill?.requiredPermissions?.length ? runtimeSkill.requiredPermissions : builtIn.requiredPermissions,
    }
  }
  return {
    id,
    name: runtimeSkill?.name ?? id,
    description: runtimeSkill?.description ?? "用户本地 Skill",
    scenario: runtimeSkill?.triggers?.[0] ?? "用户 Skill",
    source: runtimeSkill?.source ?? "user-local",
    trust: runtimeSkill?.trust ?? "restricted",
    inputs: runtimeSkill?.inputs ?? [{ name: "topic", label: "主题", type: "string", required: true }],
    outputs: runtimeSkill?.outputs ?? ["候选素材"],
    requiredCapabilities: runtimeSkill?.requiredCapabilities ?? ["fileRead", "fileWrite", "structuredOutput"],
    requiredPermissions: runtimeSkill?.requiredPermissions ?? ["promptInject", "fileRead", "fileWrite"],
  }
}

function inferTopic(text: string): string {
  const topicMatch = /@专题:([^\s，。；,;]+)/.exec(text)
  if (topicMatch?.[1]) return topicMatch[1]
  const cleaned = text.replace(/@[^\s，。；,;]+/g, "").trim()
  return cleaned.slice(0, 18)
}

function formatMaterialFileQueueName(files: File[]): string {
  if (files.length === 0) return ""
  if (files.length === 1) return files[0]?.name ?? ""
  const visibleNames = files
    .slice(0, 2)
    .map((file) => file.name)
    .join("、")
  return `${files.length} 个文件：${visibleNames}${files.length > 2 ? " 等" : ""}`
}

function combineMaterialFileInputs(inputs: MaterialFileInput[], files: File[]): MaterialFileInput {
  const displayName = formatMaterialFileQueueName(files)
  const title = files.length > 1 ? displayName : inputs[0]?.title ?? displayName
  const sourceType = inputs.some((input) => input.sourceType === "pdf")
    ? "pdf"
    : inputs.every((input) => input.sourceType === "markdown")
      ? "markdown"
      : "text"
  const text = inputs
    .map((input, index) => {
      const fileName = files[index]?.name ?? input.originalName ?? input.title
      return [`## 文件 ${index + 1}/${inputs.length}：${fileName}`, input.text].filter(Boolean).join("\n\n")
    })
    .join("\n\n---\n\n")
  const layoutBlocks = inputs.flatMap((input, inputIndex) =>
    (input.layoutBlocks ?? []).map((block) => ({
      ...block,
      id: `file-${inputIndex + 1}-${block.id}`,
      order: inputIndex * 100_000 + block.order,
      sourcePath: block.sourcePath ?? files[inputIndex]?.name,
    })),
  )
  const pages = inputs.flatMap((input, inputIndex) =>
    (input.pages ?? []).map((page) => ({
      ...page,
      pageNumber: inputIndex * 10_000 + page.pageNumber,
      blockIds: page.blockIds.map((blockId) => `file-${inputIndex + 1}-${blockId}`),
    })),
  )

  return {
    title,
    sourceType,
    originalName: displayName,
    text,
    layoutBlocks: layoutBlocks.length > 0 ? layoutBlocks : undefined,
    pages: pages.length > 0 ? pages : undefined,
  }
}

function runRecordToCenterItem(record: AgentRunRecord): RunCenterItem {
  return {
    id: record.id,
    title: record.title,
    skillId: record.skillId,
    adapterLabel: record.adapterId,
    status: record.status === "completed" ? "completed" : record.status,
    startedAt: record.startedAt,
    workspacePath: record.workspacePath,
    summary: record.summary,
    logs: record.error ? [record.error] : [],
    hasTrace: record.hasTrace,
  }
}

function createLocalAgentRunEvent(runId: string, kind: AgentRunEvent["kind"], message: string): AgentRunEvent {
  return {
    runId,
    kind,
    message,
    timestamp: new Date().toISOString(),
  }
}

function toPersistedAdapterId(adapterId: string): PersistedAgentAdapterId {
  return adapterId === "claude" ? "claude" : "codex"
}

function setSyncedWorkbenchState<T>(
  action: SetStateAction<T>,
  currentValue: T,
  setState: (value: T) => void,
  toPatch: (value: T) => Partial<MaterialWorkbenchSessionSnapshot>,
  mountedRef: { current: boolean },
) {
  const nextValue = typeof action === "function" ? (action as (value: T) => T)(currentValue) : action
  if (mountedRef.current) setState(nextValue)
  patchMaterialWorkbenchSession(toPatch(nextValue))
}

function inferShenlunDocumentType(text: string): ShenlunDocumentType {
  const normalized = text.toLowerCase()
  if (/(真题|申论|联考|国考|省考|套卷|exam)/i.test(normalized)) return "exam_paper"
  if (/(单题|题目|作答要求)/i.test(normalized)) return "single_question"
  if (/(参考答案|评分|采分点|答案)/i.test(normalized)) return "answer_key"
  if (/(政策|意见|通知|规划|方案)/i.test(normalized)) return "policy_file"
  if (/(评论|时评|人民时评|半月谈)/i.test(normalized)) return "commentary"
  if (/(讲义|课程|课堂|笔记)/i.test(normalized)) return "lecture"
  return "commentary"
}

async function saveShenlunTrainingAssets({
  bundle,
  documentType,
  includeQuestions,
}: {
  bundle: MaterialImportBundle
  documentType: ShenlunDocumentType
  includeQuestions: boolean
}) {
  const createdAt = bundle.source.createdAt
  const documentId = `shenlun-doc-${bundle.source.id}`
  const expectsTrainingAssets = documentType === "exam_paper" || documentType === "single_question"
  const shouldCreateTrainingAssets = expectsTrainingAssets && includeQuestions

  const document: ShenlunDocument = {
    id: documentId,
    title: bundle.source.title,
    documentType,
    sourceType: bundle.source.sourceType,
    originalName: bundle.source.originalName,
    rawText: bundle.source.text,
    createdAt,
    parseStatus: shouldCreateTrainingAssets || !expectsTrainingAssets ? "parsed" : "needs_review",
    parseError: !shouldCreateTrainingAssets && expectsTrainingAssets ? "未生成可训练题目，请检查加工预览或文档类型。" : undefined,
  }

  await shenlunRepository.saveDocument(document)
  if (!shouldCreateTrainingAssets) return

  const parsed = parseExamDocumentText({
    title: bundle.source.title,
    sourceType: bundle.source.sourceType,
    originalName: bundle.source.originalName,
    rawText: bundle.source.text,
    layoutBlocks: bundle.source.layoutBlocks,
  })
  await saveParsedShenlunDocumentOutput(
    {
      ...parsed,
      document: {
        ...parsed.document,
        documentType,
      },
    },
    {
      idPrefix: bundle.source.id,
      createdAt,
    },
  )
  return
}

function inferShenlunQuestionType(type: string): ShenlunQuestionType {
  if (type.includes("概") || type.includes("姒")) return "summary"
  if (type.includes("对策") || type.includes("瀵")) return "countermeasure"
  if (type.includes("分析") || type.includes("缁")) return "analysis"
  if (type.includes("应用") || type.includes("搴")) return "implementation"
  return "essay"
}

function inferSuggestedMinutes(type: string): number {
  const questionType = inferShenlunQuestionType(type)
  if (questionType === "summary") return 20
  if (questionType === "essay") return 45
  return 25
}

function inferWordLimit(prompt: string): number | undefined {
  const match = /(?:不超过|控制在|以内|限)(\s*)(\d{2,4})\s*字|(\d{2,4})\s*字以内/.exec(prompt)
  const value = match?.[2] ?? match?.[3]
  return value ? Number(value) : undefined
}

function isDesktopTauriEnvironment() {
  return typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI_IPC__" in window)
}

function createPdfParseRunId() {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `pdf-${random}`
}

function clampProgress(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

function pdfParseStagePercentage(stage: string) {
  const stages: Record<string, number> = {
    preparing: 8,
    checking_runtime: 15,
    loading_skill: 24,
    starting_codex: 30,
    extracting_text: 45,
    rendering_pages: 58,
    analyzing_layout: 68,
    txt_extract: 25,
    model_download: 35,
    model_init: 45,
    parsing: 68,
    ocr_fallback: 55,
    writing_output: 82,
    validating_output: 90,
    reading_output: 88,
    completed: 100,
    failed: 100,
  }
  return stages[stage] ?? 30
}

function pdfParseStageLabel(stage: string) {
  const labels: Record<string, string> = {
    preparing: "准备中",
    checking_runtime: "检测运行时",
    loading_skill: "加载 PDF Skill",
    starting_codex: "启动 Codex",
    fallback: "兜底解析",
    extracting_text: "提取文本",
    rendering_pages: "渲染检查",
    analyzing_layout: "版面分析",
    txt_extract: "文本提取",
    model_download: "模型下载",
    model_init: "模型加载",
    parsing: "页面解析",
    ocr_fallback: "OCR 回退",
    writing_output: "写入结果",
    validating_output: "校验结果",
    reading_output: "读取结果",
    completed: "已完成",
    failed: "失败",
  }
  return labels[stage] ?? "解析中"
}

function pdfParseMessage(progress: PdfSkillParseProgressPayload) {
  if (progress.stage === "checking_runtime") {
    return "正在检查 Codex CLI、PDF Skill 和本地 PDF 工具链。"
  }
  if (progress.stage === "loading_skill") {
    return progress.parser === "mineru-ocr-skill"
      ? "正在把本地 mineru-ocr skill 快照复制到隔离工作区。"
      : "正在把本地 $pdf skill 快照复制到隔离工作区。"
  }
  if (progress.stage === "starting_codex") {
    return progress.parser === "mineru-ocr-skill"
      ? "Codex CLI 已启动，正在按 MinerU OCR Skill 工作流兜底解析文档。"
      : "Codex CLI 已启动，正在按 PDF Skill 工作流解析文档。"
  }
  if (progress.stage === "fallback") return progress.message || "主 PDF Skill 未成功，正在切换到 MinerU OCR Skill。"
  if (progress.stage === "validating_output") {
    return "正在校验 Codex 输出的结构化 JSON，只有通过 schema 的结果才会入库。"
  }
  if (progress.stage === "completed") return "解析完成，正在进入素材加工和申论训练资产生成。"
  if (progress.stage === "failed") return progress.message || "PDF 解析失败，请查看最近解析日志。"
  return progress.message || (progress.parser === "mineru-ocr-skill" ? "MinerU OCR Skill 正在解析 PDF。" : "Codex PDF Skill 正在解析 PDF。")
}

function pdfParserLabel(parser: string) {
  if (parser === "codex-pdf-skill") return "Codex PDF Skill"
  if (parser === "mineru-ocr-skill") return "MinerU OCR Skill"
  return parser
}

function ProjectCard({
  title,
  tag,
  summary,
  sources,
  cards,
  questions,
}: {
  title: string
  tag: string
  summary: string
  sources: number
  cards: number
  questions: number
}) {
  return (
    <div className="rounded-md border bg-background p-4">
      <Badge variant="outline" className="mb-3 border-primary/15 bg-primary/[0.06] text-primary/80">
        {tag}
      </Badge>
      <div className="font-medium">{title}</div>
      <p className="mt-2 min-h-10 text-xs leading-relaxed text-muted-foreground">{summary}</p>
      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
        <span className="rounded-full bg-muted px-2 py-1">{sources} 来源</span>
        <span className="rounded-full bg-muted px-2 py-1">{cards} 卡片</span>
        <span className="rounded-full bg-muted px-2 py-1">{questions} 题</span>
      </div>
    </div>
  )
}

function shouldDisplaySkillId(prefix: string): boolean {
  return /^[a-z0-9._-]+$/i.test(prefix)
}

function SkillCard({
  skill,
  selected,
  onSelect,
}: {
  skill: MaterialSkillDefinition
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "rounded-md border bg-background p-4 text-left transition-colors hover:bg-muted/40",
        selected && "border-primary/40 bg-primary/5",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium">{skill.name}</div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{skill.description}</p>
        </div>
        {selected ? <CheckCircle2 className="size-4 shrink-0 text-primary" /> : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge variant="outline">{skill.scenario}</Badge>
        <Badge variant={skill.trust === "trusted" ? "secondary" : "outline"}>{skill.trust}</Badge>
        {skill.outputs.slice(0, 3).map((output) => (
          <Badge key={output} variant="outline">
            {output}
          </Badge>
        ))}
      </div>
    </button>
  )
}

function SkillInputField({
  input,
  value,
  onChange,
}: {
  input: MaterialSkillInput
  value: string | string[] | boolean | undefined
  onChange: (value: string | string[] | boolean | undefined) => void
}) {
  if (input.type === "multi_enum") {
    const selected = Array.isArray(value) ? value : []
    return (
      <div className="space-y-2 rounded-md border bg-background p-3">
        <Label>
          {input.label}
          {input.required ? <span className="text-primary"> *</span> : null}
        </Label>
        <div className="flex flex-wrap gap-2">
          {(input.values ?? []).map((item) => (
            <label key={item} className="flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs">
              <Checkbox
                checked={selected.includes(item)}
                onCheckedChange={(checked) => {
                  onChange(checked ? [...selected, item] : selected.filter((current) => current !== item))
                }}
              />
              {item}
            </label>
          ))}
        </div>
      </div>
    )
  }
  if (input.type === "enum") {
    return (
      <div className="space-y-1.5">
        <Label>
          {input.label}
          {input.required ? <span className="text-primary"> *</span> : null}
        </Label>
        <select
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        >
          {(input.values ?? []).map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>
    )
  }
  if (input.type === "text") {
    return (
      <div className="space-y-1.5 md:col-span-2">
        <Label>
          {input.label}
          {input.required ? <span className="text-primary"> *</span> : null}
        </Label>
        <Textarea
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          placeholder={input.placeholder}
          className="min-h-24"
        />
      </div>
    )
  }
  return (
    <div className="space-y-1.5">
      <Label>
        {input.label}
        {input.required ? <span className="text-primary"> *</span> : null}
      </Label>
      <Input
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder={input.placeholder}
      />
    </div>
  )
}

function TrustAndBudgetPanel({
  skill,
  budgetWarnings,
  totalChars,
}: {
  skill: MaterialSkillDefinition
  budgetWarnings: string[]
  totalChars: number
}) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <div className="rounded-md border bg-muted/20 p-3 text-xs">
        <div className="flex items-center gap-2 font-medium">
          <ShieldAlert className="size-4 text-primary" />
          信任等级
        </div>
        <p className="mt-1 text-muted-foreground">
          {skill.source} / {skill.trust}
        </p>
      </div>
      <div className="rounded-md border bg-muted/20 p-3 text-xs">
        <div className="flex items-center gap-2 font-medium">
          <Boxes className="size-4 text-secondary" />
          执行权限
        </div>
        <p className="mt-1 text-muted-foreground">{skill.requiredPermissions.join("、")}</p>
      </div>
      <div className="rounded-md border bg-muted/20 p-3 text-xs">
        <div className="flex items-center gap-2 font-medium">
          <AlertTriangle className="size-4 text-amber-600" />
          Prompt 预算
        </div>
        <p className="mt-1 text-muted-foreground">{totalChars} 字估算</p>
        {budgetWarnings.map((warning) => (
          <p key={warning} className="mt-1 text-amber-700">
            {warning}
          </p>
        ))}
      </div>
    </div>
  )
}

function HarnessPlanPanel({
  preview,
}: {
  preview: {
    sourceChars: number
    sourceType: string
    toolPlan: AgentToolPlan
    workflowPlan: AgentWorkflowPlan
    memory: AgentMemorySnapshot
  }
}) {
  return (
    <div className="rounded-md border bg-background p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-medium">
            <Network className="size-4 text-primary" />
            Harness 执行计划
          </div>
          <p className="mt-1 text-muted-foreground">
            {preview.sourceType.toUpperCase()} · {preview.sourceChars.toLocaleString()} 字 · {preview.workflowPlan.mode}
          </p>
        </div>
        <Badge variant="outline">{preview.toolPlan.primaryToolId}</Badge>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
        <div className="rounded-md bg-muted/30 p-2">
          <div className="font-medium">工具</div>
          <p className="mt-1 text-muted-foreground">
            {preview.toolPlan.fallbackToolIds.length > 0
              ? `${preview.toolPlan.primaryToolId} -> ${preview.toolPlan.fallbackToolIds.join(" -> ")}`
              : preview.toolPlan.primaryToolId}
          </p>
        </div>
        <div className="rounded-md bg-muted/30 p-2">
          <div className="font-medium">角色</div>
          <p className="mt-1 text-muted-foreground">{preview.workflowPlan.roles.map((role) => role.id).join(" / ")}</p>
        </div>
        <div className="rounded-md bg-muted/30 p-2">
          <div className="font-medium">记忆</div>
          <p className="mt-1 text-muted-foreground">
            素材 {preview.memory.assets.sources} · Inbox {preview.memory.assets.pendingInbox} · 专题 {preview.memory.assets.topics}
          </p>
        </div>
      </div>
      {[...preview.toolPlan.warnings, ...preview.memory.warnings, ...preview.workflowPlan.warnings].slice(0, 3).map((warning) => (
        <p key={warning} className="mt-2 text-amber-700">
          {warning}
        </p>
      ))}
    </div>
  )
}

function UploadedFileStatusBadge({
  fileName,
  status,
  onClear,
}: {
  fileName: string
  status: UploadedFileStatus
  onClear?: () => void
}) {
  if (!fileName || status === "idle") return null
  const failed = status === "failed"
  const parsed = status === "parsed"
  return (
    <div
      className={cn(
        "flex h-8 max-w-full items-center gap-2 rounded-md border bg-background px-2 text-xs",
        failed && "border-destructive/40 text-destructive",
        parsed && "border-primary/40 text-primary",
      )}
    >
      <FileCheck2 className="size-3.5 shrink-0" />
      <span className="shrink-0 text-muted-foreground">当前文档</span>
      <span className="min-w-0 max-w-[260px] truncate font-medium">{fileName}</span>
      <span className="shrink-0 text-muted-foreground">{uploadedFileStatusLabel(status)}</span>
      {onClear ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="ml-1 size-6 rounded-full text-muted-foreground hover:text-destructive"
          title="移除当前解析文档"
          aria-label="移除当前解析文档"
          onClick={onClear}
        >
          <X className="size-3.5" />
        </Button>
      ) : null}
    </div>
  )
}

function UploadedFileStatusPanel({
  fileName,
  status,
  onClear,
}: {
  fileName: string
  status: UploadedFileStatus
  onClear?: () => void
}) {
  if (!fileName || status === "idle") return null
  const failed = status === "failed"
  const parsed = status === "parsed"
  return (
    <div
      className={cn(
        "mt-4 rounded-md border bg-background p-3 text-left text-xs",
        failed && "border-destructive/40 text-destructive",
        parsed && "border-primary/40",
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 font-medium">
        {status === "parsing" ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
        ) : failed ? (
          <AlertTriangle className="size-4 shrink-0 text-destructive" />
        ) : (
          <FileCheck2 className="size-4 shrink-0 text-primary" />
        )}
        <span className="truncate">已上传：{fileName}</span>
        <Badge variant={failed ? "destructive" : parsed ? "secondary" : "outline"}>{uploadedFileStatusLabel(status)}</Badge>
        </div>
        {onClear ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-7 shrink-0 rounded-full text-muted-foreground hover:text-destructive"
            title="移除当前解析文档"
            aria-label="移除当前解析文档"
            onClick={onClear}
          >
            <X className="size-3.5" />
          </Button>
        ) : null}
      </div>
      <p className={cn("mt-2 leading-relaxed", failed ? "text-destructive" : "text-muted-foreground")}>
        {uploadedFileStatusDescription(status)}
      </p>
    </div>
  )
}

function uploadedFileStatusLabel(status: UploadedFileStatus) {
  const labels: Record<UploadedFileStatus, string> = {
    idle: "未选择",
    ready: "等待整理",
    parsing: "正在解析",
    parsed: "已解析",
    failed: "解析失败",
  }
  return labels[status]
}

function uploadedFileStatusDescription(status: UploadedFileStatus) {
  const descriptions: Record<UploadedFileStatus, string> = {
    idle: "请选择 TXT、Markdown 或 PDF 文件。",
    ready: "文件已进入当前对话，点击“开始整理”后才会解析并交给 Agent。",
    parsing: "正在识别文件文本层；PDF 文本不足时会自动切换到 mineru-ocr Skill。",
    parsed: "文件正文已提取，当前 Agent 会使用解析后的文本继续整理。",
    failed: "本次文件解析失败。请检查文件是否加密、Codex CLI 是否可用，或安装 MinerU 后重试。",
  }
  return descriptions[status]
}

function MineruRuntimePanel({
  status,
  installing,
  logs,
  pendingFileName,
  onInstall,
  onRefresh,
}: {
  status: MineruRuntimeStatus | null
  installing: boolean
  logs: string[]
  pendingFileName?: string
  onInstall: () => void
  onRefresh: () => void
}) {
  if (!status) return null
  const ready = status.ready
  return (
    <div className="mt-4 rounded-md border bg-background p-3 text-left text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-medium">
          {ready ? <CheckCircle2 className="size-4 text-primary" /> : <AlertTriangle className="size-4 text-amber-600" />}
          本地 PDF 解析引擎
          <Badge variant={ready ? "secondary" : "outline"}>{ready ? "已就绪" : "未安装"}</Badge>
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onRefresh} disabled={installing}>
            <RefreshCw className={cn("size-3.5", installing && "animate-spin")} />
            检测
          </Button>
          {!ready ? (
            <Button type="button" size="sm" onClick={onInstall} disabled={installing}>
              {installing ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
              {installing ? "安装中" : "一键安装"}
            </Button>
          ) : null}
        </div>
      </div>
      <p className="mt-2 text-muted-foreground">{status.message}</p>
      {status.source !== "missing" && status.executablePath ? (
        <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{status.executablePath}</p>
      ) : null}
      {pendingFileName ? <p className="mt-2 text-muted-foreground">当前文件：{pendingFileName}。点击“开始整理”后会按需调用 MinerU 兜底。</p> : null}
      {logs.length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-muted-foreground">安装日志</summary>
          <div className="mt-2 max-h-32 overflow-auto rounded-md bg-muted/40 p-2 font-mono text-[11px] text-muted-foreground">
            {logs.slice(-8).map((log, index) => (
              <div key={`${index}-${log.slice(0, 16)}`} className="whitespace-pre-wrap">
                {log}
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  )
}

function PdfParseProgressPanel({
  progress,
  logs,
  fileName,
}: {
  progress: PdfSkillParseProgressPayload | null
  logs: string[]
  fileName: string
}) {
  if (!progress) return null
  const percentage = clampProgress(progress.percentage ?? pdfParseStagePercentage(progress.stage))
  const completed = progress.status === "completed"
  const failed = progress.status === "failed"
  return (
    <div className="mt-4 rounded-md border bg-background p-3 text-left text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 font-medium">
          {completed ? (
            <CheckCircle2 className="size-4 shrink-0 text-primary" />
          ) : failed ? (
            <AlertTriangle className="size-4 shrink-0 text-destructive" />
          ) : (
            <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
          )}
          <span>PDF 解析进度</span>
          <Badge variant="outline">{pdfParserLabel(progress.parser)}</Badge>
          <Badge variant={failed ? "destructive" : completed ? "secondary" : "outline"}>{pdfParseStageLabel(progress.stage)}</Badge>
        </div>
        <span className="font-mono text-[11px] text-muted-foreground">{Math.round(percentage)}%</span>
      </div>
      {fileName ? <p className="mt-2 truncate text-muted-foreground">{fileName}</p> : null}
      {progress.workspacePath ? <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{progress.workspacePath}</p> : null}
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", failed ? "bg-destructive" : "bg-primary")}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className={cn("mt-2 leading-relaxed", failed ? "text-destructive" : "text-muted-foreground")}>
        {pdfParseMessage(progress)}
      </p>
      {logs.length > 0 ? (
        <details className="mt-2" open={!completed}>
          <summary className="cursor-pointer text-muted-foreground">最近解析日志</summary>
          <div className="mt-2 max-h-36 overflow-auto rounded-md bg-muted/40 p-2 font-mono text-[11px] text-muted-foreground">
            {logs.map((log, index) => (
              <div key={`${index}-${log.slice(0, 20)}`} className="whitespace-pre-wrap break-words">
                {log}
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  )
}

function DraftPreview({
  draft,
  selection,
  setSelection,
  onImport,
}: {
  draft: MaterialDraft | null
  selection: ImportSelection
  setSelection: (updater: (selection: ImportSelection) => ImportSelection) => void
  onImport: () => void
}) {
  if (!draft) {
    return <EmptyState icon={Database} title="暂无加工预览" desc="素材加工完成后会在这里展示结构化结果。" />
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{draft.topic}</Badge>
        {draft.tags.map((tag) => (
          <Badge key={tag} variant="outline">
            {tag}
          </Badge>
        ))}
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{draft.summary}</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <PreviewStat label="关键词" value={draft.keywords.length} />
        <PreviewStat label="闪卡" value={draft.flashcards.length} />
        <PreviewStat label="练习题" value={draft.practiceQuestions.length} />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <ImportToggle
          id="flashcards"
          label={`闪卡 ${draft.flashcards.length}`}
          checked={selection.flashcards}
          onCheckedChange={(checked) => setSelection((s) => ({ ...s, flashcards: checked }))}
        />
        <ImportToggle
          id="questions"
          label={`练习题 ${draft.practiceQuestions.length}`}
          checked={selection.questions}
          onCheckedChange={(checked) => setSelection((s) => ({ ...s, questions: checked }))}
        />
        <ImportToggle
          id="copybook"
          label={`字帖 ${draft.copybookItems.length}`}
          checked={selection.copybookItems}
          onCheckedChange={(checked) => setSelection((s) => ({ ...s, copybookItems: checked }))}
        />
      </div>
      <Button onClick={onImport} className="w-full">
        <Import className="size-4" />
        确认导入本地题库
      </Button>
    </div>
  )
}

function InboxPanel({
  drafts,
  importingDraftId,
  onImport,
}: {
  drafts: MaterialInboxDraft[]
  importingDraftId: string
  onImport: (draft: MaterialInboxDraft) => void
}) {
  if (drafts.length === 0) {
    return <EmptyState icon={Inbox} title="Inbox 为空" desc="Agent 生成的候选素材会先进入这里，用户确认后再导入本地题库。" />
  }
  return (
    <div className="space-y-2">
      {drafts.map((draft) => {
        const parsed = parseInboxDraftPreview(draft)
        const importing = importingDraftId === draft.id
        const canImport = draft.status === "pending" && parsed.ok
        return (
          <div key={draft.id} className="rounded-md border bg-background p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium">Run {draft.runId.slice(0, 8)}</div>
                <p className="mt-1 text-xs text-muted-foreground">{draft.createdAt}</p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Badge variant={draft.status === "pending" ? "secondary" : "outline"}>{draft.status}</Badge>
                {canImport ? (
                  <Button size="sm" onClick={() => onImport(draft)} disabled={importing}>
                    {importing ? <Loader2 className="size-3.5 animate-spin" /> : <Import className="size-3.5" />}
                    确认入库
                  </Button>
                ) : null}
              </div>
            </div>
            {parsed.ok ? (
              <div className="mt-3 rounded-md bg-muted/30 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{parsed.materialDraft.topic}</span>
                  <Badge variant="outline">{parsed.source.sourceType}</Badge>
                  {draft.status === "imported" ? <Badge variant="secondary">已入库</Badge> : null}
                </div>
                <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {parsed.materialDraft.summary}
                </p>
                {draft.validationWarnings?.length ? (
                  <div className="mt-2 rounded-md border border-amber-300/60 bg-amber-50 p-2 text-xs text-amber-800">
                    <div className="font-medium">业务校验提示</div>
                    <ul className="mt-1 list-inside list-disc space-y-0.5">
                      {draft.validationWarnings.slice(0, 3).map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-md border bg-background p-2">
                    <div className="font-semibold">{parsed.materialDraft.flashcards.length}</div>
                    <div className="text-muted-foreground">温故卡</div>
                  </div>
                  <div className="rounded-md border bg-background p-2">
                    <div className="font-semibold">{parsed.materialDraft.practiceQuestions.length}</div>
                    <div className="text-muted-foreground">练习题</div>
                  </div>
                  <div className="rounded-md border bg-background p-2">
                    <div className="font-semibold">{parsed.materialDraft.copybookItems.length}</div>
                    <div className="text-muted-foreground">字帖摘抄</div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs text-destructive">{parsed.errors[0]}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

function parseInboxDraftPreview(draft: MaterialInboxDraft):
  | { ok: true; source: MaterialFileInput; materialDraft: MaterialDraft }
  | { ok: false; errors: string[] } {
  const parsed = parseAgentMaterialOutput(draft.outputJson)
  if (!parsed.ok) {
    return {
      ok: false,
      errors: parsed.errors.length > 0 ? parsed.errors : draft.validationErrors,
    }
  }

  const materialDraft = toMaterialDraftFromAgentOutput(parsed.value)
  const errors = validateMaterialDraft(materialDraft)
  if (errors.length > 0) return { ok: false, errors }

  return {
    ok: true,
    source: parsed.value.source,
    materialDraft,
  }
}

function RunTaskCard({ task }: { task: RunCenterItem }) {
  return (
    <div className="rounded-md border bg-background p-3 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium text-sm">{task.title}</div>
          <p className="mt-1 text-muted-foreground">{task.adapterLabel}</p>
        </div>
        <Badge variant={task.status === "failed" ? "destructive" : task.status === "running" || task.status === "waiting_review" ? "secondary" : "outline"}>
          {task.status}
        </Badge>
      </div>
      <p className="mt-2 text-muted-foreground">{task.summary}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {task.hasTrace ? <Badge variant="outline">Trace 可用</Badge> : null}
        {task.status === "waiting_review" ? <Badge variant="secondary">等待审核入库</Badge> : null}
      </div>
      <div className="mt-2 space-y-1 font-mono text-[11px] text-muted-foreground">
        {task.logs.slice(-4).map((log, index) => (
          <div key={`${task.id}-${index}`} className="truncate">
            {log}
          </div>
        ))}
      </div>
      {task.workspacePath ? <p className="mt-2 truncate text-[11px] text-muted-foreground">{task.workspacePath}</p> : null}
    </div>
  )
}

function MaterialChatPane({
  messages,
  traceSteps,
  activeRunId,
  processing,
}: {
  messages: MaterialChatMessage[]
  traceSteps: AgentRunProcessStep[]
  activeRunId: string
  processing: boolean
}) {
  if (messages.length === 0) return null

  const latestAssistantId = [...messages].reverse().find((message) => message.role === "assistant")?.id

  return (
    <div className="mt-5 space-y-3 rounded-lg border bg-background/80 p-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Bot className="size-4 text-primary" />
          Agent 对话流
        </div>
        <Badge variant={processing ? "secondary" : "outline"} className="rounded-full">
          {processing ? "流式运行中" : "最近对话"}
        </Badge>
      </div>
      <div className="space-y-3">
        {messages.map((message) => {
          const showTrace =
            message.role === "assistant" &&
            traceSteps.some((step) => step.stage !== "idle") &&
            (message.runId === activeRunId || (!message.runId && message.id === latestAssistantId) || message.id === latestAssistantId)
          return (
            <MaterialChatMessageCard
              key={message.id}
              message={message}
              traceSteps={showTrace ? traceSteps : []}
              processing={processing && message.id === latestAssistantId}
            />
          )
        })}
      </div>
    </div>
  )
}

function MaterialChatMessageCard({
  message,
  traceSteps,
  processing,
}: {
  message: MaterialChatMessage
  traceSteps: AgentRunProcessStep[]
  processing: boolean
}) {
  const isAssistant = message.role === "assistant"
  const events = (message.events ?? []).slice(-10)

  return (
    <div className={cn("flex gap-3", isAssistant ? "items-start" : "items-start justify-end")}>
      {isAssistant ? (
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          {processing && message.status !== "waiting_review" && message.status !== "failed" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Bot className="size-4" />
          )}
        </div>
      ) : null}
      <div
        className={cn(
          "min-w-0 rounded-lg border p-3 text-sm shadow-xs",
          isAssistant ? "max-w-[min(920px,100%)] flex-1 bg-card" : "max-w-[min(720px,90%)] bg-primary text-primary-foreground",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className={cn("text-xs font-medium", isAssistant ? "text-muted-foreground" : "text-primary-foreground/80")}>
            {isAssistant ? "本地 Agent" : "你"}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {isAssistant && message.status ? <MaterialChatStatusBadge status={message.status} /> : null}
            {message.runId ? (
              <Badge variant="outline" className="h-5 font-mono text-[10px]">
                {message.runId.slice(0, 8)}
              </Badge>
            ) : null}
            <span className={cn("text-[11px]", isAssistant ? "text-muted-foreground" : "text-primary-foreground/70")}>
              {formatRunProcessTime(message.createdAt)}
            </span>
          </div>
        </div>
        <p className="mt-2 whitespace-pre-wrap break-words leading-relaxed">{message.content}</p>
        {message.attachments?.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {message.attachments.map((attachment) => (
              <Badge
                key={attachment.id}
                variant={isAssistant ? "outline" : "secondary"}
                className={cn("rounded-md", !isAssistant && "bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/15")}
              >
                {attachment.name} · {materialChatAttachmentStatusLabel(attachment.status)}
              </Badge>
            ))}
          </div>
        ) : null}
        {isAssistant && events.length > 0 ? (
          <div className="mt-3 space-y-2">
            {events.map((event) => (
              <MaterialChatEventRow key={event.id} event={event} />
            ))}
          </div>
        ) : null}
        {isAssistant && message.outputSummary ? <MaterialChatOutputSummaryView message={message} /> : null}
        {isAssistant && traceSteps.length > 0 ? (
          <details className="mt-3 rounded-md border bg-muted/20 p-3">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
              查看原始 trace · {traceSteps.filter((step) => step.stage !== "idle").length} 步
            </summary>
            <div className="mt-3 space-y-2">
              {traceSteps.slice(-7).map((step) => (
                <RunProcessStepRow key={step.id} step={step} />
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </div>
  )
}

function MaterialChatEventRow({ event }: { event: MaterialChatEvent }) {
  const message = event.message.trim()
  const longMessage = message.length > 220
  return (
    <div className="rounded-md border bg-background/80 p-2.5 text-xs">
      <div className="flex items-start gap-2">
        <MaterialChatEventIcon event={event} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">{event.label}</span>
            <Badge variant={materialChatEventBadgeVariant(event)} className="h-5 px-1.5 text-[10px]">
              {materialChatEventTypeLabel(event.type)}
            </Badge>
            <span className="text-[11px] text-muted-foreground">{formatRunProcessTime(event.timestamp)}</span>
          </div>
          {longMessage ? (
            <details className="mt-1">
              <summary className="cursor-pointer break-words text-muted-foreground">{message.slice(0, 220)}...</summary>
              <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
                {message}
              </pre>
            </details>
          ) : (
            <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{message}</p>
          )}
        </div>
      </div>
    </div>
  )
}

function MaterialChatOutputSummaryView({ message }: { message: MaterialChatMessage }) {
  const summary = message.outputSummary
  if (!summary) return null

  return (
    <div className="mt-3 rounded-md border bg-primary/[0.04] p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">等待 Inbox 审核</Badge>
        {summary.inboxDraftId ? <Badge variant="outline" className="font-mono">{summary.inboxDraftId.slice(0, 8)}</Badge> : null}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <div className="rounded border bg-background p-2">
          <div className="text-muted-foreground">题目</div>
          <div className="mt-1 font-semibold text-foreground">{summary.questionCount ?? 0}</div>
        </div>
        <div className="rounded border bg-background p-2">
          <div className="text-muted-foreground">温故卡</div>
          <div className="mt-1 font-semibold text-foreground">{summary.flashcardCount ?? 0}</div>
        </div>
        <div className="rounded border bg-background p-2">
          <div className="text-muted-foreground">来源</div>
          <div className="mt-1 font-semibold text-foreground">{summary.sourceCount ?? 0}</div>
        </div>
      </div>
      {summary.warnings?.length ? (
        <div className="mt-2 space-y-1 text-muted-foreground">
          {summary.warnings.slice(0, 3).map((warning) => (
            <div key={warning} className="flex gap-1.5">
              <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-600" />
              <span className="break-words">{warning}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function MaterialChatEventIcon({ event }: { event: MaterialChatEvent }) {
  if (event.severity === "error") return <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
  if (event.severity === "warning") return <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
  if (event.type === "inbox") return <Inbox className="mt-0.5 size-4 shrink-0 text-primary" />
  if (event.type === "file_write") return <FileText className="mt-0.5 size-4 shrink-0 text-primary" />
  if (event.type === "tool_call" || event.type === "tool_result") return <Search className="mt-0.5 size-4 shrink-0 text-primary" />
  if (event.type === "validation") return <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
  if (event.type === "thinking_delta") return <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
  return <Clock3 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
}

function MaterialChatStatusBadge({ status }: { status: NonNullable<MaterialChatMessage["status"]> }) {
  return (
    <Badge variant={status === "failed" ? "destructive" : status === "waiting_review" || status === "streaming" || status === "validating" ? "secondary" : "outline"} className="h-5 text-[10px]">
      {materialChatStatusLabel(status)}
    </Badge>
  )
}

function materialChatStatusLabel(status: NonNullable<MaterialChatMessage["status"]>) {
  if (status === "queued") return "排队"
  if (status === "streaming") return "流式输出"
  if (status === "validating") return "校验中"
  if (status === "waiting_review") return "待审核"
  if (status === "completed") return "完成"
  if (status === "failed") return "失败"
  return "已取消"
}

function materialChatAttachmentStatusLabel(status: NonNullable<MaterialChatMessage["attachments"]>[number]["status"]) {
  if (status === "ready") return "待整理"
  if (status === "parsing") return "解析中"
  if (status === "parsed") return "已解析"
  if (status === "failed") return "失败"
  return "已绑定"
}

function materialChatEventTypeLabel(type: MaterialChatEvent["type"]) {
  if (type === "thinking_delta") return "thinking"
  if (type === "text_delta") return "output"
  if (type === "tool_call") return "tool"
  if (type === "tool_result") return "observe"
  if (type === "file_write") return "artifact"
  if (type === "validation") return "check"
  if (type === "inbox") return "inbox"
  if (type === "error") return "error"
  return "status"
}

function materialChatEventBadgeVariant(event: MaterialChatEvent): "default" | "secondary" | "destructive" | "outline" {
  if (event.severity === "error") return "destructive"
  if (event.severity === "success" || event.type === "thinking_delta" || event.type === "validation") return "secondary"
  return "outline"
}

function AgentRunProcessPanel({
  steps,
  active,
  runId,
}: {
  steps: AgentRunProcessStep[]
  active: boolean
  runId: string
}) {
  const hasActivity = steps.some((step) => step.stage !== "idle")
  const visibleSteps = steps.slice(-7)

  return (
    <div className="mt-4 rounded-lg border bg-background/85 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            {active ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground">CLI 运行过程</div>
            <p className="truncate text-xs text-muted-foreground">
              展示启动、思考摘要、工具调用、观察结果、文件产物和校验边界。
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant={active ? "secondary" : hasActivity ? "outline" : "outline"}>
            {active ? "运行中" : hasActivity ? "最近一次" : "待启动"}
          </Badge>
          {runId ? <Badge variant="outline" className="font-mono">{runId.slice(0, 8)}</Badge> : null}
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {visibleSteps.map((step) => (
          <RunProcessStepRow key={step.id} step={step} />
        ))}
      </div>
    </div>
  )
}

function RunProcessStepRow({ step }: { step: AgentRunProcessStep }) {
  const message = step.message.trim()
  const longMessage = message.length > 180
  return (
    <div className="rounded-md border bg-card/70 p-3 text-xs">
      <div className="flex items-start gap-2">
        <RunProcessIcon step={step} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">{step.label}</span>
            <Badge variant="outline" className="h-5 px-1.5 font-mono text-[10px]">
              {step.stage}
            </Badge>
            {step.timestamp ? (
              <span className="text-[11px] text-muted-foreground">{formatRunProcessTime(step.timestamp)}</span>
            ) : null}
          </div>
          {longMessage ? (
            <details className="mt-1">
              <summary className="cursor-pointer text-muted-foreground">{message.slice(0, 180)}...</summary>
              <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
                {message}
              </pre>
            </details>
          ) : (
            <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{message}</p>
          )}
        </div>
      </div>
    </div>
  )
}

function RunProcessIcon({ step }: { step: AgentRunProcessStep }) {
  if (step.severity === "success") return <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
  if (step.severity === "error") return <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
  if (step.severity === "warning") return <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
  if (step.stage === "idle") return <Clock3 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
  return <Bot className="mt-0.5 size-4 shrink-0 text-primary" />
}

function formatRunProcessTime(timestamp: string) {
  const date = /^\d+$/.test(timestamp) ? new Date(Number(timestamp)) : new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

function PulseRow({ label, value, action }: { label: string; value: string; action: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-background p-3 text-sm">
      <div>
        <div className="font-medium">{label}</div>
        <p className="text-xs text-muted-foreground">{value}</p>
      </div>
      <Badge variant="secondary">{action}</Badge>
    </div>
  )
}

function PreviewStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3 text-center">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-serif text-2xl font-bold text-primary">{value}</div>
    </div>
  )
}

function ImportToggle({
  id,
  label,
  checked,
  onCheckedChange,
}: {
  id: string
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md border bg-background p-2 text-sm" htmlFor={id}>
      <Checkbox id={id} checked={checked} onCheckedChange={(value) => onCheckedChange(Boolean(value))} />
      {label}
    </label>
  )
}

function EmptyState({
  icon: Icon,
  title,
  desc,
}: {
  icon: typeof Database
  title: string
  desc: string
}) {
  return (
    <div className="rounded-md border bg-muted/30 p-8 text-center text-muted-foreground">
      <Icon className="mx-auto mb-3 size-9 opacity-50" />
      <div className="font-medium text-foreground">{title}</div>
      <p className="mt-1 text-sm">{desc}</p>
    </div>
  )
}

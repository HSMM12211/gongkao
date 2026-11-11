import type { AgentCapability } from "@/types/agent-executor"
import type { MaterialSkillPermission } from "@/lib/agent/skill-inputs"
import type { MaterialSourceType } from "@/lib/storage/schema"

export type AgentToolFailureMode = "retryable" | "fallback" | "manualReviewRequired"

export type AgentToolId =
  | "material.parse"
  | "pdf.extract"
  | "pdf.ocr.mineru"
  | "question.normalize"
  | "source.verify"
  | "memory.retrieve"
  | "practice.plan"
  | "rubric.evaluate"

export type AgentToolDefinition = {
  id: AgentToolId
  name: string
  description: string
  inputSchema: string
  outputSchema: string
  requiredPermissions: MaterialSkillPermission[]
  requiredCapabilities: AgentCapability[]
  timeoutMs: number
  failureMode: AgentToolFailureMode
}

export type AgentToolPlan = {
  primaryToolId: AgentToolId
  fallbackToolIds: AgentToolId[]
  reasons: string[]
  warnings: string[]
  tools: AgentToolDefinition[]
}

export const AGENT_TOOL_REGISTRY: AgentToolDefinition[] = [
  {
    id: "material.parse",
    name: "素材结构化解析",
    description: "把文本、网页或已解析文档转换为素材候选。",
    inputSchema: "Material text or markdown plus user instruction.",
    outputSchema: "material-draft.json",
    requiredPermissions: ["promptInject", "fileRead", "fileWrite"],
    requiredCapabilities: ["fileRead", "fileWrite", "structuredOutput"],
    timeoutMs: 10 * 60 * 1000,
    failureMode: "manualReviewRequired",
  },
  {
    id: "pdf.extract",
    name: "本地 PDF Skill 提取",
    description: "优先使用本地 $pdf Skill 提取可读 PDF 文本、页码和结构。",
    inputSchema: "Local PDF file path or uploaded PDF text snapshot.",
    outputSchema: "Extracted text, page references, snippets, confidence.",
    requiredPermissions: ["promptInject", "fileRead", "fileWrite"],
    requiredCapabilities: ["fileRead", "fileWrite", "structuredOutput"],
    timeoutMs: 20 * 60 * 1000,
    failureMode: "fallback",
  },
  {
    id: "pdf.ocr.mineru",
    name: "MinerU OCR 兜底解析",
    description: "当 PDF 文本不可提取或质量不足时使用 MinerU OCR Skill。",
    inputSchema: "Local PDF file path.",
    outputSchema: "Markdown, layout blocks, OCR confidence, page references.",
    requiredPermissions: ["promptInject", "fileRead", "fileWrite"],
    requiredCapabilities: ["fileRead", "fileWrite", "structuredOutput"],
    timeoutMs: 40 * 60 * 1000,
    failureMode: "manualReviewRequired",
  },
  {
    id: "question.normalize",
    name: "标准题库归一化",
    description: "把候选素材转成标准申论题库候选。",
    inputSchema: "Parsed material output and Shenlun document metadata.",
    outputSchema: "Question-bank candidate records.",
    requiredPermissions: ["promptInject", "fileRead", "fileWrite"],
    requiredCapabilities: ["structuredOutput"],
    timeoutMs: 10 * 60 * 1000,
    failureMode: "manualReviewRequired",
  },
  {
    id: "source.verify",
    name: "来源核验",
    description: "检查来源、引用摘录、发布方、页码和访问时间。",
    inputSchema: "Source references and source text.",
    outputSchema: "Verification warnings and confidence.",
    requiredPermissions: ["promptInject", "fileRead"],
    requiredCapabilities: ["fileRead", "structuredOutput"],
    timeoutMs: 8 * 60 * 1000,
    failureMode: "retryable",
  },
  {
    id: "memory.retrieve",
    name: "本地记忆摘要",
    description: "读取近期运行、素材资产和学习缺口摘要。",
    inputSchema: "Local app records.",
    outputSchema: "Bounded memory snapshot.",
    requiredPermissions: ["promptInject", "fileRead"],
    requiredCapabilities: ["structuredOutput"],
    timeoutMs: 2 * 60 * 1000,
    failureMode: "retryable",
  },
  {
    id: "practice.plan",
    name: "学习计划编排",
    description: "根据本地学习资产和能力画像生成计划候选。",
    inputSchema: "Learning profile, diagnosis summary, question bank summary.",
    outputSchema: "Learning plan candidate.",
    requiredPermissions: ["promptInject", "fileRead", "fileWrite"],
    requiredCapabilities: ["structuredOutput"],
    timeoutMs: 10 * 60 * 1000,
    failureMode: "manualReviewRequired",
  },
  {
    id: "rubric.evaluate",
    name: "题库质量评估",
    description: "检查题目、材料、答案和评分点是否能进入训练闭环。",
    inputSchema: "Question-bank candidates and provenance.",
    outputSchema: "Quality warnings and review recommendation.",
    requiredPermissions: ["promptInject", "fileRead"],
    requiredCapabilities: ["structuredOutput"],
    timeoutMs: 8 * 60 * 1000,
    failureMode: "manualReviewRequired",
  },
]

export function getAgentToolDefinition(id: AgentToolId): AgentToolDefinition {
  const tool = AGENT_TOOL_REGISTRY.find((item) => item.id === id)
  if (!tool) throw new Error(`Unknown Agent tool: ${id}`)
  return tool
}

export function buildAgentToolPlan(input: {
  sourceType: MaterialSourceType
  originalName?: string
  sourceChars: number
  instruction: string
  skillId: string
  adapterCapabilities?: AgentCapability[]
}): AgentToolPlan {
  const warnings: string[] = []
  const reasons: string[] = []
  const fallbackToolIds: AgentToolId[] = []
  let primaryToolId: AgentToolId = "material.parse"

  if (input.sourceType === "pdf" || /\.pdf$/i.test(input.originalName ?? "")) {
    primaryToolId = "pdf.extract"
    fallbackToolIds.push("pdf.ocr.mineru")
    reasons.push("PDF 来源优先使用本地 $pdf Skill 提取文本。")
    reasons.push("如果文本不可提取或质量不足，自动保留 MinerU OCR 兜底路径。")
  } else {
    reasons.push("非 PDF 来源使用素材结构化解析工具。")
  }

  if (/来源|核验|verify|source/i.test(input.instruction) || input.skillId.includes("source-verifier")) {
    fallbackToolIds.push("source.verify")
    reasons.push("用户任务包含来源核验意图。")
  }

  if (/题库|真题|训练|question|rubric/i.test(input.instruction) || input.skillId.includes("question")) {
    fallbackToolIds.push("question.normalize", "rubric.evaluate")
    reasons.push("用户任务包含题库或训练闭环意图。")
  }

  if (input.sourceChars > 30_000) {
    reasons.push("长上下文将使用 Context Engine 进行地图和片段化处理。")
  }

  const selectedIds = unique<AgentToolId>([primaryToolId, ...fallbackToolIds, "memory.retrieve"])
  const tools = selectedIds.map(getAgentToolDefinition)
  const available = new Set(input.adapterCapabilities ?? [])
  const missingCapabilities = unique(
    tools.flatMap((tool) => tool.requiredCapabilities.filter((capability) => !available.has(capability))),
  )
  if (available.size > 0 && missingCapabilities.length > 0) {
    warnings.push(`当前 Agent 缺少部分工具能力：${missingCapabilities.join(", ")}`)
  }

  return {
    primaryToolId,
    fallbackToolIds: selectedIds.filter((id) => id !== primaryToolId) as AgentToolId[],
    reasons,
    warnings,
    tools,
  }
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items))
}

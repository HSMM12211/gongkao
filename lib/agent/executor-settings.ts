import {
  AGENT_MODEL_OPTIONS,
  DEFAULT_AGENT_EXECUTOR_SETTINGS,
  type AgentAdapterId,
  type AgentExecutionMode,
  type AgentExecutorSettings,
  type AgentReasoningEffort,
} from "@/types/agent-executor"
import { formatAgentExecutorChip } from "@/lib/agent/capabilities"

const STORAGE_KEY = "gongkao.agentExecutorSettings"
const MODES = new Set<AgentExecutionMode>(["local-cli", "api-key"])
const ADAPTERS = new Set<AgentAdapterId>(["codex", "claude", "pi"])
const REASONING = new Set<AgentReasoningEffort>(["default", "medium", "high", "xhigh"])

export function normalizeAgentExecutorSettings(input: unknown): AgentExecutorSettings {
  if (!input || typeof input !== "object") return DEFAULT_AGENT_EXECUTOR_SETTINGS

  const record = input as Partial<Record<keyof AgentExecutorSettings, unknown>>
  const mode =
    typeof record.mode === "string" && MODES.has(record.mode as AgentExecutionMode)
      ? (record.mode as AgentExecutionMode)
      : DEFAULT_AGENT_EXECUTOR_SETTINGS.mode
  const adapterId =
    typeof record.adapterId === "string" && ADAPTERS.has(record.adapterId as AgentAdapterId)
      ? (record.adapterId as AgentAdapterId)
      : DEFAULT_AGENT_EXECUTOR_SETTINGS.adapterId
  const fallbackModel = AGENT_MODEL_OPTIONS[adapterId][0] ?? DEFAULT_AGENT_EXECUTOR_SETTINGS.model
  const requestedModel = typeof record.model === "string" ? record.model.trim() : ""
  const model = requestedModel && AGENT_MODEL_OPTIONS[adapterId].includes(requestedModel) ? requestedModel : fallbackModel
  const reasoning =
    typeof record.reasoning === "string" && REASONING.has(record.reasoning as AgentReasoningEffort)
      ? (record.reasoning as AgentReasoningEffort)
      : DEFAULT_AGENT_EXECUTOR_SETTINGS.reasoning

  return { mode, adapterId, model, reasoning }
}

export function loadAgentExecutorSettings(): AgentExecutorSettings {
  if (typeof window === "undefined") return DEFAULT_AGENT_EXECUTOR_SETTINGS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return normalizeAgentExecutorSettings(raw ? JSON.parse(raw) : null)
  } catch {
    return DEFAULT_AGENT_EXECUTOR_SETTINGS
  }
}

export function saveAgentExecutorSettings(settings: AgentExecutorSettings): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeAgentExecutorSettings(settings)))
}

export function displayAgentExecutor(settings: AgentExecutorSettings): string {
  return formatAgentExecutorChip(settings)
}

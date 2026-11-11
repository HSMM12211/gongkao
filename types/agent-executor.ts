export type AgentExecutionMode = "local-cli" | "api-key"

export type AgentAdapterId = "codex" | "claude" | "pi"

export type AgentReasoningEffort = "default" | "medium" | "high" | "xhigh"

export type AgentModelSource = "live" | "fallback" | "custom"

export type AgentInstallStatus = "installed" | "missing" | "path-error" | "unknown"

export type AgentCapability =
  | "streaming"
  | "cancel"
  | "resume"
  | "nativeSkillLoading"
  | "fileRead"
  | "fileWrite"
  | "imageInput"
  | "largeContext"
  | "structuredOutput"

export type AgentExecutorSettings = {
  mode: AgentExecutionMode
  adapterId: AgentAdapterId
  model: string
  reasoning: AgentReasoningEffort
}

export type AgentAdapterStatus = {
  id: AgentAdapterId
  name: string
  available: boolean
  path?: string
  installStatus: AgentInstallStatus
  authStatus: "ok" | "missing" | "unknown"
  version?: string
  message: string
  modelSource: AgentModelSource
  capabilities: AgentCapability[]
}

export const DEFAULT_AGENT_EXECUTOR_SETTINGS: AgentExecutorSettings = {
  mode: "local-cli",
  adapterId: "codex",
  model: "gpt-5.5",
  reasoning: "medium",
}

export const AGENT_MODEL_OPTIONS: Record<AgentAdapterId, string[]> = {
  codex: ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.3-codex"],
  claude: ["sonnet", "opus", "haiku", "claude-sonnet-4-5"],
  pi: ["anthropic/claude-sonnet-4-5", "openai/gpt-5", "google/gemini-2.5-pro"],
}

export const AGENT_REASONING_OPTIONS: Array<{ value: AgentReasoningEffort; label: string }> = [
  { value: "default", label: "default" },
  { value: "medium", label: "medium" },
  { value: "high", label: "high" },
  { value: "xhigh", label: "xhigh" },
]

export const DEFAULT_AGENT_ADAPTER_STATUSES: AgentAdapterStatus[] = [
  {
    id: "codex",
    name: "Codex CLI",
    available: false,
    installStatus: "unknown",
    authStatus: "unknown",
    version: "pending detection",
    message: "Frontend selection is ready. Real detection is provided by the Tauri CLI runtime.",
    modelSource: "fallback",
    capabilities: ["streaming", "cancel", "fileRead", "fileWrite", "structuredOutput"],
  },
  {
    id: "claude",
    name: "Claude Code",
    available: false,
    installStatus: "unknown",
    authStatus: "unknown",
    version: "pending detection",
    message: "Frontend selection is ready. Real auth status is provided by the Tauri CLI runtime.",
    modelSource: "fallback",
    capabilities: ["streaming", "cancel", "resume", "nativeSkillLoading", "fileRead", "fileWrite", "structuredOutput"],
  },
  {
    id: "pi",
    name: "Pi Agent",
    available: false,
    installStatus: "unknown",
    authStatus: "unknown",
    version: "future adapter",
    message: "Pi Agent is reserved as a future local adapter entry.",
    modelSource: "fallback",
    capabilities: ["streaming", "fileRead", "imageInput", "largeContext"],
  },
]

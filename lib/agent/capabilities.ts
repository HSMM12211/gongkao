import {
  DEFAULT_AGENT_ADAPTER_STATUSES,
  type AgentAdapterId,
  type AgentAdapterStatus,
  type AgentCapability,
  type AgentExecutorSettings,
  type AgentInstallStatus,
  type AgentModelSource,
} from "@/types/agent-executor"
import type { DetectedAgentAdapter } from "@/types/agent-runtime"

const ADAPTER_LABELS: Record<AgentAdapterId, string> = {
  codex: "Codex CLI",
  claude: "Claude Code",
  pi: "Pi Agent",
}

const MODE_LABELS = {
  "local-cli": "本地 CLI",
  "api-key": "自带 Key",
} as const

const MODEL_SOURCE_LABELS: Record<AgentModelSource, string> = {
  live: "CLI 实时读取",
  fallback: "备用模型列表",
  custom: "自定义模型",
}

const INSTALL_LABELS: Record<AgentInstallStatus, string> = {
  installed: "已安装",
  missing: "未安装",
  "path-error": "路径异常",
  unknown: "状态未知",
}

const AUTH_LABELS: Record<AgentAdapterStatus["authStatus"], string> = {
  ok: "已登录",
  missing: "未登录",
  unknown: "登录未知",
}

export function formatAgentExecutorChip(settings: AgentExecutorSettings): string {
  return `${MODE_LABELS[settings.mode]} · ${ADAPTER_LABELS[settings.adapterId]} · ${settings.model}`
}

export function displayModelSource(source: AgentModelSource): string {
  return MODEL_SOURCE_LABELS[source]
}

export function displayAgentStatus(status: Pick<AgentAdapterStatus, "installStatus" | "authStatus">): string {
  return `${INSTALL_LABELS[status.installStatus]} / ${AUTH_LABELS[status.authStatus]}`
}

export function getDefaultAdapterStatus(id: AgentAdapterId): AgentAdapterStatus {
  return (
    DEFAULT_AGENT_ADAPTER_STATUSES.find((adapter) => adapter.id === id) ?? {
      id,
      name: ADAPTER_LABELS[id],
      available: false,
      installStatus: "unknown",
      authStatus: "unknown",
      message: "Agent status is unknown.",
      modelSource: "fallback",
      capabilities: [],
    }
  )
}

export function mergeDetectedAgentAdapters(
  defaults: AgentAdapterStatus[],
  detected: DetectedAgentAdapter[],
): AgentAdapterStatus[] {
  const byId = new Map(detected.map((adapter) => [adapter.id, adapter]))
  return defaults.map((fallback) => {
    const detection = byId.get(fallback.id)
    if (!detection) return fallback
    return {
      ...fallback,
      name: detection.name || fallback.name,
      available: detection.available,
      path: detection.path,
      version: detection.version ?? fallback.version,
      installStatus: detection.installStatus ?? (detection.available ? "installed" : detection.path ? "path-error" : "missing"),
      authStatus: detection.authStatus ?? fallback.authStatus,
      message: detection.message || fallback.message,
      modelSource: detection.modelSource ?? fallback.modelSource,
      capabilities: detection.capabilities ?? fallback.capabilities,
    }
  })
}

export function adapterSupportsRequirements(
  adapter: Pick<AgentAdapterStatus, "capabilities">,
  required: AgentCapability[],
): { ok: true; missing: [] } | { ok: false; missing: AgentCapability[] } {
  const available = new Set(adapter.capabilities)
  const missing = required.filter((capability) => !available.has(capability))
  return missing.length === 0 ? { ok: true, missing: [] } : { ok: false, missing }
}

export function capabilityLabel(capability: AgentCapability): string {
  const labels: Record<AgentCapability, string> = {
    streaming: "流式输出",
    cancel: "可取消",
    resume: "可恢复",
    nativeSkillLoading: "原生 Skill",
    fileRead: "读工作区",
    fileWrite: "写工作区",
    imageInput: "图片输入",
    largeContext: "长上下文",
    structuredOutput: "结构化输出",
  }
  return labels[capability]
}

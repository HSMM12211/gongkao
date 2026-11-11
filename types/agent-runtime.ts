import type { AgentAdapterId, AgentReasoningEffort } from "@/types/agent-executor"
import type { AgentCapability } from "@/types/agent-executor"
import type { MaterialSkillInputValues, MaterialSkillPermission, MaterialSkillSource, MaterialSkillTrust } from "@/lib/agent/skill-inputs"
import type { MaterialContextPayload } from "@/lib/agent/context-mentions"
import type { MaterialSourceType } from "@/lib/storage/schema"

export type { AgentAdapterId }

export type DetectedAgentAdapter = {
  id: AgentAdapterId
  name: string
  available: boolean
  path?: string
  version?: string
  authStatus: "ok" | "missing" | "unknown"
  message: string
  installStatus?: "installed" | "missing" | "path-error" | "unknown"
  modelSource?: "live" | "fallback" | "custom"
  capabilities?: AgentCapability[]
}

export type AgentSkillInfo = {
  id: string
  name: string
  description: string
  path: string
  triggers: string[]
  enabled?: boolean
  source?: MaterialSkillSource
  trust?: MaterialSkillTrust
  inputs?: Array<{
    name: string
    label: string
    type: "string" | "text" | "enum" | "multi_enum" | "boolean"
    required?: boolean
    values?: string[]
    default?: string | string[] | boolean
    placeholder?: string
  }>
  outputs?: string[]
  requiredCapabilities?: AgentCapability[]
  requiredPermissions?: MaterialSkillPermission[]
}

export type ManagedSkillInfo = AgentSkillInfo & {
  displayName?: string
  scenario?: string
  enabled: boolean
  source: MaterialSkillSource
  trust: MaterialSkillTrust
  validationStatus: "valid" | "warning" | "invalid" | "unknown"
  validationErrors: string[]
  lastTestRunId?: string
  lastValidatedAt?: string
  skillMarkdown?: string
}

export type SkillManifestInput = Pick<
  ManagedSkillInfo,
  | "id"
  | "name"
  | "description"
  | "displayName"
  | "scenario"
  | "source"
  | "trust"
  | "enabled"
  | "inputs"
  | "outputs"
  | "requiredCapabilities"
  | "requiredPermissions"
> & {
  skillMarkdown: string
}

export type SkillValidationResult = {
  ok: boolean
  errors: string[]
  warnings: string[]
}

export type SkillTestRunRequest = {
  skillId: string
  sampleTopic: string
  sampleInstruction: string
}

export type AgentRunStatus = "queued" | "running" | "completed" | "failed" | "cancelled"

export type AgentRunStatusProbe = {
  status: AgentRunStatus
  summary: string
  error?: string
  hasMaterialDraft: boolean
  hasReport: boolean
  hasTrace?: boolean
}

export type AgentRunEventKind =
  | AgentRunStatus
  | "context_planning"
  | "planning"
  | "validating"
  | "waiting_review"
  | "stdout"
  | "stderr"
  | "log"
  | "agent"
  | "thinking_delta"
  | "text_delta"
  | "tool_call"
  | "tool_result"
  | "file_write"
  | "done"
  | "agent_error"

export type AgentRunEvent = {
  runId: string
  kind: AgentRunEventKind
  message: string
  timestamp: string
  eventType?: string
  raw?: unknown
}

export type StartMaterialAgentRunRequest = {
  adapterId: AgentAdapterId
  model: string
  reasoning: AgentReasoningEffort
  skillId: string
  title: string
  topic: string
  sourceText: string
  sourceType: MaterialSourceType
  originalName?: string
  userInstruction: string
  skillInputValues?: MaterialSkillInputValues
  context?: MaterialContextPayload
  requiredCapabilities?: AgentCapability[]
  adapterCapabilities?: AgentCapability[]
  skillTrust?: MaterialSkillTrust
  skillSource?: MaterialSkillSource
  requiredPermissions?: MaterialSkillPermission[]
  promptBudget?: {
    originalSourceChars: number
    finalSourceChars: number
    totalChars: number
    warnings: string[]
  }
}

export type StartedAgentRun = {
  runId: string
  workspacePath: string
}

export type MaterialAgentRunResult = {
  runId: string
  workspacePath: string
  outputJson: string
  reportMarkdown?: string
}

export type TauriAgentRuntime = {
  detectAdapters: () => Promise<DetectedAgentAdapter[]>
  listSkills: () => Promise<AgentSkillInfo[]>
  listManagedSkills: () => Promise<ManagedSkillInfo[]>
  getSkillDetail: (skillId: string) => Promise<ManagedSkillInfo>
  createUserSkill: (input: SkillManifestInput) => Promise<ManagedSkillInfo>
  updateUserSkill: (skillId: string, input: SkillManifestInput) => Promise<ManagedSkillInfo>
  duplicateSkill: (skillId: string) => Promise<ManagedSkillInfo>
  setSkillState: (skillId: string, enabled: boolean, trust: MaterialSkillTrust) => Promise<ManagedSkillInfo>
  validateSkill: (skillId: string) => Promise<SkillValidationResult>
  startSkillTestRun: (request: SkillTestRunRequest) => Promise<StartedAgentRun>
  startMaterialRun: (request: StartMaterialAgentRunRequest) => Promise<StartedAgentRun>
  cancelRun: (runId: string) => Promise<void>
  probeRunStatus: (workspacePath: string) => Promise<AgentRunStatusProbe>
  getMaterialRunResult: (runId: string) => Promise<MaterialAgentRunResult>
  onRunEvent: (handler: (event: AgentRunEvent) => void) => Promise<() => void>
}

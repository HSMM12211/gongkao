import type {
  AgentRunEvent,
  AgentRunStatusProbe,
  AgentSkillInfo,
  DetectedAgentAdapter,
  ManagedSkillInfo,
  MaterialAgentRunResult,
  SkillManifestInput,
  SkillTestRunRequest,
  SkillValidationResult,
  StartedAgentRun,
  StartMaterialAgentRunRequest,
  TauriAgentRuntime,
} from "@/types/agent-runtime"
import type { MaterialSkillTrust } from "@/lib/agent/skill-inputs"

export const AGENT_RUN_EVENT = "agent://run-event"

export type TauriAgentRuntimeApi = {
  invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T>
  listen?: <T>(event: string, handler: (event: { payload: T }) => void) => Promise<() => void>
}

export function createTauriAgentRuntime(api: TauriAgentRuntimeApi): TauriAgentRuntime {
  const requireListen = () => {
    if (!api.listen) throw new Error("Tauri event listener is unavailable")
    return api.listen
  }

  return {
    detectAdapters: () => api.invoke<DetectedAgentAdapter[]>("agent_detect_adapters"),
    listSkills: () => api.invoke<AgentSkillInfo[]>("agent_list_skills"),
    listManagedSkills: () => api.invoke<ManagedSkillInfo[]>("agent_list_managed_skills"),
    getSkillDetail: (skillId: string) => api.invoke<ManagedSkillInfo>("agent_get_skill_detail", { skillId }),
    createUserSkill: (input: SkillManifestInput) => api.invoke<ManagedSkillInfo>("agent_create_user_skill", { input }),
    updateUserSkill: (skillId: string, input: SkillManifestInput) =>
      api.invoke<ManagedSkillInfo>("agent_update_user_skill", { skillId, input }),
    duplicateSkill: (skillId: string) => api.invoke<ManagedSkillInfo>("agent_duplicate_skill", { skillId }),
    setSkillState: (skillId: string, enabled: boolean, trust: MaterialSkillTrust) =>
      api.invoke<ManagedSkillInfo>("agent_set_skill_state", { skillId, enabled, trust }),
    validateSkill: (skillId: string) => api.invoke<SkillValidationResult>("agent_validate_skill", { skillId }),
    startSkillTestRun: (request: SkillTestRunRequest) =>
      api.invoke<StartedAgentRun>("agent_start_skill_test_run", { request }),
    startMaterialRun: (request: StartMaterialAgentRunRequest) =>
      api.invoke<StartedAgentRun>("agent_start_material_run", { request }),
    cancelRun: (runId: string) => api.invoke<void>("agent_cancel_run", { runId }),
    probeRunStatus: (workspacePath: string) =>
      api.invoke<AgentRunStatusProbe>("agent_probe_run_status", { workspacePath }),
    getMaterialRunResult: (runId: string) =>
      api.invoke<MaterialAgentRunResult>("agent_get_material_run_result", { runId }),
    onRunEvent: (handler) => requireListen()<AgentRunEvent>(AGENT_RUN_EVENT, (event) => handler(event.payload)),
  }
}

export async function loadTauriAgentRuntime(): Promise<TauriAgentRuntime> {
  if (typeof window === "undefined") throw new Error("Tauri runtime is only available in the browser.")
  if (!("__TAURI_INTERNALS__" in window) && !("__TAURI_IPC__" in window)) {
    throw new Error("Agent CLI runtime is available only in the desktop app.")
  }
  const [{ invoke }, { listen }] = await Promise.all([
    import("@tauri-apps/api/core"),
    import("@tauri-apps/api/event"),
  ])
  return createTauriAgentRuntime({ invoke, listen })
}

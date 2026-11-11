import { createTauriAgentRuntime, loadTauriAgentRuntime } from "@/lib/desktop/tauri-agent-runtime"
import type { StartMaterialAgentRunRequest } from "@/types/agent-runtime"
import type { MaterialSkillPermission } from "@/lib/agent/skill-inputs"

export { createTauriAgentRuntime, loadTauriAgentRuntime }

export function canStartMaterialAgentRun(request: StartMaterialAgentRunRequest): string[] {
  const errors: string[] = []
  if (!request.adapterId) errors.push("Please choose Codex CLI or Claude Code in the topbar Agent menu.")
  if (!request.model.trim()) errors.push("Please choose a model in the topbar Agent menu.")
  if (!request.skillId.trim()) errors.push("Please choose a material Skill.")
  if (!request.title.trim()) errors.push("Please enter a material title.")
  if (!request.topic.trim()) errors.push("Please enter a collection or parsing topic.")
  if (request.sourceText.trim().length < 20 && request.userInstruction.trim().length < 10) {
    errors.push("Please provide at least 20 characters of material text, or write a clear collection instruction.")
  }
  const requiredCapabilities = request.requiredCapabilities ?? []
  const adapterCapabilities = request.adapterCapabilities ?? []
  if (requiredCapabilities.length > 0) {
    const available = new Set(adapterCapabilities)
    const missing = requiredCapabilities.filter((capability) => !available.has(capability))
    if (missing.length > 0) {
      errors.push(`Current Agent is missing required capabilities: ${missing.join(", ")}.`)
    }
  }

  if (request.skillTrust === "blocked") {
    errors.push("Selected Skill is blocked and cannot run.")
  }

  if (request.skillSource === "external" && request.skillTrust === "restricted") {
    const risky = riskyPermissions(request.requiredPermissions ?? [])
    if (risky.length > 0) {
      errors.push(`External Skill needs extra authorization: ${risky.join(", ")}.`)
    }
  }

  if (request.promptBudget && request.promptBudget.totalChars > 0 && request.promptBudget.finalSourceChars < request.promptBudget.originalSourceChars) {
    // The warning is intentionally not an error; the UI displays it before launch.
  }
  return errors
}

function riskyPermissions(permissions: MaterialSkillPermission[]): MaterialSkillPermission[] {
  return permissions.filter((permission) => permission !== "promptInject" && permission !== "fileRead")
}

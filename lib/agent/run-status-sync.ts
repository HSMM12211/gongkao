import { loadTauriAgentRuntime } from "@/lib/desktop/tauri-agent-runtime"
import { agentRepository } from "@/lib/storage/repositories"
import type { AgentRunRecord, AgentRunStatus } from "@/lib/storage/schema"
import type { AgentRunStatusProbe } from "@/types/agent-runtime"

const ACTIVE_STATUSES = new Set<AgentRunStatus>(["queued", "running", "validating"])
const RECOVERABLE_FAILED_MARKERS = [
  "material-draft.json is not valid JSON",
  "source.references.",
  "accessedAt",
]

function isRecoverableFailedRun(run: AgentRunRecord): boolean {
  if (run.status !== "failed") return false
  const message = `${run.summary}\n${run.error ?? ""}`
  return RECOVERABLE_FAILED_MARKERS.some((marker) => message.includes(marker))
}

function shouldProbeRun(run: AgentRunRecord): boolean {
  return ACTIVE_STATUSES.has(run.status) || isRecoverableFailedRun(run)
}

export function reconcileAgentRunRecord(
  run: AgentRunRecord,
  probe: AgentRunStatusProbe,
  nowIso = new Date().toISOString(),
): AgentRunRecord {
  if (!shouldProbeRun(run)) return run
  if (probe.status === "queued" || probe.status === "running") return run
  if (run.status === "failed" && probe.status !== "completed") return run

  return {
    ...run,
    status: probe.status,
    endedAt: run.endedAt ?? nowIso,
    summary: probe.summary || run.summary,
    error: probe.error,
    hasTrace: probe.hasTrace ?? run.hasTrace,
  }
}

export async function refreshAgentRunStatuses(runs: AgentRunRecord[]): Promise<AgentRunRecord[]> {
  if (!runs.some(shouldProbeRun)) return runs

  let runtime: Awaited<ReturnType<typeof loadTauriAgentRuntime>>
  try {
    runtime = await loadTauriAgentRuntime()
  } catch {
    return runs
  }

  const nowIso = new Date().toISOString()
  return Promise.all(
    runs.map(async (run) => {
      if (!shouldProbeRun(run) || !run.workspacePath) return run
      try {
        const probe = await runtime.probeRunStatus(run.workspacePath)
        const reconciled = reconcileAgentRunRecord(run, probe, nowIso)
        if (reconciled !== run) await agentRepository.saveRun(reconciled)
        return reconciled
      } catch {
        return run
      }
    }),
  )
}

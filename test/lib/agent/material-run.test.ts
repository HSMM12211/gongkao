import { describe, expect, it } from "vitest"
import { canStartMaterialAgentRun, createTauriAgentRuntime } from "@/lib/agent/material-run"
import type { StartMaterialAgentRunRequest } from "@/types/agent-runtime"

describe("material agent run bridge", () => {
  const request: StartMaterialAgentRunRequest = {
    adapterId: "codex",
    model: "gpt-5.5",
    reasoning: "medium",
    skillId: "gongkao-material-parser",
    title: "Digital village",
    topic: "Digital village",
    sourceText: "Digital village construction should improve infrastructure and public services.",
    sourceType: "text",
    userInstruction: "Generate flashcards and practice questions.",
    skillInputValues: { topic: "Digital village" },
    requiredCapabilities: ["fileRead", "fileWrite", "structuredOutput"],
    adapterCapabilities: ["streaming", "fileRead", "fileWrite", "structuredOutput"],
    skillTrust: "trusted",
    skillSource: "built-in",
  }

  it("validates global executor input before starting", () => {
    expect(canStartMaterialAgentRun({ ...request, model: "", sourceText: "", userInstruction: "" })).toContain(
      "Please choose a model in the topbar Agent menu.",
    )
  })

  it("blocks unsupported agent capabilities before starting", () => {
    const errors = canStartMaterialAgentRun({
      ...request,
      adapterCapabilities: ["streaming", "fileRead"],
      requiredCapabilities: ["fileRead", "fileWrite", "structuredOutput"],
    })

    expect(errors).toContain("Current Agent is missing required capabilities: fileWrite, structuredOutput.")
  })

  it("blocks restricted external skills that ask for risky permissions", () => {
    const errors = canStartMaterialAgentRun({
      ...request,
      skillSource: "external",
      skillTrust: "restricted",
      requiredPermissions: ["network", "fileWrite"],
    })

    expect(errors).toContain("External Skill needs extra authorization: network, fileWrite.")
  })

  it("passes material run requests to the Tauri command contract", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = []
    const runtime = createTauriAgentRuntime({
      invoke: async <T>(command: string, args?: Record<string, unknown>) => {
        calls.push({ command, args })
        return { runId: "run-1", workspacePath: "D:\\tmp\\run-1" } as T
      },
      listen: async () => () => undefined,
    })

    const result = await runtime.startMaterialRun(request)

    expect(result.runId).toBe("run-1")
    expect(calls[0].command).toBe("agent_start_material_run")
    expect(calls[0].args).toEqual({ request })
  })
})

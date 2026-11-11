import { describe, expect, it } from "vitest"
import {
  adapterSupportsRequirements,
  displayAgentStatus,
  displayModelSource,
  formatAgentExecutorChip,
  getDefaultAdapterStatus,
  mergeDetectedAgentAdapters,
} from "@/lib/agent/capabilities"
import { DEFAULT_AGENT_ADAPTER_STATUSES } from "@/types/agent-executor"
import type { AgentCapability, AgentExecutorSettings } from "@/types/agent-executor"

describe("agent capabilities", () => {
  it("formats the topbar chip like the Open Design execution switcher", () => {
    const settings: AgentExecutorSettings = {
      mode: "local-cli",
      adapterId: "codex",
      model: "gpt-5.5",
      reasoning: "medium",
    }

    expect(formatAgentExecutorChip(settings)).toBe("本地 CLI · Codex CLI · gpt-5.5")
  })

  it("labels fallback model lists explicitly", () => {
    expect(displayModelSource("fallback")).toBe("备用模型列表")
    expect(displayModelSource("live")).toBe("CLI 实时读取")
    expect(displayModelSource("custom")).toBe("自定义模型")
  })

  it("reports missing capabilities for unsupported material runs", () => {
    const adapter = {
      ...getDefaultAdapterStatus("claude"),
      capabilities: ["streaming", "fileRead", "fileWrite"] satisfies AgentCapability[],
    }

    expect(adapterSupportsRequirements(adapter, ["structuredOutput", "fileRead"])).toEqual({
      ok: false,
      missing: ["structuredOutput"],
    })
  })

  it("renders install and auth status together", () => {
    expect(
      displayAgentStatus({
        ...getDefaultAdapterStatus("codex"),
        installStatus: "installed",
        authStatus: "ok",
      }),
    ).toBe("已安装 / 已登录")
  })

  it("merges real Tauri adapter detection into the topbar statuses", () => {
    const merged = mergeDetectedAgentAdapters(DEFAULT_AGENT_ADAPTER_STATUSES, [
      {
        id: "codex",
        name: "Codex CLI",
        available: true,
        path: "codex",
        version: "codex-cli 1.0.0",
        authStatus: "ok",
        message: "Codex CLI was detected on PATH.",
      },
      {
        id: "claude",
        name: "Claude Code",
        available: false,
        authStatus: "missing",
        message: "program not found",
      },
    ])

    expect(merged.find((adapter) => adapter.id === "codex")).toMatchObject({
      available: true,
      installStatus: "installed",
      authStatus: "ok",
      modelSource: "fallback",
    })
    expect(merged.find((adapter) => adapter.id === "claude")).toMatchObject({
      available: false,
      installStatus: "missing",
      authStatus: "missing",
    })
    expect(merged.find((adapter) => adapter.id === "pi")?.available).toBe(false)
  })
})

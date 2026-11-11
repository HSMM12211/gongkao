import { describe, expect, it } from "vitest"
import {
  displayAgentExecutor,
  normalizeAgentExecutorSettings,
} from "@/lib/agent/executor-settings"

describe("agent executor settings", () => {
  it("falls back to Codex local CLI defaults for malformed input", () => {
    const settings = normalizeAgentExecutorSettings({
      mode: "bad",
      adapterId: "unknown",
      model: "",
      reasoning: "extreme",
    })

    expect(settings).toEqual({
      mode: "local-cli",
      adapterId: "codex",
      model: "gpt-5.5",
      reasoning: "medium",
    })
  })

  it("keeps valid Claude settings and displays a topbar label", () => {
    const settings = normalizeAgentExecutorSettings({
      mode: "local-cli",
      adapterId: "claude",
      model: "sonnet",
      reasoning: "default",
    })

    expect(settings.adapterId).toBe("claude")
    expect(displayAgentExecutor(settings)).toBe("本地 CLI · Claude Code · sonnet")
  })
})

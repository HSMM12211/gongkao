import { describe, expect, it } from "vitest"

import { parseAgentJsonLineForTest } from "@/app/api/chat/route"

describe("Open Design style chat stream parser", () => {
  it("maps Codex command execution frames to tool call and result events", () => {
    const started = parseAgentJsonLineForTest(
      "run-1",
      "codex",
      JSON.stringify({
        type: "item.started",
        item: {
          type: "command_execution",
          command: "Get-Content SKILL.md",
        },
      }),
    )
    const completed = parseAgentJsonLineForTest(
      "run-1",
      "codex",
      JSON.stringify({
        type: "item.completed",
        item: {
          type: "command_execution",
          command: "Get-Content SKILL.md",
          output: "# Skill",
        },
      }),
    )

    expect(started?.type).toBe("tool_call")
    expect(started?.message).toContain("Get-Content")
    expect(completed?.type).toBe("tool_result")
    expect(completed?.message).toBe("# Skill")
  })

  it("maps Codex file changes and assistant messages to UI events", () => {
    const fileWrite = parseAgentJsonLineForTest(
      "run-1",
      "codex",
      JSON.stringify({
        type: "item.completed",
        item: {
          type: "file_change",
          changes: [{ path: "material-draft.json" }, { path: "report.md" }],
        },
      }),
    )
    const message = parseAgentJsonLineForTest(
      "run-1",
      "codex",
      JSON.stringify({
        type: "item.completed",
        item: {
          type: "message",
          content: [{ type: "output_text", text: "Completed." }],
        },
      }),
    )

    expect(fileWrite?.type).toBe("file_write")
    expect(fileWrite?.message).toContain("material-draft.json")
    expect(message?.type).toBe("text_delta")
    expect(message?.message).toBe("Completed.")
  })

  it("maps lifecycle frames to log and done events", () => {
    expect(parseAgentJsonLineForTest("run-1", "codex", `{"type":"turn.started"}`)?.type).toBe("log")
    expect(parseAgentJsonLineForTest("run-1", "codex", `{"type":"turn.completed"}`)?.type).toBe("done")
  })
})

import { describe, expect, it } from "vitest"

import {
  appendMaterialChatEvent,
  appendMaterialChatMessages,
  buildMaterialChatFileAttachments,
  createMaterialAssistantMessage,
  createMaterialChatEvent,
  createMaterialUserMessage,
  materialChatEventFromRunEvent,
  updateAssistantMessageFromRunEvent,
} from "@/lib/agent/material-chat"
import type { AgentRunEvent } from "@/types/agent-runtime"

describe("material chat", () => {
  it("creates user and assistant messages for a submitted run", () => {
    const user = createMaterialUserMessage({
      content: "@Skill:热点采集器 采集数字乡村",
      attachments: buildMaterialChatFileAttachments({ fileName: "policy.pdf", status: "ready" }),
      now: "2026-06-04T00:00:00.000Z",
    })
    const assistant = createMaterialAssistantMessage({
      runId: "run-1",
      now: "2026-06-04T00:00:01.000Z",
    })

    expect(user.role).toBe("user")
    expect(user.attachments?.[0]?.name).toContain("policy.pdf")
    expect(assistant.role).toBe("assistant")
    expect(assistant.status).toBe("queued")
  })

  it("maps runtime events into readable assistant events", () => {
    expect(materialChatEventFromRunEvent(event("thinking_delta", "Need inspect")).type).toBe("thinking_delta")
    expect(materialChatEventFromRunEvent(event("tool_call", "shell: read file")).type).toBe("tool_call")
    expect(materialChatEventFromRunEvent(event("tool_result", "ok")).type).toBe("tool_result")
    expect(materialChatEventFromRunEvent(event("file_write", "material-draft.json")).type).toBe("file_write")
    expect(materialChatEventFromRunEvent(event("validating", "正在校验")).type).toBe("validation")
    expect(materialChatEventFromRunEvent(event("waiting_review", "进入 Inbox")).type).toBe("inbox")
    expect(materialChatEventFromRunEvent(event("failed", "bad json")).type).toBe("error")
  })

  it("updates assistant lifecycle status from runtime events", () => {
    let assistant = createMaterialAssistantMessage({ runId: "run-1" })

    assistant = updateAssistantMessageFromRunEvent(assistant, event("running", "started"))
    expect(assistant.status).toBe("streaming")

    assistant = updateAssistantMessageFromRunEvent(assistant, event("completed", "done"))
    expect(assistant.status).toBe("validating")

    assistant = updateAssistantMessageFromRunEvent(assistant, event("waiting_review", "候选素材已进入 Inbox"))
    expect(assistant.status).toBe("waiting_review")
    expect(assistant.content).toContain("Inbox")
  })

  it("does not mark Codex startup stderr status lines as failures", () => {
    let assistant = createMaterialAssistantMessage({ runId: "run-1" })

    const mapped = materialChatEventFromRunEvent(event("stderr", "Reading prompt from stdin..."))
    assistant = updateAssistantMessageFromRunEvent(assistant, event("stderr", "Reading prompt from stdin..."))

    expect(mapped.type).toBe("status")
    expect(mapped.severity).toBe("muted")
    expect(assistant.status).toBe("streaming")
  })

  it("keeps tool-level stderr diagnostic output from failing the assistant message", () => {
    let assistant = createMaterialAssistantMessage({ runId: "run-1" })

    const mapped = materialChatEventFromRunEvent(event("stderr", "Format-Hex : parameter Count was not found."))
    assistant = updateAssistantMessageFromRunEvent(assistant, event("stderr", "Format-Hex : parameter Count was not found."))

    expect(mapped.type).toBe("status")
    expect(mapped.label).toBe("CLI 诊断输出")
    expect(mapped.severity).toBe("warning")
    expect(assistant.status).toBe("streaming")
    expect(assistant.content).toBe("正在等待本地 CLI 接手任务...")
  })

  it("still marks terminal failed events as failures", () => {
    let assistant = createMaterialAssistantMessage({ runId: "run-1" })

    assistant = updateAssistantMessageFromRunEvent(assistant, event("failed", "material-draft.json was not found"))

    expect(assistant.status).toBe("failed")
    expect(assistant.content).toBe("material-draft.json was not found")
  })

  it("bounds event and message history", () => {
    let assistant = createMaterialAssistantMessage({ runId: "run-1" })
    for (let index = 0; index < 90; index += 1) {
      assistant = appendMaterialChatEvent(
        assistant,
        createMaterialChatEvent({
          runId: "run-1",
          type: "status",
          label: "Log",
          message: `event-${index}`,
          timestamp: `2026-06-04T00:00:${String(index).padStart(2, "0")}.000Z`,
        }),
      )
    }

    expect(assistant.events).toHaveLength(80)
    expect(assistant.events?.[0]?.message).toBe("event-10")

    const messages = appendMaterialChatMessages(
      [],
      Array.from({ length: 14 }, (_, index) =>
        createMaterialUserMessage({ content: `message-${index}`, now: `2026-06-04T00:00:${index}.000Z` }),
      ),
    )
    expect(messages).toHaveLength(12)
    expect(messages[0]?.content).toBe("message-2")
  })
})

function event(kind: AgentRunEvent["kind"], message: string): AgentRunEvent {
  return {
    runId: "run-1",
    kind,
    message,
    timestamp: "2026-06-04T00:00:00.000Z",
  }
}

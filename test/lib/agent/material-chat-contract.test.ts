import { describe, expect, it } from "vitest"

import { materialChatEventFromRunEvent } from "@/lib/agent/material-chat"
import { agentRunEventSchema, materialChatEventSchema } from "@/lib/agent/material-chat-schema"
import type { AgentRunEvent } from "@/types/agent-runtime"

describe("material chat contract", () => {
  it("validates runtime events before mapping them into chat events", () => {
    const runtimeEvent: AgentRunEvent = {
      runId: "run-contract-1",
      kind: "tool_call",
      message: "Read uploaded PDF",
      timestamp: "2026-06-04T00:00:00.000Z",
      eventType: "tool",
      raw: { tool: "read_file" },
    }

    expect(agentRunEventSchema.safeParse(runtimeEvent).success).toBe(true)

    const chatEvent = materialChatEventFromRunEvent(runtimeEvent)

    expect(materialChatEventSchema.safeParse(chatEvent).success).toBe(true)
    expect(chatEvent).toMatchObject({
      runId: "run-contract-1",
      type: "tool_call",
      severity: "info",
      rawKind: "tool_call",
    })
  })

  it("rejects event kinds that the UI contract does not recognize", () => {
    const result = agentRunEventSchema.safeParse({
      runId: "run-contract-1",
      kind: "unexpected_backend_event",
      message: "New event shape",
      timestamp: "2026-06-04T00:00:00.000Z",
    })

    expect(result.success).toBe(false)
  })

  it("rejects assistant events outside the documented display contract", () => {
    const result = materialChatEventSchema.safeParse({
      id: "event-1",
      runId: "run-contract-1",
      type: "debug_dump",
      label: "Debug",
      message: "Raw payload",
      timestamp: "2026-06-04T00:00:00.000Z",
      severity: "info",
    })

    expect(result.success).toBe(false)
  })
})

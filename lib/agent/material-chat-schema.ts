import { z } from "zod"

export const agentRunEventKindSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
  "context_planning",
  "planning",
  "validating",
  "waiting_review",
  "stdout",
  "stderr",
  "log",
  "agent",
  "thinking_delta",
  "text_delta",
  "tool_call",
  "tool_result",
  "file_write",
  "done",
  "agent_error",
])

export const agentRunEventSchema = z.object({
  runId: z.string().min(1),
  kind: agentRunEventKindSchema,
  message: z.string(),
  timestamp: z.string().min(1),
  eventType: z.string().optional(),
  raw: z.unknown().optional(),
})

export const materialChatEventTypeSchema = z.enum([
  "thinking_delta",
  "text_delta",
  "tool_call",
  "tool_result",
  "file_write",
  "validation",
  "inbox",
  "status",
  "error",
])

export const materialChatEventSeveritySchema = z.enum(["muted", "info", "success", "warning", "error"])

export const materialChatEventSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  type: materialChatEventTypeSchema,
  label: z.string().min(1),
  message: z.string(),
  timestamp: z.string().min(1),
  severity: materialChatEventSeveritySchema,
  rawKind: agentRunEventKindSchema.optional(),
})

export type AgentRunEventContract = z.infer<typeof agentRunEventSchema>
export type MaterialChatEventContract = z.infer<typeof materialChatEventSchema>

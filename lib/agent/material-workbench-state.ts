import { z } from "zod"

import type { MaterialChatMessage } from "@/lib/agent/material-chat"
import type { MaterialDraft, MaterialFileInput } from "@/lib/material/types"
import type { MaterialSkillInputValues } from "@/lib/agent/skill-inputs"

type ImportSelection = {
  flashcards: boolean
  questions: boolean
  copybookItems: boolean
}

const SkillInputValueSchema = z.union([z.string(), z.boolean(), z.array(z.string())])

const MaterialFileInputSchema = z.object({
  title: z.string(),
  sourceType: z.enum(["text", "markdown", "pdf"]),
  originalName: z.string().optional(),
  text: z.string(),
  layoutBlocks: z
    .array(
      z.object({
        id: z.string(),
        pageNumber: z.number(),
        order: z.number(),
        blockType: z.enum(["heading", "paragraph", "list", "table", "image", "formula", "unknown"]),
        text: z.string(),
        markdown: z.string().optional(),
        sourcePath: z.string().optional(),
        bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
      }),
    )
    .optional(),
  pages: z
    .array(
      z.object({
        pageNumber: z.number(),
        text: z.string(),
        blockIds: z.array(z.string()),
      }),
    )
    .optional(),
})

const MaterialDraftSchema = z.object({
  topic: z.string(),
  summary: z.string(),
  source: z.string().optional(),
  tags: z.array(z.string()),
  keywords: z.array(z.string()),
  goldenSentences: z.array(z.string()),
  flashcards: z.array(
    z.object({
      front: z.string(),
      keywords: z.array(z.string()),
      category: z.string(),
    }),
  ),
  practiceQuestions: z.array(
    z.object({
      type: z.string(),
      title: z.string(),
      material: z.string(),
      prompt: z.string(),
      keywords: z.array(z.string()),
      modelAnswer: z.string(),
    }),
  ),
  copybookItems: z.array(
    z.object({
      title: z.string(),
      text: z.string(),
      tags: z.array(z.string()),
    }),
  ),
})

const MaterialChatEventSchema = z.object({
  id: z.string(),
  runId: z.string(),
  type: z.enum([
    "thinking_delta",
    "text_delta",
    "tool_call",
    "tool_result",
    "file_write",
    "validation",
    "inbox",
    "status",
    "error",
  ]),
  label: z.string(),
  message: z.string(),
  timestamp: z.string(),
  severity: z.enum(["muted", "info", "success", "warning", "error"]),
  rawKind: z.string().optional(),
})

const MaterialChatAttachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["file", "context"]),
  status: z.enum(["ready", "parsing", "parsed", "failed", "bound"]),
})

const AgentTaskPlanSchema = z
  .object({
    runGoal: z.string(),
    skill: z
      .object({
        id: z.string(),
        name: z.string(),
        trust: z.string().optional(),
        source: z.string().optional(),
        permissions: z.array(z.string()),
      })
      .passthrough(),
    context: z
      .object({
        title: z.string(),
        sourceType: z.string(),
        originalName: z.string().optional(),
        mode: z.string(),
        originalSourceChars: z.number(),
        providedSourceChars: z.number(),
        estimatedSections: z.number(),
        warnings: z.array(z.string()),
      })
      .passthrough(),
    toolRoute: z
      .object({
        primaryToolId: z.string(),
        fallbackToolIds: z.array(z.string()),
        reasons: z.array(z.string()),
        warnings: z.array(z.string()),
        permissions: z.array(z.string()),
      })
      .passthrough(),
    memory: z
      .object({
        recentRuns: z.number(),
        pendingInbox: z.number(),
        sources: z.number(),
        topics: z.number(),
        needsReview: z.number(),
        warnings: z.array(z.string()),
      })
      .passthrough(),
    workflow: z
      .object({
        mode: z.string(),
        roles: z.array(z.string()),
        reason: z.string(),
        warnings: z.array(z.string()),
      })
      .passthrough(),
    expectedArtifacts: z.array(z.string()),
    reviewRequired: z.boolean(),
    warnings: z.array(z.string()),
  })
  .passthrough()

const MaterialChatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  runId: z.string().optional(),
  content: z.string(),
  createdAt: z.string(),
  status: z.enum(["queued", "streaming", "validating", "waiting_review", "completed", "failed", "cancelled"]).optional(),
  events: z.array(MaterialChatEventSchema).optional(),
  attachments: z.array(MaterialChatAttachmentSchema).optional(),
  taskPlan: AgentTaskPlanSchema.optional(),
  outputSummary: z
    .object({
      inboxDraftId: z.string().optional(),
      questionCount: z.number().optional(),
      flashcardCount: z.number().optional(),
      sourceCount: z.number().optional(),
      warnings: z.array(z.string()).optional(),
    })
    .optional(),
})

const MaterialWorkbenchStateSchema = z.object({
  title: z.string(),
  rawText: z.string(),
  fileName: z.string(),
  selectedSkillId: z.string(),
  commandPrompt: z.string(),
  skillInputValues: z.record(SkillInputValueSchema),
  selection: z.object({
    flashcards: z.boolean(),
    questions: z.boolean(),
    copybookItems: z.boolean(),
  }),
  sourceInput: MaterialFileInputSchema.nullable(),
  draft: MaterialDraftSchema.nullable(),
  chatMessages: z.array(MaterialChatMessageSchema).optional().default([]),
})

export type MaterialWorkbenchState = {
  title: string
  rawText: string
  fileName: string
  selectedSkillId: string
  commandPrompt: string
  skillInputValues: MaterialSkillInputValues
  selection: ImportSelection
  sourceInput: MaterialFileInput | null
  draft: MaterialDraft | null
  chatMessages: MaterialChatMessage[]
}

export const MATERIAL_WORKBENCH_STATE_KEY = "gongkao.materials.workbench.v1"

export function serializeMaterialWorkbenchState(state: MaterialWorkbenchState): string {
  return JSON.stringify(state)
}

export function parseMaterialWorkbenchState(raw: string | null | undefined): MaterialWorkbenchState | null {
  if (!raw) return null
  try {
    const parsed = MaterialWorkbenchStateSchema.safeParse(JSON.parse(raw))
    return parsed.success ? (parsed.data as MaterialWorkbenchState) : null
  } catch {
    return null
  }
}

import { describe, expect, it } from "vitest"

import {
  parseMaterialWorkbenchState,
  serializeMaterialWorkbenchState,
  type MaterialWorkbenchState,
} from "@/lib/agent/material-workbench-state"

describe("material workbench state persistence", () => {
  it("round-trips the editable workbench state used when navigating between material subpages", () => {
    const state: MaterialWorkbenchState = {
      title: "Skill Runtime Smoke Test",
      rawText: "A source text long enough to keep in the material workbench.",
      fileName: "source.md",
      selectedSkillId: "gongkao-smoke-test-skill",
      commandPrompt: "@Skill:gongkao-smoke-test-skill ",
      skillInputValues: { topic: "Skill Runtime Smoke Test", includeWiki: true },
      selection: { flashcards: true, questions: false, copybookItems: true },
      sourceInput: {
        title: "Skill Runtime Smoke Test",
        sourceType: "pdf" as const,
        originalName: "source.pdf",
        text: "A source text long enough to keep in the material workbench.",
        layoutBlocks: [
          { id: "b1", pageNumber: 1, order: 1, blockType: "heading" as const, text: "材料一" },
          { id: "b2", pageNumber: 1, order: 2, blockType: "paragraph" as const, text: "A source text long enough to keep in the material workbench." },
        ],
        pages: [{ pageNumber: 1, text: "材料一\nA source text long enough to keep in the material workbench.", blockIds: ["b1", "b2"] }],
      },
      draft: {
        topic: "Skill Runtime Smoke Test",
        summary: "Draft summary",
        tags: ["runtime"],
        keywords: ["Skill", "Agent", "Runtime"],
        goldenSentences: ["A stable base makes complex workflows reliable."],
        flashcards: [{ front: "What does the smoke test verify?", keywords: ["runtime"], category: "对策" as const }],
        practiceQuestions: [
          {
            type: "综合分析" as const,
            title: "Runtime check",
            material: "Runtime material",
            prompt: "Analyze the runtime check.",
            keywords: ["runtime"],
            modelAnswer: "It verifies the minimal end-to-end path.",
          },
        ],
        copybookItems: [{ title: "Runtime", text: "A stable base makes complex workflows reliable.", tags: ["runtime"] }],
      },
      chatMessages: [
        {
          id: "assistant-1",
          role: "assistant" as const,
          runId: "run-1",
          content: "任务计划",
          createdAt: "2026-06-12T00:00:00.000Z",
          status: "queued" as const,
          events: [],
          taskPlan: {
            runGoal: "解析 PDF 入库",
            skill: {
              id: "gongkao-material-parser",
              name: "政策文件解析器",
              permissions: ["promptInject", "fileRead", "fileWrite"],
            },
            context: {
              title: "source.pdf",
              sourceType: "pdf",
              mode: "snippets",
              originalSourceChars: 80000,
              providedSourceChars: 30000,
              estimatedSections: 8,
              warnings: ["已使用片段模式"],
            },
            toolRoute: {
              primaryToolId: "pdf.extract",
              fallbackToolIds: ["pdf.ocr.mineru"],
              reasons: ["PDF 来源优先使用本地 PDF Skill。"],
              warnings: [],
              permissions: ["promptInject", "fileRead", "fileWrite"],
            },
            memory: {
              recentRuns: 1,
              pendingInbox: 0,
              sources: 2,
              topics: 1,
              needsReview: 0,
              warnings: [],
            },
            workflow: {
              mode: "planner_executor_evaluator",
              roles: ["planner: 拆分任务"],
              reason: "PDF 任务较复杂。",
              warnings: ["当前版本先生成多角色计划。"],
            },
            expectedArtifacts: ["material-draft.json", "report.md"],
            reviewRequired: true,
            warnings: ["已使用片段模式"],
          },
        },
      ],
    }

    expect(parseMaterialWorkbenchState(serializeMaterialWorkbenchState(state))).toEqual(state)
  })

  it("ignores invalid persisted payloads instead of restoring corrupt state", () => {
    expect(parseMaterialWorkbenchState("{not-json")).toBeNull()
    expect(parseMaterialWorkbenchState(JSON.stringify({ title: 123, commandPrompt: [] }))).toBeNull()
  })
})

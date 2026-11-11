import { afterEach, describe, expect, it } from "vitest"

import {
  getMaterialWorkbenchSessionSnapshot,
  patchMaterialWorkbenchSession,
  resetMaterialWorkbenchSession,
  subscribeMaterialWorkbenchSession,
} from "@/lib/agent/material-workbench-session"

describe("material workbench session", () => {
  afterEach(() => {
    resetMaterialWorkbenchSession()
  })

  it("keeps uploaded file and running state outside the unmounted materials page", () => {
    const file = { name: "source.pdf" } as File

    patchMaterialWorkbenchSession({
      selectedMaterialFile: file,
      selectedMaterialFiles: [file],
      uploadedFileStatus: "parsing",
      processing: true,
      activeRunId: "run-1",
      runQueue: [
        {
          id: "run-1",
          title: "PDF 整理",
          skillId: "gongkao-material-parser",
          adapterLabel: "Codex CLI",
          status: "running",
          startedAt: "2026-06-02T00:00:00.000Z",
          summary: "正在解析 PDF",
          logs: ["queued", "parsing"],
          hasTrace: true,
        },
      ],
    })

    const snapshot = getMaterialWorkbenchSessionSnapshot()

    expect(snapshot.selectedMaterialFile).toBe(file)
    expect(snapshot.selectedMaterialFiles).toEqual([file])
    expect(snapshot.uploadedFileStatus).toBe("parsing")
    expect(snapshot.processing).toBe(true)
    expect(snapshot.activeRunId).toBe("run-1")
    expect(snapshot.runQueue[0]?.logs).toEqual(["queued", "parsing"])
    expect(snapshot.runQueue[0]?.hasTrace).toBe(true)
  })

  it("keeps the selected material file queue across page switches", () => {
    const firstFile = { name: "2024-exam.pdf" } as File
    const secondFile = { name: "answer.md" } as File

    patchMaterialWorkbenchSession({
      selectedMaterialFile: firstFile,
      selectedMaterialFiles: [firstFile, secondFile],
      fileName: "2 个文件：2024-exam.pdf、answer.md",
      uploadedFileStatus: "ready",
    })

    const snapshot = getMaterialWorkbenchSessionSnapshot()

    expect(snapshot.selectedMaterialFile).toBe(firstFile)
    expect(snapshot.selectedMaterialFiles).toEqual([firstFile, secondFile])
    expect(snapshot.fileName).toContain("2 个文件")
    expect(snapshot.uploadedFileStatus).toBe("ready")
  })

  it("keeps review-boundary run state when the page unmounts", () => {
    patchMaterialWorkbenchSession({
      processing: false,
      activeRunId: "run-review",
      runQueue: [
        {
          id: "run-review",
          title: "候选素材",
          skillId: "gongkao-material-parser",
          adapterLabel: "Codex CLI",
          status: "waiting_review",
          startedAt: "2026-06-03T00:00:00.000Z",
          workspacePath: "C:\\agent-runs\\run-review",
          summary: "候选素材已进入 Inbox，等待确认入库",
          logs: ["[validating] 正在读取并校验 material-draft.json", "[waiting_review] 候选素材已通过校验"],
          hasTrace: true,
        },
      ],
    })

    const snapshot = getMaterialWorkbenchSessionSnapshot()

    expect(snapshot.runQueue[0]?.status).toBe("waiting_review")
    expect(snapshot.runQueue[0]?.summary).toContain("等待确认入库")
    expect(snapshot.runQueue[0]?.hasTrace).toBe(true)
  })

  it("keeps streaming chat messages across page switches", () => {
    patchMaterialWorkbenchSession({
      chatMessages: [
        {
          id: "user-1",
          role: "user",
          content: "解析当前 PDF",
          createdAt: "2026-06-04T00:00:00.000Z",
          attachments: [{ id: "file-1", name: "文件：source.pdf", kind: "file", status: "ready" }],
        },
        {
          id: "assistant-1",
          role: "assistant",
          runId: "run-1",
          content: "候选素材已进入 Inbox，等待确认入库",
          createdAt: "2026-06-04T00:00:01.000Z",
          status: "waiting_review",
          events: [
            {
              id: "event-1",
              runId: "run-1",
              type: "inbox",
              label: "Inbox 待审核",
              message: "候选素材已进入 Inbox，等待确认入库",
              timestamp: "2026-06-04T00:00:02.000Z",
              severity: "success",
              rawKind: "waiting_review",
            },
          ],
          taskPlan: {
            runGoal: "解析当前 PDF",
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
              pendingInbox: 1,
              sources: 2,
              topics: 3,
              needsReview: 1,
              warnings: ["有候选素材等待确认。"],
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
          outputSummary: { questionCount: 3, flashcardCount: 5, warnings: ["需要复核引用"] },
        },
      ],
    })

    const snapshot = getMaterialWorkbenchSessionSnapshot()

    expect(snapshot.chatMessages).toHaveLength(2)
    expect(snapshot.chatMessages[1]?.status).toBe("waiting_review")
    expect(snapshot.chatMessages[1]?.events?.[0]?.type).toBe("inbox")
    expect(snapshot.chatMessages[1]?.taskPlan?.toolRoute.primaryToolId).toBe("pdf.extract")
    expect(snapshot.chatMessages[1]?.taskPlan?.reviewRequired).toBe(true)
    expect(snapshot.chatMessages[1]?.outputSummary?.warnings).toEqual(["需要复核引用"])
  })

  it("notifies subscribers when the session changes", () => {
    const seen: string[] = []
    const unsubscribe = subscribeMaterialWorkbenchSession((snapshot) => {
      seen.push(snapshot.fileName)
    })

    patchMaterialWorkbenchSession({ fileName: "a.pdf" })
    patchMaterialWorkbenchSession({ fileName: "b.pdf" })
    unsubscribe()
    patchMaterialWorkbenchSession({ fileName: "c.pdf" })

    expect(seen).toEqual(["a.pdf", "b.pdf"])
  })
})

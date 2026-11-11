import "fake-indexeddb/auto"
import { beforeEach, describe, expect, it } from "vitest"
import { DB_NAME, STORES, type AgentRunRecord, type MaterialInboxDraft, type ReviewState } from "@/lib/storage/schema"
import { getItem, listItems, putItem } from "@/lib/storage/idb"
import { agentRepository, materialInboxRepository, reviewRepository } from "@/lib/storage/repositories"

async function deleteDb(name: string) {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => resolve()
  })
}

describe("IndexedDB repositories", () => {
  beforeEach(async () => {
    await deleteDb(DB_NAME)
  })

  it("stores and lists review states", async () => {
    const state: ReviewState = {
      cardId: "f1",
      dueAt: "2026-05-22T08:00:00.000Z",
      intervalDays: 1,
      ease: 2.5,
      repetitions: 1,
      lapses: 0,
      updatedAt: "2026-05-21T08:00:00.000Z",
    }

    await reviewRepository.saveState(state)

    expect(await reviewRepository.getStates()).toEqual([state])
  })

  it("supports generic put/get/list helpers", async () => {
    const state: ReviewState = {
      cardId: "f2",
      dueAt: "2026-05-23T08:00:00.000Z",
      intervalDays: 2,
      ease: 2.6,
      repetitions: 2,
      lapses: 0,
      updatedAt: "2026-05-21T08:00:00.000Z",
    }

    await putItem(STORES.reviewStates, state)

    expect(await getItem<ReviewState>(STORES.reviewStates, "f2")).toEqual(state)
    expect(await listItems<ReviewState>(STORES.reviewStates)).toEqual([state])
  })

  it("stores agent run records and material inbox drafts", async () => {
    const run: AgentRunRecord = {
      id: "run-1",
      adapterId: "codex",
      skillId: "gongkao-material-parser",
      status: "completed",
      title: "Digital village",
      startedAt: "2026-05-26T10:00:00.000Z",
      endedAt: "2026-05-26T10:01:00.000Z",
      workspacePath: "D:\\tmp\\run-1",
      summary: "Generated a candidate material draft.",
    }
    const draft: MaterialInboxDraft = {
      id: "inbox-1",
      runId: "run-1",
      status: "pending",
      createdAt: "2026-05-26T10:01:00.000Z",
      outputJson: "{\"schemaVersion\":1}",
      validationErrors: [],
    }

    await agentRepository.saveRun(run)
    await materialInboxRepository.saveDraft(draft)
    await agentRepository.saveSettings({
      defaultAdapterId: "codex",
      defaultSkillId: "gongkao-material-parser",
      defaultModel: "gpt-5.5",
      defaultReasoning: "medium",
    })
    await materialInboxRepository.markImported("inbox-1")

    expect(await agentRepository.getRuns()).toEqual([run])
    expect(await materialInboxRepository.getDrafts()).toEqual([{ ...draft, status: "imported" }])
    expect(await agentRepository.getSettings()).toEqual({
      defaultAdapterId: "codex",
      defaultSkillId: "gongkao-material-parser",
      defaultModel: "gpt-5.5",
      defaultReasoning: "medium",
    })
  })
})

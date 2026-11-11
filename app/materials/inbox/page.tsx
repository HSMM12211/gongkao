"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Import, Loader2 } from "lucide-react"

import { MaterialsSecondaryNav } from "@/components/materials/materials-secondary-nav"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { parseAgentMaterialOutput, toMaterialDraftFromAgentOutput } from "@/lib/agent/material-output"
import { buildImportBundle, validateMaterialDraft } from "@/lib/material/processor"
import type { MaterialDraft, MaterialFileInput } from "@/lib/material/types"
import { inferSourceTypeFromFileName } from "@/lib/material/text"
import { materialInboxRepository, materialRepository } from "@/lib/storage/repositories"
import type { MaterialInboxDraft } from "@/lib/storage/schema"
import { toast } from "sonner"

export default function MaterialInboxPage() {
  const [drafts, setDrafts] = useState<MaterialInboxDraft[]>([])
  const [importingDraftId, setImportingDraftId] = useState("")

  useEffect(() => {
    void refreshDrafts()
  }, [])

  const refreshDrafts = async () => {
    await materialInboxRepository
      .getDrafts()
      .then((items) => setDrafts(items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))))
      .catch(() => setDrafts([]))
  }

  const importInboxDraft = async (draft: MaterialInboxDraft) => {
    if (importingDraftId) return

    const parsed = parseAgentMaterialOutput(draft.outputJson)
    if (!parsed.ok) {
      toast.error(parsed.errors[0] ?? "候选素材未通过结构校验，无法入库")
      return
    }

    const materialDraft = toMaterialDraftFromAgentOutput(parsed.value)
    const draftErrors = validateMaterialDraft(materialDraft)
    if (draftErrors.length > 0) {
      toast.error(draftErrors[0])
      return
    }

    const sourceInput: MaterialFileInput = parsed.value.source
    const bundle = buildImportBundle(
      {
        ...sourceInput,
        title: sourceInput.title || materialDraft.topic,
        sourceType: sourceInput.originalName ? inferSourceTypeFromFileName(sourceInput.originalName) : sourceInput.sourceType,
      },
      materialDraft,
    )

    setImportingDraftId(draft.id)
    try {
      await materialRepository.saveImportBundle({
        source: bundle.source,
        flashcards: bundle.flashcards,
        questions: bundle.questions,
        copybookItems: bundle.copybookItems,
      })
      await materialInboxRepository.markImported(draft.id)
      await refreshDrafts()
      toast.success("候选素材已导入本地题库")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "候选素材入库失败")
    } finally {
      setImportingDraftId("")
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-6 lg:p-8">
      <MaterialsSecondaryNav />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-bold tracking-wide text-primary">MATERIAL INBOX</div>
          <h1 className="mt-1 font-serif text-3xl font-bold">Inbox 审核</h1>
          <p className="mt-2 text-sm text-muted-foreground">Agent 输出先进入这里，用户确认后再写入正式本地题库。</p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/materials">返回素材工作台</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>候选素材</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {drafts.length === 0 ? (
            <div className="rounded-md border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
              Inbox 为空。Agent 生成的候选素材会先进入这里等待审核。
            </div>
          ) : (
            drafts.map((draft) => {
              const preview = parseInboxDraftPreview(draft)
              const importing = importingDraftId === draft.id
              const canImport = draft.status === "pending" && preview.ok
              return (
                <div key={draft.id} className="rounded-md border bg-background p-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium">Run {draft.runId.slice(0, 8)}</div>
                      <p className="mt-1 text-xs text-muted-foreground">{draft.createdAt}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Badge variant={preview.ok ? (draft.status === "pending" ? "secondary" : "outline") : "destructive"}>
                        {draft.status}
                      </Badge>
                      {canImport ? (
                        <Button size="sm" onClick={() => void importInboxDraft(draft)} disabled={importing}>
                          {importing ? <Loader2 className="size-3.5 animate-spin" /> : <Import className="size-3.5" />}
                          确认入库
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {preview.ok ? (
                    <div className="mt-3 rounded-md bg-muted/30 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{preview.materialDraft.topic}</span>
                        <Badge variant="outline">{preview.source.sourceType}</Badge>
                        {draft.status === "imported" ? <Badge variant="secondary">已入库</Badge> : null}
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {preview.materialDraft.summary}
                      </p>
                      {draft.validationWarnings?.length ? (
                        <div className="mt-2 rounded-md border border-amber-300/60 bg-amber-50 p-2 text-xs text-amber-800">
                          <div className="font-medium">业务校验提示</div>
                          <ul className="mt-1 list-inside list-disc space-y-0.5">
                            {draft.validationWarnings.slice(0, 3).map((warning) => (
                              <li key={warning}>{warning}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                        <DraftStat label="温故卡" value={preview.materialDraft.flashcards.length} />
                        <DraftStat label="练习题" value={preview.materialDraft.practiceQuestions.length} />
                        <DraftStat label="字帖摘抄" value={preview.materialDraft.copybookItems.length} />
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-destructive">{preview.errors[0]}</p>
                  )}
                </div>
              )
            })
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function parseInboxDraftPreview(draft: MaterialInboxDraft):
  | { ok: true; source: MaterialFileInput; materialDraft: MaterialDraft }
  | { ok: false; errors: string[] } {
  const parsed = parseAgentMaterialOutput(draft.outputJson)
  if (!parsed.ok) {
    return {
      ok: false,
      errors: parsed.errors.length > 0 ? parsed.errors : draft.validationErrors,
    }
  }

  const materialDraft = toMaterialDraftFromAgentOutput(parsed.value)
  const errors = validateMaterialDraft(materialDraft)
  if (errors.length > 0) return { ok: false, errors }

  return {
    ok: true,
    source: parsed.value.source,
    materialDraft,
  }
}

function DraftStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-background p-2">
      <div className="font-semibold">{value}</div>
      <div className="text-muted-foreground">{label}</div>
    </div>
  )
}

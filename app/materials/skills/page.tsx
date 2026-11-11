"use client"

import { useEffect, useMemo, useState } from "react"
import { Copy, Play, RefreshCw, Save, ShieldAlert, WandSparkles } from "lucide-react"
import { toast } from "sonner"

import { MaterialsSecondaryNav } from "@/components/materials/materials-secondary-nav"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { loadTauriAgentRuntime } from "@/lib/agent/material-run"
import { agentRepository } from "@/lib/storage/repositories"
import { BUILTIN_MATERIAL_SKILLS, type MaterialSkillTrust } from "@/lib/agent/skill-inputs"
import { normalizeManagedSkill, validateSkillManifestInput } from "@/lib/agent/skill-management"
import type { ManagedSkillInfo, SkillManifestInput } from "@/types/agent-runtime"

const TRUST_OPTIONS: MaterialSkillTrust[] = ["trusted", "restricted", "blocked"]

export default function MaterialSkillsPage() {
  const [skills, setSkills] = useState<ManagedSkillInfo[]>([])
  const [selectedSkillId, setSelectedSkillId] = useState("")
  const [selectedSkillDetail, setSelectedSkillDetail] = useState<ManagedSkillInfo | undefined>()
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [markdownDraft, setMarkdownDraft] = useState("")

  const visibleSkills = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return skills
    return skills.filter((skill) =>
      `${skill.id} ${skill.name} ${skill.displayName ?? ""} ${skill.description} ${skill.scenario ?? ""}`
        .toLowerCase()
        .includes(keyword),
    )
  }, [query, skills])
  const listSelection = skills.find((skill) => skill.id === selectedSkillId) ?? skills[0]
  const selectedSkill =
    selectedSkillDetail?.id === selectedSkillId ? selectedSkillDetail : listSelection

  const refresh = async () => {
    setLoading(true)
    try {
      const runtime = await loadTauriAgentRuntime()
      const nextSkills = (await runtime.listManagedSkills()).map(normalizeManagedSkill)
      setSkills(nextSkills)
      setSelectedSkillId((current) => current || nextSkills[0]?.id || "")
    } catch {
      const nextSkills = fallbackManagedSkills()
      setSkills(nextSkills)
      setSelectedSkillId((current) => current || nextSkills[0]?.id || "")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  useEffect(() => {
    if (!selectedSkillId) return
    let cancelled = false
    void loadTauriAgentRuntime()
      .then((runtime) => runtime.getSkillDetail(selectedSkillId))
      .then((detail) => {
        if (!cancelled) setSelectedSkillDetail(normalizeManagedSkill(detail))
      })
      .catch(() => {
        if (!cancelled) setSelectedSkillDetail(skills.find((skill) => skill.id === selectedSkillId))
      })
    return () => {
      cancelled = true
    }
  }, [selectedSkillId, skills])

  useEffect(() => {
    if (!selectedSkill) return
    setMarkdownDraft(selectedSkill.skillMarkdown ?? defaultSkillMarkdown(selectedSkill))
  }, [selectedSkill])

  const replaceSkill = (updated: ManagedSkillInfo) => {
    setSelectedSkillDetail(updated)
    setSelectedSkillId(updated.id)
    setSkills((current) => {
      const exists = current.some((item) => item.id === updated.id)
      return exists ? current.map((item) => (item.id === updated.id ? updated : item)) : [updated, ...current]
    })
  }

  const updateSkillState = async (skill: ManagedSkillInfo, enabled: boolean, trust = skill.trust) => {
    try {
      const runtime = await loadTauriAgentRuntime()
      replaceSkill(normalizeManagedSkill(await runtime.setSkillState(skill.id, enabled, trust)))
      toast.success("Skill 状态已更新")
    } catch {
      replaceSkill({ ...skill, enabled, trust })
      toast.message("当前是浏览器预览，状态仅在页面内临时生效")
    }
  }

  const duplicateSkill = async (skill: ManagedSkillInfo) => {
    try {
      const runtime = await loadTauriAgentRuntime()
      replaceSkill(normalizeManagedSkill(await runtime.duplicateSkill(skill.id)))
      toast.success("已复制为用户自定义 Skill")
    } catch {
      const copy = normalizeManagedSkill({
        ...skill,
        id: `${skill.id}-copy`,
        name: `${skill.name}-copy`,
        displayName: `${skill.displayName ?? skill.name} 副本`,
        source: "user-local",
        trust: "restricted",
        enabled: false,
      })
      replaceSkill(copy)
      toast.message("当前是浏览器预览，复制结果不会写入本地")
    }
  }

  const createBlankSkill = async () => {
    const id = `gongkao-custom-${Date.now().toString(36)}`
    const input: SkillManifestInput = {
      id,
      name: id,
      displayName: "自定义素材 Skill",
      description: "用于采集、解析或整理公考素材的自定义 Skill。",
      scenario: "自定义",
      source: "user-local",
      trust: "restricted",
      enabled: false,
      inputs: [{ name: "topic", label: "主题", type: "string", required: true }],
      outputs: ["候选素材"],
      requiredCapabilities: ["fileRead", "fileWrite", "structuredOutput"],
      requiredPermissions: ["promptInject", "fileRead", "fileWrite"],
      skillMarkdown: defaultMarkdownForNewSkill(id),
    }
    try {
      const runtime = await loadTauriAgentRuntime()
      replaceSkill(normalizeManagedSkill(await runtime.createUserSkill(input)))
      toast.success("自定义 Skill 已创建")
    } catch {
      replaceSkill(normalizeManagedSkill({ ...input, path: `agent-skills/${id}`, triggers: ["自定义"] }))
      toast.message("当前是浏览器预览，新建结果不会写入本地")
    }
  }

  const saveMarkdown = async (skill: ManagedSkillInfo) => {
    if (skill.source === "built-in") {
      toast.error("内置 Skill 只读，请先复制为自定义 Skill")
      return
    }
    const input = toManifestInput(skill, markdownDraft)
    const errors = validateSkillManifestInput(input)
    if (errors.length > 0) {
      toast.error(errors[0])
      return
    }
    try {
      const runtime = await loadTauriAgentRuntime()
      replaceSkill(normalizeManagedSkill(await runtime.updateUserSkill(skill.id, input)))
      toast.success("Skill 已保存")
    } catch {
      replaceSkill({ ...skill, skillMarkdown: markdownDraft, validationStatus: "valid", validationErrors: [] })
      toast.message("当前是浏览器预览，保存结果不会写入本地")
    }
  }

  const validateSkill = async (skill: ManagedSkillInfo) => {
    try {
      const runtime = await loadTauriAgentRuntime()
      const result = await runtime.validateSkill(skill.id)
      toast[result.ok ? "success" : "error"](result.ok ? "Skill 校验通过" : result.errors[0] ?? "Skill 校验失败")
    } catch {
      toast.message(skill.validationStatus === "invalid" ? skill.validationErrors[0] : "当前 Skill 预览校验通过")
    }
  }

  const startTestRun = async (skill: ManagedSkillInfo) => {
    try {
      const runtime = await loadTauriAgentRuntime()
      const run = await runtime.startSkillTestRun({
        skillId: skill.id,
        sampleTopic: skill.scenario ?? "公考素材测试",
        sampleInstruction: "请生成一份可进入 Inbox 审核的 material-draft.json。",
      })
      await agentRepository.saveRun({
        id: run.runId,
        adapterId: "codex",
        skillId: skill.id,
        status: "running",
        title: skill.id === "gongkao-smoke-test-skill" ? "Skill Runtime Smoke Test" : `${skill.displayName ?? skill.name} 测试`,
        startedAt: new Date().toISOString(),
        workspacePath: run.workspacePath,
        summary: "Skill 测试正在运行",
      })
      toast.success(`测试运行已启动：${run.runId.slice(0, 8)}`)
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "测试运行启动失败")
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-6 lg:p-8">
      <MaterialsSecondaryNav />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-bold tracking-wide text-primary">MATERIAL SKILL CENTER</div>
          <h1 className="mt-1 font-serif text-3xl font-bold">Skill 管理</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            管理素材知识库使用的可复用任务能力。配置完成的 Skill 会回到素材工作台，供采集、解析、专题 Wiki 和批量入库流程调用。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className="size-4" />
            刷新
          </Button>
          <Button onClick={() => void createBlankSkill()}>
            <WandSparkles className="size-4" />
            新建 Skill
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-secondary/25 bg-secondary/5 p-3 text-sm text-secondary">
        Skill 管理只负责能力配置；素材工作台负责绑定 @ 上下文、启动 Agent、生成候选素材并进入 Inbox 审核。
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(360px,0.85fr)_minmax(560px,1.15fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Skill 清单</CardTitle>
            <CardDescription>按来源、信任等级、启用状态和权限风险筛选。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索：热点 / PDF / Wiki / 真题" />
            <div className="space-y-2">
              {visibleSkills.map((skill) => (
                <button
                  key={skill.id}
                  type="button"
                  onClick={() => setSelectedSkillId(skill.id)}
                  className={`w-full rounded-md border p-3 text-left transition-colors ${
                    selectedSkill?.id === skill.id ? "border-primary/35 bg-primary/5" : "bg-background hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{skill.displayName ?? skill.name}</div>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{skill.description}</p>
                    </div>
                    <Badge variant={skill.enabled ? "secondary" : "outline"}>{skill.enabled ? "启用" : "禁用"}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Badge variant={trustVariant(skill.trust)}>{trustLabel(skill.trust)}</Badge>
                    <Badge variant="outline">{sourceLabel(skill.source)}</Badge>
                    {(skill.requiredPermissions ?? []).slice(0, 4).map((permission) => (
                      <Badge key={permission} variant={permission === "network" || permission === "subprocess" ? "destructive" : "outline"}>
                        {permission}
                      </Badge>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <SkillDetail
          skill={selectedSkill}
          markdownDraft={markdownDraft}
          setMarkdownDraft={setMarkdownDraft}
          onDuplicate={duplicateSkill}
          onSetState={updateSkillState}
          onSave={saveMarkdown}
          onValidate={validateSkill}
          onTestRun={startTestRun}
        />
      </div>
    </div>
  )
}

function SkillDetail({
  skill,
  markdownDraft,
  setMarkdownDraft,
  onDuplicate,
  onSetState,
  onSave,
  onValidate,
  onTestRun,
}: {
  skill?: ManagedSkillInfo
  markdownDraft: string
  setMarkdownDraft: (value: string) => void
  onDuplicate: (skill: ManagedSkillInfo) => Promise<void>
  onSetState: (skill: ManagedSkillInfo, enabled: boolean, trust?: MaterialSkillTrust) => Promise<void>
  onSave: (skill: ManagedSkillInfo) => Promise<void>
  onValidate: (skill: ManagedSkillInfo) => Promise<void>
  onTestRun: (skill: ManagedSkillInfo) => Promise<void>
}) {
  if (!skill) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">暂无 Skill</CardContent>
      </Card>
    )
  }

  const canEdit = skill.source !== "built-in"

  return (
    <div className="space-y-5">
      <Card className="border-primary/20">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="font-serif text-2xl">{skill.displayName ?? skill.name}</CardTitle>
              <CardDescription className="mt-2">{skill.description}</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void onDuplicate(skill)}>
                <Copy className="size-4" />
                复制为自定义
              </Button>
              <Button variant="outline" onClick={() => void onSetState(skill, !skill.enabled, skill.trust)}>
                {skill.enabled ? "禁用" : "启用"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Meta label="来源" value={sourceLabel(skill.source)} />
          <Meta label="信任等级" value={trustLabel(skill.trust)} />
          <Meta label="校验状态" value={validationLabel(skill.validationStatus)} />
          <Meta label="最近测试" value={skill.lastTestRunId?.slice(0, 8) ?? "未测试"} />
        </CardContent>
      </Card>

      <Card>
        <Tabs defaultValue="inputs">
          <CardHeader className="pb-0">
            <TabsList className="flex flex-wrap">
              <TabsTrigger value="inputs">结构化输入</TabsTrigger>
              <TabsTrigger value="permissions">权限</TabsTrigger>
              <TabsTrigger value="test">测试运行</TabsTrigger>
              <TabsTrigger value="markdown">SKILL.md</TabsTrigger>
            </TabsList>
          </CardHeader>
          <CardContent className="pt-4">
            <TabsContent value="inputs" className="space-y-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {(skill.inputs ?? []).length === 0 ? (
                  <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">暂无结构化输入字段</div>
                ) : (
                  (skill.inputs ?? []).map((input) => (
                    <div key={input.name} className="rounded-md border bg-muted/30 p-3 text-sm">
                      <div className="font-medium">{input.label}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {input.name} / {input.type}
                        {input.required ? " / 必填" : ""}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>
            <TabsContent value="permissions" className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {TRUST_OPTIONS.map((trust) => (
                  <Button
                    key={trust}
                    variant={skill.trust === trust ? "default" : "outline"}
                    size="sm"
                    onClick={() => void onSetState(skill, skill.enabled, trust)}
                  >
                    {trustLabel(trust)}
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {(skill.requiredPermissions ?? []).map((permission) => (
                  <Badge key={permission} variant={permission === "network" || permission === "subprocess" ? "destructive" : "outline"}>
                    {permission}
                  </Badge>
                ))}
              </div>
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <ShieldAlert className="mr-2 inline size-4" />
                外部 Skill 启用前必须复核权限；Agent 运行仍只写入隔离工作区。
              </div>
            </TabsContent>
            <TabsContent value="test" className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => void onValidate(skill)}>
                  <RefreshCw className="size-4" />
                  校验
                </Button>
                <Button onClick={() => void onTestRun(skill)} disabled={!skill.enabled || skill.trust === "blocked"}>
                  <Play className="size-4" />
                  测试运行
                </Button>
              </div>
              <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                测试运行会生成 run workspace、stdout.log、stderr.log、material-draft.json，并进入结构校验。
              </div>
            </TabsContent>
            <TabsContent value="markdown" className="space-y-3">
              <Textarea
                value={markdownDraft}
                onChange={(event) => setMarkdownDraft(event.target.value)}
                readOnly={!canEdit}
                className="min-h-[320px] font-mono text-xs"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {canEdit ? "自定义 Skill 可直接编辑保存。" : "内置 Skill 只读，需要复制为自定义后再编辑。"}
                </p>
                <Button onClick={() => void onSave(skill)} disabled={!canEdit}>
                  <Save className="size-4" />
                  保存
                </Button>
              </div>
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-medium">{value}</div>
    </div>
  )
}

function fallbackManagedSkills(): ManagedSkillInfo[] {
  return BUILTIN_MATERIAL_SKILLS.map((skill) =>
    normalizeManagedSkill({
      id: skill.id,
      name: skill.name,
      displayName: skill.name,
      description: skill.description,
      path: `skills/${skill.id}`,
      triggers: [skill.scenario],
      scenario: skill.scenario,
      source: skill.source,
      trust: skill.trust,
      enabled: true,
      validationStatus: "valid",
      validationErrors: [],
      inputs: skill.inputs,
      outputs: skill.outputs,
      requiredCapabilities: skill.requiredCapabilities,
      requiredPermissions: [...skill.requiredPermissions],
      skillMarkdown: defaultMarkdownForNewSkill(skill.id),
    }),
  )
}

function toManifestInput(skill: ManagedSkillInfo, skillMarkdown: string): SkillManifestInput {
  return {
    id: skill.id,
    name: skill.name,
    displayName: skill.displayName,
    description: skill.description,
    scenario: skill.scenario,
    source: skill.source,
    trust: skill.trust,
    enabled: skill.enabled,
    inputs: skill.inputs ?? [],
    outputs: skill.outputs ?? [],
    requiredCapabilities: skill.requiredCapabilities ?? [],
    requiredPermissions: skill.requiredPermissions ?? [],
    skillMarkdown,
  }
}

function defaultSkillMarkdown(skill: ManagedSkillInfo): string {
  return defaultMarkdownForNewSkill(skill.id, skill.description)
}

function defaultMarkdownForNewSkill(id: string, description = "Gongkao material Skill."): string {
  return `---
name: ${id}
description: ${description}
triggers:
  - material
---

# Workflow

1. Read the input topic, context, and source text.
2. Produce structured public-exam material candidates.
3. Write the final result to material-draft.json in the run workspace.
`
}

function sourceLabel(source: string): string {
  if (source === "built-in") return "内置"
  if (source === "user-local") return "本地自定义"
  return "外部"
}

function trustLabel(trust: MaterialSkillTrust): string {
  if (trust === "trusted") return "可信"
  if (trust === "restricted") return "受限"
  return "阻止"
}

function trustVariant(trust: MaterialSkillTrust): "default" | "secondary" | "destructive" | "outline" {
  if (trust === "trusted") return "secondary"
  if (trust === "blocked") return "destructive"
  return "outline"
}

function validationLabel(status: ManagedSkillInfo["validationStatus"]): string {
  if (status === "valid") return "通过"
  if (status === "warning") return "有警告"
  if (status === "invalid") return "未通过"
  return "未知"
}

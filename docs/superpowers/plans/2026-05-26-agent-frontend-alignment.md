# Gongkao Agent Frontend Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the Gongkao app frontend with the approved current-project UI proposal: keep the existing AppShell, sidebar, topbar, shadcn-style cards, and政务红/墨绿 palette, while moving Codex CLI / Claude Code execution selection into a unified top-right Agent menu.

**Architecture:** This is a frontend alignment plan only. It introduces a global Agent execution setting in the existing runtime store, renders a topbar `AgentExecutorMenu`, and updates Materials/Settings pages to consume the global selection instead of placing adapter/model configuration inside the Materials workflow. Backend CLI execution, real adapter detection, and real run streaming remain owned by the later CLI runtime plan.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS, shadcn UI primitives, lucide-react, Vitest.

---

## Scope

This plan updates the frontend to match the prototype at:

- `.superpowers/brainstorm/agent-ui-20260526052950/content/frontend-agent-layout-v1.html`

It intentionally **does not** implement:

- Rust/Tauri CLI process spawning.
- Real Codex/Claude detection.
- Real material-agent run execution.
- IndexedDB agent run persistence.
- Obsidian or external wiki integration.

It supersedes the frontend portion of `docs/superpowers/plans/2026-05-26-gongkao-cli-skill-runtime.md` where `app/materials/page.tsx` was going to own the adapter picker. The new rule is:

```text
TopBar owns execution environment.
Materials page owns material workflow.
Settings page owns detailed diagnostics.
```

## File Structure

### Create

- `types/agent-executor.ts`  
  Shared frontend types and static option constants for Codex CLI / Claude Code execution settings.

- `lib/agent/executor-settings.ts`  
  Pure helpers for normalizing, loading, saving, and displaying Agent executor settings. Kept pure enough for Vitest.

- `components/agent/agent-executor-menu.tsx`  
  Topbar popover/dropdown that matches the current Gongkao UI language and lets the user choose local CLI/API mode, Codex/Claude, model, and reasoning effort.

- `test/lib/agent/executor-settings.test.ts`  
  Unit tests for settings normalization and display labels.

### Modify

- `lib/runtime-store.tsx`  
  Add globally available `agentExecutor`, `setAgentExecutor`, and static adapter status entries. Persist selected settings in localStorage.

- `components/app-shell.tsx`  
  Keep the current sidebar/topbar layout. Replace the ad hoc topbar Agent idea with `AgentExecutorMenu` between the runtime switch and user pill.

- `app/materials/page.tsx`  
  Add an `Agent 采集` tab inside the existing input card. It reads the global execution environment and shows a compact status hint, Skill selector, task textarea, run-log placeholder, and Inbox handoff CTA.

- `app/settings/page.tsx`  
  Add a compact “素材 Agent 执行环境” card for status/diagnostics. This is secondary; the topbar is the daily control surface.

---

## Task 1: Define Agent Executor Types And Helpers

**Files:**

- Create: `types/agent-executor.ts`
- Create: `lib/agent/executor-settings.ts`
- Create: `test/lib/agent/executor-settings.test.ts`

- [ ] **Step 1: Create shared frontend types**

Create `types/agent-executor.ts`:

```ts
export type AgentExecutionMode = "local-cli" | "api-key"

export type AgentAdapterId = "codex" | "claude"

export type AgentReasoningEffort = "default" | "medium" | "high" | "xhigh"

export type AgentExecutorSettings = {
  mode: AgentExecutionMode
  adapterId: AgentAdapterId
  model: string
  reasoning: AgentReasoningEffort
}

export type AgentAdapterStatus = {
  id: AgentAdapterId
  name: string
  available: boolean
  authStatus: "ok" | "missing" | "unknown"
  version?: string
  message: string
}

export const DEFAULT_AGENT_EXECUTOR_SETTINGS: AgentExecutorSettings = {
  mode: "local-cli",
  adapterId: "codex",
  model: "gpt-5.5",
  reasoning: "medium",
}

export const AGENT_MODEL_OPTIONS: Record<AgentAdapterId, string[]> = {
  codex: ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.3-codex"],
  claude: ["sonnet", "opus", "haiku", "claude-sonnet-4-5"],
}

export const AGENT_REASONING_OPTIONS: Array<{ value: AgentReasoningEffort; label: string }> = [
  { value: "default", label: "默认" },
  { value: "medium", label: "medium · 日常素材整理" },
  { value: "high", label: "high · 深度解析" },
  { value: "xhigh", label: "xhigh · 复杂专题研究" },
]

export const DEFAULT_AGENT_ADAPTER_STATUSES: AgentAdapterStatus[] = [
  {
    id: "codex",
    name: "Codex CLI",
    available: true,
    authStatus: "ok",
    version: "待接入检测",
    message: "前端已对齐；真实检测由后续 Tauri CLI runtime 接入。",
  },
  {
    id: "claude",
    name: "Claude Code",
    available: true,
    authStatus: "unknown",
    version: "待接入检测",
    message: "前端已对齐；真实登录状态由后续 Tauri CLI runtime 接入。",
  },
]
```

- [ ] **Step 2: Write failing helper tests**

Create `test/lib/agent/executor-settings.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  displayAgentExecutor,
  normalizeAgentExecutorSettings,
} from "@/lib/agent/executor-settings"

describe("agent executor settings", () => {
  it("falls back to Codex local CLI defaults for malformed input", () => {
    const settings = normalizeAgentExecutorSettings({
      mode: "bad",
      adapterId: "unknown",
      model: "",
      reasoning: "extreme",
    })

    expect(settings).toEqual({
      mode: "local-cli",
      adapterId: "codex",
      model: "gpt-5.5",
      reasoning: "medium",
    })
  })

  it("keeps valid Claude settings and displays a topbar label", () => {
    const settings = normalizeAgentExecutorSettings({
      mode: "local-cli",
      adapterId: "claude",
      model: "sonnet",
      reasoning: "default",
    })

    expect(settings.adapterId).toBe("claude")
    expect(displayAgentExecutor(settings)).toBe("Claude Code · sonnet")
  })
})
```

- [ ] **Step 3: Run the failing test**

Run:

```powershell
npm.cmd run test -- test/lib/agent/executor-settings.test.ts
```

Expected: fail because `@/lib/agent/executor-settings` does not exist.

- [ ] **Step 4: Implement helper functions**

Create `lib/agent/executor-settings.ts`:

```ts
import {
  AGENT_MODEL_OPTIONS,
  DEFAULT_AGENT_EXECUTOR_SETTINGS,
  type AgentAdapterId,
  type AgentExecutionMode,
  type AgentExecutorSettings,
  type AgentReasoningEffort,
} from "@/types/agent-executor"

const STORAGE_KEY = "gongkao.agentExecutorSettings"
const MODES = new Set<AgentExecutionMode>(["local-cli", "api-key"])
const ADAPTERS = new Set<AgentAdapterId>(["codex", "claude"])
const REASONING = new Set<AgentReasoningEffort>(["default", "medium", "high", "xhigh"])

export function normalizeAgentExecutorSettings(input: unknown): AgentExecutorSettings {
  if (!input || typeof input !== "object") return DEFAULT_AGENT_EXECUTOR_SETTINGS
  const record = input as Partial<Record<keyof AgentExecutorSettings, unknown>>
  const mode = typeof record.mode === "string" && MODES.has(record.mode as AgentExecutionMode)
    ? (record.mode as AgentExecutionMode)
    : DEFAULT_AGENT_EXECUTOR_SETTINGS.mode
  const adapterId = typeof record.adapterId === "string" && ADAPTERS.has(record.adapterId as AgentAdapterId)
    ? (record.adapterId as AgentAdapterId)
    : DEFAULT_AGENT_EXECUTOR_SETTINGS.adapterId
  const fallbackModel = AGENT_MODEL_OPTIONS[adapterId][0] ?? DEFAULT_AGENT_EXECUTOR_SETTINGS.model
  const model = typeof record.model === "string" && record.model.trim()
    ? record.model.trim()
    : fallbackModel
  const reasoning = typeof record.reasoning === "string" && REASONING.has(record.reasoning as AgentReasoningEffort)
    ? (record.reasoning as AgentReasoningEffort)
    : DEFAULT_AGENT_EXECUTOR_SETTINGS.reasoning

  return { mode, adapterId, model, reasoning }
}

export function loadAgentExecutorSettings(): AgentExecutorSettings {
  if (typeof window === "undefined") return DEFAULT_AGENT_EXECUTOR_SETTINGS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return normalizeAgentExecutorSettings(raw ? JSON.parse(raw) : null)
  } catch {
    return DEFAULT_AGENT_EXECUTOR_SETTINGS
  }
}

export function saveAgentExecutorSettings(settings: AgentExecutorSettings): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeAgentExecutorSettings(settings)))
}

export function displayAgentExecutor(settings: AgentExecutorSettings): string {
  const adapterName = settings.adapterId === "codex" ? "Codex CLI" : "Claude Code"
  return `${adapterName} · ${settings.model}`
}
```

- [ ] **Step 5: Run helper tests**

Run:

```powershell
npm.cmd run test -- test/lib/agent/executor-settings.test.ts
```

Expected: pass.

---

## Task 2: Extend Global Runtime Store

**Files:**

- Modify: `lib/runtime-store.tsx`

- [ ] **Step 1: Add Agent executor state to the runtime context**

Modify imports in `lib/runtime-store.tsx`:

```ts
import {
  DEFAULT_AGENT_ADAPTER_STATUSES,
  DEFAULT_AGENT_EXECUTOR_SETTINGS,
  type AgentAdapterStatus,
  type AgentExecutorSettings,
} from "@/types/agent-executor"
import {
  loadAgentExecutorSettings,
  normalizeAgentExecutorSettings,
  saveAgentExecutorSettings,
} from "@/lib/agent/executor-settings"
```

Update `RuntimeState`:

```ts
interface RuntimeState {
  runtime: Runtime
  setRuntime: (r: Runtime) => void
  themeColor: string
  setThemeColor: (hex: string) => void
  agentExecutor: AgentExecutorSettings
  setAgentExecutor: (settings: AgentExecutorSettings) => void
  agentAdapters: AgentAdapterStatus[]
}
```

Add state inside `RuntimeProvider`:

```ts
const [agentExecutor, setAgentExecutorState] = useState<AgentExecutorSettings>(DEFAULT_AGENT_EXECUTOR_SETTINGS)
const [agentAdapters] = useState<AgentAdapterStatus[]>(DEFAULT_AGENT_ADAPTER_STATUSES)
```

Hydrate it in the existing localStorage `useEffect`:

```ts
const savedAgentExecutor = loadAgentExecutorSettings()
setAgentExecutorState(savedAgentExecutor)
```

Add the setter:

```ts
const setAgentExecutor = (settings: AgentExecutorSettings) => {
  const normalized = normalizeAgentExecutorSettings(settings)
  setAgentExecutorState(normalized)
  saveAgentExecutorSettings(normalized)
}
```

Update the provider value:

```tsx
<RuntimeCtx.Provider
  value={{
    runtime,
    setRuntime,
    themeColor,
    setThemeColor,
    agentExecutor,
    setAgentExecutor,
    agentAdapters,
  }}
>
  {children}
</RuntimeCtx.Provider>
```

- [ ] **Step 2: Run type check**

Run:

```powershell
npx.cmd tsc --noEmit
```

Expected: pass.

---

## Task 3: Build The Topbar Agent Executor Menu

**Files:**

- Create: `components/agent/agent-executor-menu.tsx`

- [ ] **Step 1: Create the component**

Create `components/agent/agent-executor-menu.tsx`:

```tsx
"use client"

import { Bot, Check, ChevronDown, Cpu, RefreshCw, Settings2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AGENT_MODEL_OPTIONS, AGENT_REASONING_OPTIONS, type AgentAdapterId, type AgentExecutionMode } from "@/types/agent-executor"
import { displayAgentExecutor } from "@/lib/agent/executor-settings"
import { cn } from "@/lib/utils"
import { useRuntime } from "@/lib/runtime-store"

export function AgentExecutorMenu() {
  const { agentExecutor, setAgentExecutor, agentAdapters } = useRuntime()
  const activeAdapter = agentAdapters.find((adapter) => adapter.id === agentExecutor.adapterId)
  const modelOptions = AGENT_MODEL_OPTIONS[agentExecutor.adapterId]

  const update = (patch: Partial<typeof agentExecutor>) => {
    const nextAdapterId = patch.adapterId ?? agentExecutor.adapterId
    const nextModel = patch.adapterId && patch.adapterId !== agentExecutor.adapterId
      ? AGENT_MODEL_OPTIONS[nextAdapterId][0]
      : patch.model ?? agentExecutor.model
    setAgentExecutor({ ...agentExecutor, ...patch, model: nextModel })
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="hidden md:inline-flex h-9 items-center gap-2 rounded-full border border-primary/25 bg-primary/5 px-3 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
          aria-label="打开 Agent 执行环境"
        >
          <Bot className="size-3.5" />
          <span>Agent：{displayAgentExecutor(agentExecutor)}</span>
          <ChevronDown className="size-3.5 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-4">
        <div className="flex items-start justify-between gap-3 border-b pb-3">
          <div>
            <div className="font-medium">Agent 执行环境</div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              全局选择 Codex CLI / Claude Code。素材页只读取这里的当前环境。
            </p>
          </div>
          <Badge variant="outline" className="text-primary">全局</Badge>
        </div>

        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">模式</div>
            <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
              {[
                ["local-cli", "本地 CLI"],
                ["api-key", "API Key"],
              ].map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  className={cn(
                    "h-8 rounded-sm text-xs font-medium text-muted-foreground",
                    agentExecutor.mode === mode && "bg-background text-primary shadow-sm",
                  )}
                  onClick={() => update({ mode: mode as AgentExecutionMode })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Agent Adapter</div>
            <div className="grid grid-cols-2 gap-2">
              {agentAdapters.map((adapter) => (
                <button
                  key={adapter.id}
                  type="button"
                  className={cn(
                    "rounded-md border bg-background p-3 text-left transition-colors hover:bg-muted/60",
                    agentExecutor.adapterId === adapter.id && "border-primary/30 bg-primary/5",
                  )}
                  onClick={() => update({ adapterId: adapter.id })}
                >
                  <div className="flex items-center justify-between gap-2 text-sm font-medium">
                    {adapter.name}
                    {agentExecutor.adapterId === adapter.id ? <Check className="size-4 text-primary" /> : null}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{adapter.message}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">模型</div>
            <Select value={agentExecutor.model} onValueChange={(model) => update({ model })}>
              <SelectTrigger>
                <SelectValue placeholder="选择模型" />
              </SelectTrigger>
              <SelectContent>
                {modelOptions.map((model) => (
                  <SelectItem key={model} value={model}>{model}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {agentExecutor.adapterId === "codex" && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">推理强度</div>
              <Select value={agentExecutor.reasoning} onValueChange={(reasoning) => update({ reasoning: reasoning as typeof agentExecutor.reasoning })}>
                <SelectTrigger>
                  <SelectValue placeholder="选择推理强度" />
                </SelectTrigger>
                <SelectContent>
                  {AGENT_REASONING_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="rounded-md border border-secondary/25 bg-secondary/10 p-3 text-xs text-secondary">
            <div className="flex items-center gap-2 font-medium">
              <Cpu className="size-3.5" />
              当前环境：{activeAdapter?.name ?? "未知 Agent"} / {agentExecutor.model}
            </div>
            <p className="mt-1 leading-relaxed text-secondary/80">真实检测与测试运行会在 Tauri CLI runtime 接入后替换当前静态状态。</p>
          </div>

          <div className="flex items-center justify-between gap-2 border-t pt-3">
            <Button variant="ghost" size="sm" className="px-0 text-primary">
              <Settings2 className="size-4" />
              打开执行设置
            </Button>
            <Button variant="outline" size="sm">
              <RefreshCw className="size-4" />
              重新检测
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
```

- [ ] **Step 2: Run type check**

Run:

```powershell
npx.cmd tsc --noEmit
```

Expected: pass after the component is created.

---

## Task 4: Wire The Menu Into The Current AppShell TopBar

**Files:**

- Modify: `components/app-shell.tsx`

- [ ] **Step 1: Import the menu**

Add:

```ts
import { AgentExecutorMenu } from "@/components/agent/agent-executor-menu"
```

- [ ] **Step 2: Render the menu without changing the sidebar layout**

In `TopBar()`, inside the right-side actions `<div className="flex items-center gap-3">`, place the menu after the existing runtime switch block and before the user pill:

```tsx
<AgentExecutorMenu />
```

The resulting order should be:

```text
本地硬核 / 云端轻量 switch
AgentExecutorMenu
用户胶囊
```

- [ ] **Step 3: Run type check**

Run:

```powershell
npx.cmd tsc --noEmit
```

Expected: pass.

---

## Task 5: Align Materials Page With Global Agent Selection

**Files:**

- Modify: `app/materials/page.tsx`

- [ ] **Step 1: Import global runtime and Agent display helper**

Add imports:

```ts
import { useRuntime } from "@/lib/runtime-store"
import { displayAgentExecutor } from "@/lib/agent/executor-settings"
import { Bot, FolderOpen, RefreshCw } from "lucide-react"
```

Merge these lucide icons with the existing import list instead of adding a second `lucide-react` import.

- [ ] **Step 2: Read global Agent executor state**

Inside `MaterialsPage()` add:

```ts
const { agentExecutor } = useRuntime()
const [agentSkillId, setAgentSkillId] = useState("gongkao-hotspot-collector")
const [agentInstruction, setAgentInstruction] = useState("")
```

- [ ] **Step 3: Add `Agent 采集` and `Inbox` tabs**

Change the existing tabs list from:

```tsx
<TabsList>
  <TabsTrigger value="paste">粘贴文本</TabsTrigger>
  <TabsTrigger value="file">上传文件</TabsTrigger>
</TabsList>
```

to:

```tsx
<TabsList>
  <TabsTrigger value="paste">粘贴文本</TabsTrigger>
  <TabsTrigger value="file">上传文件</TabsTrigger>
  <TabsTrigger value="agent">Agent 采集</TabsTrigger>
  <TabsTrigger value="inbox">Inbox</TabsTrigger>
</TabsList>
```

- [ ] **Step 4: Add Agent tab content**

Add this after the existing file tab:

```tsx
<TabsContent value="agent" className="space-y-4">
  <div className="rounded-md border border-secondary/25 bg-secondary/10 p-3 text-sm text-secondary">
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="font-medium">当前执行环境：{displayAgentExecutor(agentExecutor)}</div>
        <p className="mt-1 text-xs leading-relaxed text-secondary/80">
          由顶部 Agent 菜单统一管理。素材页只负责任务、Skill、结果确认。
        </p>
      </div>
      <Badge variant="outline" className="border-secondary/30 text-secondary">
        全局
      </Badge>
    </div>
  </div>

  <div className="space-y-1.5">
    <Label htmlFor="agent-skill">处理 Skill</Label>
    <select
      id="agent-skill"
      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
      value={agentSkillId}
      onChange={(event) => setAgentSkillId(event.target.value)}
    >
      <option value="gongkao-hotspot-collector">gongkao-hotspot-collector · 公考热点采集</option>
      <option value="gongkao-material-parser">gongkao-material-parser · 本地资料解析</option>
      <option value="gongkao-topic-wiki-curator">gongkao-topic-wiki-curator · 专题知识条目整理</option>
    </select>
  </div>

  <div className="space-y-1.5">
    <Label htmlFor="agent-instruction">采集 / 解析要求</Label>
    <Textarea
      id="agent-instruction"
      value={agentInstruction}
      onChange={(event) => setAgentInstruction(event.target.value)}
      placeholder="例如：围绕数字乡村建设，优先采集官方政策、主流媒体评论和真题相关材料，生成关键词、金句、温故卡、演练题和字帖摘抄。"
      className="min-h-[160px] leading-relaxed"
    />
  </div>

  <div className="rounded-md border-2 border-dashed bg-muted/30 p-6 text-center">
    <FolderOpen className="mx-auto size-8 text-muted-foreground" />
    <p className="mt-2 text-sm text-muted-foreground">
      可选：拖入 PDF / TXT / Markdown，后续 Agent runtime 会把文件作为上下文解析。
    </p>
  </div>

  <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
    <div><span className="font-mono text-primary">queued</span> 创建独立 run workspace，复制当前 Skill。</div>
    <div><span className="font-mono text-primary">running</span> 使用 {displayAgentExecutor(agentExecutor)} 采集或解析素材。</div>
    <div><span className="font-mono text-primary">validate</span> 应用侧校验 material-draft.json 后进入 Inbox。</div>
  </div>

  <div className="flex flex-wrap gap-2">
    <Button disabled>
      <Bot className="size-4" />
      启动 Agent 加工
    </Button>
    <Button variant="outline" disabled>
      <RefreshCw className="size-4" />
      等待 CLI runtime 接入
    </Button>
  </div>
</TabsContent>
```

The buttons are intentionally disabled in this frontend-only phase so users do not think real CLI execution is available before the Tauri runtime is wired.

- [ ] **Step 5: Add Inbox placeholder tab**

Add:

```tsx
<TabsContent value="inbox" className="space-y-3">
  <div className="rounded-md border bg-muted/30 p-8 text-center text-muted-foreground">
    <BookOpen className="mx-auto mb-3 size-9 opacity-50" />
    <p className="text-sm">Agent 生成的候选素材会先进入这里，用户确认后再导入本地题库。</p>
  </div>
</TabsContent>
```

- [ ] **Step 6: Run type check**

Run:

```powershell
npx.cmd tsc --noEmit
```

Expected: pass.

---

## Task 6: Add Settings Page Diagnostic Card

**Files:**

- Modify: `app/settings/page.tsx`

- [ ] **Step 1: Import Agent display helper**

Add imports:

```ts
import { displayAgentExecutor } from "@/lib/agent/executor-settings"
import { Bot } from "lucide-react"
```

Merge `Bot` into the existing lucide import list.

- [ ] **Step 2: Read Agent executor state**

The page already calls `useRuntime()` for theme color. Change:

```ts
const { themeColor, setThemeColor } = useRuntime()
```

to:

```ts
const { themeColor, setThemeColor, agentExecutor, agentAdapters } = useRuntime()
```

- [ ] **Step 3: Add a compact card near AI settings**

Add this card before the AI provider settings card:

```tsx
<Card>
  <CardHeader>
    <CardTitle className="flex items-center gap-2">
      <Bot className="size-5 text-primary" />
      素材 Agent 执行环境
    </CardTitle>
    <CardDescription>
      日常切换放在顶部 Agent 菜单；这里保留检测、诊断和后续 CLI runtime 状态。
    </CardDescription>
  </CardHeader>
  <CardContent className="space-y-4">
    <div className="rounded-md border border-secondary/25 bg-secondary/10 p-3 text-sm text-secondary">
      当前选择：{displayAgentExecutor(agentExecutor)}
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {agentAdapters.map((adapter) => (
        <div key={adapter.id} className="rounded-md border bg-background p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="font-medium">{adapter.name}</div>
            <Badge variant={adapter.available ? "default" : "outline"}>
              {adapter.available ? "前端已接入" : "未检测"}
            </Badge>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{adapter.message}</p>
          {adapter.version && <p className="mt-1 text-xs text-muted-foreground">版本：{adapter.version}</p>}
        </div>
      ))}
    </div>
    <Button variant="outline" disabled>
      <RefreshCw className="size-4" />
      等待 Tauri CLI runtime 接入后启用重新检测
    </Button>
  </CardContent>
</Card>
```

- [ ] **Step 4: Run type check**

Run:

```powershell
npx.cmd tsc --noEmit
```

Expected: pass.

---

## Task 7: Verification

**Files:**

- No new source files.

- [ ] **Step 1: Run focused unit test**

Run:

```powershell
npm.cmd run test -- test/lib/agent/executor-settings.test.ts
```

Expected: pass.

- [ ] **Step 2: Run TypeScript check**

Run:

```powershell
npx.cmd tsc --noEmit
```

Expected: no TypeScript errors.

- [ ] **Step 3: Run lint**

Run:

```powershell
npm.cmd run lint
```

Expected: no lint errors related to the new frontend files.

- [ ] **Step 4: Manual browser verification**

Run the app:

```powershell
npm.cmd run dev
```

Open:

```text
http://localhost:3000/materials
```

Verify:

1. Sidebar and topbar still match the current project style.
2. Topbar shows the existing runtime switch and the new Agent menu.
3. Opening the Agent menu shows local CLI/API mode, Codex CLI, Claude Code, model, and reasoning controls.
4. Changing Agent/model updates the topbar label and Materials page status hint.
5. Materials page shows `粘贴文本 / 上传文件 / Agent 采集 / Inbox`.
6. `Agent 采集` tab does not contain a large adapter picker; it only shows current global environment, Skill selector, instruction textarea, run-log placeholder, and disabled start button.
7. Settings page shows a compact Agent execution diagnostic card.

## Self-Review

Spec coverage:

- Current project frontend alignment is covered by modifying `components/app-shell.tsx`, `components/agent/agent-executor-menu.tsx`, `app/materials/page.tsx`, and `app/settings/page.tsx`.
- Open Design is used only for the global execution-environment pattern; visual styling stays aligned to the existing Gongkao app.
- Materials page no longer owns adapter/model configuration.
- Backend CLI runtime remains out of scope and disabled UI makes that clear.

Placeholder scan:

- No `TBD` / `TODO` placeholders.
- All new files and modified files have exact paths.
- All verification commands include expected results.

Type consistency:

- `AgentExecutorSettings`, `AgentAdapterId`, and `AgentExecutionMode` are defined once in `types/agent-executor.ts`.
- Runtime store, topbar menu, Materials page, and Settings page all consume the same settings object.

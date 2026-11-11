"use client"

import { Bot, Check, ChevronDown, Cpu, KeyRound, RefreshCw, Settings2, ShieldCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  AGENT_MODEL_OPTIONS,
  AGENT_REASONING_OPTIONS,
  type AgentAdapterId,
  type AgentExecutionMode,
} from "@/types/agent-executor"
import { displayAgentExecutor } from "@/lib/agent/executor-settings"
import { capabilityLabel, displayAgentStatus, displayModelSource } from "@/lib/agent/capabilities"
import { useRuntime } from "@/lib/runtime-store"
import { cn } from "@/lib/utils"

export function AgentExecutorMenu() {
  const { agentExecutor, setAgentExecutor, agentAdapters, agentAdaptersChecking, refreshAgentAdapters } = useRuntime()
  const activeAdapter = agentAdapters.find((adapter) => adapter.id === agentExecutor.adapterId)
  const modelOptions = AGENT_MODEL_OPTIONS[agentExecutor.adapterId]

  const update = (patch: Partial<typeof agentExecutor>) => {
    const nextAdapterId = (patch.adapterId ?? agentExecutor.adapterId) as AgentAdapterId
    const nextModel =
      patch.adapterId && patch.adapterId !== agentExecutor.adapterId
        ? AGENT_MODEL_OPTIONS[nextAdapterId][0]
        : patch.model ?? agentExecutor.model
    setAgentExecutor({ ...agentExecutor, ...patch, model: nextModel })
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="hidden md:inline-flex h-9 items-center gap-2 rounded-full border border-primary/25 bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-primary/5"
          aria-label="打开 Agent 执行环境"
        >
          <Bot className="size-3.5" />
          <span>{displayAgentExecutor(agentExecutor)}</span>
          <ChevronDown className="size-3.5 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[390px] p-4">
        <div className="flex items-start justify-between gap-3 border-b pb-3">
          <div>
            <div className="font-medium">Agent 执行环境</div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              全局选择本地 CLI、模型和推理强度。素材页只读取这里的当前环境。
            </p>
          </div>
          <Badge variant="outline" className="gap-1 text-primary">
            <ShieldCheck className="size-3" />
            全局
          </Badge>
        </div>

        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">模式</div>
            <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
              {[
                ["local-cli", "本地 CLI"],
                ["api-key", "自带 Key"],
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
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{displayAgentStatus(adapter)}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Badge variant={adapter.available ? "secondary" : "outline"} className="h-5 px-1.5 text-[10px]">
                      {adapter.available ? "可用" : "待检测"}
                    </Badge>
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                      {displayModelSource(adapter.modelSource)}
                    </Badge>
                  </div>
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
                  <SelectItem key={model} value={model}>
                    {model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {agentExecutor.adapterId === "codex" && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">推理强度</div>
              <Select
                value={agentExecutor.reasoning}
                onValueChange={(reasoning) => update({ reasoning: reasoning as typeof agentExecutor.reasoning })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择推理强度" />
                </SelectTrigger>
                <SelectContent>
                  {AGENT_REASONING_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="rounded-md border border-secondary/25 bg-secondary/10 p-3 text-xs text-secondary space-y-2">
            <div className="flex items-center gap-2 font-medium">
              {agentExecutor.mode === "local-cli" ? <Cpu className="size-3.5" /> : <KeyRound className="size-3.5" />}
              当前环境：{displayAgentExecutor(agentExecutor)}
            </div>
            <div className="text-secondary/80">{activeAdapter ? displayAgentStatus(activeAdapter) : "状态未知"}</div>
            {activeAdapter?.version ? <div className="truncate text-secondary/70">{activeAdapter.version}</div> : null}
            {activeAdapter?.path ? <div className="truncate text-secondary/70">{activeAdapter.path}</div> : null}
            <p className="leading-relaxed text-secondary/80">{activeAdapter?.message}</p>
            <div className="flex flex-wrap gap-1.5">
              {(activeAdapter?.capabilities ?? []).map((capability) => (
                <Badge key={capability} variant="outline" className="h-5 border-secondary/30 px-1.5 text-[10px] text-secondary">
                  {capabilityLabel(capability)}
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 border-t pt-3">
            <Button variant="ghost" size="sm" className="px-0 text-primary" asChild>
              <a href="/settings">
                <Settings2 className="size-4" />
                执行诊断
              </a>
            </Button>
            <Button variant="outline" size="sm" disabled={agentAdaptersChecking} onClick={refreshAgentAdapters}>
              <RefreshCw className={cn("size-4", agentAdaptersChecking && "animate-spin")} />
              重新检测
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

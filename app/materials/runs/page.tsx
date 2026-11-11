"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

import { MaterialsSecondaryNav } from "@/components/materials/materials-secondary-nav"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { refreshAgentRunStatuses } from "@/lib/agent/run-status-sync"
import { agentRepository } from "@/lib/storage/repositories"
import type { AgentRunRecord } from "@/lib/storage/schema"

export default function MaterialRunsPage() {
  const [runs, setRuns] = useState<AgentRunRecord[]>([])

  useEffect(() => {
    void agentRepository
      .getRuns()
      .then(refreshAgentRunStatuses)
      .then((items) => setRuns(items.sort((a, b) => b.startedAt.localeCompare(a.startedAt))))
      .catch(() => setRuns([]))
  }, [])

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-6 lg:p-8">
      <MaterialsSecondaryNav />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-bold tracking-wide text-primary">AGENT RUN CENTER</div>
          <h1 className="mt-1 font-serif text-3xl font-bold">Agent 运行中心</h1>
          <p className="mt-2 text-sm text-muted-foreground">查看素材 Agent 的历史任务、状态、摘要和隔离工作区路径。</p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/materials">返回素材工作台</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>运行记录</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {runs.length === 0 ? (
            <div className="rounded-md border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
              暂无运行记录。从素材工作台启动 Agent 后会显示在这里。
            </div>
          ) : (
            runs.map((run) => (
              <div key={run.id} className="rounded-md border bg-background p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{run.title}</div>
                    <p className="mt-1 text-xs text-muted-foreground">{run.summary}</p>
                  </div>
                  <Badge variant={run.status === "failed" ? "destructive" : run.status === "completed" ? "secondary" : "outline"}>
                    {run.status}
                  </Badge>
                </div>
                <div className="mt-2 grid gap-1 text-xs text-muted-foreground md:grid-cols-2">
                  <div>Skill：{run.skillId}</div>
                  <div>Adapter：{run.adapterId}</div>
                  <div>开始：{run.startedAt}</div>
                  <div className="truncate">工作区：{run.workspacePath}</div>
                </div>
                {run.error ? <p className="mt-2 text-xs text-destructive">{run.error}</p> : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}

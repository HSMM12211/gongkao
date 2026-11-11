"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Badge } from "@/components/ui/badge"
import { Award, RotateCcw, Sparkles, Timer, Trophy } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import Link from "next/link"

type GridSize = 3 | 4 | 5

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function genGrid(size: GridSize) {
  return shuffle(Array.from({ length: size * size }, (_, i) => i + 1))
}

export default function FocusPage() {
  const [size, setSize] = useState<GridSize>(4)
  const [grid, setGrid] = useState<number[]>(() => genGrid(4))
  const [next, setNext] = useState(1)
  const [errorCell, setErrorCell] = useState<number | null>(null)
  const [activeCell, setActiveCell] = useState<number | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [done, setDone] = useState(false)
  const [bestKey, setBestKey] = useState<string>("")
  const [best, setBest] = useState<number | null>(null)
  const tickRef = useRef<number | null>(null)

  // 切换 size
  useEffect(() => {
    setGrid(genGrid(size))
    setNext(1)
    setStartedAt(null)
    setElapsed(0)
    setDone(false)
    setBestKey(`schulte-best-${size}`)
  }, [size])

  useEffect(() => {
    if (typeof window !== "undefined" && bestKey) {
      const v = localStorage.getItem(bestKey)
      setBest(v ? Number(v) : null)
    }
  }, [bestKey])

  // 计时器
  useEffect(() => {
    if (!startedAt || done) return
    const tick = () => {
      setElapsed(performance.now() - startedAt)
      tickRef.current = requestAnimationFrame(tick)
    }
    tickRef.current = requestAnimationFrame(tick)
    return () => {
      if (tickRef.current) cancelAnimationFrame(tickRef.current)
    }
  }, [startedAt, done])

  const total = size * size

  const handleClick = (n: number, idx: number) => {
    if (done) return
    if (!startedAt) setStartedAt(performance.now())
    if (n === next) {
      setActiveCell(idx)
      const newNext = next + 1
      setNext(newNext)
      if (newNext > total) {
        // 通关
        const finalMs = performance.now() - (startedAt ?? performance.now())
        setElapsed(finalMs)
        setDone(true)
        // 写入 best
        if (typeof window !== "undefined") {
          const key = `schulte-best-${size}`
          const prev = Number(localStorage.getItem(key) || "0")
          if (!prev || finalMs < prev) {
            localStorage.setItem(key, String(Math.round(finalMs)))
            setBest(Math.round(finalMs))
          }
          // 写入 buff
          const dateKey = new Date().toISOString().slice(0, 10)
          localStorage.setItem(`focus-buff-${dateKey}`, "1")
        }
        toast.success("通关！专注 Buff 已激活", {
          description: "“高效自律”勋章已点亮，去工作台查看吧。",
        })
      }
    } else {
      // 错误：红光闪烁
      setErrorCell(idx)
      // 模拟震动（仅支持的设备）
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try { navigator.vibrate?.(120) } catch {}
      }
      setTimeout(() => setErrorCell(null), 320)
    }
  }

  const reset = () => {
    setGrid(genGrid(size))
    setNext(1)
    setStartedAt(null)
    setElapsed(0)
    setDone(false)
    setActiveCell(null)
    setErrorCell(null)
  }

  const seconds = (elapsed / 1000).toFixed(2)

  const cellSize = useMemo(() => {
    if (size === 3) return "size-28 text-4xl"
    if (size === 4) return "size-22 text-3xl"
    return "size-18 text-2xl"
  }, [size])

  return (
    <div className="p-6 lg:p-8 max-w-[1100px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-bold tracking-tight flex items-center gap-2">
          <Sparkles className="size-6 text-primary" />
          专注唤醒舱
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          按数字 1 → {total} 顺序点击格子。点对变蓝，点错红光闪烁，毫秒级计时记录你的专注水平。
        </p>
      </div>

      {/* 控制条 */}
      <Card>
        <CardContent className="flex items-center justify-between flex-wrap gap-4 py-4">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">难度：</span>
            <ToggleGroup
              type="single"
              value={String(size)}
              onValueChange={(v) => v && setSize(Number(v) as GridSize)}
              variant="outline"
            >
              <ToggleGroupItem value="3">3 × 3 入门</ToggleGroupItem>
              <ToggleGroupItem value="4">4 × 4 标准</ToggleGroupItem>
              <ToggleGroupItem value="5">5 × 5 高阶</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Timer className="size-4 text-primary" />
              <span className="font-mono text-lg tabular-nums">{seconds}s</span>
            </div>
            <Badge variant="outline">
              下一个：<span className="text-primary font-bold ml-1">{done ? "✓" : next}</span>
            </Badge>
            {best && (
              <Badge variant="secondary" className="gap-1">
                <Trophy className="size-3.5" /> 最佳 {(best / 1000).toFixed(2)}s
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={reset}>
              <RotateCcw className="size-4" /> 重新开始
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 方格 */}
      <Card className={cn(done && "focus-buff-glow")}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">舒尔特方格</CardTitle>
          <CardDescription>保持坐姿端正，目光锁定中心，眼球带动手指逐格扫视</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
          >
            {grid.map((n, idx) => {
              const isActive = activeCell === idx && next > n
              const isError = errorCell === idx
              const isCleared = next > n
              return (
                <button
                  key={idx}
                  onClick={() => handleClick(n, idx)}
                  disabled={done}
                  className={cn(
                    cellSize,
                    "rounded-md font-serif font-bold border-2 transition-all select-none",
                    "hover:border-primary/60 active:scale-95",
                    isCleared
                      ? "bg-secondary/15 border-secondary text-secondary"
                      : "bg-card border-border text-foreground",
                    isActive && "ring-4 ring-secondary/30",
                    isError && "shake-red border-destructive text-destructive-foreground",
                  )}
                >
                  {n}
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* 通关反馈 */}
      {done && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-center justify-between gap-4 py-5 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="size-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                <Award className="size-6" />
              </div>
              <div>
                <div className="font-serif font-bold text-lg">专注 Buff 已激活</div>
                <div className="text-sm text-muted-foreground">
                  用时 <span className="font-mono text-primary font-bold">{seconds}s</span>
                  ，今日「高效自律」勋章已点亮
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={reset}>
                <RotateCcw className="size-4" /> 再来一次
              </Button>
              <Link href="/practice">
                <Button>进入申论演练</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

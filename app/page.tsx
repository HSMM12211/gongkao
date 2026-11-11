"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Sparkles, Trophy, Flame, Target, BookOpen, ArrowRight, Brain, Award, PenLine } from "lucide-react"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, RadialBar, RadialBarChart, PolarAngleAxis } from "recharts"
import { copybookRepository, practiceRepository, reviewRepository } from "@/lib/storage/repositories"
import { getDueCards } from "@/lib/review/due-cards"
import { FLASHCARDS } from "@/lib/data"
import { DEFAULT_FUTURE_OFFICIAL_NAME } from "@/lib/user-title"

const todayKey = () => `focus-skipped-${new Date().toISOString().slice(0, 10)}`

const weekData = [
  { day: "周一", 命中: 62 },
  { day: "周二", 命中: 70 },
  { day: "周三", 命中: 68 },
  { day: "周四", 命中: 81 },
  { day: "周五", 命中: 75 },
  { day: "周六", 命中: 88 },
  { day: "周日", 命中: 92 },
]

const focusData = [{ name: "专注度", value: 86, fill: "var(--color-primary)" }]

type DashboardStats = {
  dueReviews: number
  keywordRate: number
  practiceThisWeek: number
  copybookCount: number
}

function isThisWeek(iso: string) {
  const date = new Date(iso)
  const now = new Date()
  const start = new Date(now)
  const day = start.getDay() || 7
  start.setDate(start.getDate() - day + 1)
  start.setHours(0, 0, 0, 0)
  return date.getTime() >= start.getTime()
}

export default function HomePage() {
  const [showFocusDialog, setShowFocusDialog] = useState(false)
  const [dontShowToday, setDontShowToday] = useState(false)
  const [hasFocusBuff, setHasFocusBuff] = useState(false)
  const [stats, setStats] = useState<DashboardStats>({
    dueReviews: 0,
    keywordRate: 0,
    practiceThisWeek: 0,
    copybookCount: 0,
  })

  useEffect(() => {
    const skipped = typeof window !== "undefined" && localStorage.getItem(todayKey())
    const buff = typeof window !== "undefined" && localStorage.getItem(`focus-buff-${new Date().toISOString().slice(0, 10)}`)
    if (buff) setHasFocusBuff(true)
    const loadStats = async () => {
      try {
        const [reviewStates, attempts, copybookItems] = await Promise.all([
          reviewRepository.getStates(),
          practiceRepository.getAttempts(),
          copybookRepository.getItems(),
        ])
        const totalKeywordCount = attempts.reduce((sum, attempt) => sum + attempt.keywordCount, 0)
        const totalKeywordHit = attempts.reduce((sum, attempt) => sum + attempt.keywordHit, 0)
        setStats({
          dueReviews: getDueCards(FLASHCARDS, reviewStates).length,
          keywordRate: totalKeywordCount === 0 ? 0 : Math.round((totalKeywordHit / totalKeywordCount) * 100),
          practiceThisWeek: attempts.filter((attempt) => isThisWeek(attempt.createdAt)).length,
          copybookCount: copybookItems.length,
        })
      } catch (error) {
        console.error(error)
      }
    }
    void loadStats()
    if (!skipped) {
      // 首次进入页面 0.6s 后弹出
      const t = setTimeout(() => setShowFocusDialog(true), 600)
      return () => clearTimeout(t)
    }
  }, [])

  const handleSkip = () => {
    if (dontShowToday) {
      localStorage.setItem(todayKey(), "1")
    }
    setShowFocusDialog(false)
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      {/* 顶部欢迎 */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold tracking-tight text-balance">
            欢迎回来，<span className="text-primary">{DEFAULT_FUTURE_OFFICIAL_NAME}</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            今日是 {new Date().toLocaleDateString("zh-CN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            ，让我们以高效自律开启申论修炼。
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasFocusBuff && (
            <Badge className="bg-primary text-primary-foreground gap-1">
              <Award className="size-3.5" /> 高效自律 · 专注 Buff 已点亮
            </Badge>
          )}
          <Button variant="outline" onClick={() => setShowFocusDialog(true)}>
            <Sparkles className="size-4" /> 唤醒舱
          </Button>
        </div>
      </div>

      {/* KPI 行 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Flame className="size-4 text-primary" /> 连续学习
            </CardDescription>
            <CardTitle className="text-3xl font-serif">{hasFocusBuff ? 1 : 0}<span className="text-base text-muted-foreground ml-1">天</span></CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={hasFocusBuff ? 100 : 0} className="h-1.5" />
            <p className="text-xs text-muted-foreground mt-2">{hasFocusBuff ? "今日专注 Buff 已点亮" : "完成唤醒后点亮今日专注 Buff"}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Target className="size-4 text-secondary" /> 关键词命中率
            </CardDescription>
            <CardTitle className="text-3xl font-serif">{stats.keywordRate}%</CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={stats.keywordRate} className="h-1.5" />
            <p className="text-xs text-muted-foreground mt-2">来自本地已保存作答</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <BookOpen className="size-4 text-primary" /> 累计精修
            </CardDescription>
            <CardTitle className="text-3xl font-serif">{stats.practiceThisWeek}<span className="text-base text-muted-foreground ml-1">题</span></CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={Math.min(100, stats.practiceThisWeek * 20)} className="h-1.5" />
            <p className="text-xs text-muted-foreground mt-2">本周已保存练习记录</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Trophy className="size-4 text-secondary" /> 错题待消化
            </CardDescription>
            <CardTitle className="text-3xl font-serif">{stats.copybookCount}<span className="text-base text-muted-foreground ml-1">条</span></CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={Math.min(100, stats.copybookCount * 25)} className="h-1.5" />
            <p className="text-xs text-muted-foreground mt-2">建议导出字帖加强记忆</p>
          </CardContent>
        </Card>
      </div>

      {/* 主内容两栏 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>近 7 日 · 关键词命中率</CardTitle>
            <CardDescription>稳步提升中，注意保持节奏</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{ 命中: { label: "命中率", color: "var(--color-primary)" } }}
              className="h-[260px] w-full"
            >
              <BarChart data={weekData} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} domain={[0, 100]} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="命中" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>今日专注度</CardTitle>
            <CardDescription>来自舒尔特方格表现</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{ value: { label: "专注度", color: "var(--color-primary)" } }}
              className="h-[220px] w-full"
            >
              <RadialBarChart data={focusData} innerRadius="65%" outerRadius="100%" startAngle={90} endAngle={-270}>
                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                <RadialBar dataKey="value" cornerRadius={12} background={{ fill: "var(--color-muted)" }} />
              </RadialBarChart>
            </ChartContainer>
            <div className="-mt-32 text-center pointer-events-none">
              <div className="text-4xl font-serif font-bold text-primary">86</div>
              <div className="text-xs text-muted-foreground">满分 100</div>
            </div>
            <div className="mt-20 flex justify-center">
              <Link href="/focus">
                <Button variant="outline" size="sm">
                  再练一次 <ArrowRight className="size-4" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 入口卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <EntryCard
          href="/review"
          icon={<Brain className="size-5" />}
          title="智能温故舱"
          desc={`当前到期 ${stats.dueReviews} 张，点击麦克风即可口述。`}
          accent="secondary"
        />
        <EntryCard
          href="/practice"
          icon={<PenLine className="size-5" />}
          title="申论演练 · AI 精修"
          desc="材料阅读 + 作答 + AI 结构化诊断 + 同屏对照。"
          accent="primary"
        />
        <EntryCard
          href="/copybook"
          icon={<BookOpen className="size-5" />}
          title="专属字帖导出"
          desc="勾选错题 → 实时 A4 预览 → 一键导出打印级 PDF。"
          accent="secondary"
        />
      </div>

      {/* 专注唤醒前置弹窗 */}
      <Dialog open={showFocusDialog} onOpenChange={setShowFocusDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="size-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-2">
              <Sparkles className="size-6" />
            </div>
            <DialogTitle className="font-serif text-xl">专注唤醒舱</DialogTitle>
            <DialogDescription className="leading-relaxed">
              一段极简的视觉聚焦训练（舒尔特方格），帮助你在 1 分钟内进入深度学习状态。
              完成后可获得当日「专注 Buff」并点亮“高效自律”勋章。
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 py-2">
            <Checkbox
              id="dontshow"
              checked={dontShowToday}
              onCheckedChange={(v) => setDontShowToday(Boolean(v))}
            />
            <label htmlFor="dontshow" className="text-sm text-muted-foreground cursor-pointer">
              今日不再提示（侧边栏仍可随时进入）
            </label>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" onClick={handleSkip} className="border border-dashed">
              直接跳过，进入学习
            </Button>
            <Link href="/focus" onClick={() => setShowFocusDialog(false)}>
              <Button>
                <Sparkles className="size-4" /> 开始唤醒（推荐）
              </Button>
            </Link>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function EntryCard({
  href,
  icon,
  title,
  desc,
  accent,
}: {
  href: string
  icon: React.ReactNode
  title: string
  desc: string
  accent: "primary" | "secondary"
}) {
  return (
    <Link href={href}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer h-full group">
        <CardHeader>
          <div
            className={`size-10 rounded-md flex items-center justify-center ${
              accent === "primary" ? "bg-primary/10 text-primary" : "bg-secondary/10 text-secondary"
            }`}
          >
            {icon}
          </div>
          <CardTitle className="mt-2 group-hover:text-primary transition-colors">{title}</CardTitle>
          <CardDescription className="leading-relaxed">{desc}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center text-sm text-primary">
            进入模块 <ArrowRight className="size-4 ml-1 group-hover:translate-x-1 transition-transform" />
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Slider } from "@/components/ui/slider"
import { BookOpen, Filter, Printer, FileText, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { QUESTIONS, WRONG_RECORDS, type Question } from "@/lib/data"
import { CopybookPage } from "@/components/copybook-page"
import { toast } from "sonner"
import { copybookRepository } from "@/lib/storage/repositories"
import type { CopybookItem } from "@/lib/storage/schema"
import { STROKE_WEIGHT_MAX, STROKE_WEIGHT_MIN, STROKE_WEIGHT_STEP } from "@/lib/copybook-style"
import { COPYBOOK_FONT_OPTIONS, type CopybookFontMode } from "@/lib/copybook-fonts"

type GridTheme = "red" | "green" | "gray"
type TraceMode = "full" | "partial"

const ALL_TAGS = ["本周错题", "对策题", "概括题", "综合分析", "高频考点", "易错"]

type CopybookShelfRecord = {
  id: string
  source: "seed" | "practice-attempt" | "manual"
  sourceLabel: string
  title: string
  question: Question
  text: string
  answeredAt: string
  score?: number
  keywordHit?: number
  tags: string[]
}

function makeQuestionFromItem(item: CopybookItem): Question {
  const sourceQuestion = item.questionId ? QUESTIONS.find((q) => q.id === item.questionId) : undefined
  if (sourceQuestion) return { ...sourceQuestion, aiAnswer: item.text }

  return {
    id: item.questionId ?? item.id,
    title: item.title,
    type: "应用文",
    material: "",
    prompt: "请临摹下方高分表达。",
    keywords: [],
    aiAnswer: item.text,
  }
}

function seedRecords(): CopybookShelfRecord[] {
  return WRONG_RECORDS.map((record) => ({
    id: record.id,
    source: "seed",
    sourceLabel: "示例素材",
    title: record.question.title,
    question: record.question,
    text: record.question.aiAnswer,
    answeredAt: record.answeredAt,
    score: record.score,
    keywordHit: record.keywordHit,
    tags: record.tags,
  }))
}

function itemToRecord(item: CopybookItem): CopybookShelfRecord {
  const question = makeQuestionFromItem(item)
  return {
    id: item.id,
    source: item.source,
    sourceLabel: item.source === "practice-attempt" ? "练习错题" : "手动加入",
    title: item.title,
    question,
    text: item.text,
    answeredAt: item.createdAt,
    tags: item.tags,
  }
}

export default function CopybookPage_Page() {
  const [records, setRecords] = useState<CopybookShelfRecord[]>(() => seedRecords())
  const [selected, setSelected] = useState<Set<string>>(new Set([WRONG_RECORDS[0].id]))
  const [tagFilters, setTagFilters] = useState<Set<string>>(new Set())
  const [font, setFont] = useState<CopybookFontMode>("kai")
  const [theme, setTheme] = useState<GridTheme>("red")
  const [traceMode, setTraceMode] = useState<TraceMode>("full")
  const [traceOpacity, setTraceOpacity] = useState(0.35)
  const [strokeWeight, setStrokeWeight] = useState(2)

  const previewRef = useRef<HTMLDivElement>(null)
  const scalerWrapRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.65)

  useEffect(() => {
    const loadItems = async () => {
      try {
        const items = await copybookRepository.getItems()
        const nextRecords = items.length > 0 ? items.map(itemToRecord) : seedRecords()
        setRecords(nextRecords)
        setSelected((current) => {
          if (current.size > 0 && nextRecords.some((record) => current.has(record.id))) return current
          return new Set(nextRecords[0] ? [nextRecords[0].id] : [])
        })
      } catch (error) {
        console.error(error)
        toast.error("字帖素材读取失败，已显示示例素材")
        setRecords(seedRecords())
      }
    }

    void loadItems()
  }, [])

  // 自适应缩放
  useEffect(() => {
    const compute = () => {
      const el = scalerWrapRef.current
      if (!el) return
      const w = el.clientWidth
      // A4 = 210mm ≈ 794px @ 96dpi
      const A4 = 794
      setScale(Math.min(1, (w - 24) / A4))
    }
    compute()
    window.addEventListener("resize", compute)
    return () => window.removeEventListener("resize", compute)
  }, [])

  const filteredRecords = useMemo(() => {
    if (tagFilters.size === 0) return records
    return records.filter((r) => r.tags.some((t) => tagFilters.has(t)))
  }, [records, tagFilters])

  const selectedRecords = records.filter((r) => selected.has(r.id))
  const allTags = useMemo(() => Array.from(new Set([...ALL_TAGS, ...records.flatMap((r) => r.tags)])), [records])

  const toggleTag = (t: string) => {
    setTagFilters((s) => {
      const next = new Set(s)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  const toggleSelect = (id: string) => {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectFiltered = () => {
    setSelected(new Set(filteredRecords.map((r) => r.id)))
  }
  const clearSelection = () => setSelected(new Set())

  const handlePrint = () => {
    if (selectedRecords.length === 0) {
      toast.error("请至少勾选一道错题")
      return
    }
    toast.message("准备生成 PDF…", { description: "Electron 环境将调用 webContents.printToPDF" })
    // 浏览器侧使用 window.print()，CSS 已通过 .print-area 限定打印范围
    setTimeout(() => window.print(), 200)
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold tracking-tight flex items-center gap-2">
            <BookOpen className="size-6 text-primary" />
            专属字帖 PDF 导出
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            像挑选衣服一样挑选错题 → 实时 A4 预览 → 一键导出打印级 PDF（每行 20 格 · 单格 11mm）
          </p>
        </div>
        <Button onClick={handlePrint} size="lg" className="gap-2">
          <Printer className="size-4" /> 生成专属字帖 PDF
          <Badge variant="secondary" className="ml-1 bg-white/15 text-primary-foreground border-0">
            {selectedRecords.length} 道
          </Badge>
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* 左：错题货架 */}
        <Card className="lg:col-span-4 flex flex-col h-[78vh]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="size-4 text-primary" /> 错题 / 精修货架
            </CardTitle>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {allTags.map((t) => (
                <button
                  key={t}
                  onClick={() => toggleTag(t)}
                  className={cn(
                    "text-xs px-2.5 py-1 rounded-full border transition-colors",
                    tagFilters.has(t)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-muted-foreground border-border hover:border-primary/40",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <Button size="sm" variant="outline" onClick={selectFiltered}>
                全选当前
              </Button>
              <Button size="sm" variant="ghost" onClick={clearSelection}>
                清空
              </Button>
              <span className="text-xs text-muted-foreground self-center ml-auto">
                共 {filteredRecords.length} 条 · 已选 {selected.size}
              </span>
            </div>
          </CardHeader>
          <ScrollArea className="flex-1">
            <CardContent className="space-y-2 pb-4">
              {filteredRecords.map((r) => (
                <ShelfItem
                  key={r.id}
                  record={r}
                  checked={selected.has(r.id)}
                  onToggle={() => toggleSelect(r.id)}
                />
              ))}
              {filteredRecords.length === 0 && (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  没有符合筛选条件的错题
                </div>
              )}
            </CardContent>
          </ScrollArea>
        </Card>

        {/* 右：参数面板 + 实时预览 */}
        <div className="lg:col-span-8 space-y-4 flex flex-col">
          {/* 参数控制 */}
          <Card>
            <CardContent className="py-4 grid grid-cols-1 md:grid-cols-6 xl:grid-cols-12 gap-x-5 gap-y-4">
              {/* 字体 */}
              <div className="space-y-2 md:col-span-2 xl:col-span-2 min-w-0">
                <Label className="text-xs text-muted-foreground">字体</Label>
                <Select value={font} onValueChange={(v) => setFont(v as CopybookFontMode)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COPYBOOK_FONT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 格子主题 */}
              <div className="space-y-2 md:col-span-4 xl:col-span-6 min-w-0">
                <Label className="text-xs text-muted-foreground">格子底纹</Label>
                <ToggleGroup
                  type="single"
                  value={theme}
                  onValueChange={(v) => v && setTheme(v as GridTheme)}
                  variant="outline"
                  className="grid w-full grid-cols-3 gap-1"
                >
                  <ToggleGroupItem value="red" className="min-w-0 px-1.5 text-xs">
                    <span className="size-3 rounded-sm bg-[#f09999] mr-1.5 shrink-0" />
                    <span className="whitespace-nowrap">考场红格</span>
                  </ToggleGroupItem>
                  <ToggleGroupItem value="green" className="min-w-0 px-1.5 text-xs">
                    <span className="size-3 rounded-sm bg-[#9fc5b8] mr-1.5 shrink-0" />
                    <span className="whitespace-nowrap">防疲劳绿</span>
                  </ToggleGroupItem>
                  <ToggleGroupItem value="gray" className="min-w-0 px-1.5 text-xs">
                    <span className="size-3 rounded-sm bg-[#c0c0c0] mr-1.5 shrink-0" />
                    <span className="whitespace-nowrap">质感灰</span>
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>

              {/* 临摹模式 */}
              <div className="space-y-2 md:col-span-3 xl:col-span-4 min-w-0">
                <Label className="text-xs text-muted-foreground">临摹模式</Label>
                <RadioGroup
                  value={traceMode}
                  onValueChange={(v) => setTraceMode(v as TraceMode)}
                  className="flex gap-3 mt-1"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="full" id="full" />
                    <Label htmlFor="full" className="text-sm font-normal cursor-pointer">
                      纯描红
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="partial" id="partial" />
                    <Label htmlFor="partial" className="text-sm font-normal cursor-pointer">
                      对照默写
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-3 md:col-span-3 xl:col-span-3 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs text-muted-foreground">描红透明度</Label>
                  <span className="text-xs font-mono text-muted-foreground">{Math.round(traceOpacity * 100)}%</span>
                </div>
                <Slider
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={[traceOpacity]}
                  onValueChange={(value) => setTraceOpacity(value[0] ?? 0.35)}
                />
              </div>

              <div className="space-y-3 md:col-span-3 xl:col-span-3 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs text-muted-foreground">笔画粗细</Label>
                  <span className="text-xs font-mono text-muted-foreground">{strokeWeight.toFixed(1)}</span>
                </div>
                <Slider
                  min={STROKE_WEIGHT_MIN}
                  max={STROKE_WEIGHT_MAX}
                  step={STROKE_WEIGHT_STEP}
                  value={[strokeWeight]}
                  onValueChange={(value) => setStrokeWeight(value[0] ?? 2)}
                />
              </div>
            </CardContent>
          </Card>

          {/* 预览面板 */}
          <Card className="flex-1 flex flex-col min-h-[600px]">
            <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="size-4 text-primary" /> A4 字帖实时预览
              </CardTitle>
              <Badge variant="outline" className="gap-1">
                <Sparkles className="size-3" />
                每行 20 格 · 单格 11mm
              </Badge>
            </CardHeader>
            <CardContent className="flex-1 bg-muted/40 rounded-b-lg overflow-auto">
              <div ref={scalerWrapRef} className="min-h-full py-3">
                {selectedRecords.length === 0 ? (
                  <div className="text-center py-24 text-muted-foreground">
                    <FileText className="size-12 mx-auto mb-3 opacity-40" />
                    <p>左侧勾选错题以生成字帖预览</p>
                  </div>
                ) : (
                  <div
                    className="copybook-preview-scaler mx-auto"
                    style={{
                      transform: `scale(${scale})`,
                      width: 794, // A4 px
                      height: scale * 1123 * selectedRecords.length + 24,
                    }}
                  >
                    <div ref={previewRef}>
                      {selectedRecords.map((r) => (
                        <CopybookPage
                          key={r.id}
                          question={r.question}
                          aiAnswerText={r.text}
                          font={font}
                          theme={theme}
                          traceMode={traceMode}
                          traceOpacity={traceOpacity}
                          strokeWeight={strokeWeight}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 打印区域：仅打印时可见 */}
      <div className="print-area hidden print:block">
        {selectedRecords.map((r) => (
          <CopybookPage
            key={`print-${r.id}`}
            question={r.question}
            aiAnswerText={r.text}
            font={font}
            theme={theme}
            traceMode={traceMode}
            traceOpacity={traceOpacity}
            strokeWeight={strokeWeight}
          />
        ))}
      </div>
    </div>
  )
}

function ShelfItem({
  record,
  checked,
  onToggle,
}: {
  record: CopybookShelfRecord
  checked: boolean
  onToggle: () => void
}) {
  return (
    <label
      className={cn(
        "flex gap-3 p-3 rounded-md border cursor-pointer transition-colors",
        checked ? "bg-primary/5 border-primary/40" : "bg-card border-border hover:border-primary/30",
      )}
    >
      <Checkbox checked={checked} onCheckedChange={onToggle} className="mt-1" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {record.question.type}
          </Badge>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {record.sourceLabel}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {new Date(record.answeredAt).toLocaleDateString("zh-CN")}
          </span>
        </div>
        <div className="font-medium text-sm line-clamp-2 leading-snug mb-2">
          {record.title}
        </div>
        {(record.score !== undefined || record.keywordHit !== undefined) && (
          <div className="flex items-center gap-3 text-xs">
            {record.score !== undefined && (
              <span className="flex items-center gap-1">
                AI 评分：
                <span className={cn("font-bold", record.score >= 75 ? "text-secondary" : "text-primary")}>
                  {record.score}
                </span>
              </span>
            )}
            {record.keywordHit !== undefined && (
              <span className="text-muted-foreground">
                命中：{record.keywordHit}/{record.question.keywords.length}
              </span>
            )}
          </div>
        )}
        <div className="flex gap-1 mt-1.5 flex-wrap">
          {record.tags.map((t) => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {t}
            </span>
          ))}
        </div>
      </div>
    </label>
  )
}

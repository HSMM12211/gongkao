"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { InlineDictationTextarea } from "@/components/speech/inline-dictation-textarea"
import { RotateCcw, ChevronLeft, ChevronRight, Eye, Repeat2, Check, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { FLASHCARDS } from "@/lib/data"
import { Progress } from "@/components/ui/progress"
import { scoreKeywords } from "@/lib/analysis/keyword-match"
import { appendDictationText } from "@/lib/speech/inline-dictation"
import { getDueCards, getNextDueAt } from "@/lib/review/due-cards"
import { scheduleReview } from "@/lib/review/scheduler"
import { materialRepository, reviewRepository } from "@/lib/storage/repositories"
import type { ReviewGrade, ReviewState } from "@/lib/storage/schema"
import { toast } from "sonner"
import { importedFlashcardToFlashcard } from "@/lib/material/adapters"

export default function ReviewPage() {
  const [idx, setIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [input, setInput] = useState("")
  const [reviewStates, setReviewStates] = useState<ReviewState[]>([])
  const [allCards, setAllCards] = useState(FLASHCARDS)
  const [loading, setLoading] = useState(true)
  const [manualAll, setManualAll] = useState(false)

  const activeCards = useMemo(
    () => (manualAll ? allCards : getDueCards(allCards, reviewStates)),
    [allCards, manualAll, reviewStates],
  )
  const card = activeCards[idx]
  const total = activeCards.length
  const stateByCardId = useMemo(() => new Map(reviewStates.map((state) => [state.cardId, state])), [reviewStates])
  const nextDueAt = getNextDueAt(reviewStates)
  const speechSeedText = card?.keywords.slice(0, Math.max(1, Math.floor(card.keywords.length * 0.6))).join("、") ?? ""

  const loadStates = async () => {
    try {
      const [states, importedCards] = await Promise.all([
        reviewRepository.getStates(),
        materialRepository.getFlashcards(),
      ])
      setReviewStates(states)
      setAllCards([...FLASHCARDS, ...importedCards.map(importedFlashcardToFlashcard)])
    } catch (error) {
      console.error(error)
      toast.error("复习记录读取失败")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadStates()
  }, [])

  useEffect(() => {
    if (idx >= activeCards.length) {
      setIdx(0)
    }
  }, [idx, activeCards.length])

  const next = () => {
    setFlipped(false)
    setInput("")
    setIdx((i) => (total === 0 ? 0 : (i + 1) % total))
  }
  const prev = () => {
    setFlipped(false)
    setInput("")
    setIdx((i) => (total === 0 ? 0 : (i - 1 + total) % total))
  }

  const gradeReview = async (grade: ReviewGrade) => {
    if (!card) return
    const now = new Date()
    const currentState = stateByCardId.get(card.id)
    const nextState = scheduleReview(currentState, grade, now)

    try {
      await reviewRepository.saveState({ ...nextState, cardId: card.id })
      await reviewRepository.saveEvent({
        id: crypto.randomUUID(),
        cardId: card.id,
        reviewedAt: now.toISOString(),
        input,
        hitCount,
        keywordCount: card.keywords.length,
        grade,
        nextDueAt: nextState.dueAt,
      })
      toast.success("复习结果已保存", {
        description: `下次复习：${new Date(nextState.dueAt).toLocaleString("zh-CN")}`,
      })
      setFlipped(false)
      setInput("")
      if (manualAll) {
        next()
      } else {
        setIdx(0)
      }
      await loadStates()
    } catch (error) {
      console.error(error)
      toast.error("复习结果保存失败")
    }
  }

  // 关键词命中
  const keywordScore = card
    ? scoreKeywords(input, card.keywords)
    : { hits: [] as string[], misses: [] as string[], hitCount: 0, keywordCount: 0, ratio: 0 }
  const hits = card?.keywords.map((k) => ({ k, hit: keywordScore.hits.includes(k) })) ?? []
  const hitCount = keywordScore.hitCount

  if (!card) {
    return (
      <div className="p-6 lg:p-8 max-w-[900px] mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-serif font-bold tracking-tight flex items-center gap-2">
            <Repeat2 className="size-6 text-secondary" />
            智能温故舱
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            基于遗忘曲线的金句 / 规范词闪卡，按复习到期时间自动弹出。
          </p>
        </div>

        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <Badge variant="secondary">今日到期 0 张</Badge>
            <h2 className="font-serif text-2xl font-bold">当前没有需要温故的内容</h2>
            <p className="text-sm text-muted-foreground">
            {loading
              ? "正在读取本地复习记录……"
              : nextDueAt
                ? `下一次复习：${new Date(nextDueAt).toLocaleString("zh-CN")}`
                : "还没有复习记录，可以先从全部闪卡开始。"}
            </p>
            <Button onClick={() => setManualAll(true)}>
              <Repeat2 className="size-4" /> 复习全部闪卡
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1100px] mx-auto space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold tracking-tight flex items-center gap-2">
            <Repeat2 className="size-6 text-secondary" />
            智能温故舱
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            基于遗忘曲线的金句 / 规范词闪卡，输入或口述后自动比对关键词
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{card.category}</Badge>
          <Badge variant={manualAll ? "outline" : "secondary"}>{manualAll ? "全部复习" : `今日到期 ${total} 张`}</Badge>
          <Badge variant="secondary">
            {idx + 1} / {total}
          </Badge>
        </div>
      </div>

      <Progress value={((idx + 1) / total) * 100} className="h-1.5" />

      {/* 翻转卡片 */}
      <div className="card-3d-container h-[360px]">
        <div className={cn("card-3d w-full h-full", flipped && "flipped")}>
          {/* 正面 */}
          <Card className="card-face shadow-md">
            <CardContent className="h-full flex flex-col items-center justify-center px-10 py-8 text-center">
              <Badge variant="outline" className="mb-4">
                {card.category}
              </Badge>
              <h2 className="font-serif text-2xl lg:text-3xl font-bold leading-relaxed text-balance max-w-2xl">
                {card.front}
              </h2>
              <p className="text-sm text-muted-foreground mt-6">
                请在下方输入或点击麦克风口述，再点击「查看答案」
              </p>
            </CardContent>
          </Card>

          {/* 背面 */}
          <Card className="card-face card-back bg-secondary/5 border-secondary/30 shadow-md">
            <CardContent className="h-full flex flex-col px-10 py-8 overflow-auto">
              <div className="flex items-center justify-between mb-4">
                <Badge className="bg-secondary text-secondary-foreground">标准答案 · 关键词</Badge>
                <Badge variant="outline">
                  命中 <span className="text-primary font-bold mx-1">{hitCount}</span>/ {card.keywords.length}
                </Badge>
              </div>

              <div className="flex flex-wrap gap-2 mb-6">
                {hits.map(({ k, hit }) => (
                  <span
                    key={k}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-base font-medium border",
                      hit
                        ? "bg-secondary/20 text-secondary border-secondary/40"
                        : "bg-muted text-muted-foreground/60 border-border line-through",
                    )}
                  >
                    {hit ? <Check className="inline size-4 mr-1" /> : <X className="inline size-4 mr-1" />}
                    {k}
                  </span>
                ))}
              </div>

              <div className="mt-auto text-sm text-muted-foreground">
                <div className="font-medium text-foreground mb-1">你的作答：</div>
                <div className="bg-background border rounded-md p-3 min-h-12">{input || <span className="text-muted-foreground">（无）</span>}</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 输入区 */}
      <Card>
        <CardContent className="py-5">
          <InlineDictationTextarea
            value={input}
            onValueChange={setInput}
            onTranscript={(text) => setInput((previous) => appendDictationText(previous, text, "；"))}
            previewSeparator="；"
            seedText={speechSeedText}
            placeholder="请输入金句关键词或对策要点……"
            rows={4}
            className="resize-none"
          />
        </CardContent>
      </Card>

      {/* 操作行 */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button variant="outline" onClick={prev}>
          <ChevronLeft className="size-4" /> 上一张
        </Button>
        <div className="flex gap-2 flex-wrap justify-center">
          <Button variant="ghost" onClick={() => setInput("")}>
            <RotateCcw className="size-4" /> 清空作答
          </Button>
          <Button onClick={() => setFlipped((f) => !f)} variant="secondary">
            <Eye className="size-4" /> {flipped ? "返回正面" : "查看答案"}
          </Button>
          {flipped && (
            <>
              <Button variant="outline" onClick={() => gradeReview("again")}>忘了</Button>
              <Button variant="outline" onClick={() => gradeReview("hard")}>吃力</Button>
              <Button variant="outline" onClick={() => gradeReview("good")}>记住</Button>
              <Button onClick={() => gradeReview("easy")}>熟练</Button>
            </>
          )}
        </div>
        <Button onClick={next}>
          下一张 <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}

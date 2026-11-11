"use client"

import { cn } from "@/lib/utils"
import type { Question } from "@/lib/data"
import { getTraceTextStyle } from "@/lib/copybook-style"
import { getCopybookFontClass, type CopybookFontMode } from "@/lib/copybook-fonts"

type Props = {
  question: Question
  aiAnswerText: string
  font: CopybookFontMode
  theme: "red" | "green" | "gray"
  traceMode: "full" | "partial"
  traceOpacity: number
  strokeWeight: number
}

const COLS = 20

export function CopybookPage({ question, aiAnswerText, font, theme, traceMode, traceOpacity, strokeWeight }: Props) {
  // 拆字符（保留中文标点占一格，跳过换行）
  const charArray = Array.from(aiAnswerText.replace(/\s/g, ""))

  // 对照默写：保留前 2 行描红，其余清空
  const visibleChars = traceMode === "full" ? charArray : (() => {
    const totalRows = Math.ceil(charArray.length / COLS)
    const out: (string | null)[] = []
    for (let r = 0; r < totalRows; r++) {
      // 每 4 行一组：前 2 行描红，后 2 行空
      const blockRow = r % 4
      for (let c = 0; c < COLS; c++) {
        const idx = r * COLS + c
        if (blockRow < 2) out.push(charArray[idx] ?? null)
        else out.push(null)
      }
    }
    return out
  })()

  const totalRows = Math.ceil(visibleChars.length / COLS)

  return (
    <div
      className={cn(
        "copybook-page",
        getCopybookFontClass(font),
        theme === "green" && "theme-green",
        theme === "gray" && "theme-gray",
      )}
    >
      <div className="header-banner">
        <div className="title-row">
          <h1 className="doc-title">申论高分精修临摹字帖</h1>
          <div className="meta-info">★ 考公申论 AI 智能体 · 专属定制</div>
        </div>
      </div>

      <div className="section-title">【原题重现】</div>
      <div className="question-box">
        <strong>题目：</strong>
        {question.title}
        <br />
        <strong>要求：</strong>
        {question.prompt}
      </div>

      <div className="section-title">【AI 满分精修答案 · 临摹方格】</div>
      <div className="grid-container">
        {Array.from({ length: totalRows }).map((_, rowIndex) => (
          <div className="grid-row" key={rowIndex}>
            {Array.from({ length: COLS }).map((_, colIndex) => {
              const charIdx = rowIndex * COLS + colIndex
              const ch = visibleChars[charIdx]
              const isEmpty = ch == null || ch === undefined
              return (
                <div className={cn("grid-cell", isEmpty && "empty-cell")} key={colIndex}>
                  {!isEmpty && (
                    <span
                      className="trace-text"
                      style={getTraceTextStyle(traceOpacity, strokeWeight)}
                    >
                      {ch}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

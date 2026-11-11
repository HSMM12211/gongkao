import type { MaterialContextPayload } from "@/lib/agent/context-mentions"

export type AgentContextMode = "map" | "snippets" | "full_source"

export type AgentContextSnippet = {
  id: string
  label: string
  start: number
  end: number
  text: string
}

export type AgentContextMap = {
  mode: AgentContextMode
  source: {
    title: string
    sourceType: string
    originalName?: string
    originalChars: number
    providedChars: number
    estimatedSections: number
  }
  snippets: AgentContextSnippet[]
  boundContext: MaterialContextPayload
  budget: {
    originalSourceChars: number
    finalSourceChars: number
    totalChars: number
    warnings: string[]
  }
  warnings: string[]
}

export function buildAgentContextMap(input: {
  title: string
  sourceType: string
  originalName?: string
  sourceText: string
  boundContext: MaterialContextPayload
  promptBudget?: {
    originalSourceChars: number
    finalSourceChars: number
    totalChars: number
    warnings: string[]
  }
  maxSnippetChars?: number
}): AgentContextMap {
  const sourceText = input.sourceText.trim()
  const maxSnippetChars = input.maxSnippetChars ?? 2800
  const originalSourceChars = input.promptBudget?.originalSourceChars ?? sourceText.length
  const finalSourceChars = input.promptBudget?.finalSourceChars ?? sourceText.length
  const sections = splitSections(sourceText)
  const warnings = [...(input.promptBudget?.warnings ?? [])]
  const mode: AgentContextMode =
    sourceText.length <= 12_000 && warnings.length === 0
      ? "full_source"
      : sourceText.length <= maxSnippetChars
        ? "map"
        : "snippets"

  if (mode !== "full_source") {
    warnings.push("已使用上下文地图和片段模式，Agent 只能声称覆盖已提供片段。")
  }

  return {
    mode,
    source: {
      title: input.title,
      sourceType: input.sourceType,
      originalName: input.originalName,
      originalChars: originalSourceChars,
      providedChars: sourceText.length,
      estimatedSections: sections.length,
    },
    snippets: mode === "full_source" ? [] : selectSnippets(sections, maxSnippetChars),
    boundContext: input.boundContext,
    budget: {
      originalSourceChars,
      finalSourceChars,
      totalChars: input.promptBudget?.totalChars ?? sourceText.length,
      warnings: input.promptBudget?.warnings ?? [],
    },
    warnings: unique(warnings),
  }
}

function splitSections(text: string): AgentContextSnippet[] {
  const paragraphs = text
    .split(/\n{2,}|(?=第[一二三四五六七八九十\d]+[章节部分])|(?=【[^】]+】)/)
    .map((item) => item.trim())
    .filter(Boolean)
  if (paragraphs.length === 0 && text.trim()) paragraphs.push(text.trim())

  let cursor = 0
  return paragraphs.map((paragraph, index) => {
    const start = text.indexOf(paragraph, cursor)
    const safeStart = start >= 0 ? start : cursor
    const end = safeStart + paragraph.length
    cursor = end
    return {
      id: `snippet-${index + 1}`,
      label: `片段 ${index + 1}`,
      start: safeStart,
      end,
      text: paragraph,
    }
  })
}

function selectSnippets(sections: AgentContextSnippet[], maxChars: number): AgentContextSnippet[] {
  const selected: AgentContextSnippet[] = []
  let used = 0
  const candidates = sections.length <= 3 ? sections : [sections[0], sections[Math.floor(sections.length / 2)], sections[sections.length - 1]]
  for (const section of candidates.filter(Boolean)) {
    const remaining = maxChars - used
    if (remaining <= 0) break
    const text = section.text.slice(0, Math.max(0, remaining))
    selected.push({ ...section, text, end: section.start + text.length })
    used += text.length
  }
  return selected
}

function unique(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)))
}

export type PromptBudgetInput = {
  prompt: string
  sourceText: string
  skillInstructionChars?: number
  referencesChars?: number
  maxSourceChars: number
  hardMaxTotalChars: number
}

export type PromptBudgetEstimate = {
  promptChars: number
  sourceChars: number
  skillInstructionChars: number
  referencesChars: number
  totalChars: number
}

export type PromptBudgetResult = {
  sourceText: string
  estimate: PromptBudgetEstimate
  blocked: boolean
  warnings: string[]
  errors: string[]
}

export type MaterialAgentPromptBudgetLimits = {
  maxSourceChars: number
  hardMaxTotalChars: number
}

export function materialAgentPromptBudgetLimits(input: {
  sourceType?: string
  sourceChars?: number
}): MaterialAgentPromptBudgetLimits {
  if (input.sourceType === "pdf") {
    return {
      maxSourceChars: input.sourceChars && input.sourceChars > 120_000 ? 180_000 : 160_000,
      hardMaxTotalChars: 240_000,
    }
  }

  if (input.sourceChars && input.sourceChars > 30_000) {
    return {
      maxSourceChars: 60_000,
      hardMaxTotalChars: 90_000,
    }
  }

  return {
    maxSourceChars: 12_000,
    hardMaxTotalChars: 26_000,
  }
}

export function estimatePromptBudget(input: {
  prompt: string
  sourceText: string
  skillInstructionChars?: number
  referencesChars?: number
}): PromptBudgetEstimate {
  const promptChars = input.prompt.length
  const sourceChars = input.sourceText.length
  const skillInstructionChars = input.skillInstructionChars ?? 0
  const referencesChars = input.referencesChars ?? 0
  return {
    promptChars,
    sourceChars,
    skillInstructionChars,
    referencesChars,
    totalChars: promptChars + sourceChars + skillInstructionChars + referencesChars,
  }
}

export function applyPromptBudget(input: PromptBudgetInput): PromptBudgetResult {
  const warnings: string[] = []
  let sourceText = input.sourceText
  if (sourceText.length > input.maxSourceChars) {
    sourceText = trimMiddle(sourceText, input.maxSourceChars)
    warnings.push(`已自动裁剪来源正文：${input.sourceText.length} -> ${sourceText.length} 字`)
  }

  const estimate = estimatePromptBudget({
    prompt: input.prompt,
    sourceText,
    skillInstructionChars: input.skillInstructionChars,
    referencesChars: input.referencesChars,
  })
  const errors =
    estimate.totalChars > input.hardMaxTotalChars
      ? [`上下文仍超过预算：${estimate.totalChars} / ${input.hardMaxTotalChars} 字，请缩小主题或减少资料。`]
      : []

  return {
    sourceText,
    estimate,
    warnings,
    errors,
    blocked: errors.length > 0,
  }
}

function trimMiddle(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  if (maxChars <= 20) return text.slice(0, maxChars)
  const marker = "\n\n……中间内容已裁剪，原文保留在运行工作区……\n\n"
  const remaining = Math.max(0, maxChars - marker.length)
  const head = Math.ceil(remaining * 0.65)
  const tail = Math.floor(remaining * 0.35)
  return `${text.slice(0, head)}${marker}${tail > 0 ? text.slice(-tail) : ""}`
}

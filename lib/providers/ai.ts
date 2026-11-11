import { scoreKeywords } from "@/lib/analysis/keyword-match"
import type { AiDiagnosis } from "@/lib/storage/schema"
import type { AiDiagnosisRequest } from "@/lib/providers/types"

function asStringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : null
}

function asLanguageSuggestions(value: unknown): AiDiagnosis["languageSuggestions"] | null {
  if (!Array.isArray(value)) return null
  const valid = value.every(
    (item) =>
      item &&
      typeof item === "object" &&
      typeof (item as { original?: unknown }).original === "string" &&
      typeof (item as { revised?: unknown }).revised === "string" &&
      typeof (item as { reason?: unknown }).reason === "string",
  )
  return valid ? (value as AiDiagnosis["languageSuggestions"]) : null
}

export function parseAiDiagnosis(raw: string): AiDiagnosis | null {
  try {
    const data = JSON.parse(raw) as Partial<AiDiagnosis>
    const keywordHits = asStringArray(data.keywordHits)
    const missingKeywords = asStringArray(data.missingKeywords)
    const logicIssues = asStringArray(data.logicIssues)
    const languageSuggestions = asLanguageSuggestions(data.languageSuggestions)

    if (
      typeof data.score !== "number" ||
      !keywordHits ||
      !missingKeywords ||
      !logicIssues ||
      !languageSuggestions ||
      typeof data.modelAnswer !== "string" ||
      typeof data.copybookText !== "string"
    ) {
      return null
    }

    return {
      score: Math.max(0, Math.min(100, Math.round(data.score))),
      keywordHits,
      missingKeywords,
      logicIssues,
      languageSuggestions,
      modelAnswer: data.modelAnswer,
      copybookText: data.copybookText,
    }
  } catch {
    return null
  }
}

export async function createMockDiagnosis(request: AiDiagnosisRequest): Promise<AiDiagnosis> {
  const score = scoreKeywords(request.answer, request.question.keywords)
  const lengthScore = Math.min(30, Math.round(request.answer.length / 20))
  const finalScore = Math.min(100, Math.round(score.ratio * 70 + lengthScore))

  return {
    score: finalScore,
    keywordHits: score.hits,
    missingKeywords: score.misses,
    logicIssues:
      score.misses.length > 0
        ? [`遗漏「${score.misses.slice(0, 2).join("、")}」等关键维度，建议补足对策层次。`]
        : ["结构较完整，可继续提升表达凝练度。"],
    languageSuggestions: [
      { original: "搞", revised: "推进", reason: "口语化动词应替换为政务规范表达。" },
      { original: "想办法", revised: "多措并举", reason: "表达更正式，适合申论对策句。" },
    ],
    modelAnswer: request.question.aiAnswer,
    copybookText: request.question.aiAnswer,
  }
}

function buildPrompt(request: AiDiagnosisRequest) {
  return [
    `题型：${request.question.type}`,
    `标题：${request.question.title}`,
    `材料：${request.question.material}`,
    `题干：${request.question.prompt}`,
    `标准关键词：${request.question.keywords.join("、")}`,
    `用户作答：${request.answer}`,
    "请严格返回 JSON，字段为 score, keywordHits, missingKeywords, logicIssues, languageSuggestions, modelAnswer, copybookText。",
  ].join("\n\n")
}

async function diagnoseWithOpenAiCompatible(request: AiDiagnosisRequest): Promise<AiDiagnosis> {
  const res = await fetch(request.settings.apiEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(request.settings.apiKey ? { Authorization: `Bearer ${request.settings.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: request.settings.apiModel,
      messages: [
        { role: "system", content: "你是公考申论批改老师，只返回 JSON。" },
        { role: "user", content: buildPrompt(request) },
      ],
      temperature: 0.2,
    }),
  })

  if (!res.ok) {
    throw new Error(`AI API 请求失败：${res.status}`)
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error("AI API 响应缺少 message.content")

  const parsed = parseAiDiagnosis(content)
  if (!parsed) throw new Error("AI API 返回内容不是有效诊断 JSON")
  return parsed
}

async function diagnoseWithLocalOllama(request: AiDiagnosisRequest): Promise<AiDiagnosis> {
  const res = await fetch(request.settings.localEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: request.settings.localModel,
      stream: false,
      messages: [
        { role: "system", content: "你是公考申论批改老师，只返回 JSON。" },
        { role: "user", content: buildPrompt(request) },
      ],
    }),
  })

  if (!res.ok) {
    throw new Error(`本地 AI 请求失败：${res.status}`)
  }

  const data = (await res.json()) as { message?: { content?: string }; response?: string }
  const content = data.message?.content ?? data.response
  if (!content) throw new Error("本地 AI 响应缺少内容")

  const parsed = parseAiDiagnosis(content)
  if (!parsed) throw new Error("本地 AI 返回内容不是有效诊断 JSON")
  return parsed
}

export async function diagnoseAnswer(request: AiDiagnosisRequest): Promise<AiDiagnosis> {
  if (request.settings.mode === "api") {
    return diagnoseWithOpenAiCompatible(request)
  }
  if (request.settings.mode === "local") {
    return diagnoseWithLocalOllama(request)
  }
  return createMockDiagnosis(request)
}

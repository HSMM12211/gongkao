import { DEFAULT_AI_SETTINGS, loadAiSettings } from "@/lib/providers/settings"
import type { AiProviderSettings } from "@/lib/storage/schema"
import type { MaterialDraft, MaterialFileInput, MaterialImportBundle } from "@/lib/material/types"
import { cleanMaterialText, chunkMaterialText } from "@/lib/material/text"

const QUESTION_TYPES = ["概括题", "对策题", "综合分析", "应用文", "大作文"] as const
const FLASHCARD_CATEGORIES = ["金句", "规范词", "对策"] as const

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

function normalizeKeywords(text: string): string[] {
  const candidates = [
    "夯实基础设施",
    "提升数字素养",
    "打破数据壁垒",
    "强化人才支撑",
    "完善制度保障",
    "因地制宜",
  ]
  const hits = candidates.filter((item) => text.includes(item.slice(0, 4)) || text.includes(item))
  return Array.from(new Set([...hits, ...candidates])).slice(0, 6)
}

function isQuestionType(value: unknown): value is MaterialDraft["practiceQuestions"][number]["type"] {
  return typeof value === "string" && QUESTION_TYPES.includes(value as never)
}

function isFlashcardCategory(value: unknown): value is MaterialDraft["flashcards"][number]["category"] {
  return typeof value === "string" && FLASHCARD_CATEGORIES.includes(value as never)
}

export function validateMaterialDraft(draft: MaterialDraft): string[] {
  const errors: string[] = []
  if (!draft.topic.trim()) errors.push("缺少热点主题")
  if (draft.keywords.length < 3) errors.push("至少需要 3 个关键词")
  if (draft.flashcards.length < 1) errors.push("至少需要 1 张闪卡")
  if (draft.practiceQuestions.length < 1) errors.push("至少需要 1 道练习题")
  return errors
}

export function parseMaterialDraft(raw: string): MaterialDraft | null {
  try {
    const data = JSON.parse(raw) as Partial<MaterialDraft>
    if (
      typeof data.topic !== "string" ||
      typeof data.summary !== "string" ||
      !isStringArray(data.tags) ||
      !isStringArray(data.keywords) ||
      !isStringArray(data.goldenSentences) ||
      !Array.isArray(data.flashcards) ||
      !Array.isArray(data.practiceQuestions) ||
      !Array.isArray(data.copybookItems)
    ) {
      return null
    }

    const flashcards = data.flashcards
      .filter((item) => item && typeof item === "object")
      .map((item) => item as MaterialDraft["flashcards"][number])
      .filter((item) => typeof item.front === "string" && isStringArray(item.keywords) && isFlashcardCategory(item.category))

    const practiceQuestions = data.practiceQuestions
      .filter((item) => item && typeof item === "object")
      .map((item) => item as MaterialDraft["practiceQuestions"][number])
      .filter(
        (item) =>
          isQuestionType(item.type) &&
          typeof item.title === "string" &&
          typeof item.material === "string" &&
          typeof item.prompt === "string" &&
          isStringArray(item.keywords) &&
          typeof item.modelAnswer === "string",
      )

    const copybookItems = data.copybookItems
      .filter((item) => item && typeof item === "object")
      .map((item) => item as MaterialDraft["copybookItems"][number])
      .filter((item) => typeof item.title === "string" && typeof item.text === "string" && isStringArray(item.tags))

    const draft: MaterialDraft = {
      topic: data.topic,
      summary: data.summary,
      source: typeof data.source === "string" ? data.source : undefined,
      tags: data.tags,
      keywords: data.keywords,
      goldenSentences: data.goldenSentences,
      flashcards,
      practiceQuestions,
      copybookItems,
    }

    return validateMaterialDraft(draft).length === 0 ? draft : null
  } catch {
    return null
  }
}

export async function createMockMaterialDraft(text: string): Promise<MaterialDraft> {
  const cleaned = cleanMaterialText(text)
  const keywords = normalizeKeywords(cleaned)
  const topic = cleaned.includes("数字乡村") ? "数字乡村建设" : "公考热点素材"
  const material = cleaned.slice(0, 900)
  const modelAnswer = `围绕${topic}，应坚持问题导向和目标导向，多措并举、综合施策。一是${keywords[0]}，补齐发展短板。二是${keywords[1]}，增强主体能力。三是${keywords[2]}，提升治理效能。`

  return {
    topic,
    summary: cleaned.slice(0, 180) || `${topic}相关资料。`,
    tags: [topic, "申论热点"],
    keywords,
    goldenSentences: [`以系统思维推进${topic}，让发展成果更好惠及群众。`],
    flashcards: [
      {
        front: `${topic}的核心抓手有哪些？`,
        keywords: keywords.slice(0, 3),
        category: "对策",
      },
    ],
    practiceQuestions: [
      {
        type: "对策题",
        title: `请就如何推进${topic}提出对策建议`,
        material,
        prompt: "要求：对策具体、有针对性，不超过300字。",
        keywords: keywords.slice(0, 5),
        modelAnswer,
      },
    ],
    copybookItems: [
      {
        title: `${topic}规范表达`,
        text: modelAnswer,
        tags: [topic, "规范表达"],
      },
    ],
  }
}

function buildMaterialPrompt(text: string) {
  return [
    "你是公考申论素材加工助手。请根据用户资料只返回合法 JSON。",
    "JSON 字段：topic, summary, source, tags, keywords, goldenSentences, flashcards, practiceQuestions, copybookItems。",
    "practiceQuestions 每项字段：type, title, material, prompt, keywords, modelAnswer。",
    "flashcards 每项字段：front, keywords, category；category 只能是 金句/规范词/对策。",
    "copybookItems 每项字段：title, text, tags。",
    "资料：",
    text,
  ].join("\n")
}

async function callOpenAiCompatible(settings: AiProviderSettings, text: string): Promise<MaterialDraft> {
  const endpoint = settings.mode === "local" ? settings.localEndpoint : settings.apiEndpoint
  const body =
    settings.mode === "local"
      ? {
          model: settings.localModel,
          stream: false,
          messages: [
            { role: "system", content: "你是公考申论素材加工助手，只返回 JSON。" },
            { role: "user", content: buildMaterialPrompt(text) },
          ],
        }
      : {
          model: settings.apiModel,
          messages: [
            { role: "system", content: "你是公考申论素材加工助手，只返回 JSON。" },
            { role: "user", content: buildMaterialPrompt(text) },
          ],
          temperature: 0.2,
        }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(settings.mode === "api" && settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) throw new Error(`素材加工请求失败：${res.status}`)
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[]; message?: { content?: string }; response?: string }
  const content = data.choices?.[0]?.message?.content ?? data.message?.content ?? data.response
  if (!content) throw new Error("素材加工响应缺少内容")
  const parsed = parseMaterialDraft(content)
  if (!parsed) throw new Error("素材加工响应不是有效 JSON")
  return parsed
}

export async function processMaterialText(text: string, settings?: AiProviderSettings): Promise<MaterialDraft> {
  const cleaned = cleanMaterialText(text)
  const activeSettings = settings ?? (await loadAiSettings().catch(() => DEFAULT_AI_SETTINGS))
  if (activeSettings.mode === "mock") return createMockMaterialDraft(cleaned)
  try {
    const chunks = chunkMaterialText(cleaned, 6000)
    const mergedText = chunks.map((chunk) => `【片段${chunk.index + 1}】\n${chunk.text}`).join("\n\n")
    return await callOpenAiCompatible(activeSettings, mergedText)
  } catch {
    return createMockMaterialDraft(cleaned)
  }
}

export function buildImportBundle(input: MaterialFileInput, draft: MaterialDraft, now = new Date()): MaterialImportBundle {
  const createdAt = now.toISOString()
  const sourceId = crypto.randomUUID()
  const source = {
    id: sourceId,
    title: input.title || draft.topic,
    sourceType: input.sourceType,
    originalName: input.originalName,
    createdAt,
    text: input.text,
    summary: draft.summary,
    tags: draft.tags,
    layoutBlocks: input.layoutBlocks,
    pages: input.pages,
  }

  return {
    source,
    flashcards: draft.flashcards.map((card) => ({
      id: crypto.randomUUID(),
      sourceId,
      front: card.front,
      keywords: card.keywords,
      category: card.category,
      createdAt,
    })),
    questions: draft.practiceQuestions.map((question) => ({
      id: crypto.randomUUID(),
      sourceId,
      title: question.title,
      type: question.type,
      material: question.material,
      prompt: question.prompt,
      keywords: question.keywords,
      aiAnswer: question.modelAnswer,
      createdAt,
    })),
    copybookItems: draft.copybookItems.map((item) => ({
      id: crypto.randomUUID(),
      source: "manual",
      sourceId,
      title: item.title,
      text: item.text,
      tags: item.tags,
      createdAt,
    })),
  }
}

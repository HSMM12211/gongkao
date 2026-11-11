import type { ShenlunDocumentParserOutput } from "@/lib/shenlun/parser-output"
import type { MaterialLayoutBlock } from "@/lib/material/types"
import { abilityDimensionForQuestionType } from "@/lib/shenlun/learning-assets"

type ParseExamDocumentTextInput = {
  title: string
  sourceType: "pdf" | "markdown" | "text"
  originalName?: string
  rawText: string
  layoutBlocks?: MaterialLayoutBlock[]
}

export function parseExamDocumentText(input: ParseExamDocumentTextInput): ShenlunDocumentParserOutput {
  const rawText = normalizeLines(input.rawText)
  const layoutOutput = input.layoutBlocks?.length ? parseExamDocumentLayoutBlocks(input, rawText) : null
  if (layoutOutput) return layoutOutput

  const warnings: string[] = []
  const passages = extractPassages(rawText)
  const questions = extractQuestions(rawText)
  const fallbackQuestion =
    questions.length === 0
      ? [
          {
            ref: "q1",
            materialRefs: passages.map((passage) => passage.ref),
            type: inferQuestionType(rawText),
            title: "申论训练题",
            prompt: "请根据给定资料完成作答。",
            wordLimit: undefined,
            suggestedMinutes: 25,
            scoringPointRefs: ["s1"],
          },
        ]
      : questions.map((question, index) => ({
          ...question,
          materialRefs: passages.length > 0 ? passages.map((passage) => passage.ref) : [`m${index + 1}`],
        }))

  if (passages.length === 0) warnings.push("未识别到明确材料段落，已使用全文作为材料。")
  if (questions.length === 0) warnings.push("未识别到明确题目，已生成一条待审核训练题。")

  const safePassages =
    passages.length > 0
      ? passages
      : [
          {
            ref: "m1",
            order: 1,
            title: "全文材料",
            text: rawText.slice(0, 4000),
            tags: inferTags(rawText),
          },
        ]

  const answerText = extractAnswerText(rawText)
  const scoringPointTexts = extractScoringPointTexts(rawText, answerText)
  const scoringPoints = scoringPointTexts.map((text, index) => ({
    ref: `s${index + 1}`,
    questionRef: fallbackQuestion[Math.min(index, fallbackQuestion.length - 1)]?.ref ?? "q1",
    text,
    weight: 1,
    aliases: buildAliases(text),
  }))
  const answerKeys = fallbackQuestion.map((question) => ({
    ref: `a-${question.ref}`,
    questionRef: question.ref,
    answerText: answerText || buildFallbackAnswer(scoringPointTexts),
    source: "document" as const,
  }))

  return withLearningSections({
    document: {
      title: input.title,
      documentType: "exam_paper",
      sourceType: input.sourceType,
      originalName: input.originalName,
      rawText,
    },
    examPapers: [
      {
        title: input.title,
        totalMinutes: Math.max(120, fallbackQuestion.length * 25),
        materialRefs: safePassages.map((passage) => passage.ref),
        questionRefs: fallbackQuestion.map((question) => question.ref),
      },
    ],
    passages: safePassages,
    questions: fallbackQuestion.map((question) => ({
      ...question,
      scoringPointRefs:
        scoringPoints.length > 0
          ? scoringPoints.filter((point) => point.questionRef === question.ref).map((point) => point.ref)
          : [],
    })),
    answerKeys,
    scoringPoints,
    warnings,
  })
}

function parseExamDocumentLayoutBlocks(
  input: ParseExamDocumentTextInput,
  rawText: string,
): ShenlunDocumentParserOutput | null {
  const blocks = [...(input.layoutBlocks ?? [])]
    .filter((block) => block.text.trim())
    .sort((a, b) => a.pageNumber - b.pageNumber || a.order - b.order)
  if (blocks.length === 0) return null

  type SectionKind = "passage" | "question" | "answer" | "scoring"
  type Section = {
    kind: SectionKind
    title: string
    texts: string[]
    pageStart: number
    pageEnd: number
  }
  const sections: Section[] = []
  let current: Section | null = null

  const pushText = (block: MaterialLayoutBlock, text: string) => {
    if (!current) {
      current = { kind: "passage", title: "全文材料", texts: [], pageStart: block.pageNumber, pageEnd: block.pageNumber }
      sections.push(current)
    }
    current.texts.push(text)
    current.pageEnd = block.pageNumber
  }

  for (const block of blocks) {
    const parsedHeading = parseLayoutHeading(block.text)
    if (parsedHeading) {
      current = {
        kind: parsedHeading.kind,
        title: parsedHeading.title,
        texts: [],
        pageStart: block.pageNumber,
        pageEnd: block.pageNumber,
      }
      sections.push(current)
      if (parsedHeading.inlineText) pushText(block, parsedHeading.inlineText)
      continue
    }
    if (block.blockType === "table" && block.markdown) {
      pushText(block, block.markdown)
    } else {
      pushText(block, block.text)
    }
  }

  const passageSections = sections.filter((section) => section.kind === "passage" && sectionText(section).length >= 10)
  const questionSections = sections.filter((section) => section.kind === "question" && sectionText(section).length > 0)
  const answerText = sections
    .filter((section) => section.kind === "answer")
    .map(sectionText)
    .join("\n")
  const scoringText = sections
    .filter((section) => section.kind === "scoring")
    .map(sectionText)
    .join("\n")
  const warnings: string[] = []
  if (passageSections.length === 0) warnings.push("未识别到明确材料段落，已使用全文作为材料。")
  if (questionSections.length === 0) warnings.push("未识别到明确题目，已生成一条待审核训练题。")

  const passages =
    passageSections.length > 0
      ? passageSections.map((section, index) => ({
          ref: `m${index + 1}`,
          order: index + 1,
          title: section.title,
          text: sectionText(section),
          pageStart: section.pageStart,
          pageEnd: section.pageEnd,
          tags: inferTags(sectionText(section)),
        }))
      : [
          {
            ref: "m1",
            order: 1,
            title: "全文材料",
            text: rawText.slice(0, 4000),
            tags: inferTags(rawText),
          },
        ]
  const questions =
    questionSections.length > 0
      ? questionSections.map((section, index) => {
          const prompt = sectionText(section)
          return {
            ref: `q${index + 1}`,
            materialRefs: passages.map((passage) => passage.ref),
            type: inferQuestionType(prompt),
            title: inferQuestionTitle(prompt, index + 1),
            prompt,
            wordLimit: inferWordLimit(prompt),
            suggestedMinutes: inferSuggestedMinutes(prompt),
            scoringPointRefs: [] as string[],
          }
        })
      : [
          {
            ref: "q1",
            materialRefs: passages.map((passage) => passage.ref),
            type: inferQuestionType(rawText),
            title: "申论训练题",
            prompt: "请根据给定资料完成作答。",
            wordLimit: undefined,
            suggestedMinutes: 25,
            scoringPointRefs: [] as string[],
          },
        ]
  const scoringPointTexts = extractScoringPointTexts(scoringText || rawText, answerText)
  const scoringPoints = scoringPointTexts.map((text, index) => ({
    ref: `s${index + 1}`,
    questionRef: questions[Math.min(index, questions.length - 1)]?.ref ?? "q1",
    text,
    weight: 1,
    aliases: buildAliases(text),
  }))

  return withLearningSections({
    document: {
      title: input.title,
      documentType: "exam_paper",
      sourceType: input.sourceType,
      originalName: input.originalName,
      rawText,
    },
    examPapers: [
      {
        title: input.title,
        totalMinutes: Math.max(120, questions.length * 25),
        materialRefs: passages.map((passage) => passage.ref),
        questionRefs: questions.map((question) => question.ref),
      },
    ],
    passages,
    questions: questions.map((question) => ({
      ...question,
      scoringPointRefs: scoringPoints.filter((point) => point.questionRef === question.ref).map((point) => point.ref),
    })),
    answerKeys: questions.map((question) => ({
      ref: `a-${question.ref}`,
      questionRef: question.ref,
      answerText: answerText || buildFallbackAnswer(scoringPointTexts),
      source: "document" as const,
    })),
    scoringPoints,
    warnings,
  })
}

function withLearningSections(output: ShenlunDocumentParserOutput): ShenlunDocumentParserOutput {
  const provenanceRef = "p1"
  const tags = uniqueStrings(output.passages.flatMap((passage) => passage.tags))
  const title = tags[0] ?? inferTopicFromText(output.document.title, output.document.rawText)
  return {
    ...output,
    provenance: [
      {
        ref: provenanceRef,
        sourceType: "document",
        parserSource: "local-deterministic",
        pageStart: output.passages.map((passage) => passage.pageStart).find((page): page is number => typeof page === "number"),
        pageEnd: [...output.passages].reverse().map((passage) => passage.pageEnd).find((page): page is number => typeof page === "number"),
        confidence: output.warnings.length > 0 ? 0.65 : 0.85,
        reviewState: output.warnings.length > 0 ? "needs_review" : "ready",
      },
    ],
    abilityTags: output.questions.map((question) => ({
      ref: `ability-${question.ref}`,
      targetRef: question.ref,
      dimension: abilityDimensionForQuestionType(question.type),
      label: abilityLabel(question.type),
      provenanceRef,
      confidence: 0.75,
    })),
    topicAssets: [
      {
        ref: "topic-1",
        title,
        category: "policy_theme",
        summary: output.document.rawText.replace(/\s+/g, "").slice(0, 120) || title,
        tags: tags.length > 0 ? tags : [title],
        provenanceRef,
        relatedQuestionRefs: output.questions.map((question) => question.ref),
        relatedPassageRefs: output.passages.map((passage) => passage.ref),
      },
    ],
  }
}

function abilityLabel(type: "summary" | "countermeasure" | "analysis" | "implementation" | "essay"): string {
  const labels = {
    summary: "概括归纳",
    countermeasure: "对策提出",
    analysis: "综合分析",
    implementation: "贯彻执行",
    essay: "文章写作",
  }
  return labels[type]
}

function inferTopicFromText(title: string, text: string): string {
  const candidates = ["数字乡村", "基层治理", "新质生产力", "乡村振兴", "营商环境", "公共服务"]
  return candidates.find((candidate) => title.includes(candidate) || text.includes(candidate)) ?? (title.slice(0, 12) || "申论素材")
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function parseLayoutHeading(text: string): { kind: "passage" | "question" | "answer" | "scoring"; title: string; inlineText: string } | null {
  const cleaned = text.trim()
  const match = /^(材料[一二三四五六七八九十\d]*|问题[一二三四五六七八九十\d]*|题目[一二三四五六七八九十\d]*|作答要求|参考答案|答案|评分要点|采分点|得分点)\s*[：:、]?\s*(.*)$/.exec(cleaned)
  if (!match) return null
  const label = match[1]
  const inlineText = match[2] ?? ""
  if (label.startsWith("材料")) return { kind: "passage", title: label, inlineText }
  if (label.startsWith("问题") || label.startsWith("题目") || label === "作答要求") {
    return { kind: "question", title: label, inlineText }
  }
  if (label === "参考答案" || label === "答案") return { kind: "answer", title: label, inlineText }
  return { kind: "scoring", title: label, inlineText }
}

function sectionText(section: { texts: string[] }) {
  return section.texts.join("\n").replace(/\n{3,}/g, "\n\n").trim()
}

function normalizeLines(text: string) {
  return text
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim()
}

function extractPassages(text: string): ShenlunDocumentParserOutput["passages"] {
  const matches = [...text.matchAll(/(?:^|\n)\s*(材料[一二三四五六七八九十\d]+)[：:、\s]*([\s\S]*?)(?=\n\s*(?:材料[一二三四五六七八九十\d]+|问题[一二三四五六七八九十\d]+|作答要求|参考答案|评分要点|$))/g)]
  return matches
    .map((match, index) => ({
      ref: `m${index + 1}`,
      order: index + 1,
      title: match[1],
      text: cleanSection(match[2]),
      tags: inferTags(match[2]),
    }))
    .filter((passage) => passage.text.length >= 10)
}

function extractQuestions(text: string): ShenlunDocumentParserOutput["questions"] {
  const matches = [...text.matchAll(/(?:^|\n)\s*(?:问题|题目|作答要求)[一二三四五六七八九十\d]*[：:、\s]*([\s\S]*?)(?=\n\s*(?:问题|题目|作答要求)[一二三四五六七八九十\d]*[：:、\s]|\n\s*(?:参考答案|评分要点|材料[一二三四五六七八九十\d]+)|$)/g)]
  return matches
    .map((match, index) => {
      const prompt = cleanSection(match[1])
      return {
        ref: `q${index + 1}`,
        materialRefs: [],
        type: inferQuestionType(prompt),
        title: inferQuestionTitle(prompt, index + 1),
        prompt,
        wordLimit: inferWordLimit(prompt),
        suggestedMinutes: inferSuggestedMinutes(prompt),
        scoringPointRefs: [],
      }
    })
    .filter((question) => question.prompt.length > 0)
}

function extractAnswerText(text: string): string {
  const match = /(?:参考答案|答案)[：:、\s]*([\s\S]*?)(?=\n\s*(?:评分要点|采分点|材料[一二三四五六七八九十\d]+|问题[一二三四五六七八九十\d]+)|$)/.exec(text)
  return match ? cleanSection(match[1]) : ""
}

function extractScoringPointTexts(text: string, answerText: string): string[] {
  const match = /(?:评分要点|采分点|得分点)[：:、\s]*([\s\S]*?)(?=\n\s*(?:材料[一二三四五六七八九十\d]+|问题[一二三四五六七八九十\d]+|参考答案)|$)/.exec(text)
  const source = match?.[1] || answerText
  const parts = source
    .split(/[；;。\n]/)
    .map((item) => item.replace(/^[一二三四五六七八九十\d]+[是、.．]?\s*/, "").trim())
    .filter((item) => item.length >= 4 && item.length <= 80)
  return Array.from(new Set(parts)).slice(0, 12)
}

function inferQuestionType(text: string): "summary" | "countermeasure" | "analysis" | "implementation" | "essay" {
  if (/概括|归纳|简述|主要问题/.test(text)) return "summary"
  if (/对策|措施|建议|怎么办|推进/.test(text)) return "countermeasure"
  if (/理解|分析|谈谈|评价/.test(text)) return "analysis"
  if (/公文|倡议书|通知|讲话稿|简报/.test(text)) return "implementation"
  return "essay"
}

function inferQuestionTitle(prompt: string, index: number) {
  const compact = prompt.replace(/\s/g, "")
  return compact.slice(0, 24) || `第 ${index} 题`
}

function inferSuggestedMinutes(prompt: string) {
  const type = inferQuestionType(prompt)
  if (type === "summary") return 20
  if (type === "essay") return 50
  return 25
}

function inferWordLimit(prompt: string): number | undefined {
  const match = /(?:不超过|控制在|限|以内)\s*(\d{2,4})\s*字|(\d{2,4})\s*字以内/.exec(prompt)
  const value = match?.[1] ?? match?.[2]
  return value ? Number(value) : undefined
}

function inferTags(text: string): string[] {
  const tags = ["申论真题"]
  if (/数字乡村|数据|数字/.test(text)) tags.push("数字治理")
  if (/基层|治理|群众/.test(text)) tags.push("基层治理")
  if (/产业|农业|乡村/.test(text)) tags.push("乡村振兴")
  return Array.from(new Set(tags))
}

function cleanSection(text: string) {
  return text.replace(/\s+/g, " ").trim()
}

function buildAliases(text: string) {
  const aliases = [text]
  if (text.length > 6) aliases.push(text.slice(0, 6))
  return Array.from(new Set(aliases))
}

function buildFallbackAnswer(points: string[]) {
  if (points.length === 0) return "请围绕材料信息分条作答，做到要点完整、结构清晰、表达规范。"
  return points.map((point, index) => `${index + 1}. ${point}。`).join("\n")
}

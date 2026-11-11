export type MaterialMentionKind = "skill" | "topic" | "file" | "source" | "questionType" | "tag"

export type MaterialContextEntity = {
  id: string
  kind: MaterialMentionKind
  label: string
  aliases: string[]
  value: string
}

export type ParsedMaterialMention = MaterialContextEntity & {
  token: string
}

export type ParsedMaterialMentions = {
  known: ParsedMaterialMention[]
  unknown: string[]
}

export type MaterialContextPayload = {
  skillIds: string[]
  topicIds: string[]
  fileIds: string[]
  sourceIds: string[]
  questionTypes: string[]
  tags: string[]
  unknownMentions: string[]
  harness?: Record<string, unknown>
}

export type MaterialComposerContextGroup = {
  kind: MaterialMentionKind
  label: string
  items: ParsedMaterialMention[]
}

type SkillContextSource = {
  id: string
  name: string
  triggers?: string[]
}

export type ActiveSkillMention = {
  token: string
  tokenStart: number
  tokenEnd: number
  prefix: string
  matches: MaterialContextEntity[]
}

export const DEFAULT_MATERIAL_CONTEXTS: MaterialContextEntity[] = [
  {
    id: "skill:gongkao-hotspot-collector",
    kind: "skill",
    label: "热点采集器",
    aliases: ["Skill:热点采集器", "Skill:申论热点采集器", "热点采集器"],
    value: "gongkao-hotspot-collector",
  },
  {
    id: "skill:gongkao-material-parser",
    kind: "skill",
    label: "政策文件解析器",
    aliases: ["Skill:政策文件解析器", "Skill:本地解析", "本地解析"],
    value: "gongkao-material-parser",
  },
  {
    id: "skill:gongkao-smoke-test-skill",
    kind: "skill",
    label: "Skill 运行冒烟测试",
    aliases: ["Skill:gongkao-smoke-test-skill", "Skill:Skill 运行冒烟测试", "Skill:运行自检", "运行自检"],
    value: "gongkao-smoke-test-skill",
  },
  {
    id: "topic:digital-village",
    kind: "topic",
    label: "数字乡村",
    aliases: ["专题:数字乡村", "数字乡村"],
    value: "digital-village",
  },
  {
    id: "topic:grassroots-governance",
    kind: "topic",
    label: "基层治理",
    aliases: ["专题:基层治理", "基层治理"],
    value: "grassroots-governance",
  },
  {
    id: "source:people",
    kind: "source",
    label: "人民网",
    aliases: ["来源:人民网", "人民网"],
    value: "people",
  },
  {
    id: "source:gov",
    kind: "source",
    label: "gov.cn",
    aliases: ["来源:gov.cn", "gov.cn"],
    value: "gov.cn",
  },
  {
    id: "question:countermeasure",
    kind: "questionType",
    label: "对策题",
    aliases: ["题型:对策题", "对策题"],
    value: "对策题",
  },
  {
    id: "tag:grassroots-governance",
    kind: "tag",
    label: "基层治理",
    aliases: ["标签:基层治理"],
    value: "基层治理",
  },
]

export function buildMaterialContextEntities(skills: SkillContextSource[]): MaterialContextEntity[] {
  const byId = new Map(DEFAULT_MATERIAL_CONTEXTS.map((entity) => [entity.id, entity]))

  for (const skill of skills) {
    const id = `skill:${skill.id}`
    const existing = byId.get(id)
    const aliases = unique(
      [
        ...(existing?.aliases ?? []),
        `Skill:${skill.id}`,
        `Skill:${skill.name}`,
        skill.name,
        ...(skill.triggers ?? []).flatMap((trigger) => [`Skill:${trigger}`, trigger]),
      ].filter(Boolean),
    )

    byId.set(id, {
      id,
      kind: "skill",
      label: existing?.label ?? skill.name,
      aliases,
      value: skill.id,
    })
  }

  return Array.from(byId.values())
}

export function parseMaterialMentions(text: string, entities: MaterialContextEntity[]): ParsedMaterialMentions {
  const known: ParsedMaterialMention[] = []
  const unknown: string[] = []
  const seenKnown = new Set<string>()
  const seenUnknown = new Set<string>()
  const tokens = text.match(/@[^\s，。；,;]+/g) ?? []

  for (const token of tokens) {
    const raw = token.slice(1)
    const entity = entities.find((item) => item.aliases.includes(raw) || item.label === raw)
    if (entity) {
      if (!seenKnown.has(entity.id)) {
        seenKnown.add(entity.id)
        known.push({ ...entity, token })
      }
    } else if (!seenUnknown.has(token)) {
      seenUnknown.add(token)
      unknown.push(token)
    }
  }

  return { known, unknown }
}

export function findActiveSkillMention(
  text: string,
  cursor: number,
  entities: MaterialContextEntity[],
): ActiveSkillMention | undefined {
  const safeCursor = Math.max(0, Math.min(cursor, text.length))
  const tokenStart = text.lastIndexOf("@", safeCursor - 1)
  if (tokenStart < 0) return undefined

  const betweenStartAndCursor = text.slice(tokenStart, safeCursor)
  if (hasMentionSeparator(betweenStartAndCursor.slice(1))) return undefined

  let tokenEnd = safeCursor
  while (tokenEnd < text.length && !hasMentionSeparator(text[tokenEnd])) tokenEnd += 1

  const token = text.slice(tokenStart, tokenEnd)
  const raw = token.slice(1)
  const exact = entities.find((item) => item.aliases.includes(raw) || item.label === raw)
  if (exact?.kind === "skill") return undefined

  const prefix = activeSkillPrefix(raw)
  if (prefix === undefined) return undefined

  const matches = entities
    .filter((entity) => entity.kind === "skill")
    .filter((entity) => skillSearchKeys(entity).some((key) => key.startsWith(prefix)))
    .sort((a, b) => a.value.localeCompare(b.value))

  if (matches.length === 0) return undefined
  return { token, tokenStart, tokenEnd, prefix, matches }
}

export function buildMaterialContextPayload(parsed: ParsedMaterialMentions): MaterialContextPayload {
  const payload: MaterialContextPayload = {
    skillIds: [],
    topicIds: [],
    fileIds: [],
    sourceIds: [],
    questionTypes: [],
    tags: [],
    unknownMentions: parsed.unknown,
  }

  for (const mention of parsed.known) {
    if (mention.kind === "skill") payload.skillIds.push(mention.value)
    if (mention.kind === "topic") payload.topicIds.push(mention.value)
    if (mention.kind === "file") payload.fileIds.push(mention.value)
    if (mention.kind === "source") payload.sourceIds.push(mention.value)
    if (mention.kind === "questionType") payload.questionTypes.push(mention.value)
    if (mention.kind === "tag") payload.tags.push(mention.value)
  }

  return {
    skillIds: unique(payload.skillIds),
    topicIds: unique(payload.topicIds),
    fileIds: unique(payload.fileIds),
    sourceIds: unique(payload.sourceIds),
    questionTypes: unique(payload.questionTypes),
    tags: unique(payload.tags),
    unknownMentions: unique(payload.unknownMentions),
  }
}

export function buildMaterialComposerContextGroups(parsed: ParsedMaterialMentions): MaterialComposerContextGroup[] {
  const order: MaterialMentionKind[] = ["skill", "topic", "file", "source", "questionType", "tag"]
  const labels: Record<MaterialMentionKind, string> = {
    skill: "Skill",
    topic: "专题",
    file: "文件",
    source: "来源",
    questionType: "题型",
    tag: "标签",
  }

  return order
    .map((kind) => ({
      kind,
      label: labels[kind],
      items: parsed.known.filter((mention) => mention.kind === kind),
    }))
    .filter((group) => group.items.length > 0)
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values))
}

function skillSearchKeys(entity: MaterialContextEntity): string[] {
  return unique(
    [entity.value, entity.label, ...entity.aliases.map((alias) => alias.replace(/^Skill[:.]/i, ""))]
      .map(normalizeForMatch)
      .filter(Boolean),
  )
}

function activeSkillPrefix(raw: string): string | undefined {
  const explicit = /^Skill(?::|\.)(.*)$/i.exec(raw)
  if (explicit) return normalizeForMatch(explicit[1] ?? "")
  if (/^Skill$/i.test(raw)) return ""
  if (raw.includes(":") || raw.includes(".")) return undefined
  return normalizeForMatch(raw)
}

function normalizeForMatch(value: string): string {
  return value.trim().toLowerCase()
}

function hasMentionSeparator(value: string): boolean {
  return /[\s锛屻€傦紱,;]/.test(value)
}

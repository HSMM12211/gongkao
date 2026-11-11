import type { AgentCapability } from "@/types/agent-executor"

export type MaterialSkillInputType = "string" | "text" | "enum" | "multi_enum" | "boolean"
export type MaterialSkillSource = "built-in" | "user-local" | "external"
export type MaterialSkillTrust = "trusted" | "restricted" | "blocked"
export type MaterialSkillPermission = "promptInject" | "fileRead" | "fileWrite" | "network" | "subprocess"

export type MaterialSkillInput = {
  name: string
  label: string
  type: MaterialSkillInputType
  required?: boolean
  values?: string[]
  default?: string | string[] | boolean
  placeholder?: string
}

export type MaterialSkillDefinition = {
  id: string
  name: string
  description: string
  scenario: string
  source: MaterialSkillSource
  trust: MaterialSkillTrust
  inputs: MaterialSkillInput[]
  outputs: string[]
  requiredCapabilities: AgentCapability[]
  requiredPermissions: readonly MaterialSkillPermission[]
}

export type MaterialSkillInputValues = Record<string, string | string[] | boolean | undefined>

export const BUILTIN_MATERIAL_SKILLS: MaterialSkillDefinition[] = [
  {
    id: "gongkao-hotspot-collector",
    name: "申论热点采集器",
    description: "围绕主题采集公开热点资料，生成来源快照、摘要、金句、温故卡和申论题。",
    scenario: "热点追踪",
    source: "built-in",
    trust: "trusted",
    outputs: ["专题摘要", "金句", "温故卡", "申论题"],
    requiredCapabilities: ["streaming", "fileRead", "fileWrite", "structuredOutput"],
    requiredPermissions: ["promptInject", "fileRead", "fileWrite", "network"],
    inputs: [
      { name: "topic", label: "主题", type: "string", required: true, placeholder: "如：基层治理现代化" },
      {
        name: "date_range",
        label: "时间范围",
        type: "enum",
        values: ["近7天", "近30天", "近一年", "不限"],
        default: "近30天",
      },
      {
        name: "source_scope",
        label: "来源范围",
        type: "multi_enum",
        values: ["政策文件", "人民网", "新华网", "半月谈", "真题材料", "本地文件"],
        default: ["政策文件", "人民网", "新华网"],
      },
      {
        name: "outputs",
        label: "输出资产",
        type: "multi_enum",
        values: ["专题摘要", "金句", "温故卡", "申论题", "字帖摘抄"],
        default: ["专题摘要", "金句", "温故卡", "申论题"],
      },
    ],
  },
  {
    id: "gongkao-material-parser",
    name: "政策文件解析器",
    description: "把本地 PDF、政策文件或长文拆成背景、问题、对策和规范表达。",
    scenario: "本地解析",
    source: "built-in",
    trust: "trusted",
    outputs: ["专题摘要", "关键词", "金句", "温故卡"],
    requiredCapabilities: ["fileRead", "fileWrite", "structuredOutput"],
    requiredPermissions: ["promptInject", "fileRead", "fileWrite"],
    inputs: [
      { name: "topic", label: "主题", type: "string", required: true },
      { name: "parse_depth", label: "解析深度", type: "enum", values: ["快速", "标准", "深入"], default: "标准" },
    ],
  },
  {
    id: "gongkao-topic-wiki-curator",
    name: "专题 Wiki 生成器",
    description: "把多个来源合并为一个可持续维护的专题知识节点。",
    scenario: "专题 Wiki",
    source: "built-in",
    trust: "trusted",
    outputs: ["专题 Wiki", "关系线索", "复习提纲"],
    requiredCapabilities: ["fileRead", "fileWrite", "structuredOutput"],
    requiredPermissions: ["promptInject", "fileRead", "fileWrite"],
    inputs: [{ name: "topic", label: "主题", type: "string", required: true }],
  },
  {
    id: "gongkao-source-verifier",
    name: "来源核验助手",
    description: "检查素材来源、发布时间、发布主体和引用片段可信度。",
    scenario: "审核",
    source: "built-in",
    trust: "trusted",
    outputs: ["来源报告", "风险提示"],
    requiredCapabilities: ["fileRead", "structuredOutput"],
    requiredPermissions: ["promptInject", "fileRead", "network"],
    inputs: [{ name: "topic", label: "核验主题", type: "string", required: true }],
  },
  {
    id: "gongkao-question-generator",
    name: "真题材料结构化",
    description: "从素材生成题干、作答要求、关键词和参考答案。",
    scenario: "真题演练",
    source: "built-in",
    trust: "trusted",
    outputs: ["申论题", "参考答案", "关键词"],
    requiredCapabilities: ["fileRead", "fileWrite", "structuredOutput"],
    requiredPermissions: ["promptInject", "fileRead", "fileWrite"],
    inputs: [
      { name: "topic", label: "主题", type: "string", required: true },
      { name: "question_type", label: "题型", type: "enum", values: ["概括题", "对策题", "综合分析", "应用文", "大作文"], default: "对策题" },
    ],
  },
  {
    id: "gongkao-copybook-extractor",
    name: "字帖摘抄打包器",
    description: "从金句库挑选适合临摹的短句并送入字帖模块。",
    scenario: "字帖摘抄",
    source: "built-in",
    trust: "trusted",
    outputs: ["字帖摘抄"],
    requiredCapabilities: ["fileRead", "fileWrite", "structuredOutput"],
    requiredPermissions: ["promptInject", "fileRead", "fileWrite"],
    inputs: [
      { name: "topic", label: "主题", type: "string", required: true },
      { name: "count", label: "摘抄数量", type: "enum", values: ["10", "20", "30"], default: "20" },
    ],
  },
  {
    id: "gongkao-smoke-test-skill",
    name: "Skill 运行冒烟测试",
    description: "用最小结构化输出验证 Skill 发现、隔离工作区、CLI 调用和 material-draft.json 读取是否贯通。",
    scenario: "运行自检",
    source: "built-in",
    trust: "trusted",
    outputs: ["结构化素材", "运行报告", "字帖摘抄"],
    requiredCapabilities: ["fileRead", "fileWrite", "structuredOutput"],
    requiredPermissions: ["promptInject", "fileRead", "fileWrite"],
    inputs: [
      {
        name: "topic",
        label: "测试主题",
        type: "string",
        required: true,
        default: "Skill Runtime Smoke Test",
        placeholder: "例如：素材 Skill 链路自检",
      },
    ],
  },
]

export function getMaterialSkillDefinition(id: string): MaterialSkillDefinition | undefined {
  return BUILTIN_MATERIAL_SKILLS.find((skill) => skill.id === id)
}

export function normalizeSkillInputValues(
  skill: MaterialSkillDefinition,
  values: MaterialSkillInputValues,
): MaterialSkillInputValues {
  const normalized: MaterialSkillInputValues = {}
  for (const input of skill.inputs) {
    const value = values[input.name]
    if (value !== undefined && value !== "") {
      if (input.type === "multi_enum") {
        normalized[input.name] = Array.isArray(value) ? value.map(String) : [String(value)]
      } else {
        normalized[input.name] = value
      }
      continue
    }
    if (input.default !== undefined) {
      normalized[input.name] = Array.isArray(input.default) ? [...input.default] : input.default
    }
  }
  return normalized
}

export function validateSkillExecution(
  skill: MaterialSkillDefinition,
  values: MaterialSkillInputValues,
  adapterCapabilities: AgentCapability[],
): { ok: true; errors: [] } | { ok: false; errors: string[] } {
  const normalized = normalizeSkillInputValues(skill, values)
  const errors: string[] = []
  const missingInputs = skill.inputs
    .filter((input) => input.required)
    .filter((input) => {
      const value = normalized[input.name]
      return value === undefined || value === "" || (Array.isArray(value) && value.length === 0)
    })
    .map((input) => input.label)
  if (missingInputs.length > 0) errors.push(`请填写：${missingInputs.join("、")}`)

  if (skill.trust === "blocked") {
    errors.push("该 Skill 已被阻断，不能执行")
  }
  if (skill.source === "external" && skill.trust === "restricted") {
    const risky = skill.requiredPermissions.filter((permission) => permission !== "promptInject" && permission !== "fileRead")
    if (risky.length > 0) errors.push(`外部 Skill 需要额外授权：${risky.join("、")}`)
  }

  const capabilitySet = new Set(adapterCapabilities)
  const missingCapabilities = skill.requiredCapabilities.filter((capability) => !capabilitySet.has(capability))
  if (missingCapabilities.length > 0) {
    errors.push(`当前 Agent 缺少能力：${missingCapabilities.join("、")}`)
  }

  return errors.length === 0 ? { ok: true, errors: [] } : { ok: false, errors }
}

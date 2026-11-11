import { describe, expect, it } from "vitest"
import {
  DEFAULT_MATERIAL_CONTEXTS,
  buildMaterialContextEntities,
  buildMaterialContextPayload,
  findActiveSkillMention,
  parseMaterialMentions,
} from "@/lib/agent/context-mentions"

describe("material context mentions", () => {
  it("extracts known mentions into structured context refs", () => {
    const mentions = parseMaterialMentions(
      "围绕 @专题:数字乡村 使用 @Skill:热点采集器 和 @来源:人民网 生成素材",
      DEFAULT_MATERIAL_CONTEXTS,
    )

    expect(mentions.known.map((item) => item.id)).toEqual([
      "topic:digital-village",
      "skill:gongkao-hotspot-collector",
      "source:people",
    ])
    expect(mentions.unknown).toEqual([])
  })

  it("keeps unknown mention tokens visible", () => {
    const mentions = parseMaterialMentions("参考 @未知资料 生成金句", DEFAULT_MATERIAL_CONTEXTS)

    expect(mentions.unknown).toEqual(["@未知资料"])
  })

  it("recognizes dynamically loaded skill ids", () => {
    const contexts = buildMaterialContextEntities([
      {
        id: "gongkao-smoke-test-skill",
        name: "Skill 运行冒烟测试",
        triggers: ["运行自检"],
      },
    ])

    const payload = buildMaterialContextPayload(parseMaterialMentions("@Skill:gongkao-smoke-test-skill", contexts))

    expect(payload.skillIds).toEqual(["gongkao-smoke-test-skill"])
    expect(payload.unknownMentions).toEqual([])
  })

  it("suggests multiple skills by typed prefix", () => {
    const contexts = buildMaterialContextEntities([
      { id: "gongkao-smoke-test-skill", name: "Skill 运行冒烟测试", triggers: ["运行自检"] },
      { id: "gongkao-source-verifier", name: "来源校验", triggers: ["来源校验"] },
      { id: "parser-only", name: "Parser", triggers: [] },
    ])

    const mention = findActiveSkillMention("@Skill.go", "@Skill.go".length, contexts)

    expect(mention?.matches.map((item) => item.value)).toContain("gongkao-smoke-test-skill")
    expect(mention?.matches.map((item) => item.value)).toContain("gongkao-source-verifier")
    expect(mention?.matches.map((item) => item.value)).not.toContain("parser-only")
  })

  it("suggests skills from colon prefixes and bare skill id prefixes", () => {
    const contexts = buildMaterialContextEntities([
      { id: "gongkao-smoke-test-skill", name: "Skill 运行冒烟测试", triggers: ["运行自检"] },
      { id: "gongkao-source-verifier", name: "来源校验", triggers: ["来源校验"] },
      { id: "parser-only", name: "Parser", triggers: [] },
    ])

    const colonMention = findActiveSkillMention("@Skill:g", "@Skill:g".length, contexts)
    const bareMention = findActiveSkillMention("@go", "@go".length, contexts)

    expect(colonMention?.matches.map((item) => item.value)).toContain("gongkao-smoke-test-skill")
    expect(colonMention?.matches.map((item) => item.value)).toContain("gongkao-source-verifier")
    expect(bareMention?.matches.map((item) => item.value)).toEqual(
      colonMention?.matches.map((item) => item.value),
    )
  })

  it("narrows skill suggestions enough for tab completion", () => {
    const contexts = buildMaterialContextEntities([
      { id: "gongkao-smoke-test-skill", name: "Skill 运行冒烟测试", triggers: ["运行自检"] },
      { id: "gongkao-source-verifier", name: "来源校验", triggers: ["来源校验"] },
    ])

    const mention = findActiveSkillMention("@Skill.gongkao-sm", "@Skill.gongkao-sm".length, contexts)

    expect(mention?.matches.map((item) => item.value)).toEqual(["gongkao-smoke-test-skill"])
  })

  it("deduplicates payload refs", () => {
    const payload = buildMaterialContextPayload(
      parseMaterialMentions("@题型:对策题 @题型:对策题 @标签:基层治理", DEFAULT_MATERIAL_CONTEXTS),
    )

    expect(payload.questionTypes).toEqual(["对策题"])
    expect(payload.tags).toEqual(["基层治理"])
  })
})

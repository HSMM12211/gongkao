import { describe, expect, it } from "vitest"
import {
  BUILTIN_MATERIAL_SKILLS,
  getMaterialSkillDefinition,
  normalizeSkillInputValues,
  validateSkillExecution,
} from "@/lib/agent/skill-inputs"

describe("material skill inputs", () => {
  it("ships official material workflow definitions", () => {
    expect(BUILTIN_MATERIAL_SKILLS.map((skill) => skill.id)).toContain("gongkao-hotspot-collector")
    expect(BUILTIN_MATERIAL_SKILLS.map((skill) => skill.id)).toContain("gongkao-smoke-test-skill")
    expect(getMaterialSkillDefinition("gongkao-hotspot-collector")?.outputs).toContain("金句")
  })

  it("hydrates defaults for structured inputs", () => {
    const skill = getMaterialSkillDefinition("gongkao-hotspot-collector")
    expect(skill).toBeTruthy()

    const values = normalizeSkillInputValues(skill!, { topic: "基层治理" })

    expect(values.topic).toBe("基层治理")
    expect(values.date_range).toBe("近30天")
    expect(values.outputs).toEqual(["专题摘要", "金句", "温故卡", "申论题"])
  })

  it("validates required inputs", () => {
    const skill = getMaterialSkillDefinition("gongkao-hotspot-collector")
    expect(skill).toBeTruthy()

    const result = validateSkillExecution(skill!, {}, ["streaming", "fileRead", "fileWrite", "structuredOutput"])

    expect(result.ok).toBe(false)
    expect(result.errors).toContain("请填写：主题")
  })

  it("blocks restricted external skills that request ungranted permissions", () => {
    const skill = {
      ...getMaterialSkillDefinition("gongkao-hotspot-collector")!,
      source: "external" as const,
      trust: "restricted" as const,
      requiredPermissions: ["network", "fileWrite"] as const,
    }

    const result = validateSkillExecution(
      skill,
      { topic: "数字乡村" },
      ["streaming", "fileRead", "fileWrite", "structuredOutput"],
    )

    expect(result.ok).toBe(false)
    expect(result.errors).toContain("外部 Skill 需要额外授权：network、fileWrite")
  })
})

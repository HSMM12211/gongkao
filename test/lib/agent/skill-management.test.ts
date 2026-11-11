import { describe, expect, it } from "vitest"

import { normalizeManagedSkill, validateManagedSkillBeforeRun, validateSkillManifestInput } from "@/lib/agent/skill-management"

describe("skill management", () => {
  it("normalizes missing management fields conservatively", () => {
    const skill = normalizeManagedSkill({
      id: "external-web-collector",
      name: "external-web-collector",
      description: "External collector",
      path: "C:/skills/external-web-collector",
      triggers: [],
      requiredPermissions: ["network", "subprocess"],
    })

    expect(skill.source).toBe("external")
    expect(skill.trust).toBe("blocked")
    expect(skill.enabled).toBe(false)
    expect(skill.validationStatus).toBe("unknown")
  })

  it("blocks disabled or blocked skills before execution", () => {
    const errors = validateManagedSkillBeforeRun({
      id: "external-web-collector",
      name: "external-web-collector",
      description: "External collector",
      path: "C:/skills/external-web-collector",
      triggers: [],
      source: "external",
      trust: "blocked",
      enabled: false,
      inputs: [],
      outputs: [],
      requiredCapabilities: [],
      requiredPermissions: ["network"],
      validationStatus: "unknown",
      validationErrors: [],
    })

    expect(errors).toContain("Skill 已禁用")
    expect(errors).toContain("Skill 已被阻止")
  })

  it("validates user skill manifest input", () => {
    const errors = validateSkillManifestInput({
      id: "Invalid ID",
      name: "",
      description: "",
      source: "user-local",
      trust: "restricted",
      enabled: false,
      inputs: [],
      outputs: [],
      requiredCapabilities: [],
      requiredPermissions: [],
      skillMarkdown: "# Missing frontmatter",
    })

    expect(errors).toContain("Skill 名称不能为空")
    expect(errors).toContain("Skill 描述不能为空")
    expect(errors.some((error) => error.includes("Skill ID"))).toBe(true)
    expect(errors.some((error) => error.includes("SKILL.md"))).toBe(true)
  })
})

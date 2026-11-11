import { existsSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import { BUILTIN_MATERIAL_SKILLS } from "@/lib/agent/skill-inputs"

describe("built-in material skill files", () => {
  it("ships a runnable SKILL.md for every built-in material skill shown in the UI", () => {
    const missingSkillFiles = BUILTIN_MATERIAL_SKILLS.map((skill) => ({
      id: skill.id,
      skillPath: path.join(process.cwd(), "skills", skill.id, "SKILL.md"),
    })).filter(({ skillPath }) => !existsSync(skillPath))

    expect(missingSkillFiles).toEqual([])
  })
})

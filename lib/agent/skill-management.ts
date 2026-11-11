import type { ManagedSkillInfo, SkillManifestInput } from "@/types/agent-runtime"

const RISKY_PERMISSIONS = new Set(["network", "subprocess"])

type MinimalSkill = Partial<ManagedSkillInfo> & Pick<ManagedSkillInfo, "id" | "name" | "description" | "path" | "triggers">

export function normalizeManagedSkill(skill: MinimalSkill): ManagedSkillInfo {
  const hasRiskyPermission = (skill.requiredPermissions ?? []).some((permission) => RISKY_PERMISSIONS.has(permission))
  const source = skill.source ?? (hasRiskyPermission ? "external" : "user-local")
  const trust = skill.trust ?? (source === "external" ? "blocked" : "restricted")

  return {
    ...skill,
    source,
    trust,
    enabled: skill.enabled ?? trust !== "blocked",
    validationStatus: skill.validationStatus ?? "unknown",
    validationErrors: skill.validationErrors ?? [],
    inputs: skill.inputs ?? [],
    outputs: skill.outputs ?? [],
    requiredCapabilities: skill.requiredCapabilities ?? [],
    requiredPermissions: skill.requiredPermissions ?? [],
  }
}

export function validateManagedSkillBeforeRun(skill: ManagedSkillInfo): string[] {
  const errors: string[] = []
  if (!skill.enabled) errors.push("Skill 已禁用")
  if (skill.trust === "blocked") errors.push("Skill 已被阻止")
  if (skill.validationStatus === "invalid") errors.push("Skill 校验未通过")
  return errors
}

export function validateSkillManifestInput(input: SkillManifestInput): string[] {
  const errors: string[] = []
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(input.id)) {
    errors.push("Skill ID 必须是 2-63 位小写字母、数字或短横线")
  }
  if (!input.name.trim()) errors.push("Skill 名称不能为空")
  if (!input.description.trim()) errors.push("Skill 描述不能为空")
  if (!input.skillMarkdown.includes("---")) errors.push("SKILL.md 必须包含 YAML frontmatter")
  return errors
}

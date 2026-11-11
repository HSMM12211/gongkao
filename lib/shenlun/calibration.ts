import type { CalibrationSnapshot, ShenlunDiagnosis, ShenlunIssueTag } from "@/lib/shenlun/types"

export function buildCalibrationSnapshot({
  diagnoses,
  periodStart,
  periodEnd,
  now,
}: {
  diagnoses: ShenlunDiagnosis[]
  periodStart: string
  periodEnd: string
  now: string
}): CalibrationSnapshot {
  const counts = new Map<ShenlunIssueTag, number>()
  let totalTags = 0
  for (const diagnosis of diagnoses) {
    for (const tag of diagnosis.issueTags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
      totalTags += 1
    }
  }

  const topIssueTags = Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count, ratio: totalTags === 0 ? 0 : count / totalTags }))
    .sort((a, b) => b.count - a.count)

  return {
    id: crypto.randomUUID(),
    createdAt: now,
    periodStart,
    periodEnd,
    abilityScores: {
      readingExtraction: scoreFromMissing(topIssueTags, "wrong_material_location"),
      summary: scoreFromMissing(topIssueTags, "inaccurate_summary"),
      analysis: 72,
      countermeasure: scoreFromMissing(topIssueTags, "empty_countermeasure"),
      documentFormat: 72,
      essayIdeation: 70,
      formalExpression: scoreFromMissing(topIssueTags, "colloquial_expression"),
      timeControl: scoreFromMissing(topIssueTags, "time_allocation_failed"),
    },
    topIssueTags,
    nextTrainingAdvice: buildAdvice(topIssueTags),
  }
}

function scoreFromMissing(topIssueTags: Array<{ tag: ShenlunIssueTag; ratio: number }>, tag: ShenlunIssueTag): number {
  const ratio = topIssueTags.find((item) => item.tag === tag)?.ratio ?? 0
  return Math.max(40, Math.round(85 - ratio * 60))
}

function buildAdvice(topIssueTags: Array<{ tag: ShenlunIssueTag; count: number }>): string[] {
  const advice: string[] = []
  if (topIssueTags.some((item) => item.tag === "empty_countermeasure")) {
    advice.push("优先完成 1 道对策题限时训练，要求每条对策包含主体、动作、路径和落点。")
  }
  if (topIssueTags.some((item) => item.tag === "missing_points")) {
    advice.push("复盘材料定位，把每个评分要点回到原文对应段落，补齐遗漏信息。")
  }
  if (topIssueTags.some((item) => item.tag === "time_allocation_failed")) {
    advice.push("进行一次五阶段时间感训练，重点压缩读材料和列提纲时间。")
  }
  if (topIssueTags.some((item) => item.tag === "colloquial_expression")) {
    advice.push("把口语表达改写为规范申论表达，并同步沉淀到字帖导出舱。")
  }
  if (advice.length === 0) advice.push("保持每周至少 3 次申论训练，并持续沉淀规范表达。")
  return advice
}

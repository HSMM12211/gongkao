import { describe, expect, it } from "vitest"

import {
  buildMaterialComposerContextGroups,
  type ParsedMaterialMention,
} from "@/lib/agent/context-mentions"

describe("material composer context groups", () => {
  it("groups known context mentions by composer display kind", () => {
    const known = [
      mention("skill:gongkao-hotspot-collector", "skill", "热点采集器", "@Skill:热点采集器"),
      mention("topic:digital-village", "topic", "数字乡村", "@专题:数字乡村"),
      mention("source:people", "source", "人民网", "@来源:人民网"),
    ]

    const groups = buildMaterialComposerContextGroups({ known, unknown: [] })

    expect(groups.map((group) => group.kind)).toEqual(["skill", "topic", "source"])
    expect(groups[0]?.label).toBe("Skill")
    expect(groups[1]?.items.map((item) => item.label)).toEqual(["数字乡村"])
  })

  it("keeps unknown mentions as warning chips without mixing them into known groups", () => {
    const groups = buildMaterialComposerContextGroups({
      known: [mention("tag:governance", "tag", "基层治理", "@标签:基层治理")],
      unknown: ["@未知上下文"],
    })

    expect(groups).toHaveLength(1)
    expect(groups[0]?.kind).toBe("tag")
    expect(groups[0]?.items).toHaveLength(1)
  })
})

function mention(
  id: ParsedMaterialMention["id"],
  kind: ParsedMaterialMention["kind"],
  label: string,
  token: string,
): ParsedMaterialMention {
  return {
    id,
    kind,
    label,
    aliases: [label],
    value: label,
    token,
  }
}

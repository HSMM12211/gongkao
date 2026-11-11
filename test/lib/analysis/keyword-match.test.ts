import { describe, expect, it } from "vitest"
import { scoreKeywords } from "@/lib/analysis/keyword-match"

describe("scoreKeywords", () => {
  it("counts exact keyword hits and misses", () => {
    const result = scoreKeywords("要夯实基础设施，提升数字素养。", [
      "夯实基础设施",
      "提升数字素养",
      "打破数据壁垒",
    ])

    expect(result.hitCount).toBe(2)
    expect(result.keywordCount).toBe(3)
    expect(result.hits).toEqual(["夯实基础设施", "提升数字素养"])
    expect(result.misses).toEqual(["打破数据壁垒"])
    expect(result.ratio).toBeCloseTo(2 / 3)
  })
})

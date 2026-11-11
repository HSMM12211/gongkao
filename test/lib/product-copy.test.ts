import { describe, expect, it } from "vitest"
import { ABOUT_MOTTO } from "@/lib/product-copy"

describe("product copy", () => {
  it("uses a romantic motto in the about card", () => {
    expect(ABOUT_MOTTO).toContain("此心光明")
    expect(ABOUT_MOTTO).toContain("我们顶峰相见")
    expect(ABOUT_MOTTO).not.toContain("Electron + React")
  })
})

import { describe, expect, it } from "vitest"
import { COPYBOOK_FONT_OPTIONS, getCopybookFontClass } from "@/lib/copybook-fonts"

describe("copybook fonts", () => {
  it("includes civil-service copybook font choices", () => {
    expect(COPYBOOK_FONT_OPTIONS.map((option) => option.label)).toEqual([
      "标准正楷",
      "硬笔行楷",
      "硬笔正楷",
      "温润文楷",
    ])
    expect(getCopybookFontClass("zhengkai")).toBe("font-zhengkai")
    expect(getCopybookFontClass("wenkai")).toBe("font-wenkai")
  })
})

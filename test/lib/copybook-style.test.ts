import { describe, expect, it } from "vitest"
import { getTraceTextStyle } from "@/lib/copybook-style"

describe("copybook trace text style", () => {
  it("gives the stroke slider a visibly thinner low end", () => {
    const hairline = getTraceTextStyle(0.35, 0)
    const normal = getTraceTextStyle(0.35, 2)
    const heavy = getTraceTextStyle(0.35, 6)

    expect(hairline.fontWeight).toBeLessThan(normal.fontWeight)
    expect(hairline.opacity).toBe(0.35)
    expect(normal.opacity).toBe(0.35)
    expect(heavy.opacity).toBe(0.35)
    expect(hairline.fontSize).toBe("20pt")
    expect(normal.fontSize).toBe("21pt")
    expect(hairline.WebkitTextStrokeWidth).toBe("0px")
    expect(normal.WebkitTextStrokeWidth).toBe("0px")
    expect(heavy.WebkitTextStrokeWidth).not.toBe("0px")
  })
})

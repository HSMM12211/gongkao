import { describe, expect, it } from "vitest"
import { chunkMaterialText, cleanMaterialText } from "@/lib/material/text"

describe("material text helpers", () => {
  it("normalizes whitespace, page numbers, and repeated blank lines", () => {
    const cleaned = cleanMaterialText("  第 1 页 \n\n推进数字乡村建设  \n  需要多措并举。\n\n\n- 2 -")

    expect(cleaned).toBe("推进数字乡村建设\n需要多措并举。")
  })

  it("chunks text with stable indexes", () => {
    const chunks = chunkMaterialText("一".repeat(12), 5)

    expect(chunks).toEqual([
      { index: 0, text: "一".repeat(5) },
      { index: 1, text: "一".repeat(5) },
      { index: 2, text: "一".repeat(2) },
    ])
  })
})

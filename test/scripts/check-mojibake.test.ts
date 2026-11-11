import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { findMojibakeFindings } from "../../scripts/check-mojibake.mjs"

const tempRoots: string[] = []
const mojibakeWaitReview = `Inbox ${String.fromCodePoint(0x5bf0, 0x546d, 0xe175, 0x93cd, 0xffe0)}`
const mojibakePattern = String.fromCodePoint(0x5bf0, 0x546d)

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })))
  tempRoots.length = 0
})

describe("check-mojibake", () => {
  it("flags common mojibake fragments in source files", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "gongkao-mojibake-"))
    tempRoots.push(root)
    await writeFile(path.join(root, "bad.ts"), `export const label = "${mojibakeWaitReview}";\n`, "utf8")

    const findings = await findMojibakeFindings({ root, include: ["**/*.ts"] })

    expect(findings).toEqual([
      expect.objectContaining({
        file: "bad.ts",
        line: 1,
        pattern: mojibakePattern,
      }),
    ])
  })

  it("ignores valid Chinese and excluded generated folders", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "gongkao-mojibake-"))
    tempRoots.push(root)
    await writeFile(path.join(root, "good.ts"), 'export const label = "Inbox 待审核";\n', "utf8")

    const findings = await findMojibakeFindings({ root, include: ["**/*.ts"] })

    expect(findings).toEqual([])
  })
})

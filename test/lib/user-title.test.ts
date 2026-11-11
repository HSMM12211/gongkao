import { describe, expect, it } from "vitest"
import { buildFutureOfficialName } from "@/lib/user-title"

describe("future official title", () => {
  it("names users as future surname plus official title", () => {
    expect(buildFutureOfficialName("陈", "局长")).toBe("未来陈局长")
    expect(buildFutureOfficialName("李", "处长")).toBe("未来李处长")
    expect(buildFutureOfficialName("王", "省委书记")).toBe("未来王省委书记")
  })
})

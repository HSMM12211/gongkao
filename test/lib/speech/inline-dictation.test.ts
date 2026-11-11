import { describe, expect, it } from "vitest"

import { appendDictationText, getDictationButtonLabel, previewDictationText } from "@/lib/speech/inline-dictation"

describe("inline dictation helpers", () => {
  it("appends finalized speech with the configured separator", () => {
    expect(appendDictationText("完善基础设施", "推进数据共享", "；")).toBe("完善基础设施；推进数据共享")
  })

  it("does not add duplicate text when speech is empty", () => {
    expect(appendDictationText("已有作答", "   ", "；")).toBe("已有作答")
  })

  it("shows partial speech in the text box without committing it", () => {
    expect(previewDictationText("已有作答", "正在识别", "；")).toBe("已有作答；正在识别")
  })

  it("uses a concise recording button label", () => {
    expect(getDictationButtonLabel({ recording: false, processing: false })).toBe("语音输入文字")
    expect(getDictationButtonLabel({ recording: true, processing: false })).toBe("停止语音输入")
    expect(getDictationButtonLabel({ recording: false, processing: true })).toBe("正在识别")
  })
})

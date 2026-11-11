export const COPYBOOK_FONT_OPTIONS = [
  { value: "kai", label: "标准正楷", className: "font-kai" },
  { value: "xingkai", label: "硬笔行楷", className: "font-xingkai" },
  { value: "zhengkai", label: "硬笔正楷", className: "font-zhengkai" },
  { value: "wenkai", label: "温润文楷", className: "font-wenkai" },
] as const

export type CopybookFontMode = (typeof COPYBOOK_FONT_OPTIONS)[number]["value"]

export function getCopybookFontClass(font: CopybookFontMode) {
  return COPYBOOK_FONT_OPTIONS.find((option) => option.value === font)?.className ?? "font-kai"
}

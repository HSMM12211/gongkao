export function appendDictationText(previous: string, next: string, separator = "") {
  const transcript = next.trim()
  if (!transcript) return previous
  if (!previous.trim()) return transcript
  return `${previous}${separator}${transcript}`
}

export function previewDictationText(previous: string, partial: string, separator = "") {
  return appendDictationText(previous, partial, separator)
}

export function getDictationButtonLabel({
  recording,
  processing,
}: {
  recording: boolean
  processing: boolean
}) {
  if (processing) return "正在识别"
  return recording ? "停止语音输入" : "语音输入文字"
}

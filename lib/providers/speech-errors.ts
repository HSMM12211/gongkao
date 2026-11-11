function formatSpeechErrorMessage(message: string, fallback: string) {
  const trimmed = message.trim()
  if (!trimmed) return fallback

  if (
    trimmed.includes("os error 10060") ||
    trimmed.includes("连接方在一段时间后没有正确答复") ||
    trimmed.includes("连接的主机没有反应")
  ) {
    return `语音识别连接超时：ASR 服务没有响应。请先在系统设置里确认语音识别模式、Endpoint 和网络/代理可用，再点击“测试连接”。原始错误：${trimmed}`
  }

  return trimmed
}

export function getSpeechErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return formatSpeechErrorMessage(error.message, fallback)
  if (typeof error === "string" && error.trim()) return formatSpeechErrorMessage(error, fallback)

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>
    if (typeof record.message === "string" && record.message.trim()) return formatSpeechErrorMessage(record.message, fallback)
    if (typeof record.error === "string" && record.error.trim()) return formatSpeechErrorMessage(record.error, fallback)
    if (typeof record.code === "string" && record.code.trim()) return formatSpeechErrorMessage(record.code, fallback)
  }

  return fallback
}

export function isLocalSpeechUnavailableInBrowser(mode: string, desktopAvailable: boolean) {
  return mode === "local" && !desktopAvailable
}

export const LOCAL_SPEECH_DESKTOP_REQUIRED_MESSAGE =
  "本地语音识别需要在桌面应用中使用；请打开桌面版，并在系统设置中下载、选择一个本地 ASR 模型。"

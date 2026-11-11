import type { SpeechProviderSettings } from "@/lib/storage/schema"
import type { SpeechTranscriptionRequest, TranscriptionResult } from "@/lib/providers/types"

export const SPEECH_STREAM_CHUNK_MS = 200
export const VOLC_ASR_ENDPOINT = "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async"
export const DEFAULT_VOLC_ASR_RESOURCE_ID = "volc.seedasr.sauc.duration"
export const VOLC_ASR_DESKTOP_BRIDGE_ERROR = "火山官方 ASR 需要桌面应用中转"
const VOLC_ASR_SUPPORTED_PATHS = new Set([
  "/api/v3/sauc/bigmodel",
  "/api/v3/sauc/bigmodel_async",
  "/api/v3/sauc/bigmodel_nostream",
])

export type SpeechTransportKind = "http-upload" | "websocket-relay" | "volc-official"

export type WebSocketRelayStartMessage = {
  type: "start"
  provider: "volc-bigasr-relay"
  apiKey: string
  seedText: string
  mimeType: string
  chunkMs: number
}

export type SpeechRelaySession = {
  sendChunk: (chunk: Blob) => Promise<void>
  finish: () => Promise<TranscriptionResult>
  abort: () => void
}

export type SpeechConnectionTestResult = {
  ok: true
  message: string
  transportKind: "mock" | "http-upload" | "websocket-relay"
}

type SpeechProvider = "api" | "local"

type SpeechRelaySessionOptions = {
  endpoint: string
  apiKey: string
  seedText: string
  provider: SpeechProvider
  mimeType: string
  chunkMs?: number
  timeoutMs?: number
}

type SpeechConnectionTestOptions = {
  fetchImpl?: typeof fetch
  webSocketCtor?: typeof WebSocket
  timeoutMs?: number
}

export async function transcribeWithMock(seedText: string): Promise<TranscriptionResult> {
  return {
    text: seedText,
    provider: "mock",
    durationMs: 0,
  }
}

function parseEndpoint(endpoint: string) {
  try {
    return new URL(endpoint.trim())
  } catch {
    throw new Error("语音识别 Endpoint 不是有效 URL")
  }
}

function isVolcOfficialHost(hostname: string) {
  return hostname === "openspeech.bytedance.com" || hostname.endsWith(".openspeech.bytedance.com")
}

export function normalizeVolcAsrEndpoint(endpoint: string) {
  const value = endpoint.trim() || VOLC_ASR_ENDPOINT
  const url = parseEndpoint(value)

  if (url.protocol !== "wss:" || !isVolcOfficialHost(url.hostname)) {
    throw new Error(`火山官方 ASR Endpoint 必须使用官方 wss 地址：${VOLC_ASR_ENDPOINT}`)
  }

  if (!VOLC_ASR_SUPPORTED_PATHS.has(url.pathname)) {
    throw new Error(`火山官方 ASR Endpoint 路径无效，请使用：${VOLC_ASR_ENDPOINT}`)
  }

  return value
}

export function getSpeechTransportKind(endpoint: string): SpeechTransportKind {
  const url = parseEndpoint(endpoint)

  if ((url.protocol === "ws:" || url.protocol === "wss:") && isVolcOfficialHost(url.hostname)) {
    return "volc-official"
  }

  if (url.protocol === "ws:" || url.protocol === "wss:") {
    return "websocket-relay"
  }

  if (url.protocol === "http:" || url.protocol === "https:") {
    return "http-upload"
  }

  throw new Error("语音识别 Endpoint 仅支持 http(s) 上传或 ws(s) 中转")
}

export function assertSupportedSpeechEndpoint(endpoint: string): SpeechTransportKind {
  return getSpeechTransportKind(endpoint)
}

function getSpeechConnectionEndpoint(settings: SpeechProviderSettings) {
  return settings.mode === "local" ? settings.localEndpoint.trim() : settings.apiEndpoint.trim()
}

export function buildWebSocketRelayStartMessage({
  apiKey,
  seedText,
  mimeType,
  chunkMs,
}: {
  apiKey: string
  seedText: string
  mimeType: string
  chunkMs: number
}): WebSocketRelayStartMessage {
  return {
    type: "start",
    provider: "volc-bigasr-relay",
    apiKey,
    seedText,
    mimeType,
    chunkMs,
  }
}

export function extractTranscriptionText(data: unknown): string | undefined {
  if (typeof data === "string") return data.trim() ? data : undefined
  if (!data || typeof data !== "object") return undefined

  const record = data as Record<string, unknown>
  for (const key of ["text", "transcript", "result_text"]) {
    if (typeof record[key] === "string") return record[key]
  }

  for (const key of ["result", "data"]) {
    const nested = extractTranscriptionText(record[key])
    if (nested) return nested
  }

  for (const value of Object.values(record)) {
    if (!Array.isArray(value)) continue
    for (const item of value) {
      const nested = extractTranscriptionText(item)
      if (nested) return nested
    }
  }

  return undefined
}

async function testHttpSpeechEndpoint(
  endpoint: string,
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<SpeechConnectionTestResult> {
  const res = await fetchImpl(endpoint, {
    method: "HEAD",
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
  })

  if (res.ok || res.status === 405) {
    return {
      ok: true,
      message: res.status === 405 ? "语音识别服务可达，但不支持 HEAD；录音上传时会使用 POST" : "语音识别服务连接成功",
      transportKind: "http-upload",
    }
  }

  if (res.status === 401 || res.status === 403) {
    throw new Error(`语音识别服务已响应，但鉴权失败：${res.status}`)
  }

  throw new Error(`语音识别服务已响应，但状态异常：${res.status}`)
}

function testWebSocketSpeechEndpoint(
  endpoint: string,
  webSocketCtor: typeof WebSocket,
  timeoutMs: number,
): Promise<SpeechConnectionTestResult> {
  return new Promise((resolve, reject) => {
    const socket = new webSocketCtor(endpoint)
    const timer = setTimeout(() => {
      socket.close()
      reject(new Error("语音识别 WebSocket 中转连接超时"))
    }, timeoutMs)

    socket.onopen = () => {
      clearTimeout(timer)
      socket.close()
      resolve({
        ok: true,
        message: "语音识别 WebSocket 中转连接成功",
        transportKind: "websocket-relay",
      })
    }

    socket.onerror = () => {
      clearTimeout(timer)
      reject(new Error("语音识别 WebSocket 中转连接失败"))
    }

    socket.onclose = () => {
      clearTimeout(timer)
    }
  })
}

export async function testSpeechConnection(
  settings: SpeechProviderSettings,
  options: SpeechConnectionTestOptions = {},
): Promise<SpeechConnectionTestResult> {
  if (settings.mode === "mock") {
    return {
      ok: true,
      message: "模拟识别可用",
      transportKind: "mock",
    }
  }

  const endpoint =
    settings.mode === "api"
      ? normalizeVolcAsrEndpoint(settings.apiEndpoint)
      : getSpeechConnectionEndpoint(settings)
  const transportKind = assertSupportedSpeechEndpoint(endpoint)

  if (transportKind === "http-upload") {
    const fetchImpl = options.fetchImpl ?? fetch
    return testHttpSpeechEndpoint(endpoint, settings.mode === "api" ? settings.apiKey : "", fetchImpl)
  }

  const webSocketCtor = options.webSocketCtor ?? WebSocket
  return testWebSocketSpeechEndpoint(endpoint, webSocketCtor, options.timeoutMs ?? 5_000)
}

function parseRelayPayload(payload: unknown) {
  if (typeof payload !== "string") return payload

  try {
    return JSON.parse(payload) as unknown
  } catch {
    return { text: payload }
  }
}

function isFinalRelayPayload(data: unknown) {
  if (!data || typeof data !== "object") return false
  const record = data as Record<string, unknown>
  return (
    record.type === "final" ||
    record.type === "done" ||
    record.status === "final" ||
    record.final === true ||
    record.isFinal === true ||
    record.done === true
  )
}

function extractRelayError(data: unknown) {
  if (!data || typeof data !== "object") return undefined
  const record = data as Record<string, unknown>
  if (record.type === "error" && typeof record.message === "string") return record.message
  if (typeof record.error === "string") return record.error
  if (record.error && typeof record.error === "object") {
    const error = record.error as Record<string, unknown>
    if (typeof error.message === "string") return error.message
  }
  return undefined
}

export function createSpeechRelaySession({
  endpoint,
  apiKey,
  seedText,
  provider,
  mimeType,
  chunkMs = SPEECH_STREAM_CHUNK_MS,
  timeoutMs = 30_000,
}: SpeechRelaySessionOptions): SpeechRelaySession {
  if (typeof WebSocket === "undefined") {
    throw new Error("当前环境不支持 WebSocket 语音中转")
  }

  assertSupportedSpeechEndpoint(endpoint)

  const startedAt = performance.now()
  const socket = new WebSocket(endpoint)
  const queuedChunks: Blob[] = []
  let opened = false
  let completed = false
  let latestText = ""
  let finishTimer: ReturnType<typeof setTimeout> | undefined

  let resolveOpen: () => void
  let rejectOpen: (error: Error) => void
  const openPromise = new Promise<void>((resolve, reject) => {
    resolveOpen = resolve
    rejectOpen = reject
  })
  void openPromise.catch(() => undefined)

  let resolveResult: (result: TranscriptionResult) => void
  let rejectResult: (error: Error) => void
  const resultPromise = new Promise<TranscriptionResult>((resolve, reject) => {
    resolveResult = resolve
    rejectResult = reject
  })
  void resultPromise.catch(() => undefined)

  const clearFinishTimer = () => {
    if (finishTimer) clearTimeout(finishTimer)
    finishTimer = undefined
  }

  const complete = (text = latestText) => {
    if (completed) return
    completed = true
    clearFinishTimer()
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close()
    }
    resolveResult({
      text,
      provider,
      durationMs: Math.round(performance.now() - startedAt),
    })
  }

  const fail = (error: Error) => {
    if (completed) return
    completed = true
    clearFinishTimer()
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close()
    }
    if (!opened) rejectOpen(error)
    rejectResult(error)
  }

  const sendJson = (data: unknown) => {
    socket.send(JSON.stringify(data))
  }

  const flushQueuedChunks = () => {
    while (queuedChunks.length > 0) {
      const chunk = queuedChunks.shift()
      if (chunk) socket.send(chunk)
    }
  }

  socket.onopen = () => {
    try {
      sendJson(buildWebSocketRelayStartMessage({ apiKey, seedText, mimeType, chunkMs }))
      opened = true
      flushQueuedChunks()
      resolveOpen()
    } catch (error) {
      fail(error instanceof Error ? error : new Error("语音识别 WebSocket 中转启动失败"))
    }
  }

  socket.onmessage = (event) => {
    const data = parseRelayPayload(event.data)
    const relayError = extractRelayError(data)
    if (relayError) {
      fail(new Error(relayError))
      return
    }

    const text = extractTranscriptionText(data)
    if (text) latestText = text
    if (isFinalRelayPayload(data)) complete(text)
  }

  socket.onerror = () => {
    fail(new Error("语音识别 WebSocket 中转连接失败"))
  }

  socket.onclose = (event) => {
    if (completed) return
    if (latestText.trim()) {
      complete(latestText)
      return
    }
    const reason = event.reason ? `：${event.reason}` : ""
    fail(new Error(`语音识别 WebSocket 中转已关闭，未返回文本${reason}`))
  }

  return {
    sendChunk: async (chunk: Blob) => {
      if (completed || chunk.size === 0) return
      if (!opened) {
        queuedChunks.push(chunk)
        await openPromise
        return
      }
      socket.send(chunk)
    },
    finish: async () => {
      await openPromise
      if (!completed && socket.readyState === WebSocket.OPEN) {
        sendJson({ type: "end" })
      }
      finishTimer =
        finishTimer ??
        setTimeout(() => {
          if (latestText.trim()) complete(latestText)
          else fail(new Error("语音识别 WebSocket 中转超时，未返回文本"))
        }, timeoutMs)
      return resultPromise
    },
    abort: () => {
      if (completed) return
      completed = true
      clearFinishTimer()
      socket.close()
      if (!opened) rejectOpen(new Error("语音识别已取消"))
      rejectResult(new Error("语音识别已取消"))
    },
  }
}

async function postAudio(
  audioBlob: Blob | undefined,
  endpoint: string,
  apiKey: string,
  provider: SpeechProvider,
): Promise<TranscriptionResult> {
  if (!audioBlob) {
    throw new Error("没有可转写的音频")
  }

  assertSupportedSpeechEndpoint(endpoint)

  const startedAt = performance.now()
  const form = new FormData()
  form.append("file", audioBlob, "speech.webm")

  const res = await fetch(endpoint, {
    method: "POST",
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
    body: form,
  })

  if (!res.ok) {
    throw new Error(`语音识别请求失败：${res.status}`)
  }

  const data = (await res.json()) as unknown
  const text = extractTranscriptionText(data)
  if (!text) {
    throw new Error("语音识别响应缺少 text 字段")
  }

  return {
    text,
    provider,
    durationMs: Math.round(performance.now() - startedAt),
  }
}

async function transcribeWithWebSocketRelay(
  audioBlob: Blob | undefined,
  endpoint: string,
  apiKey: string,
  provider: SpeechProvider,
  seedText: string,
): Promise<TranscriptionResult> {
  if (!audioBlob) {
    throw new Error("没有可转写的音频")
  }

  const session = createSpeechRelaySession({
    endpoint,
    apiKey,
    provider,
    seedText,
    mimeType: audioBlob.type || "audio/webm",
  })
  await session.sendChunk(audioBlob)
  return session.finish()
}

export async function transcribeSpeech(request: SpeechTranscriptionRequest): Promise<TranscriptionResult> {
  const { settings, seedText, audioBlob } = request

  if (settings.mode === "mock") {
    return transcribeWithMock(seedText)
  }

  if (settings.mode === "api") {
    normalizeVolcAsrEndpoint(settings.apiEndpoint)
    throw new Error(VOLC_ASR_DESKTOP_BRIDGE_ERROR)
  }

  const kind = assertSupportedSpeechEndpoint(settings.localEndpoint)
  if (kind === "websocket-relay") {
    return transcribeWithWebSocketRelay(audioBlob, settings.localEndpoint, "", "local", seedText)
  }
  return postAudio(audioBlob, settings.localEndpoint, "", "local")
}

export function getSpeechEndpoint(settings: SpeechProviderSettings) {
  if (settings.mode === "api") return normalizeVolcAsrEndpoint(settings.apiEndpoint)
  return settings.localEndpoint.trim()
}

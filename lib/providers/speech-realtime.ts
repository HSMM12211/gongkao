import type { LocalSpeechEngine } from "@/lib/storage/schema"

export type RealtimeSpeechState = "idle" | "connecting" | "recording" | "processing" | "error"

export type RealtimeSpeechServerMessage =
  | { type: "ready"; engine: string; sampleRate: number }
  | { type: "partial"; text: string }
  | { type: "final"; text: string }
  | { type: "refined"; text: string }
  | { type: "error"; message: string }

export type RealtimeStartMessage = ReturnType<typeof buildRealtimeStartMessage>

export type RealtimeSpeechSession = {
  open: () => Promise<void>
  sendAudio: (audio: ArrayBuffer) => Promise<void>
  stop: () => void
  close: () => void
}

export function buildRealtimeStartMessage({
  sessionId,
  engine,
  language,
  sampleRate,
  chunkMs,
  modelPath,
}: {
  sessionId: string
  engine: LocalSpeechEngine
  language: string
  sampleRate: number
  chunkMs: number
  modelPath: string
}) {
  return {
    type: "start" as const,
    sessionId,
    engine: engine === "vosk-streaming" ? "vosk" : engine,
    language,
    sampleRate,
    chunkMs,
    modelPath,
  }
}

export function parseRealtimeSpeechMessage(payload: unknown): RealtimeSpeechServerMessage {
  const data = typeof payload === "string" ? JSON.parse(payload) : payload
  if (!data || typeof data !== "object") throw new Error("实时语音服务返回了无效消息")

  const record = data as Record<string, unknown>
  if (record.type === "ready" && typeof record.engine === "string" && typeof record.sampleRate === "number") {
    return { type: "ready", engine: record.engine, sampleRate: record.sampleRate }
  }

  if (
    (record.type === "partial" || record.type === "final" || record.type === "refined") &&
    typeof record.text === "string"
  ) {
    return { type: record.type, text: record.text }
  }

  if (record.type === "error" && typeof record.message === "string") {
    return { type: "error", message: record.message }
  }

  throw new Error("实时语音服务返回了未知消息")
}

export function createRealtimeSpeechSession({
  endpoint,
  startMessage,
  onReady,
  onPartial,
  onFinal,
  onRefined,
  onError,
  onClose,
  webSocketCtor = WebSocket,
}: {
  endpoint: string
  startMessage: RealtimeStartMessage
  onReady?: () => void
  onPartial?: (text: string) => void
  onFinal?: (text: string) => void
  onRefined?: (text: string) => void
  onError?: (error: Error) => void
  onClose?: () => void
  webSocketCtor?: typeof WebSocket
}): RealtimeSpeechSession {
  const socket = new webSocketCtor(endpoint)
  let opened = false
  let closed = false

  const openPromise = new Promise<void>((resolve, reject) => {
    socket.onopen = () => {
      opened = true
      socket.send(JSON.stringify(startMessage))
      resolve()
    }

    socket.onerror = () => {
      const error = new Error("实时语音本地服务连接失败")
      if (!opened) reject(error)
      onError?.(error)
    }
  })

  void openPromise.catch(() => undefined)

  socket.onmessage = (event) => {
    try {
      const message = parseRealtimeSpeechMessage(event.data)
      if (message.type === "ready") onReady?.()
      if (message.type === "partial") onPartial?.(message.text)
      if (message.type === "final") onFinal?.(message.text)
      if (message.type === "refined") onRefined?.(message.text)
      if (message.type === "error") onError?.(new Error(message.message))
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error("实时语音消息解析失败"))
    }
  }

  socket.onclose = () => {
    closed = true
    onClose?.()
  }

  return {
    open: () => openPromise,
    sendAudio: async (audio: ArrayBuffer) => {
      await openPromise
      if (closed || audio.byteLength === 0) return
      if (socket.readyState === webSocketCtor.OPEN) socket.send(audio)
    },
    stop: () => {
      if (closed) return
      if (socket.readyState === webSocketCtor.OPEN) {
        socket.send(JSON.stringify({ type: "stop", sessionId: startMessage.sessionId }))
      }
    },
    close: () => {
      if (closed) return
      socket.close()
    },
  }
}

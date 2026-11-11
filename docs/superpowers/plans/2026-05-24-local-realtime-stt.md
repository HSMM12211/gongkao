# Local Realtime STT Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将本项目“本地服务”语音识别升级为应用内置的零配置离线实时语音录入：用户只需要在设置中切换到“本地服务”，应用自动启动本地识别能力，并在温故和演练页面提供实时转文字。

**Architecture:** “本地服务”不是让用户手动填写地址，而是应用托管的本地 STT runtime。保留当前 Next.js 渲染层，新增本地 STT sidecar 作为浏览器和离线模型之间的边界；桌面壳阶段由 Electron/Tauri 主进程自动启动、健康检查和守护 sidecar，渲染层只读取“本地服务是否可用”的状态。浏览器端采集麦克风并转换为 16 kHz mono PCM，通过内部默认 WebSocket 发送给本地 runtime；runtime 先用 Vosk 提供真实 partial/final 流式结果，后续可选接 whisper.cpp/faster-whisper 做停止后的高质量二次精修。

**Tech Stack:** Next.js 16, React 19, TypeScript, Web Audio API, AudioWorklet, internal WebSocket transport, app-managed local STT runtime, Python `websockets` + `vosk` sidecar for MVP, future Electron/Tauri process manager, optional whisper.cpp/faster-whisper refinement, Vitest.

---

## 0. Decision

当前迁移计划建议第一版使用 whisper.cpp “录音结束后识别”。但用户现在明确希望参考 [Handy](https://github.com/cjpais/Handy) 做实时语音录入，所以本项目应调整为：

1. **MVP 本地实时录入：Vosk streaming**
   - 优先满足低延迟 partial/final。
   - 适合“智能温故”短句脱口而出和“演练”口述思路。
   - 缺点是中文自然口述准确率需要实测。

2. **增强版高质量修正：Whisper refinement**
   - 停止录音后，把本次音频交给 whisper.cpp 或 faster-whisper 重新识别。
   - 若精修文本更完整，则替换本次 final 或作为“建议修正”。
   - 不阻塞第一阶段实时录入。

3. **不做的事**
   - 不做全局输入法。
   - 不向外部软件输入文字。
   - 不长期保存录音。
   - 不让浏览器直接执行本地二进制。

4. **产品规则：本地服务必须零配置**
   - 普通用户不需要填写 endpoint。
   - 普通用户不需要选择模型路径。
   - 普通用户不需要理解 Vosk、Whisper 或 Python 服务。
   - 切换到“本地服务”后，应用自动准备本地语音识别。
   - 设置页只显示状态：`准备中 / 可用 / 未安装模型 / 启动失败`。
   - endpoint、模型路径、端口号只放在“高级诊断”里，默认隐藏。

Important constraint:

```text
纯浏览器/localhost 页面不能自动启动本地二进制或 Python 模型服务。
要做到参考源项目那样“打开应用即可离线转文字”，必须由桌面宿主进程负责启动本地 STT runtime。
当前 Next.js 开发模式可以先用 dev sidecar 验证语音链路，但最终产品不能要求用户手动启动 sidecar。
```

## 1. Current Project Map

当前语音链路已经有基础：

- `app/settings/page.tsx`
  - 语音识别配置入口。
  - 当前支持 `mock`、`api`、`local`，并已有“测试连接”按钮。

- `lib/storage/schema.ts`
  - `SpeechProviderSettings` 目前只有 `mode/apiEndpoint/apiKey/localEndpoint`。

- `lib/providers/settings.ts`
  - 负责默认语音设置、字段显示、校验和保存。

- `lib/providers/speech.ts`
  - 负责 mock、HTTP 上传、WebSocket 中转。
  - 当前 WebSocket 协议偏“上传音频后等待最终文本”，没有 first-class partial/final 流式状态。

- `hooks/use-speech-transcription.ts`
  - 用 `MediaRecorder` 按 200ms 分片。
  - 对实时本地 STT 不够理想，因为本地 Vosk 更适合接收 16 kHz mono PCM。

- `app/practice/page.tsx`
  - `VoicePanel` 现在是“按住录音，松开识别”。
  - 需要新增实时 partial 展示，并把 final 追加进作答。

- `app/review/page.tsx`
  - 空格按住录音。
  - 需要新增实时 partial 展示，并把 final 追加进温故输入。

## 2. Target UX

### Settings

语音识别模式选择为“本地服务”时，普通界面只展示状态，不展示连接配置：

- 状态徽标：`准备中`、`本地识别可用`、`正在启动`、`模型缺失`、`启动失败`
- 操作按钮：`检查本地识别`、`重新启动本地识别`
- 简短说明：`本地服务将在应用内自动启动，无需填写 API Key 或连接地址。`
- 高级诊断折叠区：默认关闭，开发和排错时才展示 internal endpoint、model path、port、engine。

Default internal values:

```text
engine: vosk-streaming
realtime endpoint: ws://127.0.0.1:8787/stt
model path: app-managed bundled model directory
sample rate: 16000
chunk size: 200ms
```

### Practice

“完整口述 / 大纲口述”里：

- 点击或按住开始录入。
- 录入中展示 partial 文本。
- final 文本自动追加到作答框。
- partial 不直接写入最终 answer，避免闪烁或重复。
- 停止后如果有 whisper refinement，则显示“正在精修识别文本”，完成后替换本次 final 或提示采用。

### Review

“语音口述”里：

- 按住空格开始，松开停止。
- 录入中展示 partial 文本。
- final 用 `；` 拼接到当前温故输入。
- 关键词匹配仍然基于最终输入文本。

## 3. Local STT Protocol

本项目统一使用一个本地 WebSocket 协议，避免 UI 绑定具体模型库。这个 endpoint 是应用内部约定，不作为普通用户配置项。

Internal endpoint:

```text
ws://127.0.0.1:8787/stt
```

Client control messages:

```json
{ "type": "start", "sessionId": "uuid", "engine": "vosk", "language": "zh-CN", "sampleRate": 16000, "chunkMs": 200, "modelPath": "models/vosk-model-small-cn-0.22" }
```

```json
{ "type": "stop", "sessionId": "uuid" }
```

```json
{ "type": "ping" }
```

Client audio frames:

```text
Binary WebSocket frame containing pcm_s16le mono 16 kHz audio bytes.
```

Server messages:

```json
{ "type": "ready", "engine": "vosk", "sampleRate": 16000 }
```

```json
{ "type": "partial", "text": "推进数字" }
```

```json
{ "type": "final", "text": "推进数字乡村建设要夯实基础设施。" }
```

```json
{ "type": "refined", "text": "推进数字乡村建设，要夯实基础设施。" }
```

```json
{ "type": "error", "message": "模型文件不存在" }
```

Design rules:

- 控制帧用 JSON。
- 音频帧用二进制，不用 base64。
- `partial` 只用于临时显示。
- `final` 才写入作答状态。
- `refined` 是可选增强，不作为 MVP 阻塞项。

## 4. File Structure

### Create

- `lib/audio/pcm.ts`
  - Float32 音频转 16-bit PCM。
  - 降采样到 16 kHz。
  - 合并 200ms PCM 分片。

- `public/worklets/pcm-recorder.worklet.js`
  - AudioWorkletProcessor。
  - 从麦克风音频流读取 Float32 chunk。
  - postMessage 给 React hook。

- `lib/providers/speech-realtime.ts`
  - 本地实时 STT WebSocket 协议类型。
  - `createRealtimeSpeechSession()`。
  - `parseRealtimeSpeechMessage()`。
  - `testRealtimeSpeechConnection()`。

- `hooks/use-realtime-speech-input.ts`
  - 管理麦克风权限、AudioContext、worklet、WebSocket session。
  - 暴露 `partialText/finalText/state/error/start/stop/cancel`。

- `tools/local-stt-service/README.md`
  - 本地 STT sidecar 启动说明。

- `tools/local-stt-service/requirements.txt`
  - Python sidecar 的最小依赖。

- `tools/local-stt-service/server.py`
  - MVP Vosk WebSocket 服务。
  - 接收 binary PCM，返回 partial/final。

- `lib/providers/local-speech-runtime.ts`
  - 渲染层读取本地 STT runtime 状态的统一接口。
  - 在纯浏览器开发模式下只做健康检查。
  - 在桌面宿主存在时调用宿主桥接能力自动启动/重启 runtime。

- `types/local-speech-runtime.ts`
  - 本地语音 runtime 状态、错误码、内部默认配置类型。

- `desktop/stt-runtime-manager.ts`
  - 桌面壳阶段新增。
  - 负责启动、健康检查、重启和退出时清理本地 STT sidecar。

- `test/lib/audio/pcm.test.ts`
  - PCM 工具函数测试。

- `test/lib/providers/speech-realtime.test.ts`
  - 协议解析和连接测试。

### Modify

- `lib/storage/schema.ts`
  - 扩展 `SpeechProviderSettings`。

- `lib/providers/settings.ts`
  - 新增本地实时默认值、normalize、字段控制、校验。
  - 普通设置只保存 `mode`，本地 endpoint/model path 只作为 internal defaults 或高级诊断值。

- `lib/providers/speech.ts`
  - 保留现有 HTTP/API 逻辑。
  - 不把实时协议塞进旧的最终识别函数。

- `app/settings/page.tsx`
  - 本地模式下展示状态卡，不展示 endpoint、模型路径、采样率、分片时长。
  - “检查本地识别”调用 runtime status/start，不要求用户配置连接。

- `app/practice/page.tsx`
  - VoicePanel 接入实时 partial/final。

- `app/review/page.tsx`
  - 空格录入接入实时 partial/final。

- `test/lib/providers/settings.test.ts`
  - 覆盖新设置字段、旧配置兼容和本地实时校验。

## 5. Tasks

### Task 1: Extend Speech Settings Model

**Files:**
- Modify: `lib/storage/schema.ts`
- Modify: `lib/providers/settings.ts`
- Test: `test/lib/providers/settings.test.ts`

- [ ] **Step 1: Add settings types**

Add these types to `lib/storage/schema.ts`:

```ts
export type LocalSpeechEngine = "vosk-streaming" | "whispercpp-batch" | "faster-whisper-http"

export type LocalSpeechRuntimeSettings = {
  managed: true
  engine: LocalSpeechEngine
  realtimeEndpoint: string
  httpEndpoint: string
  modelPath: string
  sampleRate: number
  chunkMs: number
  showAdvancedDiagnostics: boolean
}

export type SpeechProviderSettings = {
  mode: ProviderMode
  apiEndpoint: string
  apiKey: string
  // Legacy compatibility for old saved local settings. Do not expose this to normal users.
  localEndpoint: string
  localRuntime: LocalSpeechRuntimeSettings
}
```

- [ ] **Step 2: Add managed local realtime defaults**

Update `DEFAULT_SPEECH_SETTINGS` in `lib/providers/settings.ts`:

```ts
export const DEFAULT_SPEECH_SETTINGS: SpeechProviderSettings = {
  mode: "mock",
  apiEndpoint: "",
  apiKey: "",
  localEndpoint: "http://127.0.0.1:8001/transcribe",
  localRuntime: {
    managed: true,
    engine: "vosk-streaming",
    realtimeEndpoint: "ws://127.0.0.1:8787/stt",
    httpEndpoint: "http://127.0.0.1:8001/transcribe",
    modelPath: "models/vosk-model-small-cn-0.22",
    sampleRate: 16000,
    chunkMs: 200,
    showAdvancedDiagnostics: false,
  },
}
```

- [ ] **Step 3: Add legacy normalization**

Add a function in `lib/providers/settings.ts`:

```ts
export function normalizeSpeechSettings(value: Partial<SpeechProviderSettings> | null | undefined): SpeechProviderSettings {
  const legacy = value as (Partial<SpeechProviderSettings> & {
    localRealtimeEndpoint?: string
    localEngine?: LocalSpeechEngine
    localModelPath?: string
    sampleRate?: number
    chunkMs?: number
  }) | null | undefined

  return {
    ...DEFAULT_SPEECH_SETTINGS,
    ...(value ?? {}),
    localRuntime: {
      ...DEFAULT_SPEECH_SETTINGS.localRuntime,
      ...(value?.localRuntime ?? {}),
      engine: value?.localRuntime?.engine ?? legacy?.localEngine ?? DEFAULT_SPEECH_SETTINGS.localRuntime.engine,
      realtimeEndpoint:
        value?.localRuntime?.realtimeEndpoint ??
        legacy?.localRealtimeEndpoint ??
        DEFAULT_SPEECH_SETTINGS.localRuntime.realtimeEndpoint,
      modelPath: value?.localRuntime?.modelPath ?? legacy?.localModelPath ?? DEFAULT_SPEECH_SETTINGS.localRuntime.modelPath,
      sampleRate:
        value?.localRuntime?.sampleRate ??
        legacy?.sampleRate ??
        DEFAULT_SPEECH_SETTINGS.localRuntime.sampleRate,
      chunkMs: value?.localRuntime?.chunkMs ?? legacy?.chunkMs ?? DEFAULT_SPEECH_SETTINGS.localRuntime.chunkMs,
      showAdvancedDiagnostics: value?.localRuntime?.showAdvancedDiagnostics ?? false,
    },
  }
}
```

Update `loadSpeechSettings()`:

```ts
export async function loadSpeechSettings() {
  return normalizeSpeechSettings(await providerSettingsRepository.getSpeechSettings())
}
```

- [ ] **Step 4: Update field visibility**

Update `getSpeechSettingsFields(mode)`:

```ts
export function getSpeechSettingsFields(mode: ProviderMode) {
  return {
    apiEndpoint: mode === "api",
    apiKey: mode === "api",
    localStatus: mode === "local",
    localAdvancedDiagnostics: mode === "local",
    relayHint: mode === "api",
  }
}
```

- [ ] **Step 5: Add tests**

In `test/lib/providers/settings.test.ts`, add:

```ts
it("normalizes legacy speech settings with local realtime defaults", () => {
  expect(
    normalizeSpeechSettings({
      mode: "local",
      apiEndpoint: "",
      apiKey: "",
      localEndpoint: "http://127.0.0.1:8001/transcribe",
    }),
  ).toMatchObject({
    mode: "local",
    localRuntime: {
      managed: true,
      realtimeEndpoint: "ws://127.0.0.1:8787/stt",
      engine: "vosk-streaming",
      sampleRate: 16000,
      chunkMs: 200,
      showAdvancedDiagnostics: false,
    },
  })
})
```

- [ ] **Step 6: Verify**

Run:

```bash
npm run test -- test/lib/providers/settings.test.ts
npm run lint
```

Expected:

```text
settings tests pass
eslint exits 0
```

### Task 2: Add PCM Audio Utilities

**Files:**
- Create: `lib/audio/pcm.ts`
- Create: `test/lib/audio/pcm.test.ts`

- [ ] **Step 1: Write tests**

Create `test/lib/audio/pcm.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { downsampleFloat32, floatToPcm16 } from "@/lib/audio/pcm"

describe("pcm audio helpers", () => {
  it("converts float samples to signed 16-bit pcm", () => {
    const pcm = floatToPcm16(new Float32Array([-1, 0, 1]))
    expect([...pcm]).toEqual([-32768, 0, 32767])
  })

  it("downsamples by preserving approximate duration", () => {
    const input = new Float32Array(48_000).fill(0.25)
    const output = downsampleFloat32(input, 48_000, 16_000)
    expect(output.length).toBe(16_000)
    expect(output[0]).toBeCloseTo(0.25)
  })
})
```

- [ ] **Step 2: Implement helpers**

Create `lib/audio/pcm.ts`:

```ts
export function downsampleFloat32(input: Float32Array, inputSampleRate: number, outputSampleRate: number) {
  if (outputSampleRate === inputSampleRate) return input
  if (outputSampleRate > inputSampleRate) {
    throw new Error("Output sample rate cannot exceed input sample rate")
  }

  const ratio = inputSampleRate / outputSampleRate
  const outputLength = Math.floor(input.length / ratio)
  const output = new Float32Array(outputLength)

  for (let i = 0; i < outputLength; i++) {
    const start = Math.floor(i * ratio)
    const end = Math.min(Math.floor((i + 1) * ratio), input.length)
    let sum = 0
    for (let j = start; j < end; j++) sum += input[j] ?? 0
    output[i] = sum / Math.max(1, end - start)
  }

  return output
}

export function floatToPcm16(input: Float32Array) {
  const output = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    const sample = Math.max(-1, Math.min(1, input[i] ?? 0))
    output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
  }
  return output
}

export function pcm16ToArrayBuffer(input: Int16Array) {
  return input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength)
}
```

- [ ] **Step 3: Verify**

Run:

```bash
npm run test -- test/lib/audio/pcm.test.ts
```

Expected:

```text
pcm audio helpers tests pass
```

### Task 3: Add Realtime Speech Provider

**Files:**
- Create: `lib/providers/speech-realtime.ts`
- Test: `test/lib/providers/speech-realtime.test.ts`

- [ ] **Step 1: Write protocol tests**

Create `test/lib/providers/speech-realtime.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { buildRealtimeStartMessage, parseRealtimeSpeechMessage } from "@/lib/providers/speech-realtime"

describe("realtime speech protocol", () => {
  it("builds a local realtime start message", () => {
    expect(
      buildRealtimeStartMessage({
        sessionId: "abc",
        engine: "vosk-streaming",
        language: "zh-CN",
        sampleRate: 16000,
        chunkMs: 200,
        modelPath: "models/vosk-model-small-cn-0.22",
      }),
    ).toEqual({
      type: "start",
      sessionId: "abc",
      engine: "vosk",
      language: "zh-CN",
      sampleRate: 16000,
      chunkMs: 200,
      modelPath: "models/vosk-model-small-cn-0.22",
    })
  })

  it("parses partial and final server messages", () => {
    expect(parseRealtimeSpeechMessage(JSON.stringify({ type: "partial", text: "推进" }))).toEqual({
      type: "partial",
      text: "推进",
    })
    expect(parseRealtimeSpeechMessage(JSON.stringify({ type: "final", text: "推进治理现代化" }))).toEqual({
      type: "final",
      text: "推进治理现代化",
    })
  })
})
```

- [ ] **Step 2: Implement protocol helpers**

Create `lib/providers/speech-realtime.ts`:

```ts
import type { LocalSpeechEngine } from "@/lib/storage/schema"

export type RealtimeSpeechState = "idle" | "connecting" | "recording" | "processing" | "error"

export type RealtimeSpeechServerMessage =
  | { type: "ready"; engine: string; sampleRate: number }
  | { type: "partial"; text: string }
  | { type: "final"; text: string }
  | { type: "refined"; text: string }
  | { type: "error"; message: string }

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
```

- [ ] **Step 3: Add WebSocket session**

In the same file, add `createRealtimeSpeechSession()`:

```ts
export function createRealtimeSpeechSession({
  endpoint,
  startMessage,
  onReady,
  onPartial,
  onFinal,
  onRefined,
  onError,
  webSocketCtor = WebSocket,
}: {
  endpoint: string
  startMessage: ReturnType<typeof buildRealtimeStartMessage>
  onReady?: () => void
  onPartial?: (text: string) => void
  onFinal?: (text: string) => void
  onRefined?: (text: string) => void
  onError?: (error: Error) => void
  webSocketCtor?: typeof WebSocket
}) {
  const socket = new webSocketCtor(endpoint)
  const openPromise = new Promise<void>((resolve, reject) => {
    socket.onopen = () => {
      socket.send(JSON.stringify(startMessage))
      resolve()
    }
    socket.onerror = () => reject(new Error("实时语音本地服务连接失败"))
  })

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

  return {
    open: () => openPromise,
    sendAudio: async (audio: ArrayBuffer) => {
      await openPromise
      if (socket.readyState === WebSocket.OPEN) socket.send(audio)
    },
    stop: () => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "stop" }))
    },
    close: () => socket.close(),
  }
}
```

- [ ] **Step 4: Verify**

Run:

```bash
npm run test -- test/lib/providers/speech-realtime.test.ts
```

Expected:

```text
realtime speech protocol tests pass
```

### Task 4: Build App-Managed Local STT Runtime

**Files:**
- Create: `tools/local-stt-service/requirements.txt`
- Create: `tools/local-stt-service/server.py`
- Create: `tools/local-stt-service/README.md`
- Create: `types/local-speech-runtime.ts`
- Create: `lib/providers/local-speech-runtime.ts`
- Future desktop create: `desktop/stt-runtime-manager.ts`

- [ ] **Step 1: Add dependencies**

Create `tools/local-stt-service/requirements.txt`:

```text
websockets==12.0
vosk==0.3.45
```

- [ ] **Step 2: Implement WebSocket sidecar**

Create `tools/local-stt-service/server.py`:

```py
import asyncio
import json
import os
from websockets.server import serve
from vosk import Model, KaldiRecognizer

DEFAULT_MODEL_PATH = os.environ.get("VOSK_MODEL_PATH", "models/vosk-model-small-cn-0.22")
DEFAULT_SAMPLE_RATE = int(os.environ.get("STT_SAMPLE_RATE", "16000"))

async def handle_stt(websocket):
    recognizer = None
    sample_rate = DEFAULT_SAMPLE_RATE

    async for message in websocket:
        if isinstance(message, str):
            data = json.loads(message)

            if data.get("type") == "ping":
                await websocket.send(json.dumps({"type": "ready", "engine": "vosk", "sampleRate": sample_rate}, ensure_ascii=False))
                continue

            if data.get("type") == "start":
                sample_rate = int(data.get("sampleRate") or DEFAULT_SAMPLE_RATE)
                model_path = data.get("modelPath") or DEFAULT_MODEL_PATH
                if not os.path.isdir(model_path):
                    await websocket.send(json.dumps({"type": "error", "message": f"模型目录不存在: {model_path}"}, ensure_ascii=False))
                    continue
                model = Model(model_path)
                recognizer = KaldiRecognizer(model, sample_rate)
                recognizer.SetWords(True)
                await websocket.send(json.dumps({"type": "ready", "engine": "vosk", "sampleRate": sample_rate}, ensure_ascii=False))
                continue

            if data.get("type") == "stop":
                if recognizer:
                    result = json.loads(recognizer.FinalResult())
                    text = result.get("text", "").replace(" ", "")
                    if text:
                        await websocket.send(json.dumps({"type": "final", "text": text}, ensure_ascii=False))
                await websocket.close()
                return

        if isinstance(message, bytes) and recognizer:
            if recognizer.AcceptWaveform(message):
                result = json.loads(recognizer.Result())
                text = result.get("text", "").replace(" ", "")
                if text:
                    await websocket.send(json.dumps({"type": "final", "text": text}, ensure_ascii=False))
            else:
                partial = json.loads(recognizer.PartialResult()).get("partial", "").replace(" ", "")
                if partial:
                    await websocket.send(json.dumps({"type": "partial", "text": partial}, ensure_ascii=False))

async def main():
    async with serve(handle_stt, "127.0.0.1", 8787, max_size=None):
        print("Local STT service listening on ws://127.0.0.1:8787/stt")
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 3: Add sidecar README**

Create `tools/local-stt-service/README.md`:

````md
# Local STT Service

This development sidecar exposes local realtime speech recognition for the Next.js app.

This README is for development and packaging work only. Normal users must not be asked to start this service manually; the desktop host will start it automatically.

## Setup

```bash
cd tools/local-stt-service
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

Download a Chinese Vosk model and place it at:

```text
tools/local-stt-service/models/vosk-model-small-cn-0.22
```

## Run

```bash
python server.py
```

The app should use:

```text
ws://127.0.0.1:8787/stt
```
````

- [ ] **Step 4: Add runtime status types**

Create `types/local-speech-runtime.ts`:

```ts
export type LocalSpeechRuntimeStatus = "unknown" | "starting" | "ready" | "model-missing" | "failed"

export type LocalSpeechRuntimeHealth = {
  status: LocalSpeechRuntimeStatus
  endpoint: string
  engine: "vosk-streaming"
  message: string
}

export type LocalSpeechRuntimeBridge = {
  ensureStarted: () => Promise<LocalSpeechRuntimeHealth>
  restart: () => Promise<LocalSpeechRuntimeHealth>
  getHealth: () => Promise<LocalSpeechRuntimeHealth>
}
```

- [ ] **Step 5: Add renderer runtime facade**

Create `lib/providers/local-speech-runtime.ts`:

```ts
import type { LocalSpeechRuntimeBridge, LocalSpeechRuntimeHealth } from "@/types/local-speech-runtime"
import type { SpeechProviderSettings } from "@/lib/storage/schema"

declare global {
  interface Window {
    gongkaoLocalSpeech?: LocalSpeechRuntimeBridge
  }
}

export function getInternalLocalSpeechEndpoint(settings: SpeechProviderSettings) {
  return settings.localRuntime.realtimeEndpoint
}

export async function ensureLocalSpeechRuntime(settings: SpeechProviderSettings): Promise<LocalSpeechRuntimeHealth> {
  if (typeof window !== "undefined" && window.gongkaoLocalSpeech) {
    return window.gongkaoLocalSpeech.ensureStarted()
  }

  return probeLocalSpeechRuntime(settings)
}

export async function restartLocalSpeechRuntime(settings: SpeechProviderSettings): Promise<LocalSpeechRuntimeHealth> {
  if (typeof window !== "undefined" && window.gongkaoLocalSpeech) {
    return window.gongkaoLocalSpeech.restart()
  }

  return probeLocalSpeechRuntime(settings)
}

export function probeLocalSpeechRuntime(settings: SpeechProviderSettings): Promise<LocalSpeechRuntimeHealth> {
  const endpoint = getInternalLocalSpeechEndpoint(settings)

  return new Promise((resolve) => {
    const socket = new WebSocket(endpoint)
    const timer = window.setTimeout(() => {
      socket.close()
      resolve({
        status: "failed",
        endpoint,
        engine: "vosk-streaming",
        message: "本地语音识别尚未启动。桌面版会自动启动；开发模式需要运行本地 sidecar。",
      })
    }, 2_000)

    socket.onopen = () => {
      window.clearTimeout(timer)
      socket.send(JSON.stringify({ type: "ping" }))
    }

    socket.onmessage = () => {
      window.clearTimeout(timer)
      socket.close()
      resolve({
        status: "ready",
        endpoint,
        engine: "vosk-streaming",
        message: "本地语音识别可用",
      })
    }

    socket.onerror = () => {
      window.clearTimeout(timer)
      resolve({
        status: "failed",
        endpoint,
        engine: "vosk-streaming",
        message: "本地语音识别启动失败",
      })
    }
  })
}
```

- [ ] **Step 6: Add desktop runtime manager design**

When Electron/Tauri is introduced, create `desktop/stt-runtime-manager.ts` with these responsibilities:

```ts
export type SttRuntimeManager = {
  ensureStarted: () => Promise<LocalSpeechRuntimeHealth>
  restart: () => Promise<LocalSpeechRuntimeHealth>
  stop: () => Promise<void>
}
```

Rules:

- App startup calls `ensureStarted()` if saved speech mode is `local`.
- Switching settings to `local` calls `ensureStarted()` immediately.
- Renderer receives a bridge as `window.gongkaoLocalSpeech`.
- The manager starts the packaged STT service with bundled model path.
- The manager restarts the service if health check fails.
- The manager stops the child process on app exit.
- Endpoint and model path are never required from normal users.

- [ ] **Step 7: Manual sidecar verification**

Run:

```bash
cd tools/local-stt-service
python server.py
```

Expected:

```text
Local STT service listening on ws://127.0.0.1:8787/stt
```

### Task 5: Implement Realtime Speech Hook

**Files:**
- Create: `public/worklets/pcm-recorder.worklet.js`
- Create: `hooks/use-realtime-speech-input.ts`
- Modify: `hooks/use-speech-transcription.ts`

- [ ] **Step 1: Add worklet**

Create `public/worklets/pcm-recorder.worklet.js`:

```js
class PcmRecorderProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0]
    const channel = input && input[0]
    if (channel && channel.length > 0) {
      this.port.postMessage(channel.slice(0))
    }
    return true
  }
}

registerProcessor("pcm-recorder", PcmRecorderProcessor)
```

- [ ] **Step 2: Implement hook**

Create `hooks/use-realtime-speech-input.ts` with these responsibilities:

```ts
export type RealtimeSpeechInputResult = {
  state: "idle" | "connecting" | "recording" | "processing" | "error"
  recording: boolean
  partialText: string
  finalText: string
  error: string | null
  start: () => Promise<void>
  stop: () => Promise<string>
  cancel: () => void
}
```

Implementation details:

- Load settings with `loadSpeechSettings()`.
- Require `settings.mode === "local"` and `settings.localRuntime.engine === "vosk-streaming"`.
- Call `ensureLocalSpeechRuntime(settings)` before opening the microphone.
- If runtime status is not `ready`, show the runtime message and do not ask the user to fill endpoint/model fields.
- Open `navigator.mediaDevices.getUserMedia({ audio: true })`.
- Create `AudioContext`.
- Load `/worklets/pcm-recorder.worklet.js`.
- Convert Float32 chunks through `downsampleFloat32()` and `floatToPcm16()`.
- Send `pcm16ToArrayBuffer()` over `createRealtimeSpeechSession()`.
- Set `partialText` on `partial`.
- Accumulate final segments on `final`.
- On `stop()`, send stop, close stream tracks, return joined final text.

- [ ] **Step 3: Keep legacy hook as fallback**

Do not delete `use-speech-transcription.ts`. It remains responsible for:

- mock mode
- cloud API mode
- HTTP upload local mode
- non-streaming local mode

Realtime local UI can choose:

```ts
const useRealtime = speechSettings.mode === "local" && speechSettings.localRuntime.engine === "vosk-streaming"
```

- [ ] **Step 4: Manual hook verification**

In the desktop build, switch the app to local mode:

```text
Settings -> 语音识别 -> 本地服务
```

Expected:

```text
local runtime starts automatically
microphone permission prompt appears
partial text updates while speaking
final text appears after stop
```

Development-only note:

```text
In pure Next.js browser dev mode, automatic native process startup is not available. Use the development sidecar only to verify the transport, then wire the same runtime facade to Electron/Tauri.
```

### Task 6: Update Settings UI

**Files:**
- Modify: `app/settings/page.tsx`
- Modify: `lib/providers/settings.ts`
- Modify: `lib/providers/speech-realtime.ts`
- Modify: `lib/providers/local-speech-runtime.ts`

- [ ] **Step 1: Replace local connection fields with status card**

In the speech settings card, when `speechSettings.mode === "local"`, do not show endpoint, API key, model path, sample rate, or engine selector by default. Show:

```tsx
<div className="md:col-span-2 rounded-md border bg-muted/30 px-3 py-3 text-sm">
  <div className="flex items-center justify-between gap-3">
    <div>
      <div className="font-medium">本地离线识别</div>
      <div className="text-xs text-muted-foreground mt-1">
        切换到本地服务后，应用会自动启动离线语音识别，无需填写 API Key 或连接地址。
      </div>
    </div>
    <Badge variant={runtimeHealth.status === "ready" ? "secondary" : "outline"}>
      {runtimeHealth.message}
    </Badge>
  </div>
</div>
```

- [ ] **Step 2: Add local runtime actions**

Add buttons beside “保存语音设置”:

```tsx
<Button variant="outline" onClick={checkLocalRuntime} disabled={checkingLocalRuntime}>
  {checkingLocalRuntime ? "检查中..." : "检查本地识别"}
</Button>
<Button variant="outline" onClick={restartLocalRuntime} disabled={checkingLocalRuntime}>
  重新启动本地识别
</Button>
```

The actions must call `ensureLocalSpeechRuntime(speechSettings)` and `restartLocalSpeechRuntime(speechSettings)`.

- [ ] **Step 3: Add hidden advanced diagnostics**

If `speechSettings.localRuntime.showAdvancedDiagnostics` is true, show read-only diagnostic values:

```tsx
<div className="md:col-span-2 rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground">
  <div>内部引擎：{speechSettings.localRuntime.engine}</div>
  <div>内部端点：{speechSettings.localRuntime.realtimeEndpoint}</div>
  <div>模型目录：{speechSettings.localRuntime.modelPath}</div>
  <div>音频参数：{speechSettings.localRuntime.sampleRate} Hz / {speechSettings.localRuntime.chunkMs} ms</div>
</div>
```

- [ ] **Step 4: Update test connection**

Change `testSpeech()`:

```ts
const result =
  speechSettings.mode === "local"
    ? await ensureLocalSpeechRuntime(speechSettings)
    : await testSpeechConnection(speechSettings)
```

For local mode, show `result.message`.

- [ ] **Step 5: Add copy**

Replace the card description with:

```text
支持模拟、云端 API 和本地离线识别。本地服务由应用自动启动，普通用户无需填写连接地址。
```

- [ ] **Step 6: Browser QA**

Open:

```text
http://localhost:3000/settings
```

Expected:

```text
mock mode shows no endpoint
api mode shows API Endpoint and API Key
local mode shows runtime status only
local mode does not ask for endpoint, model path, sample rate, or engine
advanced diagnostics are hidden by default
```

### Task 7: Integrate Practice VoicePanel

**Files:**
- Modify: `app/practice/page.tsx`

- [ ] **Step 1: Add partial transcript UI**

Inside `VoicePanel`, render during recording:

```tsx
{partialText && (
  <div className="mt-3 max-w-xl rounded-md border bg-background px-3 py-2 text-sm leading-relaxed text-foreground">
    {partialText}
  </div>
)}
```

- [ ] **Step 2: Commit final text only**

For complete oral answer:

```ts
onTranscript((prev) => prev + finalText)
```

For outline answer:

```ts
onTranscript((prev) => (prev ? `${prev}\n` : "") + `· ${finalText}`)
```

- [ ] **Step 3: Prevent duplicate partial/final**

Rules:

- `partialText` never mutates `answer`.
- `finalText` mutates `answer` exactly once after stop.
- If stop returns empty text, show toast and do not append.

- [ ] **Step 4: Manual QA**

Open:

```text
http://localhost:3000/practice
```

Expected:

```text
complete voice mode displays live partial
stop appends final text once
outline mode prefixes final text with bullet
existing answer text is preserved
```

### Task 8: Integrate Review Voice Mode

**Files:**
- Modify: `app/review/page.tsx`

- [ ] **Step 1: Add realtime partial display**

In voice mode recording panel, show:

```tsx
{partialText && (
  <div className="mt-3 w-full max-w-xl rounded-md border bg-background px-3 py-2 text-sm leading-relaxed">
    {partialText}
  </div>
)}
```

- [ ] **Step 2: Append final text**

Keep existing separator behavior:

```ts
setInput((prev) => (prev ? `${prev}；${text}` : text))
```

- [ ] **Step 3: Keep keyboard ergonomics**

Rules:

- `Space keydown` starts recording only once when not repeating.
- `Space keyup` stops recording only if recording is active.
- Disable rapid duplicate starts during `connecting`.

- [ ] **Step 4: Manual QA**

Open:

```text
http://localhost:3000/review
```

Expected:

```text
space key starts local realtime recording
partial appears while speaking
keyup appends final text
keyword scoring updates after final text
```

### Task 9: Add Error Handling

**Files:**
- Modify: `hooks/use-realtime-speech-input.ts`
- Modify: `app/practice/page.tsx`
- Modify: `app/review/page.tsx`
- Modify: `app/settings/page.tsx`

- [ ] **Step 1: Handle microphone errors**

Map common errors:

```ts
function getMicrophoneErrorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === "NotAllowedError") return "麦克风权限被拒绝"
  if (error instanceof DOMException && error.name === "NotFoundError") return "未检测到麦克风设备"
  return error instanceof Error ? error.message : "麦克风启动失败"
}
```

- [ ] **Step 2: Handle local service down**

When WebSocket fails:

```text
本地离线识别启动失败，应用正在尝试重新启动。若仍不可用，请在设置页检查本地识别状态。
```

- [ ] **Step 3: Handle empty speech**

If `stop()` returns an empty string:

```text
未识别到有效语音，请靠近麦克风后重试
```

- [ ] **Step 4: Manual QA**

Test:

```text
sidecar not running
mic permission denied
record less than 1 second
silent audio
rapid click start/stop
switch page while recording
```

Expected:

```text
no answer text is lost
recording tracks are stopped
user sees actionable toast
normal users are not asked to fill endpoint or model path
```

### Task 10: Verification

**Files:**
- No new files.

- [ ] **Step 1: Unit tests**

Run:

```bash
npm run test -- test/lib/providers/settings.test.ts test/lib/providers/speech-realtime.test.ts test/lib/audio/pcm.test.ts
```

Expected:

```text
all selected tests pass
```

- [ ] **Step 2: Lint**

Run:

```bash
npm run lint
```

Expected:

```text
eslint exits 0
```

- [ ] **Step 3: Typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected:

```text
tsc exits 0
```

- [ ] **Step 4: Browser routes**

Verify:

```text
http://localhost:3000/settings
http://localhost:3000/practice
http://localhost:3000/review
```

Expected:

```text
settings local mode shows status-only zero-config UI
practice realtime partial/final works
review realtime partial/final works
```

## 6. Desktop Runtime Requirement

Zero-config local speech recognition cannot be completed as a pure browser-only feature. The browser can record audio and connect to a local WebSocket, but it cannot start a native STT binary or Python process. Therefore desktop runtime management is part of the product requirement, not a distant optional enhancement.

Desktop phase:

- Electron/Tauri main starts the packaged STT sidecar automatically.
- Main process owns model path discovery.
- Renderer receives only health status and an internal endpoint.
- App startup calls local speech `ensureStarted()` if saved mode is `local`.
- Switching settings to `local` triggers local speech `ensureStarted()` immediately.
- If sidecar exits, main process restarts it.
- Settings page status shows `准备中 / 本地识别可用 / 模型缺失 / 启动失败`。
- Normal users never need to start a local service manually.
- Normal users never need to fill endpoint, model path, port, sample rate, or engine.

Possible packaged engines:

- Vosk for true low-latency streaming.
- whisper.cpp for offline high-quality final recognition.
- faster-whisper only if accepting Python runtime packaging.

## 7. Self-Review

Spec coverage:

- 本地服务实时录入: covered by Tasks 3, 5, 7, 8.
- 本地服务零配置自动启动: covered by Tasks 1, 4, 5, 6 and Desktop Runtime Requirement.
- 参考 Handy 类桌面录入模式: covered by app-managed sidecar boundary and desktop runtime manager.
- 不覆盖外部软件全局输入: explicitly excluded.
- 当前项目嵌入点: covered by Settings, Practice, Review, provider and hook files.
- 可测试性: covered by Tasks 1, 2, 3, 10.

Risk notes:

- Browser cannot directly run local STT binaries; app-managed desktop runtime is mandatory for zero-config local mode.
- In Next.js browser dev mode, a manually started development sidecar is acceptable only for engineering verification.
- MediaRecorder WebM chunks are not ideal for Vosk realtime; Web Audio PCM is the correct MVP route.
- Vosk 中文准确率 must be tested with 公考口述语料; Whisper refinement remains the quality upgrade path.

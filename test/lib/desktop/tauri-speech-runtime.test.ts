import { describe, expect, it, vi } from "vitest"
import { createTauriSpeechRuntime, type TauriSpeechRuntimeApi } from "@/lib/desktop/tauri-speech-runtime"

describe("tauri speech runtime bridge", () => {
  it("delegates health and restart checks to tauri commands", async () => {
    const invoke = vi.fn(async (cmd: string) => {
      if (cmd === "stt_health") {
        return {
          status: "ready",
          endpoint: "tauri://local-stt",
          engine: "whisper-rs",
          message: "ready",
        }
      }

      if (cmd === "stt_restart") {
        return {
          status: "starting",
          endpoint: "tauri://local-stt",
          engine: "whisper-rs",
          message: "starting",
        }
      }

      throw new Error(`unexpected command: ${cmd}`)
    }) as TauriSpeechRuntimeApi["invoke"]

    const runtime = createTauriSpeechRuntime({ invoke })

    await expect(runtime.ensureStarted()).resolves.toMatchObject({
      status: "ready",
      engine: "whisper-rs",
    })
    await expect(runtime.restart()).resolves.toMatchObject({
      status: "starting",
    })
    expect(invoke).toHaveBeenNthCalledWith(1, "stt_health")
    expect(invoke).toHaveBeenNthCalledWith(2, "stt_restart")
  })

  it("calls microphone diagnostics command", async () => {
    const invoke = vi.fn(async () => ({
      status: "ready",
      message: "ok",
      devices: [],
    })) as TauriSpeechRuntimeApi["invoke"]

    const runtime = createTauriSpeechRuntime({ invoke })
    await runtime.listInputDevices()

    expect(invoke).toHaveBeenCalledWith("stt_list_input_devices")
  })

  it("opens microphone privacy settings through Tauri", async () => {
    const invoke = vi.fn(async () => undefined) as TauriSpeechRuntimeApi["invoke"]

    const runtime = createTauriSpeechRuntime({ invoke })
    await runtime.openMicrophonePrivacySettings()

    expect(invoke).toHaveBeenCalledWith("stt_open_microphone_privacy_settings")
  })

  it("tests official Volc ASR connection through Tauri", async () => {
    const invoke = vi.fn(async () => ({
      ok: true,
      message: "connected",
      requestId: "request-id",
      logId: "log-id",
    })) as TauriSpeechRuntimeApi["invoke"]

    const runtime = createTauriSpeechRuntime({ invoke })
    await runtime.testVolcAsrConnection({
      endpoint: "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async",
      apiKey: "token",
      resourceId: "volc.seedasr.sauc.duration",
    })

    expect(invoke).toHaveBeenCalledWith("stt_volc_test_connection", {
      endpoint: "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async",
      apiKey: "token",
      resourceId: "volc.seedasr.sauc.duration",
    })
  })

  it("forwards local ASR model management commands through Tauri", async () => {
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = []
    const invoke = vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
      calls.push({ cmd, args })
      if (cmd === "stt_list_models") return []
      return undefined
    }) as TauriSpeechRuntimeApi["invoke"]

    const runtime = createTauriSpeechRuntime({ invoke })
    await runtime.listLocalAsrModels()
    await runtime.downloadLocalAsrModel("sense-voice-int8")
    await runtime.cancelLocalAsrModelDownload("sense-voice-int8")
    await runtime.deleteLocalAsrModel("sense-voice-int8")
    await runtime.selectLocalAsrModel("sense-voice-int8")

    expect(calls).toEqual([
      { cmd: "stt_list_models", args: undefined },
      { cmd: "stt_download_model", args: { modelId: "sense-voice-int8" } },
      { cmd: "stt_cancel_model_download", args: { modelId: "sense-voice-int8" } },
      { cmd: "stt_delete_model", args: { modelId: "sense-voice-int8" } },
      { cmd: "stt_select_model", args: { modelId: "sense-voice-int8" } },
    ])
  })

  it("registers status and transcript listeners", async () => {
    const invoke = vi.fn() as TauriSpeechRuntimeApi["invoke"]
    const listen = vi.fn(async () => vi.fn()) as NonNullable<TauriSpeechRuntimeApi["listen"]>
    const runtime = createTauriSpeechRuntime({ invoke, listen })

    await runtime.onStatus(() => {})
    await runtime.onTranscript(() => {})

    expect(listen).toHaveBeenNthCalledWith(1, "stt://status", expect.any(Function))
    expect(listen).toHaveBeenNthCalledWith(2, "stt://transcript", expect.any(Function))
  })
})

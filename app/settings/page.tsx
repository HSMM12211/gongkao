"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, Bot, Check, CheckCircle2, Download, FileText, Loader2, Palette, RefreshCw, Settings, Trash2 } from "lucide-react"
import { displayAgentExecutor } from "@/lib/agent/executor-settings"
import { loadTauriAgentRuntime } from "@/lib/agent/material-run"
import { createTauriSpeechRuntime } from "@/lib/desktop/tauri-speech-runtime"
import {
  loadTauriMaterialParserRuntime,
  type MineruRuntimeStatus,
  type PdfSkillRuntimeStatus,
} from "@/lib/desktop/material-parser-runtime"
import { useRuntime } from "@/lib/runtime-store"
import { cn } from "@/lib/utils"
import { ABOUT_MOTTO } from "@/lib/product-copy"
import {
  ensureLocalSpeechRuntime,
  listLocalSpeechInputDevices,
  openLocalSpeechMicrophonePrivacySettings,
  restartLocalSpeechRuntime,
  saveLocalSpeechLastCaptureForDebug,
} from "@/lib/providers/local-speech-runtime"
import {
  DEFAULT_AI_SETTINGS,
  DEFAULT_SPEECH_SETTINGS,
  getSpeechSettingsFields,
  loadAiSettings,
  loadSpeechSettings,
  normalizeSpeechSettings,
  saveAiSettings,
  saveSpeechSettings,
} from "@/lib/providers/settings"
import {
  DEFAULT_VOLC_ASR_RESOURCE_ID,
  VOLC_ASR_DESKTOP_BRIDGE_ERROR,
  VOLC_ASR_ENDPOINT,
  normalizeVolcAsrEndpoint,
  testSpeechConnection,
} from "@/lib/providers/speech"
import type { AiProviderSettings, ProviderMode, SpeechProviderSettings } from "@/lib/storage/schema"
import type { DetectedAgentAdapter } from "@/types/agent-runtime"
import type {
  LocalAsrDownloadProgress,
  LocalAsrModelInfo,
  LocalSpeechMicrophoneDiagnostic,
  LocalSpeechRuntimeHealth,
} from "@/types/local-speech-runtime"
import { toast } from "sonner"

const PRESETS: { name: string; hex: string; desc: string }[] = [
  { name: "深墨青", hex: "#1f5f5b", desc: "默认政务公文色" },
  { name: "靛蓝", hex: "#2a4eb8", desc: "学院蓝" },
  { name: "沉稳灰", hex: "#334155", desc: "中性商务风" },
  { name: "公文红", hex: "#a8322c", desc: "传统政务红" },
  { name: "暖金", hex: "#b78a3a", desc: "稳重金棕" },
  { name: "墨黑", hex: "#1f2937", desc: "极简专注" },
]

const INITIAL_RUNTIME_HEALTH: LocalSpeechRuntimeHealth = {
  status: "unknown",
  endpoint: DEFAULT_SPEECH_SETTINGS.localRuntime.realtimeEndpoint,
  engine: "vosk-streaming",
  message: "未检测",
}

const VOLC_RESOURCE_OPTIONS = [
  { value: "volc.seedasr.sauc.duration", label: "豆包流式 2.0 小时版" },
  { value: "volc.seedasr.sauc.concurrent", label: "豆包流式 2.0 并发版" },
  { value: "volc.bigasr.sauc.duration", label: "豆包流式 1.0 小时版" },
  { value: "volc.bigasr.sauc.concurrent", label: "豆包流式 1.0 并发版" },
]

const LOCAL_ASR_ENGINE_LABELS: Record<LocalAsrModelInfo["engineType"], string> = {
  whisper: "Whisper",
  parakeet: "Parakeet",
  moonshine: "Moonshine",
  "moonshine-streaming": "Moonshine Streaming",
  "sense-voice": "SenseVoice",
  gigaam: "GigaAM",
  canary: "Canary",
  cohere: "Cohere",
}

function formatModelSize(model: LocalAsrModelInfo) {
  return `${model.sizeMb} MB`
}

function formatPartialSize(bytes: number) {
  if (!bytes) return "0 MB"
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatModelLanguages(model: LocalAsrModelInfo) {
  const values = model.supportedLanguages
  if (values.includes("zh-Hans") || values.includes("zh")) return "中文可用"
  if (values.length === 1) return values[0].toUpperCase()
  return `${values.length} 种语言`
}

function isTauriDesktopEnvironment() {
  if (typeof window === "undefined") return false
  return "__TAURI_INTERNALS__" in window || "__TAURI_IPC__" in window
}

async function loadDesktopRuntime() {
  const [{ invoke }, { listen }] = await Promise.all([
    import("@tauri-apps/api/core"),
    import("@tauri-apps/api/event"),
  ])
  return createTauriSpeechRuntime({ invoke, listen })
}

export default function SettingsPage() {
  const { themeColor, setThemeColor, agentExecutor } = useRuntime()
  const [hexInput, setHexInput] = useState(themeColor)
  const [speechSettings, setSpeechSettings] = useState<SpeechProviderSettings>(DEFAULT_SPEECH_SETTINGS)
  const [aiSettings, setAiSettings] = useState<AiProviderSettings>(DEFAULT_AI_SETTINGS)
  const [testingSpeech, setTestingSpeech] = useState(false)
  const [runtimeHealth, setRuntimeHealth] = useState<LocalSpeechRuntimeHealth>(INITIAL_RUNTIME_HEALTH)
  const [microphoneDiagnostic, setMicrophoneDiagnostic] = useState<LocalSpeechMicrophoneDiagnostic | null>(null)
  const [debugCapturePath, setDebugCapturePath] = useState<string | null>(null)
  const [localModels, setLocalModels] = useState<LocalAsrModelInfo[]>([])
  const [selectedLocalModel, setSelectedLocalModel] = useState<string | null>(null)
  const [modelProgress, setModelProgress] = useState<Record<string, LocalAsrDownloadProgress>>({})
  const [modelAction, setModelAction] = useState<Record<string, string>>({})
  const [detectedAgentAdapters, setDetectedAgentAdapters] = useState<DetectedAgentAdapter[]>([])
  const [agentChecking, setAgentChecking] = useState(false)
  const [pdfSkillStatus, setPdfSkillStatus] = useState<PdfSkillRuntimeStatus | null>(null)
  const [pdfSkillChecking, setPdfSkillChecking] = useState(false)
  const [mineruStatus, setMineruStatus] = useState<MineruRuntimeStatus | null>(null)
  const [mineruChecking, setMineruChecking] = useState(false)
  const [mineruInstalling, setMineruInstalling] = useState(false)
  const [mineruInstallLogs, setMineruInstallLogs] = useState<string[]>([])
  const speechFields = getSpeechSettingsFields(speechSettings.mode)

  useEffect(() => {
    void loadSpeechSettings().then((settings) => {
      setSpeechSettings(settings)
      if (settings.mode === "local") {
        void checkLocalRuntime(settings)
        void loadLocalAsrModels()
      }
    })
    void loadAiSettings().then(setAiSettings)
    void refreshAgentAdapters()
    void refreshPdfSkillStatus()
    void refreshMineruStatus()
  }, [])

  useEffect(() => {
    if (speechSettings.mode !== "local" || !isTauriDesktopEnvironment()) return

    let disposed = false
    const unlisteners: Array<() => void> = []
    void loadDesktopRuntime().then(async (runtime) => {
      if (disposed) return
      unlisteners.push(
        await runtime.onModelDownloadProgress((progress) => {
          setModelProgress((current) => ({ ...current, [progress.modelId]: progress }))
        }),
      )
      unlisteners.push(
        await runtime.onModelChanged(() => {
          void loadLocalAsrModels()
        }),
      )
    })

    return () => {
      disposed = true
      for (const unlisten of unlisteners) unlisten()
    }
  }, [speechSettings.mode])

  const applyHex = () => {
    if (/^#?[0-9a-fA-F]{6}$/.test(hexInput.trim())) {
      const value = hexInput.trim().startsWith("#") ? hexInput.trim() : `#${hexInput.trim()}`
      setThemeColor(value)
    }
  }

  const refreshMicrophoneDiagnostic = async () => {
    const diagnostic = await listLocalSpeechInputDevices()
    if (diagnostic) setMicrophoneDiagnostic(diagnostic)
    return diagnostic
  }

  const loadLocalAsrModels = async () => {
    if (!isTauriDesktopEnvironment()) return
    try {
      const runtime = await loadDesktopRuntime()
      const [models, selected] = await Promise.all([
        runtime.listLocalAsrModels(),
        runtime.getSelectedLocalAsrModel(),
      ])
      setLocalModels(models)
      setSelectedLocalModel(selected)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "本地 ASR 模型清单读取失败")
    }
  }

  const checkLocalRuntime = async (settings = speechSettings) => {
    setTestingSpeech(true)
    try {
      const [health] = await Promise.all([
        ensureLocalSpeechRuntime(settings),
        refreshMicrophoneDiagnostic().catch(() => null),
      ])
      setRuntimeHealth(health)
      if (health.status === "ready") toast.success(health.message)
      else toast.error(health.message)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "本地语音识别检查失败")
    } finally {
      setTestingSpeech(false)
    }
  }

  const restartRuntime = async () => {
    setTestingSpeech(true)
    try {
      const health = await restartLocalSpeechRuntime(speechSettings)
      setRuntimeHealth(health)
      await refreshMicrophoneDiagnostic().catch(() => null)
      if (health.status === "ready") toast.success(health.message)
      else toast.error(health.message)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "本地语音识别重启失败")
    } finally {
      setTestingSpeech(false)
    }
  }

  const runModelAction = async (
    modelId: string,
    action: string,
    task: (runtime: Awaited<ReturnType<typeof loadDesktopRuntime>>) => Promise<LocalSpeechRuntimeHealth | void>,
  ) => {
    setModelAction((current) => ({ ...current, [modelId]: action }))
    try {
      const runtime = await loadDesktopRuntime()
      const health = await task(runtime)
      if (health) setRuntimeHealth(health)
      await loadLocalAsrModels()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "本地 ASR 模型操作失败")
    } finally {
      setModelAction((current) => {
        const next = { ...current }
        delete next[modelId]
        return next
      })
    }
  }

  const testSpeech = async () => {
    setTestingSpeech(true)
    try {
      if (speechSettings.mode === "local") {
        await checkLocalRuntime()
        return
      }

      if (speechSettings.mode === "api") {
        if (!isTauriDesktopEnvironment()) {
          throw new Error(VOLC_ASR_DESKTOP_BRIDGE_ERROR)
        }
        const runtime = await loadDesktopRuntime()
        const result = await runtime.testVolcAsrConnection({
          endpoint: normalizeVolcAsrEndpoint(speechSettings.apiEndpoint),
          apiKey: speechSettings.apiKey,
          resourceId: speechSettings.volcResourceId || DEFAULT_VOLC_ASR_RESOURCE_ID,
        })
        toast.success(result.logId ? `${result.message} LogId: ${result.logId}` : result.message)
        return
      }

      const result = await testSpeechConnection(speechSettings)
      toast.success(result.message)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "语音识别连接测试失败")
    } finally {
      setTestingSpeech(false)
    }
  }

  const saveDebugCapture = async () => {
    try {
      const path = await saveLocalSpeechLastCaptureForDebug()
      if (!path) {
        toast.error("暂无可保存的录音诊断文件")
        return
      }
      setDebugCapturePath(path)
      toast.success("已保存最近一次录音诊断文件")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "录音诊断文件保存失败")
    }
  }

  const refreshAgentAdapters = async () => {
    setAgentChecking(true)
    try {
      const runtime = await loadTauriAgentRuntime()
      setDetectedAgentAdapters(await runtime.detectAdapters())
    } catch {
      setDetectedAgentAdapters([])
    } finally {
      setAgentChecking(false)
    }
  }

  const refreshPdfSkillStatus = async () => {
    if (!isTauriDesktopEnvironment()) return
    setPdfSkillChecking(true)
    try {
      const runtime = await loadTauriMaterialParserRuntime()
      const status = await runtime.getPdfSkillStatus()
      setPdfSkillStatus(status)
      if (!status.ready) toast.error(status.message || "Codex PDF Skill 未就绪")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Codex PDF Skill 状态检查失败")
      setPdfSkillStatus(null)
    } finally {
      setPdfSkillChecking(false)
    }
  }

  const refreshMineruStatus = async () => {
    if (!isTauriDesktopEnvironment()) return
    setMineruChecking(true)
    try {
      const runtime = await loadTauriMaterialParserRuntime()
      const status = await runtime.getMineruStatus()
      setMineruStatus(status)
      if (status.ready) toast.success("本地 PDF 解析引擎已就绪")
      else toast.error("本地 PDF 解析引擎未安装")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "MinerU 状态检查失败")
      setMineruStatus(null)
    } finally {
      setMineruChecking(false)
    }
  }

  const installMineruRuntime = async () => {
    if (!isTauriDesktopEnvironment()) return
    setMineruInstalling(true)
    setMineruInstallLogs([])
    try {
      const runtime = await loadTauriMaterialParserRuntime()
      const result = await runtime.installMineruRuntime({ useChinaMirror: true })
      setMineruStatus(result.status)
      setMineruInstallLogs(result.logs)
      if (result.status.ready) toast.success("MinerU 已安装并验证通过")
      else toast.error("MinerU 安装完成但验证未通过，请查看日志")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "MinerU 安装失败")
    } finally {
      setMineruInstalling(false)
    }
  }

  const changeSpeechMode = (mode: ProviderMode) => {
    const next = normalizeSpeechSettings({
      ...speechSettings,
      mode,
      apiEndpoint: mode === "api" ? VOLC_ASR_ENDPOINT : speechSettings.apiEndpoint,
      volcResourceId: speechSettings.volcResourceId || DEFAULT_VOLC_ASR_RESOURCE_ID,
    })
    setSpeechSettings(next)
    if (mode === "local") {
      void checkLocalRuntime(next)
      void loadLocalAsrModels()
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-5">
      <h1 className="text-2xl font-serif font-bold tracking-tight flex items-center gap-2">
        <Settings className="size-6 text-primary" /> 系统设置
      </h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="size-5 text-primary" />
            界面风格颜色
          </CardTitle>
          <CardDescription>自定义主品牌色，影响导航选中态、按钮和强调标识。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4 rounded-lg border bg-muted/40 px-4 py-3">
            <div
              className="size-12 rounded-full border shadow-inner"
              style={{ backgroundColor: themeColor }}
              aria-label="当前主题色"
            />
            <div className="flex-1">
              <div className="text-sm font-medium">当前主题色</div>
              <div className="text-xs text-muted-foreground font-mono mt-0.5">{themeColor.toUpperCase()}</div>
            </div>
          </div>

          <div>
            <div className="text-sm font-medium mb-3">预设方案</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {PRESETS.map((preset) => {
                const active = themeColor.toLowerCase() === preset.hex.toLowerCase()
                return (
                  <button
                    key={preset.hex}
                    type="button"
                    onClick={() => {
                      setThemeColor(preset.hex)
                      setHexInput(preset.hex)
                    }}
                    className={cn(
                      "group flex items-center gap-3 rounded-lg border p-3 text-left transition-all hover:border-primary/40 hover:shadow-sm",
                      active && "border-primary ring-2 ring-primary/20",
                    )}
                  >
                    <div
                      className="size-9 rounded-full border shrink-0 flex items-center justify-center"
                      style={{ backgroundColor: preset.hex }}
                    >
                      {active && <Check className="size-4 text-white" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{preset.name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{preset.desc}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <div className="text-sm font-medium mb-3">自定义颜色</div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="picker" className="text-xs text-muted-foreground">
                  色板选择
                </Label>
                <input
                  id="picker"
                  type="color"
                  value={themeColor}
                  onChange={(event) => {
                    setThemeColor(event.target.value)
                    setHexInput(event.target.value)
                  }}
                  className="h-10 w-16 cursor-pointer rounded-md border bg-transparent"
                />
              </div>
              <div className="space-y-1.5 flex-1 min-w-[180px]">
                <Label htmlFor="hex" className="text-xs text-muted-foreground">
                  HEX 色值
                </Label>
                <Input id="hex" value={hexInput} onChange={(event) => setHexInput(event.target.value)} />
              </div>
              <Button onClick={applyHex}>应用</Button>
              <Button
                variant="outline"
                onClick={() => {
                  setThemeColor("#1f5f5b")
                  setHexInput("#1f5f5b")
                }}
              >
                恢复默认
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>语音识别</CardTitle>
          <CardDescription>本地服务由桌面应用自动加载离线模型，普通用户不需要填写连接地址。</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">识别模式</Label>
            <Select value={speechSettings.mode} onValueChange={(mode) => changeSpeechMode(mode as ProviderMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mock">模拟识别</SelectItem>
                <SelectItem value="api">火山 ASR</SelectItem>
                <SelectItem value="local">本地服务</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {speechFields.apiEndpoint && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">火山 Endpoint</Label>
              <Input
                value={speechSettings.apiEndpoint}
                onChange={(event) => setSpeechSettings((settings) => ({ ...settings, apiEndpoint: event.target.value }))}
                placeholder={VOLC_ASR_ENDPOINT}
              />
            </div>
          )}
          {speechFields.apiKey && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">API Key</Label>
              <Input
                type="password"
                value={speechSettings.apiKey}
                onChange={(event) => setSpeechSettings((settings) => ({ ...settings, apiKey: event.target.value }))}
                placeholder="仅保存在本机"
              />
            </div>
          )}
          {speechFields.volcResourceId && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Resource ID</Label>
              <Select
                value={speechSettings.volcResourceId || DEFAULT_VOLC_ASR_RESOURCE_ID}
                onValueChange={(volcResourceId) => setSpeechSettings((settings) => ({ ...settings, volcResourceId }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VOLC_RESOURCE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {speechFields.localStatus && (
            <div className="md:col-span-2 rounded-md border bg-muted/30 px-3 py-3 text-sm space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium">本地离线语音识别</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    模型不再固定打进安装包，由用户下载并选择本地 ASR 模型后自动用于录音转文字。
                  </div>
                </div>
                <Badge variant={runtimeHealth.status === "ready" ? "secondary" : "outline"}>{runtimeHealth.message}</Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div>状态：{runtimeHealth.status}</div>
                <div>引擎：{runtimeHealth.engine}</div>
                <div>ASR 模型：{runtimeHealth.modelLabel ?? "未选择"}</div>
                <div>VAD：{runtimeHealth.vadLabel ?? "未加载"}</div>
                <div>麦克风：{microphoneDiagnostic?.defaultDevice?.label ?? microphoneDiagnostic?.message ?? "未检测"}</div>
                <div>上次延迟：{runtimeHealth.lastLatencyMs ? `${runtimeHealth.lastLatencyMs} ms` : "暂无"}</div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => checkLocalRuntime()} disabled={testingSpeech}>
                  {testingSpeech ? "测试中..." : "测试连接"}
                </Button>
                <Button variant="outline" size="sm" onClick={restartRuntime} disabled={testingSpeech}>
                  重启本地识别
                </Button>
                <Button variant="outline" size="sm" onClick={() => void refreshMicrophoneDiagnostic()} disabled={testingSpeech}>
                  刷新麦克风
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void openLocalSpeechMicrophonePrivacySettings()}
                  disabled={testingSpeech}
                >
                  麦克风权限
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setSpeechSettings((settings) => ({
                      ...settings,
                      localRuntime: {
                        ...settings.localRuntime,
                        showAdvancedDiagnostics: !settings.localRuntime.showAdvancedDiagnostics,
                      },
                    }))
                  }
                >
                  高级诊断
                </Button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-medium text-muted-foreground">本地 ASR 模型</div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void loadLocalAsrModels()}
                    disabled={testingSpeech}
                    className="h-7 px-2"
                  >
                    <RefreshCw className="mr-1 size-3.5" />
                    刷新
                  </Button>
                </div>

                <div className="space-y-2">
                  {localModels.map((model) => {
                    const progress = modelProgress[model.id]
                    const action = modelAction[model.id]
                    const isSelected = selectedLocalModel === model.id
                    const isBusy = Boolean(action) || model.isDownloading
                    return (
                      <div
                        key={model.id}
                        className="rounded-md border bg-background px-3 py-2 text-xs"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-medium text-sm">{model.name}</span>
                              <Badge variant={isSelected ? "secondary" : "outline"}>
                                {isSelected ? "当前使用" : LOCAL_ASR_ENGINE_LABELS[model.engineType]}
                              </Badge>
                              {model.isRecommended && <Badge variant="outline">推荐</Badge>}
                              {(model.supportedLanguages.includes("zh-Hans") || model.supportedLanguages.includes("zh")) && (
                                <Badge variant="outline">适合中文</Badge>
                              )}
                            </div>
                            <div className="mt-1 text-muted-foreground">
                              {model.description} · {formatModelSize(model)} · {formatModelLanguages(model)}
                              {model.partialSize > 0 && !model.isDownloaded ? ` · 已缓存 ${formatPartialSize(model.partialSize)}` : ""}
                            </div>
                          </div>

                          <div className="flex shrink-0 flex-wrap gap-1.5">
                            {!model.isDownloaded && !model.isDownloading && action !== "download" && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7"
                                disabled={isBusy}
                                onClick={() =>
                                  void runModelAction(model.id, "download", (runtime) =>
                                    runtime.downloadLocalAsrModel(model.id),
                                  )
                                }
                              >
                                <Download className="mr-1 size-3.5" />
                                下载
                              </Button>
                            )}
                            {(model.isDownloading || action === "download") && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7"
                                onClick={() =>
                                  void runModelAction(model.id, "cancel", (runtime) =>
                                    runtime.cancelLocalAsrModelDownload(model.id),
                                  )
                                }
                              >
                                取消
                              </Button>
                            )}
                            {model.isDownloaded && !isSelected && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7"
                                disabled={isBusy}
                                onClick={() =>
                                  void runModelAction(model.id, "select", (runtime) =>
                                    runtime.selectLocalAsrModel(model.id),
                                  )
                                }
                              >
                                使用
                              </Button>
                            )}
                            {model.isDownloaded && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-muted-foreground"
                                disabled={isBusy}
                                onClick={() =>
                                  void runModelAction(model.id, "delete", (runtime) =>
                                    runtime.deleteLocalAsrModel(model.id),
                                  )
                                }
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                        {(progress || action) && (
                          <div className="mt-2">
                            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-primary transition-all"
                                style={{ width: `${Math.min(100, Math.max(0, progress?.percentage ?? 8))}%` }}
                              />
                            </div>
                            <div className="mt-1 text-muted-foreground">
                              {action === "download"
                                ? `下载中 ${Math.round(progress?.percentage ?? 0)}%`
                                : action === "select"
                                  ? "正在加载模型"
                                  : action === "delete"
                                    ? "正在删除"
                                    : action === "cancel"
                                      ? "正在取消"
                                      : "处理中"}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {localModels.length === 0 && (
                    <div className="rounded-md border bg-background px-3 py-3 text-xs text-muted-foreground">
                      桌面端启动后会显示可下载模型。浏览器预览不支持直接管理本地模型。
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {speechFields.localAdvancedDiagnostics && speechSettings.localRuntime.showAdvancedDiagnostics && (
            <div className="md:col-span-2 rounded-md border bg-background px-3 py-2 text-xs leading-relaxed text-muted-foreground space-y-1">
              <div>内部端点：{runtimeHealth.endpoint}</div>
              <div>ASR 模型路径：{runtimeHealth.modelPath ?? "未加载"}</div>
              <div>VAD 路径：{runtimeHealth.vadPath ?? "未加载"}</div>
              <div>最近录音采样数：{runtimeHealth.lastCaptureSamples ?? "暂无"}</div>
              {debugCapturePath && <div>诊断文件：{debugCapturePath}</div>}
              <Button variant="outline" size="sm" onClick={saveDebugCapture}>
                保存最近录音诊断文件
              </Button>
            </div>
          )}

          {!speechFields.apiEndpoint && !speechFields.localStatus && (
            <div className="md:col-span-2 rounded-md border bg-muted/30 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              模拟识别不需要配置连接地址或 API Key，适合先体验录音流程。
            </div>
          )}

          {speechFields.relayHint && (
            <div className="md:col-span-2 text-xs text-muted-foreground leading-relaxed rounded-md border bg-muted/30 px-3 py-2">
              火山官方 ASR 由桌面端中转连接，支持新版控制台 X-Api-Key，并自动记录 RequestId / LogId 便于排错。
            </div>
          )}

          <div className="md:col-span-2 flex justify-end gap-2">
            {speechSettings.mode !== "local" && (
              <Button variant="outline" onClick={testSpeech} disabled={testingSpeech}>
                {testingSpeech ? "测试中..." : "测试连接"}
              </Button>
            )}
            <Button
              onClick={async () => {
                const errors = await saveSpeechSettings(speechSettings)
                if (errors.length) toast.error(errors[0])
                else {
                  toast.success("语音识别设置已保存")
                  if (speechSettings.mode === "local") {
                    void checkLocalRuntime()
                  }
                }
              }}
            >
              保存语音设置
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="size-5 text-primary" />
            本地文档解析 / Codex PDF Skill
          </CardTitle>
          <CardDescription>
            PDF 真题入库默认通过本地 Codex CLI 调用 $pdf skill，在隔离工作区输出结构化 JSON；MinerU 保留为备用解析器。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <PdfSkillSettingsCard
            status={pdfSkillStatus}
            checking={pdfSkillChecking}
            onRefresh={() => void refreshPdfSkillStatus()}
          />
          <MineruSettingsCard
            status={mineruStatus}
            checking={mineruChecking}
            installing={mineruInstalling}
            logs={mineruInstallLogs}
            onRefresh={() => void refreshMineruStatus()}
            onInstall={() => void installMineruRuntime()}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="size-5 text-primary" />
            素材 Agent 执行环境
          </CardTitle>
          <CardDescription>
            日常切换在顶部 Agent 菜单；这里显示 Codex CLI / Claude Code 的真实检测、路径、版本和排错信息。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border border-secondary/25 bg-secondary/10 p-3 text-sm text-secondary">
            当前选择：{displayAgentExecutor(agentExecutor)}
          </div>
          <Button variant="outline" onClick={refreshAgentAdapters} disabled={agentChecking}>
            {agentChecking ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            重新检测
          </Button>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(detectedAgentAdapters.length > 0
              ? detectedAgentAdapters
              : [
                  {
                    id: "codex",
                    name: "Codex CLI",
                    available: false,
                    authStatus: "unknown",
                    message: "桌面端启动后显示真实检测状态。",
                  },
                  {
                    id: "claude",
                    name: "Claude Code",
                    available: false,
                    authStatus: "unknown",
                    message: "桌面端启动后显示真实检测状态。",
                  },
                ] satisfies DetectedAgentAdapter[]
            ).map((adapter) => (
              <div key={adapter.id} className="rounded-md border bg-background p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">{adapter.name}</div>
                  <Badge variant={adapter.available ? "default" : "outline"}>
                    {adapter.available ? "可用" : "未检测到"}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-2 space-y-1">
                  <div>{adapter.version || "未读取版本"}</div>
                  <div>{adapter.path || "未读取路径"}</div>
                  <div>{adapter.message}</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI 精修</CardTitle>
          <CardDescription>支持模拟评分、OpenAI 兼容 API 和本地 Ollama/Qwen 服务。</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">诊断模式</Label>
            <Select value={aiSettings.mode} onValueChange={(mode) => setAiSettings((settings) => ({ ...settings, mode: mode as ProviderMode }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mock">模拟诊断</SelectItem>
                <SelectItem value="api">OpenAI 兼容 API</SelectItem>
                <SelectItem value="local">本地 Ollama</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">API Endpoint</Label>
            <Input
              value={aiSettings.apiEndpoint}
              onChange={(event) => setAiSettings((settings) => ({ ...settings, apiEndpoint: event.target.value }))}
              placeholder="https://api.example.com/v1/chat/completions"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">API Model</Label>
            <Input
              value={aiSettings.apiModel}
              onChange={(event) => setAiSettings((settings) => ({ ...settings, apiModel: event.target.value }))}
              placeholder="gpt-4.1-mini"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">API Key</Label>
            <Input
              type="password"
              value={aiSettings.apiKey}
              onChange={(event) => setAiSettings((settings) => ({ ...settings, apiKey: event.target.value }))}
              placeholder="仅保存在本机"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">本地服务 Endpoint</Label>
            <Input
              value={aiSettings.localEndpoint}
              onChange={(event) => setAiSettings((settings) => ({ ...settings, localEndpoint: event.target.value }))}
              placeholder="http://127.0.0.1:11434/api/chat"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">本地模型</Label>
            <Input
              value={aiSettings.localModel}
              onChange={(event) => setAiSettings((settings) => ({ ...settings, localModel: event.target.value }))}
              placeholder="qwen2.5"
            />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <Button
              onClick={async () => {
                const errors = await saveAiSettings(aiSettings)
                if (errors.length) toast.error(errors[0])
                else toast.success("AI 精修设置已保存")
              }}
            >
              保存 AI 设置
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>运行内核</CardTitle>
          <CardDescription>云端 / 本地双轨制可在顶栏一键切换。</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>云端轻量：DeepSeek / 兼容 API，联网使用。</p>
          <p>本地硬核：Ollama + 可下载选择的 Whisper / SenseVoice / Cohere 等离线语音识别。</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>关于</CardTitle>
          <CardDescription>申论 AI 智能修炼 · 桌面端 v1.0</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground leading-relaxed">{ABOUT_MOTTO}</CardContent>
      </Card>
    </div>
  )
}

function PdfSkillSettingsCard({
  status,
  checking,
  onRefresh,
}: {
  status: PdfSkillRuntimeStatus | null
  checking: boolean
  onRefresh: () => void
}) {
  const ready = status?.ready ?? false
  const checks = [
    { label: "Codex CLI", ok: status?.codexAvailable, detail: status?.codexVersion || status?.codexPath },
    { label: "PDF Skill 主解析", ok: status?.pdfSkillAvailable, detail: status?.pdfSkillPath },
    { label: "MinerU OCR Skill 兜底", ok: status?.mineruOcrSkillAvailable, detail: status?.mineruOcrSkillPath },
    { label: "MINERU_API_TOKEN", ok: status?.mineruOcrTokenAvailable, detail: status?.mineruOcrTokenAvailable ? "已配置" : "未配置，fallback 可能只能低保真处理" },
    { label: "Python", ok: status?.pythonAvailable, detail: "python" },
    { label: "pdfplumber", ok: status?.pdfplumberAvailable, detail: "Python package" },
    { label: "pypdf", ok: status?.pypdfAvailable, detail: "Python package" },
    { label: "Poppler", ok: status?.popplerAvailable, detail: "pdftoppm" },
  ]

  return (
    <div className="rounded-md border bg-muted/20 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {ready ? <CheckCircle2 className="size-5 text-primary" /> : <AlertTriangle className="size-5 text-amber-600" />}
            <div className="font-medium">Codex PDF Skill 解析链</div>
            <Badge variant={ready ? "secondary" : "outline"}>{ready ? "默认解析器" : "未就绪"}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {status?.message ?? "仅桌面端支持检测 Codex CLI、PDF Skill 和本地 PDF 工具链。"}
          </p>
          {status?.runtimeDir ? <p className="break-all font-mono text-xs text-muted-foreground">{status.runtimeDir}</p> : null}
        </div>
        <Button variant="outline" onClick={onRefresh} disabled={checking}>
          {checking ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          检测
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        {checks.map((item) => (
          <div key={item.label} className="rounded-md border bg-background p-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium text-foreground">{item.label}</div>
              <Badge variant={item.ok ? "secondary" : "outline"}>{item.ok ? "可用" : "待处理"}</Badge>
            </div>
            <div className="mt-1 break-all font-mono text-muted-foreground">{item.detail || "待检测"}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-md border bg-background p-3 text-xs leading-relaxed text-muted-foreground">
        默认链路：先调用本地 $pdf skill；如果未成功产出有效结构化结果，再自动调用 mineru-ocr skill 兜底，最终统一校验 pdf-parse-result.json 后入库。
      </div>
    </div>
  )
}

function MineruSettingsCard({
  status,
  checking,
  installing,
  logs,
  onRefresh,
  onInstall,
}: {
  status: MineruRuntimeStatus | null
  checking: boolean
  installing: boolean
  logs: string[]
  onRefresh: () => void
  onInstall: () => void
}) {
  const ready = status?.ready ?? false
  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-muted/20 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {ready ? <CheckCircle2 className="size-5 text-primary" /> : <AlertTriangle className="size-5 text-amber-600" />}
              <div className="font-medium">MinerU 备用解析器</div>
              <Badge variant={ready ? "secondary" : "outline"}>{ready ? "已就绪" : "未就绪"}</Badge>
              {status?.source ? <Badge variant="outline">{status.source === "managed" ? "应用托管" : status.source === "path" ? "系统 PATH" : "未安装"}</Badge> : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {status?.message ?? "仅桌面端支持检测和安装本地 MinerU。"}
            </p>
            {status?.version ? <p className="text-xs text-muted-foreground">版本：{status.version}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={onRefresh} disabled={checking || installing}>
              {checking ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              检测
            </Button>
            <Button onClick={onInstall} disabled={ready || checking || installing}>
              {installing ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              {installing ? "安装中" : "一键安装"}
            </Button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 text-xs text-muted-foreground md:grid-cols-2">
          <div className="rounded-md border bg-background p-3">
            <div className="font-medium text-foreground">运行时目录</div>
            <div className="mt-1 break-all font-mono">{status?.runtimeDir || "待检测"}</div>
          </div>
          <div className="rounded-md border bg-background p-3">
            <div className="font-medium text-foreground">可执行文件</div>
            <div className="mt-1 break-all font-mono">{status?.executablePath || "待安装或使用系统 PATH"}</div>
          </div>
        </div>

        <div className="mt-3 rounded-md border bg-background p-3 text-xs text-muted-foreground">
          <div className="font-medium text-foreground">安装策略</div>
          <div className="mt-1 break-all font-mono">{status?.installCommand || "创建应用私有 .venv 后安装 uv 与 mineru[all]"}</div>
          <p className="mt-2">
            默认先用本地 CPU pipeline 的文本抽取解析，抽不到文字时再回退 OCR；模型源使用 ModelScope，避免默认访问 HuggingFace 导致下载失败。
          </p>
        </div>
      </div>

      {logs.length > 0 ? (
        <div className="rounded-md border bg-background p-3">
          <div className="mb-2 text-sm font-medium">安装日志</div>
          <div className="max-h-56 overflow-auto rounded-md bg-muted/40 p-3 font-mono text-xs text-muted-foreground">
            {logs.slice(-20).map((log, index) => (
              <div key={`${index}-${log.slice(0, 18)}`} className={cn("whitespace-pre-wrap", log.includes("failed") && "text-destructive")}>
                {log}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

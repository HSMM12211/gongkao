import type { MaterialLayoutBlock, MaterialParsedPage } from "@/lib/material/types"

export type MaterialPdfParseResult = {
  text: string
  outputDir: string
  markdownFiles: string[]
  contentJsonFiles: string[]
  layoutBlocks: MaterialLayoutBlock[]
  pages: MaterialParsedPage[]
}

export type MineruRuntimeSource = "managed" | "path" | "missing"

export type MineruRuntimeStatus = {
  ready: boolean
  source: MineruRuntimeSource
  runtimeDir: string
  executablePath?: string
  version?: string
  message: string
  installCommand: string
}

export type MineruRuntimeInstallResult = {
  status: MineruRuntimeStatus
  logs: string[]
}

export type MineruParseProgressPayload = {
  runId: string
  stage: string
  status: "running" | "completed" | "failed" | string
  message: string
  percentage?: number
  method?: string
  logLine?: string
}

export type PdfSkillRuntimeStatus = {
  ready: boolean
  codexAvailable: boolean
  codexPath?: string
  codexVersion?: string
  pdfSkillAvailable: boolean
  pdfSkillPath: string
  mineruOcrSkillAvailable: boolean
  mineruOcrSkillPath: string
  mineruOcrTokenAvailable: boolean
  pythonAvailable: boolean
  pdfplumberAvailable: boolean
  pypdfAvailable: boolean
  popplerAvailable: boolean
  runtimeDir: string
  message: string
}

export type PdfSkillParseProgressPayload = {
  runId: string
  parser: "codex-pdf-skill" | string
  stage: string
  status: "running" | "completed" | "failed" | string
  message: string
  percentage?: number
  logLine?: string
  workspacePath?: string
}

export type TauriMaterialParserRuntimeApi = {
  invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T>
  listen?: <T>(event: string, handler: (event: { payload: T }) => void) => Promise<() => void>
}

export type TauriMaterialParserRuntime = {
  parsePdf: (input: { fileName: string; fileBytes: number[]; runId?: string }) => Promise<MaterialPdfParseResult>
  parsePdfWithCodexSkill: (input: { fileName: string; fileBytes: number[]; runId?: string }) => Promise<MaterialPdfParseResult>
  parsePdfWithMineru: (input: { fileName: string; fileBytes: number[]; runId?: string }) => Promise<MaterialPdfParseResult>
  getPdfSkillStatus: () => Promise<PdfSkillRuntimeStatus>
  getMineruStatus: () => Promise<MineruRuntimeStatus>
  installMineruRuntime: (input?: { useChinaMirror?: boolean }) => Promise<MineruRuntimeInstallResult>
  onPdfSkillParseProgress: (handler: (payload: PdfSkillParseProgressPayload) => void) => Promise<() => void>
  onMineruParseProgress: (handler: (payload: MineruParseProgressPayload) => void) => Promise<() => void>
}

export function createTauriMaterialParserRuntime(api: TauriMaterialParserRuntimeApi): TauriMaterialParserRuntime {
  const parsePdfWithCodexSkill = async (input: { fileName: string; fileBytes: number[]; runId?: string }) =>
    normalizePdfParseResult(
      await api.invoke<Record<string, unknown>>("material_parse_pdf_with_codex_skill", {
        ...input,
        runId: input.runId ?? null,
      }),
    )
  const parsePdfWithMineru = async (input: { fileName: string; fileBytes: number[]; runId?: string }) =>
    normalizePdfParseResult(
      await api.invoke<Record<string, unknown>>("material_parse_pdf_with_mineru", {
        ...input,
        runId: input.runId ?? null,
      }),
    )

  return {
    parsePdf: parsePdfWithCodexSkill,
    parsePdfWithCodexSkill,
    parsePdfWithMineru,
    getPdfSkillStatus: async () =>
      normalizePdfSkillStatus(await api.invoke<Record<string, unknown>>("material_get_pdf_skill_runtime_status")),
    getMineruStatus: async () =>
      normalizeMineruStatus(await api.invoke<Record<string, unknown>>("material_get_mineru_runtime_status")),
    installMineruRuntime: async (input = {}) =>
      normalizeMineruInstallResult(
        await api.invoke<Record<string, unknown>>("material_install_mineru_runtime", {
          useChinaMirror: input.useChinaMirror ?? true,
        }),
      ),
    onPdfSkillParseProgress: async (handler) => {
      if (!api.listen) {
        throw new Error("Tauri event listener is not available.")
      }
      return api.listen<Record<string, unknown>>("material://pdf-skill-parse-progress", (event) => {
        handler(normalizePdfSkillParseProgress(event.payload))
      })
    },
    onMineruParseProgress: async (handler) => {
      if (!api.listen) {
        throw new Error("Tauri event listener is not available.")
      }
      return api.listen<Record<string, unknown>>("material://mineru-parse-progress", (event) => {
        handler(normalizeMineruParseProgress(event.payload))
      })
    },
  }
}

function normalizePdfParseResult(raw: Record<string, unknown>): MaterialPdfParseResult {
  return {
    text: String(raw.text ?? ""),
    outputDir: String(raw.outputDir ?? raw.output_dir ?? ""),
    markdownFiles: stringArray(raw.markdownFiles ?? raw.markdown_files),
    contentJsonFiles: stringArray(raw.contentJsonFiles ?? raw.content_json_files),
    layoutBlocks: layoutBlockArray(raw.layoutBlocks ?? raw.layout_blocks),
    pages: pageArray(raw.pages),
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

function layoutBlockArray(value: unknown): MaterialLayoutBlock[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      id: String(item.id ?? ""),
      pageNumber: Number(item.pageNumber ?? item.page_number ?? 1),
      order: Number(item.order ?? 0),
      blockType: normalizeBlockType(item.blockType ?? item.block_type),
      text: String(item.text ?? ""),
      markdown: typeof item.markdown === "string" ? item.markdown : undefined,
      sourcePath: typeof item.sourcePath === "string" ? item.sourcePath : typeof item.source_path === "string" ? item.source_path : undefined,
      bbox: normalizeBbox(item.bbox),
    }))
    .filter((block) => block.id && block.text.trim())
}

function pageArray(value: unknown): MaterialParsedPage[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      pageNumber: Number(item.pageNumber ?? item.page_number ?? 1),
      text: String(item.text ?? ""),
      blockIds: stringArray(item.blockIds ?? item.block_ids),
    }))
    .filter((page) => page.text.trim())
}

function normalizeBlockType(value: unknown): MaterialLayoutBlock["blockType"] {
  const raw = String(value ?? "unknown")
  if (["heading", "paragraph", "list", "table", "image", "formula"].includes(raw)) return raw as MaterialLayoutBlock["blockType"]
  return "unknown"
}

function normalizeBbox(value: unknown): MaterialLayoutBlock["bbox"] {
  if (!Array.isArray(value) || value.length !== 4) return undefined
  const nums = value.map(Number)
  return nums.every((item) => Number.isFinite(item)) ? (nums as [number, number, number, number]) : undefined
}

function normalizeMineruInstallResult(raw: Record<string, unknown>): MineruRuntimeInstallResult {
  const statusRaw = raw.status && typeof raw.status === "object" ? (raw.status as Record<string, unknown>) : {}
  return {
    status: normalizeMineruStatus(statusRaw),
    logs: stringArray(raw.logs),
  }
}

function normalizeMineruParseProgress(raw: Record<string, unknown>): MineruParseProgressPayload {
  const percentage = Number(raw.percentage)
  return {
    runId: String(raw.runId ?? raw.run_id ?? ""),
    stage: String(raw.stage ?? "preparing"),
    status: String(raw.status ?? "running"),
    message: String(raw.message ?? ""),
    percentage: Number.isFinite(percentage) ? percentage : undefined,
    method: typeof raw.method === "string" ? raw.method : undefined,
    logLine: typeof raw.logLine === "string" ? raw.logLine : typeof raw.log_line === "string" ? raw.log_line : undefined,
  }
}

function normalizePdfSkillParseProgress(raw: Record<string, unknown>): PdfSkillParseProgressPayload {
  const percentage = Number(raw.percentage)
  return {
    runId: String(raw.runId ?? raw.run_id ?? ""),
    parser: String(raw.parser ?? "codex-pdf-skill"),
    stage: String(raw.stage ?? "preparing"),
    status: String(raw.status ?? "running"),
    message: String(raw.message ?? ""),
    percentage: Number.isFinite(percentage) ? percentage : undefined,
    logLine: typeof raw.logLine === "string" ? raw.logLine : typeof raw.log_line === "string" ? raw.log_line : undefined,
    workspacePath:
      typeof raw.workspacePath === "string"
        ? raw.workspacePath
        : typeof raw.workspace_path === "string"
          ? raw.workspace_path
          : undefined,
  }
}

function normalizePdfSkillStatus(raw: Record<string, unknown>): PdfSkillRuntimeStatus {
  return {
    ready: Boolean(raw.ready),
    codexAvailable: Boolean(raw.codexAvailable ?? raw.codex_available),
    codexPath:
      typeof raw.codexPath === "string" ? raw.codexPath : typeof raw.codex_path === "string" ? raw.codex_path : undefined,
    codexVersion:
      typeof raw.codexVersion === "string"
        ? raw.codexVersion
        : typeof raw.codex_version === "string"
          ? raw.codex_version
          : undefined,
    pdfSkillAvailable: Boolean(raw.pdfSkillAvailable ?? raw.pdf_skill_available),
    pdfSkillPath: String(raw.pdfSkillPath ?? raw.pdf_skill_path ?? ""),
    mineruOcrSkillAvailable: Boolean(raw.mineruOcrSkillAvailable ?? raw.mineru_ocr_skill_available),
    mineruOcrSkillPath: String(raw.mineruOcrSkillPath ?? raw.mineru_ocr_skill_path ?? ""),
    mineruOcrTokenAvailable: Boolean(raw.mineruOcrTokenAvailable ?? raw.mineru_ocr_token_available),
    pythonAvailable: Boolean(raw.pythonAvailable ?? raw.python_available),
    pdfplumberAvailable: Boolean(raw.pdfplumberAvailable ?? raw.pdfplumber_available),
    pypdfAvailable: Boolean(raw.pypdfAvailable ?? raw.pypdf_available),
    popplerAvailable: Boolean(raw.popplerAvailable ?? raw.poppler_available),
    runtimeDir: String(raw.runtimeDir ?? raw.runtime_dir ?? ""),
    message: String(raw.message ?? ""),
  }
}

function normalizeMineruStatus(raw: Record<string, unknown>): MineruRuntimeStatus {
  const source = String(raw.source ?? "missing")
  return {
    ready: Boolean(raw.ready),
    source: source === "managed" || source === "path" ? source : "missing",
    runtimeDir: String(raw.runtimeDir ?? raw.runtime_dir ?? ""),
    executablePath:
      typeof raw.executablePath === "string"
        ? raw.executablePath
        : typeof raw.executable_path === "string"
          ? raw.executable_path
          : undefined,
    version: typeof raw.version === "string" ? raw.version : undefined,
    message: String(raw.message ?? ""),
    installCommand: String(raw.installCommand ?? raw.install_command ?? ""),
  }
}

export async function loadTauriMaterialParserRuntime(): Promise<TauriMaterialParserRuntime> {
  if (typeof window === "undefined") {
    throw new Error("Tauri runtime is only available in the browser.")
  }
  if (!("__TAURI_INTERNALS__" in window) && !("__TAURI_IPC__" in window)) {
    throw new Error("Desktop PDF parsing is available only in the desktop app.")
  }

  const [{ invoke }, { listen }] = await Promise.all([import("@tauri-apps/api/core"), import("@tauri-apps/api/event")])
  return createTauriMaterialParserRuntime({ invoke, listen })
}

import { cleanMaterialText, inferSourceTypeFromFileName } from "@/lib/material/text"
import type { MaterialFileInput } from "@/lib/material/types"

function isDesktopTauriEnvironment() {
  return typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI_IPC__" in window)
}

type ExtractMaterialFileOptions = {
  parseRunId?: string
}

async function extractPdfFile(file: File, options: ExtractMaterialFileOptions = {}): Promise<Pick<MaterialFileInput, "text" | "layoutBlocks" | "pages">> {
  if (isDesktopTauriEnvironment()) {
    const { loadTauriMaterialParserRuntime } = await import("@/lib/desktop/material-parser-runtime")
    const runtime = await loadTauriMaterialParserRuntime()
    const parsed = await runtime.parsePdf({
      fileName: file.name,
      fileBytes: Array.from(new Uint8Array(await file.arrayBuffer())),
      runId: options.parseRunId,
    })
    return {
      text: cleanMaterialText(parsed.text),
      layoutBlocks: parsed.layoutBlocks,
      pages: parsed.pages,
    }
  }

  const pdfjs = await import("pdfjs-dist")
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).toString()
  const data = new Uint8Array(await file.arrayBuffer())
  const doc = await pdfjs.getDocument({ data }).promise
  const pages: string[] = []

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber)
    const content = await page.getTextContent()
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
    pages.push(text)
  }

  return { text: cleanMaterialText(pages.join("\n\n")) }
}

export async function extractMaterialFile(file: File, options: ExtractMaterialFileOptions = {}): Promise<MaterialFileInput> {
  const sourceType = inferSourceTypeFromFileName(file.name)
  const parsed = sourceType === "pdf" ? await extractPdfFile(file, options) : { text: await file.text() }

  return {
    title: file.name.replace(/\.[^.]+$/, ""),
    sourceType,
    originalName: file.name,
    text: cleanMaterialText(parsed.text),
    layoutBlocks: parsed.layoutBlocks,
    pages: parsed.pages,
  }
}

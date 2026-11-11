import { describe, expect, it } from "vitest"

import { createTauriMaterialParserRuntime } from "@/lib/desktop/material-parser-runtime"

describe("material parser runtime", () => {
  it("forwards default pdf parse requests to the Codex PDF Skill tauri command", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = []
    const runtime = createTauriMaterialParserRuntime({
      invoke: async <T>(command: string, args?: Record<string, unknown>) => {
        calls.push({ command, args })
        return {
          text: "parsed text",
          output_dir: "C:/temp/output",
          markdown_files: ["C:/temp/output/full.md"],
          content_json_files: ["C:/temp/output/content_list.json"],
          layout_blocks: [
            {
              id: "b1",
              page_number: 1,
              order: 1,
              block_type: "heading",
              text: "材料一",
            },
          ],
          pages: [{ page_number: 1, text: "parsed text", block_ids: ["b1"] }],
        } as T
      },
    })

    const result = await runtime.parsePdf({
      fileName: "exam-paper.pdf",
      fileBytes: [1, 2, 3],
    })

    expect(calls).toEqual([
      {
        command: "material_parse_pdf_with_codex_skill",
        args: {
          fileName: "exam-paper.pdf",
          fileBytes: [1, 2, 3],
          runId: null,
        },
      },
    ])
    expect(result.text).toBe("parsed text")
    expect(result.outputDir).toBe("C:/temp/output")
    expect(result.markdownFiles).toEqual(["C:/temp/output/full.md"])
    expect(result.contentJsonFiles).toEqual(["C:/temp/output/content_list.json"])
    expect(result.layoutBlocks[0]).toMatchObject({ id: "b1", pageNumber: 1, blockType: "heading" })
    expect(result.pages[0]).toMatchObject({ pageNumber: 1, blockIds: ["b1"] })
  })

  it("keeps explicit MinerU parsing as a fallback command", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = []
    const runtime = createTauriMaterialParserRuntime({
      invoke: async <T>(command: string, args?: Record<string, unknown>) => {
        calls.push({ command, args })
        return { text: "mineru text", output_dir: "C:/temp/mineru" } as T
      },
    })

    const result = await runtime.parsePdfWithMineru({
      fileName: "scan.pdf",
      fileBytes: [9, 8, 7],
      runId: "pdf-run-1",
    })

    expect(calls).toEqual([
      {
        command: "material_parse_pdf_with_mineru",
        args: {
          fileName: "scan.pdf",
          fileBytes: [9, 8, 7],
          runId: "pdf-run-1",
        },
      },
    ])
    expect(result).toMatchObject({ text: "mineru text", outputDir: "C:/temp/mineru" })
  })

  it("normalizes Codex PDF Skill runtime status", async () => {
    const runtime = createTauriMaterialParserRuntime({
      invoke: async <T>(command: string) => {
        expect(command).toBe("material_get_pdf_skill_runtime_status")
        return {
          ready: true,
          codex_available: true,
          codex_path: "C:/Users/djy/AppData/Roaming/npm/codex.cmd",
          codex_version: "codex 1.2.3",
          pdf_skill_available: true,
          pdf_skill_path: "C:/Users/djy/.codex/skills/pdf/SKILL.md",
          mineru_ocr_skill_available: true,
          mineru_ocr_skill_path: "C:/Users/djy/.codex/skills/mineru-ocr/SKILL.md",
          mineru_ocr_token_available: false,
          python_available: true,
          pdfplumber_available: true,
          pypdf_available: true,
          poppler_available: false,
          runtime_dir: "C:/Users/djy/AppData/Local/App/pdf-skill-runtime",
          message: "ready",
        } as T
      },
    })

    await expect(runtime.getPdfSkillStatus()).resolves.toEqual({
      ready: true,
      codexAvailable: true,
      codexPath: "C:/Users/djy/AppData/Roaming/npm/codex.cmd",
      codexVersion: "codex 1.2.3",
      pdfSkillAvailable: true,
      pdfSkillPath: "C:/Users/djy/.codex/skills/pdf/SKILL.md",
      mineruOcrSkillAvailable: true,
      mineruOcrSkillPath: "C:/Users/djy/.codex/skills/mineru-ocr/SKILL.md",
      mineruOcrTokenAvailable: false,
      pythonAvailable: true,
      pdfplumberAvailable: true,
      pypdfAvailable: true,
      popplerAvailable: false,
      runtimeDir: "C:/Users/djy/AppData/Local/App/pdf-skill-runtime",
      message: "ready",
    })
  })

  it("subscribes to Codex PDF Skill parse progress events", async () => {
    const events: string[] = []
    const runtime = createTauriMaterialParserRuntime({
      invoke: async <T>() => ({}) as T,
      listen: async <T>(event: string, handler: (event: { payload: T }) => void) => {
        events.push(event)
        handler({
          payload: {
            run_id: "pdf-2",
            parser: "codex-pdf-skill",
            stage: "extracting_text",
            status: "running",
            message: "Extracting PDF text",
            percentage: 45,
            log_line: "pdfplumber extracted page 1",
            workspace_path: "C:/runtime/runs/pdf-2",
          } as T,
        })
        return () => events.push("unlisten")
      },
    })

    const payloads: unknown[] = []
    const unlisten = await runtime.onPdfSkillParseProgress((payload) => payloads.push(payload))
    unlisten()

    expect(events).toEqual(["material://pdf-skill-parse-progress", "unlisten"])
    expect(payloads).toEqual([
      {
        runId: "pdf-2",
        parser: "codex-pdf-skill",
        stage: "extracting_text",
        status: "running",
        message: "Extracting PDF text",
        percentage: 45,
        logLine: "pdfplumber extracted page 1",
        workspacePath: "C:/runtime/runs/pdf-2",
      },
    ])
  })

  it("normalizes MinerU runtime status and install responses", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = []
    const runtime = createTauriMaterialParserRuntime({
      invoke: async <T>(command: string, args?: Record<string, unknown>) => {
        calls.push({ command, args })
        if (command === "material_get_mineru_runtime_status") {
          return {
            ready: true,
            source: "managed",
            runtime_dir: "C:/runtime",
            executable_path: "C:/runtime/.venv/Scripts/mineru.exe",
            version: "mineru 1.0",
            message: "ready",
            install_command: "python -m uv pip install mineru[all]",
          } as T
        }
        return {
          status: {
            ready: false,
            source: "missing",
            runtime_dir: "C:/runtime",
            message: "missing",
            install_command: "python -m uv pip install mineru[all]",
          },
          logs: ["install started"],
        } as T
      },
    })

    await expect(runtime.getMineruStatus()).resolves.toMatchObject({
      ready: true,
      source: "managed",
      runtimeDir: "C:/runtime",
      executablePath: "C:/runtime/.venv/Scripts/mineru.exe",
    })
    await expect(runtime.installMineruRuntime({ useChinaMirror: false })).resolves.toMatchObject({
      status: { ready: false, source: "missing" },
      logs: ["install started"],
    })
    expect(calls).toEqual([
      { command: "material_get_mineru_runtime_status", args: undefined },
      { command: "material_install_mineru_runtime", args: { useChinaMirror: false } },
    ])
  })

  it("subscribes to MinerU parse progress events", async () => {
    const events: string[] = []
    const runtime = createTauriMaterialParserRuntime({
      invoke: async <T>() => ({}) as T,
      listen: async <T>(event: string, handler: (event: { payload: T }) => void) => {
        events.push(event)
        const payload = {
          run_id: "pdf-1",
          stage: "model_download",
          status: "running",
          message: "Downloading models",
          percentage: 35,
          method: "ocr",
          log_line: "Downloading ModelScope files",
        } as T
        handler({
          payload,
        })
        return () => events.push("unlisten")
      },
    })

    const payloads: unknown[] = []
    const unlisten = await runtime.onMineruParseProgress((payload) => payloads.push(payload))
    unlisten()

    expect(events).toEqual(["material://mineru-parse-progress", "unlisten"])
    expect(payloads).toEqual([
      {
        runId: "pdf-1",
        stage: "model_download",
        status: "running",
        message: "Downloading models",
        percentage: 35,
        method: "ocr",
        logLine: "Downloading ModelScope files",
      },
    ])
  })
})

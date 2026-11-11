import { randomUUID } from "node:crypto"
import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile, cp } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import { spawn } from "node:child_process"
import readline from "node:readline"
import type { Writable } from "node:stream"
import type { NextRequest } from "next/server"
import type { AgentRunEvent, MaterialAgentRunResult, StartMaterialAgentRunRequest } from "@/types/agent-runtime"

export const runtime = "nodejs"
export const dynamic = "force-static"

type SseController = ReadableStreamDefaultController<Uint8Array>

type AgentFrame = {
  runId: string
  type: string
  message: string
  timestamp: string
  raw?: unknown
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as StartMaterialAgentRunRequest
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      try {
        await startChatRun(body, send)
      } catch (error) {
        send("error", { message: error instanceof Error ? error.message : String(error) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  })
}

async function startChatRun(
  request: StartMaterialAgentRunRequest,
  send: (event: string, data: unknown) => void,
) {
  validateRequest(request)
  const workspace = await prepareWorkspace(request)
  const command = buildAgentCommand(request, workspace.path)
  const streamFormat = request.adapterId === "claude" ? "claude-stream-json" : "json-event-stream"

  send("start", {
    runId: workspace.runId,
    workspacePath: workspace.path,
    agentId: request.adapterId,
    bin: command.program,
    cwd: workspace.path,
    streamFormat,
    model: request.model,
    reasoning: request.reasoning,
  })
  send("running", makeEvent(workspace.runId, "running", `spawned ${command.program}`))

  const child = spawn(command.program, command.args, {
    cwd: workspace.path,
    stdio: ["pipe", "pipe", "pipe"],
    shell: shouldUseShell(command.program),
    windowsHide: true,
  })

  child.stdin.on("error", () => {
    // Fast-exiting CLIs close stdin before reading the prompt. The close handler
    // reports the real stderr/exit-code failure.
  })
  writePromptToStdin(child.stdin, request.adapterId, workspace.prompt)

  const stdoutLines = readline.createInterface({ input: child.stdout })
  const stderrLines = readline.createInterface({ input: child.stderr })

  stdoutLines.on("line", (line) => {
    const trimmed = line.trim()
    if (!trimmed) return
    const parsed = parseAgentJsonLine(workspace.runId, request.adapterId, trimmed)
    if (parsed) {
      send("agent", parsed)
      send(parsed.type, toRunEvent(parsed))
      return
    }
    send("stdout", makeEvent(workspace.runId, "stdout", trimmed))
  })

  stderrLines.on("line", (line) => {
    if (!line.trim()) return
    send("stderr", makeEvent(workspace.runId, "stderr", line))
  })

  const close = await waitForClose(child)
  stdoutLines.close()
  stderrLines.close()

  if (close.code !== 0) {
    const message = `Agent process exited with code ${close.code ?? "null"}${close.signal ? ` (${close.signal})` : ""}.`
    send("failed", makeEvent(workspace.runId, "failed", message))
    send("end", { status: "failed", message })
    return
  }

  const result = await readRunResult(workspace.runId, workspace.path)
  if (!result) {
    const message = "Agent completed but material-draft.json was not found."
    send("failed", makeEvent(workspace.runId, "failed", message))
    send("end", { status: "failed", message })
    return
  }

  send("completed", makeEvent(workspace.runId, "completed", "Agent run completed."))
  send("end", { status: "completed", result })
}

function validateRequest(request: StartMaterialAgentRunRequest) {
  if (!request.adapterId || !["codex", "claude"].includes(request.adapterId)) {
    throw new Error("adapterId must be codex or claude.")
  }
  if (!request.skillId?.trim()) throw new Error("skillId is required.")
  if (!request.title?.trim()) throw new Error("title is required.")
  if (!request.topic?.trim()) throw new Error("topic is required.")
  if (request.sourceText.trim().length < 20 && request.userInstruction.trim().length < 10) {
    throw new Error("sourceText or userInstruction is required.")
  }
}

async function prepareWorkspace(request: StartMaterialAgentRunRequest) {
  const runId = randomUUID()
  const root = path.join(process.cwd(), ".gongkao-agent-runs")
  const workspacePath = path.join(root, runId)
  await mkdir(workspacePath, { recursive: true })
  await writeFile(path.join(workspacePath, "input.json"), JSON.stringify(request, null, 2), "utf8")
  await writeFile(path.join(workspacePath, "output-schema.json"), JSON.stringify(outputSchema(), null, 2), "utf8")

  const skill = await resolveSkill(request.skillId)
  const stagedSkillPath = path.join(workspacePath, ".gongkao-skills", safeSegment(request.skillId))
  await mkdir(path.dirname(stagedSkillPath), { recursive: true })
  await cp(skill.root, stagedSkillPath, { recursive: true })

  const prompt = composePrompt(request, skill.markdown, stagedSkillPath)
  await writeFile(path.join(workspacePath, "prompt.md"), prompt, "utf8")
  return { runId, path: workspacePath, prompt }
}

async function resolveSkill(skillId: string) {
  const safe = safeSegment(skillId)
  const candidates = [
    path.join(process.cwd(), "skills", safe),
    path.join(process.cwd(), ".codex", "skills", safe),
    path.join(homedir(), ".codex", "skills", safe),
  ]
  for (const root of candidates) {
    const skillPath = path.join(root, "SKILL.md")
    if (existsSync(skillPath)) {
      return { root, markdown: await readFile(skillPath, "utf8") }
    }
  }
  throw new Error(`Skill not found: ${skillId}`)
}

function safeSegment(value: string) {
  const normalized = value.trim()
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(normalized)) {
    throw new Error(`Unsafe path segment: ${value}`)
  }
  return normalized
}

function composePrompt(request: StartMaterialAgentRunRequest, skillMarkdown: string, stagedSkillPath: string) {
  return [
    "You are running inside the Gongkao material-agent daemon.",
    "Use the provided SKILL.md instructions and write the final structured result to material-draft.json at the workspace root.",
    "Do not write to the app database. The app validates and imports the output after user review.",
    "",
    "## Active Skill",
    skillMarkdown,
    "",
    "## Staged Skill Path",
    stagedSkillPath,
    "",
    "## Run Request",
    `Title: ${request.title}`,
    `Topic: ${request.topic}`,
    `Source type: ${request.sourceType}`,
    `Original name: ${request.originalName ?? ""}`,
    `User instruction: ${request.userInstruction}`,
    request.skillInputValues ? `Structured skill inputs: ${JSON.stringify(request.skillInputValues)}` : "",
    request.context ? `Bound context: ${JSON.stringify(request.context)}` : "",
    "",
    "## Source Text",
    request.sourceText,
    "",
    "## Output Contract",
    "Create material-draft.json matching output-schema.json exactly.",
    "Do not use alias fields such as flashcards.back, practiceQuestions.question, practiceQuestions.answer, or copybookItems.source.",
    "Every source.references item must include title, accessedAt, and excerpt. For local PDFs, use the current run date as accessedAt and the file name plus a short locator or excerpt as provenance.",
    "For local PDFs and long documents, do not collapse the whole file into one generic question. Cover the document structure: create 6-12 practiceQuestions when enough material exists, 8-20 flashcards, and references that cite distinct pages or sections.",
    "If the PDF is a question bank or course handout, extract representative real questions, tables, formulas, answer requirements, and model-answer assets across the full document instead of producing a single summary exercise.",
    "If promptBudget.originalSourceChars is larger than promptBudget.finalSourceChars, mention the truncation in report.warnings and only claim coverage for the retained source text.",
  ]
    .filter((part) => part !== "")
    .join("\n")
}

function outputSchema() {
  return {
    requiredOutput: "material-draft.json",
    schemaVersion: 1,
    source: {
      required: ["title", "sourceType", "text", "references"],
      sourceType: "One of text, markdown, pdf.",
      references: {
        required: ["title", "accessedAt", "excerpt"],
        optional: ["url", "publisher", "publishedAt", "snapshotPath"],
      },
    },
    draft: {
      required: [
        "topic",
        "summary",
        "tags",
        "keywords",
        "goldenSentences",
        "flashcards",
        "practiceQuestions",
        "copybookItems",
      ],
      longPdfGuidance: {
        flashcards: "For local PDFs or long documents, create 8-20 items when enough material exists.",
        practiceQuestions: "For local PDFs, course handouts, or question banks, create 6-12 representative questions when enough material exists.",
        references: "Cover distinct page ranges or sections instead of only the opening pages.",
      },
    },
    report: {
      required: ["summary", "warnings", "confidence"],
    },
  }
}

function buildAgentCommand(request: StartMaterialAgentRunRequest, cwd: string) {
  if (request.adapterId === "claude") {
    const args = [
      "-p",
      "--input-format",
      "stream-json",
      "--output-format",
      "stream-json",
      "--verbose",
      "--add-dir",
      cwd,
    ]
    if (request.model.trim()) args.push("--model", request.model)
    return { program: process.env.CLAUDE_BIN || "claude", args }
  }

  const args = ["exec", "--json", "--skip-git-repo-check"]
  if (process.platform === "win32") {
    args.push("--sandbox", "danger-full-access")
  } else {
    args.push("--sandbox", "workspace-write", "-c", "sandbox_workspace_write.network_access=true")
  }
  args.push("-C", cwd)
  if (request.model.trim()) args.push("--model", request.model)
  if (request.reasoning !== "default") args.push("-c", `model_reasoning_effort="${request.reasoning}"`)
  return { program: resolveCodexProgram(), args }
}

function resolveCodexProgram() {
  if (process.env.CODEX_BIN?.trim()) return process.env.CODEX_BIN.trim()
  if (process.platform !== "win32") return "codex"
  const npmShim = path.join(process.env.APPDATA || "", "npm", "codex.cmd")
  return existsSync(npmShim) ? npmShim : "codex.cmd"
}

function shouldUseShell(program: string) {
  return process.platform === "win32" && /\.(cmd|bat)$/i.test(program)
}

function writePromptToStdin(stdin: Writable, adapterId: string, prompt: string) {
  if (adapterId === "claude") {
    const message = JSON.stringify({
      type: "user",
      message: { role: "user", content: [{ type: "text", text: prompt }] },
    })
    stdin.end(`${message}\n`, "utf8")
    return
  }
  stdin.end(prompt, "utf8")
}

function waitForClose(child: ReturnType<typeof spawn>) {
  return new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.on("close", (code, signal) => resolve({ code, signal }))
  })
}

async function readRunResult(runId: string, workspacePath: string): Promise<MaterialAgentRunResult | null> {
  const outputPath = path.join(workspacePath, "material-draft.json")
  if (!existsSync(outputPath)) return null
  const reportPath = path.join(workspacePath, "report.md")
  const outputJson = await readFile(outputPath, "utf8")
  const reportMarkdown = existsSync(reportPath) ? await readFile(reportPath, "utf8") : undefined
  return { runId, workspacePath, outputJson, reportMarkdown }
}

function parseAgentJsonLine(runId: string, adapterId: string, line: string): AgentFrame | null {
  let raw: unknown
  try {
    raw = JSON.parse(line)
  } catch {
    return null
  }

  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const rawType = firstString(record.type, record.event, record.kind, nestedValue(record, "msg", "type"))
  const type = normalizeAgentType(adapterId, rawType, record)
  const message = summarizeAgentFrame(type, record)
  if (!message) return null
  return {
    runId,
    type,
    message,
    timestamp: new Date().toISOString(),
    raw: shrinkRawFrame(record),
  }
}

export function parseAgentJsonLineForTest(runId: string, adapterId: string, line: string): AgentFrame | null {
  return parseAgentJsonLine(runId, adapterId, line)
}

function normalizeAgentType(adapterId: string, rawType: string, record: Record<string, unknown>) {
  const lower = rawType.toLowerCase()
  const item = objectValue(record.item)
  const itemType = firstString(item?.type)
  if (itemType === "command_execution") {
    return lower.includes("completed") ? "tool_result" : "tool_call"
  }
  if (itemType === "file_change") return "file_write"
  if (itemType === "message") return "text_delta"
  if (lower === "turn.completed" || lower === "thread.completed") return "done"
  if (lower === "turn.started" || lower === "thread.started") return "log"
  if (lower.includes("tool") && lower.includes("result")) return "tool_result"
  if (lower.includes("tool") || record.name) return "tool_call"
  if (lower.includes("reason") || lower.includes("thinking")) return "thinking_delta"
  if (lower.includes("error")) return "agent_error"
  if (lower.includes("done") || lower.includes("completed")) return "done"
  if (extractFilePath(record)) return "file_write"
  if (adapterId === "claude" && lower.includes("assistant")) return "text_delta"
  return "text_delta"
}

function summarizeAgentFrame(type: string, record: Record<string, unknown>) {
  const item = objectValue(record.item)
  if (type === "tool_call") {
    const name = firstString(record.name, record.tool_name, nestedValue(record, "tool", "name"), item?.command) || "tool"
    const input = record.input ?? record.arguments ?? record.tool_input ?? item?.command
    return input ? `${name}: ${truncate(JSON.stringify(input), 360)}` : name
  }
  if (type === "tool_result") {
    const output = firstString(record.output, record.result, record.content, item?.output, item?.aggregated_output)
    const command = firstString(item?.command)
    if (output) return truncate(output, 500)
    return command ? `completed: ${truncate(command, 360)}` : "tool result"
  }
  if (type === "file_write") return extractFilePath(record) || "file written"
  if (type === "log" || type === "done") return firstString(record.type, record.event, record.kind) || type
  return truncate(extractText(record) || firstString(record.message, record.delta, record.text, record.result), 800)
}

function toRunEvent(frame: AgentFrame): AgentRunEvent {
  return {
    runId: frame.runId,
    kind: frame.type as AgentRunEvent["kind"],
    message: frame.message,
    timestamp: frame.timestamp,
    eventType: frame.type,
    raw: frame.raw,
  }
}

function makeEvent(runId: string, kind: AgentRunEvent["kind"], message: string): AgentRunEvent {
  return {
    runId,
    kind,
    message,
    timestamp: new Date().toISOString(),
  }
}

function extractText(value: unknown): string {
  if (typeof value === "string") return value
  if (!value || typeof value !== "object") return ""
  if (Array.isArray(value)) return value.map(extractText).filter(Boolean).join("\n")
  const record = value as Record<string, unknown>
  const direct = firstString(record.text, record.delta, record.content, record.message, record.result)
  if (direct) return direct
  for (const key of ["item", "msg", "data", "output", "content", "message"]) {
    const nested = extractText(record[key])
    if (nested) return nested
  }
  return ""
}

function extractFilePath(record: Record<string, unknown>) {
  const direct = firstString(record.path, record.file, record.file_path, record.output_path)
  if (direct) return direct
  const item = objectValue(record.item)
  const changes = Array.isArray(item?.changes) ? item?.changes : []
  const paths = changes.map((change) => objectValue(change)?.path).filter((value): value is string => typeof value === "string")
  return paths.length > 0 ? paths.join(", ") : ""
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}

function nestedValue(record: Record<string, unknown>, key: string, nestedKey: string) {
  const value = record[key]
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  return (value as Record<string, unknown>)[nestedKey]
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max)}...` : value
}

function shrinkRawFrame(record: Record<string, unknown>) {
  const clone: Record<string, unknown> = {}
  for (const key of ["type", "event", "kind", "name", "message", "text", "delta", "path", "item"]) {
    if (key in record) clone[key] = record[key]
  }
  return clone
}

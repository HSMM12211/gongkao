import { spawnSync } from "node:child_process"
import type { AgentAdapterId } from "@/types/agent-executor"
import type { DetectedAgentAdapter } from "@/types/agent-runtime"

type AuthStatus = DetectedAgentAdapter["authStatus"]

type ProgramProbe = {
  id: AgentAdapterId
  name: string
  program: string
  versionArgs: string[]
  authArgs: string[]
  parseAuth: (success: boolean, text: string) => AuthStatus
}

export function detectLocalCliAgentAdapters(): DetectedAgentAdapter[] {
  return [
    detectProgram({
      id: "codex",
      name: "Codex CLI",
      program: process.env.CODEX_BIN || (process.platform === "win32" ? "codex.cmd" : "codex"),
      versionArgs: ["--version"],
      authArgs: ["login", "status"],
      parseAuth: parseCodexAuthStatus,
    }),
    detectProgram({
      id: "claude",
      name: "Claude Code",
      program: "claude",
      versionArgs: ["--version"],
      authArgs: ["auth", "status"],
      parseAuth: parseClaudeAuthStatus,
    }),
  ]
}

export function parseCodexAuthStatus(success: boolean, text: string): AuthStatus {
  const lower = text.toLowerCase()
  if (
    lower.includes("not logged") ||
    lower.includes("not authenticated") ||
    lower.includes("login required") ||
    lower.includes("missing authentication") ||
    lower.includes("no auth")
  ) {
    return "missing"
  }
  if (lower.includes("logged in") || lower.includes("authenticated") || lower.includes("api key")) {
    return "ok"
  }
  if (success) return "unknown"
  if (lower.includes("unknown command") || lower.includes("unrecognized") || lower.includes("unexpected argument")) {
    return "unknown"
  }
  return "missing"
}

export function parseClaudeAuthStatus(success: boolean, text: string): AuthStatus {
  try {
    const parsed = JSON.parse(text) as { loggedIn?: unknown }
    return parsed.loggedIn === true ? "ok" : "missing"
  } catch {
    const lower = text.toLowerCase()
    if (
      lower.includes("not logged") ||
      lower.includes("not authenticated") ||
      lower.includes("login required") ||
      lower.includes("missing") ||
      lower.includes("unauthorized")
    ) {
      return "missing"
    }
    if (lower.includes("logged in") || lower.includes("authenticated")) return "ok"
    return success ? "unknown" : "missing"
  }
}

function detectProgram(probe: ProgramProbe): DetectedAgentAdapter {
  const version = runCommand(probe.program, probe.versionArgs)
  if (!version.ok) {
    return {
      id: probe.id,
      name: probe.name,
      available: false,
      path: resolveProgramPath(probe.program) ?? undefined,
      authStatus: "missing",
      message: `${probe.name} was not detected: ${version.text || version.error || "command failed"}`,
    }
  }

  const auth = runCommand(probe.program, probe.authArgs)
  const authStatus = auth.ok || auth.text ? probe.parseAuth(auth.ok, auth.text) : "unknown"
  return {
    id: probe.id,
    name: probe.name,
    available: true,
    path: resolveProgramPath(probe.program) ?? probe.program,
    version: version.text || undefined,
    authStatus,
    message: `${probe.name} was detected locally. ${authMessage(authStatus)}`,
  }
}

function authMessage(status: AuthStatus): string {
  if (status === "ok") return "Login status OK."
  if (status === "missing") return "Login is required."
  return "Login status could not be verified."
}

function runCommand(program: string, args: string[]): { ok: boolean; text: string; error?: string } {
  const output = spawnSync(program, args, {
    encoding: "utf8",
    shell: process.platform === "win32",
    timeout: 8000,
    windowsHide: true,
  })
  return {
    ok: output.status === 0,
    text: [output.stdout, output.stderr].filter(Boolean).join("\n").trim(),
    error: output.error?.message,
  }
}

function resolveProgramPath(program: string): string | null {
  if (program.includes("\\") || program.includes("/")) return program
  const command = process.platform === "win32" ? "where.exe" : "command"
  const args = process.platform === "win32" ? [program] : ["-v", program]
  const output = spawnSync(command, args, {
    encoding: "utf8",
    shell: process.platform !== "win32",
    timeout: 3000,
    windowsHide: true,
  })
  if (output.status !== 0) return null
  return output.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? null
}

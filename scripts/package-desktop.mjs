import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"

const isWindows = process.platform === "win32"
const npmBin = isWindows ? "npm.cmd" : "npm"

function pathKey(env) {
  return Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH"
}

function withPrependedPath(env, entries) {
  const next = { ...env }
  const key = pathKey(next)
  const existing = next[key] ?? ""
  const usableEntries = entries.filter(Boolean)
  next[key] = [...usableEntries, existing].filter(Boolean).join(isWindows ? ";" : ":")
  return next
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    ...options,
  })

  if (result.status !== 0) {
    if (result.error) {
      console.error(result.error)
    }
    process.exit(result.status ?? 1)
  }
}

run(isWindows ? "cmd.exe" : npmBin, isWindows ? ["/d", "/s", "/c", `${npmBin} run desktop:export`] : ["run", "desktop:export"])

if (!isWindows) {
  run("tauri", ["build"])
  process.exit(0)
}

const cargoBin = join(homedir(), ".cargo", "bin")
const llvmBin = "C:\\Program Files\\LLVM\\bin"
const cmakeBin =
  "C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\Common7\\IDE\\CommonExtensions\\Microsoft\\CMake\\CMake\\bin"
const vsDevCmd =
  "C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\Common7\\Tools\\VsDevCmd.bat"

const tauriEnv = withPrependedPath(process.env, [cargoBin])

if (existsSync(vsDevCmd)) {
  const command = [
    `call "${vsDevCmd}" -arch=x64`,
    `set "PATH=${llvmBin};${cmakeBin};${cargoBin};%PATH%"`,
    `set "LIBCLANG_PATH=${llvmBin}"`,
    "tauri build",
  ].join(" && ")

  run("cmd.exe", ["/d", "/s", "/c", command], {
    env: tauriEnv,
    windowsVerbatimArguments: true,
  })
} else {
  run("cmd.exe", ["/d", "/s", "/c", "tauri build"], { env: tauriEnv })
}

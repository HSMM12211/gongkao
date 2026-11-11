import { access, readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const DEFAULT_INCLUDE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".json",
  ".md",
  ".css",
  ".rs",
])

const DEFAULT_EXCLUDED_DIRS = new Set([
  ".git",
  ".next",
  ".pnpm-store",
  ".codex-cargo-target",
  "node_modules",
  "target",
  "out",
  "release",
  "docs/Handy-main",
  "docs/open-design-main",
])

const MOJIBAKE_PATTERNS = [
  "\u951b\u003f",
  "\u9225\u003f",
  "\u922b\u003f",
  "\u9239",
  "\u5bf0\u546d",
  "\u7edb\u590a",
  "\u93c8\ue100",
  "\u59dd\uff45",
  "\u93cd\uffe0",
  "\u6769\u612f",
  "\u5bb8\u30e5",
  "\u9422\u71b8",
  "\u93c2\u56e6",
]

export async function findMojibakeFindings(options = {}) {
  const root = path.resolve(options.root ?? process.cwd())
  const include = options.include ?? []
  const findings = []

  for await (const filePath of walkFiles(root, root, options.excludeDirs)) {
    if (!shouldScan(filePath, include)) continue
    const relativePath = slash(path.relative(root, filePath))
    const contents = await readFile(filePath, "utf8")
    const lines = contents.split(/\r?\n/)
    lines.forEach((lineText, index) => {
      for (const pattern of MOJIBAKE_PATTERNS) {
        if (lineText.includes(pattern)) {
          findings.push({
            file: relativePath,
            line: index + 1,
            pattern,
            text: lineText.trim(),
          })
          return
        }
      }
    })
  }

  return findings
}

async function* walkFiles(root, currentDir, extraExcludeDirs = []) {
  const entries = await readdir(currentDir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name)
    if (entry.isDirectory()) {
      const relativeDir = slash(path.relative(root, fullPath))
      if (isExcludedDir(relativeDir, entry.name, extraExcludeDirs)) continue
      yield* walkFiles(root, fullPath, extraExcludeDirs)
      continue
    }
    if (entry.isFile()) {
      yield fullPath
    }
  }
}

function shouldScan(filePath, include) {
  if (include.length === 0) {
    return DEFAULT_INCLUDE_EXTENSIONS.has(path.extname(filePath))
  }

  const normalized = slash(filePath)
  return include.some((pattern) => matchesGlobSuffix(normalized, pattern))
}

function matchesGlobSuffix(filePath, pattern) {
  if (pattern.startsWith("**/*")) {
    return filePath.endsWith(pattern.slice(4))
  }
  return filePath.endsWith(pattern)
}

function isExcludedDir(relativeDir, dirName, extraExcludeDirs) {
  const excluded = new Set([...DEFAULT_EXCLUDED_DIRS, ...extraExcludeDirs])
  return excluded.has(dirName) || excluded.has(relativeDir)
}

function slash(value) {
  return value.replace(/\\/g, "/")
}

async function main() {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd()
  await access(root)
  const findings = await findMojibakeFindings({ root })

  if (findings.length === 0) {
    console.log("No mojibake fragments found.")
    return
  }

  console.error(`Found ${findings.length} possible mojibake fragment(s):`)
  for (const finding of findings) {
    console.error(`${finding.file}:${finding.line} [${finding.pattern}] ${finding.text}`)
  }
  process.exitCode = 1
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : ""
if (entryPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}

import { createHash } from "node:crypto"
import { spawn } from "node:child_process"
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { pipeline } from "node:stream/promises"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const modelDir = join(root, "src-tauri", "resources", "models")
const sourcePath = join(modelDir, "model-source.json")
const lockPath = join(modelDir, "model-lock.json")

const source = JSON.parse(readFileSync(sourcePath, "utf8"))
const model = source.models.find((item) => item.id === source.defaultModelId)

if (!model?.url) {
  throw new Error("Missing default model URL in model-source.json")
}

mkdirSync(modelDir, { recursive: true })

const target = join(modelDir, model.filename)
const tempTarget = `${target}.download`

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

if (existsSync(target) && existsSync(lockPath)) {
  const lock = JSON.parse(readFileSync(lockPath, "utf8"))
  const locked = lock.models.find((item) => item.id === lock.defaultModelId)
  if (locked?.sha256 && locked.sha256 === sha256(target)) {
    console.log(`Model already present: ${model.filename}`)
    process.exit(0)
  }
}

if (existsSync(tempTarget)) unlinkSync(tempTarget)

async function downloadWithFetch(url, destination) {
  const response = await fetch(url)
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download model: ${response.status}`)
  }

  await pipeline(response.body, createWriteStream(destination))
}

function downloadWithCurl(url, destination) {
  return new Promise((resolve, reject) => {
    const args = [
      "--fail",
      "--location",
      "--show-error",
      "--retry",
      "5",
      "--retry-delay",
      "2",
      "--retry-all-errors",
      "--http1.1",
      "--ssl-no-revoke",
      "--output",
      destination,
      url,
    ]
    const child = spawn("curl.exe", args, { stdio: "inherit" })
    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`curl exited with code ${code}`))
      }
    })
  })
}

try {
  await downloadWithFetch(model.url, tempTarget)
} catch (error) {
  if (process.platform !== "win32") {
    throw error
  }
  console.warn(`Fetch download failed, retrying with curl.exe: ${error.message}`)
  if (existsSync(tempTarget)) unlinkSync(tempTarget)
  await downloadWithCurl(model.url, tempTarget)
}

const actualSha256 = sha256(tempTarget)
renameSync(tempTarget, target)

const lock = {
  ...source,
  models: source.models.map((item) =>
    item.id === model.id
      ? {
          ...item,
          sha256: actualSha256,
        }
      : item,
  ),
}

writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`)
console.log(`Downloaded model: ${model.filename}`)
console.log(`Locked sha256: ${actualSha256}`)

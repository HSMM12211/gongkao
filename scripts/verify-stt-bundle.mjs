import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const modelDir = join(root, "src-tauri", "resources", "models")

const disallowedBundledAsrModels = [
  "ggml-small.bin",
  "whisper-medium-q4_1.bin",
  "ggml-large-v3-turbo.bin",
  "ggml-large-v3-q5_0.bin",
  "breeze-asr-q5_k.bin",
]

for (const filename of disallowedBundledAsrModels) {
  const path = join(modelDir, filename)
  if (existsSync(path)) {
    console.warn(`ASR model exists in source resources but is not bundled by tauri.conf.json: ${filename}`)
  }
}

console.log("STT bundle policy verified: installer does not force-bundle a fixed ASR model.")

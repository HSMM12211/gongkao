# Offline STT Out-Of-Box Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make local speech-to-text genuinely work out of the box: after installing the desktop app, the user selects “本地服务”, grants microphone permission, speaks, and gets text inside this app without API keys, terminal commands, manual model downloads, or network access.

**Architecture:** Convert the current Next.js app into a Tauri desktop app and move product-grade offline STT into the native Rust backend, following the Handy pattern: React/TypeScript UI, Rust desktop runtime, local model inference, native audio capture, VAD, resampling, and event-based transcript delivery. The existing Python/Vosk sidecar remains a development-only experiment and is not the final product runtime.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tauri 2, Rust, `whisper-rs`, `cpal`, `rubato`, `vad-rs`, bundled GGML Whisper model, Vitest, Rust unit tests, Tauri build artifacts for Windows first.

---

## Reference Baseline

Handy’s public README describes the target class of product: a cross-platform desktop app that performs local speech transcription without sending audio to the cloud. Its architecture is Tauri with React/TypeScript frontend and Rust backend. Its core libraries include `whisper-rs` for local Whisper recognition, `cpal` for cross-platform audio I/O, `vad-rs` for voice activity detection, and `rubato` for resampling.

For this project, copy the architectural pattern, not the global dictation behavior. We only need speech-to-text inside this app’s review/practice inputs.

## Definition Of Done

This feature is complete only when all of these are true:

- A packaged Windows desktop build can be installed and launched on a clean machine.
- The installer includes a default offline STT model or a first-run local resource seeded by the installer.
- The user does not need to run Python, open a terminal, fill an endpoint, download a model, or paste an API key.
- With network disabled, the user can open the app, select `本地服务`, record speech, and receive transcript text.
- The transcript appears in `app/review/page.tsx` and `app/practice/page.tsx`.
- Settings shows only status and repair actions for normal users.
- Advanced diagnostics can show model path, runtime status, backend logs, and benchmark latency.
- The app reports `ready`, `starting`, `model-missing`, `mic-denied`, and `failed` states clearly.
- Tests cover model discovery, runtime health, command bridge behavior, transcript event flow, and UI mode switching.

## Key Product Decision

Use a Tauri/Rust local STT backend for production, not Python sidecar packaging.

Reasons:

- Handy proves the Tauri + Rust pattern is viable for offline STT.
- Rust avoids shipping a full Python runtime and `vosk` dependency tree.
- Native `cpal` capture is more reliable in a desktop app than WebView microphone streaming.
- `whisper-rs` can load GGML Whisper models directly.
- `rubato` and `vad-rs` match the audio preprocessing pattern needed for real desktop dictation.

The existing files remain useful:

- Keep `lib/providers/local-speech-runtime.ts` as the frontend runtime facade.
- Keep `hooks/use-realtime-speech-input.ts` as browser/dev fallback.
- Keep `tools/local-stt-service/` as a development-only fallback.
- Replace `desktop/stt-runtime-manager.ts` placeholder with real Tauri/Rust command bridge.

## File Structure

### Create

- `src-tauri/Cargo.toml`  
  Tauri/Rust package manifest with `tauri`, `serde`, `whisper-rs`, `cpal`, `rubato`, `vad-rs`, `thiserror`, and logging dependencies.

- `src-tauri/tauri.conf.json`  
  Desktop packaging config, resource inclusion, permissions, Windows bundle metadata.

- `src-tauri/build.rs`  
  Build-time resource checks for bundled model files and model manifest.

- `src-tauri/src/main.rs`  
  Tauri entrypoint that registers commands and app state.

- `src-tauri/src/stt/mod.rs`  
  STT module exports.

- `src-tauri/src/stt/model_registry.rs`  
  Discovers bundled model, validates SHA256, exposes selected model metadata.

- `src-tauri/src/stt/audio_capture.rs`  
  Captures microphone audio through `cpal`.

- `src-tauri/src/stt/resampler.rs`  
  Converts input audio to 16 kHz mono Float32 using `rubato`.

- `src-tauri/src/stt/vad.rs`  
  Voice activity detection wrapper.

- `src-tauri/src/stt/whisper_engine.rs`  
  Loads `whisper-rs`, runs transcription, returns text and timing.

- `src-tauri/src/stt/session.rs`  
  Owns recording session lifecycle: start, audio buffer, stop, transcribe, cancel.

- `src-tauri/src/stt/commands.rs`  
  Tauri commands exposed to frontend.

- `src-tauri/src/stt/events.rs`  
  Event names and payload structs emitted to frontend.

- `src-tauri/src/stt/errors.rs`  
  Typed error mapping for UI.

- `src-tauri/resources/models/model-source.json`  
  Default model source metadata with name, filename, size, URL, language, bundled flag.

- `src-tauri/resources/models/model-lock.json`  
  Generated lock file with the verified SHA256 used by release builds.

- `scripts/download-stt-model.mjs`  
  Build-time script that downloads a pinned model into `src-tauri/resources/models/` and verifies SHA256.

- `scripts/verify-stt-bundle.mjs`  
  Checks that desktop resources include the model and manifest before packaging.

- `lib/desktop/tauri-speech-runtime.ts`  
  Browser-side bridge adapter for Tauri commands/events.

- `hooks/use-desktop-speech-input.ts`  
  React hook for production desktop STT: start/stop/cancel and transcript event subscription.

- `test/lib/desktop/tauri-speech-runtime.test.ts`  
  Tests command bridge adapter with mocked Tauri API.

- `test/hooks/use-desktop-speech-input.test.ts`  
  Tests transcript event accumulation helpers.

- `docs/offline-stt-qa.md`  
  Manual QA checklist for clean-machine offline testing.

### Modify

- `package.json`  
  Add Tauri scripts and model scripts.

- `next.config.mjs`  
  Add desktop export mode if required by Tauri packaging.

- `lib/providers/local-speech-runtime.ts`  
  Prefer Tauri runtime when available, fallback to current WebSocket probe only in browser dev.

- `types/local-speech-runtime.ts`  
  Add desktop runtime statuses and diagnostic fields.

- `hooks/use-realtime-speech-input.ts`  
  Mark as browser/dev fallback.

- `app/settings/page.tsx`  
  Display Tauri runtime status, model availability, repair action, and advanced diagnostics.

- `app/practice/page.tsx`  
  Use desktop speech hook when Tauri is available.

- `app/review/page.tsx`  
  Use desktop speech hook when Tauri is available.

- `docs/superpowers/plans/2026-05-24-local-realtime-stt.md`  
  Add a note that the WebSocket/Python route is not the out-of-box production route.

## Model Packaging Policy

Default model:

```text
ggml-small.bin
```

Rationale:

- Handy documents a Whisper Small GGML model around 487 MB.
- It is a reasonable baseline for Chinese speech quality compared with tiny/base models.
- It keeps the first build simple.

Rules:

- Do not commit the large `.bin` file to Git.
- The release build script downloads the exact pinned model file.
- The build fails if SHA256 does not match.
- The packaged app includes the model as a Tauri resource.
- On first launch, the app verifies the resource exists.
- Optional later: allow users to install larger or quantized models from a model manager.

Example model source config:

```json
{
  "defaultModelId": "whisper-small-ggml",
  "models": [
    {
      "id": "whisper-small-ggml",
      "label": "Whisper Small 中文默认",
      "filename": "ggml-small.bin",
      "url": "https://blob.handy.computer/ggml-small.bin",
      "sizeBytes": 510656000,
      "language": "zh",
      "bundled": true
    }
  ]
}
```

The first packaging run generates `src-tauri/resources/models/model-lock.json` with the verified SHA256 from the downloaded artifact. Release builds use the lock file, not an unverified URL-only config.

## Tasks

### Task 1: Add Tauri Desktop Shell

**Files:**
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/src/main.rs`
- Modify: `package.json`

- [ ] **Step 1: Add package scripts**

Modify `package.json`:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest",
    "desktop:dev": "tauri dev",
    "desktop:build": "tauri build",
    "stt:model:download": "node scripts/download-stt-model.mjs",
    "stt:bundle:verify": "node scripts/verify-stt-bundle.mjs"
  }
}
```

- [ ] **Step 2: Install Tauri dependencies**

Run:

```bash
npm install -D @tauri-apps/cli
npm install @tauri-apps/api
```

Expected:

```text
package.json and lockfile include Tauri packages
```

- [ ] **Step 3: Add Rust manifest**

Create `src-tauri/Cargo.toml`:

```toml
[package]
name = "gongkao-desktop"
version = "0.1.0"
edition = "2021"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-shell = "2"
tauri-plugin-dialog = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "1"
sha2 = "0.10"
whisper-rs = "0.13"
cpal = "0.15"
rubato = "0.15"
vad-rs = "0.1"
log = "0.4"
env_logger = "0.11"
```

- [ ] **Step 4: Add Tauri config**

Create `src-tauri/tauri.conf.json`:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "申论 AI 智能体",
  "version": "0.1.0",
  "identifier": "com.gongkao.shenlun",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:3000",
    "beforeBuildCommand": "npm run stt:model:download && npm run build && npm run stt:bundle:verify",
    "frontendDist": "../out"
  },
  "bundle": {
    "active": true,
    "targets": ["nsis"],
    "resources": ["resources/models/*"]
  },
  "app": {
    "windows": [
      {
        "title": "申论 AI 智能体",
        "width": 1280,
        "height": 860,
        "resizable": true
      }
    ]
  }
}
```

- [ ] **Step 5: Add minimal Tauri main**

Create `src-tauri/src/main.rs`:

```rust
fn main() {
    env_logger::init();
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .run(tauri::generate_context!())
        .expect("failed to run tauri app");
}
```

- [ ] **Step 6: Verify shell build setup**

Run:

```bash
npx tauri info
```

Expected:

```text
Tauri reports Windows development environment information
```

### Task 2: Make Next Build Embeddable

**Files:**
- Modify: `next.config.mjs`
- Test: `npm run build`

- [ ] **Step 1: Enable static export for desktop**

Modify `next.config.mjs`:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.TAURI_DESKTOP === "1" ? "export" : undefined,
  images: {
    unoptimized: true,
  },
}

export default nextConfig
```

- [ ] **Step 2: Update Tauri build command**

In `src-tauri/tauri.conf.json`, set:

```json
"beforeBuildCommand": "npm run stt:model:download && set TAURI_DESKTOP=1&& npm run build && npm run stt:bundle:verify"
```

For PowerShell-based scripts, replace with a Node wrapper if Windows env assignment is unreliable.

- [ ] **Step 3: Verify static export**

Run:

```bash
$env:TAURI_DESKTOP="1"; npm run build
```

Expected:

```text
Next build succeeds and creates out/
```

### Task 3: Add Model Download And Bundle Verification

**Files:**
- Create: `scripts/download-stt-model.mjs`
- Create: `scripts/verify-stt-bundle.mjs`
- Create: `src-tauri/resources/models/model-source.json`
- Create: `src-tauri/resources/models/model-lock.json`

- [ ] **Step 1: Add model source config**

Create `src-tauri/resources/models/model-source.json`:

```json
{
  "defaultModelId": "whisper-small-ggml",
  "models": [
    {
      "id": "whisper-small-ggml",
      "label": "Whisper Small 中文默认",
      "filename": "ggml-small.bin",
      "url": "https://blob.handy.computer/ggml-small.bin",
      "sizeBytes": 510656000,
      "language": "zh",
      "bundled": true
    }
  ]
}
```

- [ ] **Step 2: Add downloader script**

Create `scripts/download-stt-model.mjs`:

```js
import { createHash } from "node:crypto"
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { pipeline } from "node:stream/promises"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const sourcePath = join(root, "src-tauri", "resources", "models", "model-source.json")
const lockPath = join(root, "src-tauri", "resources", "models", "model-lock.json")
const source = JSON.parse(readFileSync(sourcePath, "utf8"))
const model = source.models.find((item) => item.id === source.defaultModelId)

if (!model || !model.url) {
  throw new Error("Model source must contain url before packaging")
}

const target = join(root, "src-tauri", "resources", "models", model.filename)

mkdirSync(dirname(target), { recursive: true })

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

if (existsSync(lockPath) && existsSync(target)) {
  const lock = JSON.parse(readFileSync(lockPath, "utf8"))
  const locked = lock.models.find((item) => item.id === lock.defaultModelId)
  if (locked && locked.sha256 === sha256(target)) {
    console.log(`Model already present: ${target}`)
    process.exit(0)
  }
}

const tmp = `${target}.download`
if (existsSync(tmp)) unlinkSync(tmp)

const response = await fetch(model.url)
if (!response.ok || !response.body) {
  throw new Error(`Failed to download model: ${response.status}`)
}

await pipeline(response.body, createWriteStream(tmp))
const actual = sha256(tmp)
renameSync(tmp, target)
const lock = {
  ...source,
  models: source.models.map((item) => (item.id === model.id ? { ...item, sha256: actual } : item)),
}
writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`)
console.log(`Downloaded model: ${target}`)
console.log(`Model sha256 locked: ${actual}`)
```

- [ ] **Step 3: Add bundle verifier**

Create `scripts/verify-stt-bundle.mjs`:

```js
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const lockPath = join(root, "src-tauri", "resources", "models", "model-lock.json")
if (!existsSync(lockPath)) throw new Error("Missing model-lock.json; run npm run stt:model:download first")
const manifest = JSON.parse(readFileSync(lockPath, "utf8"))
const model = manifest.models.find((item) => item.id === manifest.defaultModelId)

if (!model || !model.filename) throw new Error("Missing default model entry in model-lock.json")

const target = join(root, "src-tauri", "resources", "models", model.filename)

if (!existsSync(target)) throw new Error(`Missing bundled model: ${target}`)

const actual = createHash("sha256").update(readFileSync(target)).digest("hex")
if (actual !== model.sha256) {
  throw new Error(`Bundled model sha256 mismatch. expected=${model.sha256} actual=${actual}`)
}

console.log(`STT bundle verified: ${model.filename}`)
```

- [ ] **Step 4: Verify scripts fail safely before hash is set**

Run:

```bash
npm run stt:model:download
```

Expected:

```text
model downloads once
model-lock.json is generated
output prints Model sha256 locked
```

- [ ] **Step 5: Verify locked hash**

Rerun:

```bash
npm run stt:bundle:verify
```

Expected:

```text
Downloaded model
STT bundle verified
```

### Task 4: Implement Rust Model Registry

**Files:**
- Create: `src-tauri/src/stt/model_registry.rs`
- Create: `src-tauri/src/stt/errors.rs`
- Modify: `src-tauri/src/stt/mod.rs`

- [ ] **Step 1: Add STT error type**

Create `src-tauri/src/stt/errors.rs`:

```rust
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, Serialize)]
#[serde(tag = "code", content = "message")]
pub enum SttError {
    #[error("模型文件缺失")]
    ModelMissing,
    #[error("模型校验失败")]
    ModelHashMismatch,
    #[error("麦克风权限被拒绝")]
    MicDenied,
    #[error("未检测到麦克风设备")]
    MicNotFound,
    #[error("本地识别运行时启动失败: {0}")]
    RuntimeFailed(String),
}

pub type SttResult<T> = Result<T, SttError>;
```

- [ ] **Step 2: Add registry structs**

Create `src-tauri/src/stt/model_registry.rs`:

```rust
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use super::errors::{SttError, SttResult};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ModelManifest {
    #[serde(rename = "defaultModelId")]
    pub default_model_id: String,
    pub models: Vec<ModelInfo>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ModelInfo {
    pub id: String,
    pub label: String,
    pub filename: String,
    pub sha256: String,
    #[serde(rename = "sizeBytes")]
    pub size_bytes: u64,
    pub language: String,
    pub bundled: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ResolvedModel {
    pub info: ModelInfo,
    pub path: PathBuf,
}

pub fn resolve_default_model(resource_dir: PathBuf, manifest: ModelManifest) -> SttResult<ResolvedModel> {
    let info = manifest
        .models
        .into_iter()
        .find(|model| model.id == manifest.default_model_id)
        .ok_or(SttError::ModelMissing)?;
    let path = resource_dir.join("models").join(&info.filename);
    if !path.exists() {
        return Err(SttError::ModelMissing);
    }
    Ok(ResolvedModel { info, path })
}
```

- [ ] **Step 3: Add Rust unit test**

In the same file:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn resolves_default_model_when_file_exists() {
        let root = std::env::temp_dir().join("gongkao-stt-model-test");
        let models = root.join("models");
        fs::create_dir_all(&models).unwrap();
        fs::write(models.join("ggml-small.bin"), b"fake").unwrap();

        let manifest = ModelManifest {
            default_model_id: "default".into(),
            models: vec![ModelInfo {
                id: "default".into(),
                label: "Default".into(),
                filename: "ggml-small.bin".into(),
                sha256: "fake".into(),
                size_bytes: 4,
                language: "zh".into(),
                bundled: true,
            }],
        };

        let resolved = resolve_default_model(root, manifest).unwrap();
        assert!(resolved.path.ends_with("ggml-small.bin"));
    }
}
```

- [ ] **Step 4: Export module**

Create `src-tauri/src/stt/mod.rs`:

```rust
pub mod errors;
pub mod model_registry;
```

- [ ] **Step 5: Verify**

Run:

```bash
cd src-tauri
cargo test stt::model_registry
```

Expected:

```text
test resolves_default_model_when_file_exists ... ok
```

### Task 5: Implement Native Audio Capture And Resampling

**Files:**
- Create: `src-tauri/src/stt/audio_capture.rs`
- Create: `src-tauri/src/stt/resampler.rs`
- Modify: `src-tauri/src/stt/mod.rs`

- [ ] **Step 1: Add resampler pure function**

Create `src-tauri/src/stt/resampler.rs`:

```rust
pub fn mix_to_mono_f32(interleaved: &[f32], channels: usize) -> Vec<f32> {
    if channels <= 1 {
        return interleaved.to_vec();
    }
    interleaved
        .chunks(channels)
        .map(|frame| frame.iter().sum::<f32>() / channels as f32)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mixes_stereo_to_mono() {
        let output = mix_to_mono_f32(&[1.0, 0.0, 0.5, -0.5], 2);
        assert_eq!(output, vec![0.5, 0.0]);
    }
}
```

- [ ] **Step 2: Add audio capture skeleton**

Create `src-tauri/src/stt/audio_capture.rs`:

```rust
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::sync::{Arc, Mutex};

use super::errors::{SttError, SttResult};

pub struct AudioCapture {
    samples: Arc<Mutex<Vec<f32>>>,
    stream: Option<cpal::Stream>,
}

impl AudioCapture {
    pub fn start() -> SttResult<Self> {
        let host = cpal::default_host();
        let device = host.default_input_device().ok_or(SttError::MicNotFound)?;
        let config = device
            .default_input_config()
            .map_err(|err| SttError::RuntimeFailed(err.to_string()))?;
        let samples = Arc::new(Mutex::new(Vec::new()));
        let sink = samples.clone();

        let stream = match config.sample_format() {
            cpal::SampleFormat::F32 => device
                .build_input_stream(
                    &config.clone().into(),
                    move |data: &[f32], _| sink.lock().expect("audio sink poisoned").extend_from_slice(data),
                    move |err| log::error!("audio stream error: {err}"),
                    None,
                )
                .map_err(|err| SttError::RuntimeFailed(err.to_string()))?,
            _ => return Err(SttError::RuntimeFailed("unsupported input sample format".into())),
        };

        stream.play().map_err(|err| SttError::RuntimeFailed(err.to_string()))?;
        Ok(Self { samples, stream: Some(stream) })
    }

    pub fn stop(mut self) -> Vec<f32> {
        self.stream.take();
        self.samples.lock().expect("audio sink poisoned").clone()
    }
}
```

- [ ] **Step 3: Export modules**

Modify `src-tauri/src/stt/mod.rs`:

```rust
pub mod audio_capture;
pub mod errors;
pub mod model_registry;
pub mod resampler;
```

- [ ] **Step 4: Verify**

Run:

```bash
cd src-tauri
cargo test stt::resampler
```

Expected:

```text
test mixes_stereo_to_mono ... ok
```

### Task 6: Implement Whisper Engine

**Files:**
- Create: `src-tauri/src/stt/whisper_engine.rs`
- Modify: `src-tauri/src/stt/mod.rs`

- [ ] **Step 1: Add engine request/response types**

Create `src-tauri/src/stt/whisper_engine.rs`:

```rust
use serde::Serialize;
use std::path::Path;
use std::time::Instant;

use super::errors::{SttError, SttResult};

#[derive(Debug, Clone, Serialize)]
pub struct TranscriptionResult {
    pub text: String,
    pub duration_ms: u128,
}

pub struct WhisperEngine {
    model_path: String,
}

impl WhisperEngine {
    pub fn new(model_path: &Path) -> SttResult<Self> {
        if !model_path.exists() {
            return Err(SttError::ModelMissing);
        }
        Ok(Self { model_path: model_path.to_string_lossy().to_string() })
    }

    pub fn transcribe_16khz_mono(&self, samples: &[f32]) -> SttResult<TranscriptionResult> {
        let started = Instant::now();
        if samples.is_empty() {
            return Ok(TranscriptionResult { text: String::new(), duration_ms: 0 });
        }

        let ctx = whisper_rs::WhisperContext::new(&self.model_path)
            .map_err(|err| SttError::RuntimeFailed(err.to_string()))?;
        let mut state = ctx.create_state().map_err(|err| SttError::RuntimeFailed(err.to_string()))?;
        let mut params = whisper_rs::FullParams::new(whisper_rs::SamplingStrategy::Greedy { best_of: 1 });
        params.set_language(Some("zh"));
        params.set_translate(false);
        params.set_print_progress(false);
        params.set_print_special(false);
        params.set_print_timestamps(false);

        state.full(params, samples).map_err(|err| SttError::RuntimeFailed(err.to_string()))?;

        let mut text = String::new();
        for i in 0..state.full_n_segments().map_err(|err| SttError::RuntimeFailed(err.to_string()))? {
            let segment = state.full_get_segment_text(i).map_err(|err| SttError::RuntimeFailed(err.to_string()))?;
            text.push_str(segment.trim());
        }

        Ok(TranscriptionResult {
            text,
            duration_ms: started.elapsed().as_millis(),
        })
    }
}
```

- [ ] **Step 2: Export module**

Modify `src-tauri/src/stt/mod.rs`:

```rust
pub mod audio_capture;
pub mod errors;
pub mod model_registry;
pub mod resampler;
pub mod whisper_engine;
```

- [ ] **Step 3: Verify with a fixture**

Add `src-tauri/fixtures/zh-short.wav` with a short Chinese sample recorded from the target microphone environment.

Run:

```bash
cd src-tauri
cargo test whisper_fixture -- --ignored
```

Expected:

```text
fixture transcript contains at least one expected Chinese keyword
```

### Task 7: Implement STT Session Lifecycle

**Files:**
- Create: `src-tauri/src/stt/session.rs`
- Create: `src-tauri/src/stt/events.rs`
- Modify: `src-tauri/src/stt/mod.rs`

- [ ] **Step 1: Add event payloads**

Create `src-tauri/src/stt/events.rs`:

```rust
use serde::Serialize;

pub const STT_STATUS_EVENT: &str = "stt://status";
pub const STT_TRANSCRIPT_EVENT: &str = "stt://transcript";

#[derive(Debug, Clone, Serialize)]
pub struct SttStatusPayload {
    pub status: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SttTranscriptPayload {
    pub kind: String,
    pub text: String,
    pub duration_ms: u128,
}
```

- [ ] **Step 2: Add session manager**

Create `src-tauri/src/stt/session.rs`:

```rust
use std::sync::Mutex;

use super::audio_capture::AudioCapture;
use super::errors::{SttError, SttResult};
use super::whisper_engine::{TranscriptionResult, WhisperEngine};

pub struct SttSessionManager {
    capture: Mutex<Option<AudioCapture>>,
    engine: Mutex<Option<WhisperEngine>>,
}

impl SttSessionManager {
    pub fn new(engine: WhisperEngine) -> Self {
        Self {
            capture: Mutex::new(None),
            engine: Mutex::new(Some(engine)),
        }
    }

    pub fn start(&self) -> SttResult<()> {
        let mut capture = self.capture.lock().map_err(|err| SttError::RuntimeFailed(err.to_string()))?;
        if capture.is_some() {
            return Ok(());
        }
        *capture = Some(AudioCapture::start()?);
        Ok(())
    }

    pub fn stop(&self) -> SttResult<TranscriptionResult> {
        let capture = self
            .capture
            .lock()
            .map_err(|err| SttError::RuntimeFailed(err.to_string()))?
            .take()
            .ok_or_else(|| SttError::RuntimeFailed("recording has not started".into()))?;
        let samples = capture.stop();
        let engine = self.engine.lock().map_err(|err| SttError::RuntimeFailed(err.to_string()))?;
        let engine = engine.as_ref().ok_or_else(|| SttError::RuntimeFailed("engine not initialized".into()))?;
        engine.transcribe_16khz_mono(&samples)
    }

    pub fn cancel(&self) -> SttResult<()> {
        self.capture.lock().map_err(|err| SttError::RuntimeFailed(err.to_string()))?.take();
        Ok(())
    }
}
```

- [ ] **Step 3: Export modules**

Modify `src-tauri/src/stt/mod.rs`:

```rust
pub mod audio_capture;
pub mod errors;
pub mod events;
pub mod model_registry;
pub mod resampler;
pub mod session;
pub mod whisper_engine;
```

- [ ] **Step 4: Add tests with fake engine**

Refactor `SttSessionManager` to accept a `Transcriber` trait if direct Whisper makes tests slow:

```rust
pub trait Transcriber: Send + Sync {
    fn transcribe_16khz_mono(&self, samples: &[f32]) -> SttResult<TranscriptionResult>;
}
```

Write a fake transcriber test:

```rust
#[test]
fn stop_returns_transcript_from_engine() {
    // Use fake capture and fake transcriber to avoid microphone dependency in unit tests.
}
```

- [ ] **Step 5: Verify**

Run:

```bash
cd src-tauri
cargo test stt::session
```

Expected:

```text
session tests pass without microphone hardware
```

### Task 8: Expose Tauri Commands To Frontend

**Files:**
- Create: `src-tauri/src/stt/commands.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Add command response types**

Create `src-tauri/src/stt/commands.rs`:

```rust
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use super::errors::SttError;
use super::events::{SttStatusPayload, SttTranscriptPayload, STT_STATUS_EVENT, STT_TRANSCRIPT_EVENT};
use super::session::SttSessionManager;

#[derive(Debug, Clone, Serialize)]
pub struct RuntimeHealth {
    pub status: String,
    pub endpoint: String,
    pub engine: String,
    pub message: String,
}

#[tauri::command]
pub fn stt_health() -> RuntimeHealth {
    RuntimeHealth {
        status: "ready".into(),
        endpoint: "tauri://local-stt".into(),
        engine: "whisper-rs".into(),
        message: "本地语音识别可用".into(),
    }
}

#[tauri::command]
pub fn stt_start(app: AppHandle, manager: State<SttSessionManager>) -> Result<(), SttError> {
    manager.start()?;
    let _ = app.emit(STT_STATUS_EVENT, SttStatusPayload { status: "recording".into(), message: "正在录音".into() });
    Ok(())
}

#[tauri::command]
pub fn stt_stop(app: AppHandle, manager: State<SttSessionManager>) -> Result<String, SttError> {
    let result = manager.stop()?;
    let _ = app.emit(
        STT_TRANSCRIPT_EVENT,
        SttTranscriptPayload { kind: "final".into(), text: result.text.clone(), duration_ms: result.duration_ms },
    );
    Ok(result.text)
}

#[tauri::command]
pub fn stt_cancel(manager: State<SttSessionManager>) -> Result<(), SttError> {
    manager.cancel()
}
```

- [ ] **Step 2: Register commands**

Modify `src-tauri/src/main.rs`:

```rust
mod stt;

use stt::commands::{stt_cancel, stt_health, stt_start, stt_stop};

fn main() {
    env_logger::init();
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![stt_health, stt_start, stt_stop, stt_cancel])
        .run(tauri::generate_context!())
        .expect("failed to run tauri app");
}
```

- [ ] **Step 3: Initialize manager with model**

Before `.run(...)`, resolve model resource path and call:

```rust
.manage(SttSessionManager::new(WhisperEngine::new(&resolved_model.path).expect("STT model unavailable")))
```

If initialization fails, manage a degraded runtime state and return `model-missing` from `stt_health`.

- [ ] **Step 4: Verify commands compile**

Run:

```bash
cd src-tauri
cargo check
```

Expected:

```text
Finished dev profile
```

### Task 9: Implement Frontend Tauri Runtime Adapter

**Files:**
- Create: `lib/desktop/tauri-speech-runtime.ts`
- Modify: `lib/providers/local-speech-runtime.ts`
- Test: `test/lib/desktop/tauri-speech-runtime.test.ts`

- [ ] **Step 1: Write adapter test**

Create `test/lib/desktop/tauri-speech-runtime.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"
import { createTauriSpeechRuntime } from "@/lib/desktop/tauri-speech-runtime"

describe("tauri speech runtime", () => {
  it("maps stt_health to local runtime health", async () => {
    const runtime = createTauriSpeechRuntime({
      invoke: vi.fn(async () => ({
        status: "ready",
        endpoint: "tauri://local-stt",
        engine: "whisper-rs",
        message: "本地语音识别可用",
      })),
      listen: vi.fn(),
    })

    await expect(runtime.ensureStarted()).resolves.toMatchObject({
      status: "ready",
      message: "本地语音识别可用",
    })
  })
})
```

- [ ] **Step 2: Implement adapter**

Create `lib/desktop/tauri-speech-runtime.ts`:

```ts
import type { LocalSpeechRuntimeBridge, LocalSpeechRuntimeHealth } from "@/types/local-speech-runtime"

type TauriApi = {
  invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>
  listen: <T>(event: string, handler: (event: { payload: T }) => void) => Promise<() => void>
}

export function createTauriSpeechRuntime(api: TauriApi): LocalSpeechRuntimeBridge {
  const getHealth = async () => api.invoke<LocalSpeechRuntimeHealth>("stt_health")
  return {
    ensureStarted: getHealth,
    restart: getHealth,
    getHealth,
  }
}
```

- [ ] **Step 3: Prefer Tauri bridge**

Modify `lib/providers/local-speech-runtime.ts`:

```ts
export function isTauriRuntimeAvailable() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}
```

Then initialize `window.gongkaoLocalSpeech` from Tauri in app startup.

- [ ] **Step 4: Verify**

Run:

```bash
npm run test -- test/lib/desktop/tauri-speech-runtime.test.ts
```

Expected:

```text
tauri speech runtime tests pass
```

### Task 10: Implement Desktop Speech Hook

**Files:**
- Create: `hooks/use-desktop-speech-input.ts`
- Modify: `app/practice/page.tsx`
- Modify: `app/review/page.tsx`
- Test: `test/hooks/use-desktop-speech-input.test.ts`

- [ ] **Step 1: Add transcript helper test**

Create `test/hooks/use-desktop-speech-input.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { appendFinalTranscript } from "@/hooks/use-desktop-speech-input"

describe("desktop speech input helpers", () => {
  it("appends final transcript once", () => {
    expect(appendFinalTranscript("", "推进治理")).toBe("推进治理")
    expect(appendFinalTranscript("已有内容", "推进治理")).toBe("已有内容推进治理")
  })
})
```

- [ ] **Step 2: Implement hook**

Create `hooks/use-desktop-speech-input.ts`:

```ts
"use client"

import { useCallback, useState } from "react"

export function appendFinalTranscript(previous: string, next: string) {
  return `${previous}${next.trim()}`
}

export function useDesktopSpeechInput() {
  const [recording, setRecording] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [partialText, setPartialText] = useState("")
  const [error, setError] = useState<string | null>(null)

  const start = useCallback(async () => {
    setError(null)
    setRecording(true)
    const { invoke } = await import("@tauri-apps/api/core")
    await invoke("stt_start")
  }, [])

  const stop = useCallback(async () => {
    setRecording(false)
    setProcessing(true)
    try {
      const { invoke } = await import("@tauri-apps/api/core")
      return await invoke<string>("stt_stop")
    } finally {
      setProcessing(false)
      setPartialText("")
    }
  }, [])

  const cancel = useCallback(async () => {
    setRecording(false)
    setProcessing(false)
    const { invoke } = await import("@tauri-apps/api/core")
    await invoke("stt_cancel")
  }, [])

  return { recording, processing, partialText, error, start, stop, cancel }
}
```

- [ ] **Step 3: Use desktop hook in pages**

In `app/practice/page.tsx` and `app/review/page.tsx`, choose the hook in this priority:

```ts
Tauri desktop hook -> existing realtime WebSocket hook -> legacy mock/API hook
```

- [ ] **Step 4: Verify**

Run:

```bash
npm run test -- test/hooks/use-desktop-speech-input.test.ts
npx tsc --noEmit
```

Expected:

```text
desktop speech hook tests pass
typecheck passes
```

### Task 11: Settings UI For Out-Of-Box Runtime

**Files:**
- Modify: `app/settings/page.tsx`
- Modify: `types/local-speech-runtime.ts`

- [ ] **Step 1: Add diagnostic fields**

Modify `types/local-speech-runtime.ts`:

```ts
export type LocalSpeechRuntimeHealth = {
  status: LocalSpeechRuntimeStatus
  endpoint: string
  engine: "vosk-streaming" | "whisper-rs"
  message: string
  modelLabel?: string
  modelPath?: string
  bundled?: boolean
  lastLatencyMs?: number
}
```

- [ ] **Step 2: Update normal settings copy**

In `app/settings/page.tsx`, local mode card must say:

```text
本地服务已内置离线识别模型。首次使用只需要允许麦克风权限，不需要 API Key、网络或本地服务地址。
```

- [ ] **Step 3: Add repair actions**

Add:

```tsx
<Button variant="outline" onClick={checkLocalRuntime}>检查本地识别</Button>
<Button variant="outline" onClick={repairLocalRuntime}>修复本地模型</Button>
```

`修复本地模型` should call a Tauri command `stt_repair_model` in desktop mode and show a clear failure in browser dev mode:

```text
当前浏览器开发模式不能修复内置模型，请运行桌面版。
```

- [ ] **Step 4: Advanced diagnostics**

Show only after clicking `高级诊断`:

```text
运行时: whisper-rs
模型: Whisper Small 中文默认
模型来源: installer bundled
模型路径: ...
最近识别耗时: ... ms
```

- [ ] **Step 5: Browser QA**

Open:

```text
http://localhost:3000/settings
```

Expected:

```text
normal local mode does not show endpoint/model inputs
advanced diagnostics are hidden by default
repair/check buttons are visible
```

### Task 12: End-To-End Offline QA

**Files:**
- Create: `docs/offline-stt-qa.md`

- [ ] **Step 1: Add QA checklist**

Create `docs/offline-stt-qa.md`:

```md
# Offline STT QA

## Windows Clean Machine

- Install packaged desktop app.
- Disconnect network.
- Launch app.
- Go to Settings > 语音识别.
- Select 本地服务.
- Confirm status becomes 本地识别可用.
- Go to 智能温故舱.
- Select 语音口述.
- Press and hold Space.
- Say: 推进基层治理现代化.
- Release Space.
- Confirm text appears in the answer area.
- Go to 申论演练舱.
- Select 完整口述.
- Record the same sentence.
- Confirm final text appears exactly once.

## Failure States

- Rename bundled model file and relaunch.
- Confirm settings shows 模型缺失.
- Deny microphone permission.
- Confirm UI shows 麦克风权限被拒绝.
- Record silence for 3 seconds.
- Confirm UI shows 未识别到有效语音.

## Network Privacy

- Block outbound network.
- Repeat transcription.
- Confirm feature still works.
- Confirm no API endpoint is required.
```

- [ ] **Step 2: Build desktop artifact**

Run:

```bash
npm run desktop:build
```

Expected:

```text
Windows installer artifact created
model file included in bundle resources
```

- [ ] **Step 3: Install and test**

Use a clean Windows profile or VM.

Expected:

```text
offline dictation works without terminal, API, model download, or internet
```

## Milestones

### Milestone 1: Desktop shell boots

Deliverable:

```text
npm run desktop:dev opens current app in Tauri window.
```

### Milestone 2: Model bundled and verified

Deliverable:

```text
npm run stt:bundle:verify passes and desktop build contains ggml-small.bin.
```

### Milestone 3: Rust STT backend transcribes fixture

Deliverable:

```text
cargo test whisper_fixture -- --ignored passes with Chinese fixture audio.
```

### Milestone 4: App UI receives desktop transcript

Deliverable:

```text
review and practice pages receive transcript from Tauri commands.
```

### Milestone 5: Clean-machine offline acceptance

Deliverable:

```text
Installed Windows app transcribes speech with network disabled.
```

## Risks

- **Installer size:** Bundling Whisper Small adds roughly hundreds of MB. Accept this for true out-of-box offline mode.
- **Model licensing:** Verify the exact model license before release. Do not ship a model without license confirmation.
- **Rust crate API drift:** `whisper-rs`, `vad-rs`, and Tauri APIs may require small signature changes during implementation.
- **Next static export:** If current Next app cannot export cleanly, Tauri can run a bundled local web server, but static export is preferred.
- **Microphone permissions:** Windows/macOS/Linux require different permission and signing workflows.
- **Latency:** Whisper Small may be slower on low-end CPUs. Add model selector later for smaller/faster models.

## Self-Review

Spec coverage:

- Out-of-box offline runtime: covered by Tauri shell, bundled model, Rust STT backend, and clean-machine QA.
- No user configuration: covered by settings UI rules and model packaging policy.
- Handy-style architecture: covered by Tauri/Rust/React split and audio/STT Rust modules.
- Existing app integration: covered by practice/review/settings modifications.
- Verification: covered by Vitest, Rust tests, fixture transcription, desktop build, and clean-machine offline QA.

Placeholder scan:

- Model hash is generated into `model-lock.json` by `scripts/download-stt-model.mjs` and verified by `scripts/verify-stt-bundle.mjs`.

Type consistency:

- Frontend health type uses `LocalSpeechRuntimeHealth`.
- Tauri command `stt_health` returns the same shape.
- Transcript flow uses final text returned from `stt_stop`.

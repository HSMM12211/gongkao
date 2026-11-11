# Handy-Style Local STT Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the current packaged offline STT MVP into a Handy-style local, reliable, in-app realtime speech input runtime that works after installation without endpoint, API key, Python service, or manual model setup.

**Architecture:** Keep the product scope inside this app only: Review and Practice use local dictation, Settings shows local runtime health and repair actions. Replace the current one-shot microphone buffer with a persistent Rust `cpal` recorder worker, frame-based `rubato` resampling, Silero VAD plus smoothing, background Whisper transcription, and richer Tauri events. Reuse the existing bundled `ggml-small.bin` model and existing frontend runtime facade instead of migrating Handy's global shortcut, tray, overlay, or paste-to-any-app behavior.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tauri 2, Rust, `cpal`, `rubato`, `vad-rs`, `ort`, `whisper-rs`, Vitest, Rust unit tests, Windows NSIS packaging.

---

## Current Baseline

The project already has a working offline STT packaging baseline:

- `src-tauri/resources/models/ggml-small.bin` exists and is bundled.
- `src-tauri/resources/models/model-lock.json` pins SHA256 `1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b`.
- `npm.cmd run stt:model:download` and `npm.cmd run stt:bundle:verify` are available.
- `npm.cmd run desktop:build` has produced a Windows NSIS installer.
- Current Rust modules are in `src-tauri/src/stt/`.
- Current frontend bridge is in `lib/desktop/tauri-speech-runtime.ts` and `hooks/use-desktop-speech-input.ts`.

The current runtime is still not a full Handy-style local dictation engine:

- `src-tauri/src/stt/audio_capture.rs` starts and stops a `cpal` stream per recording.
- `src-tauri/src/stt/resampler.rs` uses linear interpolation instead of frame-based `rubato::FftFixedIn`.
- `src-tauri/src/stt/vad.rs` uses Whisper VAD trimming after capture instead of realtime Silero VAD.
- `src-tauri/src/stt/session.rs` transcribes synchronously inside `stt_stop`.
- Settings does not expose enough local microphone and runtime diagnostics.

## Definition Of Done

- Selecting local speech mode requires no endpoint, API key, or user-side service configuration.
- In a packaged desktop app with network disabled, Review and Practice can record, stop, and insert recognized Chinese text.
- Recording uses one persistent microphone worker while the app is running, not a fresh stream for every capture.
- Incoming audio is converted to mono, resampled to 16 kHz, split into 30 ms frames, filtered by Silero VAD, and then sent to Whisper.
- Silence-only recordings return a clear empty-speech state, not a confusing failure.
- `stt_stop` does not block the Tauri command thread while Whisper inference runs.
- Settings can show microphone permission/device status, model status, VAD model status, and last latency.
- Users can run a local diagnostics check from Settings without editing fields.
- Desktop build verification checks both Whisper and Silero resources.
- Tests cover resampling, VAD smoothing, device error mapping, Tauri command status flow, frontend event handling, and settings mode rendering.
- `cargo check`, targeted Rust tests, `npm.cmd run test`, `npx.cmd tsc --noEmit`, `npm.cmd run stt:bundle:verify`, and `npm.cmd run desktop:build` pass.

## Non-Goals For This Phase

- Do not migrate Handy's global shortcut.
- Do not add tray behavior.
- Do not add overlay UI.
- Do not paste transcript into other applications.
- Do not add Handy's Parakeet, Moonshine, or SenseVoice engines.
- Do not replace the existing `ggml-small.bin` packaging pipeline.
- Do not require a local HTTP service or Python runtime.

## Handy Source Mapping

Use Handy as the reference for implementation shape, not for product surface.

| Capability | Handy source | Current app target |
|---|---|---|
| Persistent recorder worker | `docs/Handy-main/src-tauri/src/audio_toolkit/audio/recorder.rs` | `src-tauri/src/stt/audio/runtime.rs` |
| Device detection and microphone errors | `docs/Handy-main/src-tauri/src/commands/audio.rs` | `src-tauri/src/stt/audio/device.rs`, `src-tauri/src/stt/commands.rs` |
| Frame resampling | `docs/Handy-main/src-tauri/src/audio_toolkit/audio/resampler.rs` | `src-tauri/src/stt/audio/frame_resampler.rs` |
| Silero VAD | `docs/Handy-main/src-tauri/src/audio_toolkit/vad/silero.rs` | `src-tauri/src/stt/vad/silero.rs` |
| VAD smoothing | `docs/Handy-main/src-tauri/src/audio_toolkit/vad/smoothed.rs` | `src-tauri/src/stt/vad/smoothed.rs` |
| Model resource | `docs/Handy-main/src-tauri/resources/models/silero_vad_v4.onnx` | `src-tauri/resources/models/silero_vad_v4.onnx` |
| Background transcription manager | `docs/Handy-main/src-tauri/src/managers/transcription.rs` | `src-tauri/src/stt/session.rs` |
| Action/event lifecycle | `docs/Handy-main/src-tauri/src/actions.rs` | `src-tauri/src/stt/events.rs`, `lib/desktop/stt-events.ts` |

## Target Runtime Flow

```mermaid
flowchart LR
  A["Review or Practice button"] --> B["Tauri command: stt_start"]
  B --> C["Persistent cpal recorder worker"]
  C --> D["Mono conversion"]
  D --> E["rubato FftFixedIn resampler"]
  E --> F["30 ms 16 kHz frames"]
  F --> G["Silero VAD"]
  G --> H["Smoothed VAD prefill and hangover"]
  H --> I["Speech frame buffer"]
  I --> J["Tauri command: stt_stop"]
  J --> K["spawn_blocking Whisper transcription"]
  K --> L["stt://status and stt://transcript events"]
  L --> M["Insert transcript into app input"]
```

## File Structure

### Create

- `src-tauri/src/stt/audio/mod.rs`  
  Owns audio module exports.

- `src-tauri/src/stt/audio/device.rs`  
  Lists input devices and maps OS microphone errors into stable app statuses.

- `src-tauri/src/stt/audio/frame_resampler.rs`  
  Converts native microphone sample rate to 16 kHz and emits fixed 30 ms frames.

- `src-tauri/src/stt/audio/runtime.rs`  
  Persistent recorder worker based on Handy's command-channel pattern.

- `src-tauri/src/stt/vad/mod.rs`  
  Owns VAD module exports and shared VAD traits.

- `src-tauri/src/stt/vad/silero.rs`  
  Wraps `vad-rs` with `silero_vad_v4.onnx`.

- `src-tauri/src/stt/vad/smoothed.rs`  
  Adds prefill, onset, and hangover smoothing around Silero VAD.

- `src-tauri/resources/models/vad-source.json`  
  Documents Silero VAD source, filename, size, and bundling policy.

- `src-tauri/resources/models/vad-lock.json`  
  Pins the local Silero model SHA256 and byte size.

- `docs/offline-stt-runtime-qa.md`  
  Manual QA checklist for local mode after installer build.

### Modify

- `src-tauri/src/stt/mod.rs`  
  Replace top-level `audio_capture`, `resampler`, and flat `vad` exports with focused `audio` and `vad` modules.

- `src-tauri/src/stt/audio_capture.rs`  
  Retire after `audio/runtime.rs` is wired. Delete only when no module imports it.

- `src-tauri/src/stt/resampler.rs`  
  Retire after `audio/frame_resampler.rs` is wired. Delete only when no module imports it.

- `src-tauri/src/stt/vad.rs`  
  Move into the new `src-tauri/src/stt/vad/` folder. Rust cannot keep both `vad.rs` and `vad/mod.rs`.

- `src-tauri/src/stt/session.rs`  
  Own recorder lifecycle, runtime state, model health, VAD health, and background transcription.

- `src-tauri/src/stt/commands.rs`  
  Add microphone diagnostics commands and make `stt_stop` use non-blocking transcription flow.

- `src-tauri/src/stt/events.rs`  
  Add status payload fields for audio level, device label, VAD model status, empty speech, and diagnostics.

- `src-tauri/src/stt/errors.rs`  
  Add typed errors for `MicNotFound`, `MicDenied`, `VadModelMissing`, `NoSpeechDetected`, and `TranscriptionBusy`.

- `src-tauri/src/stt/model_registry.rs`  
  Resolve and verify both Whisper and Silero model resources.

- `src-tauri/tauri.conf.json`  
  Keep `resources/models/**/*` bundled and verify Chinese product metadata remains readable.

- `scripts/verify-stt-bundle.mjs`  
  Verify `ggml-small.bin`, `model-lock.json`, `silero_vad_v4.onnx`, and `vad-lock.json`.

- `scripts/download-stt-model.mjs`  
  Keep Whisper download behavior. Do not download Silero if copied from Handy; only generate/verify lock metadata.

- `lib/desktop/stt-events.ts`  
  Add typed event payload fields for local runtime diagnostics.

- `lib/desktop/tauri-speech-runtime.ts`  
  Expose health, diagnostics, start, stop, cancel, restart, and device commands through one facade.

- `hooks/use-desktop-speech-input.ts`  
  Track recording, processing, empty speech, errors, audio levels, and transcript events.

- `lib/providers/local-speech-runtime.ts`  
  In local mode, prefer Tauri runtime and hide endpoint requirements.

- `types/local-speech-runtime.ts`  
  Add stable local statuses and diagnostic payload types.

- `app/settings/page.tsx`  
  Show only local runtime status, test button, repair/restart, device status, and model information when local mode is selected.

- `app/review/page.tsx`  
  Use the desktop speech hook and show empty-speech or mic-denied state in the review voice input.

- `app/practice/page.tsx`  
  Use the desktop speech hook and show empty-speech or mic-denied state in the practice voice input.

- `test/lib/desktop/tauri-speech-runtime.test.ts`  
  Extend mocked Tauri command and event tests.

- `test/hooks/use-desktop-speech-input.test.ts`  
  Cover local event state transitions.

- `test/lib/providers/local-speech-runtime.test.ts`  
  Cover mode-specific local settings behavior.

## Task 1: Introduce Audio Module Boundaries

**Files:**
- Create: `src-tauri/src/stt/audio/mod.rs`
- Create: `src-tauri/src/stt/audio/device.rs`
- Modify: `src-tauri/src/stt/mod.rs`
- Test: Rust unit tests inside `src-tauri/src/stt/audio/device.rs`

- [ ] **Step 1: Create the audio module export file**

Create `src-tauri/src/stt/audio/mod.rs` with these exports:

```rust
pub mod device;
pub mod frame_resampler;
pub mod runtime;
```

- [ ] **Step 2: Add stable device diagnostic structs**

Create `src-tauri/src/stt/audio/device.rs` with this public surface:

```rust
use cpal::traits::{DeviceTrait, HostTrait};
use serde::Serialize;

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InputDeviceInfo {
  pub id: String,
  pub label: String,
  pub is_default: bool,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MicrophoneDiagnostic {
  pub status: String,
  pub message: String,
  pub default_device: Option<InputDeviceInfo>,
  pub devices: Vec<InputDeviceInfo>,
}

pub fn is_microphone_access_denied(error_message: &str) -> bool {
  let normalized = error_message.to_lowercase();
  normalized.contains("access is denied")
    || normalized.contains("permission denied")
    || normalized.contains("0x80070005")
    || normalized.contains("notallowederror")
}

pub fn is_no_input_device_error(error_message: &str) -> bool {
  let normalized = error_message.to_lowercase();
  normalized.contains("no input device found")
    || normalized.contains("default input device")
    || normalized.contains("device not available")
}

pub fn list_input_devices() -> MicrophoneDiagnostic {
  let host = cpal::default_host();
  let default_name = host
    .default_input_device()
    .and_then(|device| device.name().ok());

  let mut devices = Vec::new();
  if let Ok(iter) = host.input_devices() {
    for (index, device) in iter.enumerate() {
      let label = device.name().unwrap_or_else(|_| format!("Input Device {}", index + 1));
      let is_default = default_name.as_ref().is_some_and(|name| name == &label);
      devices.push(InputDeviceInfo {
        id: format!("input-{index}"),
        label,
        is_default,
      });
    }
  }

  let default_device = devices.iter().find(|device| device.is_default).cloned();
  let status = if devices.is_empty() { "mic-not-found" } else { "ready" };
  let message = if devices.is_empty() {
    "No microphone input device was found.".to_string()
  } else {
    "Microphone input device is available.".to_string()
  };

  MicrophoneDiagnostic {
    status: status.to_string(),
    message,
    default_device,
    devices,
  }
}
```

- [ ] **Step 3: Add device error mapping tests**

Append this test module to `src-tauri/src/stt/audio/device.rs`:

```rust
#[cfg(test)]
mod tests {
  use super::{is_microphone_access_denied, is_no_input_device_error};

  #[test]
  fn detects_windows_access_denied_messages() {
    assert!(is_microphone_access_denied("Access is denied"));
    assert!(is_microphone_access_denied("WASAPI error: 0x80070005"));
  }

  #[test]
  fn detects_permission_denied_messages() {
    assert!(is_microphone_access_denied("permission denied"));
    assert!(is_microphone_access_denied("NotAllowedError"));
  }

  #[test]
  fn ignores_unrelated_permission_messages() {
    assert!(!is_microphone_access_denied("device disconnected"));
  }

  #[test]
  fn detects_missing_input_device_messages() {
    assert!(is_no_input_device_error("No input device found"));
    assert!(is_no_input_device_error("default input device unavailable"));
    assert!(is_no_input_device_error("device not available"));
  }

  #[test]
  fn ignores_unrelated_missing_device_messages() {
    assert!(!is_no_input_device_error("permission denied"));
  }
}
```

- [ ] **Step 4: Wire the module**

Modify `src-tauri/src/stt/mod.rs`:

```rust
pub mod audio;
pub mod commands;
pub mod errors;
pub mod events;
pub mod model_registry;
pub mod session;
pub mod vad;
pub mod whisper_engine;
```

Keep `pub mod audio_capture;`, `pub mod resampler;`, and the flat `pub mod vad;` only until their imports have been moved in later tasks. The final form above is the target state for this plan.

- [ ] **Step 5: Run Rust tests for this module**

Run:

```powershell
$vsDevCmd = 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat'
$cmd = '"' + $vsDevCmd + '" -arch=x64 && set "PATH=C:\Program Files\LLVM\bin;C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin;%USERPROFILE%\.cargo\bin;%PATH%" && set "LIBCLANG_PATH=C:\Program Files\LLVM\bin" && cd /d D:\cursor-demo\gongkao\src-tauri && cargo test audio::device'
cmd.exe /d /s /c $cmd
```

Expected: all `audio::device` tests pass.

## Task 2: Replace Linear Resampling With Frame Resampling

**Files:**
- Create: `src-tauri/src/stt/audio/frame_resampler.rs`
- Modify: `src-tauri/src/stt/session.rs`
- Retire after wiring: `src-tauri/src/stt/resampler.rs`
- Test: Rust unit tests inside `src-tauri/src/stt/audio/frame_resampler.rs`

- [ ] **Step 1: Add the frame resampler implementation**

Create `src-tauri/src/stt/audio/frame_resampler.rs` using the Handy pattern:

```rust
use rubato::{FftFixedIn, Resampler};
use std::time::Duration;

const RESAMPLER_CHUNK_SIZE: usize = 1024;

pub struct FrameResampler {
  resampler: Option<FftFixedIn<f32>>,
  chunk_in: usize,
  in_buf: Vec<f32>,
  frame_samples: usize,
  pending: Vec<f32>,
}

impl FrameResampler {
  pub fn new(in_hz: usize, out_hz: usize, frame_duration: Duration) -> Self {
    let frame_samples = ((out_hz as f64 * frame_duration.as_secs_f64()).round()) as usize;
    assert!(frame_samples > 0, "frame duration must produce at least one sample");
    let resampler = (in_hz != out_hz).then(|| {
      FftFixedIn::<f32>::new(in_hz, out_hz, RESAMPLER_CHUNK_SIZE, 1, 1)
        .expect("failed to create frame resampler")
    });

    Self {
      resampler,
      chunk_in: RESAMPLER_CHUNK_SIZE,
      in_buf: Vec::with_capacity(RESAMPLER_CHUNK_SIZE),
      frame_samples,
      pending: Vec::with_capacity(frame_samples),
    }
  }

  pub fn push(&mut self, mut src: &[f32], mut emit: impl FnMut(&[f32])) {
    if self.resampler.is_none() {
      self.emit_frames(src, &mut emit);
      return;
    }

    while !src.is_empty() {
      let space = self.chunk_in - self.in_buf.len();
      let take = space.min(src.len());
      self.in_buf.extend_from_slice(&src[..take]);
      src = &src[take..];

      if self.in_buf.len() == self.chunk_in {
        if let Ok(out) = self.resampler.as_mut().unwrap().process(&[&self.in_buf[..]], None) {
          self.emit_frames(&out[0], &mut emit);
        }
        self.in_buf.clear();
      }
    }
  }

  pub fn finish(&mut self, mut emit: impl FnMut(&[f32])) {
    if let Some(resampler) = self.resampler.as_mut() {
      if !self.in_buf.is_empty() {
        self.in_buf.resize(self.chunk_in, 0.0);
        if let Ok(out) = resampler.process(&[&self.in_buf[..]], None) {
          self.emit_frames(&out[0], &mut emit);
        }
      }
    }

    if !self.pending.is_empty() {
      self.pending.resize(self.frame_samples, 0.0);
      emit(&self.pending);
      self.pending.clear();
    }
  }
}

impl FrameResampler {
  fn emit_frames(&mut self, mut data: &[f32], emit: &mut impl FnMut(&[f32])) {
    while !data.is_empty() {
      let space = self.frame_samples - self.pending.len();
      let take = space.min(data.len());
      self.pending.extend_from_slice(&data[..take]);
      data = &data[take..];

      if self.pending.len() == self.frame_samples {
        emit(&self.pending);
        self.pending.clear();
      }
    }
  }
}
```

- [ ] **Step 2: Add resampler tests**

Append tests:

```rust
#[cfg(test)]
mod tests {
  use super::FrameResampler;
  use std::time::Duration;

  #[test]
  fn emits_30_ms_frames_when_input_is_already_16khz() {
    let mut resampler = FrameResampler::new(16_000, 16_000, Duration::from_millis(30));
    let input = vec![0.1; 960];
    let mut frames = Vec::new();
    resampler.push(&input, |frame| frames.push(frame.to_vec()));

    assert_eq!(frames.len(), 2);
    assert_eq!(frames[0].len(), 480);
    assert_eq!(frames[1].len(), 480);
  }

  #[test]
  fn finish_pads_partial_frame() {
    let mut resampler = FrameResampler::new(16_000, 16_000, Duration::from_millis(30));
    let input = vec![0.1; 240];
    let mut frames = Vec::new();
    resampler.push(&input, |frame| frames.push(frame.to_vec()));
    resampler.finish(|frame| frames.push(frame.to_vec()));

    assert_eq!(frames.len(), 1);
    assert_eq!(frames[0].len(), 480);
    assert_eq!(frames[0][0], 0.1);
    assert_eq!(frames[0][239], 0.1);
    assert_eq!(frames[0][240], 0.0);
  }
}
```

- [ ] **Step 3: Keep the old linear resampler callable until the recorder is replaced**

Do not delete `src-tauri/src/stt/resampler.rs` in this task. It remains used by the current `SttSessionManager` until Task 5.

- [ ] **Step 4: Run resampler tests**

Run:

```powershell
$vsDevCmd = 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat'
$cmd = '"' + $vsDevCmd + '" -arch=x64 && set "PATH=C:\Program Files\LLVM\bin;C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin;%USERPROFILE%\.cargo\bin;%PATH%" && set "LIBCLANG_PATH=C:\Program Files\LLVM\bin" && cd /d D:\cursor-demo\gongkao\src-tauri && cargo test frame_resampler'
cmd.exe /d /s /c $cmd
```

Expected: frame resampler tests pass.

## Task 3: Add Silero VAD Resources And Lock Verification

**Files:**
- Copy: `docs/Handy-main/src-tauri/resources/models/silero_vad_v4.onnx` to `src-tauri/resources/models/silero_vad_v4.onnx`
- Create: `src-tauri/resources/models/vad-source.json`
- Create: `src-tauri/resources/models/vad-lock.json`
- Modify: `scripts/verify-stt-bundle.mjs`
- Modify: `src-tauri/src/stt/model_registry.rs`
- Modify: `src-tauri/src/stt/errors.rs`
- Test: `npm.cmd run stt:bundle:verify`

- [ ] **Step 1: Copy the Silero model resource**

Run:

```powershell
Copy-Item -LiteralPath 'D:\cursor-demo\gongkao\docs\Handy-main\src-tauri\resources\models\silero_vad_v4.onnx' -Destination 'D:\cursor-demo\gongkao\src-tauri\resources\models\silero_vad_v4.onnx' -Force
```

Expected: `src-tauri/resources/models/silero_vad_v4.onnx` exists and has size `1807522`.

- [ ] **Step 2: Create VAD source metadata**

Create `src-tauri/resources/models/vad-source.json`:

```json
{
  "defaultVadId": "silero-vad-v4",
  "models": [
    {
      "id": "silero-vad-v4",
      "label": "Silero VAD v4",
      "filename": "silero_vad_v4.onnx",
      "sizeBytes": 1807522,
      "sampleRate": 16000,
      "frameMs": 30,
      "bundled": true,
      "source": "docs/Handy-main/src-tauri/resources/models/silero_vad_v4.onnx"
    }
  ]
}
```

- [ ] **Step 3: Generate VAD lock metadata**

Run this PowerShell command:

```powershell
$path = 'D:\cursor-demo\gongkao\src-tauri\resources\models\silero_vad_v4.onnx'
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash.ToLowerInvariant()
$length = (Get-Item -LiteralPath $path).Length
$json = @{
  defaultVadId = 'silero-vad-v4'
  generatedAt = (Get-Date).ToUniversalTime().ToString('o')
  models = @(
    @{
      id = 'silero-vad-v4'
      filename = 'silero_vad_v4.onnx'
      sha256 = $hash
      sizeBytes = $length
    }
  )
} | ConvertTo-Json -Depth 5
Set-Content -LiteralPath 'D:\cursor-demo\gongkao\src-tauri\resources\models\vad-lock.json' -Value $json -Encoding UTF8
Get-Content -LiteralPath 'D:\cursor-demo\gongkao\src-tauri\resources\models\vad-lock.json'
```

Expected: the JSON contains `filename`, `sha256`, and `sizeBytes`.

- [ ] **Step 4: Extend bundle verification**

Modify `scripts/verify-stt-bundle.mjs` so it validates both resource locks. The final checks must include:

```js
const requiredFiles = [
  "model-source.json",
  "model-lock.json",
  "ggml-small.bin",
  "vad-source.json",
  "vad-lock.json",
  "silero_vad_v4.onnx",
];
```

Add a `verifyLockedFile(lockFilename, sourceFilename)` helper that reads the lock file, checks the referenced file exists, checks `sizeBytes`, and checks SHA256 with Node `crypto.createHash("sha256")`.

- [ ] **Step 5: Add VAD model resolution**

First add this variant to `src-tauri/src/stt/errors.rs`:

```rust
#[error("local VAD model is missing or invalid")]
VadModelMissing,
```

Update the frontend serialization for `SttError` so this variant maps to code `vad-model-missing`.

Then modify `src-tauri/src/stt/model_registry.rs` to add these VAD structs and resolver:

```rust
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VadManifest {
  pub default_vad_id: String,
  pub models: Vec<VadInfo>,
}

#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VadInfo {
  pub id: String,
  pub label: String,
  pub filename: String,
  pub sha256: Option<String>,
  pub size_bytes: u64,
  pub sample_rate: u32,
  pub frame_ms: u32,
  pub bundled: bool,
  pub source: Option<String>,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedVadModel {
  pub path: std::path::PathBuf,
  pub info: VadInfo,
}

fn load_vad_manifest(app: &tauri::AppHandle) -> SttResult<VadManifest> {
  let path = app
    .path()
    .resolve("models/vad-lock.json", tauri::path::BaseDirectory::Resource)
    .map_err(|err| SttError::RuntimeFailed(err.to_string()))?;
  let file = std::fs::File::open(&path).map_err(|_| SttError::VadModelMissing)?;
  serde_json::from_reader(file).map_err(|err| SttError::RuntimeFailed(err.to_string()))
}

pub fn resolve_default_vad_model(app: &tauri::AppHandle) -> SttResult<ResolvedVadModel> {
  let manifest = load_vad_manifest(app)?;
  let VadManifest {
    default_vad_id,
    models,
  } = manifest;
  let info = models
    .into_iter()
    .find(|model| model.id == default_vad_id)
    .ok_or(SttError::VadModelMissing)?;
  let path = app
    .path()
    .resolve(format!("models/{}", info.filename), tauri::path::BaseDirectory::Resource)
    .map_err(|err| SttError::RuntimeFailed(err.to_string()))?;

  if !path.exists() {
    return Err(SttError::VadModelMissing);
  }
  if path.metadata().map_err(|_| SttError::VadModelMissing)?.len() != info.size_bytes {
    return Err(SttError::VadModelMissing);
  }
  if let Some(expected) = info.sha256.as_deref() {
    let actual = sha256_file(&path).map_err(|_| SttError::VadModelMissing)?;
    if actual != expected {
      return Err(SttError::VadModelMissing);
    }
  }

  Ok(ResolvedVadModel { info, path })
}
```

- [ ] **Step 6: Verify resources**

Run:

```powershell
npm.cmd run stt:bundle:verify
```

Expected: verification passes and prints both Whisper and Silero resource success messages.

## Task 4: Implement Silero And Smoothed VAD Modules

**Files:**
- Replace: `src-tauri/src/stt/vad.rs` with folder `src-tauri/src/stt/vad/`
- Create: `src-tauri/src/stt/vad/mod.rs`
- Create: `src-tauri/src/stt/vad/silero.rs`
- Create: `src-tauri/src/stt/vad/smoothed.rs`
- Modify: `src-tauri/src/stt/errors.rs`
- Test: Rust unit tests inside `src-tauri/src/stt/vad/smoothed.rs`

- [ ] **Step 1: Create VAD trait and constants**

Create `src-tauri/src/stt/vad/mod.rs`:

```rust
pub mod silero;
pub mod smoothed;

pub const VAD_SAMPLE_RATE: u32 = 16_000;
pub const VAD_FRAME_MS: u32 = 30;
pub const VAD_FRAME_SAMPLES: usize = (VAD_SAMPLE_RATE as usize * VAD_FRAME_MS as usize) / 1000;

pub enum VadFrame<'a> {
  Speech(&'a [f32]),
  Noise,
}

pub trait VoiceActivityDetector: Send {
  fn push_frame<'a>(&'a mut self, frame: &'a [f32]) -> anyhow::Result<VadFrame<'a>>;
  fn is_voice(&mut self, frame: &[f32]) -> anyhow::Result<bool> {
    Ok(matches!(self.push_frame(frame)?, VadFrame::Speech(_)))
  }
  fn reset(&mut self);
}
```

- [ ] **Step 2: Add Silero wrapper**

Create `src-tauri/src/stt/vad/silero.rs`:

```rust
use std::path::Path;
use vad_rs::Vad;

use super::{VadFrame, VoiceActivityDetector, VAD_FRAME_SAMPLES, VAD_SAMPLE_RATE};

pub struct SileroVad {
  engine: Vad,
  threshold: f32,
}

impl SileroVad {
  pub fn new(model_path: impl AsRef<Path>, threshold: f32) -> anyhow::Result<Self> {
    if !(0.0..=1.0).contains(&threshold) {
      anyhow::bail!("threshold must be between 0.0 and 1.0");
    }

    Ok(Self {
      engine: Vad::new(model_path.as_ref(), VAD_SAMPLE_RATE as usize)
        .map_err(|error| anyhow::anyhow!("failed to create Silero VAD: {error}"))?,
      threshold,
    })
  }
}

impl VoiceActivityDetector for SileroVad {
  fn push_frame<'a>(&'a mut self, frame: &'a [f32]) -> anyhow::Result<VadFrame<'a>> {
    if frame.len() != VAD_FRAME_SAMPLES {
      anyhow::bail!("expected {VAD_FRAME_SAMPLES} samples, got {}", frame.len());
    }

    let result = self
      .engine
      .compute(frame)
      .map_err(|error| anyhow::anyhow!("Silero VAD error: {error}"))?;

    if result.prob > self.threshold {
      Ok(VadFrame::Speech(frame))
    } else {
      Ok(VadFrame::Noise)
    }
  }

  fn reset(&mut self) {}
}
```

- [ ] **Step 3: Add smoothed VAD**

Create `src-tauri/src/stt/vad/smoothed.rs` with Handy's smoothing behavior:

```rust
use std::collections::VecDeque;

use super::{VadFrame, VoiceActivityDetector};

pub struct SmoothedVad {
  inner_vad: Box<dyn VoiceActivityDetector>,
  prefill_frames: usize,
  hangover_frames: usize,
  onset_frames: usize,
  frame_buffer: VecDeque<Vec<f32>>,
  hangover_counter: usize,
  onset_counter: usize,
  in_speech: bool,
  temp_out: Vec<f32>,
}

impl SmoothedVad {
  pub fn new(
    inner_vad: Box<dyn VoiceActivityDetector>,
    prefill_frames: usize,
    hangover_frames: usize,
    onset_frames: usize,
  ) -> Self {
    Self {
      inner_vad,
      prefill_frames,
      hangover_frames,
      onset_frames,
      frame_buffer: VecDeque::new(),
      hangover_counter: 0,
      onset_counter: 0,
      in_speech: false,
      temp_out: Vec::new(),
    }
  }
}

impl VoiceActivityDetector for SmoothedVad {
  fn push_frame<'a>(&'a mut self, frame: &'a [f32]) -> anyhow::Result<VadFrame<'a>> {
    self.frame_buffer.push_back(frame.to_vec());
    while self.frame_buffer.len() > self.prefill_frames + 1 {
      self.frame_buffer.pop_front();
    }

    let is_voice = self.inner_vad.is_voice(frame)?;

    match (self.in_speech, is_voice) {
      (false, true) => {
        self.onset_counter += 1;
        if self.onset_counter >= self.onset_frames {
          self.in_speech = true;
          self.hangover_counter = self.hangover_frames;
          self.onset_counter = 0;
          self.temp_out.clear();
          for buffered in &self.frame_buffer {
            self.temp_out.extend(buffered);
          }
          Ok(VadFrame::Speech(&self.temp_out))
        } else {
          Ok(VadFrame::Noise)
        }
      }
      (true, true) => {
        self.hangover_counter = self.hangover_frames;
        Ok(VadFrame::Speech(frame))
      }
      (true, false) => {
        if self.hangover_counter > 0 {
          self.hangover_counter -= 1;
          Ok(VadFrame::Speech(frame))
        } else {
          self.in_speech = false;
          Ok(VadFrame::Noise)
        }
      }
      (false, false) => {
        self.onset_counter = 0;
        Ok(VadFrame::Noise)
      }
    }
  }

  fn reset(&mut self) {
    self.frame_buffer.clear();
    self.hangover_counter = 0;
    self.onset_counter = 0;
    self.in_speech = false;
    self.temp_out.clear();
    self.inner_vad.reset();
  }
}
```

- [ ] **Step 4: Add smoothed VAD tests**

Add a fake detector and tests in `src-tauri/src/stt/vad/smoothed.rs`:

```rust
#[cfg(test)]
mod tests {
  use super::SmoothedVad;
  use crate::stt::vad::{VadFrame, VoiceActivityDetector};

  struct FakeVad {
    decisions: Vec<bool>,
    index: usize,
  }

  impl FakeVad {
    fn new(decisions: Vec<bool>) -> Self {
      Self { decisions, index: 0 }
    }
  }

  impl VoiceActivityDetector for FakeVad {
    fn push_frame<'a>(&'a mut self, frame: &'a [f32]) -> anyhow::Result<VadFrame<'a>> {
      let decision = self.decisions.get(self.index).copied().unwrap_or(false);
      self.index += 1;
      if decision { Ok(VadFrame::Speech(frame)) } else { Ok(VadFrame::Noise) }
    }

    fn reset(&mut self) {
      self.index = 0;
    }
  }

  #[test]
  fn requires_onset_before_speech_starts() {
    let mut vad = SmoothedVad::new(Box::new(FakeVad::new(vec![true, true])), 1, 1, 2);
    let frame = vec![0.2; 480];

    assert!(matches!(vad.push_frame(&frame).unwrap(), VadFrame::Noise));
    assert!(matches!(vad.push_frame(&frame).unwrap(), VadFrame::Speech(_)));
  }

  #[test]
  fn keeps_hangover_frame_after_voice_ends() {
    let mut vad = SmoothedVad::new(Box::new(FakeVad::new(vec![true, false, false])), 0, 1, 1);
    let frame = vec![0.2; 480];

    assert!(matches!(vad.push_frame(&frame).unwrap(), VadFrame::Speech(_)));
    assert!(matches!(vad.push_frame(&frame).unwrap(), VadFrame::Speech(_)));
    assert!(matches!(vad.push_frame(&frame).unwrap(), VadFrame::Noise));
  }
}
```

- [ ] **Step 5: Add typed no-speech error**

Modify `src-tauri/src/stt/errors.rs` to include this variant:

```rust
#[error("no speech was detected")]
NoSpeechDetected,
```

Update the `Serialize` implementation or `serde` conversion so frontend receives stable code `no-speech-detected`.

- [ ] **Step 6: Run VAD tests**

Run:

```powershell
$vsDevCmd = 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat'
$cmd = '"' + $vsDevCmd + '" -arch=x64 && set "PATH=C:\Program Files\LLVM\bin;C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin;%USERPROFILE%\.cargo\bin;%PATH%" && set "LIBCLANG_PATH=C:\Program Files\LLVM\bin" && cd /d D:\cursor-demo\gongkao\src-tauri && cargo test vad'
cmd.exe /d /s /c $cmd
```

Expected: VAD tests pass.

## Task 5: Replace One-Shot Capture With Persistent Recorder Worker

**Files:**
- Create: `src-tauri/src/stt/audio/runtime.rs`
- Modify: `src-tauri/src/stt/session.rs`
- Retire after wiring: `src-tauri/src/stt/audio_capture.rs`
- Test: Rust unit tests inside `src-tauri/src/stt/audio/runtime.rs` for pure state helpers

- [ ] **Step 1: Add recorder command and status types**

Create `src-tauri/src/stt/audio/runtime.rs` with this public surface:

```rust
use std::sync::{mpsc, Arc, Mutex};
use std::thread::JoinHandle;

use cpal::{Device, Stream};

use crate::stt::vad::VoiceActivityDetector;

pub enum RecorderCommand {
  Start,
  Stop(mpsc::Sender<Vec<f32>>),
  Shutdown,
}

enum AudioChunk {
  Samples(Vec<f32>),
  EndOfStream,
}

pub struct LocalAudioRuntime {
  device: Option<Device>,
  cmd_tx: Option<mpsc::Sender<RecorderCommand>>,
  worker_handle: Option<JoinHandle<()>>,
  vad: Option<Arc<Mutex<Box<dyn VoiceActivityDetector>>>>,
  level_tx: Option<mpsc::Sender<Vec<f32>>>,
}
```

- [ ] **Step 2: Implement recorder lifecycle**

Implement these methods in `LocalAudioRuntime`:

```rust
impl LocalAudioRuntime {
  pub fn new(vad: Option<Box<dyn VoiceActivityDetector>>) -> Self;
  pub fn open(&mut self, device: Option<Device>) -> crate::stt::errors::SttResult<()>;
  pub fn start(&self) -> crate::stt::errors::SttResult<()>;
  pub fn stop(&self) -> crate::stt::errors::SttResult<Vec<f32>>;
  pub fn close(&mut self);
}
```

Implementation requirements:

- `open` creates a worker thread once and keeps the `cpal::Stream` alive inside that worker.
- The audio callback converts all supported sample formats to mono `f32`.
- The worker uses `FrameResampler::new(input_rate, 16_000, Duration::from_millis(30))`.
- The worker calls `SmoothedVad` on 30 ms frames.
- `Stop` flushes the resampler with `finish`, sends final speech samples to the reply channel, and clears the recording buffer.
- `Shutdown` stops the stream and joins the worker thread.
- Microphone errors are mapped with `audio::device::is_microphone_access_denied` and `audio::device::is_no_input_device_error`.

- [ ] **Step 3: Keep sample conversion deterministic**

Implement conversion functions equivalent to the current `audio_capture.rs` behavior:

```rust
fn push_mono_f32(data: &[f32], channels: usize, sink: &mut Vec<f32>);
fn push_mono_i16(data: &[i16], channels: usize, sink: &mut Vec<f32>);
fn push_mono_u16(data: &[u16], channels: usize, sink: &mut Vec<f32>);
```

Expected conversion rules:

- Mono input is copied directly.
- Multi-channel input is averaged per frame.
- `i16` maps to `sample as f32 / i16::MAX as f32`.
- `u16` maps to `sample as f32 / u16::MAX as f32 * 2.0 - 1.0`.

- [ ] **Step 4: Add conversion tests**

Add tests in `src-tauri/src/stt/audio/runtime.rs`:

```rust
#[cfg(test)]
mod tests {
  use super::{push_mono_f32, push_mono_i16, push_mono_u16};

  #[test]
  fn averages_stereo_f32() {
    let mut output = Vec::new();
    push_mono_f32(&[0.0, 1.0, -1.0, 1.0], 2, &mut output);
    assert_eq!(output, vec![0.5, 0.0]);
  }

  #[test]
  fn converts_i16_to_f32() {
    let mut output = Vec::new();
    push_mono_i16(&[i16::MAX, 0], 1, &mut output);
    assert_eq!(output[0], 1.0);
    assert_eq!(output[1], 0.0);
  }

  #[test]
  fn converts_u16_to_centered_f32() {
    let mut output = Vec::new();
    push_mono_u16(&[0, u16::MAX], 1, &mut output);
    assert_eq!(output[0], -1.0);
    assert_eq!(output[1], 1.0);
  }
}
```

- [ ] **Step 5: Wire session start and stop through the worker**

Modify `src-tauri/src/stt/session.rs` so `RuntimeState` owns:

```rust
recorder: Option<LocalAudioRuntime>,
recording_started_at: Option<std::time::Instant>,
```

`start` behavior:

- If the engine is missing, return `SttError::ModelMissing`.
- If recorder is missing, resolve Silero VAD model, build `SileroVad`, wrap in `SmoothedVad`, create `LocalAudioRuntime`, and call `open(None)`.
- Call `recorder.start()`.
- Set health status to `recording`.

`stop` behavior:

- Call `recorder.stop()`.
- If returned samples are shorter than 3200 samples, return `SttError::NoSpeechDetected`.
- Pass samples to background transcription in Task 6.

- [ ] **Step 6: Run recorder tests and cargo check**

Run:

```powershell
$vsDevCmd = 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat'
$cmd = '"' + $vsDevCmd + '" -arch=x64 && set "PATH=C:\Program Files\LLVM\bin;C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin;%USERPROFILE%\.cargo\bin;%PATH%" && set "LIBCLANG_PATH=C:\Program Files\LLVM\bin" && cd /d D:\cursor-demo\gongkao\src-tauri && cargo test audio::runtime && cargo check'
cmd.exe /d /s /c $cmd
```

Expected: runtime conversion tests pass and `cargo check` completes.

## Task 6: Move Whisper Transcription Off The Command Path

**Files:**
- Modify: `src-tauri/src/stt/session.rs`
- Modify: `src-tauri/src/stt/commands.rs`
- Modify: `src-tauri/src/stt/events.rs`
- Modify: `src-tauri/src/stt/errors.rs`
- Test: Rust state tests inside `src-tauri/src/stt/session.rs`

- [ ] **Step 1: Add runtime statuses**

Modify `LocalSpeechRuntimeHealth` in `src-tauri/src/stt/session.rs`:

```rust
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalSpeechRuntimeHealth {
  pub status: String,
  pub endpoint: String,
  pub engine: String,
  pub message: String,
  pub model_label: Option<String>,
  pub model_path: Option<String>,
  pub vad_label: Option<String>,
  pub vad_path: Option<String>,
  pub device_label: Option<String>,
  pub bundled: Option<bool>,
  pub last_latency_ms: Option<u128>,
}
```

Stable statuses:

- `starting`
- `ready`
- `recording`
- `processing`
- `empty-speech`
- `mic-denied`
- `mic-not-found`
- `model-missing`
- `vad-model-missing`
- `busy`
- `failed`

- [ ] **Step 2: Add busy protection**

Modify `RuntimeState`:

```rust
struct RuntimeState {
  health: LocalSpeechRuntimeHealth,
  engine: Option<Arc<WhisperEngine>>,
  recorder: Option<LocalAudioRuntime>,
  is_processing: bool,
}
```

Rules:

- `start` returns `SttError::TranscriptionBusy` if `is_processing` is true.
- `stop` sets `is_processing` to true before spawning Whisper work.
- Whisper completion sets `is_processing` to false.
- `cancel` clears recorder recording state but does not unload the engine.

- [ ] **Step 3: Spawn blocking Whisper work**

Refactor `stt_stop` in `src-tauri/src/stt/commands.rs`:

```rust
#[tauri::command]
pub async fn stt_stop(
  app: AppHandle,
  manager: State<'_, SttSessionManager>,
) -> Result<String, SttError> {
  let samples = manager.finish_recording()?;
  emit_status(&app, &manager.health(), "processing", "Recognizing local speech");

  let result = manager.transcribe_samples_blocking(samples).await?;

  app.emit(STT_TRANSCRIPT_EVENT, SttTranscriptPayload {
    kind: "final".into(),
    text: result.text.clone(),
    duration_ms: result.duration_ms,
  }).ok();

  let ready_health = manager.mark_ready_after_transcription(result.duration_ms)?;
  emit_status(&app, &ready_health, "ready", &ready_health.message);
  Ok(result.text)
}
```

Implement `transcribe_samples_blocking` using `tauri::async_runtime::spawn_blocking` and a cloned `Arc<WhisperEngine>`.

- [ ] **Step 4: Emit empty speech as a product state**

If `finish_recording` returns `SttError::NoSpeechDetected`, `stt_stop` must emit:

```rust
emit_status(&app, &manager.health(), "empty-speech", "No clear speech was detected");
```

Then return an empty string `Ok(String::new())` so frontend can keep the input unchanged and show a hint.

- [ ] **Step 5: Add state tests**

Add pure tests around state transitions in `src-tauri/src/stt/session.rs` using helper functions:

```rust
#[cfg(test)]
mod tests {
  use super::LocalSpeechRuntimeHealth;

  #[test]
  fn health_status_values_are_stable() {
    let allowed = [
      "starting",
      "ready",
      "recording",
      "processing",
      "empty-speech",
      "mic-denied",
      "mic-not-found",
      "model-missing",
      "vad-model-missing",
      "busy",
      "failed",
    ];

    assert!(allowed.contains(&"ready"));
  }

  #[test]
  fn ready_health_can_include_vad_and_device_metadata() {
    let health = LocalSpeechRuntimeHealth {
      status: "ready".into(),
      endpoint: "tauri://local-stt".into(),
      engine: "whisper-rs".into(),
      message: "Local speech recognition is ready.".into(),
      model_label: Some("Whisper Small".into()),
      model_path: Some("resources/models/ggml-small.bin".into()),
      vad_label: Some("Silero VAD v4".into()),
      vad_path: Some("resources/models/silero_vad_v4.onnx".into()),
      device_label: Some("Default Microphone".into()),
      bundled: Some(true),
      last_latency_ms: Some(1200),
    };

    assert_eq!(health.status, "ready");
    assert_eq!(health.vad_label.as_deref(), Some("Silero VAD v4"));
  }
}
```

- [ ] **Step 6: Run command and state verification**

Run:

```powershell
$vsDevCmd = 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat'
$cmd = '"' + $vsDevCmd + '" -arch=x64 && set "PATH=C:\Program Files\LLVM\bin;C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin;%USERPROFILE%\.cargo\bin;%PATH%" && set "LIBCLANG_PATH=C:\Program Files\LLVM\bin" && cd /d D:\cursor-demo\gongkao\src-tauri && cargo test session && cargo check'
cmd.exe /d /s /c $cmd
```

Expected: session tests pass and async command signatures compile.

## Task 7: Add Microphone Diagnostics Tauri Commands

**Files:**
- Modify: `src-tauri/src/stt/commands.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src-tauri/src/stt/events.rs`
- Test: Frontend Tauri bridge tests in Task 8

- [ ] **Step 1: Add commands**

Add these command functions to `src-tauri/src/stt/commands.rs`:

```rust
#[tauri::command]
pub fn stt_list_input_devices() -> crate::stt::audio::device::MicrophoneDiagnostic {
  crate::stt::audio::device::list_input_devices()
}

#[tauri::command]
pub fn stt_open_microphone_privacy_settings() -> Result<(), SttError> {
  #[cfg(target_os = "windows")]
  {
    std::process::Command::new("cmd")
      .args(["/C", "start", "ms-settings:privacy-microphone"])
      .spawn()
      .map_err(|error| SttError::RuntimeFailed(error.to_string()))?;
    return Ok(());
  }

  #[cfg(not(target_os = "windows"))]
  {
    Err(SttError::RuntimeFailed("microphone privacy settings shortcut is only available on Windows".into()))
  }
}
```

- [ ] **Step 2: Register commands**

Modify `src-tauri/src/main.rs` so the Tauri invoke handler includes:

```rust
stt_list_input_devices,
stt_open_microphone_privacy_settings,
```

Keep existing commands:

```rust
stt_health,
stt_start,
stt_stop,
stt_cancel,
stt_restart,
```

- [ ] **Step 3: Add event payload fields**

Modify `src-tauri/src/stt/events.rs` so `SttStatusPayload` includes:

```rust
pub vad_label: Option<String>,
pub vad_path: Option<String>,
pub device_label: Option<String>,
pub audio_level: Option<Vec<f32>>,
```

Update every construction of `SttStatusPayload` in `src-tauri/src/stt/commands.rs` to include the new fields.

- [ ] **Step 4: Run cargo check**

Run:

```powershell
$vsDevCmd = 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat'
$cmd = '"' + $vsDevCmd + '" -arch=x64 && set "PATH=C:\Program Files\LLVM\bin;C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin;%USERPROFILE%\.cargo\bin;%PATH%" && set "LIBCLANG_PATH=C:\Program Files\LLVM\bin" && cd /d D:\cursor-demo\gongkao\src-tauri && cargo check'
cmd.exe /d /s /c $cmd
```

Expected: command registration compiles.

## Task 8: Update Frontend Desktop Speech Bridge

**Files:**
- Modify: `types/local-speech-runtime.ts`
- Modify: `lib/desktop/stt-events.ts`
- Modify: `lib/desktop/tauri-speech-runtime.ts`
- Modify: `hooks/use-desktop-speech-input.ts`
- Test: `test/lib/desktop/tauri-speech-runtime.test.ts`
- Test: `test/hooks/use-desktop-speech-input.test.ts`

- [ ] **Step 1: Add TypeScript runtime types**

Modify `types/local-speech-runtime.ts`:

```ts
export type LocalSpeechStatus =
  | "starting"
  | "ready"
  | "recording"
  | "processing"
  | "empty-speech"
  | "mic-denied"
  | "mic-not-found"
  | "model-missing"
  | "vad-model-missing"
  | "busy"
  | "failed";

export type LocalSpeechRuntimeHealth = {
  status: LocalSpeechStatus;
  endpoint: string;
  engine: string;
  message: string;
  modelLabel?: string;
  modelPath?: string;
  vadLabel?: string;
  vadPath?: string;
  deviceLabel?: string;
  bundled?: boolean;
  lastLatencyMs?: number;
};

export type LocalSpeechInputDevice = {
  id: string;
  label: string;
  isDefault: boolean;
};

export type LocalSpeechMicrophoneDiagnostic = {
  status: LocalSpeechStatus | "ready";
  message: string;
  defaultDevice?: LocalSpeechInputDevice;
  devices: LocalSpeechInputDevice[];
};
```

- [ ] **Step 2: Extend Tauri event types**

Modify `lib/desktop/stt-events.ts`:

```ts
export type SttStatusEventPayload = LocalSpeechRuntimeHealth & {
  audioLevel?: number[];
};

export type SttTranscriptEventPayload = {
  kind: "partial" | "final";
  text: string;
  durationMs?: number;
};
```

- [ ] **Step 3: Extend runtime facade**

Modify `lib/desktop/tauri-speech-runtime.ts` so the exported runtime supports:

```ts
export type TauriSpeechRuntime = {
  isAvailable: () => Promise<boolean>;
  health: () => Promise<LocalSpeechRuntimeHealth>;
  start: () => Promise<LocalSpeechRuntimeHealth>;
  stop: () => Promise<string>;
  cancel: () => Promise<LocalSpeechRuntimeHealth>;
  restart: () => Promise<LocalSpeechRuntimeHealth>;
  listInputDevices: () => Promise<LocalSpeechMicrophoneDiagnostic>;
  openMicrophonePrivacySettings: () => Promise<void>;
  onStatus: (handler: (payload: SttStatusEventPayload) => void) => Promise<() => void>;
  onTranscript: (handler: (payload: SttTranscriptEventPayload) => void) => Promise<() => void>;
};
```

Map commands to these Tauri invoke names:

- `stt_health`
- `stt_start`
- `stt_stop`
- `stt_cancel`
- `stt_restart`
- `stt_list_input_devices`
- `stt_open_microphone_privacy_settings`

- [ ] **Step 4: Update desktop speech hook**

Modify `hooks/use-desktop-speech-input.ts` so it returns:

```ts
{
  isAvailable,
  status,
  message,
  transcript,
  error,
  isRecording,
  isProcessing,
  audioLevel,
  health,
  microphoneDiagnostic,
  start,
  stop,
  cancel,
  restart,
  refreshDiagnostics,
  openMicrophonePrivacySettings,
}
```

Rules:

- `empty-speech` keeps `transcript` unchanged.
- `mic-denied` sets `error` to a user-facing microphone permission message.
- `processing` disables record buttons.
- `recording` shows active microphone state.
- `final` transcript appends or replaces according to the existing page behavior.

- [ ] **Step 5: Extend bridge tests**

Update `test/lib/desktop/tauri-speech-runtime.test.ts` to assert command names:

```ts
it("calls microphone diagnostics command", async () => {
  const runtime = createTauriSpeechRuntime(mockTauri);
  await runtime.listInputDevices();
  expect(mockTauri.invoke).toHaveBeenCalledWith("stt_list_input_devices");
});

it("opens microphone privacy settings through Tauri", async () => {
  const runtime = createTauriSpeechRuntime(mockTauri);
  await runtime.openMicrophonePrivacySettings();
  expect(mockTauri.invoke).toHaveBeenCalledWith("stt_open_microphone_privacy_settings");
});
```

- [ ] **Step 6: Extend hook tests**

Add a pure helper to `hooks/use-desktop-speech-input.ts` so hook state transitions can be tested without a browser:

```ts
export type DesktopSpeechViewState = {
  status: LocalSpeechStatus;
  transcript: string;
  error?: string;
  isProcessing: boolean;
};

export function reduceDesktopSpeechStatus(
  current: DesktopSpeechViewState,
  payload: SttStatusEventPayload,
): DesktopSpeechViewState {
  if (payload.status === "empty-speech") {
    return { ...current, status: "empty-speech", isProcessing: false };
  }
  if (payload.status === "mic-denied") {
    return {
      ...current,
      status: "mic-denied",
      isProcessing: false,
      error: payload.message,
    };
  }
  return {
    ...current,
    status: payload.status,
    isProcessing: payload.status === "processing",
    error: undefined,
  };
}
```

Update `test/hooks/use-desktop-speech-input.test.ts` with these concrete tests:

```ts
it("does not overwrite text when empty speech is reported", async () => {
  const current = {
    status: "recording" as const,
    transcript: "already typed",
    isProcessing: true,
  };

  const next = reduceDesktopSpeechStatus(current, {
    status: "empty-speech",
    endpoint: "tauri://local-stt",
    engine: "whisper-rs",
    message: "No clear speech was detected",
  });

  expect(next.transcript).toBe("already typed");
  expect(next.status).toBe("empty-speech");
  expect(next.isProcessing).toBe(false);
});

it("marks processing while stop waits for final transcript", async () => {
  const current = {
    status: "recording" as const,
    transcript: "",
    isProcessing: false,
  };

  const next = reduceDesktopSpeechStatus(current, {
    status: "processing",
    endpoint: "tauri://local-stt",
    engine: "whisper-rs",
    message: "Recognizing local speech",
  });

  expect(next.status).toBe("processing");
  expect(next.isProcessing).toBe(true);
});
```

- [ ] **Step 7: Run frontend tests**

Run:

```powershell
npm.cmd run test -- test/lib/desktop/tauri-speech-runtime.test.ts test/hooks/use-desktop-speech-input.test.ts
```

Expected: desktop bridge and hook tests pass.

## Task 9: Make Settings Local Mode Truly Configuration-Free

**Files:**
- Modify: `app/settings/page.tsx`
- Modify: `lib/providers/local-speech-runtime.ts`
- Modify: `test/lib/providers/local-speech-runtime.test.ts`

- [ ] **Step 1: Keep local mode free of endpoint and key fields**

Modify `app/settings/page.tsx` so local speech mode renders:

- Local runtime status card.
- `Test Connection` button.
- `Restart Local Engine` button.
- `Refresh Microphone` button.
- `Open Microphone Privacy Settings` button on Windows desktop.
- Whisper model label and hash status.
- Silero VAD label and hash status.
- Default microphone label.

Do not render these fields when the mode is local:

- API Endpoint
- API Key
- WebSocket URL
- Faster-Whisper local service endpoint

- [ ] **Step 2: Make local test connection call the desktop runtime**

In `app/settings/page.tsx`, wire the test button behavior:

```ts
async function testLocalSpeechRuntime() {
  const health = await tauriSpeechRuntime.health();
  const diagnostic = await tauriSpeechRuntime.listInputDevices();
  setLocalSpeechHealth(health);
  setMicrophoneDiagnostic(diagnostic);
}
```

Expected UI states:

- `ready`: show local recognition is available.
- `mic-denied`: show permission repair action.
- `mic-not-found`: show no input device found.
- `model-missing`: show bundled Whisper model is missing.
- `vad-model-missing`: show bundled VAD model is missing.
- `failed`: show local runtime error message.

- [ ] **Step 3: Update provider logic**

Modify `lib/providers/local-speech-runtime.ts`:

```ts
export function shouldRequireSpeechEndpoint(mode: string) {
  return mode === "api" || mode === "websocket" || mode === "faster-whisper";
}
```

Local mode must not fail validation because endpoint fields are empty.

- [ ] **Step 4: Add provider tests**

Add or update tests in `test/lib/providers/local-speech-runtime.test.ts`:

```ts
it("does not require endpoint fields for local mode", () => {
  expect(shouldRequireSpeechEndpoint("local")).toBe(false);
});

it("requires endpoint fields for cloud or service modes", () => {
  expect(shouldRequireSpeechEndpoint("api")).toBe(true);
  expect(shouldRequireSpeechEndpoint("websocket")).toBe(true);
  expect(shouldRequireSpeechEndpoint("faster-whisper")).toBe(true);
});
```

- [ ] **Step 5: Run settings tests**

Run:

```powershell
npm.cmd run test -- test/lib/providers/local-speech-runtime.test.ts
npx.cmd tsc --noEmit
```

Expected: provider tests pass and TypeScript compiles.

## Task 10: Integrate Runtime States In Review And Practice

**Files:**
- Modify: `app/review/page.tsx`
- Modify: `app/practice/page.tsx`
- Modify: `hooks/use-desktop-speech-input.ts`
- Test: `test/hooks/use-desktop-speech-input.test.ts`

- [ ] **Step 1: Normalize voice button states**

In both pages, map hook state to button state:

```ts
const isVoiceBusy = speech.status === "processing" || speech.status === "starting";
const isVoiceRecording = speech.status === "recording";
const canStartVoice = speech.isAvailable && !isVoiceBusy && !isVoiceRecording;
```

- [ ] **Step 2: Keep text input stable on empty speech**

When `speech.status === "empty-speech"`, show a compact hint near the voice control and do not clear or replace current text.

- [ ] **Step 3: Show microphone permission state**

When `speech.status === "mic-denied"`, show a compact action that calls:

```ts
speech.openMicrophonePrivacySettings();
```

This action should only appear in desktop local mode.

- [ ] **Step 4: Insert final transcript consistently**

Use one helper in each page:

```ts
function applyVoiceTranscript(text: string) {
  const normalized = text.trim();
  if (!normalized) return;
  setAnswer((current) => current ? `${current}\n${normalized}` : normalized);
}
```

Use the existing state setter name in each page. Do not introduce a second answer store.

- [ ] **Step 5: Run page-related frontend verification**

Run:

```powershell
npm.cmd run test -- test/hooks/use-desktop-speech-input.test.ts
npx.cmd tsc --noEmit
```

Expected: hook tests pass and both pages typecheck.

## Task 11: Add Optional Debug Capture For Troubleshooting

**Files:**
- Modify: `src-tauri/src/stt/session.rs`
- Modify: `src-tauri/src/stt/commands.rs`
- Modify: `lib/desktop/tauri-speech-runtime.ts`
- Modify: `app/settings/page.tsx`

- [ ] **Step 1: Add last capture diagnostics path**

Add an optional field to `LocalSpeechRuntimeHealth`:

```rust
pub last_capture_samples: Option<usize>,
```

This gives support-level visibility without writing audio files by default.

- [ ] **Step 2: Add debug WAV only behind an explicit command**

Add this command:

```rust
#[tauri::command]
pub fn stt_save_last_capture_for_debug(manager: State<'_, SttSessionManager>) -> Result<String, SttError> {
  manager.save_last_capture_for_debug()
}
```

Rules:

- Save to the app data directory.
- Filename pattern: `stt-debug-last-capture.wav`.
- WAV format: mono 16 kHz f32 or i16 PCM.
- Return the absolute path.
- Do not save every recording automatically.

- [ ] **Step 3: Expose it only in advanced diagnostics**

In Settings, place the action under an advanced diagnostics disclosure:

```text
Save Last Recording For Diagnostics
```

Do not show it in the normal local mode card.

- [ ] **Step 4: Verify command compiles**

Run:

```powershell
$vsDevCmd = 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat'
$cmd = '"' + $vsDevCmd + '" -arch=x64 && set "PATH=C:\Program Files\LLVM\bin;C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin;%USERPROFILE%\.cargo\bin;%PATH%" && set "LIBCLANG_PATH=C:\Program Files\LLVM\bin" && cd /d D:\cursor-demo\gongkao\src-tauri && cargo check'
cmd.exe /d /s /c $cmd
```

Expected: diagnostics command compiles.

## Task 12: Packaging And Manual QA Closure

**Files:**
- Create: `docs/offline-stt-runtime-qa.md`
- Modify: `scripts/verify-stt-bundle.mjs`
- Verify: packaged installer

- [ ] **Step 1: Write manual QA checklist**

Create `docs/offline-stt-runtime-qa.md`:

```markdown
# Offline STT Runtime QA

## Build

- Run `npm.cmd run stt:bundle:verify`.
- Run `npm.cmd run desktop:build`.
- Confirm the NSIS installer exists under `src-tauri/target/release/bundle/nsis/`.

## Clean Install

- Install the generated Windows package.
- Launch the app.
- Open Settings.
- Select local speech mode.
- Confirm no endpoint or API key fields are shown.
- Click Test Connection.
- Confirm Whisper model, Silero VAD model, and microphone status are visible.

## Offline Test

- Disable network.
- Relaunch the app.
- Open Review.
- Record a Chinese sentence for 5 seconds.
- Stop recording.
- Confirm recognized text appears in the input area.
- Open Practice.
- Record a Chinese answer outline.
- Stop recording.
- Confirm recognized text appears in the input area.

## Failure States

- Deny microphone permission in Windows privacy settings.
- Click Test Connection.
- Confirm the app shows microphone permission guidance.
- Disconnect input devices or disable the microphone.
- Click Test Connection.
- Confirm the app shows no microphone found.
- Temporarily rename `silero_vad_v4.onnx`.
- Launch the app.
- Confirm status is `vad-model-missing`.
```

- [ ] **Step 2: Run full verification**

Run:

```powershell
npm.cmd run stt:bundle:verify
npm.cmd run test
npx.cmd tsc --noEmit
```

Expected:

- Bundle verification passes for Whisper and Silero.
- Vitest suite passes.
- TypeScript compile passes.

- [ ] **Step 3: Run Rust verification**

Run:

```powershell
$vsDevCmd = 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat'
$cmd = '"' + $vsDevCmd + '" -arch=x64 && set "PATH=C:\Program Files\LLVM\bin;C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin;%USERPROFILE%\.cargo\bin;%PATH%" && set "LIBCLANG_PATH=C:\Program Files\LLVM\bin" && cd /d D:\cursor-demo\gongkao\src-tauri && cargo test && cargo check'
cmd.exe /d /s /c $cmd
```

Expected:

- Rust tests pass.
- `cargo check` passes.

- [ ] **Step 4: Build desktop installer**

Run:

```powershell
npm.cmd run desktop:build
```

Expected:

- NSIS installer is generated under `src-tauri/target/release/bundle/nsis/`.
- Build log includes bundle verification before packaging.

- [ ] **Step 5: Perform manual QA**

Follow `docs/offline-stt-runtime-qa.md`.

The feature is accepted only after:

- Local mode works with network disabled.
- Review and Practice both insert transcript text.
- Settings diagnostics correctly show model, VAD, and microphone status.
- Empty speech does not erase input text.
- Microphone permission denial gives a repair path.

## Implementation Order

1. Task 1: Audio module boundaries.
2. Task 2: Frame resampler.
3. Task 3: Silero model resource and lock verification.
4. Task 4: Silero and smoothed VAD.
5. Task 5: Persistent recorder worker.
6. Task 6: Background Whisper transcription.
7. Task 7: Microphone diagnostics commands.
8. Task 8: Frontend bridge and hook updates.
9. Task 9: Settings local mode.
10. Task 10: Review and Practice integration.
11. Task 11: Optional debug capture.
12. Task 12: Packaging and manual QA closure.

## Risk Controls

- Keep the current working offline Whisper MVP intact until Task 5 is wired and verified.
- Copy only the Silero VAD resource from Handy. Do not migrate Handy's global dictation behavior.
- Use the current pinned dependency versions first: `vad-rs = "0.1.5"`, `ort = "=2.0.0-rc.9"`, `ort-sys = "=2.0.0-rc.9"`.
- If `vad-rs 0.1.5` API differs from Handy's source, adapt only `src-tauri/src/stt/vad/silero.rs`; do not change the rest of the runtime contract.
- Keep transcript insertion page-local. Do not add a global text input bus.
- Keep model downloads out of app runtime. Installer resources are the default offline path.
- Before release, document the source and license status for `silero_vad_v4.onnx` in `vad-source.json` and release notes.

## Final Verification Command Set

Run these before claiming completion:

```powershell
npm.cmd run stt:bundle:verify
npm.cmd run test
npx.cmd tsc --noEmit
```

Then run:

```powershell
$vsDevCmd = 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat'
$cmd = '"' + $vsDevCmd + '" -arch=x64 && set "PATH=C:\Program Files\LLVM\bin;C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin;%USERPROFILE%\.cargo\bin;%PATH%" && set "LIBCLANG_PATH=C:\Program Files\LLVM\bin" && cd /d D:\cursor-demo\gongkao\src-tauri && cargo test && cargo check'
cmd.exe /d /s /c $cmd
```

Then run:

```powershell
npm.cmd run desktop:build
```

Manual desktop QA is still required because microphone permission, device enumeration, and packaged resource resolution cannot be fully proven by unit tests.

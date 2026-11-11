# Offline STT QA

## Windows Clean Machine

- Install the packaged desktop app.
- Disconnect network.
- Launch the app.
- Go to Settings > 语音识别.
- Select 本地服务.
- Confirm status becomes 本地离线语音识别可用.
- Go to 智能温故.
- Select 语音口述.
- Press and hold Space.
- Say: 推进基层治理现代化.
- Release Space.
- Confirm text appears in the answer area.
- Go to 申论演练.
- Select 完整口述.
- Record the same sentence.
- Confirm final text appears exactly once.

## Failure States

- Rename the bundled model file and relaunch.
- Confirm settings shows model missing.
- Deny microphone permission.
- Confirm UI shows microphone permission denied.
- Record silence for 3 seconds.
- Confirm UI shows no effective speech recognized.

## Network Privacy

- Block outbound network.
- Repeat transcription.
- Confirm local mode still works.
- Confirm no API endpoint, API key, or external local service address is required.

## Build Prerequisites

- Rust MSVC toolchain installed.
- Visual Studio Build Tools installed with the Visual C++ workload, including `link.exe`.
- Tauri CLI dependency installed in the workspace.
- Run `npm run stt:model:download` before packaging, then `npm run desktop:build`.

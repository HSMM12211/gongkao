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

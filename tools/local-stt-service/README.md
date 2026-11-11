# Local STT Service

This development sidecar exposes local realtime speech recognition for the Next.js app.

This README is for development and packaging work only. Normal users must not be asked to start this service manually; the desktop host will start it automatically.

## Setup

```bash
cd tools/local-stt-service
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

Download a Chinese Vosk model and place it at:

```text
tools/local-stt-service/models/vosk-model-small-cn-0.22
```

## Run

```bash
python server.py
```

The app uses this internal development endpoint:

```text
ws://127.0.0.1:8787/stt
```

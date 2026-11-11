import asyncio
import json
import os

from websockets.server import serve
from vosk import KaldiRecognizer, Model


DEFAULT_MODEL_PATH = os.environ.get("VOSK_MODEL_PATH", "models/vosk-model-small-cn-0.22")
DEFAULT_SAMPLE_RATE = int(os.environ.get("STT_SAMPLE_RATE", "16000"))


async def handle_stt(websocket):
    recognizer = None
    sample_rate = DEFAULT_SAMPLE_RATE

    async for message in websocket:
        if isinstance(message, str):
            data = json.loads(message)

            if data.get("type") == "ping":
                await websocket.send(
                    json.dumps({"type": "ready", "engine": "vosk", "sampleRate": sample_rate}, ensure_ascii=False)
                )
                continue

            if data.get("type") == "start":
                sample_rate = int(data.get("sampleRate") or DEFAULT_SAMPLE_RATE)
                model_path = data.get("modelPath") or DEFAULT_MODEL_PATH
                if not os.path.isdir(model_path):
                    await websocket.send(
                        json.dumps({"type": "error", "message": f"模型目录不存在: {model_path}"}, ensure_ascii=False)
                    )
                    continue

                model = Model(model_path)
                recognizer = KaldiRecognizer(model, sample_rate)
                recognizer.SetWords(True)
                await websocket.send(
                    json.dumps({"type": "ready", "engine": "vosk", "sampleRate": sample_rate}, ensure_ascii=False)
                )
                continue

            if data.get("type") == "stop":
                if recognizer:
                    result = json.loads(recognizer.FinalResult())
                    text = result.get("text", "").replace(" ", "")
                    if text:
                        await websocket.send(json.dumps({"type": "final", "text": text}, ensure_ascii=False))
                await websocket.close()
                return

        if isinstance(message, bytes) and recognizer:
            if recognizer.AcceptWaveform(message):
                result = json.loads(recognizer.Result())
                text = result.get("text", "").replace(" ", "")
                if text:
                    await websocket.send(json.dumps({"type": "final", "text": text}, ensure_ascii=False))
            else:
                partial = json.loads(recognizer.PartialResult()).get("partial", "").replace(" ", "")
                if partial:
                    await websocket.send(json.dumps({"type": "partial", "text": partial}, ensure_ascii=False))


async def main():
    async with serve(handle_stt, "127.0.0.1", 8787, max_size=None):
        print("Local STT service listening on ws://127.0.0.1:8787/stt")
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())

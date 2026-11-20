# Karevia Studio

Karevia is an in-progress video editing and generation workspace. The browser editor can import, trim and export clips locally in browsers supporting MP4 MediaRecorder. The iOS app contains a native editor that still requires a signed build and physical-device verification. The workstation API is a single-owner local service with a queue and FFmpeg rendering.

## Start on Windows

Install Node.js 24, Python 3.10 or later and FFmpeg with FFprobe on PATH. From the repository root:

```powershell
npm ci
python -m venv .venv
.venv/Scripts/python -m pip install -r services/api/requirements-dev.txt
npm run dev -w apps/web
```

Open http://127.0.0.1:3000. The sample clip is provided for trying the editor. Imported files remain in the browser's local storage.

To enable the workstation API, use a second terminal:

```powershell
.venv/Scripts/python services/api/main.py provision
$env:STUDIO_WHISPER_MODEL = "C:/AI/downloads/karevia-whisper-tiny.bin"
.venv/Scripts/python services/api/main.py serve
```

The provision command prompts for a workspace credential. Enter a unique, randomly generated ASCII credential with at least 32 characters, store it in a password manager, and enter it in the web app's AI Production screen. The API listens on 127.0.0.1:8787. Loopback refers to the device making the request, so an iPhone requires a separately configured secure connection to the workstation.

The optional model path above enables caption jobs when that verified local model and a whisper-enabled FFmpeg are installed. Subtitles are generated on the workstation and downloaded as editable SRT. The iOS caption controls and sharing still require physical-device verification.

Text-to-video and image-to-video become available only after the corresponding local Wan/ComfyUI checks pass on this workstation. See [progress](PROGRESS.md) for current evidence and [editing](docs/editing.md) for assembling clips with music and subtitles.

## Checks

```powershell
npm run typecheck
npm run lint
npm run format:check
npm test
.venv/Scripts/python -m pytest tests/api
python -m unittest discover -s services/llm-router
python -m unittest discover -s tools
```

The iOS export currently fails on this Windows machine because Application Control blocks the unsigned Hermes compiler. TestFlight and App Store release require Apple signing, a physical device and the release checks in [the acceptance criteria](ACCEPTANCE_CRITERIA.md).

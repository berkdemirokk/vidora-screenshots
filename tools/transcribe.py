"""Generate editable SRT captions locally with FFmpeg's whisper.cpp filter."""

import argparse
import json
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path


def transcribe(source, model, output, language="auto", cancelled=lambda: False):
    source, model = source.resolve(strict=True), model.resolve(strict=True)
    output = output.resolve()
    if not source.is_file() or not model.is_file():
        raise ValueError("Source and model must be files")
    if output.suffix.lower() != ".srt" or output.exists():
        raise ValueError("Choose a new SRT output file")
    if language not in {"auto", "tr", "en"}:
        raise ValueError("Supported language choices: auto, tr, en")
    with tempfile.TemporaryDirectory(dir=output.parent) as scratch:
        work = Path(scratch)
        # Simple fixed names keep user paths out of FFmpeg filter expressions.
        try:
            os.link(model, work / "model.bin")
        except OSError:
            shutil.copyfile(model, work / "model.bin")
        with subprocess.Popen(
            [
                "ffmpeg",
                "-nostdin",
                "-v",
                "error",
                "-protocol_whitelist",
                "file",
                "-i",
                str(source),
                "-map",
                "0:a:0",
                "-af",
                f"whisper=model=model.bin:destination=captions.srt:format=srt:language={language}:use_gpu=0:queue=30",
                "-f",
                "null",
                "-",
            ],
            cwd=work,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        ) as process:
            deadline = time.monotonic() + 600
            try:
                while process.poll() is None:
                    if cancelled():
                        raise ValueError("Transcription cancelled")
                    if time.monotonic() > deadline:
                        raise TimeoutError("Transcription timed out")
                    time.sleep(0.1)
                if process.returncode:
                    raise ValueError("Transcription failed")
            finally:
                if process.poll() is None:
                    process.kill()
                    process.wait()
        captions = work / "captions.srt"
        if not captions.is_file() or captions.stat().st_size == 0:
            raise ValueError("Transcription failed or produced no speech")
        # Create atomically and refuse to overwrite another process's output.
        os.link(captions, output)
        return {"bytes": output.stat().st_size, "output": str(output)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--language", choices=["auto", "tr", "en"], default="auto")
    args = parser.parse_args()
    print(json.dumps(transcribe(args.source, args.model, args.output, args.language)))

import io
import math
import shutil
import struct
import subprocess
import tempfile
import wave
from pathlib import Path
from typing import Protocol, cast

import httpx


class TTSProvider(Protocol):
    async def synthesize(self, text: str, voice: str, language: str = "English") -> bytes: ...


class FakeTTS:
    """A short, deterministic beep WAV used by tests and offline previews."""

    async def synthesize(self, text: str, voice: str, language: str = "English") -> bytes:
        duration = max(0.2, len(text.split()) / 2.5)
        rate = 24000
        frames = bytearray()
        for index in range(round(duration * rate)):
            value = int(1800 * math.sin(2 * math.pi * 440 * index / rate))
            frames.extend(struct.pack("<h", value))
        output = io.BytesIO()
        with wave.open(output, "wb") as audio:
            audio.setnchannels(1)
            audio.setsampwidth(2)
            audio.setframerate(rate)
            audio.writeframes(bytes(frames))
        return output.getvalue()


class KokoroProvider:
    """HTTP adapter for the isolated Python 3.12 Kokoro service."""

    def __init__(self, base_url: str = "http://tts:8002") -> None:
        self.base_url = base_url.rstrip("/")

    async def synthesize(self, text: str, voice: str, language: str = "English") -> bytes:
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(
                f"{self.base_url}/synthesize",
                json={"text": text, "voice": voice, "language": language},
            )
            response.raise_for_status()
            return response.content


class OpenAITTSProvider:
    def __init__(self, api_key: str, model: str = "gpt-4o-mini-tts") -> None:
        self.api_key = api_key
        self.model = model

    async def synthesize(self, text: str, voice: str, language: str = "English") -> bytes:
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(
                "https://api.openai.com/v1/audio/speech",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={"model": self.model, "voice": voice, "input": text, "response_format": "wav"},
            )
            response.raise_for_status()
            return response.content


def make_tts_provider(
    provider: str, *, base_url: str, api_key: str, model: str = "gpt-4o-mini-tts"
) -> TTSProvider:
    if provider == "fake":
        return FakeTTS()
    if provider == "kokoro":
        return KokoroProvider(base_url)
    if provider == "openai":
        if not api_key:
            raise ValueError("OPENAI_API_KEY is required for OpenAI TTS")
        return OpenAITTSProvider(api_key, model)
    raise ValueError(f"unsupported TTS provider: {provider}")


def _ffmpeg(ffmpeg: str | None) -> str:
    if ffmpeg:
        return ffmpeg
    installed = shutil.which("ffmpeg")
    if installed:
        return installed
    try:
        import imageio_ffmpeg  # type: ignore[import-untyped]

        return cast(str, imageio_ffmpeg.get_ffmpeg_exe())
    except ImportError as exc:
        raise RuntimeError("ffmpeg is required to stitch MP3 output") from exc


def stitch_mp3(
    segments: list[bytes], *, expected_seconds: float, ffmpeg: str | None = None
) -> bytes:
    """Join WAV speech turns and time-adjust the MP3 to the requested spoken duration."""
    if not segments or expected_seconds <= 0:
        raise ValueError("Audio segments and a positive target duration are required")
    with tempfile.TemporaryDirectory(prefix="studio-audio-") as directory:
        root = Path(directory)
        entries: list[str] = []
        for index, data in enumerate(segments):
            path = root / f"turn-{index:04d}.wav"
            path.write_bytes(data)
            entries.append(f"file '{path.as_posix()}'")
        listing = root / "segments.txt"
        listing.write_text("\n".join(entries), encoding="utf-8")
        output = root / "overview.mp3"
        speed = max(0.5, min(2.0, _input_duration(segments) / expected_seconds))
        audio_filter = f"aresample=44100,atempo={speed:.6f}"
        result = subprocess.run(
            [
                _ffmpeg(ffmpeg),
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(listing),
                "-filter:a",
                audio_filter,
                "-codec:a",
                "libmp3lame",
                "-q:a",
                "4",
                "-f",
                "mp3",
                str(output),
            ],
            capture_output=True,
            check=False,
        )
        if result.returncode:
            raise RuntimeError(
                f"ffmpeg failed to stitch audio: {result.stderr.decode(errors='replace')[:400]}"
            )
        return output.read_bytes()


def _input_duration(segments: list[bytes]) -> float:
    total = 0.0
    for data in segments:
        with wave.open(io.BytesIO(data), "rb") as audio:
            total += audio.getnframes() / audio.getframerate()
    return total


def mp3_duration(data: bytes, *, ffmpeg: str | None = None) -> float:
    with tempfile.TemporaryDirectory(prefix="studio-probe-") as directory:
        path = Path(directory) / "audio.mp3"
        path.write_bytes(data)
        result = subprocess.run(
            [_ffmpeg(ffmpeg), "-hide_banner", "-i", str(path)], capture_output=True, check=False
        )
        import re

        match = re.search(rb"Duration: (\d+):(\d+):(\d+(?:\.\d+)?)", result.stderr)
        if not match:
            raise ValueError("ffmpeg could not read generated MP3 duration")
        hours, minutes, seconds = match.groups()
        return int(hours) * 3600 + int(minutes) * 60 + float(seconds)

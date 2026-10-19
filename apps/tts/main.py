from functools import lru_cache
from io import BytesIO
from threading import Lock

import soundfile as sf  # type: ignore[import-not-found]
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from kokoro import KPipeline  # type: ignore[import-not-found]
from pydantic import BaseModel, Field

app = FastAPI(title="OpenNotebook Kokoro TTS")
_pipelines: dict[str, KPipeline] = {}
_lock = Lock()
LANGUAGE_CODES = {
    "English": "a",
    "British English": "b",
    "Spanish": "e",
    "French": "f",
    "Hindi": "h",
}


class SynthesizeIn(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    voice: str = Field(default="af_heart", min_length=2, max_length=30)
    language: str = "English"


@lru_cache(maxsize=5)
def pipeline(language: str) -> KPipeline:
    code = LANGUAGE_CODES.get(language)
    if code is None:
        raise ValueError("Language is not supported by this Kokoro service")
    with _lock:
        if code not in _pipelines:
            _pipelines[code] = KPipeline(lang_code=code)
        return _pipelines[code]


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/synthesize")
def synthesize(body: SynthesizeIn) -> Response:
    try:
        generator = pipeline(body.language)(body.text, voice=body.voice)
        chunks = [audio for _graphemes, _phonemes, audio in generator]
        if not chunks:
            raise ValueError("Kokoro returned no audio")
        import numpy as np

        output = BytesIO()
        sf.write(output, np.concatenate(chunks), 24000, format="WAV", subtype="PCM_16")
        return Response(output.getvalue(), media_type="audio/wav")
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc

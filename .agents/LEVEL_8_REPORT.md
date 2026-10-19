# Level 8 report: Audio overview

Implemented on `level-8-audio-overview`.

- Kokoro 0.9.4 declares `Python >=3.10,<3.13`, so it cannot run in the Python 3.13 worker. ADR-011 records the compatibility finding and keeps Kokoro in an isolated Python 3.12 TTS service. The service lock uses the CPU-only PyTorch index; the worker image includes ffmpeg.
- Added Kokoro, OpenAI, and Fake TTS providers; strict two-host script schemas and length targets at 150 wpm; a per-line faithfulness filter; MP3 stitching, storage, duration checks, cancellation, Redis concurrency leases, and staged artifact progress.
- Added the audio player with transcript seeking, synchronized playback, speed selection, MP3 download, citations, cancel, and regenerate controls.
- Verification on Python 3.13.5: Ruff passed, mypy passed, 92 Python tests passed and one slow test skipped (91.53% measured interface coverage). Web lint passed with three pre-existing React/compiler warnings, TypeScript passed, and all six Vitest tests passed.
- Playwright FakeLLM/FakeTTS journey passed: sign up, upload and process a source, generate audio, seek transcript, change speed, download a valid MP3, and open a citation.
- Built the production Next.js Docker image and Compose services; Postgres, Redis, embed, API, web, and the isolated TTS service reached healthy state. The acceptance journey uses FakeTTS; a full Kokoro model download/inference was not part of that offline e2e.

The local Docker worker used the deterministic fake provider for the browser acceptance test. The normal `.env` service configuration is restored after the run.

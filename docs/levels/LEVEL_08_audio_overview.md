# LEVEL 8: Audio Overview (Podcast)

Prerequisite: `AGENTS.md`; Levels 0-7 complete.

## Feature name
Two-host conversational audio grounded in sources.

## Objectives and goals
- Listenable, accurate audio with transcript, built on the artifact framework.

## Scope
- Job stages: outline, dialogue script JSON `[{speaker:"A"|"B", text}]`, faithfulness check, TTS per turn with two voices, stitch (ffmpeg/pydub, pauses, loudness normalize), store via StorageBackend, return URL + timed transcript.
- `TTSProvider`: Kokoro or Piper (local default), OpenAI TTS / ElevenLabs / Google optional via keys; FakeTTS for tests. TTS libraries often lag new Python versions: if Kokoro/Piper does not install on 3.13, isolate TTS in its own small uv project/service (ADR), do not downgrade the rest.
- Options: length (about 3/8/15 min), focus prompt, language, tone.
- Player UI: play/pause, seek, speed, synced transcript, download MP3, regenerate, stage progress.
- Resource safety: one audio job per user, global concurrency 1-2, chunked TTS, script cap, timeout, cancel.

## Agent Prompt
```
Read AGENTS.md, this file, and the add-studio-generator skill. Levels 0-7 are done. Execute LEVEL 8 only.
Check TTS dependency compatibility with Python 3.13 first; if blocked, create an isolated tts service and record an ADR.
Implement TTSProvider with KokoroProvider (default), OpenAITTSProvider, FakeTTS (short silent/beep audio). Implement recipe audio_overview as a multi-stage job: outline, script, faithfulness-check, TTS, stitch, store. Add ffmpeg to the worker/tts Dockerfile. Script prompt in packages/core/prompts/audio_v1.py (two named hosts, conversational, grounded, strict JSON schema, target words from length option at about 150 wpm). The faithfulness pass verifies each script line against retrieved context and removes/flags unsupported lines.
Web: AudioPlayer (client component) with speed control, synced transcript (click line seeks), download, regenerate, staged progress (SSE), cancel.
Enforce concurrency via a Redis semaphore.
Tests: script schema + length control; faithfulness filter removes an injected unsupported line (FakeLLM); stitching yields a valid MP3 within +/-10% expected duration with FakeTTS; concurrency limit; Playwright e2e with FakeTTS.
Output <promise>L8_COMPLETE</promise> when acceptance tests pass.
```

## Task checklist
- [x] Python 3.13 TTS compatibility check (+ ADR if isolating)
- [x] TTSProvider + Kokoro + OpenAI + Fake
- [x] script generation + faithfulness pass
- [x] stitching + storage
- [x] player UI + synced transcript
- [x] concurrency + cancel
- [x] tests + e2e

## Acceptance tests
1. Default overview for a 30-page notebook completes in under 6 minutes on the target server; MP3 within 10% of target duration.
2. Clicking a transcript line seeks to its timestamp.
3. Injected unsupported claims are removed by the faithfulness pass.
4. Two users requesting audio at once: second queues; no crash; memory within limits.
5. Cancel stops processing and cleans up partial files.
6. Works fully offline with Ollama + Kokoro.

## Working condition
"I click Generate and in a few minutes get a podcast that talks about my sources accurately."

# Level 9 Pass A report: YouTube, audio, discovery, sharing, and export

Pass A is implemented on `level-9-advanced-sources`.

- Python 3.13.5 resolver/install/import verification succeeded for `faster-whisper 1.2.1`, `yt-dlp 2026.8.19`, and `youtube-transcript-api 1.2.4`. They are scoped to the worker project; no Python version isolation was needed.
- YouTube ingestion validates and canonicalizes the URL, tries `youtube-transcript-api` first, and falls back to bounded yt-dlp audio plus lazy CPU `faster-whisper` (`small`, `int8`). Uploaded MP3/WAV/M4A/FLAC/OGG/Opus/WebM files use the same timestamped transcription path.
- Timestamp ranges are retained on chunks and chat/artifact citations. The viewer opens a cited transcript passage, seeks an uploaded audio player to the citation time, or links to the YouTube video at that time.
- Added a DuckDuckGo-backed `SearchProvider`, result selection, and revalidated imports through the DNS-pinning SSRF-safe fetcher.
- Share tokens are random and stored only as SHA-256 hashes. The public page reads only a matching unexpired, unrevoked share, and Redis applies per-IP and per-share rate limits. The public API exposes GET only; revocation is checked against Postgres for every request.
- ZIP export includes notebook metadata, source metadata/text, notes in Markdown/JSON, and artifacts in JSON.
- Local checks: 4 Pass A fixture tests pass; Python 3.13 Ruff/mypy pass; web ESLint (three pre-existing warnings), TypeScript, and 6 Vitest tests pass. The earlier citation contract test was updated for the new nullable time fields.

Pass C will add the full security/integration and browser acceptance coverage for sharing, discovery, export, and citation seeking.

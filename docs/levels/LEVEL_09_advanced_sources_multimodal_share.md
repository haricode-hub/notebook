# LEVEL 9: Advanced Sources, Multimodal Retrieval, Discover, Share, Export

Prerequisite: `AGENTS.md`; Levels 0-8 complete.

## Feature name
YouTube + audio sources, multimodal retrieval with EmbeddingGemma 2, source discovery, sharing, notebook export.

## Objectives and goals
- Broader inputs and safe sharing on the same architecture.
- Use EmbeddingGemma 2's multimodal ability where it adds real value (figures, slides, audio), without breaking citations.

## Scope
- **YouTube:** transcript via youtube-transcript-api (fallback yt-dlp audio + faster-whisper); timestamps as citation anchors.
- **Audio/video upload:** faster-whisper (`small` default for CPU), timestamped segments, long files chunked; chunks get `time_start/time_end`.
- **Multimodal retrieval (feature flag `MULTIMODAL_ENABLED`):**
  - Enable the vision and audio encoders in the embed service (extra memory; document the resource impact and a per-modality enable flag).
  - Extract images/figures/slide thumbnails from PDFs/PPTX and embed them as `media_items` (image embedding), each with a text anchor (caption from a vision LLM or OCR text) so citations remain human-readable.
  - Optionally embed audio windows directly in addition to transcript chunks.
  - Retrieval runs **per modality** (text, image, audio), then merges by rank (RRF). Never compare raw similarity scores across modalities (they are not calibrated).
  - Chat can show a figure thumbnail as a citation; clicking opens the page/figure in the viewer.
- **Discover:** topic in, web search via `SearchProvider` (DuckDuckGo default; Tavily/Brave optional), 5-10 candidates, user ticks which to import (SSRF-safe ingestion).
- **Share:** revocable read-only link token (hashed, optional expiry); public Next.js route (no Better Auth session) backed by a token-authenticated, strictly read-only FastAPI router; shared chat off by default, rate limited when on.
- **Export:** notebook ZIP (metadata, notes, artifacts as Markdown/JSON).

## Agent Prompt
```
Read AGENTS.md and this file. Levels 0-8 are done. Execute LEVEL 9 only, in three passes with commits per pass.
PASS A (no multimodal): YouTubeExtractor (transcript first, Whisper fallback), AudioExtractor (faster-whisper, timestamped segments); time anchors in chunks, viewer and citations; discover with a SearchProvider interface and SSRF-safe import; share tokens + public read-only route + strict rate limits; export ZIP. Check Python 3.13 compatibility for faster-whisper, yt-dlp, youtube-transcript-api.
PASS B (multimodal, behind MULTIMODAL_ENABLED): re-read the EmbeddingGemma 2 model card for image/audio input formats, token budgets per image, and how to load vision/audio encoders; extend the embed service with /embed-media; extract figures from PDFs/PPTX; create media_items table (vector, text_anchor, source_id, page, bbox, modality); per-modality retrieval merged by RRF; chat/viewer support for figure citations. Record ADR-006 with memory/latency measurements.
PASS C: tests and e2e.
Tests: YouTube transcript fixture; Whisper with a tiny clip (or mocked); time-anchored citation opens the right segment; revoked share token blocks access immediately; shared visitors cannot mutate or reach other notebooks; export ZIP contents; multimodal: a query matching a chart's caption retrieves that figure; raw cross-modal scores are never compared (code test on the merge function); Playwright e2e for discover and share.
Output <promise>L9_COMPLETE</promise> when acceptance tests pass.
```

## Task checklist
- [ ] YouTube + audio extractors + time anchors
- [ ] discover + SearchProvider
- [ ] share tokens + public route + read-only router
- [ ] export ZIP
- [ ] embed service media endpoint (flagged)
- [ ] figure extraction + media_items + per-modality RRF
- [ ] figure citations in chat/viewer
- [ ] ADR-006 + tests + e2e

## Acceptance tests
1. A 20-minute captioned YouTube video ingests and citations open at the right timestamps.
2. A 10-minute audio file transcribes on CPU in under 10 minutes and is searchable.
3. Discover returns candidates; importing 3 works; private-IP results are rejected.
4. Revoking a share link blocks it instantly; visitors cannot write or see other notebooks.
5. Export ZIP contains all notes and artifacts.
6. With `MULTIMODAL_ENABLED=true`: a text query about a chart in a test PDF returns that figure as a citation; with the flag off, behavior and memory use are unchanged from Level 8.
7. Merge function test proves ranking uses per-modality ranks, not raw cross-modal scores.
8. Embed service memory with multimodal on stays within the documented limit (recorded in ADR-006).

## Working condition
"I can feed in videos and recordings, find new sources automatically, search my figures by text, and share a notebook safely."

# Architecture decision records

## ADR-001: Better Auth to FastAPI bridge

**Status:** Accepted for Level 1 implementation. Better Auth runs in Next.js and owns its auth tables. Browser sessions remain same-origin cookies. The browser obtains a short-lived JWT through the Better Auth JWT plugin and sends it directly to FastAPI for streaming and uploads. FastAPI checks the JWKS signature, issuer, audience, expiry, and subject, caches the JWKS, and refreshes on an unknown key ID. FastAPI never reads auth tables; app records use `user_id TEXT`. Alembic excludes Better Auth tables, while Better Auth migrations own them. API CORS permits only `WEB_ORIGIN`; bearer API calls do not require cookie CSRF protection.

## ADR-002: uv workspace, pnpm, and Python 3.13

**Status:** Accepted. All Python projects require `>=3.13,<3.14`; root `.python-version` is `3.13`. A single uv workspace and committed `uv.lock` control Python dependencies. Commands run through `uv run`; CI and images use `uv sync --frozen`. pnpm and a committed lockfile control the Next.js workspace. Dependencies incompatible with Python 3.13 get an isolated service and a new ADR rather than a global downgrade.

The current shadcn CLI command for this scaffold is `pnpm dlx shadcn@latest add button`, verified against the [official CLI documentation](https://ui.shadcn.com/docs/cli) and used to generate the Button. Context7 was unavailable in this execution environment.

## ADR-003: Separate embedding service

**Status:** Accepted. `apps/embed` holds one model process behind HTTP `/embed`, `/healthz`, and `/readyz`. API and worker use the same `EmbeddingProvider` contract. The `fake` backend is deterministic for tests; the `gemma2` backend is deliberately a Level 2 stub until model-card details and resource use are verified. `EMBED_DIM` defaults to 768. Batch limits and a concurrency guard live in the service. Stored embedding model and dimension will be checked at ingestion; switching requires reindexing. Text anchors remain necessary for citations.

The [official EmbeddingGemma 2 model card](https://huggingface.co/google/embeddinggemma-2) confirms 768/512/256/128 dimensions, query and document task prefixes, and BF16/FP32 inference. The real backend must use `SearchQuery` and `Document` prompts and normalize vectors after truncation; that implementation remains scoped to Level 2.

## ADR-004: Level 1 authentication and model settings

**Status:** Accepted. Context7 was requested but is not connected in this session; its plugin has been suggested. The following implementation details were verified against the linked primary documentation on 2026-10-18.

- [Better Auth's PostgreSQL adapter](https://better-auth.com/docs/adapters/postgresql) accepts a `pg.Pool` as `database`. Better Auth's [email/password configuration](https://better-auth.com/docs/authentication/email-password) enables local accounts. Its [Next.js integration](https://better-auth.com/docs/integrations/next) uses `toNextJsHandler(auth)` at `app/api/auth/[...all]/route.ts`, `createAuthClient` from `better-auth/react`, and a server-side `auth.api.getSession({ headers: await headers() })` check for protected pages. Next.js 16 calls the request interceptor [`proxy.ts`](https://nextjs.org/docs/app/getting-started/proxy); the proxy can redirect early, while protected server layouts validate the session again.
- The [JWT plugin](https://better-auth.com/docs/plugins/jwt) exposes `/api/auth/token` and `/api/auth/jwks`; the client uses `jwtClient()` and `authClient.token()`. `jwt.jwt.definePayload` may add the user role, and `jwt.jwt.issuer`, `audience`, and `expirationTime` set claims. We set an explicit 15-minute lifetime and keep the default user ID subject. A server-owned `role` field uses `input: false` and `defaultValue: "user"` as required by the [additional-fields guidance](https://better-auth.com/docs/concepts/typescript). FastAPI validates the signature and claims with a 10-second clock leeway, caches JWKS, and refetches once for an unknown `kid`.
- Better Auth's [rate limiter](https://better-auth.com/docs/concepts/rate-limit) supports per-route `customRules`; it is explicitly enabled in development too, with database storage so a future second web replica shares counters. The [CLI](https://better-auth.com/docs/concepts/cli) can `generate` SQL and `migrate` a built-in PostgreSQL/Kysely schema; `make auth-migrate` invokes that CLI. Alembic continues to own only app tables.
- [LiteLLM's OpenRouter provider](https://docs.litellm.ai/docs/providers/openrouter) routes `openrouter/<OpenRouter model ID>` with `OPENROUTER_API_KEY` or a per-call `api_key`; its default endpoint is `https://openrouter.ai/api/v1`. LiteLLM's [Python SDK](https://docs.litellm.ai/docs/) supports asynchronous streaming with `acompletion(..., stream=True)`. Stored model IDs are provider-native and receive a provider prefix only when sent to LiteLLM. OpenRouter's [models endpoint](https://openrouter.ai/docs/api/api-reference/models/get-models) supplies current IDs for the picker; no model slug is compiled into the application. Other provider lists are queried from their APIs when configured, and users may enter an ID manually.

## ADR-005: EmbeddingGemma 2 text-only ingestion

**Status:** Accepted for Level 2. Context7 is not connected, so the configuration below was checked against the official [Google model card](https://huggingface.co/google/embeddinggemma-2/blob/main/README.md), the model's [Sentence Transformers configuration](https://huggingface.co/google/embeddinggemma-2/blob/main/config_sentence_transformers.json), the [Transformers model documentation](https://huggingface.co/docs/transformers/model_doc/embedding_gemma2), and the [Sentence Transformers API reference](https://www.sbert.net/docs/package_reference/sentence_transformer/model.html) on 2026-10-18.

- The model ID is `google/embeddinggemma-2`. Pass `config_kwargs={"vision_config": None, "audio_config": None}` to `SentenceTransformer` to omit both unused towers; the text-only model has about 271M parameters. `config_kwargs`, rather than `model_kwargs`, controls tower selection.
- For retrieval, `kind=query` uses `prompt_name="SearchQuery"`, whose exact prefix is `task: search result | query: `. `kind=document` uses `prompt_name="Document"`, whose exact prefix is `title: none | text: `. These names are in the checkpoint's prompt catalog. Documents with a real title can instead use the documented manual `title: {title} | text: {content}` format, but the Level 2 interface has no title input.
- The text window is 8,192 tokens. Native vectors have 768 dimensions; supported Matryoshka outputs are 768, 512, 256, and 128. Use `truncate_dim=EMBED_DIM` and `normalize_embeddings=True` so each stored vector has unit norm after truncation.
- The model card forbids FP16 because it can yield NaNs or degraded vectors. Use `torch.float32` on CPU and BF16 only on a device that reports native BF16 support. Pass dtype through `model_kwargs={"torch_dtype": dtype}`. The service checks all output vectors for finite values and unit norm.
- The checkpoint metadata records Transformers `5.18.0.dev0`; `>=5.18.0` is the first stable lower bound chosen here and will be checked with a Python 3.13 import test. The checkpoint explicitly requires `sentence-transformers>=6.1.0`. The full checkpoint download is about 1.5 GB even though unused towers are skipped at load; a persistent Hugging Face model cache volume prevents repeated downloads.
- A Python 3.13 import test passed with `torch==2.14.1+cpu`, `transformers==5.20.1`, and `sentence-transformers==6.1.0`. The checkpoint's `AutoProcessor` still imports its video processor while text-only towers are disabled, so `torchvision` is required at load time; use its CPU wheel. The uv lock explicitly sources Torch and Torchvision from the [official CPU index](https://download.pytorch.org/whl/cpu), avoiding CUDA packages in the embedding image.
- The actual text-only load and warmup passed on Python 3.13 with CPU `torchvision==0.29.1+cpu` and produced a finite, unit-norm 768-vector. The service caps Torch compute threads at four, batches at eight by default, and exposes readiness only after warmup. A real-model retrieval test passes with the documented query and document prompts. The other new Level 2 packages (`pypdf`, `python-docx`, `python-pptx`, `trafilatura`, `aiohttp`, `python-multipart`, `hypothesis`, `reportlab`, and `psutil`) all resolved, installed, and imported on Python 3.13.
- PDF, DOCX, and PPTX extraction use `pypdf`, `python-docx`, and `python-pptx` rather than Docling in Level 2. These libraries preserve page or slide boundaries and exact canonical-text offsets with a smaller worker memory footprint. They do not perform OCR; scanned images require a later OCR path. `trafilatura` extracts readable website text. This is the extraction-library deviation from the level plan.
- The embedding column has one fixed dimension per deployment. A source records its model ID and dimension. Ingestion rejects a source if another source in its notebook has a different identity. Reindex replaces all affected vectors using the currently configured backend; changing the physical vector dimension also requires a deployment-wide schema migration and reindex of every notebook.

## ADR-006: Grounded hybrid chat and citation contract

**Status:** Accepted for Level 3. Context7 is unavailable in this session, so these details were checked against the official [pgvector SQLAlchemy integration](https://github.com/pgvector/pgvector-python), [pgvector hybrid search guidance](https://github.com/pgvector/pgvector), [OpenRouter models API](https://openrouter.ai/docs/api/api-reference/models/get-models), and [react-markdown documentation](https://github.com/remarkjs/react-markdown).

- Retrieve at most 30 cosine-nearest chunks and 30 PostgreSQL full-text hits from ready, selected sources in the owned notebook. Merge with reciprocal rank fusion (`k=60`), then keep eight chunks. A `Reranker` interface permits a later model; `NoopReranker` is the default. When all selected text fits within 55% of the chat context window, send it in source order instead. The window comes from OpenRouter's `context_length` metadata when the model catalog knows it; `CHAT_CONTEXT_TOKENS=8192` is the fallback.
- For follow-up questions, a cheap-model condensation step rewrites only the retrieval query. The original user question remains in the answer prompt. Source names, excerpts, and prior turns are untrusted data. The versioned system prompt requires citations for claims and an exact refusal when the evidence is missing.
- A streamed answer has token events and one final event. Only `[S#]` markers that refer to chunks in that answer's context become structured citations. Invalid markers are removed before persistence. A response with no valid citation is replaced by the exact refusal. This validates citation identity, while semantic support still depends on the model and evaluation set.
- Chat history and citations live in app-owned `chat_messages`, scoped by notebook and user. Source selection is a persisted boolean. The browser renders GFM Markdown and maps validated markers to citation chips. Browser abort closes the upstream LiteLLM stream. Redis limits chat requests per user; an event-loop-wide semaphore caps concurrent LLM calls.
- `make eval` uses three checked-in documents, 15 fact questions, deterministic local token vectors, and the real vector/FTS/RRF/citation pipeline. Its offline score tests retrieval wiring and citation mapping, not EmbeddingGemma semantic quality or live OpenRouter latency.
- `make benchmark-chat` seeds a synthetic indexed 100-page notebook, starts the timer before retrieval, and stops it at the first streamed OpenRouter token. It requires `OPENROUTER_API_KEY` and `DEFAULT_CHAT_MODEL`; the offline suite cannot prove the live latency target.
- The environment example selects `google/gemini-3.1-flash-lite` for both chat and query condensation. [OpenRouter lists it](https://openrouter.ai/google/gemini-3.1-flash-lite/) as a low-latency model with a 1,048,576-token context window and $0.25/$1.50 per million input/output tokens on 2026-10-18. EmbeddingGemma 2 remains the separate local retrieval model. The chat model is an env setting and can be changed without reindexing.

## ADR-007: Source viewer, PDF worker, and signed originals

**Status:** Accepted for Level 4. Context7 and Playwright MCP are not connected in this session. The integration was checked against the [official React-PDF setup guide](https://github.com/wojtekmaj/react-pdf#readme), its [Next App Router example](https://github.com/wojtekmaj/react-pdf/blob/main/sample/next-app/app/Sample.tsx), and the [Next.js 16 lazy-loading guide](https://nextjs.org/docs/app/guides/lazy-loading). Browser verification uses the Playwright CLI.

- React-PDF and PDF.js load only in `pdf-original.tsx`, dynamically imported from a Client Component with `next/dynamic` and `ssr: false`. In the same module as `Document` and `Page`, set `pdfjs.GlobalWorkerOptions.workerSrc` with `new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString()`. Pin the direct `pdfjs-dist` dependency to the exact version React-PDF uses, so the worker and API agree. Render the text and annotation layers with React-PDF's CSS.
- `@tanstack/react-virtual` mounts only a handful of PDF pages around the viewport, even for a 300-page document. Text uses exact-offset blocks and the same virtualizer. A PDF citation jumps to its page, then matches the chunk's normalized text or its first/last 80 characters against the PDF text items. If PDF extraction differs, a visible card offers the exact highlighted extracted text.
- `/notebooks/{notebook_id}/sources/{source_id}/content` returns normalized text, chunk offsets, source details, original web link, and for PDFs a five-minute `/files/{token}` URL. `StorageBackend.url()` signs key, user ID, source ID, and expiry using HMAC-SHA256 with the existing `SETTINGS_ENCRYPTION_KEY`. The file endpoint also requires the user's bearer JWT and checks current source ownership and storage key. This prevents a copied URL from granting access to another user and invalidates it after expiry or source deletion. The short-lived URL is a locator, not a substitute for authentication.

## ADR-008: Cached guides, debounced overview, and Markdown notes

**Status:** Accepted for Level 5. Context7 and Playwright MCP are not connected in this session, so editor setup was checked against the official [Tiptap Next.js guide](https://tiptap.dev/docs/editor/getting-started/install/nextjs) and [Markdown extension documentation](https://tiptap.dev/docs/editor/markdown/getting-started/basic-usage). Browser verification uses the Playwright CLI.

- A source guide uses a versioned prompt and the user's configured cheap model. Map inputs are capped at 6,000 UTF-8 bytes, a conservative provider-independent token bound; reductions obey the same cap. Pydantic checks the summary, 5–8 topics, and exactly three questions, with one JSON repair retry. The cache key hashes user ID, content, prompt version, model ID, and guide type so identical re-ingestion makes no model call and private content is not shared across users.
- A separate worker job generates each guide after ingestion reaches ready. When guides or sources change, a Redis generation marker and an arq 30-second deferred job coalesce notebook overview updates. Older jobs exit before calling the model; an unchanged overview fingerprint exits too. Source and overview rows expose status and errors independently of ingestion.
- Notes store Markdown and canonical validated chat citations in app-owned tables. Saving an answer copies its server-side persisted content and citations; conversion reuses the existing text-source ingestion path, so a note becomes searchable only after indexing. The editor uses client-only `next/dynamic` and Tiptap's `immediatelyRender: false`; the official Markdown extension handles round-trip editing and local `.md` export. The extension is currently marked beta upstream, so the note body remains portable Markdown in the database.
- The worker receives the same provider key, cheap-model, and encryption settings as the API through Compose. On the local fake-embedding stack with a live OpenRouter cheap model, the upload-to-ready-guide browser run took **20.8 seconds**, below the Level 5 60-second limit. This measures the configured cloud model and a short text source; long documents still depend on map-reduce call count and provider latency.

## ADR-009: Versioned, grounded Studio artifacts and portable exports

**Status:** Accepted for Level 6. A single `ArtifactRecipe` registry maps recipe IDs to a prompt instruction, Pydantic output schema, and renderer ID. The worker writes an `artifacts` row and `jobs` row, emits stages through Redis pub/sub, and stores structured JSON plus canonical validated citations. Source IDs are checked against ready, selected, user-owned sources when the API queues the work and again when the worker runs it. Regeneration keeps the artifact ID and creates a new job. Invalid JSON, mismatched citation refs, and invented labels each trigger one repair call; a second failure marks the artifact failed and exposes retry.

Long inputs are split into UTF-8 byte-bounded excerpt batches (`ARTIFACT_MAP_MAX_BYTES`, default 10,000), mapped concurrently at most four at a time, and reduced into the recipe document using the user's cheap model unless overridden. The deterministic fake supports offline tests. The server exports Markdown and DOCX with citation references. `python-docx==1.2.0` imports successfully under local Python 3.13.5. The [official python-docx package](https://pypi.org/project/python-docx/) requires Python >=3.9 and provides a pure Python wheel.

WeasyPrint's Python wheel resolves under Python 3.13, consistent with its [PyPI classifiers](https://pypi.org/project/weasyprint/), but import fails on this Windows host because its Pango/GObject native DLL is unavailable. Its [installation guide](https://doc.courtbouillon.org/weasyprint/stable/first_steps.html) documents the native requirement. The browser's print stylesheet is the supported PDF path: the artifact viewer has a Print / PDF action, and browser Save as PDF produces the PDF. This avoids platform-specific native packages in the API image. The same validated citation chip renderer is shared with chat.

## ADR-010: React Flow for interactive study artifacts

**Status:** Accepted (2026-10-19)

**Context:** Level 7 needs a compact mind map with interactive node selection, pan/zoom,
node-to-chat, and PNG/SVG export. The client-only diagram must remain responsive for
maps capped at 60 nodes.

**Decision:** Use `@xyflow/react` in a client-only renderer, with deterministic tree
layout and a 60-node/depth-4 schema limit. Use `html-to-image` to export the rendered
map as PNG or SVG. Keep citations as source labels on nodes and resolve them through
the artifact's validated citation list.

**Rationale:** React Flow provides built-in viewport controls and node interaction;
its official React Flow 12 docs describe the React component, required sized parent,
and client-side image export path. The modest size limit avoids needing a layout worker.

**Consequences:** The two UI packages are part of the web bundle, and the flow CSS is
loaded globally after Tailwind. Mind map rendering and image generation run in the
browser; the API stores only the validated tree and references.

**References:** [React Flow quick start](https://reactflow.dev/learn),
[React Flow component](https://reactflow.dev/api-reference/react-flow),
[React Flow SSR/SSG guidance](https://reactflow.dev/learn/advanced-use/ssr-ssg-configuration).

## ADR-011: Isolated Python 3.12 Kokoro TTS service

**Status:** Accepted for Level 8 (2026-10-19).

**Context:** The core API, worker, embed service, and shared packages use Python 3.13. The official Kokoro PyPI project currently declares `Requires-Python: >=3.10,<3.13`; a Python 3.13 environment cannot install it. The 3.13 resolver/install check was attempted and the package constraint confirmed from [PyPI metadata](https://pypi.org/project/kokoro/). Kokoro's official package usage calls `KPipeline`, writes 24 kHz audio, and lists English voice IDs such as `af_heart`; its [package documentation](https://pypi.org/project/kokoro/) is the implementation reference.

**Decision:** Keep Kokoro in a small `apps/tts` FastAPI service isolated on Python 3.12, with its own `pyproject.toml` and `uv.lock`. The Python 3.13 worker calls it through `KokoroProvider` over HTTP. OpenAI speech uses the official `/v1/audio/speech` endpoint with WAV response format ([OpenAI TTS guide](https://developers.openai.com/api/docs/guides/text-to-speech)). `FakeTTS` creates a small beep WAV for offline tests. ffmpeg lives in the worker runtime and TTS image; final MP3s are stored using `StorageBackend`.

**Consequences:** Compose adds one TTS service and a persistent Hugging Face model cache volume. Kokoro downloads its model the first time it synthesizes audio; later calls reuse the cached model. The shared application remains on Python 3.13. `TTS_PROVIDER=fake` supports deterministic UI and worker tests; `openai` requires `OPENAI_API_KEY`.

The TTS lock uses the official PyTorch CPU wheel index for Linux/Windows; this removed all NVIDIA CUDA and Triton packages that the default Linux PyPI resolver selected. The image uses CPU inference, consistent with the no-GPU deployment target.


### Level 9 multimodal extension to ADR-006 (2026-10-19)

The official [EmbeddingGemma 2 model card and usage guide](https://huggingface.co/google/embeddinggemma-2/blob/c3f2237ce16fe33d1bb9dab8692c29c79865bdeb/embedding_gemma2_documentation.md) documents Sentence Transformers inputs as per-sample dictionaries such as `{"image": image, "text": caption}` (and `{"audio": "path/to/audio.wav"}`). The processor accepts 70, 140, 280, 560, or 1120 visual soft tokens per image; the default is 280. Our first implementation uses 70 to limit latency and keeps the audio tower disabled. The card documents `vision_config=None` and `audio_config=None` passed via `config_kwargs`; leaving vision configured while setting audio to `None` loads text+vision and skips the audio tower. The service accepts image+text items through `/embed-media`; it also accepts WAV audio bytes as a temporary file path when the audio tower is enabled. The model card documents audio as a path/URL or a 1-D float array sampled at 16 kHz. The caller must supply suitable 16 kHz mono WAV; Level 9 indexes extracted figures and existing Whisper transcript chunks, not raw audio windows.

Measurement on this local Windows CPU host (Python 3.13.5, Sentence Transformers 6.1.0, Transformers 5.20.1, cached official checkpoint, one 64x64 PNG): text+vision model load took **6.90 s** and process RSS after load was **2,331.2 MiB**. A single image+caption encode at a 70-token budget took **2.08 s** and RSS reached **2,386.5 MiB** (incremental RSS +55.3 MiB). The output was 768D and L2-normalized. This is one warm local run, not a production capacity guarantee. `MULTIMODAL_ENABLED=false` is the default and retains the text-only model configuration. API and worker only extract/embed figures when enabled. Image and text rankings are independently ordered then merged by reciprocal rank; raw cross-modal similarity values do not enter the merge.

# OpenNotebook Studio: Build Pack (NotebookLM clone)

## Level 0 quick start

This repository implements the foundation level. Copy `.env.example` to `.env`, then run `make dev` on a machine with Docker Compose. Open `http://localhost:3000`; the page shows API, database, Redis, and embedding readiness. `http://localhost:8000/healthz` is a process liveness check and `/readyz` checks dependencies. Level 0 uses the deterministic fake embedding backend; local EmbeddingGemma 2 arrives in Level 2.

Run `make smoke` to enqueue a ping through Redis and confirm the arq worker updates its `jobs` row to `succeeded`. Run `make lint`, `make typecheck`, and `make test` for local checks. `make types` regenerates the committed TypeScript OpenAPI types. Python needs uv and Python 3.13; JavaScript needs Node 22 and Corepack pnpm. `make dev` needs Docker Compose. On Windows, GNU Make is optional if the commands in the Makefile are run directly.

The accepted architecture decisions are in `docs/DECISIONS.md`; implementation progress is in `.agents/PROGRESS.md`. `AGENTS.md` and `docs/levels/LEVEL_00_foundation.md` define the scope and acceptance checks.

Stack: Next.js + Better Auth, FastAPI (Python 3.13.x, uv), Postgres + pgvector, Redis + arq, EmbeddingGemma 2 (local embeddings), OpenRouter (default LLM) switchable to Gemini / OpenAI / Anthropic / Ollama.

## Files
```
AGENTS.md                      global context (save as AGENTS.md AND CLAUDE.md in the repo root)
levels/LEVEL_00_foundation.md
levels/LEVEL_01_auth_notebooks_shell.md
levels/LEVEL_02_ingestion_embeddings.md
levels/LEVEL_03_grounded_chat.md
levels/LEVEL_04_source_viewer.md
levels/LEVEL_05_guide_notes.md
levels/LEVEL_06_studio_text_artifacts.md
levels/LEVEL_07_studio_interactive.md
levels/LEVEL_08_audio_overview.md
levels/LEVEL_09_advanced_sources_multimodal_share.md
levels/LEVEL_10_hardening_scale.md
```
Each level file has: feature name, objectives and goals, scope, a paste-ready agent prompt, a task checklist, acceptance tests, and a working condition.

## One-time setup (15 minutes)
1. `mkdir opennotebook && cd opennotebook && git init`
2. Copy `AGENTS.md` to the repo root as `AGENTS.md` and `CLAUDE.md`. Copy `levels/` to `docs/levels/`.
3. Create `.agents/LOOP_PROMPT.md` and `loop.sh` (below).
4. Add MCP servers: Context7 (required), Playwright (required), GitHub (optional).
5. Install `uv` and `pnpm`; run `uv python install 3.13`.
6. Create `.env` with `OPENROUTER_API_KEY` (and optional keys). Accept any model-license/terms needed on Hugging Face for the embedding model, and set `HF_TOKEN` if required.
7. Start Claude Code in plan mode, paste Level 0's Agent Prompt, review PLAN.md/TASKS.md for 5 minutes, then run the loop.

## The level loop
`.agents/LOOP_PROMPT.md`
```
CURRENT_LEVEL = <N>
You are in an autonomous build loop with fresh context each run.
1. Read AGENTS.md, .agents/PLAN.md, .agents/TASKS.md, the last 40 lines of .agents/PROGRESS.md, and docs/levels/LEVEL_<NN>_*.md for CURRENT_LEVEL.
2. Work ONLY on CURRENT_LEVEL. Take the first unchecked task. Do exactly one task.
3. Search the codebase before assuming something is missing. Use Context7 for library APIs.
4. Implement with tests; run make lint && make typecheck && make test (Playwright smoke if UI changed; look at the screenshot).
5. If green: commit (conventional message), tick the task, append 3-5 lines to PROGRESS.md.
6. If red after 3 honest attempts: log blocker + hypothesis, mark [BLOCKED], stop.
7. If all tasks of the level are ticked: run every acceptance test of this and previous levels, write results to .agents/LEVEL_N_REPORT.md. If all pass, output <promise>LN_COMPLETE</promise>.
```

`loop.sh` (run inside Docker/devcontainer; set API spend limits; the flag skips permission prompts)
```bash
#!/usr/bin/env bash
LEVEL=${1:?usage: ./loop.sh <level>}
MAX=${2:-80}
sed -i "s/^CURRENT_LEVEL = .*/CURRENT_LEVEL = $LEVEL/" .agents/LOOP_PROMPT.md
for i in $(seq 1 $MAX); do
  echo "=== level $LEVEL iteration $i ==="
  OUT=$(cat .agents/LOOP_PROMPT.md | claude -p --dangerously-skip-permissions 2>&1)
  echo "$OUT" | tail -15
  echo "$OUT" | grep -q "<promise>L${LEVEL}_COMPLETE</promise>" && { echo "LEVEL $LEVEL DONE"; break; }
  sleep 2
done
```
Codex variant: `OUT=$(codex exec --full-auto "$(cat .agents/LOOP_PROMPT.md)" 2>&1)`.

## Level gate review (you, 10 minutes between levels)
1. Read `.agents/LEVEL_N_REPORT.md`.
2. Run the app and perform the level's "Working condition" sentence by hand.
3. Run `make test` yourself.
4. If anything fails, write it at the top of PROGRESS.md as "FIX FIRST" and re-run the loop.
5. `git tag level-N`.

## Which tools help which level
| Level | Tools / repos |
|---|---|
| 0 | Context7, `astral-sh/uv`, GitHub Actions |
| 1 | `better-auth/better-auth`, shadcn registry, `frontend-design` skill (`anthropics/skills`), `bvaughn/react-resizable-panels`, PyJWT, Playwright MCP, LiteLLM + OpenRouter docs |
| 2 | `google/embeddinggemma-2` (Hugging Face), sentence-transformers, `docling-project/docling`, `microsoft/markitdown`, `adbar/trafilatura`, `pgvector/pgvector` |
| 3 | `BerriAI/litellm`, `lfnovo/open-notebook`, `Cinnamon/kotaemon` (read their retrieval + citation code), `explodinggradients/ragas`, `microsoft/fetch-event-source` |
| 4 | `wojtekmaj/react-pdf`, `mozilla/pdf.js` |
| 5 | `ueberdosis/tiptap` |
| 6 | python-docx, WeasyPrint, `pdf` / `docx` skills (`anthropics/skills`) |
| 7 | `xyflow/xyflow` or `markmap/markmap` |
| 8 | `hexgrad/kokoro`, `souzatharsis/podcastfy`, `gabrielchua/open-notebooklm`, ffmpeg |
| 9 | `SYSTRAN/faster-whisper`, `jdepoix/youtube-transcript-api`, `yt-dlp/yt-dlp`, EmbeddingGemma 2 multimodal docs |
| 10 | `grafana/k6`, `langfuse/langfuse`, `gitleaks/gitleaks`, axe-core, pip-audit |

Verify each repo still exists, is maintained, and its license suits you before the agent depends on it.

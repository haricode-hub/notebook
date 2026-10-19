# Level 6 report: text study artifacts

## Implemented

- Added the `ArtifactRecipe` registry, versioned `artifact-v1` prompt, five text recipes, byte-bounded map/reduce, Pydantic output validation, citation-ref validation, and exactly one repair attempt.
- Added the `artifacts` table and Alembic `0006`, owned API routes, worker job and progress events, retry/regenerate/delete, Markdown and DOCX exports, and print stylesheet PDF output.
- Added Studio recipe tiles, source/language/length/focus/model options, job progress, a cited artifact viewer, and citation navigation into the source viewer.
- Added `.claude/skills/add-studio-generator/SKILL.md` and documented ADR-009 and the artifact prompts.

## Verification

- Python 3.13.5: `python-docx` 1.2.0 imported successfully. WeasyPrint's wheel resolved, but its import on this Windows host requires Pango/GObject DLLs that are not installed; the browser print stylesheet is used for PDF.
- Python: Ruff, mypy, full pytest suite with the project's coverage threshold, 50-page all-recipe budget test, citation/selection/ownership tests, repair and retry test, and Markdown/DOCX export checks.
- Web: ESLint, TypeScript, Vitest, production Docker build, and Level 6 Playwright journey.
- Playwright created a study guide against the live local app, downloaded Markdown and DOCX, opened the printed PDF with PDF.js and checked its text, then opened a citation at the highlighted source passage. The journey passed in 17.3 seconds after the stack was running.
- Docker Compose services are healthy and Alembic reports `0006 (head)`.

## Limits

The 50-page benchmark uses the deterministic fake LLM to verify the under-90-second generation path and schema. The browser journey exercised the configured OpenRouter provider on one short source; provider latency for a full 50-page live document varies by model and account.

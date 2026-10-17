# LEVEL 6: Studio I (Text Artifacts)

Prerequisite: `AGENTS.md`; Levels 0-5 complete.

## Feature name
Briefing Doc, Study Guide, FAQ, Timeline, Custom Report, built on a reusable generator framework.

## Objectives and goals
- A reusable "recipe" framework (reused in Levels 7-8).
- Cited, saved, re-openable, exportable outputs.

## Scope
- `artifacts` table; `ArtifactRecipe` interface (input selection, prompt, output Pydantic schema, renderer id); job-based generation with progress; schema validation with one automatic repair retry (models differ in JSON reliability); regenerate; delete.
- Types: Briefing Doc, Study Guide, FAQ, Timeline, Custom Report.
- Options: selected sources, language, length (short/default/long), focus text, optional model override for this artifact.
- UI: Studio tiles, generating state, artifact viewer with citation chips, export Markdown/PDF/DOCX.
- Map-reduce for sources beyond context.

## Agent Prompt
```
Read AGENTS.md and this file. Levels 0-5 are done. Execute LEVEL 6 only.
Build the artifact framework first (recipe registry, job, status, schema validation with repair retry, versioned prompts). Implement recipes: briefing, study_guide, faq, timeline, report. Outputs are structured JSON (sections of markdown + citation refs) rendered with the same citation chips. Web: Studio tiles, options dialog, generation progress, artifact viewer, regenerate, delete, export (Markdown; PDF via WeasyPrint or print stylesheet; DOCX via python-docx). Confirm WeasyPrint/python-docx install on Python 3.13.
Write .claude/skills/add-studio-generator/SKILL.md documenting how to add a recipe (schema, prompt, route branch, renderer, tests), since Levels 7-8 reuse it.
Tests: repair retry (FakeLLM returns invalid JSON once), each recipe with fixture output, citation validity in artifacts, exports open, Playwright e2e: generate a study guide and open a citation from it.
Output <promise>L6_COMPLETE</promise> when acceptance tests pass.
```

## Task checklist
- [ ] artifact framework + repair retry
- [ ] five recipes
- [ ] Studio tiles + options UI + progress
- [ ] artifact viewer with citations
- [ ] exports (MD, PDF, DOCX)
- [ ] add-studio-generator skill file
- [ ] tests + e2e

## Acceptance tests
1. All five types generate for a 50-page notebook in under 90 s and pass schema validation.
2. Invalid JSON triggers exactly one repair attempt, then a clean `failed` state with retry.
3. All artifact citations resolve and open the viewer.
4. Only selected sources influence the artifact.
5. Markdown, PDF, DOCX exports open correctly.
6. Adding a hypothetical sixth recipe needs under 60 lines of new backend code.

## Working condition
"I click a tile, wait, and get a cited, exportable document; adding new tiles is easy."

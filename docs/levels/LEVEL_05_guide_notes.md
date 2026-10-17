# LEVEL 5: Source Guide and Notes

Prerequisite: `AGENTS.md`; Levels 0-4 complete.

## Feature name
Auto summaries, key topics, suggested questions, and a notes system.

## Objectives and goals
- Each source gets a guide after ingestion; the notebook gets an overview.
- Notes capture thinking and chat answers, and can become sources.

## Scope
- Worker stage `summarize` (map-reduce for long sources) using the configured cheap model: summary (about 150 words), 5-8 key topics, 3 suggested questions. Notebook overview regenerated (debounced 30 s) when sources change.
- UI: source guide view; overview card with clickable suggested questions that send to chat.
- Notes: CRUD with Tiptap (client component), "Save to note" on chat answers (keeps citations), pin, Markdown export, convert note to source.
- Cost control: cache by sha256(content + prompt version).

## Agent Prompt
```
Read AGENTS.md and this file. Levels 0-4 are done. Execute LEVEL 5 only.
Add the summarize stage (map-reduce, token-budgeted, cheap model, cached by content hash + prompt version). Add debounced notebook overview job. Add notes table + CRUD API; "save to note" copies message content + citations. Web: source guide view, overview card with suggested questions, Tiptap editor (client-only), notes list in the Studio panel, save-to-note button on chat messages, convert-to-source, Markdown export.
Prompts go in packages/core/prompts (versioned) and docs/PROMPTS.md.
Tests: map-reduce with FakeLLM on a long fixture; cache hit avoids a second LLM call (spy); notes CRUD; saved citations still open the viewer; convert-to-source yields a ready source; Playwright e2e.
Output <promise>L5_COMPLETE</promise> when acceptance tests pass.
```

## Task checklist
- [ ] summarize stage + cache
- [ ] notebook overview job (debounced)
- [ ] guide + overview UI
- [ ] notes table/API + Tiptap UI
- [ ] save-to-note with citations
- [ ] convert note to source + Markdown export
- [ ] tests + e2e

## Acceptance tests
1. A guide appears within 60 s of upload (cloud model) with summary, topics, 3 questions.
2. Re-ingesting unchanged content makes zero new summarization calls.
3. Overview updates after adding a source and does not fire repeatedly during multi-file uploads.
4. Save-to-note keeps working citations.
5. A note converted to a source is searchable in chat.
6. Clicking a suggested question yields a cited answer.

## Working condition
"After upload I immediately get a useful summary and questions, and I can build a notes collection that feeds back into the notebook."

# LEVEL 7: Studio II (Mind Map, Flashcards, Quiz)

Prerequisite: `AGENTS.md`; Levels 0-6 complete (uses the add-studio-generator skill).

## Feature name
Interactive learning artifacts.

## Objectives and goals
- Visual, interactive outputs that make the app feel like NotebookLM.

## Scope
- Mind Map: JSON tree `{label, summary, source_refs, children[]}` (depth <= 4, nodes <= 60); React Flow or markmap (client-only; choose via ADR); expand/collapse, zoom/pan, node click shows summary + citations, "ask about this" seeds chat, export PNG/SVG.
- Flashcards: `{front, back, source_ref}`; flip UI, shuffle, known/unknown, Leitner scheduling persisted, CSV (Anki-compatible) export.
- Quiz: MCQs `{question, options[4], answer_index, explanation, source_ref}`; count/difficulty options; one-by-one mode; score; review wrong answers; attempts saved.
- Validators: exactly one correct option, distinct options, explanation cites a real chunk.

## Agent Prompt
```
Read AGENTS.md, this file, and .claude/skills/add-studio-generator. Levels 0-6 are done. Execute LEVEL 7 only.
Add recipes mindmap, flashcards, quiz with strict Pydantic schemas + extra validators. Build interactive client-only renderers: MindMapView (React Flow or markmap; record an ADR), FlashcardsView with Leitner scheduling persisted in flashcard_progress, QuizView with attempts persisted in quiz_attempts. Add node-to-chat, flashcard CSV/Anki export, mind map PNG/SVG export.
Tests: validators, Leitner unit tests, quiz scoring, mind map render smoke test, Playwright e2e per interaction.
Output <promise>L7_COMPLETE</promise> when acceptance tests pass.
```

## Task checklist
- [ ] mindmap recipe + MindMapView + exports
- [ ] flashcards recipe + view + Leitner + CSV
- [ ] quiz recipe + view + attempts + review
- [ ] validators + tests + e2e

## Acceptance tests
1. Mind map for a 50-page notebook renders in under 2 s, at most 60 nodes, usable on mobile.
2. Every quiz question has exactly one correct answer and a cited explanation (validator + manual check of 10).
3. Flashcard progress persists across sessions; Leitner moves cards correctly.
4. Quiz attempt history stored; "review wrong answers" works.
5. Exports (PNG/SVG, CSV) work.

## Working condition
"I can study from my own material with a map, cards and quizzes, and my progress sticks."

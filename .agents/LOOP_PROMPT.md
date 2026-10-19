
CURRENT_LEVEL = 12

You are in an autonomous build loop with fresh context on every run. State lives in files and git, not in chat memory.

1. Read AGENTS.md, AGENTS_ADDENDUM.md, .agents/PLAN.md, .agents/TASKS.md, the last 40 lines of .agents/PROGRESS.md, and docs/levels/LEVEL_<NN>_*.md for CURRENT_LEVEL.
2. Work ONLY on CURRENT_LEVEL. Take the first unchecked task. Do exactly ONE task per run.
3. Search the codebase before assuming something is missing. Use Context7 (or official docs) for library APIs.
4. Implement with tests. Run lint, typecheck and tests (and Playwright if UI changed; look at the screenshot).
5. If green: commit with a conventional message, tick the task, append 3-5 dated lines to .agents/PROGRESS.md.
6. If red after 3 honest attempts: log the blocker and your hypothesis, mark the task [BLOCKED], and stop.
7. Evidence rules apply: no gate is passed without a measured value; label FAKE results; never edit acceptance criteria without an ADR and the user.
8. When every task of the level is ticked: run the level's acceptance tests plus earlier levels' tests, write .agents/LEVEL_N_REPORT.md, and only if everything passes output <promise>LN_COMPLETE</promise>.
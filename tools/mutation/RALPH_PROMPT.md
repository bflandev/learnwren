# Mutation testing loop — Ralph prompt

You are running inside a Ralph loop. This same prompt is fed back to you every iteration. Your job is to advance one module's mutation score per iteration, working entirely inside the worktree at `/Volumes/Artie-Storage/github-repos/learnwren/.worktrees/mutation-sweep-2026-05-25`. **All commands MUST be run from that directory.** Use `cd` at the start of every Bash call.

## Working directory

```
/Volumes/Artie-Storage/github-repos/learnwren/.worktrees/mutation-sweep-2026-05-25
```

Branch: `mutation-sweep-2026-05-25` (created from main HEAD `33f653b` on 2026-05-25). `node_modules/` is a symlink to the parent repo's `node_modules` — do not modify or `git add -A` (the symlink evades `.gitignore`).

## State file

`tools/mutation/state.json` is the single source of truth for loop progress. Schema:

```json
{
  "threshold": 80,
  "maxIterations": 25,
  "iteration": <int>,
  "modules": [
    { "name": "<lib>", "status": "pending|in_progress|done|skip", "score": <number|null>, "iterations": <int>, "notes": "<string>" }
  ]
}
```

Module order is the priority order — process top to bottom, one at a time.

## Exit conditions (check FIRST every iteration)

Read `tools/mutation/state.json`. If ANY of:

1. Every module has `status` of `done` or `skip`, OR
2. `iteration >= maxIterations` (currently 25)

…then emit exactly this on its own line, with no other text after it, and stop:

```
<promise>MUTATION LOOP COMPLETE</promise>
```

Otherwise, do not emit that promise — continue with the work below.

## Each iteration — exactly these steps

### 1. Pick the current module

The current module is the first module in `state.json` with `status` of `pending` or `in_progress`. Set its `status` to `in_progress`. Increment top-level `iteration` by 1 and the module's `iterations` by 1. Save the file.

### 2. Run stryker for that module

```bash
cd /Volumes/Artie-Storage/github-repos/learnwren/.worktrees/mutation-sweep-2026-05-25 && pnpm exec stryker run stryker.<MODULE>.config.mjs 2>&1 | tail -80
```

Timeout: 1800000ms (30 min). If stryker exits non-zero due to a config / runtime error (not surviving mutants), **debug the config**, then mark the module `status: skip` with a `notes` field explaining why, and exit the iteration (Ralph will pick the next module on next run).

If a module's `iterations` count reaches **4** without hitting threshold, mark it `status: skip` with a `notes` field stating "Plateaued at <score>% after 4 iterations" and exit the iteration. Do not burn the global 25-iteration budget on one stubborn module.

### 3. Generate triage report

```bash
cd /Volumes/Artie-Storage/github-repos/learnwren/.worktrees/mutation-sweep-2026-05-25 && node tools/mutation/report.mjs <MODULE>
```

The last line of stdout is `SCORE=<n> RAW=<r> KILLED=<k> SURVIVED=<s> NOCOV=<c> EQUIV=<e>` — parse the SCORE (the *adjusted* score, which excludes logger-equivalent mutants and is the operational metric). The markdown report is at `docs/quality/mutation-report-<MODULE>.md`.

### 4. Decide: done, or add tests?

- **If `SCORE >= threshold` (read `threshold` from `state.json`, currently 80):**
  1. Update state: set module `status: done`, `score: <SCORE>`.
  2. Commit ONLY the test/source/state changes for this module — never the whole worktree. Use:
     ```
     git add libs/<MODULE> tools/mutation/state.json docs/quality/mutation-report-<MODULE>.md stryker.<MODULE>.config.mjs
     git commit -m "$(cat <<'EOF'
     test(<MODULE>): raise mutation score to <SCORE>%

     Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
     EOF
     )"
     ```
  3. Exit the iteration (do not start the next module — Ralph re-invokes).

- **If `SCORE < threshold`:**
  1. Read `docs/quality/mutation-report-<MODULE>.md`. Identify the **top 1–3 survivor clusters** (those with the most surviving mutants — they're listed first).
  2. For each chosen cluster, read the source file at the indicated path, read the *existing* spec file alongside it, and **add targeted tests** that kill those specific mutants. Follow these rules:
     - **Add to existing spec files** when one exists for the source; only create a new spec file if none exists.
     - **Use the existing test style** (vitest `describe/it`, existing mock setup, existing factory helpers). Do not introduce new test frameworks or DI patterns.
     - **One test per assertion gap**, not one test per mutant. A test that pins the return value of `foo()` may kill 5 ReturnValue mutants at once.
     - **Do NOT modify source code** to make tests easier. Only add tests.
     - **Do NOT add tests for clusters classified as "Equivalent-mutant candidates"** in the report — those are observability-only.
     - **For Angular components in `web-*` libs**: prefer testing the component class methods/signals directly via `TestBed.createComponent(...)` + `fixture.componentInstance`, not deep DOM assertions, unless a DOM behavior is the survivor.
  3. Verify the new tests pass: `pnpm nx test <MODULE> --skip-nx-cache`.
  4. Update `state.json` module entry with `notes` describing what was tackled (e.g., "iter 2: added tests for parseEvent boundary cases").
  5. Exit the iteration (Ralph re-invokes; the next run will re-execute stryker and measure progress).

### 5. NEVER

- Never run `git add -A` or `git add .` (the `node_modules/` symlink evades `.gitignore`).
- Never modify production source code to make tests pass.
- Never skip stryker because "the tests look thorough" — measure, don't guess.
- Never lower the threshold in `state.json`.
- Never commit if the iteration ended without reaching threshold — only commit on `done`.
- Never run stryker on multiple modules in one iteration.
- Never delete the `.stryker-tmp` folder while a run is in progress.
- Never edit files outside the worktree.

## Style for added tests

- Imports use the same style as existing specs in the module (relative paths, no `@/...` alias).
- Vitest globals (`describe`, `it`, `expect`, `vi`) — they are already on for these projects.
- Use `it.each` or table-driven tests when killing boundary mutants (RelationalOperator, EqualityOperator).
- Comments only when WHY is non-obvious. Don't narrate WHAT the test does — the name describes that.

## Telemetry — print at the end of every iteration

Before exiting (whether you committed or not, whether you'll emit the completion promise or not), print a single tagged line for the user:

```
[mutation-loop] iter=<N>/25 module=<MODULE> score=<SCORE>% status=<pending|in_progress|done|skip> next=<next-module-or-"DONE">
```

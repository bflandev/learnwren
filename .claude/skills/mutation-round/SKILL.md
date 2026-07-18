---
name: mutation-round
description: Use when running Stryker mutation testing in this repo — scoping a run to new files, triaging survived mutants, marking equivalents, or updating the mutation report in docs/quality.
---

# Mutation Round (Stryker)

Per-lib configs live at repo root: `stryker.<lib>.config.mjs`. Repo standard: 100% adjusted score (killed ÷ (total − documented equivalents)); CI enforces an 80-adjusted gate.

## Scoping a run to new code

```bash
npx stryker run stryker.<lib>.config.mjs --mutate "libs/<lib>/src/lib/<file1>.ts,libs/<lib>/src/lib/<file2>.ts"
```

`--mutate` replaces the config's globs — list only the files under test. Survivors: read `reports/mutation/<lib>/mutation.json` (filter status `Survived`/`NoCoverage`), not the console tail.

**Two hard rules:**
1. **Never run two Stryker configs concurrently** — they share `tempDirName: '.stryker-tmp'` with `cleanTempDir: 'always'`; one run wipes the other's sandbox. Sequential only.
2. **Never run `tools/mutation/report.mjs` after a scoped (`--mutate`) run, and never no-arg from a single-lib worktree** — it writes the lib's record in `docs/quality/mutation-report.md` from the partial JSON, clobbering the full-lib numbers. Only full-config runs feed the report.

## Survivor triage (proven patterns)

| Surviving mutant shape | Missing assertion |
|---|---|
| Conditional-spread `...(x !== undefined ? {k} : {})` → `true` | `expect('k' in obj).toBe(false)` — `toBeUndefined()` passes on a present-but-undefined key |
| StringLiteral in a query/collection/where arg → `""` | Mocks ignore args: add `toHaveBeenCalledWith('users', …)` |
| Guard mutants that only re-derive `false` via null/NaN coercion (`null > 10`, `NaN > 0.8`) | Genuinely equivalent — annotate, don't chase |
| Clamp ternary `p > MAX ? MAX : p` boundary operators | Restructure to `Math.min(p, MAX)` — every operator mutant becomes killable |
| Stale-response/loadToken guards | Deferred-promise race test: two overlapping loads, settle the old one, assert state untouched |
| Angular computed mutants marked NoCoverage | Template never evaluated it — call the computed directly with a null/edge report |

Prefer one test that kills a cluster over one test per mutant; prefer restructuring (Math.min) over excusing.

## Equivalence annotations

Repo convention (see `analytics.service.ts` for exemplars):

```ts
// Stryker disable next-line ConditionalExpression: equivalent — <concrete reason>
```

`next-line` reaches ONE line — for a multi-line condition use the block form (`// Stryker disable X: reason` … `// Stryker restore X`). Honest equivalent rate is 5–15% of survivors; above that you're hiding gaps.

## Common mistakes

| Mistake | Reality |
|---|---|
| Parallel runs for speed | Shared `.stryker-tmp` — they corrupt each other. |
| `report.mjs` after a scoped run | Clobbers `docs/quality/mutation-report.md` with partial data. |
| Marking a survivor equivalent first | Rule out a real gap first: "if a PR made this exact change, which test fails?" |
| Trusting the console summary | The JSON has the full survivor list; the console tail truncates. |

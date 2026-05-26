# Quality reports

## Mutation testing

[`mutation-report.md`](./mutation-report.md) is the actionable triage list — survivors clustered by file and nearby lines, each with a plain-English diagnosis and a recommended test. Each lib has a section with a headline, per-file scores, survivor clusters, and an equivalent-mutant candidate list.

```sh
pnpm mutate                  # full Stryker run across every lib + regenerate the report
pnpm mutate:api-auth         # just run Stryker for api-auth (writes reports/mutation/api-auth/*)
pnpm mutate:api-courses      # ditto for api-courses
pnpm mutate:web-catalog      # ditto for web-catalog
pnpm mutate:web-enrollment   # ditto for web-enrollment
pnpm mutate:web-ui           # ditto for web-ui
pnpm mutate:report           # just regenerate docs/quality/mutation-report.md from the JSONs
```

Each lib has its own `stryker.<lib>.config.mjs` at the workspace root. The runner is `@stryker-mutator/vitest-runner` pointed at each lib's `vite.config.mts`. Configs exclude DTOs, modules, type-only files, barrel re-exports, and any spec that fails to import its deps in vitest.

`tools/mutation/report.mjs` auto-discovers every `reports/mutation/<lib>/mutation.json` and renders one consolidated report. To add a new lib, drop a `stryker.<lib>.config.mjs`, add a `mutate:<lib>` script, and the report picks it up automatically — no edits to `report.mjs` needed (though `LIB_GUIDANCE` there sets the target band per lib; unknown libs render as "unclassified").

### Target bands

Per the mutation-testing skill:

| Lib | Band | Adjusted target |
|---|---|---|
| `api-auth` | auth / billing / auth-adjacent | 90%+ |
| `api-courses` | core domain logic | 75–85% |
| `web-catalog`, `web-enrollment`, `web-ui` | glue / orchestration | 50–70% |

### Adjusted vs. raw score

The report shows **two** scores per lib:

- **Raw** — what Stryker emits directly: `killed / (killed + survived + no-cov)`.
- **Adjusted** — the same with equivalent-mutant candidates dropped from the denominator. This is what the team operates against.

The classifier in `tools/mutation/report.mjs` auto-detects three equivalent patterns:

1. String literals inside logger calls (single- and multi-line),
2. `Logger` constructor names,
3. Catch blocks whose body is only logging.

Other survivors require manual review and either a test or an explicit `// Stryker disable next-line all` comment in source. The raw score is preserved so regressions in *real* survivors stay visible even when the adjusted number looks fine.

## CRAP score

[`crap-report.md`](./crap-report.md) ranks methods by **Change Risk Anti-Pattern** score (Savoia & Evans):

```
CRAP(m) = comp(m)² × (1 − cov(m)/100)³ + comp(m)
```

A method is "crappy" (>30) when it is **both** complex *and* poorly tested. Either alone is tolerable.

### Re-running

```sh
pnpm crap            # runs coverage across testable projects, then writes the report
pnpm crap:coverage   # just (re)generate vitest coverage-final.json files
pnpm crap:report     # just regenerate docs/quality/crap-report.md from existing coverage
```

Coverage runs are gathered from these projects: `api-auth`, `api-courses`, `api-firebase`, `shared-data-models`, `web-auth`, `web-catalog`, `web-courses`, `web-enrollment`, `web-ui`, `web-video`, `api`. The `web` app uses `@angular/build:unit-test` which doesn't emit Istanbul JSON in this workspace yet, so it's omitted. To add a new lib, append a `coverage/libs/<name>` entry to `COVERAGE_DIRS` in `tools/crap/crap.mjs` and add the project to the `--projects=` list in the `crap:coverage` script.

### How it works

`tools/crap/crap.mjs` is a self-contained Node script that:

1. Walks the TypeScript AST per source file (using the `typescript` compiler API) and computes McCabe cyclomatic complexity per function.
2. Reads each project's `coverage-final.json` (Istanbul-shaped JSON emitted by Vitest's V8 provider).
3. Joins per-function branch coverage by AST line range.
4. Falls back to file-level branch coverage when the V8 coverage uses post-transform line numbers (e.g. `@analogjs/vite-plugin-angular` strips type-only lines and breaks line-by-line joins). Rows using the fallback are marked in the **Basis** column.

### Reading the report

- The top-20 table sorts by CRAP descending; only methods with complexity > 1 are shown.
- The recommendation column is rule-based:
  - `comp ≥ 10 && cov ≥ 50%` → **refactor** (extract until each piece has comp ≤ 5, then test)
  - `comp ≥ 10 && cov < 50%` → **characterize-then-refactor** (pin behavior with tests, then split)
  - `comp < 10 && cov < 50%` → **test** (a handful of branch-covering tests will collapse the score)
  - `comp < 10 && cov ≥ 50%` → **refactor** (the branching is the problem; tests aren't)

### Known limitations

- File-level fallback rows (Basis = `file-branch-fallback`) attribute the file's overall branch coverage to every function in that file. Treat as estimates within ±20%.
- Test quality is unmeasured — coverage tracks line execution, not assertion strength. Pair with mutation testing for high-stakes modules.
- Coupling and churn are not factored in. A crappy method nobody touches is lower priority than a moderate-CRAP method edited every sprint.
- Source files never imported by any test are absent from the report. Untested modules may be the bigger risk; the "Projects covered" section enumerates what was actually exercised.
- `index.ts`, `main.ts`, `*.module.ts`, `*.config.ts`, and `.d.ts` are excluded as framework wiring whose CRAP is rarely actionable.

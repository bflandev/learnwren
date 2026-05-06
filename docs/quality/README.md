# Quality reports

## Mutation testing

[`mutation-report.md`](./mutation-report.md) is the actionable triage list — survivors clustered by file and nearby lines, each with a plain-English diagnosis and a recommended test. Headline mutation score for `libs/api-auth` is at the top of the report.

```sh
pnpm mutate            # full Stryker run on api-auth + regenerate the report
pnpm mutate:api-auth   # just run Stryker (writes reports/mutation/api-auth/*)
pnpm mutate:report     # just regenerate docs/quality/mutation-report.md from the JSON
```

Configuration lives in `stryker.api-auth.config.mjs`. Scope is intentionally narrow on day one — `libs/api-auth/src/lib/**/*.ts` excluding `email-transport/**` (broken spec), `auth.module.ts`, `dto/**`, `types/**`, `errors/**`, and `index.ts`. The runner is `@stryker-mutator/vitest-runner` pointed at `libs/api-auth/vitest.config.mts`.

The report:

- groups survivors into clusters (mutants within 5 lines of each other),
- translates Stryker mutator names (`ConditionalExpression`, `OptionalChaining`, `BlockStatement`, ...) into the missing-assertion shape they imply,
- proposes equivalent-mutant candidates (logger string content) but does not silently exclude them — review before adding to the config.

Auth code targets **90%+** mutation score per the mutation-testing skill. Treat survivors as latent bugs, not as cosmetic gaps.

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

Coverage runs are gathered from these projects: `api-auth`, `api-firebase`, `web-auth`, `shared-data-models`, `api`. The `web` app uses `@angular/build:unit-test` which doesn't emit Istanbul JSON in this workspace yet, so it's omitted.

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

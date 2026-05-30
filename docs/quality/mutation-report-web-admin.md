# Mutation Test Report — `libs/web-admin`

> Generated 2026-05-30T03:53:15.114Z

**Headline mutation score: 92.41%** (killed=73, survived=6, no-cov=0, ignored=0). Score on covered mutants only: 92.41%. Adjusted (equivalent candidates excluded): 92.41%.


Target band: unclassified.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/admin-instructor-applications-page/admin-instructor-applications-page.component.ts` | 88.5% | 46 | 6 | 0 |
| `src/lib/admin-instructor-applications.service.ts` | 100.0% | 6 | 0 | 0 |
| `src/lib/admin-role.guard.ts` | 100.0% | 21 | 0 | 0 |

## Survivor clusters — gaps to close

### `src/lib/admin-instructor-applications-page/admin-instructor-applications-page.component.ts` — 6 surviving mutants

**Cluster 1** (lines 23): 1 mutant surviving — ArrayDeclaration×1

Sample mutation:
```diff
- readonly applications = signal<PendingInstructorApplicationView[]>([]);
+ <replaced with: ["Stryker was here"]>
```

_Diagnosis._ An array literal could be replaced with `[]` and tests pass. The contents (length, ordering, item shape) are not pinned.

_Recommended test._ Assert on the array length / object shape returned at `admin-instructor-applications-page.component.ts:23`, not just truthiness.

**Cluster 2** (lines 67 — `code()`): 3 mutants surviving — OptionalChaining×3

Sample mutation:
```diff
- const code = (err as { error?: { error?: { code?: string } } })?.error?.error?.code;
+ <replaced with: (err as {
  error?: {
    error?: {
      code?: string;
    };
  };
})?.error?.error.code>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `admin-instructor-applications-page.component.ts:67` in `code`.

**Cluster 3** (lines 86–92 — `clearError()`): 2 mutants surviving — BlockStatement×1, ObjectLiteral×1

Sample mutation:
```diff
- private clearError(uid: string): void {
+ <replaced with: {}>
```

_Diagnosis._ An entire block could be deleted without test failure: the side effect inside it is not observed. Assert on the change it makes (state, mock call, returned value).

_Recommended test._ Add an assertion on the side effect of the block/function at `admin-instructor-applications-page.component.ts:86` in `clearError` — verify state change, mock invocation, or returned value.

## Equivalent-mutant candidates (excluded from adjusted score)

_None._

## Caveats

- **Scope is per-lib Stryker config.** See `stryker.web-admin.config.mjs` for what gets mutated / excluded.
- **Coverage analysis is `perTest`.** Stryker only runs tests whose coverage hit the mutated line.
- **No-coverage mutants count against the raw score.** They reflect lines no test executes.
- **Equivalent classification is heuristic.** Review each candidate before treating the adjusted score as authoritative.

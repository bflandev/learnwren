# Mutation Test Report — `libs/api-profile`

> Generated 2026-10-02T11:15:07.378Z

**Headline mutation score: 99.79%** (killed=938, survived=2, no-cov=0, ignored=48). Score on covered mutants only: 99.79%. Adjusted (equivalent candidates excluded): 99.79%.


Target band: unclassified.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/instructor-application/instructor-application.service.ts` | 98.4% | 60 | 1 | 0 |
| `src/lib/users/admin-users.repository.ts` | 99.0% | 101 | 1 | 0 |
| `src/lib/email/email-change.service.ts` | 100.0% | 95 | 0 | 0 |
| `src/lib/email/email.exception-filter.ts` | 100.0% | 1 | 0 | 0 |
| `src/lib/instructor-application/admin-instructor-application.exception-filter.ts` | 100.0% | 1 | 0 | 0 |
| `src/lib/instructor-application/admin-instructor-application.service.ts` | 100.0% | 77 | 0 | 0 |
| `src/lib/instructor-application/instructor-application.exception-filter.ts` | 100.0% | 1 | 0 | 0 |
| `src/lib/password/password-change.service.ts` | 100.0% | 38 | 0 | 0 |
| `src/lib/password/password.exception-filter.ts` | 100.0% | 1 | 0 | 0 |
| `src/lib/picture/picture.exception-filter.ts` | 100.0% | 1 | 0 | 0 |
| `src/lib/profile.exception-filter.ts` | 100.0% | 1 | 0 | 0 |
| `src/lib/profile.service.ts` | 100.0% | 38 | 0 | 0 |
| `src/lib/users/admin-user-delete.service.ts` | 100.0% | 60 | 0 | 0 |
| `src/lib/users/admin-user-status.service.ts` | 100.0% | 82 | 0 | 0 |
| `src/lib/users/admin-users.exception-filter.ts` | 100.0% | 1 | 0 | 0 |
| `src/lib/email/email-change.controller.ts` | 100.0% | 7 | 0 | 0 |
| `src/lib/instructor-application/admin-instructor-application.controller.ts` | 100.0% | 3 | 0 | 0 |
| `src/lib/instructor-application/admin-promotion.ts` | 100.0% | 16 | 0 | 0 |
| `src/lib/instructor-application/instructor-application.controller.ts` | 100.0% | 3 | 0 | 0 |
| `src/lib/instructor-application/instructor-promotion.ts` | 100.0% | 17 | 0 | 0 |
| `src/lib/password/password-change.controller.ts` | 100.0% | 3 | 0 | 0 |
| `src/lib/picture/fake-picture-storage.adapter.ts` | 100.0% | 6 | 0 | 0 |
| `src/lib/picture/picture-storage.adapter.ts` | 100.0% | 6 | 0 | 0 |
| `src/lib/picture/picture.config.ts` | 100.0% | 42 | 0 | 0 |
| `src/lib/picture/profile-picture.controller.ts` | 100.0% | 17 | 0 | 0 |
| `src/lib/picture/profile-picture.service.ts` | 100.0% | 53 | 0 | 0 |
| `src/lib/profile.controller.ts` | 100.0% | 5 | 0 | 0 |
| `src/lib/users/admin-user-role.service.ts` | 100.0% | 80 | 0 | 0 |
| `src/lib/users/admin-users.controller.ts` | 100.0% | 15 | 0 | 0 |
| `src/lib/users/admin-users.service.ts` | 100.0% | 95 | 0 | 0 |
| `src/lib/users/user-status.ts` | 100.0% | 11 | 0 | 0 |
| `src/lib/instructor-application/instructor-applications.constants.ts` | 100.0% | 1 | 0 | 0 |

## Survivor clusters — gaps to close

### `src/lib/instructor-application/instructor-application.service.ts` — 1 surviving mutant

**Cluster 1** (lines 77 — `if()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (existing.exists) {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `instructor-application.service.ts:77` in `if` with assertions that distinguish the outcomes.

### `src/lib/users/admin-users.repository.ts` — 1 surviving mutant

**Cluster 2** (lines 159 — `stillActive()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- const stillActive = (enrollmentSnap.data() as Enrollment).status === 'ACTIVE';
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `admin-users.repository.ts:159` in `stillActive` with assertions that distinguish the outcomes.

## Equivalent-mutant candidates (excluded from adjusted score)

_None._

## Caveats

- **Scope is per-lib Stryker config.** See `stryker.api-profile.config.mjs` for what gets mutated / excluded.
- **Coverage analysis is `perTest`.** Stryker only runs tests whose coverage hit the mutated line.
- **No-coverage mutants count against the raw score.** They reflect lines no test executes.
- **Equivalent classification is heuristic.** Review each candidate before treating the adjusted score as authoritative.

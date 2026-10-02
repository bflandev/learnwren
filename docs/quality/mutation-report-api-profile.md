# Mutation Test Report — `libs/api-profile`

> Generated 2026-10-02T16:56:55.154Z

**Headline mutation score: 100.00%** (killed=940, survived=0, no-cov=0, ignored=48). Score on covered mutants only: 100.00%. Adjusted (equivalent candidates excluded): 100.00%.

## Mutation sweep (2026-10-02)

Full-config run: **100%** (940 killed, 0 survived), up from 99.79% (2 survivors).

- `instructor-application.service.ts:77` (`if (existing.exists)` → `true`): the spec's
  hand-rolled store returned `{}` from `data()` for a missing doc, so the mutant read
  `undefined` status and fell through. The fake now returns `undefined` for a missing doc,
  as the real store does, and every fresh-submit test kills it.
- `admin-users.repository.ts:159` (`stillActive` → `true`): new test where the in-txn
  re-read finds the enrollment WITHDRAWN (withdrawn between the query and the purge):
  the doc is deleted and the course count is not decremented a second time.

Target band: unclassified.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/email/email-change.service.ts` | 100.0% | 95 | 0 | 0 |
| `src/lib/email/email.exception-filter.ts` | 100.0% | 1 | 0 | 0 |
| `src/lib/instructor-application/admin-instructor-application.exception-filter.ts` | 100.0% | 1 | 0 | 0 |
| `src/lib/instructor-application/admin-instructor-application.service.ts` | 100.0% | 77 | 0 | 0 |
| `src/lib/instructor-application/instructor-application.exception-filter.ts` | 100.0% | 1 | 0 | 0 |
| `src/lib/instructor-application/instructor-application.service.ts` | 100.0% | 61 | 0 | 0 |
| `src/lib/password/password-change.service.ts` | 100.0% | 38 | 0 | 0 |
| `src/lib/password/password.exception-filter.ts` | 100.0% | 1 | 0 | 0 |
| `src/lib/picture/picture.exception-filter.ts` | 100.0% | 1 | 0 | 0 |
| `src/lib/profile.exception-filter.ts` | 100.0% | 1 | 0 | 0 |
| `src/lib/profile.service.ts` | 100.0% | 38 | 0 | 0 |
| `src/lib/users/admin-user-delete.service.ts` | 100.0% | 60 | 0 | 0 |
| `src/lib/users/admin-user-status.service.ts` | 100.0% | 82 | 0 | 0 |
| `src/lib/users/admin-users.exception-filter.ts` | 100.0% | 1 | 0 | 0 |
| `src/lib/users/admin-users.repository.ts` | 100.0% | 102 | 0 | 0 |
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

_No actionable survivors after filtering equivalent candidates._

## Equivalent-mutant candidates (excluded from adjusted score)

_None._

## Caveats

- **Scope is per-lib Stryker config.** See `stryker.api-profile.config.mjs` for what gets mutated / excluded.
- **Coverage analysis is `perTest`.** Stryker only runs tests whose coverage hit the mutated line.
- **No-coverage mutants count against the raw score.** They reflect lines no test executes.
- **Equivalent classification is heuristic.** Review each candidate before treating the adjusted score as authoritative.

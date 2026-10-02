# Mutation Test Report — `libs/web-auth`

> Generated 2026-10-02T00:58:33.452Z

**Headline mutation score: 100.00%** (killed=504, survived=0, no-cov=0, ignored=17). Score on covered mutants only: 100.00%. Adjusted (equivalent candidates excluded): 100.00%.


Target band: unclassified.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/auth.service.ts` | 100.0% | 106 | 0 | 0 |
| `src/lib/email-action-page/email-action-page.component.ts` | 100.0% | 99 | 0 | 0 |
| `src/lib/login-page/login-page.component.ts` | 100.0% | 116 | 0 | 0 |
| `src/lib/register-page/register-page.component.ts` | 100.0% | 75 | 0 | 0 |
| `src/lib/auth.guard.ts` | 100.0% | 17 | 0 | 0 |
| `src/lib/forgot-password-page/forgot-password-page.component.ts` | 100.0% | 14 | 0 | 0 |
| `src/lib/password-policy.validator.ts` | 100.0% | 17 | 0 | 0 |
| `src/lib/register-confirm-page/register-confirm-page.component.ts` | 100.0% | 28 | 0 | 0 |
| `src/lib/unlock-page/unlock-page.component.ts` | 100.0% | 29 | 0 | 0 |
| `src/lib/with-credentials.interceptor.ts` | 100.0% | 3 | 0 | 0 |

## Survivor clusters — gaps to close

_No actionable survivors after filtering equivalent candidates._

## Equivalent-mutant candidates (excluded from adjusted score)

_None._

## Caveats

- **Scope is per-lib Stryker config.** See `stryker.web-auth.config.mjs` for what gets mutated / excluded.
- **Coverage analysis is `perTest`.** Stryker only runs tests whose coverage hit the mutated line.
- **No-coverage mutants count against the raw score.** They reflect lines no test executes.
- **Equivalent classification is heuristic.** Review each candidate before treating the adjusted score as authoritative.

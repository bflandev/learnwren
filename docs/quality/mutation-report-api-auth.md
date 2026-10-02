# Mutation Test Report — `libs/api-auth`

> Generated 2026-10-02T01:13:53.517Z

**Headline mutation score: 100.00%** (killed=785, survived=0, no-cov=0, ignored=71). Score on covered mutants only: 100.00%. Adjusted (equivalent candidates excluded): 100.00%.


Target band: auth / billing / auth-adjacent — 90%+ target.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/account-recovery.service.ts` | 100.0% | 74 | 0 | 0 |
| `src/lib/auth.exception-filter.ts` | 100.0% | 1 | 0 | 0 |
| `src/lib/auth.service.ts` | 100.0% | 97 | 0 | 0 |
| `src/lib/firebase-auth-rest-client.ts` | 100.0% | 29 | 0 | 0 |
| `src/lib/firebase-session.guard.ts` | 100.0% | 12 | 0 | 0 |
| `src/lib/identity/firebase-identity-provider.ts` | 100.0% | 103 | 0 | 0 |
| `src/lib/identity/identity-provider.port.ts` | 100.0% | 3 | 0 | 0 |
| `src/lib/identity/local-identity-provider.ts` | 100.0% | 172 | 0 | 0 |
| `src/lib/password-verification.service.ts` | 100.0% | 15 | 0 | 0 |
| `src/lib/session-cookie.service.ts` | 100.0% | 8 | 0 | 0 |
| `src/lib/admin-role.guard.ts` | 100.0% | 8 | 0 | 0 |
| `src/lib/auth-attempts.repository.ts` | 100.0% | 116 | 0 | 0 |
| `src/lib/auth.controller.ts` | 100.0% | 40 | 0 | 0 |
| `src/lib/identity/identity.config.ts` | 100.0% | 27 | 0 | 0 |
| `src/lib/identity/identity.errors.ts` | 100.0% | 4 | 0 | 0 |
| `src/lib/identity/opaque-token.ts` | 100.0% | 5 | 0 | 0 |
| `src/lib/identity/password-hash.ts` | 100.0% | 35 | 0 | 0 |
| `src/lib/identity/public-url.ts` | 100.0% | 5 | 0 | 0 |
| `src/lib/instructor-role.guard.ts` | 100.0% | 8 | 0 | 0 |
| `src/lib/password-policy.service.ts` | 100.0% | 18 | 0 | 0 |
| `src/lib/session-cookie.helper.ts` | 100.0% | 5 | 0 | 0 |

## Survivor clusters — gaps to close

_No actionable survivors after filtering equivalent candidates._

## Equivalent-mutant candidates (excluded from adjusted score)

_None._

## Caveats

- **Scope is per-lib Stryker config.** See `stryker.api-auth.config.mjs` for what gets mutated / excluded.
- **Coverage analysis is `perTest`.** Stryker only runs tests whose coverage hit the mutated line.
- **No-coverage mutants count against the raw score.** They reflect lines no test executes.
- **Equivalent classification is heuristic.** Review each candidate before treating the adjusted score as authoritative.

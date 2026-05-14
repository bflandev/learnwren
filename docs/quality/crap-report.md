# CRAP Score Report

> Generated 2026-05-14T02:40:57.520Z

Threshold: **30** (canonical Savoia/Evans cutoff for "crappy").

Formula: `CRAP(m) = comp(m)² × (1 − cov(m)/100)³ + comp(m)`. Complexity counts `if`, `case`, `?:`, `&&`/`||`/`??`, `for`/`while`/`do`, `catch`. Coverage is **branch coverage** from Vitest V8→Istanbul `coverage-final.json`, joined per function by AST line range. Falls back to function-hit (0% / 100%) and then statement coverage when no branches exist in the range.

## Projects covered

- ✅ `coverage/libs/api-auth`
- ✅ `coverage/libs/api-firebase`
- ✅ `coverage/libs/web-auth`
- ✅ `coverage/libs/shared-data-models`
- ✅ `coverage/apps/api`
- ❌ `coverage/apps/web` — no coverage emitted (no tests, or test run skipped)

## Codebase summary

- Functions analyzed (excluding modules/configs/tests): **111**
- Clean (≤5): **98**
- Acceptable (6–15): **13**
- Risky (16–30): **0**
- Crappy (>30): **0**

## Top offenders (max 20, complexity > 1)

| # | Function | File:line | Comp | Cov % | Basis | CRAP | Verdict |
|---|----------|-----------|------|-------|-------|------|---------|
| 1 | `register` | `libs/api-auth/src/lib/auth.service.ts:86` | 14 | 93.8 | branch | 14.05 | acceptable |
| 2 | `toLoginErr` | `libs/web-auth/src/lib/auth.service.ts:115` | 7 | 57.9 | file-branch-fallback | 10.66 | acceptable |
| 3 | `toErrorState` | `libs/web-auth/src/lib/login-page/login-page.component.ts:92` | 5 | 50.0 | file-branch-fallback | 8.13 | acceptable |
| 4 | `<anonymous>` | `libs/web-auth/src/lib/password-policy.validator.ts:21` | 8 | 100.0 | branch | 8.00 | acceptable |
| 5 | `login` | `libs/api-auth/src/lib/auth.service.ts:180` | 7 | 100.0 | branch | 7.00 | acceptable |
| 6 | `resendVerification` | `libs/api-auth/src/lib/auth.service.ts:322` | 7 | 100.0 | branch | 7.00 | acceptable |
| 7 | `validate` | `libs/api-auth/src/lib/password-policy.service.ts:26` | 7 | 100.0 | branch | 7.00 | acceptable |
| 8 | `unlock` | `libs/web-auth/src/lib/auth.service.ts:100` | 5 | 57.9 | file-branch-fallback | 6.87 | acceptable |
| 9 | `<anonymous>` | `libs/api-auth/src/lib/auth-attempts.repository.ts:60` | 6 | 90.0 | branch | 6.04 | acceptable |
| 10 | `requestPasswordReset` | `libs/api-auth/src/lib/auth.service.ts:359` | 6 | 100.0 | branch | 6.00 | acceptable |
| 11 | `catch` | `libs/api-auth/src/lib/auth.exception-filter.ts:18` | 5 | 75.0 | branch | 5.39 | acceptable |
| 12 | `logoutSideEffects` | `libs/api-auth/src/lib/auth.service.ts:275` | 5 | 83.3 | branch | 5.12 | acceptable |
| 13 | `signInWithPassword` | `libs/api-auth/src/lib/firebase-auth-rest-client.ts:37` | 5 | 87.5 | branch | 5.05 | acceptable |
| 14 | `toState` | `libs/web-auth/src/lib/unlock-page/unlock-page.component.ts:35` | 4 | 62.5 | file-branch-fallback | 4.84 | clean |
| 15 | `toMessage` | `libs/web-auth/src/lib/register-page/register-page.component.ts:74` | 4 | 66.7 | file-branch-fallback | 4.59 | clean |
| 16 | `submit` | `libs/web-auth/src/lib/login-page/login-page.component.ts:58` | 3 | 50.0 | file-branch-fallback | 4.13 | clean |
| 17 | `resendVerification` | `libs/web-auth/src/lib/login-page/login-page.component.ts:77` | 3 | 50.0 | file-branch-fallback | 4.13 | clean |
| 18 | `redeemUnlockToken` | `libs/api-auth/src/lib/auth-attempts.repository.ts:95` | 4 | 83.3 | branch | 4.07 | clean |
| 19 | `resolveEmailTransport` | `libs/api-auth/src/lib/email-transport/email-transport.factory.ts:13` | 4 | 87.5 | file-branch-fallback | 4.03 | clean |
| 20 | `<anonymous>` | `libs/api-auth/src/lib/auth-attempts.repository.ts:130` | 4 | 100.0 | branch | 4.00 | clean |

## Recommendation per offender

1. `register` (libs/api-auth/src/lib/auth.service.ts:86) — **refactor — branching dominates; extract until each piece has comp ≤ 5, then test**
2. `toLoginErr` (libs/web-auth/src/lib/auth.service.ts:115) — **refactor — coverage is fine; the branching is the problem**
3. `toErrorState` (libs/web-auth/src/lib/login-page/login-page.component.ts:92) — **refactor — coverage is fine; the branching is the problem**
4. `<anonymous>` (libs/web-auth/src/lib/password-policy.validator.ts:21) — **refactor — coverage is fine; the branching is the problem**
5. `login` (libs/api-auth/src/lib/auth.service.ts:180) — **refactor — coverage is fine; the branching is the problem**
6. `resendVerification` (libs/api-auth/src/lib/auth.service.ts:322) — **refactor — coverage is fine; the branching is the problem**
7. `validate` (libs/api-auth/src/lib/password-policy.service.ts:26) — **refactor — coverage is fine; the branching is the problem**
8. `unlock` (libs/web-auth/src/lib/auth.service.ts:100) — **refactor — coverage is fine; the branching is the problem**
9. `<anonymous>` (libs/api-auth/src/lib/auth-attempts.repository.ts:60) — **refactor — coverage is fine; the branching is the problem**
10. `requestPasswordReset` (libs/api-auth/src/lib/auth.service.ts:359) — **refactor — coverage is fine; the branching is the problem**
11. `catch` (libs/api-auth/src/lib/auth.exception-filter.ts:18) — **refactor — coverage is fine; the branching is the problem**
12. `logoutSideEffects` (libs/api-auth/src/lib/auth.service.ts:275) — **refactor — coverage is fine; the branching is the problem**
13. `signInWithPassword` (libs/api-auth/src/lib/firebase-auth-rest-client.ts:37) — **refactor — coverage is fine; the branching is the problem**
14. `toState` (libs/web-auth/src/lib/unlock-page/unlock-page.component.ts:35) — **refactor — coverage is fine; the branching is the problem**
15. `toMessage` (libs/web-auth/src/lib/register-page/register-page.component.ts:74) — **refactor — coverage is fine; the branching is the problem**
16. `submit` (libs/web-auth/src/lib/login-page/login-page.component.ts:58) — **refactor — coverage is fine; the branching is the problem**
17. `resendVerification` (libs/web-auth/src/lib/login-page/login-page.component.ts:77) — **refactor — coverage is fine; the branching is the problem**
18. `redeemUnlockToken` (libs/api-auth/src/lib/auth-attempts.repository.ts:95) — **refactor — coverage is fine; the branching is the problem**
19. `resolveEmailTransport` (libs/api-auth/src/lib/email-transport/email-transport.factory.ts:13) — **refactor — coverage is fine; the branching is the problem**
20. `<anonymous>` (libs/api-auth/src/lib/auth-attempts.repository.ts:130) — **refactor — coverage is fine; the branching is the problem**

## Caveats

- **Coverage basis column** indicates how each function's coverage was computed: `branch` (per-function branch coverage in source line range — most accurate), `statement`/`fn-hit` (degraded fallback), `file-branch-fallback` (the V8 coverage line numbers were post-transform — usually @analogjs/vite-plugin-angular — so we attribute the file's overall branch coverage to every function in the file). Treat `*-fallback` rows as estimates.
- **Function-to-coverage join is line-range-based.** A nested arrow inside a class property may inherit the enclosing function's branch hits; treat scores within ±20% as noise.
- **Test quality is unmeasured.** Coverage records that a line ran, not that the assertion was meaningful. Pair with mutation testing (Stryker / vitest mutation runners) for high-stakes modules.
- **Coupling and churn are absent.** A crappy method nobody touches is lower priority than a moderate-CRAP method edited every sprint. Cross-reference with `git log --follow` before declaring a remediation order.
- **Files with no Istanbul record are not in this report.** Source modules never imported by any test are silently absent — they may be the bigger risk. The "Projects covered" list shows what was actually exercised.
- **Index, main, module, and config files are excluded.** They are barrel files / framework wiring whose CRAP is rarely actionable.

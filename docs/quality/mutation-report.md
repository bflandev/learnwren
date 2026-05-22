# Mutation Test Report — `libs/api-auth`

> Generated 2026-05-21T23:48:30.501Z

**Headline mutation score: 89.25%** (killed=415, survived=45, no-cov=5, ignored=0). Score on covered mutants only: 90.22%.

Auth code targets **90%+** per the mutation-testing skill. We are below target — survivors below are gaps to close.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/firebase-session.guard.ts` | 83.3% | 15 | 3 | 0 |
| `src/lib/firebase-auth-rest-client.ts` | 83.8% | 31 | 5 | 1 |
| `src/lib/auth.service.ts` | 85.2% | 202 | 33 | 2 |
| `src/lib/auth.exception-filter.ts` | 86.7% | 13 | 2 | 0 |
| `src/lib/auth-attempts.repository.ts` | 95.3% | 81 | 2 | 2 |
| `src/lib/auth.controller.ts` | 100.0% | 19 | 0 | 0 |
| `src/lib/instructor-role.guard.ts` | 100.0% | 8 | 0 | 0 |
| `src/lib/password-policy.service.ts` | 100.0% | 41 | 0 | 0 |
| `src/lib/session-cookie.helper.ts` | 100.0% | 5 | 0 | 0 |

## Survivor clusters — gaps to close

### `src/lib/auth.service.ts` — 5 surviving mutants

**Cluster 1** (lines 277 — `continueUrl()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- const base = process.env['LEARNWREN_PUBLIC_URL'] ?? 'http://localhost:4200';
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `auth.service.ts:277` in `continueUrl`. If it's a log message, classify as equivalent.

**Cluster 2** (lines 286 — `logoutSideEffects()`): 1 mutant surviving — BooleanLiteral×1

Sample mutation:
```diff
- const decoded = await this.auth.verifySessionCookie(sessionCookie, true);
+ <replaced with: false>
```

_Diagnosis._ A `true`/`false` literal could be flipped and tests still pass. Add an assertion that pins the boolean.

_Recommended test._ Add a test that drives both sides of the conditional at `auth.service.ts:286` in `logoutSideEffects` with assertions that distinguish the outcomes.

**Cluster 3** (lines 325 — `sleepPastNextSecond()`): 1 mutant surviving — ArithmeticOperator×1

Sample mutation:
```diff
- const waitMs = 1000 - (Date.now() % 1000) + LOGOUT_REVOKE_MARGIN_MS;
+ <replaced with: 1000 + Date.now() % 1000>
```

_Diagnosis._ An arithmetic operator could be replaced. Pin the math with a deterministic input/output pair.

_Recommended test._ Inspect `auth.service.ts:325` in `sleepPastNextSecond` and add an assertion that distinguishes the original from the surviving mutation.

**Cluster 4** (lines 462 — `isFirebaseError()`): 2 mutants surviving — ConditionalExpression×2

Sample mutation:
```diff
- return typeof err === 'object' && err !== null && 'code' in err;
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `auth.service.ts:462` in `isFirebaseError` with assertions that distinguish the outcomes.

### `src/lib/auth-attempts.repository.ts` — 4 surviving mutants

**Cluster 5** (lines 102–105 — `redeemUnlockToken()`): 4 mutants surviving — ConditionalExpression×2, ObjectLiteral×1, StringLiteral×1

Sample mutation:
```diff
- if (query.empty) return { status: 'invalid' };
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `auth-attempts.repository.ts:102` in `redeemUnlockToken` with assertions that distinguish the outcomes.

### `src/lib/firebase-auth-rest-client.ts` — 4 surviving mutants

**Cluster 6** (lines 59 — `upstreamCode()`): 4 mutants surviving — StringLiteral×2, MethodExpression×1, OptionalChaining×1

Sample mutation:
```diff
- const upstreamCode = (errorBody?.error?.message ?? '').split(' ')[0]?.trim() ?? '';
+ <replaced with: "Stryker was here!">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `firebase-auth-rest-client.ts:59` in `upstreamCode`. If it's a log message, classify as equivalent.

## Equivalent-mutant candidates (proposed for exclusion)

These survivors are flagged as likely equivalent (mostly logger observability). Review and confirm before excluding from the score:

| File:line | Mutator | Reason |
|-----------|---------|--------|
| `src/lib/auth.service.ts:468` | BlockStatement | Catch block contains only logging — emptying it preserves the silent-swallow behavior. |
| `src/lib/auth.service.ts:469` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:81` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/auth.service.ts:118` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:118` | LogicalOperator | Operator/expression inside a logger call — affects log content only, not behavior. |
| `src/lib/auth.service.ts:118` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:136` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:144` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:156` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:170` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:175` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:208` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:208` | MethodExpression | Operator/expression inside a logger call — affects log content only, not behavior. |
| `src/lib/auth.service.ts:213` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:224` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:234` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:239` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:261` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:270` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:290` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:305` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:310` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:335` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:379` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:382` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:409` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:412` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:422` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:454` | BlockStatement | Catch block contains only logging — emptying it preserves the silent-swallow behavior. |
| `src/lib/auth.service.ts:457` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/firebase-auth-rest-client.ts:31` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/firebase-auth-rest-client.ts:66` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.exception-filter.ts:33` | LogicalOperator | Operator/expression inside a logger call — affects log content only, not behavior. |
| `src/lib/auth.exception-filter.ts:16` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/firebase-session.guard.ts:12` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/firebase-session.guard.ts:23` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/firebase-session.guard.ts:37` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |

Total: 37. Excluding these would raise the score from **89.25%** to **96.96%**. Confirm before adding to Stryker config.

## Caveats

- **Scope.** Only `libs/api-auth/src/lib/**/*.ts` was mutated, excluding `email-transport/**` (its spec fails to import nodemailer in vitest), `auth.module.ts`, `dto/**`, `types/**`, `errors/**`, and `index.ts`. Other libraries (`web-auth`, `api-firebase`) are not analyzed yet.
- **Coverage analysis.** `coverageAnalysis: perTest` — Stryker only runs tests whose coverage hit the mutated line. If a test exercises uncovered code paths through dynamic dispatch, that may be missed.
- **No-coverage mutants** count against the score. They reflect lines that no test executes; CRAP's coverage data agrees these are gaps.
- **Equivalent classification is heuristic.** The "candidates" list flags strings inside logger calls — review each before adding to Stryker's `mutator.excludedMutations` or per-line ignore comments.
- **Test quality is real but bounded.** A surviving mutant means an assertion is missing for the *code as written*. If the code is wrong and tests pin the wrong behavior, mutation testing won't catch it.

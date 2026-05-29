# Mutation Test Report — `libs/api-auth`

> Generated 2026-05-29T07:15:01.996Z

**Headline mutation score: 90.16%** (killed=440, survived=43, no-cov=5, ignored=0). Score on covered mutants only: 91.10%. Adjusted (equivalent candidates excluded): 97.35%.


Target band: auth / billing / auth-adjacent — 90%+ target.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/auth.exception-filter.ts` | 50.0% | 1 | 1 | 0 |
| `src/lib/session-cookie.service.ts` | 82.6% | 38 | 8 | 0 |
| `src/lib/firebase-session.guard.ts` | 83.3% | 15 | 3 | 0 |
| `src/lib/firebase-auth-rest-client.ts` | 83.8% | 31 | 5 | 1 |
| `src/lib/auth.service.ts` | 85.5% | 100 | 15 | 2 |
| `src/lib/account-recovery.service.ts` | 88.0% | 66 | 9 | 0 |
| `src/lib/auth-attempts.repository.ts` | 95.5% | 84 | 2 | 2 |
| `src/lib/auth.controller.ts` | 100.0% | 39 | 0 | 0 |
| `src/lib/firebase-error.util.ts` | 100.0% | 12 | 0 | 0 |
| `src/lib/instructor-role.guard.ts` | 100.0% | 8 | 0 | 0 |
| `src/lib/password-policy.service.ts` | 100.0% | 41 | 0 | 0 |
| `src/lib/session-cookie.helper.ts` | 100.0% | 5 | 0 | 0 |

## Survivor clusters — gaps to close

### `src/lib/auth-attempts.repository.ts` — 4 surviving mutants

**Cluster 1** (lines 103–106 — `redeemUnlockToken()`): 4 mutants surviving — ConditionalExpression×2, ObjectLiteral×1, StringLiteral×1

Sample mutation:
```diff
- if (query.empty) return { status: 'invalid' };
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `auth-attempts.repository.ts:103` in `redeemUnlockToken` with assertions that distinguish the outcomes.

### `src/lib/firebase-auth-rest-client.ts` — 4 surviving mutants

**Cluster 2** (lines 59 — `upstreamCode()`): 4 mutants surviving — StringLiteral×2, MethodExpression×1, OptionalChaining×1

Sample mutation:
```diff
- const upstreamCode = (errorBody?.error?.message ?? '').split(' ')[0]?.trim() ?? '';
+ <replaced with: "Stryker was here!">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `firebase-auth-rest-client.ts:59` in `upstreamCode`. If it's a log message, classify as equivalent.

### `src/lib/account-recovery.service.ts` — 2 surviving mutants

**Cluster 3** (lines 40 — `if()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- await this.dispatchOutboundEmail('resend-verification', emailHash, async () => {
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `account-recovery.service.ts:40` in `if`. If it's a log message, classify as equivalent.

**Cluster 4** (lines 57 — `requestPasswordReset()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- await this.dispatchOutboundEmail('password-reset', emailHash, async () => {
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `account-recovery.service.ts:57` in `requestPasswordReset`. If it's a log message, classify as equivalent.

### `src/lib/session-cookie.service.ts` — 2 surviving mutants

**Cluster 5** (lines 55 — `revokeFromCookie()`): 1 mutant surviving — BooleanLiteral×1

Sample mutation:
```diff
- const decoded = await this.auth.verifySessionCookie(sessionCookie, true);
+ <replaced with: false>
```

_Diagnosis._ A `true`/`false` literal could be flipped and tests still pass. Add an assertion that pins the boolean.

_Recommended test._ Add a test that drives both sides of the conditional at `session-cookie.service.ts:55` in `revokeFromCookie` with assertions that distinguish the outcomes.

**Cluster 6** (lines 91 — `sleepPastNextSecond()`): 1 mutant surviving — ArithmeticOperator×1

Sample mutation:
```diff
- const waitMs = 1000 - (Date.now() % 1000) + LOGOUT_REVOKE_MARGIN_MS;
+ <replaced with: 1000 + Date.now() % 1000>
```

_Diagnosis._ An arithmetic operator could be replaced. Pin the math with a deterministic input/output pair.

_Recommended test._ Inspect `session-cookie.service.ts:91` in `sleepPastNextSecond` and add an assertion that distinguishes the original from the surviving mutation.

## Equivalent-mutant candidates (excluded from adjusted score)

36 mutants flagged as likely equivalent — these are excluded from the **adjusted** score above. Reviewer should confirm each before treating the adjusted score as authoritative:

| File:line | Mutator | Reason |
|-----------|---------|--------|
| `src/lib/auth.service.ts:317` | BlockStatement | Catch block contains only logging — emptying it preserves the silent-swallow behavior. |
| `src/lib/auth.service.ts:318` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:74` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/auth.service.ts:98` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:139` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:139` | LogicalOperator | Operator/expression inside a logger call — affects log content only, not behavior. |
| `src/lib/auth.service.ts:139` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:163` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:173` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:192` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:210` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:252` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:252` | MethodExpression | Operator/expression inside a logger call — affects log content only, not behavior. |
| `src/lib/auth.service.ts:261` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:275` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:284` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:296` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/firebase-auth-rest-client.ts:31` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/firebase-auth-rest-client.ts:66` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/account-recovery.service.ts:19` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/account-recovery.service.ts:69` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/account-recovery.service.ts:105` | BlockStatement | Catch block contains only logging — emptying it preserves the silent-swallow behavior. |
| `src/lib/account-recovery.service.ts:106` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/account-recovery.service.ts:123` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/account-recovery.service.ts:158` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/account-recovery.service.ts:160` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.exception-filter.ts:9` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/firebase-session.guard.ts:12` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/firebase-session.guard.ts:23` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/firebase-session.guard.ts:37` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/session-cookie.service.ts:23` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/session-cookie.service.ts:35` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/session-cookie.service.ts:44` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/session-cookie.service.ts:58` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/session-cookie.service.ts:73` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/session-cookie.service.ts:78` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |

## Caveats

- **Scope is per-lib Stryker config.** See `stryker.api-auth.config.mjs` for what gets mutated / excluded.
- **Coverage analysis is `perTest`.** Stryker only runs tests whose coverage hit the mutated line.
- **No-coverage mutants count against the raw score.** They reflect lines no test executes.
- **Equivalent classification is heuristic.** Review each candidate before treating the adjusted score as authoritative.

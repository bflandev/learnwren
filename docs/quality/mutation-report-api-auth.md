# Mutation Test Report — `libs/api-auth`

> Generated 2026-05-26T02:57:18.231Z

**Headline mutation score: 87.82%** (killed=476, survived=60, no-cov=6, ignored=0). Score on covered mutants only: 88.81%. Adjusted (equivalent candidates excluded): 94.26%.


Target band: auth / billing / auth-adjacent — 90%+ target.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/account-recovery.service.ts` | 79.3% | 69 | 18 | 0 |
| `src/lib/session-cookie.service.ts` | 82.6% | 38 | 8 | 0 |
| `src/lib/firebase-session.guard.ts` | 83.3% | 15 | 3 | 0 |
| `src/lib/firebase-auth-rest-client.ts` | 83.8% | 31 | 5 | 1 |
| `src/lib/auth.controller.ts` | 84.6% | 33 | 5 | 1 |
| `src/lib/auth.service.ts` | 85.0% | 108 | 17 | 2 |
| `src/lib/auth-attempts.repository.ts` | 95.5% | 84 | 2 | 2 |
| `src/lib/auth.exception-filter.ts` | 95.7% | 44 | 2 | 0 |
| `src/lib/instructor-role.guard.ts` | 100.0% | 8 | 0 | 0 |
| `src/lib/password-policy.service.ts` | 100.0% | 41 | 0 | 0 |
| `src/lib/session-cookie.helper.ts` | 100.0% | 5 | 0 | 0 |

## Survivor clusters — gaps to close

### `src/lib/account-recovery.service.ts` — 11 surviving mutants

**Cluster 1** (lines 39–43 — `if()`): 2 mutants surviving — StringLiteral×1, ObjectLiteral×1

Sample mutation:
```diff
- await this.dispatchOutboundEmail('resend-verification', emailHash, async () => {
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `account-recovery.service.ts:39` in `if`. If it's a log message, classify as equivalent.

**Cluster 2** (lines 56 — `requestPasswordReset()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- await this.dispatchOutboundEmail('password-reset', emailHash, async () => {
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `account-recovery.service.ts:56` in `requestPasswordReset`. If it's a log message, classify as equivalent.

**Cluster 3** (lines 119 — `sendInitialVerificationEmail()`): 1 mutant surviving — ObjectLiteral×1

Sample mutation:
```diff
- await this.emailTransport.sendVerificationEmail({ to: email, verificationUrl });
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `account-recovery.service.ts:119` in `sendInitialVerificationEmail`, not just truthiness.

**Cluster 4** (lines 165–170 — `continueUrl()`): 7 mutants surviving — StringLiteral×1, ConditionalExpression×4, LogicalOperator×2

Sample mutation:
```diff
- const base = process.env['LEARNWREN_PUBLIC_URL'] ?? 'http://localhost:4200';
+ <replaced with: "">
```

_Diagnosis._ A ternary or conditional could be replaced and tests still pass. Cover both branches with distinct assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `account-recovery.service.ts:165` in `continueUrl` with assertions that distinguish the outcomes.

### `src/lib/auth.controller.ts` — 6 surviving mutants

**Cluster 5** (lines 157–162 — `if()`): 6 mutants surviving — BlockStatement×2, ConditionalExpression×2, StringLiteral×2

Sample mutation:
```diff
- if (process.env['NODE_ENV'] === 'production') {
+ <replaced with: {}>
```

_Diagnosis._ An entire block could be deleted without test failure: the side effect inside it is not observed. Assert on the change it makes (state, mock call, returned value).

_Recommended test._ Add an assertion on the side effect of the block/function at `auth.controller.ts:157` in `if` — verify state change, mock invocation, or returned value.

### `src/lib/auth-attempts.repository.ts` — 4 surviving mutants

**Cluster 6** (lines 103–106 — `redeemUnlockToken()`): 4 mutants surviving — ConditionalExpression×2, ObjectLiteral×1, StringLiteral×1

Sample mutation:
```diff
- if (query.empty) return { status: 'invalid' };
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `auth-attempts.repository.ts:103` in `redeemUnlockToken` with assertions that distinguish the outcomes.

### `src/lib/firebase-auth-rest-client.ts` — 4 surviving mutants

**Cluster 7** (lines 59 — `upstreamCode()`): 4 mutants surviving — StringLiteral×2, MethodExpression×1, OptionalChaining×1

Sample mutation:
```diff
- const upstreamCode = (errorBody?.error?.message ?? '').split(' ')[0]?.trim() ?? '';
+ <replaced with: "Stryker was here!">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `firebase-auth-rest-client.ts:59` in `upstreamCode`. If it's a log message, classify as equivalent.

### `src/lib/auth.service.ts` — 2 surviving mutants

**Cluster 8** (lines 311 — `isFirebaseError()`): 2 mutants surviving — ConditionalExpression×2

Sample mutation:
```diff
- return typeof err === 'object' && err !== null && 'code' in err;
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `auth.service.ts:311` in `isFirebaseError` with assertions that distinguish the outcomes.

### `src/lib/session-cookie.service.ts` — 2 surviving mutants

**Cluster 9** (lines 55 — `revokeFromCookie()`): 1 mutant surviving — BooleanLiteral×1

Sample mutation:
```diff
- const decoded = await this.auth.verifySessionCookie(sessionCookie, true);
+ <replaced with: false>
```

_Diagnosis._ A `true`/`false` literal could be flipped and tests still pass. Add an assertion that pins the boolean.

_Recommended test._ Add a test that drives both sides of the conditional at `session-cookie.service.ts:55` in `revokeFromCookie` with assertions that distinguish the outcomes.

**Cluster 10** (lines 91 — `sleepPastNextSecond()`): 1 mutant surviving — ArithmeticOperator×1

Sample mutation:
```diff
- const waitMs = 1000 - (Date.now() % 1000) + LOGOUT_REVOKE_MARGIN_MS;
+ <replaced with: 1000 + Date.now() % 1000>
```

_Diagnosis._ An arithmetic operator could be replaced. Pin the math with a deterministic input/output pair.

_Recommended test._ Inspect `session-cookie.service.ts:91` in `sleepPastNextSecond` and add an assertion that distinguishes the original from the surviving mutation.

## Equivalent-mutant candidates (excluded from adjusted score)

37 mutants flagged as likely equivalent — these are excluded from the **adjusted** score above. Reviewer should confirm each before treating the adjusted score as authoritative:

| File:line | Mutator | Reason |
|-----------|---------|--------|
| `src/lib/auth.service.ts:317` | BlockStatement | Catch block contains only logging — emptying it preserves the silent-swallow behavior. |
| `src/lib/auth.service.ts:318` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:73` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/auth.service.ts:97` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:138` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:138` | LogicalOperator | Operator/expression inside a logger call — affects log content only, not behavior. |
| `src/lib/auth.service.ts:138` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:161` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:171` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:190` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:208` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:250` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:250` | MethodExpression | Operator/expression inside a logger call — affects log content only, not behavior. |
| `src/lib/auth.service.ts:259` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:273` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:282` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.service.ts:294` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/firebase-auth-rest-client.ts:31` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/firebase-auth-rest-client.ts:66` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/account-recovery.service.ts:18` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
| `src/lib/account-recovery.service.ts:68` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/account-recovery.service.ts:104` | BlockStatement | Catch block contains only logging — emptying it preserves the silent-swallow behavior. |
| `src/lib/account-recovery.service.ts:105` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/account-recovery.service.ts:122` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/account-recovery.service.ts:157` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/account-recovery.service.ts:159` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |
| `src/lib/auth.exception-filter.ts:55` | LogicalOperator | Operator/expression inside a logger call — affects log content only, not behavior. |
| `src/lib/auth.exception-filter.ts:27` | StringLiteral | Logger name passed to `new Logger(...)` — observability, not behavior. |
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

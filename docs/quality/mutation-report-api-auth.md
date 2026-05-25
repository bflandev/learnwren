# Mutation Test Report — `libs/api-auth`

> Generated 2026-05-25T17:04:18.646Z

**Headline mutation score: 89.02%** (killed=470, survived=52, no-cov=6, ignored=0). Score on covered mutants only: 90.04%.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/firebase-session.guard.ts` | 83.3% | 15 | 3 | 0 |
| `src/lib/firebase-auth-rest-client.ts` | 83.8% | 31 | 5 | 1 |
| `src/lib/auth.controller.ts` | 84.6% | 33 | 5 | 1 |
| `src/lib/auth.service.ts` | 85.0% | 209 | 35 | 2 |
| `src/lib/auth-attempts.repository.ts` | 95.5% | 84 | 2 | 2 |
| `src/lib/auth.exception-filter.ts` | 95.7% | 44 | 2 | 0 |
| `src/lib/instructor-role.guard.ts` | 100.0% | 8 | 0 | 0 |
| `src/lib/password-policy.service.ts` | 100.0% | 41 | 0 | 0 |
| `src/lib/session-cookie.helper.ts` | 100.0% | 5 | 0 | 0 |

## Survivor clusters — gaps to close

### `src/lib/auth.service.ts` — 9 surviving mutants

**Cluster 1** (lines 192 — `sendVerificationEmailBestEffort()`): 1 mutant surviving — ObjectLiteral×1

```diff
- await this.emailTransport.sendVerificationEmail({ to: email, verificationUrl });
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass.

_Recommended test._ Assert on array length / object shape at `auth.service.ts:192` in `sendVerificationEmailBestEffort`.

**Cluster 2** (lines 336 — `continueUrl()`): 1 mutant surviving — StringLiteral×1

```diff
- const base = process.env['LEARNWREN_PUBLIC_URL'] ?? 'http://localhost:4200';
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `auth.service.ts:336` in `continueUrl`.

**Cluster 3** (lines 345 — `logoutSideEffects()`): 1 mutant surviving — BooleanLiteral×1

```diff
- const decoded = await this.auth.verifySessionCookie(sessionCookie, true);
+ <replaced with: false>
```

_Diagnosis._ A `true`/`false` literal could be flipped and tests still pass.

_Recommended test._ Drive both sides of the conditional at `auth.service.ts:345` in `logoutSideEffects`.

**Cluster 4** (lines 384 — `sleepPastNextSecond()`): 1 mutant surviving — ArithmeticOperator×1

```diff
- const waitMs = 1000 - (Date.now() % 1000) + LOGOUT_REVOKE_MARGIN_MS;
+ <replaced with: 1000 + Date.now() % 1000>
```

_Diagnosis._ An arithmetic operator could be replaced. Pin the math with a deterministic input/output pair.

_Recommended test._ Inspect `auth.service.ts:384` in `sleepPastNextSecond`.

**Cluster 5** (lines 423–427 — `if()`): 2 mutants surviving — StringLiteral×1, ObjectLiteral×1

```diff
- await this.dispatchOutboundEmail('resend-verification', emailHash, async () => {
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `auth.service.ts:423` in `if`.

**Cluster 6** (lines 440 — `requestPasswordReset()`): 1 mutant surviving — StringLiteral×1

```diff
- await this.dispatchOutboundEmail('password-reset', emailHash, async () => {
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `auth.service.ts:440` in `requestPasswordReset`.

**Cluster 7** (lines 529 — `isFirebaseError()`): 2 mutants surviving — ConditionalExpression×2

```diff
- return typeof err === 'object' && err !== null && 'code' in err;
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `auth.service.ts:529` in `isFirebaseError`.

### `src/lib/auth.controller.ts` — 6 surviving mutants

**Cluster 8** (lines 153–158 — `if()`): 6 mutants surviving — BlockStatement×2, ConditionalExpression×2, StringLiteral×2

```diff
- if (process.env['NODE_ENV'] === 'production') {
+ <replaced with: {}>
```

_Diagnosis._ An entire block could be deleted without test failure.

_Recommended test._ Assert on the side effect at `auth.controller.ts:153` in `if`.

### `src/lib/auth-attempts.repository.ts` — 4 surviving mutants

**Cluster 9** (lines 103–106 — `redeemUnlockToken()`): 4 mutants surviving — ConditionalExpression×2, ObjectLiteral×1, StringLiteral×1

```diff
- if (query.empty) return { status: 'invalid' };
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `auth-attempts.repository.ts:103` in `redeemUnlockToken`.

### `src/lib/firebase-auth-rest-client.ts` — 4 surviving mutants

**Cluster 10** (lines 59 — `upstreamCode()`): 4 mutants surviving — StringLiteral×2, MethodExpression×1, OptionalChaining×1

```diff
- const upstreamCode = (errorBody?.error?.message ?? '').split(' ')[0]?.trim() ?? '';
+ <replaced with: "Stryker was here!">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `firebase-auth-rest-client.ts:59` in `upstreamCode`.

## Equivalent-mutant candidates

| File:line | Mutator | Reason |
|-----------|---------|--------|
| `src/lib/auth.service.ts:535` | BlockStatement | Catch block contains only logging. |
| `src/lib/auth.service.ts:536` | StringLiteral | Inside logger call — observability, not behavior. |
| `src/lib/auth.service.ts:103` | StringLiteral | Inside logger call — observability, not behavior. |
| `src/lib/auth.service.ts:83` | StringLiteral | Logger name passed to `new Logger(...)`. |
| `src/lib/auth.service.ts:144` | StringLiteral | Inside logger call — observability, not behavior. |
| `src/lib/auth.service.ts:144` | LogicalOperator | Inside logger call — observability, not behavior. |
| `src/lib/auth.service.ts:144` | StringLiteral | Inside logger call — observability, not behavior. |
| `src/lib/auth.service.ts:167` | StringLiteral | Inside logger call — observability, not behavior. |
| `src/lib/auth.service.ts:177` | StringLiteral | Inside logger call — observability, not behavior. |
| `src/lib/auth.service.ts:195` | StringLiteral | Inside logger call — observability, not behavior. |
| `src/lib/auth.service.ts:216` | StringLiteral | Inside logger call — observability, not behavior. |
| `src/lib/auth.service.ts:234` | StringLiteral | Inside logger call — observability, not behavior. |
| `src/lib/auth.service.ts:276` | StringLiteral | Inside logger call — observability, not behavior. |
| `src/lib/auth.service.ts:276` | MethodExpression | Inside logger call — observability, not behavior. |
| `src/lib/auth.service.ts:281` | StringLiteral | Inside logger call — observability, not behavior. |
| `src/lib/auth.service.ts:295` | StringLiteral | Inside logger call — observability, not behavior. |
| `src/lib/auth.service.ts:304` | StringLiteral | Inside logger call — observability, not behavior. |
| `src/lib/auth.service.ts:320` | StringLiteral | Inside logger call — observability, not behavior. |
| `src/lib/auth.service.ts:329` | StringLiteral | Inside logger call — observability, not behavior. |
| `src/lib/auth.service.ts:349` | StringLiteral | Inside logger call — observability, not behavior. |
| `src/lib/auth.service.ts:364` | StringLiteral | Inside logger call — observability, not behavior. |
| `src/lib/auth.service.ts:369` | StringLiteral | Inside logger call — observability, not behavior. |
| `src/lib/auth.service.ts:394` | StringLiteral | Inside logger call — observability, not behavior. |
| `src/lib/auth.service.ts:479` | StringLiteral | Inside logger call — observability, not behavior. |
| `src/lib/auth.service.ts:481` | StringLiteral | Inside logger call — observability, not behavior. |
| `src/lib/auth.service.ts:489` | StringLiteral | Inside logger call — observability, not behavior. |
| `src/lib/auth.service.ts:521` | BlockStatement | Catch block contains only logging. |
| `src/lib/auth.service.ts:524` | StringLiteral | Inside logger call — observability, not behavior. |
| `src/lib/firebase-auth-rest-client.ts:31` | StringLiteral | Logger name passed to `new Logger(...)`. |
| `src/lib/firebase-auth-rest-client.ts:66` | StringLiteral | Inside logger call — observability, not behavior. |
| `src/lib/auth.exception-filter.ts:55` | LogicalOperator | Inside logger call — observability, not behavior. |
| `src/lib/auth.exception-filter.ts:27` | StringLiteral | Logger name passed to `new Logger(...)`. |
| `src/lib/firebase-session.guard.ts:12` | StringLiteral | Logger name passed to `new Logger(...)`. |
| `src/lib/firebase-session.guard.ts:23` | StringLiteral | Inside logger call — observability, not behavior. |
| `src/lib/firebase-session.guard.ts:37` | StringLiteral | Inside logger call — observability, not behavior. |

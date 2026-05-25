# Mutation Test Report — `libs/api-firebase`

> Generated 2026-05-25T17:02:18.057Z

**Headline mutation score: 81.69%** (killed=58, survived=13, no-cov=0, ignored=0). Score on covered mutants only: 81.69%.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/firebase-admin.module.ts` | 81.7% | 58 | 13 | 0 |

## Survivor clusters — gaps to close

### `src/lib/firebase-admin.module.ts` — 13 surviving mutants

**Cluster 1** (lines 24 — `resolveMode()`): 1 mutant surviving — StringLiteral×1

```diff
- : 'emulator';
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `firebase-admin.module.ts:24` in `resolveMode`.

**Cluster 2** (lines 54–57 — `configureFirestoreOnce()`): 5 mutants surviving — BooleanLiteral×2, ConditionalExpression×1, BlockStatement×1, ObjectLiteral×1

```diff
- if (!configuredFirestores.has(firestore)) {
+ <replaced with: configuredFirestores.has(firestore)>
```

_Diagnosis._ A `true`/`false` literal could be flipped and tests still pass.

_Recommended test._ Drive both sides of the conditional at `firebase-admin.module.ts:54` in `configureFirestoreOnce`.

**Cluster 3** (lines 64 — `ensureEmulatorAppInitialized()`): 1 mutant surviving — ConditionalExpression×1

```diff
- if (existing) return existing;
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `firebase-admin.module.ts:64` in `ensureEmulatorAppInitialized`.

**Cluster 4** (lines 70–80 — `ensureProductionAppInitialized()`): 4 mutants surviving — StringLiteral×1, ConditionalExpression×2, BlockStatement×1

```diff
- const credentialPath = process.env['FIREBASE_SERVICE_ACCOUNT_JSON_PATH'];
+ <replaced with: "">
```

_Diagnosis._ A ternary or conditional could be replaced and tests still pass.

_Recommended test._ Drive both sides of the conditional at `firebase-admin.module.ts:70` in `ensureProductionAppInitialized`.

**Cluster 5** (lines 96 — `forRoot()`): 1 mutant surviving — BooleanLiteral×1

```diff
- global: true,
+ <replaced with: false>
```

_Diagnosis._ A `true`/`false` literal could be flipped and tests still pass.

_Recommended test._ Drive both sides of the conditional at `firebase-admin.module.ts:96` in `forRoot`.

**Cluster 6** (lines 118 — `if()`): 1 mutant surviving — ArrayDeclaration×1

```diff
- exports: [FIRESTORE, FIREBASE_AUTH, FIREBASE_STORAGE, FIREBASE_WEB_API_KEY],
+ <replaced with: []>
```

_Diagnosis._ An array literal could be replaced with `[]` and tests pass.

_Recommended test._ Assert on array length / object shape at `firebase-admin.module.ts:118` in `if`.

## Equivalent-mutant candidates

_None proposed._

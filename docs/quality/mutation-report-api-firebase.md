# Mutation Test Report — `libs/api-firebase`

> Generated 2026-05-26T02:58:11.998Z

**Headline mutation score: 81.69%** (killed=58, survived=13, no-cov=0, ignored=0). Score on covered mutants only: 81.69%. Adjusted (equivalent candidates excluded): 81.69%.


Target band: unclassified.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/firebase-admin.module.ts` | 81.7% | 58 | 13 | 0 |

## Survivor clusters — gaps to close

### `src/lib/firebase-admin.module.ts` — 13 surviving mutants

**Cluster 1** (lines 24 — `resolveMode()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- : 'emulator';
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `firebase-admin.module.ts:24` in `resolveMode`. If it's a log message, classify as equivalent.

**Cluster 2** (lines 54–57 — `configureFirestoreOnce()`): 5 mutants surviving — BooleanLiteral×2, ConditionalExpression×1, BlockStatement×1, ObjectLiteral×1

Sample mutation:
```diff
- if (!configuredFirestores.has(firestore)) {
+ <replaced with: configuredFirestores.has(firestore)>
```

_Diagnosis._ A `true`/`false` literal could be flipped and tests still pass. Add an assertion that pins the boolean.

_Recommended test._ Add a test that drives both sides of the conditional at `firebase-admin.module.ts:54` in `configureFirestoreOnce` with assertions that distinguish the outcomes.

**Cluster 3** (lines 64 — `ensureEmulatorAppInitialized()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (existing) return existing;
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `firebase-admin.module.ts:64` in `ensureEmulatorAppInitialized` with assertions that distinguish the outcomes.

**Cluster 4** (lines 70–80 — `ensureProductionAppInitialized()`): 4 mutants surviving — StringLiteral×1, ConditionalExpression×2, BlockStatement×1

Sample mutation:
```diff
- const credentialPath = process.env['FIREBASE_SERVICE_ACCOUNT_JSON_PATH'];
+ <replaced with: "">
```

_Diagnosis._ A ternary or conditional could be replaced and tests still pass. Cover both branches with distinct assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `firebase-admin.module.ts:70` in `ensureProductionAppInitialized` with assertions that distinguish the outcomes.

**Cluster 5** (lines 96 — `forRoot()`): 1 mutant surviving — BooleanLiteral×1

Sample mutation:
```diff
- global: true,
+ <replaced with: false>
```

_Diagnosis._ A `true`/`false` literal could be flipped and tests still pass. Add an assertion that pins the boolean.

_Recommended test._ Add a test that drives both sides of the conditional at `firebase-admin.module.ts:96` in `forRoot` with assertions that distinguish the outcomes.

**Cluster 6** (lines 118 — `if()`): 1 mutant surviving — ArrayDeclaration×1

Sample mutation:
```diff
- exports: [FIRESTORE, FIREBASE_AUTH, FIREBASE_STORAGE, FIREBASE_WEB_API_KEY],
+ <replaced with: []>
```

_Diagnosis._ An array literal could be replaced with `[]` and tests pass. The contents (length, ordering, item shape) are not pinned.

_Recommended test._ Assert on the array length / object shape returned at `firebase-admin.module.ts:118` in `if`, not just truthiness.

## Equivalent-mutant candidates (excluded from adjusted score)

_None._

## Caveats

- **Scope is per-lib Stryker config.** See `stryker.api-firebase.config.mjs` for what gets mutated / excluded.
- **Coverage analysis is `perTest`.** Stryker only runs tests whose coverage hit the mutated line.
- **No-coverage mutants count against the raw score.** They reflect lines no test executes.
- **Equivalent classification is heuristic.** Review each candidate before treating the adjusted score as authoritative.

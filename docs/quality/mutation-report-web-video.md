# Mutation Test Report — `libs/web-video`

> Generated 2026-05-29T07:15:02.602Z

**Headline mutation score: 89.64%** (killed=346, survived=34, no-cov=6, ignored=0). Score on covered mutants only: 91.05%. Adjusted (equivalent candidates excluded): 89.64%.


Target band: unclassified.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/polling/video-state-polling.service.ts` | 76.0% | 19 | 6 | 0 |
| `src/lib/player/video-player.service.ts` | 83.0% | 39 | 8 | 0 |
| `src/lib/upload/video-upload.service.ts` | 89.8% | 159 | 16 | 2 |
| `src/lib/upload/video-upload.component.ts` | 90.9% | 10 | 1 | 0 |
| `src/lib/video-state-badge.component.ts` | 92.6% | 75 | 2 | 4 |
| `src/lib/player/video-player.component.ts` | 97.0% | 32 | 1 | 0 |
| `src/lib/video.service.ts` | 100.0% | 12 | 0 | 0 |

## Survivor clusters — gaps to close

### `src/lib/upload/video-upload.service.ts` — 18 surviving mutants

**Cluster 1** (lines 15–18): 5 mutants surviving — StringLiteral×2, ObjectLiteral×1, ArrowFunction×2

Sample mutation:
```diff
- export const XHR_FACTORY = new InjectionToken<() => XMLHttpRequest>('XHR_FACTORY', {
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `video-upload.service.ts:15`. If it's a log message, classify as equivalent.

**Cluster 2** (lines 24): 1 mutant surviving — ArrayDeclaration×1

Sample mutation:
```diff
- const BACKOFF_MS = [1000, 2000, 4000];
+ <replaced with: []>
```

_Diagnosis._ An array literal could be replaced with `[]` and tests pass. The contents (length, ordering, item shape) are not pinned.

_Recommended test._ Assert on the array length / object shape returned at `video-upload.service.ts:24`, not just truthiness.

**Cluster 3** (lines 47): 1 mutant surviving — BooleanLiteral×1

Sample mutation:
```diff
- private aborted = false;
+ <replaced with: true>
```

_Diagnosis._ A `true`/`false` literal could be flipped and tests still pass. Add an assertion that pins the boolean.

_Recommended test._ Add a test that drives both sides of the conditional at `video-upload.service.ts:47` with assertions that distinguish the outcomes.

**Cluster 4** (lines 99 — `if()`): 2 mutants surviving — ObjectLiteral×1, StringLiteral×1

Sample mutation:
```diff
- this._state.set({ kind: 'finalizing', videoId });
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `video-upload.service.ts:99` in `if`, not just truthiness.

**Cluster 5** (lines 116–118 — `if()`): 4 mutants surviving — ConditionalExpression×1, StringLiteral×2, ObjectLiteral×1

Sample mutation:
```diff
- if (s.kind === 'uploading' || s.kind === 'finalizing' || s.kind === 'failed') {
+ <replaced with: false>
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `video-upload.service.ts:116` in `if`. If it's a log message, classify as equivalent.

**Cluster 6** (lines 128 — `retry()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (s.kind !== 'failed' || !s.videoId) return;
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `video-upload.service.ts:128` in `retry` with assertions that distinguish the outcomes.

**Cluster 7** (lines 165–168 — `for()`): 2 mutants surviving — BooleanLiteral×1, LogicalOperator×1

Sample mutation:
```diff
- if (this.aborted) return false;
+ <replaced with: true>
```

_Diagnosis._ A `true`/`false` literal could be flipped and tests still pass. Add an assertion that pins the boolean.

_Recommended test._ Add a test that drives both sides of the conditional at `video-upload.service.ts:165` in `for` with assertions that distinguish the outcomes.

**Cluster 8** (lines 182 — `if()`): 1 mutant surviving — BooleanLiteral×1

Sample mutation:
```diff
- return false;
+ <replaced with: true>
```

_Diagnosis._ A `true`/`false` literal could be flipped and tests still pass. Add an assertion that pins the boolean.

_Recommended test._ Add a test that drives both sides of the conditional at `video-upload.service.ts:182` in `if` with assertions that distinguish the outcomes.

**Cluster 9** (lines 209 — `errorMessage()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- typeof err === 'object' && err !== null && 'message' in err
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `video-upload.service.ts:209` in `errorMessage` with assertions that distinguish the outcomes.

### `src/lib/player/video-player.service.ts` — 8 surviving mutants

**Cluster 10** (lines 12–15 — `dispose()`): 4 mutants surviving — StringLiteral×2, ObjectLiteral×1, ArrowFunction×1

Sample mutation:
```diff
- export const HLS_CONSTRUCTOR = new InjectionToken<typeof HlsImport>('HLS_CONSTRUCTOR', {
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `video-player.service.ts:12` in `dispose`. If it's a log message, classify as equivalent.

**Cluster 11** (lines 59 — `switch()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- el.removeAttribute('src');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `video-player.service.ts:59` in `switch`. If it's a log message, classify as equivalent.

**Cluster 12** (lines 65 — `switch()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- if (el.canPlayType('application/vnd.apple.mpegurl')) {
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `video-player.service.ts:65` in `switch`. If it's a log message, classify as equivalent.

**Cluster 13** (lines 71 — `handler()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- el.removeEventListener('error', handler);
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `video-player.service.ts:71` in `handler`. If it's a log message, classify as equivalent.

**Cluster 14** (lines 79 — `handler()`): 1 mutant surviving — ObjectLiteral×1

Sample mutation:
```diff
- return { dispose: () => undefined };
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `video-player.service.ts:79` in `handler`, not just truthiness.

### `src/lib/video-state-badge.component.ts` — 6 surviving mutants

**Cluster 15** (lines 42–43 — `switch()`): 2 mutants surviving — ConditionalExpression×1, StringLiteral×1

Sample mutation:
```diff
- default:
+ <replaced with: default:>
```

_Diagnosis._ A ternary or conditional could be replaced and tests still pass. Cover both branches with distinct assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `video-state-badge.component.ts:42` in `switch` with assertions that distinguish the outcomes.

**Cluster 16** (lines 60–61 — `switch()`): 2 mutants surviving — ConditionalExpression×1, StringLiteral×1

Sample mutation:
```diff
- default:
+ <replaced with: default:>
```

_Diagnosis._ A ternary or conditional could be replaced and tests still pass. Cover both branches with distinct assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `video-state-badge.component.ts:60` in `switch` with assertions that distinguish the outcomes.

**Cluster 17** (lines 72 — `ngOnInit()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (NON_TERMINAL.includes(v.state)) {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `video-state-badge.component.ts:72` in `ngOnInit` with assertions that distinguish the outcomes.

**Cluster 18** (lines 89 — `isStuck()`): 1 mutant surviving — EqualityOperator×1

Sample mutation:
```diff
- return ageMs > STUCK_THRESHOLD_MIN * 60 * 1000;
+ <replaced with: ageMs >= STUCK_THRESHOLD_MIN * 60 * 1000>
```

_Diagnosis._ An equality / inequality operator could be flipped (`==`↔`!=`, `===`↔`!==`) and tests still pass. Test both equal and unequal inputs at the boundary.

_Recommended test._ Add a boundary test that exercises the equal / off-by-one case at `video-state-badge.component.ts:89` in `isStuck`.

### `src/lib/polling/video-state-polling.service.ts` — 6 surviving mutants

**Cluster 19** (lines 10): 2 mutants surviving — ArithmeticOperator×2

Sample mutation:
```diff
- const DEFAULT_CAP_MS = 30 * 60 * 1_000;
+ <replaced with: 30 * 60 / 1_000>
```

_Diagnosis._ An arithmetic operator could be replaced. Pin the math with a deterministic input/output pair.

_Recommended test._ Inspect `video-state-polling.service.ts:10` and add an assertion that distinguishes the original from the surviving mutation.

**Cluster 20** (lines 26–33 — `fetch()`): 4 mutants surviving — ObjectLiteral×1, BooleanLiteral×1, ConditionalExpression×1, EqualityOperator×1

Sample mutation:
```diff
- this.http.get<Video>(`/api/videos/${vid}`, { withCredentials: true });
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `video-state-polling.service.ts:26` in `fetch`, not just truthiness.

### `src/lib/player/video-player.component.ts` — 1 surviving mutant

**Cluster 21** (lines 58 — `retry()`): 1 mutant surviving — OptionalChaining×1

Sample mutation:
```diff
- this.handle?.dispose();
+ <replaced with: this.handle.dispose>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `video-player.component.ts:58` in `retry`.

### `src/lib/upload/video-upload.component.ts` — 1 surviving mutant

**Cluster 22** (lines 31 — `onFile()`): 1 mutant surviving — ObjectLiteral×1

Sample mutation:
```diff
- { courseId: this.courseId(), moduleId: this.moduleId(), lessonId: this.lessonId() },
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `video-upload.component.ts:31` in `onFile`, not just truthiness.

## Equivalent-mutant candidates (excluded from adjusted score)

_None._

## Caveats

- **Scope is per-lib Stryker config.** See `stryker.web-video.config.mjs` for what gets mutated / excluded.
- **Coverage analysis is `perTest`.** Stryker only runs tests whose coverage hit the mutated line.
- **No-coverage mutants count against the raw score.** They reflect lines no test executes.
- **Equivalent classification is heuristic.** Review each candidate before treating the adjusted score as authoritative.

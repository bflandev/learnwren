# Mutation Test Report — `libs/web-video`

> Generated 2026-05-25T17:28:28.271Z

**Headline mutation score: 75.98%** (killed=272, survived=80, no-cov=6, ignored=0). Score on covered mutants only: 77.27%.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/upload/video-upload.service.ts` | 70.1% | 124 | 51 | 2 |
| `src/lib/video-state-badge.component.ts` | 75.3% | 61 | 16 | 4 |
| `src/lib/polling/video-state-polling.service.ts` | 76.0% | 19 | 6 | 0 |
| `src/lib/player/video-player.component.ts` | 77.8% | 7 | 2 | 0 |
| `src/lib/player/video-player.service.ts` | 90.7% | 39 | 4 | 0 |
| `src/lib/upload/video-upload.component.ts` | 90.9% | 10 | 1 | 0 |
| `src/lib/video.service.ts` | 100.0% | 12 | 0 | 0 |

## Survivor clusters — gaps to close

### `src/lib/upload/video-upload.service.ts` — 53 surviving mutants

**Cluster 1** (lines 15–18): 5 mutants surviving — StringLiteral×2, ObjectLiteral×1, ArrowFunction×2

```diff
- export const XHR_FACTORY = new InjectionToken<() => XMLHttpRequest>('XHR_FACTORY', {
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `video-upload.service.ts:15`.

**Cluster 2** (lines 24): 1 mutant surviving — ArrayDeclaration×1

```diff
- const BACKOFF_MS = [1000, 2000, 4000];
+ <replaced with: []>
```

_Diagnosis._ An array literal could be replaced with `[]` and tests pass.

_Recommended test._ Assert on array length / object shape at `video-upload.service.ts:24`.

**Cluster 3** (lines 47–54): 4 mutants surviving — BooleanLiteral×2, EqualityOperator×1, ObjectLiteral×1

```diff
- private aborted = false;
+ <replaced with: true>
```

_Diagnosis._ A `true`/`false` literal could be flipped and tests still pass.

_Recommended test._ Drive both sides of the conditional at `video-upload.service.ts:47`.

**Cluster 4** (lines 61 — `if()`): 2 mutants surviving — ObjectLiteral×1, BooleanLiteral×1

```diff
- return { ok: false };
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass.

_Recommended test._ Assert on array length / object shape at `video-upload.service.ts:61` in `if`.

**Cluster 5** (lines 69 — `start()`): 1 mutant surviving — ConditionalExpression×1

```diff
- if (!check.ok) return;
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `video-upload.service.ts:69` in `start`.

**Cluster 6** (lines 76–79 — `start()`): 1 mutant surviving — ObjectLiteral×1

```diff
- this.api.createUploadSession(ctx.courseId, ctx.moduleId, ctx.lessonId, {
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass.

_Recommended test._ Assert on array length / object shape at `video-upload.service.ts:76` in `start`.

**Cluster 7** (lines 97–99 — `if()`): 3 mutants surviving — LogicalOperator×1, ObjectLiteral×1, StringLiteral×1

```diff
- if (!uploadOk || this.aborted) return;
+ <replaced with: !uploadOk && this.aborted>
```

_Diagnosis._ `&&` / `||` swap survived. Add a test for the partial case.

_Recommended test._ Test the partial case for the logical expression at `video-upload.service.ts:97` in `if`.

**Cluster 8** (lines 116–119 — `if()`): 10 mutants surviving — ConditionalExpression×4, EqualityOperator×2, StringLiteral×3, ObjectLiteral×1

```diff
- if (s.kind === 'uploading' || s.kind === 'finalizing' || s.kind === 'failed') {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `video-upload.service.ts:116` in `if`.

**Cluster 9** (lines 128 — `retry()`): 2 mutants surviving — LogicalOperator×1, ConditionalExpression×1

```diff
- if (s.kind !== 'failed' || !s.videoId) return;
+ <replaced with: s.kind !== 'failed' && !s.videoId>
```

_Diagnosis._ `&&` / `||` swap survived. Add a test for the partial case.

_Recommended test._ Test the partial case for the logical expression at `video-upload.service.ts:128` in `retry`.

**Cluster 10** (lines 142–150 — `while()`): 7 mutants surviving — MethodExpression×1, ConditionalExpression×1, BooleanLiteral×1, ObjectLiteral×1, StringLiteral×1, ArithmeticOperator×2

```diff
- const chunk = file.slice(offset, end);
+ <replaced with: file>
```

_Diagnosis._ An arithmetic operator could be replaced. Pin the math with a deterministic input/output pair.

_Recommended test._ Inspect `video-upload.service.ts:142` in `while`.

**Cluster 11** (lines 165–182 — `for()`): 13 mutants surviving — BooleanLiteral×3, ConditionalExpression×3, EqualityOperator×3, BlockStatement×1, LogicalOperator×1, StringLiteral×2

```diff
- if (this.aborted) return false;
+ <replaced with: true>
```

_Diagnosis._ A `true`/`false` literal could be flipped and tests still pass.

_Recommended test._ Drive both sides of the conditional at `video-upload.service.ts:165` in `for`.

**Cluster 12** (lines 195 — `if()`): 2 mutants surviving — StringLiteral×1, BooleanLiteral×1

```diff
- xhr.open('PUT', sessionUri, true);
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `video-upload.service.ts:195` in `if`.

**Cluster 13** (lines 201 — `if()`): 1 mutant surviving — ArrowFunction×1

```diff
- xhr.onerror = () => resolve(0);
+ <replaced with: () => undefined>
```

_Diagnosis._ A method/arrow body could be emptied with no test failing.

_Recommended test._ Assert on the side effect at `video-upload.service.ts:201` in `if`.

**Cluster 14** (lines 209 — `errorMessage()`): 1 mutant surviving — ConditionalExpression×1

```diff
- typeof err === 'object' && err !== null && 'message' in err
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `video-upload.service.ts:209` in `errorMessage`.

### `src/lib/video-state-badge.component.ts` — 20 surviving mutants

**Cluster 15** (lines 10): 1 mutant surviving — StringLiteral×1

```diff
- const NON_TERMINAL: ReadonlyArray<Video['state']> = ['UPLOADED', 'TRANSCODING'];
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `video-state-badge.component.ts:10`.

**Cluster 16** (lines 33–35 — `switch()`): 4 mutants surviving — StringLiteral×3, ConditionalExpression×1

```diff
- case 'PENDING_UPLOAD':
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `video-state-badge.component.ts:33` in `switch`.

**Cluster 17** (lines 42–43 — `switch()`): 2 mutants surviving — ConditionalExpression×1, StringLiteral×1

```diff
- default:
+ <replaced with: default:>
```

_Diagnosis._ A ternary or conditional could be replaced and tests still pass.

_Recommended test._ Drive both sides of the conditional at `video-state-badge.component.ts:42` in `switch`.

**Cluster 18** (lines 53 — `switch()`): 1 mutant surviving — StringLiteral×1

```diff
- case 'UPLOADED':
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `video-state-badge.component.ts:53` in `switch`.

**Cluster 19** (lines 60–72 — `switch()`): 10 mutants surviving — ConditionalExpression×4, StringLiteral×2, ArrowFunction×2, LogicalOperator×1, BooleanLiteral×1

```diff
- default:
+ <replaced with: default:>
```

_Diagnosis._ A ternary or conditional could be replaced and tests still pass.

_Recommended test._ Drive both sides of the conditional at `video-state-badge.component.ts:60` in `switch`.

**Cluster 20** (lines 89 — `isStuck()`): 2 mutants surviving — EqualityOperator×1, ArithmeticOperator×1

```diff
- return ageMs > STUCK_THRESHOLD_MIN * 60 * 1000;
+ <replaced with: ageMs >= STUCK_THRESHOLD_MIN * 60 * 1000>
```

_Diagnosis._ An equality / inequality operator could be flipped and tests still pass.

_Recommended test._ Add a boundary test at `video-state-badge.component.ts:89` in `isStuck`.

### `src/lib/polling/video-state-polling.service.ts` — 6 surviving mutants

**Cluster 21** (lines 10): 2 mutants surviving — ArithmeticOperator×2

```diff
- const DEFAULT_CAP_MS = 30 * 60 * 1_000;
+ <replaced with: 30 * 60 / 1_000>
```

_Diagnosis._ An arithmetic operator could be replaced. Pin the math with a deterministic input/output pair.

_Recommended test._ Inspect `video-state-polling.service.ts:10`.

**Cluster 22** (lines 26–33 — `fetch()`): 4 mutants surviving — ObjectLiteral×1, BooleanLiteral×1, ConditionalExpression×1, EqualityOperator×1

```diff
- this.http.get<Video>(`/api/videos/${vid}`, { withCredentials: true });
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass.

_Recommended test._ Assert on array length / object shape at `video-state-polling.service.ts:26` in `fetch`.

### `src/lib/player/video-player.service.ts` — 4 surviving mutants

**Cluster 23** (lines 51 — `switch()`): 1 mutant surviving — StringLiteral×1

```diff
- el.removeAttribute('src');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `video-player.service.ts:51` in `switch`.

**Cluster 24** (lines 57 — `switch()`): 1 mutant surviving — StringLiteral×1

```diff
- if (el.canPlayType('application/vnd.apple.mpegurl')) {
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `video-player.service.ts:57` in `switch`.

**Cluster 25** (lines 63 — `handler()`): 1 mutant surviving — StringLiteral×1

```diff
- el.removeEventListener('error', handler);
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `video-player.service.ts:63` in `handler`.

**Cluster 26** (lines 71 — `handler()`): 1 mutant surviving — ObjectLiteral×1

```diff
- return { dispose: () => undefined };
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass.

_Recommended test._ Assert on array length / object shape at `video-player.service.ts:71` in `handler`.

### `src/lib/player/video-player.component.ts` — 2 surviving mutants

**Cluster 27** (lines 38–43 — `ngOnDestroy()`): 2 mutants surviving — OptionalChaining×2

```diff
- this.handle?.dispose();
+ <replaced with: this.handle.dispose>
```

_Diagnosis._ Removing `?.` didn't break tests. Add a case where the parent is null/undefined.

_Recommended test._ Add a null/undefined parent case at `video-player.component.ts:38` in `ngOnDestroy`.

### `src/lib/upload/video-upload.component.ts` — 1 surviving mutant

**Cluster 28** (lines 31 — `onFile()`): 1 mutant surviving — ObjectLiteral×1

```diff
- { courseId: this.courseId(), moduleId: this.moduleId(), lessonId: this.lessonId() },
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass.

_Recommended test._ Assert on array length / object shape at `video-upload.component.ts:31` in `onFile`.

## Equivalent-mutant candidates

_None proposed._

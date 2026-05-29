# Mutation Test Report — `libs/web-learn`

> Generated 2026-05-29T07:15:02.455Z

**Headline mutation score: 81.82%** (killed=297, survived=55, no-cov=11, ignored=0). Score on covered mutants only: 84.38%. Adjusted (equivalent candidates excluded): 82.04%.


Target band: unclassified.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/lesson-player-page/lesson-player-page.component.ts` | 76.8% | 199 | 49 | 11 |
| `src/lib/position-saver.ts` | 89.3% | 50 | 6 | 0 |
| `src/lib/course-outline-panel/course-outline-panel.component.ts` | 100.0% | 31 | 0 | 0 |
| `src/lib/learn.service.ts` | 100.0% | 17 | 0 | 0 |

## Survivor clusters — gaps to close

### `src/lib/lesson-player-page/lesson-player-page.component.ts` — 59 surviving mutants

**Cluster 1** (lines 63–73 — `formatBytes()`): 4 mutants surviving — StringLiteral×1, OptionalChaining×2, BooleanLiteral×1

Sample mutation:
```diff
- readonly state = signal<PageState>('LOADING');
+ <replaced with: "">
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `lesson-player-page.component.ts:63` in `formatBytes`.

**Cluster 2** (lines 79 — `rowState()`): 2 mutants surviving — ObjectLiteral×1, StringLiteral×1

Sample mutation:
```diff
- return this.materialRowState().get(id) ?? { status: 'idle' };
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `lesson-player-page.component.ts:79` in `rowState`, not just truthiness.

**Cluster 3** (lines 86–109 — `rowState()`): 18 mutants surviving — ConditionalExpression×6, StringLiteral×8, BooleanLiteral×2, EqualityOperator×1, OptionalChaining×1

Sample mutation:
```diff
- typeof window !== 'undefined'
+ <replaced with: true>
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `lesson-player-page.component.ts:86` in `rowState`. If it's a log message, classify as equivalent.

**Cluster 4** (lines 130–132 — `if()`): 6 mutants surviving — ConditionalExpression×3, EqualityOperator×2, BlockStatement×1

Sample mutation:
```diff
- if (courseId === this.courseId && lessonId === this.lessonId && this.view() !== null) {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `lesson-player-page.component.ts:130` in `if` with assertions that distinguish the outcomes.

**Cluster 5** (lines 145–148 — `if()`): 4 mutants surviving — ConditionalExpression×2, StringLiteral×2

Sample mutation:
```diff
- if (typeof window !== 'undefined') {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `lesson-player-page.component.ts:145` in `if` with assertions that distinguish the outcomes.

**Cluster 6** (lines 165–168 — `if()`): 2 mutants surviving — StringLiteral×1, ConditionalExpression×1

Sample mutation:
```diff
- this.state.set('PROCESSING');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `lesson-player-page.component.ts:165` in `if`. If it's a log message, classify as equivalent.

**Cluster 7** (lines 192 — `onLessonSelected()`): 1 mutant surviving — OptionalChaining×1

Sample mutation:
```diff
- await this.saver?.flush();
+ <replaced with: this.saver.flush>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `lesson-player-page.component.ts:192` in `onLessonSelected`.

**Cluster 8** (lines 207–210 — `onMetadata()`): 3 mutants surviving — OptionalChaining×2, EqualityOperator×1

Sample mutation:
```diff
- const d = duration ?? this.playerRef?.playerEl?.nativeElement.duration ?? 0;
+ <replaced with: this.playerRef?.playerEl.nativeElement>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `lesson-player-page.component.ts:207` in `onMetadata`.

**Cluster 9** (lines 218–220 — `onPlayed()`): 5 mutants surviving — ConditionalExpression×1, LogicalOperator×1, OptionalChaining×2, ArrowFunction×1

Sample mutation:
```diff
- if (this.isOwnerPreview()) return;
+ <replaced with: false>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `lesson-player-page.component.ts:218` in `onPlayed`.

**Cluster 10** (lines 228 — `onEnded()`): 1 mutant surviving — OptionalChaining×1

Sample mutation:
```diff
- void this.saver?.flush();
+ <replaced with: this.saver.flush>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `lesson-player-page.component.ts:228` in `onEnded`.

**Cluster 11** (lines 234–241 — `onSaverRevoked()`): 3 mutants surviving — OptionalChaining×2, BlockStatement×1

Sample mutation:
```diff
- this.saver?.stop();
+ <replaced with: this.saver.stop>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `lesson-player-page.component.ts:234` in `onSaverRevoked`.

**Cluster 12** (lines 254 — `onMarkComplete()`): 1 mutant surviving — OptionalChaining×1

Sample mutation:
```diff
- lastWatchedSeconds: v.progress?.lastWatchedSeconds ?? 0,
+ <replaced with: v.progress.lastWatchedSeconds>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `lesson-player-page.component.ts:254` in `onMarkComplete`.

**Cluster 13** (lines 268–276 — `onDownloadMaterial()`): 5 mutants surviving — ObjectLiteral×2, StringLiteral×3

Sample mutation:
```diff
- this.setRow(matId, { status: 'preparing' });
+ <replaced with: {}>
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `lesson-player-page.component.ts:268` in `onDownloadMaterial`. If it's a log message, classify as equivalent.

**Cluster 14** (lines 290–296 — `ensureSaver()`): 4 mutants surviving — ConditionalExpression×1, LogicalOperator×1, ObjectLiteral×1, ArrowFunction×1

Sample mutation:
```diff
- if (this.saver || this.isOwnerPreview()) return;
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `lesson-player-page.component.ts:290` in `ensureSaver` with assertions that distinguish the outcomes.

### `src/lib/position-saver.ts` — 6 surviving mutants

**Cluster 15** (lines 34–39 — `constructor()`): 2 mutants surviving — ConditionalExpression×2

Sample mutation:
```diff
- if (this.timer) return;
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `position-saver.ts:34` in `constructor` with assertions that distinguish the outcomes.

**Cluster 16** (lines 55 — `if()`): 2 mutants surviving — ConditionalExpression×1, StringLiteral×1

Sample mutation:
```diff
- if (!this.getTime || typeof navigator === 'undefined') return;
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `position-saver.ts:55` in `if` with assertions that distinguish the outcomes.

**Cluster 17** (lines 76 — `stop()`): 2 mutants surviving — ConditionalExpression×2

Sample mutation:
```diff
- if (this.timer) clearInterval(this.timer);
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `position-saver.ts:76` in `stop` with assertions that distinguish the outcomes.

## Equivalent-mutant candidates (excluded from adjusted score)

1 mutants flagged as likely equivalent — these are excluded from the **adjusted** score above. Reviewer should confirm each before treating the adjusted score as authoritative:

| File:line | Mutator | Reason |
|-----------|---------|--------|
| `src/lib/lesson-player-page/lesson-player-page.component.ts:194` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |

## Caveats

- **Scope is per-lib Stryker config.** See `stryker.web-learn.config.mjs` for what gets mutated / excluded.
- **Coverage analysis is `perTest`.** Stryker only runs tests whose coverage hit the mutated line.
- **No-coverage mutants count against the raw score.** They reflect lines no test executes.
- **Equivalent classification is heuristic.** Review each candidate before treating the adjusted score as authoritative.

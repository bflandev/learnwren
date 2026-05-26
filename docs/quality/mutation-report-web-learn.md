# Mutation Test Report — `libs/web-learn`

> Generated 2026-05-26T02:51:18.875Z

**Headline mutation score: 82.41%** (killed=239, survived=43, no-cov=8, ignored=0). Score on covered mutants only: 84.75%. Adjusted (equivalent candidates excluded): 82.70%.


Target band: unclassified.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/lesson-player-page/lesson-player-page.component.ts` | 76.3% | 145 | 37 | 8 |
| `src/lib/position-saver.ts` | 89.3% | 50 | 6 | 0 |
| `src/lib/course-outline-panel/course-outline-panel.component.ts` | 100.0% | 31 | 0 | 0 |
| `src/lib/learn.service.ts` | 100.0% | 13 | 0 | 0 |

## Survivor clusters — gaps to close

### `src/lib/lesson-player-page/lesson-player-page.component.ts` — 44 surviving mutants

**Cluster 1** (lines 41–48): 3 mutants surviving — StringLiteral×1, OptionalChaining×2

Sample mutation:
```diff
- readonly state = signal<PageState>('LOADING');
+ <replaced with: "">
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `lesson-player-page.component.ts:41`.

**Cluster 2** (lines 56–62): 10 mutants surviving — ConditionalExpression×3, StringLiteral×5, BooleanLiteral×1, EqualityOperator×1

Sample mutation:
```diff
- typeof window !== 'undefined'
+ <replaced with: true>
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `lesson-player-page.component.ts:56`. If it's a log message, classify as equivalent.

**Cluster 3** (lines 70–71 — `if()`): 3 mutants surviving — ConditionalExpression×1, StringLiteral×1, OptionalChaining×1

Sample mutation:
```diff
- if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `lesson-player-page.component.ts:70` in `if` with assertions that distinguish the outcomes.

**Cluster 4** (lines 85–88 — `if()`): 4 mutants surviving — ConditionalExpression×2, StringLiteral×2

Sample mutation:
```diff
- if (typeof window !== 'undefined') {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `lesson-player-page.component.ts:85` in `if` with assertions that distinguish the outcomes.

**Cluster 5** (lines 94–97 — `if()`): 4 mutants surviving — ConditionalExpression×2, StringLiteral×2

Sample mutation:
```diff
- if (typeof window !== 'undefined') {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `lesson-player-page.component.ts:94` in `if` with assertions that distinguish the outcomes.

**Cluster 6** (lines 114–117 — `if()`): 2 mutants surviving — StringLiteral×1, ConditionalExpression×1

Sample mutation:
```diff
- this.state.set('PROCESSING');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `lesson-player-page.component.ts:114` in `if`. If it's a log message, classify as equivalent.

**Cluster 7** (lines 141 — `onLessonSelected()`): 1 mutant surviving — OptionalChaining×1

Sample mutation:
```diff
- await this.saver?.flush();
+ <replaced with: this.saver.flush>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `lesson-player-page.component.ts:141` in `onLessonSelected`.

**Cluster 8** (lines 156–159 — `onMetadata()`): 3 mutants surviving — OptionalChaining×2, EqualityOperator×1

Sample mutation:
```diff
- const d = duration ?? this.playerRef?.playerEl?.nativeElement.duration ?? 0;
+ <replaced with: this.playerRef?.playerEl.nativeElement>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `lesson-player-page.component.ts:156` in `onMetadata`.

**Cluster 9** (lines 167–169 — `onPlayed()`): 5 mutants surviving — ConditionalExpression×1, LogicalOperator×1, OptionalChaining×2, ArrowFunction×1

Sample mutation:
```diff
- if (this.isOwnerPreview()) return;
+ <replaced with: false>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `lesson-player-page.component.ts:167` in `onPlayed`.

**Cluster 10** (lines 177 — `onEnded()`): 1 mutant surviving — OptionalChaining×1

Sample mutation:
```diff
- void this.saver?.flush();
+ <replaced with: this.saver.flush>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `lesson-player-page.component.ts:177` in `onEnded`.

**Cluster 11** (lines 183–190 — `onSaverRevoked()`): 3 mutants surviving — OptionalChaining×2, BlockStatement×1

Sample mutation:
```diff
- this.saver?.stop();
+ <replaced with: this.saver.stop>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `lesson-player-page.component.ts:183` in `onSaverRevoked`.

**Cluster 12** (lines 203 — `onMarkComplete()`): 1 mutant surviving — OptionalChaining×1

Sample mutation:
```diff
- lastWatchedSeconds: v.progress?.lastWatchedSeconds ?? 0,
+ <replaced with: v.progress.lastWatchedSeconds>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `lesson-player-page.component.ts:203` in `onMarkComplete`.

**Cluster 13** (lines 217–223 — `ensureSaver()`): 4 mutants surviving — ConditionalExpression×1, LogicalOperator×1, ObjectLiteral×1, ArrowFunction×1

Sample mutation:
```diff
- if (this.saver || this.isOwnerPreview()) return;
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `lesson-player-page.component.ts:217` in `ensureSaver` with assertions that distinguish the outcomes.

### `src/lib/position-saver.ts` — 6 surviving mutants

**Cluster 14** (lines 34–39 — `constructor()`): 2 mutants surviving — ConditionalExpression×2

Sample mutation:
```diff
- if (this.timer) return;
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `position-saver.ts:34` in `constructor` with assertions that distinguish the outcomes.

**Cluster 15** (lines 55 — `if()`): 2 mutants surviving — ConditionalExpression×1, StringLiteral×1

Sample mutation:
```diff
- if (!this.getTime || typeof navigator === 'undefined') return;
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `position-saver.ts:55` in `if` with assertions that distinguish the outcomes.

**Cluster 16** (lines 76 — `stop()`): 2 mutants surviving — ConditionalExpression×2

Sample mutation:
```diff
- if (this.timer) clearInterval(this.timer);
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `position-saver.ts:76` in `stop` with assertions that distinguish the outcomes.

## Equivalent-mutant candidates (excluded from adjusted score)

1 mutants flagged as likely equivalent — these are excluded from the **adjusted** score above. Reviewer should confirm each before treating the adjusted score as authoritative:

| File:line | Mutator | Reason |
|-----------|---------|--------|
| `src/lib/lesson-player-page/lesson-player-page.component.ts:143` | StringLiteral | String literal inside a logger call — log content is observability, not behavior. |

## Caveats

- **Scope is per-lib Stryker config.** See `stryker.web-learn.config.mjs` for what gets mutated / excluded.
- **Coverage analysis is `perTest`.** Stryker only runs tests whose coverage hit the mutated line.
- **No-coverage mutants count against the raw score.** They reflect lines no test executes.
- **Equivalent classification is heuristic.** Review each candidate before treating the adjusted score as authoritative.

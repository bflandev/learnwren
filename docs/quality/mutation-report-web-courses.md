# Mutation Test Report — `libs/web-courses`

> Generated 2026-05-26T03:15:36.755Z

**Headline mutation score: 81.29%** (killed=617, survived=113, no-cov=29, ignored=0). Score on covered mutants only: 84.52%. Adjusted (equivalent candidates excluded): 81.29%.


Target band: unclassified.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/components/confirm-dialog/confirm-dialog.component.ts` | 0.0% | 0 | 2 | 0 |
| `src/lib/components/lesson-item/lesson-item.component.ts` | 42.9% | 15 | 11 | 9 |
| `src/lib/components/module-item/module-item.component.ts` | 47.1% | 16 | 16 | 2 |
| `src/lib/publish/publish-eligibility-panel.component.ts` | 72.7% | 56 | 13 | 8 |
| `src/lib/materials/materials-list.component.ts` | 80.0% | 56 | 10 | 4 |
| `src/lib/course-create-page/course-create-page.component.ts` | 82.0% | 41 | 9 | 0 |
| `src/lib/components/module-tree/module-tree.component.ts` | 83.3% | 5 | 1 | 0 |
| `src/lib/publish/course-publish-bar.component.ts` | 83.5% | 91 | 13 | 5 |
| `src/lib/materials/material-upload.service.ts` | 85.4% | 82 | 14 | 0 |
| `src/lib/components/course-meta-panel/course-meta-panel.component.ts` | 87.0% | 20 | 3 | 0 |
| `src/lib/publish/publish-eligibility.service.ts` | 87.5% | 14 | 2 | 0 |
| `src/lib/course-editor-page/course-editor-page.component.ts` | 88.3% | 143 | 18 | 1 |
| `src/lib/instructor-role.guard.ts` | 95.2% | 20 | 1 | 0 |
| `src/lib/components/lesson-list/lesson-list.component.ts` | 100.0% | 6 | 0 | 0 |
| `src/lib/courses-list-page/courses-list-page.component.ts` | 100.0% | 2 | 0 | 0 |
| `src/lib/courses.service.ts` | 100.0% | 37 | 0 | 0 |
| `src/lib/materials/materials.service.ts` | 100.0% | 13 | 0 | 0 |

## Survivor clusters — gaps to close

### `src/lib/publish/publish-eligibility-panel.component.ts` — 21 surviving mutants

**Cluster 1** (lines 43–53): 9 mutants surviving — ConditionalExpression×4, LogicalOperator×1, BlockStatement×1, EqualityOperator×1, OptionalChaining×1, BooleanLiteral×1

Sample mutation:
```diff
- return e && !e.eligible ? e.reasons.length : 0;
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `publish-eligibility-panel.component.ts:43` with assertions that distinguish the outcomes.

**Cluster 2** (lines 61–68 — `switch()`): 4 mutants surviving — ConditionalExpression×3, StringLiteral×1

Sample mutation:
```diff
- case 'MODULE_HAS_NO_LESSONS':
+ <replaced with: case 'MODULE_HAS_NO_LESSONS':>
```

_Diagnosis._ A ternary or conditional could be replaced and tests still pass. Cover both branches with distinct assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `publish-eligibility-panel.component.ts:61` in `switch` with assertions that distinguish the outcomes.

**Cluster 3** (lines 74–75 — `onJump()`): 8 mutants surviving — ConditionalExpression×6, LogicalOperator×2

Sample mutation:
```diff
- if (link === 'module' && r.kind === 'MODULE_HAS_NO_LESSONS') this.jumpToModule.emit(r.moduleId);
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `publish-eligibility-panel.component.ts:74` in `onJump` with assertions that distinguish the outcomes.

### `src/lib/components/lesson-item/lesson-item.component.ts` — 20 surviving mutants

**Cluster 4** (lines 47): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- readonly draftTitle = signal('');
+ <replaced with: "Stryker was here!">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `lesson-item.component.ts:47`. If it's a log message, classify as equivalent.

**Cluster 5** (lines 53–87 — `if()`): 13 mutants surviving — ConditionalExpression×2, BlockStatement×4, ArrowFunction×2, BooleanLiteral×4, MethodExpression×1

Sample mutation:
```diff
- if (!vid) {
+ <replaced with: false>
```

_Diagnosis._ An entire block could be deleted without test failure: the side effect inside it is not observed. Assert on the change it makes (state, mock call, returned value).

_Recommended test._ Add an assertion on the side effect of the block/function at `lesson-item.component.ts:53` in `if` — verify state change, mock invocation, or returned value.

**Cluster 6** (lines 94–104 — `onVideoStateChanged()`): 6 mutants surviving — BlockStatement×1, BooleanLiteral×1, ConditionalExpression×2, ObjectLiteral×1, ArrowFunction×1

Sample mutation:
```diff
- onVideoStateChanged(state: VideoState): void {
+ <replaced with: {}>
```

_Diagnosis._ A ternary or conditional could be replaced and tests still pass. Cover both branches with distinct assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `lesson-item.component.ts:94` in `onVideoStateChanged` with assertions that distinguish the outcomes.

### `src/lib/course-editor-page/course-editor-page.component.ts` — 19 surviving mutants

**Cluster 7** (lines 45): 2 mutants surviving — ArrayDeclaration×1, OptionalChaining×1

Sample mutation:
```diff
- (this.tree()?.modules ?? []).map((m) => ({ module: m.module, lessons: m.lessons })),
+ <replaced with: ["Stryker was here"]>
```

_Diagnosis._ An array literal could be replaced with `[]` and tests pass. The contents (length, ordering, item shape) are not pinned.

_Recommended test._ Assert on the array length / object shape returned at `course-editor-page.component.ts:45`, not just truthiness.

**Cluster 8** (lines 54 — `refresh()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (!cid) return;
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `course-editor-page.component.ts:54` in `refresh` with assertions that distinguish the outcomes.

**Cluster 9** (lines 81–86 — `requestDeleteLesson()`): 2 mutants surviving — StringLiteral×1, ConditionalExpression×1

Sample mutation:
```diff
- this.pendingConfirm.set({ kind: 'deleteLesson', ...args });
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `course-editor-page.component.ts:81` in `requestDeleteLesson`. If it's a log message, classify as equivalent.

**Cluster 10** (lines 116 — `if()`): 1 mutant surviving — OptionalChaining×1

Sample mutation:
```diff
- this.publishBar?.runConfirmedTransition(pending.kind);
+ <replaced with: this.publishBar.runConfirmedTransition>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `course-editor-page.component.ts:116` in `if`.

**Cluster 11** (lines 137 — `addModule()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- const title = window.prompt('Module title');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `course-editor-page.component.ts:137` in `addModule`. If it's a log message, classify as equivalent.

**Cluster 12** (lines 168–173 — `onReorderModules()`): 9 mutants surviving — ArrowFunction×4, ObjectLiteral×1, MethodExpression×1, ConditionalExpression×2, EqualityOperator×1

Sample mutation:
```diff
- (snapshot) => ({
+ <replaced with: () => undefined>
```

_Diagnosis._ A method/arrow body could be emptied with no test failing. The function is called but its effect isn't asserted.

_Recommended test._ Add an assertion on the side effect of the block/function at `course-editor-page.component.ts:168` in `onReorderModules` — verify state change, mock invocation, or returned value.

**Cluster 13** (lines 183–186 — `onReorderLessons()`): 2 mutants surviving — ConditionalExpression×1, MethodExpression×1

Sample mutation:
```diff
- if (n.module.id !== args.moduleId) return n;
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `course-editor-page.component.ts:183` in `onReorderLessons` with assertions that distinguish the outcomes.

**Cluster 14** (lines 204 — `filter()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (!snapshot) return;
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `course-editor-page.component.ts:204` in `filter` with assertions that distinguish the outcomes.

### `src/lib/components/module-item/module-item.component.ts` — 18 surviving mutants

**Cluster 15** (lines 31–53): 15 mutants surviving — StringLiteral×3, BooleanLiteral×4, BlockStatement×2, MethodExpression×1, ConditionalExpression×3, LogicalOperator×1, EqualityOperator×1

Sample mutation:
```diff
- readonly draftTitle = signal('');
+ <replaced with: "Stryker was here!">
```

_Diagnosis._ A `true`/`false` literal could be flipped and tests still pass. Add an assertion that pins the boolean.

_Recommended test._ Add a test that drives both sides of the conditional at `module-item.component.ts:31` with assertions that distinguish the outcomes.

**Cluster 16** (lines 60–61 — `commitAddLesson()`): 3 mutants surviving — MethodExpression×1, ConditionalExpression×1, EqualityOperator×1

Sample mutation:
```diff
- const t = this.newLessonTitle().trim();
+ <replaced with: this.newLessonTitle()>
```

_Diagnosis._ A method/arrow body could be emptied with no test failing. The function is called but its effect isn't asserted.

_Recommended test._ Add an assertion on the side effect of the block/function at `module-item.component.ts:60` in `commitAddLesson` — verify state change, mock invocation, or returned value.

### `src/lib/publish/course-publish-bar.component.ts` — 18 surviving mutants

**Cluster 17** (lines 45): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- default: return null;
+ <replaced with: default:>
```

_Diagnosis._ A ternary or conditional could be replaced and tests still pass. Cover both branches with distinct assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `course-publish-bar.component.ts:45` with assertions that distinguish the outcomes.

**Cluster 18** (lines 53–57): 4 mutants surviving — ConditionalExpression×2, StringLiteral×1, BooleanLiteral×1

Sample mutation:
```diff
- default: return '';
+ <replaced with: default:>
```

_Diagnosis._ A ternary or conditional could be replaced and tests still pass. Cover both branches with distinct assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `course-publish-bar.component.ts:53` with assertions that distinguish the outcomes.

**Cluster 19** (lines 65–75): 6 mutants surviving — ConditionalExpression×4, StringLiteral×1, EqualityOperator×1

Sample mutation:
```diff
- return s === 'DRAFT' || s === 'PUBLISHED';
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `course-publish-bar.component.ts:65` with assertions that distinguish the outcomes.

**Cluster 20** (lines 85–90 — `runConfirmedTransition()`): 2 mutants surviving — ConditionalExpression×1, BooleanLiteral×1

Sample mutation:
```diff
- if (kind === 'unpublish') this.doTransition(() => this.courses.unpublishCourse(this.course().id));
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `course-publish-bar.component.ts:85` in `runConfirmedTransition` with assertions that distinguish the outcomes.

**Cluster 21** (lines 99 — `if()`): 3 mutants surviving — ArrayDeclaration×1, OptionalChaining×2

Sample mutation:
```diff
- const reasons = err.error?.details?.reasons ?? [];
+ <replaced with: ["Stryker was here"]>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `course-publish-bar.component.ts:99` in `if`.

**Cluster 22** (lines 106–108 — `if()`): 2 mutants surviving — BlockStatement×1, BooleanLiteral×1

Sample mutation:
```diff
- } finally {
+ <replaced with: {}>
```

_Diagnosis._ An entire block could be deleted without test failure: the side effect inside it is not observed. Assert on the change it makes (state, mock call, returned value).

_Recommended test._ Add an assertion on the side effect of the block/function at `course-publish-bar.component.ts:106` in `if` — verify state change, mock invocation, or returned value.

### `src/lib/materials/materials-list.component.ts` — 14 surviving mutants

**Cluster 23** (lines 37–40): 3 mutants surviving — ArrayDeclaration×1, BooleanLiteral×1, StringLiteral×1

Sample mutation:
```diff
- readonly materials = signal<Material[]>([]);
+ <replaced with: ["Stryker was here"]>
```

_Diagnosis._ An array literal could be replaced with `[]` and tests pass. The contents (length, ordering, item shape) are not pinned.

_Recommended test._ Assert on the array length / object shape returned at `materials-list.component.ts:37`, not just truthiness.

**Cluster 24** (lines 77 — `from()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- el.value = '';
+ <replaced with: "Stryker was here!">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `materials-list.component.ts:77` in `from`. If it's a log message, classify as equivalent.

**Cluster 25** (lines 100 — `commitRename()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- this.materials.update((list) => list.map((x) => (x.id === m.id ? updated : x)));
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `materials-list.component.ts:100` in `commitRename` with assertions that distinguish the outcomes.

**Cluster 26** (lines 112 — `confirmRemoval()`): 2 mutants surviving — ArrowFunction×1, ConditionalExpression×1

Sample mutation:
```diff
- this.materials.update((list) => list.filter((x) => x.id !== m.id));
+ <replaced with: () => undefined>
```

_Diagnosis._ A method/arrow body could be emptied with no test failing. The function is called but its effect isn't asserted.

_Recommended test._ Add an assertion on the side effect of the block/function at `materials-list.component.ts:112` in `confirmRemoval` — verify state change, mock invocation, or returned value.

**Cluster 27** (lines 120–123 — `status()`): 3 mutants surviving — OptionalChaining×1, ArrowFunction×1, ConditionalExpression×1

Sample mutation:
```diff
- const status = (err as { status?: number })?.status;
+ <replaced with: (err as {
  status?: number;
}).status>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `materials-list.component.ts:120` in `status`.

**Cluster 28** (lines 131–139 — `openDownload()`): 4 mutants surviving — BlockStatement×1, StringLiteral×3

Sample mutation:
```diff
- protected openDownload(url: string): void {
+ <replaced with: {}>
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `materials-list.component.ts:131` in `openDownload`. If it's a log message, classify as equivalent.

### `src/lib/materials/material-upload.service.ts` — 14 surviving mutants

**Cluster 29** (lines 15–16): 4 mutants surviving — StringLiteral×2, ArrowFunction×2

Sample mutation:
```diff
- 'MATERIAL_XHR_FACTORY',
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `material-upload.service.ts:15`. If it's a log message, classify as equivalent.

**Cluster 30** (lines 43 — `toLowerCase()`): 2 mutants surviving — ConditionalExpression×1, StringLiteral×1

Sample mutation:
```diff
- const ext = dot >= 0 ? file.name.slice(dot + 1).toLowerCase() : '';
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `material-upload.service.ts:43` in `toLowerCase` with assertions that distinguish the outcomes.

**Cluster 31** (lines 66 — `errorMessage()`): 1 mutant surviving — ArrayDeclaration×1

Sample mutation:
```diff
- private readonly _failures = signal<MaterialUploadFailure[]>([]);
+ <replaced with: ["Stryker was here"]>
```

_Diagnosis._ An array literal could be replaced with `[]` and tests pass. The contents (length, ordering, item shape) are not pinned.

_Recommended test._ Assert on the array length / object shape returned at `material-upload.service.ts:66` in `errorMessage`, not just truthiness.

**Cluster 32** (lines 99–102 — `catch()`): 1 mutant surviving — ObjectLiteral×1

Sample mutation:
```diff
- this.api.createUploadUrl(ctx.courseId, ctx.moduleId, ctx.lessonId, {
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `material-upload.service.ts:99` in `catch`, not just truthiness.

**Cluster 33** (lines 109 — `if()`): 1 mutant surviving — EqualityOperator×1

Sample mutation:
```diff
- if (status < 200 || status >= 300) {
+ <replaced with: status > 300>
```

_Diagnosis._ An equality / inequality operator could be flipped (`==`↔`!=`, `===`↔`!==`) and tests still pass. Test both equal and unequal inputs at the boundary.

_Recommended test._ Add a boundary test that exercises the equal / off-by-one case at `material-upload.service.ts:109` in `if`.

**Cluster 34** (lines 134 — `catch()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `material-upload.service.ts:134` in `catch` with assertions that distinguish the outcomes.

**Cluster 35** (lines 144 — `setProgress()`): 2 mutants surviving — ArrowFunction×1, ConditionalExpression×1

Sample mutation:
```diff
- ...list.filter((p) => p.filename !== filename),
+ <replaced with: () => undefined>
```

_Diagnosis._ A method/arrow body could be emptied with no test failing. The function is called but its effect isn't asserted.

_Recommended test._ Add an assertion on the side effect of the block/function at `material-upload.service.ts:144` in `setProgress` — verify state change, mock invocation, or returned value.

**Cluster 36** (lines 150 — `clearProgress()`): 2 mutants surviving — ArrowFunction×1, ConditionalExpression×1

Sample mutation:
```diff
- this._inFlight.update((list) => list.filter((p) => p.filename !== filename));
+ <replaced with: () => undefined>
```

_Diagnosis._ A method/arrow body could be emptied with no test failing. The function is called but its effect isn't asserted.

_Recommended test._ Add an assertion on the side effect of the block/function at `material-upload.service.ts:150` in `clearProgress` — verify state change, mock invocation, or returned value.

### `src/lib/course-create-page/course-create-page.component.ts` — 9 surviving mutants

**Cluster 37** (lines 34–38): 5 mutants surviving — StringLiteral×2, ArrayDeclaration×3

Sample mutation:
```diff
- title: ['', [Validators.required, Validators.maxLength(100)]],
+ <replaced with: "Stryker was here!">
```

_Diagnosis._ An array literal could be replaced with `[]` and tests pass. The contents (length, ordering, item shape) are not pinned.

_Recommended test._ Assert on the array length / object shape returned at `course-create-page.component.ts:34`, not just truthiness.

**Cluster 38** (lines 72–82 — `handleSubmitError()`): 4 mutants surviving — ConditionalExpression×1, BlockStatement×1, OptionalChaining×2

Sample mutation:
```diff
- if (!(err instanceof HttpErrorResponse)) {
+ <replaced with: false>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `course-create-page.component.ts:72` in `handleSubmitError`.

### `src/lib/components/course-meta-panel/course-meta-panel.component.ts` — 3 surviving mutants

**Cluster 39** (lines 21–22): 2 mutants surviving — StringLiteral×2

Sample mutation:
```diff
- readonly draftTitle = signal('');
+ <replaced with: "Stryker was here!">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `course-meta-panel.component.ts:21`. If it's a log message, classify as equivalent.

**Cluster 40** (lines 36–39 — `syncDrafts()`): 1 mutant surviving — BlockStatement×1

Sample mutation:
```diff
- syncDrafts(): void {
+ <replaced with: {}>
```

_Diagnosis._ An entire block could be deleted without test failure: the side effect inside it is not observed. Assert on the change it makes (state, mock call, returned value).

_Recommended test._ Add an assertion on the side effect of the block/function at `course-meta-panel.component.ts:36` in `syncDrafts` — verify state change, mock invocation, or returned value.

### `src/lib/components/confirm-dialog/confirm-dialog.component.ts` — 2 surviving mutants

**Cluster 41** (lines 13–14): 2 mutants surviving — StringLiteral×2

Sample mutation:
```diff
- readonly confirmLabel = input<string>('Delete');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `confirm-dialog.component.ts:13`. If it's a log message, classify as equivalent.

### `src/lib/publish/publish-eligibility.service.ts` — 2 surviving mutants

**Cluster 42** (lines 44–45 — `fetch()`): 2 mutants surviving — ConditionalExpression×1, BooleanLiteral×1

Sample mutation:
```diff
- if (!this.cid) return;
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `publish-eligibility.service.ts:44` in `fetch` with assertions that distinguish the outcomes.

### `src/lib/components/module-tree/module-tree.component.ts` — 1 surviving mutant

**Cluster 43** (lines 44 — `onDrop()`): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (event.previousIndex === event.currentIndex) return;
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `module-tree.component.ts:44` in `onDrop` with assertions that distinguish the outcomes.

### `src/lib/instructor-role.guard.ts` — 1 surviving mutant

**Cluster 44** (lines 10): 1 mutant surviving — ConditionalExpression×1

Sample mutation:
```diff
- if (auth.currentUser() === undefined) {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed: hardcoding the branch to true or false leaves tests passing. Add a test that drives both sides of the condition with distinguishing assertions.

_Recommended test._ Add a test that drives both sides of the conditional at `instructor-role.guard.ts:10` with assertions that distinguish the outcomes.

## Equivalent-mutant candidates (excluded from adjusted score)

_None._

## Caveats

- **Scope is per-lib Stryker config.** See `stryker.web-courses.config.mjs` for what gets mutated / excluded.
- **Coverage analysis is `perTest`.** Stryker only runs tests whose coverage hit the mutated line.
- **No-coverage mutants count against the raw score.** They reflect lines no test executes.
- **Equivalent classification is heuristic.** Review each candidate before treating the adjusted score as authoritative.

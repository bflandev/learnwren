# Mutation Test Report — `libs/web-courses`

> Generated 2026-05-25T17:20:55.492Z

**Headline mutation score: 77.63%** (killed=597, survived=146, no-cov=26, ignored=0). Score on covered mutants only: 80.35%.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/components/confirm-dialog/confirm-dialog.component.ts` | 0.0% | 0 | 2 | 0 |
| `src/lib/components/module-item/module-item.component.ts` | 47.1% | 16 | 16 | 2 |
| `src/lib/components/lesson-item/lesson-item.component.ts` | 51.7% | 15 | 11 | 3 |
| `src/lib/course-create-page/course-create-page.component.ts` | 60.0% | 30 | 20 | 0 |
| `src/lib/publish/publish-eligibility-panel.component.ts` | 66.7% | 62 | 20 | 11 |
| `src/lib/materials/material-upload.service.ts` | 69.8% | 67 | 29 | 0 |
| `src/lib/materials/materials-list.component.ts` | 80.0% | 56 | 10 | 4 |
| `src/lib/components/module-tree/module-tree.component.ts` | 83.3% | 5 | 1 | 0 |
| `src/lib/publish/course-publish-bar.component.ts` | 83.5% | 91 | 13 | 5 |
| `src/lib/components/course-meta-panel/course-meta-panel.component.ts` | 87.0% | 20 | 3 | 0 |
| `src/lib/publish/publish-eligibility.service.ts` | 87.5% | 14 | 2 | 0 |
| `src/lib/course-editor-page/course-editor-page.component.ts` | 88.3% | 143 | 18 | 1 |
| `src/lib/instructor-role.guard.ts` | 95.2% | 20 | 1 | 0 |
| `src/lib/components/lesson-list/lesson-list.component.ts` | 100.0% | 6 | 0 | 0 |
| `src/lib/courses-list-page/courses-list-page.component.ts` | 100.0% | 2 | 0 | 0 |
| `src/lib/courses.service.ts` | 100.0% | 37 | 0 | 0 |
| `src/lib/materials/materials.service.ts` | 100.0% | 13 | 0 | 0 |

## Survivor clusters — gaps to close

### `src/lib/publish/publish-eligibility-panel.component.ts` — 31 surviving mutants

**Cluster 1** (lines 26–36): 9 mutants surviving — ConditionalExpression×4, LogicalOperator×1, BlockStatement×1, EqualityOperator×1, OptionalChaining×1, BooleanLiteral×1

```diff
- return e && !e.eligible ? e.reasons.length : 0;
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `publish-eligibility-panel.component.ts:26`.

**Cluster 2** (lines 44–57 — `switch()`): 11 mutants surviving — ConditionalExpression×6, StringLiteral×5

```diff
- case 'MODULE_HAS_NO_LESSONS':
+ <replaced with: case 'MODULE_HAS_NO_LESSONS':>
```

_Diagnosis._ A ternary or conditional could be replaced and tests still pass.

_Recommended test._ Drive both sides of the conditional at `publish-eligibility-panel.component.ts:44` in `switch`.

**Cluster 3** (lines 63–64 — `onJump()`): 11 mutants surviving — ConditionalExpression×7, LogicalOperator×2, EqualityOperator×1, StringLiteral×1

```diff
- if (link === 'module' && r.kind === 'MODULE_HAS_NO_LESSONS') this.jumpToModule.emit(r.moduleId);
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `publish-eligibility-panel.component.ts:63` in `onJump`.

### `src/lib/materials/material-upload.service.ts` — 29 surviving mutants

**Cluster 4** (lines 15–16): 4 mutants surviving — StringLiteral×2, ArrowFunction×2

```diff
- 'MATERIAL_XHR_FACTORY',
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `material-upload.service.ts:15`.

**Cluster 5** (lines 43 — `toLowerCase()`): 3 mutants surviving — ConditionalExpression×1, EqualityOperator×1, StringLiteral×1

```diff
- const ext = dot >= 0 ? file.name.slice(dot + 1).toLowerCase() : '';
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `material-upload.service.ts:43` in `toLowerCase`.

**Cluster 6** (lines 50 — `if()`): 1 mutant surviving — EqualityOperator×1

```diff
- if (file.size > MATERIAL_MAX_SIZE_BYTES) {
+ <replaced with: file.size >= MATERIAL_MAX_SIZE_BYTES>
```

_Diagnosis._ An equality / inequality operator could be flipped and tests still pass.

_Recommended test._ Add a boundary test at `material-upload.service.ts:50` in `if`.

**Cluster 7** (lines 66 — `errorMessage()`): 1 mutant surviving — ArrayDeclaration×1

```diff
- private readonly _failures = signal<MaterialUploadFailure[]>([]);
+ <replaced with: ["Stryker was here"]>
```

_Diagnosis._ An array literal could be replaced with `[]` and tests pass.

_Recommended test._ Assert on array length / object shape at `material-upload.service.ts:66` in `errorMessage`.

**Cluster 8** (lines 99–109 — `catch()`): 3 mutants surviving — ObjectLiteral×1, ArrowFunction×1, EqualityOperator×1

```diff
- this.api.createUploadUrl(ctx.courseId, ctx.moduleId, ctx.lessonId, {
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass.

_Recommended test._ Assert on array length / object shape at `material-upload.service.ts:99` in `catch`.

**Cluster 9** (lines 131–135 — `catch()`): 8 mutants surviving — StringLiteral×2, BooleanLiteral×1, BlockStatement×1, ConditionalExpression×2, ArithmeticOperator×2

```diff
- xhr.open('PUT', url, true);
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `material-upload.service.ts:131` in `catch`.

**Cluster 10** (lines 142–150 — `setProgress()`): 9 mutants surviving — BlockStatement×1, ArrayDeclaration×1, MethodExpression×1, ArrowFunction×2, ConditionalExpression×3, EqualityOperator×1

```diff
- private setProgress(filename: string, percent: number): void {
+ <replaced with: {}>
```

_Diagnosis._ A ternary or conditional could be replaced and tests still pass.

_Recommended test._ Drive both sides of the conditional at `material-upload.service.ts:142` in `setProgress`.

### `src/lib/course-create-page/course-create-page.component.ts` — 20 surviving mutants

**Cluster 11** (lines 34–38): 9 mutants surviving — ArrayDeclaration×7, StringLiteral×2

```diff
- title: ['', [Validators.required, Validators.maxLength(100)]],
+ <replaced with: []>
```

_Diagnosis._ An array literal could be replaced with `[]` and tests pass.

_Recommended test._ Assert on array length / object shape at `course-create-page.component.ts:34`.

**Cluster 12** (lines 46–47 — `submit()`): 3 mutants surviving — ConditionalExpression×1, LogicalOperator×1, BooleanLiteral×1

```diff
- if (this.form.invalid || this.busy()) return;
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `course-create-page.component.ts:46` in `submit`.

**Cluster 13** (lines 55–57 — `catch()`): 2 mutants surviving — BlockStatement×1, BooleanLiteral×1

```diff
- } finally {
+ <replaced with: {}>
```

_Diagnosis._ An entire block could be deleted without test failure.

_Recommended test._ Assert on the side effect at `course-create-page.component.ts:55` in `catch`.

**Cluster 14** (lines 63–64 — `buildPayload()`): 2 mutants surviving — MethodExpression×2

```diff
- title: v.title.trim(),
+ <replaced with: v.title>
```

_Diagnosis._ A method/arrow body could be emptied with no test failing.

_Recommended test._ Assert on the side effect at `course-create-page.component.ts:63` in `buildPayload`.

**Cluster 15** (lines 72–82 — `handleSubmitError()`): 4 mutants surviving — ConditionalExpression×1, BlockStatement×1, OptionalChaining×2

```diff
- if (!(err instanceof HttpErrorResponse)) {
+ <replaced with: false>
```

_Diagnosis._ Removing `?.` didn't break tests. Add a case where the parent is null/undefined.

_Recommended test._ Add a null/undefined parent case at `course-create-page.component.ts:72` in `handleSubmitError`.

### `src/lib/course-editor-page/course-editor-page.component.ts` — 19 surviving mutants

**Cluster 16** (lines 45): 2 mutants surviving — ArrayDeclaration×1, OptionalChaining×1

```diff
- (this.tree()?.modules ?? []).map((m) => ({ module: m.module, lessons: m.lessons })),
+ <replaced with: ["Stryker was here"]>
```

_Diagnosis._ An array literal could be replaced with `[]` and tests pass.

_Recommended test._ Assert on array length / object shape at `course-editor-page.component.ts:45`.

**Cluster 17** (lines 54 — `refresh()`): 1 mutant surviving — ConditionalExpression×1

```diff
- if (!cid) return;
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `course-editor-page.component.ts:54` in `refresh`.

**Cluster 18** (lines 81–86 — `requestDeleteLesson()`): 2 mutants surviving — StringLiteral×1, ConditionalExpression×1

```diff
- this.pendingConfirm.set({ kind: 'deleteLesson', ...args });
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `course-editor-page.component.ts:81` in `requestDeleteLesson`.

**Cluster 19** (lines 116 — `if()`): 1 mutant surviving — OptionalChaining×1

```diff
- this.publishBar?.runConfirmedTransition(pending.kind);
+ <replaced with: this.publishBar.runConfirmedTransition>
```

_Diagnosis._ Removing `?.` didn't break tests. Add a case where the parent is null/undefined.

_Recommended test._ Add a null/undefined parent case at `course-editor-page.component.ts:116` in `if`.

**Cluster 20** (lines 137 — `addModule()`): 1 mutant surviving — StringLiteral×1

```diff
- const title = window.prompt('Module title');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `course-editor-page.component.ts:137` in `addModule`.

**Cluster 21** (lines 168–173 — `onReorderModules()`): 9 mutants surviving — ArrowFunction×4, ObjectLiteral×1, MethodExpression×1, ConditionalExpression×2, EqualityOperator×1

```diff
- (snapshot) => ({
+ <replaced with: () => undefined>
```

_Diagnosis._ A method/arrow body could be emptied with no test failing.

_Recommended test._ Assert on the side effect at `course-editor-page.component.ts:168` in `onReorderModules`.

**Cluster 22** (lines 183–186 — `onReorderLessons()`): 2 mutants surviving — ConditionalExpression×1, MethodExpression×1

```diff
- if (n.module.id !== args.moduleId) return n;
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `course-editor-page.component.ts:183` in `onReorderLessons`.

**Cluster 23** (lines 204 — `filter()`): 1 mutant surviving — ConditionalExpression×1

```diff
- if (!snapshot) return;
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `course-editor-page.component.ts:204` in `filter`.

### `src/lib/components/module-item/module-item.component.ts` — 18 surviving mutants

**Cluster 24** (lines 31–53): 15 mutants surviving — StringLiteral×3, BooleanLiteral×4, BlockStatement×2, MethodExpression×1, ConditionalExpression×3, LogicalOperator×1, EqualityOperator×1

```diff
- readonly draftTitle = signal('');
+ <replaced with: "Stryker was here!">
```

_Diagnosis._ A `true`/`false` literal could be flipped and tests still pass.

_Recommended test._ Drive both sides of the conditional at `module-item.component.ts:31`.

**Cluster 25** (lines 60–61 — `commitAddLesson()`): 3 mutants surviving — MethodExpression×1, ConditionalExpression×1, EqualityOperator×1

```diff
- const t = this.newLessonTitle().trim();
+ <replaced with: this.newLessonTitle()>
```

_Diagnosis._ A method/arrow body could be emptied with no test failing.

_Recommended test._ Assert on the side effect at `module-item.component.ts:60` in `commitAddLesson`.

### `src/lib/publish/course-publish-bar.component.ts` — 18 surviving mutants

**Cluster 26** (lines 45): 1 mutant surviving — ConditionalExpression×1

```diff
- default: return null;
+ <replaced with: default:>
```

_Diagnosis._ A ternary or conditional could be replaced and tests still pass.

_Recommended test._ Drive both sides of the conditional at `course-publish-bar.component.ts:45`.

**Cluster 27** (lines 53–57): 4 mutants surviving — ConditionalExpression×2, StringLiteral×1, BooleanLiteral×1

```diff
- default: return '';
+ <replaced with: default:>
```

_Diagnosis._ A ternary or conditional could be replaced and tests still pass.

_Recommended test._ Drive both sides of the conditional at `course-publish-bar.component.ts:53`.

**Cluster 28** (lines 65–75): 6 mutants surviving — ConditionalExpression×4, EqualityOperator×1, StringLiteral×1

```diff
- return s === 'DRAFT' || s === 'PUBLISHED';
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `course-publish-bar.component.ts:65`.

**Cluster 29** (lines 85–90 — `runConfirmedTransition()`): 2 mutants surviving — ConditionalExpression×1, BooleanLiteral×1

```diff
- if (kind === 'unpublish') this.doTransition(() => this.courses.unpublishCourse(this.course().id));
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `course-publish-bar.component.ts:85` in `runConfirmedTransition`.

**Cluster 30** (lines 99 — `if()`): 3 mutants surviving — ArrayDeclaration×1, OptionalChaining×2

```diff
- const reasons = err.error?.details?.reasons ?? [];
+ <replaced with: ["Stryker was here"]>
```

_Diagnosis._ Removing `?.` didn't break tests. Add a case where the parent is null/undefined.

_Recommended test._ Add a null/undefined parent case at `course-publish-bar.component.ts:99` in `if`.

**Cluster 31** (lines 106–108 — `if()`): 2 mutants surviving — BlockStatement×1, BooleanLiteral×1

```diff
- } finally {
+ <replaced with: {}>
```

_Diagnosis._ An entire block could be deleted without test failure.

_Recommended test._ Assert on the side effect at `course-publish-bar.component.ts:106` in `if`.

### `src/lib/components/lesson-item/lesson-item.component.ts` — 14 surviving mutants

**Cluster 32** (lines 47): 1 mutant surviving — StringLiteral×1

```diff
- readonly draftTitle = signal('');
+ <replaced with: "Stryker was here!">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `lesson-item.component.ts:47`.

**Cluster 33** (lines 53–87 — `if()`): 13 mutants surviving — ConditionalExpression×2, BlockStatement×4, ArrowFunction×2, BooleanLiteral×4, MethodExpression×1

```diff
- if (!vid) {
+ <replaced with: false>
```

_Diagnosis._ An entire block could be deleted without test failure.

_Recommended test._ Assert on the side effect at `lesson-item.component.ts:53` in `if`.

### `src/lib/materials/materials-list.component.ts` — 14 surviving mutants

**Cluster 34** (lines 37–40): 3 mutants surviving — ArrayDeclaration×1, BooleanLiteral×1, StringLiteral×1

```diff
- readonly materials = signal<Material[]>([]);
+ <replaced with: ["Stryker was here"]>
```

_Diagnosis._ An array literal could be replaced with `[]` and tests pass.

_Recommended test._ Assert on array length / object shape at `materials-list.component.ts:37`.

**Cluster 35** (lines 77 — `from()`): 1 mutant surviving — StringLiteral×1

```diff
- el.value = '';
+ <replaced with: "Stryker was here!">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `materials-list.component.ts:77` in `from`.

**Cluster 36** (lines 100 — `commitRename()`): 1 mutant surviving — ConditionalExpression×1

```diff
- this.materials.update((list) => list.map((x) => (x.id === m.id ? updated : x)));
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `materials-list.component.ts:100` in `commitRename`.

**Cluster 37** (lines 112 — `confirmRemoval()`): 2 mutants surviving — ArrowFunction×1, ConditionalExpression×1

```diff
- this.materials.update((list) => list.filter((x) => x.id !== m.id));
+ <replaced with: () => undefined>
```

_Diagnosis._ A method/arrow body could be emptied with no test failing.

_Recommended test._ Assert on the side effect at `materials-list.component.ts:112` in `confirmRemoval`.

**Cluster 38** (lines 120–123 — `status()`): 3 mutants surviving — OptionalChaining×1, ArrowFunction×1, ConditionalExpression×1

```diff
- const status = (err as { status?: number })?.status;
+ <replaced with: (err as {
  status?: number;
}).status>
```

_Diagnosis._ Removing `?.` didn't break tests. Add a case where the parent is null/undefined.

_Recommended test._ Add a null/undefined parent case at `materials-list.component.ts:120` in `status`.

**Cluster 39** (lines 131–139 — `openDownload()`): 4 mutants surviving — BlockStatement×1, StringLiteral×3

```diff
- protected openDownload(url: string): void {
+ <replaced with: {}>
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `materials-list.component.ts:131` in `openDownload`.

### `src/lib/components/course-meta-panel/course-meta-panel.component.ts` — 3 surviving mutants

**Cluster 40** (lines 21–22): 2 mutants surviving — StringLiteral×2

```diff
- readonly draftTitle = signal('');
+ <replaced with: "Stryker was here!">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `course-meta-panel.component.ts:21`.

**Cluster 41** (lines 36–39 — `syncDrafts()`): 1 mutant surviving — BlockStatement×1

```diff
- syncDrafts(): void {
+ <replaced with: {}>
```

_Diagnosis._ An entire block could be deleted without test failure.

_Recommended test._ Assert on the side effect at `course-meta-panel.component.ts:36` in `syncDrafts`.

### `src/lib/components/confirm-dialog/confirm-dialog.component.ts` — 2 surviving mutants

**Cluster 42** (lines 13–14): 2 mutants surviving — StringLiteral×2

```diff
- readonly confirmLabel = input<string>('Delete');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass.

_Recommended test._ Pin the literal value at `confirm-dialog.component.ts:13`.

### `src/lib/publish/publish-eligibility.service.ts` — 2 surviving mutants

**Cluster 43** (lines 44–45 — `fetch()`): 2 mutants surviving — ConditionalExpression×1, BooleanLiteral×1

```diff
- if (!this.cid) return;
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `publish-eligibility.service.ts:44` in `fetch`.

### `src/lib/components/module-tree/module-tree.component.ts` — 1 surviving mutant

**Cluster 44** (lines 44 — `onDrop()`): 1 mutant surviving — ConditionalExpression×1

```diff
- if (event.previousIndex === event.currentIndex) return;
+ <replaced with: false>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `module-tree.component.ts:44` in `onDrop`.

### `src/lib/instructor-role.guard.ts` — 1 surviving mutant

**Cluster 45** (lines 10): 1 mutant surviving — ConditionalExpression×1

```diff
- if (auth.currentUser() === undefined) {
+ <replaced with: true>
```

_Diagnosis._ The condition's outcome isn't observed. Add a test that drives both sides with distinguishing assertions.

_Recommended test._ Drive both sides of the conditional at `instructor-role.guard.ts:10`.

## Equivalent-mutant candidates

_None proposed._

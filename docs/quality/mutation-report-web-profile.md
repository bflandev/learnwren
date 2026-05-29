# Mutation Test Report — `libs/web-profile`

> Generated 2026-05-29T07:15:02.505Z

**Headline mutation score: 89.05%** (killed=252, survived=31, no-cov=0, ignored=0). Score on covered mutants only: 89.05%. Adjusted (equivalent candidates excluded): 89.05%.


Target band: unclassified.

## Per-file scores

| File | Score | Killed | Survived | No-Coverage |
|------|-------|--------|----------|-------------|
| `src/lib/profile-page/profile-page.component.ts` | 84.1% | 143 | 27 | 0 |
| `src/lib/picture/profile-picture-uploader.component.ts` | 94.3% | 33 | 2 | 0 |
| `src/lib/picture/profile-picture.service.ts` | 95.7% | 44 | 2 | 0 |
| `src/lib/email/email-change.service.ts` | 100.0% | 4 | 0 | 0 |
| `src/lib/email/email-changed/email-changed.component.ts` | 100.0% | 22 | 0 | 0 |
| `src/lib/password/password-change.service.ts` | 100.0% | 2 | 0 | 0 |
| `src/lib/profile.service.ts` | 100.0% | 4 | 0 | 0 |

## Survivor clusters — gaps to close

### `src/lib/profile-page/profile-page.component.ts` — 27 surviving mutants

**Cluster 1** (lines 22–23 — `confirmMatchesValidator()`): 2 mutants surviving — OptionalChaining×2

Sample mutation:
```diff
- const np = control.get('newPassword')?.value;
+ <replaced with: control.get('newPassword').value>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `profile-page.component.ts:22` in `confirmMatchesValidator`.

**Cluster 2** (lines 44–57 — `confirmMatchesValidator()`): 10 mutants surviving — ArrayDeclaration×4, StringLiteral×6

Sample mutation:
```diff
- displayName: ['', [Validators.maxLength(80)]],
+ <replaced with: []>
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `profile-page.component.ts:44` in `confirmMatchesValidator`. If it's a log message, classify as equivalent.

**Cluster 3** (lines 63–70 — `confirmMatchesValidator()`): 4 mutants surviving — StringLiteral×4

Sample mutation:
```diff
- currentPassword: ['', [Validators.required]],
+ <replaced with: "Stryker was here!">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `profile-page.component.ts:63` in `confirmMatchesValidator`. If it's a log message, classify as equivalent.

**Cluster 4** (lines 76 — `confirmMatchesValidator()`): 1 mutant surviving — ObjectLiteral×1

Sample mutation:
```diff
- { initialValue: this.passwordForm.controls.newPassword.value },
+ <replaced with: {}>
```

_Diagnosis._ An object literal could be replaced with `{}` and tests pass. The shape isn't asserted — only that something object-like is returned.

_Recommended test._ Assert on the array length / object shape returned at `profile-page.component.ts:76` in `confirmMatchesValidator`, not just truthiness.

**Cluster 5** (lines 84 — `confirmMatchesValidator()`): 1 mutant surviving — OptionalChaining×1

Sample mutation:
```diff
- return policy?.unmet?.map((r) => PASSWORD_REQUIREMENT_PROSE[r]) ?? [];
+ <replaced with: policy?.unmet.map>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `profile-page.component.ts:84` in `confirmMatchesValidator`.

**Cluster 6** (lines 111–114 — `applyEmailServerError()`): 3 mutants surviving — ConditionalExpression×1, OptionalChaining×2

Sample mutation:
```diff
- if (!(err instanceof HttpErrorResponse)) return;
+ <replaced with: false>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `profile-page.component.ts:111` in `applyEmailServerError`.

**Cluster 7** (lines 147–148 — `applyPasswordServerError()`): 4 mutants surviving — OptionalChaining×4

Sample mutation:
```diff
- const code = body?.error?.code;
+ <replaced with: body?.error.code>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `profile-page.component.ts:147` in `applyPasswordServerError`.

**Cluster 8** (lines 183 — `applyServerError()`): 2 mutants surviving — OptionalChaining×2

Sample mutation:
```diff
- if (body?.error?.code !== 'PROFILE_INVALID' || !body.error.details) return;
+ <replaced with: body?.error.code>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `profile-page.component.ts:183` in `applyServerError`.

### `src/lib/picture/profile-picture-uploader.component.ts` — 2 surviving mutants

**Cluster 9** (lines 22): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- readonly state = signal<UploaderState>('idle');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `profile-picture-uploader.component.ts:22`. If it's a log message, classify as equivalent.

**Cluster 10** (lines 46 — `onRemove()`): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- this.state.set('uploading');
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `profile-picture-uploader.component.ts:46` in `onRemove`. If it's a log message, classify as equivalent.

### `src/lib/picture/profile-picture.service.ts` — 2 surviving mutants

**Cluster 11** (lines 20): 1 mutant surviving — StringLiteral×1

Sample mutation:
```diff
- this.name = 'ProfilePictureError';
+ <replaced with: "">
```

_Diagnosis._ A string literal could be replaced with the empty string and tests still pass — the test doesn't assert on this value.

_Recommended test._ Add an assertion that pins the literal value at `profile-picture.service.ts:20`. If it's a log message, classify as equivalent.

**Cluster 12** (lines 65 — `if()`): 1 mutant surviving — OptionalChaining×1

Sample mutation:
```diff
- if (err instanceof HttpErrorResponse && err.error?.error?.code) {
+ <replaced with: err.error.error>
```

_Diagnosis._ Removing `?.` from an access didn't break tests — every test exercises the path where the parent exists. Add a case where the parent is null/undefined to lock in defensive access.

_Recommended test._ Add a test where the optional-chained parent is undefined / null at `profile-picture.service.ts:65` in `if`.

## Equivalent-mutant candidates (excluded from adjusted score)

_None._

## Caveats

- **Scope is per-lib Stryker config.** See `stryker.web-profile.config.mjs` for what gets mutated / excluded.
- **Coverage analysis is `perTest`.** Stryker only runs tests whose coverage hit the mutated line.
- **No-coverage mutants count against the raw score.** They reflect lines no test executes.
- **Equivalent classification is heuristic.** Review each candidate before treating the adjusted score as authoritative.

# Lesson Materials — Student Download (UC-04-02) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Project lesson materials into the existing `GET /api/learn/courses/:cid/lessons/:lid` response so enrolled students (and course owners) can see and download supplementary files from the lesson player at `/learn/:cid/:lid`. Closes the last MVP drift item (UC-04-02 for the student actor).

**Architecture:** Single projection field on `LessonView`. `LearnService` injects the already-public `MaterialsService.listForLesson` (filters READY + sorts) and maps each result to `LessonMaterialSummary` (id, displayName, extension, sizeBytes). UI renders a Materials section under the lesson body; per-row Download buttons hit the **already-correctly-guarded** `GET /api/materials/:matId/download-url` and `window.open` the signed URL in a new tab.

**Tech Stack:** TypeScript, NestJS 11, Angular 21 (standalone components, signals), Vitest, Playwright, Firebase emulator suite, pnpm + Nx.

**Spec:** `docs/superpowers/specs/2026-05-26-lesson-materials-student-download-design.md`

---

## Pre-flight

- [ ] **Step P1: Create the worktree (from local HEAD)**

The user's standing preference (see [[feedback_branch_isolation]], [[feedback_worktree_from_local_head]]): isolate feature work in a worktree branched from local HEAD (not origin — main is many commits ahead of origin).

```bash
git worktree add ../learnwren-uc-04-02 HEAD -b feat/lesson-materials-student-download
cd ../learnwren-uc-04-02
ln -s ../learnwren/node_modules node_modules
```

The `node_modules` symlink evades `.gitignore`'s `node_modules/` rule — **never `git add -A` from this worktree** (see [[feedback_worktree_node_modules_symlink]]).

If dispatching subagents into the worktree, every bash command must be prefixed `cd ../learnwren-uc-04-02 && pwd && …` — a single up-front `cd` does not survive across subagent tool calls (see [[feedback_subagent_worktree_guard]]).

- [ ] **Step P2: Verify baseline is green**

```bash
pnpm nx run-many -t lint,test,typecheck -p shared-data-models,api-courses,web-learn
```

Expected: all green. If anything is red, stop and investigate before changing code.

---

## Task 1: Add `LessonMaterialSummary` + `materials` field to `LessonView`

**Files:**
- Modify: `libs/shared-data-models/src/lib/lesson-view.ts`
- Modify: `libs/shared-data-models/src/lib/lesson-view.spec.ts`
- Check: `libs/shared-data-models/src/lib/material.ts` (re-export `MaterialId`, `SupportedMaterialExtension` — they already exist; no change needed)

- [ ] **Step 1.1: Write failing spec — materials on LessonView**

Add to `libs/shared-data-models/src/lib/lesson-view.spec.ts`:

```ts
import type { LessonMaterialSummary } from './lesson-view';

describe('LessonView (UC-04-02)', () => {
  it('carries a materials array of LessonMaterialSummary', () => {
    const view: LessonView = {
      course: { id: 'c1' as CourseId, title: 'T', status: 'PUBLISHED' },
      lesson: {
        id: 'l1' as LessonId,
        moduleId: 'm1' as ModuleId,
        title: 'L',
        videoId: null,
        videoState: null,
      },
      outline: { modules: [] },
      materials: [
        {
          id: 'mat1' as MaterialId,
          displayName: 'Worksheet.pdf',
          extension: 'pdf',
          sizeBytes: 1024,
        },
      ],
    };
    const m: LessonMaterialSummary = view.materials[0]!;
    expect(m.displayName).toBe('Worksheet.pdf');
  });

  it('allows empty materials array', () => {
    const view: LessonView = {
      course: { id: 'c1' as CourseId, title: 'T', status: 'PUBLISHED' },
      lesson: {
        id: 'l1' as LessonId,
        moduleId: 'm1' as ModuleId,
        title: 'L',
        videoId: null,
        videoState: null,
      },
      outline: { modules: [] },
      materials: [],
    };
    expect(view.materials).toEqual([]);
  });
});
```

- [ ] **Step 1.2: Run the failing spec**

```bash
pnpm nx test shared-data-models
```

Expected: typecheck failure ("Property 'materials' is missing in type 'LessonView'" and "Cannot find name 'LessonMaterialSummary'").

- [ ] **Step 1.3: Add the type and field**

In `libs/shared-data-models/src/lib/lesson-view.ts`, add **before** `LessonView`:

```ts
import type { MaterialId, SupportedMaterialExtension } from './material';

/**
 * Subset of a Material projected into LessonView for the student player.
 * Owner-only fields (originalFilename, contentType, storage, state,
 * createdAt, updatedAt, ownerInstructorId, lessonId, courseId) are
 * deliberately omitted — students don't need them; the signed download URL
 * carries the original filename via Content-Disposition.
 */
export interface LessonMaterialSummary {
  id: MaterialId;
  displayName: string;
  extension: SupportedMaterialExtension;
  sizeBytes: number;
}
```

Then add the field to `LessonView` (required, like `outline`):

```ts
export interface LessonView {
  course: { /* unchanged */ };
  lesson: { /* unchanged */ };
  progress?: { /* unchanged */ };
  outline: CourseOutline;
  /**
   * READY supplementary materials for this lesson, ordered by createdAt asc.
   * Empty array when the lesson has none. Same projection for owners and
   * enrolled students (UC-04-02).
   */
  materials: LessonMaterialSummary[];
}
```

Also re-export the new type from the lib's barrel: `libs/shared-data-models/src/index.ts` (check it — append `LessonMaterialSummary` to the existing `lesson-view` re-export if it uses named exports; if it re-exports the whole module, no change needed).

- [ ] **Step 1.4: Run the spec to verify it passes**

```bash
pnpm nx test shared-data-models
```

Expected: PASS.

- [ ] **Step 1.5: Typecheck the whole workspace**

```bash
pnpm nx run-many -t typecheck
```

Expected: existing call sites that construct a `LessonView` (test doubles in `api-courses` learn specs and `web-learn` lesson-player-page spec) will FAIL with "Property 'materials' is missing". Those failures are intentional and get fixed in Tasks 2/3/5. **Do not** add `materials: []` to those fixtures yet — that's the work of the next tasks.

- [ ] **Step 1.6: Commit**

```bash
git add libs/shared-data-models/src/lib/lesson-view.ts \
        libs/shared-data-models/src/lib/lesson-view.spec.ts \
        libs/shared-data-models/src/index.ts
git commit -m "feat(shared-data-models): add LessonMaterialSummary + materials on LessonView"
```

---

## Task 2: Project materials into LessonView in `LearnService`

**Files:**
- Modify: `libs/api-courses/src/lib/learn/learn.service.ts`
- Modify: `libs/api-courses/src/lib/learn/learn.service.spec.ts`

`MaterialsService.listForLesson(lid)` already filters to `state === 'READY'` and sorts by `createdAt` asc — `LearnService` just maps the result.

- [ ] **Step 2.1: Write the failing tests**

Append to `libs/api-courses/src/lib/learn/learn.service.spec.ts` (the existing `describe('LearnService', …)` block). Add a `MaterialsService` mock to the existing test setup (the file already mocks several services — follow the same pattern). If you can't find the existing mock pattern, the new mock looks like:

```ts
const materialsService = {
  listForLesson: vi.fn<(lid: LessonId) => Promise<Material[]>>(),
};
```

…and pass it as the new constructor arg to `new LearnService(videos, enrollment, courses, materialsService as any)`. Tests:

```ts
describe('UC-04-02 materials projection', () => {
  const baseMat = (over: Partial<Material> = {}): Material => ({
    id: 'mat1' as MaterialId,
    ownerInstructorId: 'instr1' as UserId,
    courseId: 'c1' as CourseId,
    lessonId: 'l1' as LessonId,
    displayName: 'Slides.pdf',
    originalFilename: 'slides.pdf',
    extension: 'pdf',
    contentType: 'application/pdf',
    sizeBytes: 1234,
    state: 'READY',
    storage: { bucket: 'b', objectPath: 'p' },
    createdAt: '2026-05-01T00:00:00.000Z' as ISODateString,
    updatedAt: '2026-05-01T00:00:00.000Z' as ISODateString,
    ...over,
  });

  it('projects materials returned by MaterialsService into LessonView', async () => {
    materialsService.listForLesson.mockResolvedValue([
      baseMat({ id: 'mat1' as MaterialId, displayName: 'A', sizeBytes: 1 }),
      baseMat({ id: 'mat2' as MaterialId, displayName: 'B', extension: 'docx', sizeBytes: 2 }),
    ]);
    // ... arrange owner/enrolment so the access check passes; reuse the existing fixture
    const view = await svc.getLessonView(ownerId, course, lesson);
    expect(view.materials).toEqual([
      { id: 'mat1', displayName: 'A', extension: 'pdf', sizeBytes: 1 },
      { id: 'mat2', displayName: 'B', extension: 'docx', sizeBytes: 2 },
    ]);
    expect(materialsService.listForLesson).toHaveBeenCalledWith(lesson.id);
  });

  it('returns materials: [] when the lesson has none', async () => {
    materialsService.listForLesson.mockResolvedValue([]);
    const view = await svc.getLessonView(ownerId, course, lesson);
    expect(view.materials).toEqual([]);
  });

  it('drops owner-only fields from each material', async () => {
    materialsService.listForLesson.mockResolvedValue([baseMat()]);
    const view = await svc.getLessonView(ownerId, course, lesson);
    const m = view.materials[0]!;
    // Only these keys
    expect(Object.keys(m).sort()).toEqual(
      ['displayName', 'extension', 'id', 'sizeBytes'],
    );
  });
});
```

- [ ] **Step 2.2: Run the failing tests**

```bash
pnpm nx test api-courses --testPathPattern=learn.service.spec
```

Expected: FAIL — `LearnService` constructor doesn't accept a fourth arg, `view.materials` is undefined, etc.

- [ ] **Step 2.3: Inject `MaterialsService` and add the projection**

Edit `libs/api-courses/src/lib/learn/learn.service.ts`:

1. Add to imports:

```ts
import type { LessonMaterialSummary, Material } from '@learnwren/shared-data-models';
import { MaterialsService } from '../materials/materials.service';
```

(Add `LessonMaterialSummary` and `Material` into the existing `@learnwren/shared-data-models` import line, not a duplicate import.)

2. Add the constructor arg (at the end of the existing constructor):

```ts
constructor(
  private readonly videos: VideoRepository,
  private readonly enrollment: EnrollmentRepository,
  private readonly courses: CoursesRepository,
  private readonly materials: MaterialsService,
) {}
```

3. In `getLessonView`, after the existing `const outline = await this.projectOutline(...)` line, project materials:

```ts
const materialRows = await this.materials.listForLesson(lesson.id);
const materials: LessonMaterialSummary[] = materialRows.map((m: Material) => ({
  id: m.id,
  displayName: m.displayName,
  extension: m.extension,
  sizeBytes: m.sizeBytes,
}));
```

4. Add `materials` to the returned object:

```ts
return {
  course: { /* unchanged */ },
  lesson: { /* unchanged */ },
  progress,
  outline,
  materials,
};
```

- [ ] **Step 2.4: Run the unit tests to verify they pass**

```bash
pnpm nx test api-courses --testPathPattern=learn.service.spec
```

Expected: PASS for the new cases.

- [ ] **Step 2.5: Commit**

```bash
git add libs/api-courses/src/lib/learn/learn.service.ts \
        libs/api-courses/src/lib/learn/learn.service.spec.ts
git commit -m "feat(api-courses): project lesson materials into LessonView (UC-04-02)"
```

---

## Task 3: Update remaining `LessonView` test fixtures

Task 1's typecheck pass surfaced existing fixtures that don't supply `materials: []`. This task plugs the holes mechanically — no behaviour change.

**Files (likely; verify by running typecheck first):**
- Modify: `libs/api-courses/src/lib/learn/learn.controller.spec.ts`
- Modify: `libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.spec.ts`
- Modify: `libs/web-learn/src/lib/learn.service.spec.ts` (if it constructs `LessonView` fakes)
- Modify any other `*.spec.ts` that builds a `LessonView` literal.

- [ ] **Step 3.1: Find all call sites that need updating**

```bash
pnpm nx run-many -t typecheck
```

Look for errors of the form `Property 'materials' is missing in type 'LessonView'`. Each one points to a fixture to update.

- [ ] **Step 3.2: Add `materials: []` to each fixture**

For each failing fixture, add `materials: []` next to `outline: …`. Example, in `lesson-player-page.component.spec.ts` a typical fake:

```ts
const view: LessonView = {
  course: { id: 'c1' as CourseId, title: 'T', status: 'PUBLISHED' },
  lesson: { /* … */ },
  progress: { completedAt: null, lastWatchedSeconds: 0 },
  outline: { modules: [] },
  materials: [],            // NEW
};
```

Do not change any assertion behaviour. If a spec helper builds the view, update the helper once (DRY) rather than each call site.

- [ ] **Step 3.3: Run typecheck across affected projects**

```bash
pnpm nx run-many -t typecheck
```

Expected: PASS. If any failures remain, repeat 3.2.

- [ ] **Step 3.4: Run the unit tests for the touched libs**

```bash
pnpm nx run-many -t test -p api-courses,web-learn
```

Expected: PASS.

- [ ] **Step 3.5: Commit**

```bash
git add libs/api-courses/src/lib/learn/learn.controller.spec.ts \
        libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.spec.ts \
        libs/web-learn/src/lib/learn.service.spec.ts
# add any others typecheck flagged
git commit -m "test: backfill materials: [] in existing LessonView fixtures"
```

---

## Task 4: Add `LearnService.requestDownloadUrl` (web-learn)

**Files:**
- Modify: `libs/web-learn/src/lib/learn.service.ts`
- Modify: `libs/web-learn/src/lib/learn.service.spec.ts`

The wire response shape is `MaterialDownloadUrlResponse = { downloadUrl: string; expiresAt: ISODateString }` (see `libs/shared-data-models/src/lib/wire.ts:31`). Import and use it.

- [ ] **Step 4.1: Write the failing tests**

Append to `libs/web-learn/src/lib/learn.service.spec.ts`:

```ts
import type { MaterialDownloadUrlResponse, MaterialId } from '@learnwren/shared-data-models';

describe('LearnService.requestDownloadUrl', () => {
  it('GETs /api/materials/:matId/download-url with credentials', async () => {
    const matId = 'mat-123' as MaterialId;
    const expected: MaterialDownloadUrlResponse = {
      downloadUrl: 'https://signed.example/...',
      expiresAt: '2030-01-01T00:00:00.000Z' as ISODateString,
    };
    const promise = svc.requestDownloadUrl(matId);
    const req = httpMock.expectOne(`/api/materials/${matId}/download-url`);
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBe(true);
    req.flush(expected);
    await expect(promise).resolves.toEqual(expected);
  });

  it('rejects with the HttpErrorResponse on 403', async () => {
    const matId = 'mat-x' as MaterialId;
    const promise = svc.requestDownloadUrl(matId);
    const req = httpMock.expectOne(`/api/materials/${matId}/download-url`);
    req.flush({ code: 'NOT_MATERIAL_OWNER' }, { status: 403, statusText: 'Forbidden' });
    await expect(promise).rejects.toMatchObject({ status: 403 });
  });
});
```

(`svc` and `httpMock` already exist in the spec's setup — match the existing pattern.)

- [ ] **Step 4.2: Run the failing tests**

```bash
pnpm nx test web-learn --testPathPattern=learn.service.spec
```

Expected: FAIL — `svc.requestDownloadUrl is not a function`.

- [ ] **Step 4.3: Implement the method**

Edit `libs/web-learn/src/lib/learn.service.ts`:

1. Update the type import to add `MaterialDownloadUrlResponse` and `MaterialId`:

```ts
import type {
  ISODateString,
  LessonView,
  MaterialDownloadUrlResponse,
  MaterialId,
} from '@learnwren/shared-data-models';
```

2. Add the method to the class (any position; put it next to `markLessonComplete`):

```ts
requestDownloadUrl(matId: MaterialId): Promise<MaterialDownloadUrlResponse> {
  return firstValueFrom(
    this.http.get<MaterialDownloadUrlResponse>(
      `/api/materials/${matId}/download-url`,
      { withCredentials: true },
    ),
  );
}
```

- [ ] **Step 4.4: Run the tests to verify they pass**

```bash
pnpm nx test web-learn --testPathPattern=learn.service.spec
```

Expected: PASS.

- [ ] **Step 4.5: Commit**

```bash
git add libs/web-learn/src/lib/learn.service.ts \
        libs/web-learn/src/lib/learn.service.spec.ts
git commit -m "feat(web-learn): add LearnService.requestDownloadUrl (UC-04-02)"
```

---

## Task 5: Materials section in `LessonPlayerPageComponent` (signals + click handler)

**Files:**
- Modify: `libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.ts`
- Modify: `libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.spec.ts`

UI scope and copy are fixed in §6 of the spec. Per-row state: `idle | preparing | error<'gone' | 'forbidden' | 'other'>`. Track with a `Map<MaterialId, RowState>` exposed as a `signal`.

- [ ] **Step 5.1: Write the failing component tests**

Append to `lesson-player-page.component.spec.ts`:

```ts
describe('UC-04-02 materials section', () => {
  it('renders one row per material with extension, displayName, sizeBytes, Download button', async () => {
    // arrange view with two materials
    const view: LessonView = makeReadyView({
      materials: [
        { id: 'mat-a' as MaterialId, displayName: 'Slides.pdf', extension: 'pdf', sizeBytes: 2_400_000 },
        { id: 'mat-b' as MaterialId, displayName: 'Notes.docx', extension: 'docx', sizeBytes: 12_345 },
      ],
    });
    learn.getLessonView.mockResolvedValue(view);
    await renderAndLoad();
    expect(query('[data-testid="lesson-materials"]')).toBeTruthy();
    expect(query('[data-testid="material-download-mat-a"]')).toBeTruthy();
    expect(query('[data-testid="material-download-mat-b"]')).toBeTruthy();
    expect(textOf('[data-testid="material-row-mat-a"]')).toContain('Slides.pdf');
    expect(textOf('[data-testid="material-row-mat-a"]')).toContain('2.3 MB'); // see formatter
  });

  it('hides the section when materials is empty', async () => {
    learn.getLessonView.mockResolvedValue(makeReadyView({ materials: [] }));
    await renderAndLoad();
    expect(query('[data-testid="lesson-materials"]')).toBeNull();
  });

  it('opens the signed URL in a new tab on Download click', async () => {
    learn.getLessonView.mockResolvedValue(makeReadyView({
      materials: [{ id: 'mat-a' as MaterialId, displayName: 'F.pdf', extension: 'pdf', sizeBytes: 1 }],
    }));
    learn.requestDownloadUrl.mockResolvedValue({
      downloadUrl: 'https://signed.example/F.pdf?token=…',
      expiresAt: '2030-01-01T00:00:00.000Z' as ISODateString,
    });
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    await renderAndLoad();
    await click('[data-testid="material-download-mat-a"]');
    expect(learn.requestDownloadUrl).toHaveBeenCalledWith('mat-a');
    expect(openSpy).toHaveBeenCalledWith(
      'https://signed.example/F.pdf?token=…',
      '_blank',
      'noopener',
    );
  });

  it('surfaces "no longer available" on 404 — sibling rows stay enabled', async () => {
    learn.getLessonView.mockResolvedValue(makeReadyView({
      materials: [
        { id: 'mat-a' as MaterialId, displayName: 'A.pdf', extension: 'pdf', sizeBytes: 1 },
        { id: 'mat-b' as MaterialId, displayName: 'B.pdf', extension: 'pdf', sizeBytes: 1 },
      ],
    }));
    learn.requestDownloadUrl.mockRejectedValue(
      new HttpErrorResponse({ status: 404, statusText: 'Not Found' }),
    );
    await renderAndLoad();
    await click('[data-testid="material-download-mat-a"]');
    expect(textOf('[data-testid="material-error-mat-a"]'))
      .toContain('This file is no longer available.');
    expect(query('[data-testid="material-download-mat-b"]')?.hasAttribute('disabled')).toBe(false);
  });

  it('surfaces "you no longer have access" on 403', async () => {
    learn.getLessonView.mockResolvedValue(makeReadyView({
      materials: [{ id: 'mat-a' as MaterialId, displayName: 'A.pdf', extension: 'pdf', sizeBytes: 1 }],
    }));
    learn.requestDownloadUrl.mockRejectedValue(
      new HttpErrorResponse({ status: 403, statusText: 'Forbidden' }),
    );
    await renderAndLoad();
    await click('[data-testid="material-download-mat-a"]');
    expect(textOf('[data-testid="material-error-mat-a"]'))
      .toContain('You no longer have access to this material.');
  });

  it('surfaces generic copy on other errors', async () => {
    learn.getLessonView.mockResolvedValue(makeReadyView({
      materials: [{ id: 'mat-a' as MaterialId, displayName: 'A.pdf', extension: 'pdf', sizeBytes: 1 }],
    }));
    learn.requestDownloadUrl.mockRejectedValue(
      new HttpErrorResponse({ status: 500, statusText: 'Server Error' }),
    );
    await renderAndLoad();
    await click('[data-testid="material-download-mat-a"]');
    expect(textOf('[data-testid="material-error-mat-a"]'))
      .toContain('Couldn\'t prepare the download. Try again.');
  });
});
```

(`makeReadyView`, `renderAndLoad`, `click`, `textOf`, `query` — match the existing spec helpers. If the spec doesn't already have a helper that takes `LessonView` overrides, add one in this task next to the existing fixture.)

- [ ] **Step 5.2: Run the failing tests**

```bash
pnpm nx test web-learn --testPathPattern=lesson-player-page.component.spec
```

Expected: FAIL (no materials markup, no handler).

- [ ] **Step 5.3: Add component state + click handler**

Edit `libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.ts`:

1. Type addition (top of file, after the existing `type PageState = …`):

```ts
type MaterialRowState =
  | { status: 'idle' }
  | { status: 'preparing' }
  | { status: 'error'; kind: 'gone' | 'forbidden' | 'other' };
```

2. Add to imports:

```ts
import type {
  CourseId, CourseOutline, ISODateString,
  LessonId, LessonView, MaterialId,
} from '@learnwren/shared-data-models';
```

3. Add the signal + computed (next to the other signals near the top of the class body):

```ts
readonly materialRowState = signal<Map<MaterialId, MaterialRowState>>(new Map());

rowState(id: MaterialId): MaterialRowState {
  return this.materialRowState().get(id) ?? { status: 'idle' };
}
```

4. Add the click handler (next to `onMarkComplete`):

```ts
async onDownloadMaterial(matId: MaterialId): Promise<void> {
  this.setRow(matId, { status: 'preparing' });
  try {
    const { downloadUrl } = await this.learn.requestDownloadUrl(matId);
    window.open(downloadUrl, '_blank', 'noopener');
    this.setRow(matId, { status: 'idle' });
  } catch (err) {
    const status = err instanceof HttpErrorResponse ? err.status : 0;
    const kind: 'gone' | 'forbidden' | 'other' =
      status === 404 ? 'gone' : status === 403 ? 'forbidden' : 'other';
    this.setRow(matId, { status: 'error', kind });
  }
}

private setRow(id: MaterialId, next: MaterialRowState): void {
  this.materialRowState.update((m) => {
    const copy = new Map(m);
    copy.set(id, next);
    return copy;
  });
}
```

5. Add a static helper near the top of the file (above the `@Component` decorator — keeps it pure and testable, no DI):

```ts
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
```

Expose it to the template by adding a reference in the class:

```ts
readonly formatBytes = formatBytes;
```

- [ ] **Step 5.4: Verify component tests still fail only on the template**

```bash
pnpm nx test web-learn --testPathPattern=lesson-player-page.component.spec
```

Expected: still FAIL — the template renders nothing for materials yet. Tests pass once Task 6 lands.

---

## Task 6: Add the materials section to the template

**Files:**
- Modify: `libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.html`

- [ ] **Step 6.1: Add the materials section under the existing `<article>`**

Insert this block in `lesson-player-page.component.html` **inside** the existing `@else if (view(); as v) { … }` branch, immediately after the closing `</section>` that wraps the mark-complete UI and before the `<a data-testid="back-to-course" …>` link:

```html
@if (v.materials.length > 0) {
  <section data-testid="lesson-materials" class="mt-6 rounded border p-4">
    <h2 class="text-lg font-semibold mb-3">Lesson materials</h2>
    <ul class="space-y-2">
      @for (m of v.materials; track m.id) {
        <li
          [attr.data-testid]="'material-row-' + m.id"
          class="flex items-center justify-between gap-4 rounded border p-3"
        >
          <div class="min-w-0 flex items-center gap-3">
            <span
              class="inline-flex shrink-0 items-center rounded bg-gray-100 px-2 py-1 text-xs font-medium uppercase text-gray-700"
            >{{ m.extension }}</span>
            <span class="truncate" [attr.title]="m.displayName">{{ m.displayName }}</span>
            <span class="shrink-0 text-xs text-gray-500">{{ formatBytes(m.sizeBytes) }}</span>
          </div>
          @if (rowState(m.id); as rs) {
            <button
              type="button"
              [attr.data-testid]="'material-download-' + m.id"
              class="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
              [disabled]="rs.status === 'preparing'"
              (click)="onDownloadMaterial(m.id)"
            >
              {{ rs.status === 'preparing' ? 'Preparing…' : 'Download' }}
            </button>
          }
        </li>
        @if (rowState(m.id); as rs) {
          @if (rs.status === 'error') {
            <li
              [attr.data-testid]="'material-error-' + m.id"
              class="rounded border border-red-300 bg-red-50 p-2 text-sm"
            >
              @if (rs.kind === 'gone') {
                This file is no longer available.
              } @else if (rs.kind === 'forbidden') {
                You no longer have access to this material.
              } @else {
                Couldn't prepare the download. Try again.
              }
              <button
                type="button"
                class="ml-2 underline"
                (click)="onDownloadMaterial(m.id)"
              >Retry</button>
            </li>
          }
        }
      }
    </ul>
  </section>
}
```

- [ ] **Step 6.2: Run the component spec to verify all UC-04-02 cases pass**

```bash
pnpm nx test web-learn --testPathPattern=lesson-player-page.component.spec
```

Expected: PASS for the six new cases. Existing cases (mark-complete, outline, etc.) untouched.

- [ ] **Step 6.3: Run the full web-learn suite + typecheck + lint**

```bash
pnpm nx run-many -t lint,test,typecheck -p web-learn
```

Expected: all green.

- [ ] **Step 6.4: Commit**

```bash
git add libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.ts \
        libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.html \
        libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.spec.ts
git commit -m "feat(web-learn): render lesson materials with per-row download (UC-04-02)"
```

---

## Task 7: API e2e — materials projection + student download

**Files:**
- Modify: `apps/api-e2e/src/materials.e2e-spec.ts`
- Modify: `apps/api-e2e/src/learn.e2e-spec.ts` (just add a single case, keep existing groupings)

The owner side already has e2e coverage. New coverage is the **student** + **withdrawn enrollee** matrix.

- [ ] **Step 7.1: Add learn.e2e cases**

In `apps/api-e2e/src/learn.e2e-spec.ts`, append:

```ts
describe('UC-04-02 — materials in LessonView', () => {
  it('returns READY materials and drops PENDING_UPLOAD ones', async () => {
    // arrange: course PUBLISHED, owner attaches two materials, only one completed
    const { ownerCookie, course, lesson } = await seedPublishedCourseWithLesson();
    const ready = await attachReadyMaterial(ownerCookie, course, lesson, 'A.pdf');
    await attachPendingMaterial(ownerCookie, course, lesson, 'B.pdf');

    // student enrols, fetches lesson view
    const { cookie: studentCookie } = await registerAndEnroll(course.id);
    const res = await api.get(`/api/learn/courses/${course.id}/lessons/${lesson.id}`)
      .set('Cookie', studentCookie);
    expect(res.status).toBe(200);
    expect(res.body.materials).toHaveLength(1);
    expect(res.body.materials[0]).toMatchObject({
      id: ready.id,
      displayName: 'A.pdf',
      extension: 'pdf',
    });
  });

  it('returns materials: [] when the lesson has none', async () => {
    const { course, lesson } = await seedPublishedCourseWithLesson();
    const { cookie } = await registerAndEnroll(course.id);
    const res = await api.get(`/api/learn/courses/${course.id}/lessons/${lesson.id}`)
      .set('Cookie', cookie);
    expect(res.body.materials).toEqual([]);
  });
});
```

(Use the existing helpers — `seedPublishedCourseWithLesson`, `attachReadyMaterial`, `registerAndEnroll`. If the helpers don't exist with those names, find the equivalents in `apps/api-e2e/src/_helpers/` or `fixtures/` and use them. Don't fabricate helpers.)

- [ ] **Step 7.2: Add materials.e2e cases for the student download path**

In `apps/api-e2e/src/materials.e2e-spec.ts`, append a new `describe('UC-04-02 — student download', …)`:

```ts
describe('UC-04-02 — student download', () => {
  it('an enrolled student on PUBLISHED can GET /materials/:id/download-url', async () => {
    const { ownerCookie, course, lesson } = await seedPublishedCourseWithLesson();
    const mat = await attachReadyMaterial(ownerCookie, course, lesson, 'F.pdf');
    const { cookie } = await registerAndEnroll(course.id);
    const res = await api.get(`/api/materials/${mat.id}/download-url`)
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.downloadUrl).toMatch(/^https?:/);
    expect(res.body.expiresAt).toEqual(expect.any(String));
  });

  it('a withdrawn enrollee gets 403 NOT_MATERIAL_OWNER', async () => {
    const { ownerCookie, course, lesson } = await seedPublishedCourseWithLesson();
    const mat = await attachReadyMaterial(ownerCookie, course, lesson, 'F.pdf');
    const { cookie } = await registerAndEnroll(course.id);
    await api.delete(`/api/enrollments/${course.id}`).set('Cookie', cookie).expect(204);
    const res = await api.get(`/api/materials/${mat.id}/download-url`).set('Cookie', cookie);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NOT_MATERIAL_OWNER');
  });

  it('the owner of an unpublished course can still download', async () => {
    // course stays DRAFT
    const { ownerCookie, course, lesson } = await seedDraftCourseWithLesson();
    const mat = await attachReadyMaterial(ownerCookie, course, lesson, 'F.pdf');
    const res = await api.get(`/api/materials/${mat.id}/download-url`).set('Cookie', ownerCookie);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 7.3: Compile-check the e2e**

```bash
pnpm nx typecheck api-e2e
```

Expected: PASS. Do not attempt to run `pnpm nx e2e api-e2e` in CI — no emulators available. Verify Playwright picks the new specs up:

```bash
pnpm nx e2e api-e2e --listFiles 2>&1 | grep -E 'materials|learn'
```

Expected: both files listed.

- [ ] **Step 7.4: Commit**

```bash
git add apps/api-e2e/src/materials.e2e-spec.ts apps/api-e2e/src/learn.e2e-spec.ts
git commit -m "test(api-e2e): student material download + materials projection (UC-04-02)"
```

---

## Task 8: Web e2e — materials surface on the learn page

**Files:**
- Modify: `apps/web-e2e/src/learn.spec.ts` (extend; don't create a parallel file)

- [ ] **Step 8.1: Add the e2e cases**

Append to `apps/web-e2e/src/learn.spec.ts`:

```ts
test('UC-04-02: student sees materials and can download', async ({ page, context }) => {
  // Seed via the helpers used elsewhere in this file (instructor login,
  // create course, attach a PDF material, publish, register student, enrol).
  const { courseId, lessonId } = await seedPublishedCourseWithReadyMaterial(page);
  await loginAsStudentAndEnrol(page, courseId);

  await page.goto(`/learn/${courseId}/${lessonId}`);

  await expect(page.getByTestId('lesson-materials')).toBeVisible();
  const downloadBtn = page.getByTestId(/^material-download-/);
  await expect(downloadBtn).toBeVisible();

  // Click opens a new tab with the signed URL.
  const popupPromise = context.waitForEvent('page');
  await downloadBtn.click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  // The download tab should resolve to a 2xx — the signed URL responds with the file.
  expect(popup.url()).toMatch(/^https?:/);
});

test('UC-04-02: section is absent when no materials', async ({ page }) => {
  const { courseId, lessonId } = await seedPublishedCourseWithLessonOnly(page);
  await loginAsStudentAndEnrol(page, courseId);
  await page.goto(`/learn/${courseId}/${lessonId}`);
  await expect(page.getByTestId('lesson-materials')).toHaveCount(0);
});
```

(Use the file's existing seeding helpers. If `seedPublishedCourseWithReadyMaterial` doesn't exist, compose it from the helpers in `apps/web-e2e/src/materials.spec.ts` and `apps/web-e2e/src/fixtures/` — same naming. Don't fabricate.)

- [ ] **Step 8.2: Compile-check**

```bash
pnpm nx typecheck web-e2e
pnpm nx e2e web-e2e --listFiles 2>&1 | grep learn
```

Expected: PASS; the spec is listed. Don't run e2e (no emulators).

- [ ] **Step 8.3: Commit**

```bash
git add apps/web-e2e/src/learn.spec.ts
git commit -m "test(web-e2e): student lesson page renders + downloads materials (UC-04-02)"
```

---

## Task 9: Reconcile docs (use case drift + README)

**Files:**
- Modify: `docs/use-cases/04-lesson-materials.md`
- Modify: `README.md`

- [ ] **Step 9.1: Flip the EP-04 DRIFT note**

Edit `docs/use-cases/04-lesson-materials.md`. Replace the existing `> [!NOTE] **DRIFT — …**` block at the top with:

```markdown
> [!NOTE]
> **STATUS: IMPLEMENTED (2026-05-26).** UC-04-01 (Attach Materials) and UC-04-02 (Download Materials) are both wired up. UC-04-02 ext 4a (auto-retry on expired URL) and ext 4b auto-removal of stale rows are deliberate scope cuts — see [the design spec](../superpowers/specs/2026-05-26-lesson-materials-student-download-design.md) §8. Per-row error copy + Retry handle these cases manually.
```

(Keep everything else in the file as-is.)

- [ ] **Step 9.2: Update the README EP-04 line**

Edit `README.md`. In the status callout near the top, replace the EP-04 bullet:

```markdown
> - **EP-04 Lesson materials** — attach / rename / remove supplementary files (PDF, DOCX, PPTX, XLSX, TXT, ZIP ≤ 50 MB each); owner downloads via short-lived signed URL.
```

with:

```markdown
> - **EP-04 Lesson materials** — attach / rename / remove supplementary files (PDF, DOCX, PPTX, XLSX, TXT, ZIP ≤ 50 MB each); owners **and enrolled students on PUBLISHED courses** download via short-lived signed URL; the learn page surfaces a materials list with per-row Download buttons.
```

Also update the "Not built yet" line if it still mentions UC-04-02:

```markdown
> Not built yet: module / course completion rollups (rest of EP-06), instructor dashboard (EP-07), platform administration (EP-08).
```

(unchanged — UC-04-02 was a drift item inside EP-04, not a "not built" headline). Verify by grepping `git grep -n "UC-04-02\|materials" README.md` — adjust any other stale mention.

- [ ] **Step 9.3: Add the new endpoint row to the README's EP-04 table**

In the README's existing **"The API endpoints exposed by EP-04 (lesson materials)"** table, the `GET /api/materials/:matId/download-url` row's "Purpose" cell currently says owner-gated. Update it to:

```markdown
| `GET`  | `/api/materials/:matId/download-url` | Mint a 15-minute signed download URL. Owner OR active enrollee on a PUBLISHED course. |
```

- [ ] **Step 9.4: Commit**

```bash
git add docs/use-cases/04-lesson-materials.md README.md
git commit -m "docs(ep-04): reconcile UC-04-02 student-download drift; update README"
```

---

## Task 10: Final verify + merge

- [ ] **Step 10.1: Run the full affected matrix**

```bash
pnpm nx affected -t lint,test,typecheck,build --base=main
```

Expected: all green. If the worktree's nx daemon serves stale `.d.ts` into the parent's `dist/out-tsc` (see [[feedback_worktree_dist_hazard]]), follow that memory's recipe — nuke `dist/out-tsc`, `NX_DAEMON=false`, retry.

- [ ] **Step 10.2: Regenerate the CRAP report**

`learn.service.ts` gained ~5 lines; the projection branch is straight-line so impact is minimal, but be honest about it.

```bash
pnpm crap
git status docs/quality/
```

If `docs/quality/crap-report*` changed, commit:

```bash
git add docs/quality/
git commit -m "chore(quality): regenerate CRAP report after UC-04-02 slice"
```

- [ ] **Step 10.3: Sanity-check the commit list**

```bash
git log --oneline main..HEAD
```

Expected (≈8–9 commits): shared-data-models → learn.service projection → fixture backfill → web-learn service → component logic + template → api-e2e → web-e2e → docs → CRAP. No `git add -A` (would pick up the `node_modules` symlink — see [[feedback_worktree_node_modules_symlink]]).

- [ ] **Step 10.4: Merge --no-ff back to main**

```bash
cd ../learnwren
git merge --no-ff feat/lesson-materials-student-download \
  -m "Merge feat/lesson-materials-student-download: student material downloads (UC-04-02)"
```

If anything in the worktree merges with conflicts on main, stop and apply the long-divergence merge lesson from [[ep06-slice-b-followups]] — `git merge --abort`, rebase/manually-resolve in the worktree, then retry.

- [ ] **Step 10.5: Clean up the worktree**

```bash
git worktree remove ../learnwren-uc-04-02
git branch -d feat/lesson-materials-student-download
```

- [ ] **Step 10.6: Record the slice in memory**

Save a new project memory `project_uc_04_02_student_download.md` capturing:
- Merge commit SHA.
- That this closes MVP scope (EP-01..EP-06).
- The two explicit scope cuts (auto-retry, auto-remove) with the rationale.
- Update `MEMORY.md` index with a one-liner.

---

## Self-review

**Spec coverage:**
- §5.1 wire shape ↔ Task 1 ✓
- §5.2 projection ↔ Task 2 ✓
- §5.3 download endpoint (no change) ↔ verified in Task 7 cases ✓
- §6.1 LearnService.requestDownloadUrl ↔ Task 4 ✓
- §6.2 materials section + per-row error states ↔ Tasks 5 + 6 ✓
- §7.1–7.4 testing ↔ Tasks 2, 5, 7, 8 ✓
- §7.5 e2e local posture ↔ called out in Task 7.3 + 8.2 ✓
- §8 deferred items ↔ docs reflect explicit scope cuts in Task 9.1 ✓
- §10 acceptance criteria ↔ each maps to an e2e in Task 7 / 8 ✓

**Placeholder scan:** No "TBD" / "fill in later"; all code shown inline; helpers explicitly named with a fallback ("if these helpers don't exist, find equivalents in …"). Acceptable for an existing codebase where the agent is expected to grep.

**Type consistency:**
- `requestDownloadUrl` returns `MaterialDownloadUrlResponse` ({ downloadUrl, expiresAt }) — same name in Task 4 spec, Task 4 impl, Task 5 component, Task 5 spec.
- `MaterialId` used consistently as the param type.
- `LessonMaterialSummary` declared in Task 1, consumed in Tasks 2, 3, 5, 6.
- `formatBytes` declared and re-exposed in Task 5; called in Task 6 template — name matches.

Everything lines up.

---

## Execution Handoff

Plan complete. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, two-stage review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session with checkpoints.

Which approach?

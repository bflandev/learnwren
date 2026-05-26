# Course Outline Panel — EP-06 Slice D Design Spec

> [!NOTE]
> **DOCUMENT STATUS: DRAFT**

**Status:** Draft (2026-05-25)
**Scope:** Fourth and final implementation slice of EP-06 (Learning Experience). Delivers **UC-06-04 (Navigate the Course Outline)**: an enrolled student on a lesson page sees a collapsible left sidebar listing every module and lesson in the course; the currently active lesson is highlighted; lessons the caller has completed render a checkmark; clicking a lesson navigates to it after flushing any in-flight playback position; lessons whose video is not yet `READY` are non-navigable and surface an inline notice.

This spec sits on top of:

- `2026-05-25-ep06-slice-c-resume-learning-design.md` (autosave plumbing, `LearnService.flushPosition` semantics, the `LessonView.progress.lastWatchedSeconds` slot).
- `2026-05-25-ep06-slice-b-mark-complete-design.md` (`LessonProgress.completedAt`, the `LessonEnrollmentGuard` / `LessonEnrollmentOrOwnerGuard` pair, the `LearnExceptionFilter`, the per-feature exception-filter convention).
- `2026-05-25-ep06-slice-a-student-playback-design.md` (the `learn/` submodule, `LearnService.getLessonView`, `LearnController` at `/api/learn/courses/:cid/lessons/:lid`, the `LessonView` interface, `LessonPlayerPageComponent`, the `LearnService` web wrapper).
- `2026-05-22-ep05-slice-b-enrolment-design.md` (the `enrollments` collection keyed by `${userId}__${courseId}`, `EnrollmentRepository.getEnrollment`, the `LessonProgress[]` slot preserved across `WITHDRAWN → ACTIVE`).

It reuses the existing `LearnExceptionFilter`, the `LessonEnrollmentOrOwnerGuard`, the per-feature exception-filter convention (per the memory `api-courses per-feature exception filters`), the `api-firebase` Firestore handle, the `fake-firestore.ts` test double, and the web "service-as-HTTP-wrapper" pattern (per the memory `Web service-as-HTTP-wrapper pattern`: the service returns a Promise, the component owns the signal state).

It introduces **no new Nx libraries**, **no new env vars**, **no new API routes**, **no new Firestore collections, indexes, or rules**, and **no new error codes**. The whole slice is a read-side projection plus one new Angular standalone component.

## Goal

A fresh clone, after `pnpm install` / `pnpm secrets:render` / `pnpm emulators` / `pnpm start`, must satisfy:

- The existing `GET /api/learn/courses/:cid/lessons/:lid` response includes an additive `outline` field listing every module in the course and every lesson within each module, in the order persisted by the EP-02 drag-and-drop editor. Each outline lesson row carries `{ id, title, videoState, completedAt }`. `videoState` mirrors the lesson doc (`null | UPLOADING | PROCESSING | READY | FAILED`). `completedAt` joins the caller's `enrollment.progress[]` by `lessonId`; for the course owner (no enrolment doc) and for enrolled callers with no row for a given lesson it is `null`.
- The lesson player page renders a collapsible left sidebar at viewports `≥1024 px` showing the outline. The sidebar starts expanded and toggles via a "Course outline" button in the page header; the collapse state is ephemeral (component-local signal, not persisted).
- Below `1024 px` the sidebar is replaced by a full-height drawer overlay that opens from the left and closes on backdrop click, `Escape`, or after a lesson is selected. The toggle button is visible at every breakpoint; the drawer starts closed on mobile.
- The currently active lesson row carries `aria-current="page"` and an `Active` visual treatment. Rows whose `completedAt != null` carry a `✓` glyph with `aria-label="Completed"`. Rows whose `videoState !== 'READY'` render dimmed with a `(processing)` suffix, carry `aria-disabled="true"`, and clicking them is a no-op that surfaces an inline notice ("This lesson's video is still being processed.") next to the row.
- Clicking a different `READY` lesson awaits `LearnService.flushPosition(cid, currentLid)` (the same call wired by Slice C's `pagehide` / `visibilitychange` handlers) and then navigates via `Router.navigateByUrl('/learn/${cid}/${nextLid}')`. If `flushPosition` rejects (transient network, in-tab revocation), the navigation still proceeds — autosave is best-effort by design and the destination page will re-evaluate access.
- Clicking the current lesson row is a no-op.
- The owner preview path renders the same outline component with no checkmarks (every `completedAt` is `null` for owners); the row click handler still flushes (a no-op for owners — there is no progress to save) and navigates.
- All Slice A / Slice B / Slice C authorization branches on `GET /api/learn/courses/:cid/lessons/:lid` are unchanged. The outline is computed inside the existing handler from data that is already loaded; no new reads, no new transactions.
- Reorder of modules / lessons in the editor between two GETs is reflected on the next page load; `completedAt` is keyed by `lessonId` so reorders preserve checkmarks. Lessons deleted in the editor disappear from the outline; orphan `LessonProgress` rows in the enrolment doc are ignored.
- All prior-spec quality gates pass: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e`. No regression in `api-auth`, `api-courses`, `web-auth`, `web-catalog`, `web-courses`, `web-video`, `web-enrollment`, `web-learn`.

## Non-Goals

Each is owned by a subsequent slice, another deferred work item, or is explicitly out of scope for UC-06-04.

- **Module-level completion indicators.** UC-06-02 ext 3a / 3b ("module is also shown as complete when all its lessons are") is deferred. Module headers render with no completion state in this slice.
- **"Course Completed" badge** on profile, course cards, or anywhere on the lesson page. Requires a My Courses dashboard.
- **Outline on `/catalog/:cid`** or any other surface. Only `/learn/:cid/:lid` hosts the outline.
- **Persistence of the collapse state across reloads / devices.** Component-local signal only.
- **A "Next lesson" CTA on lesson-complete.** Slice B explicitly deferred this; outline navigation is the only handoff between lessons in this slice.
- **Hover-preview, drag-reorder, keyboard chord shortcuts, search inside the outline.** Out of scope.
- **Bulk progress reads / cross-course outlines.** No new endpoint; the outline rides on the existing `LessonView`.
- **Eager server-side cleanup when a lesson is deleted.** The outline naturally drops missing lessons; orphan progress rows are ignored on read. Same posture as Slice C's `lastAccessedLessonId` fallback.
- **Watch-time aggregates, per-lesson "% watched" rendering in the outline.** Only `completedAt` is surfaced.
- **An unmark / reset-progress affordance.** Slice B chose one-way semantics; that decision stands.
- **Tackling the 14 quarantined `api-e2e` video fixmes.** The rest remain quarantined per `2026-05-23-fake-source-probe-seam-design.md`.

## Data Model

**No new collections, no new indexes, no new Firestore rules.** The outline is a pure projection over data already loaded by the existing `LearnService.getLessonView` handler: the course doc (modules + lessons + per-lesson `videoState`) and the caller's enrolment doc (`progress[]`).

`libs/shared-data-models/src/lib/lesson-view.ts` — extended:

```ts
export interface LessonView {
  course: { id: CourseId; title: string; status: CourseStatus };
  lesson: {
    id: LessonId;
    moduleId: ModuleId;
    title: string;
    description?: string;
    videoId: VideoId | null;
    videoState: VideoState | null;
  };
  progress?: {
    completedAt: ISODateString | null;
    lastWatchedSeconds: number;
  } | null;
  outline: CourseOutline;   // NEW — present on every response (owner + enrolled)
}

export interface CourseOutline {
  modules: Array<{
    id: ModuleId;
    title: string;
    lessons: Array<CourseOutlineLesson>;
  }>;
}

export interface CourseOutlineLesson {
  id: LessonId;
  title: string;
  videoState: VideoState | null;
  completedAt: ISODateString | null;
}
```

Field cardinality:

- `outline.modules[]` matches `course.modules[]` order. May be empty if a course is in `DRAFT` and the owner is previewing — Slice A already permits owners on `DRAFT`. Enrolled students cannot reach this state because publish-eligibility (`api-courses/.../publish`) requires at least one module with at least one `READY` lesson.
- `outline.modules[].lessons[]` matches the persisted lesson order. May be empty for owner-preview drafts.
- `outline.modules[].lessons[].videoState` is `null` when no video has been uploaded for the lesson yet (matches the existing `LessonView.lesson.videoState` cardinality).
- `outline.modules[].lessons[].completedAt` is `null` when the caller is the course owner OR the caller is enrolled but has no `LessonProgress` row for that `lessonId` OR has a row with `completedAt: null`. It is the persisted ISO string otherwise.

Backward compat: pre-Slice-D clients that ignore `outline` continue to work; the field is purely additive and the handler never omits it. Documents are unchanged.

## API Surface

### Existing endpoint — additive change

```
GET /api/learn/courses/:cid/lessons/:lid
  → 200 LessonView (now with outline)
```

Guards / filter unchanged: `@UseGuards(FirebaseSessionGuard, LessonEnrollmentOrOwnerGuard)`, `@UseFilters(LearnExceptionFilter)`.

`LearnService.getLessonView` already loads the course doc (to validate `cid → lesson` and to read `instructorId`) and the enrolment doc (to populate `progress`). The slice adds an in-memory projection step at the end of the handler:

```ts
function projectOutline(
  course: CourseDoc,
  enrollment: EnrollmentDoc | null,
): CourseOutline {
  const progressByLesson = new Map<LessonId, LessonProgress>();
  for (const row of enrollment?.progress ?? []) {
    progressByLesson.set(row.lessonId, row);
  }

  return {
    modules: course.modules.map((m) => ({
      id: m.id,
      title: m.title,
      lessons: m.lessons.map((l) => ({
        id: l.id,
        title: l.title,
        videoState: l.videoState ?? null,
        completedAt: progressByLesson.get(l.id)?.completedAt ?? null,
      })),
    })),
  };
}
```

Zero extra Firestore reads. Zero new transactions. The projection runs **after** the existing access check, so the outline is only sent to a caller who is already authorised to see the lesson detail.

### No new endpoints, no new error codes

The slice does not add any route, request body, header, or error code. The `LearnController` surface is unchanged. The `learn-error.codes.ts` and `learn.exception.ts` files are unchanged. The Slice C `position` endpoint is unchanged.

## Web — Lesson Player Page

### New standalone component

`libs/web-learn/src/lib/course-outline-panel/course-outline-panel.component.ts` (new). Standalone Angular component; not a new Nx lib. Sits next to `LessonPlayerPageComponent`, mirroring the codebase convention where a feature lib owns its panel components (cf. `web-enrollment`'s `CourseEnrollmentPanelComponent`).

Inputs:

- `outline: CourseOutline` — required.
- `activeLessonId: LessonId` — required.
- `courseId: CourseId` — required.
- `mode: 'sidebar' | 'drawer'` — required; controls whether the panel renders inline or as a fixed overlay with a backdrop.
- `outlineOpen: boolean` — two-way bound (paired with `outlineOpenChange: EventEmitter<boolean>` so Angular's `[(outlineOpen)]` works). The parent owns the canonical value.

Outputs:

- `lessonSelected: EventEmitter<LessonId>` — emitted when the caller clicks a row that is `READY` and is not the active lesson.
- `outlineOpenChange: EventEmitter<boolean>` — the change-emitter half of the `outlineOpen` two-way binding.

The component owns no service. It is a pure presentational component. Open/close state lives on the **parent** (the toggle button is in the page header, not in the panel) and is passed in as a two-way `[(outlineOpen)]` binding so the panel can flip it on `Escape`, backdrop click, or after a successful row click in drawer mode.

The only piece of state local to the panel is:

- `processingNoticeFor = signal<LessonId | null>(null)` — set when the caller clicks a non-`READY` row; the inline notice renders next to that row; cleared on next interaction. No toast service dependency.

Row rendering rules (single template, identical in sidebar + drawer):

- One section per module: `<h3>` with the module title, `<ol>` of lesson rows.
- Lesson row: `<button type="button">` with the lesson title; a `✓` glyph (with `aria-label="Completed"`) before the title when `completedAt != null`; `aria-current="page"` on the row whose `id === activeLessonId`; `aria-disabled="true"` and dimmed styling on rows whose `videoState !== 'READY'`.
- Click handler:
  - If row `id === activeLessonId`: no-op.
  - Else if `videoState !== 'READY'`: `processingNoticeFor.set(row.id)`; no emit.
  - Else: `lessonSelected.emit(row.id)`; on mobile, close the drawer.

The component does not call `Router` itself; navigation is the parent's responsibility, which keeps the flush-before-nav ordering testable in the parent.

### Parent wiring — `LessonPlayerPageComponent`

`libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.ts`:

- Already reads `LessonView` into a `lessonView = signal<LessonView | null>(null)` (or equivalent). Add a `computed` for `outline = computed(() => lessonView()?.outline ?? null)`.
- Add `outlineOpen = signal<boolean>(window.matchMedia('(min-width: 1024px)').matches)` — initialised from the current viewport. The parent owns this state and passes it to the panel via `[(outlineOpen)]`.
- Inject `Router`.
- Add an `onLessonSelected(nextLid: LessonId)` handler:

  ```ts
  async onLessonSelected(nextLid: LessonId): Promise<void> {
    const view = this.lessonView();
    if (!view) return;
    try {
      await this.learn.flushPosition(view.course.id, view.lesson.id);
    } catch (err) {
      console.warn('[learn] flushPosition rejected during outline nav', err);
    }
    await this.router.navigateByUrl(`/learn/${view.course.id}/${nextLid}`);
  }
  ```

  `flushPosition` is the same call Slice C's `pagehide` / `visibilitychange` handlers use; no new service method.

- Template: two-column grid at `≥1024 px` (Tailwind `lg:grid lg:grid-cols-[20rem_1fr]`), single column below; the `CourseOutlinePanelComponent` renders in the first column on desktop and as a drawer-overlay sibling on mobile (its template handles both modes off an `[mode]="'sidebar' | 'drawer'"` input — preferred to two separate components because the row markup is identical).
- A "Course outline" toggle button is rendered in the existing page header at every breakpoint. Its `aria-expanded` reflects `outlineOpen()` and its `aria-controls` points at the panel id. On click, it flips the signal.
- The desktop sidebar honours `outlineOpen()` by collapsing to a thin rail (icon-only) or by hiding the column entirely — pick "hide and let the player expand to full width" for the cleanest implementation; the toggle button is the only re-entry path. (Keeping a thin rail would force a third visual state, and UC-06-04 only describes two: visible and hidden.)
- The mobile drawer is `position: fixed`, `inset-y-0 left-0`, with a backdrop sibling and Tailwind transition classes. `Escape` and backdrop click both call `outlineOpen.set(false)`. Focus is trapped while open via the `cdkTrapFocus` directive from `@angular/cdk/a11y` (already a direct dependency in `package.json` at `~21.2.10`).
- On a successful navigation through `onLessonSelected`, the existing `lesson-player-page` route is re-entered with the new `:lid`; Angular's component re-uses are unchanged from Slice A/B/C; the new `LessonView` GET will deliver the updated outline (with the previous lesson's `completedAt` if it had been marked complete since the prior load).

### `LearnService` — no API change

No new methods. `flushPosition` already exists (Slice C). `getLessonView` already returns `LessonView`; the new `outline` field rides along with the existing typed return.

## Error Handling

All new behaviour shares the existing `LearnExceptionFilter`. No new error codes, no new exceptions.

- **Outline projection.** Pure in-memory transform of already-loaded docs. Cannot fail independently. If the underlying course/enrolment read fails, the whole response 5xxs as today.
- **Flush-before-nav rejection.** Swallowed and logged via `console.warn`; navigation still proceeds. This matches Slice C's best-effort autosave posture and avoids stranding the user on the prior lesson when the network blips at the moment of navigation.
- **In-tab revocation.** If the caller's enrolment is withdrawn elsewhere between page-load and the click, the destination page's `GET /api/learn/courses/:cid/lessons/:lid` returns 403 `NOT_ENROLLED_LESSON`; the existing Slice B/C `NOT_ENROLLED` page state takes over and the outline disappears with the rest of the player surface. No special-case branch in this slice.
- **Lesson deleted between outline load and click.** Server projects from the current course doc on every GET, so the outline reflects fresh state on each navigation. If a deletion races a click, the destination GET returns 404 `LESSON_NOT_FOUND`; the existing Slice A 404 page state takes over.
- **Course unpublished between outline load and click.** Existing Slice A guard rejects non-owners on `DRAFT`/`ARCHIVED`; the destination GET 403s; same fallback path.
- **`(processing)` click.** No API call is made. An inline notice renders next to the row; clicking any other row (or any other UI element) clears it.

## Accessibility

- The outline is `<aside aria-label="Course outline">`. Each module section is an `<h3>` followed by an `<ol>`. Lesson rows are `<button type="button">` elements.
- The active row carries `aria-current="page"`. The processing-state rows carry `aria-disabled="true"` (kept as `<button>` not `<a>` so they remain reachable and announceable; the click handler short-circuits).
- Completion glyph carries `aria-label="Completed"`. Active and completed states are not color-only — both also carry a glyph and a text marker.
- Drawer focus trap: focus moves into the drawer on open and returns to the toggle button on close. `Escape` closes the drawer. Backdrop click closes the drawer.
- The toggle button has `aria-expanded` and `aria-controls`.
- All interactive rows are reachable via Tab; the active row receives a visible focus ring (Tailwind `focus-visible:ring-2`).

## Testing

Each new piece of behaviour gets at least one test. The slice extends existing fixtures rather than introducing new ones.

### API (Vitest)

`libs/api-courses/src/lib/learn/learn.service.spec.ts` — extend:

- Enrolled student with two completions, three-lesson course → `outline` reflects all three rows, two with `completedAt`, one with `null`.
- Owner of a `DRAFT` course → `outline` reflects course structure with every `completedAt: null`.
- Lesson deleted from the course since the row was added → it disappears from the outline; orphan progress row is ignored without throwing.
- Module / lesson order matches the persisted order, even after a reorder simulated by mutating the fake-firestore doc.
- A lesson with `videoState: null` (no upload yet) and a lesson with `videoState: 'PROCESSING'` both surface their literal `videoState` value on the outline row.
- All Slice A/B/C access checks still pass (unauthenticated → 401, not-enrolled non-owner → 403 `NOT_ENROLLED_LESSON`, course DRAFT + non-owner → 403, lesson belongs to different course → 404 `LESSON_NOT_FOUND`).

### API-e2e

`apps/api-e2e/src/learn/learn.spec.ts` (or the existing closest sibling — extend, do not add a new file):

- Enrol a student, mark lesson A complete via `POST .../lessons/A/complete`, then `GET .../lessons/B` and assert `outline.modules[0].lessons` contains `{ id: A, completedAt: <ISO> }` and `{ id: B, completedAt: null }`. No new fixtures; reuse the seeded course from the existing learn e2e.

### Web — component (Vitest)

`libs/web-learn/src/lib/course-outline-panel/course-outline-panel.component.spec.ts` (new):

- Renders modules in order; renders lessons in order.
- Renders `✓` only on rows where `completedAt != null`.
- Active row carries `aria-current="page"` and a class matching the `Active` styling.
- `(processing)` rows are non-clickable; clicking emits no event and sets `processingNoticeFor` to the row id; the notice element appears in the DOM next to the row.
- Clicking a `READY` non-active row emits `lessonSelected` with the row's id.
- Clicking the active row is a no-op (no emission).
- Drawer mode: pressing `Escape` flips the bound `outlineOpen` signal to `false`; the parent reacts by hiding the drawer. The signal is exposed as an input (two-way `[(outlineOpen)]`) so the parent owns the canonical state and the toggle button stays in sync.
- Owner preview (every `completedAt: null`) renders no checkmarks; navigation still emits.

### Web — page integration (Vitest)

`libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.spec.ts` — extend:

- Receives a `LessonView` with an `outline`; passes it through to the panel.
- On `lessonSelected` from the panel: calls `LearnService.flushPosition(cid, currentLid)` exactly once, then `Router.navigateByUrl('/learn/${cid}/${nextLid}')` exactly once, in that order.
- If `flushPosition` rejects, navigation still happens; a `console.warn` is emitted; no error is surfaced to the user.

### Web-e2e (Playwright)

`apps/web-e2e/src/learn/*.spec.ts` — extend the existing student-playback spec rather than adding a new file:

- Open lesson A, mark complete, click lesson B in the outline (desktop viewport), assert URL changes to `/learn/${cid}/${B}`, assert the outline on the new page still shows the checkmark on lesson A.

Mobile drawer is covered by component unit tests only — no new e2e — to keep the suite lean, consistent with prior slices.

### Quality gates

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e` all green.
- No new env vars, no new Firestore rules, no new Nx libraries.

## Rollout

- Server change is additive on the `LessonView` response; old web clients ignore the new field.
- Web change ships in the same merge; the new component is only mounted on `/learn/:cid/:lid`.
- No migration script. No backfill. No feature flag — the outline is unconditional once shipped.
- `README.md`'s EP-06 bullet gets a Slice D line; `USER_GUIDE.md` gets a short "Course outline" subsection.

## Out-of-scope follow-ups

The following remain deferred and are explicitly **not** addressed by this slice:

- Module-level completion rollups (UC-06-02 ext 3a/3b).
- "Course Completed" badge surfaces on profile / course cards.
- My Courses dashboard / cross-course resume list (would be the natural home for module/course rollups).
- Outline on the public `/catalog/:cid` page.
- "Next lesson" CTA on lesson-complete (Slice B deferral; outline navigation now covers the lesson-to-lesson flow).
- The 14 quarantined `api-e2e` video fixmes.

EP-06 closes once this slice merges.

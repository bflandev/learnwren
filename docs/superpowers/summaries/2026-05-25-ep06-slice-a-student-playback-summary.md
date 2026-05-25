# EP-06 Slice A: Student Lesson Playback — Implementation Summary

**Date:** 2026-05-25
**Spec:** `docs/superpowers/specs/2026-05-25-ep06-slice-a-student-playback-design.md`
**Plan:** `docs/superpowers/plans/2026-05-25-ep06-slice-a-student-playback.md`

Ships UC-06-01 (Watch a Lesson Video) end to end in its minimal "player-only" form. An authenticated, enrolled student on a `PUBLISHED` course (or the course's owning instructor) clicks **Start Learning** on `/catalog/:cid`, lands on `/learn/:cid/:lid`, and watches the lesson video in the existing hls.js (`web-video`) player. A new `learn/` submodule in `libs/api-courses` exposes `GET /api/learn/courses/:cid/lessons/:lid` behind a course-scoped `LessonEnrollmentOrOwnerGuard`; a new `libs/web-learn` Angular library hosts the lesson page; the catalog course-detail page gains the CTA. Merged to `main` as `0778868` on 2026-05-25 (18 commits).

## What shipped

### NestJS (`libs/api-courses/src/lib/learn/`)

- `errors/learn-error.codes.ts` + `errors/learn.exception.ts` — `LearnException` base class with `LessonNotFoundException` (404 / `LESSON_NOT_FOUND`) and `NotLessonOwnerException` (403 / `NOT_LESSON_OWNER`). 2-case spec in `errors/learn.exception.spec.ts`.
- `learn.exception-filter.ts` — dedicated `@Catch(LearnException, AuthException, HttpException)` filter, mirroring the per-feature pattern used by `VideoExceptionFilter` and `MaterialsExceptionFilter`. 81-line spec covers shaped, validation, and unknown-error paths.
- `guards/lesson-enrollment-or-owner.guard.ts` — course-scoped guard keyed on `cid` + `lid`. Owners allowed regardless of `course.status`; enrolled students allowed only on `PUBLISHED`. Cross-course lessons, missing course, missing lesson, and missing params all collapse to `LESSON_NOT_FOUND` (the 404/403 oracle is deliberately fused). 276-line spec.
- `learn.service.ts` — pure mapper from guard-attached `{course, lesson}` to `LessonView`. Single `VideoRepository.getVideo` read when the lesson has a `videoId`; defensive fall to `videoState: null` on a missing video doc. 112-line spec covers READY, TRANSCODING, null-videoId, and orphan-videoId paths.
- `learn.controller.ts` — one route, `GET /api/learn/courses/:cid/lessons/:lid`, gated by `FirebaseSessionGuard` then `LessonEnrollmentOrOwnerGuard`. Filter applied via `@UseFilters(LearnExceptionFilter)`. 113-line spec covers 200, 401, 403, 404.
- `types/lesson-scoped-request.ts` — `AuthenticatedRequest` extended with `course` and `lesson` for the controller to read off the guard-attached request.
- `libs/api-courses/src/lib/courses.module.ts` — registers `LearnController`, `LearnService`, `LearnExceptionFilter`, and `LessonEnrollmentOrOwnerGuard`.

### Shared types (`libs/shared-data-models`)

- `lib/lesson-view.ts` — new `LessonView` interface (`course: {id, title, status}`, `lesson: {id, moduleId, title, description, videoId, videoState}`). Re-exported from the package index.
- `lib/catalog.ts` — `CatalogModuleOutline.lessons[]` widened from `{ title }` to `{ id, title }` so the Start Learning CTA can resolve the first lesson's id. `catalog.service.ts` mapping updated to include `l.id`; catalog spec assertions updated.

### Angular (`libs/web-learn` — new lib)

- Scaffolded via `@nx/angular:library` (standalone, vitest, ESLint flat config) with tags `scope:web` / `type:feature`. Path alias `@learnwren/web-learn` added to `tsconfig.base.json`.
- `lib/learn.service.ts` — Promise-returning HTTP wrapper (`getLessonView(courseId, lessonId): Promise<LessonView>`). The component owns the signal state, not the service (matches the established web-service pattern). 40-line spec with `HttpTestingController`.
- `lib/lesson-player-page/lesson-player-page.component.ts` — standalone, OnPush, route-input-bound `courseId` / `lessonId`. Drives a `PageState` discriminated state (`LOADING | READY | PROCESSING | NOT_ENROLLED | NOT_FOUND | LOAD_ERROR`), maps `HttpErrorResponse.status` (`403 → NOT_ENROLLED`, `404 → NOT_FOUND`) on load failure. Composes `<lw-video-player [manifestUrl]>` from `web-video` (manifest URL composed client-side as `/api/playback/manifest/{videoId}`). Has Retry on `LOAD_ERROR`, "← Back to course" links from every failure panel, "still being processed" panel for non-`READY` videos. 142-line spec.
- `lib/learn.routes.ts` — exports `learnRoutes` with `learn/:courseId/:lessonId`, `canActivate: [authGuard]`, lazy `loadComponent`.
- `apps/web/src/app/app.routes.ts` spreads `learnRoutes` alongside `catalogRoutes` and `coursesRoutes`. `withComponentInputBinding()` is already in `app.config.ts`, so route params hit the page as `input()` signals.

### Angular (`libs/web-catalog` — extension)

- `course-detail-page/course-detail-page.component.ts` — adds `firstLessonHref = computed(...)` (sorts modules by `order`, then lessons by `order`) and `canStartLearning = computed(...)` (`isOwner === true || enrollment?.status === 'ACTIVE'`). Template gains a primary CTA `<a routerLink>{{ firstLessonHref() }}</a>` labelled **Start Learning**, plus a disabled "No lessons yet" state for the enrolled-but-empty case. Six new test cases cover the visibility matrix (owner / enrolled / guest / unenrolled / empty / order-respecting).

### Tests

- `libs/api-courses` — added `learn/` specs: 9-case guard spec (276 lines), 5-case service spec, 4-case controller spec, 3-case exception-filter spec, 2-case exception spec. Catalog service spec updated for the lesson-id widening.
- `apps/api-e2e/src/learn.e2e-spec.ts` (new, 263 lines) — 8 scenarios: 200 enrolled, 403 unenrolled, 200 owner of DRAFT, 403 enrolled of DRAFT, 401 unauth, 404 cross-course, 404 missing lesson, 404 missing course.
- `apps/api-e2e/src/playback.e2e-spec.ts` — the previously `test.fixme`'d `'403 NOT_VIDEO_OWNER for a student (EP-06 widens this branch)'` (line ~128) is un-quarantined, renamed `'200 OK for an enrolled student on a PUBLISHED course'`, and now exercises the real `POST /api/enrollments` flow. Two sibling tests added: 403 after `POST /api/courses/:cid/unpublish`, 403 after `DELETE /api/enrollments/:cid`.
- `apps/web-e2e/src/learn.spec.ts` (new, 132 lines) — two scenarios: Start Learning happy-path (guest → register → enrol → click → URL + lesson title + `<video>` element present), and unauthenticated direct-URL redirect to `/login?redirect=...`.

### Documentation

- `README.md` — EP-06 Slice A bullet in the "what is wired up today" callout; `web-learn` row in the library/layout tables; learn endpoint row in the API table.
- `docs/USER_GUIDE.md` — feature-status row added; new section 2.14 "Watch a lesson" walks enrol → Start Learning → playback; the EP-06 deferred note in 2.13 updated.
- `docs/quality/spec-drift-report.md` — EP-06 flipped from Deferred to Partial; UC-06-01 marked Built (2026-05-25); UC-06-02/03/04 remain deferred; the stale `TODO(EP-06)` guard bullets dropped; the new `LessonEnrollmentOrOwnerGuard` noted.

## Plan deviations worth knowing about

- **`web-learn`'s `LearnService` is a Promise-returning HTTP wrapper, not a signal-of-`RemoteData<T>`.** The spec sketched `lessonView = signal<RemoteData<LessonView>>(...)` with `load(...)` writing to the signal. The implementation instead exposes `getLessonView(cid, lid): Promise<LessonView>` and leaves all state (`state: PageState`, `view: LessonView | null`) on the component. This matches the established web-service pattern (per the `Web service-as-HTTP-wrapper pattern` memo) and aligns with how `EnrollmentService` and `CatalogService` are shaped — keeping `RemoteData` on the component, not in the service.
- **`PageState` is a plain string-union, not a `RemoteData` `kind` discriminator.** The page uses `'LOADING' | 'READY' | 'PROCESSING' | 'NOT_ENROLLED' | 'NOT_FOUND' | 'LOAD_ERROR'` and switches the template on it. Equivalent expressive power; lines up better with the template's `@switch` style and how the `web-courses` and `web-catalog` components do it.
- **A dedicated `LearnExceptionFilter` ships, instead of folding `LearnException` into `CoursesExceptionFilter`.** Per the `api-courses per-feature exception filters` memo, each new `api-courses` submodule gets its own filter — the established pattern set by `VideoExceptionFilter`/`MaterialsExceptionFilter`. The spec's Task 3 step 6 suggested widening the shared filter's `@Catch(...)` list; the implementation chose the per-feature route instead.
- **`VideoPlayerComponent` was not modified.** Task 11 of the plan called for adding a `fatalError = output<void>()` and a "fatal-error swap" UX in the page. The existing player already surfaces errors via an internal `error` signal (`onFatalError: (msg) => this.error.set(msg)`), and the lesson page composes the player as-is. UC-06-01 ext 4a's "Unable to play video" panel is therefore rendered by the player itself, not by the page. No `web-video` files appear in the merge diff.
- **web-e2e file is `learn.spec.ts`, not `learn.e2e-spec.ts`.** Minor — the file name in the plan was `learn.e2e-spec.ts`, but the workspace's web-e2e convention is `*.spec.ts` (matches sibling files like `enrollment.spec.ts`).
- **Plan-projected `description` field absent from spec data model**: the `Lesson` entity in `shared-data-models` doesn't carry a `description` (only `title` + ordering metadata). The `LessonView.lesson.description` field was kept in the shared type but quickly demoted to optional in a follow-up commit (`1d4a933 fix(shared-data-models): make LessonView.description optional and drop lossy coercion`) once the mismatch was discovered. The Slice A merge itself shipped with the field present.

## Verification outcome

- Unit tests (`pnpm nx run-many -t test`): all green at merge. New specs: `learn.exception.spec.ts` (2), `learn.exception-filter.spec.ts` (3), `lesson-enrollment-or-owner.guard.spec.ts` (9), `learn.service.spec.ts` (5, api), `learn.controller.spec.ts` (4), `learn.service.spec.ts` (4, web), `lesson-player-page.component.spec.ts` (multiple cases, 142 lines), plus 6 new `course-detail-page` cases.
- Lint, typecheck, build all green.
- **api-e2e** — `apps/api-e2e/src/learn.e2e-spec.ts` (8 scenarios) committed; the un-quarantined `playback.e2e-spec.ts` widening test + two revocation siblings committed.
- **web-e2e** — `apps/web-e2e/src/learn.spec.ts` (2 scenarios) committed but **not run during landing** (per the EP-06 Slice A follow-ups memo: "e2e specs written but not yet run"). They are not in the quarantine list either; first execution lands with a later branch.
- The other 14 video `test.fixme`s in api-e2e remain quarantined (per the `api-e2e video quarantine` memo) — they still need the fake source-storage seam, out of scope for this slice. Slice A flipped exactly one of the 15.

## Follow-ups not in scope

Per spec §Non-Goals and the EP-06 follow-ups memo:

- **UC-06-02 — Mark Lesson Complete.** Shipped subsequently as EP-06 Slice B (`b854dcb`, 2026-05-25).
- **UC-06-03 — Resume / last-watched timestamp.** `LessonProgress.lastWatchedSeconds` not read or written; no "Continue Learning" affordance.
- **UC-06-04 — Course outline panel.** No collapsible sidebar, no next/prev lesson navigation. The lesson page only has "← Back to course".
- **Materials list on the lesson page.** Owners still download via the editor; `MaterialAccessGuard` already grants enrolled-student access at the API layer. Surfacing in the lesson UI lands with the outline-shaped slice.
- **Captions / subtitles** (UC-06-01 ext 5a) — depends on a subtitle-ingest pipeline that does not exist in EP-03.
- **Playback-position auto-save** (UC-06-01 step 6) — ships with UC-06-03.
- **Cover image upload** and the **My Courses / enrolled-courses dashboard** — separate EP-05 Slice B follow-ups.
- **Access revocation on unpublish / archive** beyond what `EnrollmentOrOwnerGuard` already enforces. The two new revocation tests in `playback.e2e-spec.ts` cover the existing behaviour; no new revocation behaviour was added.
- **The remaining 14 api-e2e video `test.fixme`s.** Quarantined pending the fake source-storage seam (`2026-05-23-fake-source-probe-seam-design.md`).

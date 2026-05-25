# Publish Gate (Slice D) — Implementation Summary

**Date:** 2026-05-20
**Spec:** `docs/superpowers/specs/2026-05-20-publish-gate-slice-d-design.md`
**Plan:** `docs/superpowers/plans/2026-05-20-publish-gate-slice-d.md`

Closes US-02-04 / UC-02-04 and finishes EP-03. An instructor can now transition a course through the `DRAFT → PUBLISHED → ARCHIVED → DRAFT` state machine via four verb endpoints plus a preview. Publish is gated server-side on per-lesson eligibility (every module has ≥ 1 lesson, every lesson has a `Video` whose `state === 'READY'`); failures come back as a structured `PublishBlockReason[]` rendered as an inline checklist below a new sticky publish bar in the course editor.

## What shipped

### NestJS (`libs/api-courses`)

- `libs/api-courses/src/lib/publish/publish-eligibility.ts` — pure `composeReasons(modules, lessonsByModule, videoStateById)`. Orders reasons by `moduleOrder` ASC then `lessonOrder` ASC; `COURSE_HAS_NO_MODULES` always alone; orphan `lesson.videoId` folds into `LESSON_HAS_NO_VIDEO` (not `…_NOT_READY`). 9 unit specs in `publish-eligibility.spec.ts`.
- `libs/api-courses/src/lib/publish/publish.service.ts` — `PublishService` with `computeEligibility`, `publish`, `unpublish`, `archive`, `restore`. The four transitions share a private `runStatusTransition(cid, from[], to, derivePatch)` helper that opens a Firestore transaction, asserts the source-state, runs the optional patch deriver (publish revalidates eligibility inside the txn via `computeEligibilityFor` and throws `PublishNotEligibleException` on failure), then calls `repo.updateStatusInTxn`. `loadVideoStateMap` dedupes `videoId`s, treats `VideoNotFoundException` as orphan → omitted from the map. 20 unit specs in `publish.service.spec.ts`.
- `libs/api-courses/src/lib/courses.repository.ts` — adds `getCourseInTxn`, `listModulesByCourseInTxn`, `listLessonsByModuleInTxn`, `updateStatusInTxn`. The status writer uses `admin.firestore.FieldValue.delete()` to clear `archivedAt` on restore.
- `libs/api-courses/src/lib/errors/courses.exception.ts` — three new exceptions, all HTTP 409: `InvalidTransitionException(currentState, requested)`, `PublishNotEligibleException(reasons[])`, `CourseArchivedException()`. New codes `INVALID_TRANSITION`, `PUBLISH_NOT_ELIGIBLE`, `COURSE_ARCHIVED` added to `courses-error.codes.ts`.
- `libs/api-courses/src/lib/courses.controller.ts` — five new routes under the existing `CoursesController` (auth chain unchanged: `FirebaseSessionGuard` + `InstructorRoleGuard` + `CourseOwnerGuard`):
  - `GET  /api/courses/:cid/publish-eligibility`
  - `POST /api/courses/:cid/publish`
  - `POST /api/courses/:cid/unpublish`
  - `POST /api/courses/:cid/archive`
  - `POST /api/courses/:cid/restore`
- `libs/api-courses/src/lib/courses.module.ts` — registers `PublishService` as a provider.

### Shared types (`libs/shared-data-models`)

- `Course` gains optional `publishedAt?: ISODateString` and `archivedAt?: ISODateString`. `publishedAt` is set on every `DRAFT → PUBLISHED` and preserved across unpublish + archive; `archivedAt` is cleared on restore.
- `libs/shared-data-models/src/lib/publish.ts` — exports the `PublishBlockReason` discriminated union (`COURSE_HAS_NO_MODULES` | `MODULE_HAS_NO_LESSONS` | `LESSON_HAS_NO_VIDEO` | `LESSON_VIDEO_NOT_READY`) and the `PublishEligibility` shape.

### Angular (`libs/web-courses`)

- `libs/web-courses/src/lib/publish/publish-eligibility.service.ts` — signal store (`eligibility`, `loading`, `lastError`) backed by an RxJS `Subject` with `debounceTime(500)`. `bindToCourse(cid)`, `refresh()`, `setEligibility(e)` (used to overwrite from a 409 response body).
- `libs/web-courses/src/lib/publish/course-publish-bar.component.{ts,html}` — sticky bar; per-state status pill (`DRAFT` / `PUBLISHED` / `ARCHIVED`) + primary action button + `⋯` menu. `Publish` and `Restore to draft` are confirm-less; `Unpublish…` and `Archive course…` open the existing EP-02 confirmation-dialog pattern. Awaits-and-disables on click; rebuilds the bar from the response course.
- `libs/web-courses/src/lib/publish/publish-eligibility-panel.component.{ts,html}` — collapsible checklist below the bar; visible only in `DRAFT`. Renders the structured reasons with `[Jump to module ▸]` / `[Jump to lesson ▸]` links per the §6.4 table (no link for `LESSON_VIDEO_NOT_READY` with currentState `UPLOADING`/`UPLOADED`/`TRANSCODING`/`PENDING_UPLOAD`; link for `FAILED`).
- `libs/web-courses/src/lib/courses.service.ts` — adds the five HTTP wrappers (`getPublishEligibility`, `publishCourse`, `unpublishCourse`, `archiveCourse`, `restoreCourse`).
- `libs/web-courses/src/lib/course-editor-page.component.ts` — mounts the bar above the existing tree, wires `publishEligibility.refresh()` into existing edit signals.

### One-line touch (`libs/web-video`)

- `libs/web-video/src/lib/video-state-badge.component.ts` — adds `readonly stateChanged = output<VideoState>()` emitted by `VideoStatePollingService` on each observed transition. Two new specs guard "emits on change" / "does not emit when unchanged". `LessonItem` forwards via its own output so the editor can re-trigger eligibility when a video becomes `READY`.

### Tests

- Unit / component: 9 (publish-eligibility) + 20 (publish.service) + 5 (publish-eligibility.service) + 14 (course-publish-bar) + 10 (publish-eligibility-panel) = 58 new specs across `api-courses` + `web-courses`.
- `apps/api-e2e/src/publish.e2e-spec.ts` — 15 tests covering eligibility branches (`COURSE_HAS_NO_MODULES`, `MODULE_HAS_NO_LESSONS`, `LESSON_HAS_NO_VIDEO`), auth + state-machine errors (401, 403 `NOT_COURSE_OWNER`, 404 `COURSE_NOT_FOUND`, 409 `COURSE_ARCHIVED`, 409 `INVALID_TRANSITION` for unpublish-on-DRAFT and restore-on-DRAFT, 409 `PUBLISH_NOT_ELIGIBLE`). Four are quarantined with `test.fixme` (happy-path round-trip, `LESSON_VIDEO_NOT_READY` with `TRANSCODING`, the `INVALID_TRANSITION` already-PUBLISHED case, and the concurrent-publish serialisation case) because each requires driving a video to `READY` — see Verification below.
- `apps/web-e2e/src/publish-gate.spec.ts` — three Playwright tests (DRAFT → PUBLISHED → DRAFT round-trip; publish disabled when a lesson has no video; archive + restore round-trip).

### Documentation

- `README.md` — status banner appended ("EP-03 slice D (course publish gate) complete…") and a new "API endpoints exposed by slice D" table.
- `docs/superpowers/specs/2026-03-27-mvp-use-cases-design.md` — UC-02-04 footnote updated to point at this spec.

## Plan deviations worth knowing about

- **Direct `VideoService` import, not the runtime `require('@learnwren/api-video')` seam.** The plan was written assuming `libs/api-video` would remain a peer library and that `api-courses → api-video` would stay off the Nx project graph via the slice-A `forwardRef(() => require(API_VIDEO_PKG).VideoService)` trick. In parallel with this slice the api-video library was folded into `libs/api-courses` (see `docs/superpowers/specs/2026-05-20-merge-api-video-into-api-courses-design.md`), so `publish.service.ts` imports `VideoService` and `VideoNotFoundException` directly from `../video/...`. The `VideoServiceLike` structural interface and the `isVideoNotFound` regex matcher described in the plan were dropped in favour of `e instanceof VideoNotFoundException`.
- **State-machine collapsed into a single `runStatusTransition` helper.** The plan called for four near-identical transaction bodies for `publish` / `unpublish` / `archive` / `restore`. Implementation extracts the read-source-state → guard → derive-patch → `updateStatusInTxn` loop into one private method; each public method becomes a one-liner. Recorded in commit `d3328db` ("refactor(api-courses): collapse publish.service state machine + reader") shortly after the initial landing.
- **`PublishService` was refactored to share `computeEligibilityFor(reader)` between the preview path and the in-transaction path.** The plan duplicated the eligibility computation in `computeEligibility` and `computeEligibilityInTxn`. The shipped code takes a `CourseShapeReader` interface so the txn / non-txn variants differ only by the reader closure; video reads remain non-transactional in both per spec §5.4.
- **`composeReasons` split into per-module + per-lesson helpers.** Commit `1a64422` ("refactor(api-courses): split composeReasons into per-module + per-lesson helpers") landed during the slice for readability; the function signature and contract from the spec are unchanged.
- **`PublishService.computeEligibility` was given a `makeFirestoreFake` test helper that was later removed.** Commit `aa8180c` deletes it after the refactor obviated the need for the in-process Firestore double.
- **`POST /publish` and `POST /upload-complete` were initially returning `204`; corrected to `200` with the updated course body** (commit `058cddc`, "fix(api-courses): return 200 from publish/upload-complete POST routes"). The spec called for 200 throughout.
- **Stryker `api-video.config.mjs` mutation surface was not re-homed into `api-courses` here.** Called out in the merge-api-video spec residual list, not in this slice.

## Verification outcome

- **Unit + component tests:** all green per the merge commit (`be9489f`): 117 unit/component tests for `libs/api-courses` + `libs/web-courses` + `libs/web-video`.
- **Mutation:** ≥ 85.71 % on the slice D surface, refreshed in `reports/mutation/api-courses/` and triaged in `docs/quality/mutation-report.md` (commit `c318c41`).
- **CRAP:** refreshed for the new `publish/` submodules (commit `61234f1`).
- **API e2e (`apps/api-e2e/src/publish.e2e-spec.ts`):** 11 of 15 tests run credential-free against the emulators (eligibility branches, auth + state-machine errors). 4 are `test.fixme`-quarantined because they drive a video to `READY`, which currently needs real GCP credentials. The quarantine reason matches the residual-issues list in `docs/superpowers/specs/2026-05-23-fake-source-probe-seam-design.md` (the fake source-probe seam un-quarantined the upload happy path; the fake-transcoder → `READY` chain is still broken in emulator mode).
- **Web e2e (`apps/web-e2e/src/publish-gate.spec.ts`):** 3 tests written; per the merge commit, e2e execution was blocked at landing time by a cross-slice build/serve infra issue (api-video parallel tsc race + the old forwardRef/require seam). Tests typecheck and compile; later commits (`680ccd0`, "use Playwright web-first assertion in publish-gate spec") stabilise them.
- **Post-landing follow-ups inside the git window** (2026-05-15 to 2026-05-25): `c022754` restyled the publish bar + panel; `f143a77` ("revoke playback + material access on unpublish/archive") tightened `EnrollmentOrOwnerGuard` and `MaterialAccessGuard` to check `course.status === 'PUBLISHED'` for enrolled students — closes a security-review MAJOR finding flagged after slice D shipped.

### Manual / live operations not yet executed

The spec's §12 acceptance bar item 4 (manual run-through against the real Firebase project: publish / unpublish / archive / restore with a real GCP-transcoded video, plus the two-tab race) is deferred until the fake-transcoder → `READY` seam lands. The four quarantined api-e2e tests will be un-quarantined at the same time.

## Follow-ups not in scope

Per spec §"Non-Goals" and the residual list:

- **Course catalogue / public listing** — EP-05 (subsequently shipped, but not by this slice).
- **Enrolled-student playback / retention semantics** — EP-06.
- **Editor lockout on `ARCHIVED`.** Editor remains fully editable on archived courses.
- **Hiding `ARCHIVED` courses from the instructor's own `/courses` list.**
- **`ARCHIVED → PUBLISHED` direct edge.** Instructor must restore to `DRAFT` first.
- **Audit log of state transitions.** `publishedAt` and `archivedAt` are the only persisted history.
- **Live cross-tab / cross-client sync.** Second tab learns about a transition only through `409 INVALID_TRANSITION` or manual refresh.
- **Optimistic UI.** Bar awaits the response before flipping the pill.
- **Denormalized `Course.publishReadiness` counters.** Walk-the-tree approach kept.
- **Undo affordance after archive.**
- **Email / in-app notifications on transitions** — slice E.
- **CSRF token rotation, rate-limiting, abuse controls** beyond what EP-02 provides.
- **Re-homing the `api-video` Stryker config** into `stryker.api-courses.config.mjs` after the api-video merge — tracked in the merge spec.

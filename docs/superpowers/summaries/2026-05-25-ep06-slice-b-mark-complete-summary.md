# EP-06 Slice B: Mark Lesson Complete — Implementation Summary

**Date:** 2026-05-25
**Spec:** `docs/superpowers/specs/2026-05-25-ep06-slice-b-mark-complete-design.md`
**Plan:** `docs/superpowers/plans/2026-05-25-ep06-slice-b-mark-complete.md`

Ships UC-06-02 in its minimal per-lesson form. An enrolled student on `/learn/:cid/:lid` clicks **Mark as Complete**; the API writes `completedAt` onto the matching `LessonProgress` entry of the caller's enrolment doc and the button swaps in place to a `✓ Completed on <date>` pill that persists across reload and across a `WITHDRAWN → ACTIVE` re-enrolment round-trip. The endpoint is idempotent at both the API surface and the storage layer. Owners previewing their own course see an "(Instructor preview — progress not tracked)" hint instead of the button. Merged to `main` as `b854dcb` on 2026-05-25.

## What shipped

### NestJS (`libs/api-courses/src/lib/learn/`)

- `errors/learn-error.codes.ts` + `errors/learn.exception.ts` — add `NOT_ENROLLED_LESSON` to the string-literal union and a `NotEnrolledLessonException` (extends `LearnException`, HTTP 403). Surfaces through the existing `LearnExceptionFilter` with no filter changes.
- `guards/find-lesson-in-course.ts` (new) — extracted helper that walks the course's modules and returns the first matching lesson. Called by both guards.
- `guards/lesson-enrollment-or-owner.guard.ts` — refactored to call the extracted helper; private method removed.
- `guards/lesson-enrollment.guard.ts` + spec (new) — owner-rejecting variant of the Slice A guard. Owner of any course → 403 `NOT_ENROLLED_LESSON`. Enrolled student + PUBLISHED → allow and attach `course` + `lesson` to the request. Anything else (DRAFT/ARCHIVED, non-enrolled, WITHDRAWN, missing cid/lid/course/lesson) → 403 or 404.
- `learn.controller.ts` — class-level `@UseGuards(FirebaseSessionGuard)` only; the second guard is now method-level (`LessonEnrollmentOrOwnerGuard` on the GET, `LessonEnrollmentGuard` on the POST). New `@Post('courses/:cid/lessons/:lid/complete')` decorated with `@HttpCode(200)` returns `{ completedAt }`.
- `learn.service.ts` — constructor now takes `EnrollmentRepository`. `getLessonView(userId, course, lesson)` gained the caller id and a `resolveProgress` helper that returns `null` for the owner, `{ completedAt: null }` for an enrolled student with no row, or `{ completedAt: <iso> }` when a row exists. New `markLessonComplete` delegates to the repository with a server-stamped ISO `now`.
- `enrollment/enrollment.repository.ts` — new `markLessonComplete` runs a single-doc Firestore transaction on `enrollments/{uid}__{cid}`. Appends a row when missing, sets `completedAt` when present-with-null, returns the prior ISO without writing when already complete (storage-layer idempotency). Throws `NotEnrolledException` on missing/`WITHDRAWN` docs. `lastWatchedSeconds` and unrelated rows are left intact. `144950b` narrows the `LessonProgress` row type to satisfy `noUncheckedIndexedAccess`.
- `courses.module.ts` — `LessonEnrollmentGuard` added alongside the existing providers; `EnrollmentRepository` already exported by EP-05 Slice B.

### Shared (`libs/shared-data-models`)

- `lib/lesson-view.ts` — adds the additive `progress?: { completedAt: ISODateString | null } | null` field. The field is optional (rather than required as the spec drafted it) — see deviations.

### Angular (`libs/web-learn/`)

- `lib/learn.service.ts` — new `markLessonComplete(courseId, lessonId): Promise<{ completedAt }>` HTTP wrapper. `getLessonView` also gains `withCredentials: true` to ensure the session cookie rides on the dev-server proxy.
- `lib/lesson-player-page/lesson-player-page.component.ts` — `completedAt` / `isOwnerPreview` are derived directly from `view()` rather than mirrored into separate signals (per `0cfd6f2`). New `markBusy` and `markError` signals own the in-flight POST state. `onMarkComplete()` classifies 403 → `'revoked'` and everything else → `'other'`. The generic-error banner's **Retry** button is `[disabled]` while `markBusy()` is true.
- `lib/lesson-player-page/lesson-player-page.component.html` — three mutually-exclusive branches under the player: `[data-testid="instructor-preview-hint"]`, `[data-testid="completed-pill"]` rendering `✓ Completed on {{ ts | date: 'mediumDate' }}`, or `[data-testid="mark-complete"]`. Adds the `[data-testid="mark-error-revoked"]` and `[data-testid="mark-error-other"]` banners.

### Tests

- `libs/api-courses` — extended `learn.service.spec.ts`, `learn.controller.spec.ts`, `learn.exception.spec.ts`, `enrollment.repository.spec.ts`; new `lesson-enrollment.guard.spec.ts`.
- `libs/web-learn` — extended `learn.service.spec.ts` and `lesson-player-page.component.spec.ts` (mark-complete render, click swap, revoked banner, other-error banner, busy disable).
- `apps/api-e2e/src/learn.e2e-spec.ts` — 15 tests total covering POST idempotency, GET reflecting `progress.completedAt`, 403 for owner, 403 after withdraw, persistence across re-enrol, 401 unauthenticated, 404 cross-course (commit `f7205d7`).
- `apps/web-e2e/src/learn.spec.ts` — 4 scenarios total, including mark-complete pill persistence across reload and the instructor-preview path (commit `93b7baf`).

### Documentation

- `README.md` — endpoints table gains `POST /api/learn/courses/:cid/lessons/:lid/complete`; the "what is wired up today" callout adds an EP-06 Slice B row.
- `docs/USER_GUIDE.md` — new §2.15 "Marking a lesson complete (EP-06 Slice B)".
- `docs/quality/spec-drift-report.md` — UC-06-02 transitions to `Built (2026-05-25)`; UC-06-03/04 remain deferred.
- The spec banner flips DRAFT → APPROVED (`0d7e2fc`).

## Plan deviations worth knowing about

- **`LessonView.progress` is optional, not required.** The spec drafted `progress: { completedAt: ISODateString | null } | null` as a required field; the shipped type is `progress?: ...`. `fa62341` ("make LessonView.progress optional to unblock CI") loosened it because existing fixtures and snapshot tests outside `web-learn` did not yet carry the field. Treated as additive; consumers default to undefined as "unknown / no progress data" and render the same as `null`.
- **Component derives `completedAt` / `isOwnerPreview` from `view()` rather than mirroring into separate signals.** Per `0cfd6f2`, the component drops the redundant signals the plan introduced and reads off the loaded `LessonView`; the only progress-related signal kept is the locally-mutable `completedAt` updated after a successful POST. Same observable behaviour, less state.
- **Retry button disabled while busy.** Per the same commit (`0cfd6f2`), the generic-error banner's Retry button gained `[disabled]="markBusy()"`. The plan did not call this out — added because rapid double-tap on Retry could otherwise queue concurrent POSTs.
- **Painful merge from long-divergence window.** The branch was rebased / merged into a `main` that had moved substantially during the slice's lifetime (mutation-testing baselines, video-controller fixes, CI repairs). The merge required a follow-up `144950b` to satisfy `noUncheckedIndexedAccess` on the `LessonProgress` row narrowing — flagged here because future EP-06 slices should expect similar churn while parallel testing/CI work continues to land.

## Verification outcome

- **Unit tests:** workspace `pnpm test` green pre-merge per the plan's Task 13 gate. New `lesson-enrollment.guard.spec.ts` covers 9 cases; `enrollment.repository.spec.ts` gains 6 `markLessonComplete` cases including the storage-layer idempotency assertion (no write, `updatedAt` unchanged).
- **Lint, typecheck, build:** all green before merge; `144950b` was the post-merge follow-up to satisfy `noUncheckedIndexedAccess`.
- **api-e2e:** `learn.e2e-spec.ts` extended to 15 tests; per the EP-06 Slice A memo and the worktree posture, the live e2e run was not executed during landing (see Slice B memory note: "e2e not run during landing"). Specs are committed and typecheck cleanly.
- **web-e2e:** `learn.spec.ts` extended with mark-complete + instructor-preview scenarios; also not run live during landing.
- **Manual:** the spec's emulator-mode acceptance criteria (button → pill, reload persistence, re-enrolment preservation, owner hint, idempotent click) match the implemented branches but were not formally walked through as part of the merge.
- **Quarantined / fixme'd:** unchanged. The 14 remaining api-e2e video fixmes are out of scope per `2026-05-23-fake-source-probe-seam-design.md`.

## Follow-ups not in scope

Per spec §"Non-Goals":

- **UC-06-03 (Resume / `lastWatchedSeconds`).** Slice C. The field is written as `0` on new rows here and otherwise left untouched. Spec draft already underway (`15552d6`).
- **UC-06-04 (Course-outline panel, per-lesson checkmark list, next/prev nav).** A later slice; module-completion and course-completion rollups (UC-06-02 ext 3) defer with it — there is no surface to render them against today.
- **"Course Completed" badge** on the My Courses dashboard — depends on dashboards that are still deferred.
- **Progress indicators on `/catalog/:cid`** ("X of Y lessons complete") — out of scope.
- **Unmark / `DELETE /complete`.** UC-06-02 is one-way; the pill is the terminal state from this slice's UI.
- **Owner playback progress.** Owners have no enrolment doc; the instructor preview path renders the player but no progress affordance.
- **Cross-course rollups, certificates, streaks, gamification.** Post-MVP.
- **Bulk mark-complete.** One lesson per POST.
- **Remaining 14 api-e2e video fixmes.** Tracked under the fake-source-probe seam spec.

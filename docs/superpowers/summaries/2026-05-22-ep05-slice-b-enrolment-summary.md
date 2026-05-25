# EP-05 Slice B: Course Enrolment — Implementation Summary

**Date:** 2026-05-22
**Spec:** `docs/superpowers/specs/2026-05-22-ep05-slice-b-enrolment-design.md`
**Plan:** `docs/superpowers/plans/2026-05-22-ep05-slice-b-enrolment.md`

Ships UC-05-04 (Enrol in a Course) and UC-05-05 (Unenrol from a Course) end to end. A logged-in student on a `PUBLISHED` course's `/catalog/:id` page can enrol and leave; the same record is re-used on re-enrol so progress is preserved across a `WITHDRAWN → ACTIVE` round-trip. Enrolment now also grants the two access guards (`EnrollmentOrOwnerGuard`, `MaterialAccessGuard`), feeds a `POPULAR` catalogue sort, and supports guest auto-enrol after login via a `redirect=/catalog/:id?enroll=1` round-trip. Merged to `main` as `cd2d456`.

## What shipped

### Shared models (`libs/shared-data-models`)

- `lib/enrollment.ts` — `ENROLLMENT_STATUSES = ['ACTIVE', 'WITHDRAWN']`, `EnrollmentStatus`, `LessonProgress`, an `Enrollment` interface (now with `status`, `progress`, `withdrawnAt`), and `EnrollmentStatusView` (`{ enrollment, isOwner }`).
- `lib/course.ts` — optional `enrollmentCount?: number` field.
- `lib/catalog.ts` — `CATALOG_SORT_OPTIONS` extended with `POPULAR`.

### NestJS (`libs/api-courses/src/lib/enrollment/`)

- `enrollment.repository.ts` — composite document ID `${userId}__${courseId}` via the exported `enrollmentId()` helper. Two `runTransaction` paths: `enroll` (creates ACTIVE / restores WITHDRAWN / idempotent no-op on ACTIVE; increments `Course.enrollmentCount`; throws `CourseNotAvailableException` if the course is missing or not `PUBLISHED`); `withdraw` (flips to WITHDRAWN, stamps `withdrawnAt`, decrements with `Math.max(0, n-1)`; throws `NotEnrolledException`). `isEnrolled()` is true only for ACTIVE; `getEnrollment()` returns any status or `null`.
- `enrollment.service.ts` — `enroll` does the advisory owner check (`CannotEnrollOwnCourseException`) and delegates; `unenroll` delegates; `getEnrollmentStatus` composes `{ enrollment, isOwner }` over `CoursesRepository.getCourse` + `EnrollmentRepository.getEnrollment`.
- `enrollment.controller.ts` — `@Controller('enrollments')` under `FirebaseSessionGuard` + `CoursesExceptionFilter`. `POST /` (body-derived courseId, session-derived uid, 201), `DELETE /:courseId` (204), `GET /:courseId` (200 with `EnrollmentStatusView`).
- `dto/enroll-course.dto.ts` — `class-validator` `@IsString @IsNotEmpty courseId`.
- `errors/courses-error.codes.ts` + `errors/courses.exception.ts` — three new codes/classes: `COURSE_NOT_AVAILABLE` (409), `CANNOT_ENROLL_OWN_COURSE` (409), `NOT_ENROLLED` (404).
- `courses.module.ts` — registers the new controller/service/repository and exports `EnrollmentRepository` so `VideoModule` and `MaterialsModule` (which both `forwardRef` `CoursesModule`) can inject it.
- `courses.service.ts` — `createCourse` now seeds `enrollmentCount: 0` so new courses carry the field from birth.
- `video/playback/enrollment-or-owner.guard.ts` and `materials/material-access.guard.ts` — `TODO(EP-06)` markers removed; both now grant access on `owner OR isEnrolled(uid, courseId)`.
- `catalog/catalog.service.ts` — `sortCourses` gains a `POPULAR` branch sorting by `(b.enrollmentCount ?? 0) - (a.enrollmentCount ?? 0)`, tie-broken by `compareNewest`.

### Angular (`libs/web-enrollment`)

- New Nx library (`@learnwren/web-enrollment`), Vitest. Exports `EnrollmentService` and `CourseEnrollmentPanelComponent` from `src/index.ts`.
- `lib/enrollment.service.ts` — `providedIn: 'root'` HTTP wrapper with `getEnrollmentStatus`, `enroll`, `unenroll`, each `firstValueFrom`-ing the matching endpoint.
- `lib/course-enrollment-panel/course-enrollment-panel.component.ts` — standalone, `OnPush`, `input.required<string>() courseId`, with a `PanelState` signal driving six states (`LOADING / GUEST / OWNER / ENROLLABLE / ENROLLED / LOAD_ERROR`). Owns the guest `/login?redirect=…?enroll=1` navigation, the `enroll=1` auto-enrol-after-login (strips the param with `replaceUrl`), the leave-course confirmation, and the `COURSE_NOT_AVAILABLE` → `/catalog` redirect.
- `lib/course-enrollment-panel/course-enrollment-panel.component.html` — `@switch`-driven control with the inline modal dialog carrying the UC-05-05 wording.

### Angular (`libs/web-catalog`, `libs/web-auth`)

- `course-detail-page.component.{ts,html}` — imports `CourseEnrollmentPanelComponent` and renders `<lib-course-enrollment-panel [courseId]="course()!.id" />` inside the page header.
- `login-page.component.ts` — `submit()` now honours `?redirect=/path` (same-origin paths only, `startsWith('/')`); falls back to `/dashboard`. Fixes a latent gap where `authGuard` already appended `redirect` but the login page ignored it.

### Rules

- `firestore.rules` and `firestore.emulator.rules` both gain an explicit `match /enrollments/{enrollmentId} { allow read, write: if false; }` block, consistent with every other collection.

### Tests

- Unit: `enrollment.repository.spec.ts`, `enrollment.service.spec.ts`, `enrollment.controller.spec.ts`, `dto/dto.spec.ts`, rewritten `enrollment-or-owner.guard.spec.ts` and `material-access.guard.spec.ts` (owner / enrolled-non-owner / non-enrolled-non-owner branches), updated `catalog.service.spec.ts` (POPULAR ordering, missing-count treated as 0), updated `courses.service.spec.ts` (enrollmentCount seed), updated `dto.spec.ts` (`TRENDING` is now the invalid example since POPULAR is valid), web-enrollment service + panel specs, and three new `login-page.component.spec.ts` cases (redirect honoured / absent / off-origin).
- `apps/api-e2e/src/enrollment.e2e-spec.ts` — full HTTP contract: enrol → status reflects ACTIVE with counter +1; unenrol → 204 → status WITHDRAWN; re-enrol restores; unpublished course → 409 `COURSE_NOT_AVAILABLE`; owner self-enrol → 409 `CANNOT_ENROLL_OWN_COURSE`; missing enrolment delete → 404; unauthenticated calls → 401. Plus two guard-wiring regressions over the material download-URL endpoint (enrolled student not-403 / non-enrolled non-owner 403).
- `apps/api-e2e/src/firestore-rules.e2e-spec.ts` — adds a deny-block assertion for the `enrollments` collection.
- `apps/api-e2e/src/catalog.e2e-spec.ts` — the previous "invalid sort" test now sends `sort=TRENDING` (POPULAR is valid).
- `apps/web-e2e/src/enrollment.spec.ts` — two journeys: logged-in enrol + leave; guest click-Enrol → login redirect → auto-enrol on return.

### Documentation

- `README.md` — EP-05 status line updated, new Slice B endpoint table, `web-enrollment` row added to the project table and monorepo layout, deferred-items note for the 90-day purge and unpublish-revocation.
- `docs/USER_GUIDE.md` — enrol / leave / guest auto-enrol section added.
- `docs/use-cases/05-course-discovery-and-enrollment.md` — drift banner updated; UC-05-01..05 implemented, POPULAR exists.

## Plan deviations worth knowing about

- **Web-e2e guest auto-enrol race after client-side nav (commit `1cc0143`).** The plan's Task 18 spec filled the email field as soon as `waitForURL(/\/login/)` matched; the URL flips before Angular finishes wiring the reactive form, so the value to `Email` is lost to a race with `formControlName` binding. The fix asserts the Sign-in button is in its initial disabled state before filling (a positive "form is mounted" signal) and that it becomes enabled before clicking. This is now memorialised in EP-05 Slice B follow-ups.
- **Repository test (commit `3cf9b72`) adds a "withdraw with a deleted course" case** that the plan didn't explicitly call out; documents the skip-counter-write branch when `courseSnap.exists` is false.
- **DTO test (commit `dc50a07`) renames the invalid-sort example to `TRENDING`** in `catalog/dto/dto.spec.ts` — a one-line follow-on of the POPULAR addition that the plan flagged but committed separately for clarity.

## Verification outcome

- Unit + lint + typecheck + build: green across all touched projects per the plan's Task 16 (`pnpm affected` + `pnpm test`).
- `pnpm nx e2e api-e2e`: the new `enrollment.e2e-spec.ts`, updated `firestore-rules.e2e-spec.ts`, and updated `catalog.e2e-spec.ts` pass against the emulator + API. The 15 quarantined video `test.fixme` cases remain skipped (still gated on real GCP credentials).
- `pnpm nx e2e web-e2e`: both enrolment journeys pass after the form-mount race was fixed in `1cc0143`.
- Manual production / live operations: none required for this slice — no new env vars, no new Firestore indexes, no first-time deploy steps. The rules change is deploy-safe (deny-by-default), but the actual `firebase deploy --only firestore:rules` against `learn-wren` is still a human-driven step inherited from the auth slice's follow-ups.

## Follow-ups not in scope

Per spec §Non-Goals:

- **The 90-day purge of `WITHDRAWN` enrolments.** Soft-delete and restore-on-re-enrol ship; the scheduled hard-delete does not. No scheduler infrastructure exists in the repo yet.
- **Access revocation when a course is unpublished after enrolment.** The guards grant `owner OR active enrolment` and do not additionally re-check `Course.status`. A student who enrolled while a course was `PUBLISHED` retains access if the instructor later unpublishes.
- **The lesson player and Continue Learning button.** Owned by EP-06. The Enrolled state shows a static "Enrolled" indicator and a Leave Course control — not a deep-link into the first lesson.
- **The "My Courses" / enrolled-courses dashboard.** Owned by EP-06; the detail page is the only surface that shows enrolment state.
- **Progress tracking.** EP-06 owns `LessonProgress`; this slice writes `progress: []` on new enrolments and preserves it across a `WITHDRAWN → ACTIVE` round-trip but never reads or mutates its contents.
- **The pre-existing `web-catalog` stale-response race** carried over from Slice A.

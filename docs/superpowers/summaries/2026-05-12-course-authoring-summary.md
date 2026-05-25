# Course Authoring — Implementation Summary

**Date:** 2026-05-12
**Spec:** `docs/superpowers/specs/2026-05-12-course-authoring-design.md`
**Plan:** `docs/superpowers/plans/2026-05-12-course-authoring.md`

Ships EP-02 US-02-01..03 (UC-02-01 Create Course, UC-02-02 Manage Modules, UC-02-03 Manage Lessons). A user promoted via the new `pnpm tools:promote-to-instructor <email>` CLI lands on `/courses`, creates a draft course, and walks a hydrated `Course → Module → Lesson` editor with inline rename, append, drag-drop reorder, and cascading delete. All Firestore I/O is mediated by `libs/api-courses` (deny-all rules from the client); the editor lives in the new `libs/web-courses` Angular feature library. Publish (US-02-04) is deferred to EP-03 Slice D.

## What shipped

### Shared data models (`libs/shared-data-models`)

- `lib/course.ts` adds the `COURSE_CATEGORIES` and `COURSE_DIFFICULTIES` constant tuples, the `CourseCategory` / `CourseDifficulty` string-literal unions, and three optional `Course` fields (`longDescription`, `category`, `difficulty`).
- `lib/lesson.ts` adds optional `description` and makes `videoUrl` optional (later swapped to `videoId` in EP-03 — out of scope here).

### NestJS (`libs/api-courses`)

- `courses.module.ts` — new `CoursesModule`, wired into `apps/api/src/app/app.module.ts` (commit `32e6726`).
- `errors/courses-error.codes.ts` + `errors/courses.exception.ts` — `CoursesErrorCode` union and seven exception classes (`InsufficientRoleException`, `NotCourseOwnerException`, `CourseNotFoundException`, `ModuleNotFoundException`, `LessonNotFoundException`, `StaleReorderException`, plus the base `CoursesException`).
- `courses.exception-filter.ts` — `@Catch()` filter mapping `CoursesException` and class-validator `BadRequestException` payloads into the existing `{ error: { code, message, details? } }` envelope; also forwards `AuthException` from `api-auth`.
- `dto/*.dto.ts` — `CreateCourseDto`, `UpdateCourseDto`, `CreateModuleDto`, `UpdateModuleDto`, `CreateLessonDto`, `UpdateLessonDto`, `ReorderDto` with class-validator decorators matching the spec's length and enumeration rules.
- `courses.repository.ts` — thin Firestore adapter for `courses/{cid}/modules/{mid}/lessons/{lid}`. Encodes the subcollection layout, generates branded IDs via `firestore.collection('_ids').doc().id`, runs `appendModule` and `appendLesson` inside a transaction to compute `order = siblings.size`, writes reorder via `WriteBatch` with a single course `updatedAt` touch, and uses `recursiveDelete` for course / module cascade.
- `reorder.util.ts` — `assertReorderSetMatches(currentIds, proposedIds)` raising `StaleReorderException` on length mismatch, duplicates, or unknown ids (one shared helper for module and lesson reorder).
- `courses.service.ts` — business logic for create / list / hydrated tree / patch / delete at all three levels, with explicit pre-fetch existence checks on patches and deletes so a since-deleted entity surfaces a structured 404 rather than a Firestore raw `NOT_FOUND`.
- `course-owner.guard.ts` — resolves `:cid` once, throws `CourseNotFoundException` / `NotCourseOwnerException`, and stashes the loaded course on `request.course` so handlers never re-fetch.
- `instructor-role.guard.ts` — originally lived here; hoisted to `libs/api-auth` on 2026-05-13 (commit `0af0a9e`) so EP-03's `api-video` could reuse it without an Nx graph cycle. `CoursesController` now imports `InstructorRoleGuard` from `@learnwren/api-auth`.
- `courses.controller.ts` — `@Controller('courses')` with `FirebaseSessionGuard` + `InstructorRoleGuard` applied at the class level and `CourseOwnerGuard` applied per-route on `:cid` paths. Twelve endpoints covering course / module / lesson CRUD plus the two reorder routes.

### Angular (`libs/web-courses`)

- `instructor-role.guard.ts` — `CanMatchFn` that reads `AuthService.currentUser`, refreshes the signal once when it is `undefined`, redirects unauthenticated to `/login` and non-instructor sessions to `/`. Prevents any flash of editor content.
- `courses.service.ts` — `HttpClient` wrapper exposing one Promise-returning method per API endpoint (`createCourse`, `listCourses`, `getCourseTree`, `updateCourse`, `deleteCourse`, plus the module and lesson families). All calls send `withCredentials: true`.
- `courses-list-page/` — empty-state CTA + populated draft list sorted by `updatedAt DESC`.
- `course-create-page/` — reactive form with client-side validators and a `fieldErrors` reconciliation on `400 VALIDATION_FAILED`; navigates to `/courses/:id/edit` on success.
- `course-editor-page/` — owns the hydrated `CourseTree` signal returned by `GET /api/courses/:cid` and mutates it locally on every operation.
- `components/course-meta-panel/` — inline edit of title, descriptions, category, difficulty; pessimistic `PATCH` on blur.
- `components/module-tree/` + `components/module-item/` — single `cdkDropList` over modules with inline rename and delete-with-confirm.
- `components/lesson-list/` + `components/lesson-item/` — per-module `cdkDropList`, deliberately not connected across modules (cross-module moves are a spec non-goal).
- `components/confirm-dialog/` — shared modal used by all three delete paths with the fixed per-entity copy from the spec.
- `courses.routes.ts` — `/courses`, `/courses/new`, `/courses/:id/edit`, all gated by `instructorRoleGuard`. Wired into `apps/web/src/app/app.routes.ts` (commit `c51ce94`).

### Rules

- `firestore.rules` and `firestore.emulator.rules` both add the explicit `match /courses/{courseId}` block with nested `modules` and `lessons` subcollection rules, all `allow read, write: if false` (commit `6461962`).

### Ops tooling

- `tools/promote-to-instructor.ts` — Admin-SDK script that refuses to promote unverified accounts, then sets the `role: 'INSTRUCTOR'` custom claim and the `users/{uid}.role` Firestore field. Logs the "sign out and back in" reminder because session cookies cache the old claim. Wired as `pnpm tools:promote-to-instructor` in `package.json`.

### Tests

- `libs/api-courses` — vitest specs for `courses.service`, `courses.controller`, `courses.repository`, `courses.exception-filter`, `course-owner.guard`, the DTO bundle, and the exception classes. Mutation-gap closers landed in `620ed63` (controller bodies, reorder content, description preservation, reorder validation) per the spec's ≥85% bar.
- `libs/web-courses` — component and service specs for the editor, list page, create page, the four drag-drop components, the confirm dialog, the HTTP wrapper, and the role guard.
- `apps/api-e2e/src/courses.e2e-spec.ts` and `firestore-rules.e2e-spec.ts` — full lifecycle (create, append, reorder, recursive delete) plus authorization, stale-reorder 409, 404 at each level, validation 400, and rules deny-all assertions for `courses/`, `modules/`, `lessons/` against student / instructor / anonymous principals.
- `apps/web-e2e/src/courses.spec.ts` — instructor walks the editor end-to-end; a STUDENT-role session is redirected away from `/courses/**` with no editor flash.

### Documentation

- `README.md` "Implementation status" gains the EP-02 line (commit `b3926dd`).
- `docs/quality/` — Stryker config for `api-courses` added (`1e355d0`); CRAP report extended to include the new libs.

## Plan deviations worth knowing about

- **`PATCH` endpoints return `{ ok: true }` instead of the spec §3.4 response shapes (`Course`, `Module`, `Lesson`).** The web editor already holds the hydrated tree in a signal and applies the diff locally on success, so the server payload was redundant. Status codes and error envelopes match the spec.
- **`InstructorRoleGuard` was hoisted from `libs/api-courses` to `libs/api-auth` on 2026-05-13 (commit `0af0a9e`), one day after the slice landed.** It was originally implemented inside `api-courses` per the plan (Task 7). The hoist was needed so EP-03's `libs/api-video` could `@UseGuards(InstructorRoleGuard)` without dragging `api-courses` into its Nx graph. `INSUFFICIENT_ROLE` and `InsufficientRoleException` were copied alongside it; `api-courses` re-exports nothing role-related anymore.
- **`libs/api-firebase` enabled `ignoreUndefinedProperties: true` on the Firestore handle (commit `f4b4630`) during the slice.** The spec's optional `Course` fields (`longDescription`, `category`, `difficulty`) and optional `Lesson.description` would otherwise have failed Firestore writes that omitted them. Discovered via the api-e2e lifecycle test, not the plan.
- **A late web-courses fix prevents a double-add when Enter triggers blur on a detached input** (commit `80d31d2`). Not anticipated by the plan; surfaced during manual editor walk-through.
- **Mutation testing closed gaps in a follow-up commit (`620ed63`)** rather than landing alongside the service in the original task sequence. The ≥85% bar from spec §8 was hit, just not in a single commit.

## Verification outcome

- Unit tests: `pnpm nx run-many -t test` green across `api-courses` (service, controller, repository, exception-filter, guards, DTOs, exceptions) and `web-courses` (list / create / editor pages, four drag-drop components, confirm dialog, HTTP service, role guard).
- Rules tests: `apps/api-e2e/src/firestore-rules.e2e-spec.ts` covers deny-all on the courses subtree against student, instructor, and anonymous principals via `@firebase/rules-unit-testing`.
- API e2e: `apps/api-e2e/src/courses.e2e-spec.ts` walks the full lifecycle plus the authorization, stale-reorder, 404, and validation paths against the Firestore emulator.
- Web e2e: `apps/web-e2e/src/courses.spec.ts` covers the instructor editor walk-through and the STUDENT redirect.
- Mutation: Stryker config for `api-courses` landed in `1e355d0`; the gap-closer commit `620ed63` brought the effective score to the ≥85% bar set by `api-auth`.
- Production promotion of a real user (`pnpm tools:promote-to-instructor <email>` against the live `learn-wren` project) is left to the human operator and not part of CI.

## Follow-ups not in scope

Per spec §"Non-Goals":

- **US-02-04 (Publish, Unpublish, Archive)** — shipped later as EP-03 Slice D (see `2026-05-20-publish-gate-slice-d-design.md`). `Course.status` stays `'DRAFT'` throughout this slice and the editor exposes no status controls.
- **Cover image upload** — folded into a later media-handling slice that builds on EP-03's Storage rules.
- **Cross-module lesson moves** — `cdkDropList`s for lessons are deliberately not connected across modules.
- **Multi-instructor collaboration / realtime sync / optimistic locking** — single-instructor authoring is the assumed use; reorder gets a 409 path, field updates are LWW.
- **Undo/redo, soft delete, audit log** — out of scope.
- **Self-service "request to become an instructor"** — promotion is ops-only via the CLI; an admin-driven flow belongs to EP-08.
- **Public catalogue / search** — owned by EP-05.
- **Course-level analytics, enrolment counts, completion stats** — EP-05 / EP-07.
- **Cloud Functions packaging of `apps/api`, Hosting deploys, SPA rewrites** — same deferral as prior specs.

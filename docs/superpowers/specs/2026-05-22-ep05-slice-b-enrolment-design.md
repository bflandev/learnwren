# Course Enrolment — EP-05 Slice B Design Spec

> [!NOTE]
> **DOCUMENT STATUS: DRAFT**
> This document is a living specification and is subject to change. All content is considered provisional until formally approved by project stakeholders.

**Status:** Draft (2026-05-22)
**Scope:** Second and final implementation slice of EP-05 (Course Discovery and Enrollment). Delivers the enrolment lifecycle end-to-end — **UC-05-04 (Enrol in a Course)** and **UC-05-05 (Unenrol from a Course)**. Extends the `Enrollment` and `Course` models in `shared-data-models`, adds an `enrollment/` submodule to `libs/api-courses` exposing the platform's first authenticated write surface for enrolment, wires the two access guards that have been waiting on an enrolment repository, completes the `POPULAR` catalogue sort, and adds a new `libs/web-enrollment` Angular library that puts an enrol/leave panel on the course detail page.

This spec sits on top of:

- `2026-05-22-course-discovery-slice-a-design.md` (EP-05 Slice A — the public `catalog/` submodule, the `web-catalog` library, the `CourseDetailPageComponent` this slice adds an enrolment panel to, and the `CATALOG_SORT_OPTIONS` const that `POPULAR` joins).
- `2026-05-12-course-authoring-design.md` (EP-02 — the `Course → Module → Lesson` hierarchy, `CoursesController`, `CoursesService`, `CoursesRepository`, `CoursesExceptionFilter`, the courses error envelope).
- `2026-05-20-publish-gate-slice-d-design.md` (EP-03 slice D — the `Course.status` state machine; `'PUBLISHED'` is the sole gate on whether a course can be enrolled in).
- `2026-05-14-video-playback-slice-c-design.md` and `2026-05-21-lesson-materials-design.md` (the `EnrollmentOrOwnerGuard` and `MaterialAccessGuard`, each carrying a `TODO(EP-06)` marker that this slice resolves).
- `2026-05-04-auth-registration-and-login-design.md` / `2026-05-06-auth-hardening-design.md` (the `FirebaseSessionGuard`, `AuthenticatedRequest`, the signal-based web `AuthService`, and the login page's `redirect` query-param contract).

It reuses the existing `CoursesExceptionFilter` + error envelope, the `api-firebase` Firestore handle, the `fake-firestore.ts` test double, the signal-based Angular service pattern, and the established slice testing posture. It introduces **one new library** (`web-enrollment`) with **four new Nx graph edges** (`web-enrollment → shared-data-models`, `web-enrollment → web-auth`, `web-enrollment → web-ui`, `web-catalog → web-enrollment`), **no new env vars**, and **no new Firestore indexes**. It adds **one Firestore rules block** (an explicit deny for the new `enrollments` collection). The public `CourseCatalogDetail` read-model is **unchanged** — ownership is resolved through the new authenticated enrolment-status endpoint, so no instructor UID is exposed on the public catalogue payload.

## Goal

A fresh clone, after `pnpm install` and `pnpm secrets:render`, running `pnpm emulators` + `pnpm start`, must satisfy:

- An **authenticated student** on a `PUBLISHED` course's detail page (`/catalog/:id`) sees an **Enrol** button. Clicking it enrols them, and the page re-renders to an **Enrolled** state showing an enrolled indicator and a **Leave Course** action.
- Enrolling increments the course's `enrollmentCount` by exactly one. Clicking Enrol again (double-submit, or a stale tab) does **not** increment it a second time.
- A **guest** (not logged in) clicking **Enrol** lands on `/login`; after a successful login they return to the course detail page and the enrolment completes automatically, with no second click.
- An authenticated student already enrolled sees the **Enrolled** state, not the Enrol button.
- Clicking **Leave Course** shows a confirmation dialog with the UC-05-05 wording; confirming unenrols them (the page returns to the **Enrol** state) and decrements `enrollmentCount`; cancelling changes nothing.
- Unenrolling then re-enrolling within the retention window restores the previous enrolment record — including its (EP-06-owned) `progress` array — rather than creating a fresh one.
- The catalogue offers a **Most Popular** sort that ranks `PUBLISHED` courses by `enrollmentCount` descending.
- An **enrolled student** can reach the video-playback and material-download endpoints for that course (the two access guards now grant `owner OR active enrolment`); a non-enrolled, non-owner user still gets `403`.
- The three enrolment endpoints reject unauthenticated callers with `401`. Direct client read/write of the `enrollments` collection is denied by Firestore rules.
- All prior-spec quality gates pass: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e`. No regression in `api-auth`, `api-courses`, `web-auth`, `web-catalog`, `web-courses`, or `web-video`.

## Non-Goals

Each is owned by a subsequent epic or is a deliberate, documented deferral:

- **The lesson player and the "Continue Learning" button.** EP-06. UC-05-04 step 6 ("redirect to the first lesson") and UC-05-04 ext 3a ("display Continue Learning") both depend on a working lesson player and the last-accessed-lesson record (UC-06-03), which do not exist. In this slice, **enrolling lands the student back on the course detail page in its Enrolled state**, and the Enrolled state shows a static "Enrolled" indicator — not a "Continue Learning" link.
- **The "My Courses" / enrolled-courses dashboard.** EP-06. UC-05-04's "the course appears in the student's enrolled courses list" surfaces there. This slice adds no dashboard list; the detail page is the only place enrolment state is shown.
- **The 90-day retention purge job.** Soft-delete and restore-on-re-enrol ship in this slice; the scheduled hard-delete of `WITHDRAWN` enrolments older than 90 days does **not**. There is no scheduler infrastructure in the repo, and the precedent (`tools/migrate-auth-2026-05-cleanup-unverified.ts`) is a manually-run script. The purge is a named follow-up.
- **Progress tracking.** EP-06 owns `LessonProgress`. This slice writes `progress: []` on every new enrolment and preserves whatever array exists across a `WITHDRAWN → ACTIVE` round-trip, but never reads or mutates its contents.
- **Access revocation on course unpublish.** The wired guards grant access on `owner OR active enrolment`; they do not additionally re-check `Course.status`. A student who enrolled while a course was `PUBLISHED` retains access if the instructor later unpublishes it. This matches the existing guard scope (the video guard only checks video `READY` + ownership today) and is a known, deferred limitation.
- The pre-existing `web-catalog` stale-response race (see the EP-05 Slice A follow-ups) is not addressed here.

## Data Model

### `Enrollment` (extend `libs/shared-data-models/src/lib/enrollment.ts`)

The existing `Enrollment` interface is a forward declaration with no behaviour behind it. Two fields are added:

```ts
import type { CourseId, EnrollmentId, ISODateString, LessonId, UserId } from './common';

export interface LessonProgress {
  lessonId: LessonId;
  completedAt: ISODateString | null;
  lastWatchedSeconds: number;
}

/** ACTIVE = enrolled; WITHDRAWN = soft-deleted, progress retained for re-enrol. */
export const ENROLLMENT_STATUSES = ['ACTIVE', 'WITHDRAWN'] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export interface Enrollment {
  id: EnrollmentId;          // deterministic composite — see "Storage" below
  userId: UserId;
  courseId: CourseId;
  status: EnrollmentStatus;          // NEW
  progress: LessonProgress[];        // EP-06-owned; always [] in Slice B, preserved across re-enrol
  withdrawnAt: ISODateString | null; // NEW — stamped on unenrol, cleared (null) on enrol/re-enrol
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** Response of GET /api/enrollments/:courseId — the caller's state for one course. */
export interface EnrollmentStatusView {
  enrollment: Enrollment | null; // the caller's enrolment (any status), or null
  isOwner: boolean;              // true when the caller is the course's instructor
}
```

`EnrollmentStatus` follows the project's string-literal-union convention (per `2026-04-29-initial-nx-monorepo-design.md` §4). The `ENROLLMENT_STATUSES` const is exported so DTO validation can reference it. `enrollment.ts` is already re-exported from `shared-data-models/src/index.ts`; no index change is needed.

### `Course` (extend `libs/shared-data-models/src/lib/course.ts`)

One field is added:

```ts
export interface Course {
  // ... existing fields ...
  enrollmentCount?: number; // NEW — count of ACTIVE enrolments; absent on pre-Slice-B docs
}
```

The field is **optional**: courses created before this slice do not carry it, and the type reflects that honestly rather than forcing a data migration. Every read treats a missing value as `0` (`course.enrollmentCount ?? 0`). Making it optional also means no existing `Course` construction site (production or test) needs to change.

The counter is maintained by a **read-modify-write of the `Course` document inside the same Firestore transaction** as the enrolment write — both the enrol and unenrol transactions already read the course document, so the counter update is atomic and conflict-safe without `FieldValue.increment` (which the `fake-firestore` test double does not model). The decrement floors at `0` (`Math.max(0, n - 1)`).

**No data migration.** The first enrol against a pre-Slice-B course reads its count as `0` and writes `1`. New courses created after this slice are seeded with `enrollmentCount: 0` by `CoursesService.createCourse` so the field is present from birth.

### Storage — the `enrollments` collection

A new **top-level `enrollments` collection**. Each document's ID is the deterministic composite **`${userId}__${courseId}`** (double underscore separator; both halves are branded ID strings with no embedded `__`). The `Enrollment.id` field holds the same composite string, cast to `EnrollmentId`.

Consequences of the composite ID, all of which the design relies on:

- `(user, course)` uniqueness is **structural** — at most one enrolment document can exist per pair.
- `isEnrolled(uid, cid)` and "fetch my enrolment for this course" are a **single document `get()`**, no query and no index.
- Enrol is **idempotent** — it writes to a known document ID.
- Re-enrol **restores progress for free** — the same document is reused, so flipping `WITHDRAWN → ACTIVE` keeps the `progress` array without any copy step.

A top-level collection (rather than a `users/{uid}/enrollments` subcollection) keeps the future EP-07 "students enrolled in course X" query reachable without a collection-group query.

### Firestore rules (`firestore.rules`)

Add an explicit block, consistent with every other collection (all access is Admin-SDK-mediated; the deny-by-default catch-all already covers it, but an explicit block documents the collection):

```
match /enrollments/{enrollmentId} {
  allow read, write: if false;
}
```

No new entries in `firestore.indexes.json` — composite-ID gets need no index, and the `POPULAR` catalogue sort runs in memory.

## API Surface

### New submodule `libs/api-courses/src/lib/enrollment/`

Following the `catalog/` precedent, the enrolment code is a submodule of `libs/api-courses` whose providers register directly in `CoursesModule` (it is **not** a separate Nest module) and which reuses `CoursesExceptionFilter`.

```
libs/api-courses/src/lib/enrollment/
├── enrollment.controller.ts        + .spec.ts
├── enrollment.service.ts           + .spec.ts
├── enrollment.repository.ts        + .spec.ts
└── dto/
    └── enroll-course.dto.ts        + dto.spec.ts
```

New error codes and exception classes live with the existing courses errors (`errors/courses-error.codes.ts`, `errors/courses.exception.ts`) — see "Error Handling".

### Endpoints

All three are mounted on a new `EnrollmentController` (`@Controller('enrollments')`), guarded by `FirebaseSessionGuard` (any authenticated user — there is no role gate; instructors are promoted students and may enrol), and filtered by `CoursesExceptionFilter`.

| Method | Path | Body | Success | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/enrollments` | `{ courseId }` | `201` `Enrollment` | Enrol, or restore a `WITHDRAWN` enrolment. |
| `DELETE` | `/api/enrollments/:courseId` | — | `204` | Unenrol — soft-delete the caller's enrolment. |
| `GET` | `/api/enrollments/:courseId` | — | `200` `EnrollmentStatusView` | The caller's enrolment for that course **and** whether they own it; drives the detail-page button state. |

The caller's `userId` always comes from the session (`AuthenticatedRequest.user.uid`) — never from the request body or path — so a caller can only ever create, read, or delete **their own** enrolment.

`EnrollCourseDto` validates `courseId` as a non-empty string via `class-validator`, mirroring the existing course DTOs.

### `EnrollmentRepository`

Wraps the `enrollments` collection and the `Course.enrollmentCount` counter. Injected with the `FIRESTORE` handle (`@learnwren/api-firebase`). Methods:

- **`isEnrolled(userId, courseId): Promise<boolean>`** — single `get()` of the composite-ID document; returns `true` only when the document exists **and** `status === 'ACTIVE'`. Consumed by the two access guards.
- **`getEnrollment(userId, courseId): Promise<Enrollment | null>`** — single `get()`; returns the document as-is (any status) or `null`.
- **`enroll(userId, courseId): Promise<Enrollment>`** — runs the **enrol transaction** (below).
- **`withdraw(userId, courseId): Promise<void>`** — runs the **unenrol transaction** (below).

Both mutations run inside a single `firestore.runTransaction` so the enrolment document and the `Course.enrollmentCount` counter never drift.

#### Enrol transaction

1. Read the `Course` document.
   - Missing, or `status !== 'PUBLISHED'` → throw `CourseNotAvailableException` (UC-05-04 ext 4a — the course was unpublished between page load and the click).
2. Read the enrolment document by composite ID.
   - **Absent** → create it: `status: 'ACTIVE'`, `progress: []`, `withdrawnAt: null`, `createdAt`/`updatedAt` = now. Write `Course.enrollmentCount = (course.enrollmentCount ?? 0) + 1`.
   - **Exists, `WITHDRAWN`** → update: `status: 'ACTIVE'`, `withdrawnAt: null`, `updatedAt` = now; **`progress` is left untouched**. Write `Course.enrollmentCount = (course.enrollmentCount ?? 0) + 1`.
   - **Exists, `ACTIVE`** → idempotent no-op: return the document unchanged, **no counter change**.
3. Return the resulting `Enrollment`.

The owner check (a course owner may not enrol in their own course) is enforced in `EnrollmentService` before the transaction — see below.

#### Unenrol transaction

1. Read the enrolment document by composite ID.
   - Absent, or `status === 'WITHDRAWN'` → throw `NotEnrolledException`.
   - **Exists, `ACTIVE`** → update: `status: 'WITHDRAWN'`, `withdrawnAt` = now, `updatedAt` = now; **`progress` is left untouched**. Read the `Course` document in the same transaction; if it exists, write `Course.enrollmentCount = Math.max(0, (course.enrollmentCount ?? 0) - 1)`. If the course document is gone, skip the counter write.

### `EnrollmentService`

Thin orchestration over the repository:

- **`enroll(userId, courseId)`** — loads the `Course`; if `course.instructorId === userId` throws `CannotEnrollOwnCourseException` (the owner already has full access; self-enrolment would also inflate the popularity count). Otherwise delegates to `repository.enroll`. The repository's own `PUBLISHED` check inside the transaction remains the authority on availability — the service does not duplicate it; it only adds the owner check. (The service's `Course` read is advisory; the transactional read is what guards against the unpublish race.)
- **`unenroll(userId, courseId)`** — delegates to `repository.withdraw`.
- **`getEnrollmentStatus(userId, courseId): Promise<EnrollmentStatusView>`** — reads the `Course` (to compute `isOwner` by comparing `course.instructorId` to `userId`) and the caller's enrolment via `repository.getEnrollment`, returning `{ enrollment, isOwner }`. A missing course yields `{ enrollment: null, isOwner: false }`. This is the only place ownership crosses to the client, keeping the instructor's UID off the public catalogue payload.

### Module wiring

In `CoursesModule`:

- Add `EnrollmentController` to `controllers`.
- Add `EnrollmentService` and `EnrollmentRepository` to `providers`.
- Add `EnrollmentRepository` to `exports` so `VideoModule` and `MaterialsModule` (which already import `CoursesModule` via `forwardRef`) can inject it into their guards.

### Guard wiring

Both guards currently end with a `TODO(EP-06)` comment and throw a "not owner" exception for any non-owner. This slice replaces each TODO with live code:

- **`EnrollmentOrOwnerGuard`** (`video/playback/`) — inject `EnrollmentRepository`. After the existing `video.ownerInstructorId === req.user?.uid` check, add: `if (req.user && await this.enrollment.isEnrolled(req.user.uid, video.courseId)) { req.video = video; return true; }`. Only then throw `NotVideoOwnerException`.
- **`MaterialAccessGuard`** (`materials/`) — inject `EnrollmentRepository`. After the existing owner check, add the analogous `isEnrolled(req.user.uid, material.courseId)` branch before throwing `NotMaterialOwnerException`.

The `TODO(EP-06)` comments are removed. Behaviour for owners and for non-enrolled non-owners is unchanged.

### `POPULAR` catalogue sort

- `libs/shared-data-models/src/lib/catalog.ts` — `CATALOG_SORT_OPTIONS` becomes `['NEWEST', 'ALPHABETICAL', 'POPULAR']`. Update the trailing comment that currently says POPULAR is "deferred to Slice B".
- `libs/api-courses/src/lib/catalog/catalog.service.ts` — `sortCourses` gains a `POPULAR` branch: sort by `(b.enrollmentCount ?? 0) - (a.enrollmentCount ?? 0)`, tie-broken by `compareNewest`. The sort runs in memory over the already-loaded `PUBLISHED` set, exactly like `NEWEST` and `ALPHABETICAL` — no new query, no index.
- `CatalogQueryDto` validates `sort` against `CATALOG_SORT_OPTIONS`; extending the const array is sufficient, no DTO code change.
- `libs/web-catalog` — the `catalog-filter-bar` component's sort `<select>` gains a "Most Popular" option mapping to `POPULAR`.

`CourseSummary` and `CourseCatalogDetail` are **not** extended with `enrollmentCount` — US-05-01 does not display the count on cards, only sorts by it, and the sort happens server-side on the `Course` document.

## Web Surface

### New library `libs/web-enrollment/`

A standalone Angular library, keeping the authenticated enrolment feature out of `web-catalog` (which remains the public-discovery library). Generated with the Nx Angular library generator, matching the `web-catalog` setup. It exports, via `src/index.ts`:

- **`EnrollmentService`** (`providedIn: 'root'`) — `enroll(courseId)`, `unenroll(courseId)`, `getEnrollmentStatus(courseId)`, each wrapping the matching endpoint with `HttpClient` + `firstValueFrom`, mirroring `web-catalog`'s `CatalogService`.
- **`CourseEnrollmentPanelComponent`** — a standalone, `OnPush` component, `selector: 'lib-course-enrollment-panel'`, with a single `courseId` input. It owns the button state machine, the enrol/unenrol calls, the confirmation dialog, and the guest/auto-enrol flow.

Nx graph edges introduced: `web-enrollment → shared-data-models`, `web-enrollment → web-auth` (for `AuthService`), `web-enrollment → web-ui` (for `lw-*` controls, matching `web-catalog`), and `web-catalog → web-enrollment`.

### Course detail page integration

`web-catalog`'s `CourseDetailPageComponent` imports `CourseEnrollmentPanelComponent` and renders it in the course header (near the title/instructor block), passing only the course `id`. The detail page continues to load the public `CourseCatalogDetail` exactly as today; the panel resolves its own state independently. The `CourseCatalogDetail` read-model is **not** extended — ownership is not on the public payload; the panel learns whether the caller owns the course from the authenticated `GET /api/enrollments/:courseId` (`EnrollmentStatusView.isOwner`), which it calls anyway to resolve enrolment state. This is one authenticated round-trip and no public UID exposure.

### Button state machine

On init the panel reads `AuthService.currentUser()`. If authenticated, it calls `getEnrollmentStatus(courseId)`, whose `EnrollmentStatusView` response carries both the caller's enrolment (if any) and whether they own the course. If not authenticated, no call is made — the guest state is shown directly. States:

| Auth / enrolment state | Control shown | Action on click |
| :--- | :--- | :--- |
| Not authenticated | **Enrol** | Navigate to `/login` with `redirect` = `/catalog/:id?enroll=1` |
| Authenticated, owns the course | A quiet "You own this course" note | — (no enrol affordance) |
| Authenticated, no enrolment or `WITHDRAWN` | **Enrol** | `POST /api/enrollments` → on success, transition to Enrolled |
| Authenticated, `ACTIVE` | **Enrolled** indicator + **Leave Course** | Leave → confirmation dialog |
| Enrolment state still loading | Disabled placeholder | — |

A `WITHDRAWN` enrolment is treated identically to "no enrolment" for display purposes — the user sees **Enrol** — but enrolling again restores the same record server-side.

The Enrol and Leave controls are disabled while their request is in flight, preventing a double-submit (the server transaction is idempotent regardless).

### Guest auto-enrol after login (UC-05-04 ext 1a)

1. A logged-out visitor clicks **Enrol**. The panel navigates to `/login` with `redirect` set to `/catalog/:id?enroll=1`.
2. **The login page is updated to honour the `redirect` query param.** It currently ignores it and always navigates to `/dashboard` after login — even though `authGuard` already appends `redirect` to the login URL for protected routes. This slice fixes that pre-existing gap: after a successful login the page navigates to the `redirect` value when present (and only when it is a same-origin path beginning with `/`, otherwise `/dashboard`). This both enables the auto-enrol return trip and makes `authGuard`'s existing `redirect` param work as intended.
3. Back on `/catalog/:id?enroll=1`, the panel — on init, seeing `enroll=1` in the query params **and** an authenticated user — fires `enroll(courseId)` automatically, then removes the `enroll` param from the URL (a `router.navigate` with `queryParams: { enroll: null }`, `replaceUrl: true`) so a refresh does not re-trigger it.
4. If that auto-enrol fails with `COURSE_NOT_AVAILABLE`, the not-available handling below applies.

### Leave-course confirmation (UC-05-05)

Clicking **Leave Course** opens a confirmation dialog carrying the UC-05-05 wording: *"Are you sure you want to leave this course? You will lose access to videos and materials immediately. Your progress will be saved for 90 days in case you re-enrol."* Confirm → `DELETE /api/enrollments/:courseId` → on success the panel returns to the **Enrol** state. Cancel → dialog closes, nothing changes.

## Error Handling

### New error codes

`CoursesErrorCode` (`libs/api-courses/src/lib/errors/courses-error.codes.ts`) gains three members; corresponding exception classes are added to `errors/courses.exception.ts` and surface through the existing `CoursesExceptionFilter` and error envelope:

| Code | HTTP | Exception | Raised when |
| :--- | :--- | :--- | :--- |
| `COURSE_NOT_AVAILABLE` | `409` | `CourseNotAvailableException` | Enrol attempted on a missing or non-`PUBLISHED` course (UC-05-04 ext 4a). |
| `CANNOT_ENROLL_OWN_COURSE` | `409` | `CannotEnrollOwnCourseException` | The course owner clicks Enrol on their own course. |
| `NOT_ENROLLED` | `404` | `NotEnrolledException` | `DELETE` with no `ACTIVE` enrolment for the caller. |

Existing codes are reused: `VALIDATION_FAILED` (`400`) for a malformed `EnrollCourseDto`; the `FirebaseSessionGuard` already yields `401` for unauthenticated callers. Enrolling when already `ACTIVE` is **not** an error — `POST` returns `201` with the existing record (idempotent, no counter change; `201` is the NestJS default for `@Post`, kept for all enrol outcomes).

### Web error handling

- **Enrol → `COURSE_NOT_AVAILABLE`:** the panel shows "This course is no longer available." and redirects to `/catalog` (UC-05-04 ext 4a). Applies equally to the auto-enrol-after-login path.
- **Enrol → any other failure** (network, `500`): an inline error message near the button; the button returns to the enrollable state for a retry.
- **Unenrol failure:** an error shown in/near the confirmation dialog; the student remains enrolled.
- **`getEnrollmentStatus` failure on load:** the panel shows a quiet error with a Retry control rather than guessing a state (it never silently shows "Enrol" on an unknown state).

## Testing

Following the established slice posture — a `.spec.ts` beside every new source file (Vitest), `api-e2e` for the HTTP contract and Firestore rules, `web-e2e` for the user journeys. Implementation follows the repo's test-first discipline.

### Unit tests (Vitest)

- **`enrollment.repository.spec.ts`** — over `fake-firestore.ts`: enrol from absent creates `ACTIVE` with `progress: []` and increments the counter; enrol from `WITHDRAWN` flips to `ACTIVE`, clears `withdrawnAt`, increments the counter, **and preserves a non-empty `progress` array**; enrol when already `ACTIVE` is a no-op with **no second increment**; enrol on a missing/non-`PUBLISHED` course throws `CourseNotAvailableException`; unenrol flips `ACTIVE → WITHDRAWN`, stamps `withdrawnAt`, decrements the counter; unenrol when absent or `WITHDRAWN` throws `NotEnrolledException`; `isEnrolled` is `true` only for `ACTIVE`.
- **`enrollment.service.spec.ts`** — owner self-enrol throws `CannotEnrollOwnCourseException`; non-owner `enroll` delegates to the repository; `unenroll` delegates; `getEnrollmentStatus` composes `{ enrollment, isOwner }` and yields `{ enrollment: null, isOwner: false }` for a missing course.
- **`enrollment.controller.spec.ts`** — the three routes call the service with the **session `uid`** (never a body/path-supplied id); response shapes and status codes.
- **`dto.spec.ts`** — `EnrollCourseDto` accepts a valid `courseId`, rejects empty/missing.
- **Updated `enrollment-or-owner.guard.spec.ts`** — add: an `ACTIVE`-enrolled non-owner is allowed; a `WITHDRAWN`/non-enrolled non-owner still gets `NotVideoOwnerException`; owner behaviour unchanged.
- **Updated `material-access.guard.spec.ts`** — the analogous enrolled-student-allowed / non-enrolled-denied cases.
- **Updated `catalog.service.spec.ts`** — `POPULAR` orders by `enrollmentCount` descending; ties break by newest; a course with no `enrollmentCount` field sorts as `0`.
- **`web-enrollment` component/service specs** — `EnrollmentService` HTTP calls; `CourseEnrollmentPanelComponent` renders each state, fires enrol/unenrol, runs the guest-redirect and `enroll=1` auto-enrol paths, and shows the `COURSE_NOT_AVAILABLE` redirect.
- **Updated `login-page.component.spec.ts`** — a successful login with a `redirect=/path` query param navigates to that path; with no `redirect`, to `/dashboard`; a `redirect` value not starting with `/` is ignored in favour of `/dashboard`.

### `api-e2e` (Playwright)

A new enrolment spec: authenticated `POST` → `201`; `GET` reflects `ACTIVE`; `DELETE` → `204`; `GET` reflects `WITHDRAWN`; re-`POST` restores the same record; enrol on an unpublished course → `409 COURSE_NOT_AVAILABLE`; owner self-enrol → `409 CANNOT_ENROLL_OWN_COURSE`; all three endpoints unauthenticated → `401`; a direct client read/write of `enrollments` is denied by Firestore rules. A guard-wiring regression check: an `ACTIVE`-enrolled student can reach a material download-URL endpoint that a non-enrolled non-owner is `403`'d from. (The analogous video-manifest path is covered by the `EnrollmentOrOwnerGuard` unit spec only — the video `api-e2e` suite is quarantined behind real GCP credentials, so a video-playback e2e is deferred to EP-06.)

### `web-e2e` (Playwright)

- **Authenticated enrol journey:** log in → open a `PUBLISHED` course → **Enrol** → page shows the Enrolled state → **Leave Course** → confirm → page returns to the Enrol state.
- **Guest auto-enrol journey:** logged out → open a course → **Enrol** → land on `/login` → log in → return to the course detail page already in the Enrolled state, with no second click.

## Documentation

- **`README.md`** — update the EP-05 status line (Slice B complete; enrolment built); add the three enrolment endpoints to the API tables; add `web-enrollment` to the monorepo layout and the project table; note the `POPULAR` sort.
- **`docs/USER_GUIDE.md`** — document the enrol / leave-course flows and the guest enrol-after-login behaviour.
- **`docs/use-cases/05-course-discovery-and-enrollment.md`** — update the drift banner: UC-05-04 and UC-05-05 are now implemented; the `POPULAR` sort named in UC-05-01 ext 2c now exists.
- The deferred **90-day purge job** and **access-revocation-on-unpublish** limitation are recorded as named follow-ups (in the README or a follow-ups note), mirroring how Slice A's follow-ups were captured.

## Build Sequence

A suggested order; the implementation plan will refine it:

1. **Shared models** — in `shared-data-models`: extend `Enrollment` and add `EnrollmentStatus`, `ENROLLMENT_STATUSES`, `EnrollmentStatusView`; add `enrollmentCount` to `Course`; extend `CATALOG_SORT_OPTIONS` with `POPULAR`.
2. **Firestore rules** — add the `enrollments` deny block.
3. **`enrollment/` submodule** — `EnrollmentRepository` → `EnrollmentService` → `EnrollmentController` + DTO; new error codes/exceptions; register in `CoursesModule` and export `EnrollmentRepository`.
4. **`POPULAR` sort** — `catalog.service.ts` `sortCourses` branch; seed `enrollmentCount: 0` in `CoursesService.createCourse`.
5. **Guard wiring** — `EnrollmentOrOwnerGuard` and `MaterialAccessGuard` inject `EnrollmentRepository`; remove the `TODO(EP-06)` markers.
6. **Login page** — make `LoginPageComponent` honour the `redirect` query param.
7. **`web-enrollment` library** — `EnrollmentService`, then `CourseEnrollmentPanelComponent` (state machine, dialog, guest/auto-enrol).
8. **`web-catalog` integration** — render the panel on `CourseDetailPageComponent`. The `catalog-filter-bar` sort `<select>` is already `@for`-driven from `CATALOG_SORT_OPTIONS`, so `POPULAR` appears automatically once step 1 lands — no component change.
9. **E2E** — `api-e2e` enrolment spec; `web-e2e` enrol journeys.
10. **Documentation** — README, USER_GUIDE, use-case drift banner.

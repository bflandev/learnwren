> [!NOTE]
> **DOCUMENT STATUS: DRAFT**
> This document is a living specification and is subject to change. All content is considered provisional until formally approved by project stakeholders.

# EP-07 Slice A: Enrolled Students Roster (US-07-01)

**Status:** Draft
**Epic:** EP-07 Instructor Dashboard
**Story:** US-07-01 — *As an Instructor, I want to see a list of all students enrolled in my course so that I can understand who is taking my course.*

## Goal

Give an instructor a per-course roster of the students enrolled in their own course — each student's display name, email, enrollment date, and overall course progress — sortable by enrollment date and progress, and exportable as a CSV. This is the first slice of EP-07 and the first instructor-facing surface that reads *across* enrollments (every prior enrollment surface is self-scoped to the calling student).

## EP-07 Slice Inventory (decomposition)

EP-07 is too large for a single spec; it decomposes into three independently-shippable slices. This spec details **Slice A** only.

| Slice | Story | Summary | Status |
| :--- | :--- | :--- | :--- |
| **A** (this spec) | US-07-01 | Enrolled-students roster table + CSV export, on a dedicated `/courses/:cid/students` page. | Designed here |
| **B** (future) | US-07-02 | Course analytics: enrolled total, average completion rate, new enrollments in 7/30/90 days, per-lesson average watch time + completion rate, refreshed ≤ 24h. | Deferred |
| **C** (future) | US-07-03 | Post-publication editing. **The editing ACs are already satisfied** by today's un-gated CRUD (`courses.service.ts` only sets `DRAFT` at creation and never blocks edits on a `PUBLISHED` course; video replacement re-runs the existing pipeline; materials are editable anytime). The **only** unbuilt piece is "notify enrolled students when a new module is added," which belongs with a future notifications capability. | Deferred |

### Notes carried forward to Slice B

- **Per-lesson average watch time** (US-07-02) requires lesson *durations*, which the data model does not store today. Slice B must resolve where duration comes from (transcoder metadata vs. a captured client value).
- The "updated at least once every 24 hours" wording in US-07-02 invites a materialized/cached aggregate rather than live computation. That caching decision belongs to Slice B. (Slice A computes live; its dataset is one course's active enrollments, which is small for this platform's target scale.)

## Scope & Non-Goals

**In scope:** the read-only roster endpoint, the dedicated roster page, client-side sorting, and client-side CSV export.

**Non-Goals:**
- **Analytics** (US-07-02) — Slice B.
- **New-module notification** (US-07-03) — Slice C.
- **WITHDRAWN students.** Only `ACTIVE` enrollees appear; a withdrawn student is no longer "enrolled."
- **Watch-time-weighted progress.** Progress is whole-lesson completion only (see §3). No partial-credit for `lastWatchedSeconds`.
- **Server-side sort / pagination.** The platform targets small communities (tens, not thousands, of enrollees per course); the endpoint returns the full active roster and the client sorts and builds the CSV.
- **Payment or personal data.** Only the four AC-named fields are exposed (US-07-01 AC: "cannot see any payment or personal information beyond what is listed above").

## Decisions Made During Brainstorming

| Decision | Choice | Rationale |
| :--- | :--- | :--- |
| Surface location | Dedicated `/courses/:cid/students` route | Clean separation from authoring; the Slice-B analytics view can join the same page later. |
| Rows shown | `ACTIVE` enrollments only | Matches "enrolled students"; withdrawn students are hidden. |
| Progress definition | `completedLessons ÷ totalLessons`, rounded | Uses the existing whole-lesson completion model (`LessonProgress.completedAt`); no new data needed. |
| Sort + CSV | Server returns the full list; client sorts and generates the CSV | Simplest for the expected scale; no pagination or second endpoint. |
| Code location | New `roster/` submodule in `api-courses` | Matches the per-feature-submodule convention (`catalog/`, `learn/`, `materials/`, `publish/`). |
| Access control | Reuse `FirebaseSessionGuard` + `CourseOwnerGuard` | Owner-only access already exists; no new guard. |

## 1. Shared Types

New file `libs/shared-data-models/src/lib/roster.ts`:

```ts
import type { CourseId, ISODateString, UserId } from './common';

/** One enrolled student's row in the instructor roster (US-07-01). */
export interface CourseRosterRow {
  userId: UserId;
  displayName: string;
  email: string;
  enrolledAt: ISODateString;        // Enrollment.createdAt
  completedLessons: number;         // completed AND still-existing lessons, capped at totalLessons
  totalLessons: number;             // current lesson count of the course
  progressPercent: number;          // round(completed / total * 100); 0 when total === 0
}

/** Response of GET /api/courses/:cid/students — instructor-only roster view. */
export interface CourseRosterView {
  courseId: CourseId;
  totalLessons: number;
  students: CourseRosterRow[];       // default order: enrolledAt descending (newest first)
}
```

`totalLessons` is surfaced on both the view and each row so the UI can render `"7 / 10 lessons"` and a percent without recomputing.

## 2. API — `api-courses/roster/`

New submodule mirroring the structure of `catalog/` and `learn/`.

**Endpoint:** `GET /api/courses/:cid/students`
- Guards: `@UseGuards(FirebaseSessionGuard, CourseOwnerGuard)`. `CourseOwnerGuard` already returns `404` for a missing course and `403` for a non-owner; unauthenticated requests get `401` from the session guard. No new error paths are introduced by the happy controller.
- Returns: `CourseRosterView`.

**`RosterController`** — thin; delegates to `RosterService`, returns the view.

**`RosterService`:**
1. Load the course with its modules/lessons (reuse `CoursesRepository`); derive the set of current `lessonId`s → `totalLessons`.
2. `listActiveByCourse(cid)` (new repo method, §2.1) → the `ACTIVE` enrollments.
3. Resolve `displayName` + `email` for each enrollee's `userId` by batch-reading `users/{uid}` (the same pattern as `InstructorDirectory.instructorRefsFor`, extended to also surface `email`). Missing user doc → fallback `displayName` and `email: ''`.
4. Per enrollment compute:
   - `completedLessons` = count of `progress[]` entries where `completedAt != null` **and** the `lessonId` still exists in the course's current lesson set, **capped** at `totalLessons` (a deleted lesson's stale completion must not inflate the count).
   - `progressPercent` = `totalLessons === 0 ? 0 : Math.round((completedLessons / totalLessons) * 100)`.
   - `enrolledAt` = `Enrollment.createdAt`.
5. Return `{ courseId, totalLessons, students }` ordered by `enrolledAt` descending.

**`roster.exception-filter.ts`** — a per-feature `ExceptionFilter` delegating to `handleException()` from `@learnwren/api-http-errors` (repo convention: every feature submodule carries its own filter). Slice A throws no domain exceptions of its own beyond what the guards/repository already raise; the filter exists for convention and to catch any `CoursesException` surfaced from the shared repository.

### 2.1 Repository

Add to `enrollment.repository.ts` (which owns the `enrollments` collection — keep all collection access there):

```ts
/** All ACTIVE enrollments for a course (instructor roster). */
async listActiveByCourse(courseId: CourseId): Promise<Enrollment[]>
```

Implemented as a `where('courseId', '==', cid).where('status', '==', 'ACTIVE')` query. This composite query may require a Firestore composite index; if so, add it to `firestore.indexes.json` and note it in the plan.

### 2.2 User profile read

Reading `email` from `users/{uid}` is acceptable here because the endpoint is strictly owner-scoped and the AC explicitly lists email as a permitted field. The roster's user read is a small dedicated helper (name + email) rather than reusing `InstructorDirectory` verbatim, since the directory intentionally exposes only public fields (name/photo/bio). Either extend the directory with an email-returning method or add a focused `roster` helper — the plan decides; the constraint is that **email is only ever returned through an owner-guarded path.**

## 3. Web — `web-courses/course-students-page/`

New standalone page at route `/courses/:cid/students`.

- **`RosterService`** (web): a Promise-returning HTTP wrapper — `getRoster(cid): Promise<CourseRosterView>` — per the repo's web-service pattern. No state in the service.
- **`CourseStudentsPageComponent`** owns the signal state:
  - A `RemoteData` signal (`loading` / `loaded` / `error`).
  - A sort-state signal (`{ key: 'enrolledAt' | 'progress', dir: 'asc' | 'desc' }`, default `enrolledAt`/`desc`).
  - A `computed` sorted-rows derived from the loaded rows + sort state (client-side sort).
- **Table** (design system): columns Display Name, Email, Enrollment Date, Progress (`"7 / 10 · 70%"`). Clickable headers on Enrollment Date and Progress toggle sort direction and show the active sort indicator.
- **Export CSV** button (`lwButton`): builds an RFC-4180 CSV from the current rows and triggers a `Blob` download.
  - Header row: `Display Name,Email,Enrollment Date,Progress (%)`.
  - Every field is quoted and internal `"` is doubled; commas, quotes, and newlines in display names are therefore safe.
  - Enrollment date rendered as an ISO date (`YYYY-MM-DD`).
  - Filename: `<slugified-course-title>-students.csv` (fallback `course-students.csv`).
- **States:** loading (`text-ink-3` "Loading…"), empty ("No students enrolled yet."), error (design-system error treatment with a retry).
- **Entry point:** a **"Students"** ghost link in the course-editor header (`course-editor-page`), beside the existing "← My Courses" back link, routing to `/courses/:cid/students`. The students page has a back link to the editor.

## 4. Error Handling

| Condition | Result |
| :--- | :--- |
| Unauthenticated | `401` (session guard). |
| Authenticated, not the course owner | `403` (`CourseOwnerGuard`). |
| Course does not exist | `404` (`CourseOwnerGuard`). |
| Course has zero lessons | `200`; every row `progressPercent = 0`, `totalLessons = 0`. |
| Enrollee's `users/{uid}` doc missing | Row still returned with fallback `displayName` and `email: ''`. |
| Progress references a deleted lesson | That stale completion is excluded; `completedLessons` never exceeds `totalLessons`. |
| Web: load fails | Error state with retry; no partial table. |

## 5. Testing & Verification

- **shared-data-models:** type + wire spec for `roster.ts`.
- **api (`api-courses`):**
  - `RosterService` unit tests: progress math; deleted-lesson exclusion + cap; zero-lessons course; missing user doc fallback; default `enrolledAt`-desc ordering; name/email join.
  - `RosterController` + guard wiring: owner → `200`; non-owner → `403`; unauthenticated → `401`; missing course → `404`.
  - `enrollment.repository` `listActiveByCourse` test (returns only `ACTIVE`, scoped to the course).
  - **api-e2e:** the owner-guarded endpoint end-to-end (owner sees roster; a second user is forbidden).
- **web (`web-courses`):**
  - `CourseStudentsPageComponent` spec: table render; sort toggle reorders rows; CSV blob content + escaping (a display name containing a comma and a quote); empty / loading / error states.
  - `RosterService` (web) spec: issues the GET and returns the view.
- **Mutation:** the new code lands inside the already-configured `api-courses` and `web-courses` Stryker scopes; keep both at or above the **80% adjusted** bar.
- **Verification gate (per plan):** `nx sync` (the new page pulls `web-ui`), then `nx run-many -t lint test typecheck build` for the affected projects must pass, plus a browser walk-through of `/courses/:cid/students` (sort + CSV export) in the dark theme.

## 6. Implementation Decomposition

A single plan, built bottom-up so each step is independently testable:

1. **Shared types** — `roster.ts` (+ wire spec).
2. **Repository** — `enrollment.repository.listActiveByCourse` (+ index if required).
3. **API roster submodule** — service, controller, exception filter, module wiring; unit + e2e.
4. **Web roster page** — service, component, route, course-editor entry link; specs.
5. **Verification** — `nx sync`, affected `lint test typecheck build`, browser walk-through, mutation check.

## References

- Epic: `docs/epics/07-instructor-dashboard.md` (US-07-01).
- Data model: `libs/shared-data-models/src/lib/enrollment.ts` (`Enrollment`, `LessonProgress`).
- Reuse patterns: `libs/api-courses/src/lib/catalog/instructor-directory.ts` (batch user read), `course-owner.guard.ts` (owner access), `libs/api-courses/src/lib/enrollment/enrollment.repository.ts` (collection access).

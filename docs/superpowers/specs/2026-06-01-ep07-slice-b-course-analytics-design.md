> [!NOTE]
> **DOCUMENT STATUS: DRAFT**
> This document is a living specification and is subject to change. All content is considered provisional until formally approved by project stakeholders.

# EP-07 Slice B: Course Analytics (US-07-02)

**Status:** Draft
**Epic:** EP-07 Instructor Dashboard
**Story:** US-07-02 — *As an Instructor, I want to see basic analytics for my course so that I can understand how students are engaging with the content.*
**Builds on:** EP-07 Slice A (enrolled-students roster) — `docs/superpowers/specs/2026-06-01-ep07-slice-a-enrolled-students-design.md`.

## Goal

Give a course owner an at-a-glance analytics view of their own course: how many students are enrolled, how far they get on average, how enrollment is trending, and — per lesson — how many students complete it and how far into it they typically get. The numbers are computed live from data the platform already records (active enrollments, per-lesson progress, video durations), so they are always current.

## US-07-02 Acceptance Criteria → this design

| AC | How this slice satisfies it |
| :--- | :--- |
| Total enrolled students, average course completion rate, new enrollments in last 7 / 30 / 90 days | Course-summary section (§1). `averageCompletionPercent` = mean per-student progress %. |
| Per-lesson breakdown: average watch time and completion rate per lesson | Per-lesson table (§1). "Average watch time" is approximated by mean furthest-watched position (see Data Limitation). |
| Analytics updated at least once every 24 hours | **Computed live on each request** — always fresh, so the 24-hour floor is met by construction. No scheduled job. |

## Decisions Made During Brainstorming

| Decision | Choice | Rationale |
| :--- | :--- | :--- |
| Computation | **Live per request** | The "≤ 24h" AC is a minimum-freshness floor; live computation meets it trivially and avoids scheduler/materialization infra. One course's active enrollments is a small dataset at this platform's scale. |
| "Average course completion rate" | **Mean per-student progress %** (mean of each ACTIVE student's completed ÷ total lessons) | Reuses Slice A's per-student progress; a continuous engagement-depth figure. |
| "Average watch time" per lesson | **Mean furthest-watched position** (mean `lastWatchedSeconds`), shown as a duration **and** as % of the video's `durationSec` | We do not store cumulative watch time (see Data Limitation); furthest position is the honest available proxy, and durations are known. |
| Watch-time denominator | Students who have a **progress row** for that lesson (engaged students) | A student who never opened a lesson has no row; averaging over engaged students avoids diluting the figure with non-watchers. |
| Completion-rate denominator | **All ACTIVE enrollees** (the cohort) | "What fraction of the cohort completed this lesson." |
| UI placement | **New `/courses/:cid/analytics` route**, linked from the editor header beside "Students" | Symmetric with Slice A; keeps roster and analytics as separate focused pages. |
| Code location | New `analytics/` submodule in `api-courses` | Matches the per-feature-submodule convention (`roster/`, `catalog/`, `learn/`). |
| Access control | Reuse `FirebaseSessionGuard` + `CourseOwnerGuard` + `CoursesExceptionFilter` | Owner-only access already exists (same stack as Slice A's roster endpoint). |

## Data Limitation (explicit)

The platform records `LessonProgress.lastWatchedSeconds` — the student's **furthest / last-saved playback position** (Slice C of EP-06), monotonic and resume-oriented. It is **not** cumulative watch time (a student who scrubs back and rewatches does not increase it). Therefore "average watch time" in this slice means **average furthest position reached**, surfaced honestly in the UI as "avg. progress into lesson" with both a `m:ss` duration and a percent of the video length. True watch-time telemetry is out of scope and would require new playback event capture.

## Scope & Non-Goals

**In scope:** the read-only analytics endpoint, the analytics page, and the editor entry link.

**Non-Goals:**
- **Materialized / scheduled snapshots** — computation is live (decision above).
- **True cumulative watch time** — only furthest position is available.
- **Charts / graphs / sparklines** — summary cards + a per-lesson table only.
- **CSV export of analytics** — not requested for this slice (the roster has CSV; analytics does not).
- **Date-range pickers / custom windows** — fixed 7 / 30 / 90-day windows only.
- **WITHDRAWN students** — only ACTIVE enrollees count, consistent with Slice A.
- **Cross-course / instructor-wide rollups** — single course only.

## 1. Metrics

All metrics derive from three sources the platform already maintains: the course's modules→lessons (with each lesson's `videoId`), the lesson's `Video.output.durationSec` (when the video is `READY`), and the course's ACTIVE enrollments (each carrying `createdAt` and a `progress[]` of `{ lessonId, completedAt, lastWatchedSeconds }`).

**Course summary**
- `enrolledTotal` — number of ACTIVE enrollments.
- `averageCompletionPercent` — mean over ACTIVE students of `round(distinctCompletedExistingLessons / totalLessons * 100)`; `0` when there are no students or no lessons. (Reuses the Slice A progress definition: a completed lesson counts only if `completedAt != null` **and** the lesson still exists in the course.)
- `newEnrollments` — `{ last7Days, last30Days, last90Days }`, each the count of ACTIVE enrollments whose `createdAt >= now − N days`. `now` is the request time. (Windows are nested: a sign-up 3 days ago counts in all three.)

**Per-lesson row** (one per current lesson, ordered by module `order`, then lesson `order`)
- `lessonId`, `moduleId`, `title`.
- `completionRatePercent` — `round(activeStudentsWithCompletedAtForLesson / enrolledTotal * 100)`; `0` when `enrolledTotal === 0`.
- `watchedStudents` — number of ACTIVE students who have a progress row for this lesson.
- `averageWatchedSeconds` — mean `lastWatchedSeconds` over `watchedStudents`; `0` when `watchedStudents === 0`.
- `durationSec` — the lesson's `Video.output.durationSec` if its video is `READY` and has output; otherwise `null` (video missing / still processing).
- `averageWatchedPercent` — `round(averageWatchedSeconds / durationSec * 100)` when `durationSec` is a positive number; otherwise `null`.

**Response envelope**
- `totalLessons`, `generatedAt` (request-time ISO timestamp, surfaced in the UI as a freshness line).

## 2. Shared Types

New file `libs/shared-data-models/src/lib/analytics.ts`:

```ts
import type { CourseId, ISODateString, LessonId, ModuleId } from './common';

/** Per-lesson analytics row (US-07-02). */
export interface LessonAnalyticsRow {
  lessonId: LessonId;
  moduleId: ModuleId;
  title: string;
  /** ACTIVE students with completedAt for this lesson ÷ enrolledTotal, rounded. 0 when no students. */
  completionRatePercent: number;
  /** ACTIVE students who have a progress row for this lesson. */
  watchedStudents: number;
  /** Mean lastWatchedSeconds over watchedStudents (furthest position, NOT cumulative watch time). 0 when none. */
  averageWatchedSeconds: number;
  /** Lesson video's READY duration, or null when the video is missing/processing. */
  durationSec: number | null;
  /** averageWatchedSeconds ÷ durationSec, rounded; null when durationSec is unavailable. */
  averageWatchedPercent: number | null;
}

/** Response of GET /api/courses/:cid/analytics — owner-only course analytics. */
export interface CourseAnalyticsView {
  courseId: CourseId;
  enrolledTotal: number;
  /** Mean per-student progress % across ACTIVE enrollees. 0 when no students/lessons. */
  averageCompletionPercent: number;
  newEnrollments: {
    last7Days: number;
    last30Days: number;
    last90Days: number;
  };
  totalLessons: number;
  /** One row per current lesson, ordered by module order then lesson order. */
  lessons: LessonAnalyticsRow[];
  /** Request-time timestamp; conveys freshness in the UI. */
  generatedAt: ISODateString;
}
```

## 3. API — `api-courses/analytics/`

New submodule mirroring `roster/`.

**Endpoint:** `GET /api/courses/:cid/analytics`
- Guards: `@UseGuards(FirebaseSessionGuard, CourseOwnerGuard)` (401 unauthenticated, 404 missing course, 403 non-owner). The controller is `@Controller('courses')` with route `:cid/analytics` (two segments — no collision with the one-segment `:cid` routes; same pattern proven by `:cid/students` and `:cid/publish-eligibility`).
- Filter: reuse `CoursesExceptionFilter`.
- Returns: `CourseAnalyticsView`.

**`AnalyticsController`** — thin; passes the guard-loaded `req.course` to the service.

**`AnalyticsService.getAnalytics(course: Course): Promise<CourseAnalyticsView>`:**
1. Load modules (`CoursesRepository.listModulesByCourse`) ordered, and lessons per module (`listLessonsByModule`) ordered; build the ordered lesson list and the `Set` of current lesson ids → `totalLessons`.
2. `EnrollmentRepository.listActiveByCourse(course.id)` → ACTIVE enrollments.
3. `VideoRepository.listVideosForLessons(lessonIds)` (new method, §3.1) → `Map<LessonId, Video>` for durations.
4. Compute the course summary and per-lesson rows per §1. The 7/30/90-day cutoffs are derived from the request-time clock (`Date.now()`); tests use fake timers.
5. Return the assembled `CourseAnalyticsView` with `generatedAt = new Date().toISOString()`.

The service injects `CoursesRepository`, `EnrollmentRepository`, and `VideoRepository`. (`VideoRepository` is already exported by `VideoModule`, which `CoursesModule` imports via `forwardRef`.)

### 3.1 Repository addition

`VideoRepository` already has `getVideoByLesson(lid)` and `listVideoStatesForLessons(lessonIds)` (which returns only states). Add a sibling that returns the full docs (needed for `output.durationSec`):

```ts
/** Full Video docs for the given lessons, keyed by lessonId. Lessons with no video are absent. */
async listVideosForLessons(lessonIds: LessonId[]): Promise<Map<LessonId, Video>>
```

Implemented exactly like `listVideoStatesForLessons` but storing the whole `Video` instead of `video.state`.

### 3.2 Module wiring

Register `AnalyticsController` (controllers) and `AnalyticsService` (providers) in `CoursesModule`. `CoursesRepository`, `EnrollmentRepository`, `CourseOwnerGuard`, `CoursesExceptionFilter` are already provided; `VideoRepository` is reachable through the existing `forwardRef(() => VideoModule)` import.

## 4. Web — `web-courses/course-analytics-page/`

New standalone page at route `/courses/:cid/analytics` (added to the `courses` children, already guarded by `instructorRoleGuard`).

- **`AnalyticsService`** (web): a Promise-returning HTTP wrapper — `getAnalytics(cid): Promise<CourseAnalyticsView>` — `withCredentials`. No state in the service.
- **`CourseAnalyticsPageComponent`** (OnPush) owns a `RemoteData` signal (`loading` / `loaded` / `error`) and renders:
  - A back link to the editor and an **Analytics** heading; a quiet "Updated <generatedAt>" line.
  - **Summary cards** (design-system `LwCard`): Enrolled students, Average completion (%), and New enrollments with 7/30/90-day figures.
  - **Per-lesson table**: Lesson title, Completion rate (%), Avg. progress (`m:ss` + `· N%` when duration known; `m:ss` only otherwise), Duration (`m:ss` or "—" when not `READY`).
  - **States:** loading (`text-ink-3`), empty (course has no lessons → a card "No lessons yet — add lessons to see analytics"; zero students is a normal loaded state showing 0s), error (card with retry).
- **Entry point:** an **Analytics** ghost link in the course-editor header beside the existing "Students" link (`data-testid="view-analytics"`).
- **Duration formatting:** a small pure `secondsToClock(sec): string` util (`m:ss`, or `h:mm:ss` past an hour). Reuse an existing formatter if one exists in `web-ui`/`web-video`; otherwise add it under the analytics page folder and unit-test it.

## 5. Error Handling

| Condition | Result |
| :--- | :--- |
| Unauthenticated | `401` (session guard). |
| Authenticated, not the owner | `403` (`CourseOwnerGuard`). |
| Course does not exist | `404` (`CourseOwnerGuard`). |
| Course has zero lessons | `200`; `totalLessons: 0`, `lessons: []`, `averageCompletionPercent: 0`. UI shows the "no lessons" empty card. |
| Course has lessons but zero ACTIVE students | `200`; all rates `0`, `averageWatchedSeconds 0`. Normal loaded view. |
| A lesson's video is missing or not `READY` | That row's `durationSec` and `averageWatchedPercent` are `null`; completion/watch figures still computed; UI shows "—" for duration. |
| Progress references a deleted lesson | Excluded — only current lessons are iterated; stale completions never inflate `averageCompletionPercent`. |
| Web load fails | Error state with retry; no partial render. |

## 6. Testing & Verification

- **shared-data-models:** type/literal spec for `analytics.ts`.
- **api (`api-courses`):**
  - `AnalyticsService` unit: `averageCompletionPercent` mean; `newEnrollments` 7/30/90 window counts (use fake timers / fixed clock and enrollments at known offsets, including a boundary case); per-lesson `completionRatePercent` over the cohort denominator; `averageWatchedSeconds` over the engaged denominator (and `0` when no rows); `averageWatchedPercent` from duration; lesson with **no READY video** → `durationSec`/`averageWatchedPercent` `null`; zero-students and zero-lessons cases; deleted-lesson exclusion; lesson ordering (module order then lesson order).
  - `AnalyticsController` + guard wiring: owner `200`; non-owner `403`; unauthenticated `401`; missing course `404`.
  - `VideoRepository.listVideosForLessons` repo test (returns full docs keyed by lesson; lessons without a video absent).
  - **api-e2e:** seed a PUBLISHED course (modules/lessons, at least one READY video with `output.durationSec`), enroll a student, complete a lesson and save a position; assert the owner sees correct `enrolledTotal`, `averageCompletionPercent`, a `newEnrollments.last7Days >= 1`, and a per-lesson row with the expected `completionRatePercent` and `durationSec`. Assert non-owner `403` and anonymous `401`.
- **web (`web-courses`):**
  - `CourseAnalyticsPageComponent` spec: summary cards render the three course figures; the per-lesson table renders rows with completion % and avg progress; the "—" duration fallback for a null-duration lesson; loading / empty (no lessons) / error states.
  - `AnalyticsService` (web) spec: issues the GET with credentials and returns the view.
  - `secondsToClock` util spec (if added): `0 → "0:00"`, `65 → "1:05"`, `3661 → "1:01:01"`.
- **Mutation:** new code lands in the already-configured `api-courses` and `web-courses` Stryker scopes; keep both ≥ **80% adjusted**. (Scope Stryker with a single `--mutate` over the new source files; a bare `*.ts` glob also mutates spec files.)
- **Verification gate:** `nx sync`, then `nx run-many -t lint test typecheck build -p shared-data-models api-courses web-courses` green; `nx build api` (proves DI wiring); live api-e2e analytics suite; a browser walk-through of `/courses/:cid/analytics` on the dark theme.

## 7. Implementation Decomposition

A single plan, bottom-up:

1. **Shared types** — `analytics.ts` (+ spec).
2. **Repository** — `VideoRepository.listVideosForLessons` (+ test).
3. **API analytics submodule** — service (the metric computation), controller, module wiring; unit + e2e.
4. **Web** — `secondsToClock` util, `AnalyticsService`, `CourseAnalyticsPageComponent`, route, editor "Analytics" link; specs.
5. **Docs** — README feature record + endpoint table; USER_GUIDE analytics entry; update the EP-07 slice inventory (Slice B done; only Slice C remains).
6. **Verification** — `nx sync`, affected `lint test typecheck build`, e2e, browser walk-through, mutation check.

## 8. EP-07 status after this slice

Slice A (roster) shipped; Slice B (this) ships analytics. **Slice C** (US-07-03) remains: its editing ACs are already satisfied by un-gated CRUD, leaving only "notify enrolled students when a new module is added," which belongs with a future notifications capability.

## References

- Story: `docs/epics/07-instructor-dashboard.md` (US-07-02).
- Slice A spec (reused patterns): `docs/superpowers/specs/2026-06-01-ep07-slice-a-enrolled-students-design.md`.
- Data models: `libs/shared-data-models/src/lib/enrollment.ts` (`LessonProgress.lastWatchedSeconds`, `Enrollment.createdAt`), `libs/shared-data-models/src/lib/video.ts` (`VideoOutput.durationSec`).
- Reuse: `EnrollmentRepository.listActiveByCourse`, `CoursesRepository.listModulesByCourse`/`listLessonsByModule`, `VideoRepository.getVideoByLesson`/`listVideoStatesForLessons`, `CourseOwnerGuard`, `CoursesExceptionFilter`.

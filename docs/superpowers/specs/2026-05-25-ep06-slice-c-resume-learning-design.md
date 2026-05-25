# Resume Learning — EP-06 Slice C Design Spec

> [!NOTE]
> **DOCUMENT STATUS: DRAFT**

**Status:** Draft (2026-05-25)
**Scope:** Third implementation slice of EP-06 (Learning Experience). Delivers **UC-06-03 (Resume Learning)**: an enrolled student returns to a course they have previously opened and is offered a **Continue Learning** CTA that deep-links to their last accessed lesson; opening that lesson resumes the video within 5 s of where they left off; the player auto-saves position in the background. Per-lesson only, mirroring the per-lesson scope of Slice B.

This spec sits on top of:

- `2026-05-25-ep06-slice-b-mark-complete-design.md` (the `LessonEnrollmentGuard`, the `LearnExceptionFilter`, the `LessonView.progress` slot, the `EnrollmentRepository.markLessonComplete` transactional pattern, the per-feature exception filter convention).
- `2026-05-25-ep06-slice-a-student-playback-design.md` (the `learn/` submodule, `LessonEnrollmentOrOwnerGuard`, `LearnService.getLessonView`, `LearnController` at `/api/learn/courses/:cid/lessons/:lid`, the `LessonView` interface, the `LessonPlayerPageComponent`, the `LearnService` web wrapper).
- `2026-05-22-ep05-slice-b-enrolment-design.md` (the `enrollments` collection keyed by `${userId}__${courseId}`, `EnrollmentRepository.{getEnrollment, isEnrolled, enroll, withdraw}`, the `LessonProgress[]` slot seeded `[]` on every new enrolment **and preserved across `WITHDRAWN → ACTIVE`**).
- `2026-05-22-course-discovery-slice-a-design.md` (the `course-detail-page.component` and its `firstLessonHref` computation).
- `2026-05-14-video-playback-slice-c-design.md` (`VideoPlayerComponent` in `libs/web-video`, hls.js + native HLS playback).

It reuses the existing `LearnExceptionFilter` and `LessonEnrollmentGuard`, the per-feature exception-filter convention (per the memory `api-courses per-feature exception filters`), the `api-firebase` Firestore handle, the `fake-firestore.ts` test double, and the web "service-as-HTTP-wrapper" pattern (per the memory `Web service-as-HTTP-wrapper pattern`: the service returns a Promise, the component owns the signal state).

It introduces **no new Nx libraries**, **no new env vars**, and **no new Firestore collections, indexes, or rules**.

## Goal

A fresh clone, after `pnpm install` / `pnpm secrets:render` / `pnpm emulators` / `pnpm start`, must satisfy:

- An **authenticated student with an `ACTIVE` enrolment** who opens a lesson page `/learn/:cid/:lid` causes the API to record `lastAccessedLessonId = lid`, `lastAccessedAt = <ISO now>` on their enrolment document, as a side effect of the existing `GET /api/learn/courses/:cid/lessons/:lid` request.
- Returning to that course's catalog page `/catalog/:cid` shows a **Continue Learning** CTA whose `[routerLink]` points at the last accessed lesson. The CTA falls back to **Start Learning** → first lesson when the student has not opened any lesson yet, when the caller is the owner, or when `lastAccessedLessonId` no longer resolves to a live lesson in `course.modules[].lessons[]`.
- During playback, the player POSTs the current position every ~15 s and flushes on `pause` / `ended` / `visibilitychange→hidden` / `pagehide`. The unload flushes go through `navigator.sendBeacon` (with a `fetch(..., { keepalive: true })` fallback).
- A new `POST /api/learn/courses/:cid/lessons/:lid/position` body `{ seconds: number }` upserts the matching `LessonProgress.lastWatchedSeconds`. The write is **idempotent** (no Firestore write if `seconds` equals the stored value) and **monotonic** (a smaller `seconds` than the stored value is dropped and the stored value is returned). Defends against out-of-order beacons rewinding progress.
- Reloading the lesson page, with `lastWatchedSeconds > 0`, seeks the player to `clamp(lastWatchedSeconds, 0, duration - 5)` on `loadedmetadata`, satisfying the use case's "within 5-second tolerance" requirement.
- If `lastWatchedSeconds >= duration` (instructor swapped in a shorter video), the player resets to 0 (UC-06-03 ext 5b).
- A **withdraw → re-enrol** round-trip preserves both `lastAccessedLessonId` and every row's `lastWatchedSeconds`, mirroring Slice B's preservation of `completedAt`.
- All Slice A / Slice B authorization branches are unchanged on the existing GET and apply to the new POST:
  - Unauthenticated → 401 (`FirebaseSessionGuard`).
  - Authenticated, not enrolled, non-owner → 403 `NOT_ENROLLED_LESSON`.
  - Authenticated, withdrawn enrolment → 403 `NOT_ENROLLED_LESSON`.
  - Authenticated owner on the POST → 403 `NOT_ENROLLED_LESSON` (owners don't have progress).
  - Course `DRAFT` or `ARCHIVED`, caller is an enrolled non-owner → 403 (mirrors the Slice A guard).
  - Course missing, lesson missing, lesson belongs to a different course → 404 `LESSON_NOT_FOUND`.
- A new error `INVALID_POSITION` (HTTP 400) is returned when the POST body's `seconds` is not a finite non-negative number.
- **In-tab revocation.** If the student's enrolment is withdrawn from another tab between page-load and a tick, the next position POST returns 403, the player switches to the existing Slice B `NOT_ENROLLED` page state, and the saver stops.
- The `GET /learn` side-effect that bumps `lastAccessedLessonId` is **best-effort**. If the transactional touch throws (e.g. transient Firestore error), the view is still returned with a `warn` log; the page works, resume just won't advance.
- Instructor preview path is unchanged: no enrolment doc → `progress: null` → component reads `isOwnerPreview()` true → no auto-save wiring, no Continue Learning surface. `POST /position` returns 403 `NOT_ENROLLED_LESSON` for owners.
- All prior-spec quality gates pass: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e`. No regression in `api-auth`, `api-courses`, `web-auth`, `web-catalog`, `web-courses`, `web-video`, `web-enrollment`, `web-learn`.

## Non-Goals

Each is owned by a subsequent slice or another deferred work item:

- **Course-outline panel (UC-06-04).** No outline sidebar, no per-lesson checkmark list, no next/prev navigation. Slice D.
- **Module / course completion rollups (UC-06-02 ext 3a/3b).** Still deferred from Slice B; no surface to render against.
- **"Course Completed" badge** on profile and course cards. Requires My Courses dashboard.
- **My Courses dashboard / cross-course resume list.** Out of scope; we surface resume only on `/catalog/:cid`.
- **Server-side eager cleanup of `lastAccessedLessonId` when a lesson is deleted.** Client falls back to first lesson when the id doesn't resolve. Adding a hook into lesson deletion to sweep enrolments is unnecessary churn for the value.
- **Owner playback progress / preview position.** Owners have no enrolment doc and no `LessonProgress` row. Instructor preview is untouched.
- **Captions, playback speed, picture-in-picture, fullscreen toggles beyond what `VideoPlayerComponent` already exposes.**
- **Watch-time aggregates, per-segment HLS analytics, "% watched" telemetry.** Only `lastWatchedSeconds` is written.
- **An unmark / reset-progress affordance.** UC-06-03 doesn't ask for one and we explicitly chose one-way semantics in Slice B.
- **Bulk position writes / batched saves across lessons.** One lesson per POST.
- **Tackling the 14 quarantined api-e2e video fixmes.** Slice A flipped one of them; the rest remain quarantined per `2026-05-23-fake-source-probe-seam-design.md`.

## Data Model

**No new collections, no new indexes, no new Firestore rules.** Two additive fields on `Enrollment`; one existing field on `LessonProgress` finally gets used.

`libs/shared-data-models/src/lib/enrollment.ts`:

```ts
export interface Enrollment {
  id: EnrollmentId;
  userId: UserId;
  courseId: CourseId;
  status: EnrollmentStatus;
  progress: LessonProgress[];
  withdrawnAt: ISODateString | null;
  lastAccessedLessonId: LessonId | null;   // NEW — seeded null; preserved across re-enrol
  lastAccessedAt: ISODateString | null;    // NEW — companion timestamp (debug/observability only; not read by UI)
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
```

`LessonProgress.lastWatchedSeconds` is unchanged in shape; this slice starts writing it. Invariants enforced by the repository:
- Stored value is finite and non-negative.
- Stored value never decreases through the position endpoint (monotonic upsert).
- Independent of `completedAt`; the two are written by separate endpoints with no coupling.

`libs/shared-data-models/src/lib/lesson-view.ts`:

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
    lastWatchedSeconds: number;            // NEW — defaults 0 when no row yet
  } | null;
}
```

The optional `progress` slot is unchanged in cardinality:
- `null` when caller is the course's owner (no enrolment doc).
- `{ completedAt: null, lastWatchedSeconds: 0 }` when the caller is an enrolled student with no row yet.
- `{ completedAt: <ISO> | null, lastWatchedSeconds: <number> }` when the caller has a row.

Backward compat: pre-Slice-C clients that ignore `lastWatchedSeconds` continue to work. Documents written before Slice C deserialise with `lastAccessedLessonId` and `lastAccessedAt` as `undefined`; the repository hydration path normalises both to `null` on read.

The `EnrollmentRepository.enroll` (and re-enrol) paths seed `lastAccessedLessonId: null`, `lastAccessedAt: null` on the **first** enrol and explicitly **do not touch** either field on re-enrol — the preservation comes for free because re-enrol only writes `status`, `withdrawnAt`, `updatedAt` on the existing doc.

## API Surface

### Existing endpoint — additive change

```
GET /api/learn/courses/:cid/lessons/:lid
  → 200 LessonView (now with progress.lastWatchedSeconds when caller is enrolled)
```

After the existing access check (`LessonEnrollmentOrOwnerGuard`) and before returning:

- If `req.user.uid !== course.instructorId` (i.e. the enrolled-student path), call `EnrollmentRepository.touchLastAccessed(userId, courseId, lessonId, nowIso)` inside a `try { … } catch (err) { logger.warn(...) }` block. Owners and any error path do not block the response. The write is non-essential to playback.
- The hydrated `LessonView.progress.lastWatchedSeconds` is the persisted value at GET time (0 when no row exists).

### New endpoint

```
POST /api/learn/courses/:cid/lessons/:lid/position
  body: { seconds: number }                              // finite, non-negative
  → 200 { lastWatchedSeconds: number }                   // stored value AFTER the upsert
  → 400 INVALID_POSITION                                 // not finite, < 0, NaN, or wrong shape
  → 401                                                  // FirebaseSessionGuard
  → 403 NOT_ENROLLED_LESSON                              // owner; withdrawn; missing enrolment
  → 404 LESSON_NOT_FOUND                                 // course/lesson missing or lesson is in another course
```

Guards / filter: `@UseGuards(FirebaseSessionGuard)` (controller), `@UseGuards(LessonEnrollmentGuard)` (route — the owner-rejecting variant Slice B introduced), `@UseFilters(LearnExceptionFilter)` (controller).

Body validation: a small inline check in the controller — `typeof body.seconds === 'number' && Number.isFinite(body.seconds) && body.seconds >= 0`. On failure, throw `InvalidPositionException`. No new Nest pipe; we already validate inline elsewhere in the learn module and want to keep the dependency surface flat.

Repository behaviour (`setLastWatchedSeconds`):

- Inside a Firestore transaction on the caller's enrolment doc.
- 403 (`NotEnrolledException` → mapped by `LearnExceptionFilter` to `NotEnrolledLessonException`) if the doc is missing or `status !== 'ACTIVE'`.
- If no `LessonProgress` row for `lessonId`: insert `{ lessonId, completedAt: null, lastWatchedSeconds: seconds }`. Write enrolment `updatedAt = nowIso`.
- If a row exists with `existing.lastWatchedSeconds >= seconds`: **skip the write** and return `{ lastWatchedSeconds: existing.lastWatchedSeconds }`. Idempotent equal-write and monotonic regression are collapsed into the same no-op path. `updatedAt` is **not** bumped (same convention Slice B uses for the already-complete no-op).
- Otherwise: update the row in place, `completedAt` untouched, `lastWatchedSeconds = seconds`, bump enrolment `updatedAt`.

No upper-bound check against video duration server-side. The API has no cheap way to know duration without a Storage round-trip, and the client already clamps on read. We do cap at `Number.MAX_SAFE_INTEGER` implicitly via the `Number.isFinite` check.

New repository methods on `EnrollmentRepository`:

```ts
touchLastAccessed(
  userId: UserId,
  courseId: CourseId,
  lessonId: LessonId,
  nowIso: ISODateString,
): Promise<void>

setLastWatchedSeconds(
  userId: UserId,
  courseId: CourseId,
  lessonId: LessonId,
  seconds: number,
): Promise<{ lastWatchedSeconds: number }>
```

Both follow the `markLessonComplete` transactional shape. `touchLastAccessed` throws `NotEnrolledException` for missing/withdrawn docs — the caller (`LearnService.getLessonView`) swallows and logs.

### New error type

`libs/api-courses/src/lib/learn/errors/learn-error.codes.ts` gains `INVALID_POSITION`.
`libs/api-courses/src/lib/learn/errors/learn.exception.ts` gains `InvalidPositionException` (HTTP 400).
`learn.exception-filter.spec.ts` and `learn.exception.spec.ts` are extended.

## Web — Catalog Course-Detail CTA

`libs/web-catalog/src/lib/course-detail-page/course-detail-page.component.ts`:

- Keep `firstLessonHref` as a private computed (used as fallback).
- Add `resumeHref = computed<readonly [string, string, string] | null>(...)`:
  - Read `enrollment = enrollmentStatus()?.enrollment ?? null`.
  - If `enrollment?.lastAccessedLessonId` is non-null AND that id resolves to a lesson present in `course.modules[].lessons[]`, return `['/learn', course.id, lastAccessedLessonId] as const`.
  - Else fall through to `firstLessonHref()`.
- Add `resumeLabel = computed<'Start Learning' | 'Continue Learning'>(...)`:
  - 'Continue Learning' when `enrollment?.lastAccessedLessonId` resolves to a live lesson AND the caller is not the owner AND `enrollment.status === 'ACTIVE'`.
  - 'Start Learning' in all other cases (owner, fresh enrolment, withdrawn, stale id).
- `canStartLearning()` keeps its current semantics; the gate is unchanged.

`course-detail-page.component.html`:

```html
@if (canStartLearning()) {
  <a
    [attr.data-testid]="resumeLabel() === 'Continue Learning' ? 'continue-learning' : 'start-learning'"
    class="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-white"
    [routerLink]="resumeHref()">
    {{ resumeLabel() }}
  </a>
}
```

The `start-learning` test id is preserved when the label is Start Learning, so existing tests continue to pass without modification. A new `continue-learning` test id is added only when the label is Continue Learning.

## Web — Lesson Player Resume + Auto-Save

`libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.ts`:

- Add a computed `lastWatchedSeconds = computed<number>(() => this.view()?.progress?.lastWatchedSeconds ?? 0)`.
- Keep the existing `isOwnerPreview` guard — when true, skip every step below.
- Wire the player's events:
  - `(metadata)` → call `resumeIfNeeded(currentDuration)` once, where `resumeIfNeeded(d)` calls `player.seekTo(clamp(lastWatchedSeconds, 0, d - 5))` when `0 < lastWatchedSeconds < d`, and `player.seekTo(0)` when `lastWatchedSeconds >= d`. Set a `private hasResumed = false` flag to keep this one-shot per mount.
  - `(played)` → `saver.start(() => player.currentTime())`.
  - `(paused)` and `(ended)` → `saver.flush()`.
  - `window.addEventListener('pagehide', saver.flushBeacon)` and `document.addEventListener('visibilitychange', ...)` inside `ngOnInit`; both removed in `ngOnDestroy`.
- `ngOnDestroy` also calls `saver.stop()`.

`PositionSaver` lives in a new file `libs/web-learn/src/lib/position-saver.ts` (plain TS, not an Angular service — one instance per component mount). Constructor takes `{ learn: LearnService, courseId, lessonId, onRevoked: () => void }`.

```ts
export class PositionSaver {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastSent: number | null = null;
  private getTime: (() => number) | null = null;
  private intervalMs = 15_000;

  start(getCurrentTime: () => number): void {
    this.getTime = getCurrentTime;
    if (this.timer) return;
    this.timer = setInterval(() => void this.flush(), this.intervalMs);
  }

  async flush(): Promise<void> {
    if (!this.getTime) return;
    const seconds = Math.max(0, Math.floor(this.getTime()));
    if (this.lastSent === seconds) return;
    try {
      const { lastWatchedSeconds } = await this.learn.savePosition(this.courseId, this.lessonId, seconds);
      this.lastSent = lastWatchedSeconds;
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 403) {
        this.stop();
        this.onRevoked();
      }
      // 4xx/5xx other than 403 → leave lastSent untouched so the next tick retries.
    }
  }

  flushBeacon = (): void => {
    if (!this.getTime || typeof navigator === 'undefined') return;
    const seconds = Math.max(0, Math.floor(this.getTime()));
    if (this.lastSent === seconds) return;
    const url = `/api/learn/courses/${encodeURIComponent(this.courseId)}/lessons/${encodeURIComponent(this.lessonId)}/position`;
    const body = JSON.stringify({ seconds });
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      const ok = navigator.sendBeacon(url, blob);
      if (ok) this.lastSent = seconds;
      return;
    }
    // Fallback for environments without sendBeacon (jsdom test env, ancient browsers).
    void fetch(url, { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' } });
  };

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.getTime = null;
  }
}
```

Notes on the saver design:
- Position is stored as integer seconds. Sub-second precision is unnecessary for the 5 s tolerance the use case asks for, and integers compress the monotonic-skip path (a paused video at 12.4s and 12.6s both round to 12, suppressing the second write).
- The 15 s interval is hard-coded for this slice. A future slice can move it behind a config token if we need to tune it.
- `flush()` is fire-and-forget from the call-site perspective; the saver owns its own error handling.
- 403 from a position write fires `onRevoked`, which the component implements by setting `state.set('NOT_ENROLLED')` — same UX as Slice B's mid-session revocation banner. The saver is then `stop()`ed by `onRevoked` itself so no further ticks fire.

### `VideoPlayerComponent` extension

`libs/web-video/src/.../video-player.component.ts` gains:

- Three `output()` emitters: `(metadata)`, `(played)`, `(paused)`. Wired to the underlying `<video>` element's `loadedmetadata` / `play` / `pause` events.
- A `currentTime(): number` method that proxies to `videoRef.nativeElement.currentTime`, and a `seekTo(seconds: number): void` method that sets it.
- An `(ended)` emitter is optional — we can also bind to the `(paused)` emit since `ended` implies a final pause-like state in HLS playback; we'll add it explicitly to keep flush semantics clear.

These additions are additive; existing consumers (owner preview in `web-courses`, `web-learn` Slice A) keep working without changes.

### `LearnService` (web) extension

`libs/web-learn/src/lib/learn.service.ts`:

```ts
async savePosition(
  courseId: string,
  lessonId: string,
  seconds: number,
): Promise<{ lastWatchedSeconds: number }> {
  return firstValueFrom(
    this.http.post<{ lastWatchedSeconds: number }>(
      `/api/learn/courses/${courseId}/lessons/${lessonId}/position`,
      { seconds },
    ),
  );
}
```

Matches the shape of `markLessonComplete`. The component owns its own busy state — there is no `markBusy` analogue for position saves because they are background-silent.

## Error / Failure Modes

| Trigger                                                | Behaviour                                                                                |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `GET /learn` side-effect `touchLastAccessed` throws    | `LearnService` logs warn; returns the view normally. Resume just won't advance.          |
| `POST /position` 5xx                                   | Saver logs nothing; `lastSent` not updated; next 15 s tick retries.                      |
| `POST /position` 4xx other than 403                    | Same as 5xx — silent retry on next tick.                                                 |
| `POST /position` 403                                   | Saver stops; component switches to `NOT_ENROLLED` page state (existing Slice B banner).  |
| `POST /position` 400 INVALID_POSITION                  | Should never happen in practice; treated as 4xx (silent retry). Asserted in tests.       |
| Beacon fires on unload but server is unreachable       | No retry, by design — the user is leaving the tab.                                       |
| Player emits `loadedmetadata` but duration is `NaN/0`  | `resumeIfNeeded` no-ops (the `0 < lastWatchedSeconds < d` branch is false).              |
| `lastWatchedSeconds >= duration`                       | Seek to 0 (UC-06-03 ext 5b).                                                             |
| `lastAccessedLessonId` no longer in `course.modules`   | Catalog CTA falls back to `firstLessonHref`. `/learn` page still renders existing errors.|
| Concurrent enrolment doc writes (mark-complete + position) | Both go through Firestore transactions; one wins, the other retries. Idempotent. |

## Testing

### Repository (`enrollment.repository.spec.ts`)

New tests:
- `touchLastAccessed`:
  - Active enrolment → sets `lastAccessedLessonId`, `lastAccessedAt`; bumps `updatedAt`.
  - Withdrawn enrolment → throws `NotEnrolledException`.
  - Missing enrolment → throws `NotEnrolledException`.
  - Withdraw → re-enrol round-trip preserves `lastAccessedLessonId` set before the withdraw.
- `setLastWatchedSeconds`:
  - No row → inserts `{ completedAt: null, lastWatchedSeconds }`.
  - Existing row with smaller value → updates in place; preserves `completedAt`.
  - Existing row with equal value → no write (assert by snapshotting the doc reference).
  - Existing row with larger value (monotonic regression) → no write; returns stored value.
  - Withdrawn enrolment → throws.
  - Withdraw → re-enrol round-trip preserves `lastWatchedSeconds`.

### Service (`learn.service.spec.ts`)

- `getLessonView` for an enrolled student calls `touchLastAccessed` exactly once with the right args.
- `getLessonView` for an owner does not call `touchLastAccessed`.
- `getLessonView` returns a view even when `touchLastAccessed` rejects; rejection is logged not thrown.
- `getLessonView` returned `progress.lastWatchedSeconds` matches the row's value (0 when no row).
- New `savePosition(userId, course, lesson, seconds)` proxies to `EnrollmentRepository.setLastWatchedSeconds` and returns its result; 400 path validates inline before hitting the repo.

### Controller (`learn.controller.spec.ts`)

- `POST /position` happy path → 200 with returned `lastWatchedSeconds`.
- Body validation 400 cases: missing `seconds`, non-number, negative, NaN, Infinity.
- 401 / 403 / 404 wiring through `FirebaseSessionGuard` + `LessonEnrollmentGuard` (mirrors the mark-complete controller test shape).

### Exception & filter (`learn.exception.spec.ts`, `learn.exception-filter.spec.ts`)

- `INVALID_POSITION` is added to the codes union.
- `InvalidPositionException` maps to HTTP 400 with the standard envelope.

### Lesson player (`lesson-player-page.component.spec.ts`)

- Seek behaviour on `(metadata)`:
  - `lastWatchedSeconds = 0` → no seek.
  - `0 < lastWatchedSeconds < duration - 5` → seek exactly there.
  - `duration - 5 <= lastWatchedSeconds < duration` → seek to `duration - 5`.
  - `lastWatchedSeconds >= duration` → seek to 0.
  - Owner preview → no seek wiring at all.
- Auto-save (fake timers):
  - `(played)` → saver.start, ticks every 15 s, calls `LearnService.savePosition`.
  - `(paused)` → flush.
  - Saver dedupes equal `seconds` (no duplicate POST on a tick where time hasn't moved).
  - `pagehide` triggers `flushBeacon` (assert via spy on `navigator.sendBeacon`; jsdom fallback uses `fetch`).
  - 403 from save → `state = 'NOT_ENROLLED'`, saver stopped.
- Component-level: owner preview path emits no `savePosition` calls under any event.

### Catalog course-detail (`course-detail-page.component.spec.ts`)

- New tests:
  - Enrolled student with `lastAccessedLessonId` resolving to a live lesson → button text is **Continue Learning**, `routerLink` points to that lesson, `data-testid="continue-learning"`.
  - Enrolled student with `lastAccessedLessonId = null` → button text is **Start Learning**, `routerLink` points to first lesson, `data-testid="start-learning"`.
  - Enrolled student with `lastAccessedLessonId` not resolving (lesson deleted) → button text is **Start Learning**, points to first available lesson.
  - Owner with `lastAccessedLessonId` set on no enrolment doc → label stays **Start Learning** (owners have no enrolment).
- Existing tests continue to pass unmodified (the `start-learning` test id is preserved in the fallback case they cover).

### Web service (`learn.service.spec.ts`)

- `savePosition` POSTs to the right URL with the right body, returns the parsed payload.
- HTTP error surfaces an `HttpErrorResponse` (so the saver can branch on `.status`).

### E2E

`apps/api-e2e/src/learn.e2e-spec.ts` extensions:
- `POST /position` happy path, returns the same value on repeat (idempotent), returns the larger value on monotonic regression.
- 400 on invalid body shape.
- 403 for withdrawn enrolment.
- `GET /learn` followed by an `EnrollmentRepository.getEnrollment` read confirms `lastAccessedLessonId` was bumped (side-effect test).

`apps/web-e2e/src/learn.spec.ts` extensions:
- After opening a lesson and letting ~15 s of simulated playback elapse, reloading the page resumes from a non-zero position (asserted via the player's exposed `currentTime` after `loadedmetadata`).
- After opening a lesson, navigating back to `/catalog/:cid` shows the **Continue Learning** button.

(Per the Slice B memo, e2e tests in CI are still unproven for the new learn suite. We will run both new e2e specs locally before declaring the slice done; no additional CI quarantine added.)

## Migration / Rollout

- No backfill. Existing enrolment docs without `lastAccessedLessonId` / `lastAccessedAt` deserialise with `undefined`; the repository hydration path normalises both to `null` on read.
- No env var additions. No Cloud Storage changes. No Firestore index changes (the new fields are never queried).
- Forward-compat: Slice D (course outline) reads the same `lastAccessedLessonId` and `LessonProgress[]` shape without further schema work.

## Open Questions

None at draft time. The use case (UC-06-03) is unambiguous on all branches given the design choices already made: per-page-load access tracking, monotonic position writes, server-no-clamp-client-clamp seek policy, and client-side fallback for deleted lessons.

## Out-of-Scope Reminders

Listed here so they don't get re-litigated mid-implementation:

- No course-outline panel.
- No completion rollups.
- No "Course Completed" badge.
- No unmark / reset.
- No certificates / streaks / gamification.
- No telemetry beyond `lastWatchedSeconds`.
- No global resume across courses.
- No instructor-view position tracking.

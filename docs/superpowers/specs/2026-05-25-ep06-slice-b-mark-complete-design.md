# Mark Lesson Complete — EP-06 Slice B Design Spec

> [!NOTE]
> **DOCUMENT STATUS: APPROVED**
> Implemented in commits leading up to the merge of branch `ep06-slice-b-mark-complete` (2026-05-25).

**Status:** Approved (2026-05-25)
**Scope:** Second implementation slice of EP-06 (Learning Experience). Delivers **UC-06-02 (Mark a Lesson as Complete)** in its minimal per-lesson form: an enrolled student can mark the lesson they are watching as complete, the page reflects the new state immediately and on reload, and the completion persists across the student's `WITHDRAWN → ACTIVE` re-enrolment round-trip. Adds one write endpoint to the existing `learn/` submodule in `libs/api-courses`, extends the Slice A `LessonView` payload with the caller's per-lesson progress, and extends the `LessonPlayerPageComponent` in `libs/web-learn` with a Mark-as-Complete button and a Completed pill.

This spec sits on top of:

- `2026-05-25-ep06-slice-a-student-playback-design.md` (the `learn/` submodule, `LessonEnrollmentOrOwnerGuard`, `LearnService.getLessonView`, `LearnController` at `/api/learn/courses/:cid/lessons/:lid`, the `LessonView` interface, the `LessonPlayerPageComponent`, the `LearnService` web wrapper, and `LearnExceptionFilter`).
- `2026-05-22-ep05-slice-b-enrolment-design.md` (the `enrollments` collection keyed by `${userId}__${courseId}`, `EnrollmentRepository.{getEnrollment, isEnrolled, enroll, withdraw}`, the `LessonProgress[]` slot seeded `[]` on every new enrolment **and preserved across `WITHDRAWN → ACTIVE`**).
- `2026-05-12-course-authoring-design.md` (the `CoursesExceptionFilter` pattern, the `CoursesController`/`CoursesService`/`CoursesRepository` triad, and the established error envelope).
- `2026-05-04-auth-registration-and-login-design.md` / `2026-05-06-auth-hardening-design.md` (the `FirebaseSessionGuard`, `AuthenticatedRequest`, the signal-based web `AuthService`, the `authGuard`).

It reuses the existing per-feature `LearnExceptionFilter` (per the memory `api-courses per-feature exception filters`), the `api-firebase` Firestore handle, the `fake-firestore.ts` test double, and the web "service-as-HTTP-wrapper" pattern (per the memory `Web service-as-HTTP-wrapper pattern`: the service returns a Promise, the component owns the signal state). It introduces **no new Nx libraries**, **no new env vars**, and **no new Firestore collections, indexes, or rules**.

## Goal

A fresh clone, after `pnpm install` and `pnpm secrets:render`, running `pnpm emulators` + `pnpm start`, must satisfy:

- An **authenticated student with an `ACTIVE` enrolment** on a lesson page (`/learn/:cid/:lid`) sees a **Mark as Complete** button below the player.
- Clicking the button calls `POST /api/learn/courses/:cid/lessons/:lid/complete`, which sets `completedAt = <ISO now>` on the matching `LessonProgress` entry of the caller's enrolment doc.
- After a `200`, the button is replaced **in place** with a disabled `✓ Completed on <date>` pill.
- Reloading the page renders the pill directly (the `LessonView` GET response now exposes `progress.completedAt`).
- **Idempotency.** A second click (or a retry from an unstable network) returns the **same `completedAt`** — no Firestore write, no state regression. The pill never flickers back to "Mark as Complete".
- The endpoint is one-way. There is no "unmark" affordance; once `completedAt != null`, the pill is the terminal state from this slice's UI.
- **Re-enrolment preserves completions.** A student who withdraws (existing EP-05 Slice B endpoint) and then re-enrols sees the pill on lessons they previously completed. The `progress: []` array on the enrolment doc is preserved across the round-trip; this slice does not change that — it just exercises it.
- **Owners.** An instructor previewing their own course's lesson page sees the player and an "(Instructor preview — progress not tracked)" hint in place of the button. `POST /complete` returns `403 NOT_ENROLLED_LESSON` for owners.
- **Authorization branches** match Slice A:
  - Unauthenticated → 401 (`FirebaseSessionGuard`).
  - Authenticated, not enrolled, non-owner → 403 `NOT_ENROLLED_LESSON`.
  - Authenticated, withdrawn enrolment → 403 `NOT_ENROLLED_LESSON`.
  - Course `DRAFT` or `ARCHIVED`, caller is an enrolled non-owner → 403 (mirrors the Slice A guard).
  - Course missing, lesson missing, or lesson belongs to a different course → 404 `LESSON_NOT_FOUND`.
- **In-tab revocation.** If the student's enrolment is withdrawn from another tab between page-load and click, the `POST /complete` 403 surfaces an inline "Your enrolment is no longer active" banner on the lesson page with a link to `/catalog/:cid`. No silent failure.
- All prior-spec quality gates pass: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e`. No regression in `api-auth`, `api-courses`, `web-auth`, `web-catalog`, `web-courses`, `web-video`, `web-enrollment`, `web-learn`.

## Non-Goals

Each is owned by a subsequent EP-06 slice or another deferred work item:

- **Resume / `lastWatchedSeconds` (UC-06-03).** EP-06 Slice C. `lastWatchedSeconds` remains at `0` and is untouched by every code path in this slice. The repository write surgically targets `completedAt` only.
- **Course-outline panel (UC-06-04).** No outline sidebar, no per-lesson checkmark list, no next/prev navigation. UC-06-02 ext 3 (module-complete, course-complete) is **explicitly deferred** to whichever slice lands the outline — there is no surface to render module/course completion against until then.
- **"Course Completed" badge (UC-06-02 ext 3b).** Requires the My Courses dashboard and the course-completion read path; both still deferred.
- **Progress indicators on `/catalog/:cid` or the My Courses dashboard.** The course detail page is unchanged. A future slice may add "X of Y lessons complete" — out of scope here.
- **Unmarking.** UC-06-02 is written one-way and ext 1a says "already complete → disabled". This slice ships exactly that. No `DELETE /complete`, no toggle.
- **Owner playback progress.** Owners don't have an enrolment doc and don't get a `LessonProgress` row. The instructor preview path renders the player but has no progress affordance.
- **Cross-course rollups, certificates, streaks, gamification.** All post-MVP; not in `docs/use-cases/06-learning-experience.md`.
- **Bulk mark-complete / mark all in module.** Not in the use case. One lesson per POST.
- **The remaining 14 api-e2e video fixmes.** Slice A flipped one of them; the rest remain quarantined per `2026-05-23-fake-source-probe-seam-design.md`.

## Data Model

**No new collections, fields, indexes, or rules.** The slot this slice writes to already exists.

`LessonProgress` (in `libs/shared-data-models/src/lib/enrollment.ts`):

```ts
export interface LessonProgress {
  lessonId: LessonId;
  completedAt: ISODateString | null;   // ← this slice flips it from null to ISO; never resets
  lastWatchedSeconds: number;          // ← untouched; Slice C owns
}

export interface Enrollment {
  // ...
  progress: LessonProgress[];          // EP-05 seeded []; EP-05 already preserves across re-enrol
  // ...
}
```

The transactional write semantics:

- A `LessonProgress` row is created on first POST if absent (with `lastWatchedSeconds: 0` so the type stays totally defined; Slice C will populate it later).
- A row that exists with `completedAt: null` is updated to `completedAt: <now>`.
- A row that exists with `completedAt: <prior ISO>` is **left alone**, and the prior ISO is returned in the response (idempotency).

`LessonView` (in `libs/shared-data-models/src/lib/lesson-view.ts`) gains one additive field:

```ts
export interface LessonView {
  course: { id: CourseId; title: string; status: CourseStatus };
  lesson: {
    id: LessonId;
    moduleId: ModuleId;
    title: string;
    description: string;
    videoId: VideoId | null;
    videoState: VideoState | null;
  };
  // NEW: caller's per-lesson progress for the lesson in this URL.
  // null when the caller is the course owner (no enrolment doc).
  // { completedAt: null } when the caller is an enrolled student who has not yet
  //   completed the lesson (or has no LessonProgress row for it yet).
  // { completedAt: <ISO> } when the caller has previously marked it complete.
  progress: { completedAt: ISODateString | null } | null;
}
```

Rationale: surfacing the progress alongside the lesson read avoids a second round-trip on page load and keeps the page's "should I show the button or the pill?" decision a pure render of one payload. The shape is intentionally a narrow projection (`{ completedAt }`) rather than the full `LessonProgress` row, so Slice C can extend it without a breaking shape change.

## Backend — `libs/api-courses/src/lib/learn/` extensions

The Slice A submodule is extended in place. No new directories. Diffs:

```
libs/api-courses/src/lib/learn/
├── learn.controller.ts              (extend: new POST handler; restructure @UseGuards)
├── learn.controller.spec.ts         (extend)
├── learn.service.ts                 (extend: progress lookup in getLessonView; new markLessonComplete)
├── learn.service.spec.ts            (extend)
├── guards/
│   ├── lesson-enrollment-or-owner.guard.ts          (unchanged)
│   ├── lesson-enrollment-or-owner.guard.spec.ts     (unchanged)
│   ├── lesson-enrollment.guard.ts                   (NEW — owner-rejecting variant)
│   └── lesson-enrollment.guard.spec.ts              (NEW)
├── errors/
│   ├── learn-error.codes.ts         (extend: add 'NOT_ENROLLED_LESSON')
│   ├── learn.exception.ts           (extend: add NotEnrolledLessonException)
│   └── learn.exception.spec.ts      (extend)
└── types/
    └── lesson-scoped-request.ts     (unchanged)
```

### Endpoint

`POST /api/learn/courses/:cid/lessons/:lid/complete`

- **Auth:** `FirebaseSessionGuard`. Unauthenticated → 401.
- **Authz:** `LessonEnrollmentGuard` (new — owner-rejecting variant of the Slice A guard).
- **Request body:** empty (`{}`). The action is the URL.
- **Response:** `200 OK` with body `{ completedAt: ISODateString }`. **Always 200**, even when the lesson was already complete (idempotency) — the response carries the prior ISO in that case.
- **Errors** (through the existing `LearnExceptionFilter` + envelope):
  - `404 LESSON_NOT_FOUND` — same surface as Slice A's GET.
  - `403 NOT_ENROLLED_LESSON` — authenticated but not actively enrolled, **or** the course owner.
  - `401` — no/invalid session cookie.

`GET /api/learn/courses/:cid/lessons/:lid` (Slice A) is unchanged at the URL level but now returns the additive `progress` field on the body.

### `LessonEnrollmentGuard` (new)

A sibling of `LessonEnrollmentOrOwnerGuard`, identical for the course/lesson lookup but stricter on the allow branch. Per the brainstorming outcome ("Separate `LessonEnrollmentGuard`"), each guard is readable top-to-bottom without a flag.

```ts
@Injectable()
export class LessonEnrollmentGuard implements CanActivate {
  constructor(
    private readonly courses: CoursesRepository,
    private readonly enrollment: EnrollmentRepository,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<LessonScopedRequest>();
    const cid = req.params?.cid as CourseId | undefined;
    const lid = req.params?.lid as LessonId | undefined;
    if (!cid || !lid) throw new LessonNotFoundException();

    const course = await this.courses.getCourse(cid);
    if (!course) throw new LessonNotFoundException();

    const lesson = await this.findLessonInCourse(cid, lid);
    if (!lesson) throw new LessonNotFoundException();

    // Owner is REJECTED — owners have no enrolment to record progress against.
    if (course.instructorId === req.user?.uid) {
      throw new NotEnrolledLessonException();
    }

    // Enrolled students need course PUBLISHED. Mirrors the Slice A guard.
    if (req.user && (await this.enrollment.isEnrolled(req.user.uid, cid))) {
      if (course.status === 'PUBLISHED') {
        req.course = course;
        req.lesson = lesson;
        return true;
      }
    }

    throw new NotEnrolledLessonException();
  }

  private async findLessonInCourse(cid: CourseId, lid: LessonId): Promise<Lesson | null> {
    const modules = await this.courses.listModulesByCourse(cid);
    for (const m of modules) {
      const lesson = await this.courses.getLesson(cid, m.id, lid);
      if (lesson) return lesson;
    }
    return null;
  }
}
```

Implementation cleanup: the lesson-lookup helper (`findLessonInCourse`) is duplicated between the two guards. Extract it into a private function in a sibling file (e.g., `guards/find-lesson-in-course.ts`) and have both guards call it. This is the kind of in-line cleanup a working developer would do — it's not scope creep.

### `LearnService.getLessonView` (extension)

Signature changes to take the caller's user id so it can look up the caller's enrolment:

```ts
async getLessonView(userId: UserId, course: Course, lesson: Lesson): Promise<LessonView>
```

Body:

1. Existing video-state lookup (unchanged).
2. **NEW:** if `userId === course.instructorId`, set `progress = null`.
   Else `await enrollmentRepo.getEnrollment(userId, course.id)`:
   - If no enrolment, **also** set `progress = null` (defensive — guard should already have blocked).
   - Otherwise find the `LessonProgress` row by `lessonId`; map to `{ completedAt: row?.completedAt ?? null }`. Missing row is mapped to `{ completedAt: null }`.
3. Return the `LessonView`.

`LearnService` constructor gains `EnrollmentRepository` alongside the existing `VideoRepository`.

### `LearnService.markLessonComplete` (new)

```ts
async markLessonComplete(
  userId: UserId,
  course: Course,
  lesson: Lesson,
): Promise<{ completedAt: ISODateString }>
```

Implementation: delegates to `enrollmentRepo.markLessonComplete(userId, course.id, lesson.id, new Date().toISOString())`. The guard has already attached `course` and `lesson`; the service does not re-fetch them.

### `EnrollmentRepository.markLessonComplete` (new)

```ts
async markLessonComplete(
  userId: UserId,
  courseId: CourseId,
  lessonId: LessonId,
  nowIso: ISODateString,
): Promise<{ completedAt: ISODateString }>
```

Implementation as a Firestore transaction on `enrollments/${userId}__${courseId}`:

1. Read the enrolment doc inside the transaction.
2. If it does not exist or `status !== 'ACTIVE'`, throw `NotEnrolledLessonException`. (The guard normally prevents this; the transaction re-checks because the guard read and the write are racy.)
3. Locate the `LessonProgress` entry where `lessonId === <param>`.
   - **Absent:** push a new entry `{ lessonId, completedAt: nowIso, lastWatchedSeconds: 0 }`; commit; return `{ completedAt: nowIso }`.
   - **Present with `completedAt === null`:** update that entry's `completedAt` to `nowIso`; commit; return `{ completedAt: nowIso }`.
   - **Present with `completedAt: <prior ISO>`:** no Firestore write; return `{ completedAt: <prior ISO> }`. This makes the call idempotent at the storage layer too, not just at the API surface.
4. `updatedAt` is bumped to `nowIso` on the cases that write.

The transaction is bounded (single doc read, single doc write) and runs against the existing `enrollments/{uid}__{cid}` document — no fan-out, no contention with other writers because each enrolment doc is owned by one student.

### Controller restructure

The current Slice A controller decorates the class with `@UseGuards(FirebaseSessionGuard, LessonEnrollmentOrOwnerGuard)`. Nest concatenates class-level and method-level guards rather than overriding, so a sibling `POST` that needs a *different* second guard would otherwise run both. The clean fix is to move the second guard from class-level to method-level:

```ts
@Controller('learn')
@UseFilters(LearnExceptionFilter)
@UseGuards(FirebaseSessionGuard)   // session check stays at class level — applies to both methods
export class LearnController {
  constructor(private readonly service: LearnService) {}

  @Get('courses/:cid/lessons/:lid')
  @UseGuards(LessonEnrollmentOrOwnerGuard)
  async getLesson(@Req() req: LessonScopedRequest): Promise<LessonView> {
    if (!req.course || !req.lesson) throw new Error('LearnController: guard did not attach course/lesson');
    return this.service.getLessonView(req.user.uid as UserId, req.course, req.lesson);
  }

  @Post('courses/:cid/lessons/:lid/complete')
  @HttpCode(200)
  @UseGuards(LessonEnrollmentGuard)
  async markComplete(@Req() req: LessonScopedRequest): Promise<{ completedAt: ISODateString }> {
    if (!req.course || !req.lesson) throw new Error('LearnController: guard did not attach course/lesson');
    return this.service.markLessonComplete(req.user.uid as UserId, req.course, req.lesson);
  }
}
```

The class-level move is a behavioural no-op for the GET endpoint — the same two guards run in the same order. Nest's POST handler defaults to 201; `@HttpCode(200)` keeps the response consistent with idempotent "this was already true" semantics (the slice never creates anything new from the client's vantage point — it commits an idempotent state transition).

### Module wiring

`LearnController` already lives in `CoursesModule`. The new providers added:

- `LessonEnrollmentGuard` (alongside the existing `LessonEnrollmentOrOwnerGuard`).

`EnrollmentRepository` is already provided by `CoursesModule` (EP-05 Slice B); no new repository imports are needed.

### Error envelope

`LEARN_ERROR_CODES` grows by one:

```ts
export const LEARN_ERROR_CODES = ['LESSON_NOT_FOUND', 'NOT_LESSON_OWNER', 'NOT_ENROLLED_LESSON'] as const;
```

`NotEnrolledLessonException` extends the same base used by `NotLessonOwnerException`, surfaces as HTTP 403, and renders through the existing `LearnExceptionFilter` with no filter changes (the filter dispatches by error class, not by code — verify on implementation; if the filter is code-string-based, add the new code to its mapping).

### Tests

- **`enrollment.repository.spec.ts`** (extend) — `markLessonComplete`:
  - Appends a new `LessonProgress` row when none exists; returns the `nowIso`.
  - Updates `completedAt` on an existing row with `completedAt: null`; returns `nowIso`.
  - Returns the prior `completedAt` and writes nothing when already complete (assert via fake-firestore write counter or by snapshotting `updatedAt` and confirming it did not change).
  - Throws `NotEnrolledLessonException` on missing enrolment doc.
  - Throws `NotEnrolledLessonException` on `WITHDRAWN` enrolment.
  - Preserves `lastWatchedSeconds` when present on the row (does not reset to 0).
  - Does not touch unrelated `LessonProgress` rows in the same array.

- **`lesson-enrollment.guard.spec.ts`** (new):
  - Owner of PUBLISHED course → deny `NOT_ENROLLED_LESSON` (owners are excluded from this endpoint).
  - Owner of DRAFT course → deny `NOT_ENROLLED_LESSON`.
  - Enrolled student + PUBLISHED → allow; `req.course` and `req.lesson` attached.
  - Enrolled student + DRAFT → deny.
  - Enrolled student + ARCHIVED → deny.
  - Not-enrolled, non-owner → deny.
  - WITHDRAWN enrolment → deny.
  - Missing course → `LESSON_NOT_FOUND`.
  - Missing lesson → `LESSON_NOT_FOUND`.
  - Lesson belongs to a different course → `LESSON_NOT_FOUND`.

- **`learn.service.spec.ts`** (extend):
  - `getLessonView` returns `progress: null` when the caller is the course owner.
  - `getLessonView` returns `progress: { completedAt: null }` for an enrolled student with no matching `LessonProgress` row.
  - `getLessonView` returns `progress: { completedAt: '<iso>' }` for an enrolled student whose row has a prior completion.
  - `markLessonComplete` returns the repository's `{ completedAt }` verbatim.

- **`learn.controller.spec.ts`** (extend):
  - POST happy path 200 + `{ completedAt }`.
  - POST is idempotent: two calls return the same `completedAt`.
  - POST 403 for an owner.
  - POST 403 for an unenrolled caller.
  - GET response now carries `progress` for enrolled student and `progress: null` for owner.

- **`learn.exception.spec.ts`** (extend) — `NotEnrolledLessonException` round-trips through the envelope with status 403 and code `NOT_ENROLLED_LESSON`.

### api-e2e

`apps/api-e2e/src/learn.e2e-spec.ts` (extending the Slice A file):

- POST `/api/learn/courses/:cid/lessons/:lid/complete` as an enrolled student → 200, `{ completedAt }` is a valid ISO string.
- POST again → 200 with **the same** `completedAt`.
- Subsequent GET reflects `progress.completedAt = <iso>`.
- POST after `DELETE /api/enrollments/:cid` (the EP-05 Slice B withdraw endpoint) → 403 `NOT_ENROLLED_LESSON`.
- Re-enroll (`POST /api/enrollments` again) → GET returns the same `progress.completedAt` (preservation across `WITHDRAWN → ACTIVE`).
- POST as the course owner → 403 `NOT_ENROLLED_LESSON`.
- POST unauthenticated → 401.
- POST against a lesson that belongs to a different course → 404 `LESSON_NOT_FOUND`.
- POST against a course in `DRAFT` (instructor unpublished mid-test) by an enrolled student → 403.

## Frontend — `libs/web-learn` extensions

### `LearnService` (extension)

Per the `Web service-as-HTTP-wrapper pattern` memory, the service stays a thin HTTP wrapper that returns a Promise. The component owns the signal state for both the cached `LessonView` and the in-flight Mark-as-Complete request.

Existing Slice A method (kept):

```ts
loadLesson(courseId: CourseId, lessonId: LessonId): Promise<LessonView>
```

New method:

```ts
markLessonComplete(
  courseId: CourseId,
  lessonId: LessonId,
): Promise<{ completedAt: ISODateString }>
```

Implementation: `firstValueFrom(this.http.post<{ completedAt: ISODateString }>(...))`, with `withCredentials: true`, mirroring `loadLesson`. The service does not catch or branch on `HttpErrorResponse` — the component handles status codes via the rejected promise.

### `LessonPlayerPageComponent`

New signal-owned state on the component:

```ts
// existing from Slice A:
//   lessonView = signal<RemoteData<LessonView>>({ kind: 'idle' });
//   playerFatal = signal(false);

// NEW:
completedAt = signal<ISODateString | null>(null);  // hydrated from the loaded LessonView
isOwnerPreview = signal(false);                    // hydrated from LessonView.progress === null
markBusy = signal(false);
markError = signal<null | 'revoked' | 'other'>(null);
```

After `loadLesson` resolves, the component sets:

```ts
this.completedAt.set(view.progress?.completedAt ?? null);
this.isOwnerPreview.set(view.progress === null);
```

Template additions (inside the `lessonView() === 'ok'` branch, below the player but above the "← Back to course" link):

```html
<section class="lesson-progress">
  @if (isOwnerPreview()) {
    <p class="hint">(Instructor preview — progress not tracked)</p>
  } @else if (completedAt()) {
    <span class="completed-pill" aria-disabled="true">
      ✓ Completed on {{ completedAt() | date: 'mediumDate' }}
    </span>
  } @else {
    <button
      type="button"
      class="primary"
      [disabled]="markBusy()"
      (click)="onMarkComplete()"
    >
      {{ markBusy() ? 'Marking…' : 'Mark as Complete' }}
    </button>
  }

  @if (markError() === 'revoked') {
    <p class="banner banner-warn">
      Your enrolment is no longer active.
      <a [routerLink]="['/catalog', courseId()]">Back to course</a>
    </p>
  } @else if (markError() === 'other') {
    <p class="banner banner-error">
      Something went wrong. <button (click)="onMarkComplete()">Retry</button>
    </p>
  }
</section>
```

Handler:

```ts
async onMarkComplete(): Promise<void> {
  this.markBusy.set(true);
  this.markError.set(null);
  try {
    const { completedAt } = await this.learn.markLessonComplete(this.courseId(), this.lessonId());
    this.completedAt.set(completedAt);
  } catch (err) {
    const status = (err as HttpErrorResponse)?.status;
    this.markError.set(status === 403 ? 'revoked' : 'other');
  } finally {
    this.markBusy.set(false);
  }
}
```

The optimistic "swap in place" is just the order of operations: the `completedAt.set(...)` runs synchronously after the await, and the template's `@if/@else if/@else` re-renders into the pill branch on the next change-detection tick.

### `web-catalog` and other libs

No changes. The course detail page does not display per-lesson completion. The Start Learning button from Slice A continues to link to the first lesson regardless of completion state (per the Slice A spec; "Continue Learning" lands with UC-06-03).

### Tests

- **`learn.service.spec.ts`** (extend, Vitest + `HttpTestingController`):
  - `markLessonComplete` POSTs to the correct URL with `withCredentials` and an empty body; resolves with the server payload.
  - 403 rejection surfaces an `HttpErrorResponse` with `status === 403`.

- **`lesson-player-page.component.spec.ts`** (extend, TestBed):
  - Renders "Mark as Complete" when payload has `progress.completedAt == null`.
  - Clicking the button calls the service, then swaps to the `Completed on <date>` pill.
  - Renders the pill on initial load when payload starts with `progress.completedAt: '<iso>'`.
  - Renders the "(Instructor preview)" hint when payload has `progress: null`.
  - 403 from the service surfaces the "Your enrolment is no longer active" banner with a `/catalog/:cid` link.
  - Other errors surface the generic banner with a Retry button that re-invokes the handler.
  - Button is disabled while `markBusy()` is true.

### web-e2e

`apps/web-e2e/src/learn.e2e-spec.ts` is extended (not replaced):

3. **Mark complete happy path.** Student enrols + opens the lesson page (reuses scenario 1 setup), clicks **Mark as Complete**, asserts the pill text contains "Completed on", reloads the page, asserts the pill is still there.
4. **Owner preview.** Instructor logs in, navigates directly to `/learn/:cid/:lid` for their own DRAFT course, asserts the player renders and the "(Instructor preview — progress not tracked)" hint is present in place of the button.

The auth-redirect scenario from Slice A (scenario 2) is unaffected.

## Nx workspace changes

- No new libraries.
- No new Nx module-boundary edges.
- No changes to `nx.json`, `pnpm-workspace.yaml`, `firebase.json`, `firestore.indexes.json`, `firestore.rules`, or any environment template.

## Quality gates

Pre-merge: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e`, `pnpm affected`. CRAP / mutation reports (`pnpm crap`, `pnpm mutate:api-courses`) already cover the `learn/` and `enrollment/` submodules — no target configuration changes.

No regression is permitted in `api-auth`, `api-courses`, `web-auth`, `web-catalog`, `web-courses`, `web-video`, `web-enrollment`, or `web-learn`.

## Documentation updates (as part of this slice)

- **`README.md`** — add `POST /api/learn/courses/:cid/lessons/:lid/complete` to the endpoints table; add an EP-06 Slice B row to the "what is wired up today" callout.
- **`docs/USER_GUIDE.md`** — extend the "Watch a lesson as an enrolled student" section with a Mark-as-Complete walkthrough (click button → pill renders → reload preserves it → re-enroll preserves it).
- **`docs/quality/spec-drift-report.md`** — EP-06 section: UC-06-02 transitions from "Deferred" → "Built (2026-05-25)". UC-06-03 and UC-06-04 remain deferred and are explicitly named as upcoming slices.

## Out-of-scope risks acknowledged

- **Concurrent clicks across tabs.** A second tab loaded *before* the first tab's POST completes will still render the Mark-as-Complete button. When that tab's user clicks it, the storage-layer idempotency makes the call a no-op (same `completedAt` returned), and the page swaps to the pill. Acceptable. No cross-tab broadcast channel in this slice.
- **Clock skew.** `nowIso` is server-side (the API process's wall clock). Firestore does not stamp the field server-side because the value lives inside an array element, which `serverTimestamp()` cannot target. Skew between API replicas is bounded by infrastructure-level NTP and is below the displayed precision (`mediumDate` granularity in the UI).
- **`LearnExceptionFilter` dispatch surface.** The current filter implementation is verified against the new `NotEnrolledLessonException` during implementation; if it dispatches by string code rather than by class, the new code is added to its mapping. Both styles are minimally invasive.
- **`LessonView.progress` consumers.** Slice A's web-e2e and component specs do not assert on the previously-absent `progress` field. Adding it is purely additive; existing tests continue to pass without modification.
- **Owners with stale enrolment docs from a prior role.** Not a real risk in the current data model — owners are determined by `course.instructorId`, not by an enrolment row. The guard checks ownership first and rejects, so even a stray `enrollments/{ownerUid}__{cid}` doc would not let the owner POST.

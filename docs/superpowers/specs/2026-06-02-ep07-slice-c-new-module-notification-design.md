> [!NOTE]
> **DOCUMENT STATUS: DRAFT**
> This document is a living specification and is subject to change. All content is considered provisional until formally approved by project stakeholders.

# EP-07 Slice C: New-Module Notification (US-07-03)

## Goal

When an instructor adds a new module's worth of content to a **published** course, the enrolled students should learn about it. This slice delivers that single capability: an explicit, owner-triggered **"Notify enrolled students"** action on a module that emails every active enrollee, exactly once per module.

This is the **final slice of EP-07** and the last unbuilt piece of US-07-03. The story's other acceptance criteria (edit title/description/cover, add modules/lessons, replace a lesson video through the existing pipeline, update/remove materials) are **already satisfied** by today's un-gated CRUD — `courses.service.ts` only sets `DRAFT` at creation and never blocks edits on a `PUBLISHED` course, video replacement re-runs the transcode/DRM pipeline, and materials are editable at any time. The *only* unbuilt requirement is the last AC: *"Enrolled students are not notified of minor edits, but are notified when a new module is added."*

## US-07-03 Acceptance Criteria → this design

| Acceptance Criterion | Status | Where addressed |
| :--- | :--- | :--- |
| Edit course title, description, and cover image at any time | Already shipped (pre-existing CRUD) | — |
| Add new modules and lessons to a published course | Already shipped (pre-existing CRUD) | — |
| Replace a lesson video; new video goes through transcode/DRM before students see it | Already shipped (EP-03 pipeline) | — |
| Update or remove lesson materials at any time | Already shipped (EP-04) | — |
| Students are **not** notified of minor edits | This slice (by omission) | §6 Non-Goals — only the explicit notify action sends mail; no edit path triggers email |
| Students **are** notified when a new module is added | **This slice** | §1–§5 |

> The AC says "when a new module is **added**." Instructors create an empty module shell first and fill it with lessons over time, so firing on raw creation would email students a link to an empty module. We therefore reframe the trigger to **"when a new module is announced"** — an explicit instructor action taken once the module is ready. This honours the AC's intent (students learn about substantive new content) without the empty-module and rapid-fire-edit failure modes.

## Decisions Made During Brainstorming

| # | Decision | Rationale |
| :--- | :--- | :--- |
| 1 | **Explicit "Notify enrolled students" action**, not automatic on creation | Instructors build the module shell first; an explicit, one-shot action avoids emailing about empty modules and avoids spam from rapid edits. Gives the instructor control over timing. |
| 2 | **Email only** — reuse the existing `EmailTransport` seam | No in-app notification surface exists anywhere in the platform (no bell, feed, unread counts, or `notifications` collection). Email is the established and only channel. |
| 3 | **Inline best-effort fan-out + returned sent count** | Matches the existing email pattern (try/catch, log, never fail the request). The instructor gets immediate "Notified N students" feedback. No queue, no retries. |
| 4 | **Minimal email content** — course + module title + a link | Shortest to build; makes no assumptions about whether the module's lessons/videos are fully ready. |
| 5 | **Dedicated `notifications/` submodule in `api-courses`** | Matches how Slices A (`roster/`) and B (`analytics/`) were built. Keeps `CoursesService` lean; reuses `CourseOwnerGuard` + `CoursesExceptionFilter`. |
| 6 | **One-shot per module** via a `studentsNotifiedAt` stamp | Idempotency + drives the button state. Adding more lessons to an already-announced module does not re-notify. |
| 7 | **Require ≥ 1 lesson before announcing** | The email links straight to the module; announcing an empty one is a user error worth guarding (client-disabled + server backstop). |
| 8 | **At-most-once delivery** — stamp on *attempt* | Stamping `studentsNotifiedAt` once the action runs guarantees we never re-send and re-spam. A handful of failed recipients are logged, not retried (consistent with best-effort, no-queue). |

## Scope & Non-Goals

**In scope:** one owner-only endpoint, one new email type (two adapter impls), one `Module` field, one editor control, the typed errors, and the tests.

**Non-goals (explicitly deferred):**

- **No in-app notification surface** — no bell/feed/unread counts; none exists today.
- **No student opt-out / notification preferences** — no infrastructure exists on `User` or `Enrollment`; course-update emails are treated as transactional. Deferred to a future notifications-preferences capability.
- **No retries / queue / large-cohort scaling** — best-effort inline fan-out only. A course with thousands of enrollees is a documented limitation; moving the fan-out to a background worker (Cloud Tasks / Firestore-triggered Function) is future work.
- **No audit log / announcement history** — only the `studentsNotifiedAt` stamp is recorded; no per-recipient delivery log.
- **No re-notify** — one-shot per module; later additions to an announced module do not send a second email.
- **No notification for "minor edits"** — title/description/cover/lesson/material/video-replace changes send nothing (this is the AC's "not notified of minor edits", satisfied by omission).
- **No deep link** into the specific module — the email links to the course.
- **No lesson list in the email** — minimal content only.

## 1. Behaviour & Trigger

New endpoint, owner-only:

```
POST /api/courses/:cid/modules/:mid/notify   →  200  { notifiedCount: number }
```

**Preconditions** (each enforced and mapped to a typed exception — see §5):

1. Course exists and is owned by the caller — `CourseOwnerGuard` (existing; sets `req.course`).
2. Course `status === 'PUBLISHED'` — otherwise `CourseNotPublishedForNotifyException`.
3. Module `:mid` exists and belongs to course `:cid` — otherwise `ModuleNotFoundException`.
4. Module has **≥ 1 lesson** — otherwise `ModuleHasNoLessonsException`.
5. Module not already announced (`studentsNotifiedAt` is unset) — otherwise `ModuleAlreadyNotifiedException`.

**Action (on all preconditions passing):**

1. List active enrollees — `EnrollmentRepository.listActiveByCourse(cid)` (`status === 'ACTIVE'`).
2. Resolve each enrollee's email via a direct `users/{uid}` read (the roster pattern). Enrollees with a missing/empty email are skipped and logged.
3. Fan out concurrently via `Promise.allSettled`, calling `EMAIL_TRANSPORT.sendNewModuleEmail(...)` per recipient. A rejected send is logged at `error`, never fatal.
4. **Stamp `module.studentsNotifiedAt = nowIso()`** regardless of individual send outcomes (at-most-once — Decision 8).
5. Return `{ notifiedCount }`, where `notifiedCount` is the number of recipients successfully handed to the transport (the `allSettled` fulfilled count). This drives the confirmation toast.

## 2. Shared Types

In `libs/shared-data-models`:

```typescript
// module.ts — add the optional stamp, mirroring Course.publishedAt? / archivedAt?
export interface Module {
  id: ModuleId;
  courseId: CourseId;
  title: string;
  order: number;
  studentsNotifiedAt?: ISODateString; // slice C — set once when enrolled students are emailed about this module
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// result returned by the notify endpoint (lives alongside CourseRosterView / CourseAnalyticsView)
export interface NotifyModuleResult {
  notifiedCount: number;
}
```

In `libs/api-auth/.../email-transport/email-transport.ts` (where the other `*EmailInput` types live):

```typescript
export interface NewModuleEmailInput {
  to: string;
  studentName: string;
  courseTitle: string;
  moduleTitle: string;
  courseUrl: string; // absolute; built by the service from the existing web base-URL config
}
```

> The service builds `courseUrl` exactly like the existing emails do: an inline `continueUrl(path)` helper reading `process.env['LEARNWREN_PUBLIC_URL'] ?? 'http://localhost:4200'` (this is a duplicated convention — `account-recovery.service.ts` and `email-change.service.ts` each carry their own copy; there is no shared util, so inline it). The link targets the course's **landing/detail page `/catalog/{courseId}`** — the student's entry point to (re)start the course, which itself renders the resume-into-`/learn` CTA. (The `/learn` route is `learn/:courseId/:lessonId` and requires a specific lesson id; since the approved content decision is to link to *the course* rather than deep-link a module, `/catalog/:id` is the correct, robust target.) So `courseUrl = this.continueUrl('/catalog/' + course.id)`.

## 3. API — `libs/api-courses/src/lib/notifications/`

New submodule, parallel to `roster/` and `analytics/`. **No** separate Nest module and **no** separate exception filter — register the controller + service in `CoursesModule` and reuse `CoursesExceptionFilter`, mirroring the decorators on `RosterController` / `AnalyticsController`.

### 3.1 `module-notification.controller.ts`

```typescript
@Controller('courses')
@UseFilters(CoursesExceptionFilter)
export class ModuleNotificationController {
  constructor(private readonly service: ModuleNotificationService) {}

  @Post(':cid/modules/:mid/notify')
  @UseGuards(CourseOwnerGuard)
  async notify(
    @Param('cid') cid: CourseId,
    @Param('mid') mid: ModuleId,
  ): Promise<NotifyModuleResult> {
    return this.service.notifyNewModule(cid, mid);
  }
}
```

*(Match the exact `@UseFilters` / `@UseGuards` placement used by the existing roster/analytics controllers — whether the filter is class-level or method-level should be consistent with them.)*

### 3.2 `module-notification.service.ts`

Injects `CoursesRepository`, `EnrollmentRepository`, and `@Inject(EMAIL_TRANSPORT) EmailTransport`. `EMAIL_TRANSPORT` is already exported by `AuthModule`, which `CoursesModule` imports (api-profile injects it the same way), so no wiring change beyond registration is required.

```typescript
async notifyNewModule(cid: CourseId, mid: ModuleId): Promise<NotifyModuleResult> {
  const course = await this.repo.getCourse(cid);
  if (!course) throw new CourseNotFoundException();
  if (course.status !== 'PUBLISHED') throw new CourseNotPublishedForNotifyException();

  const module = await this.repo.getModule(cid, mid);
  if (!module) throw new ModuleNotFoundException();
  if (module.studentsNotifiedAt) throw new ModuleAlreadyNotifiedException();

  const lessons = await this.repo.listLessonsByModule(cid, mid);
  if (lessons.length === 0) throw new ModuleHasNoLessonsException();

  const enrollees = await this.enrollments.listActiveByCourse(cid);
  const recipients = await this.resolveEmails(enrollees); // users/{uid}; skip + log empties

  const settled = await Promise.allSettled(
    recipients.map((r) =>
      this.email.sendNewModuleEmail({
        to: r.email,
        studentName: r.displayName,
        courseTitle: course.title,
        moduleTitle: module.title,
        courseUrl: this.buildCourseUrl(cid),
      }),
    ),
  );
  // log rejections (best-effort); never throw

  await this.repo.markModuleNotified(cid, mid, nowIso());
  return { notifiedCount: settled.filter((s) => s.status === 'fulfilled').length };
}
```

### 3.3 Repository helpers (`courses.repository.ts`)

Reuse if present, otherwise add (the repo already has `modulesCol` / `moduleRef` / `listLessonsByModuleInTxn`):

- `getModule(cid, mid): Promise<Module | undefined>`
- `listLessonsByModule(cid, mid): Promise<Lesson[]>` (non-transactional sibling of the existing in-txn variant)
- `markModuleNotified(cid, mid, iso): Promise<void>` — sets `studentsNotifiedAt` and bumps `updatedAt`.

Email resolution mirrors `RosterService`'s `users/{uid}` read. Optionally extract a tiny shared profile-email reader, but that refactor is **deferred** — the notification service may read directly to avoid coupling to `RosterService` internals.

## 4. Email transport — `libs/api-auth/.../email-transport/`

Add one method to the `EmailTransport` interface and implement it in **both** adapters (the exact 2-adapter extension the instructor-application emails followed):

```typescript
// email-transport.ts
sendNewModuleEmail(input: NewModuleEmailInput): Promise<void>;
```

- `ConsoleEmailTransport` — log + push to the bounded in-memory outbox (so tests can assert via `lastSentTo()`).
- `SmtpEmailTransport` — subject `New module in "{courseTitle}"`; plain-text body greeting `studentName`, stating that **{moduleTitle}** was added to **{courseTitle}**, with a "continue learning" link to `courseUrl`. Plain text only, consistent with the other emails.

## 5. Error Handling

All exceptions are `{ code, status, details? }`-shaped domain exceptions (subclasses of `CoursesException`), thrown by the guard/service and rendered by `CoursesExceptionFilter` → `handleException` in `@learnwren/api-http-errors`. Do **not** re-hand-roll status/validation/fallback rendering. There is no request body, so the global `ValidationPipe` surface is limited to the branded-string path params.

| Condition | Exception | `code` | HTTP |
| :--- | :--- | :--- | :--- |
| Course not found | `CourseNotFoundException` (existing, guard) | `COURSE_NOT_FOUND` | 404 |
| Caller is not the owner | `NotCourseOwnerException` (existing, guard) | `NOT_COURSE_OWNER` | 403 |
| Module not found / not in course | `ModuleNotFoundException` (reuse or add) | `MODULE_NOT_FOUND` | 404 |
| Course not `PUBLISHED` | `CourseNotPublishedForNotifyException` | `COURSE_NOT_PUBLISHED_FOR_NOTIFY` | 409 |
| Module has no lessons | `ModuleHasNoLessonsException` | `MODULE_HAS_NO_LESSONS` | 409 |
| Module already announced | `ModuleAlreadyNotifiedException` | `MODULE_ALREADY_NOTIFIED` | 409 |

New exceptions live in `api-courses/.../errors/` next to the existing courses exceptions and are already covered by `CoursesExceptionFilter`'s `@Catch(CoursesException, ...)`.

## 6. Web — `libs/web-courses/` course editor

In the editor's module list, each module row gains a state-gated control:

- **Course `status !== 'PUBLISHED'`** → no control (notifications only apply to live courses).
- **`module.studentsNotifiedAt` set** → static, disabled label: *"Students notified on {date}"*.
- **Otherwise** → a **"Notify students"** button; disabled with a hint when the module has no lessons (mirrors server precondition #4).

Service method (a thin Promise-returning HTTP wrapper, per the established web-service pattern — the **component** owns the signal state):

```typescript
notifyModule(cid: CourseId, mid: ModuleId): Promise<NotifyModuleResult> {
  return firstValueFrom(this.http.post<NotifyModuleResult>(
    `/api/courses/${cid}/modules/${mid}/notify`, {},
  ));
}
```

The component holds a per-module `notifying` signal and the resulting `studentsNotifiedAt`. On success → reuse the editor's existing toast/notice mechanism for *"Notified {notifiedCount} students"* and flip local state so the button becomes the disabled "notified on …" label. On a typed error → render the mapped message via the same notice mechanism.

## 7. Testing & Verification

- **Service unit (vitest):** published gate; module-belongs-to-course; empty-module guard; already-notified idempotency; fan-out calls the transport once per active enrollee; **best-effort** (one send rejects → others still sent, stamp still written, `notifiedCount` = successes); enrollees with no email skipped; correct count returned.
- **Console transport unit:** `sendNewModuleEmail` lands in the outbox / `lastSentTo()`.
- **api-e2e (emulator + console transport):** owner notifies a published, non-empty, not-yet-notified module → 200 + count; non-owner → 403; draft course → 409 (`COURSE_NOT_PUBLISHED_FOR_NOTIFY`); empty module → 409 (`MODULE_HAS_NO_LESSONS`); second call → 409 (`MODULE_ALREADY_NOTIFIED`).
- **Web component:** button-visibility matrix (published × not-notified × has-lessons); disabled-when-empty; click → service called → toast + state flip; error path. Cover the service method (new Angular OnPush components arrive mutation-weak — cover all button states + both branches).
- **Mutation:** hold the ≥ 80% adjusted bar across the touched libs; the best-effort `notifiedCount` reduction is a known mutation hotspot — assert the exact count, not just "> 0".
- **Manual (`pnpm emulators` + console transport):** publish a course, enrol a student, add a module + lesson, click **Notify**, observe the logged email and the toast.

## 8. Implementation Decomposition

1. **shared-data-models** — add `Module.studentsNotifiedAt?` and `NotifyModuleResult`. (Compile-guard: a required field would silently break `api-courses` tsc under vitest — keep it optional.)
2. **api-auth** — add `sendNewModuleEmail` + `NewModuleEmailInput` to the interface and both adapters; transport unit test.
3. **api-courses repo** — add `getModule`, `listLessonsByModule`, `markModuleNotified`.
4. **api-courses errors** — add the four new exceptions (reuse `ModuleNotFoundException` if present).
5. **api-courses `notifications/`** — `ModuleNotificationService` + `ModuleNotificationController`; register in `CoursesModule`; service unit tests.
6. **api-e2e** — the five-case scenario above.
7. **web-courses** — service method + editor module-row control + component tests.
8. **Docs + memory** — README Slice-C bullet, `docs/USER_GUIDE.md`, and the EP-07 closing memory.

## 9. EP-07 status after this slice

Slice A (roster) + Slice B (analytics) + **Slice C (new-module notification)** complete US-07-01, US-07-02, and US-07-03 — **EP-07 (Instructor Dashboard) closes** with this slice. Remaining post-MVP epics: EP-08 (Platform Administration — US-08-01/02/04 still deferred) and EP-09 (Non-Functional Requirements — captions shipped as the first slice).

## References

- Epic & story: `docs/epics/07-instructor-dashboard.md` (US-07-03).
- Slice inventory: `docs/superpowers/specs/2026-06-01-ep07-slice-a-enrolled-students-design.md` §"EP-07 Slice Inventory".
- Prior slices: `docs/superpowers/specs/2026-06-01-ep07-slice-b-course-analytics-design.md`.
- Email seam: `libs/api-auth/src/lib/email-transport/` (`EmailTransport`, `ConsoleEmailTransport`, `SmtpEmailTransport`, `EMAIL_TRANSPORT`).
- Reuse patterns: per-feature exception filter delegating to `@learnwren/api-http-errors` `handleException`; `CourseOwnerGuard`; `EnrollmentRepository.listActiveByCourse`; the roster `users/{uid}` email read.
- Data models: `libs/shared-data-models/src/lib/{course,module,lesson,enrollment}.ts`.

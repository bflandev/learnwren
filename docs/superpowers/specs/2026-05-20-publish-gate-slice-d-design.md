# Course Publish Gate — EP-03 Slice D Design Spec

> [!NOTE]
> **DOCUMENT STATUS: DRAFT**
> This document is a living specification and is subject to change. All content is considered provisional until formally approved by project stakeholders.

**Status:** Draft (2026-05-20)
**Scope:** Fourth and final implementation slice of EP-03 (Video Management and DRM) per the architecture spec sub-slice sequence (A → B → C → D). Delivers the deferred US-02-04 / UC-02-04 — instructor publishes, unpublishes, archives, and restores a course — now buildable because every lesson can finally reach `Video.state === 'READY'` (slice C). Adds five new endpoints on `libs/api-courses` (preview + four transition verbs), a publish bar + eligibility checklist panel in `libs/web-courses`, and uses the existing `libs/api-courses → libs/api-video` Nx edge to read `Video.state` per lesson. Catalogue visibility (EP-05), enrolled-student playback (EP-06), audit log, live cross-tab sync, optimistic UI, and editor lockout on ARCHIVED remain explicitly deferred.

This spec sits on top of:

- `2026-05-12-course-authoring-design.md` (EP-02 slice — `Course → Module → Lesson` hierarchy, `CourseOwnerGuard`, instructor role model, exception filter, editor page).
- `2026-05-13-video-pipeline-architecture-design.md` (architecture decision spec — sub-slice sequence, `Video` entity, output ladder).
- `2026-05-13-video-upload-slice-a-design.md` (slice A — `Video` lifecycle, cascade-delete, `libs/api-courses → libs/api-video` Nx edge, `VideoRepository.findById` shape).
- `2026-05-13-video-transcoding-slice-b-design.md` (slice B — `Video.state` transitions to `READY` / `FAILED`).
- `2026-05-14-video-playback-slice-c-design.md` (slice C — owner playback in editor, `VideoStatePollingService` reaching `READY` is the trigger for the bar's debounced refresh).

It reuses the existing `FirebaseSessionGuard` + `InstructorRoleGuard` + `CourseOwnerGuard` auth chain, the existing error envelope, the EP-02 confirmation-dialog pattern, the slice-A/B/C testing posture, and the existing Nx graph. No new libraries, no new Nx edges, no new env vars, no Firestore rules changes, no new indexes.

## Goal

A fresh clone, after `pnpm install`, `pnpm secrets:render`, and the slice-A/B/C provisioning (no new provisioning), must satisfy:

- A promoted instructor (`pnpm tools:promote-to-instructor`) creates a course, adds at least one module with at least one lesson, uploads a video that reaches `READY`, and sees the publish bar's eligibility panel flip from "things to fix" to "Ready to publish".
- Clicking **Publish** transitions `Course.status` from `'DRAFT'` to `'PUBLISHED'`, populates `Course.publishedAt`, flips the status pill, and surfaces a `"Course published"` toast. The bar's primary action becomes **Unpublish…**.
- Clicking **Unpublish…** opens a confirmation dialog (matching the EP-02 delete pattern); confirming returns the course to `'DRAFT'`. `Course.publishedAt` is preserved.
- Clicking **Archive course…** from either `DRAFT` or `PUBLISHED` opens a confirmation dialog; confirming sets `Course.status = 'ARCHIVED'` and populates `Course.archivedAt`. The bar's primary action becomes **Restore to draft**.
- Clicking **Restore to draft** returns the course to `'DRAFT'` and clears `Course.archivedAt`. The eligibility panel reappears.
- When the course does not meet publish requirements, the eligibility panel shows a per-lesson breakdown (Module 2 "Materials" has no lessons; Module 3 › Lesson 1 "Setup" — video is transcoding; Module 3 › Lesson 2 "Practice" — no video uploaded). The Publish button is disabled with a tooltip pointing at the panel. `LESSON_VIDEO_NOT_READY` reasons whose `currentState` is `'FAILED'` get a "Jump to lesson" link so the instructor can re-upload; reasons with `currentState` of `'TRANSCODING'` or `'UPLOADING'` omit the link (instructor can only wait).
- A second instructor opening the same course's URL receives `403 NOT_COURSE_OWNER` on every new endpoint (existing guard). An unauthenticated request receives `401`.
- Two parallel publish requests on the same DRAFT course produce one success and one `409 INVALID_TRANSITION` (Firestore transaction serialisation).
- `courses/**` Firestore paths stay deny-all from the client. All transitions go through `libs/api-courses`.
- All prior-spec quality gates pass: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e`, `pnpm start`, `pnpm emulators`, `pnpm secrets:render`, `pnpm secrets:run`. No regression in `api-auth`, `api-video`, `web-auth`, `web-video`, or slices A / B / C.
- Mutation testing on `libs/api-courses` matches the slice A/B/C bar: ≥ 85 % effective. Raw Stryker output refreshed in `reports/mutation/api-courses/`; triage summary updated in `docs/quality/mutation-report.md`. Mutation score on `libs/api-video` does not regress.

## Non-Goals

Each owned by a named subsequent slice or epic.

- **Course catalogue / public listing.** EP-05. Slice D writes `'PUBLISHED'` to `Course.status` but does not add any read-side for it (the existing `GET /api/courses` continues to return the requesting instructor's own courses regardless of status).
- **Enrolled-student playback / retention semantics.** EP-06. UC-02-04's "Existing enrolled students retain access" wording is described in confirmation-dialog copy but has no backing behaviour because no enrolments exist yet.
- **Editor lockout on `ARCHIVED`.** Considered and explicitly deferred. The editor remains fully editable on archived courses; this is acceptable because archive is reversible and there are no downstream consumers today.
- **Hiding `ARCHIVED` courses from the instructor's own `/courses` list.** Also deferred. Archived courses still appear in the list with the `ARCHIVED` pill.
- **`ARCHIVED → PUBLISHED` direct edge.** Instructor must restore to `DRAFT` first; re-publishing re-runs eligibility. Reduces state-machine surface area.
- **Audit log of state transitions.** No `course_transitions` subcollection or audit doc. `publishedAt` and `archivedAt` are the only persisted history. Cross-cutting audit belongs to slice F / EP-08.
- **Live cross-tab / cross-client sync.** A second tab does not learn about a transition until it issues an action and gets `409 INVALID_TRANSITION`, or until manual refresh. Same posture as slice C's "no live push" decision.
- **Optimistic UI.** The bar awaits the response before flipping the pill. Cheap rollback paths not worth the complexity for a single-instructor, low-frequency action.
- **Denormalized `Course.publishReadiness` counters.** Approach A (walk the tree per request) was chosen over denormalization (Approaches B/C in the brainstorm). EP-07 instructor dashboards may revisit if they need bulk readiness queries.
- **Undo affordance after archive.** No undo button; user can click Restore to draft from the archived state, which is functionally equivalent.
- **Email / in-app notifications on transitions.** Slice E (notifications).
- **CSRF token rotation, rate-limiting, abuse controls.** Beyond what EP-02 already provides via the cookie auth chain.

## 1. State Machine

Slice D's only writes to `Course.status` are through the four transition endpoints. `Course.status` is already typed as `'DRAFT' | 'PUBLISHED' | 'ARCHIVED'` from EP-02 (only `'DRAFT'` written until now).

### 1.1 State graph

```
                 ┌──────── publish (validate) ────────┐
                 │                                    ▼
              DRAFT ◄──── unpublish ────────────  PUBLISHED
                 │                                    │
                 │ archive                            │ archive
                 ▼                                    ▼
              ARCHIVED ◄─── archive ─────────────────┘
                 │
                 │ restore
                 ▼
              DRAFT
```

Five allowed transitions:

| Verb | Source(s) | Target | Side effects |
|---|---|---|---|
| `publish` | `DRAFT` | `PUBLISHED` | `publishedAt = now` |
| `unpublish` | `PUBLISHED` | `DRAFT` | `publishedAt` preserved |
| `archive` | `DRAFT`, `PUBLISHED` | `ARCHIVED` | `archivedAt = now`; `publishedAt` preserved |
| `restore` | `ARCHIVED` | `DRAFT` | `archivedAt = null` (cleared) |

Any other source/target combination → `409 INVALID_TRANSITION` with `{ currentState, requested }` in the response body.

### 1.2 Eligibility rule

`publish` requires all three conditions, server-authoritative:

1. Course has ≥ 1 module.
2. Every module has ≥ 1 lesson.
3. Every lesson has a `videoId` pointing to a `Video` document with `state === 'READY'`.

Other transitions (`unpublish`, `archive`, `restore`) have no eligibility check beyond the source-state guard.

### 1.3 `ARCHIVED` semantics today

Modelled but with no behavioural side effects:

- Catalogue read-side does not exist yet (EP-05); `ARCHIVED` does not need to be filtered from anything.
- Enrolment does not exist yet (EP-06); "no new enrolments accepted" has no enforcement surface.
- Editor remains editable on `ARCHIVED` courses. Slice D documents this is acceptable because archive is reversible.

The state is recorded so EP-05's catalogue query can later filter `WHERE status === 'PUBLISHED'`.

## 2. API Surface

All endpoints live on the existing `CoursesController` in `libs/api-courses`. They reuse `FirebaseSessionGuard` + `InstructorRoleGuard` + `CourseOwnerGuard` from EP-02. No new auth surface, no new DTOs beyond the response shapes.

### 2.1 New endpoints

| Verb | Path | Purpose |
|---|---|---|
| `GET` | `/api/courses/:cid/publish-eligibility` | Compute eligibility now. Returns `{ eligible, reasons }`. 200 for owner of non-archived course; 409 `COURSE_ARCHIVED` if `Course.status === 'ARCHIVED'`. |
| `POST` | `/api/courses/:cid/publish` | Transition `DRAFT → PUBLISHED`. Re-validates eligibility server-side; returns 409 with structured `reasons` on failure. |
| `POST` | `/api/courses/:cid/unpublish` | Transition `PUBLISHED → DRAFT`. No eligibility check. |
| `POST` | `/api/courses/:cid/archive` | Transition `DRAFT → ARCHIVED` or `PUBLISHED → ARCHIVED`. |
| `POST` | `/api/courses/:cid/restore` | Transition `ARCHIVED → DRAFT`. |

Each `POST` returns the updated `Course` document (status `200 OK`). No request body — `:cid` and the route verb fully identify the operation.

Rejected: `PATCH /api/courses/:cid` with `{ status }`. The existing `PATCH` is for content fields (title, description, category, difficulty); folding state transitions into it would force the state-machine guard inside `UpdateCourseDto` validation and blur the audit story.

### 2.2 Preview response shape

```ts
export type PublishEligibility =
  | { eligible: true;  reasons: [] }
  | { eligible: false; reasons: PublishBlockReason[] };

export type PublishBlockReason =
  | { kind: 'COURSE_HAS_NO_MODULES' }
  | { kind: 'MODULE_HAS_NO_LESSONS';
      moduleId: ModuleId; moduleTitle: string; moduleOrder: number }
  | { kind: 'LESSON_HAS_NO_VIDEO';
      moduleId: ModuleId; moduleTitle: string; moduleOrder: number;
      lessonId: LessonId; lessonTitle: string; lessonOrder: number }
  | { kind: 'LESSON_VIDEO_NOT_READY';
      moduleId: ModuleId; moduleTitle: string; moduleOrder: number;
      lessonId: LessonId; lessonTitle: string; lessonOrder: number;
      currentState: Exclude<VideoState, 'READY'> };
```

Reasons are sorted by `moduleOrder` ASC, then `lessonOrder` ASC. `COURSE_HAS_NO_MODULES` is always alone when present.

`POST /api/courses/:cid/publish` on eligibility failure returns `409 PUBLISH_NOT_ELIGIBLE` with `{ code, message, reasons: PublishBlockReason[] }` — same envelope as the EP-02 exception filter, with `reasons` as an extra field.

### 2.3 Error contract additions

| HTTP | `code` | When |
|---|---|---|
| 401 | _(existing `FirebaseSessionGuard`)_ | No session cookie / expired session. |
| 403 | _(existing `NOT_COURSE_OWNER`)_ | Requester doesn't own the course. |
| 404 | _(existing `COURSE_NOT_FOUND`)_ | Unknown `:cid`. |
| 409 | `INVALID_TRANSITION` | Source state doesn't allow this transition. Body includes `{ currentState, requested }`. |
| 409 | `PUBLISH_NOT_ELIGIBLE` | `publish`: source was `DRAFT` but eligibility failed. Body includes `reasons[]`. |
| 409 | `COURSE_ARCHIVED` | Preview endpoint on a course in `ARCHIVED`. UI hides the panel on archived courses anyway; this only fires on stale clients. |

### 2.4 Concurrency

Every transition endpoint runs inside a Firestore transaction (`firestore.runTransaction`) that:

1. Re-reads `courses/{cid}`.
2. Asserts `Course.status` is in the transition's expected source set; else throws `InvalidTransitionException(currentState, requested)`.
3. For `publish` only: re-runs eligibility inside the transaction (§5.4); throws `PublishNotEligibleException(reasons)` on failure.
4. Writes the new status, `updatedAt = now`, and timestamp fields per §3.

`unpublish`, `archive`, `restore` skip step 3.

Firestore serialises transactions on the same document; concurrent transitions on the same course produce one success and the rest `409 INVALID_TRANSITION` (the second's pre-condition fails after the first writes).

### 2.5 Slice A/B/C endpoints

Unchanged. `/api/videos/*`, `/api/lessons/:lid/video/*`, `/api/playback/*`, `/api/internal/transcoder-events`, `/api/internal/fake-transcoder/*` — none of these are touched.

## 3. Data Model

### 3.1 `Course` document additions

```ts
export interface Course {
  // ...existing EP-02 fields (id, instructorId, title, description, category, difficulty, status, createdAt, updatedAt)...
  status: CourseStatus;                  // ALREADY EXISTS — now actually transitions
  publishedAt?: ISODateString;           // NEW — set on every DRAFT→PUBLISHED; preserved across unpublish; preserved across archive
  archivedAt?: ISODateString;            // NEW — set on archive; cleared on restore
}
```

Invariants:

- `(archivedAt set) ↔ (status === 'ARCHIVED')`. Slice D enforces this in `CoursesRepository.updateStatusInTxn` — the only writer.
- `publishedAt`, once set, is never cleared. It records the most recent publication; surviving unpublish and archive lets EP-05/EP-07 later show "first published Mar 2026, currently in draft" without an extra field. No `firstPublishedAt` today — YAGNI.

No new fields beyond these two. `unpublishedAt` is not recorded (reversible churn; not worth a column).

### 3.2 `shared-data-models` additions

```ts
// libs/shared-data-models/src/lib/types.ts
export type PublishBlockReason = ...;       // §2.2
export type PublishEligibility = ...;        // §2.2
```

`VideoState` stays in `shared-data-models` where slice A put it. `PublishBlockReason` imports it for the `currentState` field. No other type renames or relocations.

### 3.3 Firestore document layout

Unchanged from EP-02. `courses/{cid}` gets two additional optional fields written by slice D.

### 3.4 Firestore security rules

Unchanged. `courses/**` stays deny-all from the client (the EP-02 chokepoint). Slice D writes only through `api-courses`. No new rules tests required.

### 3.5 Firestore indexes

None added. All transition endpoints are document-path reads/writes (`courses/{cid}`). The eligibility walk reads `courses/{cid}/modules` (existing query, ordered by `order`), `courses/{cid}/modules/{mid}/lessons` (existing, ordered by `order`), and `videos/{videoId}` (document path).

### 3.6 Migration

`Course` docs created before this slice have `status: 'DRAFT'` (EP-02 wrote it explicitly). Both new fields are optional; absent values mean "never published / never archived". No backfill required.

## 4. Library Structure

### 4.1 `libs/api-courses` additions

```
libs/api-courses/src/lib/
├── (existing EP-02 files)
│   courses.controller.ts                    # MODIFIED — adds 5 new routes
│   courses.service.ts                       # MODIFIED — delegates new routes to PublishService
│   courses.repository.ts                    # MODIFIED — adds getInTxn, listModulesInTxn, listLessonsInTxn, updateStatusInTxn (all `tx`-threaded)
│   courses.exceptions.ts                    # MODIFIED — adds InvalidTransitionException, PublishNotEligibleException, CourseArchivedException
│
└── publish/                                  # NEW
    ├── publish.service.ts                   # PublishService — eligibility walk + transition orchestration (txn boundary)
    ├── publish.service.spec.ts
    ├── publish-eligibility.ts               # pure: composeReasons(modules, lessonsByModule, videoStateById)
    └── publish-eligibility.spec.ts
```

`PublishService` is constructor-injected with the existing `CoursesRepository` (modules + lessons reads) and an extended `VideoServiceLike` structural interface that slice A added to `libs/api-courses` for cascade-delete. The slice-A pattern hides the api-courses → api-video dependency from the Nx project-graph (avoiding a `tsconfig` reference cycle) by:

1. Declaring `VideoServiceLike` locally in `libs/api-courses/src/lib/courses.service.ts`.
2. Providing the implementation via `forwardRef(() => require('@learnwren/api-video').VideoService)` at module-config time.

Slice D extends `VideoServiceLike` with the one additional method it needs:

```ts
interface VideoServiceLike {
  deleteForLesson(lessonId: string): Promise<void>;   // existing — slice A
  getVideo(vid: VideoId): Promise<Video>;             // NEW — slice D; throws VideoNotFoundException on missing
}
```

The `VideoService.getVideo` method already exists in `libs/api-video` (added in slice A). No new method added on the other side of the seam; only the interface declaration in `libs/api-courses` widens.

`PublishService` exposes:

```ts
class PublishService {
  computeEligibility(cid: CourseId): Promise<PublishEligibility>;
  publish(cid: CourseId): Promise<Course>;
  unpublish(cid: CourseId): Promise<Course>;
  archive(cid: CourseId): Promise<Course>;
  restore(cid: CourseId): Promise<Course>;
}
```

The pure / IO split mirrors slice C's `manifest.rewriter` (pure) vs `manifest.service` (IO):

- **`composeReasons(modules, lessonsByModule, videoStateById)`** — pure, deterministic, ordered. Exhaustively mutation-tested.
- **`PublishService.computeEligibility`** — IO seam. Reads the tree, builds the inputs, calls `composeReasons`.

### 4.2 Why routes stay on `CoursesController`

Five new routes on the existing `CoursesController` rather than a new `PublishController`. They share `:cid` resolution, `CourseOwnerGuard`, and the response envelope. Splitting would add boilerplate without separation benefit — `PublishController` would own no state. Same call slice C made for `PlaybackController` (one controller, multiple related routes).

### 4.3 `libs/web-courses` additions

```
libs/web-courses/src/lib/
├── (existing EP-02 + slice C files)
│   course-editor-page.component.{ts,html}       # MODIFIED — mounts <lib-course-publish-bar>
│   courses.service.ts                           # MODIFIED — adds 5 HTTP wrappers
│
└── publish/                                      # NEW
    ├── course-publish-bar.component.{ts,html}    # sticky top bar; status pill + primary button + menu
    ├── course-publish-bar.component.spec.ts
    ├── publish-eligibility-panel.component.{ts,html}  # checklist of reasons; collapsible
    ├── publish-eligibility-panel.component.spec.ts
    ├── publish-eligibility.service.ts            # signal store; debounced refresh
    └── publish-eligibility.service.spec.ts
```

`PublishEligibilityService` is a signal-based store. Editor page injects it; the `<lib-course-publish-bar>` reads `eligibility()`, the panel renders `reasons()`. After any child mutation, the editor calls `publishEligibility.refresh()`, debounced 500 ms.

### 4.3.1 One-line touch to `libs/web-video`

Slice D adds an `@Output() stateChanged = new EventEmitter<VideoState>()` to `VideoStateBadgeComponent` (slice B), emitting on every state transition the polling service observes. `LessonItem` forwards it up via its own `(videoStateChanged)` output; the editor page wires that into `publishEligibility.refresh()`. No other changes to `libs/web-video` or to slice B/C behaviour.

### 4.4 `libs/shared-data-models`

Adds `PublishBlockReason` and `PublishEligibility` exports (§3.2). No type renames. `CourseStatus` stays.

### 4.5 Nx graph

```
libs/api-courses         ← grows publish/ submodule
   │  (existing slice-A runtime forwardRef seam to libs/api-video; not a tsconfig project ref)
   ▼
libs/api-video           ← unchanged surface; VideoService.getVideo already exists
   ↑
libs/api-auth            ← unchanged
   ↑
libs/shared-data-models  ← adds PublishBlockReason, PublishEligibility

libs/web-courses         ← grows publish/ submodule
   ↑
libs/web-video           ← unchanged
   ↑
libs/web-auth            ← unchanged
```

The api-courses → api-video relationship is intentionally not an Nx project-graph edge: slice A established a runtime `forwardRef(require('@learnwren/api-video').VideoService)` pattern to avoid a `tsconfig` reference cycle (api-video would otherwise need to reference api-courses for shared types). Slice D widens the existing `VideoServiceLike` interface (adds `getVideo`) but introduces no new Nx edge.

## 5. Eligibility Algorithm

### 5.1 IO seam

```ts
async computeEligibility(cid: CourseId): Promise<PublishEligibility> {
  const modules = await this.courses.listModules(cid);                    // 1 read (collection query, ordered by `order`)
  const lessonsByModule = await Promise.all(
    modules.map((m) => this.courses.listLessons(m.id)),                    // N parallel queries
  );
  const allLessons = lessonsByModule.flat();
  const videoIds = allLessons.map((l) => l.videoId).filter(isDefined);
  const uniqueVideoIds = [...new Set(videoIds)];
  const videos = await Promise.all(
    uniqueVideoIds.map((vid) =>
      this.videoSvc.getVideo(vid).catch((e) => {                           // K parallel doc reads via the slice-A seam
        if (e instanceof VideoNotFoundException) return null;              // orphan → composeReasons folds into LESSON_HAS_NO_VIDEO
        throw e;
      }),
    ),
  );
  const videoStateById = new Map(
    videos.filter(isDefined).map((v) => [v.id, v.state]),
  );
  return composeReasons(modules, lessonsByModule, videoStateById);
}
```

Cost: `1 + N + K` reads (N modules, K distinct `videoId`s). For typical MVP courses (≤ 10 modules, ≤ 100 lessons), well within budget. Single instructor, low frequency, no cross-user concurrency.

### 5.2 Pure function

```ts
export function composeReasons(
  modules: Module[],                                  // ordered by Module.order ASC
  lessonsByModule: Lesson[][],                        // outer index aligned with `modules`; inner ordered by Lesson.order ASC
  videoStateById: Map<VideoId, VideoState>,
): PublishEligibility {
  const reasons: PublishBlockReason[] = [];

  if (modules.length === 0) {
    return { eligible: false, reasons: [{ kind: 'COURSE_HAS_NO_MODULES' }] };
  }

  for (let i = 0; i < modules.length; i++) {
    const m = modules[i];
    const lessons = lessonsByModule[i];
    const moduleCtx = { moduleId: m.id, moduleTitle: m.title, moduleOrder: m.order };

    if (lessons.length === 0) {
      reasons.push({ kind: 'MODULE_HAS_NO_LESSONS', ...moduleCtx });
      continue;
    }

    for (const l of lessons) {
      const lessonCtx = { ...moduleCtx, lessonId: l.id, lessonTitle: l.title, lessonOrder: l.order };
      if (!l.videoId) {
        reasons.push({ kind: 'LESSON_HAS_NO_VIDEO', ...lessonCtx });
        continue;
      }
      const state = videoStateById.get(l.videoId);
      if (state === undefined) {
        // orphan: lesson.videoId set but Video doc missing → folded into LESSON_HAS_NO_VIDEO
        reasons.push({ kind: 'LESSON_HAS_NO_VIDEO', ...lessonCtx });
        continue;
      }
      if (state !== 'READY') {
        reasons.push({ kind: 'LESSON_VIDEO_NOT_READY', ...lessonCtx, currentState: state });
      }
    }
  }

  return reasons.length === 0
    ? { eligible: true, reasons: [] }
    : { eligible: false, reasons };
}
```

### 5.3 Ordering contract

Reasons are emitted in a stable, instructor-mental order:

1. `COURSE_HAS_NO_MODULES` is always alone and the only reason if it fires (no module/lesson reasons follow — the tree is empty).
2. Modules in `module.order` ASC.
3. Within each module: at most one `MODULE_HAS_NO_LESSONS`, otherwise lessons in `lesson.order` ASC.
4. Per lesson: at most one reason; `LESSON_HAS_NO_VIDEO` takes precedence over `LESSON_VIDEO_NOT_READY` (an orphan `videoId` is reported as no-video, not as not-ready).

This contract is what the editor's checklist panel renders top-down and what the unit tests pin.

### 5.4 In-transaction variant for `publish`

```ts
async publish(cid: CourseId): Promise<Course> {
  return this.firestore.runTransaction(async (tx) => {
    const course = await this.courses.getInTxn(tx, cid);
    if (course.status !== 'DRAFT') {
      throw new InvalidTransitionException(course.status, 'PUBLISHED');
    }
    const eligibility = await this.computeEligibilityInTxn(tx, cid);
    if (!eligibility.eligible) {
      throw new PublishNotEligibleException(eligibility.reasons);
    }
    return this.courses.updateStatusInTxn(tx, cid, 'PUBLISHED', {
      publishedAt: new Date().toISOString(),
    });
  });
}
```

`computeEligibilityInTxn` reads **modules and lessons** inside the transaction via `CoursesRepository.listModulesInTxn(tx, cid)` / `CoursesRepository.listLessonsInTxn(tx, mid)` (`tx.get(query)` under the hood; the admin SDK supports collection-query reads inside transactions; the 500-document soft cap is comfortable for MVP courses).

**Video reads are not threaded through the transaction.** They go through the same `videoSvc.getVideo(vid)` call as the preview path. Rationale:

- The api-courses → api-video seam (§4.1) is a runtime structural interface, not a Firestore-aware coupling; threading `tx` through it would force exposing Firestore-transaction internals through the seam.
- `Video.state` is only written by slice B's webhook controller and slice A's upload completion. The race window between reading `Video.state` for revalidation and committing the transaction is bounded (milliseconds). A flap that publishes a now-uneligible course is recoverable (instructor unpublishes, fixes, re-publishes); strict atomicity is nice-to-have, not load-bearing here.
- Module / lesson reads **are** atomic with the status write — that race matters more (an instructor concurrently deleting a lesson should not slip an eligible publish through).

The preview endpoint runs **outside** any transaction (eventual snapshot is fine for a preview — staleness window is bounded by the next refresh).

### 5.5 Orphan handling

If `Lesson.videoId` points to a non-existent `Video` doc:

- **Eligibility:** reported as `LESSON_HAS_NO_VIDEO` (instructor sees "upload a video"; the actionable next step is to re-upload).
- **Logging:** `PublishService.computeEligibility` logs a warning with `{ courseId, lessonId, danglingVideoId }`. Should not happen in normal flow — slice A's cascade-delete fans out from Lesson to Video, and slice B's webhook never deletes Videos.
- **No automatic cleanup.** Slice F (retention) addresses orphan reconciliation. Slice D doesn't touch Lesson docs from eligibility.

## 6. Editor UI

### 6.1 Surface placement

A single sticky top bar (`<lib-course-publish-bar>`) lands at the top of `CourseEditorPage`, above the existing module/lesson tree. The eligibility checklist is an inline collapsible panel directly below the bar — visible only while `Course.status === 'DRAFT'`.

```
┌──────────────────────────────────────────────────────────────────────┐
│ "Intro to Welding"      [DRAFT]      [ Publish ▸ ]       [ ⋯ ]      │  ← sticky bar
├──────────────────────────────────────────────────────────────────────┤
│ ⓘ 3 things to fix before publishing                       [ Show ▾ ] │  ← eligibility panel (DRAFT only)
│   • Module 2 "Materials" has no lessons                              │
│   • Module 3 › Lesson 1 "Setup" — video is transcoding (please wait) │
│   • Module 3 › Lesson 2 "Practice" — no video uploaded               │
├──────────────────────────────────────────────────────────────────────┤
│ Module 1 — "Safety basics"                                           │
│   Lesson 1 — [▶ video player]                                        │
│   ...                                                                 │
```

### 6.2 Bar behaviour by state

| `Course.status` | Status pill | Primary button | `⋯` menu items |
|---|---|---|---|
| `DRAFT` | `DRAFT` (grey) | `Publish` (disabled until `eligible: true`; tooltip "Resolve the issues below first" when blocked) | `Archive course…` |
| `PUBLISHED` | `PUBLISHED` (green) | `Unpublish…` | `Archive course…` |
| `ARCHIVED` | `ARCHIVED` (amber) | `Restore to draft` | _(none — restore is the only path out)_ |

`Publish` and `Restore to draft` are confirm-less. `Unpublish…` and `Archive course…` open a confirmation dialog (matching the EP-02 "Delete Module/Lesson" pattern already in the editor).

### 6.3 Confirmation dialogs

```
┌─ Unpublish "Intro to Welding"? ──────────────────────────────┐
│                                                              │
│  The course will return to draft. Once a student catalogue   │
│  exists, the course will no longer be discoverable. Existing │
│  enrolled students would retain access.                      │
│                                                              │
│  [Cancel]                                  [Unpublish course]│
└──────────────────────────────────────────────────────────────┘

┌─ Archive "Intro to Welding"? ────────────────────────────────┐
│                                                              │
│  Archived courses are hidden from the catalogue. You can     │
│  restore the course to draft at any time.                    │
│                                                              │
│  [Cancel]                                    [Archive course]│
└──────────────────────────────────────────────────────────────┘
```

Both dialogs are static (no input). Wording acknowledges EP-05 / EP-06 don't exist yet without being technical about it.

### 6.4 Eligibility panel

Visible **only** when `Course.status === 'DRAFT'`. Collapsed by default when eligible (just shows `✓ Ready to publish`); expanded by default when blocked.

```
┌── ✓ Ready to publish ────────────────────────────────────[Hide ▴]──┐
│                                                                    │
│  Every module has at least one lesson, and every lesson has a      │
│  video that finished transcoding.                                  │
└────────────────────────────────────────────────────────────────────┘

┌── ⓘ 3 things to fix before publishing ──────────────────[Hide ▴]──┐
│                                                                    │
│  ◯ Module 2 "Materials" has no lessons                             │
│      [Jump to module ▸]                                            │
│  ◯ Module 3 › Lesson 1 "Setup"                                     │
│      Video is still transcoding. Status will update automatically. │
│  ◯ Module 3 › Lesson 2 "Practice"                                  │
│      No video uploaded yet.                                        │
│      [Jump to lesson ▸]                                            │
└────────────────────────────────────────────────────────────────────┘
```

The `Jump to …` link scrolls the editor to the relevant element and applies a brief highlight (~1s focus ring). Jump-link visibility:

| Reason kind | Jump link |
|---|---|
| `COURSE_HAS_NO_MODULES` | none (instructor adds modules via existing editor UI) |
| `MODULE_HAS_NO_LESSONS` | `[Jump to module ▸]` |
| `LESSON_HAS_NO_VIDEO` | `[Jump to lesson ▸]` |
| `LESSON_VIDEO_NOT_READY` with `currentState` of `'UPLOADING'`, `'UPLOADED'`, `'TRANSCODING'`, `'PENDING_UPLOAD'` | none (instructor can only wait) |
| `LESSON_VIDEO_NOT_READY` with `currentState: 'FAILED'` | `[Jump to lesson ▸]` (instructor re-uploads) |

### 6.5 Reactive refresh

`PublishEligibilityService` exposes:

```ts
class PublishEligibilityService {
  eligibility: Signal<PublishEligibility | null>;
  loading: Signal<boolean>;
  lastError: Signal<string | null>;
  refresh(): void;     // debounced 500 ms internally
}
```

Refresh contract (debounced 500 ms internally):

- Course editor page load → initial fetch.
- Every time `CourseEditorPageComponent.refresh()` completes (already called after every module / lesson create / update / delete / reorder), the page also calls `publishEligibility.refresh()`. Single editor-side trigger point.
- When any lesson's video transitions to `READY`, eligibility must refresh. Slice D adds a thin `(stateChanged)` `@Output` to slice B's `VideoStateBadgeComponent`, bubbled through `LessonItem` to the editor page, which calls `publishEligibility.refresh()`. The badge already re-renders on state changes via `VideoStatePollingService`; the output is a one-line addition emitting on transition into a terminal state (`READY` or `FAILED`).
- After every transition endpoint call — but the panel is hidden in `PUBLISHED` and `ARCHIVED`, so the practical effect is only re-checking after `restore`.

The 500 ms debounce inside `PublishEligibilityService.refresh()` collapses bursts (e.g., reordering many lessons in quick succession).

Network failures on the preview endpoint surface a small inline banner ("Couldn't check publish status — [Retry]") inside the panel header. The Publish button stays disabled while eligibility is unknown — "no data" is treated as ineligible (safe default).

### 6.6 Loading / success affordances

Each transition endpoint is awaited inline:

- Button enters a spinner state while the request is in flight.
- On 2xx success: status pill updates, the bar's primary action and menu items rebuild for the new state. A small toast (`"Course published"`, `"Course unpublished"`, `"Course archived"`, `"Course restored to draft"`) appears for 3 seconds. No undo.
- On 409 `PUBLISH_NOT_ELIGIBLE`: eligibility signal is overwritten with the response body's `reasons`; the panel expands; no toast.
- On 409 `INVALID_TRANSITION` (rare race — bar was stale): the bar refetches `GET /api/courses/:cid` and rebuilds. A toast says `"The course state changed — please try again."`
- On 5xx / network: error banner inside the bar; the button re-enables.

### 6.7 What does NOT change

The existing per-lesson editor surface (upload component / state badge / player) is untouched. The publish bar reads aggregate state; the per-lesson components keep their own state machines.

## 7. Failure Modes & Concurrency

| Failure | Where | Surfaced as | Persisted state |
|---|---|---|---|
| Session expired | `FirebaseSessionGuard` | 401; auth interceptor redirects | unchanged |
| Requester not owner | `CourseOwnerGuard` | 403 `NOT_COURSE_OWNER`; UI shouldn't reach this state (route guard prevents opening) | unchanged |
| Unknown `:cid` | `CourseOwnerGuard` | 404 `COURSE_NOT_FOUND`; editor handles via existing not-found state | unchanged |
| Preview while `ARCHIVED` | `PublishService.computeEligibility` entry check | 409 `COURSE_ARCHIVED`; panel hidden in archived view anyway | unchanged |
| Race: preview said eligible, publish fails revalidation | `publish` txn step 3 | 409 `PUBLISH_NOT_ELIGIBLE`; bar overwrites local eligibility with response body; panel expands with fresh reasons | unchanged |
| Race: status changed between bar render and click (e.g., second tab unpublished) | All transition txns step 2 | 409 `INVALID_TRANSITION`; bar refetches course and rebuilds; toast | unchanged |
| Double-click on a transition button | Client | Bar disables button while in-flight; second click swallowed | unchanged |
| Two tabs, both DRAFT, both click Publish | Firestore txn serialisation | One 200; one 409 `INVALID_TRANSITION` | one publish; one no-op |
| Two tabs, one Archive, one Publish | Firestore txn serialisation | First wins; second 409 `INVALID_TRANSITION` | one transition |
| Lesson/module deleted after preview, before publish (other tab) | Publish txn re-walks tree | If still eligible: publishes. If not: 409 `PUBLISH_NOT_ELIGIBLE` with fresh reasons | unchanged |
| Dangling `Lesson.videoId` (orphan) | `composeReasons` | Folded into `LESSON_HAS_NO_VIDEO`; service logs warning | unchanged |
| Network failure on preview | Client | Inline retry banner inside panel header; button stays disabled | unchanged |
| Network failure on transition | Client | Bar shows banner; button re-enables; instructor retries | unchanged |
| Firestore transaction retry storm | Admin SDK auto-retries on contention | Eventually 5xx surfaces if retries exhaust; bar shows generic error | unchanged |
| `currentState` in reason is `FAILED` | Eligibility | Reason renders with re-upload jump link; instructor takes action | unchanged |

### 7.1 What we do NOT handle in slice D

- **Cross-client live updates.** A second tab learns about transitions only via an action that returns `INVALID_TRANSITION`, or via manual refresh. Live sync is deferred — same posture as slice C's "no live state push" decision.
- **Optimistic UI.** The bar awaits the response before updating the pill. Cheap to add later; not worth the rollback paths now.
- **Audit log.** No `course_transitions` collection. `publishedAt` / `archivedAt` are the only persisted history.
- **Replay protection beyond cookie + CSRF.** No per-action nonces. Standard REST + cookie + EP-02 CSRF mitigations are sufficient.

## 8. Testing

Mirrors the slice A/B/C testing posture. No new test framework or runner — Vitest + Playwright + Stryker as configured.

| Layer | Where | Coverage |
|---|---|---|
| Unit (Vitest, mocked Firestore + VideoRepository) | `libs/api-courses/src/lib/publish/**/*.spec.ts` | **`composeReasons`** (pure) — every branch: empty course → single `COURSE_HAS_NO_MODULES`; module with zero lessons → `MODULE_HAS_NO_LESSONS`; lesson without `videoId` → `LESSON_HAS_NO_VIDEO`; lesson with dangling `videoId` (not in map) → `LESSON_HAS_NO_VIDEO` (orphan fold); lesson with each non-`READY` `VideoState` → `LESSON_VIDEO_NOT_READY` with `currentState` populated; lesson with `READY` video → no reason emitted; full mixed-failure course produces reasons in spec order (§5.3); fully-eligible course returns `{ eligible: true, reasons: [] }`. **`PublishService.computeEligibility`** — happy path; orphan lesson logs warning; respects module/lesson `order` ordering; deduplicates `videoId` reads. **`PublishService.publish/unpublish/archive/restore`** — each transition's source-state guard; each transition's target-state write; publish revalidates inside txn (test by mutating `VideoRepository.findById` between two calls); each rejects with the correct exception class. **Exception classes** — `InvalidTransitionException`, `PublishNotEligibleException`, `CourseArchivedException` map to the right HTTP code via the EP-02 exception filter. |
| Unit (Vitest, controller layer) | `libs/api-courses/src/lib/courses.controller.spec.ts` | Each new route: 200 on happy path; correct path-param wiring; passes through to `PublishService` (mocked); response shape matches §2.2 (preview), envelope matches §2.3 (errors). |
| Component — badge output (Vitest) | `libs/web-video/src/lib/video-state-badge.component.spec.ts` (MODIFIED) | Add assertion: `(stateChanged)` `@Output` fires once per state transition observed via the polling service stub. Existing badge tests are unchanged. |
| Component (Vitest + Angular utilities) | `libs/web-courses/src/lib/publish/**/*.spec.ts` | **`PublishEligibilityService`** — refreshes on construction, debounces rapid `refresh()` calls (`vi.useFakeTimers`), handles network error → sets `lastError`, sets `loading` correctly. **`CoursePublishBarComponent`** — renders the right status pill / primary button / menu items for each `Course.status`; primary button disabled until `eligibility.eligible === true` in `DRAFT`; tooltip wording; calls correct service method on each action; awaits-and-disables during request; rebuilds bar on success; handles 409 `PUBLISH_NOT_ELIGIBLE` (panel expands with new reasons) and 409 `INVALID_TRANSITION` (refetches). **`PublishEligibilityPanelComponent`** — renders the right header for ready vs blocked; reasons sorted in `composeReasons` order; jump-link visibility per reason kind + `currentState` (§6.4); empty-state ("Ready to publish") when `eligible: true`. **Confirmation dialogs** — Unpublish and Archive show dialog; cancel is no-op; confirm proceeds; Publish and Restore have no dialog. |
| Firestore rules | existing rules-tests suite | No new tests (rules unchanged — `courses/**` stays deny-all from clients). |
| API e2e (Firebase emulators, fake transcoder, fake `signObjectUrl`) | `apps/api-e2e/src/**/*.e2e-spec.ts` | **Happy path:** register → promote → create course → add module → add lesson → upload-session → upload-complete → `/api/internal/fake-transcoder/complete/:vid` → GET preview returns `{ eligible: true, reasons: [] }` → POST `/publish` returns 200 with `course.status === 'PUBLISHED'` and `publishedAt` populated. **Eligibility branches** (one e2e per `PublishBlockReason.kind`): empty course (no modules) → `COURSE_HAS_NO_MODULES`; module without lessons → `MODULE_HAS_NO_LESSONS` with correct module fields; lesson without `videoId` → `LESSON_HAS_NO_VIDEO`; lesson with `TRANSCODING` video (no fake-completer call) → `LESSON_VIDEO_NOT_READY` with `currentState: 'TRANSCODING'`. **Transitions:** publish → unpublish → publish round-trip; archive from DRAFT; archive from PUBLISHED; restore from ARCHIVED → DRAFT; restore re-allows publish after eligibility recheck; `publishedAt` survives unpublish; `archivedAt` cleared on restore. **Negative paths:** unauthenticated → 401; second instructor → 403 `NOT_COURSE_OWNER` on each new endpoint; unknown `:cid` → 404 `COURSE_NOT_FOUND`; publish on PUBLISHED → 409 `INVALID_TRANSITION` with `{ currentState: 'PUBLISHED', requested: 'PUBLISHED' }`; unpublish on DRAFT → 409 `INVALID_TRANSITION`; restore on DRAFT/PUBLISHED → 409 `INVALID_TRANSITION`; preview on ARCHIVED → 409 `COURSE_ARCHIVED`; publish failing revalidation (delete lesson's video between preview and publish) → 409 `PUBLISH_NOT_ELIGIBLE` with fresh reasons. **Concurrency:** two parallel publish requests on the same DRAFT course → one 200, one 409 `INVALID_TRANSITION`. |
| Web e2e (Playwright) | `apps/web-e2e/src/**/*.spec.ts` | Instructor signs in → creates course with 1 module + 1 lesson + uploaded+completed video → editor mounts → publish bar status pill reads `DRAFT` → eligibility panel reads "Ready to publish" → Publish button enabled → click → pill flips to `PUBLISHED` → toast appears → bar primary action is now `Unpublish…` → click Unpublish → confirm dialog → confirm → pill flips back. Blocked path: same setup but the lesson has no video → eligibility panel shows `LESSON_HAS_NO_VIDEO` reason → Publish button disabled → tooltip present. Archive path: from DRAFT, click `Archive course…` → confirm → pill flips to `ARCHIVED` → Restore button visible → click Restore → pill flips to `DRAFT`. No console errors on any path. |
| Mutation (Stryker) | `libs/api-courses` | ≥ 85 % effective. Raw output refreshed in `reports/mutation/api-courses/mutation.{html,json}`; triage notes folded into `docs/quality/mutation-report.md`. New surface mutated: `composeReasons` (every branch + ordering), `PublishService`, new exception classes, new controller routes. Mutation score on `libs/api-video` does not regress relative to its slice-A/B/C baseline. |
| CRAP score | existing tooling (`tools/crap/crap.mjs`) | Refresh `docs/quality/crap-report.md` to cover the new `publish/` submodule in `libs/api-courses` and the new `publish/` submodule in `libs/web-courses`. |

### 8.1 Fixture management

No new fixtures. The slice-A `apps/api-e2e/src/fixtures/small-video.mp4` is reused for the happy-path test. Eligibility-failure tests construct trees without going through real uploads (e.g., `LESSON_HAS_NO_VIDEO` is reached by creating a lesson and not uploading; `LESSON_VIDEO_NOT_READY` with `TRANSCODING` is reached by uploading + completing the upload but **not** calling the fake-transcoder-complete endpoint).

### 8.2 Flake passthrough

The memory note about `api-e2e auth happy-path is flaky` applies — slice D's e2e tests sit downstream of register → promote → course/module/lesson, so they inherit the same flake risk. Mitigation matches slice C: re-run on suspected flake; chase only on repeated failure.

## 9. Locked Decisions

1. Three states: `DRAFT` ⇄ `PUBLISHED`; both → `ARCHIVED`; `ARCHIVED` → `DRAFT`. No `ARCHIVED` → `PUBLISHED` direct edge.
2. `ARCHIVED` is modelled but has no behavioural side effects today. Catalogue filtering and editor lockout deferred.
3. Eligibility is computed by walking the tree per request (Approach A). No denormalized counters on `Course`.
4. Preview endpoint + reactive Publish button. Publish endpoint re-validates inside a Firestore transaction.
5. Per-lesson structured `PublishBlockReason[]`, ordered by module then lesson `order`. Orphan `videoId` is folded into `LESSON_HAS_NO_VIDEO`.
6. Four verb endpoints (`publish`, `unpublish`, `archive`, `restore`) + one preview, all on the existing `CoursesController`. No `PATCH /api/courses/:cid` overload.
7. `publishedAt` survives unpublish and archive. `archivedAt` is cleared on restore.
8. Unpublish and Archive show confirmation dialogs (matching EP-02 delete pattern). Publish and Restore are confirm-less.
9. Sticky top bar on `CourseEditorPage`; eligibility panel visible only in `DRAFT`.
10. Optimistic UI is not used; the bar awaits the response. No live cross-tab sync.
11. No new Nx edges. `libs/api-courses` reuses the slice-A runtime `forwardRef`/`VideoServiceLike` seam to call `VideoService.getVideo`. Publish-time video reads are non-transactional (modules + lessons are read inside the publish transaction; videos are not — see §5.4 rationale).
12. Firestore rules unchanged (`courses/**` stays deny-all from the client). No new indexes.
13. CRAP and mutation thresholds match the slice A/B/C bar (`libs/api-courses` ≥ 85 % effective).
14. Pure / IO seam split: `composeReasons` (pure, exhaustively tested) vs `PublishService.computeEligibility` (IO).
15. Web debounced refresh (500 ms) on existing editor events (module/lesson mutations, video state polling reaching `READY`).

## 10. Environment Variables

**None.** Slice D is a pure REST + UI addition. No signed URLs, no transcoder config, no external services, no secrets to render.

## 11. Doc Updates

The edits below land alongside this spec's approval (or alongside the implementation, depending on the chosen workflow — call out in the implementation plan).

- **`README.md`** — status banner appended: "EP-03 slice D (course publish gate) complete: instructors can publish / unpublish / archive / restore courses with structured eligibility feedback. Catalogue (EP-05) and enrolled-student playback (EP-06) remain deferred."
- **`docs/superpowers/specs/2026-03-27-mvp-use-cases-design.md`** — update the MVP scope table footnote / status indicator for UC-02-04 to point at this spec ("in scope, addressed by 2026-05-20-publish-gate-slice-d-design.md").
- **`docs/superpowers/specs/2026-05-12-course-authoring-design.md`** — the "deferred to EP-03" note for US-02-04 (line 34) should reference this new spec.

No edits required to:

- `docs/epics/TECHNICAL_ARCHITECTURE.md` — data-model table already has `Course.status`. Two optional timestamp fields don't move the needle on the architecture doc.
- `docs/epics/02-course-authoring.md` or `docs/use-cases/02-course-authoring.md` — the use case is the spec; the slice implements it.
- `docs/epics/03-video-management-and-drm.md` or `docs/use-cases/03-video-management-and-drm.md` — slice D is a course-authoring slice that closes the publish gate; the video epic is unchanged.

## 12. Acceptance Bar

Before slice D is "done":

1. Unit, component, rules (unchanged), API e2e, and web e2e suites all pass for `libs/api-courses` and `libs/web-courses`. No regression in `api-auth`, `api-video`, `web-auth`, `web-video`, or slices A / B / C.
2. Mutation score on `libs/api-courses` ≥ 85 % effective; raw output in `reports/mutation/api-courses/mutation.{html,json}` refreshed; triage notes folded into `docs/quality/mutation-report.md` summary. Mutation score on `libs/api-video` does not regress relative to its slice-A/B/C baseline.
3. `docs/quality/crap-report.md` refreshed to cover the new `publish/` submodules in `libs/api-courses` and `libs/web-courses`.
4. Manual run-through against the dev Firebase project (real GCP, slice A/B/C still working):
   - Promoted instructor creates a course, adds modules + lessons + uploaded videos that reach `READY` → eligibility panel turns green → click Publish → pill flips → toast.
   - Same instructor: click Unpublish (confirm) → pill flips back; `publishedAt` survives.
   - Click Archive (confirm) → pill flips → Restore → pill flips back; `archivedAt` cleared.
   - Blocked path: leave a lesson without a video → publish button disabled → panel shows specific reason → upload video → wait for READY → button enables.
   - Two-tab race test: open the editor in two tabs in DRAFT; publish in tab 1; click publish in tab 2 → expect `INVALID_TRANSITION` toast and bar rebuild reflecting `PUBLISHED`.
5. CI is green end-to-end.
6. README status banner updated per §11.
7. Spec status moves from Draft to Approved after stakeholder review.

## 13. Open Questions

None at design time. All scope dimensions resolved during brainstorming and recorded in §9. Specifically resolved:

- Full state machine vs subset? → All three states, five edges (§9 item 1).
- Eligibility failure UX? → Per-lesson structured reasons, rendered in a checklist panel (§9 items 5, 9; §6.4).
- Preview endpoint vs validate-on-publish only? → Preview endpoint + reactive Publish button; publish re-validates server-side (§9 item 4; §2.1).
- Eligibility computation strategy? → Approach A, walk the tree per request (§9 item 3; §5).
- `ARCHIVED` semantics today? → Modelled only, no behavioural side effects (§9 item 2; §1.3).
- State edges? → `DRAFT` ⇄ `PUBLISHED`, both → `ARCHIVED`, `ARCHIVED` → `DRAFT`; no direct `ARCHIVED → PUBLISHED` (§9 item 1; §1.1).
- API verb shape? → Four verb endpoints + one preview on `CoursesController`; no `PATCH` overload (§9 item 6; §4.2).
- Confirmation dialogs? → Unpublish and Archive; Publish and Restore confirm-less (§9 item 8; §6.2–6.3).
- Surface placement? → Sticky top bar + collapsible panel below; panel only in `DRAFT` (§9 item 9; §6.1, §6.4).
- Concurrency model? → Per-request Firestore transactions; serialisation handles races (§9 item 10; §2.4).
- Cross-tab live sync? → Not in slice D; refetch on `INVALID_TRANSITION` (§9 item 10; §7.1).
- Audit log? → Not in slice D; `publishedAt` / `archivedAt` are the only persisted history (§7.1).
- Refresh triggers for the eligibility panel? → Existing editor signals + debounce (§9 item 15; §6.5).
- Pure vs IO split for eligibility? → `composeReasons` pure, `computeEligibility` IO (§9 item 14; §4.1, §5).

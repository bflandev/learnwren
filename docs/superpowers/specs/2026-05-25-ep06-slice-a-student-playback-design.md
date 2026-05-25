# Student Lesson Playback — EP-06 Slice A Design Spec

> [!NOTE]
> **DOCUMENT STATUS: DRAFT**
> This document is a living specification and is subject to change. All content is considered provisional until formally approved by project stakeholders.

**Status:** Draft (2026-05-25)
**Scope:** First implementation slice of EP-06 (Learning Experience). Delivers **UC-06-01 (Watch a Lesson Video)** end-to-end for enrolled students, in its minimal "player only" form. Adds a new `learn/` submodule to `libs/api-courses` exposing one read endpoint for lesson + course metadata, a new `libs/web-learn` Angular library hosting the student lesson page at `/learn/:courseId/:lessonId`, and a **Start Learning** button on the existing course detail page that links enrolled students into the lesson.

This spec sits on top of:

- `2026-05-22-ep05-slice-b-enrolment-design.md` (the `enrollments` collection, `EnrollmentRepository.isEnrolled`, the `EnrollmentOrOwnerGuard` and `MaterialAccessGuard` widening that already grants enrolled-student access to playback and material download).
- `2026-05-22-course-discovery-slice-a-design.md` (the public `/catalog/:cid` route, `CourseDetailPageComponent`, the `CourseCatalogDetail` payload that exposes the module → lesson structure).
- `2026-05-14-video-playback-slice-c-design.md` (the `/api/playback/manifest/:vid` endpoint, the AES-128 HLS pipeline, the `web-video` `VideoPlayerComponent`).
- `2026-05-12-course-authoring-design.md` (the `Course → Module → Lesson` hierarchy, `CoursesController`, `CoursesService`, `CoursesRepository`, `CoursesExceptionFilter`, the courses error envelope).
- `2026-05-04-auth-registration-and-login-design.md` / `2026-05-06-auth-hardening-design.md` (the `FirebaseSessionGuard`, `AuthenticatedRequest`, the signal-based web `AuthService`, the `authGuard`, and the login page's `redirect` query-param contract).

It reuses the existing `CoursesExceptionFilter` + error envelope, the `api-firebase` Firestore handle, the `fake-firestore.ts` test double, the signal-based Angular service pattern, and the established slice testing posture. It introduces **one new web library** (`web-learn`) with **three new Nx graph edges** (`web-learn → shared-data-models`, `web-learn → web-auth`, `web-learn → web-video`), **no new env vars**, and **no new Firestore collections, indexes, or rules**. The public `CourseCatalogDetail` payload is unchanged in shape (this slice does verify it already exposes `lesson.id` and `lesson.order` — if not, those fields are added as a minor additive change).

## Goal

A fresh clone, after `pnpm install` and `pnpm secrets:render`, running `pnpm emulators` + `pnpm start`, must satisfy:

- An **authenticated student enrolled in a `PUBLISHED` course** sees a **Start Learning** button on `/catalog/:cid`. Clicking it navigates to `/learn/:cid/:firstLessonId`, where the lesson title, description, and the existing hls.js (or native HLS on Safari/iOS) player are rendered.
- **Start Learning** appears only when the caller has an `ACTIVE` enrolment **or** is the course's instructor. It is hidden for guests and unenrolled students.
- The lesson the button links to is the **first lesson of the first module** (lowest `module.order`, then lowest `lesson.order`). When the course has no lessons yet, the button is replaced with a disabled "No lessons yet" state.
- An **instructor visiting their own course's lesson page** is allowed through (matches `EnrollmentOrOwnerGuard` semantics), letting them preview as a student would.
- **Direct URL access** to `/learn/:cid/:lid` works for an enrolled or owning caller.
- **Not authenticated** → redirect to `/login?redirect=/learn/:cid/:lid` (existing `authGuard`).
- **Authenticated but not enrolled, non-owner** → the API returns `403`, and the page renders a "You're not enrolled in this course" panel with a link back to `/catalog/:cid`.
- **Lesson missing, or lesson does not belong to the course in the URL** → `404` from the API, and the page renders a "Lesson not available" panel with a link back to `/catalog/:cid`.
- **Video not yet `READY`** (transcoding still running, or no video uploaded yet) → the page renders the lesson title and description and a "This lesson's video is still being processed. Please check back later." panel in place of the player.
- **Fatal player error during playback** (manifest 403 from a course unpublished mid-session, key fetch failure, decode error) → the player is unmounted and replaced with "Unable to play video. Please try again later." matching UC-06-01 ext 4a.
- The previously fixme'd api-e2e test at `apps/api-e2e/src/playback.e2e-spec.ts:128` (`'403 NOT_VIDEO_OWNER for a student (EP-06 widens this branch)'`) is un-fixme'd, renamed, and updated to assert **200** for an enrolled student. Two sibling cases are added: enrolled + course unpublished → 403; previously enrolled then unenrolled → 403.
- All prior-spec quality gates pass: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e`. No regression in `api-auth`, `api-courses`, `web-auth`, `web-catalog`, `web-courses`, `web-video`, `web-enrollment`.

## Non-Goals

Each is owned by a subsequent EP-06 slice or another deferred work item:

- **Mark Lesson Complete (UC-06-02).** EP-06 Slice B. `LessonProgress.completedAt` is never written in this slice. Course-completion badges, module-completion rollups, and the "all lessons complete" state are entirely deferred.
- **Resume / last-watched timestamp (UC-06-03).** EP-06 Slice C. No reads or writes of `LessonProgress.lastWatchedSeconds` in this slice; the field stays at the `0` it was seeded with by EP-05 Slice B. There is no "Continue Learning" affordance; only "Start Learning", and it always links to the first lesson regardless of prior viewing.
- **Course outline panel (UC-06-04).** No collapsible course-outline sidebar; no next/prev lesson navigation. The lesson page has only a "← Back to course" link to `/catalog/:cid`.
- **Materials list on the lesson page.** UC-06-01 step 2 lists lesson materials. Owners already have material download from the course editor (EP-04), and the `MaterialAccessGuard` already grants enrolled-student access at the API layer (EP-05 Slice B). Surfacing materials inside the student lesson page is deferred to the outline-shaped slice — it shares a layout decision with the outline panel.
- **Captions / subtitles (UC-06-01 ext 5a).** No subtitle ingest exists in EP-03's transcoding pipeline. Not in scope here.
- **Cover image upload** and the **My Courses / enrolled-courses dashboard.** Both are EP-05 Slice B follow-ups, separate from EP-06.
- **Playback-position auto-save** (UC-06-01 step 6 "auto-saves the student's playback position as they watch"). This is the data plumbing for UC-06-03 Resume Learning; it lands with that slice.
- **Access revocation on unpublish / archive** beyond what already ships. The `EnrollmentOrOwnerGuard` already requires `course.status === 'PUBLISHED'` for non-owner callers, so enrolled students lose API-level access the moment a course is unpublished — this is consistent with what the EP-05 Slice B spec already documents. No new revocation behaviour is added; the page surfaces a 403 cleanly when the manifest endpoint denies a previously-allowed session.
- **The remaining 14 api-e2e video fixmes.** The `api-e2e video quarantine` memo records that 15 video tests are `test.fixme`'d pending a fake source-storage seam (`2026-05-23-fake-source-probe-seam-design.md`). This slice flips one of them (the EP-06 widening assertion) but does not address the other 14 — they remain quarantined.

## Data Model

**No new collections, fields, or rules.** This slice is read-only with respect to Firestore. The two interactions:

- **Read:** `courses/{cid}`, `lessons/{lid}` (where lessons live; today they are an embedded array in the course doc — the implementation honours whatever shape EP-02 Slice A established), `videos/{vid}`, and `enrollments/{uid}__{cid}` via the existing repositories.
- **Write:** none.

A new shared TypeScript interface, `LessonView`, is added to `libs/shared-data-models` for the new endpoint's response shape:

```ts
// libs/shared-data-models/src/lib/lesson-view.ts (new file)
import type {
  CourseId,
  CourseStatus,
  LessonId,
  ModuleId,
  VideoId,
  VideoState,
} from './common';

export interface LessonView {
  course: {
    id: CourseId;
    title: string;
    status: CourseStatus;
  };
  lesson: {
    id: LessonId;
    moduleId: ModuleId;
    title: string;
    description: string;
    videoId: VideoId | null;       // null when the lesson has no video uploaded yet
    videoState: VideoState | null; // null iff videoId is null
  };
}
```

`lesson-view.ts` is re-exported from `libs/shared-data-models/src/index.ts`.

The page composes the manifest URL itself (`'/api/playback/manifest/' + videoId`) rather than receiving it in the payload — keeps the response a pure projection of the entity state and matches what the owner editor already does in `web-video`.

## Backend — `libs/api-courses/src/lib/learn/`

A new submodule, structured identically to the `enrollment/` and `catalog/` submodules added in EP-05:

```
libs/api-courses/src/lib/learn/
├── learn.controller.ts
├── learn.controller.spec.ts
├── learn.service.ts
├── learn.service.spec.ts
├── dto/
│   └── lesson-view.dto.ts
├── guards/
│   ├── lesson-enrollment-or-owner.guard.ts
│   └── lesson-enrollment-or-owner.guard.spec.ts
├── types/
│   └── lesson-scoped-request.ts
└── errors/
    └── learn.exception.ts
```

### Endpoint

`GET /api/learn/courses/:cid/lessons/:lid`

- **Auth:** `FirebaseSessionGuard` (existing). Unauthenticated callers get `401`.
- **Authz:** `LessonEnrollmentOrOwnerGuard` (new, below).
- **Response:** `200 OK` with body shape `LessonView`.
- **Errors:**
  - `404 LESSON_NOT_FOUND` — course missing, lesson missing, or lesson belongs to a different course.
  - `403 NOT_LESSON_OWNER` — authenticated, but neither the course's instructor nor an active enrollee on a `PUBLISHED` course.
  - `401` — no/invalid session cookie (`FirebaseSessionGuard` envelope).

All errors flow through the existing `CoursesExceptionFilter` and the established error envelope.

### `LessonEnrollmentOrOwnerGuard`

Mirrors `EnrollmentOrOwnerGuard` (`libs/api-courses/src/lib/video/playback/enrollment-or-owner.guard.ts`) but is keyed on `cid` + `lid` rather than `vid`:

1. Reads `cid` and `lid` from `req.params`; throws `LessonNotFoundException` if either is missing.
2. Loads the course via `CoursesRepository.getCourse(cid)`; throws `LessonNotFoundException` if missing. (Same envelope as a missing lesson — the endpoint deliberately does not distinguish, to avoid leaking course existence to an enrolled-elsewhere caller.)
3. Loads the lesson via `CoursesRepository.getLesson(lid)` (or whatever helper EP-02 exposes; if lessons are embedded in the course doc, resolve in memory). Throws `LessonNotFoundException` if the lesson is missing **or** `lesson.courseId !== cid`.
4. **Owner branch:** `course.ownerInstructorId === req.user.uid` → allow.
5. **Enrolled branch:** `await enrollment.isEnrolled(req.user.uid, cid)` **and** `course.status === 'PUBLISHED'` → allow.
6. Else throw `NotLessonOwnerException` (envelope code `NOT_LESSON_OWNER`).
7. On allow, attach `{ course, lesson }` to the request (`LessonScopedRequest`) so the controller does not re-fetch.

Implementation note: the existing `EnrollmentOrOwnerGuard` accepts `course?.status === 'PUBLISHED'`; this guard does the same. There is no special-case for `DRAFT` or `ARCHIVED` — both result in 403 for enrolled non-owners. The instructor path is unaffected by `course.status`.

### `LearnService.getLessonView(course, lesson)`

A pure mapper from the guard-attached entities to `LessonView`. If `lesson.videoId` is set, performs a single `VideoRepository.getVideo(videoId)` read to populate `videoState`; if the video document is missing or `lesson.videoId` is null, both fields are `null` on the response. The service has no fall-through error paths beyond what the guard already enforced.

### Controller

A one-liner that resolves the guard-attached `{ course, lesson }` from the request, calls `LearnService.getLessonView`, and returns the result.

### Module wiring

`LearnController` is added to `CoursesModule.controllers`; `LearnService` and `LessonEnrollmentOrOwnerGuard` are added to `providers`. No new repositories — the guard and service consume `CoursesRepository`, `EnrollmentRepository`, and `VideoRepository`, all already provided by `CoursesModule`.

### Tests

- **`lesson-enrollment-or-owner.guard.spec.ts`** — uses the existing in-memory `fake-firestore.ts`:
  - owner of PUBLISHED course → allow
  - owner of DRAFT course → allow (owners are not gated on status)
  - enrolled student + PUBLISHED → allow
  - enrolled student + DRAFT → deny (`NOT_LESSON_OWNER`)
  - enrolled student + ARCHIVED → deny
  - not-enrolled, non-owner → deny
  - withdrawn enrolment → deny
  - missing course → `LESSON_NOT_FOUND`
  - missing lesson → `LESSON_NOT_FOUND`
  - lesson belongs to a different course → `LESSON_NOT_FOUND`
- **`learn.service.spec.ts`** — pure mapping:
  - lesson with READY video → `videoState: 'READY'`
  - lesson with TRANSCODING video → `videoState: 'TRANSCODING'`
  - lesson with `videoId: null` → `{ videoId: null, videoState: null }`
  - lesson with `videoId` pointing at a missing video doc → `{ videoId: <id>, videoState: null }` (defensive — should not happen in practice)
- **`learn.controller.spec.ts`** — wires the guard, service, and exception filter; asserts 200 happy-path payload shape and one 401 case (no cookie).

### api-e2e

A new file `apps/api-e2e/src/learn.e2e-spec.ts`, matching the patterns in `enrollment.e2e-spec.ts`:

- Authed enrolled student on PUBLISHED course → 200, payload matches `LessonView`.
- Authed unenrolled student → 403 `NOT_LESSON_OWNER`.
- Authed owner of DRAFT course → 200.
- Authed enrolled student of DRAFT course → 403.
- Unauthed → 401.
- Lesson belongs to a different course (`/api/learn/courses/A/lessons/B` where lesson B is in course C) → 404 `LESSON_NOT_FOUND`.
- Missing lesson id → 404.
- Missing course id → 404.

## Backend — fixme un-quarantine

`apps/api-e2e/src/playback.e2e-spec.ts:128` currently reads:

```ts
test.fixme('403 NOT_VIDEO_OWNER for a student (EP-06 widens this branch)', ...);
```

In this slice:

- Drop `test.fixme`; rename to `'200 OK for an enrolled student on a PUBLISHED course'`.
- Setup: register a second student via the existing helpers, enrol them via `POST /api/enrollments`, hit `GET /api/playback/manifest/:vid` with their session cookie, assert 200 and that the response body is a non-empty manifest.
- Add a sibling test: same student after `DELETE /api/enrollments/:cid` → 403 `NOT_VIDEO_OWNER`.
- Add a sibling test: same student, then instructor calls `POST /api/courses/:cid/unpublish` → 403 (course no longer PUBLISHED).

The other 14 `test.fixme`'d video tests stay quarantined; they need the fake source-storage seam, which is out of scope here.

## Frontend — `libs/web-learn` (new lib)

A new Nx Angular library, standalone-component, signal-based, OnPush, mirroring `web-catalog` and `web-enrollment`:

```
libs/web-learn/
├── project.json
├── tsconfig.json / tsconfig.lib.json / tsconfig.spec.json
├── eslint.config.mjs
├── vite.config.ts (or vitest.config.ts to match the workspace convention)
└── src/
    ├── index.ts
    └── lib/
        ├── learn.routes.ts
        ├── learn.service.ts
        ├── learn.service.spec.ts
        ├── lesson-player-page.component.ts
        ├── lesson-player-page.component.html
        └── lesson-player-page.component.spec.ts
```

### Route registration

`learn.routes.ts` exports:

```ts
import type { Route } from '@angular/router';
import { authGuard } from '@learnwren/web-auth';

export const learnRoutes: Route[] = [
  {
    path: 'learn/:courseId/:lessonId',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./lesson-player-page.component').then((m) => m.LessonPlayerPageComponent),
  },
];
```

`apps/web/src/app/app.routes.ts` imports `learnRoutes` from `@learnwren/web-learn` and spreads it alongside `catalogRoutes` and `coursesRoutes`. The existing `authGuard` already preserves the `redirect` query param to `/login`, so unauth → login behaviour is automatic.

### `LearnService`

Signal-based fetcher in the now-conventional shape (same pattern as `EnrollmentService` in `web-enrollment`):

```ts
type RemoteData<T> =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; value: T }
  | { kind: 'error'; reason: 'not-enrolled' | 'not-found' | 'other' };

@Injectable({ providedIn: 'root' })
export class LearnService {
  private readonly http = inject(HttpClient);
  readonly lessonView = signal<RemoteData<LessonView>>({ kind: 'idle' });

  load(courseId: CourseId, lessonId: LessonId): void {
    this.lessonView.set({ kind: 'loading' });
    this.http
      .get<LessonView>(`/api/learn/courses/${courseId}/lessons/${lessonId}`, { withCredentials: true })
      .subscribe({
        next: (value) => this.lessonView.set({ kind: 'ok', value }),
        error: (err: HttpErrorResponse) => {
          const reason =
            err.status === 403 ? 'not-enrolled' :
            err.status === 404 ? 'not-found' :
            'other';
          this.lessonView.set({ kind: 'error', reason });
        },
      });
  }
}
```

401 is intentionally not branched on here — the existing auth interceptor / `authGuard` flow handles unauthenticated requests at a higher level.

### `LessonPlayerPageComponent`

Standalone, OnPush, signal-based:

- Route-bound `input()` signals `courseId` and `lessonId` (the app uses `withComponentInputBinding()`; if for any reason it does not, the implementation falls back to `inject(ActivatedRoute).snapshot.params` — verify on implementation).
- `ngOnInit` calls `learn.load(courseId(), lessonId())`.
- Template `*ngIf`s on the `lessonView()` state:
  - **idle / loading** → skeleton (title placeholder + player placeholder).
  - **error: 'not-enrolled'** → "You're not enrolled in this course" panel with a `routerLink` to `/catalog/{{ courseId() }}`.
  - **error: 'not-found'** → "Lesson not available" panel with the same back link.
  - **error: 'other'** → generic "Something went wrong" panel with a Retry button that re-invokes `learn.load(...)`.
  - **ok** branch:
    - Lesson title (`<h1>{{ lesson.title }}</h1>`), description.
    - `videoId == null` or `videoState !== 'READY'` → the "still being processed" panel in place of the player.
    - Otherwise mount `<lw-video-player [manifestUrl]="manifestUrl()" (fatalError)="onFatalError()" />` from `web-video`. `manifestUrl = computed(() => '/api/playback/manifest/' + lesson.videoId)`.
    - Below the player: "← Back to course" `routerLink` to `/catalog/{{ courseId() }}`.
- **Fatal-error swap.** `playerFatal = signal(false)`. `onFatalError()` sets it to `true`; the template swaps the player out for "Unable to play video. Please try again later." (UC-06-01 ext 4a). The existing `VideoPlayerService` already surfaces `onFatalError` (see `video-player.service.spec.ts`); the player component exposes it as an `output()` for the page to subscribe to. If today's `VideoPlayerComponent` does not yet emit a fatal-error output, this slice adds a minimal `fatalError = output<void>()` — it is the only change to `web-video`.

### `VideoPlayerComponent` reuse

`web-video` already exports `VideoPlayerComponent` for the owner editor. The student page composes the same component; there is no fork. The component is parameterised by `manifestUrl` only — the gate that controls whether the manifest is served is server-side (`EnrollmentOrOwnerGuard`), so the player needs no knowledge of the caller's role.

If the public surface of `web-video` does not currently re-export `VideoPlayerComponent`, the slice adds it to `libs/web-video/src/index.ts`. The Nx project tags update to allow `web-learn → web-video`.

### Tests

- **`learn.service.spec.ts`** — Vitest with `HttpTestingController`:
  - 200 → `ok` state with payload.
  - 403 → `error: 'not-enrolled'`.
  - 404 → `error: 'not-found'`.
  - 500 → `error: 'other'`.
- **`lesson-player-page.component.spec.ts`** — TestBed + signal stubs:
  - renders skeleton in the loading state.
  - renders the player with the correct `manifestUrl` when `videoState === 'READY'`.
  - renders the "still being processed" panel when `videoState !== 'READY'`.
  - renders the "still being processed" panel when `videoId === null`.
  - renders the not-enrolled panel on a 403.
  - renders the not-found panel on a 404.
  - renders the fatal-error panel when the player emits `fatalError`.
  - "Back to course" link points at `/catalog/{{ courseId }}`.

## Frontend — `libs/web-catalog` changes

The course detail page already renders `<app-course-enrollment-panel>` from `web-enrollment` and already has the `EnrollmentStatusView` (`{ enrollment, isOwner }`) signal in scope. This slice extends `CourseDetailPageComponent` only — `web-enrollment` is untouched.

### Start Learning button

Rendered next to the enrolment panel in `CourseDetailPageComponent`:

```ts
firstLessonHref = computed(() => {
  const c = course();
  if (!c) return null;
  const mod = [...c.modules].sort((a, b) => a.order - b.order)[0];
  const lesson = mod && [...mod.lessons].sort((a, b) => a.order - b.order)[0];
  return mod && lesson ? `/learn/${c.id}/${lesson.id}` : null;
});

canStartLearning = computed(() => {
  const status = enrollmentStatus();
  return Boolean(firstLessonHref()) &&
    (status?.isOwner === true || status?.enrollment?.status === 'ACTIVE');
});
```

Template additions:

- When `canStartLearning()` is true: `<a routerLink>{{ firstLessonHref() }}</a>` styled as the primary CTA, label **Start Learning**.
- When the caller is enrolled / owner but `firstLessonHref()` is null (course has no lessons): a disabled button-shaped element with the text "No lessons yet".
- When the caller is a guest or unenrolled student: nothing — only the existing Enroll button shows.

### `CourseCatalogDetail` payload check

The first-lesson computation relies on `course.modules[*].lessons[*]` exposing `id` and `order`. The implementation verifies the public catalog response shape; if `lesson.id` or `lesson.order` is absent, a small additive change is made to the `catalog/` submodule's response mapper to include them. This is documented in the implementation plan as a verification step, not a guaranteed change.

### Tests

- **`course-detail-page.component.spec.ts`** (extension to the existing spec):
  - Start Learning visible for an enrolled student on a course with ≥1 lesson, with `href = /learn/{cid}/{firstLessonId}`.
  - Start Learning visible for the owner on the same course.
  - Start Learning hidden for a guest.
  - Start Learning hidden for an authenticated unenrolled student.
  - "No lessons yet" disabled element shown for an enrolled student on a course with zero lessons.
  - First-lesson resolution honours `module.order` and `lesson.order` (not insertion order).

## web-e2e

A new file `apps/web-e2e/src/learn.e2e-spec.ts` with two scenarios:

1. **Happy path.** Instructor seeds a PUBLISHED course with one module and one lesson backed by a `READY` video (reuse the seed helpers already used by the catalog and enrolment e2e specs). A student registers + verifies, signs in, visits `/catalog/:cid`, clicks **Enroll**, clicks **Start Learning**, asserts URL `/learn/:cid/:lid`, asserts the lesson title is rendered, asserts the `<video>` element is present in the DOM (no byte-level playback assertion — hls.js + emulator manifest serving in headless CI is fragile; presence of the player and correct manifest URL is sufficient).
2. **Auth redirect.** A logged-out browser navigates directly to `/learn/:cid/:lid` and is redirected to `/login?redirect=...`.

## Nx workspace changes

- New library `web-learn` generated via `pnpm nx g @nx/angular:library` with the same flags used by `web-enrollment` (standalone, no module, Vitest, ESLint flat config).
- `libs/web-learn/project.json` tags `scope:web`, `type:feature` (or whatever convention `web-enrollment` uses).
- ESLint enforce-module-boundaries config gains the new edges: `web-learn → shared-data-models`, `web-learn → web-auth`, `web-learn → web-video`.
- `apps/web/src/app/app.routes.ts` imports `learnRoutes`.
- `libs/web-video/src/index.ts` re-exports `VideoPlayerComponent` if not already re-exported, plus the new `fatalError` output type if added.

No changes to `nx.json`, `pnpm-workspace.yaml`, `firebase.json`, `firestore.indexes.json`, `firestore.rules`, or any environment template.

## Quality gates

Pre-merge: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e`, `pnpm affected`. CRAP / mutation reports (`pnpm crap`, `pnpm mutate:api-courses`) cover the new `learn/` submodule — the targets do not need configuration changes; they already operate on the whole `api-courses` library.

No regression is permitted in `api-auth`, `api-courses`, `web-auth`, `web-catalog`, `web-courses`, `web-video`, or `web-enrollment`.

## Documentation updates (as part of this slice)

- **`README.md`** — add EP-06 Slice A row to the "what is wired up today" callout; add the new endpoint to the endpoints table; add `web-learn` to the project / library table.
- **`docs/USER_GUIDE.md`** — add a "Watch a lesson as an enrolled student" section under the EP-06 area, walking through enroll → Start Learning → playback.
- **`docs/quality/spec-drift-report.md`** — update the EP-06 section: UC-06-01 transitions from "Deferred" to "Built (2026-05-25)"; UC-06-02, UC-06-03, UC-06-04 remain deferred and are explicitly named as upcoming slices.

## Out-of-scope risks acknowledged

- **In-flight player session when a course is unpublished.** The guard already enforces `PUBLISHED` for non-owner manifest requests; a student watching a video at the moment the instructor unpublishes will continue to play from the buffered segments and existing signed URLs (which expire in 4 h per the EP-03 design), then fail on the next manifest refresh or key fetch. The fatal-error UI handles this case gracefully. No additional revocation work in this slice.
- **`CourseCatalogDetail.lesson.id` / `lesson.order` absence.** The implementation verifies the public payload before relying on it; the spec describes this verification as part of the implementation plan rather than asserting the shape today.
- **`VideoPlayerComponent.fatalError` output not yet present.** If absent in `web-video`, this slice adds it — a minimal additive change, no behaviour change for the owner editor that already handles fatal errors via the service callback.

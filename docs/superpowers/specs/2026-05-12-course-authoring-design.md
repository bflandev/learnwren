# Course Authoring (EP-02, US-02-01..03) Design Spec

> [!NOTE]
> **DOCUMENT STATUS: DRAFT**
> This document is a living specification and is subject to change. All content is considered provisional until formally approved by project stakeholders.

**Status:** Draft (2026-05-12)
**Scope:** First implementation slice of EP-02 (Course Authoring). Delivers US-02-01 (Create Course), US-02-02 (Manage Modules), and US-02-03 (Manage Lessons) end-to-end: a Firestore-backed `Course → Module → Lesson` hierarchy, a NestJS REST surface owned by `libs/api-courses`, an Angular feature library `libs/web-courses` with the course list, create form, and drag-and-drop editor, an `INSTRUCTOR`-only authorization model, and a dev ops script that promotes an existing user to instructor. Publication (US-02-04) is **deferred** to the EP-03 video slice — its acceptance criteria require a transcoded/DRM-encrypted video per lesson, which this slice cannot produce.

This spec sits on top of the auth slices (`2026-05-04-auth-registration-and-login-design.md`, `2026-05-06-auth-hardening-design.md`). It reuses the existing session-cookie auth, `FirebaseSessionGuard`, `users/{uid}` doc, role custom claims, and Firestore rules helpers. It introduces new collections (`courses/**`, with `modules` and `lessons` as subcollections), three new web routes under `/courses`, twelve new API endpoints, one new dev tool, and an `InstructorRoleGuard`.

## Goal

A fresh clone, after `pnpm install` and `pnpm secrets:render`, must satisfy:

- An existing user can be promoted to `INSTRUCTOR` by running `pnpm tools:promote-to-instructor <email>`. The script verifies the user exists and is email-verified, then sets both the Firebase Auth custom claim (`role: 'INSTRUCTOR'`) and the Firestore `users/{uid}.role` field. The script logs that the promoted user must sign out and back in for the new role to take effect.
- A user who is **not** an instructor receives `403 INSUFFICIENT_ROLE` from every `/api/courses*` endpoint and is redirected away from `/courses/**` web routes with no flash of editor content.
- An instructor lands on `/courses` and sees a list of their own draft courses with a "Create Course" CTA. The list is empty for a freshly-promoted instructor and shows an empty-state.
- The instructor fills the Create Course form (title required, short description required, plus optional long description, category, and difficulty) and is redirected to `/courses/:id/edit` with the new course in `DRAFT` status.
- Inside the editor the instructor can add modules, rename them inline, drag to reorder them, and delete them with confirmation. Inside each module they can do the same for lessons. Reorders persist immediately; renames persist on blur; deletes cascade to children via `firestore.recursiveDelete()`.
- All `courses/**`, `modules/**`, `lessons/**` Firestore paths are deny-all from the client — every read and write goes through the NestJS API using the Admin SDK. The new rule has a `@firebase/rules-unit-testing` test asserting denial against student, instructor, and anonymous principals.
- The editor's hydrated load (`GET /courses/:id`) returns the course plus all modules and lessons in one request, so the editor never makes N+1 round-trips.
- A second instructor's `GET /courses/:id` for a course they don't own returns `403 NOT_COURSE_OWNER`; a `PATCH` or `DELETE` on the same returns `403 NOT_COURSE_OWNER`. The `GET /courses` list never leaks another instructor's courses.
- A stale reorder (the client posts a list of IDs that doesn't match what's currently in Firestore) returns `409 STALE_REORDER` and the editor refetches the tree.
- All prior-spec commands (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e`, `pnpm start`, `pnpm emulators`, `pnpm secrets:render`, `pnpm secrets:run`) still pass with no regression. New libraries (`api-courses`, `web-courses`) are picked up automatically by the existing `nx run-many` targets.
- Mutation testing on `api-courses` matches the bar set in `d90c588` for `api-auth`: ≥85% effective score with equivalents documented in a triage report.

That is the contract this spec delivers.

## Non-Goals

These each have, or will have, their own spec:

- **US-02-04 (Publish, Unpublish, Archive).** Requires a video pipeline (US-03-02 transcoding + US-03-03 DRM encryption) to satisfy "every lesson has a transcoded and DRM-encrypted video". Ships as part of the EP-03 slice. Until then, `Course.status` is always `'DRAFT'` and the editor exposes no status controls.
- **Cover image upload (US-02-01 optional field).** Pulls in Cloud Storage rules, MIME and dimension validation, signed-URL serving, and a stored URL field. Folds into a later media-handling slice that builds on the Storage rules proven by EP-03. The catalogue page (EP-05) will use a placeholder image until then.
- **Cross-module lesson moves.** US-02-03 scopes reorder to "within a module". The editor's `cdkDropList`s for lessons are not connected across modules; lessons cannot be dragged into a different module in this slice.
- **Multi-instructor collaboration / realtime sync.** No live listeners. Two tabs editing the same course is last-write-wins on field updates with a 409 path on stale reorder. Acceptable because the assumed use is single-instructor authoring.
- **Optimistic locking.** No `version` field on entities. The 409 path on reorder is the only optimistic-concurrency surface; field updates accept LWW.
- **Undo/redo.** Out of scope.
- **Self-service "request to become an instructor".** The promotion path is ops-only. EP-08 (Platform Administration) will eventually own a UI-driven flow.
- **Public catalogue / search.** Listing other instructors' published courses belongs to EP-05.
- **Course-level analytics, enrollment counts, completion stats.** Belong to EP-05 and EP-07.
- **Soft delete / trash / restore.** Deletes are hard, cascade, and final. The confirm dialog is the only safety net.
- **Audit log of authoring actions.** Not in scope; could be layered on by recording mutations in a separate collection later.
- **Cloud Functions packaging of `apps/api`.** Same deferral as the prior specs.
- **Hosting deploys / SPA rewrites.** Same deferral as the prior specs.

## 1. Architecture Overview

```
   ┌─────────────────────────────┐
   │ apps/web (Angular)          │
   │  ┌─────────────────────────┐│
   │  │ libs/web-courses        ││  routes: /courses, /courses/new,
   │  │  - CoursesListPage      ││          /courses/:id/edit
   │  │  - CourseCreatePage     ││  guard:  instructorRoleGuard
   │  │  - CourseEditorPage     ││           (reads AuthService from libs/web-auth)
   │  │  - CoursesService       ││  state:  per-component Angular signals
   │  └─────────────────────────┘│
   └─────────────┬───────────────┘
                 │ HTTPS, session cookie (__session)
                 ▼
   ┌─────────────────────────────┐
   │ apps/api (NestJS)           │
   │  ┌─────────────────────────┐│  guards (in order):
   │  │ libs/api-courses        ││   1. FirebaseSessionGuard (existing)
   │  │  - CoursesController    ││   2. InstructorRoleGuard  (new)
   │  │  - CoursesService       ││   3. CourseOwnerGuard     (new, on :cid routes)
   │  │  - CoursesRepository    ││
   │  │  - InstructorRoleGuard  ││
   │  │  - CourseOwnerGuard     ││
   │  └─────────────────────────┘│
   └─────────────┬───────────────┘
                 │ Firebase Admin SDK
                 ▼
   ┌─────────────────────────────┐
   │ Firestore                   │
   │  courses/{cid}              │
   │    modules/{mid}            │
   │      lessons/{lid}          │
   │                             │
   │  Security rules: deny-all   │
   │  from client; server-only.  │
   └─────────────────────────────┘
```

**Key invariants**
- All client-facing access to `courses/**`, `modules/**`, `lessons/**` goes through `libs/api-courses`. Firestore rules deny client reads and writes outright; the server is the single chokepoint for validation, authorization, and ordering.
- `Course.instructorId` is the authoritative ownership pointer. Every mutation endpoint resolves the `:cid` segment to a course doc, checks `instructorId === request.user.uid`, and stashes the doc on `request` so the service doesn't re-fetch.
- `Module.order` and `Lesson.order` are dense non-negative integers within their parent. Reads always sort by `order ASC`. Server owns ordering; clients never compute or guess `order` values.

## 2. Data Model

### 2.1 `libs/shared-data-models` changes

`Course` gains three optional fields:

```ts
export type CourseCategory =
  | 'PROGRAMMING'
  | 'DESIGN'
  | 'BUSINESS'
  | 'MARKETING'
  | 'PERSONAL_DEVELOPMENT'
  | 'OTHER';

export type CourseDifficulty = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';

export interface Course {
  id: CourseId;
  title: string;                  // required, 1..100
  description: string;            // required, 1..500
  longDescription?: string;       // optional, max 5000
  category?: CourseCategory;      // optional
  difficulty?: CourseDifficulty;  // optional
  instructorId: UserId;
  status: CourseStatus;           // 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' — only DRAFT used this slice
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
```

`Module` is unchanged.

`Lesson` becomes (changes marked):

```ts
export interface Lesson {
  id: LessonId;
  moduleId: ModuleId;
  title: string;                  // required, 1..100
  description?: string;           // NEW — optional, max 2000
  videoUrl?: string;              // CHANGED to optional — EP-03 will tighten this back
  order: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
```

The "proposed cap" values (`longDescription` 5000, `description` 2000, `Module.title` 100) are non-load-bearing defaults; they are not in EP-02 but are added to bound input sizes.

### 2.2 Firestore document layout

```
courses/{courseId}
   title, description, longDescription?, category?, difficulty?,
   instructorId, status, createdAt, updatedAt

  modules/{moduleId}
     courseId, title, order, createdAt, updatedAt

    lessons/{lessonId}
       moduleId, title, description?, videoUrl?, order, createdAt, updatedAt
```

Why subcollections (rather than three flat collections):

- The editor's primary read is "one course plus its whole structure". With subcollections this is one parent `get` plus two cheap subcollection scans (modules of one course, then lessons grouped by module).
- Cascade delete is one `firestore.recursiveDelete()` call.
- EP-05's public catalogue only reads top-level `courses`, so it pays no penalty.
- The instructor's "my courses" list is a simple `where('instructorId', '==', uid)` query on top-level `courses` — a single-field index, no `collectionGroup` needed.

### 2.3 Firestore security rules

`firestore.rules` adds:

```
match /courses/{courseId} {
  allow read, write: if false;

  match /modules/{moduleId} {
    allow read, write: if false;

    match /lessons/{lessonId} {
      allow read, write: if false;
    }
  }
}
```

The catch-all deny at the bottom of the rules file already covers any path we forget, but the explicit blocks document intent and give the rules tests a clean target.

## 3. API Surface (`libs/api-courses`)

### 3.1 Guards and request augmentation

- **`FirebaseSessionGuard`** (existing) — verifies the `__session` cookie, decodes it, attaches `request.user = { uid, role, ... }`.
- **`InstructorRoleGuard`** (new) — runs after the session guard. Returns `403 INSUFFICIENT_ROLE` if `request.user.role !== 'INSTRUCTOR'`.
- **`CourseOwnerGuard`** (new) — runs on any route with a `:cid` segment. Reads `courses/{cid}` via the repository; returns `404 COURSE_NOT_FOUND` if missing; returns `403 NOT_COURSE_OWNER` if `course.instructorId !== request.user.uid`; otherwise stashes the loaded course on `request.course` so the service tier doesn't re-fetch.

Module-level and lesson-level routes also resolve their `:mid` / `:lid` segments. A missing `:mid` returns `404 MODULE_NOT_FOUND`; a missing `:lid` returns `404 LESSON_NOT_FOUND`. A mid/lid that doesn't belong to its declared parent returns `404` (same code; we don't leak that it exists under a different parent).

### 3.2 Endpoints

| Verb | Path | Body | Purpose |
|---|---|---|---|
| `POST` | `/api/courses` | `CreateCourseDto` | Create a new course in `DRAFT` status; `instructorId = request.user.uid` |
| `GET` | `/api/courses` | — | List courses owned by `request.user.uid`, sorted by `updatedAt DESC` |
| `GET` | `/api/courses/:cid` | — | Hydrated tree: course + modules (sorted) + lessons (sorted) in one response |
| `PATCH` | `/api/courses/:cid` | `UpdateCourseDto` | Update any subset of course fields |
| `DELETE` | `/api/courses/:cid` | — | Recursive delete |
| `POST` | `/api/courses/:cid/modules` | `CreateModuleDto` | Append a module (server computes `order` in a txn) |
| `PATCH` | `/api/courses/:cid/modules/:mid` | `UpdateModuleDto` | Rename module |
| `DELETE` | `/api/courses/:cid/modules/:mid` | — | Recursive delete |
| `PUT` | `/api/courses/:cid/modules/order` | `{ ids: ModuleId[] }` | Reorder all modules of this course |
| `POST` | `/api/courses/:cid/modules/:mid/lessons` | `CreateLessonDto` | Append a lesson (server computes `order` in a txn) |
| `PATCH` | `/api/courses/:cid/modules/:mid/lessons/:lid` | `UpdateLessonDto` | Update title and/or description |
| `DELETE` | `/api/courses/:cid/modules/:mid/lessons/:lid` | — | Single doc delete |
| `PUT` | `/api/courses/:cid/modules/:mid/lessons/order` | `{ ids: LessonId[] }` | Reorder all lessons of this module |

### 3.3 DTOs (class-validator)

```ts
class CreateCourseDto {
  @IsString() @Length(1, 100) title!: string;
  @IsString() @Length(1, 500) description!: string;
  @IsOptional() @IsString() @MaxLength(5000) longDescription?: string;
  @IsOptional() @IsIn(COURSE_CATEGORIES) category?: CourseCategory;
  @IsOptional() @IsIn(COURSE_DIFFICULTIES) difficulty?: CourseDifficulty;
}

class UpdateCourseDto {
  @IsOptional() @IsString() @Length(1, 100) title?: string;
  @IsOptional() @IsString() @Length(1, 500) description?: string;
  @IsOptional() @IsString() @MaxLength(5000) longDescription?: string;
  @IsOptional() @IsIn(COURSE_CATEGORIES) category?: CourseCategory;
  @IsOptional() @IsIn(COURSE_DIFFICULTIES) difficulty?: CourseDifficulty;
}

class CreateModuleDto { @IsString() @Length(1, 100) title!: string; }
class UpdateModuleDto { @IsString() @Length(1, 100) title!: string; }

class CreateLessonDto {
  @IsString() @Length(1, 100) title!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
}

class UpdateLessonDto {
  @IsOptional() @IsString() @Length(1, 100) title?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
}

class ReorderDto { @IsArray() @ArrayNotEmpty() ids!: string[]; }
```

Wire format follows the conventions in `2026-04-29-initial-nx-monorepo-design.md` §4: branded IDs as raw strings on the wire, dates as ISO strings, no enums (string-literal unions only).

### 3.4 Response shapes

- `POST /api/courses` → `Course` (201)
- `GET /api/courses` → `Course[]` sorted by `updatedAt DESC`
- `GET /api/courses/:cid` → `{ course: Course, modules: Array<{ module: Module, lessons: Lesson[] }> }`
- `PATCH /api/courses/:cid` → `Course` (200)
- `DELETE /api/courses/:cid` → 204
- `POST /api/courses/:cid/modules` → `Module` (201)
- `PATCH /api/courses/:cid/modules/:mid` → `Module` (200)
- `DELETE /api/courses/:cid/modules/:mid` → 204
- `PUT /api/courses/:cid/modules/order` → `Module[]` (200, in their new order)
- `POST /api/courses/:cid/modules/:mid/lessons` → `Lesson` (201)
- `PATCH /api/courses/:cid/modules/:mid/lessons/:lid` → `Lesson` (200)
- `DELETE /api/courses/:cid/modules/:mid/lessons/:lid` → 204
- `PUT /api/courses/:cid/modules/:mid/lessons/order` → `Lesson[]` (200, in their new order)

### 3.5 Error contract

Errors are returned as `{ code: string, message: string, fieldErrors?: Record<string, string> }` matching the existing api-auth convention.

| HTTP | `code` | When |
|---|---|---|
| 400 | `VALIDATION_FAILED` | DTO validation failed; `fieldErrors` populated |
| 401 | `NOT_AUTHENTICATED` | No or expired session cookie (from `FirebaseSessionGuard`) |
| 403 | `INSUFFICIENT_ROLE` | Session is valid but role is not `INSTRUCTOR` |
| 403 | `NOT_COURSE_OWNER` | Instructor is trying to access someone else's course |
| 404 | `COURSE_NOT_FOUND` | `:cid` doesn't exist |
| 404 | `MODULE_NOT_FOUND` | `:mid` doesn't exist or doesn't belong to `:cid` |
| 404 | `LESSON_NOT_FOUND` | `:lid` doesn't exist or doesn't belong to `:mid` |
| 409 | `STALE_REORDER` | Reorder body's `ids` set ≠ the children currently in Firestore |
| 500 | `INTERNAL_ERROR` | Unexpected; logged with correlation id |

## 4. Ordering, Cascade Delete, Edge Cases

### 4.1 Ordering

`order` is a dense non-negative integer per parent. Reads always sort `order ASC`. The server owns all `order` values; clients never compute them.

**Append on create** — server runs a Firestore transaction:
1. Read the `count` (or `max(order)`) of existing siblings.
2. Write the new doc with `order = max + 1` (or `0` if empty).

The transaction closes the two-tab race where both tabs append simultaneously and would otherwise compute the same index.

**Reorder** (`PUT .../order`) — body is `{ ids: [...] }` in the new order:
1. Server reads all children of the parent.
2. If `set(ids) !== set(currentChildren.id)` → `409 STALE_REORDER` and the editor refetches the tree.
3. Otherwise: one Firestore `WriteBatch` sets `order` on each child to its index in `ids`, plus a single touch of the parent course's `updatedAt`.

**Gaps after delete** — not renumbered eagerly. The order semantics are "sort by `order ASC`, gaps are fine". The next reorder operation rewrites them contiguously. Cheaper than eager renumber and incurs no correctness cost.

### 4.2 Cascade delete

- `DELETE /api/courses/:cid` and `DELETE /api/courses/:cid/modules/:mid` use Firebase Admin's `firestore.recursiveDelete(ref)`, which batches under the hood and is safe for the document counts a single course will hold (worst case in MVP: a few hundred lessons).
- Lesson delete is a single `ref.delete()`.
- All deletes flow through the same `ConfirmDialogComponent` on the client. Copy is fixed:
  - Course: *"Permanently delete this course and all its modules and lessons. This action cannot be undone."*
  - Module: *"This will permanently remove this module and all its lessons. This action cannot be undone."*
  - Lesson: *"Delete this lesson? This action cannot be undone."*

### 4.3 Concurrency posture

- **Field updates** (`PATCH`): last-write-wins. No `version` field, no optimistic locking. Justified by single-instructor authoring; multi-tab loss is small and bounded to per-field overwrites.
- **Stale reorder**: covered by the 409 path; editor refetches.
- **Edit-after-delete**: a `PATCH` against a deleted entity returns 404. UI surfaces a "this was removed elsewhere, refreshing…" toast and reloads the tree.

### 4.4 Validation summary

| Field | Rule | Source |
|---|---|---|
| `Course.title` | required, 1–100 chars | EP-02 spec |
| `Course.description` | required, 1–500 chars | EP-02 spec |
| `Course.longDescription` | optional, max 5000 chars | proposed; not in spec |
| `Course.category` | optional, must be in `CourseCategory` union | EP-02 spec ("predefined list") |
| `Course.difficulty` | optional, must be in `CourseDifficulty` union | EP-02 spec |
| `Module.title` | required, 1–100 chars | proposed; not in spec |
| `Lesson.title` | required, 1–100 chars | EP-02 spec |
| `Lesson.description` | optional, max 2000 chars | proposed (spec says "optional text description") |

### 4.5 Other edge cases

- **Empty title on inline rename** (module or lesson): per UC-02-02 extension 3a, the client reverts to the previous title without calling the server. No server-side equivalent rule — sending `title: ""` to `PATCH` is a 400.
- **Course with zero modules**: allowed; editor renders "Add your first module" empty state.
- **Module with zero lessons**: allowed; renders an inline "Add a lesson" link.
- **No publish in this slice**: editor renders no Publish button; `Course.status` always `'DRAFT'`; status is not exposed in the UI.
- **`GET /api/courses` scope**: returns *only* courses where `instructorId === request.user.uid`. There is no "list all" endpoint in this slice — EP-05 will add the public catalogue query.

## 5. Frontend (`libs/web-courses`)

### 5.1 Routes

Lazy-loaded under `/courses`:

| Path | Component |
|---|---|
| `/courses` | `CoursesListPageComponent` |
| `/courses/new` | `CourseCreatePageComponent` |
| `/courses/:id/edit` | `CourseEditorPageComponent` |

A new functional `instructorRoleGuard` (CanMatch) wraps all three routes. It reads the current user from the existing `AuthService` in `libs/web-auth`. If unauthenticated → redirect to `/login`. If authenticated but role !== `INSTRUCTOR` → redirect to `/`. Guard runs before component bootstrap so there is no flash of editor content.

401s on any `CoursesService` call funnel through the existing HTTP error handling and bounce to `/login`.

### 5.2 Component tree (editor)

```
CourseEditorPageComponent
├─ CourseMetaPanelComponent       // inline-edit title, descriptions, category, difficulty
└─ ModuleTreeComponent            // single cdkDropList of modules
   └─ ModuleItemComponent         // inline-rename, "Add Lesson" CTA, "Delete module"
      └─ LessonListComponent      // own cdkDropList of this module's lessons; NOT connected to other modules
         └─ LessonItemComponent   // inline-rename, optional description, "Delete lesson"
ConfirmDialogComponent             // shared confirmation modal for all three delete operations
```

### 5.3 Drag-and-drop

Angular CDK `DragDropModule`.

- Modules: one `cdkDropList`.
- Each module's lessons: its own `cdkDropList`, **not** connected to other modules. Cross-module moves are explicitly not supported in this slice.

### 5.4 Save model

| Operation | Mode | Notes |
|---|---|---|
| Inline rename (any title or description) | Pessimistic | `PATCH` on blur; "saving…" indicator; on error, revert field and show inline message |
| Drag-drop reorder | Optimistic | Apply new order locally on drop; fire `PUT .../order` in background; on failure, revert and show toast |
| Create (course/module/lesson) | Pessimistic | Wait for response, then update tree |
| Delete (course/module/lesson) | Pessimistic | Confirmation modal → wait for 204 → update tree |

No global "Save" button. Matches the "saves immediately" / "saves the new title" language in the EP-02 use cases.

### 5.5 Forms

Reactive forms with client-side validators matching the server contract. Server is the source of truth; on `400 VALIDATION_FAILED` the response's `fieldErrors` map is folded back onto the corresponding form controls.

### 5.6 State

Per-component Angular signals. The editor holds the hydrated tree from `GET /api/courses/:cid` in a single signal and mutates it locally as operations succeed. No NgRx. Matches the lightweight style of `libs/web-auth`.

### 5.7 `CoursesService`

Thin `HttpClient` wrapper, one method per API endpoint, returns `Observable<T>` to match the existing convention. Lives in `libs/web-courses/src/lib/courses.service.ts`.

## 6. Ops Tool: `tools/promote-to-instructor.ts`

Patterned on `tools/cleanup-unverified-users.ts`.

**Invocation**: `pnpm tools:promote-to-instructor <email>`

**Steps** (all via Firebase Admin SDK):
1. `auth.getUserByEmail(email)` — fail fast with a clear message if the user doesn't exist.
2. **Safety check**: refuse if `user.emailVerified === false`. We don't promote unverified accounts.
3. `auth.setCustomUserClaims(uid, { role: 'INSTRUCTOR' })`.
4. Firestore update `users/{uid}.role = 'INSTRUCTOR'`. Single doc, transactional with a read of the current doc so the script can't drift if the user doc shape evolves.
5. Log success including the uid.
6. Final log: **"User must sign out and sign back in for the new role to take effect."** Session cookies and ID tokens cache the prior claim until refresh.

Unit-tested with a mocked Admin SDK. Not exercised in e2e (it's a manual ops command).

## 7. Testing

| Layer | Where | What it covers |
|---|---|---|
| Unit (Jest, mocked Firestore) | `libs/api-courses/src/lib/*.spec.ts` | `CoursesService` business logic, `CoursesRepository` mapping, `InstructorRoleGuard`, `CourseOwnerGuard`, DTO validators, the ordering transaction, the reorder 409 path |
| Component/service unit (Jest + Angular testing) | `libs/web-courses/src/lib/*.spec.ts` | Editor components (drag-drop wiring with `HarnessLoader` + CDK testing utilities), `CoursesService` HTTP wrapper via `HttpTestingController`, the `instructorRoleGuard` |
| Firestore rules | `firestore.rules` + existing rules-tests suite | Deny-all from client for `courses/**`, `modules/**`, `lessons/**` against student, instructor, and anonymous principals — mirrors the `auth_attempts` deny-all suite from the auth-hardening slice |
| API e2e (Firebase emulator) | `apps/api-e2e` | Full lifecycle: promote a seeded user → create course → add modules and lessons → reorder → delete; 401 unauthenticated; 403 student-attempts-write; 403 cross-instructor edit; 409 stale-reorder; 404 missing entity at each level |
| Web e2e | `apps/web-e2e` | Seeded INSTRUCTOR user signs in → creates course → drags to reorder modules → deletes a module with confirmation → confirms tree persists after reload |
| Mutation (Stryker) | `libs/api-courses` | Match the bar set in `d90c588` for `api-auth` (≥85% effective with equivalents documented in a triage report) |
| CRAP score | existing tooling (`d6143f6`) | Include the new lib in the report |

**Note on the api-e2e flake** (per the existing memory): the auth happy-path can race on the `users/{uid}` write/read. The new courses e2e suite will reuse the existing auth setup helper rather than registering fresh users inline, so when the flake gets fixed the courses suite benefits automatically.

## 8. Acceptance Bar

Before this slice is "done":

1. Unit + e2e + rules + mutation suites all pass for both new libs.
2. Mutation score on `libs/api-courses` ≥ 85% (with equivalents documented in a triage report, matching the `api-auth` precedent).
3. Manual run-through against the dev Firebase project:
   - Register a new user (lands as STUDENT).
   - Run `pnpm tools:promote-to-instructor <email>`.
   - Confirm student (a second account) gets `403` on `POST /api/courses` and is redirected away from `/courses/**`.
   - Sign back in as the promoted instructor and walk the full editor: create course, add modules, rename, drag-reorder, add lessons, rename, drag-reorder, delete a lesson, delete a module, reload the page and confirm the tree persists.
4. README status banner updated to reflect "EP-02 (US-02-01..03) complete; publish deferred to EP-03".
5. Spec status changed from Draft to Approved after stakeholder review.

## 9. Open Questions

None at design time. Resolved during brainstorming:

- **Publish gate vs EP-03 dependency** → resolved: defer publish (US-02-04) to the EP-03 slice.
- **How does a user become an instructor in MVP?** → resolved: dev-only ops script.
- **Which optional course fields are in scope?** → resolved: `longDescription`, `category`, `difficulty`. Cover image deferred.
- **Where do writes happen — API-mediated, direct Firestore, or hybrid?** → resolved: API-mediated (matches the EP-01 pattern; preserves the deliberate removal of the client Firestore SDK from commit `c50c0a3`).
- **Flat collections vs subcollections** → resolved: subcollections, for editor-load locality and clean cascade delete.
- **Ordering scheme** → resolved: dense integer per parent, server-owned, rewritten in a batch on reorder.
- **Concurrency** → resolved: LWW on fields, 409 on stale reorder, no optimistic locking.

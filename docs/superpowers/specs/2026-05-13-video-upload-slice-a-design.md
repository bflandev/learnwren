# Video Upload — EP-03 Slice A Design Spec

> [!NOTE]
> **DOCUMENT STATUS: DRAFT**
> This document is a living specification and is subject to change. All content is considered provisional until formally approved by project stakeholders.

**Status:** Draft (2026-05-13)
**Scope:** First implementation slice of EP-03 (Video Management and DRM). Delivers UC-03-01 main success scenario end-to-end: an instructor uploads a video file to a lesson via resumable upload, the lesson persistently shows the uploaded state, and deleting the lesson cleans up the attached video. Two new libraries (`libs/api-video`, `libs/web-video`), a `Video` and `VideoKey` schema in `shared-data-models`, a small refactor that hoists `InstructorRoleGuard` from `api-courses` to `api-auth`, and a new cross-lib edge `api-courses` → `api-video` for cascade delete. Transcoding (slice B), playback (slice C), notifications (slice E), and storage admin (slice F) are explicitly deferred.

This spec sits on top of `2026-05-13-video-pipeline-architecture-design.md` (the architecture decision spec) and inherits its provider stack (GCP Transcoder API + Cloud Storage + AES-128 HLS for MVP), data model shape (`Video` and `VideoKey` collections, deny-all rules), library boundaries, and bucket layout. It also sits on top of the EP-02 course-authoring slice (`2026-05-12-course-authoring-design.md`) and reuses its session cookie auth, `FirebaseSessionGuard`, `CourseOwnerGuard`, and `Course`/`Module`/`Lesson` Firestore layout.

## Goal

A fresh clone, after `pnpm install` and `pnpm secrets:render`, must satisfy:

- An instructor (promoted via the existing `pnpm tools:promote-to-instructor`) can navigate to a lesson in the course editor, click "Upload Video", select an MP4 / MOV / MKV file up to 10 GB, and watch a progress bar advance to 100% as the file streams to Cloud Storage.
- During the upload, transient network failures retry transparently (up to 3 per chunk with exponential backoff). A persistent failure surfaces an error and a "Try again" button.
- The instructor can cancel mid-upload; the partially-uploaded source object is best-effort deleted and the `Video` doc is removed.
- After upload completes, the lesson displays an "Uploaded — processing pending in EP-03" badge. Reloading the editor preserves the state.
- A second instructor cannot create or read another instructor's video. Endpoints return `403 NOT_COURSE_OWNER` or `403 NOT_VIDEO_OWNER` as appropriate.
- A student receives `403 INSUFFICIENT_ROLE` from every video endpoint.
- Deleting the lesson via the existing EP-02 endpoint cascades to its attached `Video` doc and source bucket object.
- All `videos/**` and `videoKeys/**` Firestore paths are deny-all from the client — every read and write goes through `libs/api-video`. New rules tests cover this denial against student, instructor, and anonymous principals.
- All prior-spec quality gates (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e`, `pnpm start`, `pnpm emulators`, `pnpm secrets:render`, `pnpm secrets:run`) pass with no regression on `api-auth`, `api-courses`, `web-auth`, or `web-courses`.
- Mutation testing on `libs/api-video` matches the bar set in `d90c588` for `api-auth` and continued by `api-courses`: ≥ 85% effective score with equivalents documented in a triage report.

## Non-Goals

Each is owned by a named subsequent slice or epic:

- **Slice B — Transcoding.** No GCP Transcoder API job is submitted. No AES-128 key is generated. No output bucket is touched. `Video.state` never reaches `TRANSCODING` or `READY` in slice A.
- **Slice C — Playback.** No manifest or key endpoints. No `web-video` player component. No EME wiring. The "processing pending" badge is the terminal observable state for slice A users.
- **Slice A.1 — Replace flow.** UC-03-01 extension 1a ("instructor is replacing an existing video") is out of scope. Slice A's upload-session handler rejects lessons that already have a `videoId` with 409 `LESSON_ALREADY_HAS_VIDEO`. Instructors who need to swap must delete the lesson and recreate.
- **Slice E — Notifications.** No in-app or email notification on upload completion or failure. The progress bar and badge are the only user-visible feedback.
- **Slice F — Soft-delete, retention, reconciliation.** Cancelled / failed videos are hard-deleted. Background reconciliation of stuck `PENDING_UPLOAD` docs is not implemented; the editor surfaces stuck state via a 30-minute affordance (see §6 item 7) but does not auto-resolve it.
- **Output bucket provisioning.** Slice B provisions and uses the output bucket. Slice A only writes to the source bucket.
- **Pub/Sub topic and webhook controller.** Slice B provisions and subscribes.
- **Cloud CDN in front of Cloud Storage.** Deferred per architecture spec; revisit when load demands.
- **Cross-client live state updates.** Firestore rules stay deny-all on `videos/**`; clients refresh state via API responses. Revisit relaxation in slice B if polling becomes painful.
- **Global multi-upload queue UI.** One upload per `LessonItem` instance; parallel uploads across lessons in the same tab are supported because each component owns its own service instance, but no global progress drawer.

## 1. State Machine

The architecture spec defines six `VideoState` values: `PENDING_UPLOAD`, `UPLOADING`, `UPLOADED`, `TRANSCODING`, `READY`, `FAILED`. Slice A persists a subset of three:

```
   ┌────────────────────┐
   │ PENDING_UPLOAD     │ ◄── POST .../upload-session
   └──────┬─────────────┘
          │
          │ client cancel ──► DELETE /api/videos/:vid ──► (doc deleted)
          │
          │ POST /api/videos/:vid/upload-complete
          │   (server HEAD-verifies object exists and size matches)
          ▼
   ┌────────────────────┐
   │ UPLOADED           │ ──► slice B picks up here (TRANSCODING → READY)
   └────────────────────┘
          │
          │ client cancel ──► DELETE /api/videos/:vid ──► (doc deleted)


   ┌────────────────────┐
   │ FAILED             │ ◄── PATCH /api/videos/:vid (client exhausted retries)
   └──────┬─────────────┘
          │ user "Try again" ──► DELETE /api/videos/:vid ──► fresh upload-session
```

- `UPLOADING` exists in the `VideoState` union (defined in `libs/shared-data-models`) so the type covers the architecture spec's full state machine, but slice A never writes it. With client-reports-completion, the server has no observation window between session creation and finalisation in which to distinguish `PENDING_UPLOAD` from `UPLOADING`.
- This tightens architecture spec §1.2 step 4, which previously implied an `UPLOADING` write driven by a "first byte" client ping. No such ping exists in slice A.
- `TRANSCODING` and `READY` are written by slice B. The slice A code paths that read `Video.state` (the editor refresh, the delete handler) treat unknown future states as opaque — the delete handler refuses to act on a `Video` outside `{ PENDING_UPLOAD, UPLOADED, FAILED }` to avoid trampling slice B's lifecycle.

## 2. API Surface

All endpoints live in `libs/api-video`. Path conventions match EP-02: upload-session creation is lesson-scoped (we need the full course-ownership chain); subsequent operations are video-id scoped (the `Video` doc holds the ownership pointer).

### 2.1 Endpoints

| Verb | Path | Body | Purpose |
|---|---|---|---|
| `POST` | `/api/courses/:cid/modules/:mid/lessons/:lid/video/upload-session` | `CreateUploadSessionDto` | Create `Video` doc in `PENDING_UPLOAD`; initiate Cloud Storage resumable session; return session URI |
| `POST` | `/api/videos/:vid/upload-complete` | — | Server HEAD-verifies source object; advances `Video.state` to `UPLOADED`; writes `Lesson.videoId` transactionally |
| `PATCH` | `/api/videos/:vid` | `UpdateVideoFailedDto` | Client-reported `FAILED` state after exhausting retries; records `failureReason` |
| `GET` | `/api/videos/:vid` | — | Read current `Video` state (used for editor refresh) |
| `DELETE` | `/api/videos/:vid` | — | Cancel or remove; deletes source object, `Video` doc, `VideoKey` (no-op in slice A); nulls `Lesson.videoId` |

### 2.2 DTOs (class-validator)

```ts
class CreateUploadSessionDto {
  @IsInt() @Min(1) @Max(10_000_000_000) sizeBytes!: number; // 10 GB decimal
  @IsIn(['video/mp4', 'video/quicktime', 'video/x-matroska']) contentType!:
    | 'video/mp4'
    | 'video/quicktime'
    | 'video/x-matroska';
  @IsOptional() @IsString() @MaxLength(255) filename?: string;
}

class UpdateVideoFailedDto {
  @IsIn(['FAILED']) state!: 'FAILED';
  @IsString() @MaxLength(500) failureReason!: string;
}
```

HEVC inside MP4 still has MIME `video/mp4`, so the allowlist covers H.265 without a separate entry. Codec validation happens at GCP Transcoder API submission in slice B; in slice A, any container that passes the MIME allowlist is accepted.

Wire format follows the conventions in `2026-04-29-initial-nx-monorepo-design.md` §4: branded IDs as raw strings on the wire, dates as ISO strings, no enums (string-literal unions only).

### 2.3 Response shapes

- `POST .../upload-session` → 201 `{ videoId: string, uploadSessionUri: string, expiresAt: ISODateString }`
- `POST /api/videos/:vid/upload-complete` → 200 `Video`
- `PATCH /api/videos/:vid` → 200 `Video`
- `GET /api/videos/:vid` → 200 `Video`
- `DELETE /api/videos/:vid` → 204

### 2.4 Guards and request augmentation

`InstructorRoleGuard` is **hoisted from `libs/api-courses` to `libs/api-auth`** as part of slice A. Rationale: role-checking is role-domain, not course-domain; both `api-courses` and `api-video` (and any future role-gated lib) need it. Single-file move plus import path updates in `api-courses`. Covered in §7 acceptance bar.

For `POST /api/courses/:cid/modules/:mid/lessons/:lid/video/upload-session`:
1. `FirebaseSessionGuard` (existing in `api-auth`)
2. `InstructorRoleGuard` (hoisted to `api-auth`)
3. `CourseOwnerGuard` (existing in `api-courses`) — resolves `:cid`, attaches loaded course to `request.course`
4. Handler resolves `:mid` / `:lid` against the loaded course; returns 404 if not found or not part of declared parent (consistent with EP-02 pattern)

For `/api/videos/:vid/*`:
1. `FirebaseSessionGuard`
2. `InstructorRoleGuard`
3. `VideoOwnerGuard` (new in `api-video`) — reads `videos/:vid` via the repository; returns 404 `VIDEO_NOT_FOUND` if missing; 403 `NOT_VIDEO_OWNER` if `Video.ownerInstructorId !== request.user.uid`; attaches the loaded video to `request.video`

### 2.5 Error contract

Matches the EP-01 / EP-02 convention: `{ code: string, message: string, fieldErrors?: Record<string, string> }`.

| HTTP | `code` | When |
|---|---|---|
| 400 | `VALIDATION_FAILED` | DTO validation failed; `fieldErrors` populated |
| 401 | `NOT_AUTHENTICATED` | No or expired session |
| 403 | `INSUFFICIENT_ROLE` | Role is not `INSTRUCTOR` |
| 403 | `NOT_COURSE_OWNER` | Instructor doesn't own the course (upload-session route) |
| 403 | `NOT_VIDEO_OWNER` | Instructor doesn't own the video (video-id routes) |
| 404 | `COURSE_NOT_FOUND` / `MODULE_NOT_FOUND` / `LESSON_NOT_FOUND` | Lesson-scoped resolution failures |
| 404 | `VIDEO_NOT_FOUND` | `:vid` doesn't exist |
| 409 | `LESSON_ALREADY_HAS_VIDEO` | Lesson's `videoId` already set (replace flow deferred) |
| 409 | `INVALID_VIDEO_STATE` | e.g., `upload-complete` called on a video already in `UPLOADED` or `FAILED` |
| 422 | `UPLOAD_OBJECT_MISSING` | `upload-complete` HEAD check found no source object |
| 422 | `UPLOAD_OBJECT_SIZE_MISMATCH` | Actual size exceeds declared `sizeBytes × 1.05` |
| 500 | `INTERNAL_ERROR` | Unexpected; logged with correlation id |

## 3. Data Layer

### 3.1 `libs/shared-data-models` additions

Per architecture spec §2.1:

```ts
export type VideoState =
  | 'PENDING_UPLOAD'
  | 'UPLOADING'    // defined for future slices; not written by slice A
  | 'UPLOADED'
  | 'TRANSCODING'  // slice B
  | 'READY'        // slice B
  | 'FAILED';

export type VideoId = Brand<string, 'VideoId'>;
export type VideoKeyId = Brand<string, 'VideoKeyId'>;

export interface Video {
  id: VideoId;
  ownerInstructorId: UserId;
  courseId: CourseId;
  lessonId: LessonId;
  state: VideoState;
  source: {
    bucket: string;
    path: string;
    sizeBytes?: number; // declared at create, overwritten with actual on upload-complete
  };
  output?: {
    bucket: string;
    manifestPath: string;
    durationSec: number;
  };
  transcoderJobName?: string;
  keyId?: VideoKeyId;
  failureReason?: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface VideoKey {
  id: VideoKeyId;
  videoId: VideoId;
  key: string; // base64 of 16 bytes (AES-128); not written by slice A
  createdAt: ISODateString;
}
```

`Lesson` change: drop `videoUrl?: string` (the EP-02 placeholder); add `videoId?: VideoId`.

### 3.2 Firestore document layout

```
videos/{videoId}
  ownerInstructorId, courseId, lessonId, state,
  source: { bucket, path, sizeBytes? },
  output?: { bucket, manifestPath, durationSec },
  transcoderJobName?, keyId?, failureReason?,
  createdAt, updatedAt

videoKeys/{keyId}                 # collection exists in slice A; no docs written
  videoId, key, createdAt
```

Top-level collections, not subcollections. Rationale per architecture spec §2.3.

### 3.3 Firestore security rules

`firestore.rules` adds:

```
match /videos/{videoId} {
  allow read, write: if false;
}
match /videoKeys/{keyId} {
  allow read, write: if false;
}
```

Both deny-all. Every read and write flows through `libs/api-video` using the Admin SDK. A new rules-unit test asserts denial against student, instructor, and anonymous principals — mirrors the `auth_attempts` deny-all suite from the auth-hardening slice and the `courses/**` deny-all from EP-02.

## 4. Bucket Interactions and Server-Side Flow

### 4.1 Object path convention

```
gs://${project}-video-source/videos/{videoId}/source.{ext}
```

where `{ext}` is `.mp4` / `.mov` / `.mkv` derived from `contentType`. Path is deterministic from `videoId`; no name collisions possible.

### 4.2 Upload-session creation

Server-initiated (not client-signed-URL). Rationale per §6 item 4.

Flow:
1. NestJS validates `CreateUploadSessionDto`.
2. Resolves `:cid/:mid/:lid`; runs `CourseOwnerGuard` chain; resolves the lesson; checks `lesson.videoId == null` → else 409 `LESSON_ALREADY_HAS_VIDEO`.
3. Creates `Video` doc in Firestore in `PENDING_UPLOAD`:
   - `id` server-generated
   - `ownerInstructorId`, `courseId`, `lessonId` from request context
   - `source: { bucket: ${LEARNWREN_VIDEO_SOURCE_BUCKET}, path: 'videos/{id}/source.{ext}', sizeBytes: <declared> }`
   - `state: 'PENDING_UPLOAD'`
   - `createdAt`, `updatedAt` set
4. Calls `bucket.file(path).createResumableUpload({ metadata: { contentType, metadata: { videoId } } })` via the `@google-cloud/storage` Admin SDK. `videoId` is embedded as object custom metadata so a future Cloud Storage trigger (slice F) can identify the video from the object alone.
5. Returns 201 `{ videoId, uploadSessionUri, expiresAt: <now + 7 days> }`. The 7-day window is Cloud Storage's default resumable session TTL.

### 4.3 Upload-complete verification

`POST /api/videos/:vid/upload-complete`:
1. `VideoOwnerGuard` resolves the video.
2. State check: must be `PENDING_UPLOAD`. Otherwise 409 `INVALID_VIDEO_STATE`.
3. HEAD the source object via Admin SDK (`bucket.file(path).getMetadata()`).
4. If 404 (object missing) → 422 `UPLOAD_OBJECT_MISSING`. `Video` stays in `PENDING_UPLOAD` so the client can retry.
5. If actual `size > declared sizeBytes × 1.05` → 422 `UPLOAD_OBJECT_SIZE_MISMATCH`. Best-effort delete the over-sized object; `Video` stays in `PENDING_UPLOAD`. (5% tolerance covers resumable protocol metadata overhead.)
6. Run a Firestore transaction:
   - Update `Video`: `state = UPLOADED`, `source.sizeBytes = <actual>`, `updatedAt = now`.
   - Update `Lesson`: `videoId = :vid`, `updatedAt = now`.
   The transaction ensures `Lesson.videoId` is only set when `Video.state === UPLOADED`, eliminating the race where the lesson points at a not-yet-finalised video.
7. Returns 200 Video.

### 4.4 Cancel / delete

`DELETE /api/videos/:vid`:
1. State check: must be in `{ PENDING_UPLOAD, UPLOADED, FAILED }`. Else 409 `INVALID_VIDEO_STATE` (defensive — slice B states fall through this gate).
2. Best-effort delete source object: `bucket.file(path).delete({ ignoreNotFound: true })`. Log non-404 errors but proceed.
3. Firestore transaction:
   - Delete `Video` doc.
   - If a `VideoKey` doc has `videoId === :vid`, delete it. (No-op in slice A; wired so slice B doesn't have to re-architect.)
   - If `Lesson.videoId === :vid`, null it. Conditional: defensive guard against deleting a doc that was already detached.
4. Returns 204.

### 4.5 Cross-lib cascade entry point

`VideoService.deleteForLesson(lessonId)` in `libs/api-video`:
1. Query `videos` where `lessonId === lessonId`. Single-doc expected (slice A enforces one-video-per-lesson at create time).
2. If a doc is found, run the same sequence as `DELETE /api/videos/:vid` body — best-effort source delete, transactional Firestore cleanup. Skip the state check (cascade is unconditional in slice A; slice B will revisit when `TRANSCODING` is a valid state for cascade).
3. If no doc, no-op.

`libs/api-courses` lesson-delete handler imports and invokes this method **before** deleting the lesson doc itself. Order matters: if the video cleanup fails, the lesson doc remains and the user can retry.

Nx graph: `api-courses` → `api-video` → `api-auth` → `shared-data-models`. New `api-courses` → `api-video` edge.

### 4.6 IAM and configuration

Cloud Functions runtime service account requires:
- `roles/storage.objectAdmin` on the source bucket — create resumable sessions, HEAD, delete objects.
- Existing `roles/datastore.user` already granted for EP-02.

New env var (rendered via existing `pnpm secrets:render` flow):
- `LEARNWREN_VIDEO_SOURCE_BUCKET` — full bucket name (e.g., `learn-wren-video-source-dev`).

The bucket is provisioned out of band as part of project setup; not managed by `firebase.json`. The same convention as the existing default Cloud Storage bucket.

## 5. Frontend (`libs/web-video`)

### 5.1 Component tree

```
VideoUploadComponent                # top-level; renders one substate
├─ FilePickerView                   # idle: drag-drop area + file input button
├─ UploadProgressView               # uploading + finalizing: bar with %, cancel button
└─ UploadErrorView                  # failed: error message + "Try again" button

VideoStateBadgeComponent            # shown when lesson.videoId is set
                                    # copy: "Uploaded — processing pending in EP-03"
                                    # (or stuck-state copy; see §5.5)
```

`VideoUploadService` (Angular injectable) owns the upload state machine and the XHR pipeline.

`VideoService` (Angular injectable) is a thin `HttpClient` wrapper, one method per API endpoint, returning `Observable<T>` — matches the existing convention from `libs/web-courses` `CoursesService`.

### 5.2 Integration with `libs/web-courses`

`LessonItem` conditionally renders:
- `VideoUploadComponent` when `lesson.videoId == null`
- `VideoStateBadgeComponent` when `lesson.videoId` is set

No Replace button in slice A. The badge is the terminal UI for a lesson with a video.

Nx graph: `web-courses` → `web-video` → `web-auth` → `shared-data-models`. New `web-courses` → `web-video` edge.

### 5.3 Client-side upload state machine

```
   ┌──────┐ file selected + size/MIME ok
   │ idle │ ─────────────────────────────┐
   └──┬───┘                              │
      │ size/MIME bad                    ▼
      │   surface inline error    ┌────────────────┐
      │                           │ creating-      │
      │                           │ session        │
      │                           └──┬─────────────┘
      │                              │ 201 OK
      │                              ▼
      │                           ┌────────────────┐
      │      user cancel ◄────────┤ uploading      │ XHR PUT chunks with onprogress
      │           │               │                │ transient 5xx retry (3×, 1s/2s/4s)
      │           ▼               └──┬───┬─────────┘
      │      ┌──────────┐            │   │ exhausted
      │      │canceling │            │   ▼
      │      └────┬─────┘            │  ┌──────────┐
      │           │ DELETE 204       │  │ failed   │ PATCH state=FAILED
      │◄──────────┘                  │  └────┬─────┘ "Try again" → DELETE then idle
      │                              │       │
      │                              ▼       │
      │                          ┌────────────────┐
      │                          │ finalizing     │ POST /upload-complete
      │                          └──┬─────────────┘ 200 OK
      │                             ▼
      │                          ┌────────────────┐
      └────────── emits ─────────│ complete       │ component emits VideoUploaded
                                 └────────────────┘ LessonItem refetches lesson
```

### 5.4 Cloud Storage resumable protocol implementation

`VideoUploadService` implements the standard pattern against the server-issued `uploadSessionUri`:
- Initial POST with `Content-Range: bytes */{size}` returns 308 with a `Range` header indicating bytes already received.
- Upload PUTs (~8 MiB chunks) with `Content-Range: bytes {N}-{M}/{total}`. 308 means "more expected"; 200 means done.
- On transient 5xx or network failure: re-query state with another POST; resume from the byte offset in the response's `Range` header. Up to 3 retries per chunk with exponential backoff (1s, 2s, 4s).
- `AbortController` for the cancel path.
- **XHR** (not `fetch`) for the upload PUTs — XHR's native `onprogress` event drives the progress bar; `fetch` doesn't expose request progress.

### 5.5 UI copy

| State | Display |
|---|---|
| Idle | "Drag a video file here, or click to choose. MP4, MOV, or MKV up to 10 GB." |
| Creating session | "Preparing upload…" |
| Uploading | Progress bar with `{percent}%` and a "Cancel" button. ETA omitted in MVP. |
| Finalizing | "Finishing up…" |
| Canceling | "Cancelling…" (briefly, then back to idle) |
| Complete (badge) | "Uploaded — processing pending in EP-03" |
| Stuck (badge) | "Upload may have stalled — retry?" with a button that triggers `DELETE` + fresh upload (see §6 item 7) |
| Failed: file rejected at picker | "Unsupported format. Please upload MP4, MOV, or MKV." or "File size exceeds the 10 GB limit." |
| Failed: upload error | "Upload failed: {reason}. [Try again]" |

### 5.6 Pre-flight client validation

Advisory; server enforces authoritatively in the upload-session DTO.

- File extension: `<input type="file" accept="video/mp4,video/quicktime,video/x-matroska,.mp4,.mov,.mkv,.m4v">`.
- File size ≤ 10,000,000,000 bytes: checked on selection; if oversize, surface inline error and never call `upload-session`.

The browser's detected MIME type from the file is sent as `contentType` in the DTO. Renamed files (e.g., `.txt` → `.mp4`) will have a non-`video/*` MIME and be rejected server-side with 400 `VALIDATION_FAILED`.

### 5.7 State management

Per-component Angular signals, consistent with the EP-02 `web-courses` pattern. No NgRx.

`VideoUploadService` exposes a `state: Signal<UploadState>` that the component renders directly. The service is declared in `VideoUploadComponent`'s `providers: [VideoUploadService]` array so each component instance gets its own service — supports parallel uploads across different `LessonItem`s in the same tab. There is no global upload queue manager in slice A.

## 6. Locked Decisions

1. **Completion detection: client-reports.** Stuck-state mitigated by §6 item 7; background reconciliation is slice F.
2. **Replace UX: badge only.** No Replace button in slice A. Instructors who need to swap delete the lesson and recreate.
3. **Persisted state subset: `PENDING_UPLOAD → UPLOADED → FAILED`.** `UPLOADING` remains in the type union but is never written.
4. **Server-initiated resumable session.** NestJS uses `@google-cloud/storage`'s `createResumableUpload` and returns the session URI directly. No signed-URL minting in slice A. Trade-off: marginally weaker pre-upload size enforcement (DTO check is authoritative; HEAD verify is the actual-size gate); much simpler client code.
5. **Size tolerance: 5%** on declared vs. actual at upload-complete HEAD check. Covers resumable-protocol metadata overhead.
6. **Best-effort source object cleanup** on cancel / delete. Log non-404 errors; proceed. Cloud Storage's built-in resumable orphan cleanup (default ~1 week) is the eventual safety net.
7. **Stuck-state UX threshold: 30 minutes** (configurable via `LEARNWREN_VIDEO_STUCK_THRESHOLD_MINUTES`, default 30). The editor reads `Video.updatedAt` on hydration; if a `Video` is in `PENDING_UPLOAD` and older than the threshold, it renders the stuck badge. Clicking triggers the standard `DELETE` + fresh upload path. Background reconciliation (auto-marking as `FAILED`) is slice F.
8. **`InstructorRoleGuard` hoisted to `libs/api-auth`.** Single-file move plus import updates in `api-courses`. Mutation score on `api-courses` must not regress (§7 acceptance bar).
9. **One video per lesson at create time.** Enforced via `Lesson.videoId == null` check in upload-session handler; 409 `LESSON_ALREADY_HAS_VIDEO` otherwise. Replace slice lifts this.
10. **`videoId` embedded as object custom metadata** at session creation. Available to future Cloud Storage triggers (slice F).
11. **Chunk size: 8 MiB** for client PUT chunks. Standard resumable-upload default.
12. **Transient retry: 3 per chunk, exponential backoff (1s, 2s, 4s).** After exhaustion, `Video → FAILED` with `failureReason`. Manual "Try again" deletes and starts fresh.
13. **XHR (not `fetch`)** for upload PUTs. Required for upload progress events.
14. **No global upload queue manager.** One concurrent upload per `LessonItem`; parallel uploads across lessons supported.
15. **Firestore rules stay deny-all** for `videos/**` and `videoKeys/**`. Clients refresh state via API responses. Revisit relaxation in slice B if polling becomes painful.
16. **Env config: `LEARNWREN_VIDEO_SOURCE_BUCKET`** and **`LEARNWREN_VIDEO_STUCK_THRESHOLD_MINUTES`**. Both rendered via existing `pnpm secrets:render` flow.
17. **No source-bucket lifecycle in slice A.** Sources retained indefinitely until slice F.
18. **Cascade delete is a direct cross-lib call.** `api-courses` → `api-video` via `VideoService.deleteForLesson(lessonId)`. Called **before** the lesson doc delete.

## 7. Testing

| Layer | Where | Coverage |
|---|---|---|
| Unit (Vitest, mocked Firestore + Storage) | `libs/api-video/src/lib/*.spec.ts` | `VideoService` state-machine transitions, `VideoRepository` Firestore mapping, `VideoOwnerGuard`, `InstructorRoleGuard` (after hoist), `CreateUploadSessionDto` validation, HEAD-verify + size-mismatch path, `deleteForLesson` cascade entrypoint |
| Component (Vitest + Angular utilities) | `libs/web-video/src/lib/*.spec.ts` | `VideoUploadService` state machine (XHR mocked — happy path, transient retry, exhausted retry → FAILED, cancel mid-upload), file-picker validation (size/MIME rejection), `VideoUploadComponent` state-to-view bindings, `VideoStateBadgeComponent` copy (incl. stuck-state), `VideoService` HTTP wrapper via `HttpTestingController` |
| Firestore rules | `firestore.rules` + existing rules-tests suite | `videos/**` and `videoKeys/**` deny-all against student, instructor, anonymous |
| API e2e (Firebase + Storage emulators) | `apps/api-e2e` | Happy path; 401; 403 `NOT_COURSE_OWNER`; 409 `LESSON_ALREADY_HAS_VIDEO`; 422 `UPLOAD_OBJECT_MISSING`; 422 `UPLOAD_OBJECT_SIZE_MISMATCH`; cancel during `PENDING_UPLOAD`; lesson-delete cascade removes Video doc and source object |
| Web e2e (Playwright) | `apps/web-e2e` | Instructor signs in → opens editor → uploads ~1 MB MP4 fixture → progress reaches 100% → badge appears → reload persists; cancel mid-upload returns to empty state; oversize file rejected client-side; stuck-state e2e using a reduced `LEARNWREN_VIDEO_STUCK_THRESHOLD_MINUTES` |
| Mutation (Stryker) | `libs/api-video` | ≥ 85% effective with equivalents documented in `reports/mutation/api-video-triage.md`, patterned on EP-02 precedent. New `stryker.api-video.config.mjs`. |
| CRAP score | existing tooling | Include `libs/api-video` and `libs/web-video` in the report (extends `1e355d0`'s pattern) |

**Reuse of EP-02 auth helpers**: existing api-e2e `registerAndSignIn` and `promoteToInstructor` helpers are reused as-is. Per the existing memory note about the flaky `api-e2e` auth happy-path: when that flake is addressed elsewhere, this slice's e2e suite benefits automatically. No new auth setup logic.

**Fixture management**: a tiny (~1 MB) MP4 fixture lives under `apps/api-e2e/fixtures/small-video.mp4` and `apps/web-e2e/fixtures/small-video.mp4` (duplicate or symlink — to be decided in implementation; both acceptable). Real-size (10 GB boundary) testing is not in MVP automated tests; it's a manual run-through item in §8.

## 8. Acceptance Bar

Before slice A is "done":

1. Unit, component, rules, API e2e, and web e2e suites all pass for `api-video` and `web-video`. No regression in existing suites (`api-auth`, `api-courses`, `web-auth`, `web-courses`).
2. Mutation score on `libs/api-video` ≥ 85% with equivalents documented in `reports/mutation/api-video-triage.md`.
3. `InstructorRoleGuard` hoist from `api-courses` to `api-auth` is complete; `api-courses` imports the hoisted guard; mutation score on `api-courses` does not regress relative to the EP-02 baseline.
4. Manual run-through against the dev Firebase project:
   - Promoted instructor uploads a small (~10 MB) MP4 to a lesson; progress reaches 100%; badge appears; reload persists.
   - Same instructor uploads a 1 GB MP4 (real network); resumes successfully after a deliberate network blip (DevTools Offline ≥ 10s mid-upload, then re-online).
   - Cancel mid-upload removes the Video doc and the source object; lesson returns to empty upload UI.
   - Oversize (10.5 GB) file is rejected client-side before any network call.
   - Wrong-MIME (`.txt` renamed `.mp4`): file picker accepts (extension-only filter), server rejects on upload-session with 400 `VALIDATION_FAILED`.
   - Delete a lesson with an attached video; verify source object is removed from the bucket and the Video doc is gone from Firestore.
   - Second instructor cannot read or mutate the first instructor's video. Direct curls return 403 `NOT_COURSE_OWNER` or 403 `NOT_VIDEO_OWNER` as appropriate.
5. Firestore rules emulator test asserts `videos/**` and `videoKeys/**` are deny-all from student, instructor, and anonymous principals.
6. README status banner updated: "EP-03 slice A (Video Upload) complete; transcoding deferred to slice B."
7. CRAP report includes `libs/api-video` and `libs/web-video`.
8. Spec status moves from Draft to Approved after stakeholder review.

## 9. Open Questions

None at design time. Resolved during brainstorming:

- **Upload-completion detection mechanism?** → client-reports (resolved §1, §6 item 1).
- **Replace flow UX in slice A?** → state badge only; no Replace button (resolved §5.2, §6 item 2).
- **State machine granularity in slice A?** → persist only `PENDING_UPLOAD`, `UPLOADED`, `FAILED`; drop `UPLOADING` (resolved §1, §6 item 3).
- **Signed-URL minting vs server-initiated session?** → server-initiated (resolved §4.2, §6 item 4).
- **Where does `InstructorRoleGuard` live?** → hoisted to `libs/api-auth` (resolved §2.4, §6 item 8).
- **One-video-per-lesson invariant in slice A?** → enforced at create time; 409 if violated (resolved §6 item 9).
- **Cancel-upload semantics?** → DELETE removes source object best-effort and the Video doc transactionally (resolved §4.4).
- **Cascade order on lesson delete?** → video cascade runs first; lesson doc deleted last (resolved §4.5, §6 item 18).
- **Firestore rules relaxation for videos?** → no; deny-all stays. Revisit in slice B (resolved §6 item 15).
- **Stuck-state UX vs reconciliation job?** → editor renders affordance at 30 minutes; reconciliation is slice F (resolved §6 item 7).

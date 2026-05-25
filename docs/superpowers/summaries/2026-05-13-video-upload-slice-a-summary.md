# Video: Upload (Slice A) — Implementation Summary

**Date:** 2026-05-13
**Spec:** `docs/superpowers/specs/2026-05-13-video-upload-slice-a-design.md`
**Plan:** `docs/superpowers/plans/2026-05-13-video-upload-slice-a.md`

First slice of EP-03 (Video & DRM). Ships UC-03-01 main success: an instructor opens a lesson in the course editor, picks an MP4 / MOV / MKV up to 10 GB, and the file streams to a Cloud Storage source bucket via a server-issued resumable session. Persisted lifecycle is the `PENDING_UPLOAD → UPLOADED` subset of the architecture spec's six-state machine; `FAILED` is a terminal client-reported branch. Deleting the lesson cascades to the attached `Video` doc and its source object. Transcoding, playback, key generation, and notifications are explicitly deferred to slices B/C/E.

## What shipped

### NestJS (`libs/api-video` — later merged into `libs/api-courses` on 2026-05-20 per `2026-05-20-merge-api-video-into-api-courses` spec; post-merge files live at `libs/api-courses/src/lib/video/`)

- `video.config.ts` — `VIDEO_CONFIG` symbol + `readVideoConfigFromEnv` reading `LEARNWREN_VIDEO_SOURCE_BUCKET` (required) and `LEARNWREN_VIDEO_STUCK_THRESHOLD_MINUTES` (default 30, must be positive number).
- `errors/video-error.codes.ts` + `errors/video.exception.ts` — `VideoException` base class plus `VideoNotFoundException`, `NotVideoOwnerException`, `LessonAlreadyHasVideoException`, `InvalidVideoStateException`, `UploadObjectMissingException`, `UploadObjectSizeMismatchException`.
- `dto/create-upload-session.dto.ts` — `sizeBytes` (1 .. 10_000_000_000), `contentType` in `{video/mp4, video/quicktime, video/x-matroska}`, optional `filename` ≤ 255. `SUPPORTED_VIDEO_CONTENT_TYPES` const was later hoisted into `shared-data-models` (commit `fda1cf4`).
- `dto/update-video.dto.ts` — client-reported `state: 'FAILED'` + `failureReason` ≤ 500.
- `video.repository.ts` — Firestore adapter. `newId`, `getVideo`, `getVideoByLesson`, `createVideo`, `updateVideo`, transactional `finalizeUpload` (atomic `Video.state=UPLOADED` + `Lesson.videoId` set) and transactional `deleteVideoAndDetach` (deletes video doc, any matching `videoKeys` doc, and `FieldValue.delete()`s `Lesson.videoId` when it points at the deleted video). `firestore.indexes.json` carries a lesson-id collection-group index for the lesson lookup.
- `video-storage.adapter.ts` — `VideoStoragePort` over `@google-cloud/storage`. `createResumableSession` (embeds `videoId` as object custom metadata, returns URI + 7-day `expiresAt`), `headObject` (404 → `null`), `deleteObject` (404 → no-op).
- `video.service.ts` — state-machine core. `createUploadSession` (lesson-must-be-empty check → `Video` doc + Cloud Storage session), `completeUpload` (PENDING_UPLOAD check → HEAD verify → 5% size tolerance → finalize), `markFailed`, `delete` (state-guarded best-effort source delete + transactional detach), `deleteForLesson` (cascade entry point — unconditional on state).
- `video-owner.guard.ts` — resolves `:vid` via `VideoRepository`, attaches loaded video to `request.video`; 404 `VIDEO_NOT_FOUND` / 403 `NOT_VIDEO_OWNER`.
- `video.controller.ts` — five endpoints: `POST /api/courses/:cid/modules/:mid/lessons/:lid/video/upload-session`, `GET /api/videos/:vid`, `POST /api/videos/:vid/upload-complete` (200), `PATCH /api/videos/:vid`, `DELETE /api/videos/:vid` (204). Globally guarded by `FirebaseSessionGuard` + `InstructorRoleGuard`; `CourseOwnerGuard` added to the lesson-scoped route; `VideoOwnerGuard` to the video-id routes.
- `video.exception-filter.ts` — per-feature filter (applied via `@UseFilters` on the controller, matching the EP-02 pattern). Maps `VideoException` to `{error: {code, message, details?}}` and rethrows `AuthException` so the auth filter handles it.
- `video.module.ts` — wires the providers; `controllers` array starts as just `VideoController` in slice A (transcoder/playback/webhook controllers arrive in slices B/C).

### Cross-lib cascade (`libs/api-courses`)

- `CoursesService.deleteLesson` calls `VideoService.deleteForLesson(lessonId)` **before** removing the lesson doc; commit `30e517a` adds an explicit test asserting cascade ordering and that the lesson doc is not deleted if the video cascade throws.
- `courses.module.ts` imports `VideoModule` via `forwardRef(() => require('@learnwren/api-video').VideoModule)` to break the `api-courses ↔ api-video` cycle at Nest decoration time; `nx.sync.ignoredDependencies` and an `@nx/enforce-module-boundaries` eslint-disable comment document the intentional cycle.

### Shared types (`libs/shared-data-models`)

- `video.ts` — `VideoState` union (six values; `UPLOADING` / `TRANSCODING` / `READY` reserved for future slices), `Video`, `VideoKey`, `VideoSource`, `VideoOutput`, branded `VideoId` / `VideoKeyId`.
- `lesson.ts` — dropped the EP-02 `videoUrl?: string` placeholder; added `videoId?: VideoId`.

### Auth refactor (`libs/api-auth`)

- `InstructorRoleGuard` and `InsufficientRoleException` hoisted from `libs/api-courses` into `libs/api-auth` (commit `0af0a9e`). `INSUFFICIENT_ROLE` added to `auth-error.codes.ts`; `api-courses` controllers import the guard from `@learnwren/api-auth` and the `api-courses` filter rethrows `AuthException` so the auth filter handles role failures.

### Angular (`libs/web-video`)

- `video.service.ts` — thin `HttpClient` wrapper, one method per endpoint, `withCredentials: true` on every call.
- `upload/video-upload.service.ts` — Angular signal-backed state machine (`idle | creating-session | uploading | finalizing | canceling | failed | complete`). XHR pipeline against the server-issued session URI: ~8 MiB `Content-Range` PUT chunks, 308 → resume, exponential backoff (1s / 2s / 4s), `AbortController` for cancel. Commit `845a902` later fixed the `Content-Range` end-byte calculation, the `onabort` handling, the cancel-vs-completion race, and a `contentType` cast.
- `upload/video-upload.component.ts` — standalone component with file picker / progress / error sub-views. Provides its own `VideoUploadService` so parallel uploads across `LessonItem` instances each get their own service instance.
- `video-state-badge.component.ts` — terminal badge for a lesson with `videoId` set; slice-A copy "Uploaded — processing pending in EP-03" (later widened in slices B/C/D).
- `libs/web-courses/.../lesson-item.component` mounts `<lib-video-upload>` when `lesson.videoId == null` and the badge when it is set; `LessonItem` re-fetches the lesson after `(uploaded)` emits.

### Rules

- `firestore.rules` and `firestore.emulator.rules` add deny-all `videos/{videoId}` and `videoKeys/{keyId}` blocks. All client reads/writes must go through `api-video`.

### Tests

- `libs/api-courses/src/lib/video/` (post-merge location) carries the slice-A unit specs: `video.config.spec.ts`, `errors/video.exception.spec.ts`, `dto/dto.spec.ts`, `video.repository.spec.ts`, `video-storage.adapter.spec.ts`, `video.service.spec.ts`, `video-owner.guard.spec.ts`, `video.controller.spec.ts`, `video.exception-filter.spec.ts`. (Spec count inflated by later slices — slice A landed roughly the upload-path subset of these.)
- `libs/web-video/src/lib/` — `video.service.spec.ts`, `upload/video-upload.service.spec.ts` (XHR mocked: happy path, transient retry, exhausted retry → FAILED, cancel), `upload/video-upload.component.spec.ts`, `video-state-badge.component.spec.ts`.
- `apps/api-e2e/src/firestore-rules.e2e-spec.ts` — `videos/**` and `videoKeys/**` deny-all against student, instructor, and anonymous principals (`6e7b03a`, `776d67c`, `776d67c`).
- `apps/api-e2e/src/videos.e2e-spec.ts` (commit `5f730e2`) — happy path, 401/403/409, 422 `UPLOAD_OBJECT_MISSING`, lesson-delete cascade. Uses a 2 KB `apps/api-e2e/src/fixtures/small-video.mp4`. Auth helpers extracted to `apps/api-e2e/src/_helpers/auth.ts`.
- `apps/web-e2e/src/videos.spec.ts` (commits `de9dfdb`, `e508ed6`) — upload happy path, cancel mid-upload, oversized client-side rejection.

## Plan deviations worth knowing about

- **`finalizeUpload` and `deleteVideoAndDetach` use `db.runTransaction`, not `WriteBatch`.** The plan's initial drafts used a batch + pre-read pattern. Commit `b6dc5a5` converted both to transactions so reads and writes share a snapshot, eliminating the TOCTOU window between the existence-check and the write.
- **`Lesson.videoId` detach uses `FieldValue.delete()`, not `null`.** The plan-as-written wrote `videoId: null`; `a7e4402` switched to deleting the field so reads don't see a literal-`null` slot.
- **A Firestore collection-group index on `lesson.id` is required** (added to `firestore.indexes.json` in `a7e4402`) because `finalizeUpload` looks up the lesson via `collectionGroup('lessons').where('id', '==', lid)`.
- **`SUPPORTED_VIDEO_CONTENT_TYPES` lives in `shared-data-models`, not in `api-video`'s DTO file.** Hoisted in `fda1cf4` so `web-video`'s pre-flight validation can share the constant.
- **`VideoExceptionFilter` is applied via `@UseFilters` on the controller**, not as a global filter (commit `615605c`). Matches the EP-02 `CoursesExceptionFilter` pattern and the per-feature-filter memory note.
- **`InsufficientRoleException` was hoisted alongside the guard.** The plan moved the guard but left the exception; the actual hoist took both (`0af0a9e` + `32912e9`). The `api-courses` filter now rethrows `AuthException` subclasses so the auth filter renders them.
- **`api-courses ↔ api-video` is a deliberate runtime cycle.** Plan §4.5 specified a one-way edge. The cascade direction (courses → video) plus `VideoController` injecting `CoursesRepository` produced a real cycle; the implementation handles it with `forwardRef(() => require('@learnwren/api-video').VideoModule)`, an `nx.sync.ignoredDependencies` entry, and a documented `@nx/enforce-module-boundaries` eslint-disable. This cycle is what later motivated the 2026-05-20 merge of `api-video` into `api-courses`.
- **`web-video` HTTP service sends `withCredentials: true` on every call** (`32c26d3`). The plan assumed the existing `withCredentialsInterceptor` would cover it, but the upload-session POST raced the interceptor registration in tests; the per-call flag is unconditional.
- **DTO validation switched to async** (`fda1cf4`) to align with the `ValidationPipe`'s transform configuration in `apps/api`.

## Verification outcome

- Unit tests: green for `api-video` (later folded into `api-courses`) and `web-video` per the commit history through `4be21ab` ("refresh CRAP + mutation reports for slice A").
- Firestore rules tests: green against the emulator (`videos/**` and `videoKeys/**` deny-all from student / instructor / anonymous, including the explicit delete-denial path in `6e7b03a`).
- API e2e (`apps/api-e2e/src/videos.e2e-spec.ts`): upload happy path, 422 upload-object-missing, lesson-delete cascade are active. The 401/403/409 multi-case was later quarantined with `test.fixme` during the EP-03 slice C / video-quarantine work (see memory note "api-e2e video quarantine") — at slice A close it was passing; it's currently dormant pending the fake source-storage seam.
- Web e2e (`apps/web-e2e/src/videos.spec.ts`): happy path, cancel mid-upload, oversize client-side rejection are slice-A tests; later commits added READY-state transitions for slices B/C.
- Mutation (Stryker) and CRAP reports for `api-video` and `web-video` refreshed in `4be21ab` before the README ship banner in `6555fc3`.
- Manual / live operations not executed by the agent: production-mode upload walk-through against the real `learn-wren` Firebase project, source-bucket provisioning (`gsutil mb` + `roles/storage.objectAdmin` grant), and the 1 GB / 10 GB-boundary upload smoke runs from spec §8 acceptance bar item 4. These are operator-side.
- README status banner updated to "EP-03 slice A (Video Upload) complete; transcoding deferred to slice B" in `6555fc3`.

## Follow-ups not in scope

Per spec §Non-Goals and §6 locked decisions, all explicitly deferred:

- **Slice B — Transcoding.** No GCP Transcoder job is submitted; no AES-128 key generation; no output bucket. (Shipped later — see slice B commits starting `2de09bc`.)
- **Slice C — Playback.** No manifest / key endpoints, no `web-video` player, no EME wiring. (Shipped later — slice C commits from `c16a22d`.)
- **Slice D — Publish gate.** Publish eligibility on a course with `UPLOADED` lessons but no `READY` is undefined in slice A. (Shipped later — slice D commits from `f5a367b`.)
- **Slice E — Notifications.** No in-app or email notification on upload completion or failure.
- **Slice F — Soft-delete, retention, reconciliation.** Cancelled / failed videos are hard-deleted; stuck `PENDING_UPLOAD` docs are surfaced via the 30-minute editor affordance but not auto-resolved.
- **Replace flow (UC-03-01 ext 1a).** Lessons with an existing `videoId` return 409 `LESSON_ALREADY_HAS_VIDEO`; swap requires lesson delete + recreate.
- **Cloud CDN, Pub/Sub topic, output bucket provisioning, global multi-upload queue, cross-client live state updates** — all deferred.

# Lesson Materials — EP-04 Design Spec

> [!NOTE]
> **DOCUMENT STATUS: DRAFT**
> This document is a living specification and is subject to change. All content is considered provisional until formally approved by project stakeholders.

**Status:** Draft (2026-05-21)
**Scope:** Single implementation slice of EP-04 (Lesson Materials). Delivers UC-04-01 end-to-end — an instructor attaches supplementary files (PDF, DOCX, PPTX, XLSX, TXT, ZIP; ≤ 50 MB each) to a lesson, customises their display names, and removes them — plus UC-04-02's signed-download endpoint, owner-gated. Adds a `Material` schema in `shared-data-models`, a `materials/` submodule in `libs/api-courses`, and a `materials/` submodule in `libs/web-courses`. No new libraries, no new Nx edges, one new env var.

This spec sits on top of:

- `2026-05-12-course-authoring-design.md` (EP-02 — `Course → Module → Lesson` hierarchy, `CourseOwnerGuard`, instructor role model, exception filter, editor page, `ConfirmDialogComponent`).
- `2026-05-13-video-upload-slice-a-design.md` (EP-03 slice A — `Video` lifecycle, the `PENDING_UPLOAD → … → READY` rhythm, `VideoOwnerGuard`, `VideoStorageAdapter`, cascade-delete via `deleteForLesson`, deny-all Firestore rules).
- `2026-05-14-video-playback-slice-c-design.md` (EP-03 slice C — `EnrollmentOrOwnerGuard`, signed-URL storage seam, `real`/`fake` storage modes).
- `2026-05-20-merge-api-video-into-api-courses-design.md` (the merge that established `video/` as a submodule of `api-courses` rather than a standalone lib).

It reuses the existing `FirebaseSessionGuard` + `InstructorRoleGuard` + `CourseOwnerGuard` auth chain, the existing error envelope, the EP-02 confirmation-dialog pattern, the `video.config.ts` `real`/`fake` config split, and the slice-A/B/C/D testing posture.

## Goal

A fresh clone, after `pnpm install` and `pnpm secrets:render`, must satisfy:

- A promoted instructor (`pnpm tools:promote-to-instructor`) navigates to a lesson in the course editor, clicks "Add material", selects one or more files (PDF / DOCX / PPTX / XLSX / TXT / ZIP, each ≤ 50 MB), and watches each one upload and appear in a materials list below the lesson's video section.
- Each material gets a default display name (its original filename); the instructor can rename it inline.
- The instructor can download any material they own — the file arrives with its original filename and correct MIME type.
- The instructor can remove a material; a confirmation dialog (matching the EP-02 delete pattern) gates the removal.
- Selecting an unsupported file type or an oversized file skips that file with an inline message; other valid files in the same selection continue uploading.
- A second instructor cannot read, mutate, or download another instructor's material — endpoints return `403 NOT_MATERIAL_OWNER` (or `403 NOT_COURSE_OWNER` on the lesson-scoped create route). A student receives `403 INSUFFICIENT_ROLE` from every authoring endpoint and `403 NOT_MATERIAL_OWNER` from the download endpoint (enrolled-student access is wired in EP-06).
- Deleting the lesson via the existing EP-02 endpoint cascades to every attached `Material` doc and its storage object.
- All `materials/**` Firestore paths are deny-all from the client — every read and write goes through `libs/api-courses`. A new rules-unit test covers this denial against student, instructor, and anonymous principals.
- All prior-spec quality gates pass: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e`, `pnpm start`, `pnpm emulators`, `pnpm secrets:render`, `pnpm secrets:run`. No regression in `api-auth`, `api-courses` (existing slices), `web-auth`, or `web-courses` (existing slices).
- Mutation testing on `libs/api-courses` matches the slice A/B/C/D bar: ≥ 85 % effective, with equivalents documented in the triage report.

## Non-Goals

Each is owned by a named subsequent slice or epic:

- **Student-facing lesson page and the enrolled-student download UI.** EP-06. UC-04-02's "downloads are only available to enrolled students" precondition has no surface today because no enrolment and no student lesson page exist. The download endpoint ships now, gated by `MaterialAccessGuard` (owner-or-enrolled); enrolment is a documented `TODO(EP-06)` seam, identical to slice C's `EnrollmentOrOwnerGuard`.
- **Course catalogue.** EP-05.
- **Material reordering.** The materials list is ordered by `createdAt` ascending (upload order). No drag-reorder — UC-04-01 does not call for it.
- **Material versioning / replace-in-place.** To swap a file, the instructor removes the material and adds a new one. No `REPLACING` state.
- **Per-lesson file-count cap.** YAGNI — UC-04-01 specifies no limit; the per-lesson list query is a single indexed equality regardless of count.
- **Virus / malware scanning of uploaded files.** Out of scope for the MVP; revisit under EP-09 (non-functional) if required.
- **Resumable / chunked upload.** Materials are ≤ 50 MB; a single signed PUT is sufficient. Resumable upload remains video-only.
- **Orphan-doc reconciliation.** A hard tab-close mid-upload can leave a `PENDING_UPLOAD` doc with no object. These are small and rare; background reconciliation is deferred to the video stack's slice F (retention) when it generalises.
- **Soft-delete / retention of removed materials.** Removal is a hard delete of the doc and a best-effort delete of the object.

## 1. State Machine

A `Material` has a two-state lifecycle — simpler than `Video` because the upload is a single PUT, not a resumable session.

```
   ┌────────────────────┐
   │ PENDING_UPLOAD     │ ◄── POST .../materials/upload-url
   └──────┬─────────────┘
          │
          │ client failure / cancel ──► DELETE /api/materials/:matId ──► (doc deleted)
          │
          │ POST /api/materials/:matId/complete
          │   (server HEAD-verifies object exists and size is within tolerance)
          ▼
   ┌────────────────────┐
   │ READY              │ ──► visible in the lesson's materials list; downloadable
   └──────┬─────────────┘
          │ DELETE /api/materials/:matId ──► (object + doc deleted)
```

- `PENDING_UPLOAD` docs are **excluded** from the materials list endpoint (§4) — only `READY` materials are listed. The upload component renders its own transient progress for in-flight files.
- On a client-side upload failure or an explicit cancel, the web client calls `DELETE /api/materials/:matId` to clean up. A hard tab-close leaves an orphan `PENDING_UPLOAD` doc with no object — small, rare, and acceptable; reconciliation is deferred (see Non-Goals).
- `complete` is only valid from `PENDING_UPLOAD`; calling it on a `READY` material returns `409 INVALID_MATERIAL_STATE`.

## 2. Data Model

### 2.1 `libs/shared-data-models` additions

New file `libs/shared-data-models/src/lib/material.ts`:

```ts
import type { Brand, CourseId, ISODateString, LessonId, UserId } from './common';

export type MaterialId = Brand<string, 'MaterialId'>;

export type MaterialState = 'PENDING_UPLOAD' | 'READY';

export const SUPPORTED_MATERIAL_EXTENSIONS = [
  'pdf',
  'docx',
  'pptx',
  'xlsx',
  'txt',
  'zip',
] as const;

export type SupportedMaterialExtension =
  (typeof SUPPORTED_MATERIAL_EXTENSIONS)[number];

/** Canonical MIME type stored as the object's content-type and used to bind
 *  the signed upload URL and to set the download Content-Type. */
export const MATERIAL_CONTENT_TYPE_BY_EXTENSION: Record<
  SupportedMaterialExtension,
  string
> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  zip: 'application/zip',
};

export const MATERIAL_MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MiB

export interface Material {
  id: MaterialId;
  ownerInstructorId: UserId; // denormalised — guard-time auth, mirrors Video
  courseId: CourseId;        // denormalised — cascade-delete
  lessonId: LessonId;
  displayName: string;       // instructor-customisable; defaults to originalFilename
  originalFilename: string;  // used for the download Content-Disposition
  extension: SupportedMaterialExtension;
  contentType: string;       // canonical MIME from MATERIAL_CONTENT_TYPE_BY_EXTENSION
  sizeBytes: number;         // actual size, set at upload-complete
  state: MaterialState;
  storage: { bucket: string; path: string };
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
```

`MaterialId` is added to the brand list in `libs/shared-data-models/src/lib/common.ts` and re-exported from the library entry point alongside the existing types. Wire format follows `2026-04-29-initial-nx-monorepo-design.md` §4: branded IDs as raw strings on the wire, dates as ISO strings, string-literal unions instead of enums.

`Lesson` is **unchanged** — materials are discovered by query (`where lessonId ==`), not by an id list on the lesson. This avoids the array-on-document mutation problems and keeps `Lesson` writes orthogonal to material changes.

### 2.2 Firestore document layout

```
materials/{materialId}
  ownerInstructorId, courseId, lessonId,
  displayName, originalFilename, extension, contentType, sizeBytes,
  state,
  storage: { bucket, path },
  createdAt, updatedAt
```

Top-level collection, not a subcollection — mirrors `videos`. Denormalised `ownerInstructorId` lets `MaterialOwnerGuard` resolve a material by id alone; denormalised `courseId` supports cascade-delete and the future EP-06 enrolment check.

### 2.3 Firestore security rules

`firestore.rules` adds:

```
match /materials/{materialId} {
  allow read, write: if false;
}
```

Deny-all. Every read and write flows through `libs/api-courses` using the Admin SDK. A new rules-unit test asserts denial against student, instructor, and anonymous principals — mirrors the `videos/**` deny-all suite.

### 2.4 Firestore indexes

None. The two queries this slice issues are both single-field equality on `lessonId` (`materials` collection):

- The per-lesson list endpoint queries `where lessonId == :lid`, then filters to `state === 'READY'` and sorts by `createdAt` ascending **in the service** (material counts per lesson are small).
- `deleteForLesson` queries `where lessonId == :lid` for the cascade.

Single-field indexes are automatic. No composite index, consistent with slice D.

### 2.5 Migration

No migration. `materials` is a brand-new collection. Existing `Lesson` docs are untouched.

## 3. Storage

### 3.1 Bucket

A dedicated **materials bucket**, separate from the video source/output buckets:

- Production: `LEARNWREN_MATERIALS_BUCKET` (required).
- Outside production: defaults to `learnwren-dev-materials` if the env var is absent — mirrors how `video.config.ts` defaults `sourceBucket`/`outputBucket` so `pnpm start` and the e2e suite boot credential-free.

Rationale for a dedicated bucket over a `materials/` prefix in the video source bucket: it isolates materials from any future video-source lifecycle rule (the video architecture's slice F may add a "delete source after transcode" rule) and keeps the IAM/lifecycle story per-bucket-clean. The runtime service account needs `roles/storage.objectAdmin` on this bucket.

### 3.2 Object path convention

```
gs://${materialsBucket}/materials/{materialId}/source.{ext}
```

where `{ext}` is the validated extension. Deterministic from `materialId`; no name collisions. The original filename is **not** in the path — it is stored in the `Material` doc and applied at download time via the signed URL's response-disposition override.

### 3.3 Config

New `libs/api-courses/src/lib/materials/materials.config.ts`, mirroring the structure and `real`/`fake` logic of `video.config.ts`:

```ts
export const MATERIALS_CONFIG = Symbol.for('learnwren.api-courses.materials.config');

export interface MaterialsConfig {
  materialsBucket: string;
  storageImpl: 'real' | 'fake';
  downloadUrlTtlSec: number; // default 900 (15 minutes — UC-04-02)
  uploadUrlTtlSec: number;   // default 900
}
```

`storageImpl` resolution mirrors `video.config.ts`:

- `NODE_ENV === 'production'` → `real` (and `LEARNWREN_MATERIALS_BUCKET` becomes required).
- Otherwise → `fake` by default (credential-free local dev + e2e).
- `LEARNWREN_MATERIALS_STORAGE_FAKE=true` is rejected when `NODE_ENV === 'production'`.

### 3.4 Storage adapter

New `MaterialsStorageAdapter` implementing a `MaterialsStoragePort`, with a `real`/`fake` split mirroring `VideoStorageAdapter.signObjectUrl`:

```ts
export interface MaterialsStoragePort {
  signUploadUrl(input: {
    bucket: string; path: string; contentType: string; materialId: string;
  }): Promise<{ uploadUrl: string; expiresAt: string }>;

  headObject(input: { bucket: string; path: string }): Promise<{ size: number } | null>;

  signDownloadUrl(input: {
    bucket: string; path: string; filename: string; contentType: string; ttlSec: number;
  }): Promise<{ downloadUrl: string; expiresAt: string }>;

  deleteObject(input: { bucket: string; path: string }): Promise<void>;
}
```

- **real `signUploadUrl`** — Admin SDK `file.getSignedUrl({ version: 'v4', action: 'write', contentType, expires })`. The `contentType` binds the URL: the browser must PUT with exactly that header, so a renamed file cannot smuggle a different type.
- **real `signDownloadUrl`** — `file.getSignedUrl({ version: 'v4', action: 'read', expires, responseDisposition: 'attachment; filename="<originalFilename>"', responseType: contentType })`. The browser receives the file with the original filename and correct MIME (UC-04-02 step 5).
- **fake `signUploadUrl` / `signDownloadUrl`** — return an internal API passthrough URL (§3.5). Real GCS v4 signed URLs do not work against the Firebase Storage emulator, so the passthrough is required for `pnpm emulators` and the e2e suite.
- `headObject` and `deleteObject` use the Admin SDK directly — these work against the Storage emulator unchanged (same as `VideoStorageAdapter`).

### 3.5 Fake-mode passthrough endpoints

When `storageImpl === 'fake'`, a `FakeMaterialsController` is registered (mirroring the conditionally-registered `FakeTranscoderController` at `/api/internal/fake-transcoder/*`):

| Verb | Path | Purpose |
|---|---|---|
| `PUT` | `/api/internal/fake-materials/:matId` | Receives the raw body and writes it to the emulator bucket via the Admin SDK (`file.save`). The 32 MB Cloud Run request cap is irrelevant — this only runs against the local emulator. |
| `GET` | `/api/internal/fake-materials/:matId` | Streams the object back from the emulator via the Admin SDK with `Content-Disposition: attachment; filename="..."` and the stored `Content-Type`. |

The web client PUTs/GETs whatever URL it receives and is agnostic to whether that URL points at GCS (real) or the API (fake). These endpoints are **not** registered in production.

## 4. API Surface

A new `MaterialsController` in `libs/api-courses/src/lib/materials/`. Creation is **lesson-scoped** (the create route needs the full `course → module → lesson` ownership chain); the remaining operations are **material-id-scoped** (the `Material` doc carries the ownership pointer). This mirrors the EP-03 slice-A split.

### 4.1 Endpoints

| Verb | Path | Guards | Purpose |
|---|---|---|---|
| `POST` | `/api/courses/:cid/modules/:mid/lessons/:lid/materials/upload-url` | Session + Instructor + CourseOwner | Validate extension + size; create `Material` doc in `PENDING_UPLOAD`; mint signed upload URL |
| `POST` | `/api/materials/:matId/complete` | Session + Instructor + MaterialOwner | HEAD-verify the object; set actual `sizeBytes`; advance `state` → `READY` |
| `GET` | `/api/courses/:cid/modules/:mid/lessons/:lid/materials` | Session + Instructor + CourseOwner | List the lesson's `READY` materials, sorted `createdAt` ascending |
| `PATCH` | `/api/materials/:matId` | Session + Instructor + MaterialOwner | Rename — body `{ displayName }` |
| `DELETE` | `/api/materials/:matId` | Session + Instructor + MaterialOwner | Best-effort delete the object; delete the `Material` doc |
| `GET` | `/api/materials/:matId/download-url` | Session + MaterialAccessGuard | Mint a 15-minute signed download URL |

The lesson-scoped routes resolve `:mid` / `:lid` against the loaded course and return `404 MODULE_NOT_FOUND` / `LESSON_NOT_FOUND` if not found or not part of the declared parent — consistent with the EP-02/slice-A pattern.

### 4.2 DTOs (class-validator)

```ts
class CreateMaterialUploadDto {
  @IsString() @IsNotEmpty() @MaxLength(255) filename!: string;
  @IsInt() @Min(1) @Max(MATERIAL_MAX_SIZE_BYTES) sizeBytes!: number;
}

class RenameMaterialDto {
  @IsString() @IsNotEmpty() @MaxLength(255) displayName!: string;
}
```

The extension is parsed from `filename` server-side and validated against `SUPPORTED_MATERIAL_EXTENSIONS`; an unsupported extension yields `400 UNSUPPORTED_MATERIAL_TYPE`. `contentType` is **derived** from the extension (`MATERIAL_CONTENT_TYPE_BY_EXTENSION`), never trusted from the client — browsers report unreliable MIME for the Office formats. `sizeBytes` is a declared value; the authoritative size check happens at `complete` via HEAD.

### 4.3 Response shapes

- `POST .../materials/upload-url` → `201 { materialId: string, uploadUrl: string, expiresAt: ISODateString }`
- `POST /api/materials/:matId/complete` → `200 Material`
- `GET .../lessons/:lid/materials` → `200 Material[]`
- `PATCH /api/materials/:matId` → `200 Material`
- `DELETE /api/materials/:matId` → `204`
- `GET /api/materials/:matId/download-url` → `200 { downloadUrl: string, expiresAt: ISODateString }`

### 4.4 Guards

- `MaterialOwnerGuard` (new) — mirrors `VideoOwnerGuard`. Reads `materials/:matId` via the repository; `404 MATERIAL_NOT_FOUND` if missing; `403 NOT_MATERIAL_OWNER` if `Material.ownerInstructorId !== request.user.uid`; attaches the loaded material to the request.
- `MaterialAccessGuard` (new) — mirrors `EnrollmentOrOwnerGuard`. Allows the course owner; carries a `TODO(EP-06)` seam for the enrolled-student branch (an `EnrollmentRepository` lookup). Today, with no enrolment records, it resolves to owner-only — exactly the slice-C precedent.
- `FirebaseSessionGuard`, `InstructorRoleGuard`, `CourseOwnerGuard` are reused unchanged from `api-auth` / `api-courses`.

### 4.5 Error contract

Matches the EP-01/02/03 envelope: `{ code: string, message: string, fieldErrors?: Record<string, string> }`.

| HTTP | `code` | When |
|---|---|---|
| 400 | `VALIDATION_FAILED` | DTO validation failed (incl. declared `sizeBytes` over the `@Max` 50 MB limit); `fieldErrors` populated |
| 400 | `UNSUPPORTED_MATERIAL_TYPE` | `filename` extension not in `SUPPORTED_MATERIAL_EXTENSIONS` |
| 401 | `NOT_AUTHENTICATED` | no / expired session |
| 403 | `INSUFFICIENT_ROLE` | role is not `INSTRUCTOR` |
| 403 | `NOT_COURSE_OWNER` | instructor doesn't own the course (create / list routes) |
| 403 | `NOT_MATERIAL_OWNER` | requester doesn't own the material (material-id routes, incl. download today) |
| 404 | `COURSE_NOT_FOUND` / `MODULE_NOT_FOUND` / `LESSON_NOT_FOUND` | lesson-scoped resolution failures |
| 404 | `MATERIAL_NOT_FOUND` | `:matId` doesn't exist |
| 409 | `INVALID_MATERIAL_STATE` | `complete` called on a material not in `PENDING_UPLOAD` |
| 422 | `UPLOAD_OBJECT_MISSING` | `complete` HEAD check found no object |
| 422 | `UPLOAD_OBJECT_SIZE_MISMATCH` | actual size exceeds `MATERIAL_MAX_SIZE_BYTES × 1.05` |
| 500 | `INTERNAL_ERROR` | unexpected; logged with a correlation id |

New codes are added to the `api-courses` error-codes module; the existing `api-courses` exception filter maps the new exception classes to these HTTP statuses.

## 5. Server-Side Flow

### 5.1 Upload-url creation

`POST /api/courses/:cid/modules/:mid/lessons/:lid/materials/upload-url`:

1. NestJS validates `CreateMaterialUploadDto`.
2. Parse + validate the extension from `filename` → `400 UNSUPPORTED_MATERIAL_TYPE` if unsupported.
3. `CourseOwnerGuard` has loaded the course; resolve `:mid` / `:lid` against it → `404` if not found.
4. Create the `Material` doc in `PENDING_UPLOAD`:
   - `id` server-generated.
   - `ownerInstructorId`, `courseId`, `lessonId` from request context.
   - `displayName = originalFilename = <filename>`; `extension`; `contentType` from the extension map.
   - `sizeBytes = <declared>` (overwritten with the actual value at `complete`).
   - `storage = { bucket: materialsBucket, path: 'materials/{id}/source.{ext}' }`.
   - `createdAt`, `updatedAt` set.
5. `MaterialsStorageAdapter.signUploadUrl(...)` → signed PUT URL bound to `contentType`.
6. Return `201 { materialId, uploadUrl, expiresAt }`.

### 5.2 Upload-complete verification

`POST /api/materials/:matId/complete`:

1. `MaterialOwnerGuard` resolves the material.
2. State check: must be `PENDING_UPLOAD` → else `409 INVALID_MATERIAL_STATE`.
3. HEAD the object via `MaterialsStorageAdapter.headObject`.
4. Object missing → `422 UPLOAD_OBJECT_MISSING`; the material stays in `PENDING_UPLOAD` so the client can retry.
5. Actual size > `MATERIAL_MAX_SIZE_BYTES × 1.05` → `422 UPLOAD_OBJECT_SIZE_MISMATCH`; best-effort delete the oversized object; the material stays in `PENDING_UPLOAD`. (The 5 % tolerance is a small allowance consistent with slice A; the hard 50 MB product limit is enforced at the DTO and reaffirmed here.)
6. Update the `Material`: `state = READY`, `sizeBytes = <actual>`, `updatedAt = now`.
7. Return `200 Material`.

### 5.3 List

`GET /api/courses/:cid/modules/:mid/lessons/:lid/materials`: `CourseOwnerGuard` + lesson resolution, then query `materials where lessonId == :lid`, filter to `state === 'READY'`, sort by `createdAt` ascending, return `Material[]`.

### 5.4 Rename

`PATCH /api/materials/:matId`: `MaterialOwnerGuard`, then update `displayName` + `updatedAt`. Allowed in any state (a `PENDING_UPLOAD` rename is harmless, though the UI only exposes rename for `READY` materials). Return `200 Material`.

### 5.5 Delete

`DELETE /api/materials/:matId`:

1. `MaterialOwnerGuard` resolves the material.
2. Best-effort delete the storage object (`deleteObject` swallows 404).
3. Delete the `Material` doc.
4. Return `204`.

No state guard — delete is unconditional from either state.

### 5.6 Download-url

`GET /api/materials/:matId/download-url`: `MaterialAccessGuard` resolves + authorises the material, then `MaterialsStorageAdapter.signDownloadUrl({ ..., filename: originalFilename, contentType, ttlSec: downloadUrlTtlSec })` → `200 { downloadUrl, expiresAt }`. If the material was removed since the page loaded, the guard returns `404 MATERIAL_NOT_FOUND` (UC-04-02 extension 4b). An expired URL is handled client-side by simply re-requesting (UC-04-02 extension 4a).

### 5.7 Cascade delete

`MaterialsService.deleteForLesson(lessonId)` in `libs/api-courses`:

1. Query `materials where lessonId == lessonId`.
2. For each doc, run the `DELETE /api/materials/:matId` body (best-effort object delete, then doc delete).
3. No docs → no-op.

The existing `api-courses` lesson-delete handler invokes `deleteForLesson` **before** deleting the lesson doc — same ordering rule as the video cascade, so a failed cleanup leaves the lesson recoverable. Because `materials/` is a submodule of `api-courses`, this is a **plain internal service call** — no cross-lib edge, no `forwardRef` seam (the payoff of the submodule placement). Module and course deletion already cascade through lessons, so they reach materials transitively with no extra wiring.

## 6. Frontend (`libs/web-courses` materials submodule)

### 6.1 Component tree

```
MaterialsListComponent              # mounted in LessonItem, below the video section
├─ (per material row)               # display name (inline-editable) + Download + Remove
├─ MaterialUploadControl            # "Add material" file picker + per-file progress
└─ ConfirmDialogComponent           # reused from EP-02, for Remove
```

- `MaterialsListComponent` lists the lesson's `READY` materials. Each row: an inline-editable display name (reusing the lesson-rename input pattern from `LessonItemComponent` — `(blur)` / `Enter` commits, `Escape` cancels), a **Download** button, a **Remove** button. Below the list, an "Add material" file-picker button (`<input type="file" multiple accept=".pdf,.docx,.pptx,.xlsx,.txt,.zip">`).
- `MaterialUploadService` — per-component Angular injectable (declared in the component `providers`, like `VideoUploadService`). Owns the multi-file upload queue: validate each file → `upload-url` → XHR PUT (XHR for `onprogress`) → `complete`. Files are processed sequentially. Unsupported-extension or oversized files are skipped with a per-file inline message; valid files in the same selection continue (UC-04-01 extensions 4a/4b).
- `MaterialsService` — thin `HttpClient` wrapper, one method per endpoint, returning `Observable<T>`, matching the existing `CoursesService` convention.
- State is held in per-component Angular signals — no NgRx, consistent with the rest of `web-courses`.

### 6.2 Integration with the editor

`LessonItemComponent` mounts `<lib-materials-list [courseId] [moduleId]="lesson().moduleId" [lessonId]="lesson().id">` directly below the existing video block (the use case places materials "below the video player"). The materials list is shown regardless of video state — a lesson can have materials with or without a video. The existing video upload/player/badge surface is untouched.

`MaterialsListComponent` fetches its lesson's materials on init (`GET .../lessons/:lid/materials`), the same lazy per-lesson fetch pattern `LessonItemComponent` uses for its video.

### 6.3 Download

Clicking **Download** calls `GET /api/materials/:matId/download-url`, then triggers the browser download by assigning the returned `downloadUrl` (a temporary anchor element with the `download` attribute, or `window.location`). The signed URL carries the response-disposition and content-type, so the file saves with the original filename and correct MIME. On `404 MATERIAL_NOT_FOUND`, the row shows "This material is no longer available." and is removed from the list (UC-04-02 extension 4b).

### 6.4 Remove

Clicking **Remove** opens the reused `ConfirmDialogComponent` (UC-04-01 extension 1a). Confirm → `DELETE /api/materials/:matId` → the row is removed from the list. Cancel → no-op (extension 1a-3a).

### 6.5 UI copy

| State | Display |
|---|---|
| Empty list | "No materials yet." |
| Add button | "Add material" — picker hint: "PDF, DOCX, PPTX, XLSX, TXT, or ZIP, up to 50 MB each." |
| Uploading (per file) | filename + a progress bar with `{percent}%` |
| Rejected: unsupported type | "Unsupported file type. Supported formats: PDF, DOCX, PPTX, XLSX, TXT, ZIP." |
| Rejected: oversize | "File exceeds the 50 MB limit." |
| Upload error | "Upload failed: {reason}. [Try again]" |
| Download — material gone | "This material is no longer available." |
| Remove confirm dialog | "Remove '{displayName}'? This cannot be undone." — `[Cancel]` / `[Remove material]` |

### 6.6 Nx graph

No new Nx edges. `materials/` is a submodule of the existing `libs/web-courses`; `MaterialsService` calls the API via the existing `HttpClient` setup. `web-courses` already depends on `web-auth` and `shared-data-models`.

## 7. Library Structure

### 7.1 `libs/api-courses` additions

```
libs/api-courses/src/lib/materials/             # NEW submodule
├── materials.controller.ts                     # 6 routes (§4.1)
├── materials.controller.spec.ts
├── materials.service.ts                        # orchestration + deleteForLesson cascade
├── materials.service.spec.ts
├── materials.repository.ts                     # Firestore mapping for materials/**
├── materials.repository.spec.ts
├── materials.config.ts                         # MaterialsConfig + readFromEnv (§3.3)
├── materials.config.spec.ts
├── materials-storage.adapter.ts                # MaterialsStoragePort, real/fake (§3.4)
├── materials-storage.adapter.spec.ts
├── material-owner.guard.ts                     # mirrors VideoOwnerGuard
├── material-owner.guard.spec.ts
├── material-access.guard.ts                    # mirrors EnrollmentOrOwnerGuard
├── material-access.guard.spec.ts
├── materials.module.ts                         # wires the submodule into api-courses
├── dto/
│   ├── create-material-upload.dto.ts
│   ├── rename-material.dto.ts
│   └── dto.spec.ts
├── errors/
│   ├── material-error.codes.ts
│   ├── material.exception.ts
│   └── material.exception.spec.ts
├── types/
│   └── loaded-material.ts                      # request augmentation type
└── webhook/                                    # fake-mode only
    ├── fake-materials.controller.ts            # PUT/GET /api/internal/fake-materials/:matId
    └── fake-materials.controller.spec.ts
```

`materials.module.ts` is imported by the top-level `CoursesModule`. The lesson-delete handler in the existing courses service gains one line: `await this.materials.deleteForLesson(lessonId)` before the lesson doc delete.

### 7.2 `libs/web-courses` additions

```
libs/web-courses/src/lib/materials/             # NEW submodule
├── materials-list.component.{ts,html}
├── materials-list.component.spec.ts
├── material-upload.service.ts
├── material-upload.service.spec.ts
├── materials.service.ts                        # HttpClient wrapper
└── materials.service.spec.ts
```

`LessonItemComponent` (existing) is modified to mount `<lib-materials-list>`.

### 7.3 `libs/shared-data-models` additions

`material.ts` (§2.1); `MaterialId` added to `common.ts`; both re-exported from the library entry point.

### 7.4 Nx graph

Unchanged. No new projects, no new edges. `materials/` lives inside `api-courses` / `web-courses`; cascade-delete is an in-lib call.

## 8. Testing

Mirrors the slice A/B/C/D posture — Vitest + Playwright + Stryker, no new runner.

| Layer | Where | Coverage |
|---|---|---|
| Unit (Vitest, mocked Firestore + Storage) | `libs/api-courses/src/lib/materials/**/*.spec.ts` | `MaterialsService` — upload-url create, complete (HEAD-verify happy path, object-missing → 422, size-mismatch → 422, wrong state → 409), list (READY filter + createdAt sort), rename, delete, `deleteForLesson` cascade (zero / one / many). `MaterialsRepository` Firestore mapping. `MaterialOwnerGuard` (404 / 403 / pass). `MaterialAccessGuard` (owner pass, non-owner 403). `materials.config` env parsing (real/fake resolution, production-rejects-fake, bucket default). `MaterialsStorageAdapter` real + fake branches. Extension parsing + content-type derivation. DTO validation. Exception classes map to the right HTTP codes via the existing filter. |
| Unit (controller layer) | `materials.controller.spec.ts` | Each of the 6 routes: happy path, path-param wiring, response shape (§4.3), error envelope (§4.5), pass-through to `MaterialsService` (mocked). |
| Component (Vitest + Angular utilities) | `libs/web-courses/src/lib/materials/**/*.spec.ts` | `MaterialUploadService` state machine (XHR mocked — happy path, upload error, multi-file with one rejected file, per-file validation: unsupported extension + oversize). `MaterialsListComponent` — renders `READY` rows, inline rename commit/cancel, Download click → URL fetch + browser-download trigger, Remove → confirm dialog → delete, empty state, "no longer available" on 404. `MaterialsService` HTTP wrapper via `HttpTestingController`. |
| Firestore rules | `firestore.rules` + existing rules-tests suite | `materials/**` deny-all against student, instructor, anonymous. |
| API e2e (Firebase + Storage emulators, fake materials storage) | `apps/api-e2e` | Happy path: register → promote → create course/module/lesson → `upload-url` → PUT to the fake passthrough → `complete` → `GET .../materials` lists it → `PATCH` rename → `GET download-url` → `DELETE`. Negative: 401; 403 `NOT_COURSE_OWNER`; 403 `NOT_MATERIAL_OWNER` (second instructor on every material-id route incl. download); 400 `UNSUPPORTED_MATERIAL_TYPE`; 400/`@Max` oversize; 409 `INVALID_MATERIAL_STATE` (double `complete`); 422 `UPLOAD_OBJECT_MISSING` (`complete` with no PUT). Cascade: delete the lesson → material doc + object gone. |
| Web e2e (Playwright) | `apps/web-e2e` | Instructor signs in → opens the editor → adds a small fixture file (e.g. a tiny PDF) → it appears in the materials list → rename it inline → download it → remove it via the confirm dialog → list is empty. Unsupported-type file rejected with the inline message. No console errors. |
| Mutation (Stryker) | `libs/api-courses` | ≥ 85 % effective; raw output refreshed in `reports/mutation/api-courses/`; triage notes folded into `docs/quality/mutation-report.md`. New surface mutated: `MaterialsService`, guards, config, storage adapter, exception classes, controller routes. |
| CRAP score | existing tooling (`tools/crap/crap.mjs`) | Refresh `docs/quality/crap-report.md` to cover the new `materials/` submodules in `libs/api-courses` and `libs/web-courses`. |

**Fixtures:** small fixture files (a few KB each — a `.pdf` and one unsupported type such as `.png`) under `apps/api-e2e/src/fixtures/` and `apps/web-e2e/fixtures/`. Real 50 MB-boundary testing is a manual run-through item (§10), not an automated test.

**Flake passthrough:** the e2e tests sit downstream of register → promote → course/module/lesson, inheriting the known `api-e2e` auth happy-path flake (see project memory). Mitigation matches prior slices: re-run on suspected flake, chase only on repeated failure.

## 9. Locked Decisions

1. **Single slice.** UC-04-01 in full + UC-04-02's download endpoint, owner-gated. No decomposition into sub-slices.
2. **Owner-gated download now; enrolled-student access later.** `MaterialAccessGuard` mirrors `EnrollmentOrOwnerGuard` with a `TODO(EP-06)` enrolment seam. No enrolment records exist, so it is owner-only today.
3. **Signed single-PUT upload.** API mints a v4 signed PUT URL; the browser uploads directly to Cloud Storage; a `complete` endpoint HEAD-verifies. No resumable/chunked upload (50 MB doesn't need it), no bytes routed through the API in production (would breach the ~32 MB Cloud Run request cap).
4. **Top-level `materials` collection.** Mirrors `videos`, with denormalised `ownerInstructorId` / `courseId`. Not a subcollection, not an array on `Lesson`.
5. **`materials/` submodule inside `api-courses` / `web-courses`.** No new libraries, no new Nx edges — cascade-delete is a plain in-lib call. Follows the post-`api-video`-merge direction.
6. **Dedicated materials bucket** (`LEARNWREN_MATERIALS_BUCKET`, dev default `learnwren-dev-materials`). Isolates materials from any future video-source lifecycle rule.
7. **Type validation by file extension, not browser MIME.** The server parses the extension, validates it, and derives the canonical content-type. Browser MIME for Office formats is unreliable.
8. **Two-state lifecycle** `PENDING_UPLOAD → READY`. `PENDING_UPLOAD` docs are hidden from the list; client cleans up on failure/cancel; hard-tab-close orphans are accepted (reconciliation deferred).
9. **5 % size tolerance** at `complete`, consistent with slice A; the hard 50 MB product limit is enforced at the DTO and reaffirmed at HEAD.
10. **No per-lesson file-count cap** (YAGNI).
11. **No material reordering, versioning, or replace-in-place.** Ordered by `createdAt` ascending; swap = remove + add.
12. **`fake`/`real` storage split** mirroring `video.config.ts`; fake mode uses internal passthrough endpoints (`/api/internal/fake-materials/:matId`) registered only outside production.
13. **Firestore rules:** `materials/**` deny-all. No new indexes.
14. **`Lesson` is unchanged.** Materials are discovered by query, not by an id list on the lesson.
15. **CRAP and mutation thresholds match the slice A/B/C/D bar** (`libs/api-courses` ≥ 85 % effective).

## 10. Environment Variables

One new variable, rendered via the existing `pnpm secrets:render` flow (added to `.env.tpl`):

- `LEARNWREN_MATERIALS_BUCKET` — full materials bucket name. Required when `NODE_ENV === 'production'`; defaults to `learnwren-dev-materials` otherwise.

Optional overrides (sensible defaults; not normally set):

- `LEARNWREN_MATERIALS_STORAGE_FAKE` — `true` forces fake storage; rejected when `NODE_ENV === 'production'`. Defaults: fake outside production, real in production.
- `LEARNWREN_MATERIALS_DOWNLOAD_URL_TTL_SEC` — signed download URL TTL; default `900` (15 minutes, per UC-04-02).
- `LEARNWREN_MATERIALS_UPLOAD_URL_TTL_SEC` — signed upload URL TTL; default `900`.

IAM: the Cloud Functions runtime service account needs `roles/storage.objectAdmin` on the materials bucket. The bucket is provisioned out of band as part of project setup, consistent with the video buckets.

## 11. Doc Updates

The edits below land alongside the implementation:

- **`README.md`** — status banner appended: EP-04 (Lesson Materials) complete — instructors attach / rename / remove supplementary files; owner-gated signed download. Add the materials endpoints to the API table.
- **`docs/superpowers/specs/2026-03-27-mvp-use-cases-design.md`** — mark UC-04-01 / UC-04-02 as addressed by this spec.
- **`docs/USER_GUIDE.md`** — document the materials feature and note that enrolled-student download arrives with EP-06.
- **`docs/development.md`** — note the `LEARNWREN_MATERIALS_BUCKET` env var and the fake-materials passthrough for local dev.

No edits required to `docs/epics/TECHNICAL_ARCHITECTURE.md` — the data-model section already lists File Storage for "Video & Lesson Materials"; the logical entity set gains `Material`, which the spec's §2.1 defines.

## 12. Acceptance Bar

Before this slice is "done":

1. Unit, component, rules, API e2e, and web e2e suites all pass for the new `materials/` submodules. No regression in `api-auth`, `web-auth`, or the existing `api-courses` / `web-courses` slices.
2. Mutation score on `libs/api-courses` ≥ 85 % effective; raw output refreshed in `reports/mutation/api-courses/`; triage notes folded into `docs/quality/mutation-report.md`.
3. `docs/quality/crap-report.md` refreshed to cover the new `materials/` submodules.
4. Manual run-through against the dev Firebase project:
   - Promoted instructor adds a PDF and a DOCX to a lesson; both appear in the list with their filenames as display names.
   - Rename a material inline; reload the editor — the new name persists.
   - Download a material; the file saves with its original filename and opens correctly.
   - Select a mixed batch including an unsupported type and an oversized file; the bad ones are skipped with inline messages, the good ones upload.
   - Remove a material via the confirm dialog; it disappears from the list and the storage object is gone.
   - Delete a lesson with materials; verify every material doc and object is removed.
   - A second instructor cannot list, rename, delete, or download the first instructor's materials (direct curls return 403).
5. Firestore rules emulator test asserts `materials/**` is deny-all from student, instructor, and anonymous principals.
6. CI is green end-to-end.
7. README and the other docs in §11 are updated.
8. Spec status moves from Draft to Approved after stakeholder review.

## 13. Open Questions

None at design time. All scope dimensions were resolved during brainstorming:

- How much of EP-04 in this slice? → UC-04-01 in full + UC-04-02's owner-gated download endpoint (§9 item 1).
- Upload mechanism? → signed single-PUT URL + `complete` HEAD-verify (§9 item 3).
- Material metadata storage? → top-level `materials` collection (§9 item 4).
- Library placement? → `materials/` submodule inside `api-courses` / `web-courses` (§9 item 5).
- Dedicated bucket vs shared prefix? → dedicated materials bucket (§9 item 6).
- Type validation by MIME or extension? → by extension (§9 item 7).
- Per-lesson file-count cap? → none, YAGNI (§9 item 10).
- Local-dev / e2e path for signed URLs? → fake-mode passthrough endpoints (§9 item 12).

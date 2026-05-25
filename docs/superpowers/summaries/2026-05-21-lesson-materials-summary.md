# Lesson Materials — Implementation Summary

**Date:** 2026-05-21
**Spec:** `docs/superpowers/specs/2026-05-21-lesson-materials-design.md`
**Plan:** `docs/superpowers/plans/2026-05-21-lesson-materials.md`

Ships EP-04 end to end: UC-04-01 (an instructor attaches, renames, and removes supplementary files on a lesson) plus UC-04-02's owner-gated signed-download endpoint. Supported formats are PDF, DOCX, PPTX, XLSX, TXT, ZIP at ≤ 50 MB each. Uploads land via a single v4 signed PUT URL bound to the canonical content-type derived from the extension; a `complete` endpoint HEAD-verifies the object before flipping `PENDING_UPLOAD → READY`. Files reach a dedicated `learnwren-dev-materials` bucket in dev (real bucket in production) and the materials list mounts directly inside the lesson editor below the existing video section.

## What shipped

### Shared data models (`libs/shared-data-models`)

- `lib/material.ts` — `Material` interface, `MaterialState` (`'PENDING_UPLOAD' | 'READY'`), the `SUPPORTED_MATERIAL_EXTENSIONS` tuple, the `MATERIAL_CONTENT_TYPE_BY_EXTENSION` lookup, and `MATERIAL_MAX_SIZE_BYTES` (52,428,800). `MaterialId` brand added to `lib/common.ts` and re-exported from the index.

### NestJS (`libs/api-courses/src/lib/materials/`)

- `materials.config.ts` — `MaterialsConfig` + `readMaterialsConfigFromEnv`. Defaults to `fake` storage and the `learnwren-dev-materials` bucket outside production; requires `LEARNWREN_MATERIALS_BUCKET` and forbids `LEARNWREN_MATERIALS_STORAGE_FAKE=true` when `NODE_ENV=production`. TTL overrides for both upload and download URLs default to 900 s.
- `errors/material-error.codes.ts` + `errors/material.exception.ts` — `MaterialException` base class plus `UnsupportedMaterialType`, `MaterialNotFound`, `NotMaterialOwner`, `InvalidMaterialState` (carries `currentState` in `details`), `UploadObjectMissing`, `UploadObjectSizeMismatch`.
- `dto/create-material-upload.dto.ts` + `dto/rename-material.dto.ts` — class-validator DTOs (`filename`, `sizeBytes` capped at `MATERIAL_MAX_SIZE_BYTES`; `displayName` max 255).
- `materials.repository.ts` — Firestore CRUD against the top-level `materials` collection (`newId`, `get`, `listByLesson`, `create`, `update`, `delete`).
- `materials-storage.adapter.ts` — `MaterialsStoragePort` with `signUploadUrl` / `signDownloadUrl` / `headObject` / `deleteObject`. The `real` branch calls `file.getSignedUrl({version:'v4', ...})` and `file.getMetadata`; the `fake` branch returns `/api/internal/fake-materials/:matId` passthrough URLs. `signDownloadUrl` sets `responseDisposition: attachment; filename="..."` with header-safe sanitisation.
- `materials.service.ts` — orchestration: `createUploadUrl`, `complete` (state guard, HEAD verify, 5 % size tolerance, oversized-object cleanup), `listForLesson` (`READY`-only, `createdAt` ascending), `rename`, `remove` (best-effort object delete then doc delete), `buildDownloadUrl`, and `deleteForLesson` for the lesson-delete cascade.
- `material-owner.guard.ts` — loads `materials/:matId`, throws `MATERIAL_NOT_FOUND` / `NOT_MATERIAL_OWNER`, attaches the loaded material to `request`.
- `material-access.guard.ts` — owner branch at ship time. EP-05 Slice B later wired the enrolled-student branch (`EnrollmentRepository.isEnrolled`); the seam in this guard is what that wiring slotted into.
- `materials.exception-filter.ts` — `@Catch(MaterialException)` serialising the existing `{ error: { code, message, details? } }` envelope.
- `materials.controller.ts` — six routes (lesson-scoped create/list, material-id-scoped complete/rename/delete/download-url). Class-level `@UseFilters(MaterialsExceptionFilter)` + `@UseGuards(FirebaseSessionGuard)`; per-route guard stacks add `InstructorRoleGuard` + `CourseOwnerGuard` or `MaterialOwnerGuard` as appropriate, with `MaterialAccessGuard` on the download-url route.
- `webhook/fake-materials.controller.ts` — `PUT` / `GET /api/internal/fake-materials/:matId` passthrough that writes/streams through the Admin SDK to the emulator bucket. Conditionally registered.
- `materials.module.ts` — wires the submodule, gates `FakeMaterialsController` behind **both** `NODE_ENV !== 'production'` **and** `LEARNWREN_MATERIALS_STORAGE_FAKE=true`, and throws at bootstrap if the fake flag is set under production. Mutually `forwardRef`'d with `CoursesModule`.
- `courses.service.ts` — lesson-delete cascade now invokes `videoSvc.deleteForLesson(lid)` then `materialsSvc.deleteForLesson(lid)` before deleting the lesson doc.

### Angular (`libs/web-courses/src/lib/materials/`)

- `materials.service.ts` — thin `HttpClient` wrapper (one method per endpoint, `Observable` returns), matching the existing `CoursesService` convention.
- `material-upload.service.ts` — per-component injectable orchestrating the multi-file upload queue: client-side validate → `upload-url` → XHR PUT (for `onprogress`) → `complete`. Unsupported / oversized files are skipped with per-file inline messages; valid files continue. On PUT failure it best-effort `DELETE`s the `PENDING_UPLOAD` doc.
- `materials-list.component.{ts,html}` — renders the lesson's `READY` materials with inline-editable display names (`(blur)` / Enter / Escape semantics matching `LessonItemComponent`), Download, and Remove buttons. Reuses `ConfirmDialogComponent` for the remove gate. Empty-state copy and the picker hint follow §6.5 of the spec.
- `LessonItemComponent` (existing) — mounts `<lib-materials-list>` directly below the video block.

### Rules

- `firestore.rules` and `firestore.emulator.rules` both gain `match /materials/{materialId} { allow read, write: if false; }` — every read and write flows through the Admin SDK.

### Tests

- Unit (`libs/api-courses/src/lib/materials/**/*.spec.ts`): coverage for the config (env parsing, production-rejects-fake), error classes, DTOs, repository round-trip, storage adapter (real and fake branches, HEAD 404, delete 404 swallow), service (all six operations plus `deleteForLesson` zero/one/many), the two guards, the exception filter, and the controller routes.
- Unit (`libs/web-courses/src/lib/materials/`): `materials.service` HTTP wrapper via `HttpTestingController`, `material-upload.service` state machine (happy path, multi-file with one rejected, PUT failure → orphan cleanup), `materials-list.component` (render, inline rename commit/cancel, download click, remove via confirm dialog, 404 "no longer available").
- API e2e (`apps/api-e2e/src/materials.e2e-spec.ts`, 231 lines) — full happy path (`upload-url` → PUT to the fake passthrough → `complete` → list → rename → download-url → delete) plus 401 / `NOT_COURSE_OWNER` / `NOT_MATERIAL_OWNER` / `UNSUPPORTED_MATERIAL_TYPE` / oversize / `INVALID_MATERIAL_STATE` / `UPLOAD_OBJECT_MISSING` and the lesson-delete cascade.
- Web e2e (`apps/web-e2e/src/materials.spec.ts`, 100 lines) — instructor signs in, adds a fixture file, renames inline, downloads, removes via the confirm dialog; unsupported-type file rejected with the inline message.
- Mutation + CRAP reports refreshed via commit `4a000d9` (`chore(quality): refresh mutation + CRAP reports for EP-04`).

### Documentation

- `README.md` — EP-04 line in the status banner and the six-row endpoints table.
- `docs/USER_GUIDE.md` §2.9 (lesson materials) and §3.7 (API endpoints).
- `docs/development.md` — `LEARNWREN_MATERIALS_BUCKET` env var, fake-materials passthrough note.
- `.env.tpl` — new `LEARNWREN_MATERIALS_BUCKET` row under an EP-04 section.

## Plan deviations worth knowing about

- **Two follow-up commits hardened the upload/download UX after the main slice landed.** Commit `36e6359` (`fix(web-courses): clean up orphaned uploads and harden material download error handling`): on XHR PUT failure the upload service now best-effort `DELETE`s the `PENDING_UPLOAD` doc to keep orphan rate near zero (the plan accepted hard-tab-close orphans, but caught-and-handled failures are tractable); `download()` only removes the row on 404 (non-404s leave the row intact); and the download anchor sets `download=''` to hint the browser to save rather than navigate. Commits `84fe6b2` and `03f666c` fixed the api-e2e harness to set `LEARNWREN_MATERIALS_STORAGE_FAKE=true` and forward the instructor cookie on the fake-materials PUT/GET.
- **Fake-materials controller gating is stricter than the spec.** The plan/spec said "registered only outside production". The shipped `materials.module.ts` requires **both** `NODE_ENV !== 'production'` **and** `LEARNWREN_MATERIALS_STORAGE_FAKE=true`, and throws at bootstrap if the flag is set under production — fail-closed against a config typo, because the passthrough writes attacker-supplied bytes through the Admin SDK.
- **`MaterialAccessGuard` was already shaped for the enrolled-student widening.** Spec §9 item 2 called for a `TODO(EP-06)` seam; the wiring actually happened earlier than EP-06 — commit `71c4124` (EP-05 Slice B) injected `EnrollmentRepository` and added the `isEnrolled` branch. The guard at the time of the EP-04 ship was owner-only; current `material-access.guard.ts` already widens to ACTIVE-enrolled students. Reflected in the USER_GUIDE wording.

## Verification outcome

- All unit, controller, component, rules, and API e2e tests pass against the Firebase emulators with the materials storage in `fake` mode.
- Mutation report on `libs/api-courses` refreshed in `chore(quality): refresh mutation + CRAP reports for EP-04` (commit `4a000d9`); per Section 12 of the spec the threshold to clear was ≥ 85 % effective.
- The api-e2e materials suite required two follow-up fixes (`84fe6b2`, `03f666c`) before the fake-passthrough flow ran cleanly in CI; both landed inside the EP-04 ship window.
- Real-GCS round-trip (production-mode signed PUT against an actual `LEARNWREN_MATERIALS_BUCKET`) is a manual operation against a real Firebase project and was not exercised in CI — same posture as the video slices' real-mode steps.

## Follow-ups not in scope

Per spec §"Non-Goals":

- Student-facing lesson page and the enrolled-student download UI — EP-06. The download endpoint shipped owner-gated; the access-guard's enrolment branch was wired with EP-05 Slice B.
- Course catalogue — EP-05.
- Material reordering, versioning, and replace-in-place. Swap = remove + add.
- Per-lesson file-count cap (YAGNI).
- Virus / malware scanning of uploaded files — revisit under EP-09 if required.
- Resumable / chunked upload. The 50 MB limit makes a single PUT sufficient; resumable upload stays video-only.
- Background reconciliation of orphan `PENDING_UPLOAD` docs left by hard tab-close. (Caught upload failures are now cleaned up; tab-close orphans remain.) Deferred to the video stack's retention slice when it generalises.
- Soft-delete / retention of removed materials. Removal stays a hard delete of doc + best-effort object delete.

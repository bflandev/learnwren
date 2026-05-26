# Cover Image Upload — Design Spec

> [!NOTE]
> **DOCUMENT STATUS: DRAFT**

**Status:** Draft (2026-05-25)
**Scope:** Closes the long-standing UC-02-01 cover-image gap (drift report §EP-02 / UC-02-01 — "NOT IMPLEMENTED · High"). An instructor can upload, replace, or remove a course cover image from the course editor; the catalog list and detail surfaces render the real image when present and fall back to the existing `LwCoverComponent` placeholder when absent.

This spec sits on top of:

- The existing `CoursesController` / `CoursesService` / `CoursesRepository` triad and the `CourseOwnerGuard` (`libs/api-courses/src/lib/`).
- The per-feature exception-filter convention established by `VideoExceptionFilter`, `MaterialsExceptionFilter`, `LearnExceptionFilter` (one filter per feature submodule — never a shared global filter).
- The web service-as-HTTP-wrapper pattern: feature services are Promise-returning HTTP thin wrappers; the component owns the signal state.
- The existing placeholder rendering surface: `LwCoverComponent` + `coverToneForId(course.id)`, currently used by `CourseCardComponent` and `CourseDetailPageComponent`.

The spec is intentionally **divergent from UC-02-01** in one place: UC-02-01 names the cover as an optional create-time field. This design ships it as an **editor-only** surface (no create-form field). The use case will be reconciled in the same merge so the spec and the code stay in lockstep.

---

## 1. Goals & Non-Goals

### Goals

- An instructor can upload a JPEG or PNG cover image for any course they own, from the course editor.
- An instructor can replace or remove that cover at any time.
- Uploaded images are normalised to a single canonical JPEG and stored at a stable, publicly-readable path.
- The catalog list and course detail surfaces render the real image when present, fall back to the existing tone+glyph placeholder when absent.
- All validation that affects storage (MIME, size, dimensions) is enforced authoritatively on the server.

### Non-Goals

- A cover-image field on the create form (intentionally deferred; see §0 divergence note).
- Multiple resolutions / responsive variants (single canonical JPEG is enough for current surfaces).
- Server-side cropping, smart focal-point detection, or in-browser image editing.
- Asynchronous processing pipelines / Storage triggers (single round-trip through the API).
- Cover images for modules or lessons (out of scope; UC-02-01 only).

---

## 2. Data Model

### `Course` (shared-data-models)

One new optional field:

```ts
// libs/shared-data-models/src/lib/course.ts
export interface Course {
  // ...existing fields...
  coverImageUrl?: string;   // public URL to the canonical JPEG with ?v={updatedAt} cache-buster; absent ⇒ no cover
}
```

### `CourseSummary` (shared-data-models)

Mirrors the same optional field so the catalog list can render covers without a second fetch:

```ts
// libs/shared-data-models/src/lib/catalog.ts
export interface CourseSummary {
  // ...existing fields...
  coverImageUrl?: string;
}
```

The catalog projection in `libs/api-courses/src/lib/catalog/` reads it straight off the `Course` doc — no schema change, no new query.

### Storage layout

```
course-covers/{courseId}/cover.jpg          ← single canonical file, overwritten on replace
```

- Public-read bucket path (catalog is public per UC-05). Browsers consume it via plain `<img src>` — no signed URL plumbing.
- Stable filename. The cache-buster lives in the URL the API stores: `coverImageUrl = "{publicBaseUrl}/course-covers/{courseId}/cover.jpg?v={updatedAt}"`. A replacement bumps `updatedAt`, which changes the URL string, which busts both browser and CDN caches.
- On remove, the blob is deleted and `coverImageUrl` is unset on the `Course` doc.

### Storage rules

`storage.rules` is extended so `course-covers/**` is publicly readable and writable only via the service account (the API). Browsers never write here — that matches the multipart-through-API transport choice in §4.

---

## 3. API Surface

A new `CoverController` lives in the `libs/api-courses/src/lib/cover/` submodule (per the per-feature pattern: `video/`, `materials/`, `learn/`, `publish/`, `enrollment/` each carry their own controller + service + exception-filter). Two new endpoints, both gated by `CourseOwnerGuard`:

### `PUT /api/courses/:courseId/cover`

**Request**

- `Content-Type: multipart/form-data`
- Single file field: `"file"`
- Hard size cap: **10 MB** (multer `limits.fileSize`)
- Accepted MIMEs: `image/jpeg`, `image/png` (multer `fileFilter`)

**Processing pipeline** (new `CoverImageService` under `libs/api-courses/src/lib/cover/`):

1. Read into Buffer (multer memory storage).
2. `sharp(buffer).metadata()` → if `width < 1280 || height < 720` → throw `CoverDimensionsTooSmallError({ width, height })`.
3. If sharp throws during decode → wrap as `CoverDecodeFailedError`.
4. Resize inside a `1920 × 1080` bounding box preserving aspect (`fit: 'inside'`, no upscaling).
5. Re-encode `jpeg({ quality: 85, mozjpeg: true })`.
6. Upload to `course-covers/{courseId}/cover.jpg` via `FirebaseStorageHandle` with:
   - `contentType: 'image/jpeg'`
   - `cacheControl: 'public, max-age=31536000, immutable'`
   - custom metadata `{ courseId }`
7. Patch the `Course` document: set `coverImageUrl` to `{publicBaseUrl}/course-covers/{courseId}/cover.jpg?v={newUpdatedAt}`, bump `updatedAt`.

**Response**

```
200 OK
{ "coverImageUrl": "...", "updatedAt": "2026-05-25T…Z" }
```

### `DELETE /api/courses/:courseId/cover`

- Deletes the blob (idempotent — Storage 404 is swallowed; we never want a stuck-on-cleanup state).
- Patches the `Course` document: unsets `coverImageUrl`, bumps `updatedAt`.

**Response**

```
204 No Content
```

### Error mapping (new `CoverImageExceptionFilter`)

Per the established per-feature filter convention, this lives alongside the controller in `libs/api-courses/src/lib/cover/` — never folded into a shared global filter.

| HTTP | `error.code`                  | Trigger                                                                                  |
| ---- | ----------------------------- | ---------------------------------------------------------------------------------------- |
| 400  | `COVER_DIMENSIONS_TOO_SMALL`  | natural dimensions < 1280×720 (details: `{ width, height }`)                             |
| 400  | `COVER_DECODE_FAILED`         | sharp throws during `metadata()` or pipeline (corrupt file, lying MIME)                  |
| 413  | `COVER_TOO_LARGE`             | multer rejects body > 10 MB                                                              |
| 415  | `UNSUPPORTED_COVER_FORMAT`    | non-JPEG/PNG content-type                                                                |
| 403  | `FORBIDDEN`                   | `CourseOwnerGuard` (existing path; not handled by this filter, listed for completeness)  |
| 404  | `COURSE_NOT_FOUND`            | existing `CoursesExceptionFilter` (likewise listed for completeness)                     |

### New dependencies

- `sharp` — canonical Node image pipeline. Cloud Functions Node 20 has prebuilt native binaries; no special build step.
- `multer` — already transitive via `@nestjs/platform-express`; added as an explicit dep for type imports.

---

## 4. Web — Upload Surface (course editor)

### New feature submodule

```
libs/web-courses/src/lib/cover/
  course-cover.service.ts
  course-cover.service.spec.ts
  course-cover-uploader.component.ts
  course-cover-uploader.component.html
  course-cover-uploader.component.spec.ts
```

### `CourseCoverService`

Service-as-HTTP-wrapper, Promise-returning, no internal signal state (per the web-service pattern):

```ts
upload(courseId: CourseId, file: File):
  Promise<{ coverImageUrl: string; updatedAt: ISODateString }>

remove(courseId: CourseId):
  Promise<void>

validateLocally(file: File):
  | { ok: true }
  | { ok: false; reason: string }   // human copy matching the server's
```

- `upload` builds `FormData` with field name `"file"`, sends to `PUT /api/courses/:id/cover` via `HttpClient.put`.
- `validateLocally` checks MIME (`image/jpeg` | `image/png`) and size (≤ 10 MB) for fast feedback. The server remains authoritative — we deliberately do **not** check natural dimensions in the browser (a 400 round-trip on a too-small image is acceptable UX and avoids duplicating the rule).
- HTTP errors are mapped into typed errors with `code` fields matching the API's machine-readable codes, so the component can render distinct copy without string-matching.

### `CourseCoverUploaderComponent`

Owns the UI signal state (per pattern):

**Inputs**

```ts
readonly courseId = input.required<CourseId>();
readonly currentCoverUrl = input<string | undefined>(undefined);
```

**Output**

```ts
@Output() readonly coverChanged = new EventEmitter<{
  coverImageUrl: string | undefined;   // undefined ⇒ cleared
  updatedAt: ISODateString;
}>();
```

**State machine** (one `signal<UploaderState>`)

- `idle` — render current cover (or placeholder via `LwCoverComponent`); show "Replace cover" + "Remove cover" buttons. "Remove cover" is hidden when `currentCoverUrl()` is absent.
- `uploading` — `LwProgressComponent` in indeterminate mode (file is small; no chunking; XHR-level progress events are noise here).
- `failed` — render error copy + "Try again" button; keep the previous cover visible underneath so the surface never blanks out.

On success: emit `coverChanged({ coverImageUrl, updatedAt })`, return to `idle`.
On remove success: emit `coverChanged({ coverImageUrl: undefined, updatedAt })`, return to `idle`.

### Wiring into the editor

`course-editor-page.component.html` gains a "Cover image" `LwCardComponent` near the top of the page, hosting `<lib-course-cover-uploader>`. The editor's existing course signal is patched in-place on `(coverChanged)` — no full refetch needed because the API response carries authoritative `coverImageUrl` and `updatedAt`.

---

## 5. Web — Catalog Rendering

### `LwCoverComponent` extension

Add an optional image-render path so both callers (`course-card`, `course-detail-page`) keep going through the same component:

```ts
readonly imageUrl = input<string | undefined>(undefined);
readonly alt = input('');
```

Template (rough):

```html
@if (imageUrl()) {
  <img class="lw-cover-image" [src]="imageUrl()" [alt]="alt()" loading="lazy" />
} @else {
  <span class="lw-cover-glyph">{{ glyph() }}</span>
  @if (label()) { <span class="lw-cover-label">{{ label() }}</span> }
}
<ng-content></ng-content>
```

Existing `tone` / `glyph` / `label` / `height` inputs are untouched. `loading="lazy"` keeps the catalog grid cheap.

### `CourseCardComponent`

Passes `[imageUrl]="course().coverImageUrl"` and `[alt]="course().title"` to `<lw-cover>`. Placeholder behaviour preserved for courses without a cover.

### `CourseDetailPageComponent`

Passes `[imageUrl]="course()?.coverImageUrl"` and `[alt]="course()?.title ?? ''"`. Same fallback.

### Cache busting

Already handled by the API encoding `?v={updatedAt}` into `coverImageUrl`. A replacement at the same Storage path produces a new URL string, browsers refetch, the CDN sees a new query string. No client work required.

---

## 6. Validation Rules (consolidated)

| Rule                      | Where enforced                | Error surfaced                                         |
| ------------------------- | ----------------------------- | ------------------------------------------------------ |
| MIME ∈ {JPEG, PNG}        | client (fast) + server (auth) | `UNSUPPORTED_COVER_FORMAT` (415) on server bypass     |
| Size ≤ 10 MB              | client (fast) + server (auth) | `COVER_TOO_LARGE` (413) on server bypass              |
| Natural dims ≥ 1280×720   | server only                   | `COVER_DIMENSIONS_TOO_SMALL` (400) with `{w, h}`       |
| Decodable image bytes     | server only                   | `COVER_DECODE_FAILED` (400)                            |
| Caller owns the course    | server (`CourseOwnerGuard`)   | `FORBIDDEN` (403)                                      |
| Course exists             | server (existing filter)      | `COURSE_NOT_FOUND` (404)                               |

The "fast feedback" client checks exist to avoid wasted uploads on the obvious-wrong cases; they are **never** load-bearing for security or storage hygiene.

---

## 7. Testing Strategy

### Shared data models

- `course.spec.ts` — add `Course` cases with `coverImageUrl` set and unset.
- `catalog.spec.ts` — same for `CourseSummary`.

### API (`libs/api-courses/src/lib/cover/`)

Unit (Jest):

- `cover-image.service.spec.ts` — feed fixture buffers:
  - 1280×720 JPEG → happy path → returns a JPEG buffer ≤ 1920×1080 with `image/jpeg` content-type.
  - 640×480 PNG → `CoverDimensionsTooSmallError({ width: 640, height: 480 })`.
  - Corrupt buffer → `CoverDecodeFailedError`.
  - Asserts the `FirebaseStorageHandle` upload call shape (`contentType`, `cacheControl`, `metadata`).
- `cover.controller.spec.ts` — controller-level tests with a stubbed service:
  - 200 happy path returns `{ coverImageUrl, updatedAt }`.
  - Multer rejections surface as 413 / 415.
  - Owner-guard denial as 403 (verified via the existing guard, not re-implemented here).
- `cover-image.exception-filter.spec.ts` — per-feature filter mapping each domain error to its HTTP code + machine-readable `error.code`.

Integration (`apps/api-e2e`):

- One golden-path spec: authenticate as instructor → create a course → `PUT` a fixture JPEG → assert response carries a `coverImageUrl` matching `course-covers/{id}/cover.jpg?v=…` → `GET` the course back → assert `coverImageUrl` is set → `DELETE` the cover → assert it's unset.
- **Storage seam:** real Firebase Storage emulator locally. In CI we follow the existing fake-storage seam pattern used for video playback — inject a `FakeCoverStorage` in test config so this spec does not need GCP creds. **We will not land another `test.fixme`'d suite.**

### Web (`libs/web-courses/src/lib/cover/`)

Unit (Jest + Angular TestBed):

- `course-cover.service.spec.ts` — `HttpTestingController` asserts the multipart request shape (URL, method, FormData with field `file`); covers happy path and HTTP 400 / 413 / 415 error mapping into typed errors mirroring API codes.
- `course-cover-uploader.component.spec.ts` — drives each state (`idle` → `uploading` → `idle`-with-new-URL; failure → `failed` → retry; remove → idle-with-no-URL). Asserts the emitted `coverChanged` payloads.
- `lw-cover.component.spec.ts` — add cases for `imageUrl` set (img rendered with `loading="lazy"`, alt applied) vs unset (existing glyph path preserved).

E2E (`apps/web-e2e`):

- One Playwright spec: log in as instructor → open editor for a seeded course → upload a fixture JPEG via the file input → assert the rendered cover updates (img with new src) and persists across page reload.
- One catalog assertion piggy-backed onto an existing catalog spec: a published course with a cover renders the image; one without falls back to the glyph placeholder.

### Quality harness

The new `coverImage` files get included in the next CRAP-report regeneration after merge (per the existing pattern in commit `33f653b`). No new gate; the existing one picks it up.

---

## 8. Implementation Order (TDD)

For the implementation plan (not part of this spec but called out so the slicing is obvious):

1. Shared model: `Course.coverImageUrl`, `CourseSummary.coverImageUrl`, spec updates.
2. API: `CoverImageService` sharp pipeline (red/green on the dimension and decode rules) → Storage upload step → `CoverController` + `CoverImageExceptionFilter` → catalog projection wiring.
3. Web: `CourseCoverService` (HTTP wrapper + typed errors) → `CourseCoverUploaderComponent` (state machine) → editor wiring.
4. `LwCoverComponent` image input + `CourseCardComponent` + `CourseDetailPageComponent` wiring.
5. `apps/api-e2e` and `apps/web-e2e` specs.
6. Doc updates: `docs/use-cases/02-course-authoring.md` (UC-02-01) to mark cover as editor-only, `README.md` to flip the deferred bullet, `docs/USER_GUIDE.md` to document the new surface, `docs/quality/spec-drift-report.md` to close the drift entry.

Each layer's tests are committed alongside its production code in the established slice cadence.

---

## 9. Open Questions

None at spec time. The three architecture choices (editor-only, server-side resize, multipart-through-API) were locked in during brainstorming.

Deferred to the implementation plan:

- Exact `sharp` version and how its native binaries flow into the Cloud Functions build.
- The `{publicBaseUrl}` source — Firebase Storage public-download URL format vs a custom `STORAGE_PUBLIC_BASE_URL` env var passed through `firebase.tokens.ts`. Both work; the plan picks one and threads it through `CoverImageService`.

> [!NOTE] DOCUMENT STATUS: DRAFT

# UC-01-03 Slice B — Profile Picture

**Use case:** [UC-01-03 — Manage User Profile](../../use-cases/01-user-identity-and-access.md#uc-01-03--manage-user-profile)

**Date:** 2026-05-28

**Follows:** [UC-01-03 Slice A — Text Profile Editing](./2026-05-27-uc-01-03-slice-a-text-profile-design.md) (shipped 2026-05-28, commit `168994f`).

## 1. Scope

This slice ships the **profile picture** portion of UC-01-03: an authenticated user can upload, replace, or remove a JPEG/PNG avatar from `/settings/profile`. The avatar surfaces immediately in the header user-menu chip and on the public catalog (course cards + course detail). The detail surface also renders the `biography` field that Slice A stored but never displayed.

The cover-image upload (commit `07a86e4`, spec `2026-05-25-cover-image-upload-design.md`) is the direct precedent: sharp pipeline, multipart-through-API transport, per-feature exception filter, fake-storage seam for `api-e2e` in CI, cache-busting via `?v={updatedAt}` baked into the stored URL.

### In scope

- New `User.photoUrl?: string` field; absent ⇒ no picture.
- `PUT /api/profile/picture` (multipart) and `DELETE /api/profile/picture` endpoints under the existing `libs/api-profile/` lib.
- Server-side pipeline: JPEG/PNG, raw ≤ 2 MB, natural dimensions ≥ 256×256, centre-cropped to a square then resized to 512×512 JPEG (mozjpeg, q=85).
- `MeResponse` (and `AuthenticatedUser`) gains `photoUrl?: string`. Both endpoints return the refreshed `MeResponse` so the header chip updates in a single round-trip (same pattern Slice A introduced for `displayName`).
- `ProfileView` (`GET /api/profile` response) gains `photoUrl?: string`.
- New `LwAvatarComponent` with `photoUrl?`, `displayName`, `userId`, `size`, `alt` inputs. Falls back to `displayName` initials on a deterministic tone derived from `userId` (sibling of `coverToneForId`).
- Header user-menu chip in `apps/web/src/app/app.ts` swaps the text-only display-name chip for `<lw-avatar size="sm">` + name.
- Course card byline and course detail instructor block render `<lw-avatar>`.
- Course detail instructor block also renders the `biography` text Slice A stored.
- Catalog projection extension: `CourseSummary.instructorPhotoUrl?` and `CourseSummary.instructorId`; `CourseCatalogDetail.instructorPhotoUrl?`, `instructorId`, and `instructorBiography?` — populated by widening the existing deduped instructor join in `catalog.service.ts`.
- New `FakeProfilePictureStorageAdapter` seam so `apps/api-e2e` runs in CI without GCP credentials (mirrors `FakeCoverStorageAdapter`).

### Out of scope (deferred — each gets its own spec)

- **Slice C** — change email address with verification of the new address (UC-01-03 extension 3b).
- **Slice D** — change password with current-password check and complexity reuse from `PasswordPolicyService` (UC-01-03 extensions 3c / 3c-3a / 3c-4a).
- Truncated biography on catalog cards.
- Migration of the existing `CourseSummary.instructorDisplayName` flat sibling-field denormalisation into a nested `instructor: InstructorRef` shape. Slice B keeps the flat sibling pattern (adds `instructorPhotoUrl` and `instructorId` alongside) so the change is read-side-only.

## 2. Data model

### `User` (shared-data-models)

```ts
// libs/shared-data-models/src/lib/user.ts
export interface User {
  id: UserId;
  email: string;
  displayName: string;
  biography: string;
  photoUrl?: string;        // NEW — absent ⇒ no picture; present ⇒ canonical avatar URL with ?v={updatedAt}
  role: UserRole;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
```

**Backfill:** none. Existing user documents have no `photoUrl`; the field is optional and the avatar component falls back to initials.

### `MeResponse` / `AuthenticatedUser`

```ts
// libs/shared-data-models/src/lib/auth.ts
export interface MeResponse {
  uid: UserId;
  email: string;
  displayName: string;
  photoUrl?: string;        // NEW
  role: UserRole;
  emailVerified: boolean;
}
```

`AuthenticatedUser = MeResponse` (`libs/web-auth/src/lib/types/authenticated-user.ts`) so the web side picks this up for free.

### `ProfileView`

```ts
// libs/shared-data-models/src/lib/profile.ts
export interface ProfileView {
  uid: UserId;
  email: string;
  displayName: string;
  biography: string;
  photoUrl?: string;        // NEW
  role: UserRole;
  emailVerified: boolean;
}
```

### `CourseSummary` and `CourseCatalogDetail`

```ts
// libs/shared-data-models/src/lib/catalog.ts
export interface CourseSummary {
  id: CourseId;
  title: string;
  description: string;
  category?: CourseCategory;
  difficulty?: CourseDifficulty;
  instructorId: UserId;             // NEW — needed for avatar tone derivation
  instructorDisplayName: string;
  instructorPhotoUrl?: string;      // NEW
  publishedAt: ISODateString;
  coverImageUrl?: string;
}

export interface CourseCatalogDetail {
  id: CourseId;
  title: string;
  description: string;
  longDescription?: string;
  category?: CourseCategory;
  difficulty?: CourseDifficulty;
  instructorId: UserId;             // NEW
  instructorDisplayName: string;
  instructorPhotoUrl?: string;      // NEW
  instructorBiography?: string;     // NEW — empty-string is normalised to undefined at projection
  lessonCount: number;
  modules: CatalogModuleOutline[];
  publishedAt: ISODateString;
  coverImageUrl?: string;
}
```

Empty-string biography is normalised to `undefined` at projection time so the detail template can render with `@if (course.instructorBiography)` without checking length.

### Storage layout

```
profile-pictures/{uid}/avatar.jpg          ← single canonical file, overwritten on replace
```

- Public-read bucket path (avatars surface in the public catalog).
- Stable filename. Cache busting via `?v={updatedAt}` baked into `photoUrl` — a replacement bumps `User.updatedAt`, which changes the URL string, which busts both browser and CDN caches.
- On remove, the blob is deleted and `photoUrl` is unset on the `User` doc; `updatedAt` bumps.

### `storage.rules`

Extended so `profile-pictures/**` is publicly readable and writable only by the service account (the API). Browsers never write here — that matches the multipart-through-API transport choice in §3.

## 3. API

Two new endpoints in `libs/api-profile/` (the lib Slice A introduced), both gated by `FirebaseSessionGuard`. The endpoints operate on the caller's own user — no `:uid` route param.

### `PUT /api/profile/picture`

**Request**

- `Content-Type: multipart/form-data`
- Single file field: `"file"`
- Hard size cap: **2 MB** (multer `limits.fileSize`)
- Accepted MIMEs: `image/jpeg`, `image/png` (multer `fileFilter`)

**Processing pipeline** (`ProfilePictureService` under `libs/api-profile/src/lib/picture/`):

1. Read into Buffer (multer memory storage).
2. `sharp(buffer).metadata()` — if `Math.min(width, height) < 256` → throw `PictureDimensionsTooSmallError({ width, height })`. Decode failure → `PictureDecodeFailedError`.
3. Centre-crop to a square of side `min(width, height)` via `sharp.resize(min, min, { fit: 'cover', position: 'centre' })`.
4. If the resulting square is larger than 512×512, resize down (`{ fit: 'inside', withoutEnlargement: true }`).
5. Re-encode `jpeg({ quality: 85, mozjpeg: true })`.
6. Upload to `profile-pictures/{uid}/avatar.jpg` via `ProfilePictureStorageHandle` with:
   - `contentType: 'image/jpeg'`
   - `cacheControl: 'public, max-age=31536000, immutable'`
   - custom metadata `{ uid }`
7. Patch the `User` document: set `photoUrl = {publicBaseUrl}/profile-pictures/{uid}/avatar.jpg?v={newUpdatedAt}`, bump `updatedAt`.
8. Build a fresh `MeResponse` via the `getMe` helper already exposed by `api-auth` (Slice A made this reusable) and return it.

**Response**

```
200 OK → MeResponse
400  PROFILE_PICTURE_DIMENSIONS_TOO_SMALL   details: { width, height }
400  PROFILE_PICTURE_DECODE_FAILED
413  PROFILE_PICTURE_TOO_LARGE
415  UNSUPPORTED_PROFILE_PICTURE_FORMAT
401                                          (no session)
```

### `DELETE /api/profile/picture`

- Deletes the blob via the storage handle (idempotent — a Storage 404 is swallowed; we never want a stuck-on-cleanup state).
- Patches the `User` document: unsets `photoUrl`, bumps `updatedAt`.
- Returns the refreshed `MeResponse` (now without `photoUrl`).

**Response**

```
200 OK → MeResponse
401
```

> Returning `200 + MeResponse` (instead of `204` like the cover precedent) keeps the upload and remove flows symmetric and lets the client refresh the header chip in a single round-trip. Cover's `204` was fine because cover doesn't drive a header surface.

### Error mapping — `PictureExceptionFilter`

Per-feature exception filter under `libs/api-profile/src/lib/picture/`, registered on the controller via `@UseFilters(PictureExceptionFilter)`. Mirrors `ProfileExceptionFilter` (Slice A) and the broader `VideoExceptionFilter` / `CoverImageExceptionFilter` convention (see memory `feedback_api_courses_per_feature_filters.md`).

| HTTP | `error.code`                              | Trigger                                                      |
| ---- | ----------------------------------------- | ------------------------------------------------------------ |
| 400  | `PROFILE_PICTURE_DIMENSIONS_TOO_SMALL`    | `Math.min(width, height) < 256` (details: `{ width, height }`) |
| 400  | `PROFILE_PICTURE_DECODE_FAILED`           | sharp metadata/pipeline failure                              |
| 413  | `PROFILE_PICTURE_TOO_LARGE`               | multer rejects body > 2 MB                                   |
| 415  | `UNSUPPORTED_PROFILE_PICTURE_FORMAT`      | non-JPEG/PNG content-type                                    |

Unknown errors propagate to Nest's default filter (log + 500).

The wire-error constants live in `libs/shared-data-models/src/lib/profile.ts` alongside Slice A's `PROFILE_INVALID`, so the web side imports the same machine-readable codes.

### Catalog projection — instructor-join extension

The existing dedup join in `libs/api-courses/src/lib/catalog/catalog.service.ts` already calls `instructors.displayNamesFor([...])` and dedupes by `instructorId`. Slice B widens this helper:

- Rename `displayNamesFor(ids)` → `instructorRefsFor(ids)` returning `Map<UserId, { displayName: string; photoUrl?: string; biography?: string }>`.
- `toSummary` reads `displayName` + `photoUrl` from the map (plus the existing `course.instructorId`).
- `getCourseDetail` reads all three; `biography === ''` is normalised to `undefined` before returning.

The dedup contract is preserved: N courses by the same instructor on one catalog page still cause one `User` read. No schema or query change.

### New dependencies

- `sharp` — already added by the cover-image slice; reused here with no version bump.
- `multer` — already an explicit dep from the cover-image slice.

## 4. Web

### New submodule under `libs/web-profile`

```
libs/web-profile/src/lib/picture/
  profile-picture.service.ts
  profile-picture.service.spec.ts
  profile-picture-uploader.component.ts
  profile-picture-uploader.component.html
  profile-picture-uploader.component.spec.ts
```

### `ProfilePictureService` (HTTP wrapper)

Promise-returning, no internal signal state (per memory `feedback_web_service_pattern.md`):

```ts
@Injectable({ providedIn: 'root' })
export class ProfilePictureService {
  constructor(private http: HttpClient) {}

  upload(file: File): Promise<AuthenticatedUser>;        // PUT /api/profile/picture
  remove(): Promise<AuthenticatedUser>;                  // DELETE /api/profile/picture
  validateLocally(file: File):                           // fast feedback only
    | { ok: true }
    | { ok: false; reason: string };
}
```

- `upload` builds `FormData` with field name `"file"` and sends to `PUT /api/profile/picture` via `HttpClient.put`.
- `validateLocally` enforces MIME ∈ {`image/jpeg`, `image/png`} and size ≤ 2 MB. The server stays authoritative — we deliberately do **not** check natural dimensions in the browser (one 400 round-trip on a too-small image is acceptable UX and avoids duplicating the rule).
- HTTP errors are mapped into typed errors carrying the API's machine-readable `code`, so the component renders distinct copy without string-matching.

### `ProfilePictureUploaderComponent`

Owns the UI signal state. Mounted at the top of the existing `/settings/profile` page as an `LwCard`.

**State machine** (one `signal<UploaderState>`):

- `idle` — render current avatar (via `LwAvatarComponent`); show "Upload picture" / "Replace picture" + "Remove picture" buttons. "Remove" is hidden when `authService.currentUser()?.photoUrl` is absent.
- `uploading` — `LwProgressComponent` indeterminate; previous avatar stays visible underneath so the surface never blanks out.
- `failed` — error copy keyed off the typed-error code + "Try again" button; previous avatar stays visible.

On success of upload or remove: call `authService.setCurrentUser(snapshot)` with the returned `AuthenticatedUser` (helper already added in Slice A), then transition back to `idle`. No re-fetch of `ProfileView` — the snapshot carries the authoritative `photoUrl`.

### `LwAvatarComponent`

New shared design-system component. Lives alongside `LwCoverComponent`. (The exact lib placement is wherever `LwCoverComponent` lives today — the implementation plan verifies and, if necessary, factors a small `web-ui` lib so `web-catalog` and `web-profile` don't reverse-import through `web-courses`.)

```ts
@Component({ selector: 'lw-avatar', /* … */ })
export class LwAvatarComponent {
  readonly photoUrl = input<string | undefined>(undefined);
  readonly displayName = input.required<string>();
  readonly userId = input.required<UserId>();
  readonly size = input<'sm' | 'md' | 'lg'>('md');   // 32 / 48 / 96 px
  readonly alt = input<string>('');                   // template falls back to displayName
}
```

Template:

```html
@if (photoUrl()) {
  <img class="lw-avatar-image" [src]="photoUrl()" [alt]="alt() || displayName()" loading="lazy" />
} @else {
  <span class="lw-avatar-initials" [class]="toneClass()">{{ initials() }}</span>
}
```

- `initials()` — first letter of first word + first letter of last word of `displayName`, uppercased. Single-word names fall back to the first two letters of that word, uppercased.
- `toneClass()` — `avatarToneFor(userId())`, a sibling of `coverToneForId(courseId)` in the design-system tokens. Deterministic; same user always gets the same tone across surfaces.
- `loading="lazy"` keeps the catalog grid cheap.

### Header chip

In `apps/web/src/app/app.ts`, the current display-name-only chip in the user menu swaps to `<lw-avatar size="sm">` + display name. Driven by `authService.currentUser()`, so the uploader's `setCurrentUser` call refreshes the chip immediately.

### Course card byline

`CourseCardComponent` (`libs/web-catalog/src/lib/components/course-card/`) renders `<lw-avatar [photoUrl]="course().instructorPhotoUrl" [displayName]="course().instructorDisplayName" [userId]="course().instructorId" size="sm">` to the left of the existing byline text. Card layout is otherwise unchanged.

### Course detail instructor block

`CourseDetailPageComponent` gains an "Instructor" `LwCard` rendering `<lw-avatar size="md">` + display name + `instructorBiography` (when present). The biography paragraph hides when `instructorBiography === undefined`, which is the projection's normalised representation of "no bio".

### Routing / guards

No new routes. The uploader mounts inside the existing `/settings/profile` page (gated by `authGuard`).

## 5. Validation rules (consolidated)

| Rule                              | Where enforced                | Error surfaced                                          |
| --------------------------------- | ----------------------------- | ------------------------------------------------------- |
| MIME ∈ {JPEG, PNG}                | client (fast) + server (auth) | `UNSUPPORTED_PROFILE_PICTURE_FORMAT` (415)              |
| Size ≤ 2 MB                       | client (fast) + server (auth) | `PROFILE_PICTURE_TOO_LARGE` (413)                       |
| `min(width, height) ≥ 256`        | server only                   | `PROFILE_PICTURE_DIMENSIONS_TOO_SMALL` (400) `{w, h}`   |
| Decodable image bytes             | server only                   | `PROFILE_PICTURE_DECODE_FAILED` (400)                   |
| Authenticated session             | `FirebaseSessionGuard`        | 401                                                     |

Client-side validation is fast-feedback only; the server remains authoritative for storage hygiene and security.

## 6. Testing

### Shared models

- `user.spec.ts` — `User` with `photoUrl` set / unset.
- `profile.spec.ts` — `ProfileView` with `photoUrl` set / unset.
- `auth.spec.ts` (or its current home) — `MeResponse` with `photoUrl` set / unset.
- `catalog.spec.ts` — `CourseSummary` cases with `instructorPhotoUrl` set / unset and `instructorId` always present; `CourseCatalogDetail` cases with `instructorBiography` set / unset.

### API — `libs/api-profile/src/lib/picture/`

Unit (Jest):

- `profile-picture.service.spec.ts` — feed fixture buffers:
  - 256×256 JPEG → happy path → 512×512 JPEG buffer, `image/jpeg`.
  - 1024×768 JPEG → centre-cropped to 768×768 then resized to 512×512.
  - 200×800 PNG → `PictureDimensionsTooSmallError({ width: 200, height: 800 })`.
  - Corrupt buffer → `PictureDecodeFailedError`.
  - Asserts the storage-handle upload call shape (`contentType`, `cacheControl`, custom metadata `{ uid }`).
  - Asserts `User.photoUrl` written with `?v={updatedAt}` matching the new `updatedAt`.
  - Asserts remove: blob deleted, `photoUrl` unset on the doc, `updatedAt` bumped.
- `profile-picture.controller.spec.ts`:
  - 200 happy path returns `MeResponse` carrying the new `photoUrl`.
  - Multer rejections surface as 413 / 415.
  - DELETE returns `MeResponse` with `photoUrl` absent.
- `profile-picture.exception-filter.spec.ts`:
  - Maps each domain error to its HTTP code + `error.code`.
  - Unknown errors propagate (do not become 400).

Integration (`apps/api-e2e`):

- One golden-path spec: authenticate → `PUT` a 512×512 fixture JPEG → response is a `MeResponse` carrying `photoUrl` matching `profile-pictures/{uid}/avatar.jpg?v=…` → `GET /api/profile` shows `photoUrl` present → `DELETE /api/profile/picture` returns `MeResponse` with `photoUrl` absent → `GET /api/profile` confirms.
- **Storage seam:** real Firebase Storage emulator locally; `FakeProfilePictureStorageAdapter` in CI (mirrors the cover precedent). No `test.fixme`'d suite (per memory `project_api_e2e_video_quarantine.md`).

### API — `libs/api-courses/src/lib/catalog/`

- `catalog.service.spec.ts`:
  - `getCatalogPage` returns `CourseSummary.instructorPhotoUrl` resolved via the deduped join when the instructor has a `photoUrl`; `undefined` when they don't.
  - `getCatalogPage` returns `CourseSummary.instructorId` populated for every item.
  - `getCourseDetail` returns `instructorPhotoUrl` and `instructorBiography` when set; `instructorBiography === undefined` (not `''`) when the instructor's bio is empty string.
  - Dedupe assertion: N courses by the same instructor cause exactly one `User` read.
- The instructors-join helper spec (`instructors.service.spec.ts` or equivalent) — `instructorRefsFor` dedupes by `instructorId` and plumbs `photoUrl` + `biography` from the underlying user repository.

### Web — `libs/web-profile/src/lib/picture/`

Unit (Jest + Angular TestBed):

- `profile-picture.service.spec.ts` — `HttpTestingController` asserts the multipart request shape (URL, method, FormData with field `file`); covers happy path and HTTP 400 / 413 / 415 mapping into typed errors mirroring API codes; DELETE happy path.
- `profile-picture-uploader.component.spec.ts` — drives each state (`idle` → `uploading` → `idle`-with-new-avatar; failure → `failed` → retry; remove → `idle`-without-avatar). Asserts `authService.setCurrentUser` invoked with the returned snapshot on upload-success and remove-success. Asserts client-side MIME / size validators block submit before any HTTP call.

### Web — `LwAvatarComponent`

- `lw-avatar.component.spec.ts`:
  - `photoUrl` set → `<img>` rendered with `loading="lazy"`; `alt` falls back to `displayName` when input `alt=''`.
  - `photoUrl` unset → initials rendered, tone class derived from `userId` is deterministic across renders.
  - Single-word `displayName` → first-two-letters fallback.
  - Three sizes render the right Tailwind size classes.

### Web — header / card / detail

- Header chip spec (in `apps/web/src/app/app.ts`'s existing spec) — when `authService.currentUser()` carries `photoUrl`, the `<lw-avatar>` renders the image; otherwise initials. Updates reactively when `setCurrentUser` is invoked.
- `course-card.component.spec.ts` — `instructorPhotoUrl` set → avatar renders image; unset → initials with deterministic tone. `instructorId` flows into the avatar's `userId` input.
- `course-detail-page.component.spec.ts` — `instructorPhotoUrl` + `instructorBiography` both rendered when present; biography paragraph hidden when `undefined`; avatar falls back to initials when no picture.

### E2E — `apps/web-e2e`

One Playwright golden-path test:

1. Register a fresh user → reaches `/dashboard`. Header chip shows initials (no photo yet).
2. Open user menu → click "Profile settings" → lands on `/settings/profile`.
3. Upload a 512×512 fixture JPEG via the file input.
4. Header avatar now shows the image (no full reload).
5. Reload the page. Header avatar still shows the image (proves `photoUrl` is in `/api/auth/me`'s response on bootstrap).
6. Click "Remove picture". Header avatar reverts to initials.

A second small assertion piggy-backed onto an existing catalog e2e: a published course whose instructor has a `photoUrl` renders the avatar on the card; an instructor without one falls back to initials.

### Mutation testing

Add `libs/api-profile/src/lib/picture/` and `libs/web-profile/src/lib/picture/` to the round-3 mutation-testing backlog (memory `project_mutation_round_2.md`). Not gating on this slice. The 80% adjusted threshold applies once round 3 runs.

## 7. Surfaces touched

- `libs/shared-data-models/src/lib/user.ts` — add `photoUrl?: string`.
- `libs/shared-data-models/src/lib/auth.ts` — `MeResponse.photoUrl?`.
- `libs/shared-data-models/src/lib/profile.ts` — `ProfileView.photoUrl?`; new wire-error constants (`PROFILE_PICTURE_DIMENSIONS_TOO_SMALL`, `PROFILE_PICTURE_DECODE_FAILED`, `PROFILE_PICTURE_TOO_LARGE`, `UNSUPPORTED_PROFILE_PICTURE_FORMAT`).
- `libs/shared-data-models/src/lib/catalog.ts` — `CourseSummary.instructorId`, `CourseSummary.instructorPhotoUrl?`; `CourseCatalogDetail.instructorId`, `instructorPhotoUrl?`, `instructorBiography?`.
- `libs/api-auth/src/lib/...` — user repository writes/reads include `photoUrl`; `getMe` propagates `photoUrl` into the snapshot.
- `libs/api-profile/src/lib/picture/` — **new** submodule (`profile-picture.controller.ts`, `profile-picture.service.ts`, `profile-picture.exception-filter.ts`, `errors/profile-picture.errors.ts`, `storage/profile-picture-storage.handle.ts` + real + fake adapters).
- `libs/api-profile/src/lib/profile.module.ts` — register picture controller, service, and filter.
- `libs/api-courses/src/lib/catalog/catalog.service.ts` + the instructors-join helper — widen `displayNamesFor` to `instructorRefsFor`; update `toSummary` and `getCourseDetail` accordingly.
- `libs/web-profile/src/lib/picture/` — **new** submodule.
- `libs/web-profile/src/lib/profile-page/profile-page.component.html` — mount `<lib-profile-picture-uploader>`.
- Design-system lib (wherever `LwCoverComponent` lives, or a newly factored `web-ui`) — `LwAvatarComponent`, `avatarToneFor(userId)` token.
- `libs/web-catalog/src/lib/components/course-card/course-card.component.{ts,html}` — avatar slot, read `instructorId` + `instructorPhotoUrl`.
- `libs/web-catalog/src/lib/course-detail-page/course-detail-page.component.{ts,html}` — instructor card with avatar + biography.
- `apps/web/src/app/app.ts` — header chip swaps to `<lw-avatar>`.
- `firebase/storage.rules` — `profile-pictures/**` publicly readable, writable only by the service account.

## 8. Spec drift

After this slice ships, update:

- `docs/use-cases/01-user-identity-and-access.md` — UC-01-03 status banner: "Slices A + B (text profile + picture) IMPLEMENTED on YYYY-MM-DD; email/password slices deferred (Slices C/D)."
- `docs/quality/spec-drift-report.md` — flip UC-01-03 row to reflect the picture path is now wired up; carry the email-change (ext 3b) and password-change (ext 3c) rows forward.
- `README.md` — add the profile picture to the implemented-features list; mention the header avatar + catalog avatar surfaces.
- `docs/USER_GUIDE.md` — document the upload / replace / remove surfaces and the avatar fallback behaviour.

## 9. Open questions

None at spec time. The cover-image precedent locks in the architecture choices (multipart-through-API, sharp pipeline, per-feature exception filter, fake-storage seam, cache-busting URL). The five questions answered during brainstorming (surface placement, biography surfacing, dimension rules, fallback, plumbing) decide everything specific to this slice.

Deferred to the implementation plan:

- Exact placement of `LwAvatarComponent` — alongside `LwCoverComponent` in its current lib, or in a freshly factored `web-ui` lib if `LwCover` sits in `web-courses` and a reverse-import would result. The plan picks one and threads it through.
- Whether the instructors-join helper's rename to `instructorRefsFor` keeps `displayNamesFor` as a thin shim during the slice or removes it in one go. Either is fine; the plan picks one.

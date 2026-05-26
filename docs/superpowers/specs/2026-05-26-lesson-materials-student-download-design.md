> [!NOTE]
> **DOCUMENT STATUS: DRAFT** — superseded only when the corresponding plan and summary land.

# Lesson Materials — Student Download (UC-04-02)

**Date:** 2026-05-26
**Use case:** [`UC-04-02 — Download Lesson Materials`](../../use-cases/04-lesson-materials.md#uc-04-02--download-lesson-materials)
**Closes:** the last DRIFT item in MVP scope (EP-01..EP-06).

---

## 1. Goal

Enrolled students on a `PUBLISHED` course can see and download the lesson's READY supplementary materials directly from the lesson player page at `/learn/:cid/:lid`. Course owners get the same surface (one render path; they were already permitted by `MaterialAccessGuard`).

This is a one-slice closer for EP-04 / EP-06. After it lands, every MVP use case in EP-01..EP-06 has a wired-up implementation.

---

## 2. Current state (what's already shipped)

- `POST /api/courses/:cid/modules/:mid/lessons/:lid/materials/upload-url`, `POST /api/materials/:matId/complete`, `PATCH /api/materials/:matId`, `DELETE /api/materials/:matId`, `GET /api/courses/:cid/modules/:mid/lessons/:lid/materials` — instructor-only via `InstructorRoleGuard + CourseOwnerGuard`.
- `GET /api/materials/:matId/download-url` — already guarded by `MaterialAccessGuard`, which permits course owner OR active enrollee on a `PUBLISHED` course. **The download endpoint already does the right thing for students; we don't touch it.**
- `GET /api/learn/courses/:cid/lessons/:lid` — returns `LessonView` with `{ course, lesson, progress?, outline }`. Students reach it on the lesson player page.
- `LessonPlayerPageComponent` (libs/web-learn) renders the video player, mark-complete control, and course outline. **No materials surface today.**

## 3. The gaps

1. `LessonView` has no `materials` field — students can't discover which materials a lesson has without an extra request.
2. The owner-side `GET …/lessons/:lid/materials` is gated by `InstructorRoleGuard + CourseOwnerGuard`; opening it to students would require a new guard and split the test matrix.
3. The lesson player page has no materials section in the template.

## 4. Approach

**Project `materials` into the existing `LessonView` response.** No new endpoint, no new guard, no new lib. The download click still uses the existing `GET /materials/:matId/download-url`, which is already correctly gated for both audiences.

### Why this approach

- Matches the precedent set by EP-06 Slices A–D: every learn-page concern (progress, outline, mark-complete state, position) rides on the same single `GET /api/learn/...` fetch. Same north star applies here.
- Smallest blast radius. One projection field, one click handler. No risk of regressing the instructor editor.
- Existing `MaterialAccessGuard` already enforces "owner OR enrolled-on-PUBLISHED" — symmetric with the LessonView access gate. No new authorization decision.
- Read cost: one extra Firestore query per learn-page load (`materials where lessonId == :lid`), same shape as the owner list endpoint.

### Trade-offs

- The response gets a touch fatter even when the user never expands the materials section. With a realistic ceiling of ~10 materials per lesson (`MATERIAL_MAX_SIZE_BYTES = 50 MB`, instructors won't attach many), this is negligible.
- Adding/removing materials in the instructor editor doesn't surface to students live — they pick it up on the next lesson load. Acceptable for MVP; no real-time guarantee in the use case.

### Alternatives considered (and rejected)

- **B: New student-side list endpoint** (`GET /api/learn/courses/:cid/lessons/:lid/materials`). Two round-trips, more code, no functional gain.
- **C: Open the existing owner list endpoint to enrolled students** by replacing its guards. Regression risk on the instructor editor; one endpoint then means two things depending on caller.

---

## 5. API changes

### 5.1 `LessonView` extension (libs/shared-data-models)

`libs/shared-data-models/src/lib/lesson-view.ts`:

```ts
export interface LessonMaterialSummary {
  id: MaterialId;
  displayName: string;
  extension: SupportedMaterialExtension;
  sizeBytes: number;
}

export interface LessonView {
  course: { id: CourseId; title: string; status: CourseStatus };
  lesson: { /* unchanged */ };
  progress?: { /* unchanged */ };
  outline: CourseOutline;
  materials: LessonMaterialSummary[]; // NEW — required field
}
```

- **Required, not optional.** Slice D set the precedent for `outline`. Optionality was a Slice B CI-unblock fix that we don't need here; clients and server ship together.
- `LessonMaterialSummary` deliberately drops owner-only fields (`originalFilename`, `contentType`, `storage`, `ownerInstructorId`, `state`, `createdAt`, `updatedAt`, `lessonId`, `courseId`). Students never need them; the download URL's Content-Disposition carries the filename.
- `[]` when the lesson has no READY materials.

### 5.2 Projection in `learn.service.ts`

`libs/api-courses/src/lib/learn/learn.service.ts` — after the existing access checks and outline projection:

1. `await this.materialsService.listForLesson(lid)` — existing method on `MaterialsService` that already filters to `state === 'READY'` and sorts by `createdAt` ascending.
2. Map each returned `Material` to `{ id, displayName, extension, sizeBytes }` (drop owner-only fields).
3. Attach to the returned `LessonView` as `materials`.

Wiring: `LearnService` is registered in `CoursesModule`, which already has a `forwardRef(() => MaterialsModule)` relationship. `MaterialsService` is exported from `MaterialsModule` — `LearnService` just injects it via constructor. No new module wiring needed.

### 5.3 Download endpoint — no change

`GET /api/materials/:matId/download-url` is unchanged. Already enforces:

- Owner of the course → allowed (any course status).
- Active enrollee on a `PUBLISHED` course → allowed.
- Anyone else (withdrawn, unenrolled, course unpublished after enrolment, missing material) → `403 NOT_MATERIAL_OWNER` or `404 MATERIAL_NOT_FOUND`.

Returns `{ url: string; expiresAt: ISODateString }` with a 15-minute signed URL.

---

## 6. UI changes (web-learn)

### 6.1 `LearnService.requestDownloadUrl(matId)`

`libs/web-learn/src/lib/learn.service.ts` — new method, Promise-returning HTTP wrapper (matches the established web-service pattern):

```ts
async requestDownloadUrl(matId: MaterialId): Promise<{ url: string; expiresAt: ISODateString }> {
  // GET /api/materials/:matId/download-url
  // typed error envelopes: NOT_MATERIAL_OWNER (403), MATERIAL_NOT_FOUND (404)
}
```

Component owns the signal state for per-row pending/error UI.

### 6.2 `LessonPlayerPageComponent` materials section

Template addition in `lesson-player-page.component.html`, below the video player and above the lesson title block:

- `view.materials.length === 0` → section is not rendered at all. No empty-state copy.
- `view.materials.length >= 1` → `<section data-testid="lesson-materials">` with heading "Lesson materials" and an unordered list.

Per-row layout:

- Left column: extension badge (`PDF`, `DOCX`, `PPTX`, `XLSX`, `TXT`, `ZIP`) + `displayName` (truncated with ellipsis, full name in `title` attribute) + formatted `sizeBytes` (e.g., `2.3 MB`).
- Right column: `<button data-testid="material-download-{matId}">Download</button>`.

Click handler:

1. Button disables and label swaps to "Preparing…".
2. Call `LearnService.requestDownloadUrl(matId)`.
3. On 200: `window.open(result.url, '_blank', 'noopener')` — let the browser handle the save via the signed URL's Content-Disposition.
4. Restore the button (next tick or short delay; match the cover-image UX).
5. On error: render a per-row inline banner at `data-testid="material-error-{matId}"` with a Retry control. Copy:
   - `404 MATERIAL_NOT_FOUND` → "This file is no longer available."
   - `403 NOT_MATERIAL_OWNER` → "You no longer have access to this material."
   - default → "Couldn't prepare the download. Try again."
6. Errors are per-row — sibling rows stay enabled.

### 6.3 Owner parity

Owners get the same UI without special-casing. The owner editor's existing materials panel under the course editor is untouched. Owners visiting `/learn/:cid/:lid` already see their own lesson (preview); they'll now see the same student-facing materials list.

---

## 7. Testing

### 7.1 Unit — `api-courses`

`learn.service.spec.ts` (new cases):

- Owner caller on PUBLISHED course → projects all READY materials, ordered by createdAt ascending.
- Owner caller on DRAFT or ARCHIVED course → same projection (owners always see their own).
- Active enrollee on PUBLISHED → same projection as owner.
- Lesson with no materials → `materials: []`.
- Lesson with mixed `PENDING_UPLOAD` and `READY` → only READY projected.
- Withdrawn enrollee on PUBLISHED → guard throws 403 before projection; assert `MaterialsService.listForLesson` was not called.

`learn.controller.spec.ts` — fixture updates only; `LessonView` test doubles get a `materials: []` (or populated) field.

### 7.2 Unit — `web-learn`

`lesson-player-page.component.spec.ts` (new cases):

- `view.materials.length > 0` → renders the section + one row per material with the right testids.
- `view.materials.length === 0` → no section in the DOM (assert by `data-testid="lesson-materials"` absent).
- Click on `material-download-{matId}` calls `LearnService.requestDownloadUrl(matId)` and opens a new tab.
- Per-row error states (`NOT_MATERIAL_OWNER`, `MATERIAL_NOT_FOUND`, generic) each surface the right copy in `material-error-{matId}`; sibling rows stay enabled.

`learn.service.spec.ts` — `requestDownloadUrl` happy path + typed error envelope cases.

### 7.3 E2E — `api-e2e`

New file `materials-student-download.e2e-spec.ts` (or appended to `materials.e2e-spec.ts` if it stays under the file's natural ceiling):

- Enrolled student → `GET /api/learn/courses/:cid/lessons/:lid` response includes the lesson's READY materials.
- Enrolled student → `GET /api/materials/:matId/download-url` returns 200 + signed URL.
- Withdrawn enrollee → 403 on the learn endpoint (already covered; assert the projection is not reached); 403 on the download endpoint too.
- Owner on an unpublished course → can still download.
- Lesson with one PENDING_UPLOAD and one READY material → only the READY one shows in the projection.

### 7.4 E2E — `web-e2e`

Extend the existing learn-page spec (or a small new spec):

- Enrolled student opens `/learn/:cid/:lid` for a lesson with an attached PDF → sees "Lesson materials" + a Download button.
- Click Download → `page.waitForEvent('popup')` resolves with a tab on the signed URL (status 200).
- Lesson with no attached materials → section is absent.

### 7.5 Local run posture

`pnpm e2e` will not be run during landing — same posture as EP-06 Slices A–D (no emulators in this CI). Specs compile and Playwright picks them up. `pnpm emulators` + `pnpm nx run-many -t e2e` is the manual gate before any production push.

---

## 8. Out of scope (deferred)

- **Bulk "Download all"** — needs a zip-on-the-fly endpoint; no demand signal.
- **Inline preview** (PDF embed, image lightbox) — UC-04-02 only specifies download.
- **Per-material download analytics** — nothing in the use case asks for it.
- **Catalog-side materials surfacing** on `/catalog/:cid` for logged-out preview — post-MVP discovery.
- **Auto-retry on expired signed URL** (UC-04-02 Ext 4a). The 15-minute window swallows realistic click delays. If a click does land after expiry, the row surfaces the generic error and a Retry button. **This is an explicit scope cut.**
- **Auto-remove row on `MATERIAL_NOT_FOUND`** (UC-04-02 Ext 4b). The row shows "This file is no longer available." and the user reloads to refresh the list. Acceptable for MVP.
- **Real-time updates** when an instructor adds/removes materials while a student is on the lesson page. Picked up on next lesson load.
- **Owner-only fields on the wire** (`originalFilename`, `contentType`, `storage`, `state`, `createdAt`, `updatedAt`). Deliberately omitted from `LessonMaterialSummary`.
- **Module / course completion rollups**, **My Courses dashboard** — still post-MVP; unrelated to this slice.

## 9. Estimated impact

- **Touched files:** `libs/shared-data-models/src/lib/lesson-view.{ts,spec.ts}`; `libs/api-courses/src/lib/learn/learn.{service,controller,module}.{ts,spec.ts}`; `libs/web-learn/src/lib/learn.service.{ts,spec.ts}`; `libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.{ts,html,spec.ts}`; `apps/api-e2e/**`; `apps/web-e2e/**`; `docs/use-cases/04-lesson-materials.md`; `README.md`.
- **Estimated size:** ~600–800 LOC including tests. Comparable to EP-06 Slice B.
- **Closes MVP:** with this slice, EP-04 reconciles its DRIFT note and every MVP use case (EP-01..EP-06) is wired up end-to-end.

## 10. Acceptance criteria

- `GET /api/learn/courses/:cid/lessons/:lid` returns `materials: LessonMaterialSummary[]` for owner and active enrollee on a PUBLISHED course; `[]` when none; only `state === 'READY'` projected.
- An enrolled student on `/learn/:cid/:lid` sees the materials section when the lesson has READY materials, and can download each one through a new tab. No section when there are none.
- A withdrawn enrollee gets `403 NOT_ENROLLED_LESSON` from the learn endpoint and `403 NOT_MATERIAL_OWNER` from the download endpoint.
- A course owner can download from `/learn/:cid/:lid` regardless of course status.
- `docs/use-cases/04-lesson-materials.md` DRIFT note for UC-04-02 is reconciled in this PR.

## 11. Notes / risks

- **`window.open` in tests**: assert via a Vitest spy in the component spec and via Playwright's `page.waitForEvent('popup')` in web-e2e — both already in use elsewhere in the repo.
- **No new mutation-testing target** for this slice. A future round-3 sweep will pick the new code up against the existing `learn.service.ts` and `lesson-player-page.component.ts` targets in `tools/mutation/state.json`.
- **Touched in this PR but not specced**: `learn.controller.spec.ts` fixtures get a `materials: []` (or populated) field on every `LessonView` test double. Mechanical update, no behavioural change.

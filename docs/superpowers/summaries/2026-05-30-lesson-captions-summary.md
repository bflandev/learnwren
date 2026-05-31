# Lesson Captions (WebVTT) — Implementation Summary

**Date:** 2026-05-30
**Spec:** `docs/superpowers/specs/2026-05-30-lesson-captions-design.md`
**Plan:** `docs/superpowers/plans/2026-05-30-lesson-captions.md`

Ships WebVTT caption support for lesson videos. Instructors upload a `.vtt` file (≤ 256 KB) per lesson video via a Captions panel in the lesson editor. The caption track is streamed to enrolled students (and the course owner) as a sidecar `<track kind="subtitles">` element; captions are off by default and toggled via the player's native CC button. Caption metadata is projected into `LessonView` alongside the video so the learn page renders the track without a separate network call.

## What shipped

### Shared (`libs/shared-data-models`)

- `VideoCaptionsMetadata` wire type — `{ language, label, updatedAt }` — the caption metadata shape returned by the owner management endpoints.
- `LessonCaptionsInfo` — `{ language, label } | null` — the lighter projection carried inside `LessonView.lesson.captions` for the student player page.
- Caption error-code string-literal union (`CAPTIONS_NOT_FOUND | CAPTIONS_INVALID | CAPTIONS_TOO_LARGE | CAPTIONS_WRONG_FORMAT`).

### NestJS (`libs/api-courses`)

**Caption management (owner-gated):**
- `PUT /api/videos/:vid/captions` — multipart `file` upload; validates content type (`text/vtt`) and size (≤ 256 KB); writes the `videoCaptions/{videoId}` Firestore document and the raw VTT text; returns `{ language, label, updatedAt }`. Guarded by `FirebaseSessionGuard` + `InstructorRoleGuard` + `VideoOwnerGuard`.
- `DELETE /api/videos/:vid/captions` — removes the `videoCaptions/{videoId}` document; returns `204`. Same guards.
- `GET /api/videos/:vid/captions` — reads the `videoCaptions/{videoId}` document and returns `{ language, label, updatedAt }` or `null`. Same guards.

**Caption playback (enrollment-gated):**
- `GET /api/playback/captions/:vid` — streams the stored VTT content as `text/vtt`; guarded by `FirebaseSessionGuard` + `EnrollmentOrOwnerGuard` (owner or ACTIVE enrollee on a PUBLISHED course); video must be in `READY` state; returns `404 CAPTIONS_NOT_FOUND` when no track exists.

**`LearnService` projection:**
- `GET /api/learn/courses/:cid/lessons/:lid` already fans out to several sub-reads; caption metadata is now fetched in parallel and landed in `LessonView.lesson.captions` as `{ language, label } | null`. No new endpoint is needed for the student player.

**Domain exceptions:** caption errors are `VideoException` subclasses (reusing the existing `VideosExceptionFilter` per-feature filter). No new filter was introduced.

### Angular (`libs/web-video`)

- `CaptionsPanelComponent` — instructor-facing OnPush component in the lesson editor. Renders three states: no track (Upload prompt), track present (filename/language display + Replace and Remove buttons), and uploading (spinner). Accepts a `VideoId` input and calls the three caption management endpoints via `CaptionsService`.
- `CaptionsService` — Promise-returning HTTP wrapper for `PUT`, `DELETE`, and `GET /api/videos/:vid/captions`.
- The panel is embedded in the video lesson editor below the owner player; it renders only when the video is in the `READY` state.

### Angular (`libs/web-learn`, `libs/web-courses`)

- `LearnService` — updated to consume `LessonView.lesson.captions`.
- `LessonPlayerPageComponent` — renders a `<track kind="subtitles" default="" src="/api/playback/captions/:vid">` element inside the `<video>` tag when `lesson.captions` is non-null. The `default=""` attribute is absent so captions begin off; the browser's native CC button toggles them.

## Divergences from spec

- **No new exception filter.** The spec implied a dedicated `CaptionsExceptionFilter`. In the implementation, caption exceptions extend `VideoException` and are caught by the existing `VideosExceptionFilter`, keeping the per-feature filter inventory minimal.
- **`Video` entity unchanged.** The spec considered embedding caption metadata on the `Video` document. The implementation stores captions in a separate `videoCaptions` collection (doc id = videoId), leaving the `Video` entity untouched. Owner caption state is read via `GET /api/videos/:vid/captions` rather than from the video record.
- **LearnService projection landed alongside the controller.** The spec listed the `LessonView` projection as a separate concern. In practice it was implemented together with the playback endpoint in the same commit, since both require reading the same Firestore document.

## How it was verified

- **Unit tests:** `libs/shared-data-models` (wire types), `libs/api-courses` (caption service, controller, exception filter, `EnrollmentOrOwnerGuard` interaction), `libs/web-video` (CaptionsPanelComponent, CaptionsService), `libs/web-learn` (LessonPlayerPageComponent track rendering), `libs/web-courses` (lesson editor integration). All affected libs green.
- **api-e2e (`apps/api-e2e/src/captions.spec.ts`):** 5 end-to-end scenarios:
  1. Upload a caption track as the video owner → `200` with metadata.
  2. `GET /api/videos/:vid/captions` returns the stored metadata.
  3. `GET /api/playback/captions/:vid` streams the VTT content (enrolled student).
  4. `DELETE /api/videos/:vid/captions` → `204`; subsequent GET returns `null`.
  5. `GET /api/playback/captions/:vid` after delete → `404 CAPTIONS_NOT_FOUND`.
  All 5 scenarios green against the emulator.
- **Lint / typecheck / build:** green.

## Deferred / scope cuts

- **Multiple languages and a language picker** — one English track per video only; multi-language support and a UI picker are deferred.
- **SRT upload** — WebVTT only. SRT-to-VTT conversion is deferred.
- **HLS-embedded subtitle tracks** — the VTT is served as a sidecar file, not embedded in the HLS manifest as a `#EXT-X-MEDIA` track. HLS-embedded tracks (which would work without the `<track>` element on iOS) are deferred.
- **Custom caption styling / caption menu** — no styling controls or custom menu. The browser's native CC UI is the only surface.
- **Auto-generated captions** — no speech-to-text integration. Instructors must supply their own VTT file.

## Spec and epic mapping

Implements the caption feature described in `docs/superpowers/specs/2026-05-30-lesson-captions-design.md`. Advances **EP-09 US-09-03** (accessibility) by providing a machine-readable caption track for all lesson videos whose instructors supply one. Sits within the EP-03 (Video Management and DRM) feature surface.

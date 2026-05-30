> [!NOTE]
> **DOCUMENT STATUS: DRAFT**
> This document is a living specification and is subject to change. All content is considered provisional until formally approved by project stakeholders.

# Lesson Captions (WebVTT) — Design

## Goal

Let an instructor attach a **WebVTT** closed-captions track to a lesson's video, and let the student (and the owner) toggle those captions on in the player via the browser's native CC control. This advances **EP-09 US-09-03** (accessibility): *"The video player must support closed captions (WebVTT format)."*

This is the first captions slice. It is deliberately scoped to **one caption track per video** (treated as English) delivered as a **sidecar `<track>`** — no transcoder or HLS-manifest changes.

## Scope

- **In:** instructor upload / replace / remove of a single `.vtt` track per video; server-side WebVTT validation; access-gated delivery; conditional `<track>` rendering in the player (native CC button); owner preview in the editor; cleanup on video delete.
- **Out (deferred):** multiple languages + language picker; SRT upload/conversion; HLS-embedded subtitle tracks (transcoder / manifest injection); custom caption styling or a custom captions menu; auto-generated / speech-to-text captions.

## Chosen approach

**Sidecar `<track>` with the VTT stored in Firestore** (Approach A of three considered; B = VTT in Cloud Storage, C = HLS-embedded via the transcoder). A was chosen because it satisfies the requirement end-to-end with the smallest, best-isolated change: no transcoder changes, no manifest-rewriting, and **no new storage-adapter or fake-adapter work** (Firestore runs in the emulator, so dev and `api-e2e` work unchanged). The VTT is a few KB of text; a 256 KB cap keeps it well under Firestore's 1 MB document limit. B and C remain available as later upgrades — the data model and endpoints barely change if storage migrates.

Browser text tracks are handled by the browser, not by Media Source Extensions, so a `<track>` element works under both hls.js (MSE) and native HLS (Safari/iOS) without touching the DRM playback path.

## Data model (`shared-data-models`)

New entity, mirroring the existing `VideoKey` collection. **Document id = `videoId`** (strict 1:1; one caption track per video):

```ts
export type VideoCaptionsId = VideoId; // 1:1 with the video; no separate brand

export interface VideoCaptions {
  videoId: VideoId;
  language: string;       // BCP-47; fixed 'en' in this slice
  label: string;          // display label, 'English' in this slice
  format: 'vtt';
  content: string;        // raw WebVTT text (≤ 256 KB)
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
```

Projections:

- `LessonView.lesson` gains `captions: { language: string; label: string } | null` — tells the learn page whether and how to render the `<track>`.
- A new owner read `GET /api/videos/:vid/captions` returns the captions metadata `{ language: string; label: string; updatedAt: ISODateString } | null` — tells the editor the current state. The `Video` entity itself is left unchanged.

Both projections are derived from a single direct `get` of the captions doc by `videoId` (no query, because id = videoId).

## API (`api-courses`, video submodule)

New `CaptionsController` + `CaptionsService` in the video submodule.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `PUT` | `/api/videos/:vid/captions` | video **owner** | Upload or replace. `multipart/form-data` with a `file` field (matching the cover/picture upload pattern). Validates, then upserts the captions doc. Returns `{ language, label, updatedAt }`. |
| `DELETE` | `/api/videos/:vid/captions` | video **owner** | Remove the captions doc. `204`. Idempotent (no-op if absent). |
| `GET` | `/api/videos/:vid/captions` | video **owner** | Return captions metadata `{ language, label, updatedAt } \| null` (JSON — the editor's state read, not the VTT). |
| `GET` | `/api/playback/captions/:vid` | owner **or** active enrollee on a PUBLISHED course | Streams `text/vtt; charset=utf-8`. `404` if no captions. `Cache-Control: private`. |

- **Owner write** (`PUT`/`DELETE`) reuses the `@CurrentVideo` / ownership path that `video.controller` already uses.
- **Delivery** (`GET`) reuses the learn-style access check ("403 unless owner or active enrollee on a PUBLISHED course") that playback/learn already enforce, so caption text is gated exactly like the video it belongs to. The track resource is same-origin, so the session cookie is sent automatically.

### Errors

Captions errors are **subclasses of the existing `VideoException`** with new codes added to `VideoErrorCode`. The existing `VideoExceptionFilter` already `@Catch`es `VideoException` and renders it via `handleException()` from `@learnwren/api-http-errors`, so no new exception class or filter branch is required.

| Code | Status | When |
|---|---|---|
| `INVALID_CAPTION_FILE` | 400 | Body is not valid WebVTT (missing `WEBVTT` signature, or no cue). |
| `CAPTION_TOO_LARGE` | 400 | Body exceeds 256 KB. |

`404` (no captions on `GET`) and the owner/access `403`/`401` reuse existing video/access exceptions.

## Validation (server-side, in `CaptionsService`)

1. **Size** ≤ 256 KB → else `CAPTION_TOO_LARGE`.
2. **Type:** accept `.vtt` / `text/vtt` / `text/plain`.
3. **WebVTT shape** (hand-rolled, no new dependency): must begin with the `WEBVTT` signature (tolerating a leading UTF-8 BOM and the spec-permitted space/tab/newline after the magic) **and** contain at least one cue timing line (`HH:MM:SS.mmm --> HH:MM:SS.mmm`, hours optional) → else `INVALID_CAPTION_FILE`.

The stored `content` is the validated, UTF-8 text as received (no rewriting).

## Player wiring

- `VideoPlayerComponent` (`web-video`) gains an optional input `captions: { src: string; srclang: string; label: string } | null`. The template conditionally renders:
  ```html
  @if (captions(); as c) {
    <track kind="subtitles" [src]="c.src" [srclang]="c.srclang" [label]="c.label" />
  }
  ```
  No `default` attribute → captions are **off by default**; the browser shows its native CC button because a text track is present. Same-origin fetch carries the session cookie. Works under hls.js (MSE) and native HLS.
- `LessonPlayerPageComponent` (`web-learn`) maps `view().lesson.captions` to `{ src: '/api/playback/captions/' + videoId, srclang: language, label }`, or `null`.
- The owner playback in `web-courses` (same `VideoPlayerComponent`) passes captions derived from the owner video read, so the instructor previews the captions they uploaded.

## Editor surface (`web-courses`)

A small **Captions** section next to the video widget in the lesson editor, backed by a new Promise-returning `CaptionsService` (the component owns the signal state, per the house web-service pattern):

- **No captions:** an "Add captions (.vtt)" file-picker button → `PUT`.
- **Present:** "Captions: English · updated &lt;date&gt;" with **Replace** (re-`PUT`) and **Remove** (`DELETE`).
- **No video yet:** the section is hidden/disabled with the hint "Upload a video first" (captions require an existing video).

Validation errors (`INVALID_CAPTION_FILE`, `CAPTION_TOO_LARGE`) surface as inline messages in the section.

## Cleanup

`DELETE /api/videos/:vid` (existing video deletion) also deletes the captions doc for that video. Because the captions doc is keyed by `videoId`, a freshly (re-)uploaded video starts with no captions automatically.

## Testing

- **`api-courses` unit (`CaptionsService`):** valid VTT stored; bad-signature, no-cue, and oversize rejected with the right codes; replace upserts; delete removes and is idempotent; delivery returns the stored content and `404`s when absent; access — non-owner write forbidden, enrolled read allowed, non-enrolled read forbidden. Access/ownership collaborators are mocked.
- **`api-e2e`:** owner upload → owner fetch → enrolled-student fetch → non-enrolled `403` → delete → `404`; plus invalid-VTT `400`.
- **web:** captions-panel states + service calls (`web-courses`); player renders `<track>` when captions present and omits it when absent (`web-video` / `web-learn`).
- **Mutation:** new code falls under the existing Stryker configs for `api-courses`, `web-courses`, `web-learn`, and `web-video`; keep each ≥ 80% adjusted (no elevated auth-tier bar applies here).

## Documentation impact

- README: add the three endpoints to the API tables; note captions in the feature list (EP-09 partial).
- `docs/USER_GUIDE.md`: instructor upload + student playback walkthrough; add `VideoCaptions` to the data-models reference.
- A post-implementation summary in `docs/superpowers/summaries/` paired with this spec and its plan.

## Open questions

None outstanding. Language is fixed to English in this slice by design (see Scope cuts); the `language`/`label` fields exist in the model so a later multi-language slice adds a picker without a migration.

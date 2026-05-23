# Fake Source-Probe Seam — Design Spec

> [!NOTE]
> **DOCUMENT STATUS: DRAFT**
> This document is a living specification and is subject to change. All content is considered provisional until formally approved by project stakeholders.

**Status:** Draft (2026-05-23)
**Scope:** Add a credential-free fake branch to `VideoStorageAdapter.probeSource` so the video upload pipeline completes without real GCP credentials in emulator/dev/test environments. Un-quarantines the 11 video-related api-e2e tests and unblocks the 8 video/publish-gate web-e2e tests that have been failing since ffprobe was added in `f22fd44`.

## Problem

`probeSource` calls `file.getSignedUrl({ version: 'v4' })` on the Firebase Storage emulator and then runs ffprobe against the URL. v4 signing requires Application Default Credentials, which don't exist in emulator mode. The call throws with `Could not load the default credentials.` before ffprobe runs. The video is marked FAILED with `failureReason: 'SOURCE_PROBE_FAILED: …'`, `markFailedFromSubmission` deliberately doesn't set `lesson.videoId`, and the UI stays stuck on `<lib-video-upload>` waiting for a badge that will never appear. The api-e2e video suite was quarantined behind `test.fixme` for the same reason on 2026-05-14.

## Design

Mirror the existing **`playbackStorageImpl: 'real' | 'fake'`** seam on `VideoStorageAdapter` (used by `signObjectUrl` and `readManifestObject`).

**`libs/api-courses/src/lib/video/video.config.ts`**

- Add `sourceProbeImpl: 'real' | 'fake'` to `VideoConfig`.
- In `readVideoConfigFromEnv`:
  - Read env var `LEARNWREN_VIDEO_STORAGE_SOURCE_PROBE_FAKE` (same string-matching rules as the playback flag: `'true'` → fake; absent → fake outside production / real in production; anything else → real).
  - Reject `sourceProbeImpl === 'fake'` when `NODE_ENV === 'production'`.

**`libs/api-courses/src/lib/video/video-storage.adapter.ts`**

- In `probeSource`, short-circuit when `this.cfg.sourceProbeImpl === 'fake'`:
  ```ts
  if (this.cfg.sourceProbeImpl === 'fake') {
    return { height: 240, durationSec: 1 };
  }
  ```
  Returns a static `{ height: 240, durationSec: 1 }`. Matches the fake-transcoder/fake-playback pattern: the seam exists to satisfy the contract, not to actually probe. The transcoder is fake too, so the height and duration values are inert.
- The real path (the existing `getSignedUrl` + ffprobe) is unchanged and continues to run in production.

**Defaults the matrix this way:**

| Mode | `transcoderImpl` | `playbackStorageImpl` | `sourceProbeImpl` |
| :--- | :--- | :--- | :--- |
| Production | `gcp` | `real` | `real` |
| Emulator / dev / e2e | `fake` | `fake` | `fake` |

## Test changes

- **`video-storage.adapter.spec.ts`** — add tests asserting (i) the fake branch returns the static probe without touching `getSignedUrl` or the runner, (ii) the real branch is taken when `sourceProbeImpl === 'real'`.
- **`video.config.spec.ts`** — add the default-fake-outside-prod, default-real-in-prod, env-override-to-real, and reject-fake-in-prod cases for `sourceProbeImpl`, mirroring the existing playback tests.
- **`apps/api-e2e/src/videos.e2e-spec.ts`** — replace the 6 `test.fixme(...)` calls with `test(...)`. The "Quarantined" header comment is updated to record that the fake source-probe seam unblocked them.
- **`apps/api-e2e/src/playback.e2e-spec.ts`** — replace the 5 `test.fixme(...)` calls with `test(...)`. Same comment update.

## Non-goals

- The fake branch does NOT actually probe the uploaded bytes. The static `{ height: 240, durationSec: 1 }` is a stand-in. Any future test that needs probe-driven branching (e.g. asserting transcoder requests a specific output resolution) will still need a richer fake — out of scope here.
- The web upload service's missing `@case ('complete')` template handler is a separate UX cleanup — not addressed in this slice.
- This does not change production behaviour. `sourceProbeImpl` defaults to `'real'` in production and the existing ffprobe path runs unchanged.

## Verification

- `pnpm nx test api-courses` — adapter + config specs green.
- `pnpm nx e2e web-e2e` — the 6 video + 2 publish-gate journeys pass without quarantine.
- `pnpm nx e2e api-e2e` — the 11 previously-`fixme`'d tests run and pass.
- Production build (`pnpm nx build api`) — unchanged.

## Memory follow-ups

- Update `project_api_e2e_video_quarantine.md` to record that the seam shipped and the 11 tests are no longer quarantined.

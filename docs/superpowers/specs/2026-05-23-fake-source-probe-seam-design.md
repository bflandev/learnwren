# Fake Source-Probe Seam — Design Spec

> [!NOTE]
> **DOCUMENT STATUS: DRAFT**
> This document is a living specification and is subject to change. All content is considered provisional until formally approved by project stakeholders.

**Status:** Draft (2026-05-23)
**Scope:** Add a credential-free fake branch to `VideoStorageAdapter.probeSource` so the video upload pipeline reaches `TRANSCODING` without real GCP credentials in emulator/dev/test environments. Diagnoses and fixes the **root cause** behind the 2026-05-14 api-e2e video-test quarantine and the FAILED upload-complete state that has been blocking 8 web-e2e tests since ffprobe was added in `f22fd44`. The seam by itself un-quarantines **one** api-e2e test (the upload happy path) — the rest of the quarantined suite, and the still-failing web-e2e tests, have **additional** pre-existing bugs in adjacent code paths that are out of scope here (see Residual Issues at the end).

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
- A diagnostic web-e2e capture confirms `POST /api/videos/:vid/upload-complete` now returns `state: 'TRANSCODING'` (was `state: 'FAILED'` with `failureReason: 'SOURCE_PROBE_FAILED: Could not load the default credentials.'`).
- `pnpm nx e2e api-e2e` — `videos.e2e-spec.ts > video upload happy path` is un-quarantined and passes; total goes from 94 → 95 passing.
- Production build (`pnpm nx build api`) — unchanged.

## Residual issues (NOT in this slice's scope)

Adjacent bugs the seam exposed but does not fix. Each is a separate piece of work:

- **`TRANSCODING → READY` doesn't transition in fake mode.** `POST /internal/fake-transcoder/complete/:vid` synthesises a SUCCEEDED Pub/Sub envelope and routes it through the production webhook handler. In this env the envelope path does not move the video to `READY`. Blocks 5 api-e2e playback tests and 2 api-e2e videos tests, plus several web-e2e badge-transition tests.
- **The web `<lib-video-upload>` has no `@case ('complete')` template branch.** Once the upload service hits `complete` state the host renders as empty container comments until the parent re-fetches the lesson. Cosmetic, no functional impact in production where the round-trip is slower; visible in fast local emulator runs.
- **Bookkeeping mismatches in the api-e2e tests** that were quarantined since 2026-05-14:
  - Five `204` assertions on `fake-transcoder/complete` are stale since `058cddc` made the route return `200` (helper now updated).
  - `videos.e2e-spec.ts > 401 unauthenticated …` reuses Playwright's `request` fixture across an authenticated step and an "unauthenticated" probe — the session cookie carries over, so the probe is actually authenticated. Needs a fresh request context.
  - `videos.e2e-spec.ts > webhook auth …` expects `[401, 403]` from `/internal/transcoder-events` for an unsigned envelope; in dev (no IAM) the route currently returns `500`.
- **Stale selectors in the 6 web-e2e videos tests** (`lib-video-upload progress` after `<progress>` → `<lw-progress>` restyle, `lib-video-state-badge .badge` after badge restyle to `<lw-pill>`) were fixed in commit `7499225`/`13b4e0b`, but the tests still rely on intermediate states (`lw-progress`, Cancel-button-in-`creating-session`) that the 2 268-byte fixture transitions through faster than Playwright can see, OR that the upload restyle dropped.

The seam removes the **only** blocker that was unfixable without code changes. Everything in the list above is solvable with isolated test/component edits.

## Memory follow-ups

- Update `project_api_e2e_video_quarantine.md` to record that the seam shipped, **one** test is un-quarantined, and the remaining 10 tests stay quarantined with named follow-ups (fake transcoder→READY chain; cookie-carryover test isolation; dev-mode webhook 500→401/403).

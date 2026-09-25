> [!NOTE]
> **DOCUMENT STATUS: DRAFT**
> This document is a living specification and is subject to change. All content is considered provisional until formally approved by project stakeholders.

# US-09-04: Self-Hosting — Slice B Design (real video with ffmpeg)

**Date:** 2026-09-25
**Story:** [US-09-04](../../epics/09-non-functional-requirements.md#us-09-04-open-source-and-self-hosting) (EP-09, Non-Functional Requirements)
**Builds on:** [Slice A](./2026-09-25-us-09-04-self-hosting-design.md) (Docker Compose packaging of emulator mode)
**Status:** Design approved 2026-09-25; scope chosen by the user as "video only".

---

## 1. Goal and scope

After Slice A the self-hosted stack runs every feature except real video:
the transcoder is the in-memory fake and playback serves a stub manifest.
Slice B makes uploaded videos transcode, encrypt and play on the self-hosted
stack with no cloud service. Three cuts were offered; the user chose the
first:

| Cut | Decision |
| :--- | :--- |
| **Video only** — ffmpeg transcoder behind the existing port; segments served through the api | **This slice.** |
| Video + S3-compatible object store replacing the Storage emulator | Later. |
| Full re-platform (replace Firebase Auth and Firestore) | Later; the only cut that fully meets the "no proprietary services" criterion. |

Auth, Firestore and Storage therefore stay on the Firebase emulators. The
epic's amended criterion stays "partially met" and is updated to say video
is now real.

## 2. Constraints found in the code (surveyed at `d263dd3`)

- `VideoTranscoder` (`transcoder/transcoder.port.ts`) is a three-method port:
  `submitJob`, `parseEvent`, `cancelJob`. Completion arrives as an event
  through `TranscoderEventsController` → `VideoService.handleTranscoderEvent`
  → `VideoRepository.applyTranscoderResult`, which requires the persisted
  `transcoderJobName` to match and the state to be `TRANSCODING`.
- `VideoService.completeUpload` calls `submitJob` **before**
  `finalizeUploadWithJob` commits the job name. An event arriving in between
  is answered `JOB_NAME_MISMATCH` and dropped; with GCP that window is
  irrelevant (jobs take minutes) but an in-process encoder of a short file can
  finish inside it.
- Playback signs segment URLs with GCS v4 signed URLs. The Storage emulator
  cannot sign (no credentials), so signed delivery is impossible self-hosted.
- The source probe likewise runs ffprobe against a signed URL.
- `hls-naming.ts` is the naming contract shared by the job builder and the
  playback rewriter: flat `hls_<rendition>.m3u8` variants and
  `hls_<rendition>NNNNNNNNNN.ts` segments beside `manifest.m3u8`. The fake
  storage adapter mirrors it; the ffmpeg output must too.
- hls.js sends the session cookie only on same-origin requests
  (`video-player.service.ts` `xhrSetup`), so same-origin segment URLs are
  authorised by `EnrollmentOrOwnerGuard` with no web change.
- `@ffprobe-installer/ffprobe` already supplies a probe binary per platform;
  `@ffmpeg-installer/ffmpeg` is the same pattern for ffmpeg.

## 3. Design

### 3.1 Switch: one env value, no new variables

`LEARNWREN_VIDEO_TRANSCODER=ffmpeg` (alongside `gcp` and `fake`). In
`video.config.ts` it implies:

| Setting | Derived value |
| :--- | :--- |
| `sourceProbeImpl` | `local` (download to a temp file, ffprobe the path) |
| `playbackStorageImpl` | `real` (`LEARNWREN_VIDEO_STORAGE_PLAYBACK_FAKE=true` is rejected with `ffmpeg`) |
| `segmentDelivery` (new field) | `proxy`; `signed` for `gcp` |

`fake` stays the default outside production. `NODE_ENV=production` accepts
`ffmpeg` (a self-hosted production instance) and keeps rejecting the fakes.
The Compose stack sets `LEARNWREN_VIDEO_TRANSCODER=ffmpeg`.

### 3.2 `FfmpegTranscoderAdapter` (`transcoder/ffmpeg-transcoder.adapter.ts`)

Implements `VideoTranscoder`. Dependencies are injected as seams so the unit
tests never touch disk, ffmpeg or storage: a `runner(binary, args)` for child
processes (same shape as the storage adapter's ffprobe runner), a
`FfmpegStoragePort` with `download(gsUri, localPath)` and
`upload(localPath, gsUri, contentType)`, and an event `sink`.

- `submitJob(input)`: records `{ input, cancelled }` under
  `ffmpeg-<videoId>-<timestamp>-<n>`, starts `runJob` without awaiting it,
  returns the handle. Errors before the job starts (e.g. no rendition fits the
  source height, same rule as `buildJobConfig`) throw from `submitJob` so the
  existing `TRANSCODER_SUBMIT_FAILED` path records them.
- `runJob`:
  1. `mkdtemp`, download the source to `source.<ext>`.
  2. Write `key.bin` (16 bytes) and `key.info` (three lines: the URI ffmpeg
     writes into the playlist, the local key path, no IV line so ffmpeg uses
     the sequence-number IV).
  3. For each rendition in `RENDITIONS` with `height <= sourceHeight`, run
     ffmpeg once: scale to the rendition height (`-vf scale=-2:H`), H.264 at
     the ladder bitrate, 30 fps, 2 s GOP with scene-cut disabled (matching the
     GCP job builder), AAC 128 kbps, `-f hls -hls_time 6 -hls_playlist_type
     vod -hls_key_info_file key.info`, segment pattern `hls_<r>%010d.ts`,
     playlist `hls_<r>.m3u8`. Renditions encode sequentially.
  4. Write `manifest.m3u8`: `#EXTM3U`, then per rendition a
     `#EXT-X-STREAM-INF:BANDWIDTH=<bps>,RESOLUTION=<w>x<h>` line and the
     variant filename — the same lines the fake emits, produced by one shared
     helper (`hlsStreamInf`) so the two cannot drift.
  5. Upload every file under the output prefix (`application/vnd.apple.mpegurl`
     for playlists, `video/mp2t` for segments). Never upload `key.*`.
  6. Remove the temp dir (also on failure).
  7. Deliver `JOB_SUCCEEDED { manifestPath: 'videos/<vid>/hls/manifest.m3u8',
     durationSec }` (duration from an ffprobe of the local source) or
     `JOB_FAILED { reason }` (message sliced to 500 chars). A cancelled job
     delivers nothing.
- `cancelJob(name)`: marks cancelled and kills the running child, if any.
- `parseEvent` throws `Error('ffmpeg transcoder has no push channel')`; the
  webhook controller already acks such events as `MALFORMED`.

### 3.3 Completion delivery and the finalize race

`FfmpegEventBridge` (a provider with `onModuleInit`) injects the adapter and
`VideoService` and sets the adapter's sink to
`svc.handleTranscoderEvent`, avoiding a constructor cycle
(`VideoService` → `VIDEO_TRANSCODER`).

The sink returns `{ acted, reason }`. The adapter mimics Pub/Sub redelivery:
on `acted: false` with reason `JOB_NAME_MISMATCH` or `WRONG_STATE` it
retries with backoff (1, 2, 4, 8, 16, 29 s ≈ 60 s total) and then logs and
gives up; `VIDEO_NOT_FOUND` and `ALREADY_APPLIED` stop at once. A thrown
sink error is retried the same way.

### 3.4 Local source probe

`VideoStorageAdapter.probeSource` gains the `local` branch: download to a temp
file via the same `FfmpegStoragePort.download`, run the existing ffprobe arg
vector on the path, delete the file. (The transcoder downloads the source
again for encoding; one extra download per upload is the accepted cost —
marked `ponytail:` in code.)

### 3.5 Proxied segment delivery

- `ManifestService.fetchRendition`: when `cfg.segmentDelivery === 'proxy'`
  the segment signer returns `/api/playback/segment/<videoId>/<filename>`
  instead of a signed URL. The rewriter already validates every filename
  against `SAFE_SEGMENT_NAME` before the signer sees it; the regex is
  exported for reuse.
- `PlaybackController` gains `GET playback/segment/:vid/:name` under the
  existing `FirebaseSessionGuard` + `EnrollmentOrOwnerGuard`. It re-validates
  `:name` with `SAFE_SEGMENT_NAME` (404 `SEGMENT_NOT_FOUND` otherwise),
  requires `state === READY` (the guard's `CurrentVideo` already loads the
  document), and streams
  `VideoStorageAdapter.openObjectReadStream({ bucket, path: <manifest dir>/<name> })`
  with `Content-Type: video/mp2t` and
  `Cache-Control: private, max-age=<playbackSignedUrlTtlSec>, immutable`.
  A storage 404 maps to `SEGMENT_NOT_FOUND`.
- New exception `SegmentNotFoundException` (`SEGMENT_NOT_FOUND`, 404) and the
  code added to `video-error.codes.ts`. The web player needs no change:
  `PlaybackConfig.fakePlayback` is `false`, so it mounts hls.js, and
  same-origin segment requests carry the cookie.

### 3.6 Module wiring and packaging

- `video.module.ts`: `makeTranscoder` returns the ffmpeg adapter for
  `ffmpeg`, with the real runner and a storage port built on
  `FIREBASE_STORAGE`; registers `FfmpegEventBridge`.
- `package.json`: add `@ffmpeg-installer/ffmpeg`.
- `docker-compose.yml`: `LEARNWREN_VIDEO_TRANSCODER: ffmpeg` on the api. The
  api image already installs runtime dependencies from the emitted
  package.json, so the ffmpeg binary comes with it.
- `.env.tpl` comment and `.env.example` note the new value.

## 4. Ceilings, recorded on purpose

| Ceiling | Why accepted | Upgrade path |
| :--- | :--- | :--- |
| Renditions encode sequentially, one ffmpeg run each | Simplest correct pipeline; a self-host box is one machine | One ffmpeg run with `-filter_complex split` |
| An api restart loses in-flight jobs; the video stays `TRANSCODING` | No job persistence in the port; same as an unacked GCP event today | Boot-time reconcile of `TRANSCODING` videos with `ffmpeg-` job names |
| Every segment request runs `EnrollmentOrOwnerGuard` (a Firestore read per ~6 s per viewer) | Correct authorisation with zero new code | Short-lived signed segment tokens |
| Sources below 360 px are refused | Same rule as the GCP path (`buildJobConfig`) | Add a "source" rendition |
| Encoding runs inside the api process | No queue in the stack | Worker container reading a Firestore queue |

## 5. Tests

- **Config:** `ffmpeg` derives `local` / `real` / `proxy`; `gcp` derives
  `signed`; `ffmpeg` + playback-fake `true` throws; production accepts
  `ffmpeg`.
- **Adapter (unit, seams mocked):** job name shape; rendition selection and
  the exact ffmpeg arg vectors; master manifest body; upload set excludes the
  key files; success and failure events; cancellation kills the child and
  delivers nothing; temp dir removed on failure; retry-on-mismatch then
  success; stop on `VIDEO_NOT_FOUND`.
- **Adapter (integration, real ffmpeg):** generate a 2 s 360p `testsrc` with
  the bundled ffmpeg, run the adapter with a local-filesystem storage port,
  assert `manifest.m3u8` + `hls_360p.m3u8` + segments exist with the contract
  names, the variant carries `#EXT-X-KEY:METHOD=AES-128`, and ffprobe can
  read the encrypted playlist back with the key on disk.
- **Playback:** `ManifestService` mints proxy URLs in `proxy` mode and signed
  ones in `signed` mode; the segment route streams with the right headers,
  404s on an unsafe name and on a missing object, 409s when not `READY`.
- **Guard coverage:** the new route sits on an already-guarded controller; the
  coverage spec passes with no allowlist change.
- **Stack:** Compose re-verified end to end — upload the e2e fixture's larger
  sibling (a generated 360p clip), watch the state reach `READY` without the
  dev endpoint, and play it in headless Chromium.

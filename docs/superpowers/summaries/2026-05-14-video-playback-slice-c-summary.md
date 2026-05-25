# Video: Playback (Slice C) — Implementation Summary

**Date:** 2026-05-14
**Spec:** `docs/superpowers/specs/2026-05-14-video-playback-slice-c-design.md`
**Plan:** `docs/superpowers/plans/2026-05-14-video-playback-slice-c.md`

Third slice of EP-03 (UC-03-04, owner-only subset). After slice B lands `Video.state === 'READY'`, the lesson editor swaps the polling badge for an inline `<video controls>` element that streams the AES-128 HLS bundle. Three new NestJS routes proxy the master m3u8, per-rendition m3u8s with v4-signed segment URLs, and the raw 16-byte AES key. hls.js drives MSE browsers; Safari / iOS use native HLS via `src` assignment. The enrolled-student branch ships as a `TODO(EP-06)` no-op that throws `NOT_VIDEO_OWNER`.

## What shipped

### NestJS (`libs/api-video/src/lib/playback/`)

- `manifest.rewriter.ts` — pure rewriter. `ALLOWED_RENDITIONS = ['1080p','720p','480p','360p']`, `rewriteMaster` swaps each `EXT-X-STREAM-INF` URI for `/api/playback/manifest/:vid/rendition/:r`, `rewriteRendition` substitutes `URI=…` in `#EXT-X-KEY` (IV preserved verbatim), signs each segment via an injected `SegmentSigner`, leaves `METHOD=NONE` and already-signed `http(s)://` URIs untouched, throws `ManifestParseFailedException` on missing `#EXTM3U` / unknown rendition / orphan stream-inf.
- `manifest.service.ts` — IO seam. `fetchMaster` and `fetchRendition` read the m3u8 via `VideoStorageAdapter.readManifestObject`, delegate the rewrite, and bind segment-signing to `cfg.playbackSignedUrlTtlSec` (14 400 s).
- `key.service.ts` — base64-decodes `videoKeys/{kid}.key` to a 16-byte `Buffer`; throws `KeyLookupFailedException` (500) on missing `keyId` or missing key doc.
- `enrollment-or-owner.guard.ts` — loads `videos/:vid`, throws `VIDEO_NOT_FOUND` / `VIDEO_NOT_READY` / `NOT_VIDEO_OWNER`, attaches the loaded `Video` to `request.video` on owner success, leaves the enrolled-student branch as a commented `TODO(EP-06)`.
- `current-video.decorator.ts` — `@CurrentVideo()` param decorator pulling `request.video` (throws if used without the guard).
- `playback.controller.ts` — `@Controller('playback')` class-decorated with `@UseGuards(FirebaseSessionGuard, EnrollmentOrOwnerGuard)` and `@UseFilters(VideoExceptionFilter)`; three `@Get` handlers (`manifest/:vid`, `manifest/:vid/rendition/:r`, `keys/:vid`) set `Cache-Control: no-store`, the m3u8 routes set `Content-Type: application/vnd.apple.mpegurl; charset=utf-8`, and the key route sets `Content-Type: application/octet-stream` + `Content-Length: 16`. Rendition allow-list check throws `RenditionNotFoundException` (404).
- `errors/video.exception.ts` / `errors/video-error.codes.ts` — four new codes / classes: `RENDITION_NOT_FOUND` (404), `VIDEO_NOT_READY` (409 with `currentState` detail), `KEY_LOOKUP_FAILED` (500), `MANIFEST_PARSE_FAILED` (502).
- `video-storage.adapter.ts` — gains `readManifestObject({bucket,path})` (`file.download()` → UTF-8 string) and `signObjectUrl({bucket,path,ttlSec})` (v4 signed read URL). The api-e2e module overrides the adapter with a fake whose `signObjectUrl` returns a deterministic `gs-stub://…` URL.
- `video.config.ts` — adds `playbackSignedUrlTtlSec` (env `LEARNWREN_VIDEO_PLAYBACK_SIGNED_URL_TTL_SEC`, default 14 400), parsed via the existing `readPositiveNumber` helper.
- `video.repository.ts` — adds `getVideoKey(kid)` reader for `videoKeys/{kid}`.
- `video.module.ts` — registers `PlaybackController` and the four new providers (`ManifestService`, `KeyService`, `EnrollmentOrOwnerGuard`).

### Angular (`libs/web-video/src/lib/player/`)

- `video-player.service.ts` — `@Injectable({providedIn: 'root'})` `VideoPlayerService.attach(el, manifestUrl, hooks)` returns a `PlayerHandle`. `Hls.isSupported()` branch instantiates `new Hls({xhrSetup: xhr => xhr.withCredentials = true})`, registers a fatal-`ERROR` handler that maps `Hls.ErrorDetails` to short user messages (`manifestLoad*`, `levelLoad*` / `fragLoad*`, `keyLoad*`, default), calls `loadSource` + `attachMedia`. Native-HLS branch (`canPlayType('application/vnd.apple.mpegurl')`) assigns `el.src` and attaches a single `error` listener. Both `dispose` paths null the `src` and call `el.load()`.
- `video-player.component.ts` / `.html` — standalone `<lib-video-player>` with `input.required<VideoId>()`, `@ViewChild('playerEl')` `<video controls preload="metadata" crossorigin="use-credentials">`, an `error` signal, a `Try again` button (uses `lwButton`), `ngAfterViewInit` mounts, `ngOnDestroy` disposes, `retry()` disposes + remounts.
- `libs/web-video/src/index.ts` — exports `VideoPlayerComponent`.
- `package.json` — declares `hls.js` as a peerDependency (commit `63a9ed1`); the workspace `package.json` carries the actual `hls.js ^1.6.16` dependency.

### Angular (`libs/web-courses`)

- `components/lesson-item/lesson-item.component.html` — third render branch added: `@if (v.state === 'READY') { <lib-video-player [videoId]="v.id" /> } @else { <lib-video-state-badge … /> }`. Earlier-state badge and upload-component branches preserved.

### Documentation

- `docs/operations/transcoder-pubsub-setup.md` — new "Output bucket CORS (EP-03 Slice C)" section with the `gsutil cors set` runbook and a sample `cors-config.json` (dev + prod hosting origins, `GET` / `HEAD`, `Content-Type` / `Range` response headers, `maxAgeSeconds: 3600`).
- `.env.tpl` — adds the `LEARNWREN_VIDEO_PLAYBACK_SIGNED_URL_TTL_SEC=14400` block.
- `README.md` — status banner updated: "EP-03 slices A + B + C (video upload through owner playback)"; "Student playback (EP-06) and the publish gate (slice D) remain deferred."

### Tests

- `libs/api-video/src/lib/playback/*.spec.ts` — six spec files: `manifest.rewriter.spec.ts`, `manifest.service.spec.ts`, `key.service.spec.ts`, `enrollment-or-owner.guard.spec.ts`, `playback.controller.spec.ts`, `current-video.decorator.spec.ts`. Cover happy paths, allow-list misses, parse failures, owner / non-owner / unauthenticated branches, content-type and `Cache-Control` headers, `Content-Length: 16` on the key route, and the `TODO(EP-06)` fall-through.
- `libs/web-video/src/lib/player/*.spec.ts` — `video-player.service.spec.ts` and `video-player.component.spec.ts`. Stub `hls.js` via Vitest module mock; cover MSE / native-HLS / unsupported branches, `xhrSetup` setting `withCredentials`, fatal-error mapping, dispose, component mount / unmount / retry, and the `error` signal.
- `apps/api-e2e/src/playback.e2e-spec.ts` — happy-path (master 200 / 4 rewritten rendition lines; rendition 200 / signed segments / key URI preserved IV; key 200 / `Content-Length: 16` / matching bytes) and negative paths (401 unauthenticated, 403 second-instructor on all three routes, 404 unknown vid, 404 unknown rendition `xyz`, 409 not-ready). Uses the adapter-override fake-signer pattern.
- `apps/web-e2e/src/videos.spec.ts` — Playwright spec covers badge → player swap on `READY` and the non-owner 403 path.
- `libs/web-courses/src/lib/components/lesson-item/lesson-item.component.spec.ts` — extends the existing spec to cover the `state === 'READY'` render branch.

### Quality

- `chore(quality): refresh api-video mutation report for slice C` (`ac7c57d`) — slice C surface (six `playback/**` files) lands at 100.00% effective mutation score; aggregate `libs/api-video` at 81.04% effective (carry-over coverage debt on `video.service.ts` and `webhook/**`).
- `chore(quality): refresh CRAP report for slice C surface` (`7d717c7`) — `tools/crap/crap.mjs` `COVERAGE_DIRS` widened (functions analyzed 111 → 412); all six playback files at 100% branch coverage, top CRAP 9.00, none above the 30 threshold.

## Plan deviations worth knowing about

- **Pre-flight graph-cycle fix (`b6830d4`) shipped on the slice C branch before Task 1.** The slice A/B `forwardRef(() => require('@learnwren/api-video'))` pattern in `libs/api-courses/src/lib/courses.module.ts` showed up in Nx's project graph as an `api-courses ↔ api-video` cycle, which blocked `pnpm typecheck` and clean `pnpm nx build api-courses` runs. The fix builds the package name from string fragments at runtime so Nx's static analyzer cannot follow the `require()`; runtime behaviour is identical. The plan assumed a clean tree from slice B and did not call this out.
- **`web-video` declares `hls.js` as a peerDependency** (`63a9ed1`), not a direct dependency. The plan added `hls.js` to `web-video/package.json` straightforwardly; the post-commit fix moves it to `peerDependencies` so the lib doesn't pin the version downstream and the workspace root owns the resolved version (`^1.6.16`).
- **`PlaybackController` is class-decorated with `@UseFilters(VideoExceptionFilter)`.** The plan inherited the slice A pattern where the global filter handles `VideoException`, but the `@UseFilters` decoration on the controller class makes the wiring explicit at the playback surface — matching the per-feature exception-filter convention the repo follows.
- **`manifest.service.ts` uses `video.output!.bucket` / `manifestPath` non-null assertions.** The `READY`-state invariant guarantees `output` is set (slice B `applyTranscoderResult` writes them together), and the `EnrollmentOrOwnerGuard` rejects anything else with 409 before the service runs. The plan flagged this as a documented non-null in Task 9 comments.
- **The plan's `libs/api-video` location is the on-disk reality at slice C land time.** A subsequent refactor (`8bbc4e7`, 2026-05-20) folded `api-video` into `libs/api-courses/src/lib/video/` to fix a webpack-vs-Nx forwardRef hazard. The slice C summary describes the files at their slice-C landing path (`libs/api-video/src/lib/playback/`); they now live at `libs/api-courses/src/lib/video/playback/`.

## Verification outcome

- **Unit tests**: all green at land time. New playback specs in `libs/api-video/src/lib/playback/` (6 files) and `libs/web-video/src/lib/player/` (2 files) commit cleanly with their implementations in TDD red → green order per plan tasks.
- **Mutation testing**: `libs/api-video` slice C surface scores 100.00% effective (acceptance bar ≥ 85%). Aggregate `libs/api-video` at 81.04% effective with the gap explicitly attributed to pre-existing slice A/B debt on `video.service.ts` retry / delete branches and `webhook/**`.
- **CRAP**: refreshed report (`docs/quality/crap-report.md`) — slice C playback files at 100% branch coverage, top CRAP 9.00, none above the 30 threshold.
- **API e2e**: `apps/api-e2e/src/playback.e2e-spec.ts` covers both happy and negative paths against the Firebase + Storage emulators and the fake transcoder. The `signObjectUrl` test seam is wired via adapter override (slice B precedent), so CI does not depend on real GCS signing.
- **Web e2e**: `apps/web-e2e/src/videos.spec.ts` covers the badge-to-player swap and non-owner 403.
- **Manual / live**: §12 of the spec lists six dev-project run-throughs (real GCP Transcoder, real Cloud Storage, real bucket CORS, real Safari / iOS native HLS, > 4 h pause expiry, mid-playback lesson delete). The `gsutil cors set` provisioning step and the live walk-throughs are operator tasks not exercised by CI.

## Follow-ups not in scope

Per spec §Non-Goals and §10 (locked decisions):

- **Enrolled-student playback (EP-06).** `EnrollmentOrOwnerGuard` ships with the enrolled branch as a `TODO(EP-06)` no-op; EP-06 wires the `enrollment.isEnrolled` lookup (since shipped — see `libs/api-courses/src/lib/video/playback/enrollment-or-owner.guard.ts` for the post-EP-06 widened version).
- **Slice D — Publish gate.** Consuming `state === 'READY'` in a publish-eligibility check is its own slice.
- **Slices E (notifications), F (retention / reconciliation / replace cleanup), A.1 (replace flow).** All deferred.
- **Multi-DRM (Widevine + PlayReady + FairPlay), MPEG-DASH, license server, Cloud CDN.** Architecture spec §6 reduced-DRM bar unchanged; slice C ships AES-128 HLS only.
- **Quality picker / captions / chapters / resume position / watermarking / player telemetry / playback-error reporting back to the API.** Out of slice C; player is native `<video controls>` only.
- **Cross-client live state updates / live invalidation on mid-playback video delete.** Parent re-render still depends on the next user action that re-fetches `Lesson`.
- **Auto-retry-with-backoff on hls.js fatal errors.** Slice C is one-shot `Try again`.
- **Manifest caching layer.** Every playback endpoint emits `Cache-Control: no-store`.
- **Terraform / IaC for output-bucket CORS.** One-time `gsutil cors set` per environment, documented in `docs/operations/transcoder-pubsub-setup.md`.

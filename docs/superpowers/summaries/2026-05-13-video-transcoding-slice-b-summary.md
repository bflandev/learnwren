# Video: Transcoding (Slice B) — Implementation Summary

**Date:** 2026-05-13
**Spec:** `docs/superpowers/specs/2026-05-13-video-transcoding-slice-b-design.md`
**Plan:** `docs/superpowers/plans/2026-05-13-video-transcoding-slice-b.md`

Realises US-03-02 (automatic transcoding) and the reduced-DRM collapse of US-03-03 (AES-128 HLS segment encryption). On `POST /api/videos/:vid/upload-complete`, the API HEADs the source, ffprobes for height, generates a 16-byte AES-128 key, submits a GCP Transcoder job with 3× backoff retry, and advances `Video.state` straight from `PENDING_UPLOAD` to `TRANSCODING` (or `FAILED` on probe/submit exhaustion) in a single Firestore transaction. A Pub/Sub push subscription delivers job-state events to a new webhook controller that idempotently transitions to `READY` or `FAILED`. A `FakeTranscoderAdapter` plus a dev-only simulator controller lets CI run the full pipeline without GCP. The editor badge polls `GET /api/videos/:vid` every 5 s while non-terminal and updates copy through Processing → Ready / Failed.

## What shipped

### NestJS (`libs/api-video`, later merged into `libs/api-courses/src/lib/video/`)

- `transcoder/transcoder.port.ts` — `VIDEO_TRANSCODER` DI symbol, `TranscoderJobInput`, `TranscoderJobHandle`, the `TranscoderEvent` discriminated union (`JOB_SUCCEEDED` carries `manifestPath` + `durationSec`; `JOB_FAILED` carries `reason` capped at 500 chars), and the `VideoTranscoder` interface (`submitJob`, async `parseEvent`, `cancelJob`).
- `transcoder/transcoder-job.builder.ts` — pure `buildJobConfig`. Pinned ladder (1080p/720p/480p/360p @ 5/3/1.5/0.8 Mbps, AAC 128 kbps, 6 s TS segments, 2 s GOP, H.264); filters renditions whose height exceeds `sourceHeight`; throws when source is below 360p; wires `pubsubDestination.topic`, `labels.videoid`, manifest filename `manifest.m3u8`, and an `aes128` encryption stanza keyed by the supplied `VideoKeyId`.
- `transcoder/gcp-transcoder.adapter.ts` — wraps `@google-cloud/video-transcoder`'s `TranscoderServiceClient` via a structural `TranscoderClient` interface (constructor-injected, mockable). `submitJob` injects `keyBytes: Buffer.from(...)` into the encryption stanza emitted by the builder. `parseEvent` decodes the Pub/Sub envelope, calls `getJob` for authoritative `outputDurationSec` on success, and propagates failures so the webhook returns 5xx. `cancelJob` swallows gRPC NOT_FOUND (`code === 5`) and re-throws anything else.
- `transcoder/fake-transcoder.adapter.ts` — in-memory adapter for CI / `pnpm emulators`. `submitJob` records a synthetic `fake-job-<vid>-<ts>` and returns; `parseEvent` decodes the same envelope shape and returns a synthetic `durationSec` of 60; `cancelJob` marks the recorded job cancelled. Test helper `peekJob` for adapter specs.
- `webhook/pubsub-push.guard.ts` — `PubSubPushGuard` injects `VIDEO_CONFIG` and an `ID_TOKEN_VERIFIER` DI token (structural — satisfied by `google-auth-library`'s `OAuth2Client`). Verifies `Bearer` token, Google issuer, expiry, `aud === webhookAudience`, `email === invokerSaEmail`. Maps failures to `PubSubInvalidTokenException` (401), `PubSubWrongAudienceException` (403), `PubSubWrongInvokerException` (403). `assertConfigComplete` fails closed if the cfg is missing.
- `webhook/transcoder-events.controller.ts` — `POST /api/internal/transcoder-events`, class-decorated `@UseGuards(PubSubPushGuard)`. Calls `transcoder.parseEvent` then `VideoService.handleTranscoderEvent`. Returns 204 on `acted: true`, 200 with `{acked, reason}` on idempotent no-op, 500 on transient throw (Pub/Sub retries). Malformed events are logged and ack'd with `reason: 'MALFORMED'`.
- `webhook/fake-transcoder.controller.ts` — dev-only controller; conditionally added to `VideoModule.controllers` only when `LEARNWREN_VIDEO_TRANSCODER=fake`. Routes `POST /api/internal/fake-transcoder/{complete,fail}/:vid` synthesise the Pub/Sub envelope on the video's stored `transcoderJobName` and delegate to `TranscoderEventsController.handle` in-process (skipping the guard).
- `video-storage.adapter.ts` — extended with `probeSource` (signed read URL → `execFile`-runs the bundled `@ffprobe-installer/ffprobe` binary, parses JSON for first video stream's height; throws on missing stream) and `deletePrefix` (best-effort recursive bucket cleanup; swallows errors). Test seam `__setRunner` lets specs avoid spawning a subprocess.
- `video.service.ts` — `completeUpload` is decomposed into `getPendingUploadOrThrow` → `verifyUploadObjectOrThrow` → `tryProbeSource` → `generateContentKey` → `submitWithRetry` (3 attempts, `BACKOFF_MS = [1000, 2000, 4000]`) → `repo.finalizeUploadWithJob`. Failures route through `recordPipelineFailure` writing `failureReason = '<CODE>: <detail>'` capped at 500 chars (`SOURCE_PROBE_FAILED`, `TRANSCODER_SUBMIT_FAILED`). `handleTranscoderEvent` is a thin dispatcher to `repo.applyTranscoderResult` (idempotency logic lives in the repo). `delete` and `deleteForLesson` share a new `tearDownVideoSideEffects` helper that cancels on `TRANSCODING`, recursive-prefix-deletes on `READY`, and is best-effort throughout.
- `video.repository.ts` — gains `finalizeUploadWithJob`, `markFailedFromSubmission`, and `applyTranscoderResult` (the idempotent state-machine transaction returning `{acted, reason}` with reasons `VIDEO_NOT_FOUND`, `JOB_NAME_MISMATCH`, `ALREADY_APPLIED`, `WRONG_STATE`).
- `video.config.ts` — `VideoConfig` grows `outputBucket`, `transcoderImpl: 'gcp' | 'fake'`, `pollIntervalMs`, plus the optional GCP-only fields (`gcpProjectId`, `transcoderLocation`, `transcoderTopic`, `webhookAudience`, `invokerSaEmail`). Validator rejects `transcoderImpl=fake` when `NODE_ENV=production` and requires all GCP fields when `transcoderImpl=gcp`.
- `video.module.ts` — registers the `VIDEO_TRANSCODER` factory selecting `Fake` or `GcpTranscoderAdapter`, wires `ID_TOKEN_VERIFIER`, and conditionally registers `FakeTranscoderController` only when fake mode is selected. Boot-time refuses to start when `NODE_ENV=production` and `LEARNWREN_VIDEO_TRANSCODER=fake`.
- `errors/video.exception.ts` + `errors/video-error.codes.ts` — adds `PUBSUB_INVALID_TOKEN`, `PUBSUB_WRONG_AUDIENCE`, `PUBSUB_WRONG_INVOKER` codes and the three matching exception classes.

### Angular (`libs/web-video`)

- `polling/video-state-polling.service.ts` — RxJS pipeline using `defer` + `expand` + `takeWhile`. Polls `GET /api/videos/:id` at 5 s default, terminates on `READY` / `FAILED`, and stops cleanly before a 30-minute cap rather than racing into it. Options bag accepts `intervalMs` / `capMs` overrides.
- `video-state-badge.component.ts` + `.html` — slice B copy: "Uploaded — preparing…" (`PENDING_UPLOAD`/`UPLOADED`), "Processing video…" (`TRANSCODING`), "Ready to publish" (`READY`), "Transcoding failed — delete and re-upload" (`FAILED`), plus stuck-state for `TRANSCODING` mirroring slice A's 30-minute threshold. Selector remains `lib-video-state-badge`. The component subscribes to the polling service on init when non-terminal, mirrors the live `Video` into a signal, and emits a `stateChanged` output (later consumed by slice D).

### Documentation

- `docs/operations/transcoder-pubsub-setup.md` — one-time `gcloud` provisioning runbook: topic, dead-letter topic + pull sub, invoker SA, IAM binding, push subscription with OIDC token + dead-letter cap of 5 attempts, Transcoder service-agent bucket bindings; plus verification and teardown commands.
- `docs/superpowers/specs/2026-05-13-video-pipeline-architecture-design.md` §3.2 — amended in commit `309c425` to the final port shape (async `parseEvent`, added `cancelJob`).
- `README.md` — banner line "**EP-03 Video & DRM** — resumable upload (MP4 / MOV / MKV ≤ 10 GB), GCP Transcoder → AES-128 HLS, …" reflects the shipped pipeline (later folded into a multi-slice EP-03 banner once C and D landed).
- `.env.tpl` — eight new `LEARNWREN_*` rows (output bucket, transcoder selector, GCP project / location / topic / webhook audience / invoker SA, web poll interval).

### Tests

Unit specs (Vitest): `transcoder-job.builder.spec.ts` (10), `fake-transcoder.adapter.spec.ts`, `gcp-transcoder.adapter.spec.ts`, `pubsub-push.guard.spec.ts`, `transcoder-events.controller.spec.ts`, `fake-transcoder.controller.spec.ts`, extensions to `video.service.spec.ts` for `handleTranscoderEvent` branches and the widened delete, plus `video-storage.adapter.spec.ts` for the new `probeSource` and `deletePrefix`. The web side adds `video-state-polling.service.spec.ts` and slice-B copy specs in `video-state-badge.component.spec.ts`.

E2E: `apps/api-e2e/src/videos.e2e-spec.ts` and `apps/web-e2e/src/videos.spec.ts` were extended with transcoding-lifecycle, webhook-auth, idempotency, READY cascade, and badge transition scenarios.

## Plan deviations worth knowing about

- **Transcoder Pub/Sub event idempotency logic lives in the repository, not the service.** The plan placed the `VIDEO_NOT_FOUND` / `JOB_NAME_MISMATCH` / `ALREADY_APPLIED` / `WRONG_STATE` branching inside `VideoService.handleTranscoderEvent`. Shipped code makes the service a thin dispatcher to a new `VideoRepository.applyTranscoderResult` that runs the read-check-write inside a Firestore transaction and returns the structured `{acted, reason}` outcome. The webhook controller's contract is unchanged.
- **`completeUpload` is decomposed into private helpers (`tryProbeSource`, `generateContentKey`, `buildTranscoderInput`, `submitWithRetry`, `recordPipelineFailure`)** rather than the plan's inline implementation. The committed transaction is on the repo as `finalizeUploadWithJob` / `markFailedFromSubmission` — the service composes them but doesn't open the transaction itself.
- **`PubSubPushGuard` injects an `ID_TOKEN_VERIFIER` DI token** rather than instantiating `OAuth2Client` directly. The structural verifier interface keeps the guard testable without import-time mocking of `google-auth-library` and lets the `VideoModule` factory pick the real client.
- **The guard fails closed on incomplete config** via `assertConfigComplete` — defending against the case where `cfg.invokerSaEmail` / `cfg.webhookAudience` happen to be undefined (which would silently compare `undefined !== undefined` and admit any token).
- **`TranscoderEventsController` returns a JSON body on no-op (`{acked: true, reason}`)** rather than the spec's structured-log-only 200. The 4xx / 200 / 5xx behaviour Pub/Sub keys off is preserved; the body just makes the test assertions clearer. Malformed parse failures are likewise ack'd with `reason: 'MALFORMED'` instead of bubbling to 500.
- **`FakeTranscoderController` is registered when `LEARNWREN_VIDEO_TRANSCODER === 'fake'`** rather than the spec's `process.env.NODE_ENV !== 'production'`. The boot-time validator already rejects fake-in-production, so the gate is equivalent but tied to the same env var that selects the adapter.
- **The `api-video` lib was later merged into `api-courses`** (commit `8bbc4e7`, post-slice-B) to break a module cycle that emerged when slice C landed. Slice B's files were originally under `libs/api-video/src/lib/`; they now live under `libs/api-courses/src/lib/video/`. The summary refers to the present-day paths.

## Verification outcome

- Unit suite is green across `api-video` (the original ship) and the slice B subsections of `api-courses` / `web-video` after the later merge.
- API e2e (`apps/api-e2e/src/videos.e2e-spec.ts`) covers the lifecycle through the fake adapter (`upload → TRANSCODING`, `→ READY` via `/internal/fake-transcoder/complete/:vid`, `→ FAILED` via `/fail/:vid`, idempotent second call, webhook-auth rejection, READY-cascade output cleanup). At ship time these were authored and committed but several are now `test.fixme`'d under the `FOLLOWUP(fake-transcoder-ready-chain)` marker: the fake source-probe seam lets the video reach `TRANSCODING`, but the in-process fake-completer chain does not currently flip `TRANSCODING → READY` in the e2e environment. The TRANSCODING-arrival assertions still run; the READY / FAILED leg is quarantined. The webhook-auth test against the production-style route is also quarantined separately.
- Web e2e covers the badge transition through TRANSCODING → READY (and the FAILED branch); the corresponding `fake-transcoder-ready-chain` follow-up applies on this side too.
- Mutation + CRAP reports were refreshed for `api-video` (`reports/mutation/api-video/`) and folded into `docs/quality/mutation-report.md`; the per-lib `mutation-report-api-courses.md` and `mutation-report-web-video.md` files reflect the eventual post-merge surface.
- Manual operations against the real `learn-wren` GCP project (real Transcoder API, real Pub/Sub, real buckets) per spec §10 acceptance bar remain a human-operator runbook (`docs/operations/transcoder-pubsub-setup.md`). CI uses `LEARNWREN_VIDEO_TRANSCODER=fake`.

## Follow-ups not in scope

Per spec §"Non-Goals":

- **Slice C — Owner playback.** Manifest / key endpoints, `VideoPlayerComponent`, EME wiring. Landed subsequently as a separate spec.
- **Slice D — Publish gate.** Consuming `state === 'READY'` in publish eligibility. Landed subsequently.
- **Slice E — Notifications.** No in-app or email notification on completion / failure; the badge is the only feedback channel.
- **Slice F — Retention, reconciliation, replace cleanup.** No background sweep for `TRANSCODING`-stuck videos; no orphan output-bucket cleanup; no auto-mark-FAILED. The 30-minute stuck-state badge is the only surface.
- **Slice A.1 — Replace flow.** 409 `LESSON_ALREADY_HAS_VIDEO` remains the only path; instructors delete and recreate to swap a video.
- **Multi-DRM (Widevine + PlayReady + FairPlay), MPEG-DASH manifests, Cloud CDN in front of Cloud Storage** — deferred per architecture spec.
- **Cross-client live state updates.** Firestore rules stay deny-all on `videos/**` and `videoKeys/**`; the editor refreshes by polling.
- **Terraform / IaC for Pub/Sub resources.** Slice B ships only the manual `gcloud` runbook.
- **`fake-transcoder-ready-chain` follow-up.** The in-process simulator's TRANSCODING → READY chain in e2e land. Tracked via the `test.fixme` markers in `apps/api-e2e/src/videos.e2e-spec.ts` and `apps/web-e2e/src/videos.spec.ts`.

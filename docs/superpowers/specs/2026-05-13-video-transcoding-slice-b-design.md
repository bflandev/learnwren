# Video Transcoding + AES-128 Key Generation — EP-03 Slice B Design Spec

**Status:** Approved (2026-05-14)
**Scope:** Second implementation slice of EP-03 (Video Management and DRM). Delivers US-03-02 (automatic transcoding) and the collapsed, reduced-DRM realisation of US-03-03 (AES-128 HLS segment encryption, per architecture spec §6). On `POST /api/videos/:vid/upload-complete`, NestJS probes the source, generates a 16-byte AES-128 key, writes a `VideoKey` doc, submits a GCP Transcoder API job, and advances `Video.state` from `UPLOADED` straight to `TRANSCODING` in the same handler. A Pub/Sub push subscription delivers transcoder job-state events to a new webhook controller, which advances `Video.state` to `READY` or `FAILED`. The editor's badge reflects the live state via 5-second polling. A `FakeTranscoderAdapter` plus dev-only simulator endpoint enables full end-to-end testing in CI without GCP Transcoder API access.

This spec sits on top of `2026-05-13-video-pipeline-architecture-design.md` (the architecture decision spec) and inherits its provider stack (GCP Transcoder API + Cloud Storage + AES-128 HLS for MVP), data model shape, library boundaries, `VideoTranscoder` port shape, Pub/Sub event envelope, and bucket layout. It builds directly on `2026-05-13-video-upload-slice-a-design.md` (slice A), reusing its session-cookie auth, hoisted `InstructorRoleGuard`, `VideoOwnerGuard`, source-bucket lifecycle, and one-video-per-lesson invariant. Owner playback (slice C), publish gate (slice D), notifications (slice E), and soft-delete retention (slice F) are explicitly deferred.

## Goal

A fresh clone, after `pnpm install`, `pnpm secrets:render`, and the one-time GCP provisioning runbook, must satisfy:

- An instructor (promoted via `pnpm tools:promote-to-instructor`) uploads a video to a lesson. Within seconds of `upload-complete` returning, `Video.state` is `TRANSCODING`, a `VideoKey` doc exists with a base64 16-byte AES-128 key, and the GCP Transcoder API has accepted the job.
- The editor badge transitions through "Processing video…" while the job runs (5 s polling) and to "Ready to publish" within ~3 min for a typical short video. A failed job lands on "Transcoding failed — delete and re-upload".
- The output bucket contains `videos/{videoId}/hls/manifest.m3u8` plus `videos/{videoId}/hls/{rendition}/segment_NNN.ts` files, AES-128 encrypted per HLS segment.
- Re-deliveries of the same Pub/Sub event are no-ops. Stale events for re-uploaded or deleted videos are acknowledged and discarded. Transient handler errors return 5xx; Pub/Sub retries up to 5 times with exponential backoff, then dead-letters.
- Deleting a lesson with a `TRANSCODING` video cancels the transcoder job best-effort. Deleting a lesson with a `READY` video removes both source and output bucket objects, the `Video` doc, and the `VideoKey` doc.
- CI runs the full upload → transcode → READY happy path against a fake transcoder adapter without any external GCP service calls.
- All prior-spec quality gates pass: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e`, `pnpm start`, `pnpm emulators`, `pnpm secrets:render`, `pnpm secrets:run`. No regression in `api-auth`, `api-courses`, `web-auth`, `web-courses`, or slice A's tests.
- Mutation testing on `libs/api-video` matches the slice A bar: ≥ 85 % effective. Raw Stryker output refreshed in `reports/mutation/api-video/`; triage summary updated in `docs/quality/mutation-report.md`. Mutation score on `libs/api-courses` does not regress.

## Non-Goals

Each owned by a named subsequent slice or epic.

- **Slice C — Owner playback.** No manifest or key endpoints (`/api/playback/manifest/:vid`, `/api/playback/keys/:vid`). No `VideoPlayerComponent`. No EME wiring. The "Ready to publish" badge is the terminal observable state for slice B users.
- **Slice D — Publish gate.** Slice B produces `READY` videos; consuming `state === 'READY'` in a publish-eligibility check is slice D.
- **Slice E — Notifications.** No in-app or email notification on transcoding completion or failure. The badge is the only user-visible feedback.
- **Slice F — Retention, reconciliation, replace cleanup.** No automatic mark-as-FAILED for videos stuck in `TRANSCODING`. No background reconciliation against the GCP Transcoder API. The editor surfaces stuck state via the existing 30-minute affordance.
- **Slice A.1 — Replace flow.** Still deferred. 409 `LESSON_ALREADY_HAS_VIDEO` from slice A remains the only path for changing a lesson's video; instructors who need to swap must delete the lesson and recreate.
- **Multi-DRM (Widevine + PlayReady + FairPlay).** Deferred to a post-MVP slice. Slice B ships AES-128 HLS segment encryption, no commercial DRM, no license server. See architecture spec §6 for the protection-claim breakdown.
- **MPEG-DASH manifests.** Adds with multi-DRM.
- **Cloud CDN in front of Cloud Storage.** Deferred per architecture spec; revisit when load demands.
- **Cross-client live state updates.** Firestore rules stay deny-all on `videos/**` and `videoKeys/**`. Editor refreshes by polling `GET /api/videos/:vid`.
- **Output bucket lifecycle.** Slice F adds orphan cleanup.
- **Terraform / IaC for Pub/Sub resources.** Slice B documents a manual `gcloud` runbook.

## 1. State Machine

Slice A persisted three states: `PENDING_UPLOAD`, `UPLOADED`, `FAILED`. Slice B extends the persisted set to all six values in the `VideoState` union, with `UPLOADING` still defined but never written (consistent with slice A §1).

```
   ┌────────────────────┐
   │ PENDING_UPLOAD     │   ← slice A
   └──────┬─────────────┘
          │ POST /upload-complete
          │   HEAD-verify source
          │   ffprobe → sourceHeight, sourceDurationSec
          │   crypto.randomBytes(16) → VideoKey
          │   VideoTranscoder.submitJob (3× retry)
          │   Firestore txn:
          │     Video.state = TRANSCODING
          │     Video.keyId, transcoderJobName populated
          │     Lesson.videoId = :vid
          ▼
   ┌────────────────────┐
   │ TRANSCODING        │   ← slice B writes
   └──────┬─────────────┘
          │
          │ Pub/Sub push → /api/internal/transcoder-events
          │ PubSubPushGuard verifies OIDC token
          │ VideoService.handleTranscoderEvent (idempotent)
          │
   ┌──────┴───────┬──────────────────────┐
   ▼              ▼                      ▼
┌─────────┐ ┌─────────┐               (no-op:
│ READY   │ │ FAILED  │                ALREADY_APPLIED,
└────┬────┘ └────┬────┘                JOB_NAME_MISMATCH,
     │           │                     WRONG_STATE,
     │           │                     VIDEO_NOT_FOUND
     │           │                     all → 200, logged)
     │           │
     │           │ user "delete and re-upload"
     │           ▼  DELETE /api/videos/:vid
     │      ┌─────────────────┐
     │      │ (doc deleted)   │
     │      └─────────────────┘
     │
     │ DELETE /api/videos/:vid (lesson delete cascade)
     │   transcoder.cancelJob (no-op on terminal)
     │   delete output bucket objects under videos/{vid}/
     │   delete source bucket object
     │   transactional: delete Video, delete VideoKey, null Lesson.videoId
     ▼
   ┌─────────────────┐
   │ (doc deleted)   │
   └─────────────────┘
```

**Submit-time failures** (`ffprobe` failure, `submitJob` 3× exhausted): inline in the upload-complete handler — Firestore transaction advances state to `FAILED` instead of `TRANSCODING`. Response body carries the FAILED Video. Instructor sees the failure badge immediately, without an intervening `UPLOADED → TRANSCODING → FAILED` walk.

**DELETE state guard** widens from slice A's `{ PENDING_UPLOAD, UPLOADED, FAILED }` to also accept `TRANSCODING` and `READY`. On `TRANSCODING`: best-effort `transcoder.cancelJob(jobName)`. On `READY`: best-effort recursive delete of output-bucket objects under `videos/{videoId}/`. Failures of either are logged, not raised — Firestore cleanup proceeds.

## 2. API Surface

### 2.1 New endpoints

| Verb | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/internal/transcoder-events` | `PubSubPushGuard` only | Pub/Sub push target; idempotent state transitions. |
| `POST` | `/api/internal/fake-transcoder/complete/:videoId` | Dev-only (route not registered when `NODE_ENV === 'production'`) | Synthesises a `JOB_SUCCEEDED` Pub/Sub envelope and invokes `TranscoderEventsController` in process. |
| `POST` | `/api/internal/fake-transcoder/fail/:videoId` | Dev-only | Same, for `JOB_FAILED`. Body accepts optional `{ reason: string }`. |

### 2.2 Modified endpoints

| Verb | Path | Change |
|---|---|---|
| `POST` | `/api/videos/:vid/upload-complete` | After HEAD verify: ffprobe source, generate AES-128 key, submit transcoder job (3× retry, backoff 1 s / 2 s / 4 s), advance state to `TRANSCODING` (or `FAILED` on probe/submit failure) inside the same Firestore transaction. Response shape unchanged; `Video.state` is `TRANSCODING` or `FAILED` on success, never `UPLOADED`. |
| `DELETE` | `/api/videos/:vid` | State guard widens to also accept `TRANSCODING` and `READY`. On `TRANSCODING`: `transcoder.cancelJob(jobName)` best-effort. On `READY`: recursive output-bucket delete under `videos/{videoId}/` best-effort. `VideoKey` doc deletion is unconditional. |

### 2.3 Pub/Sub event format

Outer Pub/Sub push envelope (Google standard):

```ts
interface PubSubPushBody {
  message: {
    data: string;                          // base64 JSON of the inner payload
    messageId: string;
    publishTime: string;                   // ISO date
    attributes?: Record<string, string>;
  };
  subscription: string;                    // 'projects/<proj>/subscriptions/<sub>'
}
```

Inner payload (GCP Transcoder API job state event):

```ts
interface TranscoderJobStatePayload {
  job: {
    name: string;                          // 'projects/.../locations/.../jobs/<jobId>'
    state: 'SUCCEEDED' | 'FAILED';
    labels: { videoId: string };           // we set this at submit time
    output: { uri: string };               // 'gs://<output-bucket>/videos/{videoId}/hls/'
    error?: { code: number; message: string };
  };
  eventTime: string;                       // ISO date
}
```

`labels.videoId` is the correlation key. The webhook handler looks up `videos/{videoId}` directly, defensively verifies `Video.transcoderJobName === job.name`, then transitions.

### 2.4 `TranscoderEvent` envelope

`VideoTranscoder.parseEvent(rawPubSubMessage)` returns:

```ts
type TranscoderEvent =
  | {
      type: 'JOB_SUCCEEDED';
      jobName: string;
      videoId: VideoId;
      manifestPath: string;                // 'videos/{videoId}/hls/manifest.m3u8'
      durationSec: number;                 // obtained via transcoderClient.getJob(jobName)
    }
  | {
      type: 'JOB_FAILED';
      jobName: string;
      videoId: VideoId;
      reason: string;                      // payload.job.error.message; sliced to 500 chars
    };
```

`parseEvent` for `JOB_SUCCEEDED` makes one `getJob(jobName)` call to obtain `durationSec` from the Transcoder Job resource. If `getJob` throws, `parseEvent` propagates — the webhook controller maps the throw to 5xx so Pub/Sub retries.

### 2.5 Guards and request augmentation

The codebase has no global guards — every controller class opts into its own guards (slice A's `VideoController` is class-decorated `@UseGuards(FirebaseSessionGuard, InstructorRoleGuard)`; the auth controller leaves registration / login routes guard-free). The webhook and fake-transcoder routes are therefore placed on **separate controller classes** in the new `webhook/` submodule, with their own (different) guard wiring. No `@Public()` decorator is introduced; no global guard exists to opt out of.

`/api/internal/transcoder-events` (on `TranscoderEventsController`):
1. Class-decorated `@UseGuards(PubSubPushGuard)`. `PubSubPushGuard` (new in `libs/api-video/src/lib/webhook/`) verifies `Authorization: Bearer <token>`:
   - Issuer claim === `https://accounts.google.com`
   - Audience claim === `LEARNWREN_TRANSCODER_WEBHOOK_AUDIENCE`
   - Email claim === `LEARNWREN_TRANSCODER_INVOKER_SA_EMAIL`
   - Not expired
   Verification done via `google-auth-library`'s `OAuth2Client.verifyIdToken`.
2. No `FirebaseSessionGuard`, no `InstructorRoleGuard`. The controller class never registers them.

`/api/internal/fake-transcoder/{complete,fail}/:vid` (on `FakeTranscoderController`):
- The controller class is conditionally included in `ApiVideoModule.controllers` only when `process.env.NODE_ENV !== 'production'`. Production builds never expose these.
- No auth guard. The dev-only registration is the only protection.

Slice A's `VideoController` is unchanged — `FirebaseSessionGuard`, `InstructorRoleGuard`, `VideoOwnerGuard` remain on `/api/videos/:vid/*` and the lesson-scoped upload-session route. No guard changes on existing routes.

### 2.6 Error contract additions

Extends slice A §2.5.

| HTTP | `code` | When |
|---|---|---|
| 401 | `PUBSUB_INVALID_TOKEN` | Webhook: OIDC JWT missing / expired / wrong issuer. |
| 403 | `PUBSUB_WRONG_AUDIENCE` | Webhook: audience claim doesn't match `LEARNWREN_TRANSCODER_WEBHOOK_AUDIENCE`. |
| 403 | `PUBSUB_WRONG_INVOKER` | Webhook: email claim doesn't match `LEARNWREN_TRANSCODER_INVOKER_SA_EMAIL`. |
| 200 | _(no code; structured log only)_ | Webhook: idempotent no-op — `VIDEO_NOT_FOUND`, `JOB_NAME_MISMATCH`, `ALREADY_APPLIED`, `WRONG_STATE`. |
| 500 | _(no body)_ | Webhook: transient downstream throw (Firestore unavailable, `getJob` failure). Pub/Sub retries. |
| n/a | `TRANSCODER_SUBMIT_FAILED` | Stored in `Video.failureReason` when upload-complete exhausts 3 submit retries. Handler responds 200 with `Video.state === 'FAILED'` body. |
| n/a | `SOURCE_PROBE_FAILED` | Stored in `Video.failureReason` when `ffprobe` against the source fails. Handler responds 200 with `Video.state === 'FAILED'` body. |
| n/a | `TRANSCODE_FAILED: <message>` | Stored in `Video.failureReason` when the webhook handles a `JOB_FAILED` event. |

The webhook deliberately uses three response classes — 4xx, 200, 5xx — to drive Pub/Sub's behaviour:
- 4xx → Pub/Sub gives up (auth misconfiguration; we never want a forged event retried).
- 200 → Pub/Sub acknowledges (poison-pill drop, idempotent no-op).
- 5xx → Pub/Sub retries with exponential backoff up to the topic's `--max-delivery-attempts=5`, then dead-letters.

## 3. Data Layer

### 3.1 Type additions

No new types in `libs/shared-data-models`. Slice A already added `Video`, `VideoKey`, `VideoState`, `VideoId`, `VideoKeyId`. Slice B writes additional fields the types already permit:

- `Video.keyId` ← set at upload-complete submission.
- `Video.transcoderJobName` ← set at upload-complete submission.
- `Video.output: { bucket, manifestPath, durationSec }` ← set on `JOB_SUCCEEDED` event.
- `Video.failureReason` ← set on `SOURCE_PROBE_FAILED`, `TRANSCODER_SUBMIT_FAILED`, or `TRANSCODE_FAILED`.
- `VideoKey.key` (base64 string of 16 random bytes) ← set at upload-complete submission.

### 3.2 Firestore document layout

Unchanged from slice A. `videos/{videoId}` and `videoKeys/{keyId}` are top-level collections; both deny-all from the client.

### 3.3 Firestore security rules

Unchanged from slice A. The existing rules-unit suite for `videos/**` and `videoKeys/**` deny-all continues to assert correctness; no new rules tests are required.

### 3.4 Firestore indexes

No new indexes. The webhook correlates by `videoId` from `job.labels.videoId` and loads `videos/{videoId}` directly. The slice A collection-group index on `lessonId` remains for the cascade cleanup entry point.

## 4. Library Structure

### 4.1 `libs/api-video` additions

```
libs/api-video/src/lib/
├── (existing slice A files, unchanged surface)
│   api-video.module.ts                       # MODIFIED — registers VideoTranscoder factory
│   video.controller.ts                       # MODIFIED — upload-complete response state
│   video.service.ts                          # MODIFIED — finalizeUpload + deleteVideoAndDetach + new methods
│   video.repository.ts                       # MODIFIED — VideoKey CRUD additions
│   video.config.ts                           # MODIFIED — new env vars
│   …
│
├── transcoder/                                # NEW submodule
│   ├── transcoder.port.ts                    # VideoTranscoder interface + TranscoderEvent envelope
│   ├── transcoder-job.builder.ts             # pure: JobConfig from inputs + sourceHeight
│   ├── transcoder-job.builder.spec.ts
│   ├── gcp-transcoder.adapter.ts             # @google-cloud/video-transcoder client
│   ├── gcp-transcoder.adapter.spec.ts
│   ├── fake-transcoder.adapter.ts            # in-memory; submitJob is a no-op
│   └── fake-transcoder.adapter.spec.ts
│
└── webhook/                                   # NEW submodule
    ├── pubsub-push.guard.ts                  # OIDC JWT verify
    ├── pubsub-push.guard.spec.ts
    ├── transcoder-events.controller.ts       # POST /api/internal/transcoder-events
    ├── transcoder-events.controller.spec.ts
    ├── fake-transcoder.controller.ts         # dev-only routes; conditionally registered
    └── fake-transcoder.controller.spec.ts
```

### 4.2 `libs/api-video` module factory

```ts
// api-video.module.ts (sketch)
@Module({
  providers: [
    VideoService,
    VideoRepository,
    VideoStorageAdapter,
    {
      provide: VIDEO_TRANSCODER,
      useFactory: (config: VideoConfig) =>
        config.transcoderImpl === 'fake'
          ? new FakeTranscoderAdapter()
          : new GcpTranscoderAdapter({
              client: new TranscoderServiceClient(),
              projectId: config.gcpProjectId,
              location: config.transcoderLocation,
              outputBucket: config.outputBucket,
              topic: config.transcoderTopic,
            }),
      inject: [VIDEO_CONFIG],
    },
  ],
  controllers: [
    VideoController,
    TranscoderEventsController,
    ...(process.env.NODE_ENV !== 'production' ? [FakeTranscoderController] : []),
  ],
})
export class ApiVideoModule {}
```

The env validator in `video.config.ts` enforces:
- `LEARNWREN_VIDEO_TRANSCODER === 'fake'` is rejected when `NODE_ENV === 'production'`.
- All GCP-prefixed vars are required when `LEARNWREN_VIDEO_TRANSCODER === 'gcp'`.

### 4.3 `VideoTranscoder` port — deviations from architecture spec §3.2

The architecture spec sketched the port as:

```ts
export interface VideoTranscoder {
  submitJob(input: TranscoderJobInput): Promise<TranscoderJobHandle>;
  parseEvent(rawPubSubMessage: unknown): TranscoderEvent;
}
```

Slice B requires two changes:

1. **`parseEvent` becomes async** — `Promise<TranscoderEvent>`. Reason: the GCP Transcoder API Pub/Sub event does not carry output duration; obtaining it for `JOB_SUCCEEDED` requires a `transcoderClient.getJob(jobName)` call. `GcpTranscoderAdapter.parseEvent` makes that call internally; `FakeTranscoderAdapter.parseEvent` returns synchronously inside an `async` wrapper. Webhook controller awaits.
2. **`cancelJob(jobName: string): Promise<void>` is added** — the widened DELETE state guard (§7 item 14) requires best-effort job cancellation when a `TRANSCODING` video is deleted. `GcpTranscoderAdapter.cancelJob` calls `TranscoderServiceClient.cancelJob` with not-found tolerance; `FakeTranscoderAdapter.cancelJob` is a no-op.

These are amendments to the architecture spec, not violations. A small follow-up edit to `2026-05-13-video-pipeline-architecture-design.md` §3.2 to reflect the final port shape lands as part of slice B's commit; the architecture-spec §10 "Open Questions" already noted "single MVP implementation: GcpTranscoderAdapter" — slice B is filling in that implementation and discovering the port needed two more methods than the sketch had.

### 4.4 `libs/api-courses` and `libs/api-auth`

Unchanged. The cascade entry point `VideoService.deleteForLesson(lessonId)` already exists from slice A. Slice B's widened DELETE state guard is internal to `VideoService.deleteVideoAndDetach`, transparent to the cascade caller.

### 4.5 `libs/web-video` additions

```
libs/web-video/src/lib/
├── (existing slice A files)
│   video-state-badge.component.ts           # MODIFIED — copy for TRANSCODING/READY/FAILED
│   video-state-badge.component.html         # MODIFIED — render conditional on state
│   video.service.ts                         # UNCHANGED — get/delete already there
│   upload/                                  # UNCHANGED
│
└── polling/                                  # NEW submodule
    ├── video-state-polling.service.ts       # RxJS timer + switchMap; 5 s interval; 30-min cap
    └── video-state-polling.service.spec.ts
```

The badge component injects `VideoStatePollingService` and starts the loop in `ngOnInit`; the loop self-disposes on terminal state or component destroy. `LessonItem` in `libs/web-courses` is unchanged — it still renders the badge as a black box.

### 4.6 Nx graph

```
libs/api-video           ← grows transcoder/ + webhook/ submodules
   ↑
libs/api-courses         ← unchanged edge to api-video
   ↑
libs/api-auth            ← unchanged
   ↑
libs/shared-data-models  ← unchanged

libs/web-video           ← grows polling/ submodule
   ↑
libs/web-courses         ← unchanged edge
```

No new lib-to-lib edges.

## 5. Bucket Layout, IAM, and Provisioning

### 5.1 Output bucket

| Property | Value |
|---|---|
| Name | `${project}-video-output` (e.g., `learn-wren-video-output-dev`) |
| Tier | Standard |
| Public access | None — Uniform bucket-level access enabled |
| Versioning | Disabled |
| Lifecycle | None in slice B; orphan cleanup is slice F |
| Object paths | `videos/{videoId}/hls/manifest.m3u8`; `videos/{videoId}/hls/{rendition}/segment_NNN.ts` |

Provisioned out of band, same convention as the slice A source bucket. Not managed by `firebase.json`.

### 5.2 IAM bindings

| Service Account | Resource | Role |
|---|---|---|
| Cloud Functions runtime SA (existing) | Output bucket | `roles/storage.objectAdmin` (slice C signed URLs; slice B DELETE cleanup) |
| Cloud Functions runtime SA | Project, scoped to Transcoder API | `roles/transcoder.admin` (submitJob, getJob, cancelJob) |
| Transcoder service agent (`service-<projectNumber>@gcp-sa-transcoder.iam.gserviceaccount.com`) | Source bucket | `roles/storage.objectViewer` |
| Transcoder service agent | Output bucket | `roles/storage.objectCreator` |
| Dedicated invoker SA (new — `learn-wren-transcoder-invoker@<project>.iam.gserviceaccount.com`) | Cloud Function HTTPS trigger | `roles/cloudfunctions.invoker` (or `roles/run.invoker` for Functions Gen2) |

### 5.3 Pub/Sub provisioning runbook

Slice B ships a new doc `docs/operations/transcoder-pubsub-setup.md` with the one-time setup runbook. Summary commands (full version in the doc):

```bash
PROJECT_ID=learn-wren-dev
ENV=dev
LOCATION=us-central1
FUNCTION_URL=https://${LOCATION}-${PROJECT_ID}.cloudfunctions.net/api
INVOKER_SA=learn-wren-transcoder-invoker@${PROJECT_ID}.iam.gserviceaccount.com
PROJECT_NUMBER=$(gcloud projects describe ${PROJECT_ID} --format='value(projectNumber)')

# 1. Topic
gcloud pubsub topics create learn-wren-transcoder-events-${ENV}

# 2. Dead-letter topic + pull subscription for triage
gcloud pubsub topics create learn-wren-transcoder-events-${ENV}-deadletter
gcloud pubsub subscriptions create learn-wren-transcoder-events-${ENV}-deadletter-sub \
  --topic=learn-wren-transcoder-events-${ENV}-deadletter

# 3. Invoker SA
gcloud iam service-accounts create learn-wren-transcoder-invoker \
  --display-name="Learn Wren Transcoder Pub/Sub Invoker"

# 4. Grant invoker SA the right to invoke the API function
gcloud functions add-iam-policy-binding api \
  --region=${LOCATION} \
  --member="serviceAccount:${INVOKER_SA}" \
  --role="roles/cloudfunctions.invoker"

# 5. Push subscription with OIDC token + dead-letter
gcloud pubsub subscriptions create learn-wren-transcoder-events-${ENV}-sub \
  --topic=learn-wren-transcoder-events-${ENV} \
  --push-endpoint="${FUNCTION_URL}/api/internal/transcoder-events" \
  --push-auth-service-account="${INVOKER_SA}" \
  --push-auth-token-audience="${FUNCTION_URL}/api/internal/transcoder-events" \
  --dead-letter-topic=learn-wren-transcoder-events-${ENV}-deadletter \
  --max-delivery-attempts=5 \
  --min-retry-delay=10s \
  --max-retry-delay=600s \
  --ack-deadline=60

# 6. Grant Transcoder service agent the buckets
gcloud storage buckets add-iam-policy-binding gs://${PROJECT_ID}-video-source \
  --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-transcoder.iam.gserviceaccount.com" \
  --role="roles/storage.objectViewer"
gcloud storage buckets add-iam-policy-binding gs://${PROJECT_ID}-video-output \
  --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-transcoder.iam.gserviceaccount.com" \
  --role="roles/storage.objectCreator"
```

The topic name is wired into each job via `JobConfig.config.pubsubDestination` at submit time — there is no global Transcoder API setting that needs separate provisioning.

### 5.4 Environment variables

Added to `.env.tpl` at the repo root and rendered via the existing `pnpm secrets:render` (which runs `op inject -i .env.tpl -o .env`):

| Variable | Example | Used by |
|---|---|---|
| `LEARNWREN_VIDEO_OUTPUT_BUCKET` | `learn-wren-video-output-dev` | `GcpTranscoderAdapter`, slice C signed URLs |
| `LEARNWREN_VIDEO_TRANSCODER` | `gcp` (prod) / `fake` (dev/CI) | `api-video.module` factory |
| `LEARNWREN_GCP_PROJECT_ID` | `learn-wren-dev` | `GcpTranscoderAdapter` |
| `LEARNWREN_TRANSCODER_LOCATION` | `us-central1` | `GcpTranscoderAdapter` |
| `LEARNWREN_TRANSCODER_TOPIC` | `projects/learn-wren-dev/topics/learn-wren-transcoder-events-dev` | `GcpTranscoderAdapter` (`pubsubDestination`) |
| `LEARNWREN_TRANSCODER_WEBHOOK_AUDIENCE` | `https://us-central1-learn-wren-dev.cloudfunctions.net/api/api/internal/transcoder-events` | `PubSubPushGuard` |
| `LEARNWREN_TRANSCODER_INVOKER_SA_EMAIL` | `learn-wren-transcoder-invoker@learn-wren-dev.iam.gserviceaccount.com` | `PubSubPushGuard` |
| `LEARNWREN_WEB_VIDEO_POLL_INTERVAL_MS` | `5000` | `VideoStatePollingService` |

Slice A's `LEARNWREN_VIDEO_STUCK_THRESHOLD_MINUTES` (default 30) is reused for `TRANSCODING` stuck-state UX.

## 6. Transcoder Job Configuration

### 6.1 Rendition ladder

Locked at the `TranscoderJobBuilder` level:

```ts
const RENDITIONS = [
  { name: '1080p', height: 1080, bitrateBps: 5_000_000 },
  { name: '720p',  height:  720, bitrateBps: 3_000_000 },
  { name: '480p',  height:  480, bitrateBps: 1_500_000 },
  { name: '360p',  height:  360, bitrateBps:   800_000 },
] as const;
const SEGMENT_DURATION_S = 6;
const KEY_FRAME_INTERVAL_S = 2;
const AUDIO_BITRATE_BPS = 128_000;
const VIDEO_CODEC = 'h264';
const AUDIO_CODEC = 'aac';
const HLS_SEGMENT_FORMAT = 'ts';     // MPEG-TS, not fMP4 — maximum hls.js compatibility for slice C
```

### 6.2 Skip-upscale rule

Architecture spec §9.1 mandates that a 480p source produces only 480p + 360p outputs. The builder honours this by filtering renditions whose `height > sourceHeight`. Source height is obtained via `ffprobe` against the source object before submission (see §6.3).

```ts
function buildJobConfig(input: {
  videoId: VideoId;
  sourceUri: string;
  outputUriPrefix: string;
  encryptionKey: { id: string; bytes: Uint8Array };
  sourceHeight: number;
  topic: string;
}): JobConfig {
  const renditions = RENDITIONS.filter(r => r.height <= input.sourceHeight);
  // …emit JobConfig with elementaryStreams + muxStreams per rendition,
  //   pubsubDestination = input.topic,
  //   encryption.aes128 = { key bytes, keyUri = placeholder rewritten by slice C },
  //   labels.videoId = input.videoId
}
```

The HLS `EXT-X-KEY` `URI` attribute embedded by Transcoder API is a static placeholder (e.g., `https://example.invalid/keys/{videoId}`) — slice C's manifest endpoint rewrites it to the real authenticated key endpoint at serve time. Slice B does not need a key endpoint to exist.

### 6.3 ffprobe source probe

A new dependency: `@ffprobe-installer/ffprobe` (bundled binary ~30 MB; well within Cloud Functions' 500 MB unzipped limit). Invoked from `VideoStorageAdapter.probeSource(bucket, path)` via child_process against a short-TTL (60 s) signed read URL on the source object. Returns `{ height: number; durationSec: number }`. Adds ~500 ms latency to the upload-complete handler.

`durationSec` from the probe is **not** used as the authoritative output duration; we use the Transcoder Job resource's output duration from `getJob` in `parseEvent` instead. The probe value is recorded for observability (`Video.source.probedDurationSec` — optional, see below) but not for playback.

**Optional probe-field addition to `Video.source`:** to avoid leaking the probe value into `Video.output` (which is reserved for transcoder output), `Video.source` gains an optional `probedDurationSec?: number` field — a minor type addition to `libs/shared-data-models`. If we prefer no type churn, the probe duration is discarded and only `height` is used. Locked decision in §7 item 7: discard the probe duration; only `height` is used. No `shared-data-models` change.

### 6.4 ffprobe failure handling

If `ffprobe` throws or returns invalid output, the upload-complete handler advances `Video.state` to `FAILED` with `failureReason='SOURCE_PROBE_FAILED'` inside the same Firestore transaction. No transcoder job is submitted. Instructor sees the FAILED badge immediately. Recovery is delete + re-upload (matches architecture spec §9.2).

## 7. Locked Decisions

1. **UI scope for slice B is backend + minimal badge update.** No player; no manifest endpoints; no key endpoints. Slice C owns playback.
2. **State refresh is short-interval polling.** Editor polls `GET /api/videos/:vid` every 5 s while state ∈ `{ UPLOADED, TRANSCODING }`. Stops on terminal state, 30-minute hard cap, or component destroy. Firestore rules stay deny-all.
3. **Webhook failure policy: 5xx triggers Pub/Sub redelivery, capped at 5 attempts via topic config, with a dead-letter topic outlet.** 4xx for auth failures (Pub/Sub gives up); 200 for known no-ops; 5xx for transient throws.
4. **Job submission is inline in `POST /upload-complete`.** Same handler, same transaction. No Firestore-trigger Cloud Function. No internal Pub/Sub for the upload→transcode handoff.
5. **Bitrate ladder is pinned in `TranscoderJobBuilder`.** 1080p @ 5 Mbps, 720p @ 3 Mbps, 480p @ 1.5 Mbps, 360p @ 800 Kbps, audio @ 128 Kbps AAC, 6 s segments, 2 s key-frame interval, H.264, HLS TS segments.
6. **Pub/Sub topic + invoker SA + push subscription + dead-letter are manually provisioned per-environment via the documented runbook.** No Terraform in slice B.
7. **Source ffprobe runs in the upload-complete handler before submission.** Only `height` is consumed (for the skip-upscale filter); the probe's `durationSec` is discarded. Authoritative output duration comes from `transcoderClient.getJob` in `parseEvent`.
8. **Local dev uses `FakeTranscoderAdapter` + dev-only simulator routes.** `LEARNWREN_VIDEO_TRANSCODER=fake` selects the fake; env validator rejects `fake` in production. `POST /api/internal/fake-transcoder/{complete,fail}/:videoId` synthesises Pub/Sub envelopes and invokes the real webhook controller in process.
9. **AES-128 key stored as raw base64 in `videoKeys/{keyId}.key`.** No KMS wrap in MVP (architecture spec §6 defers it).
10. **Submit-fail policy is 3× retry with backoff, then `Video.state → FAILED` with `failureReason='TRANSCODER_SUBMIT_FAILED'`.** The transaction commits the FAILED state; the handler responds 200 with the FAILED Video.
11. **ffprobe failure → `Video.state → FAILED`, `failureReason='SOURCE_PROBE_FAILED'`.** No retry; recovery is delete + re-upload.
12. **`upload-complete` response type now allows `state: 'TRANSCODING'` and `state: 'FAILED'` in addition to slice A's other terminals.** Slice B's `web-video` handles both.
13. **`getJob` is called from inside `parseEvent` to obtain authoritative output `durationSec`.** Failure of `getJob` propagates as 5xx (Pub/Sub retries).
14. **DELETE state guard widens to `{ PENDING_UPLOAD, UPLOADED, FAILED, TRANSCODING, READY }`.** Cancel + bucket cleanup are best-effort.
15. **Submodule layout: `transcoder/` and `webhook/` subfolders inside `libs/api-video/src/lib/`.** Slice A files stay at the lib root.
16. **`VideoStatePollingService` lives in `libs/web-video`; the badge component owns its own polling loop.** Slice C will replace or repurpose at that time.
17. **Stuck-state for `TRANSCODING` reuses slice A's 30-minute threshold env var.** Badge copy: "Transcoding may have stalled — delete and re-upload?".
18. **HLS segments are MPEG-TS, not fMP4.** Maximum hls.js compatibility for slice C; cheap to revisit later if Widevine/CMAF migration demands it.
19. **No new Firestore indexes.** Webhook correlates via `job.labels.videoId`.
20. **No Firestore rules changes.** Deny-all stays. Polling is the read-path.

## 8. Failure Modes Summary

| Failure | Where | Observable | Persisted state |
|---|---|---|---|
| Source bytes never arrive | (slice A path) | 422 `UPLOAD_OBJECT_MISSING` from upload-complete | stays `PENDING_UPLOAD` |
| Source object size mismatch | (slice A path) | 422 `UPLOAD_OBJECT_SIZE_MISMATCH` | stays `PENDING_UPLOAD` |
| `ffprobe` fails | upload-complete handler (slice B) | 200 with FAILED Video; badge shows failure | `FAILED`, `failureReason='SOURCE_PROBE_FAILED'` |
| `transcoder.submitJob` fails 3× | upload-complete handler (slice B) | 200 with FAILED Video; badge shows failure | `FAILED`, `failureReason='TRANSCODER_SUBMIT_FAILED: <last error>'` |
| Transcoder job itself fails | Webhook handler | Badge transitions to failure after next poll | `FAILED`, `failureReason='TRANSCODE_FAILED: <error.message>'` |
| Pub/Sub event lost (never delivered) | Operational | Stuck-state badge after 30 minutes; manual triage via dead-letter | stays `TRANSCODING` (no reconciliation in slice B) |
| Pub/Sub event poison-pilled | Webhook handler | 200 + structured log; subsequent events flow | unchanged |
| Webhook auth misconfigured | `PubSubPushGuard` | 401/403 from every delivery; dead-letter accumulates | unchanged |
| Webhook handler throws unexpectedly | Controller | 5xx; Pub/Sub retries up to 5× then dead-letters | unchanged until success |
| `getJob` for duration throws | `parseEvent` | Propagates as 5xx | unchanged until success |
| Output-bucket delete fails on DELETE | `deleteVideoAndDetach` | Logged; Firestore cleanup still completes | doc deleted; orphan objects in output bucket (slice F cleanup) |
| `cancelJob` fails on DELETE | `deleteVideoAndDetach` | Logged; Firestore cleanup still completes | doc deleted; transcoder job may still complete and dead-letter (no longer points anywhere) |

## 9. Testing

| Layer | Where | Coverage |
|---|---|---|
| Unit (Vitest, mocked Firestore + Storage + Transcoder client) | `libs/api-video/src/lib/**/*.spec.ts` | `TranscoderJobBuilder` (rendition filtering by sourceHeight, AES-128 config inclusion, Pub/Sub destination wiring, segment + key-frame interval, audio config, labels.videoId); `GcpTranscoderAdapter.submitJob` (mocked `TranscoderServiceClient.createJob`, labels include `videoId`, encryption key bytes passed correctly, retry semantics); `GcpTranscoderAdapter.parseEvent` (decode happy path; calls `getJob` for duration; throws on missing `labels.videoId`; throws on `getJob` failure); `GcpTranscoderAdapter.cancelJob` (mocked client, ignore-not-found semantics); `FakeTranscoderAdapter` (submitJob is no-op; parseEvent passes through; cancelJob no-op); `PubSubPushGuard` (issuer/audience/SA-email/expiry; 401 on missing token; 403 on wrong audience; 403 on wrong invoker; verifies via `OAuth2Client.verifyIdToken` mock); `TranscoderEventsController.handle` (acted=true → 204; each `reason` value → 200 + log; throw → propagates to 5xx); `FakeTranscoderController` (dev-only registration: not present when `NODE_ENV=production`; synthesises envelope; calls `TranscoderEventsController` in process); `VideoService.generateKeyAndSubmitJob` (AES random source, key persistence, retry 3× with backoff, FAILED on exhaust); `VideoService.handleTranscoderEvent` (READY transition; FAILED transition; ALREADY_APPLIED no-op; JOB_NAME_MISMATCH no-op; WRONG_STATE no-op; VIDEO_NOT_FOUND no-op); extended `deleteVideoAndDetach` (TRANSCODING + `cancelJob`; READY + output-bucket cleanup; bucket-delete and cancelJob failures swallowed); extended `finalizeUpload` (ffprobe call, source probe failure → FAILED, happy path → TRANSCODING + keyId + transcoderJobName written transactionally). |
| Component (Vitest + Angular utilities) | `libs/web-video/src/lib/**/*.spec.ts` | `VideoStatePollingService` (polls at configured interval; stops on READY; stops on FAILED; stops on 30-min cap; stops on destroy; backoff on transient HTTP errors); `VideoStateBadgeComponent` copy for each state including stuck-state for TRANSCODING; integration with polling service via `HttpTestingController`. |
| Firestore rules | existing rules-tests suite | No new tests (rules unchanged). Verify slice A's `videos/**` + `videoKeys/**` deny-all suite still passes. |
| API e2e (Firebase + Storage emulators, **fake adapter**) | `apps/api-e2e/src/**/*.e2e-spec.ts` | Happy path: register → promote → create course/module/lesson → upload-session → PUT chunks → upload-complete → assert `Video.state === 'TRANSCODING'` + `keyId` + `transcoderJobName` populated + `VideoKey` doc exists with base64 16-byte key; POST `/api/internal/fake-transcoder/complete/:vid` → assert next GET reports `Video.state === 'READY'` + output fields populated. Failure branch via `/fail/:vid` → `FAILED` + `failureReason`. Webhook auth: envelope without token → 401; wrong audience → 403; wrong invoker → 403. Idempotency: invoke fake-completer twice → second call leaves state untouched (200 + log). Stale event: delete the video, then invoke fake-completer → 200 + log (`VIDEO_NOT_FOUND`). Cross-instructor isolation: second instructor cannot DELETE first's TRANSCODING/READY video. Cascade delete: delete lesson with READY video → output bucket cleared, Video and VideoKey docs gone. ffprobe failure path: register, upload a fixture intentionally crafted to fail probe (or stub probe to throw) → upload-complete returns FAILED. Submit-fail path: fake adapter configured to throw on `submitJob` 3× → upload-complete returns FAILED. |
| Web e2e (Playwright, **fake adapter end-to-end**) | `apps/web-e2e/src/**/*.spec.ts` | Instructor signs in → uploads ~1 MB MP4 fixture → badge transitions through Uploaded→Preparing→Processing (verify polling activity via route interception count) → test calls `/api/internal/fake-transcoder/complete/:vid` directly → badge transitions to "Ready to publish" within ≤ 6 s (one poll cycle); failure branch ends in "Transcoding failed — delete and re-upload"; stuck-state e2e with reduced `LEARNWREN_VIDEO_STUCK_THRESHOLD_MINUTES`. |
| Mutation (Stryker) | `libs/api-video` | ≥ 85 % effective score (parity with slice A bar). Raw Stryker output lands in `reports/mutation/api-video/mutation.{html,json}` (slice A's `api-video` directory already exists per commit `4be21ab`; slice B refreshes it). Triage notes are folded into the existing `docs/quality/mutation-report.md` summary, matching the slice A precedent — no per-lib triage file. New surface area mutated: webhook controller, `PubSubPushGuard`, `GcpTranscoderAdapter`, `TranscoderJobBuilder`, `FakeTranscoderAdapter`, `VideoService.{generateKeyAndSubmitJob, handleTranscoderEvent}`, extended `finalizeUpload` + `deleteVideoAndDetach`. |
| CRAP score | existing tooling (`tools/crap/crap.mjs`) | Refresh `docs/quality/crap-report.md` to cover the new files in `libs/api-video` and the new `polling/` submodule in `libs/web-video`. |

**Fixture management:** slice A's `apps/api-e2e/src/fixtures/small-video.mp4` is reused. `ffprobe` failure tests use either an intentionally-malformed file or a stubbed `VideoStorageAdapter.probeSource` (test-time injection); chosen at implementation time. No new fixtures required.

**`@google-cloud/video-transcoder` mocking:** `GcpTranscoderAdapter` takes a `TranscoderServiceClient` instance via constructor injection (created by the module factory). Tests instantiate the adapter with a mock client object satisfying the surface we use (`createJob`, `getJob`, `cancelJob`). Same pattern slice A used for `@google-cloud/storage`.

**Auth wiring for webhook route:** `TranscoderEventsController` is a separate controller class with class-level `@UseGuards(PubSubPushGuard)` and no session guard. The codebase has no global `FirebaseSessionGuard`; per-controller opt-in is the existing pattern (see slice A's `VideoController` class-level `@UseGuards(FirebaseSessionGuard, InstructorRoleGuard)` and `AuthController`'s guard-free registration routes).

**api-e2e auth flake mitigation:** the memory note about `api-e2e auth happy-path is flaky` (race on `users/{uid}` write/read after register→session) is on slice B's upload-related tests, inherited from slice A. Webhook tests don't need a session and are unaffected. Slice B is no more flaky than slice A.

## 10. Acceptance Bar

Before slice B is "done":

1. Unit, component, rules (unchanged), API e2e, and web e2e suites all pass for `libs/api-video` and `libs/web-video`. No regression in `api-auth`, `api-courses`, `web-auth`, `web-courses`, or slice A's tests.
2. Mutation score on `libs/api-video` ≥ 85 % effective; raw output in `reports/mutation/api-video/mutation.{html,json}` refreshed; triage notes folded into `docs/quality/mutation-report.md` summary (matches slice A precedent). Mutation score on `libs/api-courses` does not regress relative to its slice-A baseline.
3. `docs/quality/crap-report.md` refreshed to cover the new files in `libs/api-video` and the new `polling/` submodule in `libs/web-video`.
4. Manual run-through against the dev Firebase project (real GCP Transcoder API, real Pub/Sub, real buckets):
   - Promoted instructor uploads a small (~10 MB) MP4; observe transition Uploaded → TRANSCODING → READY within ~3 minutes; output bucket contains `videos/{vid}/hls/manifest.m3u8` + segment files; `VideoKey` doc exists with base64 16-byte key.
   - Instructor uploads a corrupted or unsupported MKV; observe transition to `FAILED` with a sensible `failureReason`.
   - Delete a lesson with a `READY` video; verify output bucket objects under `videos/{vid}/` removed, `Video` doc gone, `VideoKey` doc gone, source bucket object removed.
   - Delete a lesson while video is mid-`TRANSCODING`; verify `cancelJob` was called and the lesson + Video doc are cleared.
   - Verify Pub/Sub dead-letter subscription is empty after the run.
   - Re-deliver a captured Pub/Sub event manually (`gcloud pubsub topics publish ...`); verify webhook responds 200 and `Video.state` stays at terminal.
   - Stuck-state UX: set `LEARNWREN_VIDEO_STUCK_THRESHOLD_MINUTES=0` in dev; observe the "Transcoding may have stalled" badge appearing for any `TRANSCODING` video; DELETE clears it.
5. CI is green end-to-end with `LEARNWREN_VIDEO_TRANSCODER=fake`. Production env validator rejects `fake` at boot.
6. `docs/operations/transcoder-pubsub-setup.md` exists with the provisioning runbook.
7. README status banner updated: "EP-03 slice B (Transcoding + AES-128) complete; owner playback deferred to slice C."
8. Spec status moves from Draft to Approved after stakeholder review.

## 11. Open Questions

None at design time. All scope dimensions resolved during brainstorming and recorded in §7. Specifically resolved:

- UI scope for slice B? → backend + minimal badge update (§7 item 1)
- State refresh model? → 5 s polling (§7 item 2)
- Webhook failure policy? → 5xx + dead-letter, 200 on no-op, 4xx on auth (§7 item 3)
- Job-submission trigger? → inline in upload-complete handler (§7 item 4)
- Bitrate ladder explicit? → yes; pinned values (§7 item 5)
- Pub/Sub provisioning? → manual `gcloud` runbook (§7 item 6)
- Skip-upscale handling? → `ffprobe` source probe (§7 item 7)
- Local dev model? → `FakeTranscoderAdapter` + dev-only simulator routes (§7 item 8)
- Key storage shape? → raw base64 in `videoKeys/` (§7 item 9)
- Submit-fail policy? → 3× retry then `FAILED` (§7 item 10)
- ffprobe-fail policy? → `FAILED`; recovery is re-upload (§7 item 11)
- `upload-complete` response state change? → returns `TRANSCODING`/`FAILED`, never `UPLOADED` (§7 item 12)
- Authoritative output duration? → `getJob` inside `parseEvent` (§7 item 13)
- DELETE on `TRANSCODING`/`READY`? → widened guard; best-effort cancel + cleanup (§7 item 14)
- Submodule layout? → `transcoder/` + `webhook/` subfolders (§7 item 15)
- Polling service ownership? → owned by `VideoStateBadgeComponent` (§7 item 16)
- TRANSCODING stuck threshold? → reuse slice A's 30-minute env var (§7 item 17)
- HLS segment format? → MPEG-TS (§7 item 18)
- New Firestore indexes? → none (§7 item 19)
- Firestore rules relaxation? → none; deny-all stays (§7 item 20)

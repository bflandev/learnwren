# Video Owner Playback — EP-03 Slice C Design Spec

> [!NOTE]
> **DOCUMENT STATUS: DRAFT**
> This document is a living specification and is subject to change. All content is considered provisional until formally approved by project stakeholders.

**Status:** Draft (2026-05-14)
**Scope:** Third implementation slice of EP-03 (Video Management and DRM). Delivers owner-only playback in the course editor — the scoped subset of UC-03-04 reachable without enrolment. After upload-complete and transcoding land a `Video` in `READY` (slice B), the lesson editor's `LessonItem` swaps its "Ready to publish" badge for a `VideoPlayerComponent` that streams the AES-128 HLS bundle from the output bucket. Three new NestJS endpoints serve the master m3u8, the per-rendition m3u8s, and the AES-128 key bytes — all behind a new `EnrollmentOrOwnerGuard` whose owner-only path ships now; the enrolled-student path is a `TODO(EP-06)` plug-point. No license server, no Widevine / PlayReady / FairPlay, no DASH (the reduced MVP DRM bar per architecture spec §6).

This spec sits on top of `2026-05-13-video-pipeline-architecture-design.md` (the architecture decision spec) and inherits its provider stack, data model, library boundaries, bucket layout, and reduced-DRM claims. It builds directly on `2026-05-13-video-upload-slice-a-design.md` (slice A — upload + `Video` lifecycle) and `2026-05-13-video-transcoding-slice-b-design.md` (slice B — Transcoder + AES-128 key + webhook + polling badge), reusing their session-cookie auth, hoisted `InstructorRoleGuard`, source/output bucket layout, fake-transcoder dev path, and one-video-per-lesson invariant. Publish gate (slice D), notifications (slice E), and soft-delete retention (slice F) remain explicitly deferred.

## Goal

A fresh clone, after `pnpm install`, `pnpm secrets:render`, the slice B GCP provisioning runbook, and a one-time `gsutil cors set` on the output bucket, must satisfy:

- A promoted instructor (`pnpm tools:promote-to-instructor`) uploads a video to a lesson, waits for slice B's badge to land on "Ready to publish", and then sees the badge replaced in-place by an inline `<video controls>` element rendering the transcoded HLS bundle.
- Clicking play starts playback within ~3 s on a standard broadband connection. Native browser controls work: play / pause / seek / volume / fullscreen.
- The same path works on desktop Safari and iOS Safari via the browser's native HLS player (no hls.js on those browsers).
- A second instructor receives `403 NOT_VIDEO_OWNER` from every playback endpoint. A student receives `403 NOT_VIDEO_OWNER` (slice C; widened to "or enrolled" in EP-06). An unauthenticated request receives `401`.
- The `<video>` element's `src` is `/api/playback/manifest/:vid` — no GCS URLs are visible in the page DOM. Segment URLs are 4 h v4-signed Cloud Storage URLs minted on every manifest fetch. The AES-128 key is served as raw bytes from `/api/playback/keys/:vid` only after the owner guard passes.
- Deleting the lesson while the player is mounted unmounts the player cleanly and triggers slice B's existing cascade (Video doc, VideoKey doc, source object, output objects). No orphan player state.
- `videos/**` and `videoKeys/**` Firestore paths stay deny-all from the client. Playback reads happen only through `libs/api-video`.
- All prior-spec quality gates pass: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e`, `pnpm start`, `pnpm emulators`, `pnpm secrets:render`, `pnpm secrets:run`. No regression in `api-auth`, `api-courses`, `web-auth`, `web-courses`, or slice A / slice B tests.
- Mutation testing on `libs/api-video` matches the slice A/B bar: ≥ 85 % effective. Raw Stryker output refreshed in `reports/mutation/api-video/`; triage summary updated in `docs/quality/mutation-report.md`. Mutation score on `libs/api-courses` does not regress.

## Non-Goals

Each owned by a named subsequent slice or epic.

- **Slice D — Publish gate.** Slice C makes `READY` observable to the instructor; consuming `state === 'READY'` in a publish-eligibility check belongs to slice D.
- **Slice E — Notifications.** No in-app or email notifications around playback events.
- **Slice F — Retention, reconciliation, replace cleanup.** No background work added.
- **Slice A.1 — Replace flow.** Still deferred.
- **Enrolled-student playback (EP-06).** `EnrollmentOrOwnerGuard` ships with the enrolled-side branch as a `TODO(EP-06)` no-op (returns false after the owner check fails). EP-06 wires the actual enrolment lookup.
- **Multi-DRM (Widevine + PlayReady + FairPlay).** Deferred. Slice C continues to ship AES-128 HLS only, no license server. The protection claims in architecture spec §6 are unchanged.
- **MPEG-DASH manifests.** Lands with multi-DRM.
- **Cloud CDN in front of Cloud Storage.** Deferred.
- **Quality picker / captions / chapters / resume position / watermarking / player telemetry.** Out of slice C. The component renders native `<video controls>` only.
- **Cross-client live state updates.** Firestore rules stay deny-all; slice B's polling badge is the read-path for non-`READY` states. Player mount/unmount is parent-driven via state.
- **API surface for the player to report playback errors back to the server.** Errors surface in the UI only.
- **Replace-on-the-fly while playing.** If the underlying `Video` is deleted mid-playback, the parent state poll (slice B's `VideoStatePollingService` — still running until terminal state) terminated on `READY`; the parent re-renders only on the next user action that re-fetches Lesson. A subsequent slice can plumb live invalidation; slice C does not.
- **Manifest caching layer.** Every playback endpoint emits `Cache-Control: no-store`. No in-process or external cache.
- **Terraform / IaC for the output bucket CORS config.** Slice C documents a one-time `gsutil cors set` runbook addition, matching the slice B precedent.

## 1. State Machine

Slice C does not write `Video.state`. It only reads, and only renders when the state is `READY`. The state machine table is unchanged from slice B; the table below records which slice C component the editor's `LessonItem` mounts for each state:

| `Video.state` | Editor render (LessonItem) | Source |
|---|---|---|
| _none_ (no `videoId` on Lesson) | `VideoUploadComponent` (slice A) | slice A |
| `PENDING_UPLOAD`, `UPLOADING` | `VideoUploadComponent` in-flight | slice A |
| `UPLOADED`, `TRANSCODING` | `VideoStateBadgeComponent` (polling) | slice B |
| `FAILED` | `VideoStateBadgeComponent` (terminal) | slice B |
| `READY` | **`VideoPlayerComponent`** (slice C) | **slice C** |

The transition from `TRANSCODING → READY` already terminates slice B's `VideoStatePollingService` loop. The parent component's re-render on that final poll response is the trigger for the badge-to-player swap.

A `Video` deleted mid-playback (via slice B's widened DELETE state guard) flips the lesson back to "no `videoId`" on the next parent re-fetch. The player unmounts; slice A's `VideoUploadComponent` mounts in its place. No new state machine entries are required for slice C.

## 2. API Surface

### 2.1 New endpoints

All three live on a new `PlaybackController` class in `libs/api-video/src/lib/playback/`, class-decorated `@UseGuards(FirebaseSessionGuard, EnrollmentOrOwnerGuard)`. The session guard is the existing `libs/api-auth` export, identical to slice A / slice B usage.

| Verb | Path | Returns | Content-Type |
|---|---|---|---|
| `GET` | `/api/playback/manifest/:vid` | Rewritten master m3u8 | `application/vnd.apple.mpegurl` |
| `GET` | `/api/playback/manifest/:vid/rendition/:r` | Rewritten rendition m3u8 | `application/vnd.apple.mpegurl` |
| `GET` | `/api/playback/keys/:vid` | Raw 16-byte AES-128 key | `application/octet-stream` |

All three respond with `Cache-Control: no-store`. The key endpoint responds with `Content-Length: 16`. The manifest endpoints set `Content-Type: application/vnd.apple.mpegurl; charset=utf-8`.

### 2.2 Path conventions

`:vid` is a `VideoId` branded string (matches slice A's `/api/videos/:vid` route).

`:r` is a rendition name: `1080p` | `720p` | `480p` | `360p`. The controller validates `:r` against a static allow-list and returns `404 RENDITION_NOT_FOUND` for any other value. The allow-list is cheaper than parsing the master m3u8 to enumerate known renditions; renditions outside the slice B ladder are by definition not transcoded.

### 2.3 Auth model and request augmentation

`FirebaseSessionGuard` is unchanged (validates the Firebase session cookie, populates `request.user`).

`EnrollmentOrOwnerGuard` is a new guard in `libs/api-video/src/lib/playback/`:

```ts
@Injectable()
export class EnrollmentOrOwnerGuard implements CanActivate {
  constructor(private readonly videos: VideoRepository) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const vid = req.params.vid as VideoId;
    const uid = req.user.uid as UserId;

    const video = await this.videos.findById(vid);
    if (!video) throw new VideoNotFoundException();
    if (video.state !== 'READY') throw new VideoNotReadyException();

    if (video.ownerInstructorId === uid) {
      req.video = video;                            // pass through to controller
      return true;
    }

    // TODO(EP-06): if (await this.enrollment.isEnrolled(uid, video.courseId)) { … }

    throw new NotVideoOwnerException();
  }
}
```

The guard attaches the loaded `Video` to `request.video` so the controller does not re-fetch. Controllers read `req.video` via a small `@CurrentVideo()` decorator (one-line wrapper around `createParamDecorator`).

### 2.4 Error contract additions

Extends slice A §2.5 / slice B §2.6.

| HTTP | `code` | When |
|---|---|---|
| 401 | _(existing)_ | No session cookie, session expired, or unrecognised user. Surfaced by `FirebaseSessionGuard`. |
| 403 | `NOT_VIDEO_OWNER` | `EnrollmentOrOwnerGuard`: requester ≠ owner (and not enrolled, once EP-06 lands). |
| 404 | `VIDEO_NOT_FOUND` | `EnrollmentOrOwnerGuard`: `videos/:vid` doc absent. |
| 404 | `RENDITION_NOT_FOUND` | Controller: `:r` outside `['1080p','720p','480p','360p']`. |
| 409 | `VIDEO_NOT_READY` | `EnrollmentOrOwnerGuard`: `Video.state !== 'READY'`. |
| 500 | `KEY_LOOKUP_FAILED` | Key service: `Video.keyId` missing or `videoKeys/:kid` absent. Should not happen for a healthy READY video. |
| 502 | `MANIFEST_PARSE_FAILED` | Manifest service: m3u8 body fails the rewriter's defensive `#EXTM3U` check. Indicates output-bucket corruption or Transcoder API output drift. |

The 5xx classes are used sparingly — playback failures are mostly client-observable as hls.js fatal errors. The exception filter (slice A) is unchanged; the new exceptions plug in via the same pattern.

### 2.5 Slice A / slice B endpoints

Unchanged. `/api/videos/:vid` (GET / DELETE), `/api/videos/:vid/upload-complete`, `/api/courses/:cid/.../upload-session`, `/api/internal/transcoder-events`, `/api/internal/fake-transcoder/*` — none of these are touched in slice C.

## 3. Data Layer

### 3.1 Type additions

None. Slice A added `Video`, `VideoKey`, `VideoState`, `VideoId`, `VideoKeyId`. Slice B writes additional fields. Slice C reads existing fields only — `Video.ownerInstructorId`, `Video.state`, `Video.output.bucket`, `Video.output.manifestPath`, `Video.keyId`, and `VideoKey.key`.

### 3.2 Firestore document layout

Unchanged from slice B.

### 3.3 Firestore security rules

Unchanged from slice B. The existing `videos/**` + `videoKeys/**` deny-all suite still asserts correctness; no new rules tests are required.

### 3.4 Firestore indexes

No new indexes. Both reads (`videos/:vid` and `videoKeys/:kid`) are document-path lookups.

## 4. Library Structure

### 4.1 `libs/api-video` additions

```
libs/api-video/src/lib/
├── (existing slice A files)
│   video-owner.guard.ts                       # unchanged (used by /api/videos/* mutations)
│   video.controller.ts                        # unchanged
│   video.service.ts                           # unchanged
│   video.repository.ts                        # MODIFIED — no behaviour change; only used by guard
│   video.config.ts                            # MODIFIED — playback signed URL TTL env var
│   …
│
├── (existing slice B submodules, unchanged)
│   transcoder/
│   webhook/
│
└── playback/                                   # NEW
    ├── enrollment-or-owner.guard.ts           # owner-only mode; EP-06 widens
    ├── enrollment-or-owner.guard.spec.ts
    ├── current-video.decorator.ts             # @CurrentVideo() → request.video
    ├── playback.controller.ts                 # GET /api/playback/manifest/:vid[/rendition/:r], GET /api/playback/keys/:vid
    ├── playback.controller.spec.ts
    ├── manifest.service.ts                    # fetch m3u8 from GCS; rewrite URIs
    ├── manifest.service.spec.ts
    ├── manifest.rewriter.ts                   # pure: master + rendition rewrites
    ├── manifest.rewriter.spec.ts
    ├── key.service.ts                         # base64 → 16 bytes; auth-gated upstream
    ├── key.service.spec.ts
    └── playback.exceptions.ts                 # VideoNotFoundException, VideoNotReadyException, NotVideoOwnerException, KeyLookupFailedException, ManifestParseFailedException, RenditionNotFoundException
```

Single `PlaybackController` class hosting all three routes is preferable to three siblings: same guards, same `@CurrentVideo()` injection, related concern. Splitting them costs more boilerplate than it saves.

### 4.2 `VideoStorageAdapter` additions

Two new methods on the slice A adapter (`libs/api-video/src/lib/video-storage.adapter.ts`):

```ts
readManifestObject(bucket: string, path: string): Promise<string>;
//   downloads the object body as UTF-8 text; small files (m3u8 max ~few KB)

signObjectUrl(bucket: string, path: string, ttlSec: number): Promise<string>;
//   wraps File(bucket, path).getSignedUrl({ version: 'v4', action: 'read', expires: now + ttlSec*1000 })
```

Both thin wrappers over `@google-cloud/storage`. Failure modes propagate; the manifest service maps them to `502 MANIFEST_PARSE_FAILED` (read failure) or lets segment-sign failures bubble as 500 from the service.

For testing, `VideoStorageAdapter` already takes its `Storage` client via constructor injection (slice A pattern). API e2e overrides the adapter with a fake whose `signObjectUrl` returns a deterministic stub URL — see §6.5.

### 4.3 `libs/api-video` module factory

The new `PlaybackController` registers alongside the existing `VideoController` + `TranscoderEventsController` (+ dev-only `FakeTranscoderController`):

```ts
@Module({
  providers: [
    VideoService,
    VideoRepository,
    VideoStorageAdapter,
    ManifestService,
    KeyService,
    EnrollmentOrOwnerGuard,
    { provide: VIDEO_TRANSCODER, useFactory: …, inject: [VIDEO_CONFIG] },
  ],
  controllers: [
    VideoController,
    TranscoderEventsController,
    PlaybackController,
    ...(process.env.NODE_ENV !== 'production' ? [FakeTranscoderController] : []),
  ],
})
export class ApiVideoModule {}
```

`EnrollmentOrOwnerGuard` is registered as a provider (constructor injection of `VideoRepository`) — it cannot be a simple class-level `@UseGuards()` without DI.

### 4.4 `libs/api-courses` / `libs/api-auth`

Unchanged. No new cross-lib edges. Slice C is internal to `libs/api-video` on the API side.

### 4.5 `libs/web-video` additions

```
libs/web-video/src/lib/
├── (existing slice A + B files)
│   video-state-badge.component.{ts,html}      # unchanged
│   video.service.ts                           # unchanged
│   upload/                                    # unchanged
│   polling/                                   # unchanged
│
└── player/                                     # NEW
    ├── video-player.component.ts              # standalone Angular component
    ├── video-player.component.html
    ├── video-player.component.spec.ts
    └── video-player.service.ts                # hls.js lifecycle wrapper (testable seam)
```

`VideoPlayerService` is a thin wrapper over hls.js — exposes `attach(videoEl, manifestUrl): Disposable` so the component can be unit-tested with a stub service that does not require a real hls.js instance.

### 4.6 `libs/web-courses` `LessonItem` change

One render-switch tweak. The existing template chooses between `VideoUploadComponent` and `VideoStateBadgeComponent` based on `Video` presence and state. Slice C adds a third branch:

```html
@if (lesson().videoId) {
  @if (video(); as v) {
    @if (v.state === 'READY') {
      <lib-video-player [videoId]="v.id" />
    } @else {
      <lib-video-state-badge [video]="v" />
    }
  }
} @else {
  <lib-video-upload [lessonId]="lesson().id" (uploaded)="onVideoUploaded()" />
}
```

The existing template already gates on `lesson().videoId` and renders the badge for every non-null `Video`. Slice C inserts the inner `@if (v.state === 'READY')` branch. Slice B's FAILED routing through the badge is preserved. No other `web-courses` changes.

### 4.7 Nx graph

```
libs/api-video           ← grows playback/ submodule
   ↑
libs/api-courses         ← unchanged edge
   ↑
libs/api-auth            ← unchanged
   ↑
libs/shared-data-models  ← unchanged

libs/web-video           ← grows player/ submodule
   ↑
libs/web-courses         ← unchanged edge (LessonItem swap is internal to LessonItem render)
```

No new lib-to-lib edges.

## 5. Manifest Rewriting Logic

The rewriter is pure (no IO). The manifest service is the IO seam.

### 5.1 Inputs

The slice B `TranscoderJobBuilder` configures Transcoder API to produce, for each transcoded video:

```
gs://${output}/videos/{vid}/hls/manifest.m3u8                       # master
gs://${output}/videos/{vid}/hls/{rendition}/playlist.m3u8           # per-rendition
gs://${output}/videos/{vid}/hls/{rendition}/segment_NNN.ts          # MPEG-TS segments
```

The master m3u8 contains `EXT-X-STREAM-INF` lines followed by a URI on the next line, like:

```
#EXTM3U
#EXT-X-VERSION:6
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2"
1080p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720,CODECS="avc1.4d4028,mp4a.40.2"
720p/playlist.m3u8
…
```

Each rendition playlist contains `EXT-X-KEY` (the encryption directive, with a placeholder URI per architecture spec §6.2) and `EXTINF` / segment-URI pairs:

```
#EXTM3U
#EXT-X-VERSION:6
#EXT-X-TARGETDURATION:6
#EXT-X-KEY:METHOD=AES-128,URI="https://example.invalid/keys/{vid}",IV=0xABCD…
#EXTINF:6.000,
segment_001.ts
#EXTINF:6.000,
segment_002.ts
…
#EXT-X-ENDLIST
```

### 5.2 `rewriteMaster`

```ts
export function rewriteMaster(masterBody: string, videoId: VideoId): string {
  assertM3u8Header(masterBody);                   // throws on missing #EXTM3U
  const out: string[] = [];
  const lines = masterBody.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    out.push(line);
    if (line.startsWith('#EXT-X-STREAM-INF')) {
      const nextIdx = i + 1;
      const uri = lines[nextIdx]?.trim();
      if (!uri || uri.startsWith('#')) {
        throw new ManifestParseFailedException(`expected URI line after EXT-X-STREAM-INF`);
      }
      const renditionName = renditionNameFromUri(uri);   // basename of 'X/playlist.m3u8' → 'X'
      out.push(`/api/playback/manifest/${videoId}/rendition/${renditionName}`);
      i++;                                                // skip the original URI line
    }
  }
  return out.join('\n');
}
```

Rendition names extracted from the master must match the allow-list `['1080p','720p','480p','360p']`. Mismatches raise `MANIFEST_PARSE_FAILED` — defensive against Transcoder ladder drift.

### 5.3 `rewriteRendition`

```ts
export async function rewriteRendition(
  renditionBody: string,
  videoId: VideoId,
  signSegment: (filename: string) => Promise<string>,
): Promise<string> {
  assertM3u8Header(renditionBody);
  const out: string[] = [];
  const lines = renditionBody.split('\n');
  for (const line of lines) {
    if (line.startsWith('#EXT-X-KEY')) {
      out.push(rewriteKeyDirective(line, videoId));        // URI=… → /api/playback/keys/{videoId}; IV preserved verbatim
    } else if (isSegmentUri(line)) {
      out.push(await signSegment(line.trim()));
    } else {
      out.push(line);
    }
  }
  return out.join('\n');
}
```

`rewriteKeyDirective`:
- Matches `URI="…"` with a tolerant regex and substitutes `"/api/playback/keys/{videoId}"`.
- Preserves any `IV=…` clause verbatim.
- Preserves the `METHOD=AES-128` clause verbatim.
- Methodless `EXT-X-KEY:METHOD=NONE` lines pass through untouched (defensive — Transcoder API does not emit them for our encrypted ladder, but the rewriter does not corrupt them if they appear).

`isSegmentUri(line)` is true for lines that are non-empty, do not start with `#`, and either match `segment_*.ts` or any other non-`http(s)://`-prefixed token in the rendition directory. The function returns false for any line beginning with `http://` or `https://` — guards against re-signing already-signed URIs.

### 5.4 Manifest service flow

```
ManifestService.fetchMaster(video):
  body = storage.readManifestObject(video.output.bucket, video.output.manifestPath)
  return rewriteMaster(body, video.id)

ManifestService.fetchRendition(video, rendition):
  path = `${dirname(video.output.manifestPath)}/${rendition}/playlist.m3u8`
  body = storage.readManifestObject(video.output.bucket, path)
  signSegment = (filename) =>
    storage.signObjectUrl(
      video.output.bucket,
      `${dirname(video.output.manifestPath)}/${rendition}/${filename}`,
      config.playbackSignedUrlTtlSec,                      // 14400 (4 h)
    )
  return rewriteRendition(body, video.id, signSegment)
```

Both flows live inside `ManifestService`. The controller is a thin handler that injects `@CurrentVideo() video`, validates `:r` against the allow-list, calls one of the two service methods, and sets the response headers.

### 5.5 Key service flow

```
KeyService.fetch(video):
  if (!video.keyId) throw new KeyLookupFailedException()
  doc = videoKeys/{video.keyId}                              # via VideoRepository
  if (!doc) throw new KeyLookupFailedException()
  return Buffer.from(doc.key, 'base64')                      # 16 bytes
```

Returned as the response body with `Content-Type: application/octet-stream` and `Content-Length: 16`.

## 6. Output Bucket CORS

The output bucket is private — no public IAM. Cloud Storage CORS controls which browser origins can issue cross-origin fetches against the signed URLs. Without it, hls.js segment fetches fail preflight.

### 6.1 One-time provisioning

A new section in `docs/operations/transcoder-pubsub-setup.md` (the slice B runbook) documents the `gsutil cors set` command and the JSON file. Sample `cors-config.json`:

```json
[
  {
    "origin": [
      "https://learn-wren-dev.web.app",
      "https://learn-wren-dev.firebaseapp.com",
      "http://localhost:4200"
    ],
    "method": ["GET", "HEAD"],
    "responseHeader": ["Content-Type", "Range"],
    "maxAgeSeconds": 3600
  }
]
```

Applied with:

```bash
PROJECT_ID=learn-wren-dev
gsutil cors set cors-config.json gs://${PROJECT_ID}-video-output
```

Per-environment. The prod hosting origin replaces the dev origin in the prod variant; localhost stays only in the dev variant.

### 6.2 Why `crossorigin="use-credentials"`

The Angular template sets `crossorigin="use-credentials"` on the `<video>` element. Two reasons:

1. **Safari's native HLS path** issues fetches via the video element rather than hls.js. Without `use-credentials`, Safari does not send the Firebase session cookie on the key fetch — the guard 401s.
2. **CORS preflight semantics** require the `Access-Control-Allow-Credentials: true` response header on the server side; same-origin fetches from `/api/playback/*` will naturally include the cookie, so this is mostly a Safari guard.

Cloud Storage signed URLs are cross-origin; the `withCredentials` cookie does not need to flow to them. hls.js's `xhrSetup` sets `withCredentials = true` on every XHR, including segment fetches. Cloud Storage ignores cookies but does require the origin be in the CORS allow-list, satisfied by §6.1.

## 7. Player Component

### 7.1 Template

```html
<video #playerEl controls preload="metadata" crossorigin="use-credentials"
       class="player"
       data-testid="video-player"></video>
@if (error(); as msg) {
  <div class="error" role="alert" data-testid="video-player-error">
    <span>{{ msg }}</span>
    <button type="button" (click)="retry()" data-testid="video-player-retry">Try again</button>
  </div>
}
```

### 7.2 Component logic

```ts
@Component({
  selector: 'lib-video-player',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './video-player.component.html',
  styleUrls: ['./video-player.component.css'],
})
export class VideoPlayerComponent implements AfterViewInit, OnDestroy {
  @Input({ required: true }) videoId!: VideoId;
  @ViewChild('playerEl') playerEl!: ElementRef<HTMLVideoElement>;

  readonly error = signal<string | null>(null);
  private handle: PlayerHandle | null = null;

  constructor(private readonly playerSvc: VideoPlayerService) {}

  ngAfterViewInit(): void {
    this.mount();
  }

  ngOnDestroy(): void {
    this.handle?.dispose();
  }

  retry(): void {
    this.handle?.dispose();
    this.error.set(null);
    this.mount();
  }

  private mount(): void {
    const url = `/api/playback/manifest/${this.videoId}`;
    this.handle = this.playerSvc.attach(this.playerEl.nativeElement, url, {
      onFatalError: (message) => this.error.set(message),
    });
  }
}
```

### 7.3 `VideoPlayerService` lifecycle

```ts
@Injectable({ providedIn: 'root' })
export class VideoPlayerService {
  attach(el: HTMLVideoElement, manifestUrl: string, hooks: { onFatalError: (msg: string) => void }): PlayerHandle {
    if (Hls.isSupported()) {
      const hls = new Hls({ xhrSetup: (xhr) => { xhr.withCredentials = true; } });
      hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) hooks.onFatalError(toUserMessage(data)); });
      hls.loadSource(manifestUrl);
      hls.attachMedia(el);
      return { dispose: () => { hls.destroy(); el.removeAttribute('src'); el.load(); } };
    }
    if (el.canPlayType('application/vnd.apple.mpegurl')) {
      el.src = manifestUrl;                                  // Safari / iOS native HLS
      const handler = () => hooks.onFatalError('Unable to play this video.');
      el.addEventListener('error', handler);
      return { dispose: () => { el.removeEventListener('error', handler); el.removeAttribute('src'); el.load(); } };
    }
    hooks.onFatalError('Your browser does not support HLS playback.');
    return { dispose: () => {} };
  }
}
```

`toUserMessage(data)` maps known fatal `Hls.ErrorDetails` to short strings:
- `manifestLoadError`, `manifestLoadTimeOut` → "Unable to load the video. Try again."
- `levelLoadError`, `levelLoadTimeOut` → "Playback interrupted — try again."
- `fragLoadError`, `fragLoadTimeOut` → "Playback interrupted — try again."
- `keyLoadError`, `keyLoadTimeOut` → "Unable to decrypt this video."
- everything else → "Playback failed — try again."

### 7.4 No autoplay, no resume position, no quality picker

Native `<video controls>` only. Slice C is owner preview, not student viewing.

## 8. Failure Modes Summary

| Failure | Where | Observable | Persisted state |
|---|---|---|---|
| Session expired | `FirebaseSessionGuard` | hls.js fatal `networkError` → "Try again" UI; user refreshes page to re-login | unchanged |
| Requester not owner | `EnrollmentOrOwnerGuard` → 403 | hls.js fatal; "Unable to load…" | unchanged |
| `Video.state !== READY` (race) | `EnrollmentOrOwnerGuard` → 409 | hls.js fatal; parent re-fetches Lesson → renders badge or upload component | unchanged |
| `videos/:vid` deleted (race) | `EnrollmentOrOwnerGuard` → 404 | hls.js fatal; parent re-fetches Lesson → renders empty upload component | unchanged |
| Master m3u8 missing in bucket | `ManifestService` storage read | 502 `MANIFEST_PARSE_FAILED` | unchanged (operator must triage) |
| Master m3u8 fails `#EXTM3U` check | `rewriteMaster` | 502 `MANIFEST_PARSE_FAILED` | unchanged |
| Unknown rendition name | Controller | 404 `RENDITION_NOT_FOUND` | unchanged |
| `signObjectUrl` failure | `ManifestService` rendition flow | 500; hls.js fatal `levelLoadError` | unchanged |
| Segment URL expired during long pause | Cloud Storage returns 403 | hls.js fatal `fragLoadError` → "Try again" → fresh manifest fetch re-signs URLs | unchanged |
| `videoKeys/:kid` missing | `KeyService` | 500 `KEY_LOOKUP_FAILED`; hls.js fatal `keyLoadError` | unchanged (data inconsistency — operator triage) |
| Bucket CORS misconfigured | hls.js segment fetch preflight | hls.js fatal `fragLoadError` with CORS in console | unchanged (operator must `gsutil cors set`) |
| `Hls.isSupported()` false AND no native HLS | Player service | Component renders "Your browser does not support HLS playback." | unchanged |
| User clicks `Try again` after fatal error | Component | Recreates handle, fresh manifest fetch | unchanged |

Slice C does **not** auto-retry on transient errors. The user clicks `Try again`; a single retry is the slice C UX bar. Auto-retry-with-backoff belongs to EP-06 / student-facing polish.

## 9. Testing

| Layer | Where | Coverage |
|---|---|---|
| Unit (Vitest, mocked Firestore + Storage) | `libs/api-video/src/lib/playback/**/*.spec.ts` | `manifest.rewriter` — `rewriteMaster` happy path (4-rendition input → 4 rewritten lines, comments + version directives preserved; intermixed `#EXT-X-INDEPENDENT-SEGMENTS` preserved); throws on missing `#EXTM3U`; throws when `EXT-X-STREAM-INF` is not followed by a URI; throws on rendition outside allow-list. `rewriteRendition` happy path (each `#EXT-X-KEY` line rewritten with `IV=` preserved; segments rewritten via injected `signSegment`); methodless `EXT-X-KEY:METHOD=NONE` passes through; existing signed-URL lines (starts with http(s)://) not double-signed; throws on missing `#EXTM3U`. `manifest.service` — happy path for master and rendition; missing object → 502; storage adapter throw → 502; rendition allow-list checked at controller layer (service trusts input). `key.service` — base64 decode → 16-byte Buffer; missing `keyId` → 500; missing `videoKeys/:kid` → 500. `EnrollmentOrOwnerGuard` — owner allowed and `request.video` attached; non-owner → 403; absent video → 404; `state !== READY` → 409; verifies the EP-06 TODO branch falls through to 403 today. `PlaybackController` — manifest master 200 with correct content-type + `Cache-Control: no-store`; manifest rendition allow-list 404; manifest rendition 200 with correct content-type; key 200 with `Content-Length: 16` and `application/octet-stream`. |
| Component (Vitest + Angular utilities) | `libs/web-video/src/lib/player/**/*.spec.ts` | `VideoPlayerService` — `Hls.isSupported()` branch instantiates Hls, sets `xhrSetup.withCredentials = true`, calls `loadSource` + `attachMedia`, registers fatal-error handler, dispose calls `hls.destroy()` and clears `src`. Native HLS branch (Hls.isSupported false, `canPlayType` returns a supported string): sets `video.src`, listens for `error`, dispose detaches and clears. Unsupported branch invokes `onFatalError`. `VideoPlayerComponent` — mounts on `ngAfterViewInit`; disposes on `ngOnDestroy`; surfaces fatal errors into the signal; `Try again` button calls `dispose` + remount. Error-text mapping (`toUserMessage`) covers each known fatal `Hls.ErrorDetails`. |
| Firestore rules | existing rules-tests suite | No new tests (rules unchanged). Slice A's `videos/**` + `videoKeys/**` deny-all suite continues to assert correctness. |
| API e2e (Firebase + Storage emulators, fake transcoder, fake `signObjectUrl`) | `apps/api-e2e/src/**/*.e2e-spec.ts` | Happy path: register → promote → course/module/lesson → upload-session → PUT chunks → upload-complete → `/api/internal/fake-transcoder/complete/:vid` → `GET /api/videos/:vid` reports `READY` → `GET /api/playback/manifest/:vid` returns 200, body starts with `#EXTM3U`, contains 4 lines matching `/api/playback/manifest/:vid/rendition/<name>` for `1080p/720p/480p/360p`, content-type is `application/vnd.apple.mpegurl`, `Cache-Control: no-store`. `GET /api/playback/manifest/:vid/rendition/720p` returns 200 with body containing `#EXT-X-KEY:METHOD=AES-128,URI="/api/playback/keys/:vid"` (IV preserved verbatim) and segment URIs matching the deterministic `signObjectUrl` stub pattern (e.g., `gs-stub://…/720p/segment_001.ts`). `GET /api/playback/keys/:vid` returns 200 with `Content-Length: 16` and body equal to base64-decoded `videoKeys/{kid}.key`. Negative paths: second instructor → 403 `NOT_VIDEO_OWNER` on each endpoint; unauthenticated → 401; student → 403; video in TRANSCODING (skip the fake-completer call) → 409 `VIDEO_NOT_READY` on each endpoint; unknown rendition `xyz` → 404 `RENDITION_NOT_FOUND`; non-existent `:vid` → 404 `VIDEO_NOT_FOUND`. Manifest parse failure: storage adapter stubbed to return a non-`#EXTM3U` body → 502 `MANIFEST_PARSE_FAILED`. To make signing test-seamable without real GCS, `VideoStorageAdapter` is overridden in the e2e module with a fake whose `signObjectUrl` returns `gs-stub://${bucket}/${path}?expires=${now+ttl}`. Slice B precedent for adapter overrides applies (`FakeTranscoderAdapter`). |
| Web e2e (Playwright) | `apps/web-e2e/src/**/*.spec.ts` | Instructor signs in → uploads ~1 MB MP4 → `/api/internal/fake-transcoder/complete/:vid` directly → editor's `LessonItem` swaps from badge to `<video data-testid="video-player">` element within ≤ 6 s (one polling cycle); element has `src=""` and the hls.js path has loaded the manifest into MSE (assertable via `playerEl.readyState >= 1` plus `playerEl.duration > 0`). No console errors. Sign out / sign in as a second instructor with no relationship → navigate to the first instructor's lesson via a known route → assert the player surface is absent and the page does not 500 (404 / 403 from guard handled gracefully). ABR / decrypted-segment playback is not asserted at the Playwright layer; the API e2e covers the manifest + key wiring, the component test covers the player wiring, and manual run-through covers visual playback. |
| Mutation (Stryker) | `libs/api-video` | ≥ 85 % effective. Raw output refreshed in `reports/mutation/api-video/mutation.{html,json}`; triage notes folded into `docs/quality/mutation-report.md`. New surface mutated: `manifest.rewriter` (`rewriteMaster`, `rewriteRendition`, helpers), `manifest.service`, `key.service`, `EnrollmentOrOwnerGuard`, `PlaybackController`. Mutation score on `libs/api-courses` does not regress relative to its slice-A/B baseline. |
| CRAP score | existing tooling (`tools/crap/crap.mjs`) | Refresh `docs/quality/crap-report.md` to cover the new `playback/` submodule in `libs/api-video` and the new `player/` submodule in `libs/web-video`. |

**Fixture management:** slice A's `apps/api-e2e/src/fixtures/small-video.mp4` is reused for the upload step. No new fixtures required; the m3u8 bodies are generated by the slice B `FakeTranscoderAdapter` and the e2e `VideoStorageAdapter` stub (small deterministic strings).

**`hls.js` test wiring:** `VideoPlayerService` tests stub `Hls` via constructor or module-level injection (Vitest's `vi.mock('hls.js')`). Component tests use a test-double `VideoPlayerService` to assert the component → service contract without instantiating real hls.js. This matches slice A's pattern of injecting `@google-cloud/storage` over a `Storage`-shaped interface.

**api-e2e auth flake passthrough:** memory note about `api-e2e auth happy-path is flaky` — slice C's playback tests sit downstream of register→promote, so they inherit the same flake risk. Mitigation matches slice B: re-run on suspected flake; chase only on repeated failure. No additional slice C exposure.

## 10. Locked Decisions

1. **Owner-only playback in slice C.** `EnrollmentOrOwnerGuard` step 4 (enrolled check) is a `TODO(EP-06)` no-op. Same guard signature; EP-06 wires the enrolment lookup.
2. **Session cookie + guard, no playback token.** UC-03-04's "short-lived playback token" wording is deferred to the multi-DRM / license-server slice.
3. **Manifest is NestJS-mediated at both layers.** Both master and per-rendition m3u8 bodies pass through NestJS. Segments come from Cloud Storage via 4 h v4 signed URLs minted per request.
4. **Rendition allow-list pinned at the controller** — `['1080p','720p','480p','360p']`. Out-of-list → 404. Matches slice B's locked ladder; cheaper than reading the master m3u8 to enumerate.
5. **`Cache-Control: no-store` on every playback endpoint.** Signing on every request keeps TTL windows fresh; no client / CDN caching layer in slice C.
6. **Player UI is native `<video controls>` only.** hls.js on MSE browsers; native HLS on Safari/iOS via `src` assignment. No quality picker, captions, or custom control bar in slice C.
7. **`xhrSetup.withCredentials = true` and `crossorigin="use-credentials"`.** Session cookie flows on every same-origin playback request; Cloud Storage signed-URL fetches ignore credentials but require CORS.
8. **No autoplay.** Instructor must click play.
9. **One-shot `Try again` on fatal hls.js error.** No exponential backoff in slice C.
10. **Output bucket CORS configured out of band**, documented in `docs/operations/transcoder-pubsub-setup.md`. `gsutil cors set` per environment. Not Terraformed in slice C.
11. **Playback signed URL TTL pinned at 4 hours.** Architecture spec §1; `LEARNWREN_VIDEO_PLAYBACK_SIGNED_URL_TTL_SEC=14400`.
12. **No new Firestore indexes, no rules changes.** Playback reads `videos/{vid}` + `videoKeys/{kid}` by document path.
13. **`LessonItem` render-switch on `state === READY`.** Player replaces badge; failure / earlier states keep slice A / slice B components.
14. **Stuck-state remains badge-only.** Player is never the surface for a `TRANSCODING` stuck affordance.
15. **API e2e uses a `signObjectUrl` test seam.** Same adapter-injection pattern slice B used for the fake transcoder. CI does not depend on real GCS signing.
16. **Manifest parse defence is 502, not 500.** Output-bucket content is an upstream we don't fully control end-to-end.
17. **Single `PlaybackController` class hosts all three routes.** Same guards, same `@CurrentVideo()` injection; lower boilerplate than three siblings.
18. **`VideoPlayerService` is the test seam for hls.js.** The component contracts against the service; the service tests stub hls.js itself.
19. **Submodule layout: `playback/` inside `libs/api-video/src/lib/`; `player/` inside `libs/web-video/src/lib/`.** Matches slice B's submodule precedent.
20. **No `web-video` dependency on hls.js types in consumer libs.** `libs/web-video` exports `VideoPlayerComponent`; consumer libs (`libs/web-courses`) never import hls.js directly.

## 11. Environment Variables

Added to `.env.tpl` at the repo root and rendered via `pnpm secrets:render`:

| Variable | Example | Used by |
|---|---|---|
| `LEARNWREN_VIDEO_PLAYBACK_SIGNED_URL_TTL_SEC` | `14400` (4 h) | `ManifestService` segment signing |

No other new variables. The output bucket name reuses slice B's `LEARNWREN_VIDEO_OUTPUT_BUCKET`. The CORS config is bucket-level metadata, not an env var.

## 12. Acceptance Bar

Before slice C is "done":

1. Unit, component, rules (unchanged), API e2e, and web e2e suites all pass for `libs/api-video` and `libs/web-video`. No regression in `api-auth`, `api-courses`, `web-auth`, `web-courses`, or slices A / B.
2. Mutation score on `libs/api-video` ≥ 85 % effective; raw output in `reports/mutation/api-video/mutation.{html,json}` refreshed; triage notes folded into `docs/quality/mutation-report.md` summary. Mutation score on `libs/api-courses` does not regress relative to its slice-A/B baseline.
3. `docs/quality/crap-report.md` refreshed to cover the new files in `libs/api-video/src/lib/playback/` and the new `libs/web-video/src/lib/player/` submodule.
4. `docs/operations/transcoder-pubsub-setup.md` gains an "Output bucket CORS" section with the `gsutil cors set` command and a sample `cors-config.json`.
5. Manual run-through against the dev Firebase project (real GCP Transcoder API, real Cloud Storage, real bucket CORS applied):
   - Promoted instructor uploads a small (~10 MB) MP4; observes transition Uploaded → TRANSCODING → READY; badge swaps to inline `<video>` element.
   - Clicks play; playback starts within ~3 s; native browser controls work (play/pause/scrub/volume/fullscreen); closing the lesson stops playback cleanly.
   - Repeat the playback verification on desktop Safari and (where feasible) iOS Safari — confirm the native HLS path renders and plays without console errors.
   - Long-pause test: pause for > 4 h and resume → segment fetches 403 → "Try again" → fresh manifest fetch re-signs → playback resumes.
   - Delete the lesson while the player is mounted; verify player unmounts, no console errors, output bucket objects cleared (slice B cascade still works).
   - Sign out / clear session cookie; reload editor → playback fails with the 401-mapped error message; sign back in → retry works.
6. CI is green end-to-end with `LEARNWREN_VIDEO_TRANSCODER=fake` and the `signObjectUrl` test seam.
7. README status banner updated: "EP-03 slice C (Owner playback) complete; publish gate deferred to slice D."
8. Spec status moves from Draft to Approved after stakeholder review.

## 13. Open Questions

None at design time. All scope dimensions resolved during brainstorming and recorded in §10. Specifically resolved:

- Editor UX on READY? → badge swaps to player (§10 item 13).
- Auth model for manifest + key endpoints? → session cookie + `EnrollmentOrOwnerGuard` (owner-only mode), no playback token (§10 items 1, 2, 7).
- Multi-level manifest rewriting strategy? → NestJS proxies master + rendition; segments signed (§10 item 3).
- Player UI scope? → native `<video controls>`; hls.js + native HLS fallback (§10 item 6).
- Output bucket CORS provisioning? → out-of-band `gsutil cors set`, documented in the slice B operations runbook (§10 item 10).
- Manifest caching? → no-store on every endpoint (§10 item 5).
- Signed URL TTL? → 4 hours, pinned (§10 item 11).
- Test seam for GCS signing? → `signObjectUrl` adapter override, matches slice B's `FakeTranscoderAdapter` precedent (§10 item 15).
- Rendition validation? → controller-level allow-list (§10 item 4).
- Manifest parse failure HTTP class? → 502 (§10 item 16).
- Player component test seam? → `VideoPlayerService` (§10 item 18).
- Library boundaries? → `playback/` submodule in `api-video`, `player/` submodule in `web-video`; no new lib-to-lib edges (§10 items 19, 20).

# Video Transcoding + AES-128 Key Generation (EP-03 Slice B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On `POST /api/videos/:vid/upload-complete`, probe the source with ffprobe, generate a 16-byte AES-128 key, submit a GCP Transcoder API job, and advance `Video.state` to `TRANSCODING` in the same Firestore transaction. A Pub/Sub push subscription delivers job-state events to a new webhook controller, which advances state to `READY` or `FAILED`. The editor's badge polls and reflects the live state. A fake transcoder adapter plus dev-only simulator routes let CI run the full pipeline without GCP Transcoder API.

**Architecture:** Two new submodules under `libs/api-video/src/lib/` — `transcoder/` (port + GCP adapter + fake adapter + job builder) and `webhook/` (PubSubPushGuard + TranscoderEventsController + dev-only FakeTranscoderController). `VideoTranscoder` port shape from architecture spec §3.2 is extended: `parseEvent` becomes async (needs `getJob` for output duration), `cancelJob` is added (for DELETE on TRANSCODING). `VideoStorageAdapter` grows a `probeSource` method. `VideoService.completeUpload` is rewritten to chain the probe → key gen → submit → state transition inside one transaction; failures (probe or 3× submit retry exhausted) commit `FAILED` instead of `TRANSCODING`. `libs/web-video` adds a `VideoStatePollingService` (RxJS `timer`+`switchMap`, 5 s, 30-min cap) wired into the badge component.

**Tech Stack:** NestJS 11, Angular 21.2, `@google-cloud/video-transcoder` (NEW), `@ffprobe-installer/ffprobe` (NEW), `google-auth-library` (NEW, for OIDC verify), `@google-cloud/storage` (existing), `firebase-admin` 13.8, Vitest 4.1, Stryker 9.6, Playwright Test, RxJS 8.

**Foundation specs:**
- `docs/superpowers/specs/2026-05-13-video-transcoding-slice-b-design.md` (this slice — authoritative)
- `docs/superpowers/specs/2026-05-13-video-pipeline-architecture-design.md` (architecture; port shape amended in Task 1)
- `docs/superpowers/specs/2026-05-13-video-upload-slice-a-design.md` (slice A — patterns and entry points to extend)

**Repo conventions to follow:**
- Conventional Commits (`feat(api-video):`, `feat(web-video):`, `chore(quality):`, `test(api-e2e):`, `docs(specs):`, `fix(...)`)
- Branded ID types from `@learnwren/shared-data-models`; ISO date strings on the wire
- DI tokens from `@learnwren/api-firebase` (`FIRESTORE`, `FIREBASE_STORAGE`)
- Domain exceptions extending `VideoException`; funnel through `VideoExceptionFilter`
- Mutation exclusions in `stryker.api-video.config.mjs`: `*.repository.ts`, `*.module.ts`, `*.exception-filter.ts`, `*.config.ts`, `dto/`, `types/`, `errors/`, `index.ts`. Slice B adds the two new adapters' thin wrappers (`gcp-transcoder.adapter.ts`, `fake-transcoder.adapter.ts`) and the storage probe to the **mutated** set — the pure builder and the service methods are where the logic lives, and they should still be the bulk of the mutation surface.
- After every task: `pnpm affected` (or the targeted nx run) must pass; commit a fully-green increment.

**Pre-flight check** (run before Task 1):

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test
git status   # must be clean
git checkout -b ep-03-slice-b-video-transcoding
```

---

## Task 1: Amend architecture spec — `VideoTranscoder` port shape

**Files:**
- Modify: `docs/superpowers/specs/2026-05-13-video-pipeline-architecture-design.md` (§3.2 only)

The architecture spec sketched `parseEvent` as sync and omitted `cancelJob`. Slice B needs both changes. Land the doc edit first so no later code task is "violating" the spec.

- [ ] **Step 1: Edit the port shape in `2026-05-13-video-pipeline-architecture-design.md`**

In §3.2, replace the `VideoTranscoder` interface block with:

```ts
export interface VideoTranscoder {
  submitJob(input: TranscoderJobInput): Promise<TranscoderJobHandle>;
  parseEvent(rawPubSubMessage: unknown): Promise<TranscoderEvent>;
  cancelJob(jobName: string): Promise<void>;
}
```

Immediately after the interface block, replace the paragraph that begins "Single MVP implementation: `GcpTranscoderAdapter`…" with:

> Single MVP implementation: `GcpTranscoderAdapter`, using `@google-cloud/video-transcoder` for `submitJob` and `cancelJob`, and parsing the Transcoder API Pub/Sub event payload in `parseEvent`. `parseEvent` is async because `JOB_SUCCEEDED` events do not carry output duration; the adapter calls `transcoderClient.getJob(jobName)` inside `parseEvent` to obtain it. A future Cloud Run worker implementation emits the same `TranscoderEvent` envelope onto the same Pub/Sub topic, so the swap is a config change — not a rewrite. A future Mux implementation can also conform if we ever want that path.

The paragraph immediately after — "The port deliberately does not include a `getStatus(jobName)` method…" — stays as-is. `cancelJob` is not a polling primitive; the prohibition still holds.

- [ ] **Step 2: Verify the spec still renders**

```bash
grep -n "VideoTranscoder\|cancelJob\|parseEvent" docs/superpowers/specs/2026-05-13-video-pipeline-architecture-design.md
```

Expected: the new interface members and the revised paragraph are present; no stale references to a sync `parseEvent` signature elsewhere in the file (slice B's design spec already documented the deviation in its §4.3).

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-05-13-video-pipeline-architecture-design.md
git commit -m "docs(specs): amend VideoTranscoder port — async parseEvent + cancelJob"
```

---

## Task 2: Add slice B environment variables to `.env.tpl`

**Files:**
- Modify: `.env.tpl`

- [ ] **Step 1: Append the slice B env block**

Open `.env.tpl` and add a new section after the existing "Video upload (EP-03)" block:

```
# ── Video transcoding (EP-03 slice B) ────────────────────────────────
# Output bucket: Transcoder API writes encrypted HLS playlists + segments
# here. Slice C reads via signed URLs. Provision separately from the source
# bucket (see docs/operations/transcoder-pubsub-setup.md).
LEARNWREN_VIDEO_OUTPUT_BUCKET=op://learnwren/dev/LEARNWREN_VIDEO_OUTPUT_BUCKET

# Transcoder selection: 'gcp' (real GCP Transcoder API) or 'fake' (in-memory
# adapter for CI and local dev). The env validator rejects 'fake' when
# NODE_ENV=production.
LEARNWREN_VIDEO_TRANSCODER=fake

# Only required when LEARNWREN_VIDEO_TRANSCODER=gcp:
LEARNWREN_GCP_PROJECT_ID=op://learnwren/dev/LEARNWREN_GCP_PROJECT_ID
LEARNWREN_TRANSCODER_LOCATION=us-central1
LEARNWREN_TRANSCODER_TOPIC=op://learnwren/dev/LEARNWREN_TRANSCODER_TOPIC
LEARNWREN_TRANSCODER_WEBHOOK_AUDIENCE=op://learnwren/dev/LEARNWREN_TRANSCODER_WEBHOOK_AUDIENCE
LEARNWREN_TRANSCODER_INVOKER_SA_EMAIL=op://learnwren/dev/LEARNWREN_TRANSCODER_INVOKER_SA_EMAIL

# Web client poll interval while a video is TRANSCODING. Override in e2e
# to reduce wall-clock duration of tests.
LEARNWREN_WEB_VIDEO_POLL_INTERVAL_MS=5000
```

- [ ] **Step 2: Render and verify**

```bash
pnpm secrets:render
grep -c "LEARNWREN_VIDEO_" .env
```

Expected: ≥ 6 hits (the slice A `LEARNWREN_VIDEO_SOURCE_BUCKET` + `LEARNWREN_VIDEO_STUCK_THRESHOLD_MINUTES` plus the new vars). The render command may print one warning per `op://` reference that does not yet exist in the user's 1Password vault — those are expected in dev until the operator runs the Task 24 provisioning runbook. The render still produces a `.env` for the local fake-adapter path.

- [ ] **Step 3: Commit**

```bash
git add .env.tpl
git commit -m "chore(env): add slice B transcoding env vars to .env.tpl"
```

---

## Task 3: Extend `VideoConfig` to carry slice B fields

**Files:**
- Modify: `libs/api-video/src/lib/video.config.ts`
- Modify: `libs/api-video/src/lib/video.config.spec.ts`
- Modify: `libs/api-video/src/index.ts` (no change expected — `VideoConfig` is re-exported as a type)

- [ ] **Step 1: Write failing tests**

Open `libs/api-video/src/lib/video.config.spec.ts`. Append a new `describe` block after the existing tests:

```ts
describe('readVideoConfigFromEnv — slice B fields', () => {
  const baseEnv = (): NodeJS.ProcessEnv => ({
    LEARNWREN_VIDEO_SOURCE_BUCKET: 'src',
    LEARNWREN_VIDEO_STUCK_THRESHOLD_MINUTES: '30',
    LEARNWREN_VIDEO_OUTPUT_BUCKET: 'out',
    LEARNWREN_VIDEO_TRANSCODER: 'fake',
    LEARNWREN_WEB_VIDEO_POLL_INTERVAL_MS: '5000',
  });

  it('parses fake-transcoder config with output bucket', () => {
    const cfg = readVideoConfigFromEnv(baseEnv());
    expect(cfg.outputBucket).toBe('out');
    expect(cfg.transcoderImpl).toBe('fake');
  });

  it('requires LEARNWREN_VIDEO_OUTPUT_BUCKET', () => {
    const env = baseEnv();
    delete env.LEARNWREN_VIDEO_OUTPUT_BUCKET;
    expect(() => readVideoConfigFromEnv(env)).toThrow(/OUTPUT_BUCKET/);
  });

  it('requires gcp-specific vars when transcoderImpl=gcp', () => {
    const env = baseEnv();
    env.LEARNWREN_VIDEO_TRANSCODER = 'gcp';
    expect(() => readVideoConfigFromEnv(env)).toThrow(/LEARNWREN_GCP_PROJECT_ID/);
  });

  it('accepts a complete gcp config', () => {
    const env = baseEnv();
    env.LEARNWREN_VIDEO_TRANSCODER = 'gcp';
    env.LEARNWREN_GCP_PROJECT_ID = 'p1';
    env.LEARNWREN_TRANSCODER_LOCATION = 'us-central1';
    env.LEARNWREN_TRANSCODER_TOPIC = 'projects/p1/topics/t';
    env.LEARNWREN_TRANSCODER_WEBHOOK_AUDIENCE = 'https://x/api/internal/transcoder-events';
    env.LEARNWREN_TRANSCODER_INVOKER_SA_EMAIL = 'inv@p1.iam.gserviceaccount.com';
    const cfg = readVideoConfigFromEnv(env);
    expect(cfg.transcoderImpl).toBe('gcp');
    expect(cfg.gcpProjectId).toBe('p1');
    expect(cfg.transcoderLocation).toBe('us-central1');
    expect(cfg.transcoderTopic).toBe('projects/p1/topics/t');
    expect(cfg.webhookAudience).toMatch(/transcoder-events$/);
    expect(cfg.invokerSaEmail).toMatch(/iam\.gserviceaccount\.com$/);
  });

  it('rejects transcoderImpl=fake when NODE_ENV=production', () => {
    const env = baseEnv();
    env.NODE_ENV = 'production';
    expect(() => readVideoConfigFromEnv(env)).toThrow(/production/i);
  });

  it('rejects non-finite poll interval', () => {
    const env = baseEnv();
    env.LEARNWREN_WEB_VIDEO_POLL_INTERVAL_MS = 'banana';
    expect(() => readVideoConfigFromEnv(env)).toThrow(/poll/i);
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

```bash
pnpm nx test api-video -- video.config.spec
```

Expected: the new tests fail because `outputBucket`, `transcoderImpl`, etc. don't exist on `VideoConfig` yet.

- [ ] **Step 3: Extend `video.config.ts`**

Replace the contents of `libs/api-video/src/lib/video.config.ts` with:

```ts
export const VIDEO_CONFIG = Symbol.for('learnwren.api-video.config');

export type TranscoderImpl = 'gcp' | 'fake';

export interface VideoConfig {
  sourceBucket: string;
  outputBucket: string;
  stuckThresholdMinutes: number;
  pollIntervalMs: number;
  transcoderImpl: TranscoderImpl;
  // Present only when transcoderImpl === 'gcp':
  gcpProjectId?: string;
  transcoderLocation?: string;
  transcoderTopic?: string;
  webhookAudience?: string;
  invokerSaEmail?: string;
}

function readRequired(env: NodeJS.ProcessEnv, name: string): string {
  const v = env[name];
  if (!v) throw new Error(`${name} env var is required.`);
  return v;
}

function readPositiveNumber(env: NodeJS.ProcessEnv, name: string, dflt: string): number {
  const raw = env[name] ?? dflt;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${name} must be a positive number, got "${raw}".`);
  }
  return n;
}

export function readVideoConfigFromEnv(env: NodeJS.ProcessEnv): VideoConfig {
  const sourceBucket = readRequired(env, 'LEARNWREN_VIDEO_SOURCE_BUCKET');
  const outputBucket = readRequired(env, 'LEARNWREN_VIDEO_OUTPUT_BUCKET');
  const stuckThresholdMinutes = readPositiveNumber(
    env,
    'LEARNWREN_VIDEO_STUCK_THRESHOLD_MINUTES',
    '30',
  );
  const pollIntervalMs = readPositiveNumber(
    env,
    'LEARNWREN_WEB_VIDEO_POLL_INTERVAL_MS',
    '5000',
  );

  const implRaw = env['LEARNWREN_VIDEO_TRANSCODER'] ?? 'gcp';
  if (implRaw !== 'gcp' && implRaw !== 'fake') {
    throw new Error(
      `LEARNWREN_VIDEO_TRANSCODER must be "gcp" or "fake", got "${implRaw}".`,
    );
  }
  if (implRaw === 'fake' && env['NODE_ENV'] === 'production') {
    throw new Error(
      'LEARNWREN_VIDEO_TRANSCODER=fake is rejected when NODE_ENV=production.',
    );
  }

  const base: VideoConfig = {
    sourceBucket,
    outputBucket,
    stuckThresholdMinutes,
    pollIntervalMs,
    transcoderImpl: implRaw,
  };

  if (implRaw === 'fake') return base;

  return {
    ...base,
    gcpProjectId: readRequired(env, 'LEARNWREN_GCP_PROJECT_ID'),
    transcoderLocation: readRequired(env, 'LEARNWREN_TRANSCODER_LOCATION'),
    transcoderTopic: readRequired(env, 'LEARNWREN_TRANSCODER_TOPIC'),
    webhookAudience: readRequired(env, 'LEARNWREN_TRANSCODER_WEBHOOK_AUDIENCE'),
    invokerSaEmail: readRequired(env, 'LEARNWREN_TRANSCODER_INVOKER_SA_EMAIL'),
  };
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm nx test api-video -- video.config.spec
```

Expected: all tests pass.

- [ ] **Step 5: Typecheck the workspace**

```bash
pnpm typecheck
```

Expected: PASS. `VideoConfig` is consumed in `video.service.ts` (uses only `sourceBucket`) and `video.module.ts` (factory) — both should still compile because the new fields are additive.

- [ ] **Step 6: Commit**

```bash
git add libs/api-video/src/lib/video.config.ts libs/api-video/src/lib/video.config.spec.ts
git commit -m "feat(api-video): extend VideoConfig with slice B transcoder + output bucket fields"
```

---

## Task 4: Add `VideoTranscoder` port + `TranscoderEvent` types

**Files:**
- Create: `libs/api-video/src/lib/transcoder/transcoder.port.ts`
- Modify: `libs/api-video/src/index.ts` (no public re-export — internal-only types)

The port lives inside the new `transcoder/` submodule and is consumed by `VideoService`, both adapters, and the `TranscoderEventsController`. The DI token + interface are co-located in one file.

- [ ] **Step 1: Create the port file**

Create `libs/api-video/src/lib/transcoder/transcoder.port.ts`:

```ts
import type { VideoId, VideoKeyId } from '@learnwren/shared-data-models';

export const VIDEO_TRANSCODER = Symbol.for('learnwren.api-video.transcoder');

export interface TranscoderJobInput {
  videoId: VideoId;
  sourceUri: string;                // 'gs://<src-bucket>/videos/{vid}/source.<ext>'
  outputUriPrefix: string;          // 'gs://<out-bucket>/videos/{vid}/hls/'
  encryptionKey: {
    id: VideoKeyId;
    bytes: Uint8Array;              // exactly 16 bytes
  };
  sourceHeight: number;             // from ffprobe; drives skip-upscale
  topic: string;                    // full Pub/Sub topic path; per JobConfig.pubsubDestination
}

export interface TranscoderJobHandle {
  jobName: string;                  // GCP Transcoder API job resource name
}

export type TranscoderEvent =
  | {
      type: 'JOB_SUCCEEDED';
      jobName: string;
      videoId: VideoId;
      manifestPath: string;         // 'videos/{vid}/hls/manifest.m3u8'
      durationSec: number;          // from transcoderClient.getJob output
    }
  | {
      type: 'JOB_FAILED';
      jobName: string;
      videoId: VideoId;
      reason: string;               // sliced to 500 chars at construction
    };

export interface VideoTranscoder {
  submitJob(input: TranscoderJobInput): Promise<TranscoderJobHandle>;
  parseEvent(rawPubSubMessage: unknown): Promise<TranscoderEvent>;
  cancelJob(jobName: string): Promise<void>;
}
```

- [ ] **Step 2: Confirm the file typechecks**

```bash
pnpm typecheck
```

Expected: PASS. No consumers yet.

- [ ] **Step 3: Commit**

```bash
git add libs/api-video/src/lib/transcoder/transcoder.port.ts
git commit -m "feat(api-video): VideoTranscoder port + TranscoderEvent envelope"
```

---

## Task 5: `TranscoderJobBuilder` (pure function)

**Files:**
- Create: `libs/api-video/src/lib/transcoder/transcoder-job.builder.ts`
- Create: `libs/api-video/src/lib/transcoder/transcoder-job.builder.spec.ts`

This is the pure-function core: a `JobConfig` object suitable for passing to `TranscoderServiceClient.createJob`. The builder filters renditions whose height exceeds the source height (architecture spec §9.1 "skip upscale"). Slice B's spec §6.1 locks the bitrate ladder.

- [ ] **Step 1: Write failing tests**

Create `libs/api-video/src/lib/transcoder/transcoder-job.builder.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { VideoId, VideoKeyId } from '@learnwren/shared-data-models';

import { buildJobConfig, RENDITIONS } from './transcoder-job.builder';

const baseInput = () => ({
  videoId: 'v1' as VideoId,
  sourceUri: 'gs://src/videos/v1/source.mp4',
  outputUriPrefix: 'gs://out/videos/v1/hls/',
  encryptionKey: { id: 'k1' as VideoKeyId, bytes: new Uint8Array(16) },
  sourceHeight: 1080,
  topic: 'projects/p/topics/t',
});

describe('buildJobConfig', () => {
  it('emits one elementary video stream per applicable rendition', () => {
    const cfg = buildJobConfig(baseInput());
    const videoStreams = cfg.elementaryStreams.filter((s) => s.videoStream);
    expect(videoStreams).toHaveLength(RENDITIONS.length);
  });

  it('emits one elementary audio stream', () => {
    const cfg = buildJobConfig(baseInput());
    const audioStreams = cfg.elementaryStreams.filter((s) => s.audioStream);
    expect(audioStreams).toHaveLength(1);
    expect(audioStreams[0]!.audioStream!.bitrateBps).toBe(128_000);
  });

  it('filters renditions taller than the source', () => {
    const cfg = buildJobConfig({ ...baseInput(), sourceHeight: 480 });
    const heights = cfg.elementaryStreams
      .flatMap((s) => (s.videoStream ? [s.videoStream.h264!.heightPixels] : []))
      .sort((a, b) => a - b);
    expect(heights).toEqual([360, 480]);
  });

  it('emits one HLS mux stream per video rendition', () => {
    const cfg = buildJobConfig(baseInput());
    const hlsMux = cfg.muxStreams.filter((m) => m.container === 'ts');
    expect(hlsMux).toHaveLength(RENDITIONS.length);
  });

  it('configures AES-128 segment encryption with the supplied key bytes', () => {
    const bytes = new Uint8Array(16).fill(0x42);
    const cfg = buildJobConfig({
      ...baseInput(),
      encryptionKey: { id: 'k1' as VideoKeyId, bytes },
    });
    expect(cfg.encryptions).toBeDefined();
    expect(cfg.encryptions!).toHaveLength(1);
    const enc = cfg.encryptions![0]!;
    expect(enc.aes128).toBeDefined();
    expect(enc.secretManagerKeySource).toBeUndefined();
    // The builder hands the key bytes to the encryption stanza; the adapter
    // is responsible for translating into the SDK's accepted shape.
    expect(enc.id).toBe('k1');
  });

  it('routes job completion events to the configured Pub/Sub topic', () => {
    const cfg = buildJobConfig(baseInput());
    expect(cfg.pubsubDestination?.topic).toBe('projects/p/topics/t');
  });

  it('labels the job with the videoId for webhook correlation', () => {
    const cfg = buildJobConfig(baseInput());
    expect(cfg.labels?.['videoid']).toBe('v1');
  });

  it('wires HLS manifest at the conventional output path', () => {
    const cfg = buildJobConfig(baseInput());
    const manifest = cfg.manifests?.find((m) => m.type === 'HLS');
    expect(manifest?.fileName).toBe('manifest.m3u8');
    expect(cfg.output?.uri).toBe('gs://out/videos/v1/hls/');
  });

  it('uses 6-second segments and 2-second key-frame interval', () => {
    const cfg = buildJobConfig(baseInput());
    const muxTs = cfg.muxStreams.find((m) => m.container === 'ts')!;
    expect(muxTs.segmentSettings?.segmentDuration?.seconds).toBe(6);
    const stream = cfg.elementaryStreams.find((s) => s.videoStream)!;
    expect(stream.videoStream!.h264!.gopDuration?.seconds).toBe(2);
  });

  it('throws when sourceHeight is below the lowest rendition', () => {
    expect(() => buildJobConfig({ ...baseInput(), sourceHeight: 240 })).toThrow(
      /sourceHeight/,
    );
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

```bash
pnpm nx test api-video -- transcoder-job.builder
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `transcoder-job.builder.ts`**

Create `libs/api-video/src/lib/transcoder/transcoder-job.builder.ts`:

```ts
import type { TranscoderJobInput } from './transcoder.port';

export const RENDITIONS = [
  { name: '1080p', height: 1080, bitrateBps: 5_000_000 },
  { name: '720p', height: 720, bitrateBps: 3_000_000 },
  { name: '480p', height: 480, bitrateBps: 1_500_000 },
  { name: '360p', height: 360, bitrateBps: 800_000 },
] as const;

const SEGMENT_DURATION_S = 6;
const KEY_FRAME_INTERVAL_S = 2;
const AUDIO_BITRATE_BPS = 128_000;

export interface JobConfig {
  inputs: { key: 'input0'; uri: string }[];
  output: { uri: string };
  elementaryStreams: ElementaryStream[];
  muxStreams: MuxStream[];
  manifests?: { fileName: string; type: 'HLS'; muxStreams: string[] }[];
  encryptions?: {
    id: string;
    aes128: Record<string, never>;            // marker shape; bytes carried separately by the adapter
    drmSystems?: undefined;
    secretManagerKeySource?: undefined;
  }[];
  pubsubDestination?: { topic: string };
  labels?: Record<string, string>;
}

interface ElementaryStream {
  key: string;
  videoStream?: {
    h264: {
      heightPixels: number;
      bitrateBps: number;
      frameRate: number;
      gopDuration: { seconds: number };
    };
  };
  audioStream?: { codec: 'aac'; bitrateBps: number };
}

interface MuxStream {
  key: string;
  container: 'ts';
  elementaryStreams: string[];
  segmentSettings: { segmentDuration: { seconds: number } };
  encryptionId?: string;
}

export function buildJobConfig(input: TranscoderJobInput): JobConfig {
  const renditions = RENDITIONS.filter((r) => r.height <= input.sourceHeight);
  if (renditions.length === 0) {
    throw new Error(
      `sourceHeight ${input.sourceHeight}px is below the lowest supported rendition ` +
        `(${RENDITIONS[RENDITIONS.length - 1]!.height}px).`,
    );
  }

  const elementaryStreams: ElementaryStream[] = [
    ...renditions.map((r) => ({
      key: `video_${r.name}`,
      videoStream: {
        h264: {
          heightPixels: r.height,
          bitrateBps: r.bitrateBps,
          frameRate: 30,
          gopDuration: { seconds: KEY_FRAME_INTERVAL_S },
        },
      },
    })),
    { key: 'audio_aac', audioStream: { codec: 'aac', bitrateBps: AUDIO_BITRATE_BPS } },
  ];

  const muxStreams: MuxStream[] = renditions.map((r) => ({
    key: `hls_${r.name}`,
    container: 'ts',
    elementaryStreams: [`video_${r.name}`, 'audio_aac'],
    segmentSettings: { segmentDuration: { seconds: SEGMENT_DURATION_S } },
    encryptionId: input.encryptionKey.id,
  }));

  return {
    inputs: [{ key: 'input0', uri: input.sourceUri }],
    output: { uri: input.outputUriPrefix },
    elementaryStreams,
    muxStreams,
    manifests: [
      {
        fileName: 'manifest.m3u8',
        type: 'HLS',
        muxStreams: muxStreams.map((m) => m.key),
      },
    ],
    encryptions: [
      {
        id: input.encryptionKey.id,
        aes128: {},
      },
    ],
    pubsubDestination: { topic: input.topic },
    // Job labels must be lower-case alphanum + dashes; we lower-case the field name.
    labels: { videoid: input.videoId as string },
  };
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm nx test api-video -- transcoder-job.builder
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/api-video/src/lib/transcoder/transcoder-job.builder.ts \
        libs/api-video/src/lib/transcoder/transcoder-job.builder.spec.ts
git commit -m "feat(api-video): TranscoderJobBuilder — bitrate ladder + skip-upscale + AES-128 wiring"
```

---

## Task 6: `FakeTranscoderAdapter`

**Files:**
- Create: `libs/api-video/src/lib/transcoder/fake-transcoder.adapter.ts`
- Create: `libs/api-video/src/lib/transcoder/fake-transcoder.adapter.spec.ts`

In-memory adapter for CI and local dev. Its `submitJob` records jobs but performs no work; its `parseEvent` decodes the same Pub/Sub envelope shape as the real adapter; its `cancelJob` is a no-op.

- [ ] **Step 1: Write failing tests**

Create `libs/api-video/src/lib/transcoder/fake-transcoder.adapter.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { VideoId, VideoKeyId } from '@learnwren/shared-data-models';

import { FakeTranscoderAdapter } from './fake-transcoder.adapter';

const baseInput = () => ({
  videoId: 'v1' as VideoId,
  sourceUri: 'gs://src/videos/v1/source.mp4',
  outputUriPrefix: 'gs://out/videos/v1/hls/',
  encryptionKey: { id: 'k1' as VideoKeyId, bytes: new Uint8Array(16) },
  sourceHeight: 1080,
  topic: 'projects/p/topics/t',
});

describe('FakeTranscoderAdapter.submitJob', () => {
  it('returns a synthetic job name derived from videoId', async () => {
    const adapter = new FakeTranscoderAdapter();
    const { jobName } = await adapter.submitJob(baseInput());
    expect(jobName).toMatch(/^fake-job-v1-/);
  });

  it('records the job for later lookup', async () => {
    const adapter = new FakeTranscoderAdapter();
    const { jobName } = await adapter.submitJob(baseInput());
    expect(adapter.peekJob(jobName)).toBeDefined();
  });
});

function pubsubEnvelope(payload: object): unknown {
  return {
    message: {
      data: Buffer.from(JSON.stringify(payload)).toString('base64'),
      messageId: 'm1',
      publishTime: '2026-05-13T00:00:00Z',
    },
    subscription: 'projects/p/subscriptions/s',
  };
}

describe('FakeTranscoderAdapter.parseEvent', () => {
  it('parses a JOB_SUCCEEDED payload', async () => {
    const adapter = new FakeTranscoderAdapter();
    const env = pubsubEnvelope({
      job: {
        name: 'projects/p/locations/l/jobs/j1',
        state: 'SUCCEEDED',
        labels: { videoid: 'v1' },
        output: { uri: 'gs://out/videos/v1/hls/' },
      },
      eventTime: '2026-05-13T00:00:00Z',
    });
    const ev = await adapter.parseEvent(env);
    if (ev.type !== 'JOB_SUCCEEDED') throw new Error('expected SUCCEEDED');
    expect(ev.videoId).toBe('v1');
    expect(ev.manifestPath).toBe('videos/v1/hls/manifest.m3u8');
    expect(ev.durationSec).toBeGreaterThan(0);
  });

  it('parses a JOB_FAILED payload', async () => {
    const adapter = new FakeTranscoderAdapter();
    const env = pubsubEnvelope({
      job: {
        name: 'projects/p/locations/l/jobs/j1',
        state: 'FAILED',
        labels: { videoid: 'v1' },
        output: { uri: 'gs://out/videos/v1/hls/' },
        error: { code: 3, message: 'unsupported codec' },
      },
      eventTime: '2026-05-13T00:00:00Z',
    });
    const ev = await adapter.parseEvent(env);
    if (ev.type !== 'JOB_FAILED') throw new Error('expected FAILED');
    expect(ev.reason).toContain('unsupported codec');
  });

  it('throws on missing labels.videoid', async () => {
    const adapter = new FakeTranscoderAdapter();
    const env = pubsubEnvelope({
      job: { name: 'n', state: 'SUCCEEDED', labels: {} },
      eventTime: 'x',
    });
    await expect(adapter.parseEvent(env)).rejects.toThrow(/videoid/);
  });

  it('caps reason at 500 chars', async () => {
    const adapter = new FakeTranscoderAdapter();
    const long = 'x'.repeat(600);
    const env = pubsubEnvelope({
      job: {
        name: 'n',
        state: 'FAILED',
        labels: { videoid: 'v1' },
        error: { code: 13, message: long },
      },
      eventTime: 'x',
    });
    const ev = await adapter.parseEvent(env);
    if (ev.type !== 'JOB_FAILED') throw new Error('expected FAILED');
    expect(ev.reason.length).toBe(500);
  });
});

describe('FakeTranscoderAdapter.cancelJob', () => {
  it('is a no-op for unknown jobs', async () => {
    const adapter = new FakeTranscoderAdapter();
    await expect(adapter.cancelJob('unknown')).resolves.toBeUndefined();
  });

  it('marks known jobs cancelled', async () => {
    const adapter = new FakeTranscoderAdapter();
    const { jobName } = await adapter.submitJob(baseInput());
    await adapter.cancelJob(jobName);
    expect(adapter.peekJob(jobName)?.cancelled).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

```bash
pnpm nx test api-video -- fake-transcoder.adapter
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `fake-transcoder.adapter.ts`**

Create `libs/api-video/src/lib/transcoder/fake-transcoder.adapter.ts`:

```ts
import { Injectable } from '@nestjs/common';

import type { VideoId } from '@learnwren/shared-data-models';

import type {
  TranscoderEvent,
  TranscoderJobHandle,
  TranscoderJobInput,
  VideoTranscoder,
} from './transcoder.port';

interface FakeJobRecord {
  input: TranscoderJobInput;
  cancelled: boolean;
}

interface PubSubEnvelope {
  message?: { data?: string };
}

interface TranscoderPayload {
  job?: {
    name?: string;
    state?: 'SUCCEEDED' | 'FAILED';
    labels?: Record<string, string>;
    output?: { uri?: string };
    error?: { code?: number; message?: string };
  };
}

@Injectable()
export class FakeTranscoderAdapter implements VideoTranscoder {
  private readonly jobs = new Map<string, FakeJobRecord>();

  async submitJob(input: TranscoderJobInput): Promise<TranscoderJobHandle> {
    const jobName = `fake-job-${input.videoId}-${Date.now()}-${this.jobs.size}`;
    this.jobs.set(jobName, { input, cancelled: false });
    return { jobName };
  }

  async parseEvent(raw: unknown): Promise<TranscoderEvent> {
    const envelope = raw as PubSubEnvelope;
    const dataB64 = envelope.message?.data;
    if (!dataB64) throw new Error('Pub/Sub envelope missing message.data.');
    const payload = JSON.parse(Buffer.from(dataB64, 'base64').toString('utf-8')) as TranscoderPayload;
    const job = payload.job;
    if (!job) throw new Error('Pub/Sub payload missing job.');
    const videoId = job.labels?.['videoid'];
    if (!videoId) throw new Error('Pub/Sub payload missing labels.videoid.');
    const jobName = job.name ?? '';

    if (job.state === 'SUCCEEDED') {
      return {
        type: 'JOB_SUCCEEDED',
        jobName,
        videoId: videoId as VideoId,
        manifestPath: `videos/${videoId}/hls/manifest.m3u8`,
        durationSec: 60, // synthetic; tests assert > 0
      };
    }
    if (job.state === 'FAILED') {
      const raw = job.error?.message ?? 'unknown';
      return {
        type: 'JOB_FAILED',
        jobName,
        videoId: videoId as VideoId,
        reason: raw.slice(0, 500),
      };
    }
    throw new Error(`Unexpected job.state: ${String(job.state)}`);
  }

  async cancelJob(jobName: string): Promise<void> {
    const rec = this.jobs.get(jobName);
    if (rec) rec.cancelled = true;
  }

  // Test helper — not part of the VideoTranscoder interface.
  peekJob(jobName: string): FakeJobRecord | undefined {
    return this.jobs.get(jobName);
  }
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm nx test api-video -- fake-transcoder.adapter
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/api-video/src/lib/transcoder/fake-transcoder.adapter.ts \
        libs/api-video/src/lib/transcoder/fake-transcoder.adapter.spec.ts
git commit -m "feat(api-video): FakeTranscoderAdapter for CI + local dev"
```

---

## Task 7: `GcpTranscoderAdapter`

**Files:**
- Create: `libs/api-video/src/lib/transcoder/gcp-transcoder.adapter.ts`
- Create: `libs/api-video/src/lib/transcoder/gcp-transcoder.adapter.spec.ts`
- Modify: `package.json` (add `@google-cloud/video-transcoder` dep)

Real implementation wrapping `@google-cloud/video-transcoder`'s `TranscoderServiceClient`. Tests inject a mock client; the unit suite never reaches a real GCP API.

- [ ] **Step 1: Install the SDK**

```bash
pnpm add @google-cloud/video-transcoder@latest
```

- [ ] **Step 2: Write failing tests**

Create `libs/api-video/src/lib/transcoder/gcp-transcoder.adapter.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import type { VideoId, VideoKeyId } from '@learnwren/shared-data-models';

import { GcpTranscoderAdapter } from './gcp-transcoder.adapter';

interface MockClient {
  createJob: ReturnType<typeof vi.fn>;
  getJob: ReturnType<typeof vi.fn>;
  cancelJob: ReturnType<typeof vi.fn>;
}

function makeClient(): MockClient {
  return { createJob: vi.fn(), getJob: vi.fn(), cancelJob: vi.fn() };
}

function makeAdapter(client: MockClient): GcpTranscoderAdapter {
  return new GcpTranscoderAdapter({
    client: client as unknown as ConstructorParameters<typeof GcpTranscoderAdapter>[0]['client'],
    projectId: 'proj',
    location: 'us-central1',
  });
}

const baseInput = () => ({
  videoId: 'v1' as VideoId,
  sourceUri: 'gs://src/videos/v1/source.mp4',
  outputUriPrefix: 'gs://out/videos/v1/hls/',
  encryptionKey: { id: 'k1' as VideoKeyId, bytes: new Uint8Array(16).fill(7) },
  sourceHeight: 1080,
  topic: 'projects/proj/topics/t',
});

describe('GcpTranscoderAdapter.submitJob', () => {
  it('passes the built JobConfig + key bytes to the client and returns the job name', async () => {
    const client = makeClient();
    client.createJob.mockResolvedValue([
      { name: 'projects/proj/locations/us-central1/jobs/abc' },
    ]);
    const adapter = makeAdapter(client);
    const handle = await adapter.submitJob(baseInput());
    expect(handle.jobName).toBe('projects/proj/locations/us-central1/jobs/abc');
    expect(client.createJob).toHaveBeenCalledTimes(1);
    const [arg] = client.createJob.mock.calls[0]!;
    expect(arg.parent).toBe('projects/proj/locations/us-central1');
    expect(arg.job.config.elementaryStreams.some((s: { videoStream?: unknown }) => s.videoStream)).toBe(true);
    const enc = arg.job.config.encryptions?.[0];
    expect(enc?.id).toBe('k1');
    expect(enc?.aes128?.keyBytes).toEqual(Buffer.from(baseInput().encryptionKey.bytes));
  });

  it('propagates createJob errors', async () => {
    const client = makeClient();
    client.createJob.mockRejectedValue(new Error('quota exhausted'));
    const adapter = makeAdapter(client);
    await expect(adapter.submitJob(baseInput())).rejects.toThrow(/quota/);
  });
});

function envelope(payload: object): unknown {
  return { message: { data: Buffer.from(JSON.stringify(payload)).toString('base64') } };
}

describe('GcpTranscoderAdapter.parseEvent — JOB_SUCCEEDED', () => {
  it('calls getJob to obtain output duration and returns a JOB_SUCCEEDED event', async () => {
    const client = makeClient();
    client.getJob.mockResolvedValue([
      {
        name: 'projects/proj/locations/l/jobs/j1',
        output: { uri: 'gs://out/videos/v1/hls/' },
        outputDurationSec: 123,
      },
    ]);
    const adapter = makeAdapter(client);
    const ev = await adapter.parseEvent(
      envelope({
        job: {
          name: 'projects/proj/locations/l/jobs/j1',
          state: 'SUCCEEDED',
          labels: { videoid: 'v1' },
          output: { uri: 'gs://out/videos/v1/hls/' },
        },
      }),
    );
    if (ev.type !== 'JOB_SUCCEEDED') throw new Error('expected SUCCEEDED');
    expect(client.getJob).toHaveBeenCalledTimes(1);
    expect(ev.durationSec).toBe(123);
    expect(ev.manifestPath).toBe('videos/v1/hls/manifest.m3u8');
    expect(ev.videoId).toBe('v1');
  });

  it('propagates getJob failure (webhook returns 5xx so Pub/Sub retries)', async () => {
    const client = makeClient();
    client.getJob.mockRejectedValue(new Error('transient'));
    const adapter = makeAdapter(client);
    await expect(
      adapter.parseEvent(
        envelope({
          job: { name: 'j', state: 'SUCCEEDED', labels: { videoid: 'v1' }, output: { uri: 'gs://x/y/' } },
        }),
      ),
    ).rejects.toThrow(/transient/);
  });
});

describe('GcpTranscoderAdapter.parseEvent — JOB_FAILED', () => {
  it('does not call getJob and returns a JOB_FAILED event', async () => {
    const client = makeClient();
    const adapter = makeAdapter(client);
    const ev = await adapter.parseEvent(
      envelope({
        job: { name: 'j', state: 'FAILED', labels: { videoid: 'v1' }, error: { code: 3, message: 'codec failure' } },
      }),
    );
    if (ev.type !== 'JOB_FAILED') throw new Error('expected FAILED');
    expect(client.getJob).not.toHaveBeenCalled();
    expect(ev.reason).toContain('codec failure');
  });
});

describe('GcpTranscoderAdapter.parseEvent — malformed input', () => {
  it('throws on missing labels.videoid', async () => {
    const adapter = makeAdapter(makeClient());
    await expect(
      adapter.parseEvent(envelope({ job: { name: 'j', state: 'SUCCEEDED', labels: {} } })),
    ).rejects.toThrow(/videoid/);
  });
  it('throws on missing message.data', async () => {
    const adapter = makeAdapter(makeClient());
    await expect(adapter.parseEvent({ message: {} })).rejects.toThrow(/data/);
  });
});

describe('GcpTranscoderAdapter.cancelJob', () => {
  it('calls client.cancelJob with the job name', async () => {
    const client = makeClient();
    client.cancelJob.mockResolvedValue([{}]);
    const adapter = makeAdapter(client);
    await adapter.cancelJob('projects/proj/locations/l/jobs/j1');
    expect(client.cancelJob).toHaveBeenCalledWith({ name: 'projects/proj/locations/l/jobs/j1' });
  });
  it('swallows NOT_FOUND from the SDK', async () => {
    const client = makeClient();
    const notFound = Object.assign(new Error('not found'), { code: 5 });
    client.cancelJob.mockRejectedValue(notFound);
    const adapter = makeAdapter(client);
    await expect(adapter.cancelJob('j')).resolves.toBeUndefined();
  });
  it('propagates other errors', async () => {
    const client = makeClient();
    client.cancelJob.mockRejectedValue(new Error('boom'));
    const adapter = makeAdapter(client);
    await expect(adapter.cancelJob('j')).rejects.toThrow(/boom/);
  });
});
```

- [ ] **Step 3: Run tests, expect failure**

```bash
pnpm nx test api-video -- gcp-transcoder.adapter
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement `gcp-transcoder.adapter.ts`**

Create `libs/api-video/src/lib/transcoder/gcp-transcoder.adapter.ts`:

```ts
import { Injectable } from '@nestjs/common';

import type { VideoId } from '@learnwren/shared-data-models';

import { buildJobConfig } from './transcoder-job.builder';
import type {
  TranscoderEvent,
  TranscoderJobHandle,
  TranscoderJobInput,
  VideoTranscoder,
} from './transcoder.port';

// Minimal structural type for the subset of TranscoderServiceClient we use.
export interface TranscoderClient {
  createJob(req: { parent: string; job: { config: unknown } }): Promise<[{ name?: string | null }]>;
  getJob(req: { name: string }): Promise<
    [{ name?: string | null; outputDurationSec?: number; output?: { uri?: string } }]
  >;
  cancelJob(req: { name: string }): Promise<[unknown]>;
}

interface PubSubEnvelope { message?: { data?: string } }

interface TranscoderPayload {
  job?: {
    name?: string;
    state?: 'SUCCEEDED' | 'FAILED';
    labels?: Record<string, string>;
    output?: { uri?: string };
    error?: { code?: number; message?: string };
  };
}

export interface GcpTranscoderAdapterOptions {
  client: TranscoderClient;
  projectId: string;
  location: string;
}

@Injectable()
export class GcpTranscoderAdapter implements VideoTranscoder {
  constructor(private readonly opts: GcpTranscoderAdapterOptions) {}

  async submitJob(input: TranscoderJobInput): Promise<TranscoderJobHandle> {
    const cfg = buildJobConfig(input);
    const sdkConfig = {
      ...cfg,
      encryptions: cfg.encryptions?.map((e) => ({
        id: e.id,
        aes128: { keyBytes: Buffer.from(input.encryptionKey.bytes) },
      })),
    };
    const parent = `projects/${this.opts.projectId}/locations/${this.opts.location}`;
    const [job] = await this.opts.client.createJob({ parent, job: { config: sdkConfig } });
    return { jobName: job.name ?? '' };
  }

  async parseEvent(raw: unknown): Promise<TranscoderEvent> {
    const envelope = raw as PubSubEnvelope;
    const dataB64 = envelope.message?.data;
    if (!dataB64) throw new Error('Pub/Sub envelope missing message.data.');
    const payload = JSON.parse(Buffer.from(dataB64, 'base64').toString('utf-8')) as TranscoderPayload;
    const job = payload.job;
    if (!job) throw new Error('Pub/Sub payload missing job.');
    const videoId = job.labels?.['videoid'];
    if (!videoId) throw new Error('Pub/Sub payload missing labels.videoid.');
    const jobName = job.name ?? '';

    if (job.state === 'SUCCEEDED') {
      const [full] = await this.opts.client.getJob({ name: jobName });
      const durationSec = Number(full.outputDurationSec ?? 0);
      return {
        type: 'JOB_SUCCEEDED',
        jobName,
        videoId: videoId as VideoId,
        manifestPath: `videos/${videoId}/hls/manifest.m3u8`,
        durationSec,
      };
    }
    if (job.state === 'FAILED') {
      return {
        type: 'JOB_FAILED',
        jobName,
        videoId: videoId as VideoId,
        reason: (job.error?.message ?? 'unknown').slice(0, 500),
      };
    }
    throw new Error(`Unexpected job.state: ${String(job.state)}`);
  }

  async cancelJob(jobName: string): Promise<void> {
    try {
      await this.opts.client.cancelJob({ name: jobName });
    } catch (err) {
      const code = (err as { code?: number }).code;
      if (code === 5) return; // gRPC NOT_FOUND — tolerate.
      throw err;
    }
  }
}
```

- [ ] **Step 5: Run tests, expect pass**

```bash
pnpm nx test api-video -- gcp-transcoder.adapter
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/api-video/src/lib/transcoder/gcp-transcoder.adapter.ts \
        libs/api-video/src/lib/transcoder/gcp-transcoder.adapter.spec.ts \
        package.json pnpm-lock.yaml
git commit -m "feat(api-video): GcpTranscoderAdapter using @google-cloud/video-transcoder"
```

---

## Task 8: ffprobe source-height probe on `VideoStorageAdapter`

**Files:**
- Modify: `libs/api-video/src/lib/video-storage.adapter.ts`
- Create: `libs/api-video/src/lib/video-storage.adapter.spec.ts`
- Modify: `package.json` (add `@ffprobe-installer/ffprobe` dep)

`VideoStorageAdapter` grows two methods: `probeSource` (runs ffprobe against a short-TTL signed read URL, returns `{ height, durationSec }`) and `deletePrefix` (recursive output-bucket cleanup on DELETE of a READY video). ffprobe runs as a subprocess against the bundled binary from `@ffprobe-installer/ffprobe`.

- [ ] **Step 1: Install ffprobe**

```bash
pnpm add @ffprobe-installer/ffprobe@latest
```

- [ ] **Step 2: Write failing tests**

Create `libs/api-video/src/lib/video-storage.adapter.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import { VideoStorageAdapter } from './video-storage.adapter';

function makeAdapterWithRunner(runner: ReturnType<typeof vi.fn>, file: object): VideoStorageAdapter {
  const bucket = { file: () => file, deleteFiles: vi.fn(async () => [[]]) };
  const storage = { bucket: () => bucket };
  const adapter = new VideoStorageAdapter(storage as never);
  adapter.__setRunner(runner as never);
  return adapter;
}

describe('VideoStorageAdapter.probeSource', () => {
  it('returns height and durationSec parsed from ffprobe output', async () => {
    const runner = vi.fn(async () => ({
      stdout: JSON.stringify({
        streams: [
          { codec_type: 'video', height: 720, width: 1280 },
          { codec_type: 'audio' },
        ],
        format: { duration: '42.50' },
      }),
    }));
    const file = { getSignedUrl: vi.fn(async () => ['https://signed.example/path']) };
    const adapter = makeAdapterWithRunner(runner, file);
    const result = await adapter.probeSource({ bucket: 'b', path: 'videos/v/source.mp4' });
    expect(result.height).toBe(720);
    expect(result.durationSec).toBe(42.5);
    expect(file.getSignedUrl).toHaveBeenCalledWith(expect.objectContaining({ action: 'read' }));
  });

  it('throws when no video stream is present', async () => {
    const runner = vi.fn(async () => ({
      stdout: JSON.stringify({ streams: [{ codec_type: 'audio' }], format: { duration: '1' } }),
    }));
    const file = { getSignedUrl: vi.fn(async () => ['https://x']) };
    const adapter = makeAdapterWithRunner(runner, file);
    await expect(adapter.probeSource({ bucket: 'b', path: 'p' })).rejects.toThrow(/no video stream/i);
  });

  it('throws when the runner rejects', async () => {
    const runner = vi.fn(async () => { throw new Error('ffprobe exited with code 1'); });
    const file = { getSignedUrl: vi.fn(async () => ['https://x']) };
    const adapter = makeAdapterWithRunner(runner, file);
    await expect(adapter.probeSource({ bucket: 'b', path: 'p' })).rejects.toThrow(/ffprobe/);
  });
});

describe('VideoStorageAdapter.deletePrefix', () => {
  it('calls bucket.deleteFiles with the prefix', async () => {
    const deleteFiles = vi.fn(async () => [[]]);
    const bucket = { deleteFiles };
    const storage = { bucket: () => bucket };
    const adapter = new VideoStorageAdapter(storage as never);
    await adapter.deletePrefix({ bucket: 'b', prefix: 'videos/v1/' });
    expect(deleteFiles).toHaveBeenCalledWith({ prefix: 'videos/v1/' });
  });

  it('swallows errors (best-effort)', async () => {
    const bucket = { deleteFiles: vi.fn(async () => { throw new Error('rate-limited'); }) };
    const storage = { bucket: () => bucket };
    const adapter = new VideoStorageAdapter(storage as never);
    await expect(adapter.deletePrefix({ bucket: 'b', prefix: 'p/' })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 3: Run tests, expect failure**

```bash
pnpm nx test api-video -- video-storage.adapter.spec
```

Expected: FAIL — `probeSource`, `__setRunner`, `deletePrefix` not defined.

- [ ] **Step 4: Extend `video-storage.adapter.ts`**

Replace the contents of `libs/api-video/src/lib/video-storage.adapter.ts` with the listing in **Appendix A (Task 8 implementation)** at the end of this plan. The implementation uses `node:child_process.execFile` (the safe variant — no shell) wrapped in `node:util.promisify` to run the bundled ffprobe binary. The runner is overridable via the `__setRunner` test hook for unit tests.

- [ ] **Step 5: Run tests, expect pass**

```bash
pnpm nx test api-video -- video-storage.adapter
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/api-video/src/lib/video-storage.adapter.ts \
        libs/api-video/src/lib/video-storage.adapter.spec.ts \
        package.json pnpm-lock.yaml
git commit -m "feat(api-video): ffprobe source probe + recursive prefix delete on VideoStorageAdapter"
```

---

## Task 9: Add slice B exceptions + error codes

**Files:**
- Modify: `libs/api-video/src/lib/errors/video-error.codes.ts`
- Modify: `libs/api-video/src/lib/errors/video.exception.ts`
- Modify: `libs/api-video/src/lib/errors/video.exception.spec.ts`

Slice B adds five new error scenarios. Three are persisted as `Video.failureReason` strings (set by the service, not thrown to the client) and two are HTTP-shaped exceptions thrown by the webhook guard.

- [ ] **Step 1: Extend the error-code union**

Replace `libs/api-video/src/lib/errors/video-error.codes.ts` with:

```ts
export type VideoErrorCode =
  | 'VALIDATION_FAILED'
  | 'NOT_VIDEO_OWNER'
  | 'VIDEO_NOT_FOUND'
  | 'LESSON_ALREADY_HAS_VIDEO'
  | 'INVALID_VIDEO_STATE'
  | 'UPLOAD_OBJECT_MISSING'
  | 'UPLOAD_OBJECT_SIZE_MISMATCH'
  | 'PUBSUB_INVALID_TOKEN'
  | 'PUBSUB_WRONG_AUDIENCE'
  | 'PUBSUB_WRONG_INVOKER'
  | 'INTERNAL';
```

`SOURCE_PROBE_FAILED`, `TRANSCODER_SUBMIT_FAILED`, and `TRANSCODE_FAILED` live in `Video.failureReason` (a string), not as HTTP codes — instructors see the FAILED badge and re-upload.

- [ ] **Step 2: Add Pub/Sub exceptions**

Append to `libs/api-video/src/lib/errors/video.exception.ts`:

```ts
export class PubSubInvalidTokenException extends VideoException {
  constructor(detail?: string) {
    super(
      'PUBSUB_INVALID_TOKEN',
      detail ? `Pub/Sub OIDC token invalid: ${detail}.` : 'Pub/Sub OIDC token invalid.',
      401,
    );
  }
}

export class PubSubWrongAudienceException extends VideoException {
  constructor() {
    super(
      'PUBSUB_WRONG_AUDIENCE',
      'Pub/Sub OIDC token audience does not match the configured webhook URL.',
      403,
    );
  }
}

export class PubSubWrongInvokerException extends VideoException {
  constructor() {
    super(
      'PUBSUB_WRONG_INVOKER',
      'Pub/Sub OIDC token email does not match the configured invoker service account.',
      403,
    );
  }
}
```

- [ ] **Step 3: Cover the new exceptions in `video.exception.spec.ts`**

Append to `libs/api-video/src/lib/errors/video.exception.spec.ts`:

```ts
import {
  PubSubInvalidTokenException,
  PubSubWrongAudienceException,
  PubSubWrongInvokerException,
} from './video.exception';

describe('Pub/Sub exceptions', () => {
  it('PubSubInvalidTokenException has status 401 and correct code', () => {
    const e = new PubSubInvalidTokenException('expired');
    expect(e.status).toBe(401);
    expect(e.code).toBe('PUBSUB_INVALID_TOKEN');
    expect(e.message).toContain('expired');
  });

  it('PubSubInvalidTokenException without detail uses generic message', () => {
    const e = new PubSubInvalidTokenException();
    expect(e.message).toBe('Pub/Sub OIDC token invalid.');
  });

  it('PubSubWrongAudienceException has status 403 and correct code', () => {
    const e = new PubSubWrongAudienceException();
    expect(e.status).toBe(403);
    expect(e.code).toBe('PUBSUB_WRONG_AUDIENCE');
  });

  it('PubSubWrongInvokerException has status 403 and correct code', () => {
    const e = new PubSubWrongInvokerException();
    expect(e.status).toBe(403);
    expect(e.code).toBe('PUBSUB_WRONG_INVOKER');
  });
});
```

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm nx test api-video -- errors
```

Expected: PASS (including all slice A error tests).

- [ ] **Step 5: Commit**

```bash
git add libs/api-video/src/lib/errors/
git commit -m "feat(api-video): Pub/Sub auth exceptions for slice B webhook"
```

---

## Task 10: Extend `VideoRepository` — VideoKey writes inside transactions; transition methods

**Files:**
- Modify: `libs/api-video/src/lib/video.repository.ts`

Slice B needs four repo changes:
1. `finalizeUpload` becomes `finalizeUploadWithJob` — accepts `keyId`, `key`, `transcoderJobName`, advances state to `TRANSCODING` (or `FAILED` on the failure path), writes `VideoKey`, and updates `Lesson.videoId`, all inside one transaction.
2. `markFailedFromSubmission` — a separate transactional method for the probe/submit-fail path: advances state to `FAILED` without writing a `VideoKey` and without updating `Lesson.videoId` (lesson never sees a half-finished video).
3. `applyTranscoderResult` — webhook entry point. Loads Video; validates state and jobName; if valid, transitions to `READY` or `FAILED` with the event's fields. Returns `{ acted, reason }`.
4. `deleteVideoAndDetach` already exists from slice A — slice B reuses it as-is and only changes the state check at the **service** layer. No repo change required for delete.

- [ ] **Step 1: Write failing tests**

Append to `libs/api-video/src/lib/video.service.spec.ts` is not the right place (that file is the service unit suite). Repository tests live in api-e2e (slice A pattern: repository is in the mutation-excluded set). Skip repo unit tests; api-e2e covers them. For now, just verify type signatures by typechecking.

- [ ] **Step 2: Replace `finalizeUpload` with `finalizeUploadWithJob` + add new methods**

Open `libs/api-video/src/lib/video.repository.ts`. Replace the `finalizeUpload` method with the following, and add `markFailedFromSubmission` and `applyTranscoderResult` after `deleteVideoAndDetach`:

```ts
async finalizeUploadWithJob(args: {
  vid: VideoId;
  lid: LessonId;
  actualSizeBytes: number;
  key: { id: VideoKeyId; bytes: Uint8Array };
  transcoderJobName: string;
  nowIso: string;
}): Promise<Video> {
  const videoRef = this.db.collection('videos').doc(args.vid);
  const keyRef = this.db.collection('videoKeys').doc(args.key.id);
  const lessonQ = this.db.collectionGroup('lessons').where('id', '==', args.lid).limit(1);

  return this.db.runTransaction(async (tx) => {
    const videoSnap = await tx.get(videoRef);
    if (!videoSnap.exists) throw new Error('Video disappeared in transaction.');
    const lessonSnap = await tx.get(lessonQ);
    if (lessonSnap.empty) throw new Error('Lesson disappeared in transaction.');
    const lessonDocRef = lessonSnap.docs[0]!.ref;

    const current = videoSnap.data() as Video;
    const updated: Video = {
      ...current,
      state: 'TRANSCODING',
      source: { ...current.source, sizeBytes: args.actualSizeBytes },
      keyId: args.key.id,
      transcoderJobName: args.transcoderJobName,
      updatedAt: args.nowIso as Video['updatedAt'],
    };
    const keyDoc: VideoKey = {
      id: args.key.id,
      videoId: args.vid,
      key: Buffer.from(args.key.bytes).toString('base64'),
      createdAt: args.nowIso as VideoKey['createdAt'],
    };

    tx.set(videoRef, updated);
    tx.set(keyRef, keyDoc);
    tx.update(lessonDocRef, { videoId: args.vid, updatedAt: args.nowIso });
    return updated;
  });
}

async markFailedFromSubmission(args: {
  vid: VideoId;
  failureReason: string;
  actualSizeBytes: number;
  nowIso: string;
}): Promise<Video> {
  const videoRef = this.db.collection('videos').doc(args.vid);
  return this.db.runTransaction(async (tx) => {
    const snap = await tx.get(videoRef);
    if (!snap.exists) throw new Error('Video disappeared in transaction.');
    const current = snap.data() as Video;
    const updated: Video = {
      ...current,
      state: 'FAILED',
      source: { ...current.source, sizeBytes: args.actualSizeBytes },
      failureReason: args.failureReason,
      updatedAt: args.nowIso as Video['updatedAt'],
    };
    tx.set(videoRef, updated);
    return updated;
  });
}

async applyTranscoderResult(args: {
  videoId: VideoId;
  jobName: string;
  outcome:
    | { kind: 'READY'; manifestPath: string; durationSec: number; outputBucket: string }
    | { kind: 'FAILED'; reason: string };
  nowIso: string;
}): Promise<{ acted: boolean; reason?: 'VIDEO_NOT_FOUND' | 'JOB_NAME_MISMATCH' | 'ALREADY_APPLIED' | 'WRONG_STATE' }> {
  const videoRef = this.db.collection('videos').doc(args.videoId);
  return this.db.runTransaction(async (tx) => {
    const snap = await tx.get(videoRef);
    if (!snap.exists) return { acted: false, reason: 'VIDEO_NOT_FOUND' as const };
    const current = snap.data() as Video;
    if (current.transcoderJobName !== args.jobName) {
      return { acted: false, reason: 'JOB_NAME_MISMATCH' as const };
    }
    const targetState = args.outcome.kind === 'READY' ? 'READY' : 'FAILED';
    if (current.state === targetState) {
      return { acted: false, reason: 'ALREADY_APPLIED' as const };
    }
    if (current.state !== 'TRANSCODING') {
      return { acted: false, reason: 'WRONG_STATE' as const };
    }

    const updated: Video =
      args.outcome.kind === 'READY'
        ? {
            ...current,
            state: 'READY',
            output: {
              bucket: args.outcome.outputBucket,
              manifestPath: args.outcome.manifestPath,
              durationSec: args.outcome.durationSec,
            },
            updatedAt: args.nowIso as Video['updatedAt'],
          }
        : {
            ...current,
            state: 'FAILED',
            failureReason: `TRANSCODE_FAILED: ${args.outcome.reason}`,
            updatedAt: args.nowIso as Video['updatedAt'],
          };
    tx.set(videoRef, updated);
    return { acted: true };
  });
}
```

Keep `finalizeUpload` (the original slice A method) **deleted** — every caller becomes `finalizeUploadWithJob` or `markFailedFromSubmission` in Task 11. The `writeVideoKey` method becomes unused (key writes happen inside the transactional methods); delete it. The `deleteVideoKey` method also becomes unused since `deleteVideoAndDetach` already handles the cascaded delete; delete it.

- [ ] **Step 3: Delete the now-unused methods**

Remove `finalizeUpload`, `writeVideoKey`, and `deleteVideoKey` from `video.repository.ts`. Also remove the `VideoKeyId` import if no longer referenced.

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```

Expected: FAIL — `VideoService.completeUpload` still calls `repo.finalizeUpload`. That call is rewritten in Task 11. For now, accept the failure; do not commit until Task 11 lands. **This task and Task 11 commit together at the end of Task 11.**

- [ ] **Step 5: (No commit — paired with Task 11.)**

---

## Task 11: Rewrite `VideoService.completeUpload` with probe + key gen + submit + retry

**Files:**
- Modify: `libs/api-video/src/lib/video.service.ts`
- Modify: `libs/api-video/src/lib/video.service.spec.ts`

`completeUpload` becomes the orchestration core of slice B. Flow: HEAD-verify (unchanged) → probe source → generate AES key → submit transcoder job with 3× retry → transactional finalize or transactional fail.

- [ ] **Step 1: Write failing tests**

Append to `libs/api-video/src/lib/video.service.spec.ts`:

```ts
describe('VideoService.completeUpload — slice B', () => {
  function makeServiceWithTranscoder(opts: {
    probe?: { height: number; durationSec: number };
    probeThrows?: Error;
    submitOutcomes?: ('OK' | Error)[];
  } = {}) {
    const repo = makeRepo();
    const storage = makeStorage();
    const transcoder = {
      submitJob: vi.fn(),
      parseEvent: vi.fn(),
      cancelJob: vi.fn(),
    };

    repo.getVideo.mockResolvedValue(baseVideo({ state: 'PENDING_UPLOAD' }));
    storage.headObject.mockResolvedValue({ size: 1024 });
    if (opts.probe) {
      (storage as unknown as { probeSource: ReturnType<typeof vi.fn> }).probeSource = vi.fn(
        async () => opts.probe,
      );
    } else if (opts.probeThrows) {
      (storage as unknown as { probeSource: ReturnType<typeof vi.fn> }).probeSource = vi.fn(async () => {
        throw opts.probeThrows;
      });
    } else {
      (storage as unknown as { probeSource: ReturnType<typeof vi.fn> }).probeSource = vi.fn(
        async () => ({ height: 1080, durationSec: 60 }),
      );
    }
    repo.finalizeUploadWithJob = vi.fn(async () =>
      baseVideo({ state: 'TRANSCODING', keyId: 'k1' as never, transcoderJobName: 'jobs/abc' }),
    );
    repo.markFailedFromSubmission = vi.fn(async (args: { failureReason: string }) =>
      baseVideo({ state: 'FAILED', failureReason: args.failureReason }),
    );

    const outcomes = opts.submitOutcomes ?? ['OK'];
    let call = 0;
    transcoder.submitJob.mockImplementation(async () => {
      const out = outcomes[call++];
      if (out instanceof Error) throw out;
      return { jobName: 'jobs/abc' };
    });

    const svc = new VideoService(
      repo as never,
      storage as never,
      cfg as never,
      transcoder as never,
    );
    return { svc, repo, storage, transcoder };
  }

  it('happy path: probes, generates key, submits, finalizes to TRANSCODING', async () => {
    const { svc, repo, transcoder } = makeServiceWithTranscoder();
    const video = await svc.completeUpload('v1' as VideoId);
    expect(video.state).toBe('TRANSCODING');
    expect(transcoder.submitJob).toHaveBeenCalledTimes(1);
    expect(repo.finalizeUploadWithJob).toHaveBeenCalledWith(
      expect.objectContaining({
        vid: 'v1',
        transcoderJobName: 'jobs/abc',
        key: expect.objectContaining({ bytes: expect.any(Uint8Array) }),
      }),
    );
  });

  it('passes sourceHeight from the probe to submitJob', async () => {
    const { svc, transcoder } = makeServiceWithTranscoder({ probe: { height: 480, durationSec: 10 } });
    await svc.completeUpload('v1' as VideoId);
    expect(transcoder.submitJob).toHaveBeenCalledWith(
      expect.objectContaining({ sourceHeight: 480 }),
    );
  });

  it('ffprobe failure → markFailedFromSubmission with SOURCE_PROBE_FAILED', async () => {
    const { svc, repo, transcoder } = makeServiceWithTranscoder({
      probeThrows: new Error('bad source'),
    });
    const video = await svc.completeUpload('v1' as VideoId);
    expect(video.state).toBe('FAILED');
    expect(transcoder.submitJob).not.toHaveBeenCalled();
    expect(repo.markFailedFromSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ failureReason: expect.stringMatching(/SOURCE_PROBE_FAILED/) }),
    );
  });

  it('retries submitJob up to 3 times before failing', async () => {
    const { svc, transcoder, repo } = makeServiceWithTranscoder({
      submitOutcomes: [new Error('t1'), new Error('t2'), 'OK'],
    });
    const video = await svc.completeUpload('v1' as VideoId);
    expect(transcoder.submitJob).toHaveBeenCalledTimes(3);
    expect(video.state).toBe('TRANSCODING');
    expect(repo.markFailedFromSubmission).not.toHaveBeenCalled();
  });

  it('exhausts retries → markFailedFromSubmission with TRANSCODER_SUBMIT_FAILED', async () => {
    const { svc, repo, transcoder } = makeServiceWithTranscoder({
      submitOutcomes: [new Error('t1'), new Error('t2'), new Error('t3')],
    });
    const video = await svc.completeUpload('v1' as VideoId);
    expect(transcoder.submitJob).toHaveBeenCalledTimes(3);
    expect(video.state).toBe('FAILED');
    expect(repo.markFailedFromSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ failureReason: expect.stringMatching(/TRANSCODER_SUBMIT_FAILED/) }),
    );
  });

  it('rejects when state is not PENDING_UPLOAD', async () => {
    const { svc, repo } = makeServiceWithTranscoder();
    repo.getVideo.mockResolvedValue(baseVideo({ state: 'TRANSCODING' }));
    await expect(svc.completeUpload('v1' as VideoId)).rejects.toBeInstanceOf(InvalidVideoStateException);
  });

  it('rejects when object missing', async () => {
    const { svc, storage } = makeServiceWithTranscoder();
    storage.headObject.mockResolvedValue(null);
    await expect(svc.completeUpload('v1' as VideoId)).rejects.toBeInstanceOf(UploadObjectMissingException);
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

```bash
pnpm nx test api-video -- video.service
```

Expected: FAIL — `VideoService` constructor signature changed, `finalizeUploadWithJob`, `markFailedFromSubmission`, `probeSource` don't exist yet, `completeUpload` doesn't accept the new flow.

- [ ] **Step 3: Rewrite `VideoService`**

Replace `libs/api-video/src/lib/video.service.ts` with the listing in **Appendix B (Task 11 implementation)** at the end of this plan. The key additions:

- Constructor gains an injected `VIDEO_TRANSCODER` provider.
- `completeUpload` chains: HEAD → probeSource → generate 16-byte AES key (Node's `crypto.randomBytes(16)`) → `submitWithRetry(input)` → `repo.finalizeUploadWithJob` (happy) or `repo.markFailedFromSubmission` (failure).
- `submitWithRetry(input, attempt=0)` retries up to 3× with 1 s / 2 s / 4 s backoff; returns `{ ok: true, jobName }` or `{ ok: false, lastError: string }`.
- Backoff uses `setTimeout` via a small `sleep(ms)` helper; tests pass an injected sleep override through the constructor's optional `deps` arg (see Appendix B).
- New method `handleTranscoderEvent(event)` (used by Task 15's webhook controller); see Appendix B.
- Extended `delete()` method accepts `TRANSCODING` and `READY`; calls `transcoder.cancelJob(jobName)` best-effort on `TRANSCODING`, `storage.deletePrefix({ bucket: outputBucket, prefix: 'videos/{vid}/' })` best-effort on `READY`. See Appendix B.

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm nx test api-video -- video.service
```

Expected: PASS. All slice A tests still green plus the new slice B cases.

- [ ] **Step 5: Now commit Tasks 10 + 11 together**

```bash
pnpm lint && pnpm typecheck && pnpm nx test api-video
git add libs/api-video/src/lib/video.repository.ts \
        libs/api-video/src/lib/video.service.ts \
        libs/api-video/src/lib/video.service.spec.ts
git commit -m "feat(api-video): completeUpload chains probe + key gen + transcoder submit with retry"
```

---

## Task 12: Add unit coverage for `VideoService.handleTranscoderEvent` and extended `delete()`

**Files:**
- Modify: `libs/api-video/src/lib/video.service.spec.ts`

The new service methods land in Task 11's commit but need their own dedicated test suites for full mutation surface coverage.

- [ ] **Step 1: Write tests for `handleTranscoderEvent`**

Append to `libs/api-video/src/lib/video.service.spec.ts`:

```ts
import type { TranscoderEvent } from './transcoder/transcoder.port';

describe('VideoService.handleTranscoderEvent', () => {
  function build() {
    const repo = makeRepo();
    const storage = makeStorage();
    const transcoder = { submitJob: vi.fn(), parseEvent: vi.fn(), cancelJob: vi.fn() };
    repo.applyTranscoderResult = vi.fn();
    const svc = new VideoService(repo as never, storage as never, cfg as never, transcoder as never);
    return { svc, repo };
  }

  const successEvent: TranscoderEvent = {
    type: 'JOB_SUCCEEDED',
    jobName: 'jobs/abc',
    videoId: 'v1' as VideoId,
    manifestPath: 'videos/v1/hls/manifest.m3u8',
    durationSec: 120,
  };
  const failEvent: TranscoderEvent = {
    type: 'JOB_FAILED',
    jobName: 'jobs/abc',
    videoId: 'v1' as VideoId,
    reason: 'codec failure',
  };

  it('forwards JOB_SUCCEEDED with READY outcome carrying manifest path + duration + output bucket', async () => {
    const { svc, repo } = build();
    repo.applyTranscoderResult.mockResolvedValue({ acted: true });
    const result = await svc.handleTranscoderEvent(successEvent);
    expect(result).toEqual({ acted: true });
    expect(repo.applyTranscoderResult).toHaveBeenCalledWith(
      expect.objectContaining({
        videoId: 'v1',
        jobName: 'jobs/abc',
        outcome: {
          kind: 'READY',
          manifestPath: 'videos/v1/hls/manifest.m3u8',
          durationSec: 120,
          outputBucket: cfg.outputBucket,
        },
      }),
    );
  });

  it('forwards JOB_FAILED with FAILED outcome carrying reason', async () => {
    const { svc, repo } = build();
    repo.applyTranscoderResult.mockResolvedValue({ acted: true });
    await svc.handleTranscoderEvent(failEvent);
    expect(repo.applyTranscoderResult).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: { kind: 'FAILED', reason: 'codec failure' },
      }),
    );
  });

  it('passes through repo no-op reasons unchanged', async () => {
    const { svc, repo } = build();
    repo.applyTranscoderResult.mockResolvedValue({ acted: false, reason: 'ALREADY_APPLIED' });
    const result = await svc.handleTranscoderEvent(successEvent);
    expect(result).toEqual({ acted: false, reason: 'ALREADY_APPLIED' });
  });
});

describe('VideoService.delete — slice B state widening', () => {
  function build(initialState: Video['state'], extras: Partial<Video> = {}) {
    const repo = makeRepo();
    const storage = makeStorage();
    const transcoder = { submitJob: vi.fn(), parseEvent: vi.fn(), cancelJob: vi.fn(async () => undefined) };
    repo.getVideo.mockResolvedValue(baseVideo({ state: initialState, ...extras }));
    (storage as unknown as { deletePrefix: ReturnType<typeof vi.fn> }).deletePrefix = vi.fn(
      async () => undefined,
    );
    const svc = new VideoService(repo as never, storage as never, cfg as never, transcoder as never);
    return { svc, repo, storage, transcoder };
  }

  it('TRANSCODING: best-effort cancelJob before bucket + repo cleanup', async () => {
    const { svc, transcoder, storage, repo } = build('TRANSCODING', {
      transcoderJobName: 'jobs/abc',
    });
    await svc.delete('v1' as VideoId);
    expect(transcoder.cancelJob).toHaveBeenCalledWith('jobs/abc');
    expect(storage.deleteObject).toHaveBeenCalled();
    expect(repo.deleteVideoAndDetach).toHaveBeenCalled();
  });

  it('TRANSCODING with no transcoderJobName: skips cancelJob', async () => {
    const { svc, transcoder } = build('TRANSCODING', { transcoderJobName: undefined });
    await svc.delete('v1' as VideoId);
    expect(transcoder.cancelJob).not.toHaveBeenCalled();
  });

  it('TRANSCODING: cancelJob failure is swallowed and cleanup proceeds', async () => {
    const { svc, transcoder, repo } = build('TRANSCODING', { transcoderJobName: 'jobs/abc' });
    transcoder.cancelJob.mockRejectedValue(new Error('boom'));
    await expect(svc.delete('v1' as VideoId)).resolves.toBeUndefined();
    expect(repo.deleteVideoAndDetach).toHaveBeenCalled();
  });

  it('READY: deletes output prefix from output bucket best-effort', async () => {
    const { svc, storage, repo } = build('READY', {
      output: { bucket: 'out', manifestPath: 'videos/v1/hls/manifest.m3u8', durationSec: 60 },
    });
    await svc.delete('v1' as VideoId);
    expect((storage as unknown as { deletePrefix: ReturnType<typeof vi.fn> }).deletePrefix).toHaveBeenCalledWith({
      bucket: 'out',
      prefix: 'videos/v1/',
    });
    expect(repo.deleteVideoAndDetach).toHaveBeenCalled();
  });

  it('rejects unknown post-slice-B states', async () => {
    const { svc } = build('UPLOADING' as Video['state']);
    await expect(svc.delete('v1' as VideoId)).rejects.toBeInstanceOf(InvalidVideoStateException);
  });
});
```

You may need to refresh the `cfg` fixture at the top of the spec file to include `outputBucket`:

```ts
const cfg: VideoConfig = {
  sourceBucket: 'src-bucket',
  outputBucket: 'out-bucket',
  stuckThresholdMinutes: 30,
  pollIntervalMs: 5000,
  transcoderImpl: 'fake',
};
```

- [ ] **Step 2: Run tests, expect pass**

```bash
pnpm nx test api-video -- video.service
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add libs/api-video/src/lib/video.service.spec.ts
git commit -m "test(api-video): handleTranscoderEvent + delete widening coverage"
```

---

## Task 13: `PubSubPushGuard`

**Files:**
- Create: `libs/api-video/src/lib/webhook/pubsub-push.guard.ts`
- Create: `libs/api-video/src/lib/webhook/pubsub-push.guard.spec.ts`
- Modify: `package.json` (add `google-auth-library`)

Verifies the `Authorization: Bearer <token>` header on the Pub/Sub push endpoint.

- [ ] **Step 1: Install google-auth-library**

```bash
pnpm add google-auth-library@latest
```

- [ ] **Step 2: Write failing tests**

Create `libs/api-video/src/lib/webhook/pubsub-push.guard.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import {
  PubSubInvalidTokenException,
  PubSubWrongAudienceException,
  PubSubWrongInvokerException,
} from '../errors/video.exception';
import { PubSubPushGuard } from './pubsub-push.guard';

function ctx(headers: Record<string, string>) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as never;
}

function makeGuard(opts: {
  audience: string;
  invokerSaEmail: string;
  verifier: (token: string) => Promise<{
    getPayload: () => { iss?: string; aud?: string; email?: string; exp?: number };
  }>;
}) {
  return new PubSubPushGuard(
    { webhookAudience: opts.audience, invokerSaEmail: opts.invokerSaEmail } as never,
    { verifyIdToken: opts.verifier } as never,
  );
}

describe('PubSubPushGuard', () => {
  const cfg = { audience: 'https://aud', invokerSaEmail: 'sa@p.iam.gserviceaccount.com' };

  it('passes when issuer + audience + email match and not expired', async () => {
    const g = makeGuard({
      ...cfg,
      verifier: vi.fn(async () => ({
        getPayload: () => ({
          iss: 'https://accounts.google.com',
          aud: cfg.audience,
          email: cfg.invokerSaEmail,
          exp: Math.floor(Date.now() / 1000) + 60,
        }),
      })),
    });
    await expect(g.canActivate(ctx({ authorization: 'Bearer xyz' }))).resolves.toBe(true);
  });

  it('rejects when Authorization header is missing', async () => {
    const g = makeGuard({ ...cfg, verifier: vi.fn() });
    await expect(g.canActivate(ctx({}))).rejects.toBeInstanceOf(PubSubInvalidTokenException);
  });

  it('rejects when the verifier throws', async () => {
    const g = makeGuard({
      ...cfg,
      verifier: vi.fn(async () => { throw new Error('bad sig'); }),
    });
    await expect(
      g.canActivate(ctx({ authorization: 'Bearer xyz' })),
    ).rejects.toBeInstanceOf(PubSubInvalidTokenException);
  });

  it('rejects when issuer is wrong', async () => {
    const g = makeGuard({
      ...cfg,
      verifier: vi.fn(async () => ({
        getPayload: () => ({
          iss: 'https://evil',
          aud: cfg.audience,
          email: cfg.invokerSaEmail,
          exp: Math.floor(Date.now() / 1000) + 60,
        }),
      })),
    });
    await expect(
      g.canActivate(ctx({ authorization: 'Bearer xyz' })),
    ).rejects.toBeInstanceOf(PubSubInvalidTokenException);
  });

  it('rejects when audience does not match', async () => {
    const g = makeGuard({
      ...cfg,
      verifier: vi.fn(async () => ({
        getPayload: () => ({
          iss: 'https://accounts.google.com',
          aud: 'https://other',
          email: cfg.invokerSaEmail,
          exp: Math.floor(Date.now() / 1000) + 60,
        }),
      })),
    });
    await expect(
      g.canActivate(ctx({ authorization: 'Bearer xyz' })),
    ).rejects.toBeInstanceOf(PubSubWrongAudienceException);
  });

  it('rejects when invoker email does not match', async () => {
    const g = makeGuard({
      ...cfg,
      verifier: vi.fn(async () => ({
        getPayload: () => ({
          iss: 'https://accounts.google.com',
          aud: cfg.audience,
          email: 'someone-else@p.iam.gserviceaccount.com',
          exp: Math.floor(Date.now() / 1000) + 60,
        }),
      })),
    });
    await expect(
      g.canActivate(ctx({ authorization: 'Bearer xyz' })),
    ).rejects.toBeInstanceOf(PubSubWrongInvokerException);
  });

  it('rejects expired tokens', async () => {
    const g = makeGuard({
      ...cfg,
      verifier: vi.fn(async () => ({
        getPayload: () => ({
          iss: 'https://accounts.google.com',
          aud: cfg.audience,
          email: cfg.invokerSaEmail,
          exp: Math.floor(Date.now() / 1000) - 10,
        }),
      })),
    });
    await expect(
      g.canActivate(ctx({ authorization: 'Bearer xyz' })),
    ).rejects.toBeInstanceOf(PubSubInvalidTokenException);
  });
});
```

- [ ] **Step 3: Run tests, expect failure**

```bash
pnpm nx test api-video -- pubsub-push.guard
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement `pubsub-push.guard.ts`**

Create `libs/api-video/src/lib/webhook/pubsub-push.guard.ts`:

```ts
import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';

import {
  PubSubInvalidTokenException,
  PubSubWrongAudienceException,
  PubSubWrongInvokerException,
} from '../errors/video.exception';
import { VIDEO_CONFIG, type VideoConfig } from '../video.config';

// Minimal structural type satisfied by google-auth-library's OAuth2Client.
export interface IdTokenVerifier {
  verifyIdToken(token: string): Promise<{
    getPayload(): { iss?: string; aud?: string | string[]; email?: string; exp?: number } | undefined;
  }>;
}

export const ID_TOKEN_VERIFIER = Symbol.for('learnwren.api-video.idTokenVerifier');

const GOOGLE_ISSUER = 'https://accounts.google.com';

@Injectable()
export class PubSubPushGuard implements CanActivate {
  constructor(
    @Inject(VIDEO_CONFIG) private readonly cfg: VideoConfig,
    @Inject(ID_TOKEN_VERIFIER) private readonly verifier: IdTokenVerifier,
  ) {}

  async canActivate(execCtx: ExecutionContext): Promise<boolean> {
    const req = execCtx.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const header = req.headers['authorization'];
    if (!header || typeof header !== 'string' || !header.startsWith('Bearer ')) {
      throw new PubSubInvalidTokenException('missing or malformed Authorization header');
    }
    const token = header.slice('Bearer '.length).trim();
    if (!token) throw new PubSubInvalidTokenException('empty bearer token');

    let payload: ReturnType<Awaited<ReturnType<IdTokenVerifier['verifyIdToken']>>['getPayload']>;
    try {
      const ticket = await this.verifier.verifyIdToken(token);
      payload = ticket.getPayload();
    } catch (err) {
      throw new PubSubInvalidTokenException((err as Error).message);
    }
    if (!payload) throw new PubSubInvalidTokenException('empty payload');

    if (payload.iss !== GOOGLE_ISSUER) {
      throw new PubSubInvalidTokenException(`unexpected issuer ${payload.iss}`);
    }
    if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) {
      throw new PubSubInvalidTokenException('token expired');
    }
    const aud = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud;
    if (aud !== this.cfg.webhookAudience) {
      throw new PubSubWrongAudienceException();
    }
    if (payload.email !== this.cfg.invokerSaEmail) {
      throw new PubSubWrongInvokerException();
    }
    return true;
  }
}
```

- [ ] **Step 5: Run tests, expect pass**

```bash
pnpm nx test api-video -- pubsub-push.guard
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/api-video/src/lib/webhook/pubsub-push.guard.ts \
        libs/api-video/src/lib/webhook/pubsub-push.guard.spec.ts \
        package.json pnpm-lock.yaml
git commit -m "feat(api-video): PubSubPushGuard — OIDC verification for transcoder webhook"
```

---

## Task 14: `TranscoderEventsController`

**Files:**
- Create: `libs/api-video/src/lib/webhook/transcoder-events.controller.ts`
- Create: `libs/api-video/src/lib/webhook/transcoder-events.controller.spec.ts`

POST `/api/internal/transcoder-events`. Class-level `@UseGuards(PubSubPushGuard)`; no session guard. Parses, asks the transcoder to construct a `TranscoderEvent`, asks the service to apply it, maps `{ acted, reason }` to HTTP responses (204 / 200 / 5xx).

- [ ] **Step 1: Write failing tests**

Create `libs/api-video/src/lib/webhook/transcoder-events.controller.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import type { VideoId } from '@learnwren/shared-data-models';

import type { TranscoderEvent, VideoTranscoder } from '../transcoder/transcoder.port';
import { TranscoderEventsController } from './transcoder-events.controller';

function makeRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status: vi.fn(function (this: typeof res, c: number) { this.statusCode = c; return this; }),
    json: vi.fn(function (this: typeof res, b: unknown) { this.body = b; return this; }),
    send: vi.fn(function (this: typeof res) { return this; }),
  };
  return res;
}

function controller(transcoder: Partial<VideoTranscoder>, service: { handleTranscoderEvent: ReturnType<typeof vi.fn> }) {
  return new TranscoderEventsController(transcoder as never, service as never);
}

const successEvent: TranscoderEvent = {
  type: 'JOB_SUCCEEDED',
  jobName: 'jobs/abc',
  videoId: 'v1' as VideoId,
  manifestPath: 'videos/v1/hls/manifest.m3u8',
  durationSec: 60,
};

describe('TranscoderEventsController.handle', () => {
  it('returns 204 when service.acted=true', async () => {
    const transcoder = { parseEvent: vi.fn(async () => successEvent) };
    const service = { handleTranscoderEvent: vi.fn(async () => ({ acted: true })) };
    const c = controller(transcoder, service);
    const res = makeRes();
    await c.handle({}, res as never);
    expect(res.statusCode).toBe(204);
  });

  it('returns 200 with structured log payload on ALREADY_APPLIED', async () => {
    const transcoder = { parseEvent: vi.fn(async () => successEvent) };
    const service = { handleTranscoderEvent: vi.fn(async () => ({ acted: false, reason: 'ALREADY_APPLIED' })) };
    const res = makeRes();
    await controller(transcoder, service).handle({}, res as never);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ acked: true, reason: 'ALREADY_APPLIED' });
  });

  it.each(['VIDEO_NOT_FOUND', 'JOB_NAME_MISMATCH', 'WRONG_STATE'] as const)(
    'returns 200 when reason is %s',
    async (reason) => {
      const transcoder = { parseEvent: vi.fn(async () => successEvent) };
      const service = { handleTranscoderEvent: vi.fn(async () => ({ acted: false, reason })) };
      const res = makeRes();
      await controller(transcoder, service).handle({}, res as never);
      expect(res.statusCode).toBe(200);
    },
  );

  it('returns 200 when payload cannot be parsed (poison-pill drop)', async () => {
    const transcoder = { parseEvent: vi.fn(async () => { throw new Error('missing videoid'); }) };
    const service = { handleTranscoderEvent: vi.fn() };
    const res = makeRes();
    await controller(transcoder, service).handle({}, res as never);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ acked: true });
    expect(service.handleTranscoderEvent).not.toHaveBeenCalled();
  });

  it('returns 500 when service throws (transient — Pub/Sub will retry)', async () => {
    const transcoder = { parseEvent: vi.fn(async () => successEvent) };
    const service = {
      handleTranscoderEvent: vi.fn(async () => { throw new Error('firestore unavailable'); }),
    };
    const res = makeRes();
    await controller(transcoder, service).handle({}, res as never);
    expect(res.statusCode).toBe(500);
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

```bash
pnpm nx test api-video -- transcoder-events.controller
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `transcoder-events.controller.ts`**

Create `libs/api-video/src/lib/webhook/transcoder-events.controller.ts`:

```ts
import {
  Body,
  Controller,
  Inject,
  Logger,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import { VIDEO_TRANSCODER, type VideoTranscoder } from '../transcoder/transcoder.port';
import { VideoService } from '../video.service';
import { PubSubPushGuard } from './pubsub-push.guard';

@Controller('internal/transcoder-events')
@UseGuards(PubSubPushGuard)
export class TranscoderEventsController {
  private readonly logger = new Logger('TranscoderEventsController');

  constructor(
    @Inject(VIDEO_TRANSCODER) private readonly transcoder: VideoTranscoder,
    private readonly svc: VideoService,
  ) {}

  @Post()
  async handle(@Body() body: unknown, @Res() res: Response): Promise<void> {
    let event;
    try {
      event = await this.transcoder.parseEvent(body);
    } catch (err) {
      // Poison-pill: malformed payload. Acknowledge so Pub/Sub stops redelivering.
      this.logger.error(`Discarding malformed event: ${(err as Error).message}`);
      res.status(200).json({ acked: true, reason: 'MALFORMED' });
      return;
    }

    try {
      const outcome = await this.svc.handleTranscoderEvent(event);
      if (outcome.acted) {
        res.status(204).send();
        return;
      }
      this.logger.log(
        `No-op for videoId=${event.videoId} jobName=${event.jobName}: ${outcome.reason}`,
      );
      res.status(200).json({ acked: true, reason: outcome.reason });
    } catch (err) {
      // Transient: bubble up as 5xx so Pub/Sub redelivers.
      this.logger.error(`Transient failure: ${(err as Error).message}`);
      res.status(500).send();
    }
  }
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm nx test api-video -- transcoder-events.controller
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/api-video/src/lib/webhook/transcoder-events.controller.ts \
        libs/api-video/src/lib/webhook/transcoder-events.controller.spec.ts
git commit -m "feat(api-video): TranscoderEventsController — idempotent webhook with 4xx/200/5xx response model"
```

---

## Task 15: `FakeTranscoderController` (dev-only)

**Files:**
- Create: `libs/api-video/src/lib/webhook/fake-transcoder.controller.ts`
- Create: `libs/api-video/src/lib/webhook/fake-transcoder.controller.spec.ts`

Dev-only routes that synthesise a Pub/Sub envelope and invoke the same code path as the real webhook. Registered conditionally in `ApiVideoModule` (next task).

- [ ] **Step 1: Write failing tests**

Create `libs/api-video/src/lib/webhook/fake-transcoder.controller.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import type { VideoId } from '@learnwren/shared-data-models';

import { FakeTranscoderController } from './fake-transcoder.controller';

function build() {
  const eventsController = { handle: vi.fn(async () => undefined) };
  const c = new FakeTranscoderController(eventsController as never);
  return { c, eventsController };
}

function res() {
  return {
    statusCode: 0,
    body: undefined as unknown,
    status: vi.fn(function (this: ReturnType<typeof res>, code: number) {
      this.statusCode = code;
      return this;
    }),
    json: vi.fn(function (this: ReturnType<typeof res>, b: unknown) {
      this.body = b;
      return this;
    }),
    send: vi.fn(function (this: ReturnType<typeof res>) {
      return this;
    }),
  };
}

describe('FakeTranscoderController', () => {
  it('complete: builds a SUCCEEDED Pub/Sub envelope and delegates to the real handler', async () => {
    const { c, eventsController } = build();
    const r = res();
    await c.complete('v1' as VideoId, r as never);
    expect(eventsController.handle).toHaveBeenCalledTimes(1);
    const envelope = eventsController.handle.mock.calls[0]![0] as { message: { data: string } };
    const decoded = JSON.parse(Buffer.from(envelope.message.data, 'base64').toString());
    expect(decoded.job.state).toBe('SUCCEEDED');
    expect(decoded.job.labels.videoid).toBe('v1');
  });

  it('fail: builds a FAILED envelope and passes the reason', async () => {
    const { c, eventsController } = build();
    const r = res();
    await c.fail('v1' as VideoId, { reason: 'codec failure' }, r as never);
    const envelope = eventsController.handle.mock.calls[0]![0] as { message: { data: string } };
    const decoded = JSON.parse(Buffer.from(envelope.message.data, 'base64').toString());
    expect(decoded.job.state).toBe('FAILED');
    expect(decoded.job.error.message).toBe('codec failure');
  });

  it('fail: uses a default reason when none is provided', async () => {
    const { c, eventsController } = build();
    const r = res();
    await c.fail('v1' as VideoId, {}, r as never);
    const envelope = eventsController.handle.mock.calls[0]![0] as { message: { data: string } };
    const decoded = JSON.parse(Buffer.from(envelope.message.data, 'base64').toString());
    expect(decoded.job.error.message).toBe('fake-transcoder synthetic failure');
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

```bash
pnpm nx test api-video -- fake-transcoder.controller
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `fake-transcoder.controller.ts`**

Create `libs/api-video/src/lib/webhook/fake-transcoder.controller.ts`:

```ts
import { Body, Controller, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';

import type { VideoId } from '@learnwren/shared-data-models';

import { TranscoderEventsController } from './transcoder-events.controller';

interface FakeFailBody { reason?: string }

function envelope(payload: object): { message: { data: string; messageId: string; publishTime: string }; subscription: string } {
  return {
    message: {
      data: Buffer.from(JSON.stringify(payload)).toString('base64'),
      messageId: `fake-${Date.now()}`,
      publishTime: new Date().toISOString(),
    },
    subscription: 'fake-subscription',
  };
}

@Controller('internal/fake-transcoder')
export class FakeTranscoderController {
  constructor(private readonly real: TranscoderEventsController) {}

  @Post('complete/:vid')
  async complete(@Param('vid') vid: VideoId, @Res() res: Response): Promise<void> {
    const env = envelope({
      job: {
        name: `projects/fake/locations/fake/jobs/${vid}`,
        state: 'SUCCEEDED',
        labels: { videoid: vid },
        output: { uri: `gs://fake-out/videos/${vid}/hls/` },
      },
      eventTime: new Date().toISOString(),
    });
    await this.real.handle(env, res);
  }

  @Post('fail/:vid')
  async fail(
    @Param('vid') vid: VideoId,
    @Body() body: FakeFailBody,
    @Res() res: Response,
  ): Promise<void> {
    const env = envelope({
      job: {
        name: `projects/fake/locations/fake/jobs/${vid}`,
        state: 'FAILED',
        labels: { videoid: vid },
        error: { code: 13, message: body.reason ?? 'fake-transcoder synthetic failure' },
      },
      eventTime: new Date().toISOString(),
    });
    await this.real.handle(env, res);
  }
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm nx test api-video -- fake-transcoder.controller
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/api-video/src/lib/webhook/fake-transcoder.controller.ts \
        libs/api-video/src/lib/webhook/fake-transcoder.controller.spec.ts
git commit -m "feat(api-video): FakeTranscoderController for dev-only end-to-end testing"
```

---

## Task 16: Wire `VideoModule` — register transcoder factory + conditional webhook controllers

**Files:**
- Modify: `libs/api-video/src/lib/video.module.ts`
- Modify: `libs/api-video/src/index.ts` (no re-export needed; transcoder remains internal)

Module factory picks `gcp` vs `fake` transcoder based on `VideoConfig.transcoderImpl`. `TranscoderEventsController` is always registered. `FakeTranscoderController` is only registered when `NODE_ENV !== 'production'`. `PubSubPushGuard` is a provider. `ID_TOKEN_VERIFIER` is provided as an `OAuth2Client` instance.

- [ ] **Step 1: Replace `video.module.ts`**

Replace the contents of `libs/api-video/src/lib/video.module.ts` with:

```ts
import { forwardRef, Module } from '@nestjs/common';
import { TranscoderServiceClient } from '@google-cloud/video-transcoder';
import { OAuth2Client } from 'google-auth-library';

import { AuthModule } from '@learnwren/api-auth';
import { FirebaseAdminModule } from '@learnwren/api-firebase';

import { FakeTranscoderAdapter } from './transcoder/fake-transcoder.adapter';
import { GcpTranscoderAdapter, type TranscoderClient } from './transcoder/gcp-transcoder.adapter';
import { VIDEO_TRANSCODER, type VideoTranscoder } from './transcoder/transcoder.port';
import { VIDEO_CONFIG, readVideoConfigFromEnv, type VideoConfig } from './video.config';
import { VideoController } from './video.controller';
import { VideoExceptionFilter } from './video.exception-filter';
import { VideoOwnerGuard } from './video-owner.guard';
import { VideoRepository } from './video.repository';
import { VideoService } from './video.service';
import { VideoStorageAdapter } from './video-storage.adapter';
import { FakeTranscoderController } from './webhook/fake-transcoder.controller';
import { ID_TOKEN_VERIFIER, PubSubPushGuard } from './webhook/pubsub-push.guard';
import { TranscoderEventsController } from './webhook/transcoder-events.controller';

function makeTranscoder(cfg: VideoConfig): VideoTranscoder {
  if (cfg.transcoderImpl === 'fake') return new FakeTranscoderAdapter();
  return new GcpTranscoderAdapter({
    client: new TranscoderServiceClient() as unknown as TranscoderClient,
    projectId: cfg.gcpProjectId!,
    location: cfg.transcoderLocation!,
  });
}

const controllers = [
  VideoController,
  TranscoderEventsController,
  ...(process.env['NODE_ENV'] !== 'production' ? [FakeTranscoderController] : []),
];

// CoursesModule ↔ VideoModule are mutually dependent (slice A pattern).
@Module({
  // nx-ignore-next-line
  // eslint-disable-next-line @nx/enforce-module-boundaries -- intentional circular: api-video ↔ api-courses (NestJS forwardRef cascade delete)
  imports: [FirebaseAdminModule, AuthModule, forwardRef(() => require('@learnwren/api-courses').CoursesModule)],
  controllers,
  providers: [
    VideoRepository,
    VideoService,
    VideoStorageAdapter,
    VideoOwnerGuard,
    VideoExceptionFilter,
    PubSubPushGuard,
    { provide: VIDEO_CONFIG, useFactory: () => readVideoConfigFromEnv(process.env) },
    {
      provide: VIDEO_TRANSCODER,
      inject: [VIDEO_CONFIG],
      useFactory: (cfg: VideoConfig) => makeTranscoder(cfg),
    },
    {
      provide: ID_TOKEN_VERIFIER,
      useFactory: () => new OAuth2Client(),
    },
  ],
  exports: [VideoService],
})
export class VideoModule {}
```

- [ ] **Step 2: Run module tests**

```bash
pnpm nx test api-video
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Boot the API to verify the module composes**

```bash
LEARNWREN_VIDEO_TRANSCODER=fake \
  LEARNWREN_VIDEO_OUTPUT_BUCKET=local-out \
  LEARNWREN_VIDEO_SOURCE_BUCKET=local-src \
  pnpm nx serve api &
sleep 8
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3333/api/health
kill %1 2>/dev/null || true
```

Expected: `200`. (If you do not have a health route in the API yet, instead check that the process starts without an exception by tailing logs.)

- [ ] **Step 4: Commit**

```bash
git add libs/api-video/src/lib/video.module.ts
git commit -m "feat(api-video): wire transcoder factory + webhook controllers in VideoModule"
```

---

## Task 17: `VideoStatePollingService` (web-video)

**Files:**
- Create: `libs/web-video/src/lib/polling/video-state-polling.service.ts`
- Create: `libs/web-video/src/lib/polling/video-state-polling.service.spec.ts`

RxJS-based service that polls `GET /api/videos/:vid` every `pollIntervalMs` while state ∈ `{ UPLOADED, TRANSCODING }`, stops on terminal states or the 30-min cap.

- [ ] **Step 1: Write failing tests**

Create `libs/web-video/src/lib/polling/video-state-polling.service.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, expect, it, beforeEach, vi } from 'vitest';

import type { Video, VideoId } from '@learnwren/shared-data-models';

import { VideoStatePollingService } from './video-state-polling.service';

function video(state: Video['state'], overrides: Partial<Video> = {}): Video {
  return {
    id: 'v1' as VideoId,
    ownerInstructorId: 'u1' as Video['ownerInstructorId'],
    courseId: 'c1' as Video['courseId'],
    lessonId: 'l1' as Video['lessonId'],
    state,
    source: { bucket: 'b', path: 'p' },
    createdAt: '2026-05-13T00:00:00.000Z' as Video['createdAt'],
    updatedAt: '2026-05-13T00:00:00.000Z' as Video['updatedAt'],
    ...overrides,
  };
}

describe('VideoStatePollingService', () => {
  let svc: VideoStatePollingService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        VideoStatePollingService,
      ],
    });
    svc = TestBed.inject(VideoStatePollingService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  it('emits the initial video then polls until READY', async () => {
    const collected: Video['state'][] = [];
    const sub = svc.poll('v1' as VideoId, { intervalMs: 10, capMs: 60_000 }).subscribe((v) => {
      collected.push(v.state);
    });

    httpMock.expectOne('/api/videos/v1').flush(video('TRANSCODING'));
    await new Promise((r) => setTimeout(r, 20));
    httpMock.expectOne('/api/videos/v1').flush(video('TRANSCODING'));
    await new Promise((r) => setTimeout(r, 20));
    httpMock.expectOne('/api/videos/v1').flush(video('READY'));
    await new Promise((r) => setTimeout(r, 30));

    expect(collected.at(-1)).toBe('READY');
    httpMock.verify();
    sub.unsubscribe();
  });

  it('stops polling on FAILED', async () => {
    const sub = svc.poll('v1' as VideoId, { intervalMs: 10, capMs: 60_000 }).subscribe();
    httpMock.expectOne('/api/videos/v1').flush(video('FAILED'));
    await new Promise((r) => setTimeout(r, 50));
    httpMock.verify();
    sub.unsubscribe();
  });

  it('stops polling after the cap', async () => {
    const sub = svc.poll('v1' as VideoId, { intervalMs: 10, capMs: 30 }).subscribe();
    httpMock.expectOne('/api/videos/v1').flush(video('TRANSCODING'));
    await new Promise((r) => setTimeout(r, 15));
    httpMock.expectOne('/api/videos/v1').flush(video('TRANSCODING'));
    await new Promise((r) => setTimeout(r, 60));
    httpMock.verify();
    sub.unsubscribe();
  });

  it('stops polling when subscriber unsubscribes', async () => {
    const sub = svc.poll('v1' as VideoId, { intervalMs: 10, capMs: 60_000 }).subscribe();
    httpMock.expectOne('/api/videos/v1').flush(video('TRANSCODING'));
    sub.unsubscribe();
    await new Promise((r) => setTimeout(r, 30));
    httpMock.verify();
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

```bash
pnpm nx test web-video -- video-state-polling
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `video-state-polling.service.ts`**

Create `libs/web-video/src/lib/polling/video-state-polling.service.ts`:

```ts
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, timer } from 'rxjs';
import { switchMap, tap, takeWhile } from 'rxjs/operators';

import type { Video, VideoId } from '@learnwren/shared-data-models';

const TERMINAL: ReadonlyArray<Video['state']> = ['READY', 'FAILED'];
const DEFAULT_INTERVAL_MS = 5_000;
const DEFAULT_CAP_MS = 30 * 60 * 1_000;

export interface PollOptions {
  intervalMs?: number;
  capMs?: number;
}

@Injectable({ providedIn: 'root' })
export class VideoStatePollingService {
  private readonly http = inject(HttpClient);

  poll(vid: VideoId, opts: PollOptions = {}): Observable<Video> {
    const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
    const capMs = opts.capMs ?? DEFAULT_CAP_MS;
    const start = Date.now();
    let stopped = false;
    return timer(0, intervalMs).pipe(
      takeWhile(() => !stopped && Date.now() - start <= capMs),
      switchMap(() => this.http.get<Video>(`/api/videos/${vid}`, { withCredentials: true })),
      tap((v) => {
        if (TERMINAL.includes(v.state)) stopped = true;
      }),
      takeWhile((v) => !TERMINAL.includes(v.state), /* inclusive */ true),
    );
  }
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm nx test web-video -- video-state-polling
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/web-video/src/lib/polling/video-state-polling.service.ts \
        libs/web-video/src/lib/polling/video-state-polling.service.spec.ts
git commit -m "feat(web-video): VideoStatePollingService — 5s polling with terminal-state + cap stop"
```

---

## Task 18: Wire badge to live state via polling

**Files:**
- Modify: `libs/web-video/src/lib/video-state-badge.component.ts`
- Modify: `libs/web-video/src/lib/video-state-badge.component.html`
- Modify: `libs/web-video/src/lib/video-state-badge.component.spec.ts`

The badge ingests an initial `Video`, then subscribes to the polling service to receive live updates. Copy is updated for slice B's states.

- [ ] **Step 1: Write failing tests**

Replace `libs/web-video/src/lib/video-state-badge.component.spec.ts` with:

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Subject } from 'rxjs';
import { describe, expect, it, beforeEach, vi } from 'vitest';

import type { Video, VideoId } from '@learnwren/shared-data-models';

import { VideoStateBadgeComponent } from './video-state-badge.component';
import { VideoStatePollingService } from './polling/video-state-polling.service';

function video(state: Video['state']): Video {
  return {
    id: 'v1' as VideoId,
    ownerInstructorId: 'u1' as Video['ownerInstructorId'],
    courseId: 'c1' as Video['courseId'],
    lessonId: 'l1' as Video['lessonId'],
    state,
    source: { bucket: 'b', path: 'p' },
    createdAt: '2026-05-13T00:00:00.000Z' as Video['createdAt'],
    updatedAt: new Date().toISOString() as Video['updatedAt'],
  };
}

describe('VideoStateBadgeComponent — slice B copy', () => {
  let fixture: ComponentFixture<VideoStateBadgeComponent>;
  let subject: Subject<Video>;

  beforeEach(() => {
    subject = new Subject<Video>();
    TestBed.configureTestingModule({
      imports: [VideoStateBadgeComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: VideoStatePollingService, useValue: { poll: () => subject.asObservable() } },
      ],
    });
    fixture = TestBed.createComponent(VideoStateBadgeComponent);
  });

  it('shows TRANSCODING copy and a spinner', () => {
    fixture.componentRef.setInput('video', video('TRANSCODING'));
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Processing video');
  });

  it('shows READY copy', () => {
    fixture.componentRef.setInput('video', video('READY'));
    fixture.detectChanges();
    expect((fixture.nativeElement.textContent as string)).toContain('Ready to publish');
  });

  it('shows FAILED copy', () => {
    fixture.componentRef.setInput('video', video('FAILED'));
    fixture.detectChanges();
    expect((fixture.nativeElement.textContent as string)).toContain('Transcoding failed');
  });

  it('updates copy when the polling stream emits a new state', () => {
    fixture.componentRef.setInput('video', video('TRANSCODING'));
    fixture.detectChanges();
    subject.next(video('READY'));
    fixture.detectChanges();
    expect((fixture.nativeElement.textContent as string)).toContain('Ready to publish');
  });

  it('shows stuck-state copy when TRANSCODING is older than the threshold', () => {
    const stale: Video = {
      ...video('TRANSCODING'),
      updatedAt: new Date(Date.now() - 31 * 60 * 1000).toISOString() as Video['updatedAt'],
    };
    fixture.componentRef.setInput('video', stale);
    fixture.detectChanges();
    expect((fixture.nativeElement.textContent as string)).toContain('Transcoding may have stalled');
  });

  it('keeps the slice A stuck-state copy for PENDING_UPLOAD older than 30m', () => {
    const stale: Video = {
      ...video('PENDING_UPLOAD'),
      updatedAt: new Date(Date.now() - 31 * 60 * 1000).toISOString() as Video['updatedAt'],
    };
    fixture.componentRef.setInput('video', stale);
    fixture.detectChanges();
    expect((fixture.nativeElement.textContent as string)).toContain('Upload may have stalled');
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

```bash
pnpm nx test web-video -- video-state-badge
```

Expected: FAIL — badge does not consume the polling service yet, copy doesn't match.

- [ ] **Step 3: Rewrite `video-state-badge.component.ts`**

Replace `libs/web-video/src/lib/video-state-badge.component.ts` with:

```ts
import { Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import type { Video } from '@learnwren/shared-data-models';

import { VideoStatePollingService } from './polling/video-state-polling.service';

const STUCK_THRESHOLD_MIN = 30;
const NON_TERMINAL: ReadonlyArray<Video['state']> = ['UPLOADED', 'TRANSCODING'];

@Component({
  selector: 'lib-video-state-badge',
  standalone: true,
  templateUrl: './video-state-badge.component.html',
})
export class VideoStateBadgeComponent implements OnInit {
  readonly video = input.required<Video>();

  private readonly polling = inject(VideoStatePollingService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly liveVideo = signal<Video | null>(null);

  private readonly current = computed(() => this.liveVideo() ?? this.video());

  readonly label = computed(() => {
    const v = this.current();
    if (this.isStuck(v, 'PENDING_UPLOAD')) return 'Upload may have stalled — retry?';
    if (this.isStuck(v, 'TRANSCODING')) return 'Transcoding may have stalled — delete and re-upload?';
    switch (v.state) {
      case 'PENDING_UPLOAD':
      case 'UPLOADED':
        return 'Uploaded — preparing…';
      case 'TRANSCODING':
        return 'Processing video…';
      case 'READY':
        return 'Ready to publish';
      case 'FAILED':
        return 'Transcoding failed — delete and re-upload';
      default:
        return '';
    }
  });

  readonly canRetry = computed(() => this.isStuck(this.current(), 'PENDING_UPLOAD'));
  readonly showSpinner = computed(() =>
    NON_TERMINAL.includes(this.current().state) && !this.canRetry(),
  );

  ngOnInit(): void {
    const v = this.video();
    if (NON_TERMINAL.includes(v.state)) {
      this.polling
        .poll(v.id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((next) => this.liveVideo.set(next));
    }
  }

  private isStuck(v: Video, forState: Video['state']): boolean {
    if (v.state !== forState) return false;
    const ageMs = Date.now() - new Date(v.updatedAt).getTime();
    return ageMs > STUCK_THRESHOLD_MIN * 60 * 1000;
  }
}
```

- [ ] **Step 4: Update the template**

Replace `libs/web-video/src/lib/video-state-badge.component.html` with:

```html
<span class="badge" [attr.data-state]="video().state">
  @if (showSpinner()) {
    <span class="spinner" aria-hidden="true"></span>
  }
  {{ label() }}
</span>
```

- [ ] **Step 5: Run tests, expect pass**

```bash
pnpm nx test web-video
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/web-video/src/lib/video-state-badge.component.ts \
        libs/web-video/src/lib/video-state-badge.component.html \
        libs/web-video/src/lib/video-state-badge.component.spec.ts
git commit -m "feat(web-video): badge subscribes to polling + slice B copy for TRANSCODING/READY/FAILED"
```

---

## Task 19: Update Stryker config for slice B's new files

**Files:**
- Modify: `stryker.api-video.config.mjs`

The new submodule directories (`transcoder/`, `webhook/`) are picked up automatically by the existing `libs/api-video/src/lib/**/*.ts` glob. Slice B keeps `video.repository.ts`, `video-storage.adapter.ts`, `video.module.ts`, `video.exception-filter.ts`, `video.config.ts`, `dto/**`, `types/**`, `errors/**`, `index.ts` excluded. **All new files** (`transcoder/*.ts`, `webhook/*.ts`) are **included** in the mutated set.

- [ ] **Step 1: Verify the existing `mutate` array still covers new files**

```bash
grep -n "mutate" stryker.api-video.config.mjs
```

The existing array begins with `libs/api-video/src/lib/**/*.ts` so all new files are automatically included. No edit required.

- [ ] **Step 2: Run mutation testing locally (long-running)**

```bash
pnpm mutate:api-video
```

Expected: ≥ 85% effective score (parity with slice A). If lower, examine the Stryker HTML report at `reports/mutation/api-video/mutation.html`. Likely surviving mutants:

- Off-by-one in retry-attempt counter
- Boundary conditions on the stuck-state threshold
- Webhook reason-string-equality checks
- Timeout-based polling logic in service

Address surviving mutants by adding targeted tests in the relevant `*.spec.ts` files until the score crosses 85%. Equivalent mutants (semantically equal to original) are documented in the triage summary in Task 22.

- [ ] **Step 3: Commit if Stryker config was modified**

```bash
# Only if you edited stryker.api-video.config.mjs:
git add stryker.api-video.config.mjs
git commit -m "chore(quality): Stryker config touch-ups for slice B file layout"
```

If no edits were needed, skip the commit.

---

## Task 20: api-e2e — transcoding lifecycle, webhook auth, idempotency, READY cascade

**Files:**
- Modify: `apps/api-e2e/src/videos.e2e-spec.ts`

Reuses the existing fixture (`apps/api-e2e/src/fixtures/small-video.mp4`) and the `registerAndPromoteInstructor` / `API_BASE` helpers from `_helpers/auth.ts`. The emulator runs the API with `LEARNWREN_VIDEO_TRANSCODER=fake`; tests poke the fake completer route to advance state.

- [ ] **Step 1: Add the slice B e2e block**

Append to `apps/api-e2e/src/videos.e2e-spec.ts`:

```ts
test('upload → transcoding → READY via fake completer', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const hdr = { Cookie: instructor.cookieHeader };
  const { course, mod, lesson } = await createCourseModuleLesson(request, hdr);

  const sess = await request.post(
    `${API_BASE}/courses/${course.id}/modules/${mod.id}/lessons/${lesson.id}/video/upload-session`,
    { headers: hdr, data: { sizeBytes: FIXTURE_BYTES.length, contentType: 'video/mp4' } },
  );
  const { videoId, uploadSessionUri } = (await sess.json()) as {
    videoId: string;
    uploadSessionUri: string;
  };
  await request.put(uploadSessionUri, {
    headers: { 'Content-Range': `bytes 0-${FIXTURE_BYTES.length - 1}/${FIXTURE_BYTES.length}` },
    data: FIXTURE_BYTES,
  });

  const complete = await request.post(`${API_BASE}/videos/${videoId}/upload-complete`, { headers: hdr });
  expect(complete.status()).toBe(200);
  const afterComplete = (await complete.json()) as { state: string; keyId?: string; transcoderJobName?: string };
  expect(afterComplete.state).toBe('TRANSCODING');
  expect(afterComplete.keyId).toBeTruthy();
  expect(afterComplete.transcoderJobName).toBeTruthy();

  // Trigger the fake-completer.
  const completeRes = await request.post(`${API_BASE}/internal/fake-transcoder/complete/${videoId}`);
  expect(completeRes.status()).toBe(204);

  const get = await request.get(`${API_BASE}/videos/${videoId}`, { headers: hdr });
  const ready = (await get.json()) as { state: string; output?: { manifestPath: string; durationSec: number } };
  expect(ready.state).toBe('READY');
  expect(ready.output?.manifestPath).toBe(`videos/${videoId}/hls/manifest.m3u8`);
  expect(ready.output?.durationSec).toBeGreaterThan(0);
});

test('fake-transcoder fail path → FAILED with reason', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const hdr = { Cookie: instructor.cookieHeader };
  const { course, mod, lesson } = await createCourseModuleLesson(request, hdr);

  const sess = await request.post(
    `${API_BASE}/courses/${course.id}/modules/${mod.id}/lessons/${lesson.id}/video/upload-session`,
    { headers: hdr, data: { sizeBytes: FIXTURE_BYTES.length, contentType: 'video/mp4' } },
  );
  const { videoId, uploadSessionUri } = (await sess.json()) as { videoId: string; uploadSessionUri: string };
  await request.put(uploadSessionUri, {
    headers: { 'Content-Range': `bytes 0-${FIXTURE_BYTES.length - 1}/${FIXTURE_BYTES.length}` },
    data: FIXTURE_BYTES,
  });
  await request.post(`${API_BASE}/videos/${videoId}/upload-complete`, { headers: hdr });

  await request.post(`${API_BASE}/internal/fake-transcoder/fail/${videoId}`, {
    data: { reason: 'unsupported codec' },
  });

  const get = await request.get(`${API_BASE}/videos/${videoId}`, { headers: hdr });
  const failed = (await get.json()) as { state: string; failureReason?: string };
  expect(failed.state).toBe('FAILED');
  expect(failed.failureReason).toMatch(/TRANSCODE_FAILED.*unsupported codec/);
});

test('fake-completer is idempotent — second call is a no-op', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const hdr = { Cookie: instructor.cookieHeader };
  const { course, mod, lesson } = await createCourseModuleLesson(request, hdr);

  const sess = await request.post(
    `${API_BASE}/courses/${course.id}/modules/${mod.id}/lessons/${lesson.id}/video/upload-session`,
    { headers: hdr, data: { sizeBytes: FIXTURE_BYTES.length, contentType: 'video/mp4' } },
  );
  const { videoId, uploadSessionUri } = (await sess.json()) as { videoId: string; uploadSessionUri: string };
  await request.put(uploadSessionUri, {
    headers: { 'Content-Range': `bytes 0-${FIXTURE_BYTES.length - 1}/${FIXTURE_BYTES.length}` },
    data: FIXTURE_BYTES,
  });
  await request.post(`${API_BASE}/videos/${videoId}/upload-complete`, { headers: hdr });

  const first = await request.post(`${API_BASE}/internal/fake-transcoder/complete/${videoId}`);
  expect(first.status()).toBe(204);

  const second = await request.post(`${API_BASE}/internal/fake-transcoder/complete/${videoId}`);
  expect(second.status()).toBe(200);
  const body = (await second.json()) as { acked: boolean; reason: string };
  expect(body.reason).toBe('ALREADY_APPLIED');
});

test('webhook auth — production-style route rejects unsigned envelopes', async ({ request }) => {
  // The fake controller bypasses auth (by design — dev-only). The real route
  // /api/internal/transcoder-events requires a valid OIDC token; an unsigned
  // POST must be rejected.
  const r = await request.post(`${API_BASE}/internal/transcoder-events`, {
    data: { message: { data: Buffer.from(JSON.stringify({ job: { name: 'j', state: 'SUCCEEDED', labels: { videoid: 'v' } } })).toString('base64') } },
  });
  expect([401, 403]).toContain(r.status());
});

test('webhook event for non-existent video is acknowledged + dropped', async ({ request }) => {
  const r = await request.post(`${API_BASE}/internal/fake-transcoder/complete/does-not-exist`);
  expect(r.status()).toBe(200);
  const body = (await r.json()) as { reason: string };
  expect(body.reason).toBe('VIDEO_NOT_FOUND');
});

test('lesson-delete cascades a READY video — output bucket cleaned', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const hdr = { Cookie: instructor.cookieHeader };
  const { course, mod, lesson } = await createCourseModuleLesson(request, hdr);

  const sess = await request.post(
    `${API_BASE}/courses/${course.id}/modules/${mod.id}/lessons/${lesson.id}/video/upload-session`,
    { headers: hdr, data: { sizeBytes: FIXTURE_BYTES.length, contentType: 'video/mp4' } },
  );
  const { videoId, uploadSessionUri } = (await sess.json()) as { videoId: string; uploadSessionUri: string };
  await request.put(uploadSessionUri, {
    headers: { 'Content-Range': `bytes 0-${FIXTURE_BYTES.length - 1}/${FIXTURE_BYTES.length}` },
    data: FIXTURE_BYTES,
  });
  await request.post(`${API_BASE}/videos/${videoId}/upload-complete`, { headers: hdr });
  await request.post(`${API_BASE}/internal/fake-transcoder/complete/${videoId}`);

  const delLesson = await request.delete(
    `${API_BASE}/courses/${course.id}/modules/${mod.id}/lessons/${lesson.id}`,
    { headers: hdr },
  );
  expect(delLesson.status()).toBe(204);

  const get = await request.get(`${API_BASE}/videos/${videoId}`, { headers: hdr });
  expect(get.status()).toBe(404);
});
```

- [ ] **Step 2: Run the new tests against the emulator**

```bash
# In a separate terminal:
pnpm emulators

# In the main shell:
LEARNWREN_VIDEO_TRANSCODER=fake \
LEARNWREN_VIDEO_OUTPUT_BUCKET=demo-out \
  pnpm nx run api-e2e:e2e --testNamePattern="fake-transcoder|transcoding|webhook|READY"
```

Expected: PASS. The auth flake noted in `MEMORY.md` may surface on the registerAndPromoteInstructor calls; re-run if a single test fails on the `users/{uid}` write/read race.

- [ ] **Step 3: Commit**

```bash
git add apps/api-e2e/src/videos.e2e-spec.ts
git commit -m "test(api-e2e): transcoding lifecycle, webhook auth, idempotency, READY cascade"
```

---

## Task 21: web-e2e — badge transitions through TRANSCODING → READY

**Files:**
- Modify: `apps/web-e2e/src/videos.spec.ts`

Drives the editor UI through a real upload, calls the fake-completer via direct API request, and asserts the badge text. Uses the existing fixture.

- [ ] **Step 1: Add the slice B e2e**

Append to `apps/web-e2e/src/videos.spec.ts`:

```ts
test('badge transitions from Processing to Ready after fake-completer', async ({ page }) => {
  const { email, password } = await registerAndPromoteInstructor();
  await setupCourseWithLesson(page, email, password);

  // Capture videoId from the upload-session response so we can drive the fake-completer.
  const sessionResponse = page.waitForResponse(
    (r) => r.url().includes('/video/upload-session') && r.request().method() === 'POST',
  );
  await page.locator('lib-video-upload input[type="file"]').setInputFiles(FIXTURE_MP4);
  const sessionBody = (await (await sessionResponse).json()) as { videoId: string };
  const videoId = sessionBody.videoId;

  // After upload completes, the badge should reflect TRANSCODING.
  await expect(page.locator('lib-video-state-badge .badge')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('lib-video-state-badge .badge')).toContainText('Processing video', {
    timeout: 15_000,
  });

  // Trigger the fake-completer via page.request (reuses the page's session cookie).
  const res = await page.request.post(`${API_BASE}/internal/fake-transcoder/complete/${videoId}`);
  expect(res.status()).toBe(204);

  // Default poll interval is 5s; allow up to 8s for the next cycle to flip the copy.
  await expect(page.locator('lib-video-state-badge .badge')).toContainText('Ready to publish', {
    timeout: 8_000,
  });
});

test('badge transitions to Failed copy after fake-fail', async ({ page }) => {
  const { email, password } = await registerAndPromoteInstructor();
  await setupCourseWithLesson(page, email, password);

  const sessionResponse = page.waitForResponse(
    (r) => r.url().includes('/video/upload-session') && r.request().method() === 'POST',
  );
  await page.locator('lib-video-upload input[type="file"]').setInputFiles(FIXTURE_MP4);
  const { videoId } = (await (await sessionResponse).json()) as { videoId: string };

  await expect(page.locator('lib-video-state-badge .badge')).toBeVisible({ timeout: 30_000 });
  await page.request.post(`${API_BASE}/internal/fake-transcoder/fail/${videoId}`, {
    data: { reason: 'codec unsupported' },
  });
  await expect(page.locator('lib-video-state-badge .badge')).toContainText('Transcoding failed', {
    timeout: 8_000,
  });
});
```

To reduce wall-clock duration, the e2e Playwright webServer should boot the dev API with `LEARNWREN_WEB_VIDEO_POLL_INTERVAL_MS=1000` so the badge polls every 1 second (slice A's `apps/web-e2e/playwright.config.ts` declares a webServer block — extend its `env` map to set this override). The 8-second timeout then accommodates ~7 poll cycles.

- [ ] **Step 2: Run the new tests**

```bash
pnpm emulators &
sleep 8
pnpm nx run web-e2e:e2e --testNamePattern="Processing|Ready|Transcoding failed"
kill %1 2>/dev/null || true
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web-e2e/src/videos.spec.ts
git commit -m "test(web-e2e): badge transitions through TRANSCODING → READY / FAILED"
```

---

## Task 22: Refresh CRAP + mutation reports

**Files:**
- Modify: `docs/quality/crap-report.md`
- Modify: `docs/quality/mutation-report.md`
- Modify: `reports/mutation/api-video/mutation.html` + `mutation.json` (auto-regenerated)

- [ ] **Step 1: Refresh coverage and CRAP**

```bash
pnpm crap:coverage
pnpm crap
```

Expected: writes `docs/quality/crap-report.md` covering all libs including new `libs/api-video/src/lib/transcoder/*.ts`, `libs/api-video/src/lib/webhook/*.ts`, `libs/web-video/src/lib/polling/*.ts`.

- [ ] **Step 2: Refresh mutation reports**

```bash
pnpm mutate
```

Expected: writes per-lib Stryker reports under `reports/mutation/`. The api-video score should be ≥ 85%.

- [ ] **Step 3: Update the mutation summary doc**

Edit `docs/quality/mutation-report.md`. Update the score line for `api-video` (was 85.42% in commit `4be21ab`; new score should be at least that). Add a short slice B note under api-video's section describing newly-mutated surface (transcoder/, webhook/) and any equivalent mutants (e.g., concrete numeric values for retry counts/intervals that are semantically constant).

- [ ] **Step 4: Commit**

```bash
git add docs/quality/crap-report.md docs/quality/mutation-report.md reports/mutation/api-video/
git commit -m "docs(quality): refresh CRAP + mutation reports for slice B"
```

---

## Task 23: Pub/Sub provisioning runbook + README slice marker

**Files:**
- Create: `docs/operations/transcoder-pubsub-setup.md`
- Modify: `README.md`

- [ ] **Step 1: Create the runbook**

Create `docs/operations/transcoder-pubsub-setup.md` with the full content reproduced from `docs/superpowers/specs/2026-05-13-video-transcoding-slice-b-design.md` §5.3 (the `gcloud` script block), plus surrounding prose:

```markdown
# Transcoder Pub/Sub Setup — EP-03 Slice B

This is a one-time operational task per environment. Run it before deploying
slice B with `LEARNWREN_VIDEO_TRANSCODER=gcp`. CI and local dev use
`LEARNWREN_VIDEO_TRANSCODER=fake` and do not need any of this.

## Prerequisites

- `gcloud` CLI authenticated as a project owner.
- `LEARNWREN_GCP_PROJECT_ID`, `LEARNWREN_TRANSCODER_LOCATION` decided.
- Output bucket already provisioned: `${project}-video-output`.

## Steps

(Reproduce the `gcloud` script from the design spec §5.3 verbatim.)

## Verification

After provisioning:
```bash
gcloud pubsub subscriptions describe learn-wren-transcoder-events-${ENV}-sub \
  --format='value(pushConfig.pushEndpoint, pushConfig.oidcToken.serviceAccountEmail)'
```

Expected: the push endpoint matches `LEARNWREN_TRANSCODER_WEBHOOK_AUDIENCE`
and the SA email matches `LEARNWREN_TRANSCODER_INVOKER_SA_EMAIL`.

## Tearing down

```bash
gcloud pubsub subscriptions delete learn-wren-transcoder-events-${ENV}-sub
gcloud pubsub subscriptions delete learn-wren-transcoder-events-${ENV}-deadletter-sub
gcloud pubsub topics delete learn-wren-transcoder-events-${ENV}-deadletter
gcloud pubsub topics delete learn-wren-transcoder-events-${ENV}
gcloud iam service-accounts delete ${INVOKER_SA}
```
```

Fill in the runbook with the full gcloud script copied from `docs/superpowers/specs/2026-05-13-video-transcoding-slice-b-design.md` §5.3 (do not paraphrase — verbatim, with all 7 numbered steps).

- [ ] **Step 2: Update the README slice marker**

In `README.md`, find the slice A line — search for `EP-03 slice A` — and replace the surrounding banner with:

> The monorepo, both apps' "hello world" slices, the Firebase Emulator Suite, the real-project switch (`LEARNWREN_FIREBASE_TARGET=production`), the hardened auth slice (register / login / verification gate / brute-force lockout / password reset / session cookie / protected route), the course authoring slice (EP-02 US-02-01..03: instructor role promotion, REST course surface, drag-and-drop editor), and **EP-03 slices A + B (video upload through transcoding): instructor uploads MP4 / MOV / MKV ≤ 10 GB to a lesson via resumable upload, ffprobe + GCP Transcoder API + AES-128 HLS produce playable manifests on the output bucket, badge reflects live state** are wired up. Course publish (US-02-04) and cover image upload are deferred. **Owner playback is deferred to EP-03 slice C.** Instructor dashboard and platform administration remain in post-MVP planning.

- [ ] **Step 3: Commit**

```bash
git add docs/operations/transcoder-pubsub-setup.md README.md
git commit -m "docs(ops): transcoder Pub/Sub setup runbook + slice B README banner"
```

---

## Task 24: Final verification + spec status update

**Files:**
- Modify: `docs/superpowers/specs/2026-05-13-video-transcoding-slice-b-design.md`

- [ ] **Step 1: Full quality gates**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm nx run-many -t build --projects=api,api-video,web-video,web,api-auth,api-courses,api-firebase,web-auth,web-courses,shared-data-models
```

Expected: all green.

- [ ] **Step 2: Run api-e2e and web-e2e**

```bash
pnpm emulators &
sleep 8
pnpm nx run api-e2e:e2e
pnpm nx run web-e2e:e2e
kill %1 2>/dev/null || true
```

Expected: all PASS. The slice A auth flake may strike; rerun any single failing test once.

- [ ] **Step 3: Mark the spec Approved**

In `docs/superpowers/specs/2026-05-13-video-transcoding-slice-b-design.md`, replace:

```markdown
**Status:** Draft (2026-05-13)
```

with:

```markdown
**Status:** Approved (2026-05-13)
```

And remove the `> [!NOTE] DOCUMENT STATUS: DRAFT` block at the top.

- [ ] **Step 4: Commit + push**

```bash
git add docs/superpowers/specs/2026-05-13-video-transcoding-slice-b-design.md
git commit -m "docs(specs): slice B design Approved"
git push -u origin ep-03-slice-b-video-transcoding
```

- [ ] **Step 5: Open the PR**

```bash
gh pr create --title "feat: EP-03 slice B — video transcoding + AES-128 key generation" \
  --body "$(cat <<'EOF'
## Summary
- Probe source with ffprobe, generate AES-128 key, submit GCP Transcoder job inside the upload-complete handler with 3× retry
- Pub/Sub push subscription → /api/internal/transcoder-events; idempotent state transitions to READY / FAILED
- FakeTranscoderAdapter + dev-only simulator routes enable CI end-to-end without GCP Transcoder API
- Editor badge polls /api/videos/:vid every 5s while TRANSCODING; copy updates for live state
- DELETE on TRANSCODING / READY cancels job and cleans output bucket best-effort
- VideoTranscoder port amended in architecture spec (parseEvent → async; cancelJob added)

## Test plan
- [ ] pnpm lint && pnpm typecheck && pnpm test
- [ ] pnpm nx run api-e2e:e2e (covers fake-transcoder happy path, fail path, idempotency, webhook auth, READY cascade)
- [ ] pnpm nx run web-e2e:e2e (covers Processing → Ready and Processing → Failed badge transitions)
- [ ] pnpm mutate:api-video meets ≥ 85% threshold
- [ ] Manual run-through against dev GCP project per spec §10 acceptance bar
EOF
)"
```

---

## Appendix A — Task 8 implementation (`video-storage.adapter.ts`)

Replace the full contents of `libs/api-video/src/lib/video-storage.adapter.ts` with the following. The runner uses Node's safe `execFile` API (no shell, no command injection); the binary path is resolved at import time from `@ffprobe-installer/ffprobe`. Tests replace the runner via `__setRunner` so no subprocess actually fires in unit tests.

```ts
import { execFile as nodeExecFile } from 'node:child_process';
import { promisify } from 'node:util';

import { Inject, Injectable } from '@nestjs/common';

import { FIREBASE_STORAGE, type FirebaseStorageHandle } from '@learnwren/api-firebase';

const promisifiedExecFile = promisify(nodeExecFile);

let ffprobeBinaryPath: string;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ffprobeBinaryPath = require('@ffprobe-installer/ffprobe').path;
} catch {
  ffprobeBinaryPath = 'ffprobe';
}

export interface ResumableSession {
  uri: string;
  expiresAt: string;
}

export interface ObjectMetadata {
  size: number;
}

export interface SourceProbe {
  height: number;
  durationSec: number;
}

export type FfprobeRunner = (binary: string, args: string[]) => Promise<{ stdout: string }>;

export interface VideoStoragePort {
  createResumableSession(input: {
    bucket: string;
    path: string;
    contentType: string;
    videoId: string;
  }): Promise<ResumableSession>;
  headObject(input: { bucket: string; path: string }): Promise<ObjectMetadata | null>;
  deleteObject(input: { bucket: string; path: string }): Promise<void>;
  deletePrefix(input: { bucket: string; prefix: string }): Promise<void>;
  probeSource(input: { bucket: string; path: string }): Promise<SourceProbe>;
}

@Injectable()
export class VideoStorageAdapter implements VideoStoragePort {
  private runner: FfprobeRunner = (binary, args) => promisifiedExecFile(binary, args);

  constructor(@Inject(FIREBASE_STORAGE) private readonly storage: FirebaseStorageHandle) {}

  /** Test hook — never called in production code paths. */
  __setRunner(runner: FfprobeRunner): void {
    this.runner = runner;
  }

  async createResumableSession(input: {
    bucket: string;
    path: string;
    contentType: string;
    videoId: string;
  }): Promise<ResumableSession> {
    const file = this.storage.bucket(input.bucket).file(input.path);
    const [uri] = await file.createResumableUpload({
      metadata: {
        contentType: input.contentType,
        metadata: { videoId: input.videoId },
      },
      origin: '*',
    });
    return {
      uri,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    };
  }

  async headObject(input: { bucket: string; path: string }): Promise<ObjectMetadata | null> {
    const file = this.storage.bucket(input.bucket).file(input.path);
    try {
      const [meta] = await file.getMetadata();
      const size = typeof meta.size === 'string' ? Number(meta.size) : (meta.size as number);
      return { size };
    } catch (err) {
      const code = (err as { code?: number }).code;
      if (code === 404) return null;
      throw err;
    }
  }

  async deleteObject(input: { bucket: string; path: string }): Promise<void> {
    const file = this.storage.bucket(input.bucket).file(input.path);
    try {
      await file.delete();
    } catch (err) {
      const code = (err as { code?: number }).code;
      if (code === 404) return;
      throw err;
    }
  }

  async deletePrefix(input: { bucket: string; prefix: string }): Promise<void> {
    try {
      await this.storage.bucket(input.bucket).deleteFiles({ prefix: input.prefix });
    } catch {
      // best-effort; caller logs
    }
  }

  async probeSource(input: { bucket: string; path: string }): Promise<SourceProbe> {
    const file = this.storage.bucket(input.bucket).file(input.path);
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 60_000,
      version: 'v4',
    });
    const { stdout } = await this.runner(ffprobeBinaryPath, [
      '-v', 'error',
      '-print_format', 'json',
      '-show_streams',
      '-show_format',
      signedUrl,
    ]);
    const parsed = JSON.parse(stdout) as {
      streams?: { codec_type?: string; height?: number }[];
      format?: { duration?: string };
    };
    const videoStream = parsed.streams?.find((s) => s.codec_type === 'video');
    if (!videoStream || typeof videoStream.height !== 'number') {
      throw new Error('ffprobe found no video stream in source.');
    }
    return {
      height: videoStream.height,
      durationSec: Number(parsed.format?.duration ?? '0'),
    };
  }
}
```

---

## Appendix B — Task 11 implementation (`video.service.ts`)

Replace `libs/api-video/src/lib/video.service.ts` with the following. The constructor gains `VideoTranscoder` and an optional `deps` object whose `sleep` member is overridable from tests. `crypto.randomBytes` from Node's standard library produces the AES-128 key.

```ts
import { randomBytes } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';

import type {
  CourseId,
  ISODateString,
  LessonId,
  SupportedVideoContentType,
  UserId,
  Video,
  VideoId,
  VideoKeyId,
} from '@learnwren/shared-data-models';

import { VIDEO_CONFIG, type VideoConfig } from './video.config';
import {
  InvalidVideoStateException,
  LessonAlreadyHasVideoException,
  UploadObjectMissingException,
  UploadObjectSizeMismatchException,
  VideoNotFoundException,
} from './errors/video.exception';
import {
  VIDEO_TRANSCODER,
  type TranscoderEvent,
  type VideoTranscoder,
} from './transcoder/transcoder.port';
import { VideoRepository } from './video.repository';
import {
  VideoStorageAdapter,
  type VideoStoragePort,
} from './video-storage.adapter';

const SIZE_TOLERANCE = 1.05;
const MAX_SUBMIT_ATTEMPTS = 3;
const BACKOFF_MS = [1_000, 2_000, 4_000];

const EXT_BY_CONTENT_TYPE: Record<SupportedVideoContentType, 'mp4' | 'mov' | 'mkv'> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/x-matroska': 'mkv',
};

const DELETABLE_STATES: Readonly<Set<Video['state']>> = new Set([
  'PENDING_UPLOAD',
  'UPLOADED',
  'FAILED',
  'TRANSCODING',
  'READY',
]);

export interface CreateUploadSessionInput {
  uid: UserId;
  courseId: CourseId;
  lessonId: LessonId;
  lessonVideoId: VideoId | undefined;
  input: { sizeBytes: number; contentType: SupportedVideoContentType };
}

export interface CreateUploadSessionResult {
  videoId: VideoId;
  uploadSessionUri: string;
  expiresAt: string;
}

export interface VideoServiceDeps {
  sleep?: (ms: number) => Promise<void>;
}

function nowIso(): ISODateString {
  return new Date().toISOString() as ISODateString;
}

@Injectable()
export class VideoService {
  private readonly logger = new Logger('VideoService');
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly repo: VideoRepository,
    @Inject(VideoStorageAdapter) private readonly storage: VideoStoragePort,
    @Inject(VIDEO_CONFIG) private readonly cfg: VideoConfig,
    @Inject(VIDEO_TRANSCODER) private readonly transcoder: VideoTranscoder,
    deps?: VideoServiceDeps,
  ) {
    this.sleep = deps?.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  // --- Slice A surface (unchanged) ----------------------------------------

  async createUploadSession(args: CreateUploadSessionInput): Promise<CreateUploadSessionResult> {
    if (args.lessonVideoId) throw new LessonAlreadyHasVideoException();
    const videoId = this.repo.newId<VideoId>();
    const ext = EXT_BY_CONTENT_TYPE[args.input.contentType];
    const path = `videos/${videoId}/source.${ext}`;
    const now = nowIso();
    const video: Video = {
      id: videoId,
      ownerInstructorId: args.uid,
      courseId: args.courseId,
      lessonId: args.lessonId,
      state: 'PENDING_UPLOAD',
      source: { bucket: this.cfg.sourceBucket, path, sizeBytes: args.input.sizeBytes },
      createdAt: now,
      updatedAt: now,
    };
    await this.repo.createVideo(video);
    const session = await this.storage.createResumableSession({
      bucket: this.cfg.sourceBucket,
      path,
      contentType: args.input.contentType,
      videoId,
    });
    return { videoId, uploadSessionUri: session.uri, expiresAt: session.expiresAt };
  }

  async getVideo(vid: VideoId): Promise<Video> {
    const v = await this.repo.getVideo(vid);
    if (!v) throw new VideoNotFoundException();
    return v;
  }

  async markFailed(vid: VideoId, reason: string): Promise<Video> {
    const v = await this.repo.getVideo(vid);
    if (!v) throw new VideoNotFoundException();
    if (v.state !== 'PENDING_UPLOAD') throw new InvalidVideoStateException(v.state);
    const updatedAt = nowIso();
    await this.repo.updateVideo(vid, { state: 'FAILED', failureReason: reason, updatedAt });
    return { ...v, state: 'FAILED', failureReason: reason, updatedAt };
  }

  // --- Slice B: completeUpload chain --------------------------------------

  async completeUpload(vid: VideoId): Promise<Video> {
    const v = await this.repo.getVideo(vid);
    if (!v) throw new VideoNotFoundException();
    if (v.state !== 'PENDING_UPLOAD') throw new InvalidVideoStateException(v.state);

    const head = await this.storage.headObject({ bucket: v.source.bucket, path: v.source.path });
    if (!head) throw new UploadObjectMissingException();
    const declared = v.source.sizeBytes ?? 0;
    if (head.size > declared * SIZE_TOLERANCE) {
      await this.storage
        .deleteObject({ bucket: v.source.bucket, path: v.source.path })
        .catch(() => undefined);
      throw new UploadObjectSizeMismatchException();
    }

    let probe;
    try {
      probe = await this.storage.probeSource({ bucket: v.source.bucket, path: v.source.path });
    } catch (err) {
      this.logger.warn(`ffprobe failed for ${vid}: ${(err as Error).message}`);
      return this.repo.markFailedFromSubmission({
        vid,
        failureReason: `SOURCE_PROBE_FAILED: ${(err as Error).message}`.slice(0, 500),
        actualSizeBytes: head.size,
        nowIso: nowIso(),
      });
    }

    const keyBytes = new Uint8Array(randomBytes(16));
    const keyId = this.repo.newId<VideoKeyId>();
    const sourceUri = `gs://${v.source.bucket}/${v.source.path}`;
    const outputUriPrefix = `gs://${this.cfg.outputBucket}/videos/${vid}/hls/`;
    const submit = await this.submitWithRetry({
      videoId: vid,
      sourceUri,
      outputUriPrefix,
      encryptionKey: { id: keyId, bytes: keyBytes },
      sourceHeight: probe.height,
      topic: this.cfg.transcoderTopic ?? '',
    });
    if (!submit.ok) {
      return this.repo.markFailedFromSubmission({
        vid,
        failureReason: `TRANSCODER_SUBMIT_FAILED: ${submit.lastError}`.slice(0, 500),
        actualSizeBytes: head.size,
        nowIso: nowIso(),
      });
    }

    return this.repo.finalizeUploadWithJob({
      vid,
      lid: v.lessonId,
      actualSizeBytes: head.size,
      key: { id: keyId, bytes: keyBytes },
      transcoderJobName: submit.jobName,
      nowIso: nowIso(),
    });
  }

  private async submitWithRetry(
    input: Parameters<VideoTranscoder['submitJob']>[0],
  ): Promise<{ ok: true; jobName: string } | { ok: false; lastError: string }> {
    let lastError = 'unknown';
    for (let attempt = 0; attempt < MAX_SUBMIT_ATTEMPTS; attempt++) {
      try {
        const handle = await this.transcoder.submitJob(input);
        return { ok: true, jobName: handle.jobName };
      } catch (err) {
        lastError = (err as Error).message;
        this.logger.warn(`submitJob attempt ${attempt + 1} failed: ${lastError}`);
        if (attempt < MAX_SUBMIT_ATTEMPTS - 1) {
          await this.sleep(BACKOFF_MS[attempt]!);
        }
      }
    }
    return { ok: false, lastError };
  }

  // --- Slice B: webhook handler -------------------------------------------

  async handleTranscoderEvent(
    event: TranscoderEvent,
  ): Promise<{ acted: boolean; reason?: string }> {
    const common = { videoId: event.videoId, jobName: event.jobName, nowIso: nowIso() };
    if (event.type === 'JOB_SUCCEEDED') {
      return this.repo.applyTranscoderResult({
        ...common,
        outcome: {
          kind: 'READY',
          manifestPath: event.manifestPath,
          durationSec: event.durationSec,
          outputBucket: this.cfg.outputBucket,
        },
      });
    }
    return this.repo.applyTranscoderResult({
      ...common,
      outcome: { kind: 'FAILED', reason: event.reason },
    });
  }

  // --- Slice B: extended delete -------------------------------------------

  async delete(vid: VideoId): Promise<void> {
    const v = await this.repo.getVideo(vid);
    if (!v) throw new VideoNotFoundException();
    if (!DELETABLE_STATES.has(v.state)) throw new InvalidVideoStateException(v.state);

    if (v.state === 'TRANSCODING' && v.transcoderJobName) {
      await this.transcoder.cancelJob(v.transcoderJobName).catch((err) =>
        this.logger.warn(`cancelJob failed for ${v.transcoderJobName}: ${(err as Error).message}`),
      );
    }
    if (v.state === 'READY' && v.output?.bucket) {
      await this.storage.deletePrefix({
        bucket: v.output.bucket,
        prefix: `videos/${vid}/`,
      });
    }
    await this.storage
      .deleteObject({ bucket: v.source.bucket, path: v.source.path })
      .catch(() => undefined);
    await this.repo.deleteVideoAndDetach(v.id, v.lessonId, nowIso());
  }

  async deleteForLesson(lid: LessonId): Promise<void> {
    const v = await this.repo.getVideoByLesson(lid);
    if (!v) return;
    if (v.state === 'TRANSCODING' && v.transcoderJobName) {
      await this.transcoder.cancelJob(v.transcoderJobName).catch(() => undefined);
    }
    if (v.state === 'READY' && v.output?.bucket) {
      await this.storage.deletePrefix({
        bucket: v.output.bucket,
        prefix: `videos/${v.id}/`,
      });
    }
    await this.storage
      .deleteObject({ bucket: v.source.bucket, path: v.source.path })
      .catch(() => undefined);
    await this.repo.deleteVideoAndDetach(v.id, v.lessonId, nowIso());
  }
}
```

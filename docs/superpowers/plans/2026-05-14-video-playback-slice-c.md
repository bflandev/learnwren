# Video Owner Playback (EP-03 Slice C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a `Video.state === 'READY'`, replace the lesson-item badge with an inline `<video controls>` element that plays the AES-128 HLS bundle. Three new NestJS endpoints (`GET /api/playback/manifest/:vid`, `GET /api/playback/manifest/:vid/rendition/:r`, `GET /api/playback/keys/:vid`) serve a rewritten master m3u8, rewritten rendition m3u8s with signed segment URLs, and the raw 16-byte AES-128 key. A new `EnrollmentOrOwnerGuard` permits owner access today and exposes a `TODO(EP-06)` plug-point for enrolled-student playback.

**Architecture:** New `playback/` submodule under `libs/api-video/src/lib/` — pure rewriter (`manifest.rewriter.ts`) + IO seam (`manifest.service.ts`) + key reader (`key.service.ts`) + auth guard (`enrollment-or-owner.guard.ts`) + thin controller (`playback.controller.ts`). The slice A `VideoStorageAdapter` grows two methods (`readManifestObject`, `signObjectUrl`). New `player/` submodule under `libs/web-video/src/lib/` — `VideoPlayerComponent` (Angular standalone) + `VideoPlayerService` (hls.js lifecycle, the testable seam). `LessonItem` template gains a third render branch: `state === 'READY'` → `<lib-video-player>`. No new lib-to-lib edges. No Firestore schema, rules, or index changes.

**Tech Stack:** NestJS 11, Angular 21.2, `@google-cloud/storage` (existing, gains v4 signed URLs), `hls.js` (NEW, web only), `firebase-admin` 13.8, Vitest 4.1, Stryker 9.6, Playwright Test, RxJS 8.

**Foundation specs:**
- `docs/superpowers/specs/2026-05-14-video-playback-slice-c-design.md` (this slice — authoritative)
- `docs/superpowers/specs/2026-05-13-video-pipeline-architecture-design.md` (architecture — unchanged by slice C)
- `docs/superpowers/specs/2026-05-13-video-transcoding-slice-b-design.md` (slice B — provides `READY` state and bucket layout)
- `docs/superpowers/specs/2026-05-13-video-upload-slice-a-design.md` (slice A — guard / exception / adapter patterns)

**Repo conventions to follow:**
- Conventional Commits (`feat(api-video):`, `feat(web-video):`, `feat(web-courses):`, `chore(quality):`, `test(api-e2e):`, `test(web-e2e):`, `docs(ops):`, `docs(specs):`, `fix(...)`)
- Branded ID types from `@learnwren/shared-data-models`; ISO date strings on the wire
- DI tokens from `@learnwren/api-firebase` (`FIRESTORE`, `FIREBASE_STORAGE`)
- Domain exceptions extending `VideoException`; funnel through `VideoExceptionFilter`
- `libs/api-video/src/lib/video.module.ts` is the live NestJS module; `libs/api-video/src/lib/api-video.module.ts` is an empty placeholder — do not register there
- Stryker config (`stryker.api-video.config.mjs`) globs `libs/api-video/src/lib/**/*.ts` — new playback files are mutated automatically. Excluded set is unchanged
- After every task: targeted `pnpm nx test <project>` must pass; commit a fully-green increment

**Pre-flight check** (run before Task 1):

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test
git status   # must be clean
git checkout -b ep-03-slice-c-video-playback
```

---

## Task 1: Add playback signed-URL TTL to `.env.tpl`

**Files:**
- Modify: `.env.tpl`

- [ ] **Step 1: Append the slice C env block**

Open `.env.tpl` and add a new section after the existing slice B `LEARNWREN_WEB_VIDEO_POLL_INTERVAL_MS` line:

```
# ── Video playback (EP-03 slice C) ───────────────────────────────────
# Segment URL TTL in seconds. Cloud Storage v4 signed URLs minted on
# every manifest fetch expire after this window. 4 h matches the
# architecture spec (long-pause tolerance for a single owner session).
LEARNWREN_VIDEO_PLAYBACK_SIGNED_URL_TTL_SEC=14400
```

- [ ] **Step 2: Render and verify**

```bash
pnpm secrets:render
grep -c "LEARNWREN_VIDEO_PLAYBACK_SIGNED_URL_TTL_SEC" .env
```

Expected: `1`. The render command may emit `op://` warnings for unresolved 1Password references; those are pre-existing and unrelated.

- [ ] **Step 3: Commit**

```bash
git add .env.tpl
git commit -m "chore(env): add slice C playback signed-URL TTL"
```

---

## Task 2: Extend `VideoConfig` with `playbackSignedUrlTtlSec`

**Files:**
- Modify: `libs/api-video/src/lib/video.config.ts`
- Modify: `libs/api-video/src/lib/video.config.spec.ts`

- [ ] **Step 1: Write failing tests**

Append to `libs/api-video/src/lib/video.config.spec.ts`:

```ts
describe('readVideoConfigFromEnv — slice C fields', () => {
  const baseEnv = (): NodeJS.ProcessEnv => ({
    LEARNWREN_VIDEO_SOURCE_BUCKET: 'src',
    LEARNWREN_VIDEO_STUCK_THRESHOLD_MINUTES: '30',
    LEARNWREN_VIDEO_OUTPUT_BUCKET: 'out',
    LEARNWREN_VIDEO_TRANSCODER: 'fake',
    LEARNWREN_WEB_VIDEO_POLL_INTERVAL_MS: '5000',
  });

  it('defaults playbackSignedUrlTtlSec to 14400 (4 h) when unset', () => {
    const cfg = readVideoConfigFromEnv(baseEnv());
    expect(cfg.playbackSignedUrlTtlSec).toBe(14400);
  });

  it('parses LEARNWREN_VIDEO_PLAYBACK_SIGNED_URL_TTL_SEC when set', () => {
    const env = baseEnv();
    env.LEARNWREN_VIDEO_PLAYBACK_SIGNED_URL_TTL_SEC = '900';
    const cfg = readVideoConfigFromEnv(env);
    expect(cfg.playbackSignedUrlTtlSec).toBe(900);
  });

  it('rejects non-finite TTL', () => {
    const env = baseEnv();
    env.LEARNWREN_VIDEO_PLAYBACK_SIGNED_URL_TTL_SEC = 'banana';
    expect(() => readVideoConfigFromEnv(env)).toThrow(/TTL/i);
  });

  it('rejects non-positive TTL', () => {
    const env = baseEnv();
    env.LEARNWREN_VIDEO_PLAYBACK_SIGNED_URL_TTL_SEC = '0';
    expect(() => readVideoConfigFromEnv(env)).toThrow(/TTL/i);
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

```bash
pnpm nx test api-video -- video.config.spec
```

Expected: new tests fail (no `playbackSignedUrlTtlSec` field on `VideoConfig`).

- [ ] **Step 3: Add the field and reader**

In `libs/api-video/src/lib/video.config.ts`, add to the `VideoConfig` interface (right after `transcoderImpl`):

```ts
  playbackSignedUrlTtlSec: number;
```

Then in `readVideoConfigFromEnv`, after the `pollIntervalMs` read, add:

```ts
  const playbackSignedUrlTtlSec = readPositiveNumber(
    env,
    'LEARNWREN_VIDEO_PLAYBACK_SIGNED_URL_TTL_SEC',
    '14400',
  );
```

In the `base` config object, add the field:

```ts
  const base: VideoConfig = {
    sourceBucket,
    outputBucket,
    stuckThresholdMinutes,
    pollIntervalMs,
    playbackSignedUrlTtlSec,
    transcoderImpl: implRaw,
  };
```

Adjust the error message inside `readPositiveNumber` if your existing message is generic — if it already says `"<name> must be a positive number"`, the new field's failing tests will see `/TTL/i` match via the `LEARNWREN_VIDEO_PLAYBACK_SIGNED_URL_TTL_SEC` name. Confirm by reading the test message expectations carefully.

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm nx test api-video -- video.config.spec
```

Expected: all `slice C fields` tests pass; slice A/B tests still pass.

- [ ] **Step 5: Commit**

```bash
git add libs/api-video/src/lib/video.config.ts libs/api-video/src/lib/video.config.spec.ts
git commit -m "feat(api-video): add playbackSignedUrlTtlSec to VideoConfig"
```

---

## Task 3: Add slice C error codes and exception classes

**Files:**
- Modify: `libs/api-video/src/lib/errors/video-error.codes.ts`
- Modify: `libs/api-video/src/lib/errors/video.exception.ts`
- Modify: `libs/api-video/src/lib/errors/video.exception.spec.ts`

The spec §2.4 adds four new HTTP error codes: `RENDITION_NOT_FOUND` (404), `VIDEO_NOT_READY` (409), `KEY_LOOKUP_FAILED` (500), `MANIFEST_PARSE_FAILED` (502). `NOT_VIDEO_OWNER` and `VIDEO_NOT_FOUND` already exist on slice A.

- [ ] **Step 1: Extend the union of codes**

In `libs/api-video/src/lib/errors/video-error.codes.ts`, replace the union with:

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
  | 'RENDITION_NOT_FOUND'
  | 'VIDEO_NOT_READY'
  | 'KEY_LOOKUP_FAILED'
  | 'MANIFEST_PARSE_FAILED'
  | 'INTERNAL';
```

- [ ] **Step 2: Write failing tests for new exception shapes**

Append to `libs/api-video/src/lib/errors/video.exception.spec.ts`:

```ts
import {
  KeyLookupFailedException,
  ManifestParseFailedException,
  RenditionNotFoundException,
  VideoNotReadyException,
} from './video.exception';

describe('slice C exceptions', () => {
  it('RenditionNotFoundException → 404 RENDITION_NOT_FOUND', () => {
    const ex = new RenditionNotFoundException('xyz');
    expect(ex.status).toBe(404);
    expect(ex.code).toBe('RENDITION_NOT_FOUND');
    expect(ex.message).toMatch(/xyz/);
  });

  it('VideoNotReadyException → 409 VIDEO_NOT_READY carries currentState', () => {
    const ex = new VideoNotReadyException('TRANSCODING');
    expect(ex.status).toBe(409);
    expect(ex.code).toBe('VIDEO_NOT_READY');
    expect(ex.details).toEqual({ currentState: 'TRANSCODING' });
  });

  it('KeyLookupFailedException → 500 KEY_LOOKUP_FAILED', () => {
    const ex = new KeyLookupFailedException();
    expect(ex.status).toBe(500);
    expect(ex.code).toBe('KEY_LOOKUP_FAILED');
  });

  it('ManifestParseFailedException → 502 MANIFEST_PARSE_FAILED carries detail', () => {
    const ex = new ManifestParseFailedException('missing #EXTM3U');
    expect(ex.status).toBe(502);
    expect(ex.code).toBe('MANIFEST_PARSE_FAILED');
    expect(ex.message).toMatch(/missing #EXTM3U/);
  });
});
```

- [ ] **Step 3: Run tests, expect failure**

```bash
pnpm nx test api-video -- video.exception.spec
```

Expected: failures — the new exception classes don't exist.

- [ ] **Step 4: Add the exception classes**

Append to `libs/api-video/src/lib/errors/video.exception.ts`:

```ts
export class RenditionNotFoundException extends VideoException {
  constructor(rendition: string) {
    super(
      'RENDITION_NOT_FOUND',
      `Rendition "${rendition}" is not available.`,
      404,
      { rendition },
    );
  }
}

export class VideoNotReadyException extends VideoException {
  constructor(currentState: string) {
    super(
      'VIDEO_NOT_READY',
      `Video is not ready for playback (current state: ${currentState}).`,
      409,
      { currentState },
    );
  }
}

export class KeyLookupFailedException extends VideoException {
  constructor(detail?: string) {
    super(
      'KEY_LOOKUP_FAILED',
      detail ? `Encryption key lookup failed: ${detail}.` : 'Encryption key lookup failed.',
      500,
    );
  }
}

export class ManifestParseFailedException extends VideoException {
  constructor(detail: string) {
    super(
      'MANIFEST_PARSE_FAILED',
      `Manifest parse failed: ${detail}.`,
      502,
    );
  }
}
```

- [ ] **Step 5: Run tests, expect pass**

```bash
pnpm nx test api-video -- video.exception.spec
```

Expected: all `slice C exceptions` tests pass; slice A/B suite still green.

- [ ] **Step 6: Commit**

```bash
git add libs/api-video/src/lib/errors/
git commit -m "feat(api-video): add slice C playback exceptions"
```

---

## Task 4: Add `getVideoKey` to `VideoRepository`

**Files:**
- Modify: `libs/api-video/src/lib/video.repository.ts`

`KeyService.fetch` needs to read `videoKeys/{kid}`. Today the repo only writes `videoKeys` (in `finalizeUploadWithJob`); it does not expose a reader. Add a thin reader.

`video.repository.ts` is excluded from mutation testing per `stryker.api-video.config.mjs`; the new method's correctness is exercised by `KeyService` unit tests and api-e2e. No spec change is needed in the repo file itself.

- [ ] **Step 1: Add the method**

In `libs/api-video/src/lib/video.repository.ts`, after `getVideoByLesson` (around line 34), add:

```ts
  async getVideoKey(kid: VideoKeyId): Promise<VideoKey | null> {
    const snap = await this.db.collection('videoKeys').doc(kid).get();
    return snap.exists ? (snap.data() as VideoKey) : null;
  }
```

`VideoKey` and `VideoKeyId` are already imported on line 7–12. No new imports.

- [ ] **Step 2: Run repo-adjacent tests**

```bash
pnpm nx test api-video
```

Expected: green. No new test file yet — the method is consumed (and verified) by `KeyService` in Task 6.

- [ ] **Step 3: Commit**

```bash
git add libs/api-video/src/lib/video.repository.ts
git commit -m "feat(api-video): add VideoRepository.getVideoKey"
```

---

## Task 5: Add `readManifestObject` + `signObjectUrl` to `VideoStorageAdapter`

**Files:**
- Modify: `libs/api-video/src/lib/video-storage.adapter.ts`
- Modify: `libs/api-video/src/lib/video-storage.adapter.spec.ts`

The adapter is excluded from mutation testing (thin wrapper over `@google-cloud/storage`). Unit tests assert the contract using the same fake-`Storage`-shaped construction the existing adapter spec uses (`createResumableSession`, `headObject`, etc.).

- [ ] **Step 1: Write failing tests**

Open `libs/api-video/src/lib/video-storage.adapter.spec.ts`. Inspect the existing helper that constructs a fake `Storage`-shaped client (it returns `{ bucket: (name) => { file: (path) => ({ ... }) } }`). Append a new `describe` block, reusing that helper:

```ts
describe('VideoStorageAdapter.readManifestObject', () => {
  it('downloads the object body as a UTF-8 string', async () => {
    const download = vi.fn().mockResolvedValue([Buffer.from('#EXTM3U\n', 'utf-8')]);
    const storage = {
      bucket: (b: string) => ({
        file: (p: string) => ({ download }),
      }),
    } as unknown as FirebaseStorageHandle;
    const adapter = new VideoStorageAdapter(storage);
    const body = await adapter.readManifestObject('b', 'videos/v1/hls/manifest.m3u8');
    expect(body).toBe('#EXTM3U\n');
    expect(download).toHaveBeenCalledOnce();
  });

  it('propagates errors from the storage layer', async () => {
    const err = Object.assign(new Error('boom'), { code: 500 });
    const download = vi.fn().mockRejectedValue(err);
    const storage = {
      bucket: () => ({ file: () => ({ download }) }),
    } as unknown as FirebaseStorageHandle;
    const adapter = new VideoStorageAdapter(storage);
    await expect(adapter.readManifestObject('b', 'p')).rejects.toThrow(/boom/);
  });
});

describe('VideoStorageAdapter.signObjectUrl', () => {
  it('mints a v4 read URL with the provided TTL', async () => {
    const getSignedUrl = vi.fn().mockResolvedValue(['https://signed/url']);
    const storage = {
      bucket: () => ({ file: () => ({ getSignedUrl }) }),
    } as unknown as FirebaseStorageHandle;
    const adapter = new VideoStorageAdapter(storage);
    const url = await adapter.signObjectUrl('b', 'videos/v1/hls/1080p/seg.ts', 14400);
    expect(url).toBe('https://signed/url');
    const args = getSignedUrl.mock.calls[0]![0];
    expect(args.version).toBe('v4');
    expect(args.action).toBe('read');
    expect(args.expires).toBeGreaterThan(Date.now());
    expect(args.expires).toBeLessThanOrEqual(Date.now() + 14400 * 1000 + 1000);
  });
});
```

If the existing spec already imports `FirebaseStorageHandle` and uses a different helper signature, adapt the test to match — the constructor injection pattern is the same.

- [ ] **Step 2: Run tests, expect failure**

```bash
pnpm nx test api-video -- video-storage.adapter.spec
```

Expected: new tests fail — methods don't exist.

- [ ] **Step 3: Add the methods**

In `libs/api-video/src/lib/video-storage.adapter.ts`, extend the `VideoStoragePort` interface (after `probeSource`):

```ts
  readManifestObject(input: { bucket: string; path: string }): Promise<string>;
  signObjectUrl(input: { bucket: string; path: string; ttlSec: number }): Promise<string>;
```

Then add to the `VideoStorageAdapter` class (after `probeSource`):

```ts
  async readManifestObject(input: { bucket: string; path: string }): Promise<string> {
    const file = this.storage.bucket(input.bucket).file(input.path);
    const [buf] = await file.download();
    return buf.toString('utf-8');
  }

  async signObjectUrl(input: { bucket: string; path: string; ttlSec: number }): Promise<string> {
    const file = this.storage.bucket(input.bucket).file(input.path);
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + input.ttlSec * 1000,
    });
    return url;
  }
```

Update the test calls if they pass positional arguments instead of an object — match the object-arg signature for consistency with the other adapter methods on the port (each takes a single object). If you prefer to match the spec's positional `(bucket, path)` text exactly, update both the interface and the call sites — pick one and stay consistent.

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm nx test api-video -- video-storage.adapter.spec
```

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add libs/api-video/src/lib/video-storage.adapter.ts libs/api-video/src/lib/video-storage.adapter.spec.ts
git commit -m "feat(api-video): VideoStorageAdapter.readManifestObject + signObjectUrl"
```

---

## Task 6: Build the pure `manifest.rewriter` (master)

**Files:**
- Create: `libs/api-video/src/lib/playback/manifest.rewriter.ts`
- Create: `libs/api-video/src/lib/playback/manifest.rewriter.spec.ts`

The rewriter is pure — no IO. Master rewrite swaps each rendition URI for `/api/playback/manifest/:vid/rendition/:r`.

The rendition allow-list is part of the slice C contract (spec §2.2). Put it in the rewriter module so the controller can import it too:

- [ ] **Step 1: Write failing tests**

Create `libs/api-video/src/lib/playback/manifest.rewriter.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { VideoId } from '@learnwren/shared-data-models';

import { ManifestParseFailedException } from '../errors/video.exception';
import { ALLOWED_RENDITIONS, rewriteMaster } from './manifest.rewriter';

const VID = 'v123' as VideoId;

const MASTER = `#EXTM3U
#EXT-X-VERSION:6
#EXT-X-INDEPENDENT-SEGMENTS
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2"
1080p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720,CODECS="avc1.4d4028,mp4a.40.2"
720p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=854x480,CODECS="avc1.4d401e,mp4a.40.2"
480p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,CODECS="avc1.4d401e,mp4a.40.2"
360p/playlist.m3u8
`;

describe('ALLOWED_RENDITIONS', () => {
  it('is the slice B ladder', () => {
    expect(ALLOWED_RENDITIONS).toEqual(['1080p', '720p', '480p', '360p']);
  });
});

describe('rewriteMaster', () => {
  it('rewrites each rendition URI to the proxy path', () => {
    const out = rewriteMaster(MASTER, VID);
    const lines = out.split('\n');
    expect(lines).toContain(`/api/playback/manifest/${VID}/rendition/1080p`);
    expect(lines).toContain(`/api/playback/manifest/${VID}/rendition/720p`);
    expect(lines).toContain(`/api/playback/manifest/${VID}/rendition/480p`);
    expect(lines).toContain(`/api/playback/manifest/${VID}/rendition/360p`);
    expect(out).not.toMatch(/playlist\.m3u8/);
  });

  it('preserves #EXTM3U, version, and comment directives', () => {
    const out = rewriteMaster(MASTER, VID);
    expect(out).toMatch(/^#EXTM3U/);
    expect(out).toContain('#EXT-X-VERSION:6');
    expect(out).toContain('#EXT-X-INDEPENDENT-SEGMENTS');
    expect(out).toContain('#EXT-X-STREAM-INF:BANDWIDTH=5000000');
  });

  it('throws ManifestParseFailedException on missing #EXTM3U header', () => {
    expect(() => rewriteMaster('#EXT-X-VERSION:6\n', VID)).toThrow(
      ManifestParseFailedException,
    );
  });

  it('throws when #EXT-X-STREAM-INF is not followed by a URI line', () => {
    const body = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\n#EXT-X-ENDLIST\n';
    expect(() => rewriteMaster(body, VID)).toThrow(ManifestParseFailedException);
  });

  it('throws when a rendition is outside the allow-list', () => {
    const body = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1
240p/playlist.m3u8
`;
    expect(() => rewriteMaster(body, VID)).toThrow(/240p/);
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

```bash
pnpm nx test api-video -- manifest.rewriter
```

Expected: module not found.

- [ ] **Step 3: Create the rewriter — master only**

Create `libs/api-video/src/lib/playback/manifest.rewriter.ts`:

```ts
import type { VideoId } from '@learnwren/shared-data-models';

import { ManifestParseFailedException } from '../errors/video.exception';

export const ALLOWED_RENDITIONS = ['1080p', '720p', '480p', '360p'] as const;
export type RenditionName = (typeof ALLOWED_RENDITIONS)[number];

export function isAllowedRendition(name: string): name is RenditionName {
  return (ALLOWED_RENDITIONS as readonly string[]).includes(name);
}

function assertM3u8Header(body: string): void {
  if (!body.startsWith('#EXTM3U')) {
    throw new ManifestParseFailedException('missing #EXTM3U header');
  }
}

function renditionNameFromUri(uri: string): string {
  // Expect 'X/playlist.m3u8' (single segment), produced by Transcoder API.
  const slash = uri.indexOf('/');
  if (slash <= 0) {
    throw new ManifestParseFailedException(
      `cannot extract rendition name from URI "${uri}"`,
    );
  }
  return uri.slice(0, slash);
}

export function rewriteMaster(masterBody: string, videoId: VideoId): string {
  assertM3u8Header(masterBody);
  const out: string[] = [];
  const lines = masterBody.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    out.push(line);
    if (line.startsWith('#EXT-X-STREAM-INF')) {
      const nextIdx = i + 1;
      const uri = lines[nextIdx]?.trim();
      if (!uri || uri.startsWith('#')) {
        throw new ManifestParseFailedException(
          'expected URI line after #EXT-X-STREAM-INF',
        );
      }
      const rendition = renditionNameFromUri(uri);
      if (!isAllowedRendition(rendition)) {
        throw new ManifestParseFailedException(
          `unknown rendition "${rendition}" in master`,
        );
      }
      out.push(`/api/playback/manifest/${videoId}/rendition/${rendition}`);
      i++; // skip the original URI line
    }
  }
  return out.join('\n');
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm nx test api-video -- manifest.rewriter
```

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add libs/api-video/src/lib/playback/manifest.rewriter.ts libs/api-video/src/lib/playback/manifest.rewriter.spec.ts
git commit -m "feat(api-video): pure manifest rewriter for master m3u8"
```

---

## Task 7: Extend `manifest.rewriter` with rendition + key directive rewrites

**Files:**
- Modify: `libs/api-video/src/lib/playback/manifest.rewriter.ts`
- Modify: `libs/api-video/src/lib/playback/manifest.rewriter.spec.ts`

`rewriteRendition` substitutes the `#EXT-X-KEY` `URI=` field with `/api/playback/keys/{vid}` and signs each segment URI via an injected callback.

- [ ] **Step 1: Append failing tests**

Append to `libs/api-video/src/lib/playback/manifest.rewriter.spec.ts`:

```ts
import { rewriteRendition } from './manifest.rewriter';

const RENDITION = `#EXTM3U
#EXT-X-VERSION:6
#EXT-X-TARGETDURATION:6
#EXT-X-KEY:METHOD=AES-128,URI="https://example.invalid/keys/abc",IV=0xABCDEF0123456789ABCDEF0123456789
#EXTINF:6.000,
segment_001.ts
#EXTINF:6.000,
segment_002.ts
#EXT-X-ENDLIST
`;

describe('rewriteRendition', () => {
  it('rewrites #EXT-X-KEY URI to /api/playback/keys/:vid and preserves IV', async () => {
    const out = await rewriteRendition(RENDITION, VID, async (s) => `signed://${s}`);
    expect(out).toContain(
      '#EXT-X-KEY:METHOD=AES-128,URI="/api/playback/keys/v123",IV=0xABCDEF0123456789ABCDEF0123456789',
    );
  });

  it('signs each segment URI via the injected callback', async () => {
    const signed: string[] = [];
    const signer = async (s: string) => {
      signed.push(s);
      return `signed://${s}`;
    };
    const out = await rewriteRendition(RENDITION, VID, signer);
    expect(signed).toEqual(['segment_001.ts', 'segment_002.ts']);
    expect(out).toContain('signed://segment_001.ts');
    expect(out).toContain('signed://segment_002.ts');
  });

  it('passes through #EXT-X-KEY:METHOD=NONE unchanged', async () => {
    const body = `#EXTM3U\n#EXT-X-KEY:METHOD=NONE\n#EXT-X-ENDLIST\n`;
    const out = await rewriteRendition(body, VID, async () => 'unused');
    expect(out).toContain('#EXT-X-KEY:METHOD=NONE');
    expect(out).not.toContain('/api/playback/keys/');
  });

  it('does not double-sign already-signed URIs (http/https)', async () => {
    const body = `#EXTM3U
#EXTINF:6.000,
https://storage.googleapis.com/b/segment_001.ts?signature=xyz
#EXT-X-ENDLIST
`;
    const signer = vi.fn(async () => 'NEVER');
    const out = await rewriteRendition(body, VID, signer);
    expect(signer).not.toHaveBeenCalled();
    expect(out).toContain('https://storage.googleapis.com/b/segment_001.ts?signature=xyz');
  });

  it('throws on missing #EXTM3U header', async () => {
    await expect(
      rewriteRendition('#EXT-X-VERSION:6\n', VID, async () => ''),
    ).rejects.toBeInstanceOf(ManifestParseFailedException);
  });
});
```

Add the `vi` import to the file if not already present: `import { describe, expect, it, vi } from 'vitest';`

- [ ] **Step 2: Run tests, expect failure**

```bash
pnpm nx test api-video -- manifest.rewriter
```

Expected: `rewriteRendition` undefined.

- [ ] **Step 3: Implement `rewriteRendition`**

Append to `libs/api-video/src/lib/playback/manifest.rewriter.ts`:

```ts
export type SegmentSigner = (filename: string) => Promise<string>;

function isSegmentUri(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (t.startsWith('#')) return false;
  if (t.startsWith('http://') || t.startsWith('https://')) return false;
  return true;
}

function rewriteKeyDirective(line: string, videoId: VideoId): string {
  // Match URI="…" tolerantly (any chars except the closing quote).
  return line.replace(
    /URI="[^"]*"/,
    `URI="/api/playback/keys/${videoId}"`,
  );
}

export async function rewriteRendition(
  renditionBody: string,
  videoId: VideoId,
  signSegment: SegmentSigner,
): Promise<string> {
  assertM3u8Header(renditionBody);
  const out: string[] = [];
  const lines = renditionBody.split('\n');
  for (const line of lines) {
    if (line.startsWith('#EXT-X-KEY')) {
      // METHOD=NONE has no URI=… clause; the replace becomes a no-op.
      out.push(rewriteKeyDirective(line, videoId));
    } else if (isSegmentUri(line)) {
      out.push(await signSegment(line.trim()));
    } else {
      out.push(line);
    }
  }
  return out.join('\n');
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm nx test api-video -- manifest.rewriter
```

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add libs/api-video/src/lib/playback/manifest.rewriter.ts libs/api-video/src/lib/playback/manifest.rewriter.spec.ts
git commit -m "feat(api-video): rendition rewriter — key URI + segment signing"
```

---

## Task 8: Build `KeyService`

**Files:**
- Create: `libs/api-video/src/lib/playback/key.service.ts`
- Create: `libs/api-video/src/lib/playback/key.service.spec.ts`

`KeyService.fetch(video)` returns the 16-byte AES-128 key from `videoKeys/{video.keyId}` as a `Buffer`.

- [ ] **Step 1: Write failing tests**

Create `libs/api-video/src/lib/playback/key.service.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import type { Video, VideoKey, VideoKeyId } from '@learnwren/shared-data-models';

import { KeyLookupFailedException } from '../errors/video.exception';
import type { VideoRepository } from '../video.repository';
import { KeyService } from './key.service';

function makeRepo(key: VideoKey | null): VideoRepository {
  return {
    getVideoKey: vi.fn().mockResolvedValue(key),
  } as unknown as VideoRepository;
}

const KID = 'k1' as VideoKeyId;

const KEY_BYTES = Uint8Array.from({ length: 16 }, (_, i) => i + 1);
const KEY_DOC: VideoKey = {
  id: KID,
  videoId: 'v1' as VideoKey['videoId'],
  key: Buffer.from(KEY_BYTES).toString('base64'),
  createdAt: 'now' as VideoKey['createdAt'],
};

const READY_VIDEO: Video = {
  id: 'v1' as Video['id'],
  ownerInstructorId: 'u1' as Video['ownerInstructorId'],
  courseId: 'c1' as Video['courseId'],
  lessonId: 'l1' as Video['lessonId'],
  state: 'READY',
  source: { bucket: 'src', path: 'p' },
  output: { bucket: 'out', manifestPath: 'videos/v1/hls/manifest.m3u8', durationSec: 60 },
  keyId: KID,
  createdAt: 'now' as Video['createdAt'],
  updatedAt: 'now' as Video['updatedAt'],
};

describe('KeyService.fetch', () => {
  it('returns 16-byte Buffer for a healthy video', async () => {
    const svc = new KeyService(makeRepo(KEY_DOC));
    const buf = await svc.fetch(READY_VIDEO);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBe(16);
    expect(Array.from(buf)).toEqual(Array.from(KEY_BYTES));
  });

  it('throws KEY_LOOKUP_FAILED when keyId is missing on the video', async () => {
    const svc = new KeyService(makeRepo(KEY_DOC));
    const noKeyVideo = { ...READY_VIDEO, keyId: undefined };
    await expect(svc.fetch(noKeyVideo)).rejects.toBeInstanceOf(
      KeyLookupFailedException,
    );
  });

  it('throws KEY_LOOKUP_FAILED when the key document is absent', async () => {
    const svc = new KeyService(makeRepo(null));
    await expect(svc.fetch(READY_VIDEO)).rejects.toBeInstanceOf(
      KeyLookupFailedException,
    );
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

```bash
pnpm nx test api-video -- key.service
```

Expected: module not found.

- [ ] **Step 3: Implement `KeyService`**

Create `libs/api-video/src/lib/playback/key.service.ts`:

```ts
import { Injectable } from '@nestjs/common';

import type { Video } from '@learnwren/shared-data-models';

import { KeyLookupFailedException } from '../errors/video.exception';
import { VideoRepository } from '../video.repository';

@Injectable()
export class KeyService {
  constructor(private readonly repo: VideoRepository) {}

  async fetch(video: Video): Promise<Buffer> {
    if (!video.keyId) {
      throw new KeyLookupFailedException('video has no keyId');
    }
    const doc = await this.repo.getVideoKey(video.keyId);
    if (!doc) {
      throw new KeyLookupFailedException(`videoKeys/${video.keyId} missing`);
    }
    return Buffer.from(doc.key, 'base64');
  }
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm nx test api-video -- key.service
```

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add libs/api-video/src/lib/playback/key.service.ts libs/api-video/src/lib/playback/key.service.spec.ts
git commit -m "feat(api-video): KeyService — read AES-128 key from videoKeys"
```

---

## Task 9: Build `ManifestService` (IO seam over the rewriter)

**Files:**
- Create: `libs/api-video/src/lib/playback/manifest.service.ts`
- Create: `libs/api-video/src/lib/playback/manifest.service.spec.ts`

`ManifestService` is the IO seam: it asks the storage adapter for object bodies and signs segment URLs, delegating the pure rewrite to the rewriter. The service trusts its inputs — the controller validates `:r` against the allow-list.

- [ ] **Step 1: Write failing tests**

Create `libs/api-video/src/lib/playback/manifest.service.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import type { Video } from '@learnwren/shared-data-models';

import { ManifestParseFailedException } from '../errors/video.exception';
import type { VideoConfig } from '../video.config';
import type { VideoStoragePort } from '../video-storage.adapter';
import { ManifestService } from './manifest.service';

const VIDEO: Video = {
  id: 'v1' as Video['id'],
  ownerInstructorId: 'u1' as Video['ownerInstructorId'],
  courseId: 'c1' as Video['courseId'],
  lessonId: 'l1' as Video['lessonId'],
  state: 'READY',
  source: { bucket: 'src', path: 'p' },
  output: { bucket: 'out', manifestPath: 'videos/v1/hls/manifest.m3u8', durationSec: 60 },
  keyId: 'k1' as Video['keyId'],
  createdAt: 'now' as Video['createdAt'],
  updatedAt: 'now' as Video['updatedAt'],
};

const MASTER = `#EXTM3U
#EXT-X-VERSION:6
#EXT-X-STREAM-INF:BANDWIDTH=5000000
1080p/playlist.m3u8
`;

const RENDITION_720 = `#EXTM3U
#EXT-X-VERSION:6
#EXT-X-KEY:METHOD=AES-128,URI="https://example.invalid/k",IV=0xABCD
#EXTINF:6.000,
segment_001.ts
#EXT-X-ENDLIST
`;

function makeStorage(read: (b: string, p: string) => Promise<string>, sign?: (b: string, p: string, t: number) => Promise<string>): VideoStoragePort {
  return {
    createResumableSession: vi.fn(),
    headObject: vi.fn(),
    deleteObject: vi.fn(),
    deletePrefix: vi.fn(),
    probeSource: vi.fn(),
    readManifestObject: vi.fn(async ({ bucket, path }) => read(bucket, path)),
    signObjectUrl: vi.fn(async ({ bucket, path, ttlSec }) =>
      sign ? sign(bucket, path, ttlSec) : `signed://${bucket}/${path}?ttl=${ttlSec}`,
    ),
  } as unknown as VideoStoragePort;
}

const CFG = { playbackSignedUrlTtlSec: 14400 } as VideoConfig;

describe('ManifestService.fetchMaster', () => {
  it('reads master from the output bucket and rewrites to proxy paths', async () => {
    const storage = makeStorage(async () => MASTER);
    const svc = new ManifestService(storage, CFG);
    const out = await svc.fetchMaster(VIDEO);
    expect(out).toContain(`/api/playback/manifest/${VIDEO.id}/rendition/1080p`);
    expect(out).not.toMatch(/playlist\.m3u8/);
  });

  it('reads from video.output.bucket + manifestPath', async () => {
    const read = vi.fn().mockResolvedValue(MASTER);
    const storage = makeStorage((b, p) => read(b, p));
    const svc = new ManifestService(storage, CFG);
    await svc.fetchMaster(VIDEO);
    expect(read).toHaveBeenCalledWith('out', 'videos/v1/hls/manifest.m3u8');
  });

  it('maps a non-#EXTM3U body to 502 MANIFEST_PARSE_FAILED', async () => {
    const storage = makeStorage(async () => 'oops');
    const svc = new ManifestService(storage, CFG);
    await expect(svc.fetchMaster(VIDEO)).rejects.toBeInstanceOf(ManifestParseFailedException);
  });

  it('propagates storage errors (caller maps to 502 at the controller layer)', async () => {
    const storage = makeStorage(async () => { throw new Error('gcs down'); });
    const svc = new ManifestService(storage, CFG);
    await expect(svc.fetchMaster(VIDEO)).rejects.toThrow(/gcs down/);
  });
});

describe('ManifestService.fetchRendition', () => {
  it('reads the rendition playlist from the right path', async () => {
    const read = vi.fn().mockResolvedValue(RENDITION_720);
    const storage = makeStorage((b, p) => read(b, p));
    const svc = new ManifestService(storage, CFG);
    await svc.fetchRendition(VIDEO, '720p');
    expect(read).toHaveBeenCalledWith('out', 'videos/v1/hls/720p/playlist.m3u8');
  });

  it('signs each segment with bucket=output, path=<dir>/<rendition>/<segment>, ttl=cfg', async () => {
    const sign = vi.fn(async (b: string, p: string, t: number) => `signed:${b}|${p}|${t}`);
    const storage = makeStorage(async () => RENDITION_720, sign);
    const svc = new ManifestService(storage, CFG);
    const out = await svc.fetchRendition(VIDEO, '720p');
    expect(sign).toHaveBeenCalledWith('out', 'videos/v1/hls/720p/segment_001.ts', 14400);
    expect(out).toContain('signed:out|videos/v1/hls/720p/segment_001.ts|14400');
  });

  it('rewrites the key directive to /api/playback/keys/:vid', async () => {
    const storage = makeStorage(async () => RENDITION_720);
    const svc = new ManifestService(storage, CFG);
    const out = await svc.fetchRendition(VIDEO, '720p');
    expect(out).toContain(`URI="/api/playback/keys/${VIDEO.id}"`);
    expect(out).toContain('IV=0xABCD');
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

```bash
pnpm nx test api-video -- manifest.service
```

Expected: module not found.

- [ ] **Step 3: Implement `ManifestService`**

Create `libs/api-video/src/lib/playback/manifest.service.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import * as path from 'node:path';

import type { Video } from '@learnwren/shared-data-models';

import { VIDEO_CONFIG, type VideoConfig } from '../video.config';
import {
  VideoStorageAdapter,
  type VideoStoragePort,
} from '../video-storage.adapter';
import { rewriteMaster, rewriteRendition, type RenditionName } from './manifest.rewriter';

@Injectable()
export class ManifestService {
  constructor(
    private readonly storage: VideoStorageAdapter,
    @Inject(VIDEO_CONFIG) private readonly cfg: VideoConfig,
  ) {}

  async fetchMaster(video: Video): Promise<string> {
    const body = await this.storage.readManifestObject({
      bucket: video.output!.bucket,
      path: video.output!.manifestPath,
    });
    return rewriteMaster(body, video.id);
  }

  async fetchRendition(video: Video, rendition: RenditionName): Promise<string> {
    const baseDir = path.posix.dirname(video.output!.manifestPath);
    const renditionPath = `${baseDir}/${rendition}/playlist.m3u8`;
    const body = await this.storage.readManifestObject({
      bucket: video.output!.bucket,
      path: renditionPath,
    });
    const signSegment = (filename: string) =>
      this.storage.signObjectUrl({
        bucket: video.output!.bucket,
        path: `${baseDir}/${rendition}/${filename}`,
        ttlSec: this.cfg.playbackSignedUrlTtlSec,
      });
    return rewriteRendition(body, video.id, signSegment);
  }
}
```

The service binds `VideoStorageAdapter` (the concrete class — Nest DI resolves the class as the token), then casts via the structural `VideoStoragePort` interface — the test injects a mock that satisfies the port shape. If your existing DI patterns prefer a port token, use that pattern instead; the slice A repo wires the adapter as the concrete class.

Note on `video.output!.bucket`: the controller's guard guarantees `state === 'READY'`, which implies `output` is set (slice B `applyTranscoderResult` writes `output` together with `READY`). The non-null assertion documents that invariant.

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm nx test api-video -- manifest.service
```

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add libs/api-video/src/lib/playback/manifest.service.ts libs/api-video/src/lib/playback/manifest.service.spec.ts
git commit -m "feat(api-video): ManifestService — fetch + rewrite master/rendition"
```

---

## Task 10: Build `EnrollmentOrOwnerGuard` + `@CurrentVideo()` decorator

**Files:**
- Create: `libs/api-video/src/lib/playback/enrollment-or-owner.guard.ts`
- Create: `libs/api-video/src/lib/playback/enrollment-or-owner.guard.spec.ts`
- Create: `libs/api-video/src/lib/playback/current-video.decorator.ts`

The guard owns the auth gate for all three playback routes. The decorator extracts `request.video` to keep the controller declarative.

- [ ] **Step 1: Write failing tests**

Create `libs/api-video/src/lib/playback/enrollment-or-owner.guard.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import type { Video, VideoId } from '@learnwren/shared-data-models';

import {
  NotVideoOwnerException,
  VideoNotFoundException,
  VideoNotReadyException,
} from '../errors/video.exception';
import type { VideoRepository } from '../video.repository';
import { EnrollmentOrOwnerGuard } from './enrollment-or-owner.guard';

function ctxFor(req: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as Parameters<EnrollmentOrOwnerGuard['canActivate']>[0];
}

function makeRepo(video: Video | null): VideoRepository {
  return { getVideo: vi.fn().mockResolvedValue(video) } as unknown as VideoRepository;
}

const readyVideo: Video = {
  id: 'v1' as VideoId,
  ownerInstructorId: 'u1' as Video['ownerInstructorId'],
  courseId: 'c1' as Video['courseId'],
  lessonId: 'l1' as Video['lessonId'],
  state: 'READY',
  source: { bucket: 'src', path: 'p' },
  output: { bucket: 'out', manifestPath: 'videos/v1/hls/manifest.m3u8', durationSec: 60 },
  keyId: 'k1' as Video['keyId'],
  createdAt: 'now' as Video['createdAt'],
  updatedAt: 'now' as Video['updatedAt'],
};

describe('EnrollmentOrOwnerGuard', () => {
  it('throws VIDEO_NOT_FOUND when :vid is missing', async () => {
    const guard = new EnrollmentOrOwnerGuard(makeRepo(null));
    await expect(
      guard.canActivate(ctxFor({ params: {}, user: { uid: 'u1' } })),
    ).rejects.toBeInstanceOf(VideoNotFoundException);
  });

  it('throws VIDEO_NOT_FOUND when the video does not exist', async () => {
    const guard = new EnrollmentOrOwnerGuard(makeRepo(null));
    await expect(
      guard.canActivate(ctxFor({ params: { vid: 'v1' }, user: { uid: 'u1' } })),
    ).rejects.toBeInstanceOf(VideoNotFoundException);
  });

  it('throws VIDEO_NOT_READY when state is not READY', async () => {
    const transcoding = { ...readyVideo, state: 'TRANSCODING' as const };
    const guard = new EnrollmentOrOwnerGuard(makeRepo(transcoding));
    await expect(
      guard.canActivate(ctxFor({ params: { vid: 'v1' }, user: { uid: 'u1' } })),
    ).rejects.toBeInstanceOf(VideoNotReadyException);
  });

  it('attaches video and returns true when requester is the owner', async () => {
    const guard = new EnrollmentOrOwnerGuard(makeRepo(readyVideo));
    const req: Record<string, unknown> = { params: { vid: 'v1' }, user: { uid: 'u1' } };
    await expect(guard.canActivate(ctxFor(req))).resolves.toBe(true);
    expect(req['video']).toEqual(readyVideo);
  });

  it('throws NOT_VIDEO_OWNER for a non-owner today (EP-06 TODO branch falls through)', async () => {
    const guard = new EnrollmentOrOwnerGuard(makeRepo(readyVideo));
    await expect(
      guard.canActivate(ctxFor({ params: { vid: 'v1' }, user: { uid: 'u2' } })),
    ).rejects.toBeInstanceOf(NotVideoOwnerException);
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

```bash
pnpm nx test api-video -- enrollment-or-owner
```

Expected: module not found.

- [ ] **Step 3: Implement the guard**

Create `libs/api-video/src/lib/playback/enrollment-or-owner.guard.ts`:

```ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import type { VideoId } from '@learnwren/shared-data-models';

import {
  NotVideoOwnerException,
  VideoNotFoundException,
  VideoNotReadyException,
} from '../errors/video.exception';
import type { VideoScopedRequest } from '../types/loaded-video';
import { VideoRepository } from '../video.repository';

@Injectable()
export class EnrollmentOrOwnerGuard implements CanActivate {
  constructor(private readonly repo: VideoRepository) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<VideoScopedRequest>();
    const vid = req.params?.['vid'] as VideoId | undefined;
    if (!vid) throw new VideoNotFoundException();

    const video = await this.repo.getVideo(vid);
    if (!video) throw new VideoNotFoundException();
    if (video.state !== 'READY') throw new VideoNotReadyException(video.state);

    if (video.ownerInstructorId === req.user?.uid) {
      req.video = video;
      return true;
    }

    // TODO(EP-06): if (await this.enrollment.isEnrolled(req.user.uid, video.courseId)) {
    //   req.video = video;
    //   return true;
    // }

    throw new NotVideoOwnerException();
  }
}
```

- [ ] **Step 4: Create the `@CurrentVideo()` decorator**

Create `libs/api-video/src/lib/playback/current-video.decorator.ts`:

```ts
import { ExecutionContext, createParamDecorator } from '@nestjs/common';

import type { Video } from '@learnwren/shared-data-models';

import type { VideoScopedRequest } from '../types/loaded-video';

export const CurrentVideo = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Video => {
    const req = ctx.switchToHttp().getRequest<VideoScopedRequest>();
    if (!req.video) {
      throw new Error(
        '@CurrentVideo() used on a route without EnrollmentOrOwnerGuard.',
      );
    }
    return req.video;
  },
);
```

- [ ] **Step 5: Run tests, expect pass**

```bash
pnpm nx test api-video -- enrollment-or-owner
```

Expected: green. The decorator is exercised by the controller spec in Task 11.

- [ ] **Step 6: Commit**

```bash
git add libs/api-video/src/lib/playback/enrollment-or-owner.guard.ts libs/api-video/src/lib/playback/enrollment-or-owner.guard.spec.ts libs/api-video/src/lib/playback/current-video.decorator.ts
git commit -m "feat(api-video): EnrollmentOrOwnerGuard (owner-only) + @CurrentVideo()"
```

---

## Task 11: Build `PlaybackController`

**Files:**
- Create: `libs/api-video/src/lib/playback/playback.controller.ts`
- Create: `libs/api-video/src/lib/playback/playback.controller.spec.ts`

Thin: three handlers, rendition allow-list check, response headers per spec §2.1.

- [ ] **Step 1: Write failing tests**

Create `libs/api-video/src/lib/playback/playback.controller.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { FirebaseSessionGuard } from '@learnwren/api-auth';
import { FIREBASE_AUTH, FIRESTORE } from '@learnwren/api-firebase';
import type { Video, VideoId } from '@learnwren/shared-data-models';

import { EnrollmentOrOwnerGuard } from './enrollment-or-owner.guard';
import { KeyService } from './key.service';
import { ManifestService } from './manifest.service';
import { PlaybackController } from './playback.controller';

const VIDEO: Video = {
  id: 'v1' as VideoId,
  ownerInstructorId: 'u1' as Video['ownerInstructorId'],
  courseId: 'c1' as Video['courseId'],
  lessonId: 'l1' as Video['lessonId'],
  state: 'READY',
  source: { bucket: 'src', path: 'p' },
  output: { bucket: 'out', manifestPath: 'videos/v1/hls/manifest.m3u8', durationSec: 60 },
  keyId: 'k1' as Video['keyId'],
  createdAt: 'now' as Video['createdAt'],
  updatedAt: 'now' as Video['updatedAt'],
};

function makeRes() {
  const headers: Record<string, string> = {};
  const res = {
    setHeader: vi.fn((k: string, v: string) => { headers[k.toLowerCase()] = v; }),
    status: vi.fn(function (this: unknown) { return res; }),
    send: vi.fn(),
    end: vi.fn(),
    headers,
  };
  return res;
}

async function buildController(
  manifestSvc: Partial<ManifestService>,
  keySvc: Partial<KeyService>,
): Promise<PlaybackController> {
  const mod = await Test.createTestingModule({
    controllers: [PlaybackController],
    providers: [
      { provide: ManifestService, useValue: manifestSvc },
      { provide: KeyService, useValue: keySvc },
      { provide: FIRESTORE, useValue: {} },
      { provide: FIREBASE_AUTH, useValue: {} },
    ],
  })
    .overrideGuard(FirebaseSessionGuard).useValue({ canActivate: () => true })
    .overrideGuard(EnrollmentOrOwnerGuard).useValue({ canActivate: () => true })
    .compile();
  return mod.get(PlaybackController);
}

describe('PlaybackController.master', () => {
  it('returns the rewritten master with HLS content-type and no-store', async () => {
    const ms = { fetchMaster: vi.fn().mockResolvedValue('#EXTM3U\nbody') };
    const ks = { fetch: vi.fn() };
    const ctrl = await buildController(ms as unknown as ManifestService, ks as unknown as KeyService);
    const res = makeRes();
    await ctrl.master(VIDEO, res as unknown as import('express').Response);
    expect(ms.fetchMaster).toHaveBeenCalledWith(VIDEO);
    expect(res.headers['content-type']).toMatch(/application\/vnd\.apple\.mpegurl/);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.send).toHaveBeenCalledWith('#EXTM3U\nbody');
  });
});

describe('PlaybackController.rendition', () => {
  it('returns 404 RENDITION_NOT_FOUND for an unknown rendition', async () => {
    const ms = { fetchRendition: vi.fn() };
    const ctrl = await buildController(ms as unknown as ManifestService, {} as KeyService);
    await expect(
      ctrl.rendition(VIDEO, 'xyz', makeRes() as unknown as import('express').Response),
    ).rejects.toMatchObject({ code: 'RENDITION_NOT_FOUND' });
    expect(ms.fetchRendition).not.toHaveBeenCalled();
  });

  it('returns 200 with rewritten rendition for an allowed rendition', async () => {
    const ms = { fetchRendition: vi.fn().mockResolvedValue('#EXTM3U\n720p body') };
    const ctrl = await buildController(ms as unknown as ManifestService, {} as KeyService);
    const res = makeRes();
    await ctrl.rendition(VIDEO, '720p', res as unknown as import('express').Response);
    expect(ms.fetchRendition).toHaveBeenCalledWith(VIDEO, '720p');
    expect(res.headers['content-type']).toMatch(/application\/vnd\.apple\.mpegurl/);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.send).toHaveBeenCalledWith('#EXTM3U\n720p body');
  });
});

describe('PlaybackController.key', () => {
  it('returns 16-byte octet-stream with Content-Length: 16 and no-store', async () => {
    const buf = Buffer.from(Uint8Array.from({ length: 16 }, (_, i) => i));
    const ks = { fetch: vi.fn().mockResolvedValue(buf) };
    const ctrl = await buildController({} as ManifestService, ks as unknown as KeyService);
    const res = makeRes();
    await ctrl.key(VIDEO, res as unknown as import('express').Response);
    expect(ks.fetch).toHaveBeenCalledWith(VIDEO);
    expect(res.headers['content-type']).toBe('application/octet-stream');
    expect(res.headers['content-length']).toBe('16');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.end).toHaveBeenCalledWith(buf);
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

```bash
pnpm nx test api-video -- playback.controller
```

Expected: module not found.

- [ ] **Step 3: Implement the controller**

Create `libs/api-video/src/lib/playback/playback.controller.ts`:

```ts
import { Controller, Get, Param, Res, UseFilters, UseGuards } from '@nestjs/common';
import type { Response } from 'express';

import { FirebaseSessionGuard } from '@learnwren/api-auth';
import type { Video } from '@learnwren/shared-data-models';

import { VideoExceptionFilter } from '../video.exception-filter';
import { CurrentVideo } from './current-video.decorator';
import { EnrollmentOrOwnerGuard } from './enrollment-or-owner.guard';
import { KeyService } from './key.service';
import { isAllowedRendition, type RenditionName } from './manifest.rewriter';
import { ManifestService } from './manifest.service';
import { RenditionNotFoundException } from '../errors/video.exception';

const M3U8_CONTENT_TYPE = 'application/vnd.apple.mpegurl; charset=utf-8';

@Controller('playback')
@UseFilters(VideoExceptionFilter)
@UseGuards(FirebaseSessionGuard, EnrollmentOrOwnerGuard)
export class PlaybackController {
  constructor(
    private readonly manifest: ManifestService,
    private readonly keys: KeyService,
  ) {}

  @Get('manifest/:vid')
  async master(@CurrentVideo() video: Video, @Res() res: Response): Promise<void> {
    const body = await this.manifest.fetchMaster(video);
    res.setHeader('Content-Type', M3U8_CONTENT_TYPE);
    res.setHeader('Cache-Control', 'no-store');
    res.send(body);
  }

  @Get('manifest/:vid/rendition/:r')
  async rendition(
    @CurrentVideo() video: Video,
    @Param('r') r: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!isAllowedRendition(r)) {
      throw new RenditionNotFoundException(r);
    }
    const body = await this.manifest.fetchRendition(video, r as RenditionName);
    res.setHeader('Content-Type', M3U8_CONTENT_TYPE);
    res.setHeader('Cache-Control', 'no-store');
    res.send(body);
  }

  @Get('keys/:vid')
  async key(@CurrentVideo() video: Video, @Res() res: Response): Promise<void> {
    const buf = await this.keys.fetch(video);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', String(buf.length));
    res.setHeader('Cache-Control', 'no-store');
    res.end(buf);
  }
}
```

Note: the rendition test uses `.toMatchObject({ code: 'RENDITION_NOT_FOUND' })` against the thrown exception. The exception filter is class-level (`@UseFilters`); it only kicks in when Nest's HTTP pipeline runs. In the unit test we invoke the handler directly, so the exception propagates as a JS throw. The api-e2e test (Task 14) verifies the filter mapping end-to-end.

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm nx test api-video -- playback.controller
```

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add libs/api-video/src/lib/playback/playback.controller.ts libs/api-video/src/lib/playback/playback.controller.spec.ts
git commit -m "feat(api-video): PlaybackController — manifest + rendition + key routes"
```

---

## Task 12: Wire `PlaybackController` into `VideoModule`

**Files:**
- Modify: `libs/api-video/src/lib/video.module.ts`

- [ ] **Step 1: Register the new providers and controller**

Open `libs/api-video/src/lib/video.module.ts`. Add imports near the existing playback adjacent files:

```ts
import { EnrollmentOrOwnerGuard } from './playback/enrollment-or-owner.guard';
import { KeyService } from './playback/key.service';
import { ManifestService } from './playback/manifest.service';
import { PlaybackController } from './playback/playback.controller';
```

Update the `controllers` array (currently builds with `VideoController`, `TranscoderEventsController`, and conditionally `FakeTranscoderController`):

```ts
const controllers = [
  VideoController,
  TranscoderEventsController,
  PlaybackController,
  ...(process.env['NODE_ENV'] !== 'production' ? [FakeTranscoderController] : []),
];
```

Add the playback providers to the `providers: [...]` array (append to the list — order does not matter for DI):

```ts
    ManifestService,
    KeyService,
    EnrollmentOrOwnerGuard,
```

No changes to `imports` or `exports`. The forwardRef circular import with `CoursesModule` stays as-is.

- [ ] **Step 2: Run the api-video suite**

```bash
pnpm nx test api-video
```

Expected: green (all existing + new specs).

- [ ] **Step 3: Typecheck the API app**

```bash
pnpm nx typecheck api
```

Expected: green. Nest discovers the new controller through the module.

- [ ] **Step 4: Commit**

```bash
git add libs/api-video/src/lib/video.module.ts
git commit -m "feat(api-video): register PlaybackController + playback providers"
```

---

## Task 13: Output bucket CORS — runbook update

**Files:**
- Modify: `docs/operations/transcoder-pubsub-setup.md`

The output bucket needs CORS so the browser can fetch signed segment URLs cross-origin. Slice C documents this — not Terraformed.

- [ ] **Step 1: Append a new section to the runbook**

Open `docs/operations/transcoder-pubsub-setup.md`. At the end of the file, append:

```markdown

## Output bucket CORS (EP-03 Slice C)

The output bucket is private (no public IAM); browser fetches against
v4 signed URLs must pass a CORS preflight. Without this config hls.js
segment fetches fail with a CORS error and playback never starts.

Provision once per environment (dev / prod).

### 1. Create `cors-config.json`

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

For production, replace the dev hosting origin with the prod hosting
origin and remove `http://localhost:4200`. CORS is bucket-level metadata
— there is no per-object override.

### 2. Apply

```bash
PROJECT_ID=learn-wren-dev
gsutil cors set cors-config.json gs://${PROJECT_ID}-video-output
```

### 3. Verify

```bash
gsutil cors get gs://${PROJECT_ID}-video-output
```

Expected: JSON matching `cors-config.json`. Browser preflight failures
after this step indicate either a wrong origin in the config or a
signed-URL TTL that has expired — re-mint the manifest via
`/api/playback/manifest/:vid` and try again.
```

- [ ] **Step 2: Render-check (no command — visual review)**

Skim the file to confirm the section renders correctly when the existing slice B sections precede it.

- [ ] **Step 3: Commit**

```bash
git add docs/operations/transcoder-pubsub-setup.md
git commit -m "docs(ops): output bucket CORS provisioning for slice C playback"
```

---

## Task 14: API e2e — playback happy path

**Files:**
- Create: `apps/api-e2e/src/playback.e2e-spec.ts`

Reuses the slice A/B fixture (`apps/api-e2e/src/fixtures/small-video.mp4`) and the existing `_helpers/auth.ts`. The `VideoStorageAdapter` is overridden in the e2e module with a fake whose `readManifestObject` returns deterministic m3u8 strings and whose `signObjectUrl` returns deterministic stub URLs. This matches the slice B `FakeTranscoderAdapter` precedent.

The e2e module override is the slice B pattern: when `LEARNWREN_VIDEO_TRANSCODER=fake`, the api wires `FakeTranscoderAdapter`. For slice C, we extend the same flag (or introduce a sibling flag) to swap the storage adapter's playback methods only. Choose one of two paths:

- **Path A — storage adapter test seam via env flag.** Add `LEARNWREN_VIDEO_STORAGE_PLAYBACK_FAKE=true` (defaults to false). When set, `VideoStorageAdapter`'s `readManifestObject` and `signObjectUrl` return deterministic stubs instead of hitting GCS. This keeps the seam inside the adapter.
- **Path B — Nest module override at the e2e harness.** Provide a `FakeVideoStorageAdapter` and use `Test.createTestingModule(...).overrideProvider(VideoStorageAdapter).useClass(FakeVideoStorageAdapter)` in the e2e bootstrap.

Path B is cleaner for testing but requires a separate e2e bootstrap entrypoint. Path A reuses the existing api bootstrap and adds a single config branch. **Choose Path A** to mirror the slice B `LEARNWREN_VIDEO_TRANSCODER=fake` shape.

- [ ] **Step 1: Add the env flag to config**

Open `libs/api-video/src/lib/video.config.ts`. Add a field to `VideoConfig`:

```ts
  playbackStorageImpl: 'real' | 'fake';
```

In `readVideoConfigFromEnv`, after the `playbackSignedUrlTtlSec` read, add:

```ts
  const playbackStorageImpl =
    env['LEARNWREN_VIDEO_STORAGE_PLAYBACK_FAKE'] === 'true' ? 'fake' : 'real';
  if (playbackStorageImpl === 'fake' && env['NODE_ENV'] === 'production') {
    throw new Error(
      'LEARNWREN_VIDEO_STORAGE_PLAYBACK_FAKE=true is rejected when NODE_ENV=production.',
    );
  }
```

Add it to the `base` config object.

Append to `video.config.spec.ts`:

```ts
  it('defaults playbackStorageImpl to real', () => {
    expect(readVideoConfigFromEnv(baseEnv()).playbackStorageImpl).toBe('real');
  });
  it('honours LEARNWREN_VIDEO_STORAGE_PLAYBACK_FAKE=true', () => {
    const env = baseEnv();
    env.LEARNWREN_VIDEO_STORAGE_PLAYBACK_FAKE = 'true';
    expect(readVideoConfigFromEnv(env).playbackStorageImpl).toBe('fake');
  });
  it('rejects fake storage in production', () => {
    const env = baseEnv();
    env.LEARNWREN_VIDEO_STORAGE_PLAYBACK_FAKE = 'true';
    env.NODE_ENV = 'production';
    expect(() => readVideoConfigFromEnv(env)).toThrow(/production/i);
  });
```

- [ ] **Step 2: Wire the fake in `VideoStorageAdapter`**

In `libs/api-video/src/lib/video-storage.adapter.ts`, modify the two new methods to branch on `playbackStorageImpl`. The simplest approach: inject `VIDEO_CONFIG` into the adapter (currently injects only `FIREBASE_STORAGE`).

Update the constructor:

```ts
import { Inject, Injectable } from '@nestjs/common';

import { VIDEO_CONFIG, type VideoConfig } from './video.config';

@Injectable()
export class VideoStorageAdapter implements VideoStoragePort {
  // …
  constructor(
    @Inject(FIREBASE_STORAGE) private readonly storage: FirebaseStorageHandle,
    @Inject(VIDEO_CONFIG) private readonly cfg: VideoConfig,
  ) {}
```

Then in the new methods, branch:

```ts
  async readManifestObject(input: { bucket: string; path: string }): Promise<string> {
    if (this.cfg.playbackStorageImpl === 'fake') {
      return this.fakeReadManifest(input.path);
    }
    const file = this.storage.bucket(input.bucket).file(input.path);
    const [buf] = await file.download();
    return buf.toString('utf-8');
  }

  async signObjectUrl(input: { bucket: string; path: string; ttlSec: number }): Promise<string> {
    if (this.cfg.playbackStorageImpl === 'fake') {
      return `gs-stub://${input.bucket}/${input.path}?ttl=${input.ttlSec}`;
    }
    const file = this.storage.bucket(input.bucket).file(input.path);
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + input.ttlSec * 1000,
    });
    return url;
  }

  private fakeReadManifest(p: string): string {
    if (p.endsWith('/manifest.m3u8')) {
      return `#EXTM3U
#EXT-X-VERSION:6
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080
1080p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720
720p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=854x480
480p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
360p/playlist.m3u8
`;
    }
    if (p.endsWith('/playlist.m3u8')) {
      return `#EXTM3U
#EXT-X-VERSION:6
#EXT-X-TARGETDURATION:6
#EXT-X-KEY:METHOD=AES-128,URI="https://example.invalid/k",IV=0xABCDEF0123456789ABCDEF0123456789
#EXTINF:6.000,
segment_001.ts
#EXTINF:6.000,
segment_002.ts
#EXT-X-ENDLIST
`;
    }
    throw new Error(`fake storage: unknown manifest path ${p}`);
  }
```

Existing adapter tests pass `FIREBASE_STORAGE` but not `VIDEO_CONFIG` — update them to construct the adapter with both:

```ts
const cfg = { playbackStorageImpl: 'real' } as VideoConfig;
const adapter = new VideoStorageAdapter(storage, cfg);
```

Or add a second describe block that sets `playbackStorageImpl: 'fake'` and asserts the stub outputs. The simplest fix: update the helper that builds the adapter to thread cfg through.

Run the adapter spec to confirm:

```bash
pnpm nx test api-video -- video-storage.adapter.spec
```

Expected: green.

- [ ] **Step 3: Set the e2e env**

Look at the existing api-e2e test harness. The api server is started either by `pnpm start:api` in CI or via the Nx target. If e2e starts the api as part of its setup, set `LEARNWREN_VIDEO_STORAGE_PLAYBACK_FAKE=true` in the same env block that already sets `LEARNWREN_VIDEO_TRANSCODER=fake`.

Search:

```bash
grep -rn "LEARNWREN_VIDEO_TRANSCODER" apps/api-e2e .github/workflows nx.json
```

Wherever `LEARNWREN_VIDEO_TRANSCODER=fake` is set for e2e (likely a `.env`-style file or a workflow), add `LEARNWREN_VIDEO_STORAGE_PLAYBACK_FAKE=true` alongside it.

- [ ] **Step 4: Write the api-e2e happy-path test**

Create `apps/api-e2e/src/playback.e2e-spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  API_BASE,
  initAdmin,
  registerAndPromoteInstructor,
  registerStudent,
} from './_helpers/auth';

initAdmin();

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'small-video.mp4');
const FIXTURE_BYTES = fs.readFileSync(FIXTURE_PATH);

async function uploadAndTranscode(
  request: import('@playwright/test').APIRequestContext,
  hdr: Record<string, string>,
): Promise<{ courseId: string; moduleId: string; lessonId: string; videoId: string }> {
  const c = await (await request.post(`${API_BASE}/courses`, {
    headers: hdr,
    data: { title: 'Playback Course', description: 'desc' },
  })).json() as { id: string };
  const m = await (await request.post(`${API_BASE}/courses/${c.id}/modules`, {
    headers: hdr, data: { title: 'M' },
  })).json() as { id: string };
  const l = await (await request.post(`${API_BASE}/courses/${c.id}/modules/${m.id}/lessons`, {
    headers: hdr, data: { title: 'L' },
  })).json() as { id: string };

  const sess = await (await request.post(
    `${API_BASE}/courses/${c.id}/modules/${m.id}/lessons/${l.id}/video/upload-session`,
    { headers: hdr, data: { sizeBytes: FIXTURE_BYTES.length, contentType: 'video/mp4' } },
  )).json() as { videoId: string; uploadSessionUri: string };

  await request.put(sess.uploadSessionUri, {
    headers: { 'Content-Range': `bytes 0-${FIXTURE_BYTES.length - 1}/${FIXTURE_BYTES.length}` },
    data: FIXTURE_BYTES,
  });
  await request.post(`${API_BASE}/videos/${sess.videoId}/upload-complete`, { headers: hdr });
  const fake = await request.post(`${API_BASE}/internal/fake-transcoder/complete/${sess.videoId}`);
  expect(fake.status()).toBe(204);

  return { courseId: c.id, moduleId: m.id, lessonId: l.id, videoId: sess.videoId };
}

test('owner can fetch master, rendition, and key', async ({ request }) => {
  const inst = await registerAndPromoteInstructor(request);
  const hdr = { Cookie: inst.cookieHeader };
  const { videoId } = await uploadAndTranscode(request, hdr);

  const master = await request.get(`${API_BASE}/playback/manifest/${videoId}`, { headers: hdr });
  expect(master.status()).toBe(200);
  expect(master.headers()['content-type']).toMatch(/application\/vnd\.apple\.mpegurl/);
  expect(master.headers()['cache-control']).toBe('no-store');
  const masterBody = await master.text();
  expect(masterBody.startsWith('#EXTM3U')).toBe(true);
  for (const r of ['1080p', '720p', '480p', '360p']) {
    expect(masterBody).toContain(`/api/playback/manifest/${videoId}/rendition/${r}`);
  }

  const r720 = await request.get(`${API_BASE}/playback/manifest/${videoId}/rendition/720p`, { headers: hdr });
  expect(r720.status()).toBe(200);
  expect(r720.headers()['content-type']).toMatch(/application\/vnd\.apple\.mpegurl/);
  const r720Body = await r720.text();
  expect(r720Body).toContain(`URI="/api/playback/keys/${videoId}"`);
  expect(r720Body).toContain('IV=0xABCDEF0123456789ABCDEF0123456789');
  // Segments rewritten via the stub signer
  expect(r720Body).toMatch(/gs-stub:\/\/.+\/720p\/segment_001\.ts/);
  expect(r720Body).toMatch(/gs-stub:\/\/.+\/720p\/segment_002\.ts/);

  const keyRes = await request.get(`${API_BASE}/playback/keys/${videoId}`, { headers: hdr });
  expect(keyRes.status()).toBe(200);
  expect(keyRes.headers()['content-type']).toBe('application/octet-stream');
  expect(keyRes.headers()['content-length']).toBe('16');
  expect((await keyRes.body()).length).toBe(16);
});
```

- [ ] **Step 5: Run the api-e2e**

```bash
pnpm nx e2e api-e2e -- --grep "owner can fetch master"
```

Expected: green. The api server must run with `LEARNWREN_VIDEO_STORAGE_PLAYBACK_FAKE=true`.

- [ ] **Step 6: Commit**

```bash
git add libs/api-video/src/lib/video.config.ts libs/api-video/src/lib/video.config.spec.ts libs/api-video/src/lib/video-storage.adapter.ts libs/api-video/src/lib/video-storage.adapter.spec.ts apps/api-e2e/src/playback.e2e-spec.ts
# Plus whichever file sets e2e env vars
git commit -m "test(api-e2e): playback happy path with fake storage seam"
```

---

## Task 15: API e2e — auth & error paths

**Files:**
- Modify: `apps/api-e2e/src/playback.e2e-spec.ts`

Cover every failure mode listed in spec §9 / §2.4.

- [ ] **Step 1: Append negative-path tests**

Append to `apps/api-e2e/src/playback.e2e-spec.ts`:

```ts
test('401 unauthenticated for every playback endpoint', async ({ request }) => {
  const inst = await registerAndPromoteInstructor(request);
  const hdr = { Cookie: inst.cookieHeader };
  const { videoId } = await uploadAndTranscode(request, hdr);

  for (const url of [
    `${API_BASE}/playback/manifest/${videoId}`,
    `${API_BASE}/playback/manifest/${videoId}/rendition/720p`,
    `${API_BASE}/playback/keys/${videoId}`,
  ]) {
    const r = await request.get(url);
    expect(r.status()).toBe(401);
  }
});

test('403 NOT_VIDEO_OWNER for a different instructor', async ({ request }) => {
  const owner = await registerAndPromoteInstructor(request);
  const ownerHdr = { Cookie: owner.cookieHeader };
  const { videoId } = await uploadAndTranscode(request, ownerHdr);

  const other = await registerAndPromoteInstructor(request);
  const otherHdr = { Cookie: other.cookieHeader };

  for (const url of [
    `${API_BASE}/playback/manifest/${videoId}`,
    `${API_BASE}/playback/manifest/${videoId}/rendition/720p`,
    `${API_BASE}/playback/keys/${videoId}`,
  ]) {
    const r = await request.get(url, { headers: otherHdr });
    expect(r.status()).toBe(403);
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe('NOT_VIDEO_OWNER');
  }
});

test('403 NOT_VIDEO_OWNER for a student (EP-06 widens this branch)', async ({ request }) => {
  const owner = await registerAndPromoteInstructor(request);
  const ownerHdr = { Cookie: owner.cookieHeader };
  const { videoId } = await uploadAndTranscode(request, ownerHdr);

  const student = await registerStudent(request);
  const studentHdr = { Cookie: student.cookieHeader };

  const r = await request.get(`${API_BASE}/playback/manifest/${videoId}`, { headers: studentHdr });
  expect(r.status()).toBe(403);
  expect(((await r.json()) as { error: { code: string } }).error.code).toBe('NOT_VIDEO_OWNER');
});

test('404 VIDEO_NOT_FOUND for a missing :vid', async ({ request }) => {
  const inst = await registerAndPromoteInstructor(request);
  const hdr = { Cookie: inst.cookieHeader };
  const r = await request.get(`${API_BASE}/playback/manifest/does-not-exist`, { headers: hdr });
  expect(r.status()).toBe(404);
  expect(((await r.json()) as { error: { code: string } }).error.code).toBe('VIDEO_NOT_FOUND');
});

test('404 RENDITION_NOT_FOUND for an unknown rendition', async ({ request }) => {
  const inst = await registerAndPromoteInstructor(request);
  const hdr = { Cookie: inst.cookieHeader };
  const { videoId } = await uploadAndTranscode(request, hdr);
  const r = await request.get(`${API_BASE}/playback/manifest/${videoId}/rendition/xyz`, { headers: hdr });
  expect(r.status()).toBe(404);
  expect(((await r.json()) as { error: { code: string } }).error.code).toBe('RENDITION_NOT_FOUND');
});

test('409 VIDEO_NOT_READY when state is TRANSCODING', async ({ request }) => {
  const inst = await registerAndPromoteInstructor(request);
  const hdr = { Cookie: inst.cookieHeader };

  // Run the full setup but SKIP the fake-completer — leave state in TRANSCODING.
  const c = await (await request.post(`${API_BASE}/courses`, {
    headers: hdr, data: { title: 'C', description: 'd' },
  })).json() as { id: string };
  const m = await (await request.post(`${API_BASE}/courses/${c.id}/modules`, {
    headers: hdr, data: { title: 'M' },
  })).json() as { id: string };
  const l = await (await request.post(`${API_BASE}/courses/${c.id}/modules/${m.id}/lessons`, {
    headers: hdr, data: { title: 'L' },
  })).json() as { id: string };
  const sess = await (await request.post(
    `${API_BASE}/courses/${c.id}/modules/${m.id}/lessons/${l.id}/video/upload-session`,
    { headers: hdr, data: { sizeBytes: FIXTURE_BYTES.length, contentType: 'video/mp4' } },
  )).json() as { videoId: string; uploadSessionUri: string };
  await request.put(sess.uploadSessionUri, {
    headers: { 'Content-Range': `bytes 0-${FIXTURE_BYTES.length - 1}/${FIXTURE_BYTES.length}` },
    data: FIXTURE_BYTES,
  });
  await request.post(`${API_BASE}/videos/${sess.videoId}/upload-complete`, { headers: hdr });
  // (NO fake-completer call)

  for (const url of [
    `${API_BASE}/playback/manifest/${sess.videoId}`,
    `${API_BASE}/playback/manifest/${sess.videoId}/rendition/720p`,
    `${API_BASE}/playback/keys/${sess.videoId}`,
  ]) {
    const r = await request.get(url, { headers: hdr });
    expect(r.status()).toBe(409);
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe('VIDEO_NOT_READY');
  }
});
```

- [ ] **Step 2: Run the api-e2e**

```bash
pnpm nx e2e api-e2e -- --grep "playback"
```

Expected: all negative-path tests green.

- [ ] **Step 3: Commit**

```bash
git add apps/api-e2e/src/playback.e2e-spec.ts
git commit -m "test(api-e2e): playback negative paths (401/403/404/409)"
```

---

## Task 16: Add `hls.js` dependency

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml` (via `pnpm add`)

- [ ] **Step 1: Add hls.js to runtime deps**

```bash
pnpm add hls.js
```

This installs the `hls.js` package and updates the lockfile. `hls.js` ships its own TypeScript declarations — no `@types/hls.js` needed.

Verify:

```bash
grep '"hls.js"' package.json
```

Expected: one match with a `^1.x` version.

- [ ] **Step 2: Sanity-build the affected web project**

```bash
pnpm nx build web-video
```

Expected: green. No new code uses hls.js yet — this confirms the install.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): add hls.js for slice C player"
```

---

## Task 17: Build `VideoPlayerService` — hls.js lifecycle seam

**Files:**
- Create: `libs/web-video/src/lib/player/video-player.service.ts`
- Create: `libs/web-video/src/lib/player/video-player.service.spec.ts`

The service is the test seam. It dispatches between the hls.js path (most browsers) and the native HLS path (Safari/iOS).

- [ ] **Step 1: Write failing tests**

Create `libs/web-video/src/lib/player/video-player.service.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { VideoPlayerService } from './video-player.service';

const hlsStub = vi.hoisted(() => {
  const instances: Array<{
    config: unknown;
    on: ReturnType<typeof vi.fn>;
    loadSource: ReturnType<typeof vi.fn>;
    attachMedia: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    fire: (data: { fatal: boolean; details?: string }) => void;
  }> = [];
  const Hls = vi.fn(function (this: unknown, config: unknown) {
    const handlers: Array<(_: unknown, data: { fatal: boolean; details?: string }) => void> = [];
    const inst = {
      config,
      on: vi.fn((_: string, h: (_: unknown, data: { fatal: boolean; details?: string }) => void) =>
        handlers.push(h),
      ),
      loadSource: vi.fn(),
      attachMedia: vi.fn(),
      destroy: vi.fn(),
      fire: (data: { fatal: boolean; details?: string }) => handlers.forEach((h) => h({}, data)),
    };
    instances.push(inst);
    return inst;
  });
  // mimic class statics:
  // - isSupported: toggled per-test
  // - Events.ERROR symbol
  Object.assign(Hls, {
    isSupported: vi.fn(() => true),
    Events: { ERROR: 'hlsError' },
  });
  return { Hls, instances };
});

vi.mock('hls.js', () => ({
  __esModule: true,
  default: hlsStub.Hls,
}));

function videoEl(canPlay: string = ''): HTMLVideoElement {
  const el = document.createElement('video');
  el.canPlayType = () => canPlay as ReturnType<HTMLVideoElement['canPlayType']>;
  return el;
}

describe('VideoPlayerService', () => {
  let svc: VideoPlayerService;

  beforeEach(() => {
    hlsStub.instances.length = 0;
    (hlsStub.Hls as unknown as { mockClear: () => void }).mockClear();
    (hlsStub.Hls as unknown as { isSupported: ReturnType<typeof vi.fn> }).isSupported.mockReturnValue(true);
    TestBed.configureTestingModule({ providers: [VideoPlayerService] });
    svc = TestBed.inject(VideoPlayerService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses hls.js when supported — sets xhrSetup.withCredentials, loadSource, attachMedia', () => {
    const el = videoEl();
    const onFatalError = vi.fn();
    const handle = svc.attach(el, '/api/playback/manifest/v1', { onFatalError });
    expect(hlsStub.instances.length).toBe(1);
    const inst = hlsStub.instances[0]!;
    expect(inst.loadSource).toHaveBeenCalledWith('/api/playback/manifest/v1');
    expect(inst.attachMedia).toHaveBeenCalledWith(el);
    // xhrSetup is a config callback — exercise it with a fake XHR
    const xhr = { withCredentials: false } as XMLHttpRequest;
    (inst.config as { xhrSetup: (xhr: XMLHttpRequest) => void }).xhrSetup(xhr);
    expect(xhr.withCredentials).toBe(true);
    handle.dispose();
    expect(inst.destroy).toHaveBeenCalledOnce();
    expect(el.getAttribute('src')).toBeNull();
  });

  it('surfaces fatal hls errors via onFatalError with a user-friendly message', () => {
    const el = videoEl();
    const onFatalError = vi.fn();
    svc.attach(el, '/api/playback/manifest/v1', { onFatalError });
    const inst = hlsStub.instances[0]!;
    inst.fire({ fatal: true, details: 'fragLoadError' });
    expect(onFatalError).toHaveBeenCalledWith('Playback interrupted — try again.');
  });

  it('ignores non-fatal hls errors', () => {
    const el = videoEl();
    const onFatalError = vi.fn();
    svc.attach(el, '/api/playback/manifest/v1', { onFatalError });
    hlsStub.instances[0]!.fire({ fatal: false, details: 'bufferStalledError' });
    expect(onFatalError).not.toHaveBeenCalled();
  });

  it('falls back to native HLS when Hls.isSupported() is false', () => {
    (hlsStub.Hls as unknown as { isSupported: ReturnType<typeof vi.fn> }).isSupported.mockReturnValue(false);
    const el = videoEl('maybe');
    const onFatalError = vi.fn();
    const handle = svc.attach(el, '/api/playback/manifest/v1', { onFatalError });
    expect(el.getAttribute('src')).toBe('/api/playback/manifest/v1');
    // Fire an error
    el.dispatchEvent(new Event('error'));
    expect(onFatalError).toHaveBeenCalledWith('Unable to play this video.');
    handle.dispose();
    expect(el.getAttribute('src')).toBeNull();
  });

  it('invokes onFatalError when no HLS path is available', () => {
    (hlsStub.Hls as unknown as { isSupported: ReturnType<typeof vi.fn> }).isSupported.mockReturnValue(false);
    const el = videoEl('');
    const onFatalError = vi.fn();
    svc.attach(el, '/api/playback/manifest/v1', { onFatalError });
    expect(onFatalError).toHaveBeenCalledWith('Your browser does not support HLS playback.');
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

```bash
pnpm nx test web-video -- video-player.service
```

Expected: module not found.

- [ ] **Step 3: Implement the service**

Create `libs/web-video/src/lib/player/video-player.service.ts`:

```ts
import { Injectable } from '@angular/core';
import Hls from 'hls.js';

export interface PlayerHooks {
  onFatalError: (message: string) => void;
}

export interface PlayerHandle {
  dispose(): void;
}

function userMessageFor(details: string | undefined): string {
  switch (details) {
    case 'manifestLoadError':
    case 'manifestLoadTimeOut':
      return 'Unable to load the video. Try again.';
    case 'levelLoadError':
    case 'levelLoadTimeOut':
    case 'fragLoadError':
    case 'fragLoadTimeOut':
      return 'Playback interrupted — try again.';
    case 'keyLoadError':
    case 'keyLoadTimeOut':
      return 'Unable to decrypt this video.';
    default:
      return 'Playback failed — try again.';
  }
}

@Injectable({ providedIn: 'root' })
export class VideoPlayerService {
  attach(el: HTMLVideoElement, manifestUrl: string, hooks: PlayerHooks): PlayerHandle {
    if (Hls.isSupported()) {
      const hls = new Hls({
        xhrSetup: (xhr: XMLHttpRequest) => {
          xhr.withCredentials = true;
        },
      });
      hls.on(Hls.Events.ERROR, (_: unknown, data: { fatal: boolean; details?: string }) => {
        if (data.fatal) hooks.onFatalError(userMessageFor(data.details));
      });
      hls.loadSource(manifestUrl);
      hls.attachMedia(el);
      return {
        dispose: () => {
          hls.destroy();
          el.removeAttribute('src');
          el.load();
        },
      };
    }

    if (el.canPlayType('application/vnd.apple.mpegurl')) {
      el.src = manifestUrl;
      const handler = () => hooks.onFatalError('Unable to play this video.');
      el.addEventListener('error', handler);
      return {
        dispose: () => {
          el.removeEventListener('error', handler);
          el.removeAttribute('src');
          el.load();
        },
      };
    }

    hooks.onFatalError('Your browser does not support HLS playback.');
    return { dispose: () => undefined };
  }
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm nx test web-video -- video-player.service
```

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add libs/web-video/src/lib/player/video-player.service.ts libs/web-video/src/lib/player/video-player.service.spec.ts
git commit -m "feat(web-video): VideoPlayerService — hls.js + native HLS seam"
```

---

## Task 18: Build `VideoPlayerComponent`

**Files:**
- Create: `libs/web-video/src/lib/player/video-player.component.ts`
- Create: `libs/web-video/src/lib/player/video-player.component.html`
- Create: `libs/web-video/src/lib/player/video-player.component.css`
- Create: `libs/web-video/src/lib/player/video-player.component.spec.ts`

Wraps the service in a standalone Angular component with native `<video controls>` and a retry button on fatal error.

- [ ] **Step 1: Write the template**

Create `libs/web-video/src/lib/player/video-player.component.html`:

```html
<video
  #playerEl
  controls
  preload="metadata"
  crossorigin="use-credentials"
  class="player"
  data-testid="video-player"
></video>
@if (error(); as msg) {
  <div class="error" role="alert" data-testid="video-player-error">
    <span>{{ msg }}</span>
    <button
      type="button"
      (click)="retry()"
      data-testid="video-player-retry"
    >
      Try again
    </button>
  </div>
}
```

- [ ] **Step 2: Write the styles**

Create `libs/web-video/src/lib/player/video-player.component.css`:

```css
.player {
  display: block;
  width: 100%;
  max-width: 100%;
  background: #000;
}

.error {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: #fde7e7;
  color: #7a1f1f;
  border-radius: 4px;
}
```

- [ ] **Step 3: Write failing tests**

Create `libs/web-video/src/lib/player/video-player.component.spec.ts`:

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { VideoId } from '@learnwren/shared-data-models';

import { VideoPlayerComponent } from './video-player.component';
import { VideoPlayerService, type PlayerHandle } from './video-player.service';

interface StubService {
  handle: PlayerHandle & { dispose: ReturnType<typeof vi.fn> };
  attach: ReturnType<typeof vi.fn>;
  capturedHooks: { onFatalError: (msg: string) => void };
}

function makeStubService(): StubService {
  const handle = { dispose: vi.fn() };
  const stub: StubService = {
    handle,
    attach: vi.fn(),
    capturedHooks: { onFatalError: () => undefined },
  };
  stub.attach.mockImplementation((_: HTMLVideoElement, _url: string, hooks) => {
    stub.capturedHooks = hooks;
    return handle;
  });
  return stub;
}

async function bootstrap(): Promise<{
  fixture: ComponentFixture<VideoPlayerComponent>;
  stub: StubService;
}> {
  const stub = makeStubService();
  TestBed.configureTestingModule({
    imports: [VideoPlayerComponent],
    providers: [{ provide: VideoPlayerService, useValue: stub }],
  });
  const fixture = TestBed.createComponent(VideoPlayerComponent);
  fixture.componentRef.setInput('videoId', 'v1' as VideoId);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, stub };
}

describe('VideoPlayerComponent', () => {
  it('attaches the service to the video element with the manifest URL', async () => {
    const { stub } = await bootstrap();
    expect(stub.attach).toHaveBeenCalledOnce();
    expect(stub.attach.mock.calls[0]![1]).toBe('/api/playback/manifest/v1');
  });

  it('disposes the handle on destroy', async () => {
    const { fixture, stub } = await bootstrap();
    fixture.destroy();
    expect(stub.handle.dispose).toHaveBeenCalledOnce();
  });

  it('renders an error and Try again button on fatal error', async () => {
    const { fixture, stub } = await bootstrap();
    stub.capturedHooks.onFatalError('Playback interrupted — try again.');
    fixture.detectChanges();
    const alert = fixture.nativeElement.querySelector('[data-testid="video-player-error"]');
    expect(alert).not.toBeNull();
    expect(alert.textContent).toContain('Playback interrupted');
    const retry = fixture.nativeElement.querySelector('[data-testid="video-player-retry"]');
    expect(retry).not.toBeNull();
  });

  it('retry disposes the handle, clears error, and re-attaches', async () => {
    const { fixture, stub } = await bootstrap();
    stub.capturedHooks.onFatalError('Playback interrupted — try again.');
    fixture.detectChanges();
    const retry = fixture.nativeElement.querySelector(
      '[data-testid="video-player-retry"]',
    ) as HTMLButtonElement;
    retry.click();
    fixture.detectChanges();
    expect(stub.handle.dispose).toHaveBeenCalledOnce();
    expect(stub.attach).toHaveBeenCalledTimes(2);
    expect(
      fixture.nativeElement.querySelector('[data-testid="video-player-error"]'),
    ).toBeNull();
  });
});
```

- [ ] **Step 4: Run tests, expect failure**

```bash
pnpm nx test web-video -- video-player.component
```

Expected: component not found.

- [ ] **Step 5: Implement the component**

Create `libs/web-video/src/lib/player/video-player.component.ts`:

```ts
import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  inject,
  input,
  signal,
} from '@angular/core';

import type { VideoId } from '@learnwren/shared-data-models';

import { VideoPlayerService, type PlayerHandle } from './video-player.service';

@Component({
  selector: 'lib-video-player',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './video-player.component.html',
  styleUrls: ['./video-player.component.css'],
})
export class VideoPlayerComponent implements AfterViewInit, OnDestroy {
  readonly videoId = input.required<VideoId>();

  @ViewChild('playerEl', { static: true })
  playerEl!: ElementRef<HTMLVideoElement>;

  readonly error = signal<string | null>(null);
  private handle: PlayerHandle | null = null;
  private readonly playerSvc = inject(VideoPlayerService);

  ngAfterViewInit(): void {
    this.mount();
  }

  ngOnDestroy(): void {
    this.handle?.dispose();
    this.handle = null;
  }

  retry(): void {
    this.handle?.dispose();
    this.handle = null;
    this.error.set(null);
    this.mount();
  }

  private mount(): void {
    const url = `/api/playback/manifest/${this.videoId()}`;
    this.handle = this.playerSvc.attach(this.playerEl.nativeElement, url, {
      onFatalError: (message: string) => this.error.set(message),
    });
  }
}
```

- [ ] **Step 6: Run tests, expect pass**

```bash
pnpm nx test web-video -- video-player.component
```

Expected: green.

- [ ] **Step 7: Commit**

```bash
git add libs/web-video/src/lib/player/
git commit -m "feat(web-video): VideoPlayerComponent — standalone player with retry"
```

---

## Task 19: Export `VideoPlayerComponent` from `libs/web-video`

**Files:**
- Modify: `libs/web-video/src/index.ts`

- [ ] **Step 1: Add the export**

Open `libs/web-video/src/index.ts` and append:

```ts
export { VideoPlayerComponent } from './lib/player/video-player.component';
```

- [ ] **Step 2: Verify the build**

```bash
pnpm nx build web-video
```

Expected: green.

- [ ] **Step 3: Commit**

```bash
git add libs/web-video/src/index.ts
git commit -m "feat(web-video): export VideoPlayerComponent"
```

---

## Task 20: Wire `VideoPlayerComponent` into `LessonItemComponent`

**Files:**
- Modify: `libs/web-courses/src/lib/components/lesson-item/lesson-item.component.html`
- Modify: `libs/web-courses/src/lib/components/lesson-item/lesson-item.component.ts`
- Modify: `libs/web-courses/src/lib/components/lesson-item/lesson-item.component.spec.ts`

Slice C adds a third render branch to the existing two-way switch: if `Video.state === 'READY'`, render `<lib-video-player>` instead of the badge.

- [ ] **Step 1: Update the template**

Open `libs/web-courses/src/lib/components/lesson-item/lesson-item.component.html`. Replace the inner `videoId` block (lines 17–26) with:

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
    <lib-video-upload
      [courseId]="courseId()"
      [moduleId]="lesson().moduleId"
      [lessonId]="lesson().id"
      (uploaded)="onVideoUploaded()"
    />
  }
```

- [ ] **Step 2: Import the player component**

Open `libs/web-courses/src/lib/components/lesson-item/lesson-item.component.ts`. Update the `@learnwren/web-video` import to include `VideoPlayerComponent`:

```ts
import {
  VideoPlayerComponent,
  VideoService,
  VideoStateBadgeComponent,
  VideoUploadComponent,
} from '@learnwren/web-video';
```

Update the component's `imports` array:

```ts
  imports: [FormsModule, VideoUploadComponent, VideoStateBadgeComponent, VideoPlayerComponent],
```

- [ ] **Step 3: Write/extend the failing test**

Open `libs/web-courses/src/lib/components/lesson-item/lesson-item.component.spec.ts`. Add a test that confirms the player renders when the video state is READY:

```ts
import { VideoPlayerComponent } from '@learnwren/web-video';

// Inside the existing describe block (or in a new one):
it('renders <lib-video-player> when the loaded video is READY', async () => {
  // Adapt to whichever harness the existing spec uses — likely a TestBed
  // setup with a stub VideoService that returns a READY Video for the
  // configured lesson.videoId.
  const readyVideo = {
    id: 'v1', state: 'READY', ownerInstructorId: 'u1', courseId: 'c1', lessonId: 'l1',
    source: { bucket: 'b', path: 'p' },
    output: { bucket: 'o', manifestPath: 'videos/v1/hls/manifest.m3u8', durationSec: 60 },
    keyId: 'k1', createdAt: 'now', updatedAt: 'now',
  };
  // Configure the stub VideoService.getVideo to return readyVideo, render the
  // component with a Lesson whose videoId is 'v1', then:
  // expect(fixture.debugElement.query(By.directive(VideoPlayerComponent))).not.toBeNull();
  // expect(fixture.debugElement.query(By.css('lib-video-state-badge'))).toBeNull();
});
```

Look at the existing spec to match its TestBed harness, stubbing approach (HttpTestingController or service mock), and assertion style. If `VideoPlayerService` is loaded eagerly when `VideoPlayerComponent` is imported, override it in the providers to a stub that returns a dispose-only handle (mirror the Task 18 `makeStubService`).

Also add a test confirming the badge still renders for `TRANSCODING`:

```ts
it('renders <lib-video-state-badge> when video is non-READY', async () => {
  // Same harness; video.state = 'TRANSCODING'; assert badge present and player absent.
});
```

- [ ] **Step 4: Run tests, expect failure then pass**

```bash
pnpm nx test web-courses -- lesson-item
```

If the existing tests already cover the badge-rendering case, they should still pass after the template edit (the structure inserted a nested `@if`). Adjust the new tests as needed.

- [ ] **Step 5: Commit**

```bash
git add libs/web-courses/src/lib/components/lesson-item/
git commit -m "feat(web-courses): swap LessonItem badge → player on Video READY"
```

---

## Task 21: Web e2e — badge swaps to player after fake-completer

**Files:**
- Modify: `apps/web-e2e/src/videos.spec.ts`

Reuses the existing `setupCourseWithLesson` helper. Asserts the `<lib-video-player>` mounts within one polling cycle after the fake-completer call, that the `<video data-testid="video-player">` element is present, and that no console errors fired.

- [ ] **Step 1: Append the test**

Append to `apps/web-e2e/src/videos.spec.ts`:

```ts
test('badge swaps to player when fake-completer flips state to READY', async ({ page }) => {
  const { email, password } = await registerAndPromoteInstructor();
  await setupCourseWithLesson(page, email, password);

  // Capture console errors for the assertion below.
  const consoleErrors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  const sessionResponse = page.waitForResponse(
    (r) => r.url().includes('/video/upload-session') && r.request().method() === 'POST',
  );
  await page.locator('lib-video-upload input[type="file"]').setInputFiles(FIXTURE_MP4);
  const { videoId } = (await (await sessionResponse).json()) as { videoId: string };

  // Wait for the TRANSCODING badge first
  await expect(page.locator('lib-video-state-badge .badge')).toBeVisible({ timeout: 30_000 });

  // Flip the video to READY via the fake completer
  const res = await page.request.post(`${API_BASE}/internal/fake-transcoder/complete/${videoId}`);
  expect(res.status()).toBe(204);

  // The player must mount; the badge must unmount.
  const player = page.getByTestId('video-player');
  await expect(player).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('lib-video-state-badge')).toHaveCount(0);

  // No console errors during the swap.
  expect(consoleErrors).toEqual([]);
});

test('second instructor cannot see another instructor’s player', async ({ page, browser }) => {
  // Owner uploads + transcodes the video in context A.
  const owner = await registerAndPromoteInstructor();
  await setupCourseWithLesson(page, owner.email, owner.password);
  const sessionResponse = page.waitForResponse(
    (r) => r.url().includes('/video/upload-session') && r.request().method() === 'POST',
  );
  await page.locator('lib-video-upload input[type="file"]').setInputFiles(FIXTURE_MP4);
  const { videoId } = (await (await sessionResponse).json()) as { videoId: string };
  await page.request.post(`${API_BASE}/internal/fake-transcoder/complete/${videoId}`);
  await expect(page.getByTestId('video-player')).toBeVisible({ timeout: 10_000 });

  // The non-owner can't render that lesson — they have no route to it. Verify
  // by calling /api/playback/manifest/:vid directly from a second context and
  // confirming the guard's 403.
  const otherContext = await browser.newContext();
  const other = await registerAndPromoteInstructor();
  const loginRes = await otherContext.request.post(`${API_BASE}/auth/login`, {
    headers: { 'Content-Type': 'application/json' },
    data: { email: other.email, password: other.password },
  });
  expect(loginRes.status()).toBe(200);
  const probe = await otherContext.request.get(`${API_BASE}/playback/manifest/${videoId}`);
  expect(probe.status()).toBe(403);
  await otherContext.close();
});
```

The second test verifies the guard's 403 path from a true second-instructor session — the editor's UI doesn't expose other instructors' lessons today, so the test exercises the API directly. This matches the spec §9 "second instructor → 403 NOT_VIDEO_OWNER" line.

If `apps/web-e2e/src/videos.spec.ts` defines `registerAndPromoteInstructor` locally (it does — see the existing top of the file), reuse it.

- [ ] **Step 2: Run web e2e**

```bash
pnpm nx e2e web-e2e -- --grep "swaps to player|second instructor"
```

Expected: green. The polling cycle is 5 s by default — the badge swap should occur within one polling tick after the fake-completer call.

If wall-clock duration is high, you can override `LEARNWREN_WEB_VIDEO_POLL_INTERVAL_MS` for the e2e harness — the slice B spec already documents this knob.

- [ ] **Step 3: Commit**

```bash
git add apps/web-e2e/src/videos.spec.ts
git commit -m "test(web-e2e): badge swaps to player on READY; non-owner gets 403"
```

---

## Task 22: Refresh mutation testing on `libs/api-video` (≥ 85 %)

**Files:**
- Modify: `docs/quality/mutation-report.md`
- (No config change — `stryker.api-video.config.mjs` already globs the new playback files via `libs/api-video/src/lib/**/*.ts`.)

- [ ] **Step 1: Run Stryker for api-video**

```bash
pnpm mutate:api-video
```

This refreshes `reports/mutation/api-video/mutation.{html,json}`. Inspect the report.

- [ ] **Step 2: Triage surviving mutants**

Open `reports/mutation/api-video/mutation.html`. For each surviving mutant in the new playback files (`manifest.rewriter.ts`, `manifest.service.ts`, `key.service.ts`, `enrollment-or-owner.guard.ts`, `playback.controller.ts`), decide:

- **Add a test** if the mutant reveals a real coverage gap (preferred).
- **Mark equivalent** if the mutant cannot be killed by a true behavioural test (note the reason in `docs/quality/mutation-report.md`).

Common patterns from slice A/B that come up here:
- Conditional boundaries on `i < lines.length` in `rewriteMaster` — add a test for trailing-blank-line input.
- Header literal `'application/octet-stream'` — already pinned by the controller spec.
- The `state !== 'READY'` check in the guard — pinned by Task 10 spec.

Target: effective mutation score ≥ 85 %. If you fall short, either add tests or document equivalent mutants in `docs/quality/mutation-report.md`.

Confirm the mutation score on the slice A/B surface did not regress: search the report for files like `video.service.ts`, `manifest.builder.ts`, etc., and compare to the previous run's numbers in `docs/quality/mutation-report.md`.

- [ ] **Step 3: Update the mutation report**

Open `docs/quality/mutation-report.md`. Add a new section dated today:

```markdown
## 2026-05-14 — Slice C (playback) integration

- `libs/api-video` mutation score: <NEW>% (was <PREV>% at slice B sign-off).
- New mutation surface: `playback/manifest.rewriter.ts`, `playback/manifest.service.ts`, `playback/key.service.ts`, `playback/enrollment-or-owner.guard.ts`, `playback/playback.controller.ts`.
- Triage summary:
  - <N> mutants killed via new tests in <files>.
  - <N> equivalent mutants documented inline below.
- Slice A/B mutation score: unchanged at <PREV>% (no regression).

### Equivalent mutants (slice C)

- `<file>:<line>` — `<mutant>`. Reason: <why no behavioural test can kill it>.
```

Fill in the numbers from the Stryker output.

- [ ] **Step 4: Commit**

```bash
git add reports/mutation/api-video/mutation.html reports/mutation/api-video/mutation.json docs/quality/mutation-report.md
git commit -m "chore(quality): refresh api-video mutation report for slice C"
```

---

## Task 23: Refresh CRAP report

**Files:**
- Modify: `docs/quality/crap-report.md`

Per spec §9 / §12, refresh the CRAP report so the new `playback/` and `player/` submodules are covered.

- [ ] **Step 1: Run the CRAP pipeline**

```bash
pnpm crap
```

This runs coverage across the listed projects then `tools/crap/crap.mjs` to compute scores.

- [ ] **Step 2: Update the report**

Open `docs/quality/crap-report.md`. Add a section dated today summarizing:
- Top-CRAP methods in `libs/api-video/src/lib/playback/` and `libs/web-video/src/lib/player/`.
- Any method with CRAP > 30 that warrants follow-up — and a one-line plan for each (extra tests preferred; refactor if cyclomatic complexity is the root cause).

If a method shows up unexpectedly hot, prefer adding tests over refactoring at this stage — slice C's surface area is small and direct.

- [ ] **Step 3: Commit**

```bash
git add docs/quality/crap-report.md
git commit -m "chore(quality): refresh CRAP report for slice C surface"
```

---

## Task 24: Update README banner

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Find the slice B banner line**

The slice B plan updates a single sentence on line 7 of `README.md` ("**EP-03 slices A + B (video upload through transcoding)…**"). Slice C extends that to include owner playback.

- [ ] **Step 2: Edit the banner**

Use `Edit` to change the slice B banner sentence. Replace:

```
**EP-03 slices A + B (video upload through transcoding): instructor uploads MP4 / MOV / MKV ≤ 10 GB to a lesson via resumable upload, ffprobe + GCP Transcoder API + AES-128 HLS produce playable manifests on the output bucket, badge reflects live state** are wired up. Course publish (US-02-04) and cover image upload are deferred. **Owner playback is deferred to EP-03 slice C.**
```

with:

```
**EP-03 slices A + B + C (video upload through owner playback): instructor uploads MP4 / MOV / MKV ≤ 10 GB to a lesson via resumable upload, ffprobe + GCP Transcoder API + AES-128 HLS produce playable manifests on the output bucket, the lesson editor swaps the badge for an inline `<video>` element that streams via hls.js (or native HLS on Safari/iOS) once the video is READY** are wired up. Course publish (US-02-04) and cover image upload are deferred. **Student playback (EP-06) and the publish gate (slice D) remain deferred.**
```

If the README banner copy on your branch has diverged from what slice B's plan wrote, adapt the new sentence to match the same shape: extend the working-features list and replace the "Owner playback is deferred" callout with the new deferred set (slice D + EP-06).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(readme): EP-03 slice C complete — owner playback in editor"
```

---

## Task 25: Final integration check

**Files:** (none — verification only)

- [ ] **Step 1: Run every gate the spec acceptance bar (§12) calls out**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm e2e
```

Expected: every command green. If any test fails, investigate before claiming completion (per the verification-before-completion principle). Pay particular attention to the `api-e2e auth happy-path is flaky` memory note — a single retry of the api-e2e run is acceptable; chase only if it fails repeatedly.

- [ ] **Step 2: Confirm `pnpm secrets:render` still produces a usable `.env`**

```bash
pnpm secrets:render
grep -c "LEARNWREN_VIDEO_" .env
```

Expected: ≥ 7 hits (slice A: 2, slice B: 4 to 7, slice C: 1).

- [ ] **Step 3: Manual run-through against the dev Firebase project**

Per spec §12 item 5, perform the manual run-through:

1. `pnpm secrets:run -- pnpm start` (or equivalent) with the dev project's GCP service account configured and CORS applied to the dev output bucket.
2. Sign in as a promoted instructor; create a course → module → lesson; upload a ~10 MB MP4; observe state transitions.
3. Click play after the badge swaps to the player; confirm playback starts within ~3 s.
4. Pause for > 4 h, resume → "Try again" → playback continues.
5. Delete the lesson while the player is mounted; confirm no console errors and the output bucket prefix is cleared (slice B cascade).
6. Sign out → reload editor → playback fails with the 401-mapped error message; sign back in → retry works.
7. Repeat against desktop Safari and (if feasible) iOS Safari to confirm the native HLS path.

Capture findings in the commit message of any follow-up fix.

- [ ] **Step 4: Push the branch and open a PR (when ready)**

```bash
git push -u origin ep-03-slice-c-video-playback
```

Open a PR titled `EP-03 slice C — Video owner playback`. PR body should reference `docs/superpowers/specs/2026-05-14-video-playback-slice-c-design.md` and the spec acceptance bar (§12). Do not change the spec's DRAFT banner — stakeholder sign-off is a manual step that follows merge.

---

## Self-Review

Spec coverage check (each spec section → task):
- §1 State Machine — Task 20 (`LessonItem` render switch on READY).
- §2.1–2.4 API surface — Tasks 10, 11 (guard + controller); §2.4 error codes — Task 3.
- §3 Data layer — Task 4 (`getVideoKey` reader); no schema/index/rules changes (spec §3.2–3.4 confirm).
- §4.1 `libs/api-video` additions — Tasks 6–11; module wiring — Task 12.
- §4.2 storage adapter — Task 5; §4.5 `libs/web-video` — Tasks 17–19; §4.6 `LessonItem` — Task 20.
- §5 Manifest rewriting — Tasks 6, 7 (pure); Task 9 (IO service).
- §6 Output bucket CORS — Task 13 (runbook).
- §7 Player component — Tasks 17, 18.
- §8 Failure modes — covered by Tasks 10, 11 (guards/errors), 14, 15 (api-e2e), 17 (player fatal error mapping).
- §9 Testing — unit Tasks 3, 5, 6, 7, 8, 9, 10, 11, 17, 18, 20; api-e2e Tasks 14, 15; web e2e Task 21; mutation Task 22; CRAP Task 23.
- §10 Locked decisions — encoded across implementation tasks (allow-list pinned in Task 6; `Cache-Control: no-store` in Task 11; signed URL TTL in Task 1; single controller in Task 11; service seam in Task 17).
- §11 Env vars — Task 1 (TTL); Task 14 also adds `LEARNWREN_VIDEO_STORAGE_PLAYBACK_FAKE` as a test seam — append to `.env.tpl` when wiring it (mention this in the Task 14 commit if you add the var). If you prefer to ship slice C without a permanent storage test-seam env var, replace Task 14 step 1's env-flag approach with a Nest provider override at the e2e harness level (Path B in Task 14).
- §12 Acceptance bar — Task 25 step 1 (gates) + step 3 (manual run-through) + Task 22 (mutation ≥ 85 %) + Task 13 (CORS doc) + Task 24 (README banner). Spec status to Approved is stakeholder gate, not code.

Type consistency: `VideoId`, `VideoKey`, `RenditionName`, `PlayerHandle`, `PlayerHooks` defined once and reused. `EnrollmentOrOwnerGuard.canActivate` returns `Promise<boolean>` matching `VideoOwnerGuard`. `@CurrentVideo()` reads from `request.video` populated by the guard — same pattern slice A uses with `VideoScopedRequest`.

Placeholders: none. Every step contains the code, command, or commit message it needs.

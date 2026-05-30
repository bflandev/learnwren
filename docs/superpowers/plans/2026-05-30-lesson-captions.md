# Lesson Captions (WebVTT) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an instructor attach one WebVTT caption track to a lesson's video and let the student (and owner) toggle it on via the player's native CC button.

**Architecture:** Sidecar `<track>` delivery. The VTT text is stored in a Firestore `videoCaptions` doc keyed by `videoId` (mirroring `videoKeys`), uploaded via a multipart `PUT` (like cover/picture), validated server-side, and served as `text/vtt` through the existing playback access gate. No transcoder or HLS-manifest changes. Captions errors are `VideoException` subclasses caught by the existing `VideoExceptionFilter`.

**Tech Stack:** NestJS 11 (api-courses), Angular 21 signals (web-video, web-learn, web-courses), Firestore, Vitest, Playwright. Reference spec: `docs/superpowers/specs/2026-05-30-lesson-captions-design.md`.

**Conventions to follow:**
- TDD: write the failing test, watch it fail, implement minimally, watch it pass, commit.
- Run a single project's tests with `pnpm nx test <project> --skip-nx-cache`. Filter a file with ` -- <path>` or vitest `-t`.
- Branch `feat/lesson-captions` already exists and holds the spec. Commit each task to it.
- Default caption language is fixed this slice: `language='en'`, `label='English'`.

---

### Task 1: Shared data-model types

**Files:**
- Modify: `libs/shared-data-models/src/lib/video.ts`
- Modify: `libs/shared-data-models/src/lib/lesson-view.ts`

- [ ] **Step 1: Add the caption types to `video.ts`**

Append to `libs/shared-data-models/src/lib/video.ts`:

```ts
/**
 * One caption/subtitle track for a video. Stored in the `videoCaptions`
 * collection with document id === videoId (strict 1:1). `content` is raw
 * WebVTT text (≤ 256 KB; well under Firestore's 1 MB document limit).
 */
export interface VideoCaptions {
  videoId: VideoId;
  language: string; // BCP-47; fixed 'en' in the first slice
  label: string; // display label, e.g. 'English'
  format: 'vtt';
  content: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** Metadata projection of VideoCaptions (no VTT body). */
export type VideoCaptionsMeta = Pick<VideoCaptions, 'language' | 'label' | 'updatedAt'>;
```

- [ ] **Step 2: Add the `captions` projection to `LessonView`**

In `libs/shared-data-models/src/lib/lesson-view.ts`, inside the `lesson` object of `interface LessonView`, add a `captions` field after `videoState`:

```ts
  lesson: {
    id: LessonId;
    moduleId: ModuleId;
    title: string;
    description?: string;
    videoId: VideoId | null;
    videoState: VideoState | null;
    /** Caption track metadata for the player, or null when none. */
    captions: { language: string; label: string } | null;
  };
```

- [ ] **Step 3: Typecheck + build the library**

Run: `pnpm nx build shared-data-models --skip-nx-cache`
Expected: PASS (the new types are exported via the existing `export *` in `src/index.ts`; verify `VideoCaptions` is importable).

- [ ] **Step 4: Commit**

```bash
git add libs/shared-data-models/src/lib/video.ts libs/shared-data-models/src/lib/lesson-view.ts
git commit -m "feat(shared): VideoCaptions types + LessonView.lesson.captions"
```

---

### Task 2: Caption exceptions (VideoException subclasses)

**Files:**
- Modify: `libs/api-courses/src/lib/video/errors/video-error.codes.ts`
- Modify: `libs/api-courses/src/lib/video/errors/video.exception.ts`
- Test: `libs/api-courses/src/lib/video/errors/video.exception.spec.ts`

- [ ] **Step 1: Write the failing test**

Add to `video.exception.spec.ts`:

```ts
import {
  CaptionsNotFoundException,
  CaptionTooLargeException,
  InvalidCaptionFileException,
} from './video.exception';

describe('caption exceptions', () => {
  it('InvalidCaptionFileException is a 400 with INVALID_CAPTION_FILE', () => {
    const e = new InvalidCaptionFileException();
    expect(e.code).toBe('INVALID_CAPTION_FILE');
    expect(e.status).toBe(400);
  });
  it('CaptionTooLargeException is a 400 with CAPTION_TOO_LARGE', () => {
    const e = new CaptionTooLargeException();
    expect(e.code).toBe('CAPTION_TOO_LARGE');
    expect(e.status).toBe(400);
  });
  it('CaptionsNotFoundException is a 404 with CAPTIONS_NOT_FOUND', () => {
    const e = new CaptionsNotFoundException();
    expect(e.code).toBe('CAPTIONS_NOT_FOUND');
    expect(e.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test api-courses --skip-nx-cache -- video/errors/video.exception.spec.ts`
Expected: FAIL ("is not exported" / undefined).

- [ ] **Step 3: Add the codes**

In `video-error.codes.ts`, add three members to the `VideoErrorCode` union (before `'INTERNAL'`):

```ts
  | 'INVALID_CAPTION_FILE'
  | 'CAPTION_TOO_LARGE'
  | 'CAPTIONS_NOT_FOUND'
```

- [ ] **Step 4: Add the exception classes**

Append to `video.exception.ts`:

```ts
export class InvalidCaptionFileException extends VideoException {
  constructor() {
    super('INVALID_CAPTION_FILE', 'Captions must be a valid WebVTT (.vtt) file.', 400);
  }
}

export class CaptionTooLargeException extends VideoException {
  constructor() {
    super('CAPTION_TOO_LARGE', 'Caption file exceeds the 256 KB limit.', 400);
  }
}

export class CaptionsNotFoundException extends VideoException {
  constructor() {
    super('CAPTIONS_NOT_FOUND', 'No captions exist for this video.', 404);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm nx test api-courses --skip-nx-cache -- video/errors/video.exception.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add libs/api-courses/src/lib/video/errors/
git commit -m "feat(api-courses): caption VideoException subclasses + codes"
```

---

### Task 3: WebVTT validator (pure function)

**Files:**
- Create: `libs/api-courses/src/lib/video/captions/webvtt.validator.ts`
- Test: `libs/api-courses/src/lib/video/captions/webvtt.validator.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `webvtt.validator.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { isValidWebVtt } from './webvtt.validator';

const VALID = `WEBVTT

00:00:01.000 --> 00:00:04.000
Hello world
`;

describe('isValidWebVtt', () => {
  it('accepts a well-formed cue file', () => {
    expect(isValidWebVtt(VALID)).toBe(true);
  });
  it('accepts a leading UTF-8 BOM', () => {
    expect(isValidWebVtt('﻿' + VALID)).toBe(true);
  });
  it('accepts hour-less cue timings', () => {
    expect(isValidWebVtt('WEBVTT\n\n00:01.000 --> 00:04.000\nHi\n')).toBe(true);
  });
  it('rejects a file without the WEBVTT signature', () => {
    expect(isValidWebVtt('00:00:01.000 --> 00:00:04.000\nHi')).toBe(false);
  });
  it('rejects a signature-only file with no cue', () => {
    expect(isValidWebVtt('WEBVTT\n\n')).toBe(false);
  });
  it('rejects a file where WEBVTT is not at the very start', () => {
    expect(isValidWebVtt('  WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nHi')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test api-courses --skip-nx-cache -- video/captions/webvtt.validator.spec.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the validator**

Create `webvtt.validator.ts`:

```ts
// A cue timing line: HH:MM:SS.mmm --> HH:MM:SS.mmm with hours optional.
const CUE_TIMING = /(?:\d{2}:)?\d{2}:\d{2}\.\d{3}\s*-->\s*(?:\d{2}:)?\d{2}:\d{2}\.\d{3}/;

/**
 * Minimal WebVTT structural check (no full parse): the body must begin with the
 * `WEBVTT` magic (BOM-tolerant, optionally followed by space/tab/newline or EOF)
 * and contain at least one cue timing line.
 */
export function isValidWebVtt(text: string): boolean {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  if (!/^WEBVTT(?:[ \t\r\n]|$)/.test(body)) return false;
  return CUE_TIMING.test(body);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test api-courses --skip-nx-cache -- video/captions/webvtt.validator.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/video/captions/webvtt.validator.ts libs/api-courses/src/lib/video/captions/webvtt.validator.spec.ts
git commit -m "feat(api-courses): WebVTT structural validator"
```

---

### Task 4: VideoRepository caption methods + delete cleanup

**Files:**
- Modify: `libs/api-courses/src/lib/video/video.repository.ts`
- Test: `libs/api-courses/src/lib/video/video.repository.spec.ts`

- [ ] **Step 1: Write the failing test**

Add to `video.repository.spec.ts` (the file already imports `createFakeFirestore`, `buildRepo`, `makeVideo`, `lessonDoc`, `NOW_ISO`, `LESSON_PATH`):

```ts
import type { VideoCaptions } from '@learnwren/shared-data-models';

function makeCaptions(overrides: Partial<VideoCaptions> = {}): VideoCaptions {
  return {
    videoId: 'v1' as VideoId,
    language: 'en',
    label: 'English',
    format: 'vtt',
    content: 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi\n',
    createdAt: SEED_DATE,
    updatedAt: SEED_DATE,
    ...overrides,
  };
}

describe('VideoRepository — captions', () => {
  it('upsertCaptions then getCaptions round-trips', async () => {
    const fake = createFakeFirestore();
    const repo = await buildRepo(fake);
    await repo.upsertCaptions(makeCaptions());
    const got = await repo.getCaptions('v1' as VideoId);
    expect(got?.content).toContain('WEBVTT');
    expect(got?.language).toBe('en');
  });

  it('getCaptions returns null when absent', async () => {
    const repo = await buildRepo(createFakeFirestore());
    expect(await repo.getCaptions('nope' as VideoId)).toBeNull();
  });

  it('getCaptionsMeta omits the content body', async () => {
    const fake = createFakeFirestore({ 'videoCaptions/v1': makeCaptions() });
    const repo = await buildRepo(fake);
    const meta = await repo.getCaptionsMeta('v1' as VideoId);
    expect(meta).toEqual({ language: 'en', label: 'English', updatedAt: SEED_DATE });
  });

  it('deleteCaptions removes the doc and is idempotent', async () => {
    const fake = createFakeFirestore({ 'videoCaptions/v1': makeCaptions() });
    const repo = await buildRepo(fake);
    await repo.deleteCaptions('v1' as VideoId);
    expect(await repo.getCaptions('v1' as VideoId)).toBeNull();
    await expect(repo.deleteCaptions('v1' as VideoId)).resolves.toBeUndefined();
  });

  it('deleteVideoAndDetach also removes the captions doc', async () => {
    const fake = createFakeFirestore({
      'videos/v1': makeVideo(),
      [LESSON_PATH]: lessonDoc({ videoId: 'v1' }),
      'videoCaptions/v1': makeCaptions(),
    });
    const repo = await buildRepo(fake);
    await repo.deleteVideoAndDetach('v1' as VideoId, 'l1' as LessonId, NOW_ISO);
    expect(await repo.getCaptions('v1' as VideoId)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test api-courses --skip-nx-cache -- video/video.repository.spec.ts`
Expected: FAIL (`upsertCaptions is not a function`).

- [ ] **Step 3: Implement the repository methods**

In `video.repository.ts`, add `VideoCaptions`/`VideoCaptionsMeta` to the type import from `@learnwren/shared-data-models`, then add a ref helper and the methods:

```ts
  private videoCaptionsRef(vid: VideoId) {
    return this.db.collection('videoCaptions').doc(vid);
  }

  async getCaptions(vid: VideoId): Promise<VideoCaptions | null> {
    const snap = await this.videoCaptionsRef(vid).get();
    return snap.exists ? (snap.data() as VideoCaptions) : null;
  }

  async getCaptionsMeta(vid: VideoId): Promise<VideoCaptionsMeta | null> {
    const captions = await this.getCaptions(vid);
    if (!captions) return null;
    return { language: captions.language, label: captions.label, updatedAt: captions.updatedAt };
  }

  async upsertCaptions(captions: VideoCaptions): Promise<void> {
    await this.videoCaptionsRef(captions.videoId).set(captions);
  }

  async deleteCaptions(vid: VideoId): Promise<void> {
    await this.videoCaptionsRef(vid).delete();
  }
```

In `deleteVideoAndDetach`, add the captions delete inside the existing transaction (alongside `tx.delete(videoRef)`):

```ts
      tx.delete(videoRef);
      tx.delete(this.videoCaptionsRef(vid)); // no-op if absent
      if (!keySnap.empty) tx.delete(keySnap.docs[0]!.ref);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test api-courses --skip-nx-cache -- video/video.repository.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/video/video.repository.ts libs/api-courses/src/lib/video/video.repository.spec.ts
git commit -m "feat(api-courses): VideoRepository caption read/write + delete cleanup"
```

---

### Task 5: CaptionsService

**Files:**
- Create: `libs/api-courses/src/lib/video/captions/captions.service.ts`
- Test: `libs/api-courses/src/lib/video/captions/captions.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `captions.service.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import type { VideoCaptions, VideoId } from '@learnwren/shared-data-models';

import {
  CaptionTooLargeException,
  InvalidCaptionFileException,
} from '../errors/video.exception';
import { CaptionsService } from './captions.service';

function makeRepo(existing: VideoCaptions | null = null) {
  return {
    getCaptions: vi.fn().mockResolvedValue(existing),
    getCaptionsMeta: vi.fn().mockResolvedValue(
      existing ? { language: existing.language, label: existing.label, updatedAt: existing.updatedAt } : null,
    ),
    upsertCaptions: vi.fn().mockResolvedValue(undefined),
    deleteCaptions: vi.fn().mockResolvedValue(undefined),
  };
}

const VALID = Buffer.from('WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nHi\n', 'utf-8');
const VID = 'v1' as VideoId;

describe('CaptionsService', () => {
  it('stores valid WebVTT and returns metadata', async () => {
    const repo = makeRepo();
    const svc = new CaptionsService(repo as never);
    const meta = await svc.put(VID, VALID);
    expect(meta.language).toBe('en');
    expect(meta.label).toBe('English');
    expect(repo.upsertCaptions).toHaveBeenCalledWith(
      expect.objectContaining({ videoId: VID, format: 'vtt', content: VALID.toString('utf-8') }),
    );
  });

  it('preserves the original createdAt on replace', async () => {
    const existing = {
      videoId: VID, language: 'en', label: 'English', format: 'vtt',
      content: 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nold\n',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    } as VideoCaptions;
    const repo = makeRepo(existing);
    const svc = new CaptionsService(repo as never);
    await svc.put(VID, VALID);
    expect(repo.upsertCaptions).toHaveBeenCalledWith(
      expect.objectContaining({ createdAt: '2026-01-01T00:00:00.000Z' }),
    );
  });

  it('rejects a non-WebVTT body', async () => {
    const svc = new CaptionsService(makeRepo() as never);
    await expect(svc.put(VID, Buffer.from('not vtt', 'utf-8'))).rejects.toBeInstanceOf(
      InvalidCaptionFileException,
    );
  });

  it('rejects a body over 256 KB', async () => {
    const svc = new CaptionsService(makeRepo() as never);
    const big = Buffer.concat([VALID, Buffer.alloc(256_001)]);
    await expect(svc.put(VID, big)).rejects.toBeInstanceOf(CaptionTooLargeException);
  });

  it('getForDelivery returns the stored captions', async () => {
    const existing = { videoId: VID, content: 'WEBVTT\n', language: 'en', label: 'English', format: 'vtt', createdAt: 'x', updatedAt: 'x' } as VideoCaptions;
    const svc = new CaptionsService(makeRepo(existing) as never);
    expect(await svc.getForDelivery(VID)).toBe(existing);
  });

  it('remove delegates to the repo', async () => {
    const repo = makeRepo();
    await new CaptionsService(repo as never).remove(VID);
    expect(repo.deleteCaptions).toHaveBeenCalledWith(VID);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test api-courses --skip-nx-cache -- video/captions/captions.service.spec.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the service**

Create `captions.service.ts`:

```ts
import { Injectable } from '@nestjs/common';

import type {
  ISODateString,
  VideoCaptions,
  VideoCaptionsMeta,
  VideoId,
} from '@learnwren/shared-data-models';

import {
  CaptionTooLargeException,
  InvalidCaptionFileException,
} from '../errors/video.exception';
import { VideoRepository } from '../video.repository';
import { isValidWebVtt } from './webvtt.validator';

const MAX_CAPTION_BYTES = 256_000;
const DEFAULT_LANGUAGE = 'en';
const DEFAULT_LABEL = 'English';

@Injectable()
export class CaptionsService {
  constructor(private readonly repo: VideoRepository) {}

  async put(videoId: VideoId, body: Buffer): Promise<VideoCaptionsMeta> {
    if (body.length > MAX_CAPTION_BYTES) throw new CaptionTooLargeException();
    const text = body.toString('utf-8');
    if (!isValidWebVtt(text)) throw new InvalidCaptionFileException();

    const now = new Date().toISOString() as ISODateString;
    const existing = await this.repo.getCaptions(videoId);
    const captions: VideoCaptions = {
      videoId,
      language: DEFAULT_LANGUAGE,
      label: DEFAULT_LABEL,
      format: 'vtt',
      content: text,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await this.repo.upsertCaptions(captions);
    return { language: captions.language, label: captions.label, updatedAt: captions.updatedAt };
  }

  getMeta(videoId: VideoId): Promise<VideoCaptionsMeta | null> {
    return this.repo.getCaptionsMeta(videoId);
  }

  getForDelivery(videoId: VideoId): Promise<VideoCaptions | null> {
    return this.repo.getCaptions(videoId);
  }

  async remove(videoId: VideoId): Promise<void> {
    await this.repo.deleteCaptions(videoId);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test api-courses --skip-nx-cache -- video/captions/captions.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/video/captions/captions.service.ts libs/api-courses/src/lib/video/captions/captions.service.spec.ts
git commit -m "feat(api-courses): CaptionsService (validate, upsert, delete, deliver)"
```

---

### Task 6: CaptionsController (owner PUT/GET/DELETE) + module registration

**Files:**
- Create: `libs/api-courses/src/lib/video/captions/captions.controller.ts`
- Modify: `libs/api-courses/src/lib/video/video.module.ts`
- Test: `libs/api-courses/src/lib/video/captions/captions.controller.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `captions.controller.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import type { Video, VideoId } from '@learnwren/shared-data-models';

import { InvalidCaptionFileException } from '../errors/video.exception';
import { CaptionsController } from './captions.controller';

const VIDEO = { id: 'v1' as VideoId } as Video;

function makeSvc() {
  return {
    put: vi.fn().mockResolvedValue({ language: 'en', label: 'English', updatedAt: 'now' }),
    getMeta: vi.fn().mockResolvedValue(null),
    remove: vi.fn().mockResolvedValue(undefined),
  };
}

describe('CaptionsController', () => {
  it('upload passes the file buffer to the service', async () => {
    const svc = makeSvc();
    const ctrl = new CaptionsController(svc as never);
    const file = { buffer: Buffer.from('WEBVTT\n') } as Express.Multer.File;
    const meta = await ctrl.upload(file, VIDEO);
    expect(svc.put).toHaveBeenCalledWith('v1', file.buffer);
    expect(meta.label).toBe('English');
  });

  it('upload with no file throws InvalidCaptionFileException', async () => {
    const ctrl = new CaptionsController(makeSvc() as never);
    await expect(
      ctrl.upload(undefined as unknown as Express.Multer.File, VIDEO),
    ).rejects.toBeInstanceOf(InvalidCaptionFileException);
  });

  it('meta returns the service metadata', async () => {
    const svc = makeSvc();
    await new CaptionsController(svc as never).meta(VIDEO);
    expect(svc.getMeta).toHaveBeenCalledWith('v1');
  });

  it('remove delegates to the service', async () => {
    const svc = makeSvc();
    await new CaptionsController(svc as never).remove(VIDEO);
    expect(svc.remove).toHaveBeenCalledWith('v1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test api-courses --skip-nx-cache -- video/captions/captions.controller.spec.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the controller**

Create `captions.controller.ts`:

```ts
import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Put,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { FirebaseSessionGuard, InstructorRoleGuard } from '@learnwren/api-auth';
import type { Video, VideoCaptionsMeta } from '@learnwren/shared-data-models';

import { InvalidCaptionFileException } from '../errors/video.exception';
import { CurrentVideo } from '../playback/current-video.decorator';
import { VideoExceptionFilter } from '../video.exception-filter';
import { VideoOwnerGuard } from '../video-owner.guard';
import { CaptionsService } from './captions.service';

// Hard transport cap; the 256 KB business rule (→ CAPTION_TOO_LARGE 400) lives
// in CaptionsService. Anything between 256 KB and 1 MB yields a clean 400; the
// interceptor only rejects pathological payloads.
const MAX_UPLOAD_BYTES = 1_000_000;

@Controller()
@UseFilters(VideoExceptionFilter)
@UseGuards(FirebaseSessionGuard, InstructorRoleGuard)
export class CaptionsController {
  constructor(private readonly svc: CaptionsService) {}

  @Put('videos/:vid/captions')
  @UseGuards(VideoOwnerGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentVideo() video: Video,
  ): Promise<VideoCaptionsMeta> {
    if (!file) throw new InvalidCaptionFileException();
    return this.svc.put(video.id, file.buffer);
  }

  @Get('videos/:vid/captions')
  @UseGuards(VideoOwnerGuard)
  meta(@CurrentVideo() video: Video): Promise<VideoCaptionsMeta | null> {
    return this.svc.getMeta(video.id);
  }

  @Delete('videos/:vid/captions')
  @UseGuards(VideoOwnerGuard)
  @HttpCode(204)
  async remove(@CurrentVideo() video: Video): Promise<void> {
    await this.svc.remove(video.id);
  }
}
```

- [ ] **Step 4: Run controller test to verify it passes**

Run: `pnpm nx test api-courses --skip-nx-cache -- video/captions/captions.controller.spec.ts`
Expected: PASS

- [ ] **Step 5: Register in `video.module.ts`**

Add imports near the other captions/video imports:

```ts
import { CaptionsController } from './captions/captions.controller';
import { CaptionsService } from './captions/captions.service';
```

Add `CaptionsController` to the `controllers` array (e.g. after `VideoController`), and `CaptionsService` to the `providers` array.

- [ ] **Step 6: Build the whole api to verify DI wiring**

Run: `pnpm nx build api --skip-nx-cache`
Expected: PASS (no missing-provider errors).

- [ ] **Step 7: Commit**

```bash
git add libs/api-courses/src/lib/video/captions/captions.controller.ts libs/api-courses/src/lib/video/captions/captions.controller.spec.ts libs/api-courses/src/lib/video/video.module.ts
git commit -m "feat(api-courses): CaptionsController + module registration"
```

---

### Task 7: Playback delivery endpoint (`GET /playback/captions/:vid`)

**Files:**
- Modify: `libs/api-courses/src/lib/video/playback/playback.controller.ts`
- Test: `libs/api-courses/src/lib/video/playback/playback.controller.spec.ts`

- [ ] **Step 1: Write the failing test**

Add to `playback.controller.spec.ts` (it already constructs a `PlaybackController` with mock `ManifestService`/`KeyService` — extend the construction to pass a mock `CaptionsService`, and add a `makeRes()` helper if the file doesn't have one):

```ts
import { CaptionsNotFoundException } from '../errors/video.exception';

describe('PlaybackController — captions', () => {
  function makeRes() {
    const headers: Record<string, string> = {};
    return {
      setHeader: vi.fn((k: string, v: string) => { headers[k] = v; }),
      send: vi.fn(),
      headers,
    } as never;
  }

  it('streams text/vtt with the stored content', async () => {
    const captionsSvc = { getForDelivery: vi.fn().mockResolvedValue({ content: 'WEBVTT\nhi' }) };
    const ctrl = new PlaybackController({} as never, {} as never, captionsSvc as never);
    const res = makeRes();
    await ctrl.captions({ id: 'v1' } as never, res);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/vtt; charset=utf-8');
    expect(res.send).toHaveBeenCalledWith('WEBVTT\nhi');
  });

  it('throws CaptionsNotFoundException when none exist', async () => {
    const captionsSvc = { getForDelivery: vi.fn().mockResolvedValue(null) };
    const ctrl = new PlaybackController({} as never, {} as never, captionsSvc as never);
    await expect(ctrl.captions({ id: 'v1' } as never, makeRes())).rejects.toBeInstanceOf(
      CaptionsNotFoundException,
    );
  });
});
```

(Match the existing `PlaybackController` constructor arg order in the spec; CaptionsService is the new **third** argument.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test api-courses --skip-nx-cache -- video/playback/playback.controller.spec.ts`
Expected: FAIL (3rd constructor arg / `captions` method undefined).

- [ ] **Step 3: Implement the endpoint**

In `playback.controller.ts`: import `CaptionsService` and `CaptionsNotFoundException`, add `CaptionsService` as a third constructor param, and add the route:

```ts
import { CaptionsNotFoundException, RenditionNotFoundException } from '../errors/video.exception';
import { CaptionsService } from '../captions/captions.service';
// ...
  constructor(
    private readonly manifest: ManifestService,
    private readonly keys: KeyService,
    private readonly captionsSvc: CaptionsService,
  ) {}

  @Get('captions/:vid')
  async captions(@CurrentVideo() video: Video, @Res() res: Response): Promise<void> {
    const captions = await this.captionsSvc.getForDelivery(video.id);
    if (!captions) throw new CaptionsNotFoundException();
    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(captions.content);
  }
```

(`CaptionsService` is already a provider in `VideoModule` from Task 6, and `PlaybackController` is in the same module, so DI resolves it.)

- [ ] **Step 4: Run test + build to verify it passes**

Run: `pnpm nx test api-courses --skip-nx-cache -- video/playback/playback.controller.spec.ts`
Expected: PASS
Run: `pnpm nx build api --skip-nx-cache`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/video/playback/playback.controller.ts libs/api-courses/src/lib/video/playback/playback.controller.spec.ts
git commit -m "feat(api-courses): gated GET /playback/captions/:vid delivery"
```

---

### Task 8: LearnService projects captions into LessonView

**Files:**
- Modify: `libs/api-courses/src/lib/learn/learn.service.ts`
- Test: `libs/api-courses/src/lib/learn/learn.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Add to `learn.service.spec.ts` (reuse the file's existing mock-repo setup for `VideoRepository`; ensure the videos mock has `getCaptionsMeta`). Add a focused test:

```ts
it('projects caption metadata when the video has captions', async () => {
  // Arrange: a lesson with videoId, videos.getVideo → READY,
  // videos.getCaptionsMeta → { language: 'en', label: 'English', updatedAt: '...' }
  // (follow the existing arrange pattern in this file for course/lesson/enrolment).
  videos.getCaptionsMeta.mockResolvedValue({ language: 'en', label: 'English', updatedAt: SOME_ISO });

  const view = await service.getLessonView(userId, course, lessonWithVideo);

  expect(view.lesson.captions).toEqual({ language: 'en', label: 'English' });
});

it('captions is null when the video has none', async () => {
  videos.getCaptionsMeta.mockResolvedValue(null);
  const view = await service.getLessonView(userId, course, lessonWithVideo);
  expect(view.lesson.captions).toBeNull();
});
```

Also update the file's `VideoRepository` mock factory to include `getCaptionsMeta: vi.fn().mockResolvedValue(null)` so existing tests keep passing.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test api-courses --skip-nx-cache -- learn/learn.service.spec.ts`
Expected: FAIL (`captions` is `undefined`, not `null`/object).

- [ ] **Step 3: Implement the projection**

In `learn.service.ts`, inside `getLessonView`, after the `videoState` block, add:

```ts
    let captions: LessonView['lesson']['captions'] = null;
    if (lesson.videoId) {
      const meta = await this.videos.getCaptionsMeta(lesson.videoId);
      captions = meta ? { language: meta.language, label: meta.label } : null;
    }
```

Then add `captions,` to the returned `lesson` object (after `videoState`):

```ts
      lesson: {
        id: lesson.id,
        moduleId: lesson.moduleId,
        title: lesson.title,
        description: lesson.description,
        videoId: lesson.videoId ?? null,
        videoState,
        captions,
      },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test api-courses --skip-nx-cache -- learn/learn.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/learn/learn.service.ts libs/api-courses/src/lib/learn/learn.service.spec.ts
git commit -m "feat(api-courses): project caption metadata into LessonView"
```

---

### Task 9: Player renders a `<track>`

**Files:**
- Modify: `libs/web-video/src/lib/player/video-player.component.ts`
- Modify: `libs/web-video/src/lib/player/video-player.component.html`
- Test: `libs/web-video/src/lib/player/video-player.component.spec.ts`

- [ ] **Step 1: Write the failing test**

Add to `video-player.component.spec.ts` (follow the file's existing TestBed setup; set the required `videoId` input as the existing tests do):

```ts
it('renders a <track> when captions are provided', () => {
  fixture.componentRef.setInput('videoId', 'v1');
  fixture.componentRef.setInput('captions', {
    src: '/api/playback/captions/v1', srclang: 'en', label: 'English',
  });
  fixture.detectChanges();
  const track = fixture.nativeElement.querySelector('track');
  expect(track).not.toBeNull();
  expect(track.getAttribute('src')).toBe('/api/playback/captions/v1');
  expect(track.getAttribute('srclang')).toBe('en');
  expect(track.getAttribute('label')).toBe('English');
  expect(track.getAttribute('kind')).toBe('subtitles');
});

it('renders no <track> when captions are null', () => {
  fixture.componentRef.setInput('videoId', 'v1');
  fixture.componentRef.setInput('captions', null);
  fixture.detectChanges();
  expect(fixture.nativeElement.querySelector('track')).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test web-video --skip-nx-cache -- player/video-player.component.spec.ts`
Expected: FAIL (`captions` is not an input; no `<track>`).

- [ ] **Step 3: Add the input**

In `video-player.component.ts`, add the input next to `videoId`:

```ts
  readonly captions = input<{ src: string; srclang: string; label: string } | null>(null);
```

- [ ] **Step 4: Render the track**

In `video-player.component.html`, place a `<track>` as a child of `<video>` (the `<video>` already carries `crossorigin="use-credentials"`, so the track fetch sends the session cookie):

```html
  <video
    #playerEl
    controls
    preload="metadata"
    crossorigin="use-credentials"
    class="block w-full"
    data-testid="video-player"
  >
    @if (captions(); as c) {
      <track kind="subtitles" [src]="c.src" [srclang]="c.srclang" [label]="c.label" />
    }
  </video>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm nx test web-video --skip-nx-cache -- player/video-player.component.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add libs/web-video/src/lib/player/video-player.component.ts libs/web-video/src/lib/player/video-player.component.html libs/web-video/src/lib/player/video-player.component.spec.ts
git commit -m "feat(web-video): optional <track> caption input on the player"
```

---

### Task 10: Learn page passes captions to the player

**Files:**
- Modify: `libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.ts`
- Modify: `libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.html`
- Test: `libs/web-learn/src/lib/lesson-player-page/lesson-player-page.component.spec.ts`

- [ ] **Step 1: Write the failing test**

Add to `lesson-player-page.component.spec.ts` (follow the file's existing harness for stubbing `LearnService.getLessonView` and reaching the READY state). Add:

```ts
it('computes a captions track when the view has captions', () => {
  component.view.set({
    ...baseView,
    lesson: { ...baseView.lesson, videoId: 'v1', videoState: 'READY', captions: { language: 'en', label: 'English' } },
  } as never);
  expect(component.captionsTrack()).toEqual({
    src: '/api/playback/captions/v1', srclang: 'en', label: 'English',
  });
});

it('captionsTrack is null when the view has no captions', () => {
  component.view.set({
    ...baseView,
    lesson: { ...baseView.lesson, videoId: 'v1', videoState: 'READY', captions: null },
  } as never);
  expect(component.captionsTrack()).toBeNull();
});
```

(If the spec file has no shared `baseView`, build a minimal `LessonView` inline including `captions: null`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test web-learn --skip-nx-cache -- lesson-player-page/lesson-player-page.component.spec.ts`
Expected: FAIL (`captionsTrack` is not a function).

- [ ] **Step 3: Add the computed**

In `lesson-player-page.component.ts`, add after the other `computed`s:

```ts
  readonly captionsTrack = computed<{ src: string; srclang: string; label: string } | null>(() => {
    const l = this.view()?.lesson;
    if (!l?.videoId || !l.captions) return null;
    return { src: `/api/playback/captions/${l.videoId}`, srclang: l.captions.language, label: l.captions.label };
  });
```

- [ ] **Step 4: Bind it in the template**

In `lesson-player-page.component.html`, add the `[captions]` input to the player:

```html
            <lib-video-player
              [videoId]="vid"
              [captions]="captionsTrack()"
              (metadata)="onMetadata()"
              (played)="onPlayed()"
              (paused)="onPaused()"
              (videoEnded)="onEnded()" />
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm nx test web-learn --skip-nx-cache -- lesson-player-page/lesson-player-page.component.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add libs/web-learn/src/lib/lesson-player-page/
git commit -m "feat(web-learn): pass caption track to the lesson player"
```

---

### Task 11: Instructor captions panel in the lesson editor

**Files:**
- Create: `libs/web-courses/src/lib/captions/captions.service.ts`
- Create: `libs/web-courses/src/lib/captions/captions-panel.component.ts`
- Create: `libs/web-courses/src/lib/captions/captions-panel.component.html`
- Modify: `libs/web-courses/src/lib/components/lesson-item/lesson-item.component.ts`
- Modify: `libs/web-courses/src/lib/components/lesson-item/lesson-item.component.html`
- Test: `libs/web-courses/src/lib/captions/captions.service.spec.ts`
- Test: `libs/web-courses/src/lib/captions/captions-panel.component.spec.ts`

- [ ] **Step 1: Write the failing service test**

Create `captions.service.spec.ts`:

```ts
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import type { VideoId } from '@learnwren/shared-data-models';

import { CaptionsService } from './captions.service';

describe('CaptionsService (web-courses)', () => {
  let svc: CaptionsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CaptionsService, provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(CaptionsService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('uploads via PUT multipart', async () => {
    const p = svc.upload('v1' as VideoId, new File(['WEBVTT'], 'c.vtt', { type: 'text/vtt' }));
    const req = http.expectOne('/api/videos/v1/captions');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body instanceof FormData).toBe(true);
    req.flush({ language: 'en', label: 'English', updatedAt: 'now' });
    expect((await p).label).toBe('English');
  });

  it('reads metadata via GET', async () => {
    const p = svc.getMeta('v1' as VideoId);
    http.expectOne('/api/videos/v1/captions').flush(null);
    expect(await p).toBeNull();
  });

  it('removes via DELETE', async () => {
    const p = svc.remove('v1' as VideoId);
    const req = http.expectOne('/api/videos/v1/captions');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
    await p;
  });

  it('validateLocally rejects non-vtt and oversized files', () => {
    expect(svc.validateLocally(new File(['x'], 'a.txt', { type: 'text/plain' })).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm nx test web-courses --skip-nx-cache -- captions/captions.service.spec.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the service**

Create `captions.service.ts`:

```ts
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { VideoCaptionsMeta, VideoId } from '@learnwren/shared-data-models';

const MAX_BYTES = 256_000;

export type LocalValidation = { ok: true } | { ok: false; reason: string };

@Injectable({ providedIn: 'root' })
export class CaptionsService {
  private readonly http = inject(HttpClient);

  validateLocally(file: File): LocalValidation {
    if (!/\.vtt$/i.test(file.name) && file.type !== 'text/vtt') {
      return { ok: false, reason: 'Captions must be a WebVTT (.vtt) file.' };
    }
    if (file.size > MAX_BYTES) {
      return { ok: false, reason: 'Caption file exceeds the 256 KB limit.' };
    }
    return { ok: true };
  }

  getMeta(vid: VideoId): Promise<VideoCaptionsMeta | null> {
    return firstValueFrom(
      this.http.get<VideoCaptionsMeta | null>(`/api/videos/${vid}/captions`, { withCredentials: true }),
    );
  }

  upload(vid: VideoId, file: File): Promise<VideoCaptionsMeta> {
    const form = new FormData();
    form.append('file', file, file.name);
    return firstValueFrom(
      this.http.put<VideoCaptionsMeta>(`/api/videos/${vid}/captions`, form, { withCredentials: true }),
    );
  }

  async remove(vid: VideoId): Promise<void> {
    await firstValueFrom(
      this.http.delete<void>(`/api/videos/${vid}/captions`, { withCredentials: true }),
    );
  }
}
```

- [ ] **Step 4: Run to verify the service test passes**

Run: `pnpm nx test web-courses --skip-nx-cache -- captions/captions.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Write the failing component test**

Create `captions-panel.component.spec.ts`:

```ts
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach, vi } from 'vitest';

import type { VideoId } from '@learnwren/shared-data-models';

import { CaptionsPanelComponent } from './captions-panel.component';
import { CaptionsService } from './captions.service';

describe('CaptionsPanelComponent', () => {
  let fixture: ComponentFixture<CaptionsPanelComponent>;
  let svc: { getMeta: ReturnType<typeof vi.fn>; upload: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn>; validateLocally: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    svc = {
      getMeta: vi.fn().mockResolvedValue(null),
      upload: vi.fn().mockResolvedValue({ language: 'en', label: 'English', updatedAt: 'now' }),
      remove: vi.fn().mockResolvedValue(undefined),
      validateLocally: vi.fn().mockReturnValue({ ok: true }),
    };
    await TestBed.configureTestingModule({
      imports: [CaptionsPanelComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: CaptionsService, useValue: svc }],
    }).compileComponents();
    fixture = TestBed.createComponent(CaptionsPanelComponent);
    fixture.componentRef.setInput('videoId', 'v1' as VideoId);
  });

  it('shows the "add captions" affordance when none exist', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="captions-add"]')).not.toBeNull();
  });

  it('shows present state after a successful upload', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    await component(fixture).onFileChosen(new File(['WEBVTT'], 'c.vtt', { type: 'text/vtt' }));
    fixture.detectChanges();
    expect(svc.upload).toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[data-testid="captions-present"]')).not.toBeNull();
  });

  it('surfaces a local validation error without calling the API', async () => {
    svc.validateLocally.mockReturnValue({ ok: false, reason: 'bad' });
    fixture.detectChanges();
    await component(fixture).onFileChosen(new File(['x'], 'a.txt', { type: 'text/plain' }));
    fixture.detectChanges();
    expect(svc.upload).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[data-testid="captions-error"]')).not.toBeNull();
  });
});

function component(f: ComponentFixture<CaptionsPanelComponent>): CaptionsPanelComponent {
  return f.componentInstance;
}
```

- [ ] **Step 6: Run to verify the component test fails**

Run: `pnpm nx test web-courses --skip-nx-cache -- captions/captions-panel.component.spec.ts`
Expected: FAIL (module not found).

- [ ] **Step 7: Implement the component**

Create `captions-panel.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';

import type { VideoCaptionsMeta, VideoId } from '@learnwren/shared-data-models';
import { LwButtonDirective } from '@learnwren/web-ui';

import { CaptionsService } from './captions.service';

@Component({
  selector: 'lib-captions-panel',
  standalone: true,
  imports: [LwButtonDirective],
  templateUrl: './captions-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaptionsPanelComponent implements OnInit {
  private readonly svc = inject(CaptionsService);

  readonly videoId = input.required<VideoId>();

  readonly meta = signal<VideoCaptionsMeta | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      this.meta.set(await this.svc.getMeta(this.videoId()));
    } catch {
      // Non-fatal: leave meta null; the add affordance still works.
    }
  }

  async onFileChosen(file: File): Promise<void> {
    this.error.set(null);
    const check = this.svc.validateLocally(file);
    if (!check.ok) {
      this.error.set(check.reason);
      return;
    }
    this.busy.set(true);
    try {
      this.meta.set(await this.svc.upload(this.videoId(), file));
    } catch {
      this.error.set('Upload failed. Try again.');
    } finally {
      this.busy.set(false);
    }
  }

  async onRemove(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.svc.remove(this.videoId());
      this.meta.set(null);
    } catch {
      this.error.set('Remove failed. Try again.');
    } finally {
      this.busy.set(false);
    }
  }

  onInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) void this.onFileChosen(file);
    input.value = '';
  }
}
```

Create `captions-panel.component.html`:

```html
<div class="rounded border border-line p-3" data-testid="captions-panel">
  @if (meta(); as m) {
    <div data-testid="captions-present" class="flex flex-wrap items-center gap-3">
      <span class="text-sm text-ink">Captions: {{ m.label }}</span>
      <label lwButton variant="ghost" class="cursor-pointer">
        Replace
        <input type="file" accept=".vtt,text/vtt" class="hidden" (change)="onInputChange($event)" [disabled]="busy()" />
      </label>
      <button lwButton variant="ghost" type="button" class="text-bad" [disabled]="busy()" (click)="onRemove()" data-testid="captions-remove">
        Remove
      </button>
    </div>
  } @else {
    <label lwButton class="cursor-pointer" data-testid="captions-add">
      Add captions (.vtt)
      <input type="file" accept=".vtt,text/vtt" class="hidden" (change)="onInputChange($event)" [disabled]="busy()" />
    </label>
  }
  @if (error(); as e) {
    <p data-testid="captions-error" class="mt-2 text-sm text-bad">{{ e }}</p>
  }
</div>
```

- [ ] **Step 8: Run to verify the component test passes**

Run: `pnpm nx test web-courses --skip-nx-cache -- captions/captions-panel.component.spec.ts`
Expected: PASS

- [ ] **Step 9: Mount the panel in `lesson-item`**

In `lesson-item.component.ts`, import the panel and add it to `imports`:

```ts
import { CaptionsPanelComponent } from '../../captions/captions-panel.component';
// ...
  imports: [FormsModule, VideoUploadComponent, VideoStateBadgeComponent, VideoPlayerComponent, MaterialsListComponent, CaptionsPanelComponent, LwButtonDirective, LwInputDirective],
```

In `lesson-item.component.html`, inside the `@if (lesson().videoId)` block, after the `@if (video(); as v) { … }` group, add the panel (a video record exists, so captions can be attached):

```html
    @if (lesson().videoId) {
      @if (video(); as v) {
        @if (v.state === 'READY') {
          <lib-video-player [videoId]="v.id" />
        } @else {
          <lib-video-state-badge [video]="v" (stateChanged)="onVideoStateChanged($event)" />
        }
      }
      <lib-captions-panel [videoId]="lesson().videoId!" />
    } @else {
```

- [ ] **Step 10: Run the lesson-item test + build web**

Run: `pnpm nx test web-courses --skip-nx-cache -- components/lesson-item/lesson-item.component.spec.ts`
Expected: PASS (if the existing spec renders `lib-captions-panel`, the `CaptionsService` HTTP call must be satisfied — provide `provideHttpClient()/provideHttpClientTesting()` in that spec's TestBed if not already present, and flush/ignore the `GET /api/videos/:vid/captions` request).
Run: `pnpm nx build web --skip-nx-cache`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add libs/web-courses/src/lib/captions/ libs/web-courses/src/lib/components/lesson-item/
git commit -m "feat(web-courses): instructor captions panel in the lesson editor"
```

---

### Task 12: api-e2e end-to-end caption flow

**Files:**
- Create: `apps/api-e2e/src/api/captions.spec.ts` (mirror the structure/helpers of the existing video/playback e2e spec in `apps/api-e2e/src/api/`)

- [ ] **Step 1: Write the e2e spec**

Locate the existing video/playback e2e spec and reuse its harness (instructor login, course/module/lesson creation, fake video upload + fake-transcoder READY transition, enrolment, publish). Then assert this sequence (a `.vtt` fixture string `WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nHello\n`):

```
PUT  /api/videos/:vid/captions            (owner, multipart .vtt)            → 200 { language:'en', label:'English', updatedAt }
GET  /api/videos/:vid/captions            (owner)                            → 200 { language:'en', label:'English', updatedAt }
GET  /api/playback/captions/:vid          (owner)                            → 200, content-type text/vtt, body contains 'WEBVTT'
PUT  /api/videos/:vid/captions            (owner, body 'not vtt')            → 400 INVALID_CAPTION_FILE
GET  /api/learn/courses/:cid/lessons/:lid (enrolled student)                → 200, lesson.captions = { language:'en', label:'English' }
GET  /api/playback/captions/:vid          (enrolled student, course PUBLISHED) → 200 body contains 'WEBVTT'
GET  /api/playback/captions/:vid          (a different, non-enrolled user)  → 403
DELETE /api/videos/:vid/captions          (owner)                            → 204
GET  /api/playback/captions/:vid          (owner)                            → 404 CAPTIONS_NOT_FOUND
GET  /api/videos/:vid/captions            (owner)                            → 200 null
```

Use the existing helper that performs multipart uploads if present (the cover/materials e2e specs upload files); otherwise post a `Buffer` with `Content-Type: multipart/form-data` via the project's request helper. Keep the assertions on status codes and the bodies/headers listed above.

- [ ] **Step 2: Run the e2e suite against the emulators**

Run: `pnpm exec firebase emulators:exec --project demo-learnwren 'pnpm nx e2e api-e2e'`
Expected: PASS (the new spec green alongside the existing suite).

- [ ] **Step 3: Commit**

```bash
git add apps/api-e2e/src/api/captions.spec.ts
git commit -m "test(api-e2e): end-to-end caption upload, delivery, access, delete"
```

---

### Task 13: Documentation + implementation summary

**Files:**
- Modify: `README.md` (video/playback API tables + feature list)
- Modify: `docs/USER_GUIDE.md` (instructor upload + student playback; add `VideoCaptions` to the data-models reference)
- Create: `docs/superpowers/summaries/2026-05-30-lesson-captions-summary.md`

- [ ] **Step 1: Update the README**

In the EP-03 API section, add the three endpoints:

```
| `PUT`    | `/api/videos/:vid/captions`        | Upload/replace the lesson's WebVTT caption track (owner; ≤ 256 KB). |
| `DELETE` | `/api/videos/:vid/captions`        | Remove the caption track (owner). |
| `GET`    | `/api/videos/:vid/captions`        | Caption metadata `{ language, label, updatedAt } | null` (owner). |
| `GET`    | `/api/playback/captions/:vid`      | Stream the caption `.vtt` (owner or enrolled student on a PUBLISHED course). |
```

In the feature list, note captions under EP-03/EP-09: "Closed captions — instructors attach one WebVTT track per lesson; students toggle it via the player's native CC button (advances EP-09 US-09-03 accessibility)."

- [ ] **Step 2: Update USER_GUIDE.md**

Add an instructor "Add captions" subsection (lesson editor → Captions panel → upload `.vtt`) and a student note (CC button in the player). Add `VideoCaptions` to the data-models reference table.

- [ ] **Step 3: Write the implementation summary**

Create `docs/superpowers/summaries/2026-05-30-lesson-captions-summary.md` capturing: what shipped, divergences from the spec (captions errors as `VideoException` subclasses; owner metadata via `GET /api/videos/:vid/captions`), how it was verified (unit + api-e2e), and deferred items (multi-language picker, SRT, HLS-embedded subtitles, custom caption styling).

- [ ] **Step 4: Commit**

```bash
git add README.md docs/USER_GUIDE.md docs/superpowers/summaries/2026-05-30-lesson-captions-summary.md
git commit -m "docs: lesson captions endpoints, user guide, summary"
```

---

### Task 14: Final verification

- [ ] **Step 1: Run affected lint + test + typecheck + build**

Run: `pnpm nx affected -t lint test typecheck build --base=main --skip-nx-cache`
Expected: PASS across `shared-data-models`, `api-courses`, `api`, `web-video`, `web-learn`, `web-courses`, `web`.

- [ ] **Step 2: (Optional) mutation spot-check on the new api code**

Run: `pnpm exec stryker run stryker.api-courses.config.mjs`
Expected: adjusted score ≥ 80% (new caption files glob in automatically). Address surviving mutants on `webvtt.validator.ts` / `captions.service.ts` if any.

- [ ] **Step 3: Manual smoke (emulator)**

With `pnpm emulators` + `pnpm start`: as an instructor, upload a `.vtt` on a lesson with a READY video; as an enrolled student, open the lesson and confirm the browser CC button appears and shows the cues. Confirm the `<track>` coexists with hls.js MSE playback (Chrome) and native HLS (Safari).

---

## Notes on coverage & decisions

- **Spec coverage:** data model (T1), exceptions (T2), validation (T3), repo + cleanup (T4), service (T5), management controller (T6), gated delivery (T7), LessonView projection (T8), player track (T9), learn wiring (T10), editor surface (T11), e2e (T12), docs (T13).
- **hls.js + `<track>`:** browser text tracks are managed outside MSE, so the native `<track>` coexists with hls.js. T14 Step 3 verifies this in a real browser; if hls.js (config `renderTextTracksNatively`, default true) ever strips the element, fall back to adding the `TextTrack` via the player service after `attachMedia` — out of scope unless the smoke test fails.
- **Language fixed to English** this slice (`en`/"English"); the `language`/`label` fields exist so a later multi-language slice adds a picker with no migration.

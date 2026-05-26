# Cover Image Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship UC-02-01 cover image upload — an instructor can upload/replace/remove a course cover from the editor; the catalog renders the real image when present and falls back to the existing `LwCoverComponent` placeholder when absent.

**Architecture:** New `cover/` submodule under `libs/api-courses/` (per the `video/`, `learn/`, `enrollment/` per-feature pattern) with its own controller, service, exception filter, storage adapter (with a fake for tests/local), and config. New `cover/` submodule under `libs/web-courses/` with a Promise-returning HTTP wrapper service and a state-owning uploader component. `LwCoverComponent` gains an optional `imageUrl` input. Multipart-through-API transport; server-side resize via `sharp` to a canonical 1920×1080 JPEG written to `course-covers/{courseId}/cover.jpg`; cache busting via `?v={Course.updatedAt}` baked into the stored URL.

**Tech Stack:** NestJS 11 + `@nestjs/platform-express` + `multer` + `sharp`; Firebase Admin Storage; Angular 21 reactive signals + `HttpClient`; vitest for unit tests; Playwright for api-e2e and web-e2e; Nx 22 monorepo with pnpm.

**Spec:** `docs/superpowers/specs/2026-05-25-cover-image-upload-design.md`

**Worktree:** This plan executes inside `/Volumes/Artie-Storage/github-repos/learnwren-cover-image` on branch `feat/cover-image-upload`. `node_modules` is symlinked to the parent worktree — do not `git add -A`; always stage individual files.

---

## File Structure

### New files

```
libs/api-courses/src/lib/cover/
  errors/
    cover-error.codes.ts                — string-literal union of error codes
    cover.exception.ts                  — CoverException + concrete subclasses
    cover.exception.spec.ts             — type/construction tests
  cover.config.ts                       — env → { bucket, publicBaseUrl }
  cover.config.spec.ts
  cover-storage.adapter.ts              — CoverStoragePort interface + Firebase impl
  cover-storage.adapter.spec.ts
  fake-cover-storage.adapter.ts         — in-memory implementation for tests + local
  fake-cover-storage.adapter.spec.ts
  cover.exception-filter.ts             — per-feature filter
  cover.exception-filter.spec.ts
  cover-image.service.ts                — sharp pipeline + storage + course patch
  cover-image.service.spec.ts
  cover.controller.ts                   — PUT / DELETE /api/courses/:cid/cover
  cover.controller.spec.ts

libs/web-courses/src/lib/cover/
  course-cover.service.ts
  course-cover.service.spec.ts
  course-cover-uploader.component.ts
  course-cover-uploader.component.html
  course-cover-uploader.component.spec.ts

apps/api-e2e/src/
  cover.e2e-spec.ts                     — golden path via FakeCoverStorage

apps/web-e2e/src/
  course-cover.spec.ts                  — instructor upload + catalog render
```

### Modified files

```
package.json                            — add sharp + multer (+ @types/multer)
libs/shared-data-models/src/lib/course.ts          — + coverImageUrl?
libs/shared-data-models/src/lib/course.spec.ts     — + assertion case
libs/shared-data-models/src/lib/catalog.ts         — + coverImageUrl? on CourseSummary and CourseCatalogDetail
libs/shared-data-models/src/lib/catalog.spec.ts    — + assertion cases
storage.rules                                      — open course-covers/** for public read
libs/api-courses/src/lib/courses.module.ts         — register cover providers + CoverController
libs/api-courses/src/lib/catalog/catalog.service.ts — project coverImageUrl in toSummary + getCourseDetail
libs/api-courses/src/lib/catalog/catalog.service.spec.ts — assert projection
libs/web-ui/src/lib/cover/lw-cover.component.ts    — + imageUrl + alt inputs, image render path
libs/web-ui/src/lib/cover/lw-cover.component.spec.ts — + image render assertions
libs/web-catalog/src/lib/components/course-card/course-card.component.html — pass imageUrl
libs/web-catalog/src/lib/course-detail-page/course-detail-page.component.html — pass imageUrl
libs/web-courses/src/lib/course-editor-page/course-editor-page.component.ts  — onCoverChanged handler
libs/web-courses/src/lib/course-editor-page/course-editor-page.component.html — host <lib-course-cover-uploader>
docs/use-cases/02-course-authoring.md              — reconcile UC-02-01 to editor-only
docs/quality/spec-drift-report.md                  — close UC-02-01 cover drift entry
README.md                                          — flip "cover image deferred" bullet
docs/USER_GUIDE.md                                 — document the new surface
```

---

## Task 1: Add `sharp`, `multer`, and `@types/multer` dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add dependencies via pnpm**

```bash
pnpm add sharp@^0.33.0 multer@^1.4.5-lts.1
pnpm add -D @types/multer@^1.4.11
```

- [ ] **Step 2: Verify install**

```bash
pnpm list sharp multer @types/multer | cat
```

Expected: three rows showing the installed versions. `sharp` should report a native binary for the host platform.

- [ ] **Step 3: Quick smoke check that sharp loads**

```bash
node -e "console.log(require('sharp').format.jpeg.id, require('sharp').format.png.id)"
```

Expected: `jpeg png`.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "build(api-courses): add sharp and multer deps for cover image pipeline"
```

---

## Task 2: Extend `Course` with optional `coverImageUrl`

**Files:**
- Modify: `libs/shared-data-models/src/lib/course.ts`
- Modify: `libs/shared-data-models/src/lib/course.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to `libs/shared-data-models/src/lib/course.spec.ts` before the final closing brace of the file:

```ts
describe('Course — cover image', () => {
  it('accepts a course with coverImageUrl set', () => {
    const c: Course = {
      id: 'c1' as CourseId,
      title: 'T',
      description: 'D',
      instructorId: 'u1' as UserId,
      status: 'DRAFT',
      coverImageUrl: 'https://cdn.example/course-covers/c1/cover.jpg?v=2026-05-25T00:00:00.000Z',
      createdAt: '2026-05-12T00:00:00.000Z' as ISODateString,
      updatedAt: '2026-05-12T00:00:00.000Z' as ISODateString,
    };
    expect(c.coverImageUrl).toMatch(/course-covers\/c1\/cover\.jpg\?v=/);
  });

  it('accepts a course with coverImageUrl absent', () => {
    const c: Course = {
      id: 'c1' as CourseId,
      title: 'T',
      description: 'D',
      instructorId: 'u1' as UserId,
      status: 'DRAFT',
      createdAt: '2026-05-12T00:00:00.000Z' as ISODateString,
      updatedAt: '2026-05-12T00:00:00.000Z' as ISODateString,
    };
    expect(c.coverImageUrl).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test — expect compile failure**

```bash
pnpm nx test shared-data-models --testFile=course.spec.ts
```

Expected: TS2353 — `Object literal may only specify known properties, and 'coverImageUrl' does not exist in type 'Course'`.

- [ ] **Step 3: Add the field to `Course`**

In `libs/shared-data-models/src/lib/course.ts`, inside the `Course` interface, add **immediately after** `archivedAt`:

```ts
  coverImageUrl?: string;             // public URL to canonical JPEG with ?v={updatedAt} cache-buster; absent ⇒ no cover
```

- [ ] **Step 4: Run the test — expect PASS**

```bash
pnpm nx test shared-data-models --testFile=course.spec.ts
```

Expected: all describe blocks green.

- [ ] **Step 5: Commit**

```bash
git add libs/shared-data-models/src/lib/course.ts libs/shared-data-models/src/lib/course.spec.ts
git commit -m "feat(shared-data-models): add Course.coverImageUrl optional field"
```

---

## Task 3: Extend `CourseSummary` and `CourseCatalogDetail` with optional `coverImageUrl`

**Files:**
- Modify: `libs/shared-data-models/src/lib/catalog.ts`
- Modify: `libs/shared-data-models/src/lib/catalog.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to `libs/shared-data-models/src/lib/catalog.spec.ts`:

```ts
import type { CourseCatalogDetail, CourseSummary } from './catalog';

describe('CourseSummary — cover image', () => {
  it('accepts a summary with coverImageUrl', () => {
    const s: CourseSummary = {
      id: 'c1' as CourseSummary['id'],
      title: 'T',
      description: 'D',
      instructorDisplayName: 'X',
      publishedAt: '2026-05-12T00:00:00.000Z' as CourseSummary['publishedAt'],
      coverImageUrl: 'https://cdn.example/course-covers/c1/cover.jpg?v=2026-05-12T00:00:00.000Z',
    };
    expect(s.coverImageUrl).toContain('cover.jpg');
  });
});

describe('CourseCatalogDetail — cover image', () => {
  it('accepts a detail with coverImageUrl', () => {
    const d: CourseCatalogDetail = {
      id: 'c1' as CourseCatalogDetail['id'],
      title: 'T',
      description: 'D',
      instructorDisplayName: 'X',
      lessonCount: 0,
      modules: [],
      publishedAt: '2026-05-12T00:00:00.000Z' as CourseCatalogDetail['publishedAt'],
      coverImageUrl: 'https://cdn.example/course-covers/c1/cover.jpg?v=2026-05-12T00:00:00.000Z',
    };
    expect(d.coverImageUrl).toContain('cover.jpg');
  });
});
```

- [ ] **Step 2: Run the test — expect compile failure**

```bash
pnpm nx test shared-data-models --testFile=catalog.spec.ts
```

Expected: TS2353 on `coverImageUrl`.

- [ ] **Step 3: Add the fields**

In `libs/shared-data-models/src/lib/catalog.ts`, append to the `CourseSummary` interface:

```ts
  coverImageUrl?: string;
```

And append to the `CourseCatalogDetail` interface:

```ts
  coverImageUrl?: string;
```

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm nx test shared-data-models --testFile=catalog.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add libs/shared-data-models/src/lib/catalog.ts libs/shared-data-models/src/lib/catalog.spec.ts
git commit -m "feat(shared-data-models): add coverImageUrl to CourseSummary and CourseCatalogDetail"
```

---

## Task 4: Cover error codes and `CoverException` hierarchy

**Files:**
- Create: `libs/api-courses/src/lib/cover/errors/cover-error.codes.ts`
- Create: `libs/api-courses/src/lib/cover/errors/cover.exception.ts`
- Create: `libs/api-courses/src/lib/cover/errors/cover.exception.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/api-courses/src/lib/cover/errors/cover.exception.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  CoverDecodeFailedException,
  CoverDimensionsTooSmallException,
  CoverException,
  CoverTooLargeException,
  UnsupportedCoverFormatException,
} from './cover.exception';

describe('CoverException hierarchy', () => {
  it('CoverDimensionsTooSmallException carries 400, code, and {width,height} details', () => {
    const e = new CoverDimensionsTooSmallException({ width: 640, height: 480 });
    expect(e).toBeInstanceOf(CoverException);
    expect(e.code).toBe('COVER_DIMENSIONS_TOO_SMALL');
    expect(e.status).toBe(400);
    expect(e.details).toEqual({ width: 640, height: 480 });
  });

  it('CoverDecodeFailedException is a 400 with COVER_DECODE_FAILED', () => {
    const e = new CoverDecodeFailedException();
    expect(e.code).toBe('COVER_DECODE_FAILED');
    expect(e.status).toBe(400);
  });

  it('CoverTooLargeException is a 413 with COVER_TOO_LARGE', () => {
    const e = new CoverTooLargeException();
    expect(e.code).toBe('COVER_TOO_LARGE');
    expect(e.status).toBe(413);
  });

  it('UnsupportedCoverFormatException is a 415 with UNSUPPORTED_COVER_FORMAT', () => {
    const e = new UnsupportedCoverFormatException();
    expect(e.code).toBe('UNSUPPORTED_COVER_FORMAT');
    expect(e.status).toBe(415);
  });
});
```

- [ ] **Step 2: Run — expect import failure**

```bash
pnpm nx test api-courses --testFile=cover.exception.spec.ts
```

Expected: module not found.

- [ ] **Step 3: Create the codes file**

`libs/api-courses/src/lib/cover/errors/cover-error.codes.ts`:

```ts
export const COVER_ERROR_CODES = [
  'COVER_DIMENSIONS_TOO_SMALL',
  'COVER_DECODE_FAILED',
  'COVER_TOO_LARGE',
  'UNSUPPORTED_COVER_FORMAT',
] as const;

export type CoverErrorCode = (typeof COVER_ERROR_CODES)[number];
```

- [ ] **Step 4: Create the exception classes**

`libs/api-courses/src/lib/cover/errors/cover.exception.ts`:

```ts
import type { CoverErrorCode } from './cover-error.codes';

export class CoverException extends Error {
  constructor(
    public readonly code: CoverErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'CoverException';
  }
}

export class CoverDimensionsTooSmallException extends CoverException {
  constructor(dims: { width: number; height: number }) {
    super(
      'COVER_DIMENSIONS_TOO_SMALL',
      'Cover image must be JPEG or PNG, at least 1280x720 pixels.',
      400,
      { width: dims.width, height: dims.height },
    );
  }
}

export class CoverDecodeFailedException extends CoverException {
  constructor() {
    super('COVER_DECODE_FAILED', 'Cover image could not be decoded.', 400);
  }
}

export class CoverTooLargeException extends CoverException {
  constructor() {
    super('COVER_TOO_LARGE', 'Cover image exceeds the 10 MB limit.', 413);
  }
}

export class UnsupportedCoverFormatException extends CoverException {
  constructor() {
    super(
      'UNSUPPORTED_COVER_FORMAT',
      'Cover image must be JPEG or PNG.',
      415,
    );
  }
}
```

- [ ] **Step 5: Run — expect PASS**

```bash
pnpm nx test api-courses --testFile=cover.exception.spec.ts
```

- [ ] **Step 6: Commit**

```bash
git add libs/api-courses/src/lib/cover/errors/
git commit -m "feat(api-courses): add CoverException hierarchy and error codes"
```

---

## Task 5: `CoverExceptionFilter` (per-feature)

**Files:**
- Create: `libs/api-courses/src/lib/cover/cover.exception-filter.ts`
- Create: `libs/api-courses/src/lib/cover/cover.exception-filter.spec.ts`

- [ ] **Step 1: Write the failing test**

`libs/api-courses/src/lib/cover/cover.exception-filter.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { ArgumentsHost } from '@nestjs/common';
import { HttpException, NotFoundException } from '@nestjs/common';

import { CoverDimensionsTooSmallException, CoverException } from './errors/cover.exception';
import { CoverExceptionFilter } from './cover.exception-filter';

function makeHost(): { host: ArgumentsHost; status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('CoverExceptionFilter', () => {
  it('maps a CoverException to its status + machine code + details', () => {
    const { host, status, json } = makeHost();
    const filter = new CoverExceptionFilter();
    filter.catch(new CoverDimensionsTooSmallException({ width: 800, height: 600 }), host);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'COVER_DIMENSIONS_TOO_SMALL',
        message: 'Cover image must be JPEG or PNG, at least 1280x720 pixels.',
        details: { width: 800, height: 600 },
      },
    });
  });

  it('passes through plain HttpException with a status-derived code', () => {
    const { host, status, json } = makeHost();
    const filter = new CoverExceptionFilter();
    filter.catch(new NotFoundException('Course not found.'), host);
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'NOT_FOUND', message: 'Course not found.' },
    });
  });

  it('falls back to 500 INTERNAL for unknown errors', () => {
    const { host, status, json } = makeHost();
    const filter = new CoverExceptionFilter();
    filter.catch(new Error('boom'), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL', message: 'An internal error occurred.' },
    });
  });
});
```

- [ ] **Step 2: Run — expect import failure**

```bash
pnpm nx test api-courses --testFile=cover.exception-filter.spec.ts
```

- [ ] **Step 3: Implement the filter (mirrors LearnExceptionFilter)**

`libs/api-courses/src/lib/cover/cover.exception-filter.ts`:

```ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

import { CoverException } from './errors/cover.exception';

interface CoverErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

@Catch(CoverException, HttpException)
export class CoverExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('CoverExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof CoverException) {
      response.status(exception.status).json({
        error: {
          code: exception.code,
          message: exception.message,
          ...(exception.details ? { details: exception.details } : {}),
        },
      } satisfies CoverErrorBody);
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      response.status(status).json({
        error: { code: codeForStatus(status), message: exception.message },
      } satisfies CoverErrorBody);
      return;
    }
    this.logger.error(exception instanceof Error ? exception.stack ?? exception.message : String(exception));
    response.status(500).json({
      error: { code: 'INTERNAL', message: 'An internal error occurred.' },
    } satisfies CoverErrorBody);
  }
}

function codeForStatus(status: number): string {
  switch (status) {
    case 400: return 'BAD_REQUEST';
    case 401: return 'UNAUTHORIZED';
    case 403: return 'FORBIDDEN';
    case 404: return 'NOT_FOUND';
    case 413: return 'PAYLOAD_TOO_LARGE';
    case 415: return 'UNSUPPORTED_MEDIA_TYPE';
    default: return 'ERROR';
  }
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm nx test api-courses --testFile=cover.exception-filter.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/cover/cover.exception-filter.ts libs/api-courses/src/lib/cover/cover.exception-filter.spec.ts
git commit -m "feat(api-courses): add CoverExceptionFilter mapping cover errors to HTTP responses"
```

---

## Task 6: `CoverConfig` (env reader)

**Files:**
- Create: `libs/api-courses/src/lib/cover/cover.config.ts`
- Create: `libs/api-courses/src/lib/cover/cover.config.spec.ts`

- [ ] **Step 1: Write the failing test**

`libs/api-courses/src/lib/cover/cover.config.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { readCoverConfigFromEnv } from './cover.config';

describe('readCoverConfigFromEnv', () => {
  it('reads bucket and publicBaseUrl from env', () => {
    const cfg = readCoverConfigFromEnv({
      LEARNWREN_COVER_BUCKET: 'learnwren-covers',
      LEARNWREN_COVER_PUBLIC_BASE_URL: 'https://cdn.example.com',
      LEARNWREN_COVER_STORAGE: 'firebase',
    });
    expect(cfg).toEqual({
      bucket: 'learnwren-covers',
      publicBaseUrl: 'https://cdn.example.com',
      impl: 'firebase',
    });
  });

  it('defaults impl to "fake" when unset (dev/test posture)', () => {
    const cfg = readCoverConfigFromEnv({
      LEARNWREN_COVER_BUCKET: 'b',
      LEARNWREN_COVER_PUBLIC_BASE_URL: 'http://localhost:9199/v0/b/b/o',
    });
    expect(cfg.impl).toBe('fake');
  });

  it('throws when bucket is missing', () => {
    expect(() =>
      readCoverConfigFromEnv({ LEARNWREN_COVER_PUBLIC_BASE_URL: 'x' }),
    ).toThrow(/LEARNWREN_COVER_BUCKET/);
  });

  it('throws when publicBaseUrl is missing', () => {
    expect(() =>
      readCoverConfigFromEnv({ LEARNWREN_COVER_BUCKET: 'b' }),
    ).toThrow(/LEARNWREN_COVER_PUBLIC_BASE_URL/);
  });
});
```

- [ ] **Step 2: Run — expect import failure**

```bash
pnpm nx test api-courses --testFile=cover.config.spec.ts
```

- [ ] **Step 3: Implement the config**

`libs/api-courses/src/lib/cover/cover.config.ts`:

```ts
export const COVER_CONFIG = Symbol.for('learnwren.api-courses.cover.config');

export type CoverStorageImpl = 'firebase' | 'fake';

export interface CoverConfig {
  bucket: string;
  publicBaseUrl: string;       // e.g. https://storage.googleapis.com/<bucket>  or  https://firebasestorage.googleapis.com/v0/b/<bucket>/o
  impl: CoverStorageImpl;
}

export function readCoverConfigFromEnv(env: Record<string, string | undefined>): CoverConfig {
  const bucket = env['LEARNWREN_COVER_BUCKET'];
  if (!bucket) {
    throw new Error('LEARNWREN_COVER_BUCKET is required.');
  }
  const publicBaseUrl = env['LEARNWREN_COVER_PUBLIC_BASE_URL'];
  if (!publicBaseUrl) {
    throw new Error('LEARNWREN_COVER_PUBLIC_BASE_URL is required.');
  }
  const raw = env['LEARNWREN_COVER_STORAGE'];
  const impl: CoverStorageImpl = raw === 'firebase' ? 'firebase' : 'fake';
  return { bucket, publicBaseUrl, impl };
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm nx test api-courses --testFile=cover.config.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/cover/cover.config.ts libs/api-courses/src/lib/cover/cover.config.spec.ts
git commit -m "feat(api-courses): add CoverConfig env reader with firebase/fake impl toggle"
```

---

## Task 7: `CoverStoragePort` and `FakeCoverStorage`

**Files:**
- Create: `libs/api-courses/src/lib/cover/cover-storage.adapter.ts`
- Create: `libs/api-courses/src/lib/cover/fake-cover-storage.adapter.ts`
- Create: `libs/api-courses/src/lib/cover/fake-cover-storage.adapter.spec.ts`

- [ ] **Step 1: Write the failing test for the fake**

`libs/api-courses/src/lib/cover/fake-cover-storage.adapter.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { FakeCoverStorageAdapter } from './fake-cover-storage.adapter';

describe('FakeCoverStorageAdapter', () => {
  it('stores and reports a put object', async () => {
    const fake = new FakeCoverStorageAdapter({ bucket: 'b' });
    await fake.putObject({
      path: 'course-covers/c1/cover.jpg',
      contentType: 'image/jpeg',
      body: Buffer.from([0xff, 0xd8, 0xff]),
      cacheControl: 'public, max-age=31536000, immutable',
      metadata: { courseId: 'c1' },
    });
    expect(fake.has('course-covers/c1/cover.jpg')).toBe(true);
    const blob = fake.get('course-covers/c1/cover.jpg');
    expect(blob?.contentType).toBe('image/jpeg');
    expect(blob?.body.length).toBe(3);
  });

  it('overwrites on second put at the same path', async () => {
    const fake = new FakeCoverStorageAdapter({ bucket: 'b' });
    await fake.putObject({ path: 'p', contentType: 'image/jpeg', body: Buffer.from('a') });
    await fake.putObject({ path: 'p', contentType: 'image/jpeg', body: Buffer.from('bb') });
    expect(fake.get('p')?.body.toString()).toBe('bb');
  });

  it('deleteObject is idempotent — missing path is a no-op', async () => {
    const fake = new FakeCoverStorageAdapter({ bucket: 'b' });
    await expect(fake.deleteObject({ path: 'nope' })).resolves.toBeUndefined();
  });

  it('deleteObject removes the blob', async () => {
    const fake = new FakeCoverStorageAdapter({ bucket: 'b' });
    await fake.putObject({ path: 'p', contentType: 'image/jpeg', body: Buffer.from('a') });
    await fake.deleteObject({ path: 'p' });
    expect(fake.has('p')).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect import failure**

```bash
pnpm nx test api-courses --testFile=fake-cover-storage.adapter.spec.ts
```

- [ ] **Step 3: Define the port interface**

`libs/api-courses/src/lib/cover/cover-storage.adapter.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';

import { FIREBASE_STORAGE, type FirebaseStorageHandle } from '@learnwren/api-firebase';

import { COVER_CONFIG, type CoverConfig } from './cover.config';

export interface PutObjectInput {
  path: string;                          // e.g. course-covers/{courseId}/cover.jpg
  contentType: string;                   // e.g. image/jpeg
  body: Buffer;
  cacheControl?: string;
  metadata?: Record<string, string>;
}

export interface CoverStoragePort {
  putObject(input: PutObjectInput): Promise<void>;
  deleteObject(input: { path: string }): Promise<void>;
}

/** Firebase Storage implementation. Selected when LEARNWREN_COVER_STORAGE=firebase. */
@Injectable()
export class FirebaseCoverStorageAdapter implements CoverStoragePort {
  constructor(
    @Inject(FIREBASE_STORAGE) private readonly storage: FirebaseStorageHandle,
    @Inject(COVER_CONFIG) private readonly cfg: CoverConfig,
  ) {}

  async putObject(input: PutObjectInput): Promise<void> {
    const file = this.storage.bucket(this.cfg.bucket).file(input.path);
    await file.save(input.body, {
      contentType: input.contentType,
      metadata: {
        cacheControl: input.cacheControl,
        metadata: input.metadata,
      },
      resumable: false,
    });
  }

  async deleteObject(input: { path: string }): Promise<void> {
    const file = this.storage.bucket(this.cfg.bucket).file(input.path);
    try {
      await file.delete({ ignoreNotFound: true });
    } catch (err) {
      if ((err as { code?: number }).code === 404) return;
      throw err;
    }
  }
}

export const COVER_STORAGE = Symbol.for('learnwren.api-courses.cover.storage');
```

- [ ] **Step 4: Implement the fake**

`libs/api-courses/src/lib/cover/fake-cover-storage.adapter.ts`:

```ts
import { Injectable } from '@nestjs/common';

import type { CoverStoragePort, PutObjectInput } from './cover-storage.adapter';

interface StoredBlob {
  contentType: string;
  body: Buffer;
  cacheControl?: string;
  metadata?: Record<string, string>;
}

@Injectable()
export class FakeCoverStorageAdapter implements CoverStoragePort {
  private readonly blobs = new Map<string, StoredBlob>();

  constructor(private readonly opts?: { bucket?: string }) {}

  async putObject(input: PutObjectInput): Promise<void> {
    this.blobs.set(input.path, {
      contentType: input.contentType,
      body: Buffer.from(input.body),
      cacheControl: input.cacheControl,
      metadata: input.metadata,
    });
  }

  async deleteObject(input: { path: string }): Promise<void> {
    this.blobs.delete(input.path);
  }

  // Test helpers — not part of the port.
  has(path: string): boolean {
    return this.blobs.has(path);
  }
  get(path: string): StoredBlob | undefined {
    return this.blobs.get(path);
  }
  clear(): void {
    this.blobs.clear();
  }
}
```

- [ ] **Step 5: Run — expect PASS**

```bash
pnpm nx test api-courses --testFile=fake-cover-storage.adapter.spec.ts
```

- [ ] **Step 6: Commit**

```bash
git add libs/api-courses/src/lib/cover/cover-storage.adapter.ts libs/api-courses/src/lib/cover/fake-cover-storage.adapter.ts libs/api-courses/src/lib/cover/fake-cover-storage.adapter.spec.ts
git commit -m "feat(api-courses): add CoverStoragePort with Firebase impl and in-memory fake"
```

---

## Task 8: `CoverImageService` — sharp pipeline (dimension/decode rules)

**Files:**
- Create: `libs/api-courses/src/lib/cover/cover-image.service.ts`
- Create: `libs/api-courses/src/lib/cover/cover-image.service.spec.ts`

- [ ] **Step 1: Write the failing test**

`libs/api-courses/src/lib/cover/cover-image.service.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';

import type { Course, CourseId, ISODateString } from '@learnwren/shared-data-models';

import {
  CoverDecodeFailedException,
  CoverDimensionsTooSmallException,
} from './errors/cover.exception';
import { FakeCoverStorageAdapter } from './fake-cover-storage.adapter';
import { CoverImageService } from './cover-image.service';

const CID = 'c1' as CourseId;

function makeRepo() {
  const courses = new Map<CourseId, Course>();
  return {
    state: courses,
    getCourse: vi.fn(async (id: CourseId) => courses.get(id) ?? null),
    updateCourse: vi.fn(async (id: CourseId, patch: Partial<Course>) => {
      const prev = courses.get(id);
      if (!prev) return;
      const next: Course = {
        ...prev,
        ...patch,
        updatedAt: '2026-05-25T12:00:00.000Z' as ISODateString,
      };
      courses.set(id, next);
    }),
  };
}

async function makeJpegBuffer(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 100, b: 50 } },
  })
    .jpeg()
    .toBuffer();
}

describe('CoverImageService — validation', () => {
  let svc: CoverImageService;
  let storage: FakeCoverStorageAdapter;
  let repo: ReturnType<typeof makeRepo>;

  beforeEach(() => {
    storage = new FakeCoverStorageAdapter();
    repo = makeRepo();
    repo.state.set(CID, {
      id: CID,
      title: 'T',
      description: 'D',
      instructorId: 'u1' as Course['instructorId'],
      status: 'DRAFT',
      createdAt: '2026-05-01T00:00:00.000Z' as ISODateString,
      updatedAt: '2026-05-01T00:00:00.000Z' as ISODateString,
    });
    svc = new CoverImageService(
      storage,
      repo as unknown as import('../courses.repository').CoursesRepository,
      { bucket: 'b', publicBaseUrl: 'https://cdn.example', impl: 'fake' },
    );
  });

  it('rejects a 640x480 image with CoverDimensionsTooSmallException carrying actual dimensions', async () => {
    const buf = await makeJpegBuffer(640, 480);
    await expect(svc.uploadCover(CID, buf, 'image/jpeg')).rejects.toMatchObject({
      constructor: CoverDimensionsTooSmallException,
      details: { width: 640, height: 480 },
    });
  });

  it('rejects a non-image buffer with CoverDecodeFailedException', async () => {
    await expect(svc.uploadCover(CID, Buffer.from('not an image'), 'image/jpeg')).rejects.toBeInstanceOf(
      CoverDecodeFailedException,
    );
  });

  it('accepts a 1280x720 image (boundary, inclusive)', async () => {
    const buf = await makeJpegBuffer(1280, 720);
    const out = await svc.uploadCover(CID, buf, 'image/jpeg');
    expect(out.coverImageUrl).toMatch(/^https:\/\/cdn\.example\/course-covers\/c1\/cover\.jpg\?v=/);
  });
});
```

- [ ] **Step 2: Run — expect import failure**

```bash
pnpm nx test api-courses --testFile=cover-image.service.spec.ts
```

- [ ] **Step 3: Implement just enough to pass these three tests**

`libs/api-courses/src/lib/cover/cover-image.service.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import sharp from 'sharp';

import type { Course, CourseId } from '@learnwren/shared-data-models';

import { CoursesRepository } from '../courses.repository';
import { COVER_CONFIG, type CoverConfig } from './cover.config';
import { COVER_STORAGE, type CoverStoragePort } from './cover-storage.adapter';
import {
  CoverDecodeFailedException,
  CoverDimensionsTooSmallException,
} from './errors/cover.exception';

const MIN_WIDTH = 1280;
const MIN_HEIGHT = 720;
const MAX_WIDTH = 1920;
const MAX_HEIGHT = 1080;

export interface UploadCoverResult {
  coverImageUrl: string;
  updatedAt: Course['updatedAt'];
}

@Injectable()
export class CoverImageService {
  constructor(
    @Inject(COVER_STORAGE) private readonly storage: CoverStoragePort,
    private readonly courses: CoursesRepository,
    @Inject(COVER_CONFIG) private readonly cfg: CoverConfig,
  ) {}

  async uploadCover(
    courseId: CourseId,
    body: Buffer,
    _contentType: 'image/jpeg' | 'image/png',
  ): Promise<UploadCoverResult> {
    const pipeline = sharp(body, { failOn: 'truncated' });
    let meta: sharp.Metadata;
    try {
      meta = await pipeline.metadata();
    } catch {
      throw new CoverDecodeFailedException();
    }
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (!width || !height) throw new CoverDecodeFailedException();
    if (width < MIN_WIDTH || height < MIN_HEIGHT) {
      throw new CoverDimensionsTooSmallException({ width, height });
    }

    const jpeg = await pipeline
      .resize({ width: MAX_WIDTH, height: MAX_HEIGHT, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();

    const path = `course-covers/${courseId}/cover.jpg`;
    await this.storage.putObject({
      path,
      contentType: 'image/jpeg',
      body: jpeg,
      cacheControl: 'public, max-age=31536000, immutable',
      metadata: { courseId: String(courseId) },
    });

    await this.courses.updateCourse(courseId, {
      coverImageUrl: '__placeholder__',  // replaced by the URL after we read updatedAt back
    } as Partial<Course>);
    const updated = await this.courses.getCourse(courseId);
    const updatedAt = updated!.updatedAt;
    const coverImageUrl = `${this.cfg.publicBaseUrl}/${path}?v=${encodeURIComponent(updatedAt)}`;
    await this.courses.updateCourse(courseId, { coverImageUrl } as Partial<Course>);
    return { coverImageUrl, updatedAt };
  }

  async removeCover(courseId: CourseId): Promise<{ updatedAt: Course['updatedAt'] }> {
    const path = `course-covers/${courseId}/cover.jpg`;
    await this.storage.deleteObject({ path });
    await this.courses.updateCourse(courseId, { coverImageUrl: undefined } as Partial<Course>);
    const updated = await this.courses.getCourse(courseId);
    return { updatedAt: updated!.updatedAt };
  }
}
```

> **Note:** the double-write to read `updatedAt` works but is wasteful. Task 9 refactors this to a single write once we have a happy-path storage-call-shape test in place to protect the behaviour.

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm nx test api-courses --testFile=cover-image.service.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/cover/cover-image.service.ts libs/api-courses/src/lib/cover/cover-image.service.spec.ts
git commit -m "feat(api-courses): add CoverImageService sharp pipeline with dimension and decode validation"
```

---

## Task 9: `CoverImageService` — assert storage call shape and single-write patch

**Files:**
- Modify: `libs/api-courses/src/lib/cover/cover-image.service.ts`
- Modify: `libs/api-courses/src/lib/cover/cover-image.service.spec.ts`

- [ ] **Step 1: Append failing tests for the happy path**

Add to the existing `describe('CoverImageService — validation', ...)` block (or below it):

```ts
describe('CoverImageService — happy path', () => {
  let svc: CoverImageService;
  let storage: FakeCoverStorageAdapter;
  let repo: ReturnType<typeof makeRepo>;

  beforeEach(() => {
    storage = new FakeCoverStorageAdapter();
    repo = makeRepo();
    repo.state.set(CID, {
      id: CID,
      title: 'T',
      description: 'D',
      instructorId: 'u1' as Course['instructorId'],
      status: 'DRAFT',
      createdAt: '2026-05-01T00:00:00.000Z' as ISODateString,
      updatedAt: '2026-05-01T00:00:00.000Z' as ISODateString,
    });
    svc = new CoverImageService(
      storage,
      repo as unknown as import('../courses.repository').CoursesRepository,
      { bucket: 'b', publicBaseUrl: 'https://cdn.example', impl: 'fake' },
    );
  });

  it('writes a single jpeg blob at course-covers/{id}/cover.jpg with cacheControl + metadata', async () => {
    const buf = await makeJpegBuffer(1920, 1080);
    await svc.uploadCover(CID, buf, 'image/jpeg');
    const blob = storage.get('course-covers/c1/cover.jpg');
    expect(blob).toBeDefined();
    expect(blob!.contentType).toBe('image/jpeg');
    expect(blob!.cacheControl).toBe('public, max-age=31536000, immutable');
    expect(blob!.metadata).toEqual({ courseId: 'c1' });
  });

  it('resizes a 3000x1500 source down within 1920x1080 preserving aspect', async () => {
    const buf = await makeJpegBuffer(3000, 1500);
    await svc.uploadCover(CID, buf, 'image/jpeg');
    const blob = storage.get('course-covers/c1/cover.jpg');
    const meta = await sharp(blob!.body).metadata();
    expect(meta.width).toBeLessThanOrEqual(1920);
    expect(meta.height).toBeLessThanOrEqual(1080);
    expect(meta.format).toBe('jpeg');
  });

  it('patches Course.coverImageUrl exactly once with the resolved URL', async () => {
    const buf = await makeJpegBuffer(1280, 720);
    const out = await svc.uploadCover(CID, buf, 'image/jpeg');
    expect(repo.updateCourse).toHaveBeenCalledTimes(1);
    const calls = repo.updateCourse.mock.calls;
    expect(calls[0][1]).toEqual({ coverImageUrl: out.coverImageUrl });
    expect(out.coverImageUrl).toBe(repo.state.get(CID)!.coverImageUrl);
  });

  it('removeCover deletes the blob and unsets coverImageUrl in a single update', async () => {
    repo.state.set(CID, {
      ...repo.state.get(CID)!,
      coverImageUrl: 'https://cdn.example/course-covers/c1/cover.jpg?v=old',
    });
    await storage.putObject({
      path: 'course-covers/c1/cover.jpg',
      contentType: 'image/jpeg',
      body: Buffer.from('x'),
    });
    await svc.removeCover(CID);
    expect(storage.has('course-covers/c1/cover.jpg')).toBe(false);
    expect(repo.updateCourse).toHaveBeenCalledTimes(1);
    expect(repo.updateCourse.mock.calls[0][1]).toEqual({ coverImageUrl: undefined });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm nx test api-courses --testFile=cover-image.service.spec.ts
```

Expected: the "exactly once" assertion fails (currently we call `updateCourse` twice).

- [ ] **Step 3: Refactor `uploadCover` to a single write**

Replace the body of `uploadCover` (everything after the resize/upload to storage) with the version below. The trick: we let `updateCourse` bump `updatedAt`, then read it back once and **set** the final URL in a second logical call — but we collapse to one by computing the next `updatedAt` ourselves first and patching in one shot.

In `cover-image.service.ts`, replace `uploadCover`'s tail:

```ts
    // Pre-compute the next updatedAt locally so we can write the final URL in
    // a single repository.updateCourse call. CoursesRepository.updateCourse
    // overwrites updatedAt internally; we mirror its clock by formatting now()
    // the same way (UTC ISO string).
    const updatedAt = new Date().toISOString() as Course['updatedAt'];
    const coverImageUrl = `${this.cfg.publicBaseUrl}/${path}?v=${encodeURIComponent(updatedAt)}`;
    await this.courses.updateCourse(courseId, { coverImageUrl } as Partial<Course>);
    return { coverImageUrl, updatedAt };
```

And drop the `getCourse` lookup. Likewise update `removeCover`:

```ts
  async removeCover(courseId: CourseId): Promise<{ updatedAt: Course['updatedAt'] }> {
    const path = `course-covers/${courseId}/cover.jpg`;
    await this.storage.deleteObject({ path });
    const updatedAt = new Date().toISOString() as Course['updatedAt'];
    await this.courses.updateCourse(courseId, { coverImageUrl: undefined } as Partial<Course>);
    return { updatedAt };
  }
```

> **Caveat:** the returned `updatedAt` is not guaranteed to be byte-identical to the value `CoursesRepository.updateCourse` wrote (it calls `nowIso()` independently). The two will differ by at most a millisecond. The `?v=…` cache-buster only needs uniqueness across replacements, not equality with the row — it is correct. Any caller that needs the authoritative row should re-fetch the course.

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm nx test api-courses --testFile=cover-image.service.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/cover/cover-image.service.ts libs/api-courses/src/lib/cover/cover-image.service.spec.ts
git commit -m "refactor(api-courses): collapse CoverImageService to a single course write per call"
```

---

## Task 10: `CoverController` with multipart upload

**Files:**
- Create: `libs/api-courses/src/lib/cover/cover.controller.ts`
- Create: `libs/api-courses/src/lib/cover/cover.controller.spec.ts`

- [ ] **Step 1: Write the failing test**

`libs/api-courses/src/lib/cover/cover.controller.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { CourseId, ISODateString } from '@learnwren/shared-data-models';

import { CoverController } from './cover.controller';
import {
  CoverTooLargeException,
  UnsupportedCoverFormatException,
} from './errors/cover.exception';
import type { CoverImageService } from './cover-image.service';

const CID = 'c1' as CourseId;

function makeSvc() {
  return {
    uploadCover: vi.fn(async () => ({
      coverImageUrl: 'https://cdn.example/course-covers/c1/cover.jpg?v=2026',
      updatedAt: '2026-05-25T12:00:00.000Z' as ISODateString,
    })),
    removeCover: vi.fn(async () => ({ updatedAt: '2026-05-25T12:00:00.000Z' as ISODateString })),
  };
}

function makeFile(mimetype: string, size = 100): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'cover.jpg',
    encoding: '7bit',
    mimetype,
    size,
    buffer: Buffer.alloc(size, 1),
    destination: '',
    filename: '',
    path: '',
    stream: undefined as never,
  };
}

describe('CoverController', () => {
  it('returns 200 { coverImageUrl, updatedAt } on PUT happy path', async () => {
    const svc = makeSvc();
    const ctl = new CoverController(svc as unknown as CoverImageService);
    const out = await ctl.upload(CID, makeFile('image/jpeg'));
    expect(svc.uploadCover).toHaveBeenCalledWith(CID, expect.any(Buffer), 'image/jpeg');
    expect(out).toEqual({
      coverImageUrl: 'https://cdn.example/course-covers/c1/cover.jpg?v=2026',
      updatedAt: '2026-05-25T12:00:00.000Z',
    });
  });

  it('throws UnsupportedCoverFormatException when MIME is not jpeg/png', async () => {
    const svc = makeSvc();
    const ctl = new CoverController(svc as unknown as CoverImageService);
    await expect(ctl.upload(CID, makeFile('image/gif'))).rejects.toBeInstanceOf(
      UnsupportedCoverFormatException,
    );
  });

  it('throws CoverTooLargeException when file exceeds 10 MB', async () => {
    const svc = makeSvc();
    const ctl = new CoverController(svc as unknown as CoverImageService);
    await expect(ctl.upload(CID, makeFile('image/jpeg', 10_000_001))).rejects.toBeInstanceOf(
      CoverTooLargeException,
    );
  });

  it('throws UnsupportedCoverFormatException when no file is provided', async () => {
    const svc = makeSvc();
    const ctl = new CoverController(svc as unknown as CoverImageService);
    await expect(ctl.upload(CID, undefined as unknown as Express.Multer.File)).rejects.toBeInstanceOf(
      UnsupportedCoverFormatException,
    );
  });

  it('returns no content (void) on DELETE', async () => {
    const svc = makeSvc();
    const ctl = new CoverController(svc as unknown as CoverImageService);
    await expect(ctl.remove(CID)).resolves.toBeUndefined();
    expect(svc.removeCover).toHaveBeenCalledWith(CID);
  });
});
```

- [ ] **Step 2: Run — expect import failure**

```bash
pnpm nx test api-courses --testFile=cover.controller.spec.ts
```

- [ ] **Step 3: Implement the controller**

`libs/api-courses/src/lib/cover/cover.controller.ts`:

```ts
import {
  Controller,
  Delete,
  HttpCode,
  Param,
  Put,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { FirebaseSessionGuard, InstructorRoleGuard } from '@learnwren/api-auth';
import type { CourseId, ISODateString } from '@learnwren/shared-data-models';

import { CourseOwnerGuard } from '../course-owner.guard';
import { CoverImageService } from './cover-image.service';
import { CoverExceptionFilter } from './cover.exception-filter';
import {
  CoverTooLargeException,
  UnsupportedCoverFormatException,
} from './errors/cover.exception';

const MAX_BYTES = 10_000_000;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png']);

@Controller()
@UseFilters(CoverExceptionFilter)
@UseGuards(FirebaseSessionGuard, InstructorRoleGuard)
export class CoverController {
  constructor(private readonly svc: CoverImageService) {}

  @Put('courses/:cid/cover')
  @UseGuards(CourseOwnerGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_BYTES },
    }),
  )
  async upload(
    @Param('cid') cid: CourseId,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ coverImageUrl: string; updatedAt: ISODateString }> {
    if (!file) throw new UnsupportedCoverFormatException();
    if (!ALLOWED_MIME.has(file.mimetype)) throw new UnsupportedCoverFormatException();
    if (file.size > MAX_BYTES) throw new CoverTooLargeException();
    return this.svc.uploadCover(cid, file.buffer, file.mimetype as 'image/jpeg' | 'image/png');
  }

  @Delete('courses/:cid/cover')
  @HttpCode(204)
  @UseGuards(CourseOwnerGuard)
  async remove(@Param('cid') cid: CourseId): Promise<void> {
    await this.svc.removeCover(cid);
  }
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm nx test api-courses --testFile=cover.controller.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/cover/cover.controller.ts libs/api-courses/src/lib/cover/cover.controller.spec.ts
git commit -m "feat(api-courses): add CoverController with multipart upload and delete endpoints"
```

---

## Task 11: Wire cover providers into `CoursesModule` (and open `course-covers/**` for public read in `storage.rules`)

**Files:**
- Modify: `libs/api-courses/src/lib/courses.module.ts`
- Modify: `storage.rules`

- [ ] **Step 1: Add the new imports**

At the top of `libs/api-courses/src/lib/courses.module.ts`, add (preserving existing import order):

```ts
import { COVER_CONFIG, readCoverConfigFromEnv, type CoverConfig } from './cover/cover.config';
import {
  COVER_STORAGE,
  FirebaseCoverStorageAdapter,
} from './cover/cover-storage.adapter';
import { FakeCoverStorageAdapter } from './cover/fake-cover-storage.adapter';
import { CoverController } from './cover/cover.controller';
import { CoverExceptionFilter } from './cover/cover.exception-filter';
import { CoverImageService } from './cover/cover-image.service';
```

- [ ] **Step 2: Register the controller**

In the `@Module({ controllers: [...] })` array, add `CoverController` after `LearnController`:

```ts
controllers: [CoursesController, CatalogController, EnrollmentController, LearnController, CoverController],
```

- [ ] **Step 3: Register the providers**

In the `providers: [...]` array, append:

```ts
    CoverImageService,
    CoverExceptionFilter,
    FirebaseCoverStorageAdapter,
    { provide: COVER_CONFIG, useFactory: () => readCoverConfigFromEnv(process.env) },
    {
      provide: COVER_STORAGE,
      inject: [COVER_CONFIG, FirebaseCoverStorageAdapter],
      useFactory: (cfg: CoverConfig, firebase: FirebaseCoverStorageAdapter) =>
        cfg.impl === 'firebase' ? firebase : new FakeCoverStorageAdapter({ bucket: cfg.bucket }),
    },
```

- [ ] **Step 4: Open `course-covers/**` for public read in `storage.rules`**

Replace the contents of `storage.rules` at the repo root with:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Public-read cover images. Writes happen only via the Admin SDK in the API.
    match /course-covers/{allPaths=**} {
      allow read: if true;
      allow write: if false;
    }
    // Default-deny everything else.
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

- [ ] **Step 5: Verify the API still builds**

```bash
pnpm nx build api --skip-nx-cache
```

Expected: clean build.

- [ ] **Step 6: Run the full api-courses unit suite**

```bash
pnpm nx test api-courses
```

Expected: all tests green (we added several but did not modify any existing test).

- [ ] **Step 7: Commit**

```bash
git add libs/api-courses/src/lib/courses.module.ts storage.rules
git commit -m "feat(api-courses): wire CoverController + providers; open course-covers/** for public read"
```

---

## Task 12: Project `coverImageUrl` into catalog summary and detail

**Files:**
- Modify: `libs/api-courses/src/lib/catalog/catalog.service.ts`
- Modify: `libs/api-courses/src/lib/catalog/catalog.service.spec.ts`

- [ ] **Step 1: Append a new describe block using the file's existing `course()` + `makeService()` helpers**

The file defines a `course(over)` factory and `makeService(courses)` helper at the top. Append at the end of the file:

```ts
describe('CatalogService — cover image projection', () => {
  it('includes coverImageUrl in CourseSummary when present on Course', async () => {
    const svc = makeService([
      course({ id: 'c-cover' as CourseId, coverImageUrl: 'https://cdn/x.jpg?v=1' }),
    ]);
    const page = await svc.listCatalogue({});
    const item = page.items.find((i) => i.id === 'c-cover');
    expect(item?.coverImageUrl).toBe('https://cdn/x.jpg?v=1');
  });

  it('omits coverImageUrl in CourseSummary when absent on Course', async () => {
    const svc = makeService([course({ id: 'c-bare' as CourseId })]);
    const page = await svc.listCatalogue({});
    expect(page.items.find((i) => i.id === 'c-bare')?.coverImageUrl).toBeUndefined();
  });

  it('includes coverImageUrl in CourseCatalogDetail when present', async () => {
    const svc = makeService([
      course({ id: 'c-cover' as CourseId, coverImageUrl: 'https://cdn/x.jpg?v=1' }),
    ]);
    const detail = await svc.getCourseDetail('c-cover' as CourseId);
    expect(detail.coverImageUrl).toBe('https://cdn/x.jpg?v=1');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm nx test api-courses --testFile=catalog.service.spec.ts
```

Expected: `coverImageUrl` undefined or missing on the projections.

- [ ] **Step 3: Add the field to both projections**

In `libs/api-courses/src/lib/catalog/catalog.service.ts`, in the `toSummary` function add `coverImageUrl: course.coverImageUrl,` to the returned object. In `getCourseDetail`, add `coverImageUrl: course.coverImageUrl,` to the returned object.

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm nx test api-courses --testFile=catalog.service.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/catalog/catalog.service.ts libs/api-courses/src/lib/catalog/catalog.service.spec.ts
git commit -m "feat(api-courses): project Course.coverImageUrl into catalog summary and detail"
```

---

## Task 13: `apps/api-e2e` cover golden-path spec

**Files:**
- Create: `apps/api-e2e/src/cover.e2e-spec.ts`

This spec must run in CI without GCP creds, per `[[project_api_e2e_video_quarantine]]`. We rely on the `LEARNWREN_COVER_STORAGE=fake` env (default per `readCoverConfigFromEnv`) so the API uses `FakeCoverStorageAdapter`. The API process retains the fake's state in-memory for the duration of the spec.

- [ ] **Step 1: Create the spec**

`apps/api-e2e/src/cover.e2e-spec.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { API_BASE, initAdmin, registerAndPromoteInstructor } from './_helpers/auth';

initAdmin();

test('instructor uploads, replaces, then removes a cover image', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const hdr = { Cookie: instructor.cookieHeader };

  // Create a course
  const create = await request.post(`${API_BASE}/courses`, {
    headers: hdr,
    data: { title: 'Cover Test', description: 'd' },
  });
  expect(create.status()).toBe(201);
  const course = await create.json();

  // Upload a cover (JPEG fixture, ≥ 1280x720)
  const fixturePath = join(__dirname, 'fixtures', 'cover-1280x720.jpg');
  const bytes = readFileSync(fixturePath);
  const upload = await request.put(`${API_BASE}/courses/${course.id}/cover`, {
    headers: hdr,
    multipart: {
      file: { name: 'cover.jpg', mimeType: 'image/jpeg', buffer: bytes },
    },
  });
  expect(upload.status()).toBe(200);
  const uploadBody = await upload.json();
  expect(uploadBody.coverImageUrl).toMatch(
    new RegExp(`course-covers/${course.id}/cover\\.jpg\\?v=`),
  );
  expect(uploadBody.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

  // GET the course back — coverImageUrl is persisted
  const get = await request.get(`${API_BASE}/courses/${course.id}`, { headers: hdr });
  expect(get.status()).toBe(200);
  const tree = await get.json();
  expect(tree.course.coverImageUrl).toBe(uploadBody.coverImageUrl);

  // Replace — assert v= changes
  const replace = await request.put(`${API_BASE}/courses/${course.id}/cover`, {
    headers: hdr,
    multipart: { file: { name: 'cover.jpg', mimeType: 'image/jpeg', buffer: bytes } },
  });
  expect(replace.status()).toBe(200);
  const replaceBody = await replace.json();
  expect(replaceBody.coverImageUrl).not.toBe(uploadBody.coverImageUrl);

  // Delete
  const del = await request.delete(`${API_BASE}/courses/${course.id}/cover`, { headers: hdr });
  expect(del.status()).toBe(204);
  const get2 = await request.get(`${API_BASE}/courses/${course.id}`, { headers: hdr });
  const tree2 = await get2.json();
  expect(tree2.course.coverImageUrl).toBeUndefined();
});

test('non-JPEG/PNG file is rejected with UNSUPPORTED_COVER_FORMAT', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const hdr = { Cookie: instructor.cookieHeader };
  const create = await request.post(`${API_BASE}/courses`, {
    headers: hdr,
    data: { title: 'Cover Test', description: 'd' },
  });
  const course = await create.json();
  const r = await request.put(`${API_BASE}/courses/${course.id}/cover`, {
    headers: hdr,
    multipart: {
      file: { name: 'cover.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') },
    },
  });
  expect(r.status()).toBe(415);
  const body = await r.json();
  expect(body.error.code).toBe('UNSUPPORTED_COVER_FORMAT');
});

test('too-small image is rejected with COVER_DIMENSIONS_TOO_SMALL', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const hdr = { Cookie: instructor.cookieHeader };
  const create = await request.post(`${API_BASE}/courses`, {
    headers: hdr,
    data: { title: 'Cover Test', description: 'd' },
  });
  const course = await create.json();
  const tinyPath = join(__dirname, 'fixtures', 'cover-640x480.jpg');
  const tiny = readFileSync(tinyPath);
  const r = await request.put(`${API_BASE}/courses/${course.id}/cover`, {
    headers: hdr,
    multipart: { file: { name: 'tiny.jpg', mimeType: 'image/jpeg', buffer: tiny } },
  });
  expect(r.status()).toBe(400);
  const body = await r.json();
  expect(body.error.code).toBe('COVER_DIMENSIONS_TOO_SMALL');
  expect(body.error.details).toEqual({ width: 640, height: 480 });
});
```

- [ ] **Step 2: Generate the two fixtures (deterministic, committed)**

Run from the worktree root:

```bash
mkdir -p apps/api-e2e/src/fixtures
node -e "
const sharp = require('sharp');
const fs = require('fs');
Promise.all([
  sharp({ create: { width: 1280, height: 720, channels: 3, background: { r: 200, g: 100, b: 50 } } })
    .jpeg().toBuffer().then(b => fs.writeFileSync('apps/api-e2e/src/fixtures/cover-1280x720.jpg', b)),
  sharp({ create: { width: 640, height: 480, channels: 3, background: { r: 50, g: 100, b: 200 } } })
    .jpeg().toBuffer().then(b => fs.writeFileSync('apps/api-e2e/src/fixtures/cover-640x480.jpg', b)),
]);
"
ls -la apps/api-e2e/src/fixtures/
```

Expected: two `.jpg` files, the 1280×720 one ~20-50 KB, the 640×480 one smaller.

- [ ] **Step 3: Run the cover e2e**

```bash
pnpm nx e2e api-e2e -- --grep "cover"
```

Expected: all three tests pass. If any test fails on env: ensure the api-e2e dev server has `LEARNWREN_COVER_BUCKET=fake-bucket LEARNWREN_COVER_PUBLIC_BASE_URL=http://localhost:9199/v0/b/fake-bucket/o` set (likely via `apps/api/.env.local` or the existing api-e2e env wiring). If env wiring is missing, add a minimal `apps/api/.env.local` update or document it in the spec's setup.

- [ ] **Step 4: Commit**

```bash
git add apps/api-e2e/src/cover.e2e-spec.ts apps/api-e2e/src/fixtures/cover-1280x720.jpg apps/api-e2e/src/fixtures/cover-640x480.jpg
git commit -m "test(api-e2e): cover image upload + validation + replace + remove golden path"
```

---

## Task 14: `LwCoverComponent` — add `imageUrl` and `alt` inputs

**Files:**
- Modify: `libs/web-ui/src/lib/cover/lw-cover.component.ts`
- Modify: `libs/web-ui/src/lib/cover/lw-cover.component.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to `libs/web-ui/src/lib/cover/lw-cover.component.spec.ts`:

```ts
describe('LwCoverComponent — image input', () => {
  it('renders an <img> with src + alt when imageUrl is set, and omits the glyph', () => {
    const fixture = TestBed.createComponent(LwCoverComponent);
    fixture.componentRef.setInput('imageUrl', 'https://cdn/x.jpg');
    fixture.componentRef.setInput('alt', 'Intro to TypeScript');
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    const img = host.querySelector('img.lw-cover-image') as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toBe('https://cdn/x.jpg');
    expect(img!.getAttribute('alt')).toBe('Intro to TypeScript');
    expect(img!.getAttribute('loading')).toBe('lazy');
    expect(host.querySelector('.lw-cover-glyph')).toBeNull();
  });

  it('falls back to the glyph render path when imageUrl is unset', () => {
    const fixture = TestBed.createComponent(LwCoverComponent);
    fixture.componentRef.setInput('glyph', 'W');
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('img.lw-cover-image')).toBeNull();
    expect(host.querySelector('.lw-cover-glyph')!.textContent).toContain('W');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
pnpm nx test web-ui --testFile=lw-cover.component.spec.ts
```

- [ ] **Step 3: Add the inputs and template branch**

Replace `libs/web-ui/src/lib/cover/lw-cover.component.ts` with:

```ts
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type LwCoverTone = 'ochre' | 'moss' | 'clay' | 'ink' | 'paper' | 'bark';

@Component({
  selector: 'lw-cover',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (imageUrl()) {
      <img class="lw-cover-image" [src]="imageUrl()" [alt]="alt()" loading="lazy" />
    } @else {
      <span class="lw-cover-glyph">{{ glyph() }}</span>
      @if (label()) {
        <span class="lw-cover-label">{{ label() }}</span>
      }
    }
    <ng-content></ng-content>
  `,
  host: {
    class: 'lw-cover',
    '[attr.data-tone]': 'tone()',
    '[style.height.px]': 'height()',
  },
})
export class LwCoverComponent {
  readonly tone = input<LwCoverTone>('ink');
  readonly glyph = input('');
  readonly label = input('');
  readonly height = input(140);
  readonly imageUrl = input<string | undefined>(undefined);
  readonly alt = input('');
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm nx test web-ui --testFile=lw-cover.component.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add libs/web-ui/src/lib/cover/lw-cover.component.ts libs/web-ui/src/lib/cover/lw-cover.component.spec.ts
git commit -m "feat(web-ui): LwCoverComponent renders image when imageUrl input is set"
```

---

## Task 15: Wire `coverImageUrl` into catalog rendering (card + detail)

**Files:**
- Modify: `libs/web-catalog/src/lib/components/course-card/course-card.component.html`
- Modify: `libs/web-catalog/src/lib/course-detail-page/course-detail-page.component.html`

- [ ] **Step 1: Inspect the current card template**

```bash
sed -n '1,30p' libs/web-catalog/src/lib/components/course-card/course-card.component.html
```

Identify the `<lw-cover ...>` element. Add `[imageUrl]="course().coverImageUrl"` and `[alt]="course().title"` to it.

- [ ] **Step 2: Inspect the current detail template**

```bash
sed -n '1,40p' libs/web-catalog/src/lib/course-detail-page/course-detail-page.component.html
```

Find its `<lw-cover ...>`. Add `[imageUrl]="course()?.coverImageUrl"` and `[alt]="course()?.title ?? ''"`.

- [ ] **Step 3: Run the web-catalog unit suite**

```bash
pnpm nx test web-catalog
```

Expected: green. Existing card/detail tests should still pass — the new inputs are optional. If a card test pins HTML structure, update it to allow either `<img>` or `<span class="lw-cover-glyph">` based on the test's `coverImageUrl` fixture.

- [ ] **Step 4: Commit**

```bash
git add libs/web-catalog/src/lib/components/course-card/course-card.component.html libs/web-catalog/src/lib/course-detail-page/course-detail-page.component.html
git commit -m "feat(web-catalog): pass coverImageUrl from summary/detail into LwCoverComponent"
```

---

## Task 16: `CourseCoverService` — HTTP wrapper

**Files:**
- Create: `libs/web-courses/src/lib/cover/course-cover.service.ts`
- Create: `libs/web-courses/src/lib/cover/course-cover.service.spec.ts`

- [ ] **Step 1: Write the failing test**

`libs/web-courses/src/lib/cover/course-cover.service.spec.ts`:

```ts
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { CourseId } from '@learnwren/shared-data-models';

import { CourseCoverService } from './course-cover.service';

const CID = 'c1' as CourseId;

describe('CourseCoverService', () => {
  let svc: CourseCoverService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [CourseCoverService],
    });
    svc = TestBed.inject(CourseCoverService);
    http = TestBed.inject(HttpTestingController);
  });

  it('PUTs multipart/form-data with field "file" to /api/courses/:id/cover', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'cover.jpg', { type: 'image/jpeg' });
    const p = svc.upload(CID, file);
    const req = http.expectOne(`/api/courses/${CID}/cover`);
    expect(req.request.method).toBe('PUT');
    const body = req.request.body as FormData;
    expect(body.has('file')).toBe(true);
    expect((body.get('file') as File).name).toBe('cover.jpg');
    req.flush({
      coverImageUrl: 'https://cdn/x.jpg?v=1',
      updatedAt: '2026-05-25T12:00:00.000Z',
    });
    await expect(p).resolves.toEqual({
      coverImageUrl: 'https://cdn/x.jpg?v=1',
      updatedAt: '2026-05-25T12:00:00.000Z',
    });
  });

  it('DELETEs /api/courses/:id/cover', async () => {
    const p = svc.remove(CID);
    const req = http.expectOne(`/api/courses/${CID}/cover`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await expect(p).resolves.toBeUndefined();
  });

  it('validateLocally rejects non-jpeg/png', () => {
    const f = new File([new Uint8Array([0])], 'x.gif', { type: 'image/gif' });
    const r = svc.validateLocally(f);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/JPEG or PNG/);
  });

  it('validateLocally rejects files over 10 MB', () => {
    const f = new File([new Uint8Array(10_000_001)], 'x.jpg', { type: 'image/jpeg' });
    const r = svc.validateLocally(f);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/10 MB/);
  });

  it('validateLocally accepts a 1 KB JPEG', () => {
    const f = new File([new Uint8Array(1024)], 'x.jpg', { type: 'image/jpeg' });
    expect(svc.validateLocally(f)).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run — expect import failure**

```bash
pnpm nx test web-courses --testFile=course-cover.service.spec.ts
```

- [ ] **Step 3: Implement the service**

`libs/web-courses/src/lib/cover/course-cover.service.ts`:

```ts
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { CourseId, ISODateString } from '@learnwren/shared-data-models';

const MAX_BYTES = 10_000_000;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png']);

export interface UploadCoverResult {
  coverImageUrl: string;
  updatedAt: ISODateString;
}

export type LocalValidation = { ok: true } | { ok: false; reason: string };

@Injectable({ providedIn: 'root' })
export class CourseCoverService {
  private readonly http = inject(HttpClient);

  validateLocally(file: File): LocalValidation {
    if (!ALLOWED_MIME.has(file.type)) {
      return { ok: false, reason: 'Cover image must be JPEG or PNG.' };
    }
    if (file.size > MAX_BYTES) {
      return { ok: false, reason: 'Cover image exceeds the 10 MB limit.' };
    }
    return { ok: true };
  }

  upload(courseId: CourseId, file: File): Promise<UploadCoverResult> {
    const form = new FormData();
    form.append('file', file, file.name);
    return firstValueFrom(
      this.http.put<UploadCoverResult>(`/api/courses/${courseId}/cover`, form, {
        withCredentials: true,
      }),
    );
  }

  remove(courseId: CourseId): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`/api/courses/${courseId}/cover`, { withCredentials: true }),
    );
  }
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm nx test web-courses --testFile=course-cover.service.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add libs/web-courses/src/lib/cover/course-cover.service.ts libs/web-courses/src/lib/cover/course-cover.service.spec.ts
git commit -m "feat(web-courses): add CourseCoverService HTTP wrapper with local MIME/size validation"
```

---

## Task 17: `CourseCoverUploaderComponent` — uploader with state machine

**Files:**
- Create: `libs/web-courses/src/lib/cover/course-cover-uploader.component.ts`
- Create: `libs/web-courses/src/lib/cover/course-cover-uploader.component.html`
- Create: `libs/web-courses/src/lib/cover/course-cover-uploader.component.spec.ts`

- [ ] **Step 1: Write the failing test**

`libs/web-courses/src/lib/cover/course-cover-uploader.component.spec.ts`:

```ts
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CourseId } from '@learnwren/shared-data-models';

import { CourseCoverService } from './course-cover.service';
import { CourseCoverUploaderComponent } from './course-cover-uploader.component';

const CID = 'c1' as CourseId;

function makeFile(type = 'image/jpeg', size = 1024): File {
  return new File([new Uint8Array(size)], 'cover.jpg', { type });
}

describe('CourseCoverUploaderComponent', () => {
  let svc: { upload: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn>; validateLocally: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    svc = {
      upload: vi.fn(),
      remove: vi.fn(),
      validateLocally: vi.fn().mockReturnValue({ ok: true }),
    };
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, CourseCoverUploaderComponent],
      providers: [{ provide: CourseCoverService, useValue: svc }],
    });
  });

  it('starts in idle and emits coverChanged with the new URL on successful upload', async () => {
    svc.upload.mockResolvedValue({
      coverImageUrl: 'https://cdn/c1.jpg?v=1',
      updatedAt: '2026-05-25T12:00:00.000Z',
    });
    const fixture = TestBed.createComponent(CourseCoverUploaderComponent);
    fixture.componentRef.setInput('courseId', CID);
    fixture.detectChanges();
    const emissions: Array<{ coverImageUrl: string | undefined; updatedAt: string }> = [];
    fixture.componentInstance.coverChanged.subscribe((e) => emissions.push(e));

    await fixture.componentInstance.onFileSelected(makeFile());
    expect(svc.upload).toHaveBeenCalledWith(CID, expect.any(File));
    expect(emissions).toEqual([
      { coverImageUrl: 'https://cdn/c1.jpg?v=1', updatedAt: '2026-05-25T12:00:00.000Z' },
    ]);
    expect(fixture.componentInstance.state()).toEqual({ kind: 'idle' });
  });

  it('moves to failed and surfaces the local validation reason without calling upload', async () => {
    svc.validateLocally.mockReturnValue({ ok: false, reason: 'Cover image must be JPEG or PNG.' });
    const fixture = TestBed.createComponent(CourseCoverUploaderComponent);
    fixture.componentRef.setInput('courseId', CID);
    fixture.detectChanges();

    await fixture.componentInstance.onFileSelected(makeFile('image/gif'));
    expect(svc.upload).not.toHaveBeenCalled();
    const s = fixture.componentInstance.state();
    expect(s.kind).toBe('failed');
    if (s.kind === 'failed') expect(s.reason).toBe('Cover image must be JPEG or PNG.');
  });

  it('moves to failed on HTTP error and exposes the API error code/message', async () => {
    svc.upload.mockRejectedValue({
      error: { error: { code: 'COVER_DIMENSIONS_TOO_SMALL', message: 'too small' } },
    });
    const fixture = TestBed.createComponent(CourseCoverUploaderComponent);
    fixture.componentRef.setInput('courseId', CID);
    fixture.detectChanges();

    await fixture.componentInstance.onFileSelected(makeFile());
    const s = fixture.componentInstance.state();
    expect(s.kind).toBe('failed');
    if (s.kind === 'failed') expect(s.reason).toContain('too small');
  });

  it('emits coverChanged with undefined URL on remove', async () => {
    svc.remove.mockResolvedValue(undefined);
    const fixture = TestBed.createComponent(CourseCoverUploaderComponent);
    fixture.componentRef.setInput('courseId', CID);
    fixture.componentRef.setInput('currentCoverUrl', 'https://cdn/c1.jpg?v=1');
    fixture.detectChanges();
    const emissions: Array<{ coverImageUrl: string | undefined; updatedAt: string }> = [];
    fixture.componentInstance.coverChanged.subscribe((e) => emissions.push(e));

    await fixture.componentInstance.onRemove();
    expect(svc.remove).toHaveBeenCalledWith(CID);
    expect(emissions[0].coverImageUrl).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — expect import failure**

```bash
pnpm nx test web-courses --testFile=course-cover-uploader.component.spec.ts
```

- [ ] **Step 3: Implement the component**

`libs/web-courses/src/lib/cover/course-cover-uploader.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, EventEmitter, Output, inject, input, signal } from '@angular/core';

import type { CourseId, ISODateString } from '@learnwren/shared-data-models';
import { LwButtonDirective, LwCardComponent, LwCoverComponent, LwProgressComponent } from '@learnwren/web-ui';

import { CourseCoverService } from './course-cover.service';

export type UploaderState =
  | { kind: 'idle' }
  | { kind: 'uploading' }
  | { kind: 'failed'; reason: string };

@Component({
  selector: 'lib-course-cover-uploader',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LwButtonDirective, LwCardComponent, LwCoverComponent, LwProgressComponent],
  templateUrl: './course-cover-uploader.component.html',
})
export class CourseCoverUploaderComponent {
  private readonly svc = inject(CourseCoverService);

  readonly courseId = input.required<CourseId>();
  readonly currentCoverUrl = input<string | undefined>(undefined);

  @Output() readonly coverChanged = new EventEmitter<{
    coverImageUrl: string | undefined;
    updatedAt: ISODateString;
  }>();

  readonly state = signal<UploaderState>({ kind: 'idle' });

  async onFileSelected(file: File): Promise<void> {
    const local = this.svc.validateLocally(file);
    if (!local.ok) {
      this.state.set({ kind: 'failed', reason: local.reason });
      return;
    }
    this.state.set({ kind: 'uploading' });
    try {
      const out = await this.svc.upload(this.courseId(), file);
      this.coverChanged.emit({ coverImageUrl: out.coverImageUrl, updatedAt: out.updatedAt });
      this.state.set({ kind: 'idle' });
    } catch (err) {
      this.state.set({ kind: 'failed', reason: this.extractReason(err) });
    }
  }

  onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) void this.onFileSelected(file);
    input.value = '';
  }

  async onRemove(): Promise<void> {
    this.state.set({ kind: 'uploading' });
    try {
      await this.svc.remove(this.courseId());
      this.coverChanged.emit({
        coverImageUrl: undefined,
        updatedAt: new Date().toISOString() as ISODateString,
      });
      this.state.set({ kind: 'idle' });
    } catch (err) {
      this.state.set({ kind: 'failed', reason: this.extractReason(err) });
    }
  }

  onRetry(): void {
    this.state.set({ kind: 'idle' });
  }

  private extractReason(err: unknown): string {
    const body = (err as { error?: { error?: { message?: string } } })?.error?.error;
    return body?.message ?? 'Cover image upload failed.';
  }
}
```

`libs/web-courses/src/lib/cover/course-cover-uploader.component.html`:

```html
<lw-card>
  <div class="space-y-3">
    <h2 class="text-lg">Cover image</h2>

    <div class="flex items-start gap-4">
      <div class="w-[200px] shrink-0">
        <lw-cover
          [imageUrl]="currentCoverUrl()"
          [alt]="'Course cover'"
          [tone]="'paper'"
          [glyph]="'W'"
        ></lw-cover>
      </div>

      <div class="flex-1 space-y-2">
        @switch (state().kind) {
          @case ('uploading') {
            <lw-progress></lw-progress>
            <p class="text-sm text-ink-3">Uploading…</p>
          }
          @case ('failed') {
            <p class="text-sm text-red-600" data-testid="cover-error">{{ state().reason }}</p>
            <button lwButton type="button" (click)="onRetry()">Try again</button>
          }
          @default {
            <label class="inline-block">
              <input
                type="file"
                accept="image/jpeg,image/png"
                class="sr-only"
                (change)="onFileInput($event)"
                data-testid="cover-file-input"
              />
              <span lwButton role="button">{{ currentCoverUrl() ? 'Replace cover' : 'Upload cover' }}</span>
            </label>
            @if (currentCoverUrl()) {
              <button lwButton type="button" (click)="onRemove()" data-testid="cover-remove">
                Remove cover
              </button>
            }
            <p class="text-xs text-ink-3">JPEG or PNG, at least 1280×720 pixels, max 10 MB.</p>
          }
        }
      </div>
    </div>
  </div>
</lw-card>
```

> The `@switch` over `state().kind` and `state().reason` access requires either narrowing-friendly access or a local computed. If the template fails strict template type checking on `state().reason`, replace the failed branch with a small `@if (failedState(); as f) { … {{ f.reason }} … }` helper computed on the component (`readonly failedState = computed(() => this.state().kind === 'failed' ? this.state() as Extract<UploaderState, { kind: 'failed' }> : null);`).

- [ ] **Step 4: Run — expect PASS**

```bash
pnpm nx test web-courses --testFile=course-cover-uploader.component.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add libs/web-courses/src/lib/cover/course-cover-uploader.component.ts libs/web-courses/src/lib/cover/course-cover-uploader.component.html libs/web-courses/src/lib/cover/course-cover-uploader.component.spec.ts
git commit -m "feat(web-courses): add CourseCoverUploaderComponent with idle/uploading/failed states"
```

---

## Task 18: Wire `CourseCoverUploaderComponent` into the course editor

**Files:**
- Modify: `libs/web-courses/src/lib/course-editor-page/course-editor-page.component.ts`
- Modify: `libs/web-courses/src/lib/course-editor-page/course-editor-page.component.html`
- Modify: `libs/web-courses/src/lib/course-editor-page/course-editor-page.component.spec.ts` (if it exists and asserts component composition)

- [ ] **Step 1: Add import + handler in the editor component**

In `libs/web-courses/src/lib/course-editor-page/course-editor-page.component.ts`:

1. Add to the `imports: [...]` array on the `@Component` decorator: `CourseCoverUploaderComponent` (and import it at the top: `import { CourseCoverUploaderComponent } from '../cover/course-cover-uploader.component';`).
2. Add a handler method:

```ts
  onCoverChanged(e: { coverImageUrl: string | undefined; updatedAt: import('@learnwren/shared-data-models').ISODateString }): void {
    const t = this.tree();
    if (!t) return;
    this.tree.set({
      ...t,
      course: { ...t.course, coverImageUrl: e.coverImageUrl, updatedAt: e.updatedAt },
    });
  }
```

- [ ] **Step 2: Place the uploader in the template**

In `libs/web-courses/src/lib/course-editor-page/course-editor-page.component.html`, between `<lib-course-publish-bar ...></lib-course-publish-bar>` (and its sibling `lib-publish-eligibility-panel`) and `<lib-course-meta-panel ...></lib-course-meta-panel>`, insert:

```html
<lib-course-cover-uploader
  [courseId]="tree()!.course.id"
  [currentCoverUrl]="tree()!.course.coverImageUrl"
  (coverChanged)="onCoverChanged($event)"
></lib-course-cover-uploader>
```

- [ ] **Step 3: Re-run the editor's existing unit tests**

```bash
pnpm nx test web-courses
```

Expected: green. If `course-editor-page.component.spec.ts` shallow-renders and complains about the unknown `lib-course-cover-uploader` selector, add `CourseCoverUploaderComponent` to its TestBed imports (or override with `NO_ERRORS_SCHEMA` per the existing convention in that file).

- [ ] **Step 4: Commit**

```bash
git add libs/web-courses/src/lib/course-editor-page/
git commit -m "feat(web-courses): host CourseCoverUploaderComponent in the course editor"
```

---

## Task 19: `apps/web-e2e` cover Playwright spec

**Files:**
- Create: `apps/web-e2e/src/course-cover.spec.ts`

- [ ] **Step 1: Inspect the existing web-e2e sign-in pattern**

```bash
head -60 apps/web-e2e/src/courses.spec.ts
```

The repo's web-e2e specs define `registerAndPromoteInstructor()` and `API_BASE` inline at the top of each spec file rather than importing from `_helpers/`. Mirror that pattern.

- [ ] **Step 2: Create the spec**

`apps/web-e2e/src/course-cover.spec.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import * as admin from 'firebase-admin';

if (admin.apps.length === 0) {
  process.env['FIREBASE_AUTH_EMULATOR_HOST'] = '127.0.0.1:9099';
  process.env['FIRESTORE_EMULATOR_HOST'] = '127.0.0.1:8080';
  admin.initializeApp({ projectId: 'demo-learnwren' });
}

const API_BASE = 'http://localhost:3333/api';

async function registerAndPromoteInstructor(): Promise<{ email: string; password: string }> {
  const email = `web-e2e-cover-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;
  const password = 'Aa1!aaaaaaaa';
  const reg = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, displayName: 'I' }),
  });
  expect(reg.status).toBe(201);
  const { uid } = (await reg.json()) as { uid: string };
  await admin.auth().updateUser(uid, { emailVerified: true });
  await admin.auth().setCustomUserClaims(uid, { role: 'INSTRUCTOR' });
  await admin.firestore().collection('users').doc(uid).update({ role: 'INSTRUCTOR' });
  return { email, password };
}

test('instructor uploads a cover and sees it persist across reload', async ({ page }) => {
  const creds = await registerAndPromoteInstructor();

  // Sign in via the SPA
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(creds.email);
  await page.getByLabel('Password').fill(creds.password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/courses|\/dashboard/);

  // Create a course via the UI (or shortcut by POST if a helper exists)
  await page.goto('/courses/new');
  await page.getByLabel('Title').fill('Cover E2E');
  await page.getByLabel('Description').fill('d');
  await page.getByRole('button', { name: /create/i }).click();
  await page.waitForURL(/\/courses\/.+\/edit/);

  await expect(page.getByText('Cover image')).toBeVisible();

  const fixturePath = join(__dirname, 'fixtures', 'cover-1280x720.jpg');
  await page.setInputFiles('[data-testid="cover-file-input"]', fixturePath);

  const img = page.locator('lib-course-cover-uploader lw-cover img.lw-cover-image');
  await expect(img).toBeVisible({ timeout: 5_000 });
  const src = await img.getAttribute('src');
  expect(src).toMatch(/course-covers\/.+\/cover\.jpg\?v=/);

  await page.reload();
  await expect(page.locator('lib-course-cover-uploader lw-cover img.lw-cover-image')).toHaveAttribute(
    'src',
    src!,
  );
});
```

- [ ] **Step 3: Generate the web-e2e fixture (same approach as api-e2e)**

```bash
mkdir -p apps/web-e2e/src/fixtures
node -e "
const sharp = require('sharp');
const fs = require('fs');
sharp({ create: { width: 1280, height: 720, channels: 3, background: { r: 100, g: 200, b: 100 } } })
  .jpeg().toBuffer().then(b => fs.writeFileSync('apps/web-e2e/src/fixtures/cover-1280x720.jpg', b));
"
ls -la apps/web-e2e/src/fixtures/
```

- [ ] **Step 4: Run the web-e2e cover spec**

```bash
pnpm nx e2e web-e2e -- --grep "cover"
```

Expected: green. If the helper names differ, fix the imports before re-running.

- [ ] **Step 5: Commit**

```bash
git add apps/web-e2e/src/course-cover.spec.ts apps/web-e2e/src/fixtures/cover-1280x720.jpg
git commit -m "test(web-e2e): instructor uploads cover image and sees it persist across reload"
```

---

## Task 20: Reconcile spec docs and close drift

**Files:**
- Modify: `docs/use-cases/02-course-authoring.md`
- Modify: `docs/quality/spec-drift-report.md`
- Modify: `README.md`
- Modify: `docs/USER_GUIDE.md`

- [ ] **Step 1: Update UC-02-01**

In `docs/use-cases/02-course-authoring.md`, remove `cover image (JPEG or PNG, min 1280x720 pixels)` from the optional fields list at step 3 of UC-02-01, and remove Extension `5c`. Add a new use case **UC-02-05 — Manage Course Cover Image** below UC-02-04 with this body (preserving the file's fenced-code-block style):

```
Use Case: UC-02-05 — Manage Course Cover Image

Goal in Context:  An instructor sets, replaces, or removes the cover image on
                  an existing course they own.
Scope:            Learn Wren Platform
Level:            Primary Task
Primary Actor:    Instructor
Preconditions:    - The instructor is authenticated with the Instructor role.
                  - The instructor owns the course.
                  - The instructor is in the course editor.
Success End:      The course's cover image is updated (set, replaced, or
                  removed). The catalogue immediately reflects the change.
Failed End:       No change is persisted. The previous cover (or absence) is
                  retained.

Main Success Scenario:
  1. The instructor opens the Cover Image panel in the course editor.
  2. The instructor clicks "Upload cover" (or "Replace cover" if one is
     already set) and selects a JPEG or PNG file at least 1280x720 pixels and
     no larger than 10 MB.
  3. The system uploads the file, resizes it to a canonical JPEG within
     1920x1080 pixels, and stores it.
  4. The system updates the course with the new cover URL.
  5. The editor immediately renders the new cover.

Extensions:
  2a. The file is not JPEG or PNG:
      1. The system displays: "Cover image must be JPEG or PNG."
      2. The use case returns to step 2.

  2b. The file exceeds 10 MB:
      1. The system displays: "Cover image exceeds the 10 MB limit."
      2. The use case returns to step 2.

  3a. The image dimensions are smaller than 1280x720:
      1. The system displays: "Cover image must be JPEG or PNG, at least
         1280x720 pixels."
      2. The use case returns to step 2.

  *. The instructor clicks "Remove cover":
      1. The system deletes the cover image and clears it from the course.
      2. The editor reverts to the default placeholder cover.
```

In the same file, update the drift NOTE at the top: change `cover image (UC-02-01) is unbuilt` to `cover image is now an editor-only flow (UC-02-05) rather than a create-form field (UC-02-01)`.

- [ ] **Step 2: Close the drift entry**

In `docs/quality/spec-drift-report.md`, locate the bullet:

```
- **NOT IMPLEMENTED** · High — No `coverImage` field anywhere ...
```

Replace it with:

```
- **RECONCILED** · 2026-05-25 — UC-02-01 cover-image bullet removed from create-form; new UC-02-05 documents the editor-only upload/replace/remove flow. `Course.coverImageUrl` is set via `PUT /api/courses/:cid/cover` (`libs/api-courses/src/lib/cover/`).
```

Also update the EP-02 row in the drift summary table at the top of the file: change `cover image absent` to remove that phrase from the description (leaving the rest of the row intact).

- [ ] **Step 3: Update `README.md`**

Find the bullet/line in `README.md` that describes cover image as deferred (search for "cover"). Replace with a description that reflects the shipped state: cover images can be uploaded from the course editor.

- [ ] **Step 4: Update `docs/USER_GUIDE.md`**

Add a short section (one or two paragraphs) under the course-authoring portion of the guide describing how to upload/replace/remove a cover image, the supported formats (JPEG/PNG), and the dimension/size requirements.

- [ ] **Step 5: Commit**

```bash
git add docs/use-cases/02-course-authoring.md docs/quality/spec-drift-report.md README.md docs/USER_GUIDE.md
git commit -m "docs(cover-image): reconcile UC-02-01 + add UC-02-05; close drift entry; document the editor flow"
```

---

## Task 21: Full quality gate pass (lint + test + build + e2e)

- [ ] **Step 1: Lint**

```bash
NX_DAEMON=false pnpm nx run-many -t lint -p shared-data-models,api-courses,web-courses,web-ui,web-catalog,api,web --skip-nx-cache
```

Expected: clean. Fix any new lint findings (likely unused imports or import ordering in the files this plan touched).

- [ ] **Step 2: Unit tests**

```bash
NX_DAEMON=false pnpm nx run-many -t test -p shared-data-models,api-courses,web-courses,web-ui,web-catalog --skip-nx-cache
```

Expected: green.

- [ ] **Step 3: Build**

```bash
NX_DAEMON=false pnpm nx run-many -t build -p api,web --skip-nx-cache
```

Expected: green.

- [ ] **Step 4: api-e2e**

```bash
NX_DAEMON=false pnpm nx e2e api-e2e --skip-nx-cache
```

Expected: green, including the new `cover.e2e-spec.ts`.

- [ ] **Step 5: web-e2e**

```bash
NX_DAEMON=false pnpm nx e2e web-e2e --skip-nx-cache
```

Expected: green.

- [ ] **Step 6: CRAP report regeneration**

The repo regenerates the CRAP report after each slice via the `crap` script in `package.json` (`pnpm crap` → runs coverage across all projects and then `tools/crap/crap.mjs`):

```bash
pnpm crap
```

This rewrites `docs/quality/crap-report.md` and the per-project mutation reports. Commit on its own:

```bash
git add docs/quality/
git commit -m "chore(quality): regenerate CRAP report after cover image upload slice"
```

---

## Task 22: Merge the worktree branch back to main

- [ ] **Step 1: From the worktree, ensure clean tree**

```bash
git status
```

Expected: working tree clean.

- [ ] **Step 2: Switch to the parent repo and merge with --no-ff (per branch-isolation preference)**

In the parent repo at `/Volumes/Artie-Storage/github-repos/learnwren`:

```bash
git checkout main
git merge --no-ff feat/cover-image-upload -m "Merge feat/cover-image-upload: cover image upload (UC-02-05)"
git log --oneline -5
```

- [ ] **Step 3: Clean up the worktree**

```bash
git worktree remove ../learnwren-cover-image
git branch -d feat/cover-image-upload
```

---

## Notes & Gotchas

1. **`pnpm nx test` filter flag** — vitest in this repo accepts `--testFile=<basename>`. If a step's filter does not match any file, try `pnpm nx test <project> -- <basename>` (vitest's own filter), or run the full project suite.

2. **`sharp` native binaries on macOS arm64** — `pnpm add sharp` should pull the correct prebuilt. If install warns about missing binaries, run `pnpm rebuild sharp` once.

3. **`updatedAt` skew** — `CoverImageService` computes `updatedAt` locally (the value baked into `?v=`) while `CoursesRepository.updateCourse` writes its own `nowIso()` to Firestore. They differ by at most a millisecond. Treat the URL as the cache key; treat the row as the source of truth for the timestamp. Anyone needing the exact stored value must re-fetch.

4. **api-e2e env** — the cover spec relies on `LEARNWREN_COVER_STORAGE` defaulting to `fake`. If the api-e2e harness sets `LEARNWREN_COVER_STORAGE=firebase` unconditionally, the spec will try to hit real Firebase Storage and fail. Verify the env wiring before assuming a regression.

5. **Worktree node_modules symlink** — `node_modules` is symlinked into this worktree. `git add -A` would re-add it ignoring `.gitignore`. Always stage individual paths.

6. **NX daemon and stale `.d.ts`** — per `[[feedback_worktree_dist_hazard]]`, prefer `NX_DAEMON=false` for the final quality gate run. If a build inexplicably reports a missing export that you can see in source, nuke `dist/` and `tsconfig.tsbuildinfo` in the parent repo before retrying.

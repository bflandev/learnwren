# Lesson Materials (EP-04) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver UC-04-01 (an instructor attaches, renames, and removes supplementary files on a lesson) plus UC-04-02's owner-gated signed download endpoint, so EP-04 is a complete, demoable slice.

**Architecture:** A new `materials/` submodule inside `libs/api-courses` (a NestJS `MaterialsModule`, mutually `forwardRef`-wired with `CoursesModule` exactly like `VideoModule`) and a new `materials/` submodule inside `libs/web-courses`. Material metadata lives in a top-level Firestore `materials` collection (deny-all rules, Admin-SDK-only). Files reach a dedicated Cloud Storage bucket via a signed single-PUT URL; a `real`/`fake` storage split (mirroring `video.config.ts`) routes local dev + e2e through internal passthrough endpoints so the slice is fully CI-runnable with no GCP credentials.

**Tech Stack:** NestJS 11, Angular 21, `firebase-admin` 13 (`@google-cloud/storage` `getSignedUrl`/`getMetadata`/`save`/`download`), `class-validator`, Vitest 4, Stryker 9, Playwright Test.

**Foundation specs:**
- `docs/superpowers/specs/2026-05-21-lesson-materials-design.md` (this slice — authoritative)
- `docs/superpowers/specs/2026-05-13-video-upload-slice-a-design.md` (slice A — `PENDING_UPLOAD → READY` rhythm, `VideoOwnerGuard`, cascade-delete)
- `docs/superpowers/specs/2026-05-14-video-playback-slice-c-design.md` (slice C — `EnrollmentOrOwnerGuard`, `real`/`fake` storage seam)

**Repo conventions to follow:**
- Conventional Commits (`feat(shared-data-models):`, `feat(api-courses):`, `feat(web-courses):`, `test(api-e2e):`, `test(web-e2e):`, `docs(...)`, `chore(quality):`).
- Branded ID types come from `@learnwren/shared-data-models` and use the `EntityId<'Name'>` helper in `common.ts` (the spec's §2.1 wrote `Brand<...>` illustratively — the real codebase convention is `EntityId<...>`; use `EntityId`).
- ISO date strings on the wire; string-literal unions, not enums.
- The error envelope on the wire is `{ error: { code, message, details? } }` (see `CoursesExceptionFilter`).
- DI tokens from `@learnwren/api-firebase` (`FIRESTORE`, `FIREBASE_STORAGE`).
- After every task: the targeted `pnpm nx test <project>` must pass; commit a fully-green increment.
- Stryker `stryker.api-courses.config.mjs` globs `libs/api-courses/src/lib/**/*.ts` — new `materials/` files are mutated automatically; do not touch the config.
- Keep the `> [!NOTE] DOCUMENT STATUS: DRAFT` banner on the design spec until Task 24.

**Pre-flight check** (run before Task 1):

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test
git status                                                   # must be clean
git checkout -b ep-04-lesson-materials
```

---

## Task 1: Add the `Material` type to `shared-data-models`

**Files:**
- Modify: `libs/shared-data-models/src/lib/common.ts`
- Create: `libs/shared-data-models/src/lib/material.ts`
- Create: `libs/shared-data-models/src/lib/material.spec.ts`
- Modify: `libs/shared-data-models/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/shared-data-models/src/lib/material.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { CourseId, ISODateString, LessonId, MaterialId, UserId } from './common';
import {
  MATERIAL_CONTENT_TYPE_BY_EXTENSION,
  MATERIAL_MAX_SIZE_BYTES,
  SUPPORTED_MATERIAL_EXTENSIONS,
  type Material,
} from './material';

describe('material model', () => {
  it('exposes the six supported extensions', () => {
    expect([...SUPPORTED_MATERIAL_EXTENSIONS]).toEqual([
      'pdf',
      'docx',
      'pptx',
      'xlsx',
      'txt',
      'zip',
    ]);
  });

  it('maps every extension to a canonical MIME type', () => {
    for (const ext of SUPPORTED_MATERIAL_EXTENSIONS) {
      expect(MATERIAL_CONTENT_TYPE_BY_EXTENSION[ext]).toMatch(/\//);
    }
    expect(MATERIAL_CONTENT_TYPE_BY_EXTENSION.pdf).toBe('application/pdf');
    expect(MATERIAL_CONTENT_TYPE_BY_EXTENSION.txt).toBe('text/plain');
  });

  it('caps the file size at 50 MiB', () => {
    expect(MATERIAL_MAX_SIZE_BYTES).toBe(52_428_800);
  });

  it('accepts a fully-populated Material literal', () => {
    const m: Material = {
      id: 'mat1' as MaterialId,
      ownerInstructorId: 'u1' as UserId,
      courseId: 'c1' as CourseId,
      lessonId: 'l1' as LessonId,
      displayName: 'Worksheet',
      originalFilename: 'worksheet.pdf',
      extension: 'pdf',
      contentType: 'application/pdf',
      sizeBytes: 1234,
      state: 'READY',
      storage: { bucket: 'b', path: 'materials/mat1/source.pdf' },
      createdAt: '2026-05-21T10:00:00.000Z' as ISODateString,
      updatedAt: '2026-05-21T10:00:00.000Z' as ISODateString,
    };
    expect(m.state).toBe('READY');
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

Run: `pnpm nx test shared-data-models`
Expected: FAIL — `Cannot find module './material'` / `MaterialId` not exported from `./common`.

- [ ] **Step 3: Add the `MaterialId` brand**

In `libs/shared-data-models/src/lib/common.ts`, after the `VideoKeyId` line, add:

```ts
export type MaterialId = EntityId<'Material'>;
```

- [ ] **Step 4: Create the material model**

Create `libs/shared-data-models/src/lib/material.ts`:

```ts
import type { CourseId, ISODateString, LessonId, MaterialId, UserId } from './common';

export type MaterialState = 'PENDING_UPLOAD' | 'READY';

export const SUPPORTED_MATERIAL_EXTENSIONS = [
  'pdf',
  'docx',
  'pptx',
  'xlsx',
  'txt',
  'zip',
] as const;

export type SupportedMaterialExtension = (typeof SUPPORTED_MATERIAL_EXTENSIONS)[number];

/**
 * Canonical MIME type per extension. Stored as the object's content-type, used
 * to bind the signed upload URL, and applied to the download response. Browsers
 * report unreliable MIME for the Office formats, so the server derives the
 * content-type from the (reliable) file extension instead.
 */
export const MATERIAL_CONTENT_TYPE_BY_EXTENSION: Record<SupportedMaterialExtension, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  zip: 'application/zip',
};

/** Hard per-file size limit — 50 MiB. */
export const MATERIAL_MAX_SIZE_BYTES = 50 * 1024 * 1024;

export interface MaterialStorageRef {
  bucket: string;
  path: string;
}

export interface Material {
  id: MaterialId;
  ownerInstructorId: UserId; // denormalised — guard-time auth
  courseId: CourseId;        // denormalised — cascade-delete + future enrolment check
  lessonId: LessonId;
  displayName: string;       // instructor-customisable; defaults to originalFilename
  originalFilename: string;  // used for the download Content-Disposition
  extension: SupportedMaterialExtension;
  contentType: string;       // canonical MIME from MATERIAL_CONTENT_TYPE_BY_EXTENSION
  sizeBytes: number;         // actual size, set at upload-complete
  state: MaterialState;
  storage: MaterialStorageRef;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
```

- [ ] **Step 5: Export the model from the library entry point**

In `libs/shared-data-models/src/index.ts`, after the `export * from './lib/video';` line, add:

```ts
export * from './lib/material';
```

- [ ] **Step 6: Run tests + typecheck, expect pass**

Run: `pnpm nx test shared-data-models && pnpm typecheck`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add libs/shared-data-models/src/lib/common.ts libs/shared-data-models/src/lib/material.ts libs/shared-data-models/src/lib/material.spec.ts libs/shared-data-models/src/index.ts
git commit -m "feat(shared-data-models): add Material model for EP-04"
```

---

## Task 2: Materials config (`materials.config.ts`)

**Files:**
- Create: `libs/api-courses/src/lib/materials/materials.config.ts`
- Create: `libs/api-courses/src/lib/materials/materials.config.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/api-courses/src/lib/materials/materials.config.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { readMaterialsConfigFromEnv } from './materials.config';

describe('readMaterialsConfigFromEnv', () => {
  it('defaults to fake storage and a dev bucket outside production', () => {
    const cfg = readMaterialsConfigFromEnv({});
    expect(cfg.storageImpl).toBe('fake');
    expect(cfg.materialsBucket).toBe('learnwren-dev-materials');
    expect(cfg.uploadUrlTtlSec).toBe(900);
    expect(cfg.downloadUrlTtlSec).toBe(900);
  });

  it('honours an explicit bucket name', () => {
    const cfg = readMaterialsConfigFromEnv({ LEARNWREN_MATERIALS_BUCKET: 'my-bucket' });
    expect(cfg.materialsBucket).toBe('my-bucket');
  });

  it('requires the bucket name in production', () => {
    expect(() =>
      readMaterialsConfigFromEnv({
        NODE_ENV: 'production',
        LEARNWREN_MATERIALS_STORAGE_FAKE: undefined,
      }),
    ).toThrow(/LEARNWREN_MATERIALS_BUCKET/);
  });

  it('defaults to real storage in production', () => {
    const cfg = readMaterialsConfigFromEnv({
      NODE_ENV: 'production',
      LEARNWREN_MATERIALS_BUCKET: 'prod-bucket',
    });
    expect(cfg.storageImpl).toBe('real');
  });

  it('rejects fake storage when NODE_ENV=production', () => {
    expect(() =>
      readMaterialsConfigFromEnv({
        NODE_ENV: 'production',
        LEARNWREN_MATERIALS_BUCKET: 'prod-bucket',
        LEARNWREN_MATERIALS_STORAGE_FAKE: 'true',
      }),
    ).toThrow(/production/i);
  });

  it('treats any non-"true" fake flag as real', () => {
    const cfg = readMaterialsConfigFromEnv({
      LEARNWREN_MATERIALS_BUCKET: 'b',
      LEARNWREN_MATERIALS_STORAGE_FAKE: 'yes',
    });
    expect(cfg.storageImpl).toBe('real');
  });

  it('parses TTL overrides', () => {
    const cfg = readMaterialsConfigFromEnv({
      LEARNWREN_MATERIALS_DOWNLOAD_URL_TTL_SEC: '600',
      LEARNWREN_MATERIALS_UPLOAD_URL_TTL_SEC: '120',
    });
    expect(cfg.downloadUrlTtlSec).toBe(600);
    expect(cfg.uploadUrlTtlSec).toBe(120);
  });

  it('rejects a non-positive TTL', () => {
    expect(() =>
      readMaterialsConfigFromEnv({ LEARNWREN_MATERIALS_DOWNLOAD_URL_TTL_SEC: '0' }),
    ).toThrow(/positive number/);
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

Run: `pnpm nx test api-courses -- materials.config`
Expected: FAIL — `Cannot find module './materials.config'`.

- [ ] **Step 3: Create the config module**

Create `libs/api-courses/src/lib/materials/materials.config.ts`:

```ts
export const MATERIALS_CONFIG = Symbol.for('learnwren.api-courses.materials.config');

export interface MaterialsConfig {
  materialsBucket: string;
  storageImpl: 'real' | 'fake';
  uploadUrlTtlSec: number;
  downloadUrlTtlSec: number;
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

export function readMaterialsConfigFromEnv(env: NodeJS.ProcessEnv): MaterialsConfig {
  // Outside production the materials stack defaults to its credential-free fake
  // mode, so `nx serve` and the e2e suite boot with no GCP project or buckets.
  const isProduction = env['NODE_ENV'] === 'production';

  const materialsBucket = isProduction
    ? readRequired(env, 'LEARNWREN_MATERIALS_BUCKET')
    : (env['LEARNWREN_MATERIALS_BUCKET'] ?? 'learnwren-dev-materials');

  const fakeRaw = env['LEARNWREN_MATERIALS_STORAGE_FAKE'];
  let storageImpl: 'real' | 'fake';
  if (fakeRaw === 'true') {
    storageImpl = 'fake';
  } else if (fakeRaw === undefined) {
    storageImpl = isProduction ? 'real' : 'fake';
  } else {
    storageImpl = 'real';
  }
  if (storageImpl === 'fake' && isProduction) {
    throw new Error(
      'LEARNWREN_MATERIALS_STORAGE_FAKE=true is rejected when NODE_ENV=production.',
    );
  }

  return {
    materialsBucket,
    storageImpl,
    uploadUrlTtlSec: readPositiveNumber(env, 'LEARNWREN_MATERIALS_UPLOAD_URL_TTL_SEC', '900'),
    downloadUrlTtlSec: readPositiveNumber(env, 'LEARNWREN_MATERIALS_DOWNLOAD_URL_TTL_SEC', '900'),
  };
}
```

- [ ] **Step 4: Run the test, expect pass**

Run: `pnpm nx test api-courses -- materials.config`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/materials/materials.config.ts libs/api-courses/src/lib/materials/materials.config.spec.ts
git commit -m "feat(api-courses): add materials storage config"
```

---

## Task 3: Material error codes + exception classes

**Files:**
- Create: `libs/api-courses/src/lib/materials/errors/material-error.codes.ts`
- Create: `libs/api-courses/src/lib/materials/errors/material.exception.ts`
- Create: `libs/api-courses/src/lib/materials/errors/material.exception.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/api-courses/src/lib/materials/errors/material.exception.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  InvalidMaterialStateException,
  MaterialException,
  MaterialNotFoundException,
  NotMaterialOwnerException,
  UnsupportedMaterialTypeException,
  UploadObjectMissingException,
  UploadObjectSizeMismatchException,
} from './material.exception';

describe('material exceptions', () => {
  it('MaterialNotFoundException maps to 404 MATERIAL_NOT_FOUND', () => {
    const e = new MaterialNotFoundException();
    expect(e).toBeInstanceOf(MaterialException);
    expect(e.code).toBe('MATERIAL_NOT_FOUND');
    expect(e.status).toBe(404);
  });

  it('NotMaterialOwnerException maps to 403 NOT_MATERIAL_OWNER', () => {
    const e = new NotMaterialOwnerException();
    expect(e.code).toBe('NOT_MATERIAL_OWNER');
    expect(e.status).toBe(403);
  });

  it('UnsupportedMaterialTypeException maps to 400 UNSUPPORTED_MATERIAL_TYPE', () => {
    const e = new UnsupportedMaterialTypeException();
    expect(e.code).toBe('UNSUPPORTED_MATERIAL_TYPE');
    expect(e.status).toBe(400);
  });

  it('InvalidMaterialStateException carries the current state in details', () => {
    const e = new InvalidMaterialStateException('READY');
    expect(e.code).toBe('INVALID_MATERIAL_STATE');
    expect(e.status).toBe(409);
    expect(e.details).toEqual({ currentState: 'READY' });
  });

  it('UploadObjectMissingException maps to 422', () => {
    expect(new UploadObjectMissingException().status).toBe(422);
    expect(new UploadObjectMissingException().code).toBe('UPLOAD_OBJECT_MISSING');
  });

  it('UploadObjectSizeMismatchException maps to 422', () => {
    expect(new UploadObjectSizeMismatchException().status).toBe(422);
    expect(new UploadObjectSizeMismatchException().code).toBe('UPLOAD_OBJECT_SIZE_MISMATCH');
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

Run: `pnpm nx test api-courses -- material.exception`
Expected: FAIL — `Cannot find module './material.exception'`.

- [ ] **Step 3: Create the error codes**

Create `libs/api-courses/src/lib/materials/errors/material-error.codes.ts`:

```ts
export type MaterialErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNSUPPORTED_MATERIAL_TYPE'
  | 'MATERIAL_NOT_FOUND'
  | 'NOT_MATERIAL_OWNER'
  | 'INVALID_MATERIAL_STATE'
  | 'UPLOAD_OBJECT_MISSING'
  | 'UPLOAD_OBJECT_SIZE_MISMATCH'
  | 'INTERNAL';
```

- [ ] **Step 4: Create the exception classes**

Create `libs/api-courses/src/lib/materials/errors/material.exception.ts`:

```ts
import type { MaterialErrorCode } from './material-error.codes';

export class MaterialException extends Error {
  constructor(
    public readonly code: MaterialErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'MaterialException';
  }
}

export class UnsupportedMaterialTypeException extends MaterialException {
  constructor() {
    super(
      'UNSUPPORTED_MATERIAL_TYPE',
      'Unsupported file type. Supported formats: PDF, DOCX, PPTX, XLSX, TXT, ZIP.',
      400,
    );
  }
}

export class MaterialNotFoundException extends MaterialException {
  constructor() {
    super('MATERIAL_NOT_FOUND', 'Material not found.', 404);
  }
}

export class NotMaterialOwnerException extends MaterialException {
  constructor() {
    super('NOT_MATERIAL_OWNER', 'You do not have access to this material.', 403);
  }
}

export class InvalidMaterialStateException extends MaterialException {
  constructor(currentState: string) {
    super(
      'INVALID_MATERIAL_STATE',
      `Operation is not valid in state ${currentState}.`,
      409,
      { currentState },
    );
  }
}

export class UploadObjectMissingException extends MaterialException {
  constructor() {
    super(
      'UPLOAD_OBJECT_MISSING',
      'No uploaded object exists at the upload destination.',
      422,
    );
  }
}

export class UploadObjectSizeMismatchException extends MaterialException {
  constructor() {
    super(
      'UPLOAD_OBJECT_SIZE_MISMATCH',
      'Uploaded object size exceeds the allowed limit.',
      422,
    );
  }
}
```

- [ ] **Step 5: Run the test, expect pass**

Run: `pnpm nx test api-courses -- material.exception`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/api-courses/src/lib/materials/errors
git commit -m "feat(api-courses): add material error codes and exceptions"
```

---

## Task 4: Request DTOs

**Files:**
- Create: `libs/api-courses/src/lib/materials/dto/create-material-upload.dto.ts`
- Create: `libs/api-courses/src/lib/materials/dto/rename-material.dto.ts`
- Create: `libs/api-courses/src/lib/materials/dto/dto.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/api-courses/src/lib/materials/dto/dto.spec.ts`:

```ts
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { MATERIAL_MAX_SIZE_BYTES } from '@learnwren/shared-data-models';

import { CreateMaterialUploadDto } from './create-material-upload.dto';
import { RenameMaterialDto } from './rename-material.dto';

function errors<T extends object>(cls: new () => T, payload: unknown): string[] {
  return validateSync(plainToInstance(cls, payload)).flatMap((e) =>
    Object.values(e.constraints ?? {}),
  );
}

describe('CreateMaterialUploadDto', () => {
  it('accepts a valid payload', () => {
    expect(errors(CreateMaterialUploadDto, { filename: 'notes.pdf', sizeBytes: 1024 })).toEqual([]);
  });

  it('rejects a blank filename', () => {
    expect(errors(CreateMaterialUploadDto, { filename: '', sizeBytes: 1 }).length).toBeGreaterThan(0);
  });

  it('rejects a filename longer than 255 chars', () => {
    expect(
      errors(CreateMaterialUploadDto, { filename: 'a'.repeat(256), sizeBytes: 1 }).length,
    ).toBeGreaterThan(0);
  });

  it('rejects sizeBytes over the 50 MB limit', () => {
    expect(
      errors(CreateMaterialUploadDto, { filename: 'x.pdf', sizeBytes: MATERIAL_MAX_SIZE_BYTES + 1 })
        .length,
    ).toBeGreaterThan(0);
  });

  it('rejects a non-positive size', () => {
    expect(
      errors(CreateMaterialUploadDto, { filename: 'x.pdf', sizeBytes: 0 }).length,
    ).toBeGreaterThan(0);
  });
});

describe('RenameMaterialDto', () => {
  it('accepts a valid display name', () => {
    expect(errors(RenameMaterialDto, { displayName: 'My Worksheet' })).toEqual([]);
  });

  it('rejects a blank display name', () => {
    expect(errors(RenameMaterialDto, { displayName: '' }).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

Run: `pnpm nx test api-courses -- materials/dto`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `CreateMaterialUploadDto`**

Create `libs/api-courses/src/lib/materials/dto/create-material-upload.dto.ts`:

```ts
import { IsInt, IsNotEmpty, IsString, Max, MaxLength, Min } from 'class-validator';

import { MATERIAL_MAX_SIZE_BYTES } from '@learnwren/shared-data-models';

export class CreateMaterialUploadDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  filename!: string;

  @IsInt()
  @Min(1)
  @Max(MATERIAL_MAX_SIZE_BYTES)
  sizeBytes!: number;
}
```

- [ ] **Step 4: Create `RenameMaterialDto`**

Create `libs/api-courses/src/lib/materials/dto/rename-material.dto.ts`:

```ts
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RenameMaterialDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  displayName!: string;
}
```

- [ ] **Step 5: Run the test, expect pass**

Run: `pnpm nx test api-courses -- materials/dto`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/api-courses/src/lib/materials/dto
git commit -m "feat(api-courses): add material request DTOs"
```

---

## Task 5: `MaterialsRepository`

**Files:**
- Create: `libs/api-courses/src/lib/materials/materials.repository.ts`
- Create: `libs/api-courses/src/lib/materials/materials.repository.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/api-courses/src/lib/materials/materials.repository.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type {
  CourseId,
  ISODateString,
  LessonId,
  Material,
  MaterialId,
  UserId,
} from '@learnwren/shared-data-models';

import { createFakeFirestore } from '../testing/fake-firestore';
import { MaterialsRepository } from './materials.repository';

function material(id: string, lessonId: string, over: Partial<Material> = {}): Material {
  return {
    id: id as MaterialId,
    ownerInstructorId: 'u1' as UserId,
    courseId: 'c1' as CourseId,
    lessonId: lessonId as LessonId,
    displayName: 'Doc',
    originalFilename: 'doc.pdf',
    extension: 'pdf',
    contentType: 'application/pdf',
    sizeBytes: 10,
    state: 'PENDING_UPLOAD',
    storage: { bucket: 'b', path: `materials/${id}/source.pdf` },
    createdAt: '2026-05-21T10:00:00.000Z' as ISODateString,
    updatedAt: '2026-05-21T10:00:00.000Z' as ISODateString,
    ...over,
  };
}

describe('MaterialsRepository', () => {
  it('newId returns a non-empty string', () => {
    const repo = new MaterialsRepository(createFakeFirestore() as never);
    expect(repo.newId<MaterialId>().length).toBeGreaterThan(0);
  });

  it('create then get round-trips a material', async () => {
    const db = createFakeFirestore();
    const repo = new MaterialsRepository(db as never);
    await repo.create(material('m1', 'l1'));
    const got = await repo.get('m1' as MaterialId);
    expect(got?.id).toBe('m1');
  });

  it('get returns null for a missing material', async () => {
    const repo = new MaterialsRepository(createFakeFirestore() as never);
    expect(await repo.get('nope' as MaterialId)).toBeNull();
  });

  it('listByLesson returns only that lesson’s materials', async () => {
    const repo = new MaterialsRepository(createFakeFirestore() as never);
    await repo.create(material('m1', 'l1'));
    await repo.create(material('m2', 'l1'));
    await repo.create(material('m3', 'l2'));
    const got = await repo.listByLesson('l1' as LessonId);
    expect(got.map((m) => m.id).sort()).toEqual(['m1', 'm2']);
  });

  it('update patches fields', async () => {
    const repo = new MaterialsRepository(createFakeFirestore() as never);
    await repo.create(material('m1', 'l1'));
    await repo.update('m1' as MaterialId, { state: 'READY', sizeBytes: 99 });
    const got = await repo.get('m1' as MaterialId);
    expect(got?.state).toBe('READY');
    expect(got?.sizeBytes).toBe(99);
  });

  it('delete removes the document', async () => {
    const repo = new MaterialsRepository(createFakeFirestore() as never);
    await repo.create(material('m1', 'l1'));
    await repo.delete('m1' as MaterialId);
    expect(await repo.get('m1' as MaterialId)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

Run: `pnpm nx test api-courses -- materials.repository`
Expected: FAIL — `Cannot find module './materials.repository'`.

- [ ] **Step 3: Create the repository**

Create `libs/api-courses/src/lib/materials/materials.repository.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';

import { FIRESTORE, type FirestoreHandle } from '@learnwren/api-firebase';
import type { LessonId, Material, MaterialId } from '@learnwren/shared-data-models';

@Injectable()
export class MaterialsRepository {
  constructor(@Inject(FIRESTORE) private readonly db: FirestoreHandle) {}

  newId<T extends string>(): T {
    return this.db.collection('_ids').doc().id as T;
  }

  async get(matId: MaterialId): Promise<Material | null> {
    const snap = await this.db.collection('materials').doc(matId).get();
    return snap.exists ? (snap.data() as Material) : null;
  }

  async listByLesson(lessonId: LessonId): Promise<Material[]> {
    const q = await this.db
      .collection('materials')
      .where('lessonId', '==', lessonId)
      .get();
    return q.docs.map((d) => d.data() as Material);
  }

  async create(material: Material): Promise<void> {
    await this.db.collection('materials').doc(material.id).set(material);
  }

  async update(matId: MaterialId, patch: Partial<Material>): Promise<void> {
    await this.db.collection('materials').doc(matId).update(patch);
  }

  async delete(matId: MaterialId): Promise<void> {
    await this.db.collection('materials').doc(matId).delete();
  }
}
```

- [ ] **Step 4: Run the test, expect pass**

Run: `pnpm nx test api-courses -- materials.repository`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/materials/materials.repository.ts libs/api-courses/src/lib/materials/materials.repository.spec.ts
git commit -m "feat(api-courses): add MaterialsRepository"
```

---

## Task 6: `MaterialsStorageAdapter` (real/fake storage seam)

**Files:**
- Create: `libs/api-courses/src/lib/materials/materials-storage.adapter.ts`
- Create: `libs/api-courses/src/lib/materials/materials-storage.adapter.spec.ts`

The adapter is the only place that touches Cloud Storage. In `fake` mode (local dev + e2e) the signed URLs become internal-API passthrough paths, because the Firebase Storage emulator cannot mint or verify GCS v4 signed URLs.

- [ ] **Step 1: Write the failing test**

Create `libs/api-courses/src/lib/materials/materials-storage.adapter.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import type { MaterialsConfig } from './materials.config';
import { MaterialsStorageAdapter } from './materials-storage.adapter';

const fakeCfg: MaterialsConfig = {
  materialsBucket: 'b',
  storageImpl: 'fake',
  uploadUrlTtlSec: 900,
  downloadUrlTtlSec: 900,
};
const realCfg: MaterialsConfig = { ...fakeCfg, storageImpl: 'real' };

/** Minimal Cloud Storage double — one configurable `file` object per test. */
function storageWith(file: Record<string, unknown>) {
  return { bucket: () => ({ file: () => file }) } as never;
}

describe('MaterialsStorageAdapter — fake mode', () => {
  it('signUploadUrl returns an internal passthrough URL', async () => {
    const a = new MaterialsStorageAdapter(storageWith({}), fakeCfg);
    const r = await a.signUploadUrl({
      bucket: 'b',
      path: 'materials/m1/source.pdf',
      contentType: 'application/pdf',
      materialId: 'm1',
    });
    expect(r.uploadUrl).toBe('/api/internal/fake-materials/m1');
    expect(typeof r.expiresAt).toBe('string');
  });

  it('signDownloadUrl returns an internal passthrough URL', async () => {
    const a = new MaterialsStorageAdapter(storageWith({}), fakeCfg);
    const r = await a.signDownloadUrl({
      bucket: 'b',
      path: 'materials/m1/source.pdf',
      filename: 'doc.pdf',
      contentType: 'application/pdf',
      materialId: 'm1',
      ttlSec: 900,
    });
    expect(r.downloadUrl).toBe('/api/internal/fake-materials/m1');
  });
});

describe('MaterialsStorageAdapter — real mode', () => {
  it('signUploadUrl asks Cloud Storage for a v4 write URL bound to the content-type', async () => {
    const getSignedUrl = vi.fn().mockResolvedValue(['https://signed.example/upload']);
    const a = new MaterialsStorageAdapter(storageWith({ getSignedUrl }), realCfg);
    const r = await a.signUploadUrl({
      bucket: 'b',
      path: 'materials/m1/source.pdf',
      contentType: 'application/pdf',
      materialId: 'm1',
    });
    expect(r.uploadUrl).toBe('https://signed.example/upload');
    expect(getSignedUrl).toHaveBeenCalledWith(
      expect.objectContaining({ version: 'v4', action: 'write', contentType: 'application/pdf' }),
    );
  });

  it('signDownloadUrl requests a read URL with attachment disposition', async () => {
    const getSignedUrl = vi.fn().mockResolvedValue(['https://signed.example/download']);
    const a = new MaterialsStorageAdapter(storageWith({ getSignedUrl }), realCfg);
    const r = await a.signDownloadUrl({
      bucket: 'b',
      path: 'materials/m1/source.pdf',
      filename: 'doc.pdf',
      contentType: 'application/pdf',
      materialId: 'm1',
      ttlSec: 900,
    });
    expect(r.downloadUrl).toBe('https://signed.example/download');
    const opts = getSignedUrl.mock.calls[0]![0] as Record<string, unknown>;
    expect(opts['action']).toBe('read');
    expect(String(opts['responseDisposition'])).toContain('attachment');
    expect(String(opts['responseDisposition'])).toContain('doc.pdf');
  });

  it('headObject returns the numeric size', async () => {
    const getMetadata = vi.fn().mockResolvedValue([{ size: '4096' }]);
    const a = new MaterialsStorageAdapter(storageWith({ getMetadata }), realCfg);
    expect(await a.headObject({ bucket: 'b', path: 'p' })).toEqual({ size: 4096 });
  });

  it('headObject returns null when the object is missing (404)', async () => {
    const getMetadata = vi.fn().mockRejectedValue({ code: 404 });
    const a = new MaterialsStorageAdapter(storageWith({ getMetadata }), realCfg);
    expect(await a.headObject({ bucket: 'b', path: 'p' })).toBeNull();
  });

  it('deleteObject swallows a 404', async () => {
    const del = vi.fn().mockRejectedValue({ code: 404 });
    const a = new MaterialsStorageAdapter(storageWith({ delete: del }), realCfg);
    await expect(a.deleteObject({ bucket: 'b', path: 'p' })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

Run: `pnpm nx test api-courses -- materials-storage`
Expected: FAIL — `Cannot find module './materials-storage.adapter'`.

- [ ] **Step 3: Create the adapter**

Create `libs/api-courses/src/lib/materials/materials-storage.adapter.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';

import { FIREBASE_STORAGE, type FirebaseStorageHandle } from '@learnwren/api-firebase';

import { MATERIALS_CONFIG, type MaterialsConfig } from './materials.config';

export interface SignedUploadUrl {
  uploadUrl: string;
  expiresAt: string;
}

export interface SignedDownloadUrl {
  downloadUrl: string;
  expiresAt: string;
}

export interface MaterialObjectMetadata {
  size: number;
}

export interface MaterialsStoragePort {
  signUploadUrl(input: {
    bucket: string;
    path: string;
    contentType: string;
    materialId: string;
  }): Promise<SignedUploadUrl>;
  headObject(input: { bucket: string; path: string }): Promise<MaterialObjectMetadata | null>;
  signDownloadUrl(input: {
    bucket: string;
    path: string;
    filename: string;
    contentType: string;
    materialId: string;
    ttlSec: number;
  }): Promise<SignedDownloadUrl>;
  deleteObject(input: { bucket: string; path: string }): Promise<void>;
}

/** Strip characters that would break an HTTP Content-Disposition header value. */
function sanitizeFilename(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.replace(/["\\\r\n]/g, '_');
}

@Injectable()
export class MaterialsStorageAdapter implements MaterialsStoragePort {
  constructor(
    @Inject(FIREBASE_STORAGE) private readonly storage: FirebaseStorageHandle,
    @Inject(MATERIALS_CONFIG) private readonly cfg: MaterialsConfig,
  ) {}

  async signUploadUrl(input: {
    bucket: string;
    path: string;
    contentType: string;
    materialId: string;
  }): Promise<SignedUploadUrl> {
    const expiresMs = Date.now() + this.cfg.uploadUrlTtlSec * 1000;
    if (this.cfg.storageImpl === 'fake') {
      return {
        uploadUrl: `/api/internal/fake-materials/${input.materialId}`,
        expiresAt: new Date(expiresMs).toISOString(),
      };
    }
    const file = this.storage.bucket(input.bucket).file(input.path);
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      contentType: input.contentType,
      expires: expiresMs,
    });
    return { uploadUrl: url, expiresAt: new Date(expiresMs).toISOString() };
  }

  async headObject(input: {
    bucket: string;
    path: string;
  }): Promise<MaterialObjectMetadata | null> {
    const file = this.storage.bucket(input.bucket).file(input.path);
    try {
      const [meta] = await file.getMetadata();
      const size = typeof meta.size === 'string' ? Number(meta.size) : (meta.size as number);
      return { size };
    } catch (err) {
      if ((err as { code?: number }).code === 404) return null;
      throw err;
    }
  }

  async signDownloadUrl(input: {
    bucket: string;
    path: string;
    filename: string;
    contentType: string;
    materialId: string;
    ttlSec: number;
  }): Promise<SignedDownloadUrl> {
    const expiresMs = Date.now() + input.ttlSec * 1000;
    if (this.cfg.storageImpl === 'fake') {
      return {
        downloadUrl: `/api/internal/fake-materials/${input.materialId}`,
        expiresAt: new Date(expiresMs).toISOString(),
      };
    }
    const file = this.storage.bucket(input.bucket).file(input.path);
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: expiresMs,
      responseDisposition: `attachment; filename="${sanitizeFilename(input.filename)}"`,
      responseType: input.contentType,
    });
    return { downloadUrl: url, expiresAt: new Date(expiresMs).toISOString() };
  }

  async deleteObject(input: { bucket: string; path: string }): Promise<void> {
    const file = this.storage.bucket(input.bucket).file(input.path);
    try {
      await file.delete();
    } catch (err) {
      if ((err as { code?: number }).code === 404) return;
      throw err;
    }
  }
}
```

- [ ] **Step 4: Run the test, expect pass**

Run: `pnpm nx test api-courses -- materials-storage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/materials/materials-storage.adapter.ts libs/api-courses/src/lib/materials/materials-storage.adapter.spec.ts
git commit -m "feat(api-courses): add MaterialsStorageAdapter with real/fake seam"
```

---

## Task 7: `MaterialsService`

**Files:**
- Create: `libs/api-courses/src/lib/materials/materials.service.ts`
- Create: `libs/api-courses/src/lib/materials/materials.service.spec.ts`

`MaterialsService` is the orchestration seam. It is constructed with the repository, the storage port, and the config. The spec uses small hand-rolled fakes for the repo and storage so the tests stay readable.

- [ ] **Step 1: Write the failing test**

Create `libs/api-courses/src/lib/materials/materials.service.spec.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';

import type {
  CourseId,
  ISODateString,
  LessonId,
  Material,
  MaterialId,
  UserId,
} from '@learnwren/shared-data-models';
import { MATERIAL_MAX_SIZE_BYTES } from '@learnwren/shared-data-models';

import type { MaterialsConfig } from './materials.config';
import type { MaterialsStoragePort } from './materials-storage.adapter';
import { MaterialsService } from './materials.service';

const cfg: MaterialsConfig = {
  materialsBucket: 'b',
  storageImpl: 'fake',
  uploadUrlTtlSec: 900,
  downloadUrlTtlSec: 900,
};

/** In-memory MaterialsRepository double. */
function fakeRepo() {
  const store = new Map<string, Material>();
  let seq = 0;
  return {
    store,
    newId: <T extends string>() => `mat-${++seq}` as T,
    get: async (id: MaterialId) => store.get(id) ?? null,
    listByLesson: async (lid: LessonId) =>
      [...store.values()].filter((m) => m.lessonId === lid),
    create: async (m: Material) => void store.set(m.id, m),
    update: async (id: MaterialId, patch: Partial<Material>) => {
      store.set(id, { ...store.get(id)!, ...patch });
    },
    delete: async (id: MaterialId) => void store.delete(id),
  };
}

/** Configurable MaterialsStoragePort double. */
function fakeStorage(over: Partial<MaterialsStoragePort> = {}): {
  port: MaterialsStoragePort;
  deleted: string[];
} {
  const deleted: string[] = [];
  const port: MaterialsStoragePort = {
    signUploadUrl: async (i) => ({ uploadUrl: `up://${i.materialId}`, expiresAt: 'T' }),
    headObject: async () => ({ size: 100 }),
    signDownloadUrl: async (i) => ({ downloadUrl: `down://${i.materialId}`, expiresAt: 'T' }),
    deleteObject: async (i) => void deleted.push(i.path),
    ...over,
  };
  return { port, deleted };
}

function seedMaterial(id: string, over: Partial<Material> = {}): Material {
  return {
    id: id as MaterialId,
    ownerInstructorId: 'u1' as UserId,
    courseId: 'c1' as CourseId,
    lessonId: 'l1' as LessonId,
    displayName: 'doc.pdf',
    originalFilename: 'doc.pdf',
    extension: 'pdf',
    contentType: 'application/pdf',
    sizeBytes: 10,
    state: 'PENDING_UPLOAD',
    storage: { bucket: 'b', path: `materials/${id}/source.pdf` },
    createdAt: '2026-05-21T10:00:00.000Z' as ISODateString,
    updatedAt: '2026-05-21T10:00:00.000Z' as ISODateString,
    ...over,
  };
}

describe('MaterialsService.createUploadUrl', () => {
  let repo: ReturnType<typeof fakeRepo>;

  beforeEach(() => {
    repo = fakeRepo();
  });

  it('creates a PENDING_UPLOAD doc and returns the upload URL', async () => {
    const svc = new MaterialsService(repo as never, fakeStorage().port, cfg);
    const r = await svc.createUploadUrl({
      uid: 'u1' as UserId,
      courseId: 'c1' as CourseId,
      lessonId: 'l1' as LessonId,
      filename: 'My Notes.PDF',
      sizeBytes: 2048,
    });
    const doc = repo.store.get(r.materialId)!;
    expect(doc.state).toBe('PENDING_UPLOAD');
    expect(doc.extension).toBe('pdf');
    expect(doc.contentType).toBe('application/pdf');
    expect(doc.displayName).toBe('My Notes.PDF');
    expect(doc.originalFilename).toBe('My Notes.PDF');
    expect(doc.storage.path).toBe(`materials/${r.materialId}/source.pdf`);
    expect(r.uploadUrl).toBe(`up://${r.materialId}`);
  });

  it('rejects an unsupported extension', async () => {
    const svc = new MaterialsService(repo as never, fakeStorage().port, cfg);
    await expect(
      svc.createUploadUrl({
        uid: 'u1' as UserId,
        courseId: 'c1' as CourseId,
        lessonId: 'l1' as LessonId,
        filename: 'malware.exe',
        sizeBytes: 1,
      }),
    ).rejects.toThrow(/Unsupported file type/);
    expect(repo.store.size).toBe(0);
  });

  it('rejects a filename with no extension', async () => {
    const svc = new MaterialsService(repo as never, fakeStorage().port, cfg);
    await expect(
      svc.createUploadUrl({
        uid: 'u1' as UserId,
        courseId: 'c1' as CourseId,
        lessonId: 'l1' as LessonId,
        filename: 'README',
        sizeBytes: 1,
      }),
    ).rejects.toThrow(/Unsupported file type/);
  });
});

describe('MaterialsService.complete', () => {
  it('flips PENDING_UPLOAD → READY and records the actual size', async () => {
    const repo = fakeRepo();
    await repo.create(seedMaterial('m1'));
    const svc = new MaterialsService(
      repo as never,
      fakeStorage({ headObject: async () => ({ size: 4096 }) }).port,
      cfg,
    );
    const r = await svc.complete('m1' as MaterialId);
    expect(r.state).toBe('READY');
    expect(r.sizeBytes).toBe(4096);
  });

  it('throws MATERIAL_NOT_FOUND for a missing material', async () => {
    const svc = new MaterialsService(fakeRepo() as never, fakeStorage().port, cfg);
    await expect(svc.complete('nope' as MaterialId)).rejects.toThrow(/not found/i);
  });

  it('throws INVALID_MATERIAL_STATE when not PENDING_UPLOAD', async () => {
    const repo = fakeRepo();
    await repo.create(seedMaterial('m1', { state: 'READY' }));
    const svc = new MaterialsService(repo as never, fakeStorage().port, cfg);
    await expect(svc.complete('m1' as MaterialId)).rejects.toThrow(/not valid in state/i);
  });

  it('throws UPLOAD_OBJECT_MISSING when no object was uploaded', async () => {
    const repo = fakeRepo();
    await repo.create(seedMaterial('m1'));
    const svc = new MaterialsService(
      repo as never,
      fakeStorage({ headObject: async () => null }).port,
      cfg,
    );
    await expect(svc.complete('m1' as MaterialId)).rejects.toThrow(/no uploaded object/i);
  });

  it('throws UPLOAD_OBJECT_SIZE_MISMATCH and deletes the object when oversized', async () => {
    const repo = fakeRepo();
    await repo.create(seedMaterial('m1'));
    const storage = fakeStorage({
      headObject: async () => ({ size: MATERIAL_MAX_SIZE_BYTES * 2 }),
    });
    const svc = new MaterialsService(repo as never, storage.port, cfg);
    await expect(svc.complete('m1' as MaterialId)).rejects.toThrow(/exceeds/i);
    expect(storage.deleted).toContain('materials/m1/source.pdf');
  });
});

describe('MaterialsService.listForLesson', () => {
  it('returns only READY materials, sorted by createdAt ascending', async () => {
    const repo = fakeRepo();
    await repo.create(
      seedMaterial('m2', { state: 'READY', createdAt: '2026-05-21T12:00:00.000Z' as ISODateString }),
    );
    await repo.create(
      seedMaterial('m1', { state: 'READY', createdAt: '2026-05-21T11:00:00.000Z' as ISODateString }),
    );
    await repo.create(seedMaterial('m3', { state: 'PENDING_UPLOAD' }));
    const svc = new MaterialsService(repo as never, fakeStorage().port, cfg);
    const list = await svc.listForLesson('l1' as LessonId);
    expect(list.map((m) => m.id)).toEqual(['m1', 'm2']);
  });
});

describe('MaterialsService.rename', () => {
  it('updates displayName and returns the material', async () => {
    const repo = fakeRepo();
    await repo.create(seedMaterial('m1'));
    const svc = new MaterialsService(repo as never, fakeStorage().port, cfg);
    const r = await svc.rename('m1' as MaterialId, 'Final Notes');
    expect(r.displayName).toBe('Final Notes');
    expect(repo.store.get('m1')!.displayName).toBe('Final Notes');
  });

  it('throws MATERIAL_NOT_FOUND for a missing material', async () => {
    const svc = new MaterialsService(fakeRepo() as never, fakeStorage().port, cfg);
    await expect(svc.rename('nope' as MaterialId, 'X')).rejects.toThrow(/not found/i);
  });
});

describe('MaterialsService.remove', () => {
  it('deletes the storage object and the doc', async () => {
    const repo = fakeRepo();
    await repo.create(seedMaterial('m1'));
    const storage = fakeStorage();
    const svc = new MaterialsService(repo as never, storage.port, cfg);
    await svc.remove('m1' as MaterialId);
    expect(repo.store.has('m1')).toBe(false);
    expect(storage.deleted).toContain('materials/m1/source.pdf');
  });

  it('throws MATERIAL_NOT_FOUND for a missing material', async () => {
    const svc = new MaterialsService(fakeRepo() as never, fakeStorage().port, cfg);
    await expect(svc.remove('nope' as MaterialId)).rejects.toThrow(/not found/i);
  });
});

describe('MaterialsService.buildDownloadUrl', () => {
  it('returns a signed download URL for an existing material', async () => {
    const repo = fakeRepo();
    await repo.create(seedMaterial('m1', { state: 'READY' }));
    const svc = new MaterialsService(repo as never, fakeStorage().port, cfg);
    const r = await svc.buildDownloadUrl('m1' as MaterialId);
    expect(r.downloadUrl).toBe('down://m1');
  });

  it('throws MATERIAL_NOT_FOUND for a missing material', async () => {
    const svc = new MaterialsService(fakeRepo() as never, fakeStorage().port, cfg);
    await expect(svc.buildDownloadUrl('nope' as MaterialId)).rejects.toThrow(/not found/i);
  });
});

describe('MaterialsService.deleteForLesson', () => {
  it('removes every material attached to the lesson', async () => {
    const repo = fakeRepo();
    await repo.create(seedMaterial('m1'));
    await repo.create(seedMaterial('m2'));
    await repo.create(seedMaterial('m3', { lessonId: 'other' as LessonId }));
    const storage = fakeStorage();
    const svc = new MaterialsService(repo as never, storage.port, cfg);
    await svc.deleteForLesson('l1' as LessonId);
    expect(repo.store.has('m1')).toBe(false);
    expect(repo.store.has('m2')).toBe(false);
    expect(repo.store.has('m3')).toBe(true);
    expect(storage.deleted).toHaveLength(2);
  });

  it('is a no-op when the lesson has no materials', async () => {
    const svc = new MaterialsService(fakeRepo() as never, fakeStorage().port, cfg);
    await expect(svc.deleteForLesson('l1' as LessonId)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

Run: `pnpm nx test api-courses -- materials.service`
Expected: FAIL — `Cannot find module './materials.service'`.

- [ ] **Step 3: Create the service**

Create `libs/api-courses/src/lib/materials/materials.service.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';

import type {
  CourseId,
  ISODateString,
  LessonId,
  Material,
  MaterialId,
  SupportedMaterialExtension,
  UserId,
} from '@learnwren/shared-data-models';
import {
  MATERIAL_CONTENT_TYPE_BY_EXTENSION,
  MATERIAL_MAX_SIZE_BYTES,
  SUPPORTED_MATERIAL_EXTENSIONS,
} from '@learnwren/shared-data-models';

import { MATERIALS_CONFIG, type MaterialsConfig } from './materials.config';
import {
  InvalidMaterialStateException,
  MaterialNotFoundException,
  UnsupportedMaterialTypeException,
  UploadObjectMissingException,
  UploadObjectSizeMismatchException,
} from './errors/material.exception';
import { MaterialsRepository } from './materials.repository';
import {
  MaterialsStorageAdapter,
  type MaterialsStoragePort,
} from './materials-storage.adapter';

/** Actual-vs-limit tolerance at upload-complete (covers minor storage overhead). */
const SIZE_TOLERANCE = 1.05;

function nowIso(): ISODateString {
  return new Date().toISOString() as ISODateString;
}

/** Parse + validate the file extension from a filename. The browser-reported
 *  MIME type is unreliable for Office formats, so the extension is authoritative. */
function parseExtension(filename: string): SupportedMaterialExtension {
  const dot = filename.lastIndexOf('.');
  const ext = dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
  if (!(SUPPORTED_MATERIAL_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new UnsupportedMaterialTypeException();
  }
  return ext as SupportedMaterialExtension;
}

export interface CreateUploadUrlInput {
  uid: UserId;
  courseId: CourseId;
  lessonId: LessonId;
  filename: string;
  sizeBytes: number;
}

export interface CreateUploadUrlResult {
  materialId: MaterialId;
  uploadUrl: string;
  expiresAt: string;
}

export interface DownloadUrlResult {
  downloadUrl: string;
  expiresAt: string;
}

@Injectable()
export class MaterialsService {
  constructor(
    private readonly repo: MaterialsRepository,
    @Inject(MaterialsStorageAdapter) private readonly storage: MaterialsStoragePort,
    @Inject(MATERIALS_CONFIG) private readonly cfg: MaterialsConfig,
  ) {}

  async createUploadUrl(input: CreateUploadUrlInput): Promise<CreateUploadUrlResult> {
    const extension = parseExtension(input.filename);
    const contentType = MATERIAL_CONTENT_TYPE_BY_EXTENSION[extension];
    const materialId = this.repo.newId<MaterialId>();
    const path = `materials/${materialId}/source.${extension}`;
    const now = nowIso();
    const material: Material = {
      id: materialId,
      ownerInstructorId: input.uid,
      courseId: input.courseId,
      lessonId: input.lessonId,
      displayName: input.filename,
      originalFilename: input.filename,
      extension,
      contentType,
      sizeBytes: input.sizeBytes,
      state: 'PENDING_UPLOAD',
      storage: { bucket: this.cfg.materialsBucket, path },
      createdAt: now,
      updatedAt: now,
    };
    await this.repo.create(material);
    const signed = await this.storage.signUploadUrl({
      bucket: this.cfg.materialsBucket,
      path,
      contentType,
      materialId,
    });
    return { materialId, uploadUrl: signed.uploadUrl, expiresAt: signed.expiresAt };
  }

  async complete(matId: MaterialId): Promise<Material> {
    const m = await this.repo.get(matId);
    if (!m) throw new MaterialNotFoundException();
    if (m.state !== 'PENDING_UPLOAD') throw new InvalidMaterialStateException(m.state);

    const head = await this.storage.headObject({
      bucket: m.storage.bucket,
      path: m.storage.path,
    });
    if (!head) throw new UploadObjectMissingException();
    if (head.size > MATERIAL_MAX_SIZE_BYTES * SIZE_TOLERANCE) {
      await this.storage
        .deleteObject({ bucket: m.storage.bucket, path: m.storage.path })
        .catch(() => undefined);
      throw new UploadObjectSizeMismatchException();
    }

    const updatedAt = nowIso();
    await this.repo.update(matId, { state: 'READY', sizeBytes: head.size, updatedAt });
    return { ...m, state: 'READY', sizeBytes: head.size, updatedAt };
  }

  async listForLesson(lessonId: LessonId): Promise<Material[]> {
    const all = await this.repo.listByLesson(lessonId);
    return all
      .filter((m) => m.state === 'READY')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async rename(matId: MaterialId, displayName: string): Promise<Material> {
    const m = await this.repo.get(matId);
    if (!m) throw new MaterialNotFoundException();
    const updatedAt = nowIso();
    await this.repo.update(matId, { displayName, updatedAt });
    return { ...m, displayName, updatedAt };
  }

  async remove(matId: MaterialId): Promise<void> {
    const m = await this.repo.get(matId);
    if (!m) throw new MaterialNotFoundException();
    await this.storage
      .deleteObject({ bucket: m.storage.bucket, path: m.storage.path })
      .catch(() => undefined);
    await this.repo.delete(matId);
  }

  async buildDownloadUrl(matId: MaterialId): Promise<DownloadUrlResult> {
    const m = await this.repo.get(matId);
    if (!m) throw new MaterialNotFoundException();
    return this.storage.signDownloadUrl({
      bucket: m.storage.bucket,
      path: m.storage.path,
      filename: m.originalFilename,
      contentType: m.contentType,
      materialId: m.id,
      ttlSec: this.cfg.downloadUrlTtlSec,
    });
  }

  /** Cascade entry point — called by CoursesService.deleteLesson before the
   *  lesson doc is removed. Best-effort object delete, then doc delete. */
  async deleteForLesson(lessonId: LessonId): Promise<void> {
    const materials = await this.repo.listByLesson(lessonId);
    for (const m of materials) {
      await this.storage
        .deleteObject({ bucket: m.storage.bucket, path: m.storage.path })
        .catch(() => undefined);
      await this.repo.delete(m.id);
    }
  }
}
```

- [ ] **Step 4: Run the test, expect pass**

Run: `pnpm nx test api-courses -- materials.service`
Expected: PASS — all suites green.

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/materials/materials.service.ts libs/api-courses/src/lib/materials/materials.service.spec.ts
git commit -m "feat(api-courses): add MaterialsService"
```

---

## Task 8: Material guards (`MaterialOwnerGuard`, `MaterialAccessGuard`)

**Files:**
- Create: `libs/api-courses/src/lib/materials/types/loaded-material.ts`
- Create: `libs/api-courses/src/lib/materials/material-owner.guard.ts`
- Create: `libs/api-courses/src/lib/materials/material-owner.guard.spec.ts`
- Create: `libs/api-courses/src/lib/materials/material-access.guard.ts`
- Create: `libs/api-courses/src/lib/materials/material-access.guard.spec.ts`

`MaterialOwnerGuard` gates the instructor authoring routes. `MaterialAccessGuard` gates the download route — today owner-only, with a documented `TODO(EP-06)` seam for enrolled students (mirrors `EnrollmentOrOwnerGuard`).

- [ ] **Step 1: Write the failing tests**

Create `libs/api-courses/src/lib/materials/material-owner.guard.spec.ts`:

```ts
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import type { Material, MaterialId } from '@learnwren/shared-data-models';

import { MaterialOwnerGuard } from './material-owner.guard';
import type { MaterialScopedRequest } from './types/loaded-material';

const material = { id: 'm1', ownerInstructorId: 'owner-uid' } as Material;

function ctxFor(req: Partial<MaterialScopedRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as ExecutionContext;
}

function repoReturning(value: Material | null) {
  return { get: async () => value } as never;
}

describe('MaterialOwnerGuard', () => {
  it('passes and attaches the material when the requester owns it', async () => {
    const guard = new MaterialOwnerGuard(repoReturning(material));
    const req: Partial<MaterialScopedRequest> = {
      params: { matId: 'm1' },
      user: { uid: 'owner-uid' } as MaterialScopedRequest['user'],
    };
    expect(await guard.canActivate(ctxFor(req))).toBe(true);
    expect(req.material).toBe(material);
  });

  it('throws MATERIAL_NOT_FOUND when the param is missing', async () => {
    const guard = new MaterialOwnerGuard(repoReturning(material));
    await expect(guard.canActivate(ctxFor({ params: {} }))).rejects.toThrow(/not found/i);
  });

  it('throws MATERIAL_NOT_FOUND when the material does not exist', async () => {
    const guard = new MaterialOwnerGuard(repoReturning(null));
    await expect(
      guard.canActivate(ctxFor({ params: { matId: 'm1' } })),
    ).rejects.toThrow(/not found/i);
  });

  it('throws NOT_MATERIAL_OWNER for a different instructor', async () => {
    const guard = new MaterialOwnerGuard(repoReturning(material));
    await expect(
      guard.canActivate(
        ctxFor({
          params: { matId: 'm1' },
          user: { uid: 'other-uid' } as MaterialScopedRequest['user'],
        }),
      ),
    ).rejects.toThrow(/access/i);
  });
});
```

Create `libs/api-courses/src/lib/materials/material-access.guard.spec.ts`:

```ts
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import type { Material } from '@learnwren/shared-data-models';

import { MaterialAccessGuard } from './material-access.guard';
import type { MaterialScopedRequest } from './types/loaded-material';

const material = { id: 'm1', ownerInstructorId: 'owner-uid', courseId: 'c1' } as Material;

function ctxFor(req: Partial<MaterialScopedRequest>): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => req }) } as ExecutionContext;
}

describe('MaterialAccessGuard', () => {
  it('passes for the course owner', async () => {
    const guard = new MaterialAccessGuard({ get: async () => material } as never);
    const req: Partial<MaterialScopedRequest> = {
      params: { matId: 'm1' },
      user: { uid: 'owner-uid' } as MaterialScopedRequest['user'],
    };
    expect(await guard.canActivate(ctxFor(req))).toBe(true);
    expect(req.material).toBe(material);
  });

  it('throws NOT_MATERIAL_OWNER for a non-owner (enrolled-student access is EP-06)', async () => {
    const guard = new MaterialAccessGuard({ get: async () => material } as never);
    await expect(
      guard.canActivate(
        ctxFor({
          params: { matId: 'm1' },
          user: { uid: 'student-uid' } as MaterialScopedRequest['user'],
        }),
      ),
    ).rejects.toThrow(/access/i);
  });

  it('throws MATERIAL_NOT_FOUND when the material does not exist', async () => {
    const guard = new MaterialAccessGuard({ get: async () => null } as never);
    await expect(
      guard.canActivate(ctxFor({ params: { matId: 'm1' } })),
    ).rejects.toThrow(/not found/i);
  });
});
```

- [ ] **Step 2: Run the tests, expect failure**

Run: `pnpm nx test api-courses -- material-owner.guard material-access.guard`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create the request-augmentation type**

Create `libs/api-courses/src/lib/materials/types/loaded-material.ts`:

```ts
import type { Material } from '@learnwren/shared-data-models';

import type { AuthenticatedRequest } from '@learnwren/api-auth';

export interface MaterialScopedRequest extends AuthenticatedRequest {
  material?: Material;
  params: AuthenticatedRequest['params'] & {
    matId?: string;
    cid?: string;
    mid?: string;
    lid?: string;
  };
}
```

- [ ] **Step 4: Create `MaterialOwnerGuard`**

Create `libs/api-courses/src/lib/materials/material-owner.guard.ts`:

```ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import type { MaterialId } from '@learnwren/shared-data-models';

import {
  MaterialNotFoundException,
  NotMaterialOwnerException,
} from './errors/material.exception';
import { MaterialsRepository } from './materials.repository';
import type { MaterialScopedRequest } from './types/loaded-material';

@Injectable()
export class MaterialOwnerGuard implements CanActivate {
  constructor(private readonly repo: MaterialsRepository) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<MaterialScopedRequest>();
    const matId = req.params?.['matId'] as MaterialId | undefined;
    if (!matId) throw new MaterialNotFoundException();

    const material = await this.repo.get(matId);
    if (!material) throw new MaterialNotFoundException();
    if (material.ownerInstructorId !== req.user?.uid) {
      throw new NotMaterialOwnerException();
    }
    req.material = material;
    return true;
  }
}
```

- [ ] **Step 5: Create `MaterialAccessGuard`**

Create `libs/api-courses/src/lib/materials/material-access.guard.ts`:

```ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import type { MaterialId } from '@learnwren/shared-data-models';

import {
  MaterialNotFoundException,
  NotMaterialOwnerException,
} from './errors/material.exception';
import { MaterialsRepository } from './materials.repository';
import type { MaterialScopedRequest } from './types/loaded-material';

/**
 * Gates the material download endpoint. Today: course-owner only. EP-06 will
 * widen this to enrolled students — mirrors video's EnrollmentOrOwnerGuard.
 */
@Injectable()
export class MaterialAccessGuard implements CanActivate {
  constructor(private readonly repo: MaterialsRepository) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<MaterialScopedRequest>();
    const matId = req.params?.['matId'] as MaterialId | undefined;
    if (!matId) throw new MaterialNotFoundException();

    const material = await this.repo.get(matId);
    if (!material) throw new MaterialNotFoundException();

    if (material.ownerInstructorId === req.user?.uid) {
      req.material = material;
      return true;
    }

    // TODO(EP-06): enrolled-student download. Wire an EnrollmentRepository here:
    //   if (await this.enrollment.isEnrolled(req.user.uid, material.courseId)) {
    //     req.material = material;
    //     return true;
    //   }

    throw new NotMaterialOwnerException();
  }
}
```

- [ ] **Step 6: Run the tests, expect pass**

Run: `pnpm nx test api-courses -- material-owner.guard material-access.guard`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add libs/api-courses/src/lib/materials/types libs/api-courses/src/lib/materials/material-owner.guard.ts libs/api-courses/src/lib/materials/material-owner.guard.spec.ts libs/api-courses/src/lib/materials/material-access.guard.ts libs/api-courses/src/lib/materials/material-access.guard.spec.ts
git commit -m "feat(api-courses): add material owner + access guards"
```

---

## Task 9: `MaterialsExceptionFilter`

**Files:**
- Create: `libs/api-courses/src/lib/materials/materials.exception-filter.ts`
- Create: `libs/api-courses/src/lib/materials/materials.exception-filter.spec.ts`

The filter normalises every error from the materials routes to the `{ error: { code, message, details? } }` envelope. It must handle `MaterialException`, `CoursesException` (the controller throws `ModuleNotFoundException`/`LessonNotFoundException`, and `CourseOwnerGuard` throws `CourseNotFoundException`/`NotCourseOwnerException`), `AuthException` (from the session/role guards), and `BadRequestException` (DTO validation).

- [ ] **Step 1: Write the failing test**

Create `libs/api-courses/src/lib/materials/materials.exception-filter.spec.ts`:

```ts
import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { ModuleNotFoundException } from '../errors/courses.exception';
import { MaterialsExceptionFilter } from './materials.exception-filter';
import { MaterialNotFoundException } from './errors/material.exception';

function hostCapturing(): { host: ArgumentsHost; status: () => number; body: () => unknown } {
  let statusCode = 0;
  let payload: unknown;
  const res = {
    status: (c: number) => {
      statusCode = c;
      return res;
    },
    json: (b: unknown) => {
      payload = b;
      return res;
    },
  };
  return {
    host: { switchToHttp: () => ({ getResponse: () => res }) } as ArgumentsHost,
    status: () => statusCode,
    body: () => payload,
  };
}

describe('MaterialsExceptionFilter', () => {
  it('maps a MaterialException to its code + status', () => {
    const cap = hostCapturing();
    new MaterialsExceptionFilter().catch(new MaterialNotFoundException(), cap.host);
    expect(cap.status()).toBe(404);
    expect(cap.body()).toEqual({
      error: { code: 'MATERIAL_NOT_FOUND', message: 'Material not found.' },
    });
  });

  it('maps a CoursesException thrown from the controller', () => {
    const cap = hostCapturing();
    new MaterialsExceptionFilter().catch(new ModuleNotFoundException(), cap.host);
    expect(cap.status()).toBe(404);
    expect((cap.body() as { error: { code: string } }).error.code).toBe('MODULE_NOT_FOUND');
  });

  it('maps a BadRequestException to 400 VALIDATION_FAILED with fieldErrors', () => {
    const cap = hostCapturing();
    const bad = new BadRequestException({ message: ['filename should not be empty'] });
    new MaterialsExceptionFilter().catch(bad, cap.host);
    expect(cap.status()).toBe(400);
    const body = cap.body() as { error: { code: string; details?: unknown } };
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details).toBeDefined();
  });

  it('maps an AuthException by name', () => {
    const cap = hostCapturing();
    const authErr = Object.assign(new Error('No session.'), {
      name: 'AuthException',
      code: 'NOT_AUTHENTICATED',
      status: 401,
    });
    new MaterialsExceptionFilter().catch(authErr, cap.host);
    expect(cap.status()).toBe(401);
    expect((cap.body() as { error: { code: string } }).error.code).toBe('NOT_AUTHENTICATED');
  });

  it('maps an unknown error to 500 INTERNAL', () => {
    const cap = hostCapturing();
    const filter = new MaterialsExceptionFilter();
    vi.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
    filter.catch(new Error('boom'), cap.host);
    expect(cap.status()).toBe(500);
    expect((cap.body() as { error: { code: string } }).error.code).toBe('INTERNAL');
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

Run: `pnpm nx test api-courses -- materials.exception-filter`
Expected: FAIL — `Cannot find module './materials.exception-filter'`.

- [ ] **Step 3: Create the filter**

Create `libs/api-courses/src/lib/materials/materials.exception-filter.ts`:

```ts
import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

import { CoursesException } from '../errors/courses.exception';
import { MaterialException } from './errors/material.exception';

interface MaterialErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

@Catch()
export class MaterialsExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('MaterialsExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    // MaterialException, CoursesException, and AuthException share the same
    // { code, status, message, details? } shape.
    if (
      exception instanceof MaterialException ||
      exception instanceof CoursesException ||
      (exception instanceof Error &&
        (exception.name === 'AuthException' ||
          exception.constructor.name === 'AuthException'))
    ) {
      const err = exception as Error & {
        code: string;
        status: number;
        details?: Record<string, unknown>;
      };
      const body: MaterialErrorBody = {
        error: { code: err.code, message: err.message },
      };
      if (err.details) body.error.details = err.details;
      response.status(err.status).json(body);
      return;
    }

    if (exception instanceof BadRequestException) {
      const payload = exception.getResponse() as { message?: string[] | string };
      const messages = Array.isArray(payload.message)
        ? payload.message
        : payload.message
          ? [payload.message]
          : [];
      response.status(400).json({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Request body failed validation.',
          details: { fieldErrors: parseFieldErrors(messages) },
        },
      } satisfies MaterialErrorBody);
      return;
    }

    this.logger.error(
      exception instanceof Error ? (exception.stack ?? exception.message) : String(exception),
    );
    response.status(500).json({
      error: { code: 'INTERNAL', message: 'An internal error occurred.' },
    } satisfies MaterialErrorBody);
  }
}

/** class-validator emits "filename should not be empty" — key on the first word. */
function parseFieldErrors(messages: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const msg of messages) {
    const field = msg.split(' ')[0];
    if (!field) continue;
    (out[field] ??= []).push(msg);
  }
  return out;
}
```

- [ ] **Step 4: Run the test, expect pass**

Run: `pnpm nx test api-courses -- materials.exception-filter`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/materials/materials.exception-filter.ts libs/api-courses/src/lib/materials/materials.exception-filter.spec.ts
git commit -m "feat(api-courses): add MaterialsExceptionFilter"
```

---

## Task 10: `MaterialsController`

**Files:**
- Create: `libs/api-courses/src/lib/materials/materials.controller.ts`
- Create: `libs/api-courses/src/lib/materials/materials.controller.spec.ts`

Class-level guard is `FirebaseSessionGuard` only — the download route must stay reachable by a future enrolled STUDENT, so `InstructorRoleGuard` is applied per-route on the five authoring routes, not at class level. The spec test instantiates the controller directly with mocked collaborators (guards have their own specs).

- [ ] **Step 1: Write the failing test**

Create `libs/api-courses/src/lib/materials/materials.controller.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import type { CourseId, Lesson, Material } from '@learnwren/shared-data-models';

import { LessonNotFoundException, ModuleNotFoundException } from '../errors/courses.exception';
import { MaterialsController } from './materials.controller';
import type { MaterialScopedRequest } from './types/loaded-material';

const material = { id: 'm1', displayName: 'Doc' } as Material;

function svcMock(over: Record<string, unknown> = {}) {
  return {
    createUploadUrl: vi.fn().mockResolvedValue({ materialId: 'm1', uploadUrl: 'u', expiresAt: 'T' }),
    listForLesson: vi.fn().mockResolvedValue([material]),
    complete: vi.fn().mockResolvedValue(material),
    rename: vi.fn().mockResolvedValue(material),
    remove: vi.fn().mockResolvedValue(undefined),
    buildDownloadUrl: vi.fn().mockResolvedValue({ downloadUrl: 'd', expiresAt: 'T' }),
    ...over,
  };
}

function coursesRepoMock(over: Record<string, unknown> = {}) {
  return {
    moduleExists: vi.fn().mockResolvedValue(true),
    getLesson: vi.fn().mockResolvedValue({ id: 'l1' } as Lesson),
    ...over,
  };
}

const req = (over: Partial<MaterialScopedRequest> = {}): MaterialScopedRequest =>
  ({
    params: {},
    user: { uid: 'u1' },
    material,
    ...over,
  }) as MaterialScopedRequest;

describe('MaterialsController', () => {
  it('createUploadUrl resolves the lesson then delegates to the service', async () => {
    const svc = svcMock();
    const ctrl = new MaterialsController(svc as never, coursesRepoMock() as never);
    const r = await ctrl.createUploadUrl(
      'c1' as CourseId,
      'mid1' as never,
      'lid1' as never,
      { filename: 'a.pdf', sizeBytes: 10 },
      req(),
    );
    expect(r.materialId).toBe('m1');
    expect(svc.createUploadUrl).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'u1', courseId: 'c1', lessonId: 'lid1', filename: 'a.pdf' }),
    );
  });

  it('createUploadUrl throws MODULE_NOT_FOUND when the module is unknown', async () => {
    const ctrl = new MaterialsController(
      svcMock() as never,
      coursesRepoMock({ moduleExists: vi.fn().mockResolvedValue(false) }) as never,
    );
    await expect(
      ctrl.createUploadUrl('c1' as CourseId, 'm' as never, 'l' as never, { filename: 'a.pdf', sizeBytes: 1 }, req()),
    ).rejects.toBeInstanceOf(ModuleNotFoundException);
  });

  it('createUploadUrl throws LESSON_NOT_FOUND when the lesson is unknown', async () => {
    const ctrl = new MaterialsController(
      svcMock() as never,
      coursesRepoMock({ getLesson: vi.fn().mockResolvedValue(null) }) as never,
    );
    await expect(
      ctrl.createUploadUrl('c1' as CourseId, 'm' as never, 'l' as never, { filename: 'a.pdf', sizeBytes: 1 }, req()),
    ).rejects.toBeInstanceOf(LessonNotFoundException);
  });

  it('list resolves the lesson then returns the service result', async () => {
    const svc = svcMock();
    const ctrl = new MaterialsController(svc as never, coursesRepoMock() as never);
    const r = await ctrl.list('c1' as CourseId, 'm' as never, 'l1' as never);
    expect(r).toEqual([material]);
    expect(svc.listForLesson).toHaveBeenCalledWith('l1');
  });

  it('complete delegates with the loaded material id', async () => {
    const svc = svcMock();
    const ctrl = new MaterialsController(svc as never, coursesRepoMock() as never);
    await ctrl.complete(req());
    expect(svc.complete).toHaveBeenCalledWith('m1');
  });

  it('rename delegates the new display name', async () => {
    const svc = svcMock();
    const ctrl = new MaterialsController(svc as never, coursesRepoMock() as never);
    await ctrl.rename({ displayName: 'New' }, req());
    expect(svc.rename).toHaveBeenCalledWith('m1', 'New');
  });

  it('remove delegates to the service', async () => {
    const svc = svcMock();
    const ctrl = new MaterialsController(svc as never, coursesRepoMock() as never);
    await ctrl.remove(req());
    expect(svc.remove).toHaveBeenCalledWith('m1');
  });

  it('downloadUrl returns the signed URL', async () => {
    const svc = svcMock();
    const ctrl = new MaterialsController(svc as never, coursesRepoMock() as never);
    expect(await ctrl.downloadUrl(req())).toEqual({ downloadUrl: 'd', expiresAt: 'T' });
    expect(svc.buildDownloadUrl).toHaveBeenCalledWith('m1');
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

Run: `pnpm nx test api-courses -- materials.controller`
Expected: FAIL — `Cannot find module './materials.controller'`.

- [ ] **Step 3: Create the controller**

Create `libs/api-courses/src/lib/materials/materials.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';

import { FirebaseSessionGuard, InstructorRoleGuard } from '@learnwren/api-auth';
import type {
  CourseId,
  LessonId,
  Material,
  ModuleId,
} from '@learnwren/shared-data-models';

import { CourseOwnerGuard } from '../course-owner.guard';
import { CoursesRepository } from '../courses.repository';
import {
  LessonNotFoundException,
  ModuleNotFoundException,
} from '../errors/courses.exception';
import { CreateMaterialUploadDto } from './dto/create-material-upload.dto';
import { RenameMaterialDto } from './dto/rename-material.dto';
import { MaterialAccessGuard } from './material-access.guard';
import { MaterialOwnerGuard } from './material-owner.guard';
import { MaterialsExceptionFilter } from './materials.exception-filter';
import {
  MaterialsService,
  type CreateUploadUrlResult,
  type DownloadUrlResult,
} from './materials.service';
import type { MaterialScopedRequest } from './types/loaded-material';

@Controller()
@UseFilters(MaterialsExceptionFilter)
@UseGuards(FirebaseSessionGuard)
export class MaterialsController {
  constructor(
    private readonly svc: MaterialsService,
    private readonly coursesRepo: CoursesRepository,
  ) {}

  @Post('courses/:cid/modules/:mid/lessons/:lid/materials/upload-url')
  @UseGuards(InstructorRoleGuard, CourseOwnerGuard)
  async createUploadUrl(
    @Param('cid') cid: CourseId,
    @Param('mid') mid: ModuleId,
    @Param('lid') lid: LessonId,
    @Body() body: CreateMaterialUploadDto,
    @Req() req: MaterialScopedRequest,
  ): Promise<CreateUploadUrlResult> {
    await this.assertLessonExists(cid, mid, lid);
    return this.svc.createUploadUrl({
      uid: req.user!.uid,
      courseId: cid,
      lessonId: lid,
      filename: body.filename,
      sizeBytes: body.sizeBytes,
    });
  }

  @Get('courses/:cid/modules/:mid/lessons/:lid/materials')
  @UseGuards(InstructorRoleGuard, CourseOwnerGuard)
  async list(
    @Param('cid') cid: CourseId,
    @Param('mid') mid: ModuleId,
    @Param('lid') lid: LessonId,
  ): Promise<Material[]> {
    await this.assertLessonExists(cid, mid, lid);
    return this.svc.listForLesson(lid);
  }

  @Post('materials/:matId/complete')
  @HttpCode(200)
  @UseGuards(InstructorRoleGuard, MaterialOwnerGuard)
  async complete(@Req() req: MaterialScopedRequest): Promise<Material> {
    return this.svc.complete(req.material!.id);
  }

  @Patch('materials/:matId')
  @UseGuards(InstructorRoleGuard, MaterialOwnerGuard)
  async rename(
    @Body() body: RenameMaterialDto,
    @Req() req: MaterialScopedRequest,
  ): Promise<Material> {
    return this.svc.rename(req.material!.id, body.displayName);
  }

  @Delete('materials/:matId')
  @HttpCode(204)
  @UseGuards(InstructorRoleGuard, MaterialOwnerGuard)
  async remove(@Req() req: MaterialScopedRequest): Promise<void> {
    await this.svc.remove(req.material!.id);
  }

  @Get('materials/:matId/download-url')
  @UseGuards(MaterialAccessGuard)
  async downloadUrl(@Req() req: MaterialScopedRequest): Promise<DownloadUrlResult> {
    return this.svc.buildDownloadUrl(req.material!.id);
  }

  private async assertLessonExists(
    cid: CourseId,
    mid: ModuleId,
    lid: LessonId,
  ): Promise<void> {
    const moduleOk = await this.coursesRepo.moduleExists(cid, mid);
    if (!moduleOk) throw new ModuleNotFoundException();
    const lesson = await this.coursesRepo.getLesson(cid, mid, lid);
    if (!lesson) throw new LessonNotFoundException();
  }
}
```

- [ ] **Step 4: Run the test, expect pass**

Run: `pnpm nx test api-courses -- materials.controller`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/materials/materials.controller.ts libs/api-courses/src/lib/materials/materials.controller.spec.ts
git commit -m "feat(api-courses): add MaterialsController"
```

---

## Task 11: `FakeMaterialsController` (dev-only passthrough)

**Files:**
- Create: `libs/api-courses/src/lib/materials/webhook/fake-materials.controller.ts`
- Create: `libs/api-courses/src/lib/materials/webhook/fake-materials.controller.spec.ts`

In `fake` storage mode the signed upload/download URLs point at this controller, which proxies bytes to and from the Storage emulator via the Admin SDK. It is registered **only** outside production (mirrors `FakeTranscoderController`).

- [ ] **Step 1: Write the failing test**

Create `libs/api-courses/src/lib/materials/webhook/fake-materials.controller.spec.ts`:

```ts
import { Readable } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import type { Material, MaterialId } from '@learnwren/shared-data-models';

import { MaterialNotFoundException } from '../errors/material.exception';
import { FakeMaterialsController } from './fake-materials.controller';

const material = {
  id: 'm1',
  contentType: 'application/pdf',
  originalFilename: 'doc.pdf',
  storage: { bucket: 'b', path: 'materials/m1/source.pdf' },
} as Material;

function repoReturning(value: Material | null) {
  return { get: vi.fn().mockResolvedValue(value) } as never;
}

/** Cloud Storage double capturing save()/download() calls. */
function fakeStorage() {
  const saved: { buf: Buffer }[] = [];
  const file = {
    save: vi.fn(async (buf: Buffer) => void saved.push({ buf })),
    download: vi.fn(async () => [Buffer.from('FILE-BYTES')]),
  };
  return {
    saved,
    file,
    handle: { bucket: () => ({ file: () => file }) } as never,
  };
}

describe('FakeMaterialsController', () => {
  it('upload writes the request body to storage', async () => {
    const storage = fakeStorage();
    const ctrl = new FakeMaterialsController(repoReturning(material), storage.handle);
    const req = Readable.from([Buffer.from('PDF-PAYLOAD')]) as never;
    const r = await ctrl.upload('m1' as MaterialId, req);
    expect(r).toEqual({ ok: true });
    expect(storage.saved[0]!.buf.toString()).toBe('PDF-PAYLOAD');
  });

  it('upload throws MATERIAL_NOT_FOUND for an unknown material', async () => {
    const ctrl = new FakeMaterialsController(repoReturning(null), fakeStorage().handle);
    await expect(
      ctrl.upload('nope' as MaterialId, Readable.from([]) as never),
    ).rejects.toBeInstanceOf(MaterialNotFoundException);
  });

  it('download streams the object back with attachment headers', async () => {
    const storage = fakeStorage();
    const ctrl = new FakeMaterialsController(repoReturning(material), storage.handle);
    const headers: Record<string, string> = {};
    let sent: Buffer | undefined;
    const res = {
      set: (k: string, v: string) => void (headers[k] = v),
      send: (b: Buffer) => void (sent = b),
    } as never;
    await ctrl.download('m1' as MaterialId, res);
    expect(sent?.toString()).toBe('FILE-BYTES');
    expect(headers['Content-Type']).toBe('application/pdf');
    expect(headers['Content-Disposition']).toContain('doc.pdf');
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

Run: `pnpm nx test api-courses -- fake-materials.controller`
Expected: FAIL — `Cannot find module './fake-materials.controller'`.

- [ ] **Step 3: Create the controller**

Create `libs/api-courses/src/lib/materials/webhook/fake-materials.controller.ts`:

```ts
import { Controller, Get, HttpCode, Inject, Param, Put, Req, Res, UseFilters } from '@nestjs/common';
import type { Request, Response } from 'express';

import { FIREBASE_STORAGE, type FirebaseStorageHandle } from '@learnwren/api-firebase';
import type { MaterialId } from '@learnwren/shared-data-models';

import { MaterialNotFoundException } from '../errors/material.exception';
import { MaterialsExceptionFilter } from '../materials.exception-filter';
import { MaterialsRepository } from '../materials.repository';

/** Collect a raw request stream into a Buffer (no body parser runs for the
 *  binary content-types materials use, so the stream is intact). */
function collectStream(req: Request): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sanitizeFilename(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.replace(/["\\\r\n]/g, '_');
}

/**
 * Dev/e2e-only passthrough. The Firebase Storage emulator cannot mint or verify
 * GCS v4 signed URLs, so in fake mode the signed URLs point here and this
 * controller proxies bytes via the Admin SDK. Not registered in production.
 */
@Controller('internal/fake-materials')
@UseFilters(MaterialsExceptionFilter)
export class FakeMaterialsController {
  constructor(
    private readonly repo: MaterialsRepository,
    @Inject(FIREBASE_STORAGE) private readonly storage: FirebaseStorageHandle,
  ) {}

  @Put(':matId')
  @HttpCode(200)
  async upload(
    @Param('matId') matId: MaterialId,
    @Req() req: Request,
  ): Promise<{ ok: true }> {
    const material = await this.repo.get(matId);
    if (!material) throw new MaterialNotFoundException();
    const buf = await collectStream(req);
    await this.storage
      .bucket(material.storage.bucket)
      .file(material.storage.path)
      .save(buf, { contentType: material.contentType, resumable: false });
    return { ok: true };
  }

  @Get(':matId')
  async download(
    @Param('matId') matId: MaterialId,
    @Res() res: Response,
  ): Promise<void> {
    const material = await this.repo.get(matId);
    if (!material) throw new MaterialNotFoundException();
    const [buf] = await this.storage
      .bucket(material.storage.bucket)
      .file(material.storage.path)
      .download();
    res.set('Content-Type', material.contentType);
    res.set(
      'Content-Disposition',
      `attachment; filename="${sanitizeFilename(material.originalFilename)}"`,
    );
    res.send(buf);
  }
}
```

- [ ] **Step 4: Run the test, expect pass**

Run: `pnpm nx test api-courses -- fake-materials.controller`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/api-courses/src/lib/materials/webhook
git commit -m "feat(api-courses): add dev-only FakeMaterialsController passthrough"
```

---

## Task 12: Wire `MaterialsModule` + the lesson-delete cascade

**Files:**
- Create: `libs/api-courses/src/lib/materials/materials.module.ts`
- Modify: `libs/api-courses/src/lib/courses.module.ts`
- Modify: `libs/api-courses/src/lib/courses.service.ts`
- Modify: `libs/api-courses/src/lib/courses.service.spec.ts`

`MaterialsModule` mirrors `VideoModule`: a NestJS module living inside `libs/api-courses`, mutually `forwardRef`-wired with `CoursesModule`. `CoursesService.deleteLesson` gains a materials cascade alongside the existing video cascade.

- [ ] **Step 1: Update the `courses.service.spec.ts` constructor calls (failing test first)**

In `libs/api-courses/src/lib/courses.service.spec.ts`, after the `buildVideoSvcFake` function (ends at line ~59), add a sibling helper:

```ts
function buildMaterialsSvcFake() {
  return {
    deleteForLesson: vi.fn(async () => undefined),
  };
}
```

Then update **every** `CoursesService` construction. There are two distinct call shapes — apply both replacements (all occurrences):

Replace every occurrence of:

```ts
new CoursesService(repo as unknown as CoursesRepository, buildVideoSvcFake() as never)
```

with:

```ts
new CoursesService(repo as unknown as CoursesRepository, buildVideoSvcFake() as never, buildMaterialsSvcFake() as never)
```

Replace every occurrence of:

```ts
const svc = new CoursesService(repo as unknown as CoursesRepository, videoSvc as never);
```

with:

```ts
const svc = new CoursesService(repo as unknown as CoursesRepository, videoSvc as never, buildMaterialsSvcFake() as never);
```

Then, inside `describe('deleteLesson', ...)`, add a new test after the `'cascades to VideoService.deleteForLesson...'` test:

```ts
it('cascades to MaterialsService.deleteForLesson before deleting the lesson doc', async () => {
  const videoSvc = buildVideoSvcFake();
  const materialsSvc = buildMaterialsSvcFake();
  const svc = new CoursesService(
    repo as unknown as CoursesRepository,
    videoSvc as never,
    materialsSvc as never,
  );
  repo.getLesson.mockResolvedValue({
    id: 'lid-1' as LessonId,
    moduleId: MID,
    title: 'L',
    order: 0,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
  });
  await svc.deleteLesson(CID, MID, 'lid-1' as LessonId);
  expect(materialsSvc.deleteForLesson).toHaveBeenCalledWith('lid-1');

  const mflCallIdx = (
    materialsSvc.deleteForLesson as unknown as { mock: { invocationCallOrder: number[] } }
  ).mock.invocationCallOrder[0];
  const dlCallIdx = repo.deleteLesson.mock.invocationCallOrder[0];
  expect(mflCallIdx).toBeLessThan(dlCallIdx);
});
```

- [ ] **Step 2: Run the test, expect failure**

Run: `pnpm nx test api-courses -- courses.service.spec`
Expected: FAIL — `CoursesService` constructor still takes two args; `materialsSvc.deleteForLesson` never called.

- [ ] **Step 3: Add the materials cascade to `CoursesService`**

In `libs/api-courses/src/lib/courses.service.ts`:

Add the import alongside the existing `VideoService` import:

```ts
import { MaterialsService } from './materials/materials.service';
```

Extend the constructor to accept `MaterialsService`:

```ts
  constructor(
    private readonly repo: CoursesRepository,
    // forwardRef resolves the CoursesModule ↔ VideoModule runtime cycle.
    @Inject(forwardRef(() => VideoService))
    private readonly videoSvc: VideoService,
    // forwardRef resolves the CoursesModule ↔ MaterialsModule runtime cycle.
    @Inject(forwardRef(() => MaterialsService))
    private readonly materialsSvc: MaterialsService,
  ) {}
```

Add the cascade line to `deleteLesson` (after the video cascade, before the repo delete):

```ts
  async deleteLesson(cid: CourseId, mid: ModuleId, lid: LessonId): Promise<void> {
    const existing = await this.repo.getLesson(cid, mid, lid);
    if (!existing) throw new LessonNotFoundException();
    await this.videoSvc.deleteForLesson(lid);
    await this.materialsSvc.deleteForLesson(lid);
    await this.repo.deleteLesson(cid, mid, lid);
  }
```

- [ ] **Step 4: Create `MaterialsModule`**

Create `libs/api-courses/src/lib/materials/materials.module.ts`:

```ts
import { forwardRef, Module } from '@nestjs/common';

import { AuthModule } from '@learnwren/api-auth';
import { FirebaseAdminModule } from '@learnwren/api-firebase';

import { CoursesModule } from '../courses.module';
import { MaterialAccessGuard } from './material-access.guard';
import { MaterialOwnerGuard } from './material-owner.guard';
import { MaterialsController } from './materials.controller';
import { MATERIALS_CONFIG, readMaterialsConfigFromEnv } from './materials.config';
import { MaterialsExceptionFilter } from './materials.exception-filter';
import { MaterialsRepository } from './materials.repository';
import { MaterialsService } from './materials.service';
import { MaterialsStorageAdapter } from './materials-storage.adapter';
import { FakeMaterialsController } from './webhook/fake-materials.controller';

// The fake passthrough controller is dev/e2e-only — never registered in prod.
const controllers = [
  MaterialsController,
  ...(process.env['NODE_ENV'] !== 'production' ? [FakeMaterialsController] : []),
];

// CoursesModule ↔ MaterialsModule are mutually dependent (CoursesService
// cascades deletes into MaterialsService; MaterialsController injects
// CoursesRepository + CourseOwnerGuard). NestJS resolves the cycle with forwardRef.
@Module({
  imports: [FirebaseAdminModule, AuthModule, forwardRef(() => CoursesModule)],
  controllers,
  providers: [
    MaterialsRepository,
    MaterialsService,
    MaterialsStorageAdapter,
    MaterialOwnerGuard,
    MaterialAccessGuard,
    MaterialsExceptionFilter,
    { provide: MATERIALS_CONFIG, useFactory: () => readMaterialsConfigFromEnv(process.env) },
  ],
  exports: [MaterialsService],
})
export class MaterialsModule {}
```

- [ ] **Step 5: Register `MaterialsModule` in `CoursesModule`**

In `libs/api-courses/src/lib/courses.module.ts`, add the import and the module reference:

```ts
import { forwardRef, Module } from '@nestjs/common';

import { AuthModule } from '@learnwren/api-auth';

import { CourseOwnerGuard } from './course-owner.guard';
import { CoursesController } from './courses.controller';
import { CoursesExceptionFilter } from './courses.exception-filter';
import { CoursesRepository } from './courses.repository';
import { CoursesService } from './courses.service';
import { MaterialsModule } from './materials/materials.module';
import { PublishService } from './publish/publish.service';
import { VideoModule } from './video/video.module';

// VideoModule + MaterialsModule are mutually dependent with CoursesModule
// (CoursesService cascades deletes into them; their controllers inject
// CoursesRepository). NestJS resolves the cycles with forwardRef.
@Module({
  imports: [
    AuthModule,
    forwardRef(() => VideoModule),
    forwardRef(() => MaterialsModule),
  ],
  controllers: [CoursesController],
  providers: [
    CoursesService,
    CoursesRepository,
    CoursesExceptionFilter,
    CourseOwnerGuard,
    PublishService,
  ],
  exports: [CoursesRepository, CourseOwnerGuard],
})
export class CoursesModule {}
```

- [ ] **Step 6: Run tests + typecheck + build, expect pass**

```bash
pnpm nx test api-courses
pnpm typecheck
pnpm nx build api
```

Expected: all green — the api compiles with the new module wired in.

- [ ] **Step 7: Commit**

```bash
git add libs/api-courses/src/lib/materials/materials.module.ts libs/api-courses/src/lib/courses.module.ts libs/api-courses/src/lib/courses.service.ts libs/api-courses/src/lib/courses.service.spec.ts
git commit -m "feat(api-courses): wire MaterialsModule and lesson-delete cascade"
```

---

## Task 13: Firestore deny-all rules for `materials/**`

**Files:**
- Modify: `firestore.rules`
- Modify: `firestore.emulator.rules`
- Modify: `apps/api-e2e/src/firestore-rules.e2e-spec.ts`

`materials` is a top-level collection; all access goes through `libs/api-courses` with the Admin SDK. The client must never read or write it directly.

- [ ] **Step 1: Add the failing rules tests**

In `apps/api-e2e/src/firestore-rules.e2e-spec.ts`, after the final `videoKeys` delete test (end of file), append:

```ts
test('anonymous client cannot read /materials/{matId}', async () => {
  const ctx = testEnv.unauthenticatedContext();
  await assertFails(getDoc(doc(ctx.firestore(), 'materials', 'm1')));
});

test('anonymous client cannot write /materials/{matId}', async () => {
  const ctx = testEnv.unauthenticatedContext();
  await assertFails(setDoc(doc(ctx.firestore(), 'materials', 'm1'), { state: 'READY' }));
});

test('STUDENT client cannot read /materials/{matId}', async () => {
  const ctx = testEnv.authenticatedContext('student-uid', { role: 'STUDENT' });
  await assertFails(getDoc(doc(ctx.firestore(), 'materials', 'm1')));
});

test('STUDENT client cannot write /materials/{matId}', async () => {
  const ctx = testEnv.authenticatedContext('student-uid', { role: 'STUDENT' });
  await assertFails(setDoc(doc(ctx.firestore(), 'materials', 'm1'), { state: 'READY' }));
});

test('INSTRUCTOR client cannot read /materials/{matId}', async () => {
  const ctx = testEnv.authenticatedContext('inst-uid', { role: 'INSTRUCTOR' });
  await assertFails(getDoc(doc(ctx.firestore(), 'materials', 'm1')));
});

test('INSTRUCTOR client cannot write /materials/{matId}', async () => {
  const ctx = testEnv.authenticatedContext('inst-uid', { role: 'INSTRUCTOR' });
  await assertFails(setDoc(doc(ctx.firestore(), 'materials', 'm1'), { state: 'READY' }));
});

test('INSTRUCTOR client cannot delete /materials/{matId}', async () => {
  const ctx = testEnv.authenticatedContext('inst-uid', { role: 'INSTRUCTOR' });
  await assertFails(deleteDoc(doc(ctx.firestore(), 'materials', 'm1')));
});
```

- [ ] **Step 2: Run the rules tests, expect them to already pass OR confirm the gap**

The catch-all `match /{document=**}` already denies `materials/**`, so these tests pass even before the explicit block. Run them to confirm the suite is green:

```bash
pnpm emulators   # in a separate terminal — leave running
pnpm nx e2e api-e2e -- --grep "materials"
```

Expected: PASS (denied by the catch-all). The explicit block in Step 3 is added for parity with the `videos` convention and to make the intent obvious.

- [ ] **Step 3: Add the explicit `materials` block to both rules files**

In `firestore.rules`, after the `match /videoKeys/{keyId}` block and before the `// Deny-by-default` comment, add:

```
    match /materials/{materialId} {
      allow read, write: if false;
    }

```

Apply the **identical** edit to `firestore.emulator.rules` (same location — after the `videoKeys` block, before the deny-by-default catch-all).

- [ ] **Step 4: Re-run the rules tests, expect pass**

Run: `pnpm nx e2e api-e2e -- --grep "materials"`
Expected: PASS (now denied by the explicit block).

- [ ] **Step 5: Commit**

```bash
git add firestore.rules firestore.emulator.rules apps/api-e2e/src/firestore-rules.e2e-spec.ts
git commit -m "feat(api-courses): deny-all Firestore rules for materials collection"
```

---

## Task 14: Web `MaterialsService` (HTTP wrapper)

**Files:**
- Create: `libs/web-courses/src/lib/materials/materials.service.ts`
- Create: `libs/web-courses/src/lib/materials/materials.service.spec.ts`

A thin `HttpClient` wrapper — one method per API endpoint, returning `Observable<T>` — matching the existing `web-video` `VideoService` convention.

- [ ] **Step 1: Write the failing test**

Create `libs/web-courses/src/lib/materials/materials.service.spec.ts`:

```ts
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { CourseId, LessonId, MaterialId, ModuleId } from '@learnwren/shared-data-models';

import { MaterialsService } from './materials.service';

describe('MaterialsService (web)', () => {
  let svc: MaterialsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [MaterialsService, provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(MaterialsService);
    http = TestBed.inject(HttpTestingController);
  });

  it('createUploadUrl POSTs to the lesson-scoped upload-url route', () => {
    svc
      .createUploadUrl('c1' as CourseId, 'm1' as ModuleId, 'l1' as LessonId, {
        filename: 'a.pdf',
        sizeBytes: 12,
      })
      .subscribe();
    const req = http.expectOne('/api/courses/c1/modules/m1/lessons/l1/materials/upload-url');
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.body).toEqual({ filename: 'a.pdf', sizeBytes: 12 });
    req.flush({ materialId: 'mat1', uploadUrl: 'u', expiresAt: 'T' });
  });

  it('listMaterials GETs the lesson-scoped materials route', () => {
    svc.listMaterials('c1' as CourseId, 'm1' as ModuleId, 'l1' as LessonId).subscribe();
    const req = http.expectOne('/api/courses/c1/modules/m1/lessons/l1/materials');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('complete POSTs to the material complete route', () => {
    svc.complete('mat1' as MaterialId).subscribe();
    const req = http.expectOne('/api/materials/mat1/complete');
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('rename PATCHes the display name', () => {
    svc.rename('mat1' as MaterialId, 'New Name').subscribe();
    const req = http.expectOne('/api/materials/mat1');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ displayName: 'New Name' });
    req.flush({});
  });

  it('remove DELETEs the material', () => {
    svc.remove('mat1' as MaterialId).subscribe();
    const req = http.expectOne('/api/materials/mat1');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('getDownloadUrl GETs the download-url route', () => {
    svc.getDownloadUrl('mat1' as MaterialId).subscribe();
    const req = http.expectOne('/api/materials/mat1/download-url');
    expect(req.request.method).toBe('GET');
    req.flush({ downloadUrl: 'd', expiresAt: 'T' });
  });

  afterEach(() => http.verify());
});
```

> Note: add `import { afterEach } from 'vitest';` to the import line if the project's test config does not expose `afterEach` as a global. Most Vitest configs in this repo expose globals; if `afterEach` is already global, leave the import out.

- [ ] **Step 2: Run the test, expect failure**

Run: `pnpm nx test web-courses -- materials.service`
Expected: FAIL — `Cannot find module './materials.service'`.

- [ ] **Step 3: Create the service**

Create `libs/web-courses/src/lib/materials/materials.service.ts`:

```ts
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

import type {
  CourseId,
  LessonId,
  Material,
  MaterialId,
  ModuleId,
} from '@learnwren/shared-data-models';

const OPTS = { withCredentials: true } as const;

export interface CreateMaterialUploadPayload {
  filename: string;
  sizeBytes: number;
}

export interface CreateMaterialUploadResponse {
  materialId: MaterialId;
  uploadUrl: string;
  expiresAt: string;
}

export interface MaterialDownloadUrlResponse {
  downloadUrl: string;
  expiresAt: string;
}

@Injectable({ providedIn: 'root' })
export class MaterialsService {
  private readonly http = inject(HttpClient);

  createUploadUrl(
    cid: CourseId,
    mid: ModuleId,
    lid: LessonId,
    payload: CreateMaterialUploadPayload,
  ): Observable<CreateMaterialUploadResponse> {
    return this.http.post<CreateMaterialUploadResponse>(
      `/api/courses/${cid}/modules/${mid}/lessons/${lid}/materials/upload-url`,
      payload,
      OPTS,
    );
  }

  listMaterials(cid: CourseId, mid: ModuleId, lid: LessonId): Observable<Material[]> {
    return this.http.get<Material[]>(
      `/api/courses/${cid}/modules/${mid}/lessons/${lid}/materials`,
      OPTS,
    );
  }

  complete(matId: MaterialId): Observable<Material> {
    return this.http.post<Material>(`/api/materials/${matId}/complete`, {}, OPTS);
  }

  rename(matId: MaterialId, displayName: string): Observable<Material> {
    return this.http.patch<Material>(`/api/materials/${matId}`, { displayName }, OPTS);
  }

  remove(matId: MaterialId): Observable<void> {
    return this.http.delete<void>(`/api/materials/${matId}`, OPTS);
  }

  getDownloadUrl(matId: MaterialId): Observable<MaterialDownloadUrlResponse> {
    return this.http.get<MaterialDownloadUrlResponse>(
      `/api/materials/${matId}/download-url`,
      OPTS,
    );
  }
}
```

- [ ] **Step 4: Run the test, expect pass**

Run: `pnpm nx test web-courses -- materials.service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/web-courses/src/lib/materials/materials.service.ts libs/web-courses/src/lib/materials/materials.service.spec.ts
git commit -m "feat(web-courses): add materials HTTP service"
```

---

## Task 15: `MaterialUploadService`

**Files:**
- Create: `libs/web-courses/src/lib/materials/material-upload.service.ts`
- Create: `libs/web-courses/src/lib/materials/material-upload.service.spec.ts`

A per-component injectable that owns the multi-file upload queue: validate each file by extension + size, call `createUploadUrl`, PUT the bytes (XHR, so a progress bar is possible), then call `complete`. Unsupported/oversized files are skipped with a per-file failure message; valid files in the same batch continue (UC-04-01 extensions 4a/4b).

- [ ] **Step 1: Write the failing test**

Create `libs/web-courses/src/lib/materials/material-upload.service.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CourseId, LessonId, ModuleId } from '@learnwren/shared-data-models';
import { MATERIAL_MAX_SIZE_BYTES } from '@learnwren/shared-data-models';

import { MaterialsService } from './materials.service';
import { MATERIAL_XHR_FACTORY, MaterialUploadService } from './material-upload.service';

const ctx = {
  courseId: 'c1' as CourseId,
  moduleId: 'm1' as ModuleId,
  lessonId: 'l1' as LessonId,
};

/** A fake XHR whose PUT resolves to a configurable status. */
function fakeXhr(status: number) {
  return {
    open: vi.fn(),
    setRequestHeader: vi.fn(),
    upload: {} as { onprogress?: (e: ProgressEvent) => void },
    send: vi.fn(function (this: { onload?: () => void; status: number }) {
      this.status = status;
      queueMicrotask(() => this.onload?.());
    }),
    status: 0,
    onload: undefined as undefined | (() => void),
    onerror: undefined as undefined | (() => void),
  };
}

function makeFile(name: string, size = 100): File {
  const f = new File(['x'], name);
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

function setup(over: { put?: number; api?: Partial<MaterialsService> } = {}) {
  const api: Partial<MaterialsService> = {
    createUploadUrl: vi.fn().mockReturnValue(
      of({ materialId: 'mat1', uploadUrl: '/api/internal/fake-materials/mat1', expiresAt: 'T' }),
    ),
    complete: vi.fn().mockReturnValue(of({})),
    ...over.api,
  };
  TestBed.configureTestingModule({
    providers: [
      MaterialUploadService,
      { provide: MaterialsService, useValue: api },
      { provide: MATERIAL_XHR_FACTORY, useValue: () => fakeXhr(over.put ?? 200) },
    ],
  });
  return { svc: TestBed.inject(MaterialUploadService), api };
}

describe('MaterialUploadService', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('uploads a valid file end-to-end (createUploadUrl → PUT → complete)', async () => {
    const { svc, api } = setup();
    const completed = await svc.uploadFiles(ctx, [makeFile('notes.pdf')]);
    expect(completed).toBe(1);
    expect(api.createUploadUrl).toHaveBeenCalled();
    expect(api.complete).toHaveBeenCalledWith('mat1');
    expect(svc.failures()).toEqual([]);
  });

  it('skips an unsupported extension with a failure message, continues others', async () => {
    const { svc, api } = setup();
    const completed = await svc.uploadFiles(ctx, [makeFile('virus.exe'), makeFile('ok.pdf')]);
    expect(completed).toBe(1);
    expect(svc.failures()).toHaveLength(1);
    expect(svc.failures()[0].filename).toBe('virus.exe');
    expect(svc.failures()[0].reason).toMatch(/unsupported/i);
    expect(api.createUploadUrl).toHaveBeenCalledTimes(1);
  });

  it('skips an oversized file with a 50 MB message', async () => {
    const { svc } = setup();
    const completed = await svc.uploadFiles(ctx, [
      makeFile('big.pdf', MATERIAL_MAX_SIZE_BYTES + 1),
    ]);
    expect(completed).toBe(0);
    expect(svc.failures()[0].reason).toMatch(/50 MB/i);
  });

  it('records a failure when the PUT returns a non-2xx status', async () => {
    const { svc } = setup({ put: 500 });
    const completed = await svc.uploadFiles(ctx, [makeFile('notes.pdf')]);
    expect(completed).toBe(0);
    expect(svc.failures()[0].reason).toMatch(/failed/i);
  });

  it('records a failure when createUploadUrl errors', async () => {
    const { svc } = setup({
      api: { createUploadUrl: vi.fn().mockReturnValue(throwError(() => new Error('network'))) },
    });
    const completed = await svc.uploadFiles(ctx, [makeFile('notes.pdf')]);
    expect(completed).toBe(0);
    expect(svc.failures()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

Run: `pnpm nx test web-courses -- material-upload.service`
Expected: FAIL — `Cannot find module './material-upload.service'`.

- [ ] **Step 3: Create the upload service**

Create `libs/web-courses/src/lib/materials/material-upload.service.ts`:

```ts
import { Injectable, InjectionToken, inject, signal, type Signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { CourseId, LessonId, ModuleId } from '@learnwren/shared-data-models';
import {
  MATERIAL_CONTENT_TYPE_BY_EXTENSION,
  MATERIAL_MAX_SIZE_BYTES,
  SUPPORTED_MATERIAL_EXTENSIONS,
  type SupportedMaterialExtension,
} from '@learnwren/shared-data-models';

import { MaterialsService } from './materials.service';

export const MATERIAL_XHR_FACTORY = new InjectionToken<() => XMLHttpRequest>(
  'MATERIAL_XHR_FACTORY',
  { providedIn: 'root', factory: () => () => new XMLHttpRequest() },
);

const SUPPORTED = new Set<string>(SUPPORTED_MATERIAL_EXTENSIONS);

export interface MaterialUploadContext {
  courseId: CourseId;
  moduleId: ModuleId;
  lessonId: LessonId;
}

export interface MaterialUploadProgress {
  filename: string;
  percent: number;
}

export interface MaterialUploadFailure {
  filename: string;
  reason: string;
}

type FileCheck =
  | { ok: true; extension: SupportedMaterialExtension }
  | { ok: false; reason: string };

function checkFile(file: File): FileCheck {
  const dot = file.name.lastIndexOf('.');
  const ext = dot >= 0 ? file.name.slice(dot + 1).toLowerCase() : '';
  if (!SUPPORTED.has(ext)) {
    return {
      ok: false,
      reason: 'Unsupported file type. Supported formats: PDF, DOCX, PPTX, XLSX, TXT, ZIP.',
    };
  }
  if (file.size > MATERIAL_MAX_SIZE_BYTES) {
    return { ok: false, reason: 'File exceeds the 50 MB limit.' };
  }
  return { ok: true, extension: ext as SupportedMaterialExtension };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Upload failed.';
}

@Injectable()
export class MaterialUploadService {
  private readonly api = inject(MaterialsService);
  private readonly xhrFactory = inject(MATERIAL_XHR_FACTORY);

  private readonly _inFlight = signal<MaterialUploadProgress[]>([]);
  private readonly _failures = signal<MaterialUploadFailure[]>([]);

  readonly inFlight: Signal<MaterialUploadProgress[]> = this._inFlight.asReadonly();
  readonly failures: Signal<MaterialUploadFailure[]> = this._failures.asReadonly();

  /** Upload a batch of files sequentially. Returns the count that succeeded. */
  async uploadFiles(ctx: MaterialUploadContext, files: File[]): Promise<number> {
    this._failures.set([]);
    let completed = 0;
    for (const file of files) {
      const check = checkFile(file);
      if (!check.ok) {
        this.addFailure(file.name, check.reason);
        continue;
      }
      try {
        await this.uploadOne(ctx, file, check.extension);
        completed++;
      } catch (err) {
        this.addFailure(file.name, errorMessage(err));
      }
    }
    return completed;
  }

  private async uploadOne(
    ctx: MaterialUploadContext,
    file: File,
    extension: SupportedMaterialExtension,
  ): Promise<void> {
    this.setProgress(file.name, 0);
    try {
      const created = await firstValueFrom(
        this.api.createUploadUrl(ctx.courseId, ctx.moduleId, ctx.lessonId, {
          filename: file.name,
          sizeBytes: file.size,
        }),
      );
      const contentType = MATERIAL_CONTENT_TYPE_BY_EXTENSION[extension];
      const status = await this.put(created.uploadUrl, file, contentType, (pct) =>
        this.setProgress(file.name, pct),
      );
      if (status < 200 || status >= 300) {
        throw new Error(`Upload failed with status ${status}.`);
      }
      await firstValueFrom(this.api.complete(created.materialId));
    } finally {
      this.clearProgress(file.name);
    }
  }

  private put(
    url: string,
    file: File,
    contentType: string,
    onProgress: (pct: number) => void,
  ): Promise<number> {
    return new Promise((resolve) => {
      const xhr = this.xhrFactory();
      xhr.open('PUT', url, true);
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.upload.onprogress = (e: ProgressEvent) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => resolve(xhr.status);
      xhr.onerror = () => resolve(0);
      xhr.send(file);
    });
  }

  private setProgress(filename: string, percent: number): void {
    this._inFlight.update((list) => [
      ...list.filter((p) => p.filename !== filename),
      { filename, percent },
    ]);
  }

  private clearProgress(filename: string): void {
    this._inFlight.update((list) => list.filter((p) => p.filename !== filename));
  }

  private addFailure(filename: string, reason: string): void {
    this._failures.update((list) => [...list, { filename, reason }]);
  }
}
```

- [ ] **Step 4: Run the test, expect pass**

Run: `pnpm nx test web-courses -- material-upload.service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/web-courses/src/lib/materials/material-upload.service.ts libs/web-courses/src/lib/materials/material-upload.service.spec.ts
git commit -m "feat(web-courses): add MaterialUploadService"
```

---

## Task 16: `MaterialsListComponent`

**Files:**
- Create: `libs/web-courses/src/lib/materials/materials-list.component.ts`
- Create: `libs/web-courses/src/lib/materials/materials-list.component.html`
- Create: `libs/web-courses/src/lib/materials/materials-list.component.spec.ts`

The component renders the lesson's `READY` materials, an inline-rename affordance per row (reusing the lesson-rename pattern), Download + Remove buttons, an "Add material" file picker, and the reused `ConfirmDialogComponent` for removal.

- [ ] **Step 1: Write the failing test**

Create `libs/web-courses/src/lib/materials/materials-list.component.spec.ts`:

```ts
import { ComponentRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CourseId, LessonId, Material, MaterialId, ModuleId } from '@learnwren/shared-data-models';

import { MaterialsService } from './materials.service';
import { MaterialsListComponent } from './materials-list.component';

function mat(id: string, displayName: string): Material {
  return {
    id: id as MaterialId,
    ownerInstructorId: 'u1' as never,
    courseId: 'c1' as CourseId,
    lessonId: 'l1' as LessonId,
    displayName,
    originalFilename: `${id}.pdf`,
    extension: 'pdf',
    contentType: 'application/pdf',
    sizeBytes: 10,
    state: 'READY',
    storage: { bucket: 'b', path: `materials/${id}/source.pdf` },
    createdAt: '2026-05-21T10:00:00.000Z' as never,
    updatedAt: '2026-05-21T10:00:00.000Z' as never,
  };
}

function apiMock(over: Partial<MaterialsService> = {}): Partial<MaterialsService> {
  return {
    listMaterials: vi.fn().mockReturnValue(of([mat('m1', 'Doc One')])),
    rename: vi.fn().mockReturnValue(of(mat('m1', 'Renamed'))),
    remove: vi.fn().mockReturnValue(of(undefined)),
    getDownloadUrl: vi.fn().mockReturnValue(of({ downloadUrl: 'http://x/d', expiresAt: 'T' })),
    ...over,
  };
}

function render(
  api: Partial<MaterialsService>,
): { fixture: ComponentFixture<MaterialsListComponent>; ref: ComponentRef<MaterialsListComponent> } {
  TestBed.configureTestingModule({
    imports: [MaterialsListComponent],
    providers: [{ provide: MaterialsService, useValue: api }],
  });
  const fixture = TestBed.createComponent(MaterialsListComponent);
  fixture.componentRef.setInput('courseId', 'c1' as CourseId);
  fixture.componentRef.setInput('moduleId', 'm1' as ModuleId);
  fixture.componentRef.setInput('lessonId', 'l1' as LessonId);
  fixture.detectChanges();
  return { fixture, ref: fixture.componentRef };
}

function testIds(fixture: ComponentFixture<unknown>, id: string): HTMLElement[] {
  return Array.from(fixture.nativeElement.querySelectorAll(`[data-testid="${id}"]`));
}

describe('MaterialsListComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('lists the lesson’s materials on init', () => {
    const { fixture } = render(apiMock());
    expect(testIds(fixture, 'material-name')[0].textContent).toContain('Doc One');
  });

  it('shows the empty state when the lesson has no materials', () => {
    const { fixture } = render(apiMock({ listMaterials: vi.fn().mockReturnValue(of([])) }));
    expect(testIds(fixture, 'materials-empty')).toHaveLength(1);
  });

  it('shows a load error when listMaterials fails', () => {
    const { fixture } = render(
      apiMock({ listMaterials: vi.fn().mockReturnValue(throwError(() => new Error('x'))) }),
    );
    expect(testIds(fixture, 'materials-load-error')).toHaveLength(1);
  });

  it('renames a material through the service', async () => {
    const api = apiMock();
    const { fixture } = render(api);
    const cmp = fixture.componentInstance;
    cmp.startRename(mat('m1', 'Doc One'));
    cmp.draftName.set('Renamed');
    await cmp.commitRename(mat('m1', 'Doc One'));
    expect(api.rename).toHaveBeenCalledWith('m1', 'Renamed');
    expect(cmp.materials()[0].displayName).toBe('Renamed');
  });

  it('removes a material only after the confirm dialog is accepted', async () => {
    const api = apiMock();
    const { fixture } = render(api);
    const cmp = fixture.componentInstance;
    cmp.askRemove(mat('m1', 'Doc One'));
    await cmp.confirmRemoval(false);
    expect(api.remove).not.toHaveBeenCalled();
    cmp.askRemove(mat('m1', 'Doc One'));
    await cmp.confirmRemoval(true);
    expect(api.remove).toHaveBeenCalledWith('m1');
    expect(cmp.materials()).toHaveLength(0);
  });

  it('requests a signed URL when Download is clicked', async () => {
    const api = apiMock();
    const { fixture } = render(api);
    const cmp = fixture.componentInstance;
    const openSpy = vi
      .spyOn(cmp as unknown as { openDownload: (u: string) => void }, 'openDownload')
      .mockImplementation(() => undefined);
    await cmp.download(mat('m1', 'Doc One'));
    expect(api.getDownloadUrl).toHaveBeenCalledWith('m1');
    expect(openSpy).toHaveBeenCalledWith('http://x/d');
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

Run: `pnpm nx test web-courses -- materials-list.component`
Expected: FAIL — component module not found.

- [ ] **Step 3: Create the component template**

Create `libs/web-courses/src/lib/materials/materials-list.component.html`:

```html
<section class="materials" data-testid="materials-list">
  <h4>Lesson materials</h4>

  @if (loadError()) {
    <p data-testid="materials-load-error">
      Couldn’t load materials.
      <button type="button" (click)="refresh()">Retry</button>
    </p>
  } @else if (materials().length === 0) {
    <p data-testid="materials-empty">No materials yet.</p>
  }

  <ul>
    @for (m of materials(); track m.id) {
      <li data-testid="material-row">
        @if (editingId() === m.id) {
          <input
            data-testid="material-rename-input"
            type="text"
            [ngModel]="draftName()"
            (ngModelChange)="draftName.set($event)"
            (blur)="commitRename(m)"
            (keydown.enter)="commitRename(m)"
            (keydown.escape)="cancelRename()"
          />
        } @else {
          <button type="button" data-testid="material-name" (click)="startRename(m)">
            {{ m.displayName }}
          </button>
        }
        <button type="button" data-testid="material-download" (click)="download(m)">Download</button>
        <button type="button" data-testid="material-remove" (click)="askRemove(m)">Remove</button>
      </li>
    }
  </ul>

  @for (p of upload.inFlight(); track p.filename) {
    <p data-testid="material-uploading">{{ p.filename }} — {{ p.percent }}%</p>
  }
  @for (f of upload.failures(); track f.filename) {
    <p data-testid="material-upload-error">{{ f.filename }}: {{ f.reason }}</p>
  }

  <label data-testid="material-add">
    Add material
    <input
      type="file"
      multiple
      accept=".pdf,.docx,.pptx,.xlsx,.txt,.zip"
      (change)="onFilesSelected($event)"
    />
  </label>
  <p class="hint">PDF, DOCX, PPTX, XLSX, TXT, or ZIP, up to 50 MB each.</p>

  @if (pendingRemoval(); as m) {
    <lib-confirm-dialog
      [message]="'Remove ‘' + m.displayName + '’? This cannot be undone.'"
      confirmLabel="Remove material"
      (closed)="confirmRemoval($event)"
    />
  }
</section>
```

- [ ] **Step 4: Create the component class**

Create `libs/web-courses/src/lib/materials/materials-list.component.ts`:

```ts
import { Component, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import type {
  CourseId,
  LessonId,
  Material,
  MaterialId,
  ModuleId,
} from '@learnwren/shared-data-models';

import { ConfirmDialogComponent } from '../components/confirm-dialog/confirm-dialog.component';
import { MaterialUploadService } from './material-upload.service';
import { MaterialsService } from './materials.service';

@Component({
  selector: 'lib-materials-list',
  standalone: true,
  imports: [FormsModule, ConfirmDialogComponent],
  templateUrl: './materials-list.component.html',
  providers: [MaterialUploadService],
})
export class MaterialsListComponent {
  private readonly api = inject(MaterialsService);
  private readonly destroyRef = inject(DestroyRef);
  readonly upload = inject(MaterialUploadService);

  readonly courseId = input.required<CourseId>();
  readonly moduleId = input.required<ModuleId>();
  readonly lessonId = input.required<LessonId>();

  readonly materials = signal<Material[]>([]);
  readonly loadError = signal(false);
  readonly editingId = signal<MaterialId | null>(null);
  readonly draftName = signal('');
  readonly pendingRemoval = signal<Material | null>(null);

  constructor() {
    effect(() => {
      const cid = this.courseId();
      const mid = this.moduleId();
      const lid = this.lessonId();
      this.api
        .listMaterials(cid, mid, lid)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (m) => {
            this.materials.set(m);
            this.loadError.set(false);
          },
          error: () => this.loadError.set(true),
        });
    });
  }

  async refresh(): Promise<void> {
    try {
      const m = await firstValueFrom(
        this.api.listMaterials(this.courseId(), this.moduleId(), this.lessonId()),
      );
      this.materials.set(m);
      this.loadError.set(false);
    } catch {
      this.loadError.set(true);
    }
  }

  async onFilesSelected(event: Event): Promise<void> {
    const el = event.target as HTMLInputElement;
    const files = el.files ? Array.from(el.files) : [];
    el.value = '';
    if (files.length === 0) return;
    await this.upload.uploadFiles(
      { courseId: this.courseId(), moduleId: this.moduleId(), lessonId: this.lessonId() },
      files,
    );
    await this.refresh();
  }

  startRename(m: Material): void {
    this.editingId.set(m.id);
    this.draftName.set(m.displayName);
  }

  cancelRename(): void {
    this.editingId.set(null);
  }

  async commitRename(m: Material): Promise<void> {
    const next = this.draftName().trim();
    this.editingId.set(null);
    if (next.length === 0 || next === m.displayName) return;
    const updated = await firstValueFrom(this.api.rename(m.id, next));
    this.materials.update((list) => list.map((x) => (x.id === m.id ? updated : x)));
  }

  askRemove(m: Material): void {
    this.pendingRemoval.set(m);
  }

  async confirmRemoval(confirmed: boolean): Promise<void> {
    const m = this.pendingRemoval();
    this.pendingRemoval.set(null);
    if (!confirmed || !m) return;
    await firstValueFrom(this.api.remove(m.id));
    this.materials.update((list) => list.filter((x) => x.id !== m.id));
  }

  async download(m: Material): Promise<void> {
    try {
      const { downloadUrl } = await firstValueFrom(this.api.getDownloadUrl(m.id));
      this.openDownload(downloadUrl);
    } catch {
      // The material was removed since the page loaded — drop it from the list.
      this.materials.update((list) => list.filter((x) => x.id !== m.id));
    }
  }

  /** Extracted so component tests can spy on it without touching the DOM. */
  protected openDownload(url: string): void {
    const a = document.createElement('a');
    a.href = url;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}
```

- [ ] **Step 5: Run the test, expect pass**

Run: `pnpm nx test web-courses -- materials-list.component`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/web-courses/src/lib/materials/materials-list.component.ts libs/web-courses/src/lib/materials/materials-list.component.html libs/web-courses/src/lib/materials/materials-list.component.spec.ts
git commit -m "feat(web-courses): add MaterialsListComponent"
```

---

## Task 17: Mount `MaterialsListComponent` in the lesson editor

**Files:**
- Modify: `libs/web-courses/src/lib/components/lesson-item/lesson-item.component.ts`
- Modify: `libs/web-courses/src/lib/components/lesson-item/lesson-item.component.html`
- Modify: `libs/web-courses/src/lib/components/lesson-item/lesson-item.component.spec.ts`

The materials list sits below the lesson's video block — visible regardless of video state.

- [ ] **Step 1: Add the failing test**

In `libs/web-courses/src/lib/components/lesson-item/lesson-item.component.spec.ts`, add a test that the rendered lesson item contains the materials list. Append inside the top-level `describe`:

```ts
it('renders the materials list for the lesson', () => {
  // (Reuses this spec file's existing render helper / TestBed setup.)
  const fixture = renderLessonItem(); // existing helper in this spec
  expect(
    fixture.nativeElement.querySelector('[data-testid="materials-list"]'),
  ).not.toBeNull();
});
```

> If this spec file has no shared `renderLessonItem` helper, instead add the assertion to the existing "renders the lesson title" test: after the existing `detectChanges()`, assert `fixture.nativeElement.querySelector('[data-testid="materials-list"]')` is not null. The materials list calls `MaterialsService.listMaterials` on init — ensure the spec's `TestBed` provides a `MaterialsService` whose `listMaterials` returns `of([])` (add `{ provide: MaterialsService, useValue: { listMaterials: () => of([]) } }` to the providers, importing `MaterialsService` from `../../materials/materials.service` and `of` from `rxjs`).

- [ ] **Step 2: Run the test, expect failure**

Run: `pnpm nx test web-courses -- lesson-item.component`
Expected: FAIL — no element with `data-testid="materials-list"`.

- [ ] **Step 3: Import the component in `LessonItemComponent`**

In `libs/web-courses/src/lib/components/lesson-item/lesson-item.component.ts`, add the import:

```ts
import { MaterialsListComponent } from '../../materials/materials-list.component';
```

and add `MaterialsListComponent` to the `@Component` `imports` array:

```ts
  imports: [
    FormsModule,
    VideoUploadComponent,
    VideoStateBadgeComponent,
    VideoPlayerComponent,
    MaterialsListComponent,
  ],
```

- [ ] **Step 4: Mount it in the template**

In `libs/web-courses/src/lib/components/lesson-item/lesson-item.component.html`, immediately before the final closing `</div>`, add:

```html
  <lib-materials-list
    [courseId]="courseId()"
    [moduleId]="lesson().moduleId"
    [lessonId]="lesson().id"
  />
```

- [ ] **Step 5: Run tests + typecheck, expect pass**

Run: `pnpm nx test web-courses && pnpm typecheck`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add libs/web-courses/src/lib/components/lesson-item
git commit -m "feat(web-courses): mount materials list in the lesson editor"
```

---

## Task 18: API e2e — materials lifecycle

**Files:**
- Create: `apps/api-e2e/src/materials.e2e-spec.ts`

Unlike the video e2e (quarantined with `test.fixme` because it needs real GCP credentials), the materials slice has a credential-free fake storage seam, so these e2e tests run fully in CI against the emulators.

- [ ] **Step 1: Write the e2e spec**

Create `apps/api-e2e/src/materials.e2e-spec.ts`:

```ts
import { expect, test, type APIRequestContext } from '@playwright/test';

import {
  API_BASE,
  initAdmin,
  registerAndPromoteInstructor,
  registerStudent,
} from './_helpers/auth';

initAdmin();

const PDF_BYTES = Buffer.from('%PDF-1.4\nfake pdf payload for e2e\n%%EOF');

/** Fake-mode signed URLs are returned relative to the API origin. */
function absolute(url: string): string {
  return url.startsWith('http') ? url : `http://localhost:3333${url}`;
}

async function createCourseModuleLesson(
  request: APIRequestContext,
  hdr: Record<string, string>,
): Promise<{ courseId: string; moduleId: string; lessonId: string }> {
  const c = await request.post(`${API_BASE}/courses`, {
    headers: hdr,
    data: { title: 'Materials Course', description: 'desc' },
  });
  const course = (await c.json()) as { id: string };
  const m = await request.post(`${API_BASE}/courses/${course.id}/modules`, {
    headers: hdr,
    data: { title: 'M1' },
  });
  const mod = (await m.json()) as { id: string };
  const l = await request.post(
    `${API_BASE}/courses/${course.id}/modules/${mod.id}/lessons`,
    { headers: hdr, data: { title: 'L1' } },
  );
  const lesson = (await l.json()) as { id: string };
  return { courseId: course.id, moduleId: mod.id, lessonId: lesson.id };
}

/** Drive upload-url → PUT → complete and return the material id. */
async function uploadMaterial(
  request: APIRequestContext,
  hdr: Record<string, string>,
  loc: { courseId: string; moduleId: string; lessonId: string },
  filename = 'notes.pdf',
): Promise<string> {
  const created = await request.post(
    `${API_BASE}/courses/${loc.courseId}/modules/${loc.moduleId}/lessons/${loc.lessonId}/materials/upload-url`,
    { headers: hdr, data: { filename, sizeBytes: PDF_BYTES.length } },
  );
  expect(created.status()).toBe(201);
  const { materialId, uploadUrl } = (await created.json()) as {
    materialId: string;
    uploadUrl: string;
  };
  const put = await request.put(absolute(uploadUrl), {
    headers: { 'Content-Type': 'application/pdf' },
    data: PDF_BYTES,
  });
  expect(put.ok()).toBe(true);
  const done = await request.post(`${API_BASE}/materials/${materialId}/complete`, {
    headers: hdr,
  });
  expect(done.status()).toBe(200);
  expect(((await done.json()) as { state: string }).state).toBe('READY');
  return materialId;
}

test('materials happy path: upload, list, rename, download, remove', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const hdr = { Cookie: instructor.cookieHeader };
  const loc = await createCourseModuleLesson(request, hdr);

  const matId = await uploadMaterial(request, hdr, loc);

  // List shows the READY material.
  const list = await request.get(
    `${API_BASE}/courses/${loc.courseId}/modules/${loc.moduleId}/lessons/${loc.lessonId}/materials`,
    { headers: hdr },
  );
  expect(list.status()).toBe(200);
  const materials = (await list.json()) as { id: string; displayName: string }[];
  expect(materials).toHaveLength(1);
  expect(materials[0]!.displayName).toBe('notes.pdf');

  // Rename.
  const renamed = await request.patch(`${API_BASE}/materials/${matId}`, {
    headers: hdr,
    data: { displayName: 'Course Notes' },
  });
  expect(renamed.status()).toBe(200);
  expect(((await renamed.json()) as { displayName: string }).displayName).toBe('Course Notes');

  // Download URL → fetch the bytes back.
  const dl = await request.get(`${API_BASE}/materials/${matId}/download-url`, { headers: hdr });
  expect(dl.status()).toBe(200);
  const { downloadUrl } = (await dl.json()) as { downloadUrl: string };
  const file = await request.get(absolute(downloadUrl));
  expect(file.status()).toBe(200);
  expect((await file.body()).length).toBe(PDF_BYTES.length);

  // Remove.
  const del = await request.delete(`${API_BASE}/materials/${matId}`, { headers: hdr });
  expect(del.status()).toBe(204);
  const after = await request.get(
    `${API_BASE}/courses/${loc.courseId}/modules/${loc.moduleId}/lessons/${loc.lessonId}/materials`,
    { headers: hdr },
  );
  expect((await after.json()) as unknown[]).toHaveLength(0);
});

test('rejects unauthenticated, wrong-role, and wrong-instructor requests', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const hdr = { Cookie: instructor.cookieHeader };
  const loc = await createCourseModuleLesson(request, hdr);
  const uploadUrlPath = `${API_BASE}/courses/${loc.courseId}/modules/${loc.moduleId}/lessons/${loc.lessonId}/materials/upload-url`;

  // 401 — no session.
  const unauth = await request.post(uploadUrlPath, {
    data: { filename: 'a.pdf', sizeBytes: 10 },
  });
  expect(unauth.status()).toBe(401);

  // 403 INSUFFICIENT_ROLE — a student.
  const student = await registerStudent(request);
  const asStudent = await request.post(uploadUrlPath, {
    headers: { Cookie: student.cookieHeader },
    data: { filename: 'a.pdf', sizeBytes: 10 },
  });
  expect(asStudent.status()).toBe(403);
  expect(((await asStudent.json()) as { error: { code: string } }).error.code).toBe(
    'INSUFFICIENT_ROLE',
  );

  // 403 NOT_COURSE_OWNER — a different instructor.
  const other = await registerAndPromoteInstructor(request);
  const asOther = await request.post(uploadUrlPath, {
    headers: { Cookie: other.cookieHeader },
    data: { filename: 'a.pdf', sizeBytes: 10 },
  });
  expect(asOther.status()).toBe(403);
  expect(((await asOther.json()) as { error: { code: string } }).error.code).toBe(
    'NOT_COURSE_OWNER',
  );

  // 403 NOT_MATERIAL_OWNER — the other instructor on a material they don't own.
  const matId = await uploadMaterial(request, hdr, loc);
  const otherDownload = await request.get(`${API_BASE}/materials/${matId}/download-url`, {
    headers: { Cookie: other.cookieHeader },
  });
  expect(otherDownload.status()).toBe(403);
  expect(((await otherDownload.json()) as { error: { code: string } }).error.code).toBe(
    'NOT_MATERIAL_OWNER',
  );
});

test('rejects an unsupported file type at upload-url', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const hdr = { Cookie: instructor.cookieHeader };
  const loc = await createCourseModuleLesson(request, hdr);
  const res = await request.post(
    `${API_BASE}/courses/${loc.courseId}/modules/${loc.moduleId}/lessons/${loc.lessonId}/materials/upload-url`,
    { headers: hdr, data: { filename: 'malware.exe', sizeBytes: 10 } },
  );
  expect(res.status()).toBe(400);
  expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
    'UNSUPPORTED_MATERIAL_TYPE',
  );
});

test('complete is rejected when the object was never uploaded, and on a second call', async ({
  request,
}) => {
  const instructor = await registerAndPromoteInstructor(request);
  const hdr = { Cookie: instructor.cookieHeader };
  const loc = await createCourseModuleLesson(request, hdr);

  // upload-url but no PUT → 422 UPLOAD_OBJECT_MISSING.
  const created = await request.post(
    `${API_BASE}/courses/${loc.courseId}/modules/${loc.moduleId}/lessons/${loc.lessonId}/materials/upload-url`,
    { headers: hdr, data: { filename: 'notes.pdf', sizeBytes: PDF_BYTES.length } },
  );
  const { materialId } = (await created.json()) as { materialId: string };
  const noObject = await request.post(`${API_BASE}/materials/${materialId}/complete`, {
    headers: hdr,
  });
  expect(noObject.status()).toBe(422);
  expect(((await noObject.json()) as { error: { code: string } }).error.code).toBe(
    'UPLOAD_OBJECT_MISSING',
  );

  // Now a full upload, then a second complete → 409 INVALID_MATERIAL_STATE.
  const matId = await uploadMaterial(request, hdr, loc);
  const again = await request.post(`${API_BASE}/materials/${matId}/complete`, { headers: hdr });
  expect(again.status()).toBe(409);
  expect(((await again.json()) as { error: { code: string } }).error.code).toBe(
    'INVALID_MATERIAL_STATE',
  );
});

test('deleting the lesson cascades to its materials', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const hdr = { Cookie: instructor.cookieHeader };
  const loc = await createCourseModuleLesson(request, hdr);
  const matId = await uploadMaterial(request, hdr, loc);

  const del = await request.delete(
    `${API_BASE}/courses/${loc.courseId}/modules/${loc.moduleId}/lessons/${loc.lessonId}`,
    { headers: hdr },
  );
  expect(del.status()).toBe(204);

  // The material doc is gone — its download-url now 404s.
  const dl = await request.get(`${API_BASE}/materials/${matId}/download-url`, { headers: hdr });
  expect(dl.status()).toBe(404);
  expect(((await dl.json()) as { error: { code: string } }).error.code).toBe('MATERIAL_NOT_FOUND');
});
```

- [ ] **Step 2: Run the e2e suite, expect pass**

Boot the emulators in one terminal (`pnpm emulators`), then:

```bash
pnpm nx e2e api-e2e -- --grep "materials"
```

Expected: all five materials tests PASS. (If `api-e2e` is wired into CI to boot its own emulators + api, run `pnpm nx e2e api-e2e` to confirm the whole suite is green.)

- [ ] **Step 3: Commit**

```bash
git add apps/api-e2e/src/materials.e2e-spec.ts
git commit -m "test(api-e2e): cover the lesson materials lifecycle"
```

---

## Task 19: Web e2e — materials in the lesson editor

**Files:**
- Create: `apps/web-e2e/src/materials.spec.ts`

- [ ] **Step 1: Write the e2e spec**

Create `apps/web-e2e/src/materials.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';
import * as admin from 'firebase-admin';

// Mirrors the auth + course setup helpers in publish-gate.spec.ts. Intentionally
// duplicated (see the note in publish-gate.spec.ts) to avoid touching that file.
if (admin.apps.length === 0) {
  process.env['FIREBASE_AUTH_EMULATOR_HOST'] = '127.0.0.1:9099';
  process.env['FIRESTORE_EMULATOR_HOST'] = '127.0.0.1:8080';
  admin.initializeApp({ projectId: 'demo-learnwren' });
}

const API_BASE = 'http://localhost:3333/api';

async function registerAndPromoteInstructor(): Promise<{ email: string; password: string }> {
  const email = `mat-e2e-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;
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

async function setupCourseWithLesson(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 10_000 });
  await page.goto('/courses');
  await expect(page.getByTestId('create-course')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('create-course').click();
  await page.getByTestId('title').fill(`Materials E2E ${Date.now()}`);
  await page.getByTestId('description').fill('e2e materials course');
  await page.getByTestId('submit').click();
  await expect(page.getByTestId('course-meta')).toBeVisible({ timeout: 10_000 });
  page.once('dialog', async (d) => { await d.accept('Materials Module'); });
  await page.getByTestId('add-module').click();
  await expect(page.getByTestId('module-title')).toHaveText('Materials Module', { timeout: 5_000 });
  await page.getByTestId('add-lesson').click();
  await page.getByTestId('add-lesson-input').fill('Materials Lesson');
  await page.getByTestId('add-lesson-input').press('Enter');
  await expect(page.getByTestId('lesson-title')).toHaveText('Materials Lesson', { timeout: 5_000 });
}

test('instructor uploads, downloads, and removes a lesson material', async ({ page }) => {
  const { email, password } = await registerAndPromoteInstructor();
  await setupCourseWithLesson(page, email, password);

  await expect(page.getByTestId('materials-list')).toBeVisible();
  await expect(page.getByTestId('materials-empty')).toBeVisible();

  // Pick a file via the hidden <input type=file> inside the "Add material" label.
  await page
    .getByTestId('material-add')
    .locator('input[type=file]')
    .setInputFiles({
      name: 'study-guide.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\nweb e2e fixture\n%%EOF'),
    });

  // The material appears in the list.
  await expect(page.getByTestId('material-name')).toHaveText('study-guide.pdf', {
    timeout: 15_000,
  });

  // Download triggers a browser download with the original filename.
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('material-download').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('study-guide.pdf');

  // Remove via the confirm dialog.
  await page.getByTestId('material-remove').click();
  await expect(page.getByTestId('confirm-dialog')).toBeVisible();
  await page.getByTestId('confirm-go').click();
  await expect(page.getByTestId('materials-empty')).toBeVisible({ timeout: 10_000 });
});

test('an unsupported file type is rejected with an inline message', async ({ page }) => {
  const { email, password } = await registerAndPromoteInstructor();
  await setupCourseWithLesson(page, email, password);

  await page
    .getByTestId('material-add')
    .locator('input[type=file]')
    .setInputFiles({
      name: 'malware.exe',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('MZ fake executable'),
    });

  await expect(page.getByTestId('material-upload-error')).toContainText(/unsupported/i, {
    timeout: 10_000,
  });
  await expect(page.getByTestId('materials-empty')).toBeVisible();
});
```

- [ ] **Step 2: Run the web e2e suite, expect pass**

With emulators + both apps running (or via the configured `pnpm nx e2e web-e2e` harness):

```bash
pnpm nx e2e web-e2e -- --grep "material"
```

Expected: both materials tests PASS, no console errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web-e2e/src/materials.spec.ts
git commit -m "test(web-e2e): cover lesson materials in the editor"
```

---

## Task 20: Documentation updates

**Files:**
- Modify: `.env.tpl`
- Modify: `README.md`
- Modify: `docs/USER_GUIDE.md`
- Modify: `docs/development.md`
- Modify: `docs/superpowers/specs/2026-03-27-mvp-use-cases-design.md`

- [ ] **Step 1: Add the materials bucket to `.env.tpl`**

In `.env.tpl`, after the `# ── Video transcoding (EP-03 slice B) ──` block (after the last `LEARNWREN_TRANSCODER_INVOKER_SA_EMAIL` line), append:

```
# ── Lesson materials (EP-04) ─────────────────────────────────────────
# Cloud Storage bucket for instructor-uploaded lesson materials (PDF,
# DOCX, PPTX, XLSX, TXT, ZIP). Separate from the video buckets so a
# future video-source lifecycle rule cannot sweep materials away.
# Outside production this defaults to `learnwren-dev-materials` and needs
# no provisioning — the Storage emulator hosts it on demand. In production,
# create it and grant the Cloud Functions SA roles/storage.objectAdmin.
LEARNWREN_MATERIALS_BUCKET=op://learnwren/dev/LEARNWREN_MATERIALS_BUCKET
```

- [ ] **Step 2: Update the `README.md` status banner**

In `README.md`, inside the `> [!NOTE]` **PROJECT STATUS** banner, immediately after the sentence ending `...instructors can publish / unpublish / archive / restore courses with structured eligibility feedback.**`, insert:

```
> **EP-04 (Lesson Materials) complete: instructors attach, rename, and remove supplementary files (PDF, DOCX, PPTX, XLSX, TXT, ZIP — up to 50 MB each) on a lesson, and download them via a short-lived signed URL. Enrolled-student download arrives with EP-06.**
```

- [ ] **Step 3: Add the materials endpoints to the `README.md` API table**

In `README.md`, after the "API endpoints exposed by slice D (course publish gate)" table, add a new table:

```markdown
The API endpoints exposed by EP-04 (lesson materials):

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `POST` | `/api/courses/:cid/modules/:mid/lessons/:lid/materials/upload-url` | Validate type + size; create a `PENDING_UPLOAD` material; return a signed upload URL. |
| `POST` | `/api/materials/:matId/complete` | HEAD-verify the uploaded object; transition the material to `READY`. |
| `GET`  | `/api/courses/:cid/modules/:mid/lessons/:lid/materials` | List the lesson's `READY` materials. |
| `PATCH`| `/api/materials/:matId` | Rename a material's display name. |
| `DELETE` | `/api/materials/:matId` | Remove a material (storage object + metadata). |
| `GET`  | `/api/materials/:matId/download-url` | Mint a 15-minute signed download URL (owner-gated; enrolled students in EP-06). |
```

- [ ] **Step 4: Document the feature in `docs/USER_GUIDE.md`**

In `docs/USER_GUIDE.md`, add a "Lesson materials" subsection under the course-authoring / lesson content area (place it near the video-upload documentation). Use this content:

```markdown
### Lesson materials

Below each lesson's video, instructors can attach supplementary files —
PDF, DOCX, PPTX, XLSX, TXT, or ZIP, up to 50 MB each. Click **Add material**
and choose one or more files; unsupported or oversized files are skipped with
an inline message while the rest upload. Each material gets its filename as a
default display name, which you can rename inline. **Download** fetches the
file through a short-lived signed link; **Remove** deletes it after a
confirmation prompt.

Today, downloads are available to the course owner. Enrolled-student access to
lesson materials is delivered with the learning experience (EP-06).
```

- [ ] **Step 5: Note the env var in `docs/development.md`**

In `docs/development.md`, in the environment-variables / configuration section, add:

```markdown
- `LEARNWREN_MATERIALS_BUCKET` — Cloud Storage bucket for lesson materials
  (EP-04). Outside production it defaults to `learnwren-dev-materials` and
  needs no provisioning. In emulator/dev mode the materials storage runs in
  `fake` mode: signed upload/download URLs are replaced by internal passthrough
  endpoints (`/api/internal/fake-materials/:matId`) so no GCP credentials are
  required. Set `LEARNWREN_MATERIALS_STORAGE_FAKE` / the TTL overrides only to
  diverge from the defaults.
```

- [ ] **Step 6: Mark UC-04-01 / UC-04-02 as addressed in the MVP use-cases spec**

In `docs/superpowers/specs/2026-03-27-mvp-use-cases-design.md`, immediately after the EP-04 use-case table, add:

```markdown
> **Note on UC-04-01 / UC-04-02 in MVP:** Both are addressed by `docs/superpowers/specs/2026-05-21-lesson-materials-design.md`. UC-04-02's download endpoint ships owner-gated; the enrolled-student precondition is wired when EP-06 lands.
```

- [ ] **Step 7: Verify the docs build is unaffected and commit**

```bash
pnpm lint
git add .env.tpl README.md docs/USER_GUIDE.md docs/development.md docs/superpowers/specs/2026-03-27-mvp-use-cases-design.md
git commit -m "docs: document EP-04 lesson materials"
```

---

## Task 21: Quality gates — mutation, CRAP, final verification

**Files:**
- Modify: `docs/quality/mutation-report.md`
- Modify: `docs/quality/crap-report.md`
- Modify: `reports/mutation/api-courses/` (regenerated output)
- Modify: `docs/superpowers/specs/2026-05-21-lesson-materials-design.md` (status banner)

- [ ] **Step 1: Full workspace verification**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: all four green. Fix any failure before continuing — do not proceed with a red gate.

- [ ] **Step 2: Run the api-courses mutation suite**

Run the existing `api-courses` Stryker configuration (the exact command is documented in `docs/quality/mutation-report.md` / `docs/quality/README.md` — it uses `stryker.api-courses.config.mjs`, which already globs `libs/api-courses/src/lib/**/*.ts`, so the new `materials/` files are mutated automatically).

Expected: effective mutation score on `libs/api-courses` ≥ 85%. If surviving mutants drop it below the bar, add targeted assertions to the relevant `materials/**/*.spec.ts` files (the most likely gaps: the `parseExtension` branch, the `SIZE_TOLERANCE` comparison in `complete`, and the `storageImpl` branch in `MaterialsStorageAdapter`). Re-run until ≥ 85% or the survivor is a documented equivalent.

- [ ] **Step 3: Refresh the quality reports**

- Regenerate `reports/mutation/api-courses/` raw output and fold the triage summary into `docs/quality/mutation-report.md` (note any documented equivalent mutants in the new `materials/` surface).
- Regenerate `docs/quality/crap-report.md` with the CRAP tool (`docs/quality/README.md` documents the command) so it covers the new `libs/api-courses/src/lib/materials/` and `libs/web-courses/src/lib/materials/` files.

- [ ] **Step 4: Flip the design-spec status to APPROVED**

In `docs/superpowers/specs/2026-05-21-lesson-materials-design.md`, replace the status banner:

```markdown
> [!NOTE]
> **DOCUMENT STATUS: DRAFT**
> This document is a living specification and is subject to change. All content is considered provisional until formally approved by project stakeholders.
```

with:

```markdown
> [!NOTE]
> **DOCUMENT STATUS: APPROVED**
> Approved at EP-04 implementation merge (2026-05-21).
```

- [ ] **Step 5: Run the e2e suites one final time**

With the emulators running:

```bash
pnpm nx e2e api-e2e
pnpm nx e2e web-e2e
```

Expected: green (the materials suites pass; no regression in auth / courses / videos / publish suites — the video suites remain `test.fixme`-quarantined as before).

- [ ] **Step 6: Final commit**

```bash
git add docs/quality/mutation-report.md docs/quality/crap-report.md reports/mutation docs/superpowers/specs/2026-05-21-lesson-materials-design.md
git commit -m "chore(quality): refresh mutation + CRAP reports for EP-04; approve spec"
```

- [ ] **Step 7: Open the pull request**

```bash
git push -u origin ep-04-lesson-materials
```

Then open a PR titled `feat: EP-04 lesson materials` summarising: instructor attach/rename/remove of supplementary files, owner-gated signed download, top-level `materials` collection with deny-all rules, dedicated bucket with a credential-free fake seam, and the cascade-delete on lesson removal.

---

## Acceptance checklist

Before calling EP-04 done, confirm:

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` all pass.
- [ ] `pnpm nx e2e api-e2e` and `pnpm nx e2e web-e2e` pass; the materials suites run (not quarantined).
- [ ] Mutation score on `libs/api-courses` ≥ 85% effective; `docs/quality/mutation-report.md` refreshed.
- [ ] `docs/quality/crap-report.md` covers the new `materials/` submodules.
- [ ] `firestore.rules` + `firestore.emulator.rules` deny-all `materials/**`; the rules e2e proves it for student / instructor / anonymous.
- [ ] README, USER_GUIDE, development.md, `.env.tpl`, and the MVP use-cases spec are updated.
- [ ] The design spec status is flipped to APPROVED.
- [ ] A second instructor cannot read, mutate, or download another instructor's material (covered by the api-e2e negative-paths test).


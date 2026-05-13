# Video Upload (EP-03 Slice A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship UC-03-01 main success end-to-end — an instructor can upload an MP4 / MOV / MKV file (≤10 GB) to a lesson via resumable upload; the lesson persistently shows the uploaded state; deleting the lesson cascade-deletes the video and source object.

**Architecture:** Two new libs (`libs/api-video`, `libs/web-video`) following the EP-02 lib patterns exactly. `Video` and `VideoKey` join the Firestore collections as top-level documents with deny-all rules; every access goes through `api-video`. `InstructorRoleGuard` hoists from `api-courses` to `api-auth`. Cross-lib cascade-delete: `api-courses` → `api-video.VideoService.deleteForLesson`. Client uses XHR with `Content-Range` for chunked resumable PUT against a server-issued Cloud Storage session URI.

**Tech Stack:** NestJS 11, Angular 21.2 (signals + standalone components), `@google-cloud/storage` (already a transitive dep of `firebase-admin`), `firebase-admin` 13.8, Vitest 4.1, Stryker 9.6, Playwright Test, `@firebase/rules-unit-testing`.

**Foundation specs:**
- `docs/superpowers/specs/2026-05-13-video-upload-slice-a-design.md` (this slice — authoritative)
- `docs/superpowers/specs/2026-05-13-video-pipeline-architecture-design.md` (architecture, parent)
- `docs/superpowers/specs/2026-05-12-course-authoring-design.md` (EP-02 — patterns to match)

**Repo conventions to follow:**
- Conventional Commits (`feat(...)`, `fix(...)`, `chore(...)`, `test(...)`, `docs(...)`)
- Branded ID types from `@learnwren/shared-data-models` (`EntityId<'X'>`, `ISODateString`)
- DI tokens from `@learnwren/api-firebase` (`FIRESTORE`, `FIREBASE_AUTH`, `FIREBASE_STORAGE`)
- Path aliases `@learnwren/<lib>` (set in `tsconfig.base.json`)
- Domain exceptions (not raw `HttpException`); funnel through `*-exception-filter.ts`
- Mutation exclusions: `*.repository.ts`, `*.module.ts`, `*.exception-filter.ts`, `dto/`, `types/`, `errors/`, `index.ts`
- After every task: `pnpm affected` should pass; commit a fully-green increment

**Pre-flight check** (run before Task 1):

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test
git status   # must be clean
git checkout -b ep-03-slice-a-video-upload
```

---

## Task 1: Scaffold `libs/api-video` and `libs/web-video`, wire path aliases

**Files:**
- Create: `libs/api-video/` (Nx-generated)
- Create: `libs/web-video/` (Nx-generated)
- Modify: `tsconfig.base.json` (add path aliases)
- Modify: `package.json` (add `mutate:api-video` script; extend `crap:coverage` and `mutate`)
- Modify: `stryker.api-courses.config.mjs` if needed (no change expected)

- [ ] **Step 1: Scaffold api-video as a NestJS library**

```bash
pnpm nx g @nx/nest:library api-video \
  --directory=libs/api-video \
  --buildable \
  --strict \
  --setParserOptionsProject \
  --no-interactive
```

Expected: new `libs/api-video/` with `src/index.ts`, `src/lib/api-video.module.ts`, `project.json`, `tsconfig.lib.json`, `vitest.config.mts`, etc.

- [ ] **Step 2: Verify api-video scaffold**

```bash
ls libs/api-video/src/lib/
pnpm nx test api-video
```

Expected: scaffolded files present; default test passes (the generator creates a smoke test).

- [ ] **Step 3: Scaffold web-video as an Angular library**

```bash
pnpm nx g @nx/angular:library web-video \
  --directory=libs/web-video \
  --buildable \
  --standalone \
  --strict \
  --no-interactive
```

Expected: new `libs/web-video/` with `src/index.ts`, `src/lib/`, `src/test-setup.ts`, `project.json`, `vitest.config.mts`.

- [ ] **Step 4: Verify web-video scaffold**

```bash
pnpm nx test web-video
```

Expected: default test passes.

- [ ] **Step 5: Add path aliases**

Edit `tsconfig.base.json` to add (in the `compilerOptions.paths` block):

```json
"@learnwren/api-video": ["./libs/api-video/src/index.ts"],
"@learnwren/web-video": ["./libs/web-video/src/index.ts"]
```

- [ ] **Step 6: Update `package.json` scripts**

In `package.json`:

```jsonc
"mutate:api-video": "stryker run stryker.api-video.config.mjs",
"mutate": "pnpm mutate:api-auth && pnpm mutate:api-courses && pnpm mutate:api-video && pnpm mutate:report",
"crap:coverage": "nx run-many -t test --coverage --coverage.reportOnFailure=true --projects=api-auth,api-courses,api-firebase,api-video,web-auth,web-courses,web-video,shared-data-models,api --skip-nx-cache --parallel=1 || true",
```

- [ ] **Step 7: Smoke run**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected: all pass. New libs picked up automatically by `nx run-many`.

- [ ] **Step 8: Commit**

```bash
git add libs/api-video libs/web-video tsconfig.base.json package.json
git commit -m "chore(scaffold): create api-video and web-video libs + path aliases"
```

---

## Task 2: Add `Video` and `VideoKey` types to `shared-data-models`; update `Lesson`

**Files:**
- Modify: `libs/shared-data-models/src/lib/common.ts`
- Create: `libs/shared-data-models/src/lib/video.ts`
- Modify: `libs/shared-data-models/src/lib/lesson.ts`
- Create: `libs/shared-data-models/src/lib/video.spec.ts`
- Modify: `libs/shared-data-models/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/shared-data-models/src/lib/video.spec.ts`:

```ts
import type { Video, VideoKey, VideoState } from './video';
import type { CourseId, LessonId, UserId } from './common';

describe('Video', () => {
  it('compiles with all expected fields and the correct state union', () => {
    const states: VideoState[] = [
      'PENDING_UPLOAD',
      'UPLOADING',
      'UPLOADED',
      'TRANSCODING',
      'READY',
      'FAILED',
    ];
    expect(states).toHaveLength(6);

    const v: Video = {
      id: 'v1' as Video['id'],
      ownerInstructorId: 'u1' as UserId,
      courseId: 'c1' as CourseId,
      lessonId: 'l1' as LessonId,
      state: 'PENDING_UPLOAD',
      source: { bucket: 'src', path: 'videos/v1/source.mp4', sizeBytes: 10 },
      createdAt: '2026-05-13T00:00:00.000Z' as Video['createdAt'],
      updatedAt: '2026-05-13T00:00:00.000Z' as Video['updatedAt'],
    };
    expect(v.state).toBe('PENDING_UPLOAD');

    const k: VideoKey = {
      id: 'k1' as VideoKey['id'],
      videoId: v.id,
      key: 'AAAAAAAAAAAAAAAAAAAAAA==',
      createdAt: v.createdAt,
    };
    expect(k.videoId).toBe(v.id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm nx test shared-data-models -- video.spec
```

Expected: FAIL (no `./video` module).

- [ ] **Step 3: Add branded ID types**

In `libs/shared-data-models/src/lib/common.ts`, append after the existing `EnrollmentId` line:

```ts
export type VideoId = EntityId<'Video'>;
export type VideoKeyId = EntityId<'VideoKey'>;
```

- [ ] **Step 4: Create `video.ts`**

Create `libs/shared-data-models/src/lib/video.ts`:

```ts
import type {
  CourseId,
  ISODateString,
  LessonId,
  UserId,
  VideoId,
  VideoKeyId,
} from './common';

export type VideoState =
  | 'PENDING_UPLOAD'
  | 'UPLOADING'
  | 'UPLOADED'
  | 'TRANSCODING'
  | 'READY'
  | 'FAILED';

export interface VideoSource {
  bucket: string;
  path: string;
  sizeBytes?: number;
}

export interface VideoOutput {
  bucket: string;
  manifestPath: string;
  durationSec: number;
}

export interface Video {
  id: VideoId;
  ownerInstructorId: UserId;
  courseId: CourseId;
  lessonId: LessonId;
  state: VideoState;
  source: VideoSource;
  output?: VideoOutput;
  transcoderJobName?: string;
  keyId?: VideoKeyId;
  failureReason?: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface VideoKey {
  id: VideoKeyId;
  videoId: VideoId;
  key: string;
  createdAt: ISODateString;
}
```

- [ ] **Step 5: Update `lesson.ts`**

Replace `libs/shared-data-models/src/lib/lesson.ts` with:

```ts
import type { ISODateString, LessonId, ModuleId, VideoId } from './common';

export interface Lesson {
  id: LessonId;
  moduleId: ModuleId;
  title: string;
  description?: string;
  videoId?: VideoId;
  order: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
```

- [ ] **Step 6: Re-export from index**

In `libs/shared-data-models/src/index.ts`, add at the end:

```ts
export * from './lib/video';
```

- [ ] **Step 7: Run tests and typecheck**

```bash
pnpm nx test shared-data-models
pnpm typecheck
```

Expected: video.spec passes; typecheck fails in `api-courses` and `web-courses` because they reference `Lesson.videoUrl`. We'll fix in the same commit since the type change is intrinsic.

- [ ] **Step 8: Fix `api-courses` references to `videoUrl`**

```bash
grep -rn "videoUrl" libs/api-courses libs/web-courses apps
```

Expect ~handful of hits in `api-courses` (DTOs, service) and `web-courses` (templates / services). The EP-02 spec set `videoUrl?: string` as a placeholder. Slice A drops it.

- Drop any `videoUrl` from `libs/api-courses/src/lib/dto/create-lesson.dto.ts` and `update-lesson.dto.ts` if present.
- Drop any `videoUrl` references from `libs/api-courses/src/lib/courses.service.ts`.
- Drop references from `libs/api-courses/src/lib/courses.repository.ts`.
- In `web-courses` templates: remove any badge or text that referenced `lesson.videoUrl`.

Do not add `videoId` reads anywhere yet — Task 9 wires the cascade and Task 19 wires the LessonItem UI.

- [ ] **Step 9: Run all tests + typecheck**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected: all green.

- [ ] **Step 10: Commit**

```bash
git add libs/shared-data-models libs/api-courses libs/web-courses
git commit -m "feat(shared-data-models): add Video and VideoKey; Lesson.videoUrl → videoId"
```

---

## Task 3: Add `videos/` and `videoKeys/` deny-all to Firestore rules + rules test

**Files:**
- Modify: `firestore.rules`
- Modify: `firestore.emulator.rules`
- Modify: `apps/api-e2e/src/firestore-rules.e2e-spec.ts`

- [ ] **Step 1: Update `firestore.rules`**

Insert (after the existing `match /courses/{courseId} { ... }` block, before the deny-by-default block):

```
    match /videos/{videoId} {
      allow read, write: if false;
    }

    match /videoKeys/{keyId} {
      allow read, write: if false;
    }
```

- [ ] **Step 2: Update `firestore.emulator.rules`**

Make the identical edit. (Both files diverge only in the `_smoke` block; the new rules apply to both.)

- [ ] **Step 3: Write failing rules test**

In `apps/api-e2e/src/firestore-rules.e2e-spec.ts`, append:

```ts
test('videos/** is deny-all from authenticated and anonymous principals', async () => {
  const testEnv = await initializeTestEnvironment({
    projectId: 'demo-learnwren',
    firestore: { host: '127.0.0.1', port: 8080 },
  });
  try {
    const anonDb = testEnv.unauthenticatedContext().firestore();
    const studentDb = testEnv.authenticatedContext('student-uid', { role: 'STUDENT' }).firestore();
    const instructorDb = testEnv.authenticatedContext('inst-uid', { role: 'INSTRUCTOR' }).firestore();

    for (const db of [anonDb, studentDb, instructorDb]) {
      await assertFails(db.collection('videos').doc('v1').get());
      await assertFails(db.collection('videos').doc('v1').set({ x: 1 }));
      await assertFails(db.collection('videoKeys').doc('k1').get());
      await assertFails(db.collection('videoKeys').doc('k1').set({ x: 1 }));
    }
  } finally {
    await testEnv.cleanup();
  }
});
```

If `initializeTestEnvironment`, `assertFails` are not already imported at the top of the file, add the import line:

```ts
import { assertFails, initializeTestEnvironment } from '@firebase/rules-unit-testing';
```

(Refer to the existing tests in the same file for the canonical setup — reuse the existing helper if one exists rather than redefining it.)

- [ ] **Step 4: Run rules test against emulator**

```bash
# In a separate terminal: pnpm emulators
pnpm nx run api-e2e:e2e --testNamePattern="videos/\\*\\* is deny-all"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules firestore.emulator.rules apps/api-e2e/src/firestore-rules.e2e-spec.ts
git commit -m "feat(rules): deny-all for videos/** and videoKeys/**"
```

---

## Task 4: Hoist `InstructorRoleGuard` from `api-courses` to `api-auth`

**Files:**
- Create: `libs/api-auth/src/lib/instructor-role.guard.ts`
- Create: `libs/api-auth/src/lib/instructor-role.guard.spec.ts`
- Modify: `libs/api-auth/src/index.ts` (export the guard)
- Modify: `libs/api-auth/src/lib/auth.module.ts` (provide the guard)
- Delete: `libs/api-courses/src/lib/instructor-role.guard.ts`
- Delete: `libs/api-courses/src/lib/instructor-role.guard.spec.ts`
- Modify: `libs/api-courses/src/lib/courses.module.ts` (remove provider; import from api-auth)
- Modify: `libs/api-courses/src/lib/courses.controller.ts` (update import path)
- Modify: `libs/api-courses/src/lib/errors/courses.exception.ts` (move `InsufficientRoleException` to api-auth)
- Create: `libs/api-auth/src/lib/errors/auth.exception.ts` if not already there (it exists — extend it)

- [ ] **Step 1: Move `InsufficientRoleException` to `api-auth`**

In `libs/api-auth/src/lib/errors/auth.exception.ts`, add (alongside the existing exception classes):

```ts
export class InsufficientRoleException extends AuthException {
  constructor() {
    super('INSUFFICIENT_ROLE', 'Instructor role required.', 403);
  }
}
```

If `INSUFFICIENT_ROLE` is not already in `libs/api-auth/src/lib/errors/auth-error.codes.ts`, add it to the union.

- [ ] **Step 2: Create the guard in `api-auth`**

Create `libs/api-auth/src/lib/instructor-role.guard.ts`:

```ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import { InsufficientRoleException } from './errors/auth.exception';
import type { AuthenticatedRequest } from './types/authenticated-request';

@Injectable()
export class InstructorRoleGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (req.user?.role !== 'INSTRUCTOR') {
      throw new InsufficientRoleException();
    }
    return true;
  }
}
```

- [ ] **Step 3: Port the spec**

Create `libs/api-auth/src/lib/instructor-role.guard.spec.ts`. Copy the contents of the old `libs/api-courses/src/lib/instructor-role.guard.spec.ts` verbatim, updating the import:

```ts
import { InsufficientRoleException } from './errors/auth.exception';
import { InstructorRoleGuard } from './instructor-role.guard';
```

(Run the file through and adjust any import paths to point at `api-auth` internals.)

- [ ] **Step 4: Export from `api-auth` index + register in module**

In `libs/api-auth/src/index.ts`:

```ts
export { InstructorRoleGuard } from './lib/instructor-role.guard';
export { InsufficientRoleException } from './lib/errors/auth.exception';
```

In `libs/api-auth/src/lib/auth.module.ts`, add `InstructorRoleGuard` to `providers` and `exports`.

- [ ] **Step 5: Run new api-auth tests**

```bash
pnpm nx test api-auth
```

Expected: all pass, including the new hoisted guard spec.

- [ ] **Step 6: Remove the old guard from api-courses**

```bash
rm libs/api-courses/src/lib/instructor-role.guard.ts
rm libs/api-courses/src/lib/instructor-role.guard.spec.ts
```

- [ ] **Step 7: Drop `InsufficientRoleException` from `courses.exception.ts`**

In `libs/api-courses/src/lib/errors/courses.exception.ts`, delete the `InsufficientRoleException` class. In `libs/api-courses/src/lib/errors/courses-error.codes.ts`, remove `'INSUFFICIENT_ROLE'` from the union (since this is now owned by api-auth's filter).

- [ ] **Step 8: Update `courses.module.ts`**

Remove `InstructorRoleGuard` from `providers`. Ensure `AuthModule` is still imported. The guard will be resolved via the `AuthModule` DI exposure.

- [ ] **Step 9: Update `courses.controller.ts` imports**

Replace:

```ts
import { InstructorRoleGuard } from './instructor-role.guard';
```

with:

```ts
import { InstructorRoleGuard } from '@learnwren/api-auth';
```

- [ ] **Step 10: Update `courses.exception-filter.ts`**

If the filter explicitly catches `InsufficientRoleException`, switch its import to `@learnwren/api-auth`. Also ensure the filter rethrows or maps `AuthException` subclasses correctly — match the existing `auth.exception-filter.ts` shape. Check whether the filter delegates to `AuthExceptionFilter` for non-courses exceptions; if so, the rethrow path may already work.

- [ ] **Step 11: Run all tests + typecheck**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected: all green. If anything fails, the import path is the most likely cause.

- [ ] **Step 12: Verify api-courses mutation score hasn't regressed**

```bash
pnpm mutate:api-courses
```

Expected: mutation score ≥ EP-02 baseline. If it dropped, the hoist removed test coverage the courses mutation analysis was counting. Address by ensuring the courses spec suite still exercises the IS_INSTRUCTOR gate end-to-end (it will via e2e), or by accepting the now-equivalent mutants in a triage note.

- [ ] **Step 13: Commit**

```bash
git add libs/api-auth libs/api-courses
git commit -m "refactor(api-auth): hoist InstructorRoleGuard from api-courses to api-auth"
```

---

## Task 5: Add `LEARNWREN_VIDEO_SOURCE_BUCKET` and `LEARNWREN_VIDEO_STUCK_THRESHOLD_MINUTES` env config

**Files:**
- Modify: `.env.tpl`
- Modify: `apps/api/src/...` (find the existing config loader / module)
- Create: `libs/api-video/src/lib/video.config.ts`

- [ ] **Step 1: Add env keys to `.env.tpl`**

Append to `.env.tpl` (consult the file's existing op-injection syntax; mimic an existing entry):

```
LEARNWREN_VIDEO_SOURCE_BUCKET=op://Learn Wren/dev/LEARNWREN_VIDEO_SOURCE_BUCKET
LEARNWREN_VIDEO_STUCK_THRESHOLD_MINUTES=30
```

(For local dev, `30` is fine as a literal. The bucket name comes from 1Password.)

- [ ] **Step 2: Provision the source bucket (one-time, out-of-band)**

Document in the commit message: this requires running `gsutil mb -p learnwren-dev -l us-central1 gs://learn-wren-video-source-dev` (or your env's equivalent) and granting the Cloud Functions runtime SA `roles/storage.objectAdmin` on the bucket. This step is operator-side, not in code.

- [ ] **Step 3: Create the config provider**

Create `libs/api-video/src/lib/video.config.ts`:

```ts
export const VIDEO_CONFIG = Symbol.for('learnwren.api-video.config');

export interface VideoConfig {
  sourceBucket: string;
  stuckThresholdMinutes: number;
}

export function readVideoConfigFromEnv(env: NodeJS.ProcessEnv): VideoConfig {
  const sourceBucket = env['LEARNWREN_VIDEO_SOURCE_BUCKET'];
  if (!sourceBucket) {
    throw new Error('LEARNWREN_VIDEO_SOURCE_BUCKET env var is required.');
  }
  const minutesRaw = env['LEARNWREN_VIDEO_STUCK_THRESHOLD_MINUTES'] ?? '30';
  const minutes = Number(minutesRaw);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new Error(
      `LEARNWREN_VIDEO_STUCK_THRESHOLD_MINUTES must be a positive number, got "${minutesRaw}".`,
    );
  }
  return { sourceBucket, stuckThresholdMinutes: minutes };
}
```

- [ ] **Step 4: Create the unit test**

Create `libs/api-video/src/lib/video.config.spec.ts`:

```ts
import { readVideoConfigFromEnv } from './video.config';

describe('readVideoConfigFromEnv', () => {
  it('returns config with provided bucket and default threshold of 30', () => {
    const cfg = readVideoConfigFromEnv({ LEARNWREN_VIDEO_SOURCE_BUCKET: 'b' });
    expect(cfg).toEqual({ sourceBucket: 'b', stuckThresholdMinutes: 30 });
  });

  it('parses an override threshold', () => {
    const cfg = readVideoConfigFromEnv({
      LEARNWREN_VIDEO_SOURCE_BUCKET: 'b',
      LEARNWREN_VIDEO_STUCK_THRESHOLD_MINUTES: '5',
    });
    expect(cfg.stuckThresholdMinutes).toBe(5);
  });

  it('throws when bucket is missing', () => {
    expect(() => readVideoConfigFromEnv({})).toThrow(
      /LEARNWREN_VIDEO_SOURCE_BUCKET/,
    );
  });

  it('throws on a non-numeric threshold', () => {
    expect(() =>
      readVideoConfigFromEnv({
        LEARNWREN_VIDEO_SOURCE_BUCKET: 'b',
        LEARNWREN_VIDEO_STUCK_THRESHOLD_MINUTES: 'abc',
      }),
    ).toThrow(/positive number/);
  });

  it('throws on a non-positive threshold', () => {
    expect(() =>
      readVideoConfigFromEnv({
        LEARNWREN_VIDEO_SOURCE_BUCKET: 'b',
        LEARNWREN_VIDEO_STUCK_THRESHOLD_MINUTES: '0',
      }),
    ).toThrow(/positive number/);
  });
});
```

- [ ] **Step 5: Run + commit**

```bash
pnpm nx test api-video
git add .env.tpl libs/api-video/src/lib/video.config.ts libs/api-video/src/lib/video.config.spec.ts
git commit -m "feat(api-video): video config provider with env-driven bucket + stuck threshold"
```

---

## Task 6: Error layer for `api-video` (codes + exception classes)

**Files:**
- Create: `libs/api-video/src/lib/errors/video-error.codes.ts`
- Create: `libs/api-video/src/lib/errors/video.exception.ts`
- Create: `libs/api-video/src/lib/errors/video.exception.spec.ts`

- [ ] **Step 1: Write the spec**

Create `libs/api-video/src/lib/errors/video.exception.spec.ts`:

```ts
import {
  InvalidVideoStateException,
  LessonAlreadyHasVideoException,
  NotVideoOwnerException,
  UploadObjectMissingException,
  UploadObjectSizeMismatchException,
  VideoException,
  VideoNotFoundException,
} from './video.exception';

describe('Video exceptions', () => {
  const cases: Array<[VideoException, { code: string; status: number }]> = [
    [new VideoNotFoundException(), { code: 'VIDEO_NOT_FOUND', status: 404 }],
    [new NotVideoOwnerException(), { code: 'NOT_VIDEO_OWNER', status: 403 }],
    [new LessonAlreadyHasVideoException(), { code: 'LESSON_ALREADY_HAS_VIDEO', status: 409 }],
    [new InvalidVideoStateException('UPLOADED'), { code: 'INVALID_VIDEO_STATE', status: 409 }],
    [new UploadObjectMissingException(), { code: 'UPLOAD_OBJECT_MISSING', status: 422 }],
    [new UploadObjectSizeMismatchException(), { code: 'UPLOAD_OBJECT_SIZE_MISMATCH', status: 422 }],
  ];
  test.each(cases)('exposes the expected code and status', (ex, expected) => {
    expect(ex.code).toBe(expected.code);
    expect(ex.status).toBe(expected.status);
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
pnpm nx test api-video -- video.exception.spec
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement error codes**

Create `libs/api-video/src/lib/errors/video-error.codes.ts`:

```ts
export type VideoErrorCode =
  | 'VALIDATION_FAILED'
  | 'NOT_VIDEO_OWNER'
  | 'VIDEO_NOT_FOUND'
  | 'LESSON_ALREADY_HAS_VIDEO'
  | 'INVALID_VIDEO_STATE'
  | 'UPLOAD_OBJECT_MISSING'
  | 'UPLOAD_OBJECT_SIZE_MISMATCH'
  | 'INTERNAL';
```

- [ ] **Step 4: Implement exceptions**

Create `libs/api-video/src/lib/errors/video.exception.ts`:

```ts
import type { VideoErrorCode } from './video-error.codes';

export class VideoException extends Error {
  constructor(
    public readonly code: VideoErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'VideoException';
  }
}

export class VideoNotFoundException extends VideoException {
  constructor() {
    super('VIDEO_NOT_FOUND', 'Video not found.', 404);
  }
}

export class NotVideoOwnerException extends VideoException {
  constructor() {
    super('NOT_VIDEO_OWNER', 'You do not own this video.', 403);
  }
}

export class LessonAlreadyHasVideoException extends VideoException {
  constructor() {
    super(
      'LESSON_ALREADY_HAS_VIDEO',
      'This lesson already has a video. Replace flow is not yet supported.',
      409,
    );
  }
}

export class InvalidVideoStateException extends VideoException {
  constructor(currentState: string) {
    super(
      'INVALID_VIDEO_STATE',
      `Operation is not valid in state ${currentState}.`,
      409,
      { currentState },
    );
  }
}

export class UploadObjectMissingException extends VideoException {
  constructor() {
    super(
      'UPLOAD_OBJECT_MISSING',
      'No source object exists at the upload destination.',
      422,
    );
  }
}

export class UploadObjectSizeMismatchException extends VideoException {
  constructor() {
    super(
      'UPLOAD_OBJECT_SIZE_MISMATCH',
      'Uploaded object size exceeds declared size by more than the allowed tolerance.',
      422,
    );
  }
}
```

- [ ] **Step 5: Run + commit**

```bash
pnpm nx test api-video
git add libs/api-video/src/lib/errors
git commit -m "feat(api-video): error codes and exception classes"
```

---

## Task 7: DTOs

**Files:**
- Create: `libs/api-video/src/lib/dto/create-upload-session.dto.ts`
- Create: `libs/api-video/src/lib/dto/update-video.dto.ts`
- Create: `libs/api-video/src/lib/dto/dto.spec.ts`

- [ ] **Step 1: Write the spec**

Create `libs/api-video/src/lib/dto/dto.spec.ts`:

```ts
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { CreateUploadSessionDto } from './create-upload-session.dto';
import { UpdateVideoFailedDto } from './update-video.dto';

function validate<T extends object>(cls: new () => T, payload: unknown) {
  const instance = plainToInstance(cls, payload);
  return validateSync(instance);
}

describe('CreateUploadSessionDto', () => {
  it('accepts a well-formed payload', () => {
    expect(
      validate(CreateUploadSessionDto, {
        sizeBytes: 1024,
        contentType: 'video/mp4',
        filename: 'demo.mp4',
      }),
    ).toHaveLength(0);
  });

  it('rejects sizeBytes over 10 GB', () => {
    const errs = validate(CreateUploadSessionDto, {
      sizeBytes: 10_000_000_001,
      contentType: 'video/mp4',
    });
    expect(errs).toHaveLength(1);
    expect(errs[0].property).toBe('sizeBytes');
  });

  it('rejects zero or negative sizeBytes', () => {
    expect(
      validate(CreateUploadSessionDto, { sizeBytes: 0, contentType: 'video/mp4' }),
    ).toHaveLength(1);
  });

  it('rejects an unsupported MIME type', () => {
    const errs = validate(CreateUploadSessionDto, {
      sizeBytes: 1024,
      contentType: 'video/x-msvideo',
    });
    expect(errs).toHaveLength(1);
    expect(errs[0].property).toBe('contentType');
  });

  it('rejects a missing contentType', () => {
    expect(validate(CreateUploadSessionDto, { sizeBytes: 1024 })).not.toHaveLength(0);
  });

  it('rejects a filename over 255 chars', () => {
    expect(
      validate(CreateUploadSessionDto, {
        sizeBytes: 1024,
        contentType: 'video/mp4',
        filename: 'x'.repeat(256),
      }),
    ).toHaveLength(1);
  });
});

describe('UpdateVideoFailedDto', () => {
  it('accepts state=FAILED with a reason', () => {
    expect(
      validate(UpdateVideoFailedDto, { state: 'FAILED', failureReason: 'network' }),
    ).toHaveLength(0);
  });

  it('rejects any other state', () => {
    expect(
      validate(UpdateVideoFailedDto, { state: 'UPLOADED', failureReason: 'x' }),
    ).not.toHaveLength(0);
  });

  it('rejects a missing failureReason', () => {
    expect(validate(UpdateVideoFailedDto, { state: 'FAILED' })).not.toHaveLength(0);
  });

  it('rejects a failureReason over 500 chars', () => {
    expect(
      validate(UpdateVideoFailedDto, {
        state: 'FAILED',
        failureReason: 'x'.repeat(501),
      }),
    ).not.toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to fail**

```bash
pnpm nx test api-video -- dto.spec
```

- [ ] **Step 3: Implement DTOs**

Create `libs/api-video/src/lib/dto/create-upload-session.dto.ts`:

```ts
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const SUPPORTED_CONTENT_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/x-matroska',
] as const;

export type SupportedContentType = (typeof SUPPORTED_CONTENT_TYPES)[number];

export class CreateUploadSessionDto {
  @IsInt()
  @Min(1)
  @Max(10_000_000_000)
  sizeBytes!: number;

  @IsIn(SUPPORTED_CONTENT_TYPES as readonly string[])
  contentType!: SupportedContentType;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  filename?: string;
}
```

Create `libs/api-video/src/lib/dto/update-video.dto.ts`:

```ts
import { IsIn, IsString, MaxLength } from 'class-validator';

export class UpdateVideoFailedDto {
  @IsIn(['FAILED'])
  state!: 'FAILED';

  @IsString()
  @MaxLength(500)
  failureReason!: string;
}
```

- [ ] **Step 4: Run + commit**

```bash
pnpm nx test api-video
git add libs/api-video/src/lib/dto
git commit -m "feat(api-video): DTOs for upload-session and failed-state"
```

---

## Task 8: `VideoRepository`

**Files:**
- Create: `libs/api-video/src/lib/types/loaded-video.ts`
- Create: `libs/api-video/src/lib/video.repository.ts`

The repository is excluded from mutation testing (per the Stryker pattern) and is verified via api-e2e. No unit spec required — match the `courses.repository.ts` convention.

- [ ] **Step 1: Create the loaded-video request type**

Create `libs/api-video/src/lib/types/loaded-video.ts`:

```ts
import type { Video } from '@learnwren/shared-data-models';

import type { AuthenticatedRequest } from '@learnwren/api-auth';

export interface VideoScopedRequest extends AuthenticatedRequest {
  video?: Video;
  params: AuthenticatedRequest['params'] & { vid?: string };
}
```

- [ ] **Step 2: Create the repository**

Create `libs/api-video/src/lib/video.repository.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';

import { FIRESTORE, type FirestoreHandle } from '@learnwren/api-firebase';
import type {
  LessonId,
  Video,
  VideoId,
  VideoKey,
  VideoKeyId,
} from '@learnwren/shared-data-models';

@Injectable()
export class VideoRepository {
  constructor(@Inject(FIRESTORE) private readonly db: FirestoreHandle) {}

  newId<T extends string>(): T {
    return this.db.collection('_ids').doc().id as T;
  }

  async getVideo(vid: VideoId): Promise<Video | null> {
    const snap = await this.db.collection('videos').doc(vid).get();
    return snap.exists ? (snap.data() as Video) : null;
  }

  async getVideoByLesson(lid: LessonId): Promise<Video | null> {
    const q = await this.db
      .collection('videos')
      .where('lessonId', '==', lid)
      .limit(1)
      .get();
    return q.empty ? null : (q.docs[0]!.data() as Video);
  }

  async createVideo(video: Video): Promise<void> {
    await this.db.collection('videos').doc(video.id).set(video);
  }

  async updateVideo(vid: VideoId, patch: Partial<Video>): Promise<void> {
    await this.db.collection('videos').doc(vid).update(patch);
  }

  /**
   * Atomically advance a video to UPLOADED and pin the videoId onto the lesson.
   * Returns the updated video on success. Throws if either doc is missing
   * (caller has already verified existence; this is a defensive rejection).
   */
  async finalizeUpload(
    vid: VideoId,
    lid: LessonId,
    actualSizeBytes: number,
    nowIso: string,
  ): Promise<Video> {
    const videoRef = this.db.collection('videos').doc(vid);
    const lessonRef = this.db
      .collectionGroup('lessons')
      .where('id', '==', lid)
      .limit(1);

    return this.db.runTransaction(async (tx) => {
      const videoSnap = await tx.get(videoRef);
      if (!videoSnap.exists) throw new Error('Video disappeared in transaction.');
      const lessonSnap = await tx.get(lessonRef);
      if (lessonSnap.empty) throw new Error('Lesson disappeared in transaction.');
      const lessonDocRef = lessonSnap.docs[0]!.ref;

      const updatedVideo: Video = {
        ...(videoSnap.data() as Video),
        state: 'UPLOADED',
        source: {
          ...(videoSnap.data() as Video).source,
          sizeBytes: actualSizeBytes,
        },
        updatedAt: nowIso as Video['updatedAt'],
      };

      tx.set(videoRef, updatedVideo);
      tx.update(lessonDocRef, { videoId: vid, updatedAt: nowIso });
      return updatedVideo;
    });
  }

  /**
   * Best-effort transactional cleanup. Deletes video doc, any VideoKey doc with
   * matching videoId, and nulls Lesson.videoId if it currently points at vid.
   */
  async deleteVideoAndDetach(vid: VideoId, lid: LessonId): Promise<void> {
    const videoRef = this.db.collection('videos').doc(vid);
    const keyQuery = this.db
      .collection('videoKeys')
      .where('videoId', '==', vid)
      .limit(1);
    const lessonRef = this.db
      .collectionGroup('lessons')
      .where('id', '==', lid)
      .limit(1);

    await this.db.runTransaction(async (tx) => {
      const lessonSnap = await tx.get(lessonRef);
      const keySnap = await tx.get(keyQuery);

      tx.delete(videoRef);
      if (!keySnap.empty) tx.delete(keySnap.docs[0]!.ref);
      if (!lessonSnap.empty) {
        const lesson = lessonSnap.docs[0]!;
        const currentVid = (lesson.data() as { videoId?: string }).videoId;
        if (currentVid === vid) {
          tx.update(lesson.ref, { videoId: null, updatedAt: new Date().toISOString() });
        }
      }
    });
  }

  async writeVideoKey(key: VideoKey): Promise<void> {
    await this.db.collection('videoKeys').doc(key.id).set(key);
  }

  async deleteVideoKey(kid: VideoKeyId): Promise<void> {
    await this.db.collection('videoKeys').doc(kid).delete();
  }
}
```

- [ ] **Step 3: Verify typecheck**

```bash
pnpm nx typecheck api-video
```

- [ ] **Step 4: Commit**

```bash
git add libs/api-video/src/lib/types libs/api-video/src/lib/video.repository.ts
git commit -m "feat(api-video): Firestore repository for videos + videoKeys"
```

---

## Task 9: Storage adapter (signed-session minting + HEAD verify + delete)

The Storage interaction is small enough to keep on the service, but factoring a thin adapter clarifies the unit-test seam.

**Files:**
- Create: `libs/api-video/src/lib/video-storage.adapter.ts`

This file is excluded from mutation (treated as an external-IO adapter like the repository).

- [ ] **Step 1: Create the adapter**

Create `libs/api-video/src/lib/video-storage.adapter.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';

import { FIREBASE_STORAGE, type FirebaseStorageHandle } from '@learnwren/api-firebase';

export interface ResumableSession {
  uri: string;
  expiresAt: string;
}

export interface ObjectMetadata {
  size: number;
}

export interface VideoStoragePort {
  createResumableSession(input: {
    bucket: string;
    path: string;
    contentType: string;
    videoId: string;
  }): Promise<ResumableSession>;
  headObject(input: { bucket: string; path: string }): Promise<ObjectMetadata | null>;
  deleteObject(input: { bucket: string; path: string }): Promise<void>;
}

@Injectable()
export class VideoStorageAdapter implements VideoStoragePort {
  constructor(
    @Inject(FIREBASE_STORAGE) private readonly storage: FirebaseStorageHandle,
  ) {}

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

  async headObject(input: {
    bucket: string;
    path: string;
  }): Promise<ObjectMetadata | null> {
    const file = this.storage.bucket(input.bucket).file(input.path);
    try {
      const [meta] = await file.getMetadata();
      const size =
        typeof meta.size === 'string' ? Number(meta.size) : (meta.size as number);
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
      if (code === 404) return; // already gone — best-effort
      throw err;
    }
  }
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm nx typecheck api-video
git add libs/api-video/src/lib/video-storage.adapter.ts
git commit -m "feat(api-video): Cloud Storage adapter for resumable sessions + HEAD + delete"
```

---

## Task 10: `VideoService` core methods + tests

This is the heart of slice A. TDD-heavy.

**Files:**
- Create: `libs/api-video/src/lib/video.service.ts`
- Create: `libs/api-video/src/lib/video.service.spec.ts`

- [ ] **Step 1: Write failing tests (create-upload-session)**

Create `libs/api-video/src/lib/video.service.spec.ts`:

```ts
import type {
  CourseId,
  LessonId,
  UserId,
  Video,
  VideoId,
} from '@learnwren/shared-data-models';

import { VIDEO_CONFIG, type VideoConfig } from './video.config';
import {
  InvalidVideoStateException,
  LessonAlreadyHasVideoException,
  UploadObjectMissingException,
  UploadObjectSizeMismatchException,
  VideoNotFoundException,
} from './errors/video.exception';
import type { VideoRepository } from './video.repository';
import type { VideoStoragePort } from './video-storage.adapter';
import { VideoService } from './video.service';

function makeRepo(): jest.Mocked<VideoRepository> {
  return {
    newId: vi.fn(() => 'v-new' as VideoId),
    getVideo: vi.fn(),
    getVideoByLesson: vi.fn(),
    createVideo: vi.fn(),
    updateVideo: vi.fn(),
    finalizeUpload: vi.fn(),
    deleteVideoAndDetach: vi.fn(),
    writeVideoKey: vi.fn(),
    deleteVideoKey: vi.fn(),
  } as unknown as jest.Mocked<VideoRepository>;
}

function makeStorage(): jest.Mocked<VideoStoragePort> {
  return {
    createResumableSession: vi.fn(),
    headObject: vi.fn(),
    deleteObject: vi.fn(),
  };
}

const cfg: VideoConfig = {
  sourceBucket: 'src-bucket',
  stuckThresholdMinutes: 30,
};

const baseVideo = (overrides: Partial<Video> = {}): Video => ({
  id: 'v1' as VideoId,
  ownerInstructorId: 'u1' as UserId,
  courseId: 'c1' as CourseId,
  lessonId: 'l1' as LessonId,
  state: 'PENDING_UPLOAD',
  source: { bucket: 'src-bucket', path: 'videos/v1/source.mp4', sizeBytes: 1024 },
  createdAt: '2026-05-13T00:00:00.000Z' as Video['createdAt'],
  updatedAt: '2026-05-13T00:00:00.000Z' as Video['updatedAt'],
  ...overrides,
});

describe('VideoService.createUploadSession', () => {
  it('creates a Video doc and returns the session URI', async () => {
    const repo = makeRepo();
    const storage = makeStorage();
    storage.createResumableSession.mockResolvedValue({
      uri: 'https://upload-uri',
      expiresAt: '2026-05-20T00:00:00.000Z',
    });

    const svc = new VideoService(repo, storage, cfg);
    const result = await svc.createUploadSession({
      uid: 'u1' as UserId,
      courseId: 'c1' as CourseId,
      lessonId: 'l1' as LessonId,
      lessonVideoId: undefined,
      input: { sizeBytes: 5000, contentType: 'video/mp4' },
    });

    expect(result.videoId).toBe('v-new');
    expect(result.uploadSessionUri).toBe('https://upload-uri');
    expect(repo.createVideo).toHaveBeenCalledTimes(1);
    const written = repo.createVideo.mock.calls[0]![0] as Video;
    expect(written.state).toBe('PENDING_UPLOAD');
    expect(written.source.path).toBe('videos/v-new/source.mp4');
    expect(storage.createResumableSession).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: 'src-bucket',
        videoId: 'v-new',
        contentType: 'video/mp4',
      }),
    );
  });

  it('rejects when the lesson already has a video', async () => {
    const svc = new VideoService(makeRepo(), makeStorage(), cfg);
    await expect(
      svc.createUploadSession({
        uid: 'u1' as UserId,
        courseId: 'c1' as CourseId,
        lessonId: 'l1' as LessonId,
        lessonVideoId: 'v-existing' as VideoId,
        input: { sizeBytes: 1, contentType: 'video/mp4' },
      }),
    ).rejects.toBeInstanceOf(LessonAlreadyHasVideoException);
  });

  it('selects the correct extension for each MIME type', async () => {
    const repo = makeRepo();
    const storage = makeStorage();
    storage.createResumableSession.mockResolvedValue({
      uri: 'u',
      expiresAt: 'e',
    });
    const svc = new VideoService(repo, storage, cfg);

    for (const [contentType, ext] of [
      ['video/mp4', 'mp4'],
      ['video/quicktime', 'mov'],
      ['video/x-matroska', 'mkv'],
    ] as const) {
      repo.newId.mockReturnValueOnce(`v-${ext}` as VideoId);
      await svc.createUploadSession({
        uid: 'u1' as UserId,
        courseId: 'c1' as CourseId,
        lessonId: 'l1' as LessonId,
        lessonVideoId: undefined,
        input: { sizeBytes: 1, contentType },
      });
      const written = repo.createVideo.mock.calls.at(-1)![0] as Video;
      expect(written.source.path).toBe(`videos/v-${ext}/source.${ext}`);
    }
  });
});

describe('VideoService.completeUpload', () => {
  it('finalises when object exists and size is within tolerance', async () => {
    const repo = makeRepo();
    const storage = makeStorage();
    repo.getVideo.mockResolvedValue(baseVideo());
    storage.headObject.mockResolvedValue({ size: 1024 });
    repo.finalizeUpload.mockResolvedValue(baseVideo({ state: 'UPLOADED' }));

    const svc = new VideoService(repo, storage, cfg);
    const out = await svc.completeUpload('v1' as VideoId);

    expect(out.state).toBe('UPLOADED');
    expect(repo.finalizeUpload).toHaveBeenCalledWith(
      'v1',
      'l1',
      1024,
      expect.any(String),
    );
  });

  it('throws VIDEO_NOT_FOUND when the video is missing', async () => {
    const repo = makeRepo();
    repo.getVideo.mockResolvedValue(null);
    const svc = new VideoService(repo, makeStorage(), cfg);
    await expect(svc.completeUpload('v1' as VideoId)).rejects.toBeInstanceOf(
      VideoNotFoundException,
    );
  });

  it('throws INVALID_VIDEO_STATE when video is not PENDING_UPLOAD', async () => {
    const repo = makeRepo();
    repo.getVideo.mockResolvedValue(baseVideo({ state: 'UPLOADED' }));
    const svc = new VideoService(repo, makeStorage(), cfg);
    await expect(svc.completeUpload('v1' as VideoId)).rejects.toBeInstanceOf(
      InvalidVideoStateException,
    );
  });

  it('throws UPLOAD_OBJECT_MISSING when HEAD returns null', async () => {
    const repo = makeRepo();
    const storage = makeStorage();
    repo.getVideo.mockResolvedValue(baseVideo());
    storage.headObject.mockResolvedValue(null);
    const svc = new VideoService(repo, storage, cfg);
    await expect(svc.completeUpload('v1' as VideoId)).rejects.toBeInstanceOf(
      UploadObjectMissingException,
    );
  });

  it('throws UPLOAD_OBJECT_SIZE_MISMATCH and deletes object when over tolerance', async () => {
    const repo = makeRepo();
    const storage = makeStorage();
    repo.getVideo.mockResolvedValue(baseVideo({ source: { bucket: 'src-bucket', path: 'p', sizeBytes: 100 } }));
    storage.headObject.mockResolvedValue({ size: 200 }); // 100% over

    const svc = new VideoService(repo, storage, cfg);
    await expect(svc.completeUpload('v1' as VideoId)).rejects.toBeInstanceOf(
      UploadObjectSizeMismatchException,
    );
    expect(storage.deleteObject).toHaveBeenCalledWith({ bucket: 'src-bucket', path: 'p' });
  });

  it('accepts size up to declared × 1.05', async () => {
    const repo = makeRepo();
    const storage = makeStorage();
    repo.getVideo.mockResolvedValue(baseVideo({ source: { bucket: 'src-bucket', path: 'p', sizeBytes: 100 } }));
    storage.headObject.mockResolvedValue({ size: 105 });
    repo.finalizeUpload.mockResolvedValue(baseVideo({ state: 'UPLOADED' }));

    const svc = new VideoService(repo, storage, cfg);
    await expect(svc.completeUpload('v1' as VideoId)).resolves.toBeDefined();
  });
});

describe('VideoService.markFailed', () => {
  it('advances PENDING_UPLOAD to FAILED with a reason', async () => {
    const repo = makeRepo();
    repo.getVideo.mockResolvedValue(baseVideo());
    const svc = new VideoService(repo, makeStorage(), cfg);
    await svc.markFailed('v1' as VideoId, 'network error');
    expect(repo.updateVideo).toHaveBeenCalledWith(
      'v1',
      expect.objectContaining({ state: 'FAILED', failureReason: 'network error' }),
    );
  });

  it('rejects FAILED transition from UPLOADED', async () => {
    const repo = makeRepo();
    repo.getVideo.mockResolvedValue(baseVideo({ state: 'UPLOADED' }));
    const svc = new VideoService(repo, makeStorage(), cfg);
    await expect(svc.markFailed('v1' as VideoId, 'x')).rejects.toBeInstanceOf(
      InvalidVideoStateException,
    );
  });
});

describe('VideoService.delete', () => {
  it('deletes the object and Firestore docs when state allows', async () => {
    const repo = makeRepo();
    const storage = makeStorage();
    repo.getVideo.mockResolvedValue(baseVideo());
    const svc = new VideoService(repo, storage, cfg);
    await svc.delete('v1' as VideoId);
    expect(storage.deleteObject).toHaveBeenCalledWith({
      bucket: 'src-bucket',
      path: 'videos/v1/source.mp4',
    });
    expect(repo.deleteVideoAndDetach).toHaveBeenCalledWith('v1', 'l1');
  });

  it('rejects delete on a TRANSCODING (future) state', async () => {
    const repo = makeRepo();
    repo.getVideo.mockResolvedValue(baseVideo({ state: 'TRANSCODING' }));
    const svc = new VideoService(repo, makeStorage(), cfg);
    await expect(svc.delete('v1' as VideoId)).rejects.toBeInstanceOf(
      InvalidVideoStateException,
    );
  });
});

describe('VideoService.deleteForLesson (cascade)', () => {
  it('no-ops when no video attached', async () => {
    const repo = makeRepo();
    repo.getVideoByLesson.mockResolvedValue(null);
    const svc = new VideoService(repo, makeStorage(), cfg);
    await svc.deleteForLesson('l1' as LessonId);
    expect(repo.deleteVideoAndDetach).not.toHaveBeenCalled();
  });

  it('cascades regardless of video state', async () => {
    const repo = makeRepo();
    const storage = makeStorage();
    repo.getVideoByLesson.mockResolvedValue(baseVideo({ state: 'TRANSCODING' }));
    const svc = new VideoService(repo, storage, cfg);
    await svc.deleteForLesson('l1' as LessonId);
    expect(storage.deleteObject).toHaveBeenCalled();
    expect(repo.deleteVideoAndDetach).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to fail**

```bash
pnpm nx test api-video -- video.service.spec
```

- [ ] **Step 3: Implement the service**

Create `libs/api-video/src/lib/video.service.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';

import type {
  CourseId,
  ISODateString,
  LessonId,
  UserId,
  Video,
  VideoId,
} from '@learnwren/shared-data-models';

import { VIDEO_CONFIG, type VideoConfig } from './video.config';
import { SUPPORTED_CONTENT_TYPES, type SupportedContentType } from './dto/create-upload-session.dto';
import {
  InvalidVideoStateException,
  LessonAlreadyHasVideoException,
  UploadObjectMissingException,
  UploadObjectSizeMismatchException,
  VideoNotFoundException,
} from './errors/video.exception';
import { VideoRepository } from './video.repository';
import {
  VideoStorageAdapter,
  type VideoStoragePort,
} from './video-storage.adapter';

const SIZE_TOLERANCE = 1.05;

const EXT_BY_CONTENT_TYPE: Record<SupportedContentType, 'mp4' | 'mov' | 'mkv'> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/x-matroska': 'mkv',
};

const DELETABLE_STATES: Readonly<Set<Video['state']>> = new Set([
  'PENDING_UPLOAD',
  'UPLOADED',
  'FAILED',
]);

export interface CreateUploadSessionInput {
  uid: UserId;
  courseId: CourseId;
  lessonId: LessonId;
  lessonVideoId: VideoId | undefined;
  input: { sizeBytes: number; contentType: SupportedContentType };
}

export interface CreateUploadSessionResult {
  videoId: VideoId;
  uploadSessionUri: string;
  expiresAt: string;
}

function nowIso(): ISODateString {
  return new Date().toISOString() as ISODateString;
}

@Injectable()
export class VideoService {
  constructor(
    private readonly repo: VideoRepository,
    @Inject(VideoStorageAdapter) private readonly storage: VideoStoragePort,
    @Inject(VIDEO_CONFIG) private readonly cfg: VideoConfig,
  ) {}

  async createUploadSession(
    args: CreateUploadSessionInput,
  ): Promise<CreateUploadSessionResult> {
    if (args.lessonVideoId) {
      throw new LessonAlreadyHasVideoException();
    }

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
      source: {
        bucket: this.cfg.sourceBucket,
        path,
        sizeBytes: args.input.sizeBytes,
      },
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

    return {
      videoId,
      uploadSessionUri: session.uri,
      expiresAt: session.expiresAt,
    };
  }

  async getVideo(vid: VideoId): Promise<Video> {
    const v = await this.repo.getVideo(vid);
    if (!v) throw new VideoNotFoundException();
    return v;
  }

  async completeUpload(vid: VideoId): Promise<Video> {
    const v = await this.repo.getVideo(vid);
    if (!v) throw new VideoNotFoundException();
    if (v.state !== 'PENDING_UPLOAD') {
      throw new InvalidVideoStateException(v.state);
    }
    const head = await this.storage.headObject({
      bucket: v.source.bucket,
      path: v.source.path,
    });
    if (!head) throw new UploadObjectMissingException();
    const declared = v.source.sizeBytes ?? 0;
    if (head.size > declared * SIZE_TOLERANCE) {
      await this.storage
        .deleteObject({ bucket: v.source.bucket, path: v.source.path })
        .catch(() => undefined);
      throw new UploadObjectSizeMismatchException();
    }
    return this.repo.finalizeUpload(vid, v.lessonId, head.size, nowIso());
  }

  async markFailed(vid: VideoId, reason: string): Promise<Video> {
    const v = await this.repo.getVideo(vid);
    if (!v) throw new VideoNotFoundException();
    if (v.state !== 'PENDING_UPLOAD') {
      throw new InvalidVideoStateException(v.state);
    }
    const updatedAt = nowIso();
    await this.repo.updateVideo(vid, {
      state: 'FAILED',
      failureReason: reason,
      updatedAt,
    });
    return { ...v, state: 'FAILED', failureReason: reason, updatedAt };
  }

  async delete(vid: VideoId): Promise<void> {
    const v = await this.repo.getVideo(vid);
    if (!v) throw new VideoNotFoundException();
    if (!DELETABLE_STATES.has(v.state)) {
      throw new InvalidVideoStateException(v.state);
    }
    await this.storage
      .deleteObject({ bucket: v.source.bucket, path: v.source.path })
      .catch(() => undefined);
    await this.repo.deleteVideoAndDetach(v.id, v.lessonId);
  }

  /**
   * Cascade entry-point called from libs/api-courses when a lesson is deleted.
   * No state check — cascade is unconditional.
   */
  async deleteForLesson(lid: LessonId): Promise<void> {
    const v = await this.repo.getVideoByLesson(lid);
    if (!v) return;
    await this.storage
      .deleteObject({ bucket: v.source.bucket, path: v.source.path })
      .catch(() => undefined);
    await this.repo.deleteVideoAndDetach(v.id, v.lessonId);
  }
}
```

- [ ] **Step 4: Run all video tests**

```bash
pnpm nx test api-video
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add libs/api-video/src/lib/video.service.ts libs/api-video/src/lib/video.service.spec.ts
git commit -m "feat(api-video): VideoService state-machine for upload + cascade"
```

---

## Task 11: `VideoOwnerGuard` + spec

**Files:**
- Create: `libs/api-video/src/lib/video-owner.guard.ts`
- Create: `libs/api-video/src/lib/video-owner.guard.spec.ts`

- [ ] **Step 1: Spec**

Create `libs/api-video/src/lib/video-owner.guard.spec.ts`:

```ts
import type { Video, VideoId } from '@learnwren/shared-data-models';

import {
  NotVideoOwnerException,
  VideoNotFoundException,
} from './errors/video.exception';
import { VideoOwnerGuard } from './video-owner.guard';
import type { VideoRepository } from './video.repository';

function ctxFor(req: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as Parameters<VideoOwnerGuard['canActivate']>[0];
}

function makeRepo(video: Video | null): VideoRepository {
  return { getVideo: vi.fn().mockResolvedValue(video) } as unknown as VideoRepository;
}

const video: Video = {
  id: 'v1' as VideoId,
  ownerInstructorId: 'u1' as Video['ownerInstructorId'],
  courseId: 'c1' as Video['courseId'],
  lessonId: 'l1' as Video['lessonId'],
  state: 'PENDING_UPLOAD',
  source: { bucket: 'b', path: 'p' },
  createdAt: 'now' as Video['createdAt'],
  updatedAt: 'now' as Video['updatedAt'],
};

describe('VideoOwnerGuard', () => {
  it('throws VIDEO_NOT_FOUND when :vid is missing', async () => {
    const guard = new VideoOwnerGuard(makeRepo(null));
    await expect(
      guard.canActivate(ctxFor({ params: {}, user: { uid: 'u1' } })),
    ).rejects.toBeInstanceOf(VideoNotFoundException);
  });

  it('throws VIDEO_NOT_FOUND when video does not exist', async () => {
    const guard = new VideoOwnerGuard(makeRepo(null));
    await expect(
      guard.canActivate(ctxFor({ params: { vid: 'v1' }, user: { uid: 'u1' } })),
    ).rejects.toBeInstanceOf(VideoNotFoundException);
  });

  it('throws NOT_VIDEO_OWNER when owner differs', async () => {
    const guard = new VideoOwnerGuard(makeRepo(video));
    await expect(
      guard.canActivate(ctxFor({ params: { vid: 'v1' }, user: { uid: 'u2' } })),
    ).rejects.toBeInstanceOf(NotVideoOwnerException);
  });

  it('attaches video and returns true on success', async () => {
    const guard = new VideoOwnerGuard(makeRepo(video));
    const req: Record<string, unknown> = { params: { vid: 'v1' }, user: { uid: 'u1' } };
    await expect(guard.canActivate(ctxFor(req))).resolves.toBe(true);
    expect(req['video']).toEqual(video);
  });
});
```

- [ ] **Step 2: Implement**

Create `libs/api-video/src/lib/video-owner.guard.ts`:

```ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import type { VideoId } from '@learnwren/shared-data-models';

import {
  NotVideoOwnerException,
  VideoNotFoundException,
} from './errors/video.exception';
import type { VideoScopedRequest } from './types/loaded-video';
import { VideoRepository } from './video.repository';

@Injectable()
export class VideoOwnerGuard implements CanActivate {
  constructor(private readonly repo: VideoRepository) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<VideoScopedRequest>();
    const vid = req.params?.['vid'] as VideoId | undefined;
    if (!vid) throw new VideoNotFoundException();

    const video = await this.repo.getVideo(vid);
    if (!video) throw new VideoNotFoundException();
    if (video.ownerInstructorId !== req.user?.uid) {
      throw new NotVideoOwnerException();
    }
    req.video = video;
    return true;
  }
}
```

- [ ] **Step 3: Run + commit**

```bash
pnpm nx test api-video
git add libs/api-video/src/lib/video-owner.guard.ts libs/api-video/src/lib/video-owner.guard.spec.ts
git commit -m "feat(api-video): VideoOwnerGuard for :vid routes"
```

---

## Task 12: `VideoController` + spec

**Files:**
- Create: `libs/api-video/src/lib/video.controller.ts`
- Create: `libs/api-video/src/lib/video.controller.spec.ts`

The controller is small; the spec verifies wiring (it calls into the service correctly) plus the lesson-scoped resolution (`:cid` → `:mid` → `:lid` → load lesson → check `videoId == null`). Full request-shape coverage comes from the API e2e suite.

- [ ] **Step 1: Spec**

Create `libs/api-video/src/lib/video.controller.spec.ts`:

```ts
import type {
  CourseId,
  Lesson,
  LessonId,
  ModuleId,
  Video,
  VideoId,
} from '@learnwren/shared-data-models';

import {
  LessonNotFoundException,
  ModuleNotFoundException,
} from '@learnwren/api-courses';

import { VideoController } from './video.controller';
import type { VideoScopedRequest } from './types/loaded-video';

function makeCourseRepo(opts: { hasModule: boolean; lesson: Lesson | null }) {
  return {
    moduleExists: vi.fn().mockResolvedValue(opts.hasModule),
    getLesson: vi.fn().mockResolvedValue(opts.lesson),
  } as unknown as import('@learnwren/api-courses').CoursesRepository;
}

function makeService() {
  return {
    createUploadSession: vi.fn(),
    getVideo: vi.fn(),
    completeUpload: vi.fn(),
    markFailed: vi.fn(),
    delete: vi.fn(),
  };
}

const baseVideo: Video = {
  id: 'v1' as VideoId,
  ownerInstructorId: 'u1' as Video['ownerInstructorId'],
  courseId: 'c1' as Video['courseId'],
  lessonId: 'l1' as Video['lessonId'],
  state: 'PENDING_UPLOAD',
  source: { bucket: 'b', path: 'p' },
  createdAt: 'now' as Video['createdAt'],
  updatedAt: 'now' as Video['updatedAt'],
};

const lesson: Lesson = {
  id: 'l1' as LessonId,
  moduleId: 'm1' as ModuleId,
  title: 't',
  order: 0,
  createdAt: 'now' as Lesson['createdAt'],
  updatedAt: 'now' as Lesson['updatedAt'],
};

describe('VideoController', () => {
  it('rejects upload-session when module is not found', async () => {
    const ctrl = new VideoController(
      makeService() as never,
      makeCourseRepo({ hasModule: false, lesson: null }),
    );
    await expect(
      ctrl.createUploadSession(
        'c1' as CourseId,
        'mX' as ModuleId,
        'l1' as LessonId,
        { sizeBytes: 1, contentType: 'video/mp4' },
        { user: { uid: 'u1' } } as VideoScopedRequest,
      ),
    ).rejects.toBeInstanceOf(ModuleNotFoundException);
  });

  it('rejects upload-session when lesson is not found', async () => {
    const ctrl = new VideoController(
      makeService() as never,
      makeCourseRepo({ hasModule: true, lesson: null }),
    );
    await expect(
      ctrl.createUploadSession(
        'c1' as CourseId,
        'm1' as ModuleId,
        'l1' as LessonId,
        { sizeBytes: 1, contentType: 'video/mp4' },
        { user: { uid: 'u1' } } as VideoScopedRequest,
      ),
    ).rejects.toBeInstanceOf(LessonNotFoundException);
  });

  it('delegates to createUploadSession on the service for the happy path', async () => {
    const svc = makeService();
    svc.createUploadSession.mockResolvedValue({
      videoId: 'v-new',
      uploadSessionUri: 'u',
      expiresAt: 'e',
    });
    const ctrl = new VideoController(
      svc as never,
      makeCourseRepo({ hasModule: true, lesson }),
    );
    const out = await ctrl.createUploadSession(
      'c1' as CourseId,
      'm1' as ModuleId,
      'l1' as LessonId,
      { sizeBytes: 5, contentType: 'video/mp4' },
      { user: { uid: 'u1' } } as VideoScopedRequest,
    );
    expect(out.videoId).toBe('v-new');
    expect(svc.createUploadSession).toHaveBeenCalledWith(
      expect.objectContaining({
        uid: 'u1',
        courseId: 'c1',
        lessonId: 'l1',
        lessonVideoId: undefined,
        input: { sizeBytes: 5, contentType: 'video/mp4' },
      }),
    );
  });

  it('returns the loaded video on getVideo (guard pre-loaded)', async () => {
    const ctrl = new VideoController(
      makeService() as never,
      makeCourseRepo({ hasModule: true, lesson }),
    );
    const req = { video: baseVideo } as VideoScopedRequest;
    const out = await ctrl.getVideo(req);
    expect(out).toBe(baseVideo);
  });

  it('passes through to service.completeUpload', async () => {
    const svc = makeService();
    svc.completeUpload.mockResolvedValue(baseVideo);
    const ctrl = new VideoController(
      svc as never,
      makeCourseRepo({ hasModule: true, lesson }),
    );
    await ctrl.completeUpload({ video: baseVideo } as VideoScopedRequest);
    expect(svc.completeUpload).toHaveBeenCalledWith('v1');
  });

  it('passes through to service.markFailed', async () => {
    const svc = makeService();
    svc.markFailed.mockResolvedValue(baseVideo);
    const ctrl = new VideoController(
      svc as never,
      makeCourseRepo({ hasModule: true, lesson }),
    );
    await ctrl.markFailed(
      { state: 'FAILED', failureReason: 'x' },
      { video: baseVideo } as VideoScopedRequest,
    );
    expect(svc.markFailed).toHaveBeenCalledWith('v1', 'x');
  });

  it('passes through to service.delete', async () => {
    const svc = makeService();
    const ctrl = new VideoController(
      svc as never,
      makeCourseRepo({ hasModule: true, lesson }),
    );
    await ctrl.delete({ video: baseVideo } as VideoScopedRequest);
    expect(svc.delete).toHaveBeenCalledWith('v1');
  });
});
```

(Note: `CoursesRepository` doesn't yet expose `moduleExists` / `getLesson` in this exact shape — verify against the current public API. If not present, use the closest existing methods. The spec asserts *intent*; the implementation should adapt to the actual API.)

- [ ] **Step 2: Implement**

Create `libs/api-video/src/lib/video.controller.ts`:

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
  UseGuards,
} from '@nestjs/common';

import { FirebaseSessionGuard, InstructorRoleGuard } from '@learnwren/api-auth';
import {
  CourseOwnerGuard,
  CoursesRepository,
  LessonNotFoundException,
  ModuleNotFoundException,
} from '@learnwren/api-courses';
import type {
  CourseId,
  LessonId,
  ModuleId,
  Video,
  VideoId,
} from '@learnwren/shared-data-models';

import { CreateUploadSessionDto } from './dto/create-upload-session.dto';
import { UpdateVideoFailedDto } from './dto/update-video.dto';
import type { VideoScopedRequest } from './types/loaded-video';
import { VideoOwnerGuard } from './video-owner.guard';
import { VideoService } from './video.service';

@Controller()
@UseGuards(FirebaseSessionGuard, InstructorRoleGuard)
export class VideoController {
  constructor(
    private readonly svc: VideoService,
    private readonly coursesRepo: CoursesRepository,
  ) {}

  @Post('courses/:cid/modules/:mid/lessons/:lid/video/upload-session')
  @UseGuards(CourseOwnerGuard)
  async createUploadSession(
    @Param('cid') cid: CourseId,
    @Param('mid') mid: ModuleId,
    @Param('lid') lid: LessonId,
    @Body() body: CreateUploadSessionDto,
    @Req() req: VideoScopedRequest,
  ): Promise<{ videoId: VideoId; uploadSessionUri: string; expiresAt: string }> {
    const moduleOk = await this.coursesRepo.moduleExists(cid, mid);
    if (!moduleOk) throw new ModuleNotFoundException();
    const lesson = await this.coursesRepo.getLesson(cid, mid, lid);
    if (!lesson) throw new LessonNotFoundException();

    return this.svc.createUploadSession({
      uid: req.user!.uid,
      courseId: cid,
      lessonId: lid,
      lessonVideoId: lesson.videoId,
      input: body,
    });
  }

  @Get('videos/:vid')
  @UseGuards(VideoOwnerGuard)
  async getVideo(@Req() req: VideoScopedRequest): Promise<Video> {
    return req.video!;
  }

  @Post('videos/:vid/upload-complete')
  @UseGuards(VideoOwnerGuard)
  async completeUpload(@Req() req: VideoScopedRequest): Promise<Video> {
    return this.svc.completeUpload(req.video!.id);
  }

  @Patch('videos/:vid')
  @UseGuards(VideoOwnerGuard)
  async markFailed(
    @Body() body: UpdateVideoFailedDto,
    @Req() req: VideoScopedRequest,
  ): Promise<Video> {
    return this.svc.markFailed(req.video!.id, body.failureReason);
  }

  @Delete('videos/:vid')
  @UseGuards(VideoOwnerGuard)
  @HttpCode(204)
  async delete(@Req() req: VideoScopedRequest): Promise<void> {
    await this.svc.delete(req.video!.id);
  }
}
```

- [ ] **Step 3: Add the missing `CoursesRepository` methods if needed**

`moduleExists(cid, mid): Promise<boolean>` and `getLesson(cid, mid, lid): Promise<Lesson | null>` are lookups used by this controller. If `CoursesRepository` doesn't already expose them, add them and re-export `CoursesRepository`, `ModuleNotFoundException`, `LessonNotFoundException` from `libs/api-courses/src/index.ts`. Verify with:

```bash
grep -n "export" libs/api-courses/src/index.ts
grep -n "moduleExists\|getLesson" libs/api-courses/src/lib/courses.repository.ts
```

Add the missing methods (single-snapshot lookups; see existing methods like `getCourse` for the pattern). If the index doesn't export `CoursesRepository`, the cleanest path is to add a thin lookup interface in `api-courses` (`LessonLookup`) and inject that, but for slice A's tight scope, exposing `CoursesRepository` is acceptable.

- [ ] **Step 4: Run + commit**

```bash
pnpm nx test api-video
git add libs/api-video/src/lib/video.controller.ts libs/api-video/src/lib/video.controller.spec.ts libs/api-courses
git commit -m "feat(api-video): VideoController with upload-session, complete, fail, delete"
```

---

## Task 13: Exception filter

**Files:**
- Create: `libs/api-video/src/lib/video.exception-filter.ts`
- Create: `libs/api-video/src/lib/video.exception-filter.spec.ts`

Mirror `libs/api-courses/src/lib/courses.exception-filter.ts` exactly. The filter:
- Catches `VideoException`.
- Returns `{ code, message, details? }` JSON with the exception's `status`.
- Routes class-validator errors (or DTO validation) to a 400 `VALIDATION_FAILED` with `fieldErrors`.

- [ ] **Step 1: Read the courses exception filter for shape**

```bash
cat libs/api-courses/src/lib/courses.exception-filter.ts
cat libs/api-courses/src/lib/courses.exception-filter.spec.ts
```

- [ ] **Step 2: Port to video**

Create `libs/api-video/src/lib/video.exception-filter.ts` (and a paired spec) following the same pattern, with `VideoException` instead of `CoursesException`.

- [ ] **Step 3: Run + commit**

```bash
pnpm nx test api-video
git add libs/api-video/src/lib/video.exception-filter.ts libs/api-video/src/lib/video.exception-filter.spec.ts
git commit -m "feat(api-video): exception filter mapping VideoException to HTTP"
```

---

## Task 14: Wire `VideoModule`, export from `CoursesModule`, register in `apps/api`

**Files:**
- Create: `libs/api-video/src/lib/video.module.ts`
- Modify: `libs/api-video/src/index.ts`
- Modify: `libs/api-courses/src/lib/courses.module.ts` (add `exports`)
- Modify: `apps/api/src/app/app.module.ts` (or wherever feature modules are registered)

- [ ] **Step 0: Export `CoursesRepository` and `CourseOwnerGuard` from `CoursesModule`**

`VideoController` injects `CoursesRepository` and uses `CourseOwnerGuard`. For DI to resolve across modules, `CoursesModule` must `export` them. Edit `libs/api-courses/src/lib/courses.module.ts`:

```ts
@Module({
  imports: [AuthModule],
  controllers: [CoursesController],
  providers: [
    CoursesService,
    CoursesRepository,
    CoursesExceptionFilter,
    CourseOwnerGuard,
  ],
  exports: [CoursesRepository, CourseOwnerGuard],
})
export class CoursesModule {}
```

(Also drop `InstructorRoleGuard` from `providers` if it's still listed — that hoist landed in Task 4.)

Re-export the names from `libs/api-courses/src/index.ts`:

```ts
export { CoursesRepository } from './lib/courses.repository';
export { CourseOwnerGuard } from './lib/course-owner.guard';
export {
  LessonNotFoundException,
  ModuleNotFoundException,
} from './lib/errors/courses.exception';
```

- [ ] **Step 1: Module**

Create `libs/api-video/src/lib/video.module.ts`:

```ts
import { Module } from '@nestjs/common';

import { AuthModule } from '@learnwren/api-auth';
import { CoursesModule } from '@learnwren/api-courses';
import { FirebaseAdminModule } from '@learnwren/api-firebase';

import { VIDEO_CONFIG, readVideoConfigFromEnv } from './video.config';
import { VideoController } from './video.controller';
import { VideoExceptionFilter } from './video.exception-filter';
import { VideoOwnerGuard } from './video-owner.guard';
import { VideoRepository } from './video.repository';
import { VideoService } from './video.service';
import { VideoStorageAdapter } from './video-storage.adapter';

@Module({
  imports: [FirebaseAdminModule, AuthModule, CoursesModule],
  controllers: [VideoController],
  providers: [
    VideoRepository,
    VideoService,
    VideoStorageAdapter,
    VideoOwnerGuard,
    VideoExceptionFilter,
    { provide: VIDEO_CONFIG, useFactory: () => readVideoConfigFromEnv(process.env) },
  ],
  exports: [VideoService],
})
export class VideoModule {}
```

- [ ] **Step 2: Index exports**

In `libs/api-video/src/index.ts`:

```ts
export { VideoModule } from './lib/video.module';
export { VideoService } from './lib/video.service';
```

- [ ] **Step 3: Register in app**

In `apps/api/src/app/app.module.ts` (or the equivalent root module), add `VideoModule` to the `imports` array. Match the existing style for `CoursesModule`.

- [ ] **Step 4: Boot smoke test**

```bash
LEARNWREN_VIDEO_SOURCE_BUCKET=demo pnpm nx serve api
```

Expected: API boots without errors. Ctrl-C to stop.

- [ ] **Step 5: Run all gates**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

- [ ] **Step 6: Commit**

```bash
git add libs/api-video/src/lib/video.module.ts libs/api-video/src/index.ts apps/api
git commit -m "feat(api-video): wire VideoModule into apps/api"
```

---

## Task 15: Wire cascade-delete from `api-courses` lesson delete

**Files:**
- Modify: `libs/api-courses/src/lib/courses.service.ts` (lesson delete handler)
- Modify: `libs/api-courses/src/lib/courses.module.ts` (import VideoModule for VideoService DI)
- Modify: `libs/api-courses/src/lib/courses.service.spec.ts` (add cascade assertion)

This introduces the new Nx edge `api-courses` → `api-video`. Both modules already exist; the import is the only change.

- [ ] **Step 1: Add the cascade test**

In `libs/api-courses/src/lib/courses.service.spec.ts`, find the existing "delete lesson" test and add (or write a new one):

```ts
it('cascades to VideoService.deleteForLesson before deleting the lesson doc', async () => {
  const repo = makeRepo();
  const videoSvc = { deleteForLesson: vi.fn().mockResolvedValue(undefined) };
  const svc = new CoursesService(repo, videoSvc as never);
  await svc.deleteLesson('c1' as CourseId, 'm1' as ModuleId, 'l1' as LessonId);
  expect(videoSvc.deleteForLesson).toHaveBeenCalledWith('l1');
  expect(repo.deleteLesson).toHaveBeenCalledAfter(videoSvc.deleteForLesson as never);
});
```

(Use whatever `make*` helpers and test infrastructure already exist in the courses spec; adapt the snippet to match.)

- [ ] **Step 2: Inject `VideoService` into `CoursesService`**

In `libs/api-courses/src/lib/courses.service.ts`, add `VideoService` to the constructor:

```ts
import { VideoService } from '@learnwren/api-video';
// ...
constructor(
  private readonly repo: CoursesRepository,
  private readonly videoSvc: VideoService,
) {}
```

Update the lesson-delete handler to call cascade first:

```ts
async deleteLesson(cid: CourseId, mid: ModuleId, lid: LessonId): Promise<void> {
  await this.videoSvc.deleteForLesson(lid);
  await this.repo.deleteLesson(cid, mid, lid);
}
```

- [ ] **Step 3: Update `CoursesModule`**

In `libs/api-courses/src/lib/courses.module.ts`:

```ts
import { VideoModule } from '@learnwren/api-video';
// ...
@Module({
  imports: [AuthModule, VideoModule],
  // ...
})
```

- [ ] **Step 4: Watch for circular module dependencies**

`VideoModule` imports `CoursesModule` (Task 14, for `CoursesRepository` in `VideoController`). `CoursesModule` now imports `VideoModule`. This is a circular dependency.

Resolution: use `forwardRef`. Update both:

```ts
// CoursesModule
imports: [AuthModule, forwardRef(() => VideoModule)]
// VideoModule
imports: [FirebaseAdminModule, AuthModule, forwardRef(() => CoursesModule)]
```

And in the controllers/services where the cross-module type is injected:

```ts
constructor(
  @Inject(forwardRef(() => VideoService)) private readonly videoSvc: VideoService,
) {}
```

(NestJS handles the lazy resolution; the runtime is fine. Document this in a brief comment in each module file.)

- [ ] **Step 5: Run the full test suite**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected: all pass. The cascade test from Step 1 is now green.

- [ ] **Step 6: Commit**

```bash
git add libs/api-courses
git commit -m "feat(api-courses): cascade-delete attached Video on lesson delete"
```

---

## Task 16: Stryker config for `api-video`

**Files:**
- Create: `stryker.api-video.config.mjs`

- [ ] **Step 1: Create config**

Create `stryker.api-video.config.mjs` (mirror `stryker.api-courses.config.mjs`):

```js
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'pnpm',
  testRunner: 'vitest',
  vitest: {
    configFile: 'libs/api-video/vitest.config.mts',
  },
  mutate: [
    'libs/api-video/src/lib/**/*.ts',
    '!libs/api-video/src/lib/**/*.spec.ts',
    '!libs/api-video/src/lib/**/*.test.ts',
    '!libs/api-video/src/lib/video.repository.ts',
    '!libs/api-video/src/lib/video-storage.adapter.ts',
    '!libs/api-video/src/lib/video.module.ts',
    '!libs/api-video/src/lib/video.exception-filter.ts',
    '!libs/api-video/src/lib/video.config.ts',
    '!libs/api-video/src/lib/dto/**',
    '!libs/api-video/src/lib/types/**',
    '!libs/api-video/src/lib/errors/**',
    '!libs/api-video/src/index.ts',
  ],
  reporters: ['progress', 'clear-text', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/api-video/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/api-video/mutation.json' },
  thresholds: { high: 90, low: 75, break: null },
  coverageAnalysis: 'perTest',
  concurrency: 4,
  timeoutMS: 15000,
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
};
```

- [ ] **Step 2: Run mutation**

```bash
pnpm mutate:api-video
```

Expected: report generated at `reports/mutation/api-video/mutation.html`. Aim for ≥ 85%; if below, examine surviving mutants and either tighten tests or document equivalents in `reports/mutation/api-video-triage.md`.

- [ ] **Step 3: Commit**

```bash
git add stryker.api-video.config.mjs reports/mutation/api-video-triage.md
git commit -m "chore(quality): Stryker config for api-video + initial triage report"
```

---

## Task 17: `web-video` core HTTP service

**Files:**
- Create: `libs/web-video/src/lib/video.service.ts`
- Create: `libs/web-video/src/lib/video.service.spec.ts`
- Modify: `libs/web-video/src/index.ts`

- [ ] **Step 1: Spec**

Create `libs/web-video/src/lib/video.service.spec.ts`:

```ts
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { VideoService } from './video.service';

describe('VideoService', () => {
  let svc: VideoService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        VideoService,
      ],
    });
    svc = TestBed.inject(VideoService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('POSTs upload-session under courses/lesson path', () => {
    svc
      .createUploadSession('c1', 'm1', 'l1', {
        sizeBytes: 1,
        contentType: 'video/mp4',
      })
      .subscribe();
    const req = http.expectOne(
      '/api/courses/c1/modules/m1/lessons/l1/video/upload-session',
    );
    expect(req.request.method).toBe('POST');
    req.flush({ videoId: 'v1', uploadSessionUri: 'u', expiresAt: 'e' });
  });

  it('POSTs upload-complete', () => {
    svc.completeUpload('v1').subscribe();
    const req = http.expectOne('/api/videos/v1/upload-complete');
    expect(req.request.method).toBe('POST');
    req.flush({ id: 'v1', state: 'UPLOADED' });
  });

  it('PATCHes failed', () => {
    svc.markFailed('v1', 'reason').subscribe();
    const req = http.expectOne('/api/videos/v1');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ state: 'FAILED', failureReason: 'reason' });
    req.flush({ id: 'v1', state: 'FAILED' });
  });

  it('GETs video', () => {
    svc.getVideo('v1').subscribe();
    const req = http.expectOne('/api/videos/v1');
    expect(req.request.method).toBe('GET');
    req.flush({ id: 'v1', state: 'PENDING_UPLOAD' });
  });

  it('DELETEs video', () => {
    svc.delete('v1').subscribe();
    const req = http.expectOne('/api/videos/v1');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });
});
```

- [ ] **Step 2: Implement**

Create `libs/web-video/src/lib/video.service.ts`:

```ts
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

import type {
  CourseId,
  LessonId,
  ModuleId,
  Video,
  VideoId,
} from '@learnwren/shared-data-models';

export interface CreateUploadSessionPayload {
  sizeBytes: number;
  contentType: 'video/mp4' | 'video/quicktime' | 'video/x-matroska';
  filename?: string;
}

export interface CreateUploadSessionResponse {
  videoId: VideoId;
  uploadSessionUri: string;
  expiresAt: string;
}

@Injectable({ providedIn: 'root' })
export class VideoService {
  private readonly http = inject(HttpClient);

  createUploadSession(
    cid: CourseId,
    mid: ModuleId,
    lid: LessonId,
    payload: CreateUploadSessionPayload,
  ): Observable<CreateUploadSessionResponse> {
    return this.http.post<CreateUploadSessionResponse>(
      `/api/courses/${cid}/modules/${mid}/lessons/${lid}/video/upload-session`,
      payload,
    );
  }

  getVideo(vid: VideoId): Observable<Video> {
    return this.http.get<Video>(`/api/videos/${vid}`);
  }

  completeUpload(vid: VideoId): Observable<Video> {
    return this.http.post<Video>(`/api/videos/${vid}/upload-complete`, {});
  }

  markFailed(vid: VideoId, failureReason: string): Observable<Video> {
    return this.http.patch<Video>(`/api/videos/${vid}`, {
      state: 'FAILED',
      failureReason,
    });
  }

  delete(vid: VideoId): Observable<void> {
    return this.http.delete<void>(`/api/videos/${vid}`);
  }
}
```

- [ ] **Step 3: Export from index**

In `libs/web-video/src/index.ts`:

```ts
export { VideoService } from './lib/video.service';
```

- [ ] **Step 4: Run + commit**

```bash
pnpm nx test web-video
git add libs/web-video/src
git commit -m "feat(web-video): HTTP wrapper service"
```

---

## Task 18: `VideoUploadService` (resumable XHR state machine)

**Files:**
- Create: `libs/web-video/src/lib/upload/video-upload.service.ts`
- Create: `libs/web-video/src/lib/upload/video-upload.service.spec.ts`

- [ ] **Step 1: Spec**

Create `libs/web-video/src/lib/upload/video-upload.service.spec.ts`. Keep the spec focused on the state machine (XHR is mocked with a hand-rolled fake).

```ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';

import { VideoUploadService } from './video-upload.service';

class FakeXhr {
  upload = { onprogress: undefined as ((e: ProgressEvent) => void) | undefined };
  status = 0;
  responseHeaders: Record<string, string> = {};
  onload: (() => void) | undefined;
  onerror: (() => void) | undefined;
  abort = vi.fn();
  open = vi.fn();
  setRequestHeader = vi.fn();
  send = vi.fn();
  getResponseHeader = vi.fn((name: string) => this.responseHeaders[name.toLowerCase()] ?? null);
}

describe('VideoUploadService', () => {
  let svc: VideoUploadService;
  let http: HttpTestingController;
  let xhrs: FakeXhr[];

  beforeEach(() => {
    xhrs = [];
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        VideoUploadService,
        {
          provide: 'XHR_FACTORY',
          useValue: () => {
            const x = new FakeXhr();
            xhrs.push(x);
            return x;
          },
        },
      ],
    });
    svc = TestBed.inject(VideoUploadService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('starts at idle', () => {
    expect(svc.state()).toEqual({ kind: 'idle' });
  });

  it('rejects oversized files at picker time without any network', () => {
    const file = new File([new Uint8Array(10)], 'big.mp4', { type: 'video/mp4' });
    Object.defineProperty(file, 'size', { value: 10_000_000_001 });
    svc.selectFile(file);
    expect(svc.state()).toEqual({ kind: 'failed', reason: expect.stringContaining('10 GB') });
  });

  it('rejects unsupported MIME at picker time', () => {
    const file = new File(['x'], 'doc.txt', { type: 'text/plain' });
    svc.selectFile(file);
    expect(svc.state()).toEqual({ kind: 'failed', reason: expect.stringContaining('Unsupported') });
  });

  it('progresses to creating-session, uploading, finalizing, complete', async () => {
    const file = new File([new Uint8Array(8)], 'demo.mp4', { type: 'video/mp4' });
    const done = svc.start({ courseId: 'c1' as never, moduleId: 'm1' as never, lessonId: 'l1' as never }, file);
    // creating-session
    const create = http.expectOne(/upload-session/);
    expect(svc.state().kind).toBe('creating-session');
    create.flush({ videoId: 'v1', uploadSessionUri: 'https://session', expiresAt: 'e' });

    // uploading — XHR sees a single PUT and 200s
    await Promise.resolve();
    expect(svc.state().kind).toBe('uploading');
    const x = xhrs.at(-1)!;
    x.status = 200;
    x.onload!();

    // finalizing
    const complete = http.expectOne(/v1\/upload-complete/);
    expect(svc.state().kind).toBe('finalizing');
    complete.flush({ id: 'v1', state: 'UPLOADED' });

    await done;
    expect(svc.state()).toEqual(expect.objectContaining({ kind: 'complete', videoId: 'v1' }));
  });

  it('retries a transient 5xx up to 3 times then advances to failed', async () => {
    const file = new File([new Uint8Array(8)], 'demo.mp4', { type: 'video/mp4' });
    const promise = svc.start({ courseId: 'c1' as never, moduleId: 'm1' as never, lessonId: 'l1' as never }, file);
    http.expectOne(/upload-session/).flush({ videoId: 'v1', uploadSessionUri: 'u', expiresAt: 'e' });

    await Promise.resolve();
    for (let i = 0; i < 4; i++) {
      const x = xhrs.at(-1)!;
      x.status = 503;
      x.onload!();
      await Promise.resolve();
    }
    http.expectOne(/v1$/).flush({ id: 'v1', state: 'FAILED' });

    await promise;
    expect(svc.state().kind).toBe('failed');
  });

  it('cancel aborts XHR and calls DELETE', async () => {
    const file = new File([new Uint8Array(4)], 'demo.mp4', { type: 'video/mp4' });
    const p = svc.start({ courseId: 'c1' as never, moduleId: 'm1' as never, lessonId: 'l1' as never }, file);
    http.expectOne(/upload-session/).flush({ videoId: 'v1', uploadSessionUri: 'u', expiresAt: 'e' });
    await Promise.resolve();

    svc.cancel();
    expect(xhrs.at(-1)!.abort).toHaveBeenCalled();
    http.expectOne(/videos\/v1$/).flush(null, { status: 204, statusText: 'No Content' });
    await p;
    expect(svc.state().kind).toBe('idle');
  });
});
```

(The XHR factory is injected via DI token so the spec can substitute a fake. The real provider returns `new XMLHttpRequest()` — see implementation below.)

- [ ] **Step 2: Implement**

Create `libs/web-video/src/lib/upload/video-upload.service.ts`. This is the most code-heavy file in the slice; budget 200 lines.

```ts
import { Injectable, InjectionToken, inject, signal, type Signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  CourseId,
  LessonId,
  ModuleId,
  VideoId,
} from '@learnwren/shared-data-models';

import { VideoService } from '../video.service';

export const XHR_FACTORY = new InjectionToken<() => XMLHttpRequest>('XHR_FACTORY', {
  providedIn: 'root',
  factory: () => () => new XMLHttpRequest(),
});

const SUPPORTED_MIME = new Set([
  'video/mp4',
  'video/quicktime',
  'video/x-matroska',
]);
const MAX_BYTES = 10_000_000_000;
const CHUNK_BYTES = 8 * 1024 * 1024;
const MAX_RETRIES_PER_CHUNK = 3;
const BACKOFF_MS = [1000, 2000, 4000];

export type UploadState =
  | { kind: 'idle' }
  | { kind: 'creating-session' }
  | { kind: 'uploading'; percent: number; videoId: VideoId }
  | { kind: 'finalizing'; videoId: VideoId }
  | { kind: 'complete'; videoId: VideoId }
  | { kind: 'canceling'; videoId: VideoId }
  | { kind: 'failed'; reason: string; videoId?: VideoId };

export interface UploadContext {
  courseId: CourseId;
  moduleId: ModuleId;
  lessonId: LessonId;
}

@Injectable()
export class VideoUploadService {
  private readonly api = inject(VideoService);
  private readonly xhrFactory = inject(XHR_FACTORY);
  private readonly _state = signal<UploadState>({ kind: 'idle' });
  private currentXhr: XMLHttpRequest | undefined;
  private aborted = false;

  readonly state: Signal<UploadState> = this._state.asReadonly();

  selectFile(file: File): { ok: true; contentType: string } | { ok: false } {
    if (file.size > MAX_BYTES) {
      this._state.set({ kind: 'failed', reason: 'File size exceeds the 10 GB limit.' });
      return { ok: false };
    }
    if (!SUPPORTED_MIME.has(file.type)) {
      this._state.set({
        kind: 'failed',
        reason: 'Unsupported format. Please upload MP4, MOV, or MKV.',
      });
      return { ok: false };
    }
    return { ok: true, contentType: file.type };
  }

  async start(ctx: UploadContext, file: File): Promise<void> {
    this.aborted = false;
    const check = this.selectFile(file);
    if (!check.ok) return;
    this._state.set({ kind: 'creating-session' });

    let videoId: VideoId;
    let sessionUri: string;
    try {
      const r = await firstValueFrom(
        this.api.createUploadSession(ctx.courseId, ctx.moduleId, ctx.lessonId, {
          sizeBytes: file.size,
          contentType: check.contentType as 'video/mp4',
        }),
      );
      videoId = r.videoId;
      sessionUri = r.uploadSessionUri;
    } catch (err) {
      this._state.set({ kind: 'failed', reason: this.errorMessage(err) });
      return;
    }

    this._state.set({ kind: 'uploading', percent: 0, videoId });
    const uploadOk = await this.uploadAllChunks(sessionUri, file, videoId);
    if (!uploadOk || this.aborted) return;

    this._state.set({ kind: 'finalizing', videoId });
    try {
      await firstValueFrom(this.api.completeUpload(videoId));
      this._state.set({ kind: 'complete', videoId });
    } catch (err) {
      this._state.set({
        kind: 'failed',
        reason: this.errorMessage(err),
        videoId,
      });
    }
  }

  async cancel(): Promise<void> {
    const s = this._state();
    this.aborted = true;
    this.currentXhr?.abort();
    if (s.kind === 'uploading' || s.kind === 'finalizing' || s.kind === 'failed') {
      const vid = s.kind === 'failed' ? s.videoId : s.videoId;
      this._state.set({ kind: 'canceling', videoId: vid! });
      if (vid) {
        await firstValueFrom(this.api.delete(vid)).catch(() => undefined);
      }
    }
    this._state.set({ kind: 'idle' });
  }

  async retry(): Promise<void> {
    const s = this._state();
    if (s.kind !== 'failed' || !s.videoId) return;
    await firstValueFrom(this.api.delete(s.videoId)).catch(() => undefined);
    this._state.set({ kind: 'idle' });
  }

  private async uploadAllChunks(
    sessionUri: string,
    file: File,
    videoId: VideoId,
  ): Promise<boolean> {
    const total = file.size;
    let offset = 0;
    while (offset < total && !this.aborted) {
      const end = Math.min(offset + CHUNK_BYTES, total);
      const chunk = file.slice(offset, end);
      const ok = await this.putChunkWithRetry(sessionUri, chunk, offset, total - 1, total, videoId);
      if (!ok) return false;
      offset = end;
      this._state.set({
        kind: 'uploading',
        percent: Math.round((offset / total) * 100),
        videoId,
      });
    }
    return !this.aborted;
  }

  private async putChunkWithRetry(
    sessionUri: string,
    chunk: Blob,
    start: number,
    last: number,
    total: number,
    videoId: VideoId,
  ): Promise<boolean> {
    for (let attempt = 0; attempt <= MAX_RETRIES_PER_CHUNK; attempt++) {
      const status = await this.putChunk(sessionUri, chunk, start, last, total);
      if (this.aborted) return false;
      if (status === 200 || status === 308) return true;
      if (status >= 500 && attempt < MAX_RETRIES_PER_CHUNK) {
        await new Promise((res) => setTimeout(res, BACKOFF_MS[attempt] ?? 4000));
        continue;
      }
      // hard failure
      await firstValueFrom(
        this.api.markFailed(videoId, `Upload failed with status ${status}.`),
      ).catch(() => undefined);
      this._state.set({
        kind: 'failed',
        reason: `Upload failed: status ${status}.`,
        videoId,
      });
      return false;
    }
    return false;
  }

  private putChunk(
    sessionUri: string,
    chunk: Blob,
    start: number,
    last: number,
    total: number,
  ): Promise<number> {
    return new Promise((resolve) => {
      const xhr = this.xhrFactory();
      this.currentXhr = xhr;
      xhr.open('PUT', sessionUri, true);
      xhr.setRequestHeader('Content-Range', `bytes ${start}-${last}/${total}`);
      xhr.upload.onprogress = () => {
        // chunk-level granularity already updates `percent` in caller
      };
      xhr.onload = () => resolve(xhr.status);
      xhr.onerror = () => resolve(0);
      xhr.send(chunk);
    });
  }

  private errorMessage(err: unknown): string {
    const msg =
      typeof err === 'object' && err !== null && 'message' in err
        ? String((err as { message: unknown }).message)
        : 'Unknown error.';
    return msg;
  }
}
```

- [ ] **Step 3: Run + commit**

```bash
pnpm nx test web-video
git add libs/web-video/src/lib/upload
git commit -m "feat(web-video): resumable upload state machine + XHR pipeline"
```

---

## Task 19: `VideoUploadComponent`, `VideoStateBadgeComponent`

**Files:**
- Create: `libs/web-video/src/lib/upload/video-upload.component.ts` (+ html)
- Create: `libs/web-video/src/lib/upload/video-upload.component.spec.ts`
- Create: `libs/web-video/src/lib/video-state-badge.component.ts` (+ html)
- Create: `libs/web-video/src/lib/video-state-badge.component.spec.ts`

Component implementations are templates of `VideoUploadService`'s `state()` signal — render branches per `state.kind`.

- [ ] **Step 1: VideoUploadComponent**

Create `libs/web-video/src/lib/upload/video-upload.component.ts`:

```ts
import { Component, EventEmitter, Output, input } from '@angular/core';

import type {
  CourseId,
  LessonId,
  ModuleId,
  VideoId,
} from '@learnwren/shared-data-models';

import { VideoUploadService } from './video-upload.service';

@Component({
  selector: 'lib-video-upload',
  standalone: true,
  templateUrl: './video-upload.component.html',
  providers: [VideoUploadService],
})
export class VideoUploadComponent {
  readonly courseId = input.required<CourseId>();
  readonly moduleId = input.required<ModuleId>();
  readonly lessonId = input.required<LessonId>();
  @Output() readonly uploaded = new EventEmitter<VideoId>();

  constructor(readonly svc: VideoUploadService) {}

  async onFile(file: File | null): Promise<void> {
    if (!file) return;
    await this.svc.start(
      { courseId: this.courseId(), moduleId: this.moduleId(), lessonId: this.lessonId() },
      file,
    );
    const s = this.svc.state();
    if (s.kind === 'complete') this.uploaded.emit(s.videoId);
  }

  onCancel(): void {
    void this.svc.cancel();
  }

  onRetry(): void {
    void this.svc.retry();
  }
}
```

Create `libs/web-video/src/lib/upload/video-upload.component.html`:

```html
@let s = svc.state();
@switch (s.kind) {
  @case ('idle') {
    <label class="upload-zone">
      <span>Drag a video file here, or click to choose. MP4, MOV, or MKV up to 10 GB.</span>
      <input
        type="file"
        accept="video/mp4,video/quicktime,video/x-matroska,.mp4,.mov,.mkv,.m4v"
        (change)="onFile(($event.target as HTMLInputElement).files?.[0] ?? null)"
      />
    </label>
  }
  @case ('creating-session') { <p>Preparing upload…</p> }
  @case ('uploading') {
    <div>
      <progress [value]="s.percent" max="100"></progress>
      <span>{{ s.percent }}%</span>
      <button type="button" (click)="onCancel()">Cancel</button>
    </div>
  }
  @case ('finalizing') { <p>Finishing up…</p> }
  @case ('canceling') { <p>Cancelling…</p> }
  @case ('failed') {
    <div role="alert">
      <p>{{ s.reason }}</p>
      <button type="button" (click)="onRetry()">Try again</button>
    </div>
  }
}
```

Spec — bind `state()` signal returns and assert template branches; smoke-test outputs. Mirror the structure of `libs/web-courses/src/lib/components/lesson-item/lesson-item.component.spec.ts`.

- [ ] **Step 2: VideoStateBadgeComponent**

Create `libs/web-video/src/lib/video-state-badge.component.ts`:

```ts
import { Component, computed, input } from '@angular/core';

import type { Video } from '@learnwren/shared-data-models';

const STUCK_THRESHOLD_MIN = 30;

@Component({
  selector: 'lib-video-state-badge',
  standalone: true,
  templateUrl: './video-state-badge.component.html',
})
export class VideoStateBadgeComponent {
  readonly video = input.required<Video>();

  readonly label = computed(() => {
    const v = this.video();
    if (this.isStuck(v)) return 'Upload may have stalled — retry?';
    if (v.state === 'UPLOADED') return 'Uploaded — processing pending in EP-03';
    return 'Processing…'; // future-state placeholder; slice B refines
  });

  readonly canRetry = computed(() => this.isStuck(this.video()));

  private isStuck(v: Video): boolean {
    if (v.state !== 'PENDING_UPLOAD') return false;
    const ageMs = Date.now() - new Date(v.updatedAt).getTime();
    return ageMs > STUCK_THRESHOLD_MIN * 60 * 1000;
  }
}
```

(The threshold here is hard-coded — slice A's spec lists `LEARNWREN_VIDEO_STUCK_THRESHOLD_MINUTES` as a server-side concept; the client mirrors it. A follow-up could thread the value through the API.)

Create `libs/web-video/src/lib/video-state-badge.component.html`:

```html
<span class="badge">{{ label() }}</span>
```

Spec asserts label for: `UPLOADED` → "Uploaded — …"; `PENDING_UPLOAD` recent → "Processing…"; `PENDING_UPLOAD` aged 31 min → stuck copy.

- [ ] **Step 3: Export from index**

In `libs/web-video/src/index.ts`:

```ts
export { VideoUploadComponent } from './lib/upload/video-upload.component';
export { VideoStateBadgeComponent } from './lib/video-state-badge.component';
```

- [ ] **Step 4: Run + commit**

```bash
pnpm nx test web-video
git add libs/web-video/src
git commit -m "feat(web-video): upload component and state badge"
```

---

## Task 20: Integrate into `web-courses` `LessonItem`

**Files:**
- Modify: `libs/web-courses/src/lib/components/lesson-item/lesson-item.component.ts`
- Modify: `libs/web-courses/src/lib/components/lesson-item/lesson-item.component.html`
- Modify: `libs/web-courses/src/lib/components/lesson-item/lesson-item.component.spec.ts`

- [ ] **Step 1: Update spec**

Add to `lesson-item.component.spec.ts`:

```ts
it('renders VideoUploadComponent when lesson.videoId is null', () => {
  // Configure host with a lesson whose videoId is undefined; assert <lib-video-upload> is in the DOM.
});

it('renders VideoStateBadgeComponent when lesson.videoId is set', () => {
  // Mock VideoService.getVideo to resolve; assert <lib-video-state-badge> appears.
});
```

(Adapt to the existing component-test pattern in the file.)

- [ ] **Step 2: Update component**

Replace `lesson-item.component.ts` with:

```ts
import {
  Component,
  EventEmitter,
  Output,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { CourseId, Lesson, Video } from '@learnwren/shared-data-models';
import {
  VideoService,
  VideoStateBadgeComponent,
  VideoUploadComponent,
} from '@learnwren/web-video';

@Component({
  selector: 'lib-lesson-item',
  standalone: true,
  imports: [FormsModule, VideoUploadComponent, VideoStateBadgeComponent],
  templateUrl: './lesson-item.component.html',
})
export class LessonItemComponent {
  private readonly api = inject(VideoService);

  readonly lesson = input.required<Lesson>();
  readonly courseId = input.required<CourseId>();

  @Output() readonly rename = new EventEmitter<string>();
  @Output() readonly delete = new EventEmitter<void>();
  @Output() readonly videoChanged = new EventEmitter<void>();

  readonly editing = signal(false);
  readonly draftTitle = signal('');
  readonly video = signal<Video | undefined>(undefined);

  constructor() {
    effect(() => {
      const vid = this.lesson().videoId;
      if (!vid) {
        untracked(() => this.video.set(undefined));
        return;
      }
      this.api.getVideo(vid).subscribe({
        next: (v) => this.video.set(v),
        error: () => this.video.set(undefined),
      });
    });
  }

  startEdit(): void {
    this.draftTitle.set(this.lesson().title);
    this.editing.set(true);
  }

  commit(): void {
    const next = this.draftTitle().trim();
    if (next.length === 0 || next === this.lesson().title) {
      this.editing.set(false);
      return;
    }
    this.rename.emit(next);
    this.editing.set(false);
  }

  cancel(): void {
    this.editing.set(false);
  }

  onVideoUploaded(): void {
    this.videoChanged.emit();
  }
}
```

The `effect()` re-runs whenever `lesson().videoId` changes — fetches the `Video` on attach, clears it on detach. `untracked()` around the `signal.set` prevents accidental re-entry. The new `videoChanged` output bubbles up so `ModuleItem` / `ModuleTree` / `CourseEditorPage` can re-fetch the course tree (which updates `lesson.videoId` and re-triggers the effect with the freshly-attached video).

Update `lesson-item.component.html` to render `<lib-video-upload>` when `lesson().videoId` is falsy and `<lib-video-state-badge>` when it's set:

```html
@if (lesson().videoId) {
  @if (video(); as v) { <lib-video-state-badge [video]="v" /> }
} @else {
  <lib-video-upload
    [courseId]="courseId()"
    [moduleId]="lesson().moduleId"
    [lessonId]="lesson().id"
    (uploaded)="onVideoUploaded()"
  />
}
```

- [ ] **Step 3: Plumb the courseId**

`LessonItem` already lives inside `ModuleItem` which lives inside `CourseEditorPage`. Add an `input.required<CourseId>()` if not already present and pass it down.

- [ ] **Step 4: Refresh after upload**

When `(uploaded)` emits, the CourseEditorPage should re-fetch the course tree so the lesson's `videoId` reflects the new value. Wire `(uploaded)` up through ModuleItem → ModuleTree → CourseEditorPage and have the page call its existing tree-load method.

- [ ] **Step 5: Run + commit**

```bash
pnpm nx test web-courses
pnpm nx test web-video
pnpm lint && pnpm typecheck
git add libs/web-courses
git commit -m "feat(web-courses): render video upload + badge inside LessonItem"
```

---

## Task 21: Extract shared E2E auth helpers + API e2e suite for videos

**Files:**
- Create: `apps/api-e2e/src/_helpers/auth.ts`
- Modify: `apps/api-e2e/src/courses.e2e-spec.ts` (import from shared helper)
- Create: `apps/api-e2e/src/videos.e2e-spec.ts`

- [ ] **Step 1: Extract helpers**

Create `apps/api-e2e/src/_helpers/auth.ts` containing `registerAndPromoteInstructor`, `registerStudent`, `uniqueEmail`, and the `admin.initializeApp` boot snippet from `courses.e2e-spec.ts`. Export them.

Update `courses.e2e-spec.ts` to import from this helper rather than defining inline. Run `pnpm nx run api-e2e:e2e` to confirm no regression.

- [ ] **Step 2: Write the video e2e suite**

Create `apps/api-e2e/src/videos.e2e-spec.ts`. Outline:

```ts
import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  API_BASE,
  registerAndPromoteInstructor,
  registerStudent,
  initAdmin,
} from './_helpers/auth';

initAdmin();

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'small-video.mp4');
const FIXTURE_BYTES = fs.readFileSync(FIXTURE_PATH);

async function createCourseModuleLesson(request, hdr) {
  const c = await request.post(`${API_BASE}/courses`, {
    headers: hdr,
    data: { title: 'Vid Course', description: 'desc' },
  });
  const course = await c.json();
  const m = await request.post(`${API_BASE}/courses/${course.id}/modules`, {
    headers: hdr,
    data: { title: 'M1' },
  });
  const mod = await m.json();
  const l = await request.post(
    `${API_BASE}/courses/${course.id}/modules/${mod.id}/lessons`,
    { headers: hdr, data: { title: 'L1' } },
  );
  const lesson = await l.json();
  return { course, mod, lesson };
}

test('video upload happy path', async ({ request }) => {
  const instructor = await registerAndPromoteInstructor(request);
  const hdr = { Cookie: instructor.cookieHeader };
  const { course, mod, lesson } = await createCourseModuleLesson(request, hdr);

  // Create upload session
  const sess = await request.post(
    `${API_BASE}/courses/${course.id}/modules/${mod.id}/lessons/${lesson.id}/video/upload-session`,
    {
      headers: hdr,
      data: { sizeBytes: FIXTURE_BYTES.length, contentType: 'video/mp4' },
    },
  );
  expect(sess.status()).toBe(201);
  const { videoId, uploadSessionUri } = await sess.json();

  // PUT the fixture to the session URI
  const put = await request.put(uploadSessionUri, {
    headers: { 'Content-Range': `bytes 0-${FIXTURE_BYTES.length - 1}/${FIXTURE_BYTES.length}` },
    data: FIXTURE_BYTES,
  });
  expect([200, 308]).toContain(put.status());

  // Complete
  const complete = await request.post(`${API_BASE}/videos/${videoId}/upload-complete`, {
    headers: hdr,
  });
  expect(complete.status()).toBe(200);
  const video = await complete.json();
  expect(video.state).toBe('UPLOADED');

  // GET reflects state
  const get = await request.get(`${API_BASE}/videos/${videoId}`, { headers: hdr });
  expect(get.status()).toBe(200);
  expect((await get.json()).state).toBe('UPLOADED');

  // DELETE cleans up
  const del = await request.delete(`${API_BASE}/videos/${videoId}`, { headers: hdr });
  expect(del.status()).toBe(204);
});

test('401 unauthenticated, 403 wrong-role, 403 wrong-instructor, 409 already-has-video', async ({
  request,
}) => {
  const inst = await registerAndPromoteInstructor(request);
  const hdr = { Cookie: inst.cookieHeader };
  const { course, mod, lesson } = await createCourseModuleLesson(request, hdr);

  // 401
  const unauth = await request.post(
    `${API_BASE}/courses/${course.id}/modules/${mod.id}/lessons/${lesson.id}/video/upload-session`,
    { data: { sizeBytes: 1, contentType: 'video/mp4' } },
  );
  expect(unauth.status()).toBe(401);

  // 403 INSUFFICIENT_ROLE (student)
  const student = await registerStudent(request);
  const studentRes = await request.post(
    `${API_BASE}/courses/${course.id}/modules/${mod.id}/lessons/${lesson.id}/video/upload-session`,
    {
      headers: { Cookie: student.cookieHeader },
      data: { sizeBytes: 1, contentType: 'video/mp4' },
    },
  );
  expect(studentRes.status()).toBe(403);
  expect((await studentRes.json()).code).toBe('INSUFFICIENT_ROLE');

  // 403 NOT_COURSE_OWNER (different instructor)
  const otherInst = await registerAndPromoteInstructor(request);
  const otherRes = await request.post(
    `${API_BASE}/courses/${course.id}/modules/${mod.id}/lessons/${lesson.id}/video/upload-session`,
    {
      headers: { Cookie: otherInst.cookieHeader },
      data: { sizeBytes: 1, contentType: 'video/mp4' },
    },
  );
  expect(otherRes.status()).toBe(403);
  expect((await otherRes.json()).code).toBe('NOT_COURSE_OWNER');

  // 409 LESSON_ALREADY_HAS_VIDEO
  // First upload to make the lesson "have" a video
  const first = await request.post(
    `${API_BASE}/courses/${course.id}/modules/${mod.id}/lessons/${lesson.id}/video/upload-session`,
    { headers: hdr, data: { sizeBytes: FIXTURE_BYTES.length, contentType: 'video/mp4' } },
  );
  const { videoId: firstVid, uploadSessionUri: uri1 } = await first.json();
  await request.put(uri1, {
    headers: { 'Content-Range': `bytes 0-${FIXTURE_BYTES.length - 1}/${FIXTURE_BYTES.length}` },
    data: FIXTURE_BYTES,
  });
  await request.post(`${API_BASE}/videos/${firstVid}/upload-complete`, { headers: hdr });

  // Now try a second
  const second = await request.post(
    `${API_BASE}/courses/${course.id}/modules/${mod.id}/lessons/${lesson.id}/video/upload-session`,
    { headers: hdr, data: { sizeBytes: 1, contentType: 'video/mp4' } },
  );
  expect(second.status()).toBe(409);
  expect((await second.json()).code).toBe('LESSON_ALREADY_HAS_VIDEO');
});

test('422 upload-object-missing when complete called before any bytes', async ({ request }) => {
  const inst = await registerAndPromoteInstructor(request);
  const hdr = { Cookie: inst.cookieHeader };
  const { course, mod, lesson } = await createCourseModuleLesson(request, hdr);
  const sess = await request
    .post(
      `${API_BASE}/courses/${course.id}/modules/${mod.id}/lessons/${lesson.id}/video/upload-session`,
      { headers: hdr, data: { sizeBytes: 100, contentType: 'video/mp4' } },
    )
    .then((r) => r.json());

  const r = await request.post(`${API_BASE}/videos/${sess.videoId}/upload-complete`, { headers: hdr });
  expect(r.status()).toBe(422);
  expect((await r.json()).code).toBe('UPLOAD_OBJECT_MISSING');
});

test('lesson delete cascades to video', async ({ request }) => {
  const inst = await registerAndPromoteInstructor(request);
  const hdr = { Cookie: inst.cookieHeader };
  const { course, mod, lesson } = await createCourseModuleLesson(request, hdr);

  // Upload a video
  const sess = await request
    .post(
      `${API_BASE}/courses/${course.id}/modules/${mod.id}/lessons/${lesson.id}/video/upload-session`,
      { headers: hdr, data: { sizeBytes: FIXTURE_BYTES.length, contentType: 'video/mp4' } },
    )
    .then((r) => r.json());
  await request.put(sess.uploadSessionUri, {
    headers: { 'Content-Range': `bytes 0-${FIXTURE_BYTES.length - 1}/${FIXTURE_BYTES.length}` },
    data: FIXTURE_BYTES,
  });
  await request.post(`${API_BASE}/videos/${sess.videoId}/upload-complete`, { headers: hdr });

  // Delete the lesson
  const del = await request.delete(
    `${API_BASE}/courses/${course.id}/modules/${mod.id}/lessons/${lesson.id}`,
    { headers: hdr },
  );
  expect(del.status()).toBe(204);

  // Video is gone
  const get = await request.get(`${API_BASE}/videos/${sess.videoId}`, { headers: hdr });
  expect(get.status()).toBe(404);
});
```

- [ ] **Step 3: Add the fixture**

```bash
mkdir -p apps/api-e2e/src/fixtures
# Use ffmpeg or a precomputed small mp4. The fixture must be a valid MP4 (~1 MB).
# Acceptable approach: generate locally with `ffmpeg -f lavfi -i color=c=black:s=128x128:d=1 -c:v libx264 small-video.mp4`
# and commit the resulting binary.
```

- [ ] **Step 4: Run e2e**

```bash
# Terminal 1: pnpm emulators
# Terminal 2: pnpm nx serve api
# Terminal 3:
pnpm nx run api-e2e:e2e
```

Expected: all video tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api-e2e
git commit -m "test(api-e2e): video upload lifecycle, error paths, cascade delete"
```

---

## Task 22: Web e2e

**Files:**
- Create: `apps/web-e2e/src/videos.spec.ts`
- Add fixture: `apps/web-e2e/src/fixtures/small-video.mp4` (symlink to or duplicate the api-e2e fixture)

- [ ] **Step 1: Spec**

Create `apps/web-e2e/src/videos.spec.ts`. Outline:

```ts
import { expect, test } from '@playwright/test';

test('instructor uploads a video and sees the badge', async ({ page }) => {
  // Sign-in flow: hit /login with seeded INSTRUCTOR creds.
  // Navigate to /courses, create a course, add a module, add a lesson.
  // Click the lesson, see the upload zone, set file via Playwright's setInputFiles.
  // Assert progress bar transitions; final badge visible.
  // Reload; badge still visible.
});

test('cancel mid-upload returns to empty state', async ({ page }) => { /* ... */ });

test('oversized file is rejected client-side without network', async ({ page }) => { /* ... */ });
```

(Use Playwright's `expect(locator).toBeVisible()` for badge visibility; use `setInputFiles` for file selection.)

- [ ] **Step 2: Run + commit**

```bash
pnpm nx run web-e2e:e2e -- --grep videos
git add apps/web-e2e
git commit -m "test(web-e2e): video upload happy path, cancel, oversize rejection"
```

---

## Task 23: Final acceptance

**Files:** none new; verification only.

- [ ] **Step 1: Full quality gate**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm e2e
```

All green.

- [ ] **Step 2: Mutation**

```bash
pnpm mutate:api-video
```

Verify score ≥ 85% or triage report is up to date.

- [ ] **Step 3: CRAP report**

```bash
pnpm crap
```

Verify `api-video` and `web-video` appear in the output.

- [ ] **Step 4: Manual run-through**

Per slice A spec §8 acceptance bar item 4. Document results in the PR.

- [ ] **Step 5: README update**

Modify the project README banner to reflect "EP-03 slice A (Video Upload) complete; transcoding deferred to slice B".

- [ ] **Step 6: Commit final touches**

```bash
git add README.md reports/mutation/api-video-triage.md reports/crap-coverage.json
git commit -m "docs(readme): EP-03 slice A complete; transcoding deferred to slice B"
```

- [ ] **Step 7: Push and open PR**

```bash
git push -u origin ep-03-slice-a-video-upload
gh pr create --title "EP-03 slice A: video upload" --body "$(cat <<'EOF'
## Summary
- Resumable upload to source bucket, Video doc lifecycle PENDING_UPLOAD → UPLOADED → FAILED
- New libs: api-video, web-video
- Cascade-delete from lesson delete
- InstructorRoleGuard hoisted to api-auth

## Test plan
- [x] pnpm lint
- [x] pnpm typecheck
- [x] pnpm test
- [x] pnpm e2e
- [x] pnpm mutate:api-video (≥ 85%)
- [x] Manual run-through per spec §8

Spec: docs/superpowers/specs/2026-05-13-video-upload-slice-a-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review against the slice A spec

- §1 State machine — Tasks 10, 11, 12 ✓
- §2 API surface — Tasks 12, 13, 14 ✓
- §2.4 Guards — Task 4 (hoist), Task 11 (VideoOwnerGuard) ✓
- §2.5 Error contract — Task 6, Task 13 ✓
- §3 Data layer — Task 2 (types), Task 3 (rules) ✓
- §4 Bucket interactions — Tasks 9, 10 ✓
- §4.5 Cross-lib cascade — Task 15 ✓
- §5 Frontend — Tasks 17, 18, 19, 20 ✓
- §6 Locked decisions — fully reflected across tasks; threshold env var Task 5 ✓
- §7 Testing — Tasks 6-19 unit/component; Tasks 3, 21, 22 e2e/rules; Task 16 mutation ✓
- §8 Acceptance bar — Task 23 ✓
- §9 Open questions — none open ✓

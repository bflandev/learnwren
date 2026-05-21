# Merge api-video into api-courses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the `api-video` Nx library into `api-courses` so the `CoursesModule ↔ VideoModule` circular dependency stops needing a `require()`-of-a-runtime-string seam, which currently prevents the bundled `api` server from booting and blocks all e2e suites.

**Architecture:** All `api-video` source moves to `libs/api-courses/src/lib/video/`. The five cross-library seam sites become ordinary static imports; `forwardRef()` is retained for the genuine mutual *module* dependency. The `api-video` Nx project is deleted. Pure structural refactor — no route, DTO, guard, error, or runtime behaviour changes.

**Tech Stack:** Nx 22.7, TypeScript project references, NestJS 11, webpack (api app bundle), Vitest.

**Reference spec:** `docs/superpowers/specs/2026-05-20-merge-api-video-into-api-courses-design.md`

---

## Execution notes

- **This refactor is atomic.** Tasks 1–5 leave the workspace temporarily un-buildable (a library is mid-move). That is expected. The single green checkpoint and the single commit are in Task 6. Do not try to build between Task 1 and Task 6.
- Run every command from the repo root: `/Volumes/Artie-Storage/github-repos/learnwren`.
- All `git mv` / `git rm` keep file history — use them, not plain `mv`/`rm`.

---

## Task 1: Relocate the api-video source tree

**Files:**
- Delete: `libs/api-video/src/lib/api-video.module.ts` (dead Nx scaffold stub — `ApiVideoModule`, empty, never exported)
- Move: `libs/api-video/src/lib/**` → `libs/api-courses/src/lib/video/**`

- [ ] **Step 1: Remove the dead scaffold module**

Run:
```bash
git rm libs/api-video/src/lib/api-video.module.ts
```

- [ ] **Step 2: Create the target directory and move the source tree**

Run:
```bash
mkdir -p libs/api-courses/src/lib/video
git mv libs/api-video/src/lib/* libs/api-courses/src/lib/video/
```

- [ ] **Step 3: Verify the move**

Run:
```bash
ls libs/api-courses/src/lib/video
```
Expected entries: `dto  errors  playback  transcoder  types  webhook  video-owner.guard.ts  video-owner.guard.spec.ts  video-storage.adapter.ts  video-storage.adapter.spec.ts  video.config.ts  video.config.spec.ts  video.controller.ts  video.controller.spec.ts  video.exception-filter.ts  video.exception-filter.spec.ts  video.module.ts  video.repository.ts  video.service.ts  video.service.spec.ts`

Run:
```bash
ls libs/api-video/src
```
Expected: only `index.ts` remains (the `lib/` directory is now empty and untracked).

No commit — continues in Task 2.

---

## Task 2: Rewire the moved video files to intra-library imports

The moved files still reference `@learnwren/api-courses` and build the package name at runtime. Convert all of it to relative imports.

**Files:**
- Modify: `libs/api-courses/src/lib/video/video.module.ts`
- Modify: `libs/api-courses/src/lib/video/video.controller.ts`
- Modify: `libs/api-courses/src/lib/video/video.controller.spec.ts`

- [ ] **Step 1: Rewire `video/video.module.ts`**

Find (lines 8–20 — the comment block, the runtime-string const, and the start of the relative imports):
```ts
// The api-courses package name is built at runtime from string fragments so the
// Nx project graph parser (which only follows string-literal require() args)
// does not infer api-video → api-courses as a graph edge. The lint suppression
// for the @nx/enforce-module-boundaries circular check is still required for
// the static imports in video.controller.ts, but the require() in this file
// is now invisible to graph inference. See courses.module.ts for the matching
// pattern on the reverse direction.
const API_COURSES_PKG = ['@learnwren', 'api-courses'].join('/');

import { EnrollmentOrOwnerGuard } from './playback/enrollment-or-owner.guard';
```
Replace with:
```ts
import { CoursesModule } from '../courses.module';
import { EnrollmentOrOwnerGuard } from './playback/enrollment-or-owner.guard';
```

Find (in the `@Module` `imports` array):
```ts
    forwardRef(() => require(API_COURSES_PKG).CoursesModule),
```
Replace with:
```ts
    forwardRef(() => CoursesModule),
```

- [ ] **Step 2: Rewire `video/video.controller.ts`**

Find (lines 16–22):
```ts
// eslint-disable-next-line @nx/enforce-module-boundaries -- intentional circular: api-video ↔ api-courses (NestJS forwardRef cascade delete)
import {
  CourseOwnerGuard,
  CoursesRepository,
  LessonNotFoundException,
  ModuleNotFoundException,
} from '@learnwren/api-courses';
```
Replace with:
```ts
import { CourseOwnerGuard } from '../course-owner.guard';
import { CoursesRepository } from '../courses.repository';
import {
  LessonNotFoundException,
  ModuleNotFoundException,
} from '../errors/courses.exception';
```

- [ ] **Step 3: Rewire `video/video.controller.spec.ts`**

Find (lines 5–11):
```ts
// eslint-disable-next-line @nx/enforce-module-boundaries -- intentional circular: api-video ↔ api-courses (NestJS forwardRef cascade delete)
import {
  CourseOwnerGuard,
  CoursesRepository,
  LessonNotFoundException,
  ModuleNotFoundException,
} from '@learnwren/api-courses';
```
Replace with:
```ts
import { CourseOwnerGuard } from '../course-owner.guard';
import { CoursesRepository } from '../courses.repository';
import {
  LessonNotFoundException,
  ModuleNotFoundException,
} from '../errors/courses.exception';
```

No commit — continues in Task 3.

---

## Task 3: Rewire the api-courses → video seams

**Files:**
- Modify: `libs/api-courses/src/lib/courses.module.ts`
- Modify: `libs/api-courses/src/lib/courses.service.ts`
- Modify: `libs/api-courses/src/lib/publish/publish.service.ts`

- [ ] **Step 1: Rewire `courses.module.ts`**

Find (lines 12–27 — the comment block, the runtime-string const, and the `imports` line):
```ts
// VideoModule ↔ CoursesModule are mutually dependent:
//   CoursesService calls VideoService.deleteForLesson (cascade).
//   VideoController injects CoursesRepository from CoursesModule.
// NestJS resolves the cycle at runtime via forwardRef.
// Lazy require() inside forwardRef breaks the CommonJS circular-import problem
// so that decorators in both modules see fully-initialised exports.
//
// The package name is built at runtime from string fragments so the Nx project
// graph parser (which only follows string-literal require() arguments) does
// not infer api-courses → api-video as a graph edge. The reverse edge is
// resolved as a NestJS forwardRef at runtime; the TypeScript project
// references in tsconfig.lib.json are already one-way and unaffected.
const API_VIDEO_PKG = ['@learnwren', 'api-video'].join('/');

@Module({
  imports: [AuthModule, forwardRef(() => require(API_VIDEO_PKG).VideoModule)],
```
Replace with:
```ts
// VideoModule ↔ CoursesModule are mutually dependent (CoursesService cascades
// deletes into VideoService; VideoController injects CoursesRepository).
// NestJS resolves the cycle with forwardRef.
@Module({
  imports: [AuthModule, forwardRef(() => VideoModule)],
```

Find (the relative-import block, lines 5–10):
```ts
import { CourseOwnerGuard } from './course-owner.guard';
import { CoursesController } from './courses.controller';
import { CoursesExceptionFilter } from './courses.exception-filter';
import { CoursesRepository } from './courses.repository';
import { CoursesService } from './courses.service';
import { PublishService } from './publish/publish.service';
```
Replace with:
```ts
import { CourseOwnerGuard } from './course-owner.guard';
import { CoursesController } from './courses.controller';
import { CoursesExceptionFilter } from './courses.exception-filter';
import { CoursesRepository } from './courses.repository';
import { CoursesService } from './courses.service';
import { PublishService } from './publish/publish.service';
import { VideoModule } from './video/video.module';
```

- [ ] **Step 2: Rewire `courses.service.ts`**

Find (lines 16–34 — the structural interface, the runtime-string const, and the start of the relative imports):
```ts
// Minimal structural interface for the VideoService dependency.
// Using a local interface instead of importing the concrete class avoids the
// TypeScript composite project reference cycle (api-courses ↔ api-video).
// The DI token is provided via forwardRef(() => require(API_VIDEO_PKG).VideoService).
interface VideoServiceLike {
  deleteForLesson(lessonId: string): Promise<void>;
  // Slice D: read a Video by id; throws VideoNotFoundException when absent.
  // Used by PublishService to fold orphan lesson.videoId references into
  // LESSON_HAS_NO_VIDEO reasons.
  getVideo(vid: import('@learnwren/shared-data-models').VideoId): Promise<
    import('@learnwren/shared-data-models').Video
  >;
}

// Built at runtime from string fragments so the Nx project graph parser does
// not infer api-courses → api-video as a graph edge. See courses.module.ts.
const API_VIDEO_PKG = ['@learnwren', 'api-video'].join('/');

import { CoursesRepository } from './courses.repository';
```
Replace with:
```ts
import { CoursesRepository } from './courses.repository';
```

Find (the `errors` / `types` import block immediately after, lines 35–41):
```ts
import {
  CourseNotFoundException,
  LessonNotFoundException,
  ModuleNotFoundException,
  StaleReorderException,
} from './errors/courses.exception';
import type { CourseTree } from './types/loaded-course';
```
Replace with:
```ts
import {
  CourseNotFoundException,
  LessonNotFoundException,
  ModuleNotFoundException,
  StaleReorderException,
} from './errors/courses.exception';
import type { CourseTree } from './types/loaded-course';
import { VideoService } from './video/video.service';
```

Find (the constructor, lines 65–74):
```ts
  constructor(
    private readonly repo: CoursesRepository,
    // forwardRef with lazy require: resolves the api-courses ↔ api-video circular
    // dependency at runtime without triggering a static import that would cause
    // CourseOwnerGuard to be undefined during VideoController class decoration.
    // API_VIDEO_PKG is computed at runtime to keep this edge out of the Nx
    // project graph (see top-of-file comment).
    @Inject(forwardRef(() => require(API_VIDEO_PKG).VideoService))
    private readonly videoSvc: VideoServiceLike,
  ) {}
```
Replace with:
```ts
  constructor(
    private readonly repo: CoursesRepository,
    // forwardRef resolves the CoursesModule ↔ VideoModule runtime cycle.
    @Inject(forwardRef(() => VideoService))
    private readonly videoSvc: VideoService,
  ) {}
```

- [ ] **Step 3: Rewire `publish/publish.service.ts`**

Find (lines 22–30 — the structural interface and the runtime-string const):
```ts
import { composeReasons } from './publish-eligibility';

// Same disguised require pattern as courses.service.ts to keep the api-courses
// → api-video edge out of the Nx project graph.
interface VideoServiceLike {
  getVideo(vid: VideoId): Promise<Video>;
}

const API_VIDEO_PKG = ['@learnwren', 'api-video'].join('/');
```
Replace with:
```ts
import { composeReasons } from './publish-eligibility';
import { VideoService } from '../video/video.service';
```

Find (the constructor, lines 44–49):
```ts
  constructor(
    private readonly repo: CoursesRepository,
    @Inject(forwardRef(() => require(API_VIDEO_PKG).VideoService))
    private readonly videoSvc: VideoServiceLike,
    @Inject(FIRESTORE) private readonly firestore: FirestoreHandle,
  ) {}
```
Replace with:
```ts
  constructor(
    private readonly repo: CoursesRepository,
    @Inject(forwardRef(() => VideoService))
    private readonly videoSvc: VideoService,
    @Inject(FIRESTORE) private readonly firestore: FirestoreHandle,
  ) {}
```

Note: `publish.service.ts` keeps its `isVideoNotFound(e)` name-matching helper unchanged — it is correct and not part of the seam.

No commit — continues in Task 4.

---

## Task 4: Update the public surface and the api app

**Files:**
- Modify: `libs/api-courses/src/index.ts`
- Modify: `apps/api/src/app/app.module.ts`

- [ ] **Step 1: Extend `libs/api-courses/src/index.ts`**

Replace the entire file contents with:
```ts
export { CoursesModule } from './lib/courses.module';
export { CoursesRepository } from './lib/courses.repository';
export { CourseOwnerGuard } from './lib/course-owner.guard';
export {
  LessonNotFoundException,
  ModuleNotFoundException,
} from './lib/errors/courses.exception';
export { VideoModule } from './lib/video/video.module';
export { VideoService } from './lib/video/video.service';
export {
  VIDEO_CONFIG,
  type VideoConfig,
  readVideoConfigFromEnv,
} from './lib/video/video.config';
```

- [ ] **Step 2: Update `apps/api/src/app/app.module.ts`**

Find:
```ts
import { CoursesModule } from '@learnwren/api-courses';
import { VideoModule } from '@learnwren/api-video';
```
Replace with:
```ts
import { CoursesModule, VideoModule } from '@learnwren/api-courses';
```

The `@Module({ imports: [...] })` line keeps both `CoursesModule` and `VideoModule` — no change there.

No commit — continues in Task 5.

---

## Task 5: Update workspace config and delete the old project

**Files:**
- Modify: `tsconfig.base.json`
- Modify: `tsconfig.json`
- Modify: `apps/api/tsconfig.app.json`
- Modify: `libs/api-courses/tsconfig.lib.json`
- Modify: `package.json`
- Modify: `tools/crap/crap.mjs`
- Delete: `stryker.api-video.config.mjs`
- Delete: `libs/api-video/` (entire directory)

- [ ] **Step 1: Remove the `@learnwren/api-video` path alias from `tsconfig.base.json`**

Find:
```json
      "@learnwren/api-video": ["./libs/api-video/src/index.ts"],
```
Delete that line. Leave `@learnwren/web-video` (a different lib) untouched.

- [ ] **Step 2: Remove the `api-video` project reference from `tsconfig.json`**

Find:
```json
    {
      "path": "./libs/api-video"
    },
```
Delete that object. Ensure the remaining `references` array is still valid JSON (no trailing/double commas).

- [ ] **Step 3: Remove the `api-video` reference from `apps/api/tsconfig.app.json`**

Find:
```json
    {
      "path": "../../libs/api-video/tsconfig.lib.json"
    },
```
Delete that object. Ensure the remaining `references` array is still valid JSON.

- [ ] **Step 4: Remove the stale `nx.sync` block from `libs/api-courses/tsconfig.lib.json`**

Find (the trailing property of the file):
```json
  "references": [
    {
      "path": "../api-firebase/tsconfig.lib.json"
    },
    {
      "path": "../shared-data-models/tsconfig.lib.json"
    },
    {
      "path": "../api-auth/tsconfig.lib.json"
    }
  ],
  "nx": {
    "sync": {
      "ignoredDependencies": ["api-video"]
    }
  }
}
```
Replace with:
```json
  "references": [
    {
      "path": "../api-firebase/tsconfig.lib.json"
    },
    {
      "path": "../shared-data-models/tsconfig.lib.json"
    },
    {
      "path": "../api-auth/tsconfig.lib.json"
    }
  ]
}
```

- [ ] **Step 5: Update `package.json` scripts**

Find:
```json
    "mutate:api-video": "stryker run stryker.api-video.config.mjs",
    "crap:coverage": "nx run-many -t test --coverage --coverage.reportOnFailure=true --projects=api-auth,api-courses,api-firebase,api-video,web-auth,web-courses,web-video,shared-data-models,api --skip-nx-cache --parallel=1 || true",
```
Replace with:
```json
    "crap:coverage": "nx run-many -t test --coverage --coverage.reportOnFailure=true --projects=api-auth,api-courses,api-firebase,web-auth,web-courses,web-video,shared-data-models,api --skip-nx-cache --parallel=1 || true",
```

Find:
```json
    "mutate": "pnpm mutate:api-auth && pnpm mutate:api-courses && pnpm mutate:api-video && pnpm mutate:report",
```
Replace with:
```json
    "mutate": "pnpm mutate:api-auth && pnpm mutate:api-courses && pnpm mutate:report",
```

- [ ] **Step 6: Remove the `api-video` coverage directory from `tools/crap/crap.mjs`**

Find:
```js
  'coverage/libs/api-courses',
  'coverage/libs/api-firebase',
  'coverage/libs/api-video',
  'coverage/libs/shared-data-models',
```
Replace with:
```js
  'coverage/libs/api-courses',
  'coverage/libs/api-firebase',
  'coverage/libs/shared-data-models',
```

- [ ] **Step 7: Delete the obsolete Stryker config and the api-video project directory**

Run:
```bash
git rm stryker.api-video.config.mjs
git rm -r libs/api-video
```

- [ ] **Step 8: Verify nothing of api-video remains**

Run:
```bash
test ! -e libs/api-video && echo "api-video directory removed"
grep -rn "join('/')" libs apps || echo "no runtime-string require seams remain"
grep -rn "@learnwren/api-video" libs apps package.json tsconfig.base.json tsconfig.json || echo "no @learnwren/api-video references remain"
```
Expected: all three confirmation messages print; the two `grep`s produce no matches.

No commit — verification and commit are Task 6.

---

## Task 6: Sync, verify green, and commit

**Files:** none modified — verification only, then one commit of Tasks 1–5.

- [ ] **Step 1: Clear caches and stale TypeScript build state**

Run:
```bash
pnpm nx reset
rm -rf dist/out-tsc dist/libs dist/apps
find libs apps -name "*.tsbuildinfo" -delete
```

- [ ] **Step 2: Run the Nx TypeScript sync**

Run:
```bash
pnpm nx sync
```
Expected: completes without error. It may report it updated `references` — that is fine; stage those changes with the commit in Step 9.

- [ ] **Step 3: Typecheck the workspace**

Run:
```bash
pnpm nx run-many -t typecheck --skip-nx-cache
```
Expected: `Successfully ran target typecheck` for all projects (11 — `api-video` is gone). If a method-not-found error appears on `VideoService`, the method is `private` in `libs/api-courses/src/lib/video/video.service.ts` — make it `public`; do not re-introduce a structural interface.

- [ ] **Step 4: Run unit tests**

Run:
```bash
pnpm nx run-many -t test --skip-nx-cache
```
Expected: `Successfully ran target test` for all projects. The former api-video specs now run under the `api-courses` test project.

- [ ] **Step 5: Build the workspace**

Run:
```bash
pnpm nx run-many -t build --skip-nx-cache
```
Expected: `Successfully ran target build`. Webpack may still print `Critical dependency: the request of a dependency is an expression` for unrelated `firebase-admin` internals — that is acceptable. There must be no warning naming `api-courses` or `api-video` source files.

- [ ] **Step 6: Lint the workspace**

Run:
```bash
pnpm nx run-many -t lint --skip-nx-cache
```
Expected: `Successfully ran target lint`. The removed `eslint-disable @nx/enforce-module-boundaries` lines must not cause an "unused eslint-disable" error (they are gone) and the former cross-boundary import must not trigger `@nx/enforce-module-boundaries` (it is now intra-library).

- [ ] **Step 7: Confirm the Nx graph has no cycle and no api-video project**

Run:
```bash
pnpm nx show projects | sort
```
Expected: no `api-video` line. Projects: `api`, `api-auth`, `api-courses`, `api-e2e`, `api-firebase`, `shared-data-models`, `web`, `web-auth`, `web-courses`, `web-e2e`, `web-video`.

- [ ] **Step 8: Boot the bundled api server — the core success check**

Run:
```bash
node dist/apps/api/main.js > /tmp/api-boot.log 2>&1 & PID=$!; sleep 6; kill $PID 2>/dev/null; wait $PID 2>/dev/null; cat /tmp/api-boot.log
```
Expected: NestJS startup logs with **no** `Error: Cannot find module '@learnwren/api-video'` and **no** `webpackEmptyContext`. Firestore-connection errors are acceptable if no emulator is running — the check is module resolution, not DB connectivity.

- [ ] **Step 9: Commit the refactor**

Run:
```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(api): merge api-video into api-courses to break module cycle

CoursesModule and VideoModule are mutually dependent NestJS modules
that lived in two separate Nx libraries. The cross-library edge was
hidden behind forwardRef(() => require(runtime-string)) so it would
not create a TypeScript project-reference cycle or an Nx graph cycle
— but that also hid it from webpack, which never bundled
@learnwren/api-video into the api server (webpackEmptyContext →
MODULE_NOT_FOUND at boot), blocking every e2e suite.

api-video now lives at libs/api-courses/src/lib/video/. The five seam
sites use ordinary static imports; forwardRef is retained for the
genuine CoursesModule <-> VideoModule mutual dependency. No route,
DTO, guard, error envelope, or runtime behaviour changes.

Spec: docs/superpowers/specs/2026-05-20-merge-api-video-into-api-courses-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 10: Confirm a clean tree**

Run:
```bash
git status --short
```
Expected: only `.claude/scheduled_tasks.lock` may remain modified (a pre-existing, unrelated tooling lock — do not commit it).

---

## Task 7: Run the e2e suites

**Files:** none modified — this verifies the e2e blocker is lifted.

- [ ] **Step 1: Start the Firebase emulator suite**

In a separate terminal, run:
```bash
pnpm emulators
```
Leave it running for the e2e steps. (If the e2e targets start their own emulator via a Playwright global-setup, this step is a no-op — check `apps/api-e2e` first.)

- [ ] **Step 2: Run the api e2e suite**

Run:
```bash
pnpm nx run api-e2e:e2e
```
Expected: the suite runs (the api server boots — the previous `MODULE_NOT_FOUND` blocker is gone). If `auth.e2e-spec.ts` ("register → session → me → logout") fails, that is the pre-existing, unrelated Firestore-emulator propagation flake — re-run that single test once before treating it as a regression.

- [ ] **Step 3: Run the web e2e suite**

Run:
```bash
pnpm nx run web-e2e:e2e
```
Expected: the suite runs against the booted api.

- [ ] **Step 4: Report**

If both suites pass (allowing one re-run of the known `auth.e2e-spec.ts` flake), the refactor is complete. If any *other* test fails, capture the failure — it is either a genuine regression from this refactor (investigate with `superpowers:systematic-debugging`) or a separate pre-existing e2e-infra issue (record it; out of scope per the spec's Non-Goals).

No commit — verification only.

---

## Self-review

**Spec coverage:** Library structure (Task 1) · public surface `index.ts` (Task 4) · all five seam conversions (Tasks 2–3) · external consumer `app.module.ts` (Task 4) · every config change in the spec table — `tsconfig.base.json`, `tsconfig.json`, `apps/api/tsconfig.app.json`, `api-courses/tsconfig.lib.json`, `stryker.api-video.config.mjs`, `package.json`, `tools/crap/crap.mjs`, directory deletion (Task 5) · verification incl. api-boot check and e2e (Tasks 6–7). All spec sections map to a task.

**Placeholders:** none — every edit step shows exact find/replace code.

**Type consistency:** `VideoService` (concrete class, public `getVideo`/`deleteForLesson` confirmed) replaces the `VideoServiceLike` structural interfaces in both `courses.service.ts` and `publish.service.ts`; `VideoModule` import path `./video/video.module` is consistent across `courses.module.ts` and `index.ts`; `../courses.module` / `../courses.repository` / `../course-owner.guard` / `../errors/courses.exception` relative paths are correct from `src/lib/video/`.

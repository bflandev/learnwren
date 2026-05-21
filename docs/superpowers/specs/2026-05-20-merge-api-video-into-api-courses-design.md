# Merge `api-video` into `api-courses` — Circular-Dependency Refactor

> [!NOTE]
> **DOCUMENT STATUS: APPROVED**
> Approved 2026-05-20, before implementation.

**Status:** Approved (2026-05-20)
**Scope:** Eliminate the `libs/api-courses ↔ libs/api-video` circular dependency by merging `api-video` into `api-courses` as a single Nx library. This removes the `forwardRef(() => require(['@learnwren','api-video'].join('/')))` string-fragment seam that hides the cycle from webpack and the Nx graph parser, which currently prevents the bundled `api` server from booting and so blocks the `api-e2e` and `web-e2e` suites. Pure structural refactor — no feature behaviour changes.

This spec sits on top of:

- `2026-05-13-video-upload-slice-a-design.md` (slice A — introduced the `api-courses ↔ api-video` mutual dependency and the `require()` seam).
- `2026-05-14-video-playback-slice-c-design.md` and `2026-05-20-publish-gate-slice-d-design.md` (slices C/D — added the `VideoService` injections into `CoursesService` / `PublishService`).

## Background

Two distinct problems were found when auditing the build and tests:

1. **Build break (already fixed, in the working tree).** `libs/api-video` and `libs/web-video` carried hand-written `build` targets (`@nx/js:tsc` and `@nx/angular:ng-packagr-lite`) while every sibling lib uses the `@nx/js/typescript` plugin-inferred `tsc --build tsconfig.lib.json`. Commit `024d42c` ("align api-video/web-video with sibling pattern") removed the stray `test`/`typecheck` targets but missed `build`. The fix — already applied — removes the two leftover `build` targets so the plugin infers the standard build. `nx run-many -t build typecheck test` is now green.

2. **e2e blocker (this spec).** `CoursesModule` and `VideoModule` are mutually dependent NestJS modules living in two separate Nx libraries. A genuine cross-library import cycle would break `tsc --build` (TypeScript project references must be acyclic) and trip the Nx graph's circular-dependency check. To dodge both, the cross-library references were written as `require(PKG)` where `PKG` is assembled at runtime from string fragments, so neither webpack nor the Nx graph parser can see the edge. webpack consequently never bundles `@learnwren/api-video` into `dist/apps/api/main.js`; at boot, `require` resolves through `webpackEmptyContext` and throws `Error: Cannot find module '@learnwren/api-video'`. The server cannot start, so no e2e suite can run.

The seam appears at five sites:

| File | Site |
| --- | --- |
| `libs/api-courses/src/lib/courses.module.ts` | `imports: [forwardRef(() => require(API_VIDEO_PKG).VideoModule)]` |
| `libs/api-courses/src/lib/courses.service.ts` | `@Inject(forwardRef(() => require(API_VIDEO_PKG).VideoService))` |
| `libs/api-courses/src/lib/publish/publish.service.ts` | `@Inject(forwardRef(() => require(API_VIDEO_PKG).VideoService))` |
| `libs/api-video/src/lib/video.module.ts` | `imports: [forwardRef(() => require(API_COURSES_PKG).CoursesModule)]` |
| `libs/api-video/src/lib/video.controller.ts` | static `import { CourseOwnerGuard, CoursesRepository, … } from '@learnwren/api-courses'` (the only non-`require` cross-edge; carries an `eslint-disable @nx/enforce-module-boundaries`) |

The mutual dependency itself is legitimate: courses contain lessons that reference videos (publish-gate eligibility reads `Video.state`; cascade-delete of a course removes its videos), and video endpoints authorise against course ownership. `forwardRef()` is the correct NestJS tool for a mutual *module* dependency — the only thing wrong is that the two modules straddle a library boundary. Merging the libraries keeps `forwardRef` but makes it an ordinary intra-library reference that webpack and Nx can both see.

## Goal

After this refactor:

- `libs/api-video` no longer exists as an Nx project. Its source lives under `libs/api-courses/src/lib/video/`.
- No `require()`-of-a-runtime-string remains in `libs/api-courses`. The five seam sites use ordinary static imports; `forwardRef()` is retained only where a true mutual *module* dependency exists (`CoursesModule` ↔ `VideoModule`).
- `nx graph` shows no circular dependency; no `@nx/enforce-module-boundaries` suppression remains for this edge.
- `node dist/apps/api/main.js` boots with no `MODULE_NOT_FOUND`.
- `nx run-many -t build typecheck test lint` is green across all (now 11) projects.
- `api-e2e` and `web-e2e` run. (`api-e2e` carries a pre-existing, unrelated intermittent flake in `auth.e2e-spec.ts` — see Non-Goals.)
- No change to any HTTP route, DTO, guard, error envelope, Firestore path, or runtime behaviour. The merge is observable only in the source tree and build graph.

## Non-Goals

- **Collapsing `VideoModule` into `CoursesModule`.** The two NestJS modules stay distinct; only the library boundary is removed. Collapsing them would restructure DI, controller grouping, and exception-filter registration for no benefit.
- **Merging the web-side libraries.** `libs/web-courses` and `libs/web-video` have no circular dependency and are out of scope. Only the `api-*` pair is merged.
- **Fixing the `api-e2e` flake.** `auth.e2e-spec.ts` ("register → session → me → logout") intermittently fails on a Firestore-emulator propagation race in the auth registration path. It is pre-existing, unrelated to this refactor, and tracked separately. If it trips during verification, re-run that single test.
- **Widening mutation-test coverage.** The video mutation surface previously covered by `stryker.api-video.config.mjs` is not re-homed into `stryker.api-courses.config.mjs` here; that config keeps its current course-only scope. Re-pointing Stryker at the merged `video/` subtree is a follow-up.
- **Renaming to a new merged-domain name** (`api-content`, `api-catalog`). Considered; `api-courses` was chosen to minimise alias churn — videos are conceptually part of courses.

## Design

### Library structure

All of `libs/api-video/src/lib/**` moves into a `video/` sub-namespace of `api-courses`:

```
libs/api-courses/src/
  index.ts                         # exports courses + video public surface
  lib/
    courses.module.ts              # existing
    courses.service.ts             # existing
    courses.controller.ts          # existing
    courses.repository.ts          # existing
    course-owner.guard.ts          # existing
    courses.exception-filter.ts    # existing
    dto/  errors/  publish/  types/ # existing course subtrees
    video/                         # <-- former libs/api-video/src/lib/**
      video.module.ts
      video.service.ts
      video.controller.ts
      video.repository.ts
      video.config.ts
      video-owner.guard.ts
      video-storage.adapter.ts
      video.exception-filter.ts
      dto/  errors/  playback/  transcoder/  types/  webhook/
```

The `video/` sub-namespace is required, not cosmetic: a flat merge would collide `libs/api-courses/src/lib/dto/dto.spec.ts` with `libs/api-video/src/lib/dto/dto.spec.ts`. It also keeps the video feature cohesive and makes the intra-module imports self-documenting (`./video/video.module`).

The dead Nx-scaffold stub `libs/api-video/src/lib/api-video.module.ts` (`ApiVideoModule` — empty, never exported) is dropped, not moved.

### Public surface (`libs/api-courses/src/index.ts`)

Extends the current course exports with the former `api-video` index:

```ts
// existing
export { CoursesModule } from './lib/courses.module';
export { CoursesRepository } from './lib/courses.repository';
export { CourseOwnerGuard } from './lib/course-owner.guard';
export {
  LessonNotFoundException,
  ModuleNotFoundException,
} from './lib/errors/courses.exception';
// added — former libs/api-video/src/index.ts
export { VideoModule } from './lib/video/video.module';
export { VideoService } from './lib/video/video.service';
export {
  VIDEO_CONFIG,
  type VideoConfig,
  readVideoConfigFromEnv,
} from './lib/video/video.config';
```

### Seam conversion

Each of the five seam sites becomes an ordinary static import. The `API_VIDEO_PKG` / `API_COURSES_PKG` string-fragment constants and their explanatory comments are deleted.

| File | Before | After |
| --- | --- | --- |
| `courses.module.ts` | `forwardRef(() => require(API_VIDEO_PKG).VideoModule)` | `import { VideoModule } from './video/video.module';` + `forwardRef(() => VideoModule)` |
| `courses.service.ts` | `@Inject(forwardRef(() => require(API_VIDEO_PKG).VideoService))` | `import { VideoService } from './video/video.service';` + `@Inject(forwardRef(() => VideoService))` |
| `publish/publish.service.ts` | `@Inject(forwardRef(() => require(API_VIDEO_PKG).VideoService))` | `import { VideoService } from '../video/video.service';` + `@Inject(forwardRef(() => VideoService))` |
| `video/video.module.ts` | `forwardRef(() => require(API_COURSES_PKG).CoursesModule)` | `import { CoursesModule } from '../courses.module';` + `forwardRef(() => CoursesModule)` |
| `video/video.controller.ts` | `import { … } from '@learnwren/api-courses'` (+ `eslint-disable`) | `import { CourseOwnerGuard } from '../course-owner.guard';` etc. — relative; suppression removed |

`forwardRef()` is retained at the `CoursesModule ↔ VideoModule` module-import sites and at the `VideoService` injection sites, because the runtime cycle still exists — `forwardRef` is how NestJS resolves it. The change is that the *symbols* are now resolved by webpack from a static graph instead of from a runtime string, so the bundle is complete. Within one library and one webpack bundle this is the textbook `forwardRef` use case.

### External surface

The only consumer outside the two libs is `apps/api/src/app/app.module.ts`:

```ts
// before
import { CoursesModule } from '@learnwren/api-courses';
import { VideoModule } from '@learnwren/api-video';
// after
import { CoursesModule, VideoModule } from '@learnwren/api-courses';
```

`app.module.ts` still registers both modules in `imports` — unchanged. The `@learnwren/api-video` path alias is retired.

### Configuration changes

| File | Change |
| --- | --- |
| `tsconfig.base.json` | Remove the `@learnwren/api-video` `paths` entry. |
| `tsconfig.json` (root) | Remove the `./libs/api-video` project reference. |
| `apps/api/tsconfig.app.json` | Remove the `../../libs/api-video/tsconfig.lib.json` reference. |
| `libs/api-courses/tsconfig.lib.json` | Remove `nx.sync.ignoredDependencies: ["api-video"]`. `references` already cover `api-auth`, `api-firebase`, `shared-data-models` — the union with api-video's former references adds nothing new. |
| `libs/api-video/` | Delete the entire directory (`project.json`, `tsconfig*.json`, `vitest.config.mts`, `package.json`, `src/`, `*.md`). |
| `stryker.api-video.config.mjs` | Delete. |
| `package.json` | Remove the `mutate:api-video` script; drop `api-video` from the `mutate` chain and from the `crap:coverage` `--projects` list. |
| `tools/crap/crap.mjs` | Update if it enumerates `api-video` explicitly. |

`libs/api-courses/vitest.config.mts` needs no change — its `include` glob (`{src,tests}/**/*.{test,spec}.…`) already covers the new `src/lib/video/**` specs. The `pnpm-workspace.yaml` `libs/*` glob handles the directory removal automatically.

### Test files

The ~20 `*.spec.ts` files under the former `api-video` move with their sources into `libs/api-courses/src/lib/video/`. They run under the `api-courses` vitest project after the move. Any imports between them and api-video sources are already relative and move intact; any `@learnwren/api-courses` imports inside video specs (e.g. `video.controller.spec.ts`) become relative.

## Verification

1. `nx reset` then `nx run-many -t build typecheck test lint` — green for all 11 projects (api-video gone).
2. `nx graph` (or `nx show projects`) — no `api-video` project; no circular-dependency warning.
3. `grep -rn "join('/')" libs apps` — no matches; `grep -rn "@learnwren/api-video" .` — no matches outside `node_modules`/`dist`/`docs`.
4. Build the api app and boot it: `node dist/apps/api/main.js` starts with no `MODULE_NOT_FOUND` (Firestore-emulator connection errors without the emulator running are acceptable — the test is module resolution, not DB connectivity).
5. `api-e2e` and `web-e2e` run against the emulator suite. Re-run the single `auth.e2e-spec.ts` happy-path test if the known unrelated flake trips.

## Risks

Low — the change is a mechanical file move plus import-path rewrites; no logic changes.

- **Spec/source collision.** Mitigated by the `video/` sub-namespace (the only real collision is `dto/dto.spec.ts`).
- **Stale Nx/TypeScript caches** masking or faking results. Mitigated by a `nx reset` and removal of stale `*.tsbuildinfo` before the verification build.
- **A missed import.** Mitigated by `typecheck` + the two `grep` checks in Verification step 3.
- **`forwardRef` ordering.** Unchanged from today — the same `forwardRef` pairs exist; they merely resolve statically now. If DI resolution regresses, it would surface immediately at api boot (step 4).

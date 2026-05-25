# Merge api-video into api-courses — Implementation Summary

**Date:** 2026-05-20
**Spec:** `docs/superpowers/specs/2026-05-20-merge-api-video-into-api-courses-design.md`
**Plan:** `docs/superpowers/plans/2026-05-20-merge-api-video-into-api-courses.md`

Structural refactor that eliminates the `libs/api-courses ↔ libs/api-video` circular dependency by collapsing `api-video` into a `video/` sub-namespace under `libs/api-courses`. The cross-library cycle had been hidden behind `forwardRef(() => require(['@learnwren','api-video'].join('/')))` so that webpack and the Nx graph parser could not see it; webpack consequently never bundled `@learnwren/api-video` into `dist/apps/api/main.js`, so the bundled api server failed to boot (`Cannot find module '@learnwren/api-video'` via `webpackEmptyContext`), blocking both `api-e2e` and `web-e2e`. No route, DTO, guard, error envelope, or runtime behaviour change.

## What shipped

### Source move (`libs/api-video` → `libs/api-courses/src/lib/video/`)

- All of `libs/api-video/src/lib/**` relocated via `git mv` into `libs/api-courses/src/lib/video/` — preserves history. Subtree now contains `video.module.ts`, `video.service.ts`, `video.controller.ts`, `video.repository.ts`, `video.config.ts`, `video-owner.guard.ts`, `video-storage.adapter.ts`, `video.exception-filter.ts`, and the `dto/`, `errors/`, `playback/`, `transcoder/`, `types/`, `webhook/` directories — with their colocated `.spec.ts` files.
- Dead Nx scaffold stub `libs/api-video/src/lib/api-video.module.ts` (empty `ApiVideoModule`, never exported) deleted, not moved.
- `libs/api-video/` directory removed in full (`project.json`, `tsconfig*.json`, `vitest.config.mts`, `package.json`, `src/`, `README.md`).

### Seam conversion (five sites → ordinary static imports)

- `libs/api-courses/src/lib/courses.module.ts` — `forwardRef(() => require(API_VIDEO_PKG).VideoModule)` becomes `import { VideoModule } from './video/video.module'` + `forwardRef(() => VideoModule)`.
- `libs/api-courses/src/lib/courses.service.ts` — drops the `VideoServiceLike` structural interface and the `API_VIDEO_PKG` constant; injects the concrete `VideoService` from `./video/video.service` via `@Inject(forwardRef(() => VideoService))`.
- `libs/api-courses/src/lib/publish/publish.service.ts` — same pattern: structural interface and runtime-string constant gone; concrete `VideoService` imported from `../video/video.service`.
- `libs/api-courses/src/lib/video/video.module.ts` — `forwardRef(() => require(API_COURSES_PKG).CoursesModule)` becomes `import { CoursesModule } from '../courses.module'` + `forwardRef(() => CoursesModule)`.
- `libs/api-courses/src/lib/video/video.controller.ts` (and its spec) — the `@learnwren/api-courses` cross-package import (with its `eslint-disable @nx/enforce-module-boundaries` suppression) becomes four relative imports from `../course-owner.guard`, `../courses.repository`, and `../errors/courses.exception`. Suppression line removed.

`forwardRef()` itself is retained: the runtime `CoursesModule ↔ VideoModule` cycle still exists, but the *symbols* are now resolved by webpack from a static graph instead of from a runtime string, so the bundle is complete.

### Public surface and external consumer

- `libs/api-courses/src/index.ts` extended with the former `api-video` index: re-exports `VideoModule`, `VideoService`, and the `VIDEO_CONFIG` / `VideoConfig` / `readVideoConfigFromEnv` triple from `./lib/video/video.config`.
- `apps/api/src/app/app.module.ts` collapses two imports into one: `import { CoursesModule, VideoModule } from '@learnwren/api-courses'`. The `@Module.imports` array still lists both modules.

### Workspace configuration

- `tsconfig.base.json` — `@learnwren/api-video` path alias removed; `@learnwren/web-video` (a different lib) untouched.
- `tsconfig.json` (root) and `apps/api/tsconfig.app.json` — `./libs/api-video` project reference removed from both.
- `libs/api-courses/tsconfig.lib.json` — the `nx.sync.ignoredDependencies: ["api-video"]` block dropped; existing `references` already cover the needed cross-lib deps.
- `package.json` — `mutate:api-video` script removed; `api-video` dropped from the `mutate` chain and from the `crap:coverage` `--projects` list.
- `tools/crap/crap.mjs` — `coverage/libs/api-video` entry removed.
- `stryker.api-video.config.mjs` — deleted.

`libs/api-courses/project.json` keeps `tags: ["scope:api"]` and no `implicitDependencies` — sibling pattern preserved; targets remain plugin-inferred.

### Build-quality follow-ups committed alongside the refactor

These surfaced because the api now boots far enough to exercise code paths that had been masked by the pre-existing `MODULE_NOT_FOUND` blocker:

- `d5b3d5f` — finishes the earlier `cfe251c` sibling-alignment by removing the leftover `web-video` publishable-library artifacts (`package.json`, `ng-package.json`, `tsconfig.lib.prod.json`, the `@nx/dependency-checks` ESLint block) that broke `web-video:lint`; regenerates `pnpm-lock.yaml` (single root importer, clears the pre-existing `hls.js` specifier desync).
- `0352315` — two pre-existing `VideoModule` DI faults the prior boot-blocker had always masked: `@Optional()` decorator added to `VideoService`'s test-seam `deps` constructor parameter; `FakeTranscoderController` registered as a provider so Nest can inject it into the dev-only `FakeTranscoderController` (Nest does not expose controllers through DI).
- `058cddc` — `@HttpCode(200)` on the five publish-gate / video upload-complete POST routes that return updated documents (publish/unpublish/archive/restore in `courses.controller.ts`; `upload-complete` in `video.controller.ts`). Slice D design §2 stated 200, and `api-e2e` asserted 200, but neither had ever run.
- `0b44342` — strips two stale comments and a rotted `// NEW (slice D)` annotation that referenced the now-deleted runtime-string seam.

## Plan deviations worth knowing about

- **The merge commit bundled four follow-up fixes** (`d5b3d5f`, `0352315`, `058cddc`, `0b44342`) on top of the single atomic refactor commit (`8bbc4e7`) that the plan called for. Plan Tasks 1–6 produced exactly one commit; Task 7 ("Run the e2e suites") then exposed the four pre-existing issues above, which were fixed in-branch before the `--no-ff` merge to `main` (`701c218`). The plan anticipated only the unrelated `auth.e2e-spec.ts` flake as a permissible follow-up; the three real fixes (`d5b3d5f`, `0352315`, `058cddc`) were genuine pre-existing defects whose discovery was the *point* of getting the api to boot, not regressions from the refactor.
- **The `crap:coverage` `--projects` list was rewritten without splitting the `mutate` chain into two edits.** Plan Task 5 Step 5 showed two separate find/replace ops; the shipped diff handled both in a single coherent edit. No behavioural difference.

## Verification outcome

- **Build / typecheck / test / lint**: `nx run-many -t build typecheck test lint --skip-nx-cache` green across all 11 projects (`api-video` gone; remaining: `api`, `api-auth`, `api-courses`, `api-e2e`, `api-firebase`, `shared-data-models`, `web`, `web-auth`, `web-courses`, `web-e2e`, `web-video`).
- **API-boot module-resolution check**: `node dist/apps/api/main.js` starts cleanly — no `MODULE_NOT_FOUND`, no `webpackEmptyContext`. `/api/health` responds; "Nest application successfully started" is logged.
- **`nx graph` / `nx show projects`**: no `api-video` line; no circular-dependency warning.
- **Stragglers**: `grep -rn "join('/')" libs apps` returns zero matches; `grep -rn "@learnwren/api-video"` against `libs`, `apps`, `package.json`, `tsconfig.base.json`, `tsconfig.json` returns zero matches.
- **`api-e2e`**: 64 of 79 specs pass; the remaining 15 are the pre-existing video-pipeline e2e gaps already quarantined as `test.fixme` (no real GCP source-storage seam yet — see the standing `api-e2e video quarantine` memory).
- **`web-e2e`**: runs against the booted api.

## Follow-ups not in scope

Per spec §"Non-Goals":

- **Collapsing `VideoModule` into `CoursesModule`.** Out of scope; only the library boundary was removed. The two NestJS modules stay distinct so DI grouping, controller grouping, and exception-filter registration are unchanged.
- **Merging the web-side libraries.** `libs/web-courses` and `libs/web-video` have no circular dependency; only the `api-*` pair was merged.
- **Re-homing the video mutation surface.** `stryker.api-video.config.mjs` was deleted; `stryker.api-courses.config.mjs` was not widened to cover the merged `video/` subtree in this slice. Re-pointing Stryker at `src/lib/video/**` is a separate follow-up.
- **Fixing the `api-e2e` auth flake.** `auth.e2e-spec.ts` ("register → session → me → logout") intermittently fails on a Firestore-emulator propagation race in the registration path; pre-existing and tracked separately.
- **Renaming the merged library** to a new merged-domain name (`api-content`, `api-catalog`) was considered and rejected — `api-courses` minimises alias churn.

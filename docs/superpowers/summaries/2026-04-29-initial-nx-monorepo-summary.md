# Initial Nx Monorepo — Implementation Summary

**Date:** 2026-04-29
**Spec:** `docs/superpowers/specs/2026-04-29-initial-nx-monorepo-design.md`
**Plan:** `docs/superpowers/plans/2026-04-29-initial-nx-monorepo.md`

Foundational slice: stands up the Nx 22 workspace itself. After `pnpm install`, a fresh clone satisfies `lint`, `typecheck`, `test`, `build`, `start`, and `e2e` against two scaffolded apps (`apps/web` Angular SPA, `apps/api` NestJS) and one types-only library (`libs/shared-data-models`) consumed by both via TypeScript path mapping. No Firebase wiring, no domain endpoints beyond `/api/health`.

## What shipped

### Workspace

- `package.json` pins `packageManager: pnpm@10.33.2` and `engines.node: ">=22 <23"`. `.nvmrc` carries `22`; `.npmrc` carries `node-linker=hoisted` (pre-empts the Firebase Functions flat-`node_modules` constraint).
- `pnpm-workspace.yaml` declares `apps/*` and `libs/*`.
- `tsconfig.base.json` runs `strict: true` and `noUncheckedIndexedAccess: true`, with the `@learnwren/shared-data-models` path mapped to `libs/shared-data-models/src/index.ts`.
- Nx plugins registered: `@nx/angular`, `@nx/nest`, `@nx/js`, `@nx/vite`, `@nx/playwright`.
- Root scripts: `start`, `start:web`, `start:api`, `build`, `test`, `lint`, `e2e`, `typecheck`, `affected`.

### Angular (`apps/web`)

- Standalone Angular 21 SPA generated with `--style=scss --routing=true --standalone=true --ssr=false --bundler=esbuild --unitTestRunner=vitest --e2eTestRunner=playwright --strict=true`.
- Tailwind wired via `@nx/angular:setup-tailwind`; root `tailwind.config.js` plus per-app PostCSS plumbing.
- Placeholder hero in `app.component.html` renders "Learn Wren" with `data-testid="hero"` and `text-3xl` (used to verify Tailwind applies in unit + Playwright tests).
- Default `NxWelcome` boilerplate component removed (`9b9c189`).

### NestJS (`apps/api`)

- Generated with `--unitTestRunner=vitest --e2eTestRunner=playwright --strict=true --linter=eslint`. Listens on `3333` under global prefix `/api`.
- `app.controller.ts` exposes `GET /api/health` returning `{ status: 'ok', version, serverTime }`. `version` reads `process.env['npm_package_version']`; `serverTime` is an `ISODateString` imported from `@learnwren/shared-data-models` — exercises the path mapping on every build and typecheck.
- Default generated `AppService` was deleted; module registers `AppController` only.

### Library (`libs/shared-data-models`)

- Generated with `--bundler=none --unitTestRunner=vitest --linter=eslint --importPath=@learnwren/shared-data-models --strict=true`.
- `lib/common.ts` defines `ISODateString` and the branded `EntityId<TBrand>` plus `UserId`, `CourseId`, `ModuleId`, `LessonId`, `EnrollmentId`.
- Five entity files (`user.ts`, `course.ts`, `module.ts`, `lesson.ts`, `enrollment.ts`) carry the interfaces specified in §4 of the design (IDs branded, timestamps as ISO strings, enums as string-literal unions). All re-exported from `src/index.ts`.
- `apps/web/src/app/app.component.ts` imports `type { Course }` as `readonly featuredCourses: readonly Course[] = []` to keep the path map live across web builds.

### Tests

- `libs/shared-data-models/src/lib/shared-data-models.spec.ts` — single Vitest spec round-trips a `User` value through `JSON.stringify` / `JSON.parse`.
- `apps/web/src/app/app.component.spec.ts` asserts the hero element renders with text "Learn Wren" and the `text-3xl` Tailwind class.
- `apps/api/src/app/app.controller.spec.ts` asserts `getHealth()` returns `status: 'ok'`, a non-empty version string, and a parseable `serverTime`.
- `apps/web-e2e/src/home.spec.ts` — Playwright loads `/` and asserts `getByTestId('hero')` shows "Learn Wren".
- `apps/api-e2e/src/health.spec.ts` — Playwright hits `/api/health` and asserts the JSON shape.

### CI

- `.github/workflows/ci.yml` runs `nx affected -t lint test build typecheck` on PR and push to `main`, using `pnpm/action-setup@v4`, `actions/setup-node@v4` with Node 22 + pnpm cache, and `nrwl/nx-set-shas@v4` to derive the affected base. Playwright E2E is intentionally not in CI for this slice (added by a later spec — the workflow shown today has been augmented with `api-e2e` and `web-e2e` emulator-backed jobs by subsequent slices).

### Documentation

- `docs/development.md` lists prerequisites, the script table, port assignments (web `4200`, api `3333`), and a forward-pointer noting Firebase is deliberately unwired.

## Plan deviations worth knowing about

- **`noUncheckedIndexedAccess` forced bracket-form env access.** `process.env.npm_package_version` (per the plan) fails the stricter index signature; the shipped code uses `process.env['npm_package_version'] ?? '0.0.0'`. Same change applied wherever the plan referenced `process.env.X`.
- **Project references required `composite: true` across the board** (commit `9bc0f06`). The plan's tsconfig shape compiled standalone but tsc `--build` could not walk the project-references graph cross-project until `composite: true` was added to `apps/api/tsconfig.app.json`, the lib tsconfigs, and the web/api e2e specs.
- **Root `tsconfig.json` references reverted to the nx-sync-blessed shape** (commit `b533e61`). Adding `api`, `api-e2e`, and `web` to the root references graph let `tsc --build` exit 0 from the root, but `nx sync` flagged it out-of-sync and auto-reverted on the next `run-many`. The supported path is through Nx, not root `tsc --build`.
- **`api-e2e` shipped with Playwright only.** The Nest generator created Jest scaffolding alongside; commit `5479d7b` removed the leftover `jest.config.cts` and `src/support/` files after the Playwright config replaced them.
- **The root `e2e` script is sequential, not `run-many`** (commit `87e6cbf`). Under Nx 22.7.1 + `@nx/playwright/plugin`, `nx run-many -t e2e` terminates as soon as `web-e2e` finishes because its inferred `dependsOn web:serve` is treated as continuous, silently skipping `api-e2e`. Script is `nx run web-e2e:e2e && nx run api-e2e:e2e`.
- **`affected` script also runs `typecheck`** (commit `3148e04`). The spec/plan listed `lint test build`; CI was already running `typecheck` and the local script was aligned to match.
- **`shared-data-models` dropped a generator-emitted `module: commonjs`** (commit `9acda31`). The generator's default blocked typecheck for the types-only library; removing the override let the base config's `ES2022` module shape apply uniformly.

## Verification outcome

- Definition of Done from spec §6 was walked end to end at slice landing: clean `pnpm install --frozen-lockfile`, then `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, parallel `pnpm start` with curl checks against both `localhost:4200` and `localhost:3333/api/health`, and `pnpm e2e` (both Playwright suites).
- CI workflow was validated by running `nx affected -t lint test build typecheck --base=HEAD~1` locally before commit.
- No quarantined or `fixme`'d tests landed in this slice.
- All operations are local; the slice has no production / live-Firebase surface.

## Follow-ups not in scope

Per spec §"Non-Goals", each item below was deferred to its own design pass:

- Firebase configuration (`firebase.json`, `.firebaserc`, Cloud Functions deploy target, Hosting rewrites, emulator suite) — picked up by the 2026-04-30 firebase-wiring spec.
- Firestore security rules and collection design.
- Firebase Authentication, login flows, route guards — picked up by the 2026-05-04 auth spec.
- Domain endpoints beyond `GET /api/health`.
- DTO / validation schemas (Zod, class-validator).
- Tailwind theme tokens, design system, component library.
- Git hooks (Husky, lint-staged, commitlint).
- Dependency automation (Renovate, Dependabot).
- E2E execution in CI — added by later slices (the current `ci.yml` carries emulator-backed `api-e2e` and `web-e2e` jobs that did not exist at this slice's landing).

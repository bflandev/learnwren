# Initial Nx Monorepo Design Spec

**Status:** Approved (2026-04-29)
**Scope:** First piece of implementation work for Learn Wren — establish the workspace, two scaffolded apps, and one shared types library. Nothing else.

## Goal

Stand up the Nx workspace and minimum-viable apps that every later spec will build on, while deliberately deferring everything that needs its own design pass (Firebase wiring, auth, Firestore schema, CI E2E, design system).

A fresh clone, after `pnpm install`, must satisfy `lint`, `typecheck`, `test`, `build`, `start`, and `e2e` (definitions in §6). That is the contract this spec delivers.

## Non-Goals

The following are explicitly out of scope and will each have their own spec:

- Firebase configuration (`firebase.json`, `.firebaserc`, Cloud Functions deploy target, Hosting rewrites, emulator suite)
- Firestore security rules and collection design
- Firebase Authentication, login flows, route guards
- Any domain endpoints beyond a `/api/health` smoke endpoint
- DTO / validation schemas (Zod, class-validator)
- Tailwind theme tokens, component library, design system
- Git hooks (Husky, lint-staged, commitlint)
- Dependency automation (Renovate, Dependabot)
- E2E execution in CI

## Decisions Made During Brainstorming

| Decision | Choice | Rationale |
| :--- | :--- | :--- |
| Setup scope | Workspace + 2 apps + 1 shared lib | Establishes the front/back type boundary without coupling to Firebase prematurely. |
| Package manager | pnpm | Faster monorepo installs, smaller disk footprint, well-supported with Firebase Functions via `node-linker=hoisted` if needed. |
| Unit test runner | Vitest | Nx's current default for new generators; faster than Jest; works with both Angular and NestJS. |
| E2E framework | Playwright | Nx's current default; multi-browser; better debugging; will pay off for the DRM player work later. |
| Angular styling | SCSS + Tailwind CSS | Utility-first speeds up content-heavy UI iteration; SCSS remains as an escape hatch. |
| Shared lib organization | Flat single lib (`libs/shared-data-models`) | Avoids speculative structure; promote to `libs/shared/*` only when a second shared lib has a real reason to exist. |

## 1. Workspace Layout

```
learnwren/
├── apps/
│   ├── web/                        Angular SPA
│   ├── web-e2e/                    Playwright E2E for web
│   ├── api/                        NestJS app
│   └── api-e2e/                    Playwright E2E for api
├── libs/
│   └── shared-data-models/         TypeScript interfaces shared by web and api
├── docs/                           (existing) specs, use cases, and epics
├── nx.json
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── tsconfig.base.json              path map: "@learnwren/shared-data-models" → libs/shared-data-models/src/index.ts
├── .nvmrc                          Node 22 (current LTS)
├── .editorconfig
├── .prettierrc
├── eslint.config.mjs               flat config (Nx 19+ default)
└── tailwind.config.js              root-level config used by apps/web
```

### Tooling Defaults

- **Node:** 22 (current LTS), pinned via `.nvmrc` and `engines.node` in root `package.json`.
- **Package manager:** pnpm. `packageManager` field in `package.json` pins the version. `pnpm-workspace.yaml` declares `apps/*` and `libs/*`.
- **TypeScript:** `strict: true` and `noUncheckedIndexedAccess: true` in `tsconfig.base.json`. All projects extend it.
- **Lint:** ESLint flat config (`eslint.config.mjs`), Nx's recommended preset.
- **Format:** Prettier with the Nx default config. No special rules.
- **npm scope:** `@learnwren/*` for all internal libraries.

## 2. `apps/web` — Angular SPA

Generated via:

```
nx g @nx/angular:application web \
  --style=scss \
  --routing=true \
  --standalone=true \
  --ssr=false \
  --bundler=esbuild \
  --unitTestRunner=vitest \
  --e2eTestRunner=playwright \
  --strict=true
```

Tailwind is wired afterwards via the official Nx generator:

```
nx g @nx/angular:setup-tailwind --project=web
```

This creates `apps/web/tailwind.config.js` (extending the root config), updates `apps/web/src/styles.scss` with Tailwind's base/components/utilities, and adds the necessary PostCSS plumbing.

### Initial source layout

```
apps/web/src/
├── app/
│   ├── app.component.ts            root component, mounts <router-outlet>
│   ├── app.config.ts               standalone bootstrap config (provideRouter, provideHttpClient)
│   └── app.routes.ts               minimal route table — one placeholder route at "/"
├── styles.scss                     Tailwind directives + a few base styles
├── index.html
└── main.ts                         bootstrapApplication(AppComponent, appConfig)
```

The placeholder route renders a minimal "Learn Wren" hero so `nx serve web` lands on something visible. No real content; later specs replace it.

**Ports:** dev server on `4200` (Angular default).

## 3. `apps/api` — NestJS

Generated via:

```
nx g @nx/nest:application api \
  --unitTestRunner=vitest \
  --e2eTestRunner=playwright \
  --strict=true
```

### Initial source layout

```
apps/api/src/
├── app/
│   ├── app.module.ts               AppModule, registers AppController only
│   ├── app.controller.ts           GET /api/health → { status: 'ok', version }
│   └── app.controller.spec.ts
└── main.ts                         NestFactory bootstrap, listens on 3333, sets global prefix '/api'
```

The `/api/health` endpoint exists purely to:
1. Verify the app builds and runs.
2. Give `apps/api-e2e` a real route to hit.

`version` in the response reads from `process.env.npm_package_version` so it surfaces the root `package.json` version.

**No** auth, **no** Firestore wiring, **no** domain modules. Those land in later specs. NestJS runs as a plain Node server (`node dist/apps/api/main.js`) — converting it to a Cloud Functions deploy target is the next spec, not this one.

**Ports:** API dev server on `3333`.

## 4. `libs/shared-data-models`

Generated via:

```
nx g @nx/js:library shared-data-models \
  --directory=libs/shared-data-models \
  --bundler=none \
  --unitTestRunner=vitest \
  --importPath=@learnwren/shared-data-models \
  --strict=true
```

`--bundler=none` is correct: the lib only exports types and is consumed via TypeScript path mapping at build time. It produces no runtime bundle.

### Contents

```
libs/shared-data-models/src/
├── index.ts                        re-exports everything from ./lib/*
└── lib/
    ├── common.ts                   ISODateString, EntityId<TBrand>, branded ID aliases
    ├── user.ts                     User, UserRole
    ├── course.ts                   Course, CourseStatus
    ├── module.ts                   Module
    ├── lesson.ts                   Lesson
    └── enrollment.ts               Enrollment, LessonProgress
```

### Translation rules from `docs/epics/TECHNICAL_ARCHITECTURE.md`

The architecture doc lists fields in relational notation (`UUID`, `Foreign Key`, `JSONB`). Firestore is the actual store, so this lib applies two consistent translations:

1. **IDs as branded strings.** `EntityId<'User'>` is a `string` branded with a phantom tag, so `UserId` and `CourseId` are not assignable to each other. This catches whole categories of bugs at compile time without changing the runtime representation.

2. **Timestamps as ISO 8601 strings on the wire.** `createdAt: ISODateString` and `updatedAt: ISODateString` are plain strings. Firestore `Timestamp` objects get converted at the API boundary so these interfaces are usable from both Angular and NestJS without dragging `firebase-admin` types into the client bundle. The conversion layer ships with the Firebase-wiring spec, not this one.

3. **Enums as string-literal unions.** `UserRole = 'STUDENT' | 'INSTRUCTOR' | 'ADMIN'`, etc. Better tree-shaking, serializes as plain JSON, no runtime enum object.

### Field-by-field shape

```ts
// common.ts
export type ISODateString = string & { readonly __brand: 'ISODateString' };
export type EntityId<TBrand extends string> = string & { readonly __brand: TBrand };

export type UserId = EntityId<'User'>;
export type CourseId = EntityId<'Course'>;
export type ModuleId = EntityId<'Module'>;
export type LessonId = EntityId<'Lesson'>;
export type EnrollmentId = EntityId<'Enrollment'>;

// user.ts
export type UserRole = 'STUDENT' | 'INSTRUCTOR' | 'ADMIN';
export interface User {
  id: UserId;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
// (password_hash from the architecture doc is intentionally absent — auth is delegated to
// Firebase Authentication and password material never lives in Firestore documents.)

// course.ts
export type CourseStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export interface Course {
  id: CourseId;
  title: string;
  description: string;
  instructorId: UserId;
  status: CourseStatus;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// module.ts
export interface Module {
  id: ModuleId;
  courseId: CourseId;
  title: string;
  order: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// lesson.ts
export interface Lesson {
  id: LessonId;
  moduleId: ModuleId;
  title: string;
  videoUrl: string;        // HLS/DASH manifest URL; nullable handling deferred to authoring spec
  order: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// enrollment.ts
export interface LessonProgress {
  lessonId: LessonId;
  completedAt: ISODateString | null;
  lastWatchedSeconds: number;
}
export interface Enrollment {
  id: EnrollmentId;
  userId: UserId;
  courseId: CourseId;
  progress: LessonProgress[];
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
```

### Tests

A single Vitest spec (`shared-data-models.spec.ts`) asserts:
- `index.ts` re-exports compile cleanly (the test importing them is itself the assertion).
- A sample `User` value round-trips through `JSON.stringify` / `JSON.parse` without loss.

This is a smoke test for the type-only contract, not domain logic.

### Out of scope for this lib

- Zod / class-validator schemas
- Firestore converters / data mappers
- Helper functions, factories, validators
- DTO request/response shapes (those couple to specific endpoints)

## 5. Wiring

- `tsconfig.base.json` `compilerOptions.paths` includes:
  ```
  "@learnwren/shared-data-models": ["libs/shared-data-models/src/index.ts"]
  ```
- `apps/web` imports as `import { Course } from '@learnwren/shared-data-models';`
- `apps/api` imports the same.
- Both apps gain the import in at least one file (the placeholder route component for web; `app.controller.ts` for api) so the path mapping is exercised by `build` and `typecheck`.

## 6. Definition of Done

A fresh clone followed by `pnpm install` must allow all of the following to pass:

| Command | What it must do |
| :--- | :--- |
| `pnpm lint` | ESLint passes on `web`, `web-e2e`, `api`, `api-e2e`, `shared-data-models`. |
| `pnpm typecheck` | `tsc --noEmit` (run via `nx run-many -t typecheck`) passes everywhere. |
| `pnpm test` | Vitest passes — at minimum the shared-data-models smoke test plus the default Nx-generated specs for `web` and `api`. |
| `pnpm build` | `nx run-many -t build` produces output for `web` and `api` under `dist/`. |
| `pnpm start` | `nx serve web` and `nx serve api` come up in parallel; web on 4200, api on 3333; `GET http://localhost:3333/api/health` returns `{ status: 'ok', version: '...' }`. |
| `pnpm e2e` | Playwright passes for `web-e2e` (loads `/` and asserts the placeholder text is visible) and `api-e2e` (hits `/api/health` and asserts the JSON shape). |

### Root `package.json` scripts

```json
{
  "scripts": {
    "start:web": "nx serve web",
    "start:api": "nx serve api",
    "start": "nx run-many -t serve -p web,api --parallel",
    "build": "nx run-many -t build",
    "test": "nx run-many -t test",
    "lint": "nx run-many -t lint",
    "e2e": "nx run-many -t e2e",
    "typecheck": "nx run-many -t typecheck",
    "affected": "nx affected -t lint test build"
  }
}
```

## 7. CI

A minimal `.github/workflows/ci.yml` runs on pull requests:

```yaml
- pnpm/action-setup
- actions/setup-node@v4 with node 22 and pnpm cache
- pnpm install --frozen-lockfile
- pnpm exec nx affected -t lint test build typecheck --base=origin/main --head=HEAD
```

E2E is intentionally **not** in CI yet — running Playwright in GitHub Actions deserves its own setup decision (browser cache, headed/headless, retry policy, artifact upload) that's outside this spec's scope.

## 8. Developer Documentation

A single new file, `docs/development.md`, captures:

- Required Node and pnpm versions, and how to install via Volta or `nvm` + Corepack.
- The script table from §6.
- Port assignments: web `4200`, api `3333`.
- A note that Firebase is intentionally not wired yet, with a forward reference to the next spec.

## 9. Implementation Notes for the Plan

When the implementation plan is written, it will need to sequence the Nx generators carefully. Expected order:

1. `pnpm dlx create-nx-workspace@latest learnwren --preset=ts --packageManager=pnpm` (or equivalent in-place init, since the repo already exists with files we want to keep).
2. Add `@nx/angular`, `@nx/nest`, `@nx/js`, `@nx/playwright`, `@nx/vite` plugins.
3. Generate `apps/web` and `apps/api`.
4. Generate `libs/shared-data-models`.
5. Run `setup-tailwind` against `web`.
6. Hand-write the entity files in `libs/shared-data-models`.
7. Add the `/api/health` controller to `api` and replace the default test with a real assertion.
8. Wire imports of `@learnwren/shared-data-models` into both apps.
9. Add root scripts and `docs/development.md`.
10. Add the CI workflow.
11. Run the full Definition-of-Done checklist locally.

The plan must handle the fact that this repo already contains `docs/` (with epics, use cases, and design specs), `README.md`, `CLAUDE.md`, and `.github/CODEOWNERS` — Nx initialization must not clobber or move them. If `create-nx-workspace` insists on an empty directory, fall back to running `nx init` in place.

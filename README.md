# Learn Wren: Open-Source Educational Video Platform

Learn Wren is a self-hosted, open-source educational platform as a platform for creators. It enables any registered user to create and publish video-based courses organised into modules and lessons. Courses are consumed by enrolled students who can stream protected video content and download supplementary lesson materials. The platform is designed for small communities — such as a group of friends, a company, or a non-profit — and can be deployed on commodity hardware or a cloud server. All video content is protected by industry-standard Digital Rights Management (DRM) to prevent unauthorised redistribution.

> [!NOTE]
> **PROJECT STATUS: EARLY DEVELOPMENT**
> The monorepo, both apps' "hello world" slices, the Firebase Emulator Suite, and the real-project switch (`LEARNWREN_FIREBASE_TARGET=production`) are wired up. Authentication, per-collection rules, and the video/DRM pipeline are not yet wired — those are tracked in upcoming design specs under `docs/superpowers/specs/`.

---

## Monorepo Layout

This is an [Nx](https://nx.dev) workspace using pnpm. It contains an Angular SPA, a NestJS API, their Playwright E2E suites, and a shared TypeScript library.

```
learnwren/
├── apps/
│   ├── web/            # Angular SPA — renders the placeholder hero at /
│   ├── web-e2e/        # Playwright E2E tests for web
│   ├── api/            # NestJS API — exposes GET /api/health
│   └── api-e2e/        # Playwright E2E tests for api
├── libs/
│   ├── shared-data-models/  # TS types shared between web and api
│   └── api-firebase/        # NestJS module wrapping firebase-admin (env-driven)
├── tools/
│   └── web/                 # Build-time generator for apps/web/src/environments/environment.ts
└── docs/
    ├── epics/          # Product specs (epics & user stories)
    ├── use-cases/      # Cockburn-style use cases for MVP scope (EP-01..06)
    ├── superpowers/    # Design specs, plans, and post-implementation summaries
    ├── development.md  # Local development reference
    └── secrets.md      # 1Password vault contract and workflow
```

| Project | Type | Stack |
| :--- | :--- | :--- |
| `web` | Application | Angular 21, AngularFire 21, Tailwind, SCSS |
| `api` | Application | NestJS 11, firebase-admin, Webpack |
| `shared-data-models` | Library | TypeScript types (consumed by `web` and `api`) |
| `api-firebase` | Library | NestJS module providing the firebase-admin handle (emulator/production mode-switching) |
| `web-e2e`, `api-e2e` | E2E suite | Playwright |

The planned production deployment targets are Firebase Hosting (web) and Firebase Cloud Functions (api), backed by Firestore, Cloud Storage, and Firebase Authentication. See [`docs/epics/TECHNICAL_ARCHITECTURE.md`](./docs/epics/TECHNICAL_ARCHITECTURE.md).

---

## Getting Started

### Prerequisites

- **Node.js 22** (LTS) — pinned in `.nvmrc`. Install with `nvm install 22 && nvm use 22` or Volta.
- **pnpm** — activate via Corepack: `corepack enable && corepack prepare pnpm@latest --activate`.
- **Java 21+** — required by the Firebase Emulator Suite. macOS: `brew install --cask temurin` (or `brew install openjdk@21`).
- **1Password CLI ≥ 2.x** — used by the secrets pipeline. macOS: `brew install --cask 1password-cli`, then `op signin` to an account with access to the `learnwren` vault. See [`docs/secrets.md`](./docs/secrets.md).

### Install

```bash
pnpm install
```

### Run (default: emulator mode)

Boot the Firebase Emulator Suite in one terminal:

```bash
pnpm emulators
```

Run both apps in parallel (Angular on `:4200`, NestJS on `:3333`) in another:

```bash
pnpm start
```

Or run them individually:

```bash
pnpm start:web   # Angular SPA on http://localhost:4200
pnpm start:api   # NestJS API on http://localhost:3333/api
```

Verify the wiring end-to-end:

```bash
curl http://localhost:3333/api/health
curl http://localhost:3333/api/firestore-smoke
```

The web app's **Dev tools → Run Firestore smoke** button exercises the same write path through the client SDK against the emulator. No real Firebase credentials are needed for local development — both apps target the reserved `demo-learnwren` project ID against the local emulator suite.

### Run against the real Firebase project

`apps/web` and `apps/api` read `LEARNWREN_FIREBASE_TARGET` at startup; setting it to `production` flips both apps to the real `learn-wren` project. This requires the one-time prerequisites in [`docs/development.md`](./docs/development.md#real-project-mode) (1Password vault populated, service-account JSON path exported, etc.).

```bash
LEARNWREN_FIREBASE_TARGET=production pnpm secrets:run -- pnpm start
```

A single `[learnwren] Firebase target = production` warning logs at boot in each app. Hot-reloading the env var is not supported — restart the process.

### Scripts

All scripts run from the repo root and delegate to Nx.

| Command | Description |
| :--- | :--- |
| `pnpm start` | Serve `web` and `api` in parallel. |
| `pnpm start:web` | Serve the Angular SPA only. |
| `pnpm start:api` | Serve the NestJS API only. |
| `pnpm emulators` | Start the Firebase Emulator Suite (Auth, Firestore, Storage, UI). |
| `pnpm build` | Build all buildable projects to `dist/`. |
| `pnpm test` | Run all Vitest unit tests. |
| `pnpm lint` | Run ESLint across all projects. |
| `pnpm typecheck` | Type-check all projects. |
| `pnpm e2e` | Run the Playwright E2E suites (sequential). |
| `pnpm affected` | Run lint + test + build + typecheck only for projects affected by the current branch. |
| `pnpm secrets:render` | Render `.env` from `.env.tpl` via 1Password. |
| `pnpm secrets:run -- <cmd>` | Run a command with secrets injected in-memory (no `.env` written). |

To target a single project, invoke Nx directly — e.g. `pnpm nx test web`, `pnpm nx build api`, `pnpm nx lint shared-data-models`.

For more detail on local development and ports, see [`docs/development.md`](./docs/development.md).

---

## Product Specifications

The product requirements are defined using the original Agile methodology, broken down into Epics and User Stories with detailed Acceptance Criteria. EP-01 through EP-06 form the MVP scope; EP-07 through EP-09 are post-MVP.

| Spec ID | Title | Description |
| :--- | :--- | :--- |
| `00` | [Product Vision](./docs/epics/00-vision-and-epics.md) | High-level vision, actors, and epic overview. |
| `01` | [User Identity and Access](./docs/epics/01-user-identity-and-access.md) | Registration, login, profiles, and role-based access control. |
| `02` | [Course Authoring](./docs/epics/02-course-authoring.md) | Creating, structuring, and publishing courses with modules and lessons. |
| `03` | [Video Management and DRM](./docs/epics/03-video-management-and-drm.md) | Uploading, transcoding, storing, and securely delivering video content. |
| `04` | [Lesson Materials](./docs/epics/04-lesson-materials.md) | Attaching, managing, and downloading supplementary course materials. |
| `05` | [Course Discovery and Enrollment](./docs/epics/05-course-discovery-and-enrollment.md) | Browsing, searching, and enrolling in courses. |
| `06` | [Learning Experience](./docs/epics/06-learning-experience.md) | Consuming course content, tracking progress, and resuming sessions. |
| `07` | [Instructor Dashboard](./docs/epics/07-instructor-dashboard.md) | Managing courses, viewing enrolled students, and monitoring engagement. |
| `08` | [Platform Administration](./docs/epics/08-platform-administration.md) | User management, content moderation, and system configuration. |
| `09` | [Non-Functional Requirements](./docs/epics/09-non-functional-requirements.md) | Performance, security, accessibility, and open-source compliance. |

Detailed Cockburn-style use cases for the MVP epics live in [`docs/use-cases/`](./docs/use-cases/).

---

## Technical Architecture

A detailed breakdown of the recommended technical architecture, including the technology stack, data models, and system diagrams, can be found in the [**Technical Architecture**](./docs/epics/TECHNICAL_ARCHITECTURE.md) document.

---

## Contributing

This project is in its early stages. Contributions are welcome. Please start by reviewing the product specifications and technical architecture. If you have suggestions or would like to contribute to the development, please open an issue to start a discussion.

# Development

This document captures the local development setup for Learn Wren. For product specifications, see `docs/epics/`. For design specs, see `docs/superpowers/specs/`. For secrets management, see `docs/secrets.md`.

## Prerequisites

- Node.js 22 (LTS). Pinned in `.nvmrc`. Install via `nvm install 22 && nvm use 22` or Volta.
- pnpm. Activated via Corepack: `corepack enable && corepack prepare pnpm@latest --activate`.
- Java 21 (`openjdk@21`). Required by the Firebase Emulator Suite. On macOS: `brew install openjdk@21` and ensure it's on `PATH` (e.g., `export PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"`).
- 1Password CLI ≥ 2.x for secrets (`brew install --cask 1password-cli` on macOS, then `op signin`). See `docs/secrets.md`.

## Install

```bash
pnpm install
```

## Scripts

All scripts run from the repo root.

| Command | Description |
| :--- | :--- |
| `pnpm start` | Run `web` (port 4200) and `api` (port 3333) in parallel. |
| `pnpm start:web` | Run only the Angular SPA. |
| `pnpm start:api` | Run only the NestJS API. |
| `pnpm emulators` | Start the Firebase Emulator Suite (Auth, Firestore, Storage, UI). |
| `pnpm build` | Build all buildable projects to `dist/`. |
| `pnpm test` | Run all unit tests (Vitest). |
| `pnpm lint` | Run ESLint across all projects. |
| `pnpm e2e` | Run all Playwright E2E suites. |
| `pnpm typecheck` | Run `tsc --noEmit` for all projects. |
| `pnpm affected` | Run lint + test + build + typecheck only for projects affected by the current branch's changes. |
| `pnpm secrets:render` | Render `.env` from `.env.tpl` via 1Password (`op inject`). |
| `pnpm secrets:run` | Run a command with secrets injected in-memory (`op run`). |

## Ports

| Service | Port |
| :--- | :--- |
| Angular dev server (`web`) | 4200 |
| NestJS API (`api`) | 3333 |
| Firebase Auth emulator | 9099 |
| Firestore emulator | 8080 |
| Firebase Storage emulator | 9199 |
| Firebase Emulator UI | 4000 |

## Emulators

Run `pnpm emulators` in one terminal and `pnpm start` in another. Both apps connect to the emulators on boot under the reserved `demo-learnwren` project ID — no real Firebase credentials are needed for local development.

The Emulator UI dashboard is at `http://127.0.0.1:4000`. Use it to inspect Firestore data, manage Auth users, and browse Storage buckets while the apps are running.

The wiring is hardcoded against emulators in this slice. Environment-driven config (real-project IDs, production toggle) arrives with the auth spec.

## Secrets

Secrets live in the 1Password vault `learnwren`. The committed `.env.tpl` references `op://...` paths; `.env` is gitignored and rendered locally via `pnpm secrets:render`. See `docs/secrets.md` for the vault contract and how to add new secrets.

## Known constraints

- `@angular/fire` is currently pinned at `21.0.0-rc.0` because no stable Angular 21–compatible release exists yet. Bump to `@angular/fire@^21.x` (with a non-RC version) when GA ships.

## What is and is not wired up

Current state: the monorepo exists, both apps run, and Firebase emulators are wired in.

- The Angular app renders a placeholder hero at `/` plus a dev-only "Dev tools" disclosure with a Firestore smoke widget.
- The NestJS app exposes `GET /api/health` and `GET /api/firestore-smoke`.
- Both apps import types from `@learnwren/shared-data-models`.
- `apps/api` consumes `@learnwren/api-firebase` for the firebase-admin handle.
- Firestore and Storage rules are deny-by-default; only `_smoke/{docId}` is readable/writable.

**Auth flows, per-collection rules, and DTO/validation are not yet wired.** Those are the subjects of the next two specs.

# Firebase Wiring and Secrets — Implementation Summary

**Date:** 2026-04-29
**Spec:** `docs/superpowers/specs/2026-04-29-firebase-wiring-and-secrets-design.md`
**Plan:** `docs/superpowers/plans/2026-04-29-firebase-wiring-and-secrets.md`

Wires the Firebase Emulator Suite (Auth/Firestore/Storage/UI) into the existing Nx monorepo against the reserved `demo-learnwren` project ID, gives both apps a verified read/write path through emulated Firestore, and stands up a 1Password `op inject` secrets pipeline exercised end to end by a single canary entry (`op://learnwren/Workspace/name = learnwren-dev`). Emulator-only — production-mode switching arrives in the next slice (`2026-04-30-firebase-project-connection`). This is the first of three specs that together unblock UC-01.

## What shipped

### Workspace config

- `firebase.json` (new) declares Auth (9099), Firestore (8080), Storage (9199), Emulator UI (4000), and `singleProjectMode: true`. No `hosting` / `functions` blocks.
- `.firebaserc` (new) — single `default` alias mapped to `demo-learnwren`.
- `firestore.rules` (new) — deny-by-default plus a single `_smoke/{docId}` allow rule for the wire test.
- `storage.rules` (new) — deny-by-default; no per-path rules.
- `firestore.indexes.json` (new) — empty `{ "indexes": [], "fieldOverrides": [] }` placeholder.
- Root `package.json` adds `firebase`, `firebase-admin`, `@angular/fire` (deps), `firebase-tools` (devDep), and three new scripts: `emulators`, `secrets:render`, `secrets:run`.
- `.gitignore` appends `.env` (the rendered secrets file).

### NestJS (`libs/api-firebase`)

- Scaffolded via `nx g @nx/js:library api-firebase --bundler=none --unitTestRunner=vitest --importPath=@learnwren/api-firebase --strict=true`.
- `firebase.tokens.ts` — `Symbol.for(...)` injection tokens `FIRESTORE`, `FIREBASE_AUTH`, `FIREBASE_STORAGE` plus the `FirestoreHandle` / `FirebaseAuthHandle` / `FirebaseStorageHandle` / `FirebaseAppHandle` type aliases.
- `firebase-admin.module.ts` — `FirebaseAdminModule.forRoot()` returning a global `DynamicModule`. Applies emulator-host env-var defaults (`127.0.0.1:9099/8080/9199`) only when unset, idempotently calls `admin.initializeApp({ projectId: 'demo-learnwren' })` guarded by `admin.apps[0]`, and exposes the three handles via `useFactory` providers. `TODO(auth-spec)` comment marks the gating site.
- `firebase-admin.module.spec.ts` — 3 vitest specs: token resolution + env-var defaulting; non-overwrite of pre-set host env vars; single-init invariant across multiple `forRoot()` imports.
- `tsconfig.json` / `tsconfig.lib.json` carry `composite: true` and `moduleResolution: node` (paired with `module: commonjs`); the root `tsconfig.json` references the new lib.

### NestJS (`apps/api`)

- `app.module.ts` imports `FirebaseAdminModule.forRoot()` and registers the new controller.
- `firestore-smoke/firestore-smoke.controller.ts` — `GET /api/firestore-smoke` injects `FIRESTORE`, writes `{ writtenAt: <ISO> }` to `_smoke/${Date.now()}`, reads it back, and returns `{ docId, written, readBack }`. Deliberately separate from `/api/health` (cheap, IO-free liveness probe).
- `firestore-smoke.controller.spec.ts` — vitest unit spec with a path-blind fake `Firestore` that verifies the round-trip envelope shape; the doc-path correctness is intentionally delegated to the manual emulator round-trip.

### Angular (`apps/web`)

- `app.config.ts` adds `provideFirebaseApp(() => initializeApp({ projectId: 'demo-learnwren' }))` plus `provideAuth` / `provideFirestore` / `provideStorage` factories that each call their corresponding `connectXxxEmulator(...)`. Connections are unconditional in this slice; a `TODO(auth-spec)` marks the gating site.
- `dev/firestore-smoke.component.ts` (new) — standalone component, gated by `isDevMode()`. Renders a `<details>Dev tools</details>` disclosure containing a "Run Firestore smoke" button that does `setDoc`/`getDoc` against `_smoke/{ts}` via AngularFire and shows the round-tripped JSON.
- `dev/firestore-smoke.component.spec.ts` — render-only vitest spec (provides `Firestore: {}` stub) asserting the disclosure summary text and button presence. A top-of-file comment documents that the `run()` shapes are verified by manual emulator round-trip, not unit assertion.
- `app.ts` / `app.html` — mount `<app-firestore-smoke />` below the hero; the existing hero container becomes `flex flex-col` so the widget stacks beneath rather than overlapping.

### Documentation

- `docs/secrets.md` (new) — overview, prereqs (`op` ≥ 2.x + vault membership), daily workflow (`pnpm secrets:render`, `pnpm secrets:run -- <cmd>`), vault contract table (`Workspace.name`), concrete `op://learnwren/Workspace/name` example, "Adding a secret" procedure, and troubleshooting.
- `docs/development.md` — new Emulators section (ports table, run commands, real-project deferral note), Secrets section (pointer to `docs/secrets.md`), Known constraints section (the `@angular/fire@21.0.0-rc.0` pin), and updated "What is and is not wired up" copy.
- `.env.tpl` (new, committed) — references `op://learnwren/Workspace/name` for the `WORKSPACE_NAME` canary, with reserved-for-later-specs comments.

## Plan deviations worth knowing about

- **`@angular/fire` pinned at `21.0.0-rc.0`.** No stable Angular 21–compatible release existed at the time. Documented under "Known constraints" in `docs/development.md`. Bump to a non-RC `^21.x` once GA ships.
- **`secrets:run` script omits the trailing `--`** (`op run --env-file=.env.tpl`, not `op run --env-file=.env.tpl --`). The plan's trailing `--` would have produced `op run -- -- <cmd>` after pnpm forwarded user args, breaking `op run`. The spec was retroactively corrected in commit `f57a782`.
- **`libs/api-firebase` tsconfig drift fixed in three follow-up commits** (`9c74b34`, `f4c4d3d`, `2014782`): the `@nx/js:library` generator omitted `composite: true` on both tsconfig files (required by the project-references graph), required `moduleResolution: node` to pair with `module: commonjs` (TS5095 otherwise), and didn't stage the root `tsconfig.json` project-reference entry on the original scaffold commit.
- **Smoke controller `snap.data()` cast narrowed inside the `snap.exists` branch.** The originally-shipped `as SmokeDoc | undefined` misrepresented the firestore-admin runtime contract; code review tightened to `as SmokeDoc` inside the truthy branch (`b386fcf`).
- **A `Java 21` prerequisite was surfaced in README during the slice.** The Firebase Emulator Suite requires a JDK; the spec / plan did not call it out. README now lists `temurin` / `openjdk@21` as a prereq.
- **No `environment.ts` gate yet.** The spec called for `!environment.production`; the web smoke widget uses `isDevMode()` instead because environment files were deferred by the prior monorepo spec. The auth spec is expected to introduce them; the gate stays marked with `TODO(auth-spec)`.

## Verification outcome

- Unit tests green: 3 specs in `libs/api-firebase` (`firebase-admin.module.spec.ts`), 1 new spec in `apps/api` (`firestore-smoke.controller.spec.ts`), 1 new spec in `apps/web` (`firestore-smoke.component.spec.ts`), plus the prior `shared-data-models`, `api`, and `web` suites.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm e2e` (web hero + `/api/health`) all green and unchanged for existing projects.
- Manual emulator walkthrough (Task 13 DoD):
  - `pnpm emulators` boots all four services on declared ports; UI loads at `http://127.0.0.1:4000`.
  - `curl /api/health` returns the unchanged `{status, version, serverTime}` envelope.
  - `curl /api/firestore-smoke` returns `{docId, written, readBack}` with matching timestamps; the doc is visible in the Emulator UI Firestore tab.
  - Browser at `:4200` — hero renders; "Dev tools" disclosure expands; the button round-trips a doc through AngularFire and renders the JSON; the same doc shows up in the UI.
- Secrets pipeline: `pnpm secrets:render` writes `.env` with `WORKSPACE_NAME=learnwren-dev`; `git status` confirms `.env` is ignored; `pnpm secrets:run -- node -e "console.log(process.env.WORKSPACE_NAME)"` prints `learnwren-dev`.

## Follow-ups not in scope

Per spec §Non-Goals, all of the following are owned by later specs:

- Real Firebase project provisioning, `firebase deploy`, deploy tokens, CI deploy. (Production-mode switching lands in `2026-04-30-firebase-project-connection`; first-ever rules deploy lands with the auth spec.)
- Cloud Functions packaging of `apps/api` (deferred again; re-confirmed here).
- Auth flows: UC-01-01 (register), UC-01-02 (login + lockout), UC-01-03 (profile), UC-01-04 (instructor role request).
- Per-collection Firestore rules (`users`, `courses`, `modules`, `lessons`, `enrollments`, `instructorApplications`) and the helper functions `isAuthenticated` / `isOwner` / `isAdmin` / `hasRole` — these encode role-model decisions and belong with the auth spec.
- Storage rules for video uploads or lesson materials.
- DTO/validation framework choice (Zod vs class-validator), NestJS `ValidationPipe`, error envelope.
- App Check, Analytics, Performance Monitoring, Remote Config.
- Emulator-backed integration tests in CI (Playwright wrapped with `firebase emulators:exec`) — deferred until the auth spec has something meaningful to integration-test.
- Pre-staging unused 1Password entries (`FIREBASE_TOKEN`, `FIREBASE_SERVICE_ACCOUNT_JSON_PATH`); each lands in the spec that first uses it.

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

By default, both apps point at the emulators. To target the real Firebase project instead, see **Real-project mode** below.

## Real-project mode

`apps/web` and `apps/api` read `LEARNWREN_FIREBASE_TARGET` at startup. When the variable is unset, empty, or any value other than `production`, the apps target the local emulators (the default — no real credentials required). Setting `LEARNWREN_FIREBASE_TARGET=production` switches both apps to the real Firebase project.

### Prerequisites (one-time)

Before the real-project mode works at all, the following must be true in the Firebase console for the project named in `.firebaserc`'s `production` alias:

- The project is on the **Blaze** plan.
- **Authentication** has Email/Password enabled.
- **Firestore** is created in **Native mode**.
- **Cloud Storage** has a default bucket.
- A **Web app** is registered via `firebase --project <id> apps:create WEB "Learn Wren Web"`; the SDK config is captured via `firebase --project <id> apps:sdkconfig WEB <appId>`.
- A **service account JSON** is downloaded from the Firebase console (Project Settings → Service accounts → Generate new private key) and saved to a path outside the repo. See `docs/secrets.md` § Service-account JSON for local-against-prod runs.
- The **`learnwren` 1Password vault** has `Web SDK Config` and `Admin SDK Config` items populated. See `docs/secrets.md` for the field list.

### Run

Run the api against the real project:

```bash
LEARNWREN_FIREBASE_TARGET=production \
  pnpm secrets:run -- pnpm start:api
```

Run the web app against the real project:

```bash
LEARNWREN_FIREBASE_TARGET=production \
  pnpm secrets:run -- pnpm start:web
```

Run both:

```bash
LEARNWREN_FIREBASE_TARGET=production \
  pnpm secrets:run -- pnpm start
```

A single `[learnwren] Firebase target = production` warning logs at boot in each app. Hot-reloading the env var is not supported — restart the process.

### Verify

- `apps/api`: hit `GET http://localhost:3333/api/firestore-smoke`. The handler writes a doc to the real Firestore `_smoke` collection. After verification, **delete the resulting document from the Firebase console** so the live project doesn't accumulate smoke garbage.
- `apps/web`: open `http://localhost:4200`, expand **Dev tools**, click **Run Firestore smoke**. Browser DevTools → Network shows traffic to `firestore.googleapis.com` (not `127.0.0.1:8080`).

### Switching back

Open a fresh terminal (or `unset LEARNWREN_FIREBASE_TARGET`) and restart the apps. They return to emulator mode.

## Secrets

Secrets live in the 1Password vault `learnwren`. The committed `.env.tpl` references `op://...` paths; `.env` is gitignored and rendered locally via `pnpm secrets:render`. See `docs/secrets.md` for the vault contract and how to add new secrets.

## Known constraints

- `@angular/fire` is currently pinned at `21.0.0-rc.0` because no stable Angular 21–compatible release exists yet. Bump to `@angular/fire@^21.x` (with a non-RC version) when GA ships.

## Auth dev workflow

The auth slice (UC-01-01 register + UC-01-02 login) is wired end to end. The plumbing lives in `libs/api-auth` (NestJS) and `libs/web-auth` (Angular) per `docs/superpowers/specs/2026-05-04-auth-registration-and-login-design.md`.

### API endpoints

All under prefix `/api/auth`:

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `POST` | `/auth/register` | `{email, password, displayName}` → `201 {uid, email, emailVerificationSent}`. Validates policy server-side, creates Auth user + Firestore `users/{uid}` doc + `role: 'STUDENT'` claim, sends verification email. |
| `POST` | `/auth/session` | `{idToken}` → `200 {uid, role}` plus `Set-Cookie: __session=...`. Verifies the ID token then mints a 5-day session cookie. |
| `POST` | `/auth/logout` | Clears `__session` and revokes refresh tokens. Always `204`. Idempotent. |
| `GET` | `/auth/me` | Reads the cookie, looks up `users/{uid}`, returns the merged shape `{uid, email, displayName, role, emailVerified}`. Guarded by `FirebaseSessionGuard`. |

Errors are wrapped in `{ error: { code, message, details? } }`. Codes: `INVALID_EMAIL`, `WEAK_PASSWORD`, `INVALID_DISPLAY_NAME`, `EMAIL_ALREADY_EXISTS`, `INVALID_ID_TOKEN`, `RECENT_SIGN_IN_REQUIRED`, `UNAUTHENTICATED`, `INTERNAL`.

### Web routes

| Path | Component | Notes |
| :--- | :--- | :--- |
| `/login` | `LoginPageComponent` | Lazy-loaded from `@learnwren/web-auth`. |
| `/register` | `RegisterPageComponent` | Lazy-loaded; client-side `passwordPolicyValidator` mirrors the server rules. |
| `/dashboard` | `DashboardComponent` | Protected by `authGuard`. Stub greeting + sign-out button. |

### Cookie

The session cookie is named `__session` (HttpOnly, Secure, SameSite=Strict, Path=/, Max-Age=432000). The name is fixed because Firebase Hosting only forwards the `__session` cookie to a Cloud Function — choosing it now means the future Hosting-rewrite spec doesn't have to rename anything.

### Local proxy

The Angular dev server proxies `/api/**` to `http://127.0.0.1:3333` (the local NestJS server) via `apps/web/proxy.conf.json`. This keeps cookies first-party in dev and removes any need for CORS middleware.

### Manual smoke

With `pnpm emulators` and `pnpm start` running:

1. Visit `http://localhost:4200/register`.
2. Fill in display name, email, and password (e.g. `Aa1!aaaaaaaa`). Submit.
3. Expect redirect to `/dashboard` with the welcome message.
4. Auth emulator UI (`http://localhost:4000/auth`) shows the new user.
5. Firestore emulator UI shows the `users/{uid}` document with `role: 'STUDENT'`.
6. Click "Sign out" → redirect to `/login`. Sign in again with the same credentials → back to `/dashboard`.

### What's deferred

Email-verification gating, brute-force lockout, profile editing, instructor-role request, admin promotion, account deletion, password reset, social auth, App Check, and public-profile reads are explicitly out of scope for this slice. See the spec's "Non-Goals" and "Follow-ups Explicitly Not in Scope" sections.

## What is and is not wired up

Current state: the monorepo exists, both apps run, Firebase emulators are wired in, and the auth slice (register + login + session cookie + protected route) is functional.

- The Angular app renders a placeholder hero at `/` plus a dev-only "Dev tools" disclosure with a Firestore smoke widget.
- The NestJS app exposes `GET /api/health`, `GET /api/firestore-smoke`, and the four `/api/auth/**` endpoints.
- Both apps import types from `@learnwren/shared-data-models`.
- `apps/api` consumes `@learnwren/api-firebase` and `@learnwren/api-auth`.
- `apps/web` consumes `@learnwren/web-auth` for the auth service, guard, interceptor, and pages.
- Firestore rules carry the four helpers (`isAuthenticated`, `isOwner`, `hasRole`, `isAdmin`) and the `/users/{userId}` rule.

**Profile editing, instructor-role requests, and admin tooling are not yet wired.** Those are the subjects of follow-up specs.

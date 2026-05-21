# Development

Local development reference for Learn Wren. For the feature set and the HTTP API
surface, see [`../README.md`](../README.md) and [`USER_GUIDE.md`](./USER_GUIDE.md).
For product specs see [`epics/`](./epics/), for design specs
[`superpowers/specs/`](./superpowers/specs/), and for the secrets contract
[`secrets.md`](./secrets.md).

## Prerequisites

- **Node.js 22** (LTS). Pinned in `.nvmrc`. Install via `nvm install 22 && nvm use 22` or Volta.
- **pnpm.** Activated via Corepack: `corepack enable && corepack prepare pnpm@latest --activate`.
- **Java 21.** Required by the Firebase Emulator Suite. macOS: `brew install --cask temurin` (ensure it is on `PATH`).
- **1Password CLI ≥ 2.x** for secrets (`brew install --cask 1password-cli`, then `op signin`). See `secrets.md`.

## Install

```bash
pnpm install
```

## Environment

The NestJS api reads its **video configuration from environment variables at
boot** — `nx serve api` / `pnpm start` exits immediately with
`LEARNWREN_VIDEO_SOURCE_BUCKET env var is required` if they are absent. Supply
them one of two ways before running the app:

- **With 1Password access** — render `.env` from `.env.tpl`, then start normally
  (Nx loads `.env` for `serve`/`test`):

  ```bash
  pnpm secrets:render
  pnpm start
  ```

  Or inject without writing a file: `pnpm secrets:run -- pnpm start`.

- **Credential-free emulator dev** — the transcoder and playback storage have
  in-memory fakes, so no GCP project or buckets are needed. Put the non-secret
  fake-mode values in `.env`:

  ```bash
  LEARNWREN_VIDEO_SOURCE_BUCKET=learnwren-dev-source
  LEARNWREN_VIDEO_OUTPUT_BUCKET=learnwren-dev-output
  LEARNWREN_VIDEO_TRANSCODER=fake
  LEARNWREN_VIDEO_STORAGE_PLAYBACK_FAKE=true
  LEARNWREN_EMAIL_TRANSPORT=console
  ```

`.env` is gitignored. `LEARNWREN_VIDEO_TRANSCODER=fake` and
`LEARNWREN_VIDEO_STORAGE_PLAYBACK_FAKE=true` are rejected when `NODE_ENV=production`.

## Run (emulator mode)

Boot the Firebase Emulator Suite in one terminal:

```bash
pnpm emulators
```

Run both apps in another — Angular on `:4200`, NestJS on `:3333`:

```bash
pnpm start
```

Both apps target the reserved `demo-learnwren` project against the local
emulators — no real Firebase credentials are needed. Verify the wiring:

```bash
curl http://localhost:3333/api/health
curl http://localhost:3333/api/firestore-smoke
```

The Emulator UI is at `http://127.0.0.1:4000` — inspect Firestore data, manage
Auth users, and browse Storage buckets while the apps run.

## Scripts

All scripts run from the repo root and delegate to Nx.

| Command | Description |
| :--- | :--- |
| `pnpm start` | Serve `web` (4200) and `api` (3333) in parallel. |
| `pnpm start:web` / `pnpm start:api` | Serve a single app. |
| `pnpm emulators` | Start the Firebase Emulator Suite (Auth, Firestore, Storage, UI). |
| `pnpm build` | Build all buildable projects to `dist/`. |
| `pnpm test` | Run all unit tests (Vitest). |
| `pnpm lint` / `pnpm typecheck` | Lint / type-check all projects. |
| `pnpm e2e` | Run the Playwright suites (`web-e2e`, then `api-e2e`). |
| `pnpm affected` | Lint + test + build + typecheck for projects affected by the branch. |
| `pnpm crap` / `pnpm mutate` | Regenerate the CRAP-score and mutation reports (see `docs/quality/`). |
| `pnpm tools:promote-to-instructor <email>` | Promote a verified user to the `INSTRUCTOR` role. |
| `pnpm secrets:render` | Render `.env` from `.env.tpl` via 1Password (`op inject`). |
| `pnpm secrets:run -- <cmd>` | Run `<cmd>` with secrets injected in-memory (`op run`). |

To target a single project, invoke Nx directly — e.g. `pnpm nx test api-auth`,
`pnpm nx build api`, `pnpm nx lint shared-data-models`.

## Ports

| Service | Port |
| :--- | :--- |
| Angular dev server (`web`) | 4200 |
| NestJS API (`api`) | 3333 |
| Firebase Auth emulator | 9099 |
| Firestore emulator | 8080 |
| Firebase Storage emulator | 9199 |
| Firebase Emulator UI | 4000 |

## Running the e2e suites

`api-e2e` is a Playwright suite that runs against the Firebase emulators.
Playwright starts the api itself — its `webServer` config in
`apps/api-e2e/playwright.config.ts` supplies the fake-mode video env — so you
only need the emulators running:

```bash
# emulators in one terminal:
pnpm emulators
# then, in another:
pnpm nx e2e api-e2e

# or one-shot (boots the emulators, runs the suite, tears them down):
pnpm exec firebase emulators:exec --project demo-learnwren 'pnpm nx e2e api-e2e'
```

15 video upload/playback/publish tests are marked `test.fixme`: they exercise
the real Cloud Storage upload / `ffprobe` path, which needs GCP credentials.
The remaining 64 run credential-free. CI runs this suite on every push and PR
(`.github/workflows/ci.yml`, the `e2e` job — which uses the one-shot form above).

## Real-project mode

`apps/web` and `apps/api` read `LEARNWREN_FIREBASE_TARGET` at startup. When the
variable is unset, empty, or anything other than `production`, the apps target
the local emulators (the default). Setting `LEARNWREN_FIREBASE_TARGET=production`
switches both apps to the real Firebase project.

### Prerequisites (one-time)

For the project named in `.firebaserc`'s `production` alias:

- The project is on the **Blaze** plan.
- **Authentication** has Email/Password enabled.
- **Firestore** is created in **Native mode**.
- **Cloud Storage** has a default bucket.
- A **Web app** is registered (`firebase --project <id> apps:create WEB "Learn Wren Web"`); the SDK config is captured via `firebase --project <id> apps:sdkconfig WEB <appId>`.
- A **service-account JSON** is downloaded and saved outside the repo (see `secrets.md` § Service-account JSON).
- The **`learnwren` 1Password vault** has `Web SDK Config` and `Admin SDK Config` populated, plus the `dev` items the video config references.

### Run

```bash
LEARNWREN_FIREBASE_TARGET=production pnpm secrets:run -- pnpm start
```

A single `[learnwren] Firebase target = production` warning logs at boot in each
app. Hot-reloading the variable is not supported — restart the process.

### Switching back

Open a fresh terminal (or `unset LEARNWREN_FIREBASE_TARGET`) and restart the apps.

## Secrets

Secrets live in the 1Password vault `learnwren`. The committed `.env.tpl`
references `op://...` paths; `.env` is gitignored and rendered locally via
`pnpm secrets:render`. See `secrets.md` for the vault contract and how to add
new secrets.

## Known constraints

- `@angular/fire` is pinned at `21.0.0-rc.0` because no stable Angular 21–compatible release exists yet. Bump to a non-RC `@angular/fire@^21.x` when GA ships.

## Auth dev workflow

The auth surface lives in `libs/api-auth` (NestJS) and `libs/web-auth` (Angular).
For the full endpoint and route list see [`USER_GUIDE.md`](./USER_GUIDE.md); the
dev-specific notes:

### Session cookie

The session cookie is named `__session` (HttpOnly, Secure, SameSite=Strict,
Path=/, Max-Age 5 days). The name is fixed because Firebase Hosting only forwards
the `__session` cookie to a Cloud Function — choosing it now means a future
Hosting-rewrite spec needs no rename.

### Local proxy

The Angular dev server proxies `/api/**` to `http://127.0.0.1:3333`
(`apps/web/proxy.conf.json`). This keeps cookies first-party in dev and removes
any need for CORS middleware.

### Exercising the lockout flow

With the emulators and both apps running:

1. Register a user at `http://localhost:4200/register`, then verify the email by
   clicking the link in the Auth emulator UI (`http://127.0.0.1:4000/auth`).
2. On `/login`, enter the right email with a wrong password three times — the
   third attempt returns `423`.
3. `ConsoleEmailTransport` prints the unlock URL to the api server logs; open it
   to land on `/auth/unlock`.

To send the unlock email over SMTP instead of the console, set
`LEARNWREN_EMAIL_TRANSPORT=smtp` and the `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER`
/ `SMTP_PASS` variables.

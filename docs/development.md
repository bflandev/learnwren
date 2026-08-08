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

In emulator mode (the default — `NODE_ENV` unset) the api needs **no
configuration**: the video transcoder and playback storage default to their
in-memory fakes, so `pnpm start` runs credential-free against the local
emulators. A `.env` file is optional.

Environment variables are only needed to run against **real Firebase / GCP**
(`LEARNWREN_FIREBASE_TARGET=production` — see [Real-project mode](#real-project-mode)).
Those secrets live in 1Password: render them into `.env` with
`pnpm secrets:render` (Nx loads `.env` for `serve`/`test`), or inject them
in-memory with `pnpm secrets:run -- <cmd>`. See [`secrets.md`](./secrets.md).
`.env` is gitignored.

When `NODE_ENV=production` the api requires real `LEARNWREN_VIDEO_*` buckets and
a real transcoder — the `fake` transcoder and `fake` playback storage are
rejected.

Notable environment variables:

- `LEARNWREN_MATERIALS_BUCKET` — Cloud Storage bucket for lesson materials
  (EP-04). Outside production it defaults to `learnwren-dev-materials` and
  needs no provisioning. In emulator/dev mode the materials storage runs in
  `fake` mode: signed upload/download URLs are replaced by internal passthrough
  endpoints (`/api/internal/fake-materials/:matId`) so no GCP credentials are
  required.

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
```

The Emulator UI is at `http://127.0.0.1:4000` — inspect Firestore data, manage
Auth users, and browse Storage buckets while the apps run.

### Firestore rules: two files, two configs

There are two Firestore rules files and they must not be confused:

- `firestore.rules` — the **deploy-safe** rules. This is what `firebase.json`
  references, so it is what `firebase deploy --only firestore:rules` and
  `firebase emulators:exec` (default config) use. Deny-by-default; the API uses
  the Admin SDK and bypasses rules entirely.
- `firestore.emulator.rules` — identical to `firestore.rules` **except** it adds
  a world-writable `match /_smoke/{docId}` block, a dev-only wire smoke test for
  the Emulator UI. It is referenced **only** by `firebase.emulator.json`.

`pnpm emulators` runs `firebase emulators:start --config firebase.emulator.json`,
so the local UI flow keeps the `_smoke` escape hatch. The `_smoke` block must
never reach `firestore.rules` (it would be an unauthenticated public write
sink); a static guard in `apps/api-e2e/src/firestore-rules.e2e-spec.ts` fails the
build if it does, and that suite locks `firestore.rules` (the deploy file).

## Scripts

All scripts run from the repo root and delegate to Nx.

| Command | Description |
| :--- | :--- |
| `pnpm start` | Serve `web` (4200) and `api` (3333) in parallel. |
| `pnpm start:web` / `pnpm start:api` | Serve a single app. |
| `pnpm emulators` | Start the Firebase Emulator Suite (Auth, Firestore, Storage, UI) using `firebase.emulator.json`. |
| `pnpm build` | Build all buildable projects to `dist/`. |
| `pnpm test` | Run all unit tests (Vitest). |
| `pnpm lint` / `pnpm typecheck` | Lint / type-check all projects. |
| `pnpm e2e` | Run the Playwright suites (`web-e2e`, then `api-e2e`). |
| `pnpm exec nx run web-e2e:a11y` | Hermetic WCAG 2.1 AA sweep (axe-core + keyboard journeys, US-09-03). Needs neither the emulators nor the api. |
| `pnpm exec nx run web-e2e:responsive` | Hermetic 320/768/1280/2560px horizontal-overflow sweep + header collapse specs (US-09-05). Needs neither the emulators nor the api. |
| `pnpm affected` | Lint + test + build + typecheck for projects affected by the branch. |
| `pnpm crap` / `pnpm mutate` | Regenerate the CRAP-score and mutation reports (see `docs/quality/`). |
| `pnpm tools:promote-to-instructor <email>` | Promote a verified user to the `INSTRUCTOR` role (emulator by default — see below). |
| `pnpm secrets:render` | Render `.env` from `.env.tpl` via 1Password (`op inject`). |
| `pnpm secrets:run -- <cmd>` | Run `<cmd>` with secrets injected in-memory (`op run`). |

`tools:promote-to-instructor` targets the local emulators by default, so it
works with `pnpm emulators` running and needs no extra setup. To promote a user
in production instead, set `LEARNWREN_FIREBASE_TARGET=production` together with
`LEARNWREN_API_FIREBASE_PROJECT_ID` and `FIREBASE_SERVICE_ACCOUNT_JSON_PATH`.

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

`emulators:exec` uses the default config (`firebase.json` → `firestore.rules`),
not `firebase.emulator.json`. The rules spec also loads `firestore.rules`
directly via `readFileSync`, so the gate always validates the deploy-safe rules.

The whole `api-e2e` suite runs credential-free — the video upload / transcode /
playback path is exercised through the fake source-probe seam
(`LEARNWREN_VIDEO_STORAGE_SOURCE_PROBE_FAKE`) and the in-memory fake transcoder,
so no GCP credentials are needed. (The video / playback / publish tests were
previously `test.fixme`-quarantined; those were all restored in 2026-05 and no
`test.fixme` remain.) CI runs this suite on every push and PR
(`.github/workflows/ci.yml`, the `e2e` job — which uses the one-shot form above).

### Hermetic `web-e2e` gates: a11y and responsive

`web-e2e:a11y` and `web-e2e:responsive` are separate Playwright configs
(`playwright.a11y.config.ts`, `playwright.responsive.config.ts`) that start
only the Angular dev server and stub every `/api` call via `page.route`
against a shared route inventory (`apps/web-e2e/src/_helpers/route-inventory.ts`).
Neither needs the Firebase emulators or the `api` — run them directly:

```bash
pnpm exec nx run web-e2e:a11y
pnpm exec nx run web-e2e:responsive
```

Both run as their own CI jobs (`a11y`, `responsive` in `.github/workflows/ci.yml`)
in parallel with the emulator-backed jobs, not gating them.

## CI mutation gate

The `.github/workflows/ci.yml` `mutation` job enforces a minimum **adjusted
mutation score of 80** (the bar in `tools/mutation/state.json`) on every PR and
push to `main`.

### How it works

1. A `mutation-affected` job computes the list of affected libs by intersecting
   `pnpm exec nx show projects --affected --type lib` against the set of libs
   that have a `stryker.<lib>.config.mjs` at the repo root. Any lib with no
   Stryker config is silently skipped.
2. A `mutation` matrix job runs one Stryker process per affected lib, stores the
   result in `reports/mutation/<lib>/mutation.json`, then calls
   `node tools/mutation/check.mjs <lib>`. `check.mjs` exits 1 if the adjusted
   score is below the threshold, failing the job.
3. `fail-fast: false` means all affected libs are checked in the same run, even
   when one fails.

### The adjusted score as a coverage gate

NoCoverage mutants — lines no test reaches at all — count in the adjusted-score
denominator. A new function with zero test coverage contributes uncovered mutants
that drag the adjusted score down. Passing the 80-adjusted bar therefore implies
meaningful branch and line coverage, with no need for a separate coverage
threshold.

### Incremental cache

Each lib's Stryker incremental file (`reports/mutation/<lib>/incremental.json`)
is cached in GitHub Actions per lib per SHA. A cache miss (first run on a branch,
or a SHA rotation) triggers a full mutation run — correctness is never affected.
The incremental flag is a pure speed optimisation.

### Full sweep

To run mutation testing on all 15 libs at once (e.g. after a bulk refactor or
Stryker upgrade), trigger the workflow manually via the GitHub Actions UI and set
**Run mutation on ALL libs** to `true`. This overrides the affected-only scope.

### Running locally after a Stryker run

After `pnpm exec stryker run stryker.<lib>.config.mjs` finishes and writes
`reports/mutation/<lib>/mutation.json`, you can check the score with:

```bash
node tools/mutation/check.mjs <lib>
```

Pass multiple lib names to check several at once:

```bash
node tools/mutation/check.mjs api-auth api-courses web-catalog
```

Exit 0 means all named libs pass 80 adjusted. Exit 1 means at least one failed
(the output includes top surviving mutant file:line hints). Exit 2 means no args
were supplied.

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

# Firebase Project Connection Design Spec

**Status:** Draft (2026-04-30)
**Scope:** Take the emulators-only wiring from `2026-04-29-firebase-wiring-and-secrets-design.md` and connect it to a real Firebase project that the user has provisioned in the Firebase console. Make SDK configuration environment-driven so the same codebase can target either emulators (default) or the real project, without forking the bootstrap code. Land the manual console-side prerequisites in documentation so a fresh teammate can reproduce the setup.

This spec is the immediate sibling of the auth and DTO specs called out in the prior wiring spec — those describe what the apps *do* once Firebase is live; this spec describes how the apps *find* Firebase. It explicitly does **not** cover deploys.

## Goal

A fresh clone, after `pnpm install` and `pnpm secrets:render`, must satisfy:

- `pnpm emulators` continues to work unchanged. `pnpm start` continues to default to emulators with no extra environment configuration.
- Setting `LEARNWREN_FIREBASE_TARGET=production` (or equivalent flag — name decided in §3) in the local environment switches both `apps/web` and `apps/api` to talk to the real Firebase project on the next process restart, without code changes.
- `apps/web` reads its Firebase Web SDK config (apiKey, authDomain, projectId, appId, storageBucket, messagingSenderId) from build-time environment, sourced via 1Password.
- `apps/api` resolves Admin SDK credentials in two distinct modes: emulator (current behavior, `demo-learnwren` project ID, no real creds) and production (real project ID, Application Default Credentials when running on Firebase, or a service-account JSON path when running locally).
- `firestore.rules` is split into a permissive rules file used only by the emulator and a strict rules file safe to deploy to the real project. The `_smoke/{docId}` allow-rule must not exist in the production rules file.
- `.firebaserc` carries two aliases: `default` (emulator/`demo-learnwren`) and `production` (the real project ID). Selecting between them is explicit at the CLI (`firebase --project production ...`) and never inferred by tooling.
- `docs/secrets.md` documents the new Web SDK config items in the 1Password vault contract. `docs/development.md` gains a "Real-project mode" subsection.
- All prior-spec commands (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e`, `pnpm start`, `pnpm emulators`, `pnpm secrets:render`, `pnpm secrets:run`, `GET /api/health`, `GET /api/firestore-smoke` against emulators) still pass with no regression.

That is the contract this spec delivers.

## Non-Goals

These each have, or will have, their own spec:

- **Cloud Functions packaging of `apps/api`.** The NestJS app keeps running as a plain Node server. Wrapping it in `firebase-functions onRequest()` is a separate refactor with its own build-target changes; bundling it into this spec would balloon the plan.
- **Firebase Hosting configuration and deploys.** No `hosting` block in `firebase.json` here, no SPA rewrite rules, no `firebase deploy --only hosting`. Hosting lands with the spec that also wires the API as a Cloud Function, since the SPA's `/api/**` rewrite needs a function target.
- **`firebase deploy` from CI.** No GitHub Actions deploy job, no `FIREBASE_TOKEN` provisioning, no service-account key in CI secrets. CI continues to run only `lint test build typecheck` per the original monorepo spec.
- **Auth flows.** UC-01-01..04 and the per-collection rules + role helpers stay in the auth spec. The strict `firestore.rules` file in this spec stays deny-by-default — the role model is unchanged.
- **Per-collection or per-path Storage rules.** `storage.rules` stays deny-by-default. Upload paths and rules ship with the asset/upload spec.
- **App Check, Analytics, Performance Monitoring, Remote Config, Crashlytics.** None of these ride along.
- **Pre-staging unused secrets.** Items like `FIREBASE_TOKEN` (CI deploy) and `FIREBASE_SERVICE_ACCOUNT_JSON_PATH` (CI service account) stay reserved-but-not-added in `.env.tpl`. They land when the spec that uses them lands.
- **Custom domain on Hosting.** Deferred to the deploy spec.
- **Multi-environment beyond `default`/`production`.** No `staging` alias, no preview channels. Two environments are the minimum to validate the gating; more aliases land when there's a reason for them.

## Decisions Made During Brainstorming

| Decision | Choice | Rationale |
| :--- | :--- | :--- |
| Spec breadth | Project connection only; no Functions, no Hosting, no deploy | Each of those has its own constraints (build adapter, rewrite rules, CI plumbing). Bundling them produces a multi-plan spec; decomposition keeps the prior pattern. |
| Default mode | Emulators stay the default; real project is opt-in via env flag | Local dev should require zero credentials. Forgetting to flip a flag back should land you in the safe place, not in the live project. |
| Flag name | `LEARNWREN_FIREBASE_TARGET` with values `emulator` (default) and `production` | A named string is grep-able and self-documenting; a boolean (`USE_EMULATORS=false`) is ambiguous about what's actually being targeted. |
| Project alias naming | `default` = `demo-learnwren`; `production` = real project ID | Keeps the safe path as the unflagged path. `firebase --project production` is the explicit ceremony for touching real data. |
| Web SDK config delivery | Build-time injection into `apps/web` via Angular `fileReplacements`, sourced from 1Password | Web SDK keys are public-by-design but still environment-specific. `fileReplacements` is the idiomatic Angular path; 1Password keeps the values out of git. |
| Admin SDK credentials | ADC in production runtime; service-account JSON path for local-against-prod; no creds in emulator mode | ADC is what Cloud Functions and other Firebase compute give you for free. The JSON path covers the "I'm running `apps/api` locally but pointed at the real project" case explicitly. |
| Rules file split | Two files: `firestore.rules` (production-safe, deny-by-default) and `firestore.emulator.rules` (adds `_smoke/{docId}`) | A single file with a permissive rule is a deploy footgun. Splitting forces the emulator path to be opt-in via `firebase.json` rather than the default. |
| Emulator config pointer | `firebase.json` `firestore.rules` entry switches to `firestore.emulator.rules` | The emulator's local-permissive rules file is the one referenced by `firebase.json`; `firestore.rules` is referenced explicitly only by deploy commands once the deploy spec lands. |
| Documentation entry point | New "Real-project mode" subsection in `docs/development.md` and a vault-contract update in `docs/secrets.md` | Keeps the existing single-doc-per-concern layout; no new top-level docs. |
| Console-side prerequisites | Documented as a one-time bootstrap checklist in this spec, mirrored in `docs/development.md` | These steps don't live in code; documenting them in the spec keeps the manual work auditable. |

## 1. Manual Firebase Console Prerequisites

The user is expected to complete the following in the Firebase console before the implementation plan begins. The plan starts from the assumption that all of these are done and the values are recorded in 1Password.

1. **Blaze (pay-as-you-go) plan enabled** on the project. Required by the future Cloud Functions deploy spec; not strictly required to *connect* to Firestore/Auth/Storage from a local app, but enabling it now avoids a second console trip.
2. **Authentication** → enable Email/Password sign-in. Other providers (Google, etc.) are decided by the auth spec.
3. **Firestore Database** → create in **Native mode**, region recorded in `docs/secrets.md` Vault Contract notes. Initial rules left at default (this spec replaces them on first deploy from the deploy spec; until then they don't matter — the emulator is the rule oracle for local dev).
4. **Cloud Storage** → create the default bucket in the same region as Firestore.
5. **Web app registered.** Use the CLI rather than navigating the console UI (which Firebase reorganizes periodically):

   ```
   firebase --project <project-id> apps:create WEB "Learn Wren Web"
   firebase --project <project-id> apps:sdkconfig WEB <appId-from-previous-output>
   ```

   The `apps:sdkconfig` output yields the six fields (`apiKey`, `authDomain`, `projectId`, `appId`, `storageBucket`, `messagingSenderId`) that go into the 1Password vault per §6. `measurementId`, `projectNumber`, and `version` from the same output are not needed.
6. **Project ID** is the lowercase string in the project URL (also visible via `firebase projects:list`), distinct from the human display name.

The Admin SDK does **not** require a separate web-app registration — Cloud Functions runtime injects ADC for the project's default service account automatically. For local-against-prod runs of `apps/api`, the user generates a service-account JSON (the Firebase console exposes this under Project Settings → Service accounts at the time of writing; if the UI moves, the same key can be created via the GCP console for the same project), stores it outside the repo, and references its absolute path via `FIREBASE_SERVICE_ACCOUNT_JSON_PATH`. The path lives in the developer's shell init; the JSON itself stays on disk, never in 1Password and never in git.

These prerequisites are also captured as a checklist in `docs/development.md` so a new teammate doesn't need to read this spec.

## 2. `.firebaserc` — Two Aliases

```json
{
  "projects": {
    "default": "demo-learnwren",
    "production": "<real-project-id>"
  }
}
```

`default` continues to be the emulator alias so unflagged commands stay safe. `production` is the explicit alias for real-project operations. The real project ID value is filled in by the user during implementation, not committed under a placeholder — the implementation plan substitutes the real value before commit.

`firebase emulators:start` continues to use `default` (no flag needed). Future `firebase deploy --project production --only firestore:rules` (deploy spec) is the explicit ceremony for touching the live project.

## 3. Environment-Driven Mode Switch

A single env var, `LEARNWREN_FIREBASE_TARGET`, with two valid values:

| Value | Behavior |
| :--- | :--- |
| `emulator` (default — also the value when unset) | Both apps connect to local emulators with project ID `demo-learnwren`. No real Firebase credentials touched. Identical to current behavior. |
| `production` | Both apps connect to the real Firebase project. Web uses the real Web SDK config; api uses ADC or `FIREBASE_SERVICE_ACCOUNT_JSON_PATH`. Emulator hosts are not set. |

Any other value (including empty string) is treated as `emulator`. A warning logs once at boot when `LEARNWREN_FIREBASE_TARGET=production` is detected, so the developer is never surprised about which mode they're in.

The flag is read once at process start. Changing it requires a restart of `pnpm start:web` and/or `pnpm start:api`. No hot-reload of the mode.

`pnpm secrets:run -- pnpm start:api` continues to be the canonical way to launch the api with secrets injected. For production-mode local runs:

```
LEARNWREN_FIREBASE_TARGET=production pnpm secrets:run -- pnpm start:api
```

This composition is documented in `docs/development.md` §Real-project mode.

## 4. `apps/web` — Build-Time SDK Config

The Web SDK config is build-time, not runtime, because Angular emits a static bundle and the keys are public-by-design (they identify the project, they don't authorize anything beyond what Firestore rules permit).

### Source-of-truth files

```
apps/web/src/environments/
├── environment.ts                  emulator config; checked in; populated with demo-learnwren
└── environment.production.ts       prod config; checked in with placeholder values; real values injected at build
```

`environment.production.ts` ships with a `// THESE ARE INJECTED AT BUILD TIME` comment and placeholder strings so checking in the file doesn't leak anything. The Angular build replaces this file with a generated version when targeting `production`.

### Generated production environment

A small build script (`tools/web/build-environment.ts`) reads the following env vars (sourced via 1Password during `pnpm secrets:run -- pnpm build`) and writes `apps/web/src/environments/environment.production.ts`:

```
LEARNWREN_WEB_FIREBASE_API_KEY
LEARNWREN_WEB_FIREBASE_AUTH_DOMAIN
LEARNWREN_WEB_FIREBASE_PROJECT_ID
LEARNWREN_WEB_FIREBASE_APP_ID
LEARNWREN_WEB_FIREBASE_STORAGE_BUCKET
LEARNWREN_WEB_FIREBASE_MESSAGING_SENDER_ID
```

The script is invoked from a new Nx target on `web` (`generate-environment`) that runs as a `dependsOn` of `build` and `serve` when `LEARNWREN_FIREBASE_TARGET=production`. When the flag is unset or `emulator`, the target is a no-op and the checked-in `environment.ts` is used.

### `app.config.ts` refactor

Replace the hardcoded `FIREBASE_CONFIG` and unconditional `connectXEmulator` calls with a small helper `firebaseTargetMode()` that returns `'emulator' | 'production'`, and gate emulator connections behind it. The TODO comment that flags the gating site goes away — the comment was the gating site, this commit replaces it with the actual gate.

```ts
const target = firebaseTargetMode();      // reads LEARNWREN_FIREBASE_TARGET via environment.ts
const config = target === 'production' ? PROD_CONFIG : EMULATOR_CONFIG;

provideFirebaseApp(() => initializeApp(config)),
provideAuth(() => {
  const auth = getAuth();
  if (target === 'emulator') {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  }
  return auth;
}),
// ... same gate for Firestore and Storage
```

`PROD_CONFIG` and `EMULATOR_CONFIG` come from the `environment.ts` files. `firebaseTargetMode()` lives next to the providers in `app.config.ts` (single use site, no shared lib needed yet).

### Tests

`apps/web` gains one new vitest spec, `app.config.spec.ts` (or a co-located helper spec), that asserts:
- With the env target unset, `firebaseTargetMode()` returns `'emulator'`.
- With it set to `'production'`, returns `'production'`.
- With it set to a garbage value (`'banana'`), returns `'emulator'`.

Existing dev-smoke component spec is unchanged — it mocks `Firestore` and doesn't care about the bootstrap path.

## 5. `apps/api` — Admin SDK Mode Switch

`libs/api-firebase/src/lib/firebase-admin.module.ts` gets refactored to branch on the same `LEARNWREN_FIREBASE_TARGET` value.

### Branching logic

```ts
const target = process.env.LEARNWREN_FIREBASE_TARGET === 'production' ? 'production' : 'emulator';

if (target === 'emulator') {
  applyEmulatorEnvDefaults();                         // existing helper, unchanged
  return admin.initializeApp({ projectId: 'demo-learnwren' });
}

// production
const projectId = required('LEARNWREN_API_FIREBASE_PROJECT_ID');
const credentialPath = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_PATH;

if (credentialPath) {
  return admin.initializeApp({
    projectId,
    credential: admin.credential.cert(credentialPath),
  });
}

// no explicit credential → expect ADC (e.g., when running on Firebase compute)
return admin.initializeApp({ projectId });
```

`required()` is a tiny helper that throws a clear error message if the env var is unset in production mode (e.g., `LEARNWREN_FIREBASE_TARGET=production but LEARNWREN_API_FIREBASE_PROJECT_ID is unset; check .env or your shell environment`). Failing fast on misconfiguration is preferable to silently initializing against the wrong project.

### Env var reference

| Var | Required when | Source |
| :--- | :--- | :--- |
| `LEARNWREN_FIREBASE_TARGET` | always (defaults to `emulator`) | shell |
| `LEARNWREN_API_FIREBASE_PROJECT_ID` | `target=production` | 1Password (`.env.tpl`) |
| `FIREBASE_SERVICE_ACCOUNT_JSON_PATH` | `target=production` AND not running on Firebase compute | shell or `.env`; absolute path on disk |

`FIREBASE_AUTH_EMULATOR_HOST`, `FIRESTORE_EMULATOR_HOST`, `FIREBASE_STORAGE_EMULATOR_HOST` are only set in `emulator` mode. The check for "do not set in production" matters: leaving these set when targeting production silently routes Admin SDK calls into nowhere.

### Tests

`firebase-admin.module.spec.ts` gains two test cases:

1. With `LEARNWREN_FIREBASE_TARGET` unset, the existing emulator behavior is preserved — env vars are set, init uses `demo-learnwren`. (This is essentially the existing test, kept.)
2. With `LEARNWREN_FIREBASE_TARGET=production` and `LEARNWREN_API_FIREBASE_PROJECT_ID=test-prod-id` set, the module initializes against `test-prod-id`, does **not** set the emulator env vars, and resolves the three tokens. (No real network call — `firebase-admin` happily initializes without contacting the cloud at module-load time.)

A third case asserts the `required()` helper throws when `LEARNWREN_FIREBASE_TARGET=production` is set but `LEARNWREN_API_FIREBASE_PROJECT_ID` is missing.

## 6. Rules File Split

Two files at the repo root:

```
firestore.rules                 production-safe, deny-by-default, no _smoke escape hatch
firestore.emulator.rules        identical to current firestore.rules (includes _smoke)
```

`firebase.json` switches its `firestore.rules` pointer to `firestore.emulator.rules`:

```json
{
  "firestore": {
    "rules": "firestore.emulator.rules",
    "indexes": "firestore.indexes.json"
  },
  ...
}
```

The deploy spec, when it lands, will introduce a separate config (or a `--config` override) that points at `firestore.rules` for production. Until then, `firestore.rules` exists purely to be reviewed and to be the deploy artifact when deploy ships.

`storage.rules` stays as a single file (deny-by-default applies equally to emulator and production); no split needed.

### `firestore.rules` body (production)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Deny-by-default. Per-collection rules and the
    // isAuthenticated/isOwner/isAdmin/hasRole helpers are introduced
    // in the auth spec, not this one.
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

### `firestore.emulator.rules` body

Identical to today's `firestore.rules`, including the `_smoke/{docId}` block.

## 7. 1Password Vault and `.env.tpl` Additions

New items in the `learnwren` vault:

| Item | Field | Purpose | Required by |
|---|---|---|---|
| `Web SDK Config` | `apiKey` | Firebase Web SDK | `target=production` |
| `Web SDK Config` | `authDomain` | Firebase Web SDK | `target=production` |
| `Web SDK Config` | `projectId` | Firebase Web SDK | `target=production` |
| `Web SDK Config` | `appId` | Firebase Web SDK | `target=production` |
| `Web SDK Config` | `storageBucket` | Firebase Web SDK | `target=production` |
| `Web SDK Config` | `messagingSenderId` | Firebase Web SDK | `target=production` |
| `Admin SDK Config` | `projectId` | Admin SDK in production mode | `target=production` |
| `Admin SDK Config` | `firestoreRegion` | Documentation only — region recorded for future ops | reference |

`.env.tpl` gains a new section. Existing `WORKSPACE_NAME` canary stays.

```
# ── Web SDK config (target=production) ──────────────────────────────
LEARNWREN_WEB_FIREBASE_API_KEY=op://learnwren/Web SDK Config/apiKey
LEARNWREN_WEB_FIREBASE_AUTH_DOMAIN=op://learnwren/Web SDK Config/authDomain
LEARNWREN_WEB_FIREBASE_PROJECT_ID=op://learnwren/Web SDK Config/projectId
LEARNWREN_WEB_FIREBASE_APP_ID=op://learnwren/Web SDK Config/appId
LEARNWREN_WEB_FIREBASE_STORAGE_BUCKET=op://learnwren/Web SDK Config/storageBucket
LEARNWREN_WEB_FIREBASE_MESSAGING_SENDER_ID=op://learnwren/Web SDK Config/messagingSenderId

# ── Admin SDK config (target=production) ─────────────────────────────
LEARNWREN_API_FIREBASE_PROJECT_ID=op://learnwren/Admin SDK Config/projectId

# ── Reserved for later specs ──────────────────────────────────────────
# Cloud Functions deploy spec:  FIREBASE_TOKEN, FIREBASE_SERVICE_ACCOUNT_JSON_PATH (CI)
# DRM/transcoder spec:          DRM_API_KEY, TRANSCODER_WEBHOOK_SECRET
```

`FIREBASE_SERVICE_ACCOUNT_JSON_PATH` for **local-against-prod** is set in the developer's shell, not in `.env.tpl`, because its value is an absolute filesystem path that varies per machine. The path is documented in `docs/secrets.md`.

## 8. `docs/secrets.md` Updates

Append:

1. New rows to the Vault Contract table (the eight rows above).
2. **Region note.** A one-line callout in the table or below it: "Firestore + Storage region for `production` is `<region>` — recorded in `Admin SDK Config.firestoreRegion`."
3. **Service-account file convention.** A short subsection describing the pattern: generate the service-account JSON from the Firebase console, store it at `~/.learnwren/service-account.json` (or any path outside the repo), and export `FIREBASE_SERVICE_ACCOUNT_JSON_PATH=<absolute-path>` in your shell init. The file itself never enters 1Password and never enters git.

## 9. `docs/development.md` Updates

New subsection appended after **Emulators**, titled **Real-project mode**:

1. **When to use it.** Pointed at the real Firebase project rather than emulators — used to verify the wiring against live infrastructure during the project-connection slice. Default daily dev should stay on emulators.
2. **One-time setup checklist.** Mirrors §1 of this spec: Blaze, Auth providers, Firestore region, Storage bucket, Web app registration, service-account JSON for local-against-prod.
3. **How to run.** The composition `LEARNWREN_FIREBASE_TARGET=production pnpm secrets:run -- pnpm start` and equivalents for `start:web`, `start:api`.
4. **How to verify.** Hit `GET /api/firestore-smoke` against the api in production mode and confirm the round-trip writes a document to the real `_smoke` collection. Then **delete the resulting document from the Firestore console** so the live project doesn't accumulate smoke garbage. The smoke endpoint is fine to retain for now — the deploy spec will gate it behind a feature flag or remove it before any public deploy.
5. **Switching back.** Unset the env var (or open a fresh terminal) and restart.

## 10. Definition of Done

A fresh clone, after `pnpm install` and a one-time vault setup, must allow all of the following:

| Command (mode) | What it must do |
| :--- | :--- |
| `pnpm secrets:render` | Produces a `.env` containing `WORKSPACE_NAME=learnwren-dev`, the six Web SDK config values, and `LEARNWREN_API_FIREBASE_PROJECT_ID`. |
| `pnpm emulators` (default) | Starts the suite. `firebase.json`'s `firestore.rules` pointer resolves to `firestore.emulator.rules`; the `_smoke` rule is active. |
| `pnpm start` (default) | Web on 4200, api on 3333, both connected to emulators. Identical to current behavior. |
| `GET /api/firestore-smoke` (default) | Round-trips through the emulator. Identical to current behavior. |
| `LEARNWREN_FIREBASE_TARGET=production pnpm secrets:run -- pnpm start:api` | API logs a single warning that it is targeting production; initializes Admin SDK against the real project ID; does not set emulator env vars. With a valid `FIREBASE_SERVICE_ACCOUNT_JSON_PATH` exported, `GET /api/firestore-smoke` round-trips through real Firestore. |
| `LEARNWREN_FIREBASE_TARGET=production pnpm secrets:run -- pnpm start:web` | Web boots, points AngularFire at the real project (visible in DevTools network tab — calls go to `firestore.googleapis.com`, not `127.0.0.1`); the dev smoke widget round-trips through real Firestore. |
| `LEARNWREN_FIREBASE_TARGET=production pnpm secrets:run -- pnpm start:api` with `LEARNWREN_API_FIREBASE_PROJECT_ID` unset | API exits with a clear error message naming the missing variable. |
| `pnpm lint` | Passes. |
| `pnpm typecheck` | Passes. |
| `pnpm test` | Passes — the new `app.config.spec.ts` and the two new `firebase-admin.module.spec.ts` cases included. |
| `pnpm build` | Passes for both targets: emulator (default) and `LEARNWREN_FIREBASE_TARGET=production pnpm secrets:run -- pnpm build` produces a `dist/apps/web/browser/` whose runtime bundle does **not** contain the string `127.0.0.1` or `demo-learnwren`. |
| `pnpm e2e` | Existing Playwright suites pass unchanged (still emulator-mode). |

## 11. Implementation Notes for the Plan

The implementation plan should sequence work in this order. Each step is independently verifiable.

1. **Rules file split.** Add `firestore.emulator.rules` (copy of current `firestore.rules` body). Rewrite `firestore.rules` to the production-safe deny-by-default body. Update `firebase.json` to point at `firestore.emulator.rules`. Verify: `pnpm emulators` starts; the `_smoke` widget still round-trips.
2. **`.firebaserc` aliases.** Add the `production` alias with the user-supplied real project ID. Verify: `firebase --project default --help` and `firebase --project production --help` both resolve without "unknown project" errors.
3. **`apps/web` environments + helper.** Create `environment.ts` and `environment.production.ts` with the right shapes. Refactor `app.config.ts` to read from them and gate emulator connections behind `firebaseTargetMode()`. Add `app.config.spec.ts`. Verify: `pnpm test` passes; `pnpm start:web` (default mode) still connects to the emulator.
4. **Web build-time environment generator.** Add `tools/web/build-environment.ts` and the `generate-environment` Nx target. Verify: `LEARNWREN_FIREBASE_TARGET=production pnpm secrets:run -- pnpm exec nx run web:generate-environment` writes `environment.production.ts` with real values; the file is gitignored or the file's checked-in placeholder is restored after build (decision: gitignore the generated file; commit the placeholder under a `.tpl` suffix and have the generator copy-then-replace).
5. **`apps/api` Admin SDK refactor.** Refactor `firebase-admin.module.ts` to branch on `LEARNWREN_FIREBASE_TARGET`. Add the `required()` helper. Update `firebase-admin.module.spec.ts` with the three new cases. Verify: `nx test api-firebase` passes; `pnpm start:api` (default mode) still serves the smoke endpoint against emulators.
6. **`.env.tpl` and 1Password.** The user populates the `Web SDK Config` and `Admin SDK Config` items in the `learnwren` vault with the values from the console (manual step, not in the plan). Add the new lines to `.env.tpl`. Verify: `pnpm secrets:render` produces a `.env` containing all the new values.
7. **Documentation.** Update `docs/secrets.md` with the new vault contract rows and the service-account file convention. Update `docs/development.md` with the **Real-project mode** subsection. Verify: links and command examples are accurate.
8. **Production-mode walkthrough.** With the vault populated and the service-account JSON exported on disk, run the production-mode entries from §10 end-to-end. Confirm the api warning log fires; confirm DevTools shows web traffic going to `firestore.googleapis.com`. Delete the smoke documents from the live Firestore afterwards.
9. **Final DoD walkthrough.** Run every command in §10; confirm expected output for each.

The plan must respect the prior wiring spec's invariants: `pnpm emulators` and the existing default-mode behavior of `pnpm start` must be byte-identical from the user's perspective. No implicit mode switches, no warnings in default mode, no new required env vars to run emulator-mode dev. The production-mode path is opt-in at every step.

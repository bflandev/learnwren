# Firebase Wiring and Secrets Foundation Design Spec

**Status:** Approved (2026-04-29)
**Scope:** Wire the Firebase Emulator Suite into the existing Nx monorepo, get both `apps/web` and `apps/api` talking to emulated Auth/Firestore/Storage under the reserved `demo-learnwren` project ID, and stand up a 1Password-backed secrets pipeline exercised end-to-end by one canary entry.

This is the second design spec in the Learn Wren series, and the **first of three** specs that together unblock UC-01 (User Identity and Access). The trio:

1. **This spec — Firebase wiring and secrets foundation.**
2. **Next — Auth flows** (UC-01-01..04, AngularFire-backed login/registration/profile/role-request, custom claims, lockout, and the per-collection rules + helper functions for the role model).
3. **Then — DTO/validation foundation** (Zod or class-validator, NestJS `ValidationPipe`, error envelope, shared API contracts).

Throughout the body of this document, "the auth spec" and "the DTO spec" refer to specs 2 and 3 of this trio, not to global numbering. It builds directly on `2026-04-29-initial-nx-monorepo-design.md` and is scoped to the Firebase wiring + secrets concerns deferred there.

## Goal

A fresh clone, after `pnpm install` and a one-time `op signin`, must satisfy:

- `pnpm secrets:render` writes a `.env` from `.env.tpl` via 1Password.
- `pnpm emulators` starts Auth, Firestore, Storage, and the Emulator UI cleanly.
- `pnpm start` (alongside emulators) brings up `apps/web` on 4200 and `apps/api` on 3333; both connect to emulators on boot without errors.
- A new `GET /api/firestore-smoke` endpoint round-trips a doc through emulated Firestore.
- A dev-only smoke widget on the web placeholder route does the same via AngularFire.
- All prior-spec commands (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e`, `pnpm start`, `pnpm start:web`, `pnpm start:api`) still pass with no regression.

That is the contract this spec delivers.

## Non-Goals

These each have, or will have, their own spec:

- Real Firebase project provisioning (`firebase login`, `firebase projects:create`, `.firebaserc` with real IDs).
- `firebase deploy` from CI, deploy tokens, GitHub Actions deploy job.
- Cloud Functions packaging of `apps/api` (the prior spec already deferred this; nothing here changes the answer).
- Auth flows: registration (UC-01-01), login + 15-min lockout (UC-01-02), profile management (UC-01-03), instructor-role request (UC-01-04).
- Per-collection Firestore rules for the domain (`users`, `courses`, `modules`, `lessons`, `enrollments`, `instructorApplications`).
- Storage rules for video uploads or lesson materials.
- Helper rule functions (`isAuthenticated()`, `isOwner()`, `isAdmin()`, `hasRole()`) — these encode role-model decisions that belong with the auth spec.
- DTO/validation framework choice (Zod vs class-validator), `ValidationPipe`, error envelope.
- App Check, Analytics, Performance Monitoring, Remote Config.
- Emulator-backed integration tests in CI (Playwright wraps emulators with `firebase emulators:exec` — deferred until the auth spec has something meaningful to integration-test).
- Pre-staging unused 1Password entries (e.g., `FIREBASE_TOKEN`, `FIREBASE_SERVICE_ACCOUNT_JSON_PATH`). They land in the spec that first uses them.

## Decisions Made During Brainstorming

| Decision | Choice | Rationale |
| :--- | :--- | :--- |
| Spec breadth | Firebase wiring + 1Password pipeline; no auth, no DTOs | The original ask spanned four areas; decomposing keeps each spec single-plan-sized and matches the precedent set by the prior monorepo spec. |
| Project topology | No real Firebase project; emulators-only via reserved `demo-learnwren` ID | Cloud deploy is deferred. Without a deploy target, a real project adds setup cost with no payoff this slice. |
| API deployment | `apps/api` stays plain Node; Cloud Functions conversion stays deferred | Same as prior spec; revisited and re-confirmed. The Cloud-Functions decision deserves its own spec. |
| Emulator scope | Auth + Firestore + Storage + Emulator UI | All three services are exercised by UC-01..06; installing them now means later specs don't amend `firebase.json`. Hosting and Functions emulators stay out — nothing to host or serve. |
| Wire-proof depth | Boot + smoke read/write, no integration test in CI | "Boots" doesn't prove the SDK is wired correctly. A smoke endpoint + web widget catches that with negligible scope creep. CI integration testing reopens the prior spec's "Playwright in CI" decision. |
| File/lib boundary | Hybrid: AngularFire inline in `apps/web`; firebase-admin in a new `libs/api-firebase` lib | The api will keep growing wiring (auth-token middleware, converters, claims helpers); a lib is the natural seam. The web bootstrap is short and app-specific; a lib there is YAGNI. |
| 1Password scope | Pipeline + one canary entry (`Workspace.name = "learnwren-dev"`) | A pipeline you've never rendered end-to-end has bugs. One harmless canary exercises it without inventing fake Firebase secrets. |
| Vault | New dedicated `learnwren` vault | Cleanest permission boundary; doesn't entangle with other projects' vaults. |
| Rules content | Deny-by-default plus a single `_smoke` allow rule | Helper functions encode role-model choices that belong with the auth spec; pre-committing here would constrain Spec 2 unnecessarily. |

## 1. Workspace-Level Changes

```
learnwren/
├── firebase.json                       NEW   emulators-only config
├── .firebaserc                         NEW   single 'default' alias → demo-learnwren
├── firestore.rules                     NEW   deny-by-default + _smoke escape hatch
├── firestore.indexes.json              NEW   empty placeholder
├── storage.rules                       NEW   deny-by-default
├── .env.tpl                            NEW   committed; references op:// paths
├── .env                                NEW   gitignored; rendered locally via op inject
├── .gitignore                          MOD   add `.env`
├── package.json                        MOD   deps + 3 new scripts
├── docs/
│   ├── secrets.md                      NEW   1Password vault contract + workflow
│   └── development.md                  MOD   adds Emulators + Secrets sections
├── apps/
│   ├── web/                            MOD   AngularFire bootstrap + dev smoke widget
│   └── api/                            MOD   imports api-firebase lib + smoke controller
└── libs/
    ├── shared-data-models/             unchanged
    └── api-firebase/                   NEW   FirebaseAdminModule + injection tokens
```

No changes to `apps/web-e2e` or `apps/api-e2e`. The existing tests must continue to pass unmodified.

### Dependency additions in root `package.json`

```
dependencies:
  firebase                # AngularFire's peer; web SDK
  firebase-admin          # api-firebase consumes this
  @angular/fire           # standalone-component bootstrap helpers
devDependencies:
  firebase-tools          # provides `firebase emulators:start`
```

Versions follow the repo's "current major" convention — pinned at install time by the implementation plan, not in this spec.

### New root scripts

Append to root `package.json`:

```json
{
  "scripts": {
    "emulators": "firebase emulators:start",
    "secrets:render": "op inject -i .env.tpl -o .env",
    "secrets:run": "op run --env-file=.env.tpl"
  }
}
```

`pnpm secrets:run -- pnpm test` runs the test command with secrets injected at the process boundary, never written to disk. (pnpm forwards everything after the user's `--` as arguments to the script's command, so no trailing `--` is needed inside the script itself.)

## 2. `firebase.json`, `.firebaserc`, and Rules

### `firebase.json`

```json
{
  "firestore": { "rules": "firestore.rules", "indexes": "firestore.indexes.json" },
  "storage":   { "rules": "storage.rules" },
  "emulators": {
    "auth":      { "port": 9099 },
    "firestore": { "port": 8080 },
    "storage":   { "port": 9199 },
    "ui":        { "enabled": true, "port": 4000 },
    "singleProjectMode": true
  }
}
```

No `hosting`, no `functions` blocks. `singleProjectMode: true` because there is exactly one alias.

### `.firebaserc`

```json
{ "projects": { "default": "demo-learnwren" } }
```

`demo-learnwren` is Firebase's reserved emulator-only project ID — any name with the `demo-` prefix is recognized by the emulators as not requiring real cloud credentials.

### `firestore.rules`

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // _smoke: dev-only emulator wire smoke test for this spec.
    // Only intended for the demo-learnwren emulator project.
    // Production deploys must remove or re-gate this rule.
    match /_smoke/{docId} {
      allow read, write: if true;
    }

    // Deny-by-default. Per-collection rules and the
    // isAuthenticated/isOwner/isAdmin/hasRole helpers are introduced
    // in the auth spec, not this one.
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

### `storage.rules`

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

The smoke widget does not exercise Storage. This spec proves the Storage *emulator* boots; per-path rules ship with the spec that introduces uploads.

### `firestore.indexes.json`

```json
{ "indexes": [], "fieldOverrides": [] }
```

Empty placeholder so `firebase deploy --only firestore:indexes` is a valid no-op once deploy lands.

## 3. `apps/web` — AngularFire Bootstrap and Dev Smoke Widget

### `app.config.ts` additions

The existing providers array gains:

```ts
provideFirebaseApp(() => initializeApp({ projectId: 'demo-learnwren' })),
provideAuth(() => {
  const auth = getAuth();
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  return auth;
}),
provideFirestore(() => {
  const db = getFirestore();
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  return db;
}),
provideStorage(() => {
  const storage = getStorage();
  connectStorageEmulator(storage, '127.0.0.1', 9199);
  return storage;
}),
```

Imports come from `@angular/fire/{app,auth,firestore,storage}`. Emulator connections are unconditional in this spec; gating-by-environment is a Spec 2/3 problem and earns a `// TODO` comment at the call site.

### Dev smoke widget

New standalone component at `apps/web/src/app/dev/firestore-smoke.component.ts`:

- Injects `Firestore` from `@angular/fire/firestore`.
- A button labelled "Run Firestore smoke" writes one doc to `_smoke/{Date.now()}` with `{ writtenAt: serverTimestamp() }`, then reads it back via `getDoc`, then renders both write and read on screen.
- Gated to `!environment.production`; when production is true, the component renders nothing.

Mounted under a `<details>` "Dev tools" disclosure on the existing placeholder route (`apps/web/src/app/app.component.html` or wherever the prior spec's hero placeholder lives). The disclosure stays collapsed by default so the placeholder hero remains the visual focus.

### Tests

The component gets a minimal vitest spec under `apps/web/src/app/dev/firestore-smoke.component.spec.ts` that mocks the `Firestore` injection and verifies the read/write call shapes. It is unit-level; no emulator dependency.

## 4. `libs/api-firebase` — Firebase-Admin Wiring

Generated via:

```
nx g @nx/js:library api-firebase \
  --directory=libs/api-firebase \
  --bundler=none \
  --unitTestRunner=vitest \
  --importPath=@learnwren/api-firebase \
  --strict=true
```

`--bundler=none` because the lib only ships TypeScript sources consumed via path mapping, same as `shared-data-models`.

### Source layout

```
libs/api-firebase/src/
├── index.ts                            re-exports module + tokens
└── lib/
    ├── firebase-admin.module.ts        FirebaseAdminModule.forRoot()
    ├── firebase.tokens.ts              FIRESTORE, FIREBASE_AUTH, FIREBASE_STORAGE InjectionTokens
    └── firebase-admin.module.spec.ts   vitest — module compiles + tokens are exported
```

### `firebase.tokens.ts`

Defines three Nest `InjectionToken` values:

```ts
export const FIRESTORE        = Symbol.for('learnwren.api-firebase.firestore');
export const FIREBASE_AUTH    = Symbol.for('learnwren.api-firebase.auth');
export const FIREBASE_STORAGE = Symbol.for('learnwren.api-firebase.storage');
```

`Symbol.for` keeps tokens stable across module reloads in tests.

### `FirebaseAdminModule.forRoot()`

A static `forRoot()` method that returns a Nest `DynamicModule`. On module instantiation it:

1. Sets emulator host env vars **only when unset**, so a developer can override:
   ```
   FIREBASE_AUTH_EMULATOR_HOST    = 127.0.0.1:9099
   FIRESTORE_EMULATOR_HOST        = 127.0.0.1:8080
   FIREBASE_STORAGE_EMULATOR_HOST = 127.0.0.1:9199
   ```
2. Calls `admin.initializeApp({ projectId: 'demo-learnwren' })` exactly once. The init is guarded by `if (admin.apps.length === 0) { … }` so module re-imports during tests don't double-initialize.
3. Provides the three tokens with factories that return `admin.firestore()`, `admin.auth()`, `admin.storage()`.

A `// TODO(auth-spec): replace hardcoded emulator hosts with environment-driven config when real Firebase project arrives` comment marks the gating site so the future change is unmissable.

### Tests

`firebase-admin.module.spec.ts` imports the module via Nest's `Test.createTestingModule`, asserts that all three tokens resolve to non-null values, and verifies the env vars get set. It does not require a running emulator — `firebase-admin` accepts the env vars without a connection at init time.

## 5. `apps/api` — Module Wiring and Smoke Controller

### `app.module.ts` change

Add `FirebaseAdminModule.forRoot()` to the `imports` array of `AppModule`. No other changes to existing controllers.

### Smoke controller

New file `apps/api/src/app/firestore-smoke/firestore-smoke.controller.ts`:

- Single route: `GET /api/firestore-smoke`.
- Constructor injects the Firestore admin handle via `@Inject(FIRESTORE) private readonly firestore: admin.firestore.Firestore`.
- Handler:
  1. Builds a doc id `${Date.now()}`.
  2. Writes `{ writtenAt: <ISO string> }` to `_smoke/{docId}`.
  3. Reads the same doc back via `firestore.doc('_smoke/{docId}').get()`.
  4. Returns JSON `{ written: { writtenAt }, readBack: <doc data> }`.

The endpoint is intentionally separate from `/api/health`. `/api/health` stays cheap and IO-free so it remains a valid liveness probe; smoke is a deliberate IO test.

### Tests

`firestore-smoke.controller.spec.ts` mocks the firestore handle (using a small fake that returns the written value on `get()`) and asserts the controller returns the expected envelope. No emulator dependency.

## 6. 1Password Pipeline

### `.env.tpl` (committed)

```
# .env.tpl — 1Password secret template for learnwren
# Render .env with: pnpm secrets:render   (op inject -i .env.tpl -o .env)
# Run a one-off:    pnpm secrets:run -- <command>  (op run --env-file=.env.tpl -- <command>)
#
# DO NOT commit .env to version control (it is gitignored).

# ── Workspace identity (canary) ───────────────────────────────────────
# Round-trip proof that the op pipeline works. Non-secret value.
WORKSPACE_NAME=op://learnwren/Workspace/name

# ── Reserved for later specs ──────────────────────────────────────────
# Auth spec:         no entries expected — Firebase Auth uses emulators locally.
# DTO/validation:    no entries expected.
# Future deploy:     FIREBASE_TOKEN, FIREBASE_SERVICE_ACCOUNT_JSON_PATH
```

### `.gitignore` change

Append a single line:

```
.env
```

This matches `.env` at any directory depth (defensive — also catches a future `apps/web/.env`).

### `docs/secrets.md` (new)

Sections:

1. **Overview.** Brief: `learnwren` uses 1Password CLI to keep secrets out of the repo. `.env.tpl` (committed) references `op://...` paths; `.env` (gitignored) is rendered locally.
2. **Prereqs.** 1Password CLI ≥ 2.x, `op signin` to an account that has access to the `learnwren` vault, vault membership.
3. **Daily workflow.** `pnpm secrets:render` to write `.env`. `pnpm secrets:run -- <cmd>` for in-memory injection. Re-render after rotation.
4. **Vault contract** (table):

   | Item | Field | Purpose | Required by |
   |---|---|---|---|
   | `Workspace` | `name` | Canary; value `learnwren-dev`; proves the pipeline works | this spec |

5. **Adding a secret** — three-step procedure:
   1. Add the secret to the `learnwren` vault under a clearly-named item.
   2. Add a line to `.env.tpl` of the form `MY_VAR=op://learnwren/Item/field`.
   3. Update the vault contract table; commit `.env.tpl` and `docs/secrets.md`. Never commit `.env`.

### Manual prerequisite (already complete)

The user has confirmed the following are done out-of-band:

- Vault `learnwren` exists.
- Item `Workspace` exists in that vault with field `name = "learnwren-dev"`.
- `op signin` works on the developer machine.

The implementation plan can therefore run `pnpm secrets:render` end-to-end without a setup pause.

## 7. `docs/development.md` Additions

Two new sections appended to the existing development doc:

1. **Emulators.** Lists the four emulator ports (Auth 9099, Firestore 8080, Storage 9199, UI 4000), shows `pnpm emulators`, and explains that `apps/web` and `apps/api` connect to emulators on boot via `demo-learnwren`. A note that real-project gating is deferred.
2. **Secrets.** A one-paragraph pointer to `docs/secrets.md`, the script names, and the convention that `.env` is gitignored.

## 8. Definition of Done

A fresh clone, after `pnpm install`, must allow all of the following to pass:

| Command | What it must do |
| :--- | :--- |
| `pnpm secrets:render` | Writes `.env` containing `WORKSPACE_NAME=learnwren-dev`. |
| `pnpm emulators` | Starts Auth (9099), Firestore (8080), Storage (9199), Emulator UI (4000); UI loads in a browser; no port conflicts. |
| `pnpm start` (with emulators running) | Web on 4200, api on 3333; both connect to emulators on boot without errors in console. |
| `GET http://localhost:3333/api/firestore-smoke` | Returns `{ written: { writtenAt: <ISO> }, readBack: { writtenAt: <ISO> } }` with matching timestamps. |
| Web placeholder route | "Dev tools" disclosure shows the smoke widget; clicking it round-trips a doc through emulated Firestore and displays both write and read. |
| `GET http://localhost:3333/api/health` | Unchanged from prior spec — returns `{ status: 'ok', version: '...' }`. |
| `pnpm lint` | Passes on all projects including the new `api-firebase`. |
| `pnpm typecheck` | Passes everywhere. |
| `pnpm test` | All unit tests pass — the new `api-firebase`, `firestore-smoke` controller, and dev smoke component specs included. |
| `pnpm build` | Produces output for `web`, `api`, and `api-firebase` under `dist/`. |
| `pnpm e2e` | Existing Playwright suites pass unchanged (web hero + `/api/health`). |

## 9. Implementation Notes for the Plan

The implementation plan should sequence work in this order. Each step is independently verifiable.

1. **Deps + Firebase config files.** Install `firebase`, `firebase-admin`, `@angular/fire`, and `firebase-tools`. Create `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`, `storage.rules`. Add the `emulators` script. Verify: `pnpm emulators` boots the suite cleanly.
2. **Generate `libs/api-firebase`.** Run the `@nx/js:library` generator. Verify: project appears in `nx graph`, default lib test passes.
3. **Implement `FirebaseAdminModule` + tokens + module spec.** Verify: `nx test api-firebase` passes.
4. **Wire `apps/api` smoke controller.** Add the module import to `AppModule`; add `FirestoreSmokeController` with its unit spec. Verify: `nx test api` passes; with emulators running, `curl /api/firestore-smoke` returns the round-trip JSON.
5. **Wire `apps/web` AngularFire bootstrap + dev smoke widget.** Update `app.config.ts`; add the smoke component and its unit spec; mount on the placeholder route under a disclosure. Verify: with emulators running, the widget round-trips through Firestore.
6. **1Password pipeline.** Add `.env.tpl`, append `.env` to `.gitignore`, add `secrets:render` and `secrets:run` scripts, write `docs/secrets.md`. Verify: `pnpm secrets:render` produces a `.env` with `WORKSPACE_NAME=learnwren-dev`.
7. **Update `docs/development.md`.** Add Emulators + Secrets sections.
8. **Final DoD walkthrough.** Run every command in §8; confirm expected output for each. Capture any port conflicts or environment-specific notes back into `docs/development.md`.

The plan must respect the prior monorepo spec's invariants: do not reshape `apps/web`, `apps/api`, `apps/web-e2e`, `apps/api-e2e`, or `libs/shared-data-models` beyond the additive changes listed here. Existing tests, scripts, and CI behaviour must remain green.

# Firebase Wiring and Secrets Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Firebase Emulator Suite (Auth, Firestore, Storage, UI) into the existing Nx monorepo, give both apps a verified read/write path through emulated Firestore under the reserved `demo-learnwren` project ID, and stand up a 1Password `op inject` secrets pipeline exercised end-to-end by one canary entry.

**Architecture:** AngularFire bootstraps inline in `apps/web/src/app/app.config.ts` and connects to emulators. Firebase-admin lives in a new `libs/api-firebase` lib exposing `FirebaseAdminModule.forRoot()` plus injection tokens for Firestore/Auth/Storage; `apps/api` consumes the lib and adds a `GET /api/firestore-smoke` endpoint that round-trips a doc through emulated Firestore. The web app gets a dev-only smoke widget under a "Dev tools" disclosure. A 1Password-backed `.env.tpl` is rendered by `pnpm secrets:render` against the `learnwren` vault.

**Tech Stack:** Nx 22.7 monorepo, Angular 21.2 (standalone components, esbuild), NestJS 11, AngularFire (matching Angular 21), `firebase`, `firebase-admin`, `firebase-tools`, Vitest, Playwright, 1Password CLI ≥ 2.x.

**Spec:** `docs/superpowers/specs/2026-04-29-firebase-wiring-and-secrets-design.md`

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `firebase.json` | Emulators-only config: Firestore, Auth, Storage, UI ports + rules/index file references. |
| `.firebaserc` | Single `default` alias mapped to `demo-learnwren`. |
| `firestore.rules` | Deny-by-default; allow read/write only for `_smoke/{docId}` (dev escape hatch). |
| `firestore.indexes.json` | Empty placeholder (`{ "indexes": [], "fieldOverrides": [] }`). |
| `storage.rules` | Deny-by-default; no per-path rules yet. |
| `.env.tpl` | Committed; references `op://learnwren/...` paths. Contains the canary line. |
| `docs/secrets.md` | 1Password vault contract + daily workflow. |
| `libs/api-firebase/src/index.ts` | Re-exports `FirebaseAdminModule` and token names. |
| `libs/api-firebase/src/lib/firebase.tokens.ts` | `FIRESTORE`, `FIREBASE_AUTH`, `FIREBASE_STORAGE` injection tokens. |
| `libs/api-firebase/src/lib/firebase-admin.module.ts` | `FirebaseAdminModule.forRoot()` returning a `DynamicModule`. Sets emulator hosts, idempotently inits firebase-admin, provides three injectable handles. |
| `libs/api-firebase/src/lib/firebase-admin.module.spec.ts` | Module integration test — verifies tokens resolve and emulator host env vars are set. |
| `apps/api/src/app/firestore-smoke/firestore-smoke.controller.ts` | `GET /api/firestore-smoke` — writes `{ writtenAt }` to `_smoke/{ts}` and reads it back. |
| `apps/api/src/app/firestore-smoke/firestore-smoke.controller.spec.ts` | Unit test — mocks Firestore handle and verifies envelope shape. |
| `apps/web/src/app/dev/firestore-smoke.component.ts` | Standalone component — "Dev tools" disclosure + button that round-trips a doc through AngularFire. Gated by `isDevMode()`. |
| `apps/web/src/app/dev/firestore-smoke.component.spec.ts` | Render test — verifies the button is in the DOM. |

### Modified files

| Path | Change |
|---|---|
| `package.json` | Add `firebase`, `firebase-admin`, `@angular/fire` to `dependencies`; `firebase-tools` to `devDependencies`; add `emulators`, `secrets:render`, `secrets:run` scripts. |
| `tsconfig.base.json` | Add `@learnwren/api-firebase` path mapping (auto-added by `nx g @nx/js:library --importPath`). |
| `.gitignore` | Append `.env`. |
| `apps/api/src/app/app.module.ts` | Import `FirebaseAdminModule.forRoot()`; register `FirestoreSmokeController`. |
| `apps/web/src/app/app.config.ts` | Add `provideFirebaseApp` + `provideAuth/provideFirestore/provideStorage` with emulator connection. |
| `apps/web/src/app/app.ts` | Add `FirestoreSmokeComponent` to imports. |
| `apps/web/src/app/app.html` | Mount `<app-firestore-smoke>` below the hero. |
| `docs/development.md` | Add Emulators + Secrets sections. |

### Untouched (must remain green)

- `apps/web-e2e`, `apps/api-e2e` — existing Playwright suites continue to pass unchanged.
- `libs/shared-data-models` — no changes.
- `apps/api/src/app/app.controller.ts` (`GET /api/health`) — must keep returning the same envelope.

---

## Task 1: Add Firebase deps and root scripts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime Firebase deps**

Run:

```bash
pnpm add firebase firebase-admin @angular/fire
```

Expected: install completes; `package.json` `dependencies` now contains all three. The exact versions are pnpm-resolved.

- [ ] **Step 2: Install firebase-tools as a dev dep**

Run:

```bash
pnpm add -D firebase-tools
```

Expected: install completes; `package.json` `devDependencies` now contains `firebase-tools`.

- [ ] **Step 3: Verify `firebase` CLI works**

Run:

```bash
pnpm exec firebase --version
```

Expected: prints a version string ≥ `13.0.0`. Captures the case where pnpm resolved an unexpectedly old `firebase-tools`.

- [ ] **Step 4: Add scripts to `package.json`**

Open `package.json` and replace the existing `scripts` block with:

```json
"scripts": {
  "start:web": "nx serve web",
  "start:api": "nx serve api",
  "start": "nx run-many -t serve -p web,api --parallel",
  "build": "nx run-many -t build",
  "test": "nx run-many -t test",
  "lint": "nx run-many -t lint",
  "e2e": "nx run web-e2e:e2e && nx run api-e2e:e2e",
  "typecheck": "nx run-many -t typecheck",
  "affected": "nx affected -t lint test build typecheck",
  "emulators": "firebase emulators:start",
  "secrets:render": "op inject -i .env.tpl -o .env",
  "secrets:run": "op run --env-file=.env.tpl --"
}
```

Only the three trailing scripts (`emulators`, `secrets:render`, `secrets:run`) are new. The existing scripts are preserved verbatim.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "feat(deps): add firebase, firebase-admin, @angular/fire, firebase-tools

Adds runtime + dev deps for the Firebase wiring spec. New root scripts:
emulators, secrets:render, secrets:run."
```

---

## Task 2: Create Firebase config files (rules + emulator config)

**Files:**
- Create: `firebase.json`
- Create: `.firebaserc`
- Create: `firestore.rules`
- Create: `firestore.indexes.json`
- Create: `storage.rules`

- [ ] **Step 1: Create `firebase.json`**

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "storage": {
    "rules": "storage.rules"
  },
  "emulators": {
    "auth":      { "port": 9099 },
    "firestore": { "port": 8080 },
    "storage":   { "port": 9199 },
    "ui":        { "enabled": true, "port": 4000 },
    "singleProjectMode": true
  }
}
```

- [ ] **Step 2: Create `.firebaserc`**

```json
{
  "projects": {
    "default": "demo-learnwren"
  }
}
```

`demo-learnwren` is Firebase's reserved emulator-only ID — any name with the `demo-` prefix is recognized by emulators as not requiring real cloud credentials.

- [ ] **Step 3: Create `firestore.rules`**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // _smoke: dev-only emulator wire smoke test for the Firebase wiring spec.
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

- [ ] **Step 4: Create `firestore.indexes.json`**

```json
{ "indexes": [], "fieldOverrides": [] }
```

- [ ] **Step 5: Create `storage.rules`**

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

- [ ] **Step 6: Verify the emulator suite boots**

Run in one terminal:

```bash
pnpm emulators
```

Expected: console output shows all four services starting on their declared ports:

```
✔  All emulators ready! It is now safe to connect your app.
   ┌─────────────────────────────────────────────┐
   │   Authentication on http://127.0.0.1:9099   │
   │   Firestore on http://127.0.0.1:8080        │
   │   Storage on http://127.0.0.1:9199          │
   │   Emulator UI on http://127.0.0.1:4000      │
   └─────────────────────────────────────────────┘
```

Open `http://127.0.0.1:4000` in a browser; the Emulator UI dashboard should load. Stop with Ctrl+C.

- [ ] **Step 7: Commit**

```bash
git add firebase.json .firebaserc firestore.rules firestore.indexes.json storage.rules
git commit -m "feat(firebase): emulator suite + deny-by-default rules

Wires Auth/Firestore/Storage/UI emulators against demo-learnwren and
ships rules with deny-by-default plus a single _smoke escape hatch."
```

---

## Task 3: Generate `libs/api-firebase` scaffold

**Files:**
- Create: `libs/api-firebase/` (full Nx-generated structure)
- Modify: `tsconfig.base.json` (auto-modified by generator)

- [ ] **Step 1: Run the generator**

```bash
pnpm exec nx g @nx/js:library api-firebase \
  --directory=libs/api-firebase \
  --bundler=none \
  --unitTestRunner=vitest \
  --importPath=@learnwren/api-firebase \
  --strict=true \
  --no-interactive
```

Expected output: generator creates `libs/api-firebase/{src,project.json,tsconfig*.json,vitest.config.mts,eslint.config.mjs,README.md}` and adds `@learnwren/api-firebase` to `tsconfig.base.json` paths.

- [ ] **Step 2: Verify the path mapping was added**

Open `tsconfig.base.json` and confirm `compilerOptions.paths` now contains:

```json
"@learnwren/api-firebase": ["./libs/api-firebase/src/index.ts"]
```

If missing (older Nx versions sometimes skip this), add it manually next to the existing `@learnwren/shared-data-models` entry.

- [ ] **Step 3: Run the default test to verify the scaffold**

```bash
pnpm exec nx test api-firebase
```

Expected: a single default test passes. The generator typically creates `libs/api-firebase/src/lib/api-firebase.ts` with `apiFirebase()` and a matching spec — these will be replaced in subsequent tasks.

- [ ] **Step 4: Verify the project shows up in the workspace graph**

```bash
pnpm exec nx show projects
```

Expected output includes `api-firebase` alongside `web`, `api`, `web-e2e`, `api-e2e`, `shared-data-models`.

- [ ] **Step 5: Commit**

```bash
git add libs/api-firebase tsconfig.base.json package.json pnpm-lock.yaml
git commit -m "feat(api-firebase): scaffold @learnwren/api-firebase library"
```

---

## Task 4: Replace lib scaffold with injection tokens (TDD)

**Files:**
- Create: `libs/api-firebase/src/lib/firebase.tokens.ts`
- Delete: `libs/api-firebase/src/lib/api-firebase.ts` (generator boilerplate)
- Delete: `libs/api-firebase/src/lib/api-firebase.spec.ts` (generator boilerplate)
- Modify: `libs/api-firebase/src/index.ts`

- [ ] **Step 1: Remove the generator's boilerplate files**

```bash
rm libs/api-firebase/src/lib/api-firebase.ts libs/api-firebase/src/lib/api-firebase.spec.ts
```

- [ ] **Step 2: Create `firebase.tokens.ts`**

```ts
import type { app, auth, firestore, storage } from 'firebase-admin';

export const FIRESTORE = Symbol.for('learnwren.api-firebase.firestore');
export const FIREBASE_AUTH = Symbol.for('learnwren.api-firebase.auth');
export const FIREBASE_STORAGE = Symbol.for('learnwren.api-firebase.storage');

export type FirestoreHandle = firestore.Firestore;
export type FirebaseAuthHandle = auth.Auth;
export type FirebaseStorageHandle = storage.Storage;
export type FirebaseAppHandle = app.App;
```

`Symbol.for` keeps tokens stable across module reloads in tests.

- [ ] **Step 3: Replace `libs/api-firebase/src/index.ts`**

```ts
export {
  FIRESTORE,
  FIREBASE_AUTH,
  FIREBASE_STORAGE,
  type FirestoreHandle,
  type FirebaseAuthHandle,
  type FirebaseStorageHandle,
  type FirebaseAppHandle,
} from './lib/firebase.tokens';
export { FirebaseAdminModule } from './lib/firebase-admin.module';
```

This file references `firebase-admin.module` which doesn't exist yet — that's intentional. The next task creates it.

- [ ] **Step 4: Verify typecheck fails for the missing module**

Run:

```bash
pnpm exec nx typecheck api-firebase
```

Expected: typecheck FAILS with `Cannot find module './lib/firebase-admin.module'`. This confirms the next task's work is genuinely needed.

---

## Task 5: Implement `FirebaseAdminModule.forRoot()` (TDD)

**Files:**
- Create: `libs/api-firebase/src/lib/firebase-admin.module.spec.ts`
- Create: `libs/api-firebase/src/lib/firebase-admin.module.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/api-firebase/src/lib/firebase-admin.module.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import * as admin from 'firebase-admin';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FIREBASE_AUTH, FIREBASE_STORAGE, FIRESTORE } from './firebase.tokens';
import { FirebaseAdminModule } from './firebase-admin.module';

const EMULATOR_ENV_KEYS = [
  'FIREBASE_AUTH_EMULATOR_HOST',
  'FIRESTORE_EMULATOR_HOST',
  'FIREBASE_STORAGE_EMULATOR_HOST',
] as const;

describe('FirebaseAdminModule', () => {
  beforeEach(async () => {
    for (const key of EMULATOR_ENV_KEYS) {
      delete process.env[key];
    }
    await Promise.all(admin.apps.map((a) => a?.delete()));
  });

  afterEach(async () => {
    await Promise.all(admin.apps.map((a) => a?.delete()));
  });

  it('sets emulator host env vars when unset and resolves all three tokens', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [FirebaseAdminModule.forRoot()],
    }).compile();

    expect(process.env['FIREBASE_AUTH_EMULATOR_HOST']).toBe('127.0.0.1:9099');
    expect(process.env['FIRESTORE_EMULATOR_HOST']).toBe('127.0.0.1:8080');
    expect(process.env['FIREBASE_STORAGE_EMULATOR_HOST']).toBe('127.0.0.1:9199');

    expect(moduleRef.get(FIRESTORE)).toBeDefined();
    expect(moduleRef.get(FIREBASE_AUTH)).toBeDefined();
    expect(moduleRef.get(FIREBASE_STORAGE)).toBeDefined();
  });

  it('does not overwrite emulator host env vars that are already set', async () => {
    process.env['FIREBASE_AUTH_EMULATOR_HOST'] = '127.0.0.1:19099';
    process.env['FIRESTORE_EMULATOR_HOST'] = '127.0.0.1:18080';
    process.env['FIREBASE_STORAGE_EMULATOR_HOST'] = '127.0.0.1:19199';

    await Test.createTestingModule({
      imports: [FirebaseAdminModule.forRoot()],
    }).compile();

    expect(process.env['FIREBASE_AUTH_EMULATOR_HOST']).toBe('127.0.0.1:19099');
    expect(process.env['FIRESTORE_EMULATOR_HOST']).toBe('127.0.0.1:18080');
    expect(process.env['FIREBASE_STORAGE_EMULATOR_HOST']).toBe('127.0.0.1:19199');
  });

  it('initializes the firebase-admin app exactly once across multiple imports', async () => {
    await Test.createTestingModule({ imports: [FirebaseAdminModule.forRoot()] }).compile();
    await Test.createTestingModule({ imports: [FirebaseAdminModule.forRoot()] }).compile();
    expect(admin.apps.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm exec nx test api-firebase
```

Expected: tests FAIL with `Cannot find module './firebase-admin.module'`.

- [ ] **Step 3: Implement `FirebaseAdminModule`**

Create `libs/api-firebase/src/lib/firebase-admin.module.ts`:

```ts
import { DynamicModule, Module } from '@nestjs/common';
import * as admin from 'firebase-admin';

import {
  FIREBASE_AUTH,
  FIREBASE_STORAGE,
  FIRESTORE,
} from './firebase.tokens';

const DEFAULT_EMULATOR_HOSTS = {
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
} as const;

const EMULATOR_PROJECT_ID = 'demo-learnwren';

function applyEmulatorEnvDefaults(): void {
  for (const [key, value] of Object.entries(DEFAULT_EMULATOR_HOSTS)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function ensureFirebaseAppInitialized(): admin.app.App {
  // TODO(auth-spec): replace hardcoded emulator hosts and project ID with
  // environment-driven config when the real Firebase project arrives.
  if (admin.apps.length === 0) {
    return admin.initializeApp({ projectId: EMULATOR_PROJECT_ID });
  }
  const existing = admin.apps[0];
  if (!existing) {
    return admin.initializeApp({ projectId: EMULATOR_PROJECT_ID });
  }
  return existing;
}

@Module({})
export class FirebaseAdminModule {
  static forRoot(): DynamicModule {
    applyEmulatorEnvDefaults();
    const app = ensureFirebaseAppInitialized();

    return {
      module: FirebaseAdminModule,
      global: true,
      providers: [
        { provide: FIRESTORE, useFactory: () => app.firestore() },
        { provide: FIREBASE_AUTH, useFactory: () => app.auth() },
        { provide: FIREBASE_STORAGE, useFactory: () => app.storage() },
      ],
      exports: [FIRESTORE, FIREBASE_AUTH, FIREBASE_STORAGE],
    };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
pnpm exec nx test api-firebase
```

Expected: all three tests PASS.

- [ ] **Step 5: Run typecheck**

```bash
pnpm exec nx typecheck api-firebase
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/api-firebase
git commit -m "feat(api-firebase): FirebaseAdminModule + injection tokens

Idempotently initializes firebase-admin against demo-learnwren, sets
emulator host env vars (only when unset), and exports Firestore/Auth/
Storage handles via stable Symbol.for tokens. Vitest covers token
resolution, env-var defaulting, and single-init invariant."
```

---

## Task 6: Wire `FirebaseAdminModule` into `apps/api`

**Files:**
- Modify: `apps/api/src/app/app.module.ts`

- [ ] **Step 1: Update `app.module.ts`**

Replace the file contents with:

```ts
import { Module } from '@nestjs/common';
import { FirebaseAdminModule } from '@learnwren/api-firebase';
import { AppController } from './app.controller';

@Module({
  imports: [FirebaseAdminModule.forRoot()],
  controllers: [AppController],
})
export class AppModule {}
```

- [ ] **Step 2: Run the existing api unit tests**

```bash
pnpm exec nx test api
```

Expected: existing `AppController.getHealth` test still passes (the smoke controller hasn't been added yet).

- [ ] **Step 3: Verify the api boots**

In one terminal:

```bash
pnpm emulators
```

In a second terminal (with emulators still running):

```bash
pnpm start:api
```

Expected: api logs `🚀 Application is running on: http://localhost:3333/api` with no errors. The firebase-admin SDK initializes silently — there should be no warnings about missing credentials because we're emulator-bound.

Verify health is unchanged:

```bash
curl -sS http://localhost:3333/api/health
```

Expected output (formatted):

```json
{"status":"ok","version":"0.0.0","serverTime":"<ISO-string>"}
```

Stop both processes with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/app/app.module.ts
git commit -m "feat(api): import FirebaseAdminModule.forRoot()"
```

---

## Task 7: Add `FirestoreSmokeController` (TDD)

**Files:**
- Create: `apps/api/src/app/firestore-smoke/firestore-smoke.controller.spec.ts`
- Create: `apps/api/src/app/firestore-smoke/firestore-smoke.controller.ts`
- Modify: `apps/api/src/app/app.module.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/app/firestore-smoke/firestore-smoke.controller.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

import { FIRESTORE } from '@learnwren/api-firebase';
import { FirestoreSmokeController } from './firestore-smoke.controller';

interface SmokeDoc {
  writtenAt: string;
}

function buildFakeFirestore() {
  const writes: Array<{ path: string; data: SmokeDoc }> = [];
  const set = vi.fn(async (data: SmokeDoc) => {
    writes.push({ path: 'last', data });
  });
  const get = vi.fn(async () => ({
    exists: true,
    data: () => writes.at(-1)?.data,
  }));
  const doc = vi.fn(() => ({ set, get }));
  return {
    collection: vi.fn(() => ({ doc })),
    doc: vi.fn(() => ({ set, get })),
    _set: set,
    _get: get,
  };
}

describe('FirestoreSmokeController', () => {
  it('writes writtenAt to _smoke and returns the round-tripped envelope', async () => {
    const fakeFirestore = buildFakeFirestore();

    const moduleRef = await Test.createTestingModule({
      controllers: [FirestoreSmokeController],
      providers: [{ provide: FIRESTORE, useValue: fakeFirestore }],
    }).compile();

    const controller = moduleRef.get(FirestoreSmokeController);
    const result = await controller.runSmoke();

    expect(fakeFirestore._set).toHaveBeenCalledOnce();
    expect(fakeFirestore._get).toHaveBeenCalledOnce();
    expect(result.written.writtenAt).toEqual(expect.any(String));
    expect(result.readBack?.writtenAt).toBe(result.written.writtenAt);
    expect(result.docId).toEqual(expect.any(String));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm exec nx test api
```

Expected: the new test FAILS with `Cannot find module './firestore-smoke.controller'`. Existing health test still passes.

- [ ] **Step 3: Implement `FirestoreSmokeController`**

Create `apps/api/src/app/firestore-smoke/firestore-smoke.controller.ts`:

```ts
import { Controller, Get, Inject } from '@nestjs/common';
import {
  FIRESTORE,
  type FirestoreHandle,
} from '@learnwren/api-firebase';

interface SmokeDoc {
  writtenAt: string;
}

interface SmokeResponse {
  docId: string;
  written: SmokeDoc;
  readBack: SmokeDoc | undefined;
}

@Controller('firestore-smoke')
export class FirestoreSmokeController {
  constructor(@Inject(FIRESTORE) private readonly firestore: FirestoreHandle) {}

  @Get()
  async runSmoke(): Promise<SmokeResponse> {
    const docId = String(Date.now());
    const written: SmokeDoc = { writtenAt: new Date().toISOString() };
    const ref = this.firestore.doc(`_smoke/${docId}`);
    await ref.set(written);
    const snap = await ref.get();
    return {
      docId,
      written,
      readBack: snap.exists ? (snap.data() as SmokeDoc | undefined) : undefined,
    };
  }
}
```

- [ ] **Step 4: Register the controller in `AppModule`**

Replace `apps/api/src/app/app.module.ts` with:

```ts
import { Module } from '@nestjs/common';
import { FirebaseAdminModule } from '@learnwren/api-firebase';
import { AppController } from './app.controller';
import { FirestoreSmokeController } from './firestore-smoke/firestore-smoke.controller';

@Module({
  imports: [FirebaseAdminModule.forRoot()],
  controllers: [AppController, FirestoreSmokeController],
})
export class AppModule {}
```

- [ ] **Step 5: Run the api tests**

```bash
pnpm exec nx test api
```

Expected: both `AppController.getHealth` and `FirestoreSmokeController` tests PASS.

- [ ] **Step 6: Manually verify against the running emulator**

Terminal 1:

```bash
pnpm emulators
```

Terminal 2:

```bash
pnpm start:api
```

Terminal 3:

```bash
curl -sS http://localhost:3333/api/firestore-smoke
```

Expected output (formatted):

```json
{
  "docId": "<unix-millis>",
  "written":  { "writtenAt": "<ISO-string>" },
  "readBack": { "writtenAt": "<same-ISO-string>" }
}
```

Open the Emulator UI (`http://127.0.0.1:4000` → Firestore tab); the `_smoke` collection should contain the written doc. Stop both processes with Ctrl+C.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/app
git commit -m "feat(api): add GET /api/firestore-smoke

Round-trips a doc through emulated Firestore via the api-firebase lib.
Used as a wire smoke test; not a liveness probe (see /api/health)."
```

---

## Task 8: Wire AngularFire bootstrap in `apps/web`

**Files:**
- Modify: `apps/web/src/app/app.config.ts`

- [ ] **Step 1: Replace `app.config.ts`**

Replace the file contents with:

```ts
import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import {
  connectAuthEmulator,
  getAuth,
  provideAuth,
} from '@angular/fire/auth';
import {
  connectFirestoreEmulator,
  getFirestore,
  provideFirestore,
} from '@angular/fire/firestore';
import {
  connectStorageEmulator,
  getStorage,
  provideStorage,
} from '@angular/fire/storage';

import { appRoutes } from './app.routes';

// TODO(auth-spec): replace the hardcoded demo project ID and emulator hosts
// with environment-driven config when the real Firebase project arrives.
const FIREBASE_CONFIG = { projectId: 'demo-learnwren' } as const;

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes),
    provideFirebaseApp(() => initializeApp(FIREBASE_CONFIG)),
    provideAuth(() => {
      const auth = getAuth();
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', {
        disableWarnings: true,
      });
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
  ],
};
```

- [ ] **Step 2: Run the existing web unit tests**

```bash
pnpm exec nx test web
```

Expected: existing `App` placeholder hero test still passes. The bootstrap providers are picked up only when the app actually boots; the unit test's `TestBed` doesn't trigger them.

- [ ] **Step 3: Verify the web app boots**

Terminal 1:

```bash
pnpm emulators
```

Terminal 2:

```bash
pnpm start:web
```

Expected: `nx serve web` builds and serves; the browser at `http://localhost:4200` shows the existing "Learn Wren" hero. Open the browser devtools console — there should be **no** Firebase-related errors. The Auth emulator warning is suppressed because of `disableWarnings: true`.

Stop both processes with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/app.config.ts
git commit -m "feat(web): bootstrap AngularFire against the emulator suite"
```

---

## Task 9: Add `FirestoreSmokeComponent` (web dev widget)

**Files:**
- Create: `apps/web/src/app/dev/firestore-smoke.component.ts`
- Create: `apps/web/src/app/dev/firestore-smoke.component.spec.ts`
- Modify: `apps/web/src/app/app.ts`
- Modify: `apps/web/src/app/app.html`

- [ ] **Step 1: Write the failing render test**

Create `apps/web/src/app/dev/firestore-smoke.component.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { Firestore } from '@angular/fire/firestore';
import { describe, expect, it } from 'vitest';

import { FirestoreSmokeComponent } from './firestore-smoke.component';

describe('FirestoreSmokeComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FirestoreSmokeComponent],
      providers: [{ provide: Firestore, useValue: {} }],
    }).compileComponents();
  });

  it('renders the Dev tools disclosure with a Run button', () => {
    const fixture = TestBed.createComponent(FirestoreSmokeComponent);
    fixture.detectChanges();
    const summary: HTMLElement | null = fixture.nativeElement.querySelector('summary');
    const button: HTMLButtonElement | null = fixture.nativeElement.querySelector('button');
    expect(summary).not.toBeNull();
    expect(summary!.textContent).toContain('Dev tools');
    expect(button).not.toBeNull();
    expect(button!.textContent).toContain('Run Firestore smoke');
  });
});
```

Note: Vitest's `beforeEach` is auto-imported via the global API. If the existing app.spec.ts pattern doesn't auto-import, add `import { beforeEach } from 'vitest';` at the top — match the convention already used by `apps/web/src/app/app.spec.ts`.

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm exec nx test web
```

Expected: the new test FAILS with `Cannot find module './firestore-smoke.component'`. Existing tests still pass.

- [ ] **Step 3: Implement `FirestoreSmokeComponent`**

Create `apps/web/src/app/dev/firestore-smoke.component.ts`:

```ts
import { JsonPipe } from '@angular/common';
import { Component, inject, isDevMode, signal } from '@angular/core';
import {
  Firestore,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from '@angular/fire/firestore';

interface SmokeResult {
  docId: string;
  writtenAt: string;
  readBack: unknown;
}

@Component({
  selector: 'app-firestore-smoke',
  standalone: true,
  imports: [JsonPipe],
  template: `
    @if (devMode) {
      <details class="mt-6 max-w-xl mx-auto rounded border border-slate-200 bg-white p-4 text-slate-900">
        <summary class="cursor-pointer font-semibold">Dev tools</summary>
        <div class="mt-3 space-y-3">
          <button
            type="button"
            class="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            [disabled]="busy()"
            (click)="run()">
            Run Firestore smoke
          </button>
          @if (error()) {
            <pre class="text-sm text-red-700">{{ error() }}</pre>
          }
          @if (result(); as r) {
            <pre class="overflow-x-auto rounded bg-slate-100 p-2 text-xs">{{ r | json }}</pre>
          }
        </div>
      </details>
    }
  `,
})
export class FirestoreSmokeComponent {
  private readonly firestore = inject(Firestore);

  protected readonly devMode = isDevMode();
  protected readonly busy = signal(false);
  protected readonly result = signal<SmokeResult | null>(null);
  protected readonly error = signal<string | null>(null);

  async run(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const docId = String(Date.now());
      const ref = doc(this.firestore, '_smoke', docId);
      const writtenAt = new Date().toISOString();
      await setDoc(ref, { writtenAt, serverTimestamp: serverTimestamp() });
      const snap = await getDoc(ref);
      this.result.set({ docId, writtenAt, readBack: snap.data() ?? null });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.busy.set(false);
    }
  }
}
```

`isDevMode()` is used in lieu of the `environment.production` check called for in the spec — there is no `environment.ts` yet (the previous spec deferred it). The auth spec will introduce environment files; the gate will then be replaced with `!environment.production`. This is functionally equivalent for now.

The template uses Angular's `@if` block syntax (Angular 17+) and the `JsonPipe` (used as `| json`). The component imports `JsonPipe` from `@angular/common` so the pipe is available in the standalone template.

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
pnpm exec nx test web
```

Expected: render test PASSES. Existing tests still pass.

- [ ] **Step 5: Mount the component in the App shell**

Modify `apps/web/src/app/app.ts`:

```ts
import { Component } from '@angular/core';
import type { Course } from '@learnwren/shared-data-models';
import { FirestoreSmokeComponent } from './dev/firestore-smoke.component';

@Component({
  imports: [FirestoreSmokeComponent],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  readonly featuredCourses: readonly Course[] = [];
}
```

Modify `apps/web/src/app/app.html`:

```html
<main class="min-h-screen flex flex-col items-center justify-center bg-slate-50">
  <section data-testid="hero" class="text-3xl font-semibold text-slate-900">
    Learn Wren
  </section>
  <app-firestore-smoke />
</main>
```

Note: the hero's existing `flex items-center justify-center` becomes `flex flex-col items-center justify-center` so the smoke widget stacks below the hero rather than overlapping. The `data-testid="hero"` and the text content remain unchanged so the existing `App` and Playwright e2e tests stay green.

- [ ] **Step 6: Run web unit tests again to confirm no regression**

```bash
pnpm exec nx test web
```

Expected: all web unit tests PASS, including the existing hero test.

- [ ] **Step 7: Manually verify the widget**

Terminal 1:

```bash
pnpm emulators
```

Terminal 2:

```bash
pnpm start:web
```

Browser at `http://localhost:4200`:

1. The hero "Learn Wren" still renders.
2. Below it, a "Dev tools" `<details>` disclosure is collapsed by default.
3. Click "Dev tools" → see "Run Firestore smoke" button.
4. Click the button → after a moment, a JSON blob renders showing `docId`, `writtenAt`, and the round-tripped `readBack`.
5. Open the Emulator UI Firestore tab — `_smoke/{docId}` exists.

Stop both processes with Ctrl+C.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app
git commit -m "feat(web): dev-only Firestore smoke widget

Mounts under the placeholder hero behind a Dev tools <details>
disclosure. Gated by isDevMode() until the auth spec introduces
environment files. Uses AngularFire setDoc/getDoc against the
emulator and renders the round-tripped doc."
```

---

## Task 10: Stand up the 1Password pipeline

**Files:**
- Create: `.env.tpl`
- Modify: `.gitignore`

**Prerequisite (already satisfied):** the user has confirmed the 1Password vault `learnwren` exists, the `Workspace` item with field `name = "learnwren-dev"` is provisioned, and `op signin` works on the dev machine.

- [ ] **Step 1: Append `.env` to `.gitignore`**

Open `.gitignore` and append a section. The full updated file should be:

```
# Nx cache and installation — do not commit
.nx/
.claude/worktrees
.claude/settings.local.json

# macOS
.DS_Store

# Dependencies
node_modules/

# Build outputs
dist/
.angular
*.tsbuildinfo

vite.config.*.timestamp*
__screenshots__/

vitest.config.*.timestamp*

# Rendered secrets — never commit. .env.tpl is the source of truth.
.env
```

- [ ] **Step 2: Create `.env.tpl`**

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

- [ ] **Step 3: Verify `op` is signed in**

Run:

```bash
op whoami
```

Expected: prints the signed-in account info. If it errors with "not signed in," run `op signin` first and then re-run.

- [ ] **Step 4: Render `.env`**

Run:

```bash
pnpm secrets:render
```

Expected output: `op inject` prints a confirmation; a `.env` file is created at the repo root.

- [ ] **Step 5: Verify the canary value**

Run:

```bash
grep WORKSPACE_NAME .env
```

Expected: `WORKSPACE_NAME=learnwren-dev`.

- [ ] **Step 6: Verify `.env` is ignored by git**

Run:

```bash
git status --short
```

Expected: `.env` does **not** appear. `.env.tpl` and `.gitignore` appear as untracked/modified.

- [ ] **Step 7: Verify `secrets:run` works**

Run:

```bash
pnpm secrets:run -- node -e "console.log(process.env.WORKSPACE_NAME)"
```

Expected output: `learnwren-dev`. The secret is injected into the process environment without ever being written to disk.

- [ ] **Step 8: Commit**

```bash
git add .gitignore .env.tpl
git commit -m "feat(secrets): 1Password pipeline + canary entry

Adds .env.tpl referencing op://learnwren/Workspace/name and the
secrets:render / secrets:run scripts. .env is gitignored. Vault
contract documented in docs/secrets.md (next task)."
```

---

## Task 11: Document the secrets pipeline

**Files:**
- Create: `docs/secrets.md`

- [ ] **Step 1: Create `docs/secrets.md`**

```markdown
# Secrets and 1Password

`learnwren` keeps secrets out of the repo using the [1Password CLI](https://developer.1password.com/docs/cli/). `.env.tpl` (committed) references `op://...` paths; `.env` (gitignored) is rendered locally on demand.

## Prerequisites

- 1Password CLI ≥ 2.x installed and on `PATH`.
- `op signin` to an account that has access to the `learnwren` vault.
- Membership in the `learnwren` vault.

## Daily workflow

Render `.env` from `.env.tpl`:

    pnpm secrets:render

Re-run after rotating a secret or adding a new entry to `.env.tpl`.

Run a one-off command with secrets injected at the process boundary (never written to disk):

    pnpm secrets:run -- <command>

`.env` is gitignored. Never commit it.

## Vault contract

Vault: `learnwren`

| Item | Field | Purpose | Required by |
|---|---|---|---|
| `Workspace` | `name` | Canary; value `learnwren-dev`; proves the pipeline works | this spec |

Future entries land here as later specs introduce them.

## Adding a secret

1. Create the secret in the `learnwren` vault under a clearly-named item.
2. Add a line to `.env.tpl` of the form `MY_VAR=op://learnwren/Item/field`.
3. Append a row to the vault contract table above describing what the secret is and which spec needs it.
4. Commit `.env.tpl` and this file (`docs/secrets.md`). **Never** commit `.env`.

## Troubleshooting

- **`op: not signed in`** — run `op signin` and try again.
- **`pnpm secrets:render` produces an empty `.env` or only comments** — check that the referenced items exist in the `learnwren` vault and that your account has read access.
- **`WORKSPACE_NAME` is unset after render** — confirm the `Workspace` item has a field literally named `name` (case-sensitive) holding the value `learnwren-dev`.
```

- [ ] **Step 2: Verify the rendered render-and-grep cycle still works**

```bash
pnpm secrets:render && grep WORKSPACE_NAME .env
```

Expected: `WORKSPACE_NAME=learnwren-dev`.

- [ ] **Step 3: Commit**

```bash
git add docs/secrets.md
git commit -m "docs(secrets): document 1Password vault contract + workflow"
```

---

## Task 12: Update `docs/development.md`

**Files:**
- Modify: `docs/development.md`

- [ ] **Step 1: Update `docs/development.md`**

Replace the file contents with:

```markdown
# Development

This document captures the local development setup for Learn Wren. For product specifications, see `docs/epics/`. For design specs, see `docs/superpowers/specs/`. For secrets management, see `docs/secrets.md`.

## Prerequisites

- Node.js 22 (LTS). Pinned in `.nvmrc`. Install via `nvm install 22 && nvm use 22` or Volta.
- pnpm. Activated via Corepack: `corepack enable && corepack prepare pnpm@latest --activate`.
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

## What is and is not wired up

Current state: the monorepo exists, both apps run, and Firebase emulators are wired in.

- The Angular app renders a placeholder hero at `/` plus a dev-only "Dev tools" disclosure with a Firestore smoke widget.
- The NestJS app exposes `GET /api/health` and `GET /api/firestore-smoke`.
- Both apps import types from `@learnwren/shared-data-models`.
- `apps/api` consumes `@learnwren/api-firebase` for the firebase-admin handle.
- Firestore and Storage rules are deny-by-default; only `_smoke/{docId}` is readable/writable.

**Auth flows, per-collection rules, and DTO/validation are not yet wired.** Those are the subjects of the next two specs.
```

- [ ] **Step 2: Commit**

```bash
git add docs/development.md
git commit -m "docs(development): emulator + secrets sections"
```

---

## Task 13: Final Definition-of-Done walkthrough

**Goal:** Confirm every command in the spec's §8 DoD table behaves as advertised.

- [ ] **Step 1: Render secrets**

```bash
pnpm secrets:render && grep WORKSPACE_NAME .env
```

Expected: `WORKSPACE_NAME=learnwren-dev`.

- [ ] **Step 2: Lint**

```bash
pnpm lint
```

Expected: all projects (`web`, `web-e2e`, `api`, `api-e2e`, `shared-data-models`, `api-firebase`) PASS.

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: PASS everywhere.

- [ ] **Step 4: Unit tests**

```bash
pnpm test
```

Expected: all unit tests PASS — including:
- `shared-data-models.spec.ts` (existing).
- `app.controller.spec.ts` (existing).
- `app.spec.ts` (existing web hero test).
- `firebase-admin.module.spec.ts` (new).
- `firestore-smoke.controller.spec.ts` (new).
- `firestore-smoke.component.spec.ts` (new).

- [ ] **Step 5: Build**

```bash
pnpm build
```

Expected: `dist/apps/web`, `dist/apps/api`, and (if buildable, depending on the lib's `bundler=none` config) `dist/libs/api-firebase` produced. No build errors.

- [ ] **Step 6: E2E**

```bash
pnpm e2e
```

Expected: existing Playwright suites pass unchanged — `web-e2e` (loads `/` and asserts the hero text) and `api-e2e` (hits `/api/health` and asserts the JSON shape).

- [ ] **Step 7: Manual integration walkthrough**

Terminal 1:

```bash
pnpm emulators
```

Terminal 2:

```bash
pnpm start
```

Then in a third terminal / browser:

| Check | Expected |
|---|---|
| `curl -sS http://localhost:3333/api/health` | `{"status":"ok","version":"...","serverTime":"..."}` |
| `curl -sS http://localhost:3333/api/firestore-smoke` | `{"docId":"...","written":{"writtenAt":"..."},"readBack":{"writtenAt":"..."}}` (matching timestamps) |
| Browser `http://localhost:4200` | "Learn Wren" hero renders. |
| Click "Dev tools" disclosure → "Run Firestore smoke" | A JSON blob renders below the button showing `docId`, `writtenAt`, `readBack`. |
| Browser `http://127.0.0.1:4000` Firestore tab | `_smoke/{docId}` documents from both runs visible. |

Stop both processes with Ctrl+C.

- [ ] **Step 8: Confirm clean working tree**

```bash
git status
```

Expected: clean working tree (or just `.env` listed as ignored — not staged). All commits from earlier tasks present in `git log`.

- [ ] **Step 9: Final summary commit (optional)**

If the DoD walkthrough surfaced minor doc tweaks (port conflicts, missing prerequisite notes), capture them in `docs/development.md` and commit:

```bash
git add docs/development.md
git commit -m "docs(development): notes from DoD walkthrough"
```

If nothing surfaced, skip this step. The spec is then complete.

---

## Rollback

If a task needs to be unwound:

- Tasks 1–9 are pure additions or self-contained edits to single files. Each task's commit can be reverted independently with `git revert <sha>`.
- Tasks 10–12 modify documentation and config; reverting is safe.
- The only cross-task coupling is Task 4 → Task 5 (the index re-export references the module). If Task 5 is reverted, also revert Task 4 to keep the lib's `index.ts` consistent.

## Out of scope (do not implement here)

- Real Firebase project provisioning, `firebase deploy`, CI deploy.
- Cloud Functions packaging of `apps/api`.
- Auth flows (UC-01-01..04), Firebase Auth provider configuration, custom claims, lockout logic.
- Per-collection Firestore/Storage rules.
- Helper rule functions (`isAuthenticated`, `isOwner`, `isAdmin`, `hasRole`).
- DTO/validation framework, `ValidationPipe`, error envelopes.
- App Check, Analytics, Performance Monitoring.
- Emulator-backed integration tests in CI.
- Environment files (`apps/web/src/environments/environment.ts`) — the auth spec introduces these.

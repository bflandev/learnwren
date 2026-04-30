# Firebase Project Connection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the existing emulators-only Firebase wiring to a real Firebase project the user has provisioned. Make SDK config environment-driven so `LEARNWREN_FIREBASE_TARGET=production` flips both `apps/web` and `apps/api` from emulator-mode to real-project-mode without code changes, while leaving the unflagged dev experience byte-identical.

**Architecture:** Rules are split into a permissive emulator file (`firestore.emulator.rules`, referenced by `firebase.json`) and a deploy-safe production file (`firestore.rules`). `apps/web` reads its Firebase Web SDK config from a generated `apps/web/src/environments/environment.ts` (gitignored), produced by a build script `tools/web/build-environment.ts` that branches on `LEARNWREN_FIREBASE_TARGET` and pulls production values from 1Password-rendered env vars. The script is wired into `web`'s Nx targets via `dependsOn`, so any `serve`/`build`/`test`/`lint` regenerates first. `libs/api-firebase` branches its Admin SDK init on the same env var: emulator mode keeps current behavior, production mode initializes against a real project ID with either ADC (Cloud Functions runtime) or `FIREBASE_SERVICE_ACCOUNT_JSON_PATH` (local-against-prod). New 1Password vault items deliver Web SDK config and Admin SDK project ID; documentation captures the manual console-side prerequisites and the new mode-switching commands.

**Tech Stack:** Nx 22.7 monorepo, Angular 21.2 (standalone, esbuild), NestJS 11, AngularFire 21.0.0-rc.0, `firebase`, `firebase-admin`, `firebase-tools`, Vitest (via `@angular/build:unit-test` for `web`), tsx (new devDep — TypeScript script runner for the build-environment generator), 1Password CLI.

**Spec:** `docs/superpowers/specs/2026-04-30-firebase-project-connection-design.md`

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `firestore.emulator.rules` | Emulator-only rules: deny-by-default plus the `_smoke/{docId}` allow rule. Identical to the current `firestore.rules`. |
| `apps/web/src/environments/firebase-target.ts` | Single-purpose module exporting `firebaseTargetMode()`, the normalizer that maps a raw env-var value (or anything) to `'emulator' \| 'production'`. |
| `apps/web/src/environments/firebase-target.spec.ts` | Vitest spec — three cases for `firebaseTargetMode()`: unset, `'production'`, garbage string. |
| `tools/web/build-environment.ts` | Node script (run via `tsx`) that reads `LEARNWREN_FIREBASE_TARGET` + the six `LEARNWREN_WEB_FIREBASE_*` env vars and writes `apps/web/src/environments/environment.ts`. Idempotent. |

### Modified files

| Path | Change |
|---|---|
| `firestore.rules` | Rewritten to deploy-safe deny-by-default. The `_smoke/{docId}` block moves to `firestore.emulator.rules`. |
| `firebase.json` | `firestore.rules` pointer changed from `"firestore.rules"` to `"firestore.emulator.rules"`. |
| `.firebaserc` | Add `production` alias mapped to the real project ID supplied by the user. `default` stays `demo-learnwren`. |
| `.gitignore` | Append `apps/web/src/environments/environment.ts`. |
| `package.json` | Add `tsx` to `devDependencies`. No new top-level scripts. |
| `apps/web/project.json` | Add `generate-environment` target; add `dependsOn: ["generate-environment"]` to `build`, `serve`, `test`, `lint`. |
| `apps/web/src/app/app.config.ts` | Replace hardcoded `FIREBASE_CONFIG` and unconditional `connectXEmulator` calls with reads from `environment.ts` + emulator-mode gating. |
| `libs/api-firebase/src/lib/firebase-admin.module.ts` | Branch init on `LEARNWREN_FIREBASE_TARGET`: emulator path keeps current behavior; production path uses real project ID + ADC or `FIREBASE_SERVICE_ACCOUNT_JSON_PATH`. Add a `required()` helper. |
| `libs/api-firebase/src/lib/firebase-admin.module.spec.ts` | Add three new cases: production-mode init with cert path, production-mode init with ADC fallback, production-mode missing-project-id failure. |
| `.env.tpl` | New sections for Web SDK config (six vars) and Admin SDK config (project ID). |
| `docs/secrets.md` | Append Vault Contract rows for the new items, region note, and a service-account file convention subsection. |
| `docs/development.md` | Append a **Real-project mode** subsection: prerequisite checklist, run commands, verification, switch-back instructions. |

### Generated files (not in git)

| Path | Source of truth |
|---|---|
| `apps/web/src/environments/environment.ts` | Always produced by `tools/web/build-environment.ts`. Gitignored. |

### Untouched (must remain green)

- `apps/web-e2e`, `apps/api-e2e` — Playwright suites continue to pass unchanged in emulator mode.
- `libs/shared-data-models` — no changes.
- `apps/api/src/app/app.controller.ts` (`GET /api/health`) and `apps/api/src/app/firestore-smoke/*` — public surface unchanged; the smoke endpoint switches its target via the Admin SDK refactor without code change in the controller.
- `firestore.indexes.json`, `storage.rules` — unchanged.

---

## User Prerequisites (Manual, Done Out-of-Band)

This plan assumes the user has already done the following in the Firebase console for the real project they created. The plan does NOT include these steps. If they aren't done, Tasks 7 and 10 will fail at the verification step.

1. Project upgraded to **Blaze (pay-as-you-go)** plan.
2. **Authentication** → Email/Password sign-in enabled.
3. **Firestore Database** → created in **Native mode**, region recorded.
4. **Cloud Storage** → default bucket created in the same region.
5. **Web app registered** via the CLI (the console UI moves; the CLI doesn't):

   ```
   firebase login                                                  # one-time
   firebase --project <project-id> apps:create WEB "Learn Wren Web"
   firebase --project <project-id> apps:sdkconfig WEB <appId-from-create-output>
   ```

   The `apps:sdkconfig` output yields the six fields (`apiKey`, `authDomain`, `projectId`, `appId`, `storageBucket`, `messagingSenderId`) needed for the 1Password vault.
6. **Service account JSON** downloaded from the Firebase console (Project Settings → Service accounts → "Generate new private key" at time of writing — or via the GCP console for the same project if the Firebase UI has moved). File saved to `~/.learnwren/service-account.json` (or any absolute path outside the repo). User has this path memorized for export as `FIREBASE_SERVICE_ACCOUNT_JSON_PATH` later.
7. **1Password vault `learnwren`** populated with two new items (item names exact, fields exact):
   - `Web SDK Config`: fields `apiKey`, `authDomain`, `projectId`, `appId`, `storageBucket`, `messagingSenderId`.
   - `Admin SDK Config`: fields `projectId`, `firestoreRegion` (the latter is documentation-only).

The user's real project ID (the value of `Web SDK Config.projectId` and `Admin SDK Config.projectId`, which match) is also needed for Task 2's `.firebaserc` edit.

---

## Task 1: Split Firestore rules into emulator + production files

**Files:**
- Create: `firestore.emulator.rules`
- Modify: `firestore.rules`
- Modify: `firebase.json`

- [ ] **Step 1: Copy current `firestore.rules` to `firestore.emulator.rules`**

```bash
cp firestore.rules firestore.emulator.rules
```

Expected: `firestore.emulator.rules` is created with the current contents (deny-by-default + `_smoke` allow rule).

- [ ] **Step 2: Update the comment in `firestore.emulator.rules` to reflect its new identity**

Open `firestore.emulator.rules` and replace the leading comment block (`// _smoke: dev-only emulator wire smoke test for the Firebase wiring spec.`) with:

```
    // _smoke: dev-only emulator wire smoke test.
    // This file is the rules oracle ONLY for the Firebase emulator suite.
    // The deploy-safe rules file is firestore.rules, which omits this block.
    // firebase.json points at firestore.emulator.rules so emulator runs see this rule.
```

The rest of `firestore.emulator.rules` stays unchanged.

- [ ] **Step 3: Rewrite `firestore.rules` to deploy-safe content**

Replace the entire contents of `firestore.rules` with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Deploy-safe rules. Per-collection rules and the
    // isAuthenticated/isOwner/isAdmin/hasRole helpers are introduced
    // in the auth spec, not this one. The emulator path uses
    // firestore.emulator.rules which adds a _smoke escape hatch.
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

- [ ] **Step 4: Update `firebase.json` to point the rules pointer at the emulator file**

Open `firebase.json`. Replace `"rules": "firestore.rules"` with `"rules": "firestore.emulator.rules"`. The full file should now read:

```json
{
  "firestore": {
    "rules": "firestore.emulator.rules",
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

- [ ] **Step 5: Boot the emulators and confirm rules still load**

In one terminal:

```bash
pnpm emulators
```

Expected: emulator suite starts; the Firestore emulator log line shows it loaded `firestore.emulator.rules`. No `Could not find rules file` errors.

- [ ] **Step 6: Verify the smoke widget still round-trips**

Leave emulators running. In another terminal:

```bash
pnpm start
```

Open `http://localhost:4200`, expand the **Dev tools** disclosure, click **Run Firestore smoke**. Expected: write + read panels both populate with matching timestamps. Stop both processes with Ctrl+C.

- [ ] **Step 7: Confirm `firestore.rules` does NOT contain `_smoke`**

```bash
grep -n "_smoke" firestore.rules || echo "OK: no _smoke in production rules"
```

Expected output: `OK: no _smoke in production rules`.

- [ ] **Step 8: Commit**

```bash
git add firestore.rules firestore.emulator.rules firebase.json
git commit -m "$(cat <<'EOF'
feat(firebase): split firestore rules into emulator + production files

firestore.emulator.rules carries the _smoke escape hatch for the local
emulator. firestore.rules drops it and is deploy-safe deny-by-default.
firebase.json points at the emulator file so existing dev flows are
unchanged; the deploy spec will introduce the production-rules path.
EOF
)"
```

---

## Task 2: Add `production` alias to `.firebaserc`

**Files:**
- Modify: `.firebaserc`

This task requires the user to supply the real Firebase project ID (the lowercase string from Project Settings, e.g., `learnwren-prod` or whatever they named it). It is referenced below as `<REAL_PROJECT_ID>` — substitute the actual value before committing.

- [ ] **Step 1: Replace `.firebaserc` with the two-alias form**

Open `.firebaserc` and replace its contents with:

```json
{
  "projects": {
    "default": "demo-learnwren",
    "production": "<REAL_PROJECT_ID>"
  }
}
```

Replace `<REAL_PROJECT_ID>` with the actual project ID from the user's Firebase console.

- [ ] **Step 2: Verify both aliases resolve via the firebase CLI**

```bash
pnpm exec firebase --project default projects:list 2>&1 | head -3
pnpm exec firebase --project production projects:list 2>&1 | head -3
```

Expected: neither command prints `Invalid project selection` or `Could not find project` errors. (`projects:list` may prompt for login on first run; if so, run `pnpm exec firebase login` once and retry. The list output itself isn't validated here — only that the alias is recognized.)

- [ ] **Step 3: Confirm emulators still pick up the default alias**

```bash
pnpm emulators
```

Expected: the emulator suite log line shows `Project: demo-learnwren`. Stop with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add .firebaserc
git commit -m "$(cat <<'EOF'
feat(firebase): add production alias to .firebaserc

default stays demo-learnwren so unflagged commands keep targeting the
emulator. production is the explicit alias for real-project work
(deploys, console-paired CLI commands).
EOF
)"
```

---

## Task 3: Add `firebaseTargetMode()` normalizer + spec (TDD)

**Files:**
- Create: `apps/web/src/environments/firebase-target.ts`
- Create: `apps/web/src/environments/firebase-target.spec.ts`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p apps/web/src/environments
```

- [ ] **Step 2: Write the failing spec**

Create `apps/web/src/environments/firebase-target.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { firebaseTargetMode } from './firebase-target';

describe('firebaseTargetMode', () => {
  it('returns "emulator" when the input is undefined', () => {
    expect(firebaseTargetMode(undefined)).toBe('emulator');
  });

  it('returns "emulator" when the input is the empty string', () => {
    expect(firebaseTargetMode('')).toBe('emulator');
  });

  it('returns "production" when the input is exactly "production"', () => {
    expect(firebaseTargetMode('production')).toBe('production');
  });

  it('returns "emulator" when the input is "emulator"', () => {
    expect(firebaseTargetMode('emulator')).toBe('emulator');
  });

  it('returns "emulator" when the input is a garbage value', () => {
    expect(firebaseTargetMode('banana')).toBe('emulator');
  });

  it('treats casing strictly — "PRODUCTION" is not "production"', () => {
    expect(firebaseTargetMode('PRODUCTION')).toBe('emulator');
  });
});
```

- [ ] **Step 3: Run the spec and confirm it fails for the right reason**

```bash
pnpm exec nx test web -- --reporter=verbose 2>&1 | tail -30
```

Expected: the `firebase-target.spec.ts` cases FAIL with a module-resolution error (`Cannot find module './firebase-target'`). Other web tests must continue to pass.

- [ ] **Step 4: Implement `firebase-target.ts`**

Create `apps/web/src/environments/firebase-target.ts`:

```ts
export type FirebaseTargetMode = 'emulator' | 'production';

/**
 * Maps any raw input (typically the LEARNWREN_FIREBASE_TARGET env var, read at
 * build time) to a strictly-typed mode. Unknown values fall back to 'emulator'
 * so a typo in the shell never silently aims at a real Firebase project.
 */
export function firebaseTargetMode(input: string | undefined): FirebaseTargetMode {
  return input === 'production' ? 'production' : 'emulator';
}
```

- [ ] **Step 5: Run the spec and confirm it passes**

```bash
pnpm exec nx test web -- --reporter=verbose 2>&1 | tail -30
```

Expected: all six new cases pass. Other web tests still pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/environments/firebase-target.ts apps/web/src/environments/firebase-target.spec.ts
git commit -m "$(cat <<'EOF'
feat(web): firebaseTargetMode() normalizer for env-driven Firebase target

Single-purpose helper that maps any raw env-var value to 'emulator' |
'production', defaulting unknown values to 'emulator' so a typo can
never silently aim at production. Consumed at build time by the
environment generator (next task) and at runtime via the baked-in
mode in environment.ts.
EOF
)"
```

---

## Task 4: Build-environment generator + Nx wire-up

**Files:**
- Modify: `package.json` (add `tsx` devDep)
- Create: `tools/web/build-environment.ts`
- Modify: `.gitignore`
- Modify: `apps/web/project.json`

- [ ] **Step 1: Add `tsx` as a devDep**

```bash
pnpm add -D tsx
```

Expected: install completes; `package.json` `devDependencies` now contains `tsx`. The exact version is pnpm-resolved.

- [ ] **Step 2: Create the `tools/web` directory**

```bash
mkdir -p tools/web
```

- [ ] **Step 3: Write the build-environment script**

Create `tools/web/build-environment.ts`:

```ts
#!/usr/bin/env tsx
/**
 * Generates apps/web/src/environments/environment.ts from the current process
 * environment. Always overwrites. Idempotent in emulator mode.
 *
 * Inputs (env):
 *   LEARNWREN_FIREBASE_TARGET                'emulator' | 'production' (default 'emulator')
 *
 * Required only when target=production:
 *   LEARNWREN_WEB_FIREBASE_API_KEY
 *   LEARNWREN_WEB_FIREBASE_AUTH_DOMAIN
 *   LEARNWREN_WEB_FIREBASE_PROJECT_ID
 *   LEARNWREN_WEB_FIREBASE_APP_ID
 *   LEARNWREN_WEB_FIREBASE_STORAGE_BUCKET
 *   LEARNWREN_WEB_FIREBASE_MESSAGING_SENDER_ID
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { firebaseTargetMode } from '../../apps/web/src/environments/firebase-target.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const OUTPUT_PATH = resolve(REPO_ROOT, 'apps/web/src/environments/environment.ts');

const EMULATOR_PROJECT_ID = 'demo-learnwren';

const EMULATOR_HOSTS = {
  auth:      'http://127.0.0.1:9099',
  firestore: { host: '127.0.0.1', port: 8080 },
  storage:   { host: '127.0.0.1', port: 9199 },
} as const;

interface FirebaseConfig {
  apiKey?: string;
  authDomain?: string;
  projectId: string;
  appId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[build-environment] LEARNWREN_FIREBASE_TARGET=production requires ${name} to be set.`,
    );
  }
  return value;
}

function buildConfig(mode: 'emulator' | 'production'): FirebaseConfig {
  if (mode === 'emulator') {
    return { projectId: EMULATOR_PROJECT_ID };
  }
  return {
    apiKey:            required('LEARNWREN_WEB_FIREBASE_API_KEY'),
    authDomain:        required('LEARNWREN_WEB_FIREBASE_AUTH_DOMAIN'),
    projectId:         required('LEARNWREN_WEB_FIREBASE_PROJECT_ID'),
    appId:             required('LEARNWREN_WEB_FIREBASE_APP_ID'),
    storageBucket:     required('LEARNWREN_WEB_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: required('LEARNWREN_WEB_FIREBASE_MESSAGING_SENDER_ID'),
  };
}

function render(mode: 'emulator' | 'production', config: FirebaseConfig): string {
  return `// AUTO-GENERATED by tools/web/build-environment.ts. Do NOT commit.
// Regenerate with: pnpm exec nx run web:generate-environment
// Source of truth: tools/web/build-environment.ts + the LEARNWREN_* env vars.

export const environment = {
  firebaseTargetMode: ${JSON.stringify(mode)} as const,
  firebase: ${JSON.stringify(config, null, 2)},
  emulatorHosts: ${JSON.stringify(EMULATOR_HOSTS, null, 2)},
} as const;
`;
}

function main(): void {
  const mode = firebaseTargetMode(process.env['LEARNWREN_FIREBASE_TARGET']);
  const config = buildConfig(mode);
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, render(mode, config), 'utf8');
  // eslint-disable-next-line no-console
  console.log(`[build-environment] wrote ${OUTPUT_PATH} (mode=${mode})`);
}

main();
```

The import path `../../apps/web/src/environments/firebase-target.js` uses the `.js` extension because `tsx` resolves both `.ts` and `.js` requests through the same TS transformer. Either extension works at runtime; `.js` is the ESM-correct form.

- [ ] **Step 4: Add the generated file to `.gitignore`**

Open `.gitignore` and append:

```
apps/web/src/environments/environment.ts
```

- [ ] **Step 5: Add `generate-environment` target and wire `dependsOn`**

Open `apps/web/project.json`. Replace the `targets` block with:

```json
"targets": {
  "generate-environment": {
    "executor": "nx:run-commands",
    "options": {
      "command": "tsx tools/web/build-environment.ts",
      "cwd": "{workspaceRoot}"
    },
    "outputs": ["{workspaceRoot}/apps/web/src/environments/environment.ts"]
  },
  "build": {
    "executor": "@angular/build:application",
    "outputs": ["{options.outputPath}"],
    "dependsOn": ["generate-environment"],
    "options": {
      "outputPath": "dist/apps/web",
      "browser": "apps/web/src/main.ts",
      "tsConfig": "apps/web/tsconfig.app.json",
      "inlineStyleLanguage": "scss",
      "assets": [
        {
          "glob": "**/*",
          "input": "apps/web/public"
        }
      ],
      "styles": ["apps/web/src/styles.scss"]
    },
    "configurations": {
      "production": {
        "budgets": [
          {
            "type": "initial",
            "maximumWarning": "500kb",
            "maximumError": "1mb"
          },
          {
            "type": "anyComponentStyle",
            "maximumWarning": "4kb",
            "maximumError": "8kb"
          }
        ],
        "outputHashing": "all"
      },
      "development": {
        "optimization": false,
        "extractLicenses": false,
        "sourceMap": true
      }
    },
    "defaultConfiguration": "production"
  },
  "serve": {
    "continuous": true,
    "executor": "@angular/build:dev-server",
    "dependsOn": ["generate-environment"],
    "configurations": {
      "production": {
        "buildTarget": "web:build:production"
      },
      "development": {
        "buildTarget": "web:build:development"
      }
    },
    "defaultConfiguration": "development"
  },
  "lint": {
    "executor": "@nx/eslint:lint",
    "dependsOn": ["generate-environment"]
  },
  "test": {
    "executor": "@angular/build:unit-test",
    "dependsOn": ["generate-environment"],
    "options": {}
  },
  "serve-static": {
    "continuous": true,
    "executor": "@nx/web:file-server",
    "options": {
      "buildTarget": "web:build",
      "port": 4200,
      "staticFilePath": "dist/apps/web/browser",
      "spa": true
    }
  }
}
```

The four affected targets (`build`, `serve`, `test`, `lint`) gain `"dependsOn": ["generate-environment"]`. `serve-static` and any other downstream target reach `generate-environment` transitively through `build`.

- [ ] **Step 6: Run the generator manually and inspect the output**

```bash
pnpm exec nx run web:generate-environment
cat apps/web/src/environments/environment.ts
```

Expected: the script prints `[build-environment] wrote …/environment.ts (mode=emulator)`, and the generated file contains:

```ts
export const environment = {
  firebaseTargetMode: "emulator" as const,
  firebase: {
    "projectId": "demo-learnwren"
  },
  emulatorHosts: {
    ...
  },
} as const;
```

- [ ] **Step 7: Confirm `nx test web` passes (now that environment.ts exists and `dependsOn` is wired)**

```bash
pnpm exec nx test web 2>&1 | tail -30
```

Expected: all web specs pass, including the new `firebase-target.spec.ts`.

- [ ] **Step 8: Confirm production-mode failure messaging**

```bash
LEARNWREN_FIREBASE_TARGET=production pnpm exec nx run web:generate-environment 2>&1 | tail -5
```

Expected: the script exits non-zero with `[build-environment] LEARNWREN_FIREBASE_TARGET=production requires LEARNWREN_WEB_FIREBASE_API_KEY to be set.` (or another `LEARNWREN_WEB_*` var, depending on shell ordering).

- [ ] **Step 9: Confirm the generated file is gitignored**

```bash
git status apps/web/src/environments/environment.ts
```

Expected output: nothing — the file is gitignored and won't appear.

- [ ] **Step 10: Restore the emulator-mode environment file**

```bash
pnpm exec nx run web:generate-environment
```

Expected: file regenerated in emulator mode.

- [ ] **Step 11: Commit**

```bash
git add package.json pnpm-lock.yaml tools/web/build-environment.ts .gitignore apps/web/project.json
git commit -m "$(cat <<'EOF'
feat(web): build-time environment generator with target-mode branching

tools/web/build-environment.ts emits apps/web/src/environments/environment.ts
based on LEARNWREN_FIREBASE_TARGET (default emulator). Production mode
requires the six LEARNWREN_WEB_FIREBASE_* env vars and fails fast on
any missing value. The generator is wired as dependsOn for web's
build/serve/test/lint targets so the file is always present and fresh.
The generated file is gitignored.
EOF
)"
```

---

## Task 5: Refactor `app.config.ts` to read from `environment.ts`

**Files:**
- Modify: `apps/web/src/app/app.config.ts`

- [ ] **Step 1: Replace `apps/web/src/app/app.config.ts`**

Replace the entire contents of `apps/web/src/app/app.config.ts` with:

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

import { environment } from '../environments/environment';
import { appRoutes } from './app.routes';

const { firebaseTargetMode, firebase, emulatorHosts } = environment;

if (firebaseTargetMode === 'production') {
  // Single, deliberate signal that we're not pointed at the emulator.
  // eslint-disable-next-line no-console
  console.warn('[learnwren] Firebase target = production');
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes),
    provideFirebaseApp(() => initializeApp(firebase)),
    provideAuth(() => {
      const auth = getAuth();
      if (firebaseTargetMode === 'emulator') {
        connectAuthEmulator(auth, emulatorHosts.auth, {
          disableWarnings: true,
        });
      }
      return auth;
    }),
    provideFirestore(() => {
      const db = getFirestore();
      if (firebaseTargetMode === 'emulator') {
        connectFirestoreEmulator(
          db,
          emulatorHosts.firestore.host,
          emulatorHosts.firestore.port,
        );
      }
      return db;
    }),
    provideStorage(() => {
      const storage = getStorage();
      if (firebaseTargetMode === 'emulator') {
        connectStorageEmulator(
          storage,
          emulatorHosts.storage.host,
          emulatorHosts.storage.port,
        );
      }
      return storage;
    }),
  ],
};
```

The `// TODO(auth-spec)` comment from the previous version goes away — this commit IS the gating implementation.

- [ ] **Step 2: Verify `nx typecheck web` (or `nx build web`) passes**

```bash
pnpm exec nx build web 2>&1 | tail -30
```

Expected: build succeeds. The `dependsOn: ["generate-environment"]` ensures `environment.ts` exists before tsc runs.

- [ ] **Step 3: Verify `nx test web` still passes**

```bash
pnpm exec nx test web 2>&1 | tail -30
```

Expected: all specs pass — `firebase-target.spec.ts`, the existing app spec, and the smoke component spec.

- [ ] **Step 4: Boot the app in default (emulator) mode and verify**

In one terminal:

```bash
pnpm emulators
```

In another:

```bash
pnpm start:web
```

Open `http://localhost:4200` in a browser, expand **Dev tools**, click **Run Firestore smoke**. Expected: write/read panels populate. Browser console should show NO `[learnwren] Firebase target = production` warning. Network tab shows traffic to `127.0.0.1:8080` (Firestore emulator). Stop both processes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/app.config.ts
git commit -m "$(cat <<'EOF'
refactor(web): drive Firebase bootstrap from environment.ts

app.config.ts now reads firebase config + target mode from the
generated environment file rather than hardcoding demo-learnwren.
Emulator connections are gated behind firebaseTargetMode === 'emulator'.
A single console.warn fires once at boot in production mode so the
developer is never surprised about which mode they're in.
EOF
)"
```

---

## Task 6: Refactor `libs/api-firebase` for env-driven mode (TDD)

**Files:**
- Modify: `libs/api-firebase/src/lib/firebase-admin.module.ts`
- Modify: `libs/api-firebase/src/lib/firebase-admin.module.spec.ts`

This is the api-side mirror of Task 5. Tests are written first per repo TDD convention.

- [ ] **Step 1: Read the current spec to know what stays**

```bash
cat libs/api-firebase/src/lib/firebase-admin.module.spec.ts
```

Note the existing three describe-block tests (default emulator init, no-overwrite of pre-set hosts, single-init across multiple imports). They stay; new tests are added.

- [ ] **Step 2: Replace `libs/api-firebase/src/lib/firebase-admin.module.spec.ts`**

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

const TARGET_KEYS = [
  'LEARNWREN_FIREBASE_TARGET',
  'LEARNWREN_API_FIREBASE_PROJECT_ID',
  'FIREBASE_SERVICE_ACCOUNT_JSON_PATH',
] as const;

async function resetEnvAndApps(): Promise<void> {
  for (const key of EMULATOR_ENV_KEYS) delete process.env[key];
  for (const key of TARGET_KEYS) delete process.env[key];
  await Promise.all(admin.apps.map((a) => a?.delete()));
}

describe('FirebaseAdminModule', () => {
  beforeEach(async () => {
    await resetEnvAndApps();
  });

  afterEach(async () => {
    await resetEnvAndApps();
  });

  describe('emulator mode (default)', () => {
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

    it('initializes firebase-admin app exactly once across multiple imports', async () => {
      await Test.createTestingModule({ imports: [FirebaseAdminModule.forRoot()] }).compile();
      await Test.createTestingModule({ imports: [FirebaseAdminModule.forRoot()] }).compile();
      expect(admin.apps.length).toBe(1);
    });

    it('treats LEARNWREN_FIREBASE_TARGET=emulator the same as unset', async () => {
      process.env['LEARNWREN_FIREBASE_TARGET'] = 'emulator';
      await Test.createTestingModule({ imports: [FirebaseAdminModule.forRoot()] }).compile();
      expect(process.env['FIREBASE_AUTH_EMULATOR_HOST']).toBe('127.0.0.1:9099');
    });

    it('falls back to emulator when LEARNWREN_FIREBASE_TARGET is a garbage value', async () => {
      process.env['LEARNWREN_FIREBASE_TARGET'] = 'banana';
      await Test.createTestingModule({ imports: [FirebaseAdminModule.forRoot()] }).compile();
      expect(process.env['FIREBASE_AUTH_EMULATOR_HOST']).toBe('127.0.0.1:9099');
    });
  });

  describe('production mode', () => {
    it('throws a clear error when LEARNWREN_API_FIREBASE_PROJECT_ID is unset', async () => {
      process.env['LEARNWREN_FIREBASE_TARGET'] = 'production';

      await expect(
        Test.createTestingModule({
          imports: [FirebaseAdminModule.forRoot()],
        }).compile(),
      ).rejects.toThrow(/LEARNWREN_API_FIREBASE_PROJECT_ID/);
    });

    it('initializes against the real project ID and does NOT set emulator env vars', async () => {
      process.env['LEARNWREN_FIREBASE_TARGET'] = 'production';
      process.env['LEARNWREN_API_FIREBASE_PROJECT_ID'] = 'test-prod-id';
      // no service-account path → ADC path

      const moduleRef = await Test.createTestingModule({
        imports: [FirebaseAdminModule.forRoot()],
      }).compile();

      expect(process.env['FIREBASE_AUTH_EMULATOR_HOST']).toBeUndefined();
      expect(process.env['FIRESTORE_EMULATOR_HOST']).toBeUndefined();
      expect(process.env['FIREBASE_STORAGE_EMULATOR_HOST']).toBeUndefined();

      expect(admin.apps.length).toBe(1);
      expect(admin.apps[0]?.options.projectId).toBe('test-prod-id');

      expect(moduleRef.get(FIRESTORE)).toBeDefined();
      expect(moduleRef.get(FIREBASE_AUTH)).toBeDefined();
      expect(moduleRef.get(FIREBASE_STORAGE)).toBeDefined();
    });

    it('initializes with cert credential when FIREBASE_SERVICE_ACCOUNT_JSON_PATH is set', async () => {
      process.env['LEARNWREN_FIREBASE_TARGET'] = 'production';
      process.env['LEARNWREN_API_FIREBASE_PROJECT_ID'] = 'test-prod-id';
      // We don't actually want to read a real file in unit tests. firebase-admin
      // resolves credential.cert lazily — its presence is what we verify.
      process.env['FIREBASE_SERVICE_ACCOUNT_JSON_PATH'] = '/tmp/learnwren-test-sa.json';

      // Stub the file so admin.credential.cert can read it without exploding.
      const { writeFileSync } = await import('node:fs');
      writeFileSync(
        '/tmp/learnwren-test-sa.json',
        JSON.stringify({
          type: 'service_account',
          project_id: 'test-prod-id',
          private_key_id: 'x',
          private_key:
            '-----BEGIN PRIVATE KEY-----\nFAKEKEY\n-----END PRIVATE KEY-----\n',
          client_email: 'fake@test-prod-id.iam.gserviceaccount.com',
          client_id: '0',
        }),
      );

      const moduleRef = await Test.createTestingModule({
        imports: [FirebaseAdminModule.forRoot()],
      }).compile();

      expect(admin.apps.length).toBe(1);
      expect(admin.apps[0]?.options.projectId).toBe('test-prod-id');
      // Credential is set (vs undefined for the ADC path).
      expect(admin.apps[0]?.options.credential).toBeDefined();

      expect(moduleRef.get(FIRESTORE)).toBeDefined();
    });
  });
});
```

- [ ] **Step 3: Run the spec and confirm only the new cases fail**

```bash
pnpm exec nx test api-firebase 2>&1 | tail -40
```

Expected: the three existing emulator-mode cases still pass; the two new emulator-mode cases (`emulator the same as unset`, `garbage value`) probably pass already on the existing implementation; the three production-mode cases FAIL because the current module doesn't branch on `LEARNWREN_FIREBASE_TARGET`.

- [ ] **Step 4: Replace `libs/api-firebase/src/lib/firebase-admin.module.ts`**

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

type Mode = 'emulator' | 'production';

function resolveMode(): Mode {
  return process.env['LEARNWREN_FIREBASE_TARGET'] === 'production'
    ? 'production'
    : 'emulator';
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[FirebaseAdminModule] LEARNWREN_FIREBASE_TARGET=production requires ${name} to be set.`,
    );
  }
  return value;
}

function applyEmulatorEnvDefaults(): void {
  for (const [key, value] of Object.entries(DEFAULT_EMULATOR_HOSTS)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function ensureEmulatorAppInitialized(): admin.app.App {
  applyEmulatorEnvDefaults();
  const existing = admin.apps[0];
  if (existing) return existing;
  return admin.initializeApp({ projectId: EMULATOR_PROJECT_ID });
}

function ensureProductionAppInitialized(): admin.app.App {
  const projectId = required('LEARNWREN_API_FIREBASE_PROJECT_ID');
  const credentialPath = process.env['FIREBASE_SERVICE_ACCOUNT_JSON_PATH'];

  const existing = admin.apps[0];
  if (existing) return existing;

  if (credentialPath) {
    return admin.initializeApp({
      projectId,
      credential: admin.credential.cert(credentialPath),
    });
  }
  // ADC path — used when running on Firebase compute (Cloud Functions etc.).
  return admin.initializeApp({ projectId });
}

@Module({})
export class FirebaseAdminModule {
  static forRoot(): DynamicModule {
    const mode = resolveMode();
    const app =
      mode === 'production'
        ? ensureProductionAppInitialized()
        : ensureEmulatorAppInitialized();

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

- [ ] **Step 5: Run the spec and confirm all cases pass**

```bash
pnpm exec nx test api-firebase 2>&1 | tail -40
```

Expected: all eight cases pass (3 existing emulator + 2 new emulator + 3 new production).

- [ ] **Step 6: Confirm `nx test api` (which depends on `api-firebase`) still passes**

```bash
pnpm exec nx test api 2>&1 | tail -30
```

Expected: all existing api specs pass — the smoke controller spec uses a mocked Firestore handle, so it doesn't care about the new branching.

- [ ] **Step 7: Confirm emulator-mode end-to-end still works**

In one terminal:

```bash
pnpm emulators
```

In another:

```bash
pnpm start:api
```

Hit `http://localhost:3333/api/firestore-smoke` (e.g., via `curl`). Expected: returns `{ written: { writtenAt: <ISO> }, readBack: { writtenAt: <ISO> } }` with matching timestamps. Stop both processes.

- [ ] **Step 8: Commit**

```bash
git add libs/api-firebase/src/lib/firebase-admin.module.ts libs/api-firebase/src/lib/firebase-admin.module.spec.ts
git commit -m "$(cat <<'EOF'
refactor(api-firebase): branch Admin SDK init on LEARNWREN_FIREBASE_TARGET

Emulator mode (default, including unset and garbage values) preserves
current behavior — sets emulator host env vars and inits against
demo-learnwren. Production mode requires LEARNWREN_API_FIREBASE_PROJECT_ID
(fails fast if missing), uses ADC by default, and switches to
admin.credential.cert when FIREBASE_SERVICE_ACCOUNT_JSON_PATH is set.
EOF
)"
```

---

## Task 7: `.env.tpl` additions for Web + Admin SDK config

**Files:**
- Modify: `.env.tpl`

This task assumes the user has populated the `Web SDK Config` and `Admin SDK Config` items in the `learnwren` 1Password vault per the user-prerequisites checklist above.

- [ ] **Step 1: Replace `.env.tpl`**

Replace the entire contents of `.env.tpl` with:

```
# .env.tpl — 1Password secret template for learnwren
# Render .env with: pnpm secrets:render   (op inject -i .env.tpl -o .env)
# Run a one-off:    pnpm secrets:run -- <command>  (op run --env-file=.env.tpl -- <command>)
#
# DO NOT commit .env to version control (it is gitignored).

# ── Workspace identity (canary) ───────────────────────────────────────
# Round-trip proof that the op pipeline works. Non-secret value.
WORKSPACE_NAME=op://learnwren/Workspace/name

# ── Web SDK config (target=production) ────────────────────────────────
# Public-by-design Firebase Web SDK keys. Baked into apps/web at build
# time by tools/web/build-environment.ts when LEARNWREN_FIREBASE_TARGET=production.
LEARNWREN_WEB_FIREBASE_API_KEY=op://learnwren/Web SDK Config/apiKey
LEARNWREN_WEB_FIREBASE_AUTH_DOMAIN=op://learnwren/Web SDK Config/authDomain
LEARNWREN_WEB_FIREBASE_PROJECT_ID=op://learnwren/Web SDK Config/projectId
LEARNWREN_WEB_FIREBASE_APP_ID=op://learnwren/Web SDK Config/appId
LEARNWREN_WEB_FIREBASE_STORAGE_BUCKET=op://learnwren/Web SDK Config/storageBucket
LEARNWREN_WEB_FIREBASE_MESSAGING_SENDER_ID=op://learnwren/Web SDK Config/messagingSenderId

# ── Admin SDK config (target=production) ──────────────────────────────
# Real project ID used by libs/api-firebase when targeting production.
# Service-account JSON path (FIREBASE_SERVICE_ACCOUNT_JSON_PATH) is set
# in the developer's shell init, not here — the path is per-machine.
LEARNWREN_API_FIREBASE_PROJECT_ID=op://learnwren/Admin SDK Config/projectId

# ── Reserved for later specs ──────────────────────────────────────────
# Cloud Functions deploy spec:  FIREBASE_TOKEN
# DRM/transcoder spec:          DRM_API_KEY, TRANSCODER_WEBHOOK_SECRET
```

- [ ] **Step 2: Render `.env` and verify contents**

```bash
pnpm secrets:render
```

Expected: writes a `.env` file. Verify it contains the canary plus seven new variables:

```bash
grep -E '^(WORKSPACE_NAME|LEARNWREN_WEB_FIREBASE_|LEARNWREN_API_FIREBASE_PROJECT_ID)' .env | wc -l
```

Expected output: `8` (1 canary + 6 web + 1 api). If the count is lower, the user's 1Password vault items are missing fields — fix in 1Password and re-render.

- [ ] **Step 3: Confirm `.env` is still gitignored**

```bash
git status .env
```

Expected output: nothing — `.env` does not appear in `git status`.

- [ ] **Step 4: Commit**

```bash
git add .env.tpl
git commit -m "$(cat <<'EOF'
feat(secrets): add Web + Admin SDK config sections to .env.tpl

References six op:// paths under Web SDK Config (apiKey, authDomain,
projectId, appId, storageBucket, messagingSenderId) and one under
Admin SDK Config (projectId). Consumed at build time by the web
environment generator and at runtime by libs/api-firebase when
LEARNWREN_FIREBASE_TARGET=production.
EOF
)"
```

---

## Task 8: `docs/secrets.md` updates

**Files:**
- Modify: `docs/secrets.md`

- [ ] **Step 1: Read the current `docs/secrets.md` to understand its current structure**

```bash
cat docs/secrets.md
```

Note the existing Vault Contract table and the "Adding a secret" three-step procedure.

- [ ] **Step 2: Append new vault contract rows**

In `docs/secrets.md`, locate the existing Vault Contract table (the one with the `Workspace.name` row). Replace the entire table with:

```markdown
| Item | Field | Purpose | Required by |
|---|---|---|---|
| `Workspace` | `name` | Canary; value `learnwren-dev`; proves the pipeline works | wiring spec |
| `Web SDK Config` | `apiKey` | Firebase Web SDK | `LEARNWREN_FIREBASE_TARGET=production` |
| `Web SDK Config` | `authDomain` | Firebase Web SDK | `LEARNWREN_FIREBASE_TARGET=production` |
| `Web SDK Config` | `projectId` | Firebase Web SDK | `LEARNWREN_FIREBASE_TARGET=production` |
| `Web SDK Config` | `appId` | Firebase Web SDK | `LEARNWREN_FIREBASE_TARGET=production` |
| `Web SDK Config` | `storageBucket` | Firebase Web SDK | `LEARNWREN_FIREBASE_TARGET=production` |
| `Web SDK Config` | `messagingSenderId` | Firebase Web SDK | `LEARNWREN_FIREBASE_TARGET=production` |
| `Admin SDK Config` | `projectId` | Real Firebase project ID for the Admin SDK | `LEARNWREN_FIREBASE_TARGET=production` |
| `Admin SDK Config` | `firestoreRegion` | Documentation only — region recorded for future ops | reference |
```

- [ ] **Step 3: Append a Service-account JSON convention subsection**

At the end of `docs/secrets.md`, append:

```markdown
## Service-account JSON for local-against-prod runs

When running `apps/api` locally against the **real** Firebase project (i.e., `LEARNWREN_FIREBASE_TARGET=production` outside of Firebase compute), the Admin SDK needs an explicit credential. The convention:

1. Generate a service-account JSON via the Firebase console: **Project Settings → Service accounts → Generate new private key.** Save the file to a path outside the repo, e.g. `~/.learnwren/service-account.json`. **Never** put this file in 1Password and **never** commit it.
2. Export the absolute path in your shell init (`~/.zshrc`, `~/.bashrc`, etc.):

   ```bash
   export FIREBASE_SERVICE_ACCOUNT_JSON_PATH="$HOME/.learnwren/service-account.json"
   ```

3. The api reads `FIREBASE_SERVICE_ACCOUNT_JSON_PATH` only when `LEARNWREN_FIREBASE_TARGET=production`. In emulator mode (default) the variable is ignored.

If `FIREBASE_SERVICE_ACCOUNT_JSON_PATH` is unset in production mode, the Admin SDK falls back to Application Default Credentials. ADC succeeds when running on Firebase Cloud Functions (the runtime injects them) and fails locally — the explicit JSON path is the standard local-against-prod escape hatch.
```

- [ ] **Step 4: Verify the file renders cleanly**

```bash
head -80 docs/secrets.md
```

Expected: the table renders, the subsection heading is in place, code fences open and close correctly.

- [ ] **Step 5: Commit**

```bash
git add docs/secrets.md
git commit -m "$(cat <<'EOF'
docs(secrets): vault contract for Web + Admin SDK config; service-account convention

Adds the eight new vault rows for the production-mode Firebase config
items and codifies the service-account JSON file convention for
local-against-prod runs (path outside the repo, exported from shell
init, never in 1Password or git).
EOF
)"
```

---

## Task 9: `docs/development.md` — Real-project mode subsection

**Files:**
- Modify: `docs/development.md`

- [ ] **Step 1: Read the current `docs/development.md`**

```bash
cat docs/development.md
```

Locate the **Emulators** section (it ends with the line about real-project gating arriving with the auth spec). The new subsection appends after Emulators and before the existing **Secrets** section.

- [ ] **Step 2: Replace the **Emulators** trailing line and append a new subsection**

In `docs/development.md`, locate:

```
The wiring is hardcoded against emulators in this slice. Environment-driven config (real-project IDs, production toggle) arrives with the auth spec.
```

Replace that line with:

```
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

```

- [ ] **Step 3: Verify the file renders cleanly**

```bash
head -120 docs/development.md
```

Expected: section headings nest correctly (`## Real-project mode` is at h2 alongside `## Emulators` and `## Secrets`); fenced code blocks open and close.

- [ ] **Step 4: Commit**

```bash
git add docs/development.md
git commit -m "$(cat <<'EOF'
docs(development): real-project mode subsection

Documents the LEARNWREN_FIREBASE_TARGET=production switch, the one-time
console prerequisites, the run/verify/switch-back commands, and the
post-verification cleanup of the live _smoke collection.
EOF
)"
```

---

## Task 10: Final Definition-of-Done walkthrough

**Files:** none — this is verification only.

This task runs every command in §10 of the spec to confirm the implementation is complete. Failures here mean an earlier task is incomplete.

The production-mode steps require the user-prerequisites to be done. If the user hasn't populated 1Password yet, skip those steps and mark this task partially complete; revisit after the user finishes the manual setup.

- [ ] **Step 1: Emulator-mode regression (default)**

In one terminal:

```bash
pnpm emulators
```

In another:

```bash
pnpm start
```

Verify:
- `http://localhost:4200` loads. **Dev tools → Run Firestore smoke** round-trips successfully.
- `curl http://localhost:3333/api/health` returns `{"status":"ok","version":"..."}`.
- `curl http://localhost:3333/api/firestore-smoke` returns `{"written":{"writtenAt":"..."},"readBack":{"writtenAt":"..."}}` with matching timestamps.
- Browser DevTools console shows NO `[learnwren] Firebase target = production` warning.

Stop both processes.

- [ ] **Step 2: Lint, typecheck, test, build**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Expected: every command exits 0.

- [ ] **Step 3: Verify the production build does not contain emulator references**

```bash
LEARNWREN_FIREBASE_TARGET=production pnpm secrets:run -- pnpm exec nx build web 2>&1 | tail -10
```

Expected: build succeeds.

```bash
grep -r '127\.0\.0\.1' dist/apps/web/browser/ 2>/dev/null | head -5
grep -r 'demo-learnwren' dist/apps/web/browser/ 2>/dev/null | head -5
```

Expected output: BOTH commands print nothing. The production bundle contains neither emulator hosts nor the demo project ID. (After verifying, run `pnpm exec nx run web:generate-environment` once more without the env var to restore the emulator-mode `environment.ts`.)

- [ ] **Step 4: Production-mode failure case**

```bash
LEARNWREN_FIREBASE_TARGET=production pnpm start:api 2>&1 | head -20
```

Expected: process exits with `[FirebaseAdminModule] LEARNWREN_FIREBASE_TARGET=production requires LEARNWREN_API_FIREBASE_PROJECT_ID to be set.` (Without `pnpm secrets:run`, the var is unset.)

- [ ] **Step 5: Production-mode end-to-end (manual; requires user prereqs)**

This step is gated on the user having:
- Populated the 1Password vault items.
- Saved a service-account JSON to `~/.learnwren/service-account.json` (or wherever).
- Exported `FIREBASE_SERVICE_ACCOUNT_JSON_PATH` in their current shell.

In one terminal, with `FIREBASE_SERVICE_ACCOUNT_JSON_PATH` exported:

```bash
LEARNWREN_FIREBASE_TARGET=production pnpm secrets:run -- pnpm start:api
```

Verify in the api log: `[learnwren] Firebase target = production` warning appears. Then in another terminal:

```bash
curl http://localhost:3333/api/firestore-smoke
```

Expected: returns the round-trip envelope. **Open the Firebase console → Firestore Database** and confirm a document exists under `_smoke`. **Delete that document** before stopping the api.

In a third terminal:

```bash
LEARNWREN_FIREBASE_TARGET=production pnpm secrets:run -- pnpm start:web
```

Open `http://localhost:4200` in a browser. Confirm:
- Console shows `[learnwren] Firebase target = production`.
- **Dev tools → Run Firestore smoke** still round-trips (and DevTools → Network confirms traffic to `firestore.googleapis.com`).
- Delete the resulting `_smoke` document from the Firebase console.

Stop both processes.

- [ ] **Step 6: Confirm switch-back to emulator mode is clean**

In a fresh terminal (no `LEARNWREN_FIREBASE_TARGET` exported):

```bash
pnpm emulators &
pnpm start:web
```

Open `http://localhost:4200`, confirm console has NO production warning, **Dev tools → Run Firestore smoke** round-trips through the emulator (DevTools → Network shows `127.0.0.1:8080`). Stop both processes.

- [ ] **Step 7: No commit — this task is verification only**

If any step failed, return to the relevant earlier task. If all steps passed, the plan is complete; the implementation is ready for review.

---

## Self-Review Notes

Before handing this plan off, the writer verified:

1. **Spec coverage.** Every section of `2026-04-30-firebase-project-connection-design.md` maps to at least one task: §1 prereqs (User Prerequisites preamble + Task 9 docs), §2 .firebaserc (Task 2), §3 mode switch (Tasks 3, 5, 6 — flag is read in three places: build script, web runtime via baked-in mode, api runtime), §4 web build-time config (Tasks 3, 4, 5), §5 api admin SDK (Task 6), §6 rules split (Task 1), §7 env.tpl + 1Password (Task 7 + the User Prerequisites preamble for vault setup), §8 secrets.md (Task 8), §9 development.md (Task 9), §10 DoD (Task 10), §11 implementation order (this plan's task ordering matches).
2. **No placeholders.** All file contents are written out in full. `<REAL_PROJECT_ID>` in Task 2 is the only marker, and it's accompanied by an explicit instruction to substitute the user's actual ID before the commit.
3. **Type consistency.** `firebaseTargetMode` (function in `firebase-target.ts`), `firebaseTargetMode` (property name on `environment`), `LEARNWREN_FIREBASE_TARGET` (env var name), `'emulator' | 'production'` (the value type) match across Tasks 3, 4, 5, 6.

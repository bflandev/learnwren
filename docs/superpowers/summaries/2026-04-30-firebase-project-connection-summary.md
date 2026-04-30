# Firebase Project Connection — Implementation Summary

**Date:** 2026-04-30
**Spec:** `docs/superpowers/specs/2026-04-30-firebase-project-connection-design.md`
**Plan:** `docs/superpowers/plans/2026-04-30-firebase-project-connection.md`

Connects the previously emulator-only Firebase wiring to a real Firebase project (`learn-wren`). `LEARNWREN_FIREBASE_TARGET=production` flips both `apps/web` and `apps/api` from emulator-mode to real-project-mode without code changes; the unflagged dev experience stays byte-identical.

## What shipped

- `firestore.emulator.rules` (new) splits the dev-only `_smoke` allow rule out of `firestore.rules`, which is now deploy-safe deny-by-default. `firebase.json` points at the emulator file.
- `.firebaserc` adds the `production` alias mapped to `learn-wren`. `default` stays `demo-learnwren`.
- `apps/web/src/environments/firebase-target.ts` adds the `firebaseTargetMode()` normalizer plus the discriminated-union `Environment` type. Vitest spec covers six input cases (unset, empty, `production`, `emulator`, garbage, casing).
- `tools/web/build-environment.ts` (new) generates `apps/web/src/environments/environment.ts` (gitignored) from `LEARNWREN_FIREBASE_TARGET` plus the six `LEARNWREN_WEB_FIREBASE_*` env vars. Production output omits `emulatorHosts` so the bundle ships zero emulator strings; emulator output carries a fake `apiKey` because Firebase ≥12 requires one even for emulator-targeted Auth.
- `apps/web/project.json` adds `generate-environment` as an Nx target wired into `build`/`serve`/`test`/`lint` via `dependsOn`, with the `LEARNWREN_*` env vars and the two source files declared as inputs so the cache invalidates on mode change.
- `apps/web/src/app/app.config.ts` reads `firebase`, `firebaseTargetMode`, and `emulatorHosts` from the generated environment, narrowing on the discriminated union to gate `connectAuthEmulator` / `connectFirestoreEmulator` / `connectStorageEmulator` calls behind emulator mode.
- `libs/api-firebase/src/lib/firebase-admin.module.ts` branches on `LEARNWREN_FIREBASE_TARGET`: emulator preserves prior behavior; production requires `LEARNWREN_API_FIREBASE_PROJECT_ID` (fails fast), uses Application Default Credentials by default, and switches to `admin.credential.cert(...)` when `FIREBASE_SERVICE_ACCOUNT_JSON_PATH` is set. Spec covers eight cases (3 existing emulator + 2 new emulator + 3 production).
- `.env.tpl` adds the seven new `op://` references (six Web SDK config fields + the Admin SDK project ID).
- `docs/secrets.md` adds eight vault-contract rows and codifies the service-account-JSON convention (path outside the repo, exported from shell init, never in 1Password or git).
- `docs/development.md` documents the `LEARNWREN_FIREBASE_TARGET=production` switch with prerequisites, run/verify/switch-back commands, and the post-verification cleanup of the live `_smoke` collection.

## Plan deviations worth knowing about

- **Emulator-mode firebase config now includes `apiKey: 'fake-api-key-emulator-only'`.** Firebase Web SDK ≥12 strictly requires `apiKey` in `initializeApp` config even when Auth is going to be emulator-targeted. The previous wiring spec set only `{projectId: 'demo-learnwren'}` and the resulting `auth/invalid-api-key` error was silent because the smoke widget only exercises Firestore.
- **Generator emits a discriminated-union `Environment` shape** instead of a single `as const` shape with a unioned `firebaseTargetMode`. The plan's literal-cast version compiled but left `emulatorHosts` in the production bundle; switching to the discriminated union means production-mode `environment.ts` has no `emulatorHosts` field at all, and the bundler dead-code-eliminates the entire emulator branches in `app.config.ts`.
- **`generate-environment` declares its env-var inputs explicitly.** The plan didn't, which meant Nx didn't invalidate the cache when `LEARNWREN_FIREBASE_TARGET` flipped, so switching modes silently reused the stale build.
- **`firebase-admin.module.spec.ts` generates a real RSA key on the fly** for the cert-path test. The plan's obviously-fake `private_key` failed firebase-admin's strict ASN.1 validation.
- **The missing-project-id test uses synchronous `expect(() => ...).toThrow`.** `forRoot()` throws during `DynamicModule` construction inside the `imports: [...]` array literal — before `Test.createTestingModule(...)` ever returns a promise — so the plan's `rejects.toThrow` matcher never received a rejected promise.

## Verification outcome

- Unit tests: 8 web + 8 api-firebase + the existing api specs all green (`pnpm test`).
- Lint, typecheck, build all green (`pnpm lint && pnpm typecheck && pnpm build`).
- Emulator-mode regression: api `GET /api/health` and `GET /api/firestore-smoke` round-trip; web smoke widget round-trips against the emulator with no console errors.
- Production-mode end-to-end: web app loaded against `learn-wren` showed the `[learnwren] Firebase target = production` warning, hit `firestore.googleapis.com`, and was correctly rejected by the deploy-safe rules with `Missing or insufficient permissions` (expected — the client SDK is rate-limited by rules; the api's Admin SDK bypasses them). The api wrote a doc to the real `_smoke` collection, was confirmed via the Admin SDK, and the doc was deleted before tear-down.
- Production-mode fail-fast: with `LEARNWREN_FIREBASE_TARGET=production` and no project ID set, the api exits with `[FirebaseAdminModule] LEARNWREN_FIREBASE_TARGET=production requires LEARNWREN_API_FIREBASE_PROJECT_ID to be set.`
- Production bundle audit: `dist/apps/web/browser/` contains zero matches for `demo-learnwren`, `127.0.0.1:9099`, `127.0.0.1:8080`, or `127.0.0.1:9199`.

## Follow-ups not in scope

- The smoke widget calls `setDoc` / `getDoc` after `await` boundaries, which trips an "outside Injection context" warning from AngularFire. Pre-existing, low-impact; the auth spec or a dedicated cleanup can wrap the calls in `runInInjectionContext`.
- Production rules are deploy-safe deny-by-default. Per-collection rules and the `isAuthenticated` / `isOwner` / `isAdmin` / `hasRole` helpers arrive with the auth spec, not this one.
- `firebase deploy --only firestore:rules` against `learn-wren` is a separate operation; this slice only confirms the rules file the deploy will use is sane.

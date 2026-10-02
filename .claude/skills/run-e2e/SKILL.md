---
name: run-e2e
description: Use when running Playwright e2e suites (api-e2e, web-e2e), starting emulators or dev servers for tests, or when e2e fails with connection refused, port-in-use, or data from the wrong project.
---

# Running E2E (Learn Wren)

api-e2e needs live emulators + the api server. Emulator mode needs no cloud credentials.

## Probe ports FIRST

Orphaned `nx serve` / emulator processes from **other worktrees** survive `TaskStop` and previous sessions — they answer on the right ports with the wrong code or wrong-project data (a past run debugged "impossible" e2e failures against another worktree's api).

```bash
lsof -nP -iTCP:3333 -iTCP:4200 -iTCP:8080 -iTCP:9099 -iTCP:9199 -sTCP:LISTEN
```

If something you did not start is listening: identify it before killing — it may be the user's own dev server. Kill only processes you started.

## Start + run

```bash
pnpm emulators      # terminal 1 (firebase.json governs emulators; firebase.deploy.json governs deploys)
pnpm start:api      # terminal 2 (web on :4200 via `pnpm start` if web-e2e)
pnpm nx e2e api-e2e -- <spec-name-filter>    # e.g. `admin-health`
```

CI-style one-shot (boots emulators, runs, tears down — no orphan risk; prefer for scripted runs). The api server itself is started by Playwright's `webServer` (config + fake-mode env in `apps/api-e2e/playwright.config.ts`) and reuses an already-running one:

```bash
pnpm exec firebase emulators:exec --project demo-learnwren 'pnpm nx e2e api-e2e'
```

## Suite conventions

- Specs live in `apps/api-e2e/src/*.e2e-spec.ts`; shared helpers in `_helpers/auth` (`API_BASE`, `registerStudent`, `registerAndPromoteInstructor`, `registerAndPromoteAdmin`, `redeemEmailLink`) and `_helpers/seam.ts` (`seam`, the `/api/_test` setup seam that replaced `initAdmin`).
- **Postgres + local identity run:** the api `webServer` uses `reuseExistingServer` when not CI, so a local run silently reuses an api already on :3333 (often a Firestore one) — stop it first. That run also needs a RustFS/S3 store and the S3 env (`LEARNWREN_OBJECT_STORAGE=s3`, `LEARNWREN_S3_*`); copy the env from the e2e job in `.github/workflows/ci.yml`.
- **api-e2e cannot import `@learnwren/shared-data-models`** (no tsconfig project ref) — declare inline structural types, like every sibling spec.
- Each test creates its own `apiRequest.newContext()` and disposes it in `finally`.
- The **Auth emulator ignores `checkRevoked`** — revocation behavior must be unit-asserted, not e2e-asserted.
- Guarded routes: expect 401 (anon) / 403 (wrong role). A 404 on a route that should exist means the server is stale or the wrong process answered — re-probe ports.

## Cleanup

Kill what you started (and only that). Leaving servers running creates the orphan problem for the next session.

## Common mistakes

| Mistake | Reality |
|---|---|
| Start servers without probing ports | An orphan answers with stale/wrong-project code; failures look impossible. |
| Import shared types into e2e | Unresolvable — inline the type. |
| e2e-assert token revocation | Emulator ignores `checkRevoked`; unit-assert the revoke call instead. |
| Kill everything on the ports | May be the user's session. Kill only your own PIDs. |

# US-09-04 Slice D3c — Compose Cut-over Implementation Plan

> [!NOTE]
> DOCUMENT STATUS: DRAFT

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the self-hosted Docker Compose stack on Postgres + local identity with no Firebase emulators, prove the api against that backend in CI, and close the US-09-04 "no proprietary services" criterion.

**Architecture:** api-e2e stops importing firebase-admin and drives test setup through a test-only HTTP seam inside the api (`/api/_test/*`), so the same specs run against either backend through the real adapters. CI runs api-e2e twice: Firebase emulators (today) and `postgres` + `local` without emulators. Compose gains a `postgres:17` service, drops the emulator container, and the first admin is granted by `LEARNWREN_BOOTSTRAP_ADMIN_EMAIL` on that account's first verified login. The operator tools move onto the ports so they work on either backend.

**Tech Stack:** NestJS 11, Playwright (api-e2e, web-e2e), PostgreSQL 17, Docker Compose, tsx (tools).

**Spec:** `docs/superpowers/specs/2026-10-01-us-09-04-slice-d-auth-and-data-design.md` (D3c row §5 line 301; acceptance §5.4 lines 339-344).

## Global Constraints

- Defaults stay `LEARNWREN_DATA_STORE=firestore`, `LEARNWREN_IDENTITY=firebase`; learnwren.com and emulator-mode development must not change.
- Inject `DOCUMENT_STORE` / `IDENTITY_PROVIDER`, never `FIRESTORE` / `FIREBASE_AUTH` (lint-enforced).
- Any test-only surface must be dead in production: `NODE_ENV=production` + `LEARNWREN_TEST_OUTBOX_ENABLED=1` already refuses boot (`apps/api/src/main.ts:11-18`); the seam reuses that flag and also 404s at runtime under `NODE_ENV=production`.
- Postgres in tests: `LEARNWREN_TEST_POSTGRES_URL` gates unit tests; the api itself reads `LEARNWREN_POSTGRES_URL`. Local container: `docker run -d --rm --name lw-d2-pg -p 55432:5432 -e POSTGRES_PASSWORD=learnwren -e POSTGRES_DB=learnwren_test postgres:17`.
- web-e2e stays on the Firebase emulators (not in the D3c row). Its firebase-admin helpers are out of scope.
- `tools/migrate-auth-2026-05-cleanup-unverified.ts` is a historical one-off against Firebase; leave it.
- Migrating data from an emulator-based Compose install is out of scope (spec line 32); the docs must say so plainly.
- Worktree rules: every subagent shell command starts with `cd /Volumes/Artie-Storage/github-repos/learnwren-us-09-04-d3c && pwd &&`. NEVER `git stash`; use `git show <sha>:<path>`. Add files by path, never `git add -A`.

## Review Focus

1. **Seam leaks into a real deploy.** Compose sets `NODE_ENV=production`? If it does not, the seam must still be unreachable there: Compose must never set `LEARNWREN_TEST_OUTBOX_ENABLED`. Task 1 pins the runtime 404 under production; Task 6 asserts `/api/_test/users/x` is 404 on the Compose stack.
2. **Backend behaviour differences surface as e2e failures.** Local logout ends one session (by design), local `verifySession` reads role live. Any api-e2e spec asserting Firebase-only behaviour must branch on the backend explicitly, not be loosened. Task 3 records each such branch.
3. **Bootstrap admin is a takeover vector if loose.** Only an exact (case-insensitive) match of a *verified* account, only promotes (never demotes), idempotent. Task 4 pins unverified, mismatched, and already-admin cases.
4. **Compose api without emulators still constructs Firebase pieces.** `FirebaseAdminModule.forRoot()` stays loaded; nothing may call it. Task 6 smoke proves the full flow (register → verify → login → reset → course → upload → play) with no emulator container.
5. **Second api-e2e run shares one Postgres database across runs.** Specs use unique emails; the run must not depend on an empty database. Task 3 runs it twice back to back.

---

### Task 1: Test seam in the api

**Files:**
- Create: `apps/api/src/app/test-seam/test-seam.controller.ts`
- Create: `apps/api/src/app/test-seam/test-seam.module.ts`
- Create: `apps/api/src/app/test-seam/test-seam.controller.spec.ts`
- Modify: `apps/api/src/app/app.module.ts` (conditional import)

The guard-coverage spec (`apps/api/src/controller-guard-coverage.spec.ts`) scans `libs/` only, so a controller in `apps/api` needs no allowlist entry. Keep it out of `libs/` for that reason and because nothing else may import it.

**Interfaces — Produces (HTTP, base `/api/_test`, all 404 unless enabled):**
- `POST users/:uid/verify-email` → 204. `identity.updateUser(uid, { emailVerified: true })`.
- `PUT users/:uid/role` body `{ role: UserRole }` → 204. `identity.setRole(uid, role)` then `store.collection('users').doc(uid).update({ role })`.
- `GET users/:uid` → 200 `IdentityUser` or 404.
- `PUT docs/*path` body `{ data: object }` → 204 (`set`). `PATCH docs/*path` → 204 (`update`). `GET docs/*path` → 200 `{ exists: boolean, data: object | null }`. `path` is an even-segment document path such as `courses/abc/modules/m1`.
- `GET query?collection=&field=&value=` → 200 `{ docs: { id: string; data: object }[] }` (`where(field, '==', value)`; `value` is a string).

- [x] **Step 1: Failing controller spec** with `createInMemoryIdentityProvider()` (`@learnwren/api-auth/testing`) and `createInMemoryDocumentStore()` (`@learnwren/api-document-store`), constructing the controller directly:
  - verify-email flips `emailVerified`;
  - role sets the identity role AND the `users` doc role;
  - docs round-trip set → get → patch → get; get of a missing doc → `{ exists: false, data: null }`;
  - query returns matching docs only;
  - an odd-segment path → 400; a path containing `..` or an empty segment → 400;
  - with `NODE_ENV=production` every handler throws `NotFoundException` (set and restore `process.env` in the test).
- [x] **Step 2: Run** `NX_DAEMON=false pnpm nx test api --skip-nx-cache` → the new spec fails (module missing).
- [x] **Step 3: Implement.**

```ts
// test-seam.controller.ts
import { BadRequestException, Body, Controller, Get, HttpCode, Inject, NotFoundException, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { DOCUMENT_STORE, type DocumentStore } from '@learnwren/api-document-store';
import { IDENTITY_PROVIDER, type IdentityProvider } from '@learnwren/api-auth';
import type { UserRole } from '@learnwren/shared-data-models';

/**
 * Test-only setup seam for api-e2e, so the same specs run on Firebase and on
 * postgres + local through the real adapters. Registered only when
 * LEARNWREN_TEST_OUTBOX_ENABLED=1 (app.module.ts); main.ts refuses that flag in
 * production, and every handler 404s under NODE_ENV=production as a second wall.
 */
@Controller('_test')
export class TestSeamController {
  constructor(
    @Inject(IDENTITY_PROVIDER) private readonly identity: IdentityProvider,
    @Inject(DOCUMENT_STORE) private readonly store: DocumentStore,
  ) {}

  @Post('users/:uid/verify-email')
  @HttpCode(204)
  async verifyEmail(@Param('uid') uid: string): Promise<void> {
    assertEnabled();
    await this.identity.updateUser(uid, { emailVerified: true });
  }

  @Put('users/:uid/role')
  @HttpCode(204)
  async setRole(@Param('uid') uid: string, @Body('role') role: UserRole): Promise<void> {
    assertEnabled();
    await this.identity.setRole(uid, role);
    await this.store.collection('users').doc(uid).update({ role });
  }

  @Get('users/:uid')
  async getUser(@Param('uid') uid: string) {
    assertEnabled();
    const user = await this.identity.getUser(uid);
    if (!user) throw new NotFoundException();
    return user;
  }

  @Put('docs/*path')
  @HttpCode(204)
  async setDoc(@Param('path') path: string[], @Body('data') data: Record<string, unknown>): Promise<void> {
    assertEnabled();
    await this.docRef(path).set(data);
  }

  @Patch('docs/*path')
  @HttpCode(204)
  async updateDoc(@Param('path') path: string[], @Body('data') data: Record<string, unknown>): Promise<void> {
    assertEnabled();
    await this.docRef(path).update(data);
  }

  @Get('docs/*path')
  async getDoc(@Param('path') path: string[]) {
    assertEnabled();
    const snap = await this.docRef(path).get();
    return { exists: snap.exists, data: snap.exists ? snap.data() : null };
  }

  @Get('query')
  async query(@Query('collection') collection: string, @Query('field') field: string, @Query('value') value: string) {
    assertEnabled();
    const snap = await this.store.collection(collection).where(field, '==', value).get();
    return { docs: snap.docs.map((d) => ({ id: d.id, data: d.data() })) };
  }

  private docRef(segments: string[] | string) {
    // Express 5 wildcard params arrive as an array of segments.
    const parts = Array.isArray(segments) ? segments : segments.split('/');
    if (parts.length < 2 || parts.length % 2 !== 0 || parts.some((p) => p === '' || p === '.' || p === '..')) {
      throw new BadRequestException('Document path must be collection/doc[/collection/doc...]');
    }
    let ref = this.store.collection(parts[0]).doc(parts[1]);
    for (let i = 2; i < parts.length; i += 2) ref = ref.collection(parts[i]).doc(parts[i + 1]);
    return ref;
  }
}

function assertEnabled(): void {
  if (process.env['NODE_ENV'] === 'production') throw new NotFoundException();
}
```

Before writing `docRef`, confirm the `DocRef`/`CollectionRef` type names exported by `@learnwren/api-document-store` and use them in the signature. Confirm how Nest 11 hands a `*path` wildcard to `@Param` with a one-line probe test. If the data-model package names the role type differently, use that name.

```ts
// test-seam.module.ts
import { Module } from '@nestjs/common';
import { AuthModule } from '@learnwren/api-auth';
import { TestSeamController } from './test-seam.controller';

@Module({ imports: [AuthModule], controllers: [TestSeamController] })
export class TestSeamModule {}
```

```ts
// app.module.ts, end of imports[]
    // Test-only setup seam for api-e2e (see test-seam.controller.ts).
    ...(process.env['LEARNWREN_TEST_OUTBOX_ENABLED'] === '1' ? [TestSeamModule] : []),
```

`DocumentStoreModule` must be visible to `TestSeamModule`. If it is not `@Global()`, add it to the module's imports.

- [x] **Step 4: Run** api tests, `lint`, `typecheck` → green.
- [x] **Step 5: Commit** `feat(api): test-only /api/_test seam for backend-agnostic e2e setup (US-09-04 D3c)`.

---

### Task 2: api-e2e onto the seam (still on the Firebase emulators)

**Files:**
- Create: `apps/api-e2e/src/_helpers/seam.ts`
- Modify: `apps/api-e2e/src/_helpers/auth.ts` (drop `initAdmin`, firebase-admin)
- Modify: every `apps/api-e2e/src/*.e2e-spec.ts` that imports `firebase-admin`, **except** `firestore-rules.e2e-spec.ts`

**Interfaces — Produces (`seam.ts`):**

```ts
import { request as apiRequest } from '@playwright/test';
import { API_BASE } from './auth';

type Role = 'STUDENT' | 'INSTRUCTOR' | 'ADMIN';

async function call(method: 'GET' | 'POST' | 'PUT' | 'PATCH', path: string, data?: unknown) {
  const ctx = await apiRequest.newContext();
  try {
    const res = await ctx.fetch(`${API_BASE}/_test/${path}`, { method, data });
    if (!res.ok()) throw new Error(`seam ${method} ${path} → ${res.status()} ${await res.text()}`);
    return res.status() === 204 ? undefined : await res.json();
  } finally {
    await ctx.dispose();
  }
}

const docPath = (path: string) => `docs/${path.split('/').map(encodeURIComponent).join('/')}`;

export const seam = {
  markEmailVerified: (uid: string) => call('POST', `users/${uid}/verify-email`),
  setRole: (uid: string, role: Role) => call('PUT', `users/${uid}/role`, { role }),
  getEmail: async (uid: string): Promise<string> => ((await call('GET', `users/${uid}`)) as { email: string }).email,
  setDoc: (path: string, data: Record<string, unknown>) => call('PUT', docPath(path), { data }),
  updateDoc: (path: string, data: Record<string, unknown>) => call('PATCH', docPath(path), { data }),
  getDoc: async <T = Record<string, unknown>>(path: string): Promise<T | null> =>
    ((await call('GET', docPath(path))) as { data: T | null }).data,
  query: async <T = Record<string, unknown>>(collection: string, field: string, value: string) =>
    ((await call('GET', `query?${new URLSearchParams({ collection, field, value })}`)) as { docs: { id: string; data: T }[] }).docs,
};
```

Mapping (the survey's call-site groups, 62 sites):

| Today | Becomes |
|---|---|
| `admin.auth().updateUser(uid, { emailVerified: true })` | `seam.markEmailVerified(uid)` |
| `setCustomUserClaims(uid, { role })` + `users/{uid}.update({ role })` | one `seam.setRole(uid, role)` |
| `admin.auth().getUser(uid).email` | `seam.getEmail(uid)` |
| `firestore().collection(a).doc(b)...set(x)` | `seam.setDoc('a/b/...', x)` |
| `.update(x)` | `seam.updateDoc(path, x)` |
| `.get()` then `.data()` | `seam.getDoc(path)` |
| `.where(f, '==', v).get()` | `seam.query(collection, f, v)` |
| `email-change.e2e-spec.ts:97` `updateUser(uid, { email, emailVerified })` | read that spec first. If it simulates a completed email change, drive the real flow instead (`/_test/last-email?kind=email-change`, then redeem). Never add an email-setting seam endpoint. |

- [x] **Step 1:** Add `seam.ts`. Port `_helpers/auth.ts` first (`registerAndPromoteInstructor`, `registerAndPromoteAdmin`), then the specs one file at a time. Drop `initAdmin()` calls and `import * as admin`. Seeds that pass Firestore `Timestamp`/`FieldValue` values: there are none today (verified by grep). If one appears, store an ISO string per the repo's wire rules.
- [x] **Step 2:** `grep -rn "firebase-admin" apps/api-e2e/src` → only `firestore-rules.e2e-spec.ts`.
- [x] **Step 3: Run** on the emulators (probe ports 3333 8080 9099 4000 4400 first): `NX_DAEMON=false pnpm exec firebase emulators:exec --project demo-learnwren 'pnpm nx e2e api-e2e'` → 222 passed, 2 skipped, as on main.
- [x] **Step 4: Commit** `test(api-e2e): drive setup through the /api/_test seam instead of firebase-admin (US-09-04 D3c)`.

---

### Task 3: api-e2e on postgres + local, locally and in CI

**Files:**
- Modify: `apps/api-e2e/playwright.config.ts` (webServer env passthrough)
- Modify: `apps/api-e2e/src/firestore-rules.e2e-spec.ts` (skip off-Firestore)
- Modify: `.github/workflows/ci.yml` (`e2e` job: second step)
- Modify: specs only where a backend difference is *intended* (Review Focus 2)

- [x] **Step 1: Config.** In the webServer `env`, pass through `LEARNWREN_DATA_STORE`, `LEARNWREN_IDENTITY`, `LEARNWREN_POSTGRES_URL` when set:

```ts
...Object.fromEntries(
  ['LEARNWREN_DATA_STORE', 'LEARNWREN_IDENTITY', 'LEARNWREN_POSTGRES_URL']
    .filter((k) => process.env[k])
    .map((k) => [k, process.env[k] as string]),
),
```

- [x] **Step 2: Rules spec.** At the top of its `describe`: `test.skip(process.env['LEARNWREN_DATA_STORE'] === 'postgres', 'firestore.rules only applies to the Firestore backend');`
- [x] **Step 3: Run without emulators** (all of 8080/9099/4000 must be free; Postgres up):

```bash
LEARNWREN_DATA_STORE=postgres LEARNWREN_IDENTITY=local \
LEARNWREN_POSTGRES_URL=postgres://postgres:learnwren@127.0.0.1:55432/learnwren_test \
NX_DAEMON=false pnpm nx e2e api-e2e
```

Triage each failure into one of:
- **(a) a bug in local/postgres:** fix it in the adapter with a unit test or a contract case;
- **(b) an intended difference** (per-session logout; live role): branch the assertion on `process.env['LEARNWREN_IDENTITY'] === 'local'`, with a one-line comment that names the difference;
- **(c) a Firebase-specific test detail:** generalise it.

Never delete an assertion to get green. List every (b) in the task report.
- [x] **Step 4:** Run the same command a second time without clearing the database → still green (Review Focus 5).
- [x] **Step 5: CI.** In `.github/workflows/ci.yml` job `e2e`, after the emulators step, add a step **outside** `emulators:exec`:

```yaml
      - name: api-e2e on postgres + local identity (no emulators)
        env:
          LEARNWREN_DATA_STORE: postgres
          LEARNWREN_IDENTITY: local
          LEARNWREN_POSTGRES_URL: postgres://postgres:learnwren@localhost:5432/learnwren_test
        run: pnpm nx e2e api-e2e --skip-nx-cache
```

Rename the job's display name to say it covers both backends.
- [x] **Step 6: Commit** `test(api-e2e): run the suite on postgres + local identity, locally and in CI (US-09-04 D3c)`.

---

### Task 4: Bootstrap the first admin

**Files:**
- Modify: `libs/api-auth/src/lib/auth.service.ts` (login)
- Create: `libs/api-auth/src/lib/bootstrap-admin.ts` + `bootstrap-admin.spec.ts`
- Modify: `libs/api-auth/src/lib/auth.service.spec.ts`
- Modify: `.env.example`

**Interfaces — Produces:** `readBootstrapAdminEmail(env): string | null` (trimmed, lower-cased, `null` when unset or blank).

- [x] **Step 1: Failing tests**, written against `AuthService.login` with the in-memory identity provider and store:
  - with `LEARNWREN_BOOTSTRAP_ADMIN_EMAIL=Boss@Example.test`, a verified `boss@example.test` login returns `role: 'ADMIN'`, and the identity role and the `users` doc role are both `ADMIN`;
  - a different email is untouched;
  - an unverified bootstrap account still gets `EMAIL_NOT_VERIFIED` and is not promoted;
  - an account that is already ADMIN gets no writes (spy on `setRole`);
  - env unset or blank means no promotion;
  - the promotion is logged once at `warn` with the uid (an audit trail).
- [x] **Step 2: Run** → fail.
- [x] **Step 3: Implement.** In `login`, after `requireVerifiedUser` and **before** `mint` / `loadUserProfile`:

```ts
await this.promoteBootstrapAdmin(identityUser);
```

```ts
  /**
   * First-admin bootstrap for self-hosted installs: the verified account whose
   * email matches LEARNWREN_BOOTSTRAP_ADMIN_EMAIL becomes ADMIN on login. Only
   * ever promotes; demoting it later through the admin UI sticks until the env
   * var is changed, because the next login promotes again. Firebase mode applies
   * it too, but its session claim is frozen at mint, so the role there shows
   * from the following login.
   */
  private async promoteBootstrapAdmin(user: IdentityUser): Promise<void> {
    const target = readBootstrapAdminEmail(process.env);
    if (!target || user.email.toLowerCase() !== target) return;
    const profile = await this.loadUserProfile(user.uid);
    if (profile.role === 'ADMIN') return;
    await this.identity.setRole(user.uid, 'ADMIN');
    await this.store.collection('users').doc(user.uid).update({ role: 'ADMIN', updatedAt: nowIso() });
    this.logger.warn(`[auth] bootstrap admin promoted uid=${user.uid}`);
  }
```

Use whatever document-store field `AuthService` already holds, and `nowIso()` from its existing import. Read `loadUserProfile`'s return type first. If the `users` doc has no `updatedAt` field, drop it. Note the demote-sticks caveat in the docs (Task 7). Add to `.env.example`:

```
# First admin for a new self-hosted install: this account becomes ADMIN when it
# logs in after verifying its email. Clear it once you have an admin.
# LEARNWREN_BOOTSTRAP_ADMIN_EMAIL=you@example.com
```

- [x] **Step 4: Run** api-auth test/lint/typecheck → green.
- [x] **Step 5: Commit** `feat(api-auth): LEARNWREN_BOOTSTRAP_ADMIN_EMAIL grants the first admin on verified login (US-09-04 D3c)`.

---

### Task 5: Operator tools on the ports

**Files:**
- Create: `tools/backend-init.ts` (returns `{ identity, store, close }` from env)
- Modify: `tools/promote-to-admin.ts`, `tools/promote-to-instructor.ts`
- Create: `tools/promote-to-admin.spec.ts`, if the workspace has a runner for `tools/`. Check `vitest.workspace`/`nx show projects` first. If `tools/` has no test target, put the pure `promoteToAdmin(email, identity, store)` function's test in the nearest lib that already hosts tool logic (`libs/api-profile` hosts `promoteUserToInstructor`) and keep the tool a thin CLI.

**Interfaces — Produces:** `promoteToAdmin(email: string, identity: IdentityProvider, store: DocumentStore): Promise<void>`. It refuses unverified accounts with today's message, then calls `identity.setRole(uid, 'ADMIN')` and `users/{uid}.update({ role: 'ADMIN' })`.

- [x] **Step 1: Failing test** with the in-memory identity provider and store: it promotes a verified user, refuses an unverified one, and throws `No account for <email>` for an unknown email.
- [x] **Step 2: Implement.** `backend-init.ts` reads `readDataStoreConfigFromEnv` / `readIdentityConfigFromEnv`:
  - **postgres + local:** `new PostgresDocumentStore(new Pool({ connectionString }))` and `new LocalIdentityProvider(store)`. Call `ensureSchema` if the store requires it before first use; read `document-store.module.ts`'s factory and mirror it.
  - **firestore + firebase:** today's `initFirebaseApp(resolveMode())`, then `new FirestoreDocumentStore(admin.firestore())`. For identity, a 3-method shim over `admin.auth()` (`getUserByEmail`, `setRole` via `setCustomUserClaims`, `getUser`) typed as `Pick<IdentityProvider, …>`. Do not construct the DI-wired `FirebaseIdentityProvider`.

  Narrow `promoteToAdmin`'s parameter to the same `Pick` so both shapes fit. Import adapters by deep path if `@learnwren/...` barrel imports drag Nest modules into `tsx`. Verify with `pnpm tools:promote-to-admin nobody@example.test` in both modes: expect a clean "No account" error, not a stack trace.
- [x] **Step 3: Run** the tests, then a real promotion on postgres + local: register through the api from the Task 3 run setup, verify, promote, `GET /me` → ADMIN.
- [x] **Step 4: Commit** `refactor(tools): promote-to-admin and promote-to-instructor work on either backend (US-09-04 D3c)`.

---

### Task 6: Compose on postgres + local; no emulators

**Files:**
- Modify: `docker-compose.yml`, `Dockerfile` (delete the `emulators` target), `.env.example`, `docker/smoke.sh`
- Delete: `docker/firebase.json`, `docker/emulators-entrypoint.sh` (confirm nothing else references them: `grep -rn "emulators-entrypoint\|docker/firebase.json" .`)
- Create: `apps/web-e2e/src/auth-action.spec.ts` (spec §5.4: the `/auth/action` page in all three modes)

- [x] **Step 1: Compose.**
  - Add `postgres`: `image: postgres:17`, env `POSTGRES_PASSWORD: "${LEARNWREN_POSTGRES_PASSWORD:-learnwren-change-me}"`, `POSTGRES_DB: learnwren`, volume `postgres-data:/var/lib/postgresql/data`, healthcheck `pg_isready -U postgres -d learnwren`, not published, `restart: unless-stopped`.
  - On `api`: remove `network_mode` and the `emulators` dependency, and depend on `postgres` + `objectstore` healthy. Add `LEARNWREN_DATA_STORE: postgres`, `LEARNWREN_IDENTITY: local`, `LEARNWREN_POSTGRES_URL: "postgres://postgres:${LEARNWREN_POSTGRES_PASSWORD:-learnwren-change-me}@postgres:5432/learnwren"`, `LEARNWREN_BOOTSTRAP_ADMIN_EMAIL: "${LEARNWREN_BOOTSTRAP_ADMIN_EMAIL:-}"`.
  - Delete the `emulators` service, the `emulator-data` volume and `LEARNWREN_ADMIN_BIND`. Update the header comment.
  - Check `web`'s nginx upstream: it reached the api through the emulators' network namespace before. Point it at `api:3333` if needed (`docker/nginx.conf.template`).
- [x] **Step 2: `.env.example`.** Uncomment and document `LEARNWREN_POSTGRES_PASSWORD`. Delete `LEARNWREN_ADMIN_BIND`. Keep the bootstrap entry from Task 4.
- [x] **Step 3: `docker/smoke.sh`.** Extend it to the spec's flow against `http://localhost:${PORT}/api`: register (unique email) → read the verify link from `docker compose logs api` (console transport; read `console-email-transport.ts` for the exact log line) → `POST /auth/email-action` → login → request reset, read the link, apply → login with the new password → set `LEARNWREN_BOOTSTRAP_ADMIN_EMAIL` beforehand to the smoke email so that login returns ADMIN → create a course → upload a small video fixture (reuse one from `apps/api-e2e`, if one exists, or generate it with the ffmpeg in the api image) → poll the lesson until playback is ready → fetch the playlist and one segment. Also assert `GET /api/_test/users/x` → 404. Keep plain `sh` + `curl` + `sed`.
- [x] **Step 4: Run** `docker/smoke.sh --down` from a clean state (`docker compose down -v` first; it deletes only this stack's volumes). It must pass with no emulator container (`docker compose ps` lists none).
- [x] **Step 5: web-e2e `/auth/action`** (hermetic; stub `POST /api/auth/email-action` with `page.route`): verify ok → "verified"; change-email ok → lands on `/settings/profile/email-changed` (stub `GET /api/auth/me` per the a11y helpers); reset → form → submit → `/login?reset=ok`; invalid token → invalid state. Run `NX_DAEMON=false pnpm exec firebase emulators:exec --project demo-learnwren 'pnpm nx e2e web-e2e'`.
- [x] **Step 6: Commit** in two pieces: Compose/Dockerfile/smoke, then the web-e2e spec.

---

### Task 7: Docs and the criterion

**Files:** `docs/self-hosting.md`, `docs/epics/09-non-functional-requirements.md:62`, `docs/epics/TECHNICAL_ARCHITECTURE.md` (if its Deployment Backends table says Compose uses emulators), `README.md`, `docs/USER_GUIDE.md`, `docs/development.md` (tools usage), spec status line.

- [x] **Step 1: `self-hosting.md`.** Rewrite the intro (no emulators), the service table (postgres replaces emulators), and the first run:
  1. Set `LEARNWREN_BOOTSTRAP_ADMIN_EMAIL` in `.env`.
  2. `docker compose up -d`, then register.
  3. Find the verify link in `docker compose logs api`, or in your inbox with SMTP set.
  4. Log in. You are ADMIN. Clear the variable.

  Then: backups (`pg_dump` from the `postgres` service plus the object-store volume; the `emulator-data` steps are gone), security (no admin ports to bind any more), upgrade note (**an install from before D3c kept accounts and data in the emulator volume; there is no migration, so start fresh or stay on the previous version**), and troubleshooting.
- [x] **Step 2: Criterion.** Amend line 62 to **met** with the date and slices A–D, in the existing amendment style.
- [x] **Step 3:** README D3c bullet (what shipped, the date, scope cuts: web-e2e stays on emulators; no emulator→Postgres migration; bootstrap demote caveat; the Firebase pieces still constructed in local mode) and the US-09-04 status. Update `USER_GUIDE.md`'s self-hosting row to **Built**, and add D3c to the spec status line.
- [x] **Step 4: Commit** `docs: US-09-04 D3c — self-hosting guide for postgres + local identity; criterion met`.

---

### Task 8: Security review, mutation, full verification

- [x] **Step 1: Security review** (security-reviewer agent, read-only, on the branch diff). Focus:
  - seam reachability in Compose and production;
  - bootstrap admin (matching, verification, idempotence, logging);
  - Compose secrets defaults (`learnwren-change-me`) and the Postgres exposure;
  - smoke script side effects.

  Fix Critical and High findings with tests; record Medium and Low in the README bullet.
- [x] **Step 2: Mutation** (mutation-round skill). api-auth runs inside `firebase emulators:exec --only auth` with `LEARNWREN_TEST_POSTGRES_URL`. apps/api's seam controller has no Stryker config today; do not add one, since it is test-only scaffolding pinned by its unit spec and every api-e2e run. Targets: 100% on api-auth; tools logic at 100% in whichever lib hosts it.
- [x] **Step 3: Full verification.**

```bash
NX_DAEMON=false pnpm nx run-many -t lint test typecheck build
LEARNWREN_TEST_POSTGRES_URL=postgres://postgres:learnwren@127.0.0.1:55432/learnwren_test \
  pnpm exec firebase emulators:exec --project demo-learnwren 'pnpm nx run api-auth:test --skip-nx-cache && pnpm nx run api-document-store:test --skip-nx-cache && pnpm nx e2e api-e2e'
LEARNWREN_DATA_STORE=postgres LEARNWREN_IDENTITY=local LEARNWREN_POSTGRES_URL=postgres://postgres:learnwren@127.0.0.1:55432/learnwren_test pnpm nx e2e api-e2e --skip-nx-cache
pnpm exec firebase emulators:exec --project demo-learnwren 'pnpm nx e2e web-e2e'
pnpm nx run web-e2e:a11y && pnpm nx run web-e2e:responsive
docker/smoke.sh --down
```

- [x] **Step 4: Commit** fixes and reports by path.

---

### Task 9: Land (controller)

Use the land-slice skill: README/USER_GUIDE already done in Task 7; flip this plan's checkboxes; `--no-ff` merge from the main checkout; remove the worktree; memory record with the merge SHA (seam endpoints, bootstrap variable, CI double run, intended (b) differences from Task 3).

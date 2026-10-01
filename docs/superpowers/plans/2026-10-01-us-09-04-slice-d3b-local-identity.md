# US-09-04 Slice D3b: Local Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a self-hosted `LocalIdentityProvider` behind the D3a `IdentityProvider` port, selected by `LEARNWREN_IDENTITY=local`, plus the email-action flow it needs: a port operation, `POST /api/auth/email-action`, and a `/auth/action` web page. The result is a working register → verify → login → reset → change-email cycle with no Firebase Auth.

**Architecture:** `LocalIdentityProvider` stores everything through the existing `DocumentStore` port. Firestore and Postgres both work, but `local` requires `postgres` at boot.
- Passwords are hashed with Node's built-in `crypto.scrypt`, parameters stored with the hash.
- Sessions and single-use email-action tokens are random 32-byte strings. Only their SHA-256 is stored.
- A new port operation, `applyEmailAction`, consumes a token. The Firebase adapter always rejects it, because its links land on Firebase's hosted page.
- The shared identity contract gains email-action cases. Every adapter that supports them must pass them: in-memory and local.
- The web app gains `/auth/action`, built on the unlock page's pattern.

D3c switches e2e, the tools and Compose.

**Tech Stack:** NestJS 11, Angular 21 (standalone, signals), Node `crypto` (scrypt, randomBytes, sha256), Vitest, the existing `DocumentStore` (in-memory, Firestore, Postgres). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-01-us-09-04-slice-d-auth-and-data-design.md` §3.4 (local adapter), §3.5 (errors and security), §3.6 (D3b row). The D3b must-dos from the D3a final review are in memory, `project_us_09_04_self_hosting.md`.

## Global Constraints

- **No behaviour change on the defaults** (`LEARNWREN_IDENTITY` unset or `firebase`). Every existing unit, api-e2e and web-e2e test passes unchanged.
- **Configuration:** `LEARNWREN_IDENTITY=firebase|local`, default `firebase`.
  - Any other value fails boot with exactly `LEARNWREN_IDENTITY must be "firebase" or "local", got "<value>".`
  - `local` with `LEARNWREN_DATA_STORE` not `postgres` fails boot with exactly `LEARNWREN_IDENTITY=local requires LEARNWREN_DATA_STORE=postgres.`
- **Local storage** (collections, all via `DocumentStore`):
  - `authUsers/{uid}`: `{ email, passwordHash, displayName, emailVerified, disabled, role?, createdAt }`, with `email` lower-cased.
  - `authEmails/{sha256(lower-cased email)}`: `{ uid }`. Emails are never raw document ids.
  - `authSessions/{sha256(token)}`: `{ uid, expiresAt }`.
  - `authEmailActions/{sha256(token)}`: `{ uid, kind, newEmail?, expiresAt }`.
  - `expiresAt` is epoch milliseconds (number).
- **Passwords:** `crypto.scrypt`, N=32768, r=8, p=1, a 16-byte random salt and a 64-byte key, with `maxmem` 64 MiB. Stored as `scrypt$32768$8$1$<salt base64>$<key base64>`. Compared with `crypto.timingSafeEqual`. An unknown email still runs scrypt against a dummy hash. Unknown email, wrong password and disabled account all reject with `InvalidCredentialsException`.
- **Tokens:** `crypto.randomBytes(32).toString('base64url')`. Only `sha256(token)` hex is stored, and raw tokens are never logged.
  - Session lifetime: `SESSION_MAX_AGE_SECONDS` (5 days).
  - Email-action TTL: verify-email 24 h; reset-password and change-email 1 h.
  - Action tokens are single-use, deleted in the same transaction that applies them.
- **Links:** `${publicUrl('/auth/action')}?mode=<EmailActionKind>&token=<token>`, where mode is `verify-email`, `reset-password` or `change-email`. `continuePath` is ignored by the local adapter, because the page routes by mode.
- **New port operation:** `applyEmailAction(kind, token, newPassword?)`.
  - Invalid, expired, used or wrong-kind token → `EmailActionInvalidError` (new).
  - A change-email whose target became taken → `EmailInUseError`.
  - A reset revokes all the user's sessions.
  - The Firebase adapter always throws `EmailActionInvalidError`.
- **New public API:** `POST /api/auth/email-action` `{ mode, token, newPassword? }` → `204`.
  - Bad token → `400 TOKEN_INVALID_OR_EXPIRED` (new `AuthErrorCode`).
  - Target taken → `409 EMAIL_ALREADY_EXISTS`.
  - Weak or long reset password → the existing `WEAK_PASSWORD` / `PASSWORD_TOO_LONG`.
  - DTOs are type guards only, and validation happens in the service (memory: Nest ValidationPipe DTO short-circuit).
- **New web route:** `/auth/action`, guest-accessible, joining the a11y and responsive route inventory.
- **Proofs and sessions:** the local adapter accepts only `PasswordProof`s it issued, and `verifySession` returns `null` for disabled or deleted users. The contract already pins both.
- **Work in a worktree** (`worktree-flow`): `git worktree add ../learnwren-us-09-04-d3b -b feat/us-09-04-d3b-local-identity HEAD`, then symlink `node_modules`.
  - **Never `git add -A`, never `git stash`.** Use `git show <sha>:<path>` or a temporary worktree instead.
  - Subagents prefix every command with `cd /Volumes/Artie-Storage/github-repos/learnwren-us-09-04-d3b && pwd && `.
  - Run nx with `NX_DAEMON=false`. Stale-dist recovery: `rm -rf dist/out-tsc`.
- Vitest does not type-check: run `nx typecheck` for every project touched, including `web` (memory: only `nx typecheck web` catches web route-ref breaks).
- **Local Postgres** for adapter tests: the `lw-d2-pg` container recipe from D2 (port 55432, `LEARNWREN_TEST_POSTGRES_URL=postgres://postgres:learnwren@127.0.0.1:55432/learnwren_test`). The controller starts it.
- Commit messages: conventional commits, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## File Structure

**Create:**

| File | Responsibility |
| :--- | :--- |
| `libs/api-auth/src/lib/identity/password-hash.ts` (+ spec) | `hashPassword`, `verifyPasswordHash`, `dummyPasswordHash`. |
| `libs/api-auth/src/lib/identity/opaque-token.ts` (+ spec) | `newOpaqueToken()`, `sha256Hex()`. |
| `libs/api-auth/src/lib/identity/local-identity-provider.ts` (+ spec, + contract spec) | The local adapter. |
| `libs/api-auth/src/lib/identity/identity.config.ts` (+ spec) | `readIdentityConfigFromEnv`. |
| `libs/api-auth/src/lib/dto/email-action.dto.ts` | `{ mode, token, newPassword? }` type guard. |
| `libs/web-auth/src/lib/email-action-page/email-action-page.component.{ts,html,spec.ts}` | The `/auth/action` page. |

**Modify:**
- `libs/shared-data-models/src/lib/auth.ts` (`EmailActionMode`) and `api-error.ts` (`TOKEN_INVALID_OR_EXPIRED`).
- `libs/api-auth/src/lib/identity/identity-provider.port.ts`, `identity.errors.ts`, `firebase-identity-provider.ts` (+ spec), `testing/in-memory-identity-provider.ts`, `testing/identity-provider.contract.ts`, `testing/in-memory-identity-provider.spec.ts`, `identity/firebase-identity-provider.contract.spec.ts`.
- `libs/api-auth/src/lib/errors/auth.exception.ts`, `account-recovery.service.ts` (+ spec), `auth.controller.ts` (+ spec), `auth.module.ts` (+ spec if present), `src/index.ts`.
- `libs/web-auth/src/lib/auth.service.ts` (+ spec) and `src/index.ts`.
- `apps/web/src/app/app.routes.ts`, `apps/web-e2e/src/_helpers/route-inventory.ts`, `.env.example`.
- Spec §3.4 and §3.6.

---

### Task 1: `applyEmailAction` on the port; contract cases; in-memory and Firebase adapters

**Files:**
- Modify: `libs/shared-data-models/src/lib/auth.ts`, `libs/api-auth/src/lib/identity/identity-provider.port.ts`, `identity.errors.ts`, `firebase-identity-provider.ts`, `firebase-identity-provider.spec.ts`, `firebase-identity-provider.contract.spec.ts`, `libs/api-auth/src/testing/identity-provider.contract.ts`, `in-memory-identity-provider.ts`, `in-memory-identity-provider.spec.ts`, `libs/api-auth/src/index.ts`

**Interfaces:**
- Produces:
  - `type EmailActionMode = 'verify-email' | 'reset-password' | 'change-email'` (shared-data-models). The port's `EmailActionKind` becomes an alias of it.
  - `EmailActionInvalidError`.
  - `IdentityProvider.applyEmailAction(kind: EmailActionKind, token: string, newPassword?: string): Promise<void>`.
  - Contract option `emailActions: boolean`.
  - An in-memory link format matching the local one: `…?mode=<kind>&token=<token>`.

- [ ] **Step 1: Shared type, port operation, error**

Append to `libs/shared-data-models/src/lib/auth.ts` (and export it from the lib's `index.ts` if `auth.ts` exports are listed there explicitly):

```ts
/** What an emailed action link does; the `mode` query parameter of /auth/action. */
export type EmailActionMode = 'verify-email' | 'reset-password' | 'change-email';
```

In `identity-provider.port.ts`, replace `export type EmailActionKind = …` with `export type EmailActionKind = EmailActionMode;` (importing the type from `@learnwren/shared-data-models`). Add to `IdentityProvider`:

```ts
  /**
   * Consume a single-use token from an emailed link (D3b). 'verify-email'
   * marks the email verified; 'reset-password' sets `newPassword` and revokes
   * every session; 'change-email' moves the account to the new address and
   * marks it verified. Rejects with EmailActionInvalidError for an unknown,
   * expired, used or wrong-kind token, and EmailInUseError when the
   * change-email target was taken after the link was sent. Adapters whose
   * links are handled elsewhere (Firebase's hosted action page) always reject
   * with EmailActionInvalidError.
   */
  applyEmailAction(kind: EmailActionKind, token: string, newPassword?: string): Promise<void>;
```

Append to `identity.errors.ts`:

```ts
/** An email-action token that is unknown, expired, already used or for another kind of action. */
export class EmailActionInvalidError extends Error {
  override readonly name = 'EmailActionInvalidError';
  constructor() {
    super('Email action token is invalid or expired');
  }
}
```

Export `EmailActionInvalidError` from `libs/api-auth/src/index.ts`.

- [ ] **Step 2: Contract cases (write first, watch them fail on in-memory)**

In `testing/identity-provider.contract.ts`:
- Add `readonly emailActions: boolean;` to `IdentityContractOptions`, with JSDoc: "False for an adapter whose links are handled elsewhere (Firebase)".
- Add a helper `const tokenOf = (link: string) => new URL(link).searchParams.get('token') ?? '';`.
- Add this block after the revocation block:

```ts
    describe.skipIf(!options.emailActions)('email actions', () => {
      it('verify-email marks the email verified and the token is single-use', async () => {
        const address = email();
        const uid = await idp.createUser({ email: address, password: PASSWORD, displayName: 'A' });
        const link = await idp.createEmailActionLink('verify-email', address, '/login');
        expect(new URL(link).searchParams.get('mode')).toBe('verify-email');
        await idp.applyEmailAction('verify-email', tokenOf(link));
        expect((await idp.getUser(uid))?.emailVerified).toBe(true);
        await expect(idp.applyEmailAction('verify-email', tokenOf(link))).rejects.toBeInstanceOf(EmailActionInvalidError);
      });

      it('reset-password sets the new password and revokes every session', async () => {
        const address = email();
        const uid = await idp.createUser({ email: address, password: PASSWORD, displayName: 'A' });
        const session = await signIn(address);
        const link = await idp.createEmailActionLink('reset-password', address, '/login?reset=ok');
        await idp.applyEmailAction('reset-password', tokenOf(link), 'Brand-New-Pass-42!');
        await expect(idp.verifyPassword(address, PASSWORD)).rejects.toBeInstanceOf(InvalidCredentialsException);
        expect((await idp.verifyPassword(address, 'Brand-New-Pass-42!')).uid).toBe(uid);
        expect(await idp.verifySession(session.token)).toBeNull();
      });

      it('change-email moves the account to the new address, verified', async () => {
        const oldAddress = email();
        const newAddress = email();
        const uid = await idp.createUser({ email: oldAddress, password: PASSWORD, displayName: 'A' });
        const link = await idp.createEmailActionLink('change-email', oldAddress, '/x', newAddress);
        await idp.applyEmailAction('change-email', tokenOf(link));
        expect(await idp.getUser(uid)).toEqual({ uid, email: newAddress, emailVerified: true });
        expect(await idp.getUserByEmail(oldAddress)).toBeNull();
        expect((await idp.verifyPassword(newAddress, PASSWORD)).uid).toBe(uid);
      });

      it('change-email rejects with EmailInUseError when the target was taken after the link was sent, changing nothing', async () => {
        const oldAddress = email();
        const target = email();
        const uid = await idp.createUser({ email: oldAddress, password: PASSWORD, displayName: 'A' });
        const link = await idp.createEmailActionLink('change-email', oldAddress, '/x', target);
        await idp.createUser({ email: target, password: PASSWORD, displayName: 'B' });
        await expect(idp.applyEmailAction('change-email', tokenOf(link))).rejects.toBeInstanceOf(EmailInUseError);
        expect((await idp.getUser(uid))?.email).toBe(oldAddress);
      });

      it('rejects an unknown token and a token used for the wrong kind', async () => {
        const address = email();
        await idp.createUser({ email: address, password: PASSWORD, displayName: 'A' });
        await expect(idp.applyEmailAction('verify-email', 'not-a-token')).rejects.toBeInstanceOf(EmailActionInvalidError);
        const link = await idp.createEmailActionLink('verify-email', address, '/login');
        await expect(idp.applyEmailAction('reset-password', tokenOf(link), 'Brand-New-Pass-42!')).rejects.toBeInstanceOf(
          EmailActionInvalidError,
        );
        await expect(idp.applyEmailAction('verify-email', tokenOf(link))).resolves.toBeUndefined();
      });
    });
```

Import `EmailActionInvalidError`. Update both existing callers of `describeIdentityProviderContract`:
- in-memory: `{ revocation: true, emailActions: true }`;
- Firebase: `{ revocation: false, emailActions: false }`.

Run `NX_DAEMON=false pnpm nx test api-auth` and expect the new cases to FAIL on in-memory, with `applyEmailAction` missing and the link format wrong.

- [ ] **Step 3: In-memory adapter**

In `testing/in-memory-identity-provider.ts`:
- `createEmailActionLink` mints `const token = \`action-${++seq}\``, records `actions.set(token, { uid, kind, newEmail })` (a new `Map`), and returns `http://in-memory.test/auth/action?mode=${kind}&token=${token}`. It still pushes the link to `__links`, and keeps the existing change-email `EmailInUseError` and missing-`newEmail` checks. `uid` comes from the user found by email. Throw `Error('in-memory identity: no user for email')` if there is none.
- `applyEmailAction(kind, token, newPassword)`:
  - look up and delete the action; a missing action or a kind mismatch → `EmailActionInvalidError`;
  - `verify-email` → set `emailVerified: true`;
  - `reset-password` → require `newPassword` (else `EmailActionInvalidError`), set the password, then `dropSessionsOf(uid)`;
  - `change-email` → if `byEmail(newEmail)` exists for another uid → `EmailInUseError` (leave the action unconsumed); else set `email: normalizeEmail(newEmail), emailVerified: true`.
- On a wrong-kind or `EmailInUseError` rejection, do not consume the token, so the contract's "wrong kind, then the right kind" case passes. Only a successful apply deletes it.

- [ ] **Step 4: Firebase adapter**

In `firebase-identity-provider.ts`:

```ts
  /** Firebase handles its action links on its own hosted page; nothing reaches the api. */
  async applyEmailAction(): Promise<void> {
    throw new EmailActionInvalidError();
  }
```

Add a unit test to `firebase-identity-provider.spec.ts`: rejects with `EmailActionInvalidError` for every kind.

- [ ] **Step 5: Run tests, typecheck, lint; Firebase contract on the emulator**

Run: `NX_DAEMON=false pnpm nx run-many -t test typecheck lint -p api-auth shared-data-models api api-profile`
Expected: PASS, with the in-memory contract now including 5 email-action cases.

Probe 9099/4000/4400, then run:
`pnpm exec firebase emulators:exec --only auth --project demo-learnwren 'NX_DAEMON=false pnpm nx run api-auth:test --skip-nx-cache'`
Expected: PASS (Firebase skips the email-action block).

- [ ] **Step 6: Commit**

```bash
git add <each changed file by path>
git commit -m "feat(api-auth): applyEmailAction on the identity port; contract pins email actions (US-09-04 D3b)"
```

---

### Task 2: Password hashing and opaque tokens

**Files:**
- Create: `libs/api-auth/src/lib/identity/password-hash.ts`, `password-hash.spec.ts`, `opaque-token.ts`, `opaque-token.spec.ts`

**Interfaces:**
- Produces:
  - `hashPassword(password: string): Promise<string>`
  - `verifyPasswordHash(password: string, stored: string): Promise<boolean>` (false for a malformed stored hash, never throws on one)
  - `dummyPasswordHash(): Promise<string>` (memoised)
  - `newOpaqueToken(): string`
  - `sha256Hex(value: string): string`

- [ ] **Step 1: Failing tests**

`password-hash.spec.ts`:

```ts
import { dummyPasswordHash, hashPassword, verifyPasswordHash } from './password-hash';

describe('password hashing (scrypt)', () => {
  it('stores scrypt parameters, a 16-byte salt and a 64-byte key', async () => {
    const stored = await hashPassword('Correct-Horse-9-battery');
    const [scheme, n, r, p, salt, key] = stored.split('$');
    expect([scheme, n, r, p]).toEqual(['scrypt', '32768', '8', '1']);
    expect(Buffer.from(salt, 'base64')).toHaveLength(16);
    expect(Buffer.from(key, 'base64')).toHaveLength(64);
  });

  it('verifies the right password and rejects a wrong one', async () => {
    const stored = await hashPassword('Correct-Horse-9-battery');
    expect(await verifyPasswordHash('Correct-Horse-9-battery', stored)).toBe(true);
    expect(await verifyPasswordHash('correct-horse-9-battery', stored)).toBe(false);
  });

  it('salts: the same password hashes differently each time', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('honours the parameters stored with the hash', async () => {
    const stored = await hashPassword('p');
    const [, , , , salt, key] = stored.split('$');
    // Same salt+key under different stored params must not verify.
    expect(await verifyPasswordHash('p', `scrypt$16384$8$1$${salt}$${key}`)).toBe(false);
  });

  it('returns false (never throws) for malformed stored hashes', async () => {
    for (const bad of ['', 'scrypt$1$2', 'bcrypt$32768$8$1$a$b', 'scrypt$x$8$1$AAAA$AAAA', 'scrypt$32768$8$1$AAAA$']) {
      expect(await verifyPasswordHash('p', bad)).toBe(false);
    }
  });

  it('memoises a dummy hash that never matches a user password', async () => {
    const dummy = await dummyPasswordHash();
    expect(dummy).toBe(await dummyPasswordHash());
    expect(await verifyPasswordHash('Correct-Horse-9-battery', dummy)).toBe(false);
  });
});
```

`opaque-token.spec.ts`:

```ts
import { newOpaqueToken, sha256Hex } from './opaque-token';

describe('opaque tokens', () => {
  it('are 32 random bytes in base64url (43 chars) and never repeat', () => {
    const tokens = new Set(Array.from({ length: 500 }, () => newOpaqueToken()));
    expect(tokens.size).toBe(500);
    for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('sha256Hex is the lower-case hex SHA-256', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
```

Run and expect FAIL (modules missing).

- [ ] **Step 2: Implement**

`password-hash.ts`:

```ts
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const SCHEME = 'scrypt';
const COST = 32768; // N
const BLOCK_SIZE = 8; // r
const PARALLELISM = 1; // p
const SALT_BYTES = 16;
const KEY_BYTES = 64;
// N=32768, r=8 needs 128*N*r = 32 MiB, exactly Node's default maxmem; give headroom.
const MAX_MEMORY_BYTES = 64 * 1024 * 1024;

function derive(password: string, salt: Buffer, options: ScryptOptions, keyBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, keyBytes, options, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

/** scrypt$N$r$p$salt$key: parameters travel with the hash so they can be raised later. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, { N: COST, r: BLOCK_SIZE, p: PARALLELISM, maxmem: MAX_MEMORY_BYTES }, KEY_BYTES);
  return [SCHEME, COST, BLOCK_SIZE, PARALLELISM, salt.toString('base64'), key.toString('base64')].join('$');
}

/** Constant-time check against a stored hash; false for a wrong password or a malformed hash. */
export async function verifyPasswordHash(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== SCHEME) return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, 'base64');
  if (expected.length === 0) return false;
  try {
    const actual = await derive(
      password,
      Buffer.from(saltB64, 'base64'),
      { N: Number(n), r: Number(r), p: Number(p), maxmem: MAX_MEMORY_BYTES },
      expected.length,
    );
    return timingSafeEqual(actual, expected);
  } catch {
    // Invalid stored parameters (e.g. N not a power of two): treat as a non-match.
    return false;
  }
}

let dummy: Promise<string> | undefined;

/** A hash of a random secret, so an unknown email costs the same scrypt work as a known one. */
export function dummyPasswordHash(): Promise<string> {
  dummy ??= hashPassword(randomBytes(32).toString('base64'));
  return dummy;
}
```

`opaque-token.ts`:

```ts
import { createHash, randomBytes } from 'node:crypto';

const TOKEN_BYTES = 32;

/** A bearer secret for sessions and email links. Store only sha256Hex(token). */
export function newOpaqueToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
```

- [ ] **Step 3: Run tests, typecheck, lint; commit**

Run: `NX_DAEMON=false pnpm nx run-many -t test typecheck lint -p api-auth`
Expected: PASS.

```bash
git add libs/api-auth/src/lib/identity/password-hash.ts libs/api-auth/src/lib/identity/password-hash.spec.ts libs/api-auth/src/lib/identity/opaque-token.ts libs/api-auth/src/lib/identity/opaque-token.spec.ts
git commit -m "feat(api-auth): scrypt password hashing and opaque tokens for local identity (US-09-04 D3b)"
```

---

### Task 3: `LocalIdentityProvider`, proven by the contract

**Files:**
- Create: `libs/api-auth/src/lib/identity/local-identity-provider.ts`, `local-identity-provider.spec.ts` (unit: clock, TTLs, hashing-at-rest, no raw tokens stored), `local-identity-provider.contract.spec.ts`

**Interfaces:**
- Consumes: the port, errors, `publicUrl`, `SESSION_MAX_AGE_SECONDS`, Task 2 helpers, and `DocumentStore` / `DocRef` from `@learnwren/api-document-store` (`createInMemoryDocumentStore` and `PostgresDocumentStore` in tests).
- Produces: `class LocalIdentityProvider implements IdentityProvider`, constructed as `new LocalIdentityProvider(store: DocumentStore, now: () => number = Date.now)`; exported constants `LOCAL_COLLECTIONS`, `EMAIL_ACTION_TTL_MS`.

- [ ] **Step 1: Contract spec (fails until the adapter exists)**

`local-identity-provider.contract.spec.ts`:

```ts
import { Pool } from 'pg';
import { createInMemoryDocumentStore, PostgresDocumentStore } from '@learnwren/api-document-store';

import { describeIdentityProviderContract } from '../../testing/identity-provider.contract';
import { LocalIdentityProvider } from './local-identity-provider';

describeIdentityProviderContract('local (in-memory store)', () => new LocalIdentityProvider(createInMemoryDocumentStore()), {
  revocation: true,
  emailActions: true,
});

// Against a real Postgres when one is available (CI e2e job; locally the lw-d2-pg container).
const url = process.env['LEARNWREN_TEST_POSTGRES_URL'];
describe.skipIf(!url)('local identity on Postgres', () => {
  const pool = new Pool({ connectionString: url });
  const store = new PostgresDocumentStore(pool);
  beforeAll(() => store.ensureSchema());
  afterAll(() => pool.end());
  describeIdentityProviderContract('local (postgres)', () => new LocalIdentityProvider(store), {
    revocation: true,
    emailActions: true,
  });
});
```

If `api-auth` → `api-document-store` is a new project dependency, `pnpm nx sync` adds the reference. Check module boundaries: both are `scope:api`, so it is allowed. Confirm there is no import cycle: `api-document-store` must not import `api-auth`.

- [ ] **Step 2: Implement the adapter**

`local-identity-provider.ts`:

```ts
import type { DocRef, DocumentStore } from '@learnwren/api-document-store';
import type { UserRole } from '@learnwren/shared-data-models';

import { InvalidCredentialsException } from '../errors/auth.exception';
import { EmailActionInvalidError, EmailInUseError } from './identity.errors';
import {
  SESSION_MAX_AGE_SECONDS,
  type EmailActionKind,
  type IdentityProvider,
  type IdentityUser,
  type MintedSession,
  type PasswordProof,
  type SessionClaims,
} from './identity-provider.port';
import { newOpaqueToken, sha256Hex } from './opaque-token';
import { dummyPasswordHash, hashPassword, verifyPasswordHash } from './password-hash';
import { publicUrl } from './public-url';

export const LOCAL_COLLECTIONS = {
  users: 'authUsers',
  emails: 'authEmails',
  sessions: 'authSessions',
  actions: 'authEmailActions',
} as const;

const HOUR_MS = 60 * 60 * 1000;
export const EMAIL_ACTION_TTL_MS: Readonly<Record<EmailActionKind, number>> = {
  'verify-email': 24 * HOUR_MS,
  'reset-password': HOUR_MS,
  'change-email': HOUR_MS,
};

interface StoredUser {
  email: string;
  passwordHash: string;
  displayName: string;
  emailVerified: boolean;
  disabled: boolean;
  role?: UserRole;
  createdAt: string;
}
interface StoredSession {
  uid: string;
  expiresAt: number;
}
interface StoredAction {
  uid: string;
  kind: EmailActionKind;
  newEmail?: string;
  expiresAt: number;
}

const normalizeEmail = (email: string): string => email.toLowerCase();

/**
 * Self-hosted identity (spec §3.4): accounts, sessions and email-action tokens
 * stored through the DocumentStore port. Passwords are scrypt hashes; session
 * and action tokens are random bearer secrets stored only as SHA-256.
 *
 * ponytail: expired sessions and action tokens are rejected on read but never
 * swept; add a cleanup job if the collections grow large.
 */
export class LocalIdentityProvider implements IdentityProvider {
  private readonly issuedProofs = new WeakSet<object>();

  constructor(
    private readonly store: DocumentStore,
    private readonly now: () => number = Date.now,
  ) {}

  private userRef(uid: string): DocRef {
    return this.store.collection(LOCAL_COLLECTIONS.users).doc(uid);
  }
  private emailRef(email: string): DocRef {
    return this.store.collection(LOCAL_COLLECTIONS.emails).doc(sha256Hex(normalizeEmail(email)));
  }
  private sessionRef(token: string): DocRef {
    return this.store.collection(LOCAL_COLLECTIONS.sessions).doc(sha256Hex(token));
  }
  private actionRef(token: string): DocRef {
    return this.store.collection(LOCAL_COLLECTIONS.actions).doc(sha256Hex(token));
  }

  private async findByEmail(email: string): Promise<{ uid: string; user: StoredUser } | null> {
    const index = await this.emailRef(email).get();
    if (!index.exists) return null;
    const uid = (index.data() as { uid: string }).uid;
    const snap = await this.userRef(uid).get();
    return snap.exists ? { uid, user: snap.data() as StoredUser } : null;
  }

  async createUser(input: { email: string; password: string; displayName: string }): Promise<string> {
    const email = normalizeEmail(input.email);
    const passwordHash = await hashPassword(input.password);
    const uid = this.store.collection(LOCAL_COLLECTIONS.users).doc().id;
    const emailRef = this.emailRef(email);
    await this.store.runTransaction(async (txn) => {
      if ((await txn.get(emailRef)).exists) throw new EmailInUseError();
      txn.set(emailRef, { uid });
      const user: StoredUser = {
        email,
        passwordHash,
        displayName: input.displayName,
        emailVerified: false,
        disabled: false,
        createdAt: new Date(this.now()).toISOString(),
      };
      txn.set(this.userRef(uid), user);
    });
    return uid;
  }

  async getUser(uid: string): Promise<IdentityUser | null> {
    const snap = await this.userRef(uid).get();
    if (!snap.exists) return null;
    const user = snap.data() as StoredUser;
    return { uid, email: user.email, emailVerified: user.emailVerified };
  }

  async getUserByEmail(email: string): Promise<IdentityUser | null> {
    const found = await this.findByEmail(email);
    return found ? { uid: found.uid, email: found.user.email, emailVerified: found.user.emailVerified } : null;
  }

  async updateUser(uid: string, changes: { password?: string; disabled?: boolean; emailVerified?: boolean }): Promise<void> {
    const patch: Partial<StoredUser> = {
      ...(changes.password !== undefined ? { passwordHash: await hashPassword(changes.password) } : {}),
      ...(changes.disabled !== undefined ? { disabled: changes.disabled } : {}),
      ...(changes.emailVerified !== undefined ? { emailVerified: changes.emailVerified } : {}),
    };
    await this.userRef(uid).update(patch);
  }

  async deleteUser(uid: string): Promise<void> {
    const snap = await this.userRef(uid).get();
    if (snap.exists) {
      const user = snap.data() as StoredUser;
      const batch = this.store.batch();
      batch.delete(this.emailRef(user.email));
      batch.delete(this.userRef(uid));
      await batch.commit();
    }
    await this.revokeAllSessions(uid);
  }

  async setRole(uid: string, role: UserRole): Promise<void> {
    await this.userRef(uid).update({ role });
  }

  async verifyPassword(email: string, password: string): Promise<PasswordProof> {
    const found = await this.findByEmail(email);
    // Same scrypt cost whether or not the account exists: the response time must not reveal it.
    const matches = await verifyPasswordHash(password, found ? found.user.passwordHash : await dummyPasswordHash());
    if (!found || !matches || found.user.disabled) throw new InvalidCredentialsException();
    const proof: PasswordProof = { uid: found.uid };
    this.issuedProofs.add(proof);
    return proof;
  }

  async createSession(proof: PasswordProof): Promise<MintedSession> {
    if (!this.issuedProofs.has(proof)) throw new Error('Password proof was not issued by this identity provider');
    this.issuedProofs.delete(proof);
    const token = newOpaqueToken();
    const session: StoredSession = { uid: proof.uid, expiresAt: this.now() + SESSION_MAX_AGE_SECONDS * 1000 };
    await this.sessionRef(token).set(session);
    return { token, maxAgeSeconds: SESSION_MAX_AGE_SECONDS };
  }

  async verifySession(token: string): Promise<SessionClaims | null> {
    const snap = await this.sessionRef(token).get();
    if (!snap.exists) return null;
    const session = snap.data() as StoredSession;
    if (session.expiresAt <= this.now()) return null;
    const userSnap = await this.userRef(session.uid).get();
    if (!userSnap.exists) return null;
    const user = userSnap.data() as StoredUser;
    if (user.disabled) return null;
    return { uid: session.uid, email: user.email, role: user.role, emailVerified: user.emailVerified };
  }

  /** Ends this session only (Firebase ends all; callers needing that use revokeAllSessions). */
  async endSession(token: string): Promise<void> {
    await this.sessionRef(token).delete();
  }

  async revokeAllSessions(uid: string): Promise<void> {
    const snap = await this.store.collection(LOCAL_COLLECTIONS.sessions).where('uid', '==', uid).get();
    if (snap.empty) return;
    const batch = this.store.batch();
    for (const doc of snap.docs) batch.delete(doc.ref);
    await batch.commit();
  }

  async createEmailActionLink(kind: EmailActionKind, email: string, _continuePath: string, newEmail?: string): Promise<string> {
    if (kind === 'change-email' && !newEmail) throw new Error('change-email requires newEmail');
    const found = await this.findByEmail(email);
    if (!found) throw new Error('No account for that email');
    if (kind === 'change-email' && (await this.emailRef(newEmail as string).get()).exists) throw new EmailInUseError();
    const token = newOpaqueToken();
    const action: StoredAction = {
      uid: found.uid,
      kind,
      ...(newEmail ? { newEmail: normalizeEmail(newEmail) } : {}),
      expiresAt: this.now() + EMAIL_ACTION_TTL_MS[kind],
    };
    await this.actionRef(token).set(action);
    return `${publicUrl('/auth/action')}?mode=${encodeURIComponent(kind)}&token=${encodeURIComponent(token)}`;
  }

  async applyEmailAction(kind: EmailActionKind, token: string, newPassword?: string): Promise<void> {
    const passwordHash = kind === 'reset-password' && newPassword ? await hashPassword(newPassword) : undefined;
    const actionRef = this.actionRef(token);
    const uid = await this.store.runTransaction(async (txn) => {
      const actionSnap = await txn.get(actionRef);
      if (!actionSnap.exists) throw new EmailActionInvalidError();
      const action = actionSnap.data() as StoredAction;
      if (action.kind !== kind || action.expiresAt <= this.now()) throw new EmailActionInvalidError();
      const userRef = this.userRef(action.uid);
      const userSnap = await txn.get(userRef);
      if (!userSnap.exists) throw new EmailActionInvalidError();
      const user = userSnap.data() as StoredUser;
      if (kind === 'change-email') {
        const target = action.newEmail as string;
        const targetRef = this.emailRef(target);
        if ((await txn.get(targetRef)).exists) throw new EmailInUseError();
        txn.delete(this.emailRef(user.email));
        txn.set(targetRef, { uid: action.uid });
        txn.update(userRef, { email: target, emailVerified: true });
      } else if (kind === 'reset-password') {
        if (!passwordHash) throw new EmailActionInvalidError();
        txn.update(userRef, { passwordHash });
      } else {
        txn.update(userRef, { emailVerified: true });
      }
      txn.delete(actionRef);
      return action.uid;
    });
    if (kind === 'reset-password') await this.revokeAllSessions(uid);
  }
}
```

`EmailInUseError` inside the change-email transaction rejects the transaction, so nothing changes and the action is not consumed. This matches the contract.

- [ ] **Step 3: Unit spec for what the contract cannot see**

`local-identity-provider.spec.ts` uses `createInMemoryDocumentStore()` and an injectable clock (`let t = 1_000_000; const idp = new LocalIdentityProvider(store, () => t)`). It covers:
- **At rest:**
  - no raw token is stored: every key under `authSessions/` and `authEmailActions/` in `store.__store` is a 64-char hex string, and no stored value contains the minted token;
  - `authUsers/{uid}.passwordHash` starts with `scrypt$` and does not contain the password;
  - the email index key is `sha256Hex(lower-cased email)`.
- **Expiry:**
  - a session is rejected after `SESSION_MAX_AGE_SECONDS * 1000` ms (advance `t`) and accepted just before;
  - each action kind is rejected after its `EMAIL_ACTION_TTL_MS` and accepted just before.
- **Proofs and deletion:**
  - a proof cannot mint two sessions (second `createSession` with the same proof rejects);
  - `deleteUser` removes the email index, so the address can be registered again.
- **Links:** carry `publicUrl('/auth/action')` and both params (set `LEARNWREN_PUBLIC_URL` in the test and restore it after).
- **Timing guard:** `verifyPassword` for an unknown email calls `verifyPasswordHash` with the dummy hash. Spy via `vi.mock('./password-hash', …)` partial, or assert by timing-free means. Prefer a module spy that records the second argument equals `await dummyPasswordHash()`.

- [ ] **Step 4: Run (the controller has the test Postgres running)**

Run: `LEARNWREN_TEST_POSTGRES_URL=postgres://postgres:learnwren@127.0.0.1:55432/learnwren_test NX_DAEMON=false pnpm nx test api-auth --skip-nx-cache`
Expected: PASS, with both `local (in-memory store)` and `local (postgres)` contracts running all cases: 15 base + 4 revocation + 5 email actions.

Then: `NX_DAEMON=false pnpm nx run-many -t typecheck lint -p api-auth`.

- [ ] **Step 5: Commit**

```bash
git add libs/api-auth/src/lib/identity/local-identity-provider.ts libs/api-auth/src/lib/identity/local-identity-provider.spec.ts libs/api-auth/src/lib/identity/local-identity-provider.contract.spec.ts <tsconfig files nx sync changed>
git commit -m "feat(api-auth): LocalIdentityProvider on the DocumentStore port, contract-proven on in-memory and Postgres (US-09-04 D3b)"
```

---

### Task 4: `LEARNWREN_IDENTITY` selector and module wiring

**Files:**
- Create: `libs/api-auth/src/lib/identity/identity.config.ts`, `identity.config.spec.ts`
- Modify: `libs/api-auth/src/lib/auth.module.ts` (+ a module spec, `auth.module.spec.ts`, created if absent), `libs/api-auth/src/index.ts` (export `LocalIdentityProvider`), `.env.example`

**Interfaces:**
- Produces:
  - `type IdentityKind = 'firebase' | 'local'`
  - `readIdentityConfigFromEnv(env: Record<string, string | undefined>): IdentityKind`
  - `makeIdentityProvider(kind: IdentityKind, firebase: FirebaseIdentityProvider, store: DocumentStore): IdentityProvider`

- [ ] **Step 1: Failing tests**

`identity.config.spec.ts` covers:
- default → `'firebase'`;
- `firebase` → `'firebase'`;
- `local` with `LEARNWREN_DATA_STORE=postgres` → `'local'`;
- `local` without it, or with `firestore` → throws exactly `LEARNWREN_IDENTITY=local requires LEARNWREN_DATA_STORE=postgres.`;
- anything else → throws exactly `LEARNWREN_IDENTITY must be "firebase" or "local", got "x".`

The module spec tests `makeIdentityProvider('firebase', firebaseFake, store)` returns the Firebase instance, and `('local', …)` returns a `LocalIdentityProvider`.

- [ ] **Step 2: Implement**

`identity.config.ts`:

```ts
export type IdentityKind = 'firebase' | 'local';

/** LEARNWREN_IDENTITY=firebase (default) | local (self-hosted; needs LEARNWREN_DATA_STORE=postgres). */
export function readIdentityConfigFromEnv(env: Record<string, string | undefined>): IdentityKind {
  const raw = env['LEARNWREN_IDENTITY'] ?? 'firebase';
  if (raw === 'firebase') return 'firebase';
  if (raw !== 'local') throw new Error(`LEARNWREN_IDENTITY must be "firebase" or "local", got "${raw}".`);
  if (env['LEARNWREN_DATA_STORE'] !== 'postgres') {
    throw new Error('LEARNWREN_IDENTITY=local requires LEARNWREN_DATA_STORE=postgres.');
  }
  return 'local';
}
```

In `auth.module.ts`, replace `{ provide: IDENTITY_PROVIDER, useExisting: FirebaseIdentityProvider }` with:

```ts
{
  provide: IDENTITY_PROVIDER,
  inject: [FirebaseIdentityProvider, DOCUMENT_STORE],
  useFactory: (firebase: FirebaseIdentityProvider, store: DocumentStore) =>
    makeIdentityProvider(readIdentityConfigFromEnv(process.env), firebase, store),
},
```

with an exported `makeIdentityProvider` (in `identity.config.ts` or the module file) that returns `kind === 'local' ? new LocalIdentityProvider(store) : firebase`.

Add a `ponytail:` comment. `FirebaseIdentityProvider` and `FirebaseAuthRestClient` are still constructed in local mode. That is harmless, because neither touches the network until called, and the emulator-mode `FIREBASE_WEB_API_KEY` defaults to `'fake-api-key'`. It is unsupported to combine `local` with `LEARNWREN_FIREBASE_TARGET=production`, which would demand a web API key. Make them conditional only if that combination is ever needed.

`DOCUMENT_STORE` is global (from `DocumentStoreModule`), so `AuthModule` can inject it.

- [ ] **Step 3: `.env.example`**

After the data-store block, in the file's style:

```bash
# Identity (US-09-04 Slice D3b). firebase (default: Firebase Authentication,
# or its emulator in local dev) or local (self-hosted accounts, sessions and
# email links in the data store; requires LEARNWREN_DATA_STORE=postgres).
# LEARNWREN_IDENTITY=firebase
```

- [ ] **Step 4: Run, boot-check, commit**

Run: `NX_DAEMON=false pnpm nx run-many -t test typecheck lint -p api-auth api`. Expected: PASS.

```bash
git add <each changed file by path>
git commit -m "feat(api-auth): LEARNWREN_IDENTITY selects Firebase or local identity at boot (US-09-04 D3b)"
```

---

### Task 5: `POST /api/auth/email-action`

**Files:**
- Modify:
  - `libs/shared-data-models/src/lib/api-error.ts`: add `| 'TOKEN_INVALID_OR_EXPIRED'` to `AuthErrorCode`.
  - `libs/api-auth/src/lib/errors/auth.exception.ts`: `EmailActionTokenInvalidException`, code `TOKEN_INVALID_OR_EXPIRED`, HTTP 400, mirroring `InvalidUnlockTokenException`.
  - `libs/api-auth/src/lib/account-recovery.service.ts` and its spec.
  - `libs/api-auth/src/lib/auth.controller.ts` and its spec.
- Create: `libs/api-auth/src/lib/dto/email-action.dto.ts`.

**Interfaces:**
- Produces: `AccountRecoveryService.applyEmailAction(mode: string, token: string, newPassword?: string): Promise<void>`; the endpoint `POST /api/auth/email-action` → 204.

- [ ] **Step 1: Write the failing service and controller tests**

`account-recovery.service.spec.ts`, with the identity mocked with `vi.fn`, or `createInMemoryIdentityProvider` where outcomes matter:
- a `mode` not in `verify-email | reset-password | change-email` → `EmailActionTokenInvalidException`, and the identity is never called;
- `verify-email` / `change-email` call `identity.applyEmailAction(mode, token)` with no password;
- `reset-password` without `newPassword`, or with one failing policy → the same exceptions registration raises:
  - use `PasswordPolicyService.validate` → `WeakPasswordException(unmet)`;
  - over `PASSWORD_MAX` → `PasswordTooLongException`;
  - read `auth.service.ts` `validateRegisterInput` for the exact checks and constants, and reuse them, don't copy (extract a small shared helper if needed, e.g. `assertAcceptablePassword(policy, password)`);
- a valid reset calls `applyEmailAction('reset-password', token, newPassword)`;
- `EmailActionInvalidError` → `EmailActionTokenInvalidException`;
- `EmailInUseError` → `EmailAlreadyExistsException`;
- any other error → logged and `InternalAuthException`.

Never log the token.

`auth.controller.spec.ts`: `POST email-action` delegates `{ mode, token, newPassword }` to the service and returns 204.

- [ ] **Step 2: Implement**

DTO, type guards only (no length decorators, per memory `feedback_nest_validationpipe_dto_short_circuit.md`):

```ts
import { IsOptional, IsString } from 'class-validator';

export class EmailActionDto {
  @IsString()
  mode!: string;

  @IsString()
  token!: string;

  @IsOptional()
  @IsString()
  newPassword?: string;
}
```

Controller:

```ts
  @Post('email-action')
  @HttpCode(204)
  async emailAction(@Body() dto: EmailActionDto): Promise<void> {
    await this.recovery.applyEmailAction(dto.mode, dto.token, dto.newPassword);
  }
```

`AccountRecoveryService.applyEmailAction` implements the tested behaviour. `AuthController` is already on `PUBLIC_ALLOWLIST`, and the global `ThrottlerGuard` rate-limits it like `unlock`. Confirm `apps/api/src/controller-guard-coverage.spec.ts` still passes.

- [ ] **Step 3: Run, commit**

Run: `NX_DAEMON=false pnpm nx run-many -t test typecheck lint -p api-auth shared-data-models api web-auth web`. Web compiles against the widened union.

```bash
git add <each changed file by path>
git commit -m "feat(api-auth): POST /api/auth/email-action applies local email-action tokens (US-09-04 D3b)"
```

---

### Task 6: The `/auth/action` web page

**Files:**
- Create: `libs/web-auth/src/lib/email-action-page/email-action-page.component.ts`, `.html`, `.spec.ts`
- Modify: `libs/web-auth/src/lib/auth.service.ts` (+ spec), `libs/web-auth/src/index.ts`, `apps/web/src/app/app.routes.ts`, `apps/web-e2e/src/_helpers/route-inventory.ts`

**Interfaces:**
- Consumes: `EmailActionMode` (shared-data-models), `passwordPolicyValidator` (web-auth), and the unlock page's patterns. Read `unlock-page.component.{ts,html,spec.ts}` and `register-page.component.ts` (form and validator) first. The UI uses the existing design tokens and `HlmAlert`; see memory `project_us_09_03_accessibility.md` (never change `--lw-*` token values; spartan primitives own their ARIA).
- Produces:
  - `AuthService.applyEmailAction(mode, token, newPassword?): Promise<EmailActionResult>`, where `EmailActionResult = { ok: true } | { ok: false; code: string; unmet?: string[] }` (mirror `UnlockResult`; map HTTP error bodies to `code` exactly as `unlock` does).
  - `EmailActionPageComponent` (selector `app-email-action-page`).

- [ ] **Step 1: Behaviour, as tests first (`email-action-page.component.spec.ts`)**

- Missing `mode` or `token`, or an unknown `mode` → `invalid` state, with no POST.
- `verify-email` → POSTs on init (state `pending`); ok → `verified` state (heading "Email verified", link "Continue to sign in" → `/login`); `TOKEN_INVALID_OR_EXPIRED` → `invalid` state (heading "This link is invalid or has expired", with links to `/login` and `/forgot-password`); any other error → `error` alert.
- `change-email` → POSTs on init; ok → `router.navigateByUrl('/settings/profile/email-changed')`, the existing landing page that confirms and signs out; `EMAIL_ALREADY_EXISTS` → `taken` state ("That email address is already in use"); invalid → `invalid`.
- `reset-password` → **no POST on init**. Renders a form: one password field labelled "New password", with `passwordPolicyValidator()`, the same requirement hints as the register page, and submit "Set new password". On a submit that fails client validation, nothing is sent. On a valid submit, it POSTs with `newPassword`:
  - ok → `router.navigateByUrl('/login?reset=ok')`;
  - `WEAK_PASSWORD` → shows the unmet rules;
  - `TOKEN_INVALID_OR_EXPIRED` → `invalid` state;
  - other → `error`.
  - The submit button is disabled while submitting.
- Accessibility: one `h1` per state; the form field has a programmatic label; errors are announced (reuse the register page's pattern).

- [ ] **Step 2: Implement the component, service method and route**

- Component: standalone, signals, `templateUrl` (memory: a separate `.html` keeps Stryker off templates).
- `apps/web/src/app/app.routes.ts`: add `{ path: 'auth/action', component: EmailActionPageComponent }` next to `auth/unlock`. Export the component from `libs/web-auth/src/index.ts`. `apps/web/tsconfig.spec.json` already references `web-auth`; confirm with `nx typecheck web`.

- [ ] **Step 3: Route inventory (a11y and responsive gates)**

In `apps/web-e2e/src/_helpers/route-inventory.ts`, after the `unlock` entry, add two guest entries:
- `{ name: 'email action (verify)', path: '/auth/action?mode=verify-email&token=x', role: 'guest' }`
- `{ name: 'email action (reset form)', path: '/auth/action?mode=reset-password&token=x', role: 'guest' }`

Copy the `unlock` entry's shape exactly, including any render guard field the inventory uses (`expectText` or similar; read the file's type and the a11y memory note that render guards must match the real rendered text). Then run:

```bash
NX_DAEMON=false pnpm nx run web-e2e:a11y
NX_DAEMON=false pnpm nx run web-e2e:responsive
```

Probe 4200 first, and use `WEB_PORT=4300` if 4200 belongs to another project. Both must pass with the new routes included (zero violations, no overflow).

- [ ] **Step 4: Run, commit**

Run: `NX_DAEMON=false pnpm nx run-many -t test typecheck lint -p web-auth web`. Expected: PASS.

```bash
git add <each changed file by path>
git commit -m "feat(web-auth): /auth/action page for verify, reset and change-email links (US-09-04 D3b)"
```

---

### Task 7: Security review, local end-to-end smoke, CI, mutation, full verification

- [ ] **Step 1: Local end-to-end smoke (the real proof)**

Probe ports 3333 8080 9099 9199 4000 4400 55432 (the test Postgres is up). The Auth emulator is not needed. The api's Firebase Admin still initialises in emulator mode without contacting it.

Start the api in local mode in the background:

```bash
LEARNWREN_DATA_STORE=postgres LEARNWREN_POSTGRES_URL=postgres://postgres:learnwren@127.0.0.1:55432/learnwren_test \
LEARNWREN_IDENTITY=local LEARNWREN_EMAIL_TRANSPORT=console LEARNWREN_PUBLIC_URL=http://localhost:4200 \
NX_DAEMON=false pnpm nx serve api
```

Using `curl` with a cookie jar:
1. `POST /api/auth/register` (fresh email, policy-valid password) → 201 or 200 per today's contract, and a `__session` cookie.
2. Read the verification link through the console transport's test endpoint `GET /api/auth/_test/last-email` (read `auth.controller.ts` for its exact path, guard and query). It must be `http://localhost:4200/auth/action?mode=verify-email&token=…`.
3. Try `POST /api/auth/login` before verifying. Expect 403 `EMAIL_NOT_VERIFIED`.
4. `POST /api/auth/email-action {mode:'verify-email', token}` → 204. Replay it → 400 `TOKEN_INVALID_OR_EXPIRED`.
5. `POST /api/auth/login` → 200 with a cookie. `GET /api/auth/me` with it → 200, and `emailVerified: true`.
6. `POST /api/auth/request-password-reset`, read the link, `POST email-action {mode:'reset-password', token, newPassword}` → 204. The old cookie's `/me` → 401 (sessions revoked). Login with the new password → 200.
7. `POST /api/auth/logout` → 204, then `/me` with that cookie → 401.
8. `docker exec lw-d2-pg psql … -c "SELECT path FROM documents WHERE collection IN ('authSessions','authEmailActions') LIMIT 5"`: the ids are 64-hex hashes and no raw token appears.

Paste the transcript. Stop the api, killing only your PIDs, and re-probe. If a step fails, report BLOCKED with the transcript. Do not patch around it in the smoke.

- [ ] **Step 2: Security review**

Dispatch the `security-reviewer` agent (read-only) on the branch diff, focused on:
- password hashing parameters and constant-time comparison;
- the timing behaviour for unknown emails;
- token entropy and hashing-at-rest, single use and TTL;
- session fixation and revocation (reset, delete, disable);
- the email-action endpoint (enumeration, brute force via the global throttler, mode confusion, open redirect: the page navigates only to fixed internal paths);
- logging of secrets;
- the `local` + `firestore` refusal.

Fix every Critical and High finding in this task, each with a test. Record Medium and Low findings in the report.

- [ ] **Step 3: CI**

In `.github/workflows/ci.yml`, job `e2e`: the Postgres service and `LEARNWREN_TEST_POSTGRES_URL` already exist from D2. `api-auth:test` already runs there, so the `local (postgres)` contract now runs automatically. Confirm it, then update the step comment. In the `mutation` job, `api-auth` runs inside the Auth emulator and already has Postgres. Confirm the local adapter's Postgres contract runs there too.

- [ ] **Step 4: Mutation**

Follow the mutation-round skill. Run `api-auth` Stryker inside `firebase emulators:exec --only auth`, with `LEARNWREN_TEST_POSTGRES_URL` set, and `web-auth` Stryker plainly, sequentially. Target 100% adjusted on the new and changed files. Prefer real tests to annotations. Regenerate `docs/quality/mutation-report-api-auth.md` and `-web-auth.md` from full-config runs only.

- [ ] **Step 5: Full verification**

```bash
NX_DAEMON=false pnpm nx run-many -t lint test typecheck build
LEARNWREN_TEST_POSTGRES_URL=postgres://postgres:learnwren@127.0.0.1:55432/learnwren_test \
  pnpm exec firebase emulators:exec --project demo-learnwren 'pnpm nx run api-auth:test --skip-nx-cache && pnpm nx run api-document-store:test --skip-nx-cache && pnpm nx e2e api-e2e'
pnpm exec firebase emulators:exec --project demo-learnwren 'pnpm nx e2e web-e2e'
```

Expected: all green on the Firebase defaults. api-e2e runs 222 tests with 2 pre-existing skips. web-e2e runs 57 tests, plus any new ones.

- [ ] **Step 6: Commit** each logical piece by path (security fixes, mutation tests and reports, CI comment).

---

### Task 8: Land (controller)

Use the land-slice skill:
- **README:** a D3b bullet covering `LEARNWREN_IDENTITY=local`, what is stored and how (scrypt, hashed tokens, TTLs), the `/auth/action` page and endpoint, and the local smoke. Scope cuts:
  - Compose is not switched yet (D3c);
  - logout ends only the current session in local mode (Firebase ends all);
  - expired tokens are rejected but not swept;
  - local requires Postgres.
- **`docs/USER_GUIDE.md`:** a short note on the self-hosted email links.
- **Spec status line:** add D3b. **Plan:** flip the checkboxes.
- **Memory:** the D3b record, with the merge SHA.

# US-09-04 Slice D3a: IdentityProvider Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put every Firebase Auth call in the api behind an `IdentityProvider` port with a Firebase adapter and an in-memory test adapter, proven by a shared contract suite, with no behaviour change. This is the D1 move for identity.

**Architecture:** The port lives in `libs/api-auth/src/lib/identity/`. `FirebaseIdentityProvider` wraps the Admin SDK and the existing `FirebaseAuthRestClient`, and absorbs the Firebase-only plumbing: the ID token that session minting needs, the same-second revocation retry, the `auth/*` error codes, and the hosted action links. `createInMemoryIdentityProvider` (test-only, under `src/testing/`) replaces about 14 hand-rolled `Auth` mocks. `AuthModule` provides and exports `IDENTITY_PROVIDER`. Every `FIREBASE_AUTH` injection in `api-auth` and `api-profile` moves to it. D3b adds the local adapter and the `LEARNWREN_IDENTITY` selector. D3c switches Compose, e2e and the tools.

**Tech Stack:** NestJS 11, `firebase-admin` (installed), Vitest, Nx 22, the Firebase Auth emulator. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-01-us-09-04-slice-d-auth-and-data-design.md` §3.4, §3.5, §3.6. The survey behind this plan is a scratchpad inventory of every Firebase Auth call (session scratchpad `d3-auth-inventory.md`); the facts that matter are restated below.

## Global Constraints

- **No behaviour change**, with one deliberate exception. Admin **suspend** and **delete** today call `auth.revokeRefreshTokens` once. Through the port they call `revokeAllSessions`, which in production revokes twice, about 1 s apart. That closes the same-second gap password-change and demote already close. In the emulator, which covers dev and e2e, it is a single revoke, as today. Every other public error code, HTTP status and email stays the same, and the existing unit, api-e2e and web-e2e suites pass.
- **Port surface** (exact names; spec §3.4 is updated to match in Task 1):
  - `createUser`, `getUser`, `getUserByEmail`, `updateUser`, `deleteUser`, `setRole`
  - `verifyPassword`, `createSession`, `verifySession`, `endSession`, `revokeAllSessions`
  - `createEmailActionLink`
  - Nothing else; `listUsers` stays Firebase-only in the one-off migration tool.
- **Port errors:**
  - `EmailInUseError` (new; for `createUser` and the `change-email` link).
  - Wrong, unknown or disabled credentials reject with the existing `InvalidCredentialsException`.
  - `getUser` and `getUserByEmail` resolve `null` for an unknown user.
  - `deleteUser` is idempotent (a missing user is not an error).
  - `verifySession` resolves `null` for any invalid, expired or revoked token.
- **Role storage is unchanged:** the provider's role, which is the Firebase custom claim, is what the guards read from `verifySession`. `users/{uid}.role` stays the listing mirror. Every caller keeps its existing write order and revert logic.
- The session cookie stays `__session` (5 days, `HttpOnly; Secure; SameSite=Strict; Path=/`). `SessionCookieHelper` is unchanged.
- `FIREBASE_AUTH` may be imported only in `libs/api-auth/src/lib/identity/firebase-identity-provider.ts` and `libs/api-firebase`. This is lint-enforced in Task 5, along with D1's Firestore guard.
- `apps/api-e2e`, `apps/web-e2e` and `tools/*` keep calling `firebase-admin` directly (D3c), but `tools/*` must still compile and run.
- **Work in a worktree** (`worktree-flow` skill): `git worktree add ../learnwren-us-09-04-d3a -b feat/us-09-04-d3a-identity-port HEAD`, then symlink `node_modules`.
  - **Never `git add -A`**, never `git stash`.
  - Subagents prefix every command with `cd /Volumes/Artie-Storage/github-repos/learnwren-us-09-04-d3a && pwd && `.
  - Use `NX_DAEMON=false`. Stale-dist recovery: `rm -rf dist/out-tsc`.
- Vitest does not type-check, so run `nx typecheck` for every lib touched.
- **Emulator runs:** probe ports 8080 9099 4000 4400 first (`lsof -nP -iTCP:<p> -sTCP:LISTEN`). If something you did not start is listening, stop and report. Use one-shot `firebase emulators:exec`.
- Commit messages: conventional commits, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## File Structure

**Create (`libs/api-auth/src/`):**

| File | Responsibility |
| :--- | :--- |
| `lib/identity/identity-provider.port.ts` | `IDENTITY_PROVIDER`, `IdentityProvider`, `IdentityUser`, `SessionClaims`, `PasswordProof`, `MintedSession`, `EmailActionKind`, `SESSION_MAX_AGE_SECONDS`. |
| `lib/identity/identity.errors.ts` | `EmailInUseError`. |
| `lib/identity/public-url.ts` | `publicUrl(path)`: the one copy of today's duplicated `continueUrl()`. |
| `lib/identity/firebase-identity-provider.ts` | The Firebase adapter. |
| `lib/identity/firebase-identity-provider.spec.ts` | Unit spec with a hand-mocked Admin SDK; holds the moved retry-loop tests. |
| `lib/identity/firebase-identity-provider.contract.spec.ts` | Contract against the Auth emulator (skips without `FIREBASE_AUTH_EMULATOR_HOST`). |
| `testing/identity-provider.contract.ts` | `describeIdentityProviderContract()`. |
| `testing/in-memory-identity-provider.ts` | `createInMemoryIdentityProvider()` (test-only). |
| `testing/in-memory-identity-provider.spec.ts` | Runs the contract against in-memory. |
| `testing/index.ts` | Barrel for `@learnwren/api-auth/testing`. |

**Modify:**
- `tsconfig.base.json` (path alias), `libs/api-auth/tsconfig.lib.json` (exclude `src/testing/**`) and `tsconfig.spec.json` (include it).
- `auth.module.ts`, `src/index.ts`.
- `session-cookie.service.ts`, `password-verification.service.ts`, `auth.service.ts`, `account-recovery.service.ts`, `firebase-session.guard.ts`, plus their specs.
- The 7 `api-profile` services, `instructor-promotion.ts` and their specs.
- `tools/promote-to-instructor.ts`.
- `eslint.config.mjs`, `.github/workflows/ci.yml`, spec §3.4/§3.6.

**Delete:**
- `revoke-sessions.ts` and its spec (logic moves into the adapter).
- `firebase-error.util.ts` and its spec, plus the private `isFirebaseError` copies.
- The `revokeAllUserSessions` / `isAuthEmulator` exports.

---

## Migration recipe (Tasks 3–4)

| Before | After |
| :--- | :--- |
| `@Inject(FIREBASE_AUTH) private readonly auth: FirebaseAuthHandle` | `@Inject(IDENTITY_PROVIDER) private readonly identity: IdentityProvider` |
| `auth.createUser({email,password,displayName})` → `.uid`; catch `auth/email-already-exists` | `identity.createUser({...})` → uid; catch `err instanceof EmailInUseError` |
| `auth.getUser(uid)` in try/catch on `auth/user-not-found` | `const user = await identity.getUser(uid); if (!user) …` (the same branch the not-found catch took) |
| `auth.getUserByEmail(email)` (same) | `identity.getUserByEmail(email)` → `null` on unknown |
| `auth.updateUser(uid, {password\|disabled\|emailVerified})` | `identity.updateUser(uid, {...})` |
| `auth.deleteUser(uid)` (tolerating `auth/user-not-found`) | `identity.deleteUser(uid)` (idempotent; drop the tolerance code) |
| `auth.setCustomUserClaims(uid, { role })` | `identity.setRole(uid, role)` |
| `revokeAllUserSessions(auth, uid)` / `auth.revokeRefreshTokens(uid)` | `identity.revokeAllSessions(uid)` |
| `auth.generateEmailVerificationLink(email, { url: continueUrl(p) })` | `identity.createEmailActionLink('verify-email', email, p)` |
| `auth.generatePasswordResetLink(email, { url: continueUrl(p) })` | `identity.createEmailActionLink('reset-password', email, p)` |
| `auth.generateVerifyAndChangeEmailLink(cur, next, { url: continueUrl(p) })` | `identity.createEmailActionLink('change-email', cur, p, next)` (catch `EmailInUseError`) |
| private `continueUrl(path)` | `publicUrl(path)` from `./identity/public-url` (or `@learnwren/api-auth`) |
| private `isFirebaseError` / `isUserNotFoundError` | deleted (no longer needed) |
| spec `{ provide: FIREBASE_AUTH, useValue: fakeAuth }` | `{ provide: IDENTITY_PROVIDER, useValue: identity }`, with `identity` from `createInMemoryIdentityProvider()` when the test asserts state, or a typed `vi.fn` object (`Partial<Record<keyof IdentityProvider, Mock>>` cast `as unknown as IdentityProvider`) when it asserts calls |
| spec `expect(auth.setCustomUserClaims).toHaveBeenCalledWith(uid, { role: R })` | `expect(identity.setRole).toHaveBeenCalledWith(uid, R)` |
| spec rejection `{ code: 'auth/email-already-exists' }` | `new EmailInUseError()` |
| spec rejection `{ code: 'auth/user-not-found' }` from getUser | `mockResolvedValue(null)` |

Anything that does not fit a row is reported, not improvised. Production behaviour never changes to satisfy a spec.

---

### Task 1: Port, errors, `publicUrl`, contract suite, in-memory adapter; spec §3.4

**Files:**
- Create: `libs/api-auth/src/lib/identity/identity-provider.port.ts`, `identity.errors.ts`, `public-url.ts`, `public-url.spec.ts`
- Create: `libs/api-auth/src/testing/identity-provider.contract.ts`, `in-memory-identity-provider.ts`, `in-memory-identity-provider.spec.ts`, `index.ts`
- Modify: `tsconfig.base.json`, `libs/api-auth/tsconfig.lib.json`, `libs/api-auth/tsconfig.spec.json`, `libs/api-auth/src/index.ts`, `docs/superpowers/specs/2026-10-01-us-09-04-slice-d-auth-and-data-design.md`

**Interfaces:**
- Produces everything below. Later tasks import the port from `./identity/identity-provider.port` inside `api-auth`, or from `@learnwren/api-auth` elsewhere. Test helpers come from `@learnwren/api-auth/testing`.

- [x] **Step 1: Write the port, errors and `publicUrl`**

`libs/api-auth/src/lib/identity/identity-provider.port.ts`:

```ts
import type { UserRole } from '@learnwren/shared-data-models';

/**
 * The identity port (spec 2026-10-01 §3.4): every user-account and session
 * operation the api performs. Firebase Authentication is one adapter; the
 * self-hosted local adapter (D3b) is the other.
 *
 * Errors: createUser and the change-email link reject with EmailInUseError;
 * verifyPassword rejects with InvalidCredentialsException for an unknown
 * email, a wrong password or a disabled account (one generic answer, so the
 * response never reveals which). Lookups resolve null for an unknown user.
 */
export const IDENTITY_PROVIDER = Symbol.for('learnwren.api-auth.identity-provider');

/** Session lifetime: 5 days (unchanged from the Firebase session cookie). */
export const SESSION_MAX_AGE_SECONDS = 5 * 24 * 60 * 60;

export interface IdentityUser {
  readonly uid: string;
  readonly email: string;
  readonly emailVerified: boolean;
}

/** What a verified session tells the guards. `role` is the authoritative role for authorisation. */
export interface SessionClaims {
  readonly uid: string;
  readonly email: string;
  readonly role: UserRole | undefined;
  readonly emailVerified: boolean;
}

/**
 * Proof that a password check passed. Opaque beyond `uid`: each adapter
 * carries what it needs to mint a session (Firebase: the ID token).
 */
export interface PasswordProof {
  readonly uid: string;
}

export interface MintedSession {
  readonly token: string;
  readonly maxAgeSeconds: number;
}

export type EmailActionKind = 'verify-email' | 'reset-password' | 'change-email';

export interface IdentityProvider {
  createUser(input: { email: string; password: string; displayName: string }): Promise<string>;
  getUser(uid: string): Promise<IdentityUser | null>;
  getUserByEmail(email: string): Promise<IdentityUser | null>;
  updateUser(uid: string, changes: { password?: string; disabled?: boolean; emailVerified?: boolean }): Promise<void>;
  /** Idempotent: deleting a user that does not exist succeeds. */
  deleteUser(uid: string): Promise<void>;
  setRole(uid: string, role: UserRole): Promise<void>;
  verifyPassword(email: string, password: string): Promise<PasswordProof>;
  createSession(proof: PasswordProof): Promise<MintedSession>;
  /** null for an invalid, expired or revoked session token. */
  verifySession(token: string): Promise<SessionClaims | null>;
  /** Logout. Never throws for an already-invalid token. */
  endSession(token: string): Promise<void>;
  revokeAllSessions(uid: string): Promise<void>;
  /**
   * A single-use link that performs `kind` for `email`, then lands the
   * browser on `continuePath` of the public web app. `newEmail` is required
   * for 'change-email'.
   */
  createEmailActionLink(kind: EmailActionKind, email: string, continuePath: string, newEmail?: string): Promise<string>;
}
```

`libs/api-auth/src/lib/identity/identity.errors.ts`:

```ts
/** The email already belongs to another account (createUser, change-email link). */
export class EmailInUseError extends Error {
  override readonly name = 'EmailInUseError';
  constructor() {
    super('Email already in use');
  }
}
```

`libs/api-auth/src/lib/identity/public-url.ts`:

```ts
const DEFAULT_PUBLIC_URL = 'http://localhost:4200';

/** An absolute URL on the public web app (LEARNWREN_PUBLIC_URL), for links in emails. */
export function publicUrl(path: string): string {
  return `${process.env['LEARNWREN_PUBLIC_URL'] ?? DEFAULT_PUBLIC_URL}${path}`;
}
```

`libs/api-auth/src/lib/identity/public-url.spec.ts`:

```ts
import { publicUrl } from './public-url';

describe('publicUrl', () => {
  const saved = process.env['LEARNWREN_PUBLIC_URL'];
  afterEach(() => {
    if (saved === undefined) delete process.env['LEARNWREN_PUBLIC_URL'];
    else process.env['LEARNWREN_PUBLIC_URL'] = saved;
  });

  it('prefixes LEARNWREN_PUBLIC_URL', () => {
    process.env['LEARNWREN_PUBLIC_URL'] = 'https://learnwren.com';
    expect(publicUrl('/login?reset=ok')).toBe('https://learnwren.com/login?reset=ok');
  });

  it('defaults to the local dev web origin', () => {
    delete process.env['LEARNWREN_PUBLIC_URL'];
    expect(publicUrl('/login')).toBe('http://localhost:4200/login');
  });
});
```

- [x] **Step 2: Write the contract suite**

Each case uses unique emails, so the suite can share one Auth emulator. `revocation: false` turns off the cases the Firebase Auth **emulator** cannot show, because it ignores `checkRevoked` (memory: `project_us_08_01_slice_b_role_management.md`). Real Firebase, and every self-hosted adapter, pass `true`.

`libs/api-auth/src/testing/identity-provider.contract.ts`:

```ts
import { randomUUID } from 'node:crypto';

import { InvalidCredentialsException } from '../lib/errors/auth.exception';
import { EmailInUseError } from '../lib/identity/identity.errors';
import type { IdentityProvider } from '../lib/identity/identity-provider.port';

export interface IdentityContractOptions {
  /** False only for an adapter that cannot observe revocation (the Firebase Auth emulator ignores checkRevoked). */
  readonly revocation: boolean;
}

const PASSWORD = 'Correct-Horse-9-battery';

/** Behaviour every IdentityProvider adapter must share (spec §5.1). */
export function describeIdentityProviderContract(
  label: string,
  makeProvider: () => IdentityProvider,
  options: IdentityContractOptions,
): void {
  describe(`IdentityProvider contract: ${label}`, () => {
    let idp: IdentityProvider;
    const email = () => `c${randomUUID().replace(/-/g, '').slice(0, 16)}@example.test`;
    const signIn = async (address: string, password = PASSWORD) =>
      idp.createSession(await idp.verifyPassword(address, password));

    beforeEach(() => {
      idp = makeProvider();
    });

    it('createUser returns a uid that getUser and getUserByEmail resolve, unverified', async () => {
      const address = email();
      const uid = await idp.createUser({ email: address, password: PASSWORD, displayName: 'Ada' });
      expect(uid).not.toBe('');
      expect(await idp.getUser(uid)).toEqual({ uid, email: address, emailVerified: false });
      expect(await idp.getUserByEmail(address)).toEqual({ uid, email: address, emailVerified: false });
    });

    it('lookups resolve null for an unknown user', async () => {
      expect(await idp.getUser(`missing${randomUUID().slice(0, 8)}`)).toBeNull();
      expect(await idp.getUserByEmail(email())).toBeNull();
    });

    it('createUser rejects a taken email with EmailInUseError', async () => {
      const address = email();
      await idp.createUser({ email: address, password: PASSWORD, displayName: 'A' });
      await expect(idp.createUser({ email: address, password: PASSWORD, displayName: 'B' })).rejects.toBeInstanceOf(
        EmailInUseError,
      );
    });

    it('verifyPassword returns a proof for the right password', async () => {
      const address = email();
      const uid = await idp.createUser({ email: address, password: PASSWORD, displayName: 'A' });
      expect((await idp.verifyPassword(address, PASSWORD)).uid).toBe(uid);
    });

    it('verifyPassword gives one generic rejection for a wrong password, an unknown email and a disabled account', async () => {
      const address = email();
      const uid = await idp.createUser({ email: address, password: PASSWORD, displayName: 'A' });
      await expect(idp.verifyPassword(address, 'Wrong-Password-1!')).rejects.toBeInstanceOf(InvalidCredentialsException);
      await expect(idp.verifyPassword(email(), PASSWORD)).rejects.toBeInstanceOf(InvalidCredentialsException);
      await idp.updateUser(uid, { disabled: true });
      await expect(idp.verifyPassword(address, PASSWORD)).rejects.toBeInstanceOf(InvalidCredentialsException);
      await idp.updateUser(uid, { disabled: false });
      expect((await idp.verifyPassword(address, PASSWORD)).uid).toBe(uid);
    });

    it('a session carries uid, email, role and emailVerified', async () => {
      const address = email();
      const uid = await idp.createUser({ email: address, password: PASSWORD, displayName: 'A' });
      await idp.setRole(uid, 'INSTRUCTOR');
      await idp.updateUser(uid, { emailVerified: true });
      const session = await signIn(address);
      expect(session.maxAgeSeconds).toBe(5 * 24 * 60 * 60);
      expect(await idp.verifySession(session.token)).toEqual({
        uid,
        email: address,
        role: 'INSTRUCTOR',
        emailVerified: true,
      });
    });

    it('verifySession resolves null for a token it never issued', async () => {
      expect(await idp.verifySession('not-a-session-token')).toBeNull();
    });

    it('updateUser changes the password and sets emailVerified', async () => {
      const address = email();
      const uid = await idp.createUser({ email: address, password: PASSWORD, displayName: 'A' });
      await idp.updateUser(uid, { password: 'New-Password-77!', emailVerified: true });
      await expect(idp.verifyPassword(address, PASSWORD)).rejects.toBeInstanceOf(InvalidCredentialsException);
      expect((await idp.verifyPassword(address, 'New-Password-77!')).uid).toBe(uid);
      expect((await idp.getUser(uid))?.emailVerified).toBe(true);
    });

    it('deleteUser removes the user and is idempotent', async () => {
      const address = email();
      const uid = await idp.createUser({ email: address, password: PASSWORD, displayName: 'A' });
      await idp.deleteUser(uid);
      expect(await idp.getUser(uid)).toBeNull();
      await expect(idp.verifyPassword(address, PASSWORD)).rejects.toBeInstanceOf(InvalidCredentialsException);
      await expect(idp.deleteUser(uid)).resolves.toBeUndefined();
    });

    it('createEmailActionLink returns an absolute URL for every kind', async () => {
      const address = email();
      await idp.createUser({ email: address, password: PASSWORD, displayName: 'A' });
      for (const kind of ['verify-email', 'reset-password'] as const) {
        expect(await idp.createEmailActionLink(kind, address, '/login')).toMatch(/^https?:\/\/\S+$/);
      }
      expect(
        await idp.createEmailActionLink('change-email', address, '/settings/profile/email-changed', email()),
      ).toMatch(/^https?:\/\/\S+$/);
    });

    it('a change-email link to a taken address rejects with EmailInUseError', async () => {
      const a = email();
      const b = email();
      await idp.createUser({ email: a, password: PASSWORD, displayName: 'A' });
      await idp.createUser({ email: b, password: PASSWORD, displayName: 'B' });
      await expect(idp.createEmailActionLink('change-email', a, '/x', b)).rejects.toBeInstanceOf(EmailInUseError);
    });

    it('endSession on an unknown token does not throw', async () => {
      await expect(idp.endSession('not-a-session-token')).resolves.toBeUndefined();
    });

    describe.skipIf(!options.revocation)('revocation', () => {
      it('endSession invalidates that session', async () => {
        const address = email();
        await idp.createUser({ email: address, password: PASSWORD, displayName: 'A' });
        const session = await signIn(address);
        await idp.endSession(session.token);
        expect(await idp.verifySession(session.token)).toBeNull();
      });

      it('revokeAllSessions invalidates every session of the user and no one else', async () => {
        const a = email();
        const b = email();
        const uid = await idp.createUser({ email: a, password: PASSWORD, displayName: 'A' });
        await idp.createUser({ email: b, password: PASSWORD, displayName: 'B' });
        const first = await signIn(a);
        const second = await signIn(a);
        const other = await signIn(b);
        await idp.revokeAllSessions(uid);
        expect(await idp.verifySession(first.token)).toBeNull();
        expect(await idp.verifySession(second.token)).toBeNull();
        expect(await idp.verifySession(other.token)).not.toBeNull();
      });

      it('deleting a user invalidates their sessions', async () => {
        const address = email();
        const uid = await idp.createUser({ email: address, password: PASSWORD, displayName: 'A' });
        const session = await signIn(address);
        await idp.deleteUser(uid);
        expect(await idp.verifySession(session.token)).toBeNull();
      });
    });
  });
}
```

- [x] **Step 3: Write the in-memory adapter and its spec**

`libs/api-auth/src/testing/in-memory-identity-provider.ts`:

```ts
import type { UserRole } from '@learnwren/shared-data-models';

import { InvalidCredentialsException } from '../lib/errors/auth.exception';
import { EmailInUseError } from '../lib/identity/identity.errors';
import {
  SESSION_MAX_AGE_SECONDS,
  type EmailActionKind,
  type IdentityProvider,
  type IdentityUser,
  type PasswordProof,
} from '../lib/identity/identity-provider.port';

interface StoredUser {
  uid: string;
  email: string;
  password: string;
  emailVerified: boolean;
  disabled: boolean;
  role?: UserRole;
}

export interface InMemoryIdentityProvider extends IdentityProvider {
  /** uid → user, for test assertions. Passwords are plain text: TEST ONLY. */
  readonly __users: Map<string, StoredUser>;
  /** Every link minted, in order, for test assertions. */
  readonly __links: string[];
}

/** A test double for IdentityProvider that passes the shared contract. Never used in production. */
export function createInMemoryIdentityProvider(): InMemoryIdentityProvider {
  const users = new Map<string, StoredUser>();
  const sessions = new Map<string, string>(); // token → uid
  const links: string[] = [];
  let seq = 0;

  const view = (u: StoredUser): IdentityUser => ({ uid: u.uid, email: u.email, emailVerified: u.emailVerified });
  const byEmail = (email: string) => [...users.values()].find((u) => u.email === email);
  const mustGet = (uid: string): StoredUser => {
    const user = users.get(uid);
    if (!user) throw new Error(`in-memory identity: no user ${uid}`);
    return user;
  };
  const dropSessionsOf = (uid: string) => {
    for (const [token, owner] of sessions) if (owner === uid) sessions.delete(token);
  };

  return {
    __users: users,
    __links: links,
    async createUser({ email, password }) {
      if (byEmail(email)) throw new EmailInUseError();
      const uid = `user-${++seq}`;
      users.set(uid, { uid, email, password, emailVerified: false, disabled: false });
      return uid;
    },
    async getUser(uid) {
      const user = users.get(uid);
      return user ? view(user) : null;
    },
    async getUserByEmail(email) {
      const user = byEmail(email);
      return user ? view(user) : null;
    },
    async updateUser(uid, changes) {
      const user = mustGet(uid);
      users.set(uid, {
        ...user,
        ...(changes.password !== undefined ? { password: changes.password } : {}),
        ...(changes.disabled !== undefined ? { disabled: changes.disabled } : {}),
        ...(changes.emailVerified !== undefined ? { emailVerified: changes.emailVerified } : {}),
      });
    },
    async deleteUser(uid) {
      users.delete(uid);
      dropSessionsOf(uid);
    },
    async setRole(uid, role) {
      users.set(uid, { ...mustGet(uid), role });
    },
    async verifyPassword(email, password): Promise<PasswordProof> {
      const user = byEmail(email);
      if (!user || user.disabled || user.password !== password) throw new InvalidCredentialsException();
      return { uid: user.uid };
    },
    async createSession(proof) {
      const token = `session-${++seq}`;
      sessions.set(token, proof.uid);
      return { token, maxAgeSeconds: SESSION_MAX_AGE_SECONDS };
    },
    async verifySession(token) {
      const uid = sessions.get(token);
      const user = uid === undefined ? undefined : users.get(uid);
      if (!user) return null;
      return { uid: user.uid, email: user.email, role: user.role, emailVerified: user.emailVerified };
    },
    async endSession(token) {
      sessions.delete(token);
    },
    async revokeAllSessions(uid) {
      dropSessionsOf(uid);
    },
    async createEmailActionLink(kind: EmailActionKind, email, continuePath, newEmail) {
      if (kind === 'change-email' && newEmail !== undefined && byEmail(newEmail)) throw new EmailInUseError();
      const query = new URLSearchParams({ kind, email, continue: continuePath, ...(newEmail ? { newEmail } : {}) });
      const link = `http://in-memory.test/action?${query.toString()}`;
      links.push(link);
      return link;
    },
  };
}
```

`libs/api-auth/src/testing/in-memory-identity-provider.spec.ts`:

```ts
import { describeIdentityProviderContract } from './identity-provider.contract';
import { createInMemoryIdentityProvider } from './in-memory-identity-provider';

describeIdentityProviderContract('in-memory', () => createInMemoryIdentityProvider(), { revocation: true });

describe('createInMemoryIdentityProvider', () => {
  it('records minted links and exposes users for assertions', async () => {
    const idp = createInMemoryIdentityProvider();
    const uid = await idp.createUser({ email: 'a@example.test', password: 'p', displayName: 'A' });
    await idp.createEmailActionLink('reset-password', 'a@example.test', '/login?reset=ok');
    expect(idp.__links).toHaveLength(1);
    expect(idp.__links[0]).toContain('kind=reset-password');
    expect(idp.__users.get(uid)?.email).toBe('a@example.test');
  });
});
```

`libs/api-auth/src/testing/index.ts`:

```ts
export { describeIdentityProviderContract, type IdentityContractOptions } from './identity-provider.contract';
export { createInMemoryIdentityProvider, type InMemoryIdentityProvider } from './in-memory-identity-provider';
```

- [x] **Step 4: Wire the paths and exports**

- `tsconfig.base.json` paths, after `@learnwren/api-auth`: `"@learnwren/api-auth/testing": ["./libs/api-auth/src/testing/index.ts"],`
- `libs/api-auth/tsconfig.lib.json`: add `"src/testing/**"` to `exclude`. `libs/api-auth/tsconfig.spec.json`: add `"src/testing/**/*.ts"` to `include`. Copy D1's `api-document-store` pattern exactly; read both files there.
- `libs/api-auth/src/index.ts`: append

```ts
export {
  IDENTITY_PROVIDER,
  SESSION_MAX_AGE_SECONDS,
  type IdentityProvider,
  type IdentityUser,
  type SessionClaims,
  type PasswordProof,
  type MintedSession,
  type EmailActionKind,
} from './lib/identity/identity-provider.port';
export { EmailInUseError } from './lib/identity/identity.errors';
export { publicUrl } from './lib/identity/public-url';
```

- [x] **Step 5: Update spec §3.4 and §3.6**

In `docs/superpowers/specs/2026-10-01-us-09-04-slice-d-auth-and-data-design.md`:
- §3.4: replace the operation sketch with the port as built: the `IdentityProvider` interface above in a code block, plus one paragraph on why `verifyPassword` returns an opaque `PasswordProof` (Firebase mints session cookies only from an ID token) and why `endSession`/`revokeAllSessions` own the same-second retry (Firebase-only).
- §3.5: say that credentials reuse `InvalidCredentialsException`, the only new error is `EmailInUseError`, and lookups resolve `null`.
- §3.6: split the D3 row into **D3a** (port + Firebase adapter + in-memory + contract; all call sites; no behaviour change except suspend/delete now double-revoke in production), **D3b** (local adapter, `LEARNWREN_IDENTITY`, `/auth/action` page + `POST /api/auth/email-action`) and **D3c** (e2e and tools through the port or a test seam, api-e2e on `postgres`+`local` in CI, Compose drops the emulators, `self-hosting.md` first-admin flow, criterion met).

Keep the DRAFT banner.

- [x] **Step 6: Run tests, typecheck, lint**

Run: `NX_DAEMON=false pnpm nx sync && NX_DAEMON=false pnpm nx run-many -t test typecheck lint -p api-auth`
Expected: PASS. The in-memory contract runs 15 cases (12, plus 3 revocation).

- [x] **Step 7: Commit**

```bash
git add tsconfig.base.json libs/api-auth/tsconfig.lib.json libs/api-auth/tsconfig.spec.json libs/api-auth/src/index.ts libs/api-auth/src/lib/identity libs/api-auth/src/testing docs/superpowers/specs/2026-10-01-us-09-04-slice-d-auth-and-data-design.md
git status --short   # node_modules must not be staged
git commit -m "feat(api-auth): IdentityProvider port, contract suite and in-memory adapter (US-09-04 D3a)"
```

---

### Task 2: `FirebaseIdentityProvider`, proven by the contract against the Auth emulator

**Files:**
- Create: `libs/api-auth/src/lib/identity/firebase-identity-provider.ts`, `firebase-identity-provider.spec.ts`, `firebase-identity-provider.contract.spec.ts`
- Modify: `libs/api-auth/src/lib/auth.module.ts`

**Interfaces:**
- Consumes: Task 1's port, errors, `publicUrl` and contract; `FIREBASE_AUTH` / `FirebaseAuthHandle` from `@learnwren/api-firebase`; `FirebaseAuthRestClient` (`signInWithPassword({email,password})` → `{ idToken, localId }`, which already maps bad credentials to `InvalidCredentialsException`).
- Produces: `FirebaseIdentityProvider` (`@Injectable`), and `AuthModule` providing and exporting `IDENTITY_PROVIDER` (`useExisting: FirebaseIdentityProvider`).

- [x] **Step 1: Write the adapter**

`libs/api-auth/src/lib/identity/firebase-identity-provider.ts`. The logic is moved verbatim from `session-cookie.service.ts` (mint and logout loop) and `revoke-sessions.ts` (double revoke), so keep their comments:

```ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { FIREBASE_AUTH, type FirebaseAuthHandle } from '@learnwren/api-firebase';
import type { UserRole } from '@learnwren/shared-data-models';

import { FirebaseAuthRestClient } from '../firebase-auth-rest-client';
import { EmailInUseError } from './identity.errors';
import {
  SESSION_MAX_AGE_SECONDS,
  type EmailActionKind,
  type IdentityProvider,
  type IdentityUser,
  type MintedSession,
  type PasswordProof,
  type SessionClaims,
} from './identity-provider.port';
import { publicUrl } from './public-url';

const SESSION_EXPIRES_IN_MS = SESSION_MAX_AGE_SECONDS * 1000;
// Logout revokes by bumping the user's validSince second; Firebase compares it
// against the cookie's iat at whole-second precision, so a revoke can need a
// retry past the next boundary. See endSession.
const LOGOUT_REVOKE_MAX_ATTEMPTS = 4;
// Margin past the second boundary: clock skew between this process and
// Firebase's stamping of tokensValidAfterTime.
const SECOND_BOUNDARY_MARGIN_MS = 250;

/** Firebase's proof carries the ID token: session cookies can only be minted from one. */
interface FirebasePasswordProof extends PasswordProof {
  readonly idToken: string;
}

function authCode(err: unknown): unknown {
  return (err as { code?: unknown } | undefined)?.code;
}

/** True when the api talks to the Firebase Auth emulator (dev/e2e). */
function isAuthEmulator(): boolean {
  return Boolean(process.env['FIREBASE_AUTH_EMULATOR_HOST']);
}

function sleepPastNextSecond(): Promise<void> {
  const waitMs = 1000 - (Date.now() % 1000) + SECOND_BOUNDARY_MARGIN_MS;
  return new Promise<void>((resolve) => setTimeout(resolve, waitMs));
}

const toUser = (record: { uid: string; email?: string; emailVerified: boolean }): IdentityUser => ({
  uid: record.uid,
  email: record.email ?? '',
  emailVerified: record.emailVerified,
});

/** The cloud adapter: Firebase Authentication (Admin SDK + the REST sign-in). */
@Injectable()
export class FirebaseIdentityProvider implements IdentityProvider {
  // Stryker disable next-line StringLiteral: Logger category name — log-only, no behavioral effect
  private readonly logger = new Logger('FirebaseIdentityProvider');

  constructor(
    @Inject(FIREBASE_AUTH) private readonly auth: FirebaseAuthHandle,
    private readonly rest: FirebaseAuthRestClient,
  ) {}

  async createUser(input: { email: string; password: string; displayName: string }): Promise<string> {
    try {
      return (await this.auth.createUser(input)).uid;
    } catch (err) {
      if (authCode(err) === 'auth/email-already-exists') throw new EmailInUseError();
      throw err;
    }
  }

  async getUser(uid: string): Promise<IdentityUser | null> {
    try {
      return toUser(await this.auth.getUser(uid));
    } catch (err) {
      if (authCode(err) === 'auth/user-not-found') return null;
      throw err;
    }
  }

  async getUserByEmail(email: string): Promise<IdentityUser | null> {
    try {
      return toUser(await this.auth.getUserByEmail(email));
    } catch (err) {
      if (authCode(err) === 'auth/user-not-found') return null;
      throw err;
    }
  }

  async updateUser(uid: string, changes: { password?: string; disabled?: boolean; emailVerified?: boolean }): Promise<void> {
    await this.auth.updateUser(uid, changes);
  }

  async deleteUser(uid: string): Promise<void> {
    try {
      await this.auth.deleteUser(uid);
    } catch (err) {
      if (authCode(err) !== 'auth/user-not-found') throw err;
    }
  }

  async setRole(uid: string, role: UserRole): Promise<void> {
    await this.auth.setCustomUserClaims(uid, { role });
  }

  async verifyPassword(email: string, password: string): Promise<PasswordProof> {
    const result = await this.rest.signInWithPassword({ email, password });
    const proof: FirebasePasswordProof = { uid: result.localId, idToken: result.idToken };
    return proof;
  }

  /** Verify the fresh ID token, then exchange it for a 5-day session cookie. */
  async createSession(proof: PasswordProof): Promise<MintedSession> {
    const { idToken } = proof as FirebasePasswordProof;
    await this.auth.verifyIdToken(idToken, true);
    const token = await this.auth.createSessionCookie(idToken, { expiresIn: SESSION_EXPIRES_IN_MS });
    return { token, maxAgeSeconds: SESSION_MAX_AGE_SECONDS };
  }

  async verifySession(token: string): Promise<SessionClaims | null> {
    try {
      const decoded = await this.auth.verifySessionCookie(token, true);
      return {
        uid: decoded.uid,
        email: decoded['email'] ?? '',
        role: decoded['role'] as UserRole | undefined,
        emailVerified: Boolean(decoded['email_verified']),
      };
    } catch (err) {
      // Stryker disable next-line StringLiteral: log message — log-only, no behavioral effect
      this.logger.warn(`[auth] session rejected: ${String(err)}`);
      return null;
    }
  }

  /**
   * Firebase revocation has whole-second granularity: a session cookie is
   * rejected only once tokensValidAfterTime is strictly greater than the
   * cookie's iat. A revoke in the same wall-second the cookie was minted is a
   * silent no-op, so revoke, confirm the cookie is rejected, and if it
   * survived wait past the next second boundary and revoke again.
   */
  async endSession(token: string): Promise<void> {
    const claims = await this.verifySession(token);
    if (!claims) return;
    for (let attempt = 0; attempt < LOGOUT_REVOKE_MAX_ATTEMPTS; attempt++) {
      await this.auth.revokeRefreshTokens(claims.uid);
      if (!(await this.verifySession(token))) return;
      await sleepPastNextSecond();
    }
    // Stryker disable next-line StringLiteral: log message — log-only, no behavioral effect
    this.logger.error(`[auth] logout could not confirm cookie revocation uid=${claims.uid}`);
  }

  /**
   * Revoke every session of the user. There is no cookie to confirm against
   * (the targets are other devices' sessions), so revoke once more strictly
   * past the next second boundary. The emulator (dev/e2e) skips the ~1 s wait.
   */
  async revokeAllSessions(uid: string): Promise<void> {
    await this.auth.revokeRefreshTokens(uid);
    if (isAuthEmulator()) return;
    await sleepPastNextSecond();
    await this.auth.revokeRefreshTokens(uid);
  }

  /** Firebase-hosted action links; the browser returns to `continuePath` afterwards. */
  async createEmailActionLink(
    kind: EmailActionKind,
    email: string,
    continuePath: string,
    newEmail?: string,
  ): Promise<string> {
    const settings = { url: publicUrl(continuePath) };
    if (kind === 'verify-email') return this.auth.generateEmailVerificationLink(email, settings);
    if (kind === 'reset-password') return this.auth.generatePasswordResetLink(email, settings);
    try {
      return await this.auth.generateVerifyAndChangeEmailLink(email, newEmail ?? '', settings);
    } catch (err) {
      if (authCode(err) === 'auth/email-already-exists') throw new EmailInUseError();
      throw err;
    }
  }
}
```

The old `revokeFromCookie` logged `logout silent (cookie invalid)` and `logout uid=…`. `verifySession`'s warn now covers the first. Add the `[auth] logout uid=${claims.uid}` log on the success return in `endSession` so log output stays equivalent.

- [x] **Step 2: Move the existing Firebase-specific tests into the adapter's unit spec**

`firebase-identity-provider.spec.ts` gets a hand-mocked `auth` (the `vi.fn` style of today's `session-cookie.service.spec.ts`) and a mocked `FirebaseAuthRestClient`. **Move, don't drop,** every behavioural test from:
- `session-cookie.service.spec.ts`: the mint and logout-loop tests, now against `createSession` and `endSession`.
- `revoke-sessions.spec.ts`: the double revoke, the emulator skip and the boundary timing, now against `revokeAllSessions`.

Then add one test per translation:
- `auth/email-already-exists` → `EmailInUseError` in `createUser` and in the `change-email` link;
- other codes rethrown unchanged;
- `auth/user-not-found` → `null` in `getUser` and `getUserByEmail`, other codes rethrown;
- `deleteUser` tolerates `auth/user-not-found` and rethrows others;
- `setRole` → `setCustomUserClaims(uid, { role })`;
- `verifyPassword` maps `{ localId, idToken }` to a proof whose `uid` is `localId` and whose ID token `createSession` passes to `verifyIdToken(…, true)` and `createSessionCookie(…, { expiresIn: 432000000 })`;
- `verifySession` maps `email_verified` and `role`, and returns `null` on throw;
- each link kind calls the right generator with `{ url: publicUrl(path) }`.

Keep the existing Stryker annotations where the moved code keeps them.

- [x] **Step 3: Write the emulator contract spec**

`firebase-identity-provider.contract.spec.ts`:

```ts
import { randomUUID } from 'node:crypto';

import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

import { describeIdentityProviderContract } from '../../testing/identity-provider.contract';
import { FirebaseAuthRestClient } from '../firebase-auth-rest-client';
import { FirebaseIdentityProvider } from './firebase-identity-provider';

// Runs only under the Auth emulator:
//   pnpm exec firebase emulators:exec --only auth --project demo-learnwren \
//     'NX_DAEMON=false pnpm nx run api-auth:test --skip-nx-cache'
// The emulator ignores checkRevoked, so the revocation cases are off here;
// unit specs pin the revoke calls instead.
const emulator = process.env['FIREBASE_AUTH_EMULATOR_HOST'];

describe.skipIf(!emulator)('Firebase identity adapter against the Auth emulator', () => {
  const app = initializeApp({ projectId: 'demo-learnwren' }, `identity-contract-${randomUUID()}`);
  const provider = new FirebaseIdentityProvider(getAuth(app) as never, new FirebaseAuthRestClient('fake-api-key'));
  describeIdentityProviderContract('firebase', () => provider, { revocation: false });
});
```

If the emulator rate-limits user creation, keep each case's user count low. Do not weaken assertions; report it instead.

- [x] **Step 4: Provide it from `AuthModule`**

In `libs/api-auth/src/lib/auth.module.ts`, add `FirebaseIdentityProvider` to `providers`, plus `{ provide: IDENTITY_PROVIDER, useExisting: FirebaseIdentityProvider }`. Add `IDENTITY_PROVIDER` to `exports`. Nothing consumes it yet.

- [x] **Step 5: Run unit tests, then the emulator contract**

Run: `NX_DAEMON=false pnpm nx run-many -t test typecheck lint -p api-auth api`
Expected: PASS (emulator contract skipped).

Probe ports 9099/4000/4400, then run:
`pnpm exec firebase emulators:exec --only auth --project demo-learnwren 'NX_DAEMON=false pnpm nx run api-auth:test --skip-nx-cache'`
Expected: PASS, with `firebase-identity-provider.contract.spec.ts` running 12 cases (revocation skipped).

If a case fails only for Firebase, the in-memory adapter or the contract describes non-Firebase behaviour. Firebase is the reference: fix the in-memory adapter. If the contract is wrong about Firebase, report it with evidence.

- [x] **Step 6: Commit**

```bash
git add libs/api-auth/src/lib/identity/firebase-identity-provider.ts libs/api-auth/src/lib/identity/firebase-identity-provider.spec.ts libs/api-auth/src/lib/identity/firebase-identity-provider.contract.spec.ts libs/api-auth/src/lib/auth.module.ts
git commit -m "feat(api-auth): FirebaseIdentityProvider behind IDENTITY_PROVIDER, contract-proven on the Auth emulator (US-09-04 D3a)"
```

---

### Task 3: Move `api-auth` onto the port

**Files (all under `libs/api-auth/src/lib/`):**
- Modify: `session-cookie.service.ts`, `password-verification.service.ts`, `auth.service.ts`, `account-recovery.service.ts`, `firebase-session.guard.ts`, and each one's spec.
- Delete: `session-cookie.service.spec.ts` tests already moved in Task 2. Keep the file for the new thin-wrapper tests below.

**Interfaces:**
- Consumes: `IDENTITY_PROVIDER`, `IdentityProvider`, `PasswordProof`, `EmailInUseError`, `publicUrl`; `createInMemoryIdentityProvider` in specs.
- Produces (signatures later tasks rely on):
  - `SessionCookieService.mint(proof: PasswordProof): Promise<{ cookie: string; maxAgeSeconds: number }>` (unchanged result shape; failures are still logged and become `InternalAuthException`).
  - `SessionCookieService.revokeFromCookie(cookie: string | undefined): Promise<void>` (→ `identity.endSession`; no-op when there is no cookie).
  - `PasswordVerificationService.verifyPassword(email, password): Promise<PasswordProof>`. **The return type changes from the ID token string.** Callers that ignored the value are unaffected.

- [x] **Step 1: Apply the recipe and these specifics**

- `session-cookie.service.ts`: inject `IDENTITY_PROVIDER`. `mint(proof)` calls `identity.createSession(proof)` in try/catch → log + `InternalAuthException`, and returns `{ cookie: session.token, maxAgeSeconds: session.maxAgeSeconds }`. `revokeFromCookie(cookie)` returns early if there is no cookie, else `await identity.endSession(cookie)`. Delete the constants, the loop and the sleep (they moved in Task 2).
- `password-verification.service.ts`: replace `restClient.signInWithPassword(...)` → `result.idToken` with `return await this.identity.verifyPassword(email, password)`. Return type `Promise<PasswordProof>`. Keep the `InvalidCredentialsException` catch and the lockout logic byte-identical otherwise. Update the doc comment ("returns the Firebase ID token" → "returns a PasswordProof").
- `auth.service.ts`:
  - `createFirebaseAuthUser` → `identity.createUser`, mapping `EmailInUseError` → `EmailAlreadyExistsException`. Everything else is logged → `InternalAuthException`, as today; the log keeps a `code=` field from `(err as {code?:string}).code ?? 'unknown'`. Rename the method `createIdentityUser`.
  - `assignStudentClaimOrRollback` → `identity.setRole(uid, 'STUDENT')`.
  - `autoLoginOrRollback` → `sessionCookies.mint(await identity.verifyPassword(email, password))`.
  - `login`: `const proof = await passwordVerification.verifyPassword(...)`. `requireVerifiedUser(proof)` becomes `identity.getUser(proof.uid)`; null or `!emailVerified` → the existing `EmailNotVerifiedException` path. A null user is logged as `[auth] login missing identity uid=…` and throws `InternalAuthException`. Then `sessionCookies.mint(proof)`.
  - `bestEffortDeleteUser` → `identity.deleteUser`.
  - Remove the `adminAuth` and `FirebaseAuthRestClient` imports if unused.
- `account-recovery.service.ts`:
  - the three link calls → `identity.createEmailActionLink(...)` with today's paths (`/login`, `/login?reset=ok`, `/login`);
  - the `getUserByEmail` callers → null checks (`sendUnlockEmail`: null or throw → return silently, as today; `findUserOrNullForEnumerationResistance` → just `identity.getUserByEmail(email)`);
  - delete the private `continueUrl`; the unlock URL uses `publicUrl('/auth/unlock')`.
- `firebase-session.guard.ts`: `const claims = await this.identity.verifySession(cookie)`. If null, warn `[auth] guard rejected reason=invalid` → `UnauthenticatedException`. Otherwise `req.user = { uid: claims.uid as UserId, email: claims.email, role: claims.role as UserRole, emailVerified: claims.emailVerified }`. Keep the class name. Renaming it touches every controller, and D3b can do that if it wants.
- Specs: apply the recipe. Prefer `createInMemoryIdentityProvider()` where a test sets up users and asserts outcomes, and `vi.fn` port mocks where it asserts calls or failures. Every existing assertion about **behaviour** (status codes, error classes, rollback calls, emails sent, cookie values) must survive, translated. Only assertions about Firebase call shapes change.

- [x] **Step 2: Run tests, typecheck, lint**

Run: `NX_DAEMON=false pnpm nx run-many -t test typecheck lint -p api-auth api api-profile`
Expected: PASS. `api-profile` still compiles: it uses `PasswordVerificationService.verifyPassword` only for its side effect. If its types break, fix the call sites with recipe rows and report it.

- [x] **Step 3: Commit**

Stage each changed file by path, then:

```bash
git commit -m "refactor(api-auth): auth, recovery, sessions and the guard go through IdentityProvider (US-09-04 D3a)"
```

---

### Task 4: Move `api-profile` and the promotion tool onto the port

**Files:**
- Modify (under `libs/api-profile/src/lib/`): `password/password-change.service.ts`, `email/email-change.service.ts`, `instructor-application/instructor-promotion.ts`, `instructor-application/admin-instructor-application.service.ts`, `users/admin-user-role.service.ts`, `users/admin-user-status.service.ts`, `users/admin-user-delete.service.ts`, plus each one's spec.
- Modify: `tools/promote-to-instructor.ts`.

**Interfaces:**
- Consumes: `IDENTITY_PROVIDER`, `IdentityProvider`, `EmailInUseError`, `publicUrl` from `@learnwren/api-auth`; `createInMemoryIdentityProvider` from `@learnwren/api-auth/testing`.

- [x] **Step 1: Apply the recipe and these specifics**

- `password-change.service.ts`: `auth.updateUser(uid, { password })` → `identity.updateUser`; `revokeAllUserSessions(auth, uid)` → `identity.revokeAllSessions(uid)`. Keep the failure handling exactly.
- `email-change.service.ts`:
  - `getUserOrThrow`: `identity.getUser(uid)`; null → the same `EmailChangeFailedException` a throw produced.
  - `generateLink`: `identity.createEmailActionLink('change-email', currentEmail, '/settings/profile/email-changed', newEmail)`; `EmailInUseError` → `EmailAlreadyInUseException`, anything else → `EmailChangeFailedException`.
  - Delete the private `continueUrl` and `isFirebaseError`.
  - `revokeAllUserSessions` → `identity.revokeAllSessions`.
- `instructor-promotion.ts`: `PromotionAuthLike` becomes `Pick<IdentityProvider, 'setRole'>`; the call becomes `identity.setRole(uid, 'INSTRUCTOR')`. Keep `PromotionFirestoreLike`. Rename the parameter `auth` → `identity`.
- `admin-instructor-application.service.ts`:
  - `approve`'s `getApplicantOrThrow`: null → `ApplicationNotFoundException`, as the `auth/user-not-found` branch did; other throws → the existing 500.
  - `decline`: null or throw → the existing best-effort skip.
  - Delete the private `isFirebaseError`.
  - Pass `this.identity` to `promoteUserToInstructor`. Drop the `as unknown as PromotionFirestoreLike` cast if it now type-checks without it (D1 final-review minor).
- `admin-user-role.service.ts`: `setCustomUserClaims` → `setRole` (3 sites, including `bestEffortRevertRole`); `revokeAllUserSessions` → `identity.revokeAllSessions`. Keep the order: claim, then revoke.
- `admin-user-status.service.ts`: `auth.updateUser(uid, { disabled })` → `identity.updateUser`; `auth.revokeRefreshTokens(uid)` → `identity.revokeAllSessions(uid)`. This is the deliberate behaviour change in Global Constraints; note it in the commit body. Keep the re-enable and revert logic.
- `admin-user-delete.service.ts`: `revokeRefreshTokens` → `identity.revokeAllSessions` (still warn-only); `deleteUser` → `identity.deleteUser`. Delete `isUserNotFoundError` and the tolerance branch, since the port is idempotent. Note the double revoke in the commit body.
- `tools/promote-to-instructor.ts`: pass a structural adapter, `{ setRole: (uid, role) => auth.setCustomUserClaims(uid, { role }) }`, where it passed `auth`. Leave `tools/promote-to-admin.ts` alone (it does not use the shared helper).
- Specs: apply the recipe. The `admin-user-status` and `admin-user-delete` specs that asserted `revokeRefreshTokens` now assert `identity.revokeAllSessions`.

- [x] **Step 2: Check the tool still runs**

The tools are not Nx projects, so typecheck and smoke-run them. Run `pnpm exec tsc --noEmit -p tsconfig.base.json tools/promote-to-instructor.ts` if that works in this repo; otherwise run `pnpm exec tsx tools/promote-to-instructor.ts` with no argument and expect the usage message, not a module or type error. Report what you ran.

- [x] **Step 3: Run tests, typecheck, lint**

Run: `NX_DAEMON=false pnpm nx run-many -t test typecheck lint -p api-profile api-auth api`
Expected: PASS.

Then: `grep -rnE "FIREBASE_AUTH|FirebaseAuthHandle|setCustomUserClaims|revokeRefreshTokens|generate\w*Link|isFirebaseError|auth/user-not-found|auth/email-already-exists" libs/api-profile/src libs/api-auth/src --include='*.ts' | grep -v 'identity/firebase-identity-provider' | grep -v '\.spec\.ts'`
Expected: only `libs/api-auth/src/lib/revoke-sessions.ts` and `firebase-error.util.ts` (deleted in Task 5), and the `FirebaseAuthRestClient` file.

- [x] **Step 4: Commit**

Stage each changed file by path, then:

```bash
git commit -m "refactor(api-profile): account, role, status and delete flows go through IdentityProvider (US-09-04 D3a)

Suspend and delete now revoke via revokeAllSessions: in production that is a
second revoke past the next second boundary, closing the same-second gap the
password-change and demote paths already closed. Emulator behaviour unchanged."
```

---

### Task 5: Close the old door; lint guard; CI; full verification; mutation

**Files:**
- Delete: `libs/api-auth/src/lib/revoke-sessions.ts`, `revoke-sessions.spec.ts`, `firebase-error.util.ts`, `firebase-error.util.spec.ts`
- Modify: `libs/api-auth/src/index.ts`, `eslint.config.mjs`, the per-project opt-out blocks D1 added (`libs/api-firebase`, `libs/api-document-store`, `apps/api-e2e`, `apps/web-e2e` eslint configs; read them), `.github/workflows/ci.yml`, `stryker.api-auth.config.mjs` if it exists (else none), `docs/quality/mutation-report-api-auth.md`

- [x] **Step 1: Delete the superseded files and exports**

First prove nothing imports them: `grep -rn "revoke-sessions\|revokeAllUserSessions\|isAuthEmulator\|firebase-error.util\|isFirebaseError" libs apps tools --include='*.ts'` must list only the files being deleted and `libs/api-auth/src/index.ts`. Then `git rm` the four files and remove `export { isAuthEmulator, revokeAllUserSessions } …` from `src/index.ts`.

- [x] **Step 2: Extend the lint guard**

D1's root `no-restricted-imports` rule in `eslint.config.mjs` lists restricted `paths`. Add an entry: `{ name: '@learnwren/api-firebase', importNames: ['FIREBASE_AUTH', 'FirebaseAuthHandle'], message: 'Inject IDENTITY_PROVIDER from @learnwren/api-auth.' }`. If D1's rule already has an `@learnwren/api-firebase` entry for `FIRESTORE`, merge into it so the restriction lists all four names.

`libs/api-auth` needs a scoped exception for `src/lib/identity/firebase-identity-provider.ts` only. Add a block to `libs/api-auth/eslint.config.mjs` with `files: ['src/lib/identity/firebase-identity-provider.ts']` that re-declares `no-restricted-imports` without the `FIREBASE_AUTH` names but keeps the Firestore ones. Nx lints with a per-project cwd, so a project-relative glob works there (memory, D1). Probe-prove both directions: a temporary `FIREBASE_AUTH` import in `api-profile` must fail lint, and the adapter must pass. Revert the probe and confirm `git status --short` is clean.

- [x] **Step 3: CI**

In `.github/workflows/ci.yml`, job `e2e`, extend the emulator one-shot command so `api-auth`'s contract runs against the Auth emulator: insert `pnpm nx run api-auth:test --skip-nx-cache &&` before `pnpm nx e2e api-e2e`. The job already runs `emulators:exec` with all emulators. Update the step name and comment.

- [x] **Step 4: Full verification**

Probe ports 3333 4200 8080 9099 9199 4000 4400 per the run-e2e skill.

```bash
NX_DAEMON=false pnpm nx run-many -t lint test typecheck build
pnpm exec firebase emulators:exec --project demo-learnwren 'pnpm nx run api-auth:test --skip-nx-cache && pnpm nx run api-document-store:test --skip-nx-cache && pnpm nx e2e api-e2e'
pnpm exec firebase emulators:exec --project demo-learnwren 'pnpm nx e2e web-e2e'
```

Expected: everything green. The `api-auth` Firebase contract runs (not skipped). api-e2e runs 222 tests with the 2 pre-existing `test.skip`, and web-e2e runs 57. If an e2e test fails, rerun that spec once, report both runs, and never change app code to make e2e pass.

- [x] **Step 5: Mutation**

Follow the mutation-round skill. Run Stryker for `api-auth` (and for `api-profile` if its config exists and its changed files are in scope) **inside** `firebase emulators:exec --only auth`, so the Firebase contract kills adapter mutants. If a `stryker.api-auth.config.mjs` exists, note whether CI's mutation job needs the same emulator wrapping D2 gave `api-document-store` (it does if the adapter's mutants only die under the emulator). If so, extend D2's `if [ "$LIB" = … ]` branch to include `api-auth`, with Java gated the same way. Reach the repo's 100% adjusted standard on the changed files. Prefer real tests; use `// Stryker disable next-line <Mutator>: equivalent — <reason>` (Stryker honours it) only with a concrete reason. Regenerate `docs/quality/mutation-report-api-auth.md` (and `-api-profile.md` if run) the way D1 and D2 did, never no-arg `report.mjs` from the worktree.

- [x] **Step 6: Commit**

```bash
git add libs/api-auth/src/index.ts eslint.config.mjs .github/workflows/ci.yml
# plus the per-project eslint configs touched, mutation reports and test files, each by path; the deletions are already staged by git rm
git commit -m "refactor: Firebase Auth only behind FirebaseIdentityProvider; lint guard; Auth-emulator contract in CI (US-09-04 D3a)"
```

---

### Task 6: Land (controller)

Use the land-slice skill:
- **README:** a US-09-04 Slice D3a bullet after D2's. Cover what shipped (the port, two adapters, the contract on the Auth emulator, every call site moved, the lint guard), the one deliberate behaviour change (suspend and delete double-revoke in production), and the scope cuts: the emulator cannot show revocation, so those contract cases run only on in-memory and later local; the tools, e2e helpers and `firestore.rules` are untouched (D3c).
- **Spec status line:** "D3a shipped <date>".
- **Plan:** checkboxes flipped.
- **Memory:** a D3a record with the merge SHA, the seams (inject `IDENTITY_PROVIDER`; `PasswordProof`; `@learnwren/api-auth/testing`) and the gotchas.

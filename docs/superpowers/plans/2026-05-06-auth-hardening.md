# Auth Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the verification gate (UC-01-02 ext 4c), 3-strike brute-force lockout (UC-01-02 ext 4b), and the logged-out password-reset flow per `docs/superpowers/specs/2026-05-06-auth-hardening-design.md`. Fold the post-register auto-login and login itself into a single API-mediated flow so the NestJS server is the chokepoint for all login policy. Remove the Firebase Auth client SDK from the web bundle as a side effect.

**Architecture:** API-mediated login. `POST /auth/login` accepts `{ email, password }`; the server uses Firebase Auth's REST API (`identitytoolkit.signInWithPassword`) to verify credentials, runs lockout / verification / throttle checks, and mints the `__session` cookie in the same response. New `auth_attempts/{emailHash}` Firestore collection holds per-email lockout + throttle state, accessed only via the Admin SDK. Verification + password-reset emails are Firebase-templated; the unlock email is sent via a pluggable `EmailTransport` (Nodemailer SMTP for production, console-logging for dev).

**Tech Stack:** NestJS 11, Angular 21 standalone + signals, Firebase Admin SDK 13, Vitest 4, Playwright api-e2e, `@firebase/rules-unit-testing` (rules tests), Nodemailer (unlock email), Node built-in `crypto` (SHA-256 + random unlock tokens).

**Useful references during execution:**

- Spec: `docs/superpowers/specs/2026-05-06-auth-hardening-design.md`
- Prior plan (auth slice this builds on): `docs/superpowers/plans/2026-05-04-auth-registration-and-login.md`
- Existing `libs/api-auth/src/lib/auth.service.spec.ts` is the canonical example for NestJS service tests with hand-built `FakeAuth` / `FakeFirestore`.
- Existing `apps/api-e2e/src/auth.e2e-spec.ts` is the existing happy-path e2e suite — Task 24 adapts it.
- Existing `apps/api-e2e/src/firestore-rules.e2e-spec.ts` is the rules-test pattern — Task 15 adds to it.

**Conventions:**

- Run all nx tasks via `pnpm nx ...` per CLAUDE.md.
- Commits follow `feat(scope)`, `fix(scope)`, `docs(scope)`, `refactor(scope)`, `chore(scope)`.
- TypeScript path maps live in `tsconfig.base.json`. No new libs in this plan; everything goes into existing `libs/api-auth`, `libs/web-auth`, or app folders.
- API listens on `:3333`. The api-e2e Playwright config boots `dist/apps/api/main.js` and waits on `/api/health`.
- Use Node's built-in `crypto` (no extra deps). `crypto.createHash('sha256').update(text).digest('hex')` for email hashing. `crypto.randomBytes(32).toString('base64url')` for unlock tokens.
- Email transport selection: `LEARNWREN_EMAIL_TRANSPORT=console|smtp` (default `console` for safety). When `smtp`, also: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`. From-address: `LEARNWREN_EMAIL_FROM` (default `noreply@learnwren.local` for dev).

**Spec coverage map (verify each row before declaring the plan done):**

| Spec section | Covered by |
| :--- | :--- |
| §1.1 API-mediated login flow | Tasks 6, 8, 11, 13 |
| §1.2 Auto-login during registration | Task 11 |
| §1.3 Verification gate | Task 11 |
| §1.4 Lockout subsystem | Tasks 5, 11, 14 |
| §1.5 Password reset flow | Task 13 |
| §1.6 Logout | unchanged (no task needed) |
| §2.1 `auth_attempts/{emailHash}` doc | Task 5 |
| §2.2 Lazy auto-expiry | Task 5 |
| §2.3 Firestore rules | Task 15 |
| §3.2 `AuthAttemptsRepository` | Task 5 |
| §3.3 `FirebaseAuthRestClient` | Task 6 |
| §3.4 `AuthService` extensions | Tasks 11–14 |
| §3.5 `AuthController` updates | Task 16 |
| §3.6 Error envelope additions | Task 3 |
| §3.7 Email transport | Task 7 |
| §3.8 Logging | within Tasks 11–14 |
| §4.2 Web `AuthService` refactor | Task 18 |
| §4.3 Removal of Firebase web SDK | Task 25 |
| §4.4 `LoginPageComponent` updates | Task 19 |
| §4.5 `ForgotPasswordPageComponent` | Task 22 |
| §4.6 `UnlockPageComponent` | Task 23 |
| §4.7 `RegisterPageComponent` + post-registration confirmation | Tasks 20, 21 |
| §4.8 Routing | Task 24 |
| §5 Configuration and environment | Tasks 1, 2 |
| §6.1 Unit tests | within Tasks 5–14, 18–23 |
| §6.2 API e2e tests | Tasks 17, 26 |
| §6.3 Firestore rules tests | Task 15 |
| §6.4 Manual verification checklist | Task 28 |
| §7 Migration | Task 27 |

---

## Task 1: Add dependencies

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml` (auto)

- [ ] **Step 1: Add `nodemailer` and its types**

Run from the workspace root:

```bash
pnpm add nodemailer
pnpm add -D @types/nodemailer
```

`nodemailer` is the SMTP client used by `SmtpEmailTransport` (Task 7) to send the unlock email. The `console` transport variant has no dep beyond Node's `Logger`.

- [ ] **Step 2: Verify versions are sane**

Run:

```bash
pnpm list nodemailer @types/nodemailer
```

Expected output: both installed at any 6.x / 7.x line. No version constraint needed — Nodemailer's API surface for `createTransport({ host, port, auth })` and `transport.sendMail({ from, to, subject, text })` has been stable for years.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add nodemailer for unlock email transport"
```

---

## Task 2: Web API key + email transport env vars

**Files:**
- Modify: `.env.tpl`

- [ ] **Step 1: Add the new env vars to `.env.tpl`**

Append below the existing `# ── Admin SDK config (target=production) ──` block, before `# ── Reserved for later specs ──`:

```diff
 # ── Admin SDK config (target=production) ──────────────────────────────
 # Real project ID used by libs/api-firebase when targeting production.
 # Service-account JSON path (FIREBASE_SERVICE_ACCOUNT_JSON_PATH) is set
 # in the developer's shell init, not here — the path is per-machine.
 LEARNWREN_API_FIREBASE_PROJECT_ID=op://learnwren/Admin SDK Config/projectId
+
+# ── Auth REST API (target=production) ────────────────────────────────
+# Web API key used server-side by FirebaseAuthRestClient to verify
+# passwords against identitytoolkit.googleapis.com. Public-by-design
+# value (Firebase publishes it); rendered through op:// for parity
+# with other Firebase config.
+FIREBASE_WEB_API_KEY=op://learnwren/Web SDK Config/apiKey
+
+# ── Email transport (unlock email only) ──────────────────────────────
+# Verification + password-reset emails are sent by Firebase. The unlock
+# email goes through Nodemailer. In dev/emulator, default to a console
+# transport that logs the unlock URL to stdout. Prod overrides to smtp.
+LEARNWREN_EMAIL_TRANSPORT=console
+LEARNWREN_EMAIL_FROM=noreply@learnwren.local
+# Required when LEARNWREN_EMAIL_TRANSPORT=smtp:
+# SMTP_HOST=op://learnwren/SMTP/host
+# SMTP_PORT=op://learnwren/SMTP/port
+# SMTP_USER=op://learnwren/SMTP/user
+# SMTP_PASS=op://learnwren/SMTP/password
```

The SMTP lines are commented out because not every developer's 1Password vault has the SMTP item yet. Operators flip the transport to `smtp` and uncomment when they wire the production SMTP provider.

- [ ] **Step 2: Re-render the local `.env`**

Run:

```bash
pnpm secrets:render
```

Expected: completes without error, `.env` now contains `FIREBASE_WEB_API_KEY=...`, `LEARNWREN_EMAIL_TRANSPORT=console`, `LEARNWREN_EMAIL_FROM=noreply@learnwren.local`.

If `op:` resolves the key correctly the value will be the project's real Web API key. Verify with:

```bash
grep '^FIREBASE_WEB_API_KEY=' .env
```

- [ ] **Step 3: Commit**

```bash
git add .env.tpl
git commit -m "chore(secrets): add FIREBASE_WEB_API_KEY + email transport env vars"
```

---

## Task 3: Extend `AuthErrorCode` union and add new exception classes

**Files:**
- Modify: `libs/api-auth/src/lib/errors/auth-error.codes.ts`
- Modify: `libs/api-auth/src/lib/errors/auth.exception.ts`
- Test: `libs/api-auth/src/lib/auth.exception-filter.spec.ts` (existing; extend)

- [ ] **Step 1: Write the failing test for the filter mapping**

Open `libs/api-auth/src/lib/auth.exception-filter.spec.ts` and add a `describe('hardening exceptions', ...)` block at the end. If the file does not exist, mirror the structure of `auth.service.spec.ts` minimally:

```ts
import { describe, expect, it, vi } from 'vitest';

import { AuthExceptionFilter } from './auth.exception-filter';
import {
  AccountLockedException,
  EmailNotVerifiedException,
  InvalidCredentialsException,
  InvalidUnlockTokenException,
  TooManyRequestsException,
  UnlockTokenExpiredException,
} from './errors/auth.exception';

describe('AuthExceptionFilter — hardening exceptions', () => {
  function makeHost(captured: { status?: number; body?: unknown }) {
    const res = {
      status: vi.fn((code: number) => {
        captured.status = code;
        return res;
      }),
      json: vi.fn((body: unknown) => {
        captured.body = body;
      }),
    };
    return {
      switchToHttp: () => ({ getResponse: () => res }),
    } as unknown as Parameters<AuthExceptionFilter['catch']>[1];
  }

  it.each([
    [new InvalidCredentialsException(), 401, 'INVALID_CREDENTIALS', undefined],
    [new EmailNotVerifiedException(), 403, 'EMAIL_NOT_VERIFIED', { resendAvailable: true }],
    [
      new AccountLockedException(new Date('2026-05-06T01:00:00.000Z')),
      423,
      'ACCOUNT_LOCKED',
      { unlockAvailableAt: '2026-05-06T01:00:00.000Z' },
    ],
    [new TooManyRequestsException(), 429, 'TOO_MANY_REQUESTS', undefined],
    [new InvalidUnlockTokenException(), 400, 'INVALID_UNLOCK_TOKEN', undefined],
    [
      new UnlockTokenExpiredException(),
      410,
      'UNLOCK_TOKEN_EXPIRED',
      { canRequestPasswordReset: true },
    ],
  ])('maps %s', (exception, status, code, details) => {
    const filter = new AuthExceptionFilter();
    const captured: { status?: number; body?: unknown } = {};
    filter.catch(exception, makeHost(captured));
    expect(captured.status).toBe(status);
    expect(captured.body).toMatchObject({
      error: details ? { code, details } : { code },
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm nx test api-auth -- --run auth.exception-filter
```

Expected: FAIL with `Cannot find module './errors/auth.exception'` exports for the new exception classes (or import resolution errors for new symbols).

- [ ] **Step 3: Extend the error code union**

Open `libs/api-auth/src/lib/errors/auth-error.codes.ts` and replace the contents with:

```ts
export type AuthErrorCode =
  | 'INVALID_EMAIL'
  | 'WEAK_PASSWORD'
  | 'INVALID_DISPLAY_NAME'
  | 'EMAIL_ALREADY_EXISTS'
  | 'INVALID_ID_TOKEN'
  | 'RECENT_SIGN_IN_REQUIRED'
  | 'UNAUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_NOT_VERIFIED'
  | 'ACCOUNT_LOCKED'
  | 'TOO_MANY_REQUESTS'
  | 'INVALID_UNLOCK_TOKEN'
  | 'UNLOCK_TOKEN_EXPIRED'
  | 'INTERNAL';
```

- [ ] **Step 4: Add the new exception classes**

Open `libs/api-auth/src/lib/errors/auth.exception.ts`. First, widen `AuthErrorDetails` to admit the new shapes — replace the existing `AuthErrorDetails` interface with:

```ts
export interface AuthErrorDetails {
  unmetRequirements?: PolicyRequirement[];
  resendAvailable?: boolean;
  unlockAvailableAt?: string;
  canRequestPasswordReset?: boolean;
}
```

Then append at the end of the file (before EOF):

```ts
export class InvalidCredentialsException extends AuthException {
  constructor() {
    super('INVALID_CREDENTIALS', 'Invalid email or password.', 401);
  }
}

export class EmailNotVerifiedException extends AuthException {
  constructor() {
    super('EMAIL_NOT_VERIFIED', 'Please verify your email address before logging in.', 403, {
      resendAvailable: true,
    });
  }
}

export class AccountLockedException extends AuthException {
  constructor(unlockAvailableAt: Date) {
    super('ACCOUNT_LOCKED', 'Account is temporarily locked.', 423, {
      unlockAvailableAt: unlockAvailableAt.toISOString(),
    });
  }
}

export class TooManyRequestsException extends AuthException {
  constructor() {
    super('TOO_MANY_REQUESTS', 'Too many requests. Please try again shortly.', 429);
  }
}

export class InvalidUnlockTokenException extends AuthException {
  constructor() {
    super('INVALID_UNLOCK_TOKEN', 'Unlock token is invalid.', 400);
  }
}

export class UnlockTokenExpiredException extends AuthException {
  constructor() {
    super('UNLOCK_TOKEN_EXPIRED', 'Unlock token has expired.', 410, {
      canRequestPasswordReset: true,
    });
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run:

```bash
pnpm nx test api-auth -- --run auth.exception-filter
```

Expected: PASS for all new mappings. The `AuthExceptionFilter` is unchanged (it already pipes any `AuthException` through; the new classes inherit the path).

- [ ] **Step 6: Commit**

```bash
git add libs/api-auth/src/lib/errors/auth-error.codes.ts \
        libs/api-auth/src/lib/errors/auth.exception.ts \
        libs/api-auth/src/lib/auth.exception-filter.spec.ts
git commit -m "feat(api-auth): hardening exception classes + error codes"
```

---

## Task 4: New DTOs

**Files:**
- Create: `libs/api-auth/src/lib/dto/login.dto.ts`
- Create: `libs/api-auth/src/lib/dto/resend-verification.dto.ts`
- Create: `libs/api-auth/src/lib/dto/request-password-reset.dto.ts`
- Create: `libs/api-auth/src/lib/dto/unlock.dto.ts`

- [ ] **Step 1: Create `login.dto.ts`**

```ts
import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(256)
  password!: string;
}
```

- [ ] **Step 2: Create `resend-verification.dto.ts`**

```ts
import { IsString, MaxLength } from 'class-validator';

export class ResendVerificationDto {
  @IsString()
  @MaxLength(254)
  email!: string;
}
```

- [ ] **Step 3: Create `request-password-reset.dto.ts`**

```ts
import { IsString, MaxLength } from 'class-validator';

export class RequestPasswordResetDto {
  @IsString()
  @MaxLength(254)
  email!: string;
}
```

- [ ] **Step 4: Create `unlock.dto.ts`**

```ts
import { IsString, MaxLength, MinLength } from 'class-validator';

export class UnlockDto {
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  token!: string;
}
```

- [ ] **Step 5: Verify nothing typechecks-broken**

Run:

```bash
pnpm nx typecheck api-auth
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/api-auth/src/lib/dto/login.dto.ts \
        libs/api-auth/src/lib/dto/resend-verification.dto.ts \
        libs/api-auth/src/lib/dto/request-password-reset.dto.ts \
        libs/api-auth/src/lib/dto/unlock.dto.ts
git commit -m "feat(api-auth): DTOs for login, resend, reset, unlock"
```

---

## Task 5: `AuthAttemptsRepository`

**Files:**
- Create: `libs/api-auth/src/lib/auth-attempts.repository.ts`
- Test: `libs/api-auth/src/lib/auth-attempts.repository.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `libs/api-auth/src/lib/auth-attempts.repository.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FIRESTORE } from '@learnwren/api-firebase';

import { AuthAttemptsRepository } from './auth-attempts.repository';

interface FakeFirestore {
  collection: ReturnType<typeof vi.fn>;
  runTransaction: ReturnType<typeof vi.fn>;
  _docs: Map<string, Record<string, unknown>>;
  _queryHits: Map<string, string>;  // unlockToken → emailHash
}

function buildFakeFirestore(initial: Record<string, Record<string, unknown>> = {}): FakeFirestore {
  const docs = new Map<string, Record<string, unknown>>(Object.entries(initial));
  const queryHits = new Map<string, string>();
  for (const [hash, data] of docs) {
    if (data['unlockToken']) queryHits.set(data['unlockToken'] as string, hash);
  }

  const docRef = (hash: string) => ({
    get: vi.fn(async () => ({
      exists: docs.has(hash),
      data: () => docs.get(hash),
      ref: docRef(hash),
    })),
    set: vi.fn(async (data: Record<string, unknown>) => {
      docs.set(hash, { ...data });
      if (data['unlockToken']) queryHits.set(data['unlockToken'] as string, hash);
    }),
    delete: vi.fn(async () => {
      const existing = docs.get(hash);
      if (existing?.['unlockToken']) queryHits.delete(existing['unlockToken'] as string);
      docs.delete(hash);
    }),
    update: vi.fn(async (data: Record<string, unknown>) => {
      docs.set(hash, { ...docs.get(hash), ...data });
    }),
  });

  const collection = vi.fn(() => ({
    doc: vi.fn((hash: string) => docRef(hash)),
    where: vi.fn((field: string, _op: string, value: string) => ({
      limit: vi.fn(() => ({
        get: vi.fn(async () => {
          const hash = field === 'unlockToken' ? queryHits.get(value) : undefined;
          if (!hash || !docs.has(hash)) return { empty: true, docs: [] };
          return {
            empty: false,
            docs: [
              {
                id: hash,
                exists: true,
                data: () => docs.get(hash),
                ref: docRef(hash),
              },
            ],
          };
        }),
      })),
    })),
  }));

  const runTransaction = vi.fn(async (cb: (t: unknown) => unknown) => {
    const t = {
      get: async (ref: ReturnType<typeof docRef>) => ref.get(),
      set: (ref: ReturnType<typeof docRef>, data: Record<string, unknown>) => ref.set(data),
      delete: (ref: ReturnType<typeof docRef>) => ref.delete(),
      update: (ref: ReturnType<typeof docRef>, data: Record<string, unknown>) =>
        ref.update(data),
    };
    return cb(t);
  });

  return { collection, runTransaction, _docs: docs, _queryHits: queryHits };
}

async function buildRepo(firestore: FakeFirestore) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      AuthAttemptsRepository,
      { provide: FIRESTORE, useValue: firestore },
    ],
  }).compile();
  return moduleRef.get(AuthAttemptsRepository);
}

describe('AuthAttemptsRepository.emailHash', () => {
  it('produces lowercase, trimmed, sha256 hex', async () => {
    const repo = await buildRepo(buildFakeFirestore());
    expect(repo.emailHash('  Alice@Example.COM ')).toBe(
      // sha256('alice@example.com')
      '14b59e75a2e0ed5e63e8d36ed24fe7a4e34cc9180bafb0f8fe3692d62eaa4d4f',
    );
  });
});

describe('AuthAttemptsRepository.read', () => {
  beforeEach(() => vi.useRealTimers());

  it('returns null when doc does not exist', async () => {
    const repo = await buildRepo(buildFakeFirestore());
    expect(await repo.read('hash-1')).toBeNull();
  });

  it('returns doc as-is when not locked', async () => {
    const fs = buildFakeFirestore({
      'hash-1': { failedCount: 1, firstFailureAt: '2026-05-06T00:00:00.000Z' },
    });
    const repo = await buildRepo(fs);
    const doc = await repo.read('hash-1');
    expect(doc?.failedCount).toBe(1);
  });

  it('returns doc as-is when lockedUntil > now', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const fs = buildFakeFirestore({
      'hash-1': { failedCount: 3, lockedUntil: future, unlockToken: 'tok' },
    });
    const repo = await buildRepo(fs);
    const doc = await repo.read('hash-1');
    expect(doc?.lockedUntil).toBe(future);
  });

  it('lazily deletes the doc and returns null when lockedUntil <= now', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const fs = buildFakeFirestore({
      'hash-1': { failedCount: 3, lockedUntil: past, unlockToken: 'tok' },
    });
    const repo = await buildRepo(fs);
    expect(await repo.read('hash-1')).toBeNull();
    expect(fs._docs.has('hash-1')).toBe(false);
  });
});

describe('AuthAttemptsRepository.recordFailure', () => {
  it('creates a doc on first failure with count=1', async () => {
    const fs = buildFakeFirestore();
    const repo = await buildRepo(fs);
    const result = await repo.recordFailure('hash-1');
    expect(result.locked).toBe(false);
    expect(fs._docs.get('hash-1')?.['failedCount']).toBe(1);
  });

  it('increments to 2 on second failure', async () => {
    const fs = buildFakeFirestore({
      'hash-1': { failedCount: 1, firstFailureAt: '2026-05-06T00:00:00.000Z' },
    });
    const repo = await buildRepo(fs);
    const result = await repo.recordFailure('hash-1');
    expect(result.locked).toBe(false);
    expect(fs._docs.get('hash-1')?.['failedCount']).toBe(2);
  });

  it('locks on third failure with lockedUntil + unlockToken', async () => {
    const fs = buildFakeFirestore({
      'hash-1': { failedCount: 2, firstFailureAt: '2026-05-06T00:00:00.000Z' },
    });
    const repo = await buildRepo(fs);
    const result = await repo.recordFailure('hash-1');
    expect(result.locked).toBe(true);
    expect(result.unlockToken).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(result.lockedUntil).toBeInstanceOf(Date);
    const doc = fs._docs.get('hash-1')!;
    expect(doc['failedCount']).toBe(3);
    expect(doc['unlockToken']).toBe(result.unlockToken);
  });

  it('treats an auto-expired LOCKED doc as fresh on next failure', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const fs = buildFakeFirestore({
      'hash-1': { failedCount: 3, lockedUntil: past, unlockToken: 'old' },
    });
    const repo = await buildRepo(fs);
    const result = await repo.recordFailure('hash-1');
    expect(result.locked).toBe(false);
    expect(fs._docs.get('hash-1')?.['failedCount']).toBe(1);
    expect(fs._docs.get('hash-1')?.['lockedUntil']).toBeNull();
  });
});

describe('AuthAttemptsRepository.clear', () => {
  it('deletes the doc', async () => {
    const fs = buildFakeFirestore({
      'hash-1': { failedCount: 2 },
    });
    const repo = await buildRepo(fs);
    await repo.clear('hash-1');
    expect(fs._docs.has('hash-1')).toBe(false);
  });

  it('is a no-op when the doc does not exist', async () => {
    const fs = buildFakeFirestore();
    const repo = await buildRepo(fs);
    await expect(repo.clear('hash-1')).resolves.not.toThrow();
  });
});

describe('AuthAttemptsRepository.redeemUnlockToken', () => {
  it('returns invalid when token does not match any doc', async () => {
    const fs = buildFakeFirestore();
    const repo = await buildRepo(fs);
    expect(await repo.redeemUnlockToken('nope')).toEqual({ status: 'invalid' });
  });

  it('returns ok and deletes the doc on a valid, non-expired token', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const fs = buildFakeFirestore({
      'hash-1': { failedCount: 3, lockedUntil: future, unlockToken: 'tok' },
    });
    const repo = await buildRepo(fs);
    expect(await repo.redeemUnlockToken('tok')).toEqual({ status: 'ok' });
    expect(fs._docs.has('hash-1')).toBe(false);
  });

  it('returns expired and deletes the doc on a token whose lock has elapsed', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const fs = buildFakeFirestore({
      'hash-1': { failedCount: 3, lockedUntil: past, unlockToken: 'tok' },
    });
    const repo = await buildRepo(fs);
    expect(await repo.redeemUnlockToken('tok')).toEqual({ status: 'expired' });
    expect(fs._docs.has('hash-1')).toBe(false);
  });
});

describe('AuthAttemptsRepository throttle helpers', () => {
  it('recordResendVerification returns throttled=false when no prior timestamp', async () => {
    const fs = buildFakeFirestore();
    const repo = await buildRepo(fs);
    expect(await repo.recordResendVerification('hash-1')).toEqual({ throttled: false });
    expect(fs._docs.get('hash-1')?.['lastResendVerificationAt']).toBeTruthy();
  });

  it('recordResendVerification returns throttled=true within 60s window', async () => {
    const recent = new Date(Date.now() - 30_000).toISOString();
    const fs = buildFakeFirestore({
      'hash-1': { lastResendVerificationAt: recent },
    });
    const repo = await buildRepo(fs);
    expect(await repo.recordResendVerification('hash-1')).toEqual({ throttled: true });
  });

  it('recordResendVerification returns throttled=false after 60s window', async () => {
    const old = new Date(Date.now() - 90_000).toISOString();
    const fs = buildFakeFirestore({
      'hash-1': { lastResendVerificationAt: old },
    });
    const repo = await buildRepo(fs);
    expect(await repo.recordResendVerification('hash-1')).toEqual({ throttled: false });
  });

  it('recordPasswordResetRequest mirrors the same throttle behavior', async () => {
    const recent = new Date(Date.now() - 30_000).toISOString();
    const fs = buildFakeFirestore({
      'hash-1': { lastPasswordResetAt: recent },
    });
    const repo = await buildRepo(fs);
    expect(await repo.recordPasswordResetRequest('hash-1')).toEqual({ throttled: true });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm nx test api-auth -- --run auth-attempts.repository
```

Expected: FAIL with `Cannot find module './auth-attempts.repository'`.

- [ ] **Step 3: Implement `AuthAttemptsRepository`**

Create `libs/api-auth/src/lib/auth-attempts.repository.ts`:

```ts
import { createHash, randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { firestore as adminFirestore } from 'firebase-admin';

import { FIRESTORE, type FirestoreHandle } from '@learnwren/api-firebase';

const COLLECTION = 'auth_attempts';
const FAIL_LIMIT = 3;
const LOCKOUT_MS = 15 * 60 * 1000;
const THROTTLE_MS = 60 * 1000;

export interface AuthAttemptsDoc {
  failedCount: number;
  firstFailureAt: string | null;
  lockedUntil: string | null;
  unlockToken: string | null;
  lastResendVerificationAt: string | null;
  lastPasswordResetAt: string | null;
  updatedAt: string;
}

export interface RecordFailureResult {
  locked: boolean;
  unlockToken?: string;
  lockedUntil?: Date;
}

export type RedeemUnlockTokenResult =
  | { status: 'ok' }
  | { status: 'expired' }
  | { status: 'invalid' };

export interface ThrottleResult {
  throttled: boolean;
}

@Injectable()
export class AuthAttemptsRepository {
  constructor(@Inject(FIRESTORE) private readonly firestore: FirestoreHandle) {}

  emailHash(email: string): string {
    return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
  }

  async read(emailHash: string): Promise<AuthAttemptsDoc | null> {
    const ref = this.docRef(emailHash);
    const snap = await ref.get();
    if (!snap.exists) return null;
    const data = snap.data() as AuthAttemptsDoc;
    if (this.isExpiredLock(data.lockedUntil)) {
      await ref.delete();
      return null;
    }
    return data;
  }

  async recordFailure(emailHash: string): Promise<RecordFailureResult> {
    const ref = this.docRef(emailHash);
    return this.firestore.runTransaction(async (t) => {
      const snap = await t.get(ref);
      const now = new Date();
      const nowIso = now.toISOString();

      let data: AuthAttemptsDoc = snap.exists
        ? (snap.data() as AuthAttemptsDoc)
        : this.freshDoc(nowIso);

      if (this.isExpiredLock(data.lockedUntil)) {
        data = this.freshDoc(nowIso);
      }

      data.failedCount = (data.failedCount ?? 0) + 1;
      data.firstFailureAt = data.firstFailureAt ?? nowIso;
      data.updatedAt = nowIso;

      if (data.failedCount >= FAIL_LIMIT) {
        const lockedUntil = new Date(now.getTime() + LOCKOUT_MS);
        const unlockToken = randomBytes(32).toString('base64url');
        data.lockedUntil = lockedUntil.toISOString();
        data.unlockToken = unlockToken;
        t.set(ref, data);
        return { locked: true, unlockToken, lockedUntil };
      }

      t.set(ref, data);
      return { locked: false };
    });
  }

  async clear(emailHash: string): Promise<void> {
    await this.docRef(emailHash).delete();
  }

  async redeemUnlockToken(token: string): Promise<RedeemUnlockTokenResult> {
    const query = await this.firestore
      .collection(COLLECTION)
      .where('unlockToken', '==', token)
      .limit(1)
      .get();

    if (query.empty) return { status: 'invalid' };

    const docSnap = query.docs[0];
    const data = docSnap.data() as AuthAttemptsDoc;

    if (this.isExpiredLock(data.lockedUntil)) {
      await docSnap.ref.delete();
      return { status: 'expired' };
    }

    await docSnap.ref.delete();
    return { status: 'ok' };
  }

  async recordResendVerification(emailHash: string): Promise<ThrottleResult> {
    return this.applyThrottle(emailHash, 'lastResendVerificationAt');
  }

  async recordPasswordResetRequest(emailHash: string): Promise<ThrottleResult> {
    return this.applyThrottle(emailHash, 'lastPasswordResetAt');
  }

  private async applyThrottle(
    emailHash: string,
    field: 'lastResendVerificationAt' | 'lastPasswordResetAt',
  ): Promise<ThrottleResult> {
    const ref = this.docRef(emailHash);
    return this.firestore.runTransaction(async (t) => {
      const snap = await t.get(ref);
      const now = new Date();
      const nowIso = now.toISOString();
      const data: AuthAttemptsDoc = snap.exists
        ? (snap.data() as AuthAttemptsDoc)
        : this.freshDoc(nowIso);

      const last = data[field];
      if (last && now.getTime() - new Date(last).getTime() < THROTTLE_MS) {
        return { throttled: true };
      }

      data[field] = nowIso;
      data.updatedAt = nowIso;
      t.set(ref, data);
      return { throttled: false };
    });
  }

  private docRef(
    emailHash: string,
  ): adminFirestore.DocumentReference<adminFirestore.DocumentData> {
    return this.firestore.collection(COLLECTION).doc(emailHash);
  }

  private freshDoc(nowIso: string): AuthAttemptsDoc {
    return {
      failedCount: 0,
      firstFailureAt: null,
      lockedUntil: null,
      unlockToken: null,
      lastResendVerificationAt: null,
      lastPasswordResetAt: null,
      updatedAt: nowIso,
    };
  }

  private isExpiredLock(lockedUntil: string | null | undefined): boolean {
    if (!lockedUntil) return false;
    return new Date(lockedUntil).getTime() <= Date.now();
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
pnpm nx test api-auth -- --run auth-attempts.repository
```

Expected: All assertions pass. If the `emailHash` test fails because the SHA-256 hex differs, recompute it with:

```bash
node -e "console.log(require('crypto').createHash('sha256').update('alice@example.com').digest('hex'))"
```

and update the expected value in the test.

- [ ] **Step 5: Commit**

```bash
git add libs/api-auth/src/lib/auth-attempts.repository.ts \
        libs/api-auth/src/lib/auth-attempts.repository.spec.ts
git commit -m "feat(api-auth): AuthAttemptsRepository with state machine + throttles"
```

---

## Task 6: `FirebaseAuthRestClient`

**Files:**
- Create: `libs/api-auth/src/lib/firebase-auth-rest-client.ts`
- Test: `libs/api-auth/src/lib/firebase-auth-rest-client.spec.ts`

The client owns the single REST call to `identitytoolkit.signInWithPassword`. It auto-detects the Firebase Auth emulator from `FIREBASE_AUTH_EMULATOR_HOST` (set by `FirebaseAdminModule`) and falls back to the production endpoint otherwise. It maps Google's error codes to our domain exceptions per spec §3.3.

- [ ] **Step 1: Add an injection token for the Web API key**

Open `libs/api-firebase/src/lib/firebase.tokens.ts` and append:

```ts
export const FIREBASE_WEB_API_KEY = Symbol.for('learnwren.api-firebase.web-api-key');
export type FirebaseWebApiKey = string;
```

Then export it from `libs/api-firebase/src/index.ts`. Read the current contents:

```bash
cat libs/api-firebase/src/index.ts
```

and add `FIREBASE_WEB_API_KEY` (and the type `FirebaseWebApiKey`) to the existing export list.

- [ ] **Step 2: Provide the token in `FirebaseAdminModule`**

Open `libs/api-firebase/src/lib/firebase-admin.module.ts`. Add a provider for `FIREBASE_WEB_API_KEY` to `forRoot()`. Replace the `providers` array with:

```ts
providers: [
  { provide: FIRESTORE, useFactory: () => app.firestore() },
  { provide: FIREBASE_AUTH, useFactory: () => app.auth() },
  { provide: FIREBASE_STORAGE, useFactory: () => app.storage() },
  {
    provide: FIREBASE_WEB_API_KEY,
    useFactory: () => {
      const key = process.env['FIREBASE_WEB_API_KEY'];
      if (mode === 'production' && !key) {
        throw new Error(
          '[FirebaseAdminModule] LEARNWREN_FIREBASE_TARGET=production requires FIREBASE_WEB_API_KEY to be set.',
        );
      }
      // In emulator mode, the Auth emulator accepts any key string.
      return key ?? 'fake-api-key';
    },
  },
],
exports: [FIRESTORE, FIREBASE_AUTH, FIREBASE_STORAGE, FIREBASE_WEB_API_KEY],
```

Add `FIREBASE_WEB_API_KEY` to the existing imports at the top of the file.

- [ ] **Step 3: Write the failing tests**

Create `libs/api-auth/src/lib/firebase-auth-rest-client.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FIREBASE_WEB_API_KEY } from '@learnwren/api-firebase';

import {
  InternalAuthException,
  InvalidCredentialsException,
} from './errors/auth.exception';
import { FirebaseAuthRestClient } from './firebase-auth-rest-client';

const ORIGINAL_FETCH = global.fetch;

async function buildClient(apiKey = 'TEST_KEY') {
  const moduleRef = await Test.createTestingModule({
    providers: [
      FirebaseAuthRestClient,
      { provide: FIREBASE_WEB_API_KEY, useValue: apiKey },
    ],
  }).compile();
  return moduleRef.get(FirebaseAuthRestClient);
}

function mockFetchOk(body: unknown): void {
  global.fetch = vi.fn(async () =>
    new Response(JSON.stringify(body), { status: 200 }),
  ) as unknown as typeof fetch;
}

function mockFetchErr(status: number, message: string): void {
  global.fetch = vi.fn(async () =>
    new Response(JSON.stringify({ error: { message } }), { status }),
  ) as unknown as typeof fetch;
}

describe('FirebaseAuthRestClient.signInWithPassword', () => {
  beforeEach(() => {
    delete process.env['FIREBASE_AUTH_EMULATOR_HOST'];
  });

  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
  });

  it('uses the production URL when no emulator host is set', async () => {
    mockFetchOk({ idToken: 'tok', localId: 'uid', email: 'a@b.c', registered: true });
    const client = await buildClient('KEY');
    await client.signInWithPassword({ email: 'a@b.c', password: 'pw' });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=KEY',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('uses the emulator URL when FIREBASE_AUTH_EMULATOR_HOST is set', async () => {
    process.env['FIREBASE_AUTH_EMULATOR_HOST'] = '127.0.0.1:9099';
    mockFetchOk({ idToken: 'tok', localId: 'uid', email: 'a@b.c', registered: true });
    const client = await buildClient('KEY');
    await client.signInWithPassword({ email: 'a@b.c', password: 'pw' });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=KEY',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('returns the parsed body on 200', async () => {
    mockFetchOk({ idToken: 'TOKEN', localId: 'UID', email: 'a@b.c', registered: true });
    const client = await buildClient();
    const result = await client.signInWithPassword({ email: 'a@b.c', password: 'pw' });
    expect(result).toEqual({
      idToken: 'TOKEN',
      localId: 'UID',
      email: 'a@b.c',
      registered: true,
    });
  });

  it.each([
    ['EMAIL_NOT_FOUND'],
    ['INVALID_PASSWORD'],
    ['INVALID_LOGIN_CREDENTIALS'],
    ['USER_DISABLED'],
  ])('throws InvalidCredentialsException on %s', async (code) => {
    mockFetchErr(400, code);
    const client = await buildClient();
    await expect(
      client.signInWithPassword({ email: 'a@b.c', password: 'pw' }),
    ).rejects.toBeInstanceOf(InvalidCredentialsException);
  });

  it('throws InternalAuthException on unexpected error code', async () => {
    mockFetchErr(500, 'INTERNAL_ERROR');
    const client = await buildClient();
    await expect(
      client.signInWithPassword({ email: 'a@b.c', password: 'pw' }),
    ).rejects.toBeInstanceOf(InternalAuthException);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run:

```bash
pnpm nx test api-auth -- --run firebase-auth-rest-client
```

Expected: FAIL — module not found.

- [ ] **Step 5: Implement the client**

Create `libs/api-auth/src/lib/firebase-auth-rest-client.ts`:

```ts
import { Inject, Injectable, Logger } from '@nestjs/common';

import { FIREBASE_WEB_API_KEY, type FirebaseWebApiKey } from '@learnwren/api-firebase';

import {
  InternalAuthException,
  InvalidCredentialsException,
} from './errors/auth.exception';

export interface SignInWithPasswordInput {
  email: string;
  password: string;
}

export interface SignInWithPasswordResult {
  idToken: string;
  localId: string;
  email: string;
  registered: boolean;
}

const INVALID_CREDENTIAL_CODES = new Set([
  'EMAIL_NOT_FOUND',
  'INVALID_PASSWORD',
  'INVALID_LOGIN_CREDENTIALS', // newer Firebase response in some configs
  'USER_DISABLED',
]);

@Injectable()
export class FirebaseAuthRestClient {
  private readonly logger = new Logger('FirebaseAuthRestClient');

  constructor(
    @Inject(FIREBASE_WEB_API_KEY) private readonly apiKey: FirebaseWebApiKey,
  ) {}

  async signInWithPassword(
    input: SignInWithPasswordInput,
  ): Promise<SignInWithPasswordResult> {
    const url = `${this.baseUrl()}/accounts:signInWithPassword?key=${this.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: input.email,
        password: input.password,
        returnSecureToken: true,
      }),
    });

    if (res.ok) {
      const body = (await res.json()) as SignInWithPasswordResult;
      return body;
    }

    const errorBody = (await res.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    const upstreamCode = (errorBody?.error?.message ?? '').split(' ')[0]?.trim() ?? '';

    if (INVALID_CREDENTIAL_CODES.has(upstreamCode)) {
      throw new InvalidCredentialsException();
    }

    this.logger.error(
      `[auth] signInWithPassword unexpected status=${res.status} code=${upstreamCode}`,
    );
    throw new InternalAuthException();
  }

  private baseUrl(): string {
    const emulatorHost = process.env['FIREBASE_AUTH_EMULATOR_HOST'];
    if (emulatorHost) {
      return `http://${emulatorHost}/identitytoolkit.googleapis.com/v1`;
    }
    return 'https://identitytoolkit.googleapis.com/v1';
  }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run:

```bash
pnpm nx test api-auth -- --run firebase-auth-rest-client
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add libs/api-firebase/src/lib/firebase.tokens.ts \
        libs/api-firebase/src/lib/firebase-admin.module.ts \
        libs/api-firebase/src/index.ts \
        libs/api-auth/src/lib/firebase-auth-rest-client.ts \
        libs/api-auth/src/lib/firebase-auth-rest-client.spec.ts
git commit -m "feat(api-auth): FirebaseAuthRestClient + Web API key DI token"
```

---

## Task 7: `EmailTransport` interface + console & SMTP implementations

**Files:**
- Create: `libs/api-auth/src/lib/email-transport/email-transport.ts`
- Create: `libs/api-auth/src/lib/email-transport/console-email-transport.ts`
- Create: `libs/api-auth/src/lib/email-transport/smtp-email-transport.ts`
- Create: `libs/api-auth/src/lib/email-transport/email-transport.factory.ts`
- Test: `libs/api-auth/src/lib/email-transport/console-email-transport.spec.ts`
- Test: `libs/api-auth/src/lib/email-transport/email-transport.factory.spec.ts`

Verification + password-reset emails are Firebase-templated (the API just calls `auth.generateEmailVerificationLink` / `auth.generatePasswordResetLink`). The unlock email is the only one we send ourselves; this transport encapsulates that send.

- [ ] **Step 1: Write the interface**

Create `libs/api-auth/src/lib/email-transport/email-transport.ts`:

```ts
export const EMAIL_TRANSPORT = Symbol.for('learnwren.api-auth.email-transport');

export interface UnlockEmailInput {
  to: string;
  unlockUrl: string;
  unlockAvailableAt: Date;
}

export interface EmailTransport {
  sendUnlockEmail(input: UnlockEmailInput): Promise<void>;
}
```

- [ ] **Step 2: Write the failing test for the console transport**

Create `libs/api-auth/src/lib/email-transport/console-email-transport.spec.ts`:

```ts
import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConsoleEmailTransport } from './console-email-transport';

describe('ConsoleEmailTransport.sendUnlockEmail', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    logSpy.mockRestore();
  });

  it('logs the recipient, URL, and unlock time', async () => {
    const transport = new ConsoleEmailTransport();
    await transport.sendUnlockEmail({
      to: 'alice@example.com',
      unlockUrl: 'https://learnwren.com/auth/unlock?token=abc',
      unlockAvailableAt: new Date('2026-05-06T01:00:00.000Z'),
    });
    expect(logSpy).toHaveBeenCalled();
    const logged = String(logSpy.mock.calls[0]?.[0]);
    expect(logged).toContain('alice@example.com');
    expect(logged).toContain('https://learnwren.com/auth/unlock?token=abc');
    expect(logged).toContain('2026-05-06T01:00:00.000Z');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run:

```bash
pnpm nx test api-auth -- --run console-email-transport
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement the console transport**

Create `libs/api-auth/src/lib/email-transport/console-email-transport.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';

import type { EmailTransport, UnlockEmailInput } from './email-transport';

@Injectable()
export class ConsoleEmailTransport implements EmailTransport {
  private readonly logger = new Logger('ConsoleEmailTransport');

  async sendUnlockEmail(input: UnlockEmailInput): Promise<void> {
    this.logger.log(
      `[unlock-email] to=${input.to} url=${input.unlockUrl} ` +
        `unlockAvailableAt=${input.unlockAvailableAt.toISOString()}`,
    );
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run:

```bash
pnpm nx test api-auth -- --run console-email-transport
```

Expected: PASS.

- [ ] **Step 6: Implement the SMTP transport (no test — covered by integration)**

Create `libs/api-auth/src/lib/email-transport/smtp-email-transport.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';

import type { EmailTransport, UnlockEmailInput } from './email-transport';

export interface SmtpEmailTransportConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
}

@Injectable()
export class SmtpEmailTransport implements EmailTransport {
  private readonly logger = new Logger('SmtpEmailTransport');
  private readonly transporter: Transporter;

  constructor(private readonly config: SmtpEmailTransportConfig) {
    this.transporter = createTransport({
      host: config.host,
      port: config.port,
      auth: { user: config.user, pass: config.password },
    });
  }

  async sendUnlockEmail(input: UnlockEmailInput): Promise<void> {
    const text =
      `There were 3 unsuccessful sign-in attempts on your Learn Wren account.\n\n` +
      `It will unlock automatically at ${input.unlockAvailableAt.toISOString()}. ` +
      `If this wasn't you, you can unlock immediately and reset your password ` +
      `using the link below:\n\n${input.unlockUrl}\n\n` +
      `If you didn't try to sign in, please change your password.`;

    try {
      await this.transporter.sendMail({
        from: this.config.from,
        to: input.to,
        subject: 'Your Learn Wren account is temporarily locked',
        text,
      });
      this.logger.log(`[unlock-email] sent to=${input.to}`);
    } catch (err) {
      this.logger.error(`[unlock-email] send failed to=${input.to}: ${String(err)}`);
      throw err;
    }
  }
}
```

- [ ] **Step 7: Write the factory test**

Create `libs/api-auth/src/lib/email-transport/email-transport.factory.spec.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';

import { ConsoleEmailTransport } from './console-email-transport';
import { resolveEmailTransport } from './email-transport.factory';
import { SmtpEmailTransport } from './smtp-email-transport';

const KEYS = [
  'LEARNWREN_EMAIL_TRANSPORT',
  'LEARNWREN_EMAIL_FROM',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
];
const original: Record<string, string | undefined> = {};
for (const k of KEYS) original[k] = process.env[k];

afterEach(() => {
  for (const k of KEYS) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
});

describe('resolveEmailTransport', () => {
  it('returns ConsoleEmailTransport when transport is console (default)', () => {
    delete process.env['LEARNWREN_EMAIL_TRANSPORT'];
    expect(resolveEmailTransport()).toBeInstanceOf(ConsoleEmailTransport);
  });

  it('returns ConsoleEmailTransport when transport is explicitly console', () => {
    process.env['LEARNWREN_EMAIL_TRANSPORT'] = 'console';
    expect(resolveEmailTransport()).toBeInstanceOf(ConsoleEmailTransport);
  });

  it('returns SmtpEmailTransport when transport is smtp and SMTP_* are set', () => {
    process.env['LEARNWREN_EMAIL_TRANSPORT'] = 'smtp';
    process.env['LEARNWREN_EMAIL_FROM'] = 'noreply@learnwren.com';
    process.env['SMTP_HOST'] = 'smtp.example.com';
    process.env['SMTP_PORT'] = '587';
    process.env['SMTP_USER'] = 'user';
    process.env['SMTP_PASS'] = 'pass';
    expect(resolveEmailTransport()).toBeInstanceOf(SmtpEmailTransport);
  });

  it('throws when transport is smtp but a SMTP_* var is missing', () => {
    process.env['LEARNWREN_EMAIL_TRANSPORT'] = 'smtp';
    process.env['LEARNWREN_EMAIL_FROM'] = 'noreply@learnwren.com';
    delete process.env['SMTP_HOST'];
    expect(() => resolveEmailTransport()).toThrow(/SMTP_HOST/);
  });
});
```

- [ ] **Step 8: Run the test to verify it fails**

Run:

```bash
pnpm nx test api-auth -- --run email-transport.factory
```

Expected: FAIL — module not found.

- [ ] **Step 9: Implement the factory**

Create `libs/api-auth/src/lib/email-transport/email-transport.factory.ts`:

```ts
import type { EmailTransport } from './email-transport';
import { ConsoleEmailTransport } from './console-email-transport';
import { SmtpEmailTransport } from './smtp-email-transport';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`[email-transport] LEARNWREN_EMAIL_TRANSPORT=smtp requires ${name} to be set.`);
  }
  return value;
}

export function resolveEmailTransport(): EmailTransport {
  const mode = process.env['LEARNWREN_EMAIL_TRANSPORT'] ?? 'console';
  if (mode === 'console') return new ConsoleEmailTransport();
  if (mode === 'smtp') {
    return new SmtpEmailTransport({
      host: required('SMTP_HOST'),
      port: Number(required('SMTP_PORT')),
      user: required('SMTP_USER'),
      password: required('SMTP_PASS'),
      from: required('LEARNWREN_EMAIL_FROM'),
    });
  }
  throw new Error(
    `[email-transport] Unknown LEARNWREN_EMAIL_TRANSPORT='${mode}'. Use 'console' or 'smtp'.`,
  );
}
```

- [ ] **Step 10: Run all email-transport tests**

Run:

```bash
pnpm nx test api-auth -- --run email-transport
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add libs/api-auth/src/lib/email-transport/
git commit -m "feat(api-auth): EmailTransport interface + console + SMTP impls"
```

---

## Task 8: Refactor `AuthService.register` to mint the session cookie internally

**Files:**
- Modify: `libs/api-auth/src/lib/auth.service.ts`
- Modify: `libs/api-auth/src/lib/auth.service.spec.ts`

After this task, `AuthService.register` returns a `RegisterResult` that already contains the session cookie. The controller (Task 13) will read this and set the `Set-Cookie` header — no second round-trip from the client. The existing public `createSessionCookie` method remains for now; Task 13 will remove its consumer and Task 14 will delete the dead `SessionDto`.

- [ ] **Step 1: Update the failing test for the new register result shape**

Open `libs/api-auth/src/lib/auth.service.spec.ts`. The `describe('AuthService.register', ...)` block has a happy-path test that asserts the return shape. Update the assertion (and the test setup) so that:

1. The `FakeAuth` includes `verifyIdToken` and `createSessionCookie` mocks.
2. A `FirebaseAuthRestClient` mock is provided.
3. The result includes `cookie`, `maxAgeSeconds`, and `role`.

Replace `buildFakeAuth` and `buildModule` in that file with:

```ts
import { FirebaseAuthRestClient } from './firebase-auth-rest-client';

interface FakeAuth {
  createUser: ReturnType<typeof vi.fn>;
  setCustomUserClaims: ReturnType<typeof vi.fn>;
  generateEmailVerificationLink: ReturnType<typeof vi.fn>;
  deleteUser: ReturnType<typeof vi.fn>;
  verifyIdToken: ReturnType<typeof vi.fn>;
  createSessionCookie: ReturnType<typeof vi.fn>;
  verifySessionCookie?: ReturnType<typeof vi.fn>;
  revokeRefreshTokens?: ReturnType<typeof vi.fn>;
}

function buildFakeAuth(overrides: Partial<FakeAuth> = {}): FakeAuth {
  return {
    createUser: vi.fn(async () => ({ uid: 'uid-123' })),
    setCustomUserClaims: vi.fn(async () => undefined),
    generateEmailVerificationLink: vi.fn(async () => 'https://verify/abc'),
    deleteUser: vi.fn(async () => undefined),
    verifyIdToken: vi.fn(async () => ({
      uid: 'uid-123',
      email: 'alice@example.com',
      role: 'STUDENT',
      email_verified: false,
    })),
    createSessionCookie: vi.fn(async () => 'COOKIE-VALUE'),
    ...overrides,
  };
}

function buildFakeRestClient(idToken = 'ID-TOKEN') {
  return {
    signInWithPassword: vi.fn(async () => ({
      idToken,
      localId: 'uid-123',
      email: 'alice@example.com',
      registered: true,
    })),
  };
}

async function buildModule(
  auth: FakeAuth,
  firestore: FakeFirestore,
  rest: ReturnType<typeof buildFakeRestClient> = buildFakeRestClient(),
) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      AuthService,
      PasswordPolicyService,
      AuthAttemptsRepository,
      { provide: FIREBASE_AUTH, useValue: auth },
      { provide: FIRESTORE, useValue: firestore },
      { provide: FirebaseAuthRestClient, useValue: rest },
    ],
  }).compile();
  return moduleRef.get(AuthService);
}
```

Add the `AuthAttemptsRepository` and `FirebaseAuthRestClient` imports at the top of the file. The `AuthAttemptsRepository` needs the `FIRESTORE` provider, which is already in the providers array.

Then update the happy-path register test:

```ts
it('happy path: end-to-end register returns cookie + role + uid', async () => {
  const auth = buildFakeAuth();
  const firestore = buildFakeFirestore();
  const rest = buildFakeRestClient('ID-TOKEN-1');
  const service = await buildModule(auth, firestore, rest);

  const result = await service.register(validInput);

  expect(auth.createUser).toHaveBeenCalledWith({
    email: validInput.email,
    password: validInput.password,
    displayName: validInput.displayName,
  });
  expect(firestore._set).toHaveBeenCalled();
  expect(auth.setCustomUserClaims).toHaveBeenCalledWith('uid-123', { role: 'STUDENT' });
  expect(rest.signInWithPassword).toHaveBeenCalledWith({
    email: validInput.email,
    password: validInput.password,
  });
  expect(auth.verifyIdToken).toHaveBeenCalledWith('ID-TOKEN-1', true);
  expect(auth.createSessionCookie).toHaveBeenCalledWith(
    'ID-TOKEN-1',
    expect.objectContaining({ expiresIn: 5 * 24 * 60 * 60 * 1000 }),
  );
  expect(result).toMatchObject({
    uid: 'uid-123',
    email: validInput.email,
    role: 'STUDENT',
    cookie: 'COOKIE-VALUE',
    maxAgeSeconds: 5 * 24 * 60 * 60,
    emailVerificationSent: true,
  });
});
```

Add a rollback test: if signInWithPassword fails after the user was created, the user is deleted (we don't want a half-registered user with no auto-login).

```ts
it('rollback: signInWithPassword failure deletes the just-created user', async () => {
  const auth = buildFakeAuth();
  const firestore = buildFakeFirestore();
  const rest = {
    signInWithPassword: vi.fn(async () => {
      throw new InternalAuthException();
    }),
  };
  const service = await buildModule(auth, firestore, rest as never);

  await expect(service.register(validInput)).rejects.toBeInstanceOf(InternalAuthException);
  expect(auth.deleteUser).toHaveBeenCalledWith('uid-123');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm nx test api-auth -- --run auth.service
```

Expected: FAIL — `register` doesn't take a rest client + doesn't return a cookie.

- [ ] **Step 3: Refactor `AuthService.register` and add the private `mintSessionCookie`**

Open `libs/api-auth/src/lib/auth.service.ts`. Inject `FirebaseAuthRestClient` and (later) `AuthAttemptsRepository` into the constructor. Update the result types and the `register` method:

```ts
import { FirebaseAuthRestClient } from './firebase-auth-rest-client';
import { AuthAttemptsRepository } from './auth-attempts.repository';

// ... existing imports ...

export interface RegisterResult {
  uid: UserId;
  email: string;
  role: UserRole;
  cookie: string;
  maxAgeSeconds: number;
  emailVerificationSent: boolean;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger('AuthService');

  constructor(
    private readonly passwordPolicy: PasswordPolicyService,
    @Inject(FIREBASE_AUTH) private readonly auth: FirebaseAuthHandle,
    @Inject(FIRESTORE) private readonly firestore: FirestoreHandle,
    private readonly restClient: FirebaseAuthRestClient,
    private readonly attempts: AuthAttemptsRepository,
  ) {}

  async register(input: RegisterInput): Promise<RegisterResult> {
    // ... same validation up through generateEmailVerificationLink ...
    const displayName = input.displayName.trim();
    if (displayName.length === 0 || displayName.length > DISPLAY_NAME_MAX) {
      throw new InvalidDisplayNameException();
    }
    if (!EMAIL_REGEX.test(input.email)) {
      throw new InvalidEmailException();
    }

    const policy = this.passwordPolicy.validate(input.password);
    if (!policy.valid) {
      throw new WeakPasswordException(policy.unmet);
    }

    let userRecord: adminAuth.UserRecord;
    try {
      userRecord = await this.auth.createUser({
        email: input.email,
        password: input.password,
        displayName,
      });
    } catch (err) {
      if (this.isFirebaseError(err) && err.code === 'auth/email-already-exists') {
        throw new EmailAlreadyExistsException();
      }
      this.logger.error(
        `[auth] register createUser failed code=${(err as { code?: string }).code ?? 'unknown'}`,
      );
      throw new InternalAuthException();
    }

    const uid = userRecord.uid as UserId;
    const now = new Date().toISOString() as ISODateString;

    try {
      await this.firestore.collection('users').doc(uid).set({
        id: uid,
        email: input.email,
        displayName,
        role: 'STUDENT',
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      this.logger.error(`[auth] register firestore.set failed uid=${uid}: ${String(err)}`);
      await this.bestEffortDeleteUser(uid);
      throw new InternalAuthException();
    }

    try {
      await this.auth.setCustomUserClaims(uid, { role: 'STUDENT' });
    } catch (err) {
      this.logger.error(`[auth] register setCustomUserClaims failed uid=${uid}: ${String(err)}`);
      await this.bestEffortDeleteUser(uid);
      throw new InternalAuthException();
    }

    let emailVerificationSent = true;
    try {
      await this.auth.generateEmailVerificationLink(input.email, {
        url: this.continueUrl('/login'),
      });
    } catch (err) {
      this.logger.warn(
        `[auth] register generateEmailVerificationLink failed uid=${uid}: ${String(err)}`,
      );
      emailVerificationSent = false;
    }

    // New: auto-login internally to mint the session cookie before returning.
    let session: { cookie: string; maxAgeSeconds: number };
    try {
      const restResult = await this.restClient.signInWithPassword({
        email: input.email,
        password: input.password,
      });
      session = await this.mintSessionCookie(restResult.idToken);
    } catch (err) {
      this.logger.error(`[auth] register auto-login failed uid=${uid}: ${String(err)}`);
      await this.bestEffortDeleteUser(uid);
      throw err instanceof Error ? err : new InternalAuthException();
    }

    this.logger.log(`[auth] register uid=${uid}`);
    return {
      uid,
      email: input.email,
      role: 'STUDENT',
      cookie: session.cookie,
      maxAgeSeconds: session.maxAgeSeconds,
      emailVerificationSent,
    };
  }

  /**
   * Verify a fresh ID token and exchange it for a 5-day session cookie.
   * Used internally by register and login. Not exposed via the controller.
   */
  private async mintSessionCookie(idToken: string): Promise<{ cookie: string; maxAgeSeconds: number }> {
    try {
      await this.auth.verifyIdToken(idToken, true);
    } catch (err) {
      this.logger.error(`[auth] mintSessionCookie verifyIdToken failed: ${String(err)}`);
      throw new InternalAuthException();
    }
    let cookie: string;
    try {
      cookie = await this.auth.createSessionCookie(idToken, {
        expiresIn: SESSION_COOKIE_EXPIRES_IN_MS,
      });
    } catch (err) {
      this.logger.error(`[auth] mintSessionCookie createSessionCookie failed: ${String(err)}`);
      throw new InternalAuthException();
    }
    return { cookie, maxAgeSeconds: SESSION_COOKIE_MAX_AGE_SECONDS };
  }

  private continueUrl(path: string): string {
    const base = process.env['LEARNWREN_PUBLIC_URL'] ?? 'http://localhost:4200';
    return `${base}${path}`;
  }

  // ... existing logoutSideEffects, getMe, isFirebaseError, bestEffortDeleteUser ...
}
```

Delete the now-orphan public `createSessionCookie` method **and** its `SessionCookieResult` exported type (lines that defined them in the original file). The `InvalidIdTokenException` and `RecentSignInRequiredException` classes can stay in the codebase — they're harmless dead exports and the cleanup is its own concern.

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
pnpm nx test api-auth -- --run auth.service
```

Expected: PASS for the new happy path + rollback. Older tests for the old `createSessionCookie` method will fail because the method is gone — delete those test cases (the entire `describe('AuthService.createSessionCookie', ...)` block).

- [ ] **Step 5: Commit**

```bash
git add libs/api-auth/src/lib/auth.service.ts \
        libs/api-auth/src/lib/auth.service.spec.ts
git commit -m "refactor(api-auth): register mints session cookie internally"
```

---

## Task 9: `AuthService.login`

**Files:**
- Modify: `libs/api-auth/src/lib/auth.service.ts`
- Modify: `libs/api-auth/src/lib/auth.service.spec.ts`

The login method runs the full login pipeline per spec §1.1: lockout check → REST signIn → verification gate → mint cookie → clear lockout doc → fetch user info from Firestore. `EMAIL_NOT_VERIFIED` does NOT increment the failure counter; only `INVALID_CREDENTIALS` does.

- [ ] **Step 1: Write the failing tests**

Append a new `describe('AuthService.login', ...)` block to `libs/api-auth/src/lib/auth.service.spec.ts`:

```ts
import { AuthAttemptsRepository } from './auth-attempts.repository';
import {
  AccountLockedException,
  EmailNotVerifiedException,
  InvalidCredentialsException,
} from './errors/auth.exception';

describe('AuthService.login', () => {
  beforeEach(() => vi.clearAllMocks());

  const validInput = { email: 'alice@example.com', password: 'Aa1!aaaaaaaa' };

  function buildAttemptsMock(): {
    repo: AuthAttemptsRepository;
    spies: {
      emailHash: ReturnType<typeof vi.fn>;
      read: ReturnType<typeof vi.fn>;
      recordFailure: ReturnType<typeof vi.fn>;
      clear: ReturnType<typeof vi.fn>;
      redeemUnlockToken: ReturnType<typeof vi.fn>;
      recordResendVerification: ReturnType<typeof vi.fn>;
      recordPasswordResetRequest: ReturnType<typeof vi.fn>;
    };
  } {
    const spies = {
      emailHash: vi.fn(() => 'HASH'),
      read: vi.fn(async () => null),
      recordFailure: vi.fn(async () => ({ locked: false })),
      clear: vi.fn(async () => undefined),
      redeemUnlockToken: vi.fn(async () => ({ status: 'invalid' as const })),
      recordResendVerification: vi.fn(async () => ({ throttled: false })),
      recordPasswordResetRequest: vi.fn(async () => ({ throttled: false })),
    };
    return { repo: spies as unknown as AuthAttemptsRepository, spies };
  }

  async function buildLoginModule(
    auth: FakeAuth,
    firestore: FakeFirestore,
    rest: ReturnType<typeof buildFakeRestClient>,
    attempts: AuthAttemptsRepository,
  ): Promise<AuthService> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        PasswordPolicyService,
        { provide: FIREBASE_AUTH, useValue: auth },
        { provide: FIRESTORE, useValue: firestore },
        { provide: FirebaseAuthRestClient, useValue: rest },
        { provide: AuthAttemptsRepository, useValue: attempts },
      ],
    }).compile();
    return moduleRef.get(AuthService);
  }

  function fsWithUser(uid = 'uid-123', role = 'STUDENT', displayName = 'Alice'): FakeFirestore {
    const fs = buildFakeFirestore();
    // patch get() to return the user doc
    fs.collection = vi.fn(() => ({
      doc: vi.fn(() => ({
        get: vi.fn(async () => ({
          exists: true,
          data: () => ({ id: uid, displayName, role }),
        })),
        set: fs._set,
      })),
    })) as unknown as FakeFirestore['collection'];
    return fs;
  }

  it('happy path: returns uid + role + cookie and clears lockout doc', async () => {
    const auth = buildFakeAuth({
      verifyIdToken: vi.fn(async () => ({
        uid: 'uid-123',
        email: 'alice@example.com',
        role: 'STUDENT',
        email_verified: true,
      })),
    });
    const firestore = fsWithUser();
    const rest = buildFakeRestClient('ID-TOKEN');
    rest.signInWithPassword = vi.fn(async () => ({
      idToken: 'ID-TOKEN',
      localId: 'uid-123',
      email: 'alice@example.com',
      registered: true,
    }));
    // Override: REST returns user record we then look up via admin to get emailVerified
    auth.verifyIdToken = vi.fn(async () => ({
      uid: 'uid-123',
      email: 'alice@example.com',
      role: 'STUDENT',
      email_verified: true,
    }));
    // Add a getUser admin call (for emailVerified read).
    (auth as unknown as { getUser: ReturnType<typeof vi.fn> }).getUser = vi.fn(async () => ({
      uid: 'uid-123',
      email: 'alice@example.com',
      emailVerified: true,
      displayName: 'Alice',
    }));

    const { repo: attempts, spies } = buildAttemptsMock();
    const service = await buildLoginModule(auth, firestore, rest, attempts);

    const result = await service.login(validInput);

    expect(spies.emailHash).toHaveBeenCalledWith('alice@example.com');
    expect(spies.read).toHaveBeenCalledWith('HASH');
    expect(rest.signInWithPassword).toHaveBeenCalledWith({
      email: validInput.email,
      password: validInput.password,
    });
    expect(spies.clear).toHaveBeenCalledWith('HASH');
    expect(result).toMatchObject({
      uid: 'uid-123',
      role: 'STUDENT',
      displayName: 'Alice',
      emailVerified: true,
      cookie: 'COOKIE-VALUE',
      maxAgeSeconds: 5 * 24 * 60 * 60,
    });
  });

  it('throws ACCOUNT_LOCKED when read returns a locked doc', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const { repo: attempts, spies } = buildAttemptsMock();
    spies.read = vi.fn(async () => ({
      failedCount: 3,
      lockedUntil: future,
      unlockToken: 'tok',
    } as never));

    const auth = buildFakeAuth();
    const firestore = fsWithUser();
    const rest = buildFakeRestClient();
    const service = await buildLoginModule(auth, firestore, rest, attempts);

    await expect(service.login(validInput)).rejects.toBeInstanceOf(AccountLockedException);
    expect(rest.signInWithPassword).not.toHaveBeenCalled();
    expect(spies.recordFailure).not.toHaveBeenCalled();
  });

  it('throws INVALID_CREDENTIALS and increments counter on bad password', async () => {
    const { repo: attempts, spies } = buildAttemptsMock();
    const auth = buildFakeAuth();
    const firestore = fsWithUser();
    const rest = {
      signInWithPassword: vi.fn(async () => {
        throw new InvalidCredentialsException();
      }),
    } as unknown as FirebaseAuthRestClient;
    const service = await buildLoginModule(auth, firestore, rest, attempts);

    await expect(service.login(validInput)).rejects.toBeInstanceOf(InvalidCredentialsException);
    expect(spies.recordFailure).toHaveBeenCalledWith('HASH');
  });

  it('throws ACCOUNT_LOCKED when third failure transitions to locked', async () => {
    const { repo: attempts, spies } = buildAttemptsMock();
    const lockedUntil = new Date(Date.now() + 15 * 60_000);
    spies.recordFailure = vi.fn(async () => ({
      locked: true,
      unlockToken: 'utok',
      lockedUntil,
    }));

    const auth = buildFakeAuth();
    const firestore = fsWithUser();
    const rest = {
      signInWithPassword: vi.fn(async () => {
        throw new InvalidCredentialsException();
      }),
    } as unknown as FirebaseAuthRestClient;
    const service = await buildLoginModule(auth, firestore, rest, attempts);

    await expect(service.login(validInput)).rejects.toBeInstanceOf(AccountLockedException);
  });

  it('throws EMAIL_NOT_VERIFIED without incrementing the counter when emailVerified=false', async () => {
    const { repo: attempts, spies } = buildAttemptsMock();
    const auth = buildFakeAuth({
      verifyIdToken: vi.fn(async () => ({
        uid: 'uid-123',
        email: 'alice@example.com',
        role: 'STUDENT',
        email_verified: false,
      })),
    });
    (auth as unknown as { getUser: ReturnType<typeof vi.fn> }).getUser = vi.fn(async () => ({
      uid: 'uid-123',
      email: 'alice@example.com',
      emailVerified: false,
      displayName: 'Alice',
    }));
    const firestore = fsWithUser();
    const rest = buildFakeRestClient('ID-TOKEN');
    const service = await buildLoginModule(auth, firestore, rest, attempts);

    await expect(service.login(validInput)).rejects.toBeInstanceOf(EmailNotVerifiedException);
    expect(spies.recordFailure).not.toHaveBeenCalled();
    expect(spies.clear).not.toHaveBeenCalled();
    expect(auth.createSessionCookie).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm nx test api-auth -- --run auth.service
```

Expected: FAIL — `service.login` is not a function.

- [ ] **Step 3: Implement `login`**

Add to `libs/api-auth/src/lib/auth.service.ts`:

```ts
import { AuthAttemptsRepository } from './auth-attempts.repository';
import { FirebaseAuthRestClient } from './firebase-auth-rest-client';
import {
  AccountLockedException,
  EmailNotVerifiedException,
  InvalidCredentialsException,
  // ... existing exception imports
} from './errors/auth.exception';

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginResult {
  uid: UserId;
  email: string;
  role: UserRole;
  displayName: string;
  emailVerified: true;
  cookie: string;
  maxAgeSeconds: number;
}

// inside class AuthService:

async login(input: LoginInput): Promise<LoginResult> {
  const emailHash = this.attempts.emailHash(input.email);

  // (a) Lockout check before credential verification.
  const existing = await this.attempts.read(emailHash);
  if (existing?.lockedUntil) {
    throw new AccountLockedException(new Date(existing.lockedUntil));
  }

  // (b) Server-side password verification via REST.
  let idToken: string;
  try {
    const result = await this.restClient.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    idToken = result.idToken;
  } catch (err) {
    if (err instanceof InvalidCredentialsException) {
      const failure = await this.attempts.recordFailure(emailHash);
      if (failure.locked) {
        // Caller (Task 13 controller) is responsible for sending the unlock email
        // — fire-and-forget here would couple AuthService to email plumbing.
        this.logger.log(
          `[auth] lockout fired emailHash=${emailHash} unlockToken=${failure.unlockToken?.slice(0, 6)}…`,
        );
        throw new AccountLockedException(failure.lockedUntil!);
      }
      this.logger.log(`[auth] login failed code=INVALID_CREDENTIALS emailHash=${emailHash}`);
      throw err;
    }
    throw err;
  }

  // (c) Verification gate. Read fresh emailVerified from Admin SDK
  //     since the REST response doesn't always include it consistently.
  const decoded = await this.auth.verifyIdToken(idToken, true);
  const userRecord = await this.auth.getUser(decoded.uid);
  if (!userRecord.emailVerified) {
    this.logger.log(`[auth] login blocked code=EMAIL_NOT_VERIFIED uid=${userRecord.uid}`);
    throw new EmailNotVerifiedException();
  }

  // (d) Mint cookie. (e) Clear lockout doc. (f) Look up user details.
  const session = await this.mintSessionCookie(idToken);
  await this.attempts.clear(emailHash);

  const userDoc = await this.firestore.collection('users').doc(userRecord.uid).get();
  if (!userDoc.exists) {
    this.logger.error(`[auth] login missing users/${userRecord.uid}`);
    throw new InternalAuthException();
  }
  const data = userDoc.data() as { displayName: string; role: UserRole };

  this.logger.log(`[auth] login uid=${userRecord.uid}`);
  return {
    uid: userRecord.uid as UserId,
    email: userRecord.email!,
    role: data.role,
    displayName: data.displayName,
    emailVerified: true,
    cookie: session.cookie,
    maxAgeSeconds: session.maxAgeSeconds,
  };
}
```

The `login` method depends on `auth.getUser` which the existing `FirebaseAuthHandle` type already includes (it's the Admin SDK's `Auth` interface). No additional injection needed.

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
pnpm nx test api-auth -- --run auth.service
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/api-auth/src/lib/auth.service.ts \
        libs/api-auth/src/lib/auth.service.spec.ts
git commit -m "feat(api-auth): AuthService.login with lockout + verification gate"
```

---

## Task 10: `AuthService.resendVerification`

**Files:**
- Modify: `libs/api-auth/src/lib/auth.service.ts`
- Modify: `libs/api-auth/src/lib/auth.service.spec.ts`

Returns silently on most paths (enumeration resistance) per spec §3.4 / §B.3.

- [ ] **Step 1: Write the failing tests**

Append to `auth.service.spec.ts`:

```ts
import { TooManyRequestsException } from './errors/auth.exception';

describe('AuthService.resendVerification', () => {
  beforeEach(() => vi.clearAllMocks());

  async function buildResendModule(opts: {
    getUserResult?: unknown | 'not-found';
    throttle?: { throttled: boolean };
  }) {
    const auth = buildFakeAuth();
    const firestore = buildFakeFirestore();
    const rest = buildFakeRestClient();
    const { repo: attempts, spies } = buildAttemptsMock();
    spies.recordResendVerification = vi.fn(async () => opts.throttle ?? { throttled: false });

    if (opts.getUserResult === 'not-found') {
      (auth as unknown as { getUserByEmail: ReturnType<typeof vi.fn> }).getUserByEmail = vi.fn(
        async () => {
          throw Object.assign(new Error('user-not-found'), { code: 'auth/user-not-found' });
        },
      );
    } else {
      (auth as unknown as { getUserByEmail: ReturnType<typeof vi.fn> }).getUserByEmail = vi.fn(
        async () => opts.getUserResult ?? { uid: 'uid-123', email: 'alice@example.com', emailVerified: false },
      );
    }
    auth.generateEmailVerificationLink = vi.fn(async () => 'https://verify/abc');

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        PasswordPolicyService,
        { provide: FIREBASE_AUTH, useValue: auth },
        { provide: FIRESTORE, useValue: firestore },
        { provide: FirebaseAuthRestClient, useValue: rest },
        { provide: AuthAttemptsRepository, useValue: attempts },
      ],
    }).compile();
    return { service: moduleRef.get(AuthService), auth, spies };
  }

  it('throws TOO_MANY_REQUESTS when within throttle window', async () => {
    const { service } = await buildResendModule({ throttle: { throttled: true } });
    await expect(service.resendVerification('alice@example.com')).rejects.toBeInstanceOf(
      TooManyRequestsException,
    );
  });

  it('returns silently when user does not exist', async () => {
    const { service, auth } = await buildResendModule({ getUserResult: 'not-found' });
    await expect(service.resendVerification('ghost@example.com')).resolves.toBeUndefined();
    expect(auth.generateEmailVerificationLink).not.toHaveBeenCalled();
  });

  it('returns silently when user is already verified', async () => {
    const { service, auth } = await buildResendModule({
      getUserResult: { uid: 'uid-123', email: 'alice@example.com', emailVerified: true },
    });
    await expect(service.resendVerification('alice@example.com')).resolves.toBeUndefined();
    expect(auth.generateEmailVerificationLink).not.toHaveBeenCalled();
  });

  it('generates a verification link when user exists and is unverified', async () => {
    const { service, auth } = await buildResendModule({});
    await service.resendVerification('alice@example.com');
    expect(auth.generateEmailVerificationLink).toHaveBeenCalledWith(
      'alice@example.com',
      expect.objectContaining({ url: expect.stringContaining('/login') }),
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm nx test api-auth -- --run auth.service
```

Expected: FAIL — method not implemented.

- [ ] **Step 3: Implement `resendVerification`**

Add to `AuthService`:

```ts
async resendVerification(email: string): Promise<void> {
  const emailHash = this.attempts.emailHash(email);

  const throttle = await this.attempts.recordResendVerification(emailHash);
  if (throttle.throttled) {
    throw new TooManyRequestsException();
  }

  let userRecord: adminAuth.UserRecord;
  try {
    userRecord = await this.auth.getUserByEmail(email);
  } catch (err) {
    if (this.isFirebaseError(err) && err.code === 'auth/user-not-found') {
      // Enumeration resistance: silent success.
      return;
    }
    throw err;
  }

  if (userRecord.emailVerified) {
    // Already verified — silent success (don't leak verification status).
    return;
  }

  try {
    await this.auth.generateEmailVerificationLink(email, {
      url: this.continueUrl('/login'),
    });
    this.logger.log(`[auth] resend-verification sent emailHash=${emailHash}`);
  } catch (err) {
    this.logger.error(
      `[auth] resend-verification generateLink failed emailHash=${emailHash}: ${String(err)}`,
    );
    throw new InternalAuthException();
  }
}
```

Add `TooManyRequestsException` to the imports.

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
pnpm nx test api-auth -- --run auth.service
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/api-auth/src/lib/auth.service.ts \
        libs/api-auth/src/lib/auth.service.spec.ts
git commit -m "feat(api-auth): AuthService.resendVerification with enumeration resistance"
```

---

## Task 11: `AuthService.requestPasswordReset`

**Files:**
- Modify: `libs/api-auth/src/lib/auth.service.ts`
- Modify: `libs/api-auth/src/lib/auth.service.spec.ts`

Same enumeration-resistance shape as resend; explicitly does NOT mutate lockout state.

- [ ] **Step 1: Write the failing tests**

Append:

```ts
describe('AuthService.requestPasswordReset', () => {
  beforeEach(() => vi.clearAllMocks());

  async function build(opts: {
    getUserResult?: unknown | 'not-found';
    throttle?: { throttled: boolean };
  }) {
    const auth = buildFakeAuth();
    const firestore = buildFakeFirestore();
    const rest = buildFakeRestClient();
    const { repo: attempts, spies } = buildAttemptsMock();
    spies.recordPasswordResetRequest = vi.fn(async () => opts.throttle ?? { throttled: false });

    if (opts.getUserResult === 'not-found') {
      (auth as unknown as { getUserByEmail: ReturnType<typeof vi.fn> }).getUserByEmail = vi.fn(
        async () => {
          throw Object.assign(new Error('not-found'), { code: 'auth/user-not-found' });
        },
      );
    } else {
      (auth as unknown as { getUserByEmail: ReturnType<typeof vi.fn> }).getUserByEmail = vi.fn(
        async () => opts.getUserResult ?? { uid: 'uid-123', email: 'alice@example.com' },
      );
    }
    (auth as unknown as { generatePasswordResetLink: ReturnType<typeof vi.fn> }).generatePasswordResetLink =
      vi.fn(async () => 'https://reset/abc');

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        PasswordPolicyService,
        { provide: FIREBASE_AUTH, useValue: auth },
        { provide: FIRESTORE, useValue: firestore },
        { provide: FirebaseAuthRestClient, useValue: rest },
        { provide: AuthAttemptsRepository, useValue: attempts },
      ],
    }).compile();
    return { service: moduleRef.get(AuthService), auth, spies };
  }

  it('throws TOO_MANY_REQUESTS when within throttle window', async () => {
    const { service } = await build({ throttle: { throttled: true } });
    await expect(
      service.requestPasswordReset('alice@example.com'),
    ).rejects.toBeInstanceOf(TooManyRequestsException);
  });

  it('returns silently when user does not exist', async () => {
    const { service, auth } = await build({ getUserResult: 'not-found' });
    await expect(service.requestPasswordReset('ghost@example.com')).resolves.toBeUndefined();
    expect(
      (auth as unknown as { generatePasswordResetLink: ReturnType<typeof vi.fn> })
        .generatePasswordResetLink,
    ).not.toHaveBeenCalled();
  });

  it('generates a reset link when user exists', async () => {
    const { service, auth } = await build({});
    await service.requestPasswordReset('alice@example.com');
    const fn = (auth as unknown as { generatePasswordResetLink: ReturnType<typeof vi.fn> })
      .generatePasswordResetLink;
    expect(fn).toHaveBeenCalledWith(
      'alice@example.com',
      expect.objectContaining({ url: expect.stringContaining('reset=ok') }),
    );
  });

  it('does NOT clear lockout state when called for a locked email', async () => {
    const { service, spies } = await build({});
    await service.requestPasswordReset('alice@example.com');
    expect(spies.clear).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm nx test api-auth -- --run auth.service
```

Expected: FAIL.

- [ ] **Step 3: Implement `requestPasswordReset`**

Add to `AuthService`:

```ts
async requestPasswordReset(email: string): Promise<void> {
  const emailHash = this.attempts.emailHash(email);

  const throttle = await this.attempts.recordPasswordResetRequest(emailHash);
  if (throttle.throttled) {
    throw new TooManyRequestsException();
  }

  try {
    await this.auth.getUserByEmail(email);
  } catch (err) {
    if (this.isFirebaseError(err) && err.code === 'auth/user-not-found') {
      return;
    }
    throw err;
  }

  try {
    await this.auth.generatePasswordResetLink(email, {
      url: this.continueUrl('/login?reset=ok'),
    });
    this.logger.log(`[auth] password-reset requested emailHash=${emailHash}`);
  } catch (err) {
    this.logger.error(
      `[auth] password-reset generateLink failed emailHash=${emailHash}: ${String(err)}`,
    );
    throw new InternalAuthException();
  }
  // Note: deliberate no-op on lockout state. See spec §1.5 / §E.2(ii).
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
pnpm nx test api-auth -- --run auth.service
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/api-auth/src/lib/auth.service.ts \
        libs/api-auth/src/lib/auth.service.spec.ts
git commit -m "feat(api-auth): AuthService.requestPasswordReset (does not clear lockout)"
```

---

## Task 12: `AuthService.unlock`

**Files:**
- Modify: `libs/api-auth/src/lib/auth.service.ts`
- Modify: `libs/api-auth/src/lib/auth.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import {
  InvalidUnlockTokenException,
  UnlockTokenExpiredException,
} from './errors/auth.exception';

describe('AuthService.unlock', () => {
  beforeEach(() => vi.clearAllMocks());

  async function build(redeemResult: { status: 'ok' | 'invalid' | 'expired' }) {
    const auth = buildFakeAuth();
    const firestore = buildFakeFirestore();
    const rest = buildFakeRestClient();
    const { repo: attempts, spies } = buildAttemptsMock();
    spies.redeemUnlockToken = vi.fn(async () => redeemResult);

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        PasswordPolicyService,
        { provide: FIREBASE_AUTH, useValue: auth },
        { provide: FIRESTORE, useValue: firestore },
        { provide: FirebaseAuthRestClient, useValue: rest },
        { provide: AuthAttemptsRepository, useValue: attempts },
      ],
    }).compile();
    return moduleRef.get(AuthService);
  }

  it('returns void on a valid token', async () => {
    const service = await build({ status: 'ok' });
    await expect(service.unlock('GOOD-TOKEN')).resolves.toBeUndefined();
  });

  it('throws INVALID_UNLOCK_TOKEN on an unknown token', async () => {
    const service = await build({ status: 'invalid' });
    await expect(service.unlock('BAD-TOKEN')).rejects.toBeInstanceOf(
      InvalidUnlockTokenException,
    );
  });

  it('throws UNLOCK_TOKEN_EXPIRED on a token whose lock has elapsed', async () => {
    const service = await build({ status: 'expired' });
    await expect(service.unlock('OLD-TOKEN')).rejects.toBeInstanceOf(
      UnlockTokenExpiredException,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm nx test api-auth -- --run auth.service
```

Expected: FAIL.

- [ ] **Step 3: Implement `unlock`**

Add to `AuthService`:

```ts
async unlock(token: string): Promise<void> {
  const result = await this.attempts.redeemUnlockToken(token);
  if (result.status === 'ok') {
    this.logger.log('[auth] unlock redeemed');
    return;
  }
  if (result.status === 'expired') {
    throw new UnlockTokenExpiredException();
  }
  throw new InvalidUnlockTokenException();
}
```

Add the imports for the two new exception classes.

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
pnpm nx test api-auth -- --run auth.service
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/api-auth/src/lib/auth.service.ts \
        libs/api-auth/src/lib/auth.service.spec.ts
git commit -m "feat(api-auth): AuthService.unlock"
```

---

## Task 13: Wire `EmailTransport` into `AuthService.login` lock-fired path

**Files:**
- Modify: `libs/api-auth/src/lib/auth.service.ts`
- Modify: `libs/api-auth/src/lib/auth.service.spec.ts`

`AuthService` is the single owner of lockout policy, so it also owns "send the unlock email when a lock fires." Sending it here keeps the unlock token off the HTTP response.

- [ ] **Step 1: Update the failing test**

In `auth.service.spec.ts`, extend the `AuthService.login` describe block:

```ts
describe('AuthService.login — lock-fired email send', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends the unlock email when the third failure transitions to locked', async () => {
    const { repo: attempts, spies } = buildAttemptsMock();
    const lockedUntil = new Date(Date.now() + 15 * 60_000);
    spies.recordFailure = vi.fn(async () => ({
      locked: true,
      unlockToken: 'utok-XYZ',
      lockedUntil,
    }));

    const auth = buildFakeAuth();
    const firestore = fsWithUser();
    const rest = {
      signInWithPassword: vi.fn(async () => {
        throw new InvalidCredentialsException();
      }),
    } as unknown as FirebaseAuthRestClient;

    const sendUnlockEmail = vi.fn(async () => undefined);
    const emailTransport = { sendUnlockEmail } as unknown as EmailTransport;

    // Resolve email from emailHash by mocking auth.getUserByEmail
    (auth as unknown as { getUserByEmail: ReturnType<typeof vi.fn> }).getUserByEmail = vi.fn(
      async () => ({ uid: 'uid-123', email: 'alice@example.com', emailVerified: true }),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        PasswordPolicyService,
        { provide: FIREBASE_AUTH, useValue: auth },
        { provide: FIRESTORE, useValue: firestore },
        { provide: FirebaseAuthRestClient, useValue: rest },
        { provide: AuthAttemptsRepository, useValue: attempts },
        { provide: EMAIL_TRANSPORT, useValue: emailTransport },
      ],
    }).compile();
    const service = moduleRef.get(AuthService);

    await expect(
      service.login({ email: 'alice@example.com', password: 'pw' }),
    ).rejects.toBeInstanceOf(AccountLockedException);

    expect(sendUnlockEmail).toHaveBeenCalledWith({
      to: 'alice@example.com',
      unlockUrl: expect.stringContaining('/auth/unlock?token=utok-XYZ'),
      unlockAvailableAt: lockedUntil,
    });
  });

  it('does not crash when the email transport fails (lock still fires)', async () => {
    const { repo: attempts, spies } = buildAttemptsMock();
    const lockedUntil = new Date(Date.now() + 15 * 60_000);
    spies.recordFailure = vi.fn(async () => ({
      locked: true,
      unlockToken: 'utok',
      lockedUntil,
    }));

    const auth = buildFakeAuth();
    const firestore = fsWithUser();
    const rest = {
      signInWithPassword: vi.fn(async () => {
        throw new InvalidCredentialsException();
      }),
    } as unknown as FirebaseAuthRestClient;
    const emailTransport = {
      sendUnlockEmail: vi.fn(async () => {
        throw new Error('SMTP down');
      }),
    } as unknown as EmailTransport;
    (auth as unknown as { getUserByEmail: ReturnType<typeof vi.fn> }).getUserByEmail = vi.fn(
      async () => ({ uid: 'uid-123', email: 'alice@example.com', emailVerified: true }),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        PasswordPolicyService,
        { provide: FIREBASE_AUTH, useValue: auth },
        { provide: FIRESTORE, useValue: firestore },
        { provide: FirebaseAuthRestClient, useValue: rest },
        { provide: AuthAttemptsRepository, useValue: attempts },
        { provide: EMAIL_TRANSPORT, useValue: emailTransport },
      ],
    }).compile();
    const service = moduleRef.get(AuthService);

    await expect(
      service.login({ email: 'alice@example.com', password: 'pw' }),
    ).rejects.toBeInstanceOf(AccountLockedException);
  });
});
```

Add `import { EMAIL_TRANSPORT, type EmailTransport } from './email-transport/email-transport';` at the top.

Also revisit `buildLoginModule` (and `buildModule`) to pass an `EMAIL_TRANSPORT` provider with a no-op `sendUnlockEmail`:

```ts
{ provide: EMAIL_TRANSPORT, useValue: { sendUnlockEmail: vi.fn(async () => undefined) } },
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm nx test api-auth -- --run auth.service
```

Expected: FAIL — `EMAIL_TRANSPORT` is not provided in the module / `AuthService` does not call `sendUnlockEmail`.

- [ ] **Step 3: Inject `EmailTransport` into `AuthService` and send the email on lock-fired**

In `libs/api-auth/src/lib/auth.service.ts`:

```ts
import { EMAIL_TRANSPORT, type EmailTransport } from './email-transport/email-transport';

// ... constructor:
constructor(
  private readonly passwordPolicy: PasswordPolicyService,
  @Inject(FIREBASE_AUTH) private readonly auth: FirebaseAuthHandle,
  @Inject(FIRESTORE) private readonly firestore: FirestoreHandle,
  private readonly restClient: FirebaseAuthRestClient,
  private readonly attempts: AuthAttemptsRepository,
  @Inject(EMAIL_TRANSPORT) private readonly emailTransport: EmailTransport,
) {}
```

Inside `login`, replace the lock-fired branch with:

```ts
if (failure.locked) {
  this.logger.log(
    `[auth] lockout fired emailHash=${emailHash} unlockToken=${failure.unlockToken!.slice(0, 6)}…`,
  );
  await this.dispatchUnlockEmail(input.email, failure.unlockToken!, failure.lockedUntil!);
  throw new AccountLockedException(failure.lockedUntil!);
}
```

Add the helper at the bottom of the class:

```ts
private async dispatchUnlockEmail(
  email: string,
  unlockToken: string,
  unlockAvailableAt: Date,
): Promise<void> {
  // Resolve the canonical email address from Firebase to avoid sending to
  // a typo'd address that happened to match the brute-force attempt.
  let to: string;
  try {
    const userRecord = await this.auth.getUserByEmail(email);
    to = userRecord.email!;
  } catch {
    // The lock fired against a non-existent account (typo or malicious
    // probing). Don't send an email anywhere; lock is in place regardless.
    return;
  }

  try {
    await this.emailTransport.sendUnlockEmail({
      to,
      unlockUrl: `${this.continueUrl('/auth/unlock')}?token=${unlockToken}`,
      unlockAvailableAt,
    });
  } catch (err) {
    // Email is best-effort — the lock is enforced regardless. Surface the
    // failure in logs so operators can investigate transport health.
    this.logger.error(`[auth] unlock-email send failed: ${String(err)}`);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
pnpm nx test api-auth -- --run auth.service
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/api-auth/src/lib/auth.service.ts \
        libs/api-auth/src/lib/auth.service.spec.ts
git commit -m "feat(api-auth): send unlock email on lock-fired"
```

---

## Task 14: Update `AuthController` (login + resend + reset + unlock; remove /auth/session)

**Files:**
- Modify: `libs/api-auth/src/lib/auth.controller.ts`
- Modify: `libs/api-auth/src/lib/auth.controller.spec.ts` (existing, extend; or create if absent)
- Delete: `libs/api-auth/src/lib/dto/session.dto.ts`

- [ ] **Step 1: Write failing controller tests**

Open `libs/api-auth/src/lib/auth.controller.spec.ts` and add new test blocks for each new endpoint. Existing happy-path register test needs adjustment because register now returns a cookie too.

Pattern (full file may not exist — if absent, create from this scaffold):

```ts
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionCookieHelper } from './session-cookie.helper';
import {
  AccountLockedException,
  EmailNotVerifiedException,
  InvalidCredentialsException,
  InvalidUnlockTokenException,
  TooManyRequestsException,
  UnlockTokenExpiredException,
} from './errors/auth.exception';

function buildResMock() {
  const headers: Record<string, string> = {};
  return {
    headers,
    setHeader: vi.fn((k: string, v: string) => {
      headers[k] = v;
    }),
  };
}

async function buildController(authServiceMock: Partial<AuthService>) {
  const moduleRef = await Test.createTestingModule({
    controllers: [AuthController],
    providers: [
      { provide: AuthService, useValue: authServiceMock },
      SessionCookieHelper,
    ],
  })
    .overrideGuard(/* FirebaseSessionGuard token if needed */ Symbol('noop'))
    .useValue({ canActivate: () => true })
    .compile();
  return moduleRef.get(AuthController);
}

describe('AuthController.register', () => {
  it('sets the session cookie from the AuthService result', async () => {
    const register = vi.fn(async () => ({
      uid: 'uid-1',
      email: 'a@b.c',
      role: 'STUDENT',
      cookie: 'COOKIE',
      maxAgeSeconds: 432000,
      emailVerificationSent: true,
    }));
    const ctrl = await buildController({ register } as never);
    const res = buildResMock();
    const body = await ctrl.register(
      { email: 'a@b.c', password: 'Aa1!aaaaaaaa', displayName: 'A' } as never,
      res as never,
    );
    expect(body).toEqual({ uid: 'uid-1', role: 'STUDENT', email: 'a@b.c', emailVerified: false });
    expect(res.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('__session=COOKIE'),
    );
  });
});

describe('AuthController.login', () => {
  it('sets the session cookie on success', async () => {
    const login = vi.fn(async () => ({
      uid: 'uid-1',
      email: 'a@b.c',
      role: 'STUDENT',
      displayName: 'A',
      emailVerified: true,
      cookie: 'COOKIE',
      maxAgeSeconds: 432000,
    }));
    const ctrl = await buildController({ login } as never);
    const res = buildResMock();
    const body = await ctrl.login({ email: 'a@b.c', password: 'pw' } as never, res as never);
    expect(body).toEqual({ uid: 'uid-1', role: 'STUDENT', displayName: 'A', emailVerified: true });
    expect(res.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('__session=COOKIE'),
    );
  });

  it.each([
    () => new InvalidCredentialsException(),
    () => new EmailNotVerifiedException(),
    () => new AccountLockedException(new Date('2026-05-06T01:00:00.000Z')),
  ])('propagates %s without setting a cookie', async (factory) => {
    const ex = factory();
    const login = vi.fn(async () => {
      throw ex;
    });
    const ctrl = await buildController({ login } as never);
    const res = buildResMock();
    await expect(
      ctrl.login({ email: 'a@b.c', password: 'pw' } as never, res as never),
    ).rejects.toBe(ex);
    expect(res.setHeader).not.toHaveBeenCalled();
  });
});

describe('AuthController.resendVerification', () => {
  it('returns void on 202', async () => {
    const resendVerification = vi.fn(async () => undefined);
    const ctrl = await buildController({ resendVerification } as never);
    await expect(
      ctrl.resendVerification({ email: 'a@b.c' } as never),
    ).resolves.toBeUndefined();
  });

  it('propagates TooManyRequestsException', async () => {
    const resendVerification = vi.fn(async () => {
      throw new TooManyRequestsException();
    });
    const ctrl = await buildController({ resendVerification } as never);
    await expect(
      ctrl.resendVerification({ email: 'a@b.c' } as never),
    ).rejects.toBeInstanceOf(TooManyRequestsException);
  });
});

describe('AuthController.requestPasswordReset', () => {
  it('returns void on 202', async () => {
    const requestPasswordReset = vi.fn(async () => undefined);
    const ctrl = await buildController({ requestPasswordReset } as never);
    await expect(
      ctrl.requestPasswordReset({ email: 'a@b.c' } as never),
    ).resolves.toBeUndefined();
  });
});

describe('AuthController.unlock', () => {
  it('returns void on 204', async () => {
    const unlock = vi.fn(async () => undefined);
    const ctrl = await buildController({ unlock } as never);
    await expect(ctrl.unlock({ token: 'tok' } as never)).resolves.toBeUndefined();
  });

  it.each([
    () => new InvalidUnlockTokenException(),
    () => new UnlockTokenExpiredException(),
  ])('propagates %s', async (factory) => {
    const ex = factory();
    const unlock = vi.fn(async () => {
      throw ex;
    });
    const ctrl = await buildController({ unlock } as never);
    await expect(ctrl.unlock({ token: 'tok' } as never)).rejects.toBe(ex);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm nx test api-auth -- --run auth.controller
```

Expected: FAIL — `controller.login` etc. not defined.

- [ ] **Step 3: Replace `auth.controller.ts`**

Overwrite `libs/api-auth/src/lib/auth.controller.ts` with:

```ts
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { AuthExceptionFilter } from './auth.exception-filter';
import { AuthService, type MeResponse } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { UnlockDto } from './dto/unlock.dto';
import { FirebaseSessionGuard } from './firebase-session.guard';
import { SessionCookieHelper } from './session-cookie.helper';
import type { AuthenticatedRequest } from './types/authenticated-request';

interface RegisterResponseBody {
  uid: string;
  email: string;
  role: string;
  emailVerified: boolean;
}

interface LoginResponseBody {
  uid: string;
  role: string;
  displayName: string;
  emailVerified: true;
}

@Controller('auth')
@UseFilters(AuthExceptionFilter)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionCookieHelper: SessionCookieHelper,
  ) {}

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RegisterResponseBody> {
    const result = await this.authService.register({
      email: dto.email,
      password: dto.password,
      displayName: dto.displayName,
    });
    res.setHeader(
      'Set-Cookie',
      this.sessionCookieHelper.toSetCookie(result.cookie, {
        maxAgeSeconds: result.maxAgeSeconds,
      }),
    );
    return {
      uid: result.uid,
      email: result.email,
      role: result.role,
      emailVerified: false, // freshly-registered accounts are unverified by definition
    };
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseBody> {
    const result = await this.authService.login({ email: dto.email, password: dto.password });
    res.setHeader(
      'Set-Cookie',
      this.sessionCookieHelper.toSetCookie(result.cookie, {
        maxAgeSeconds: result.maxAgeSeconds,
      }),
    );
    return {
      uid: result.uid,
      role: result.role,
      displayName: result.displayName,
      emailVerified: result.emailVerified,
    };
  }

  @Post('resend-verification')
  @HttpCode(202)
  async resendVerification(@Body() dto: ResendVerificationDto): Promise<void> {
    await this.authService.resendVerification(dto.email);
  }

  @Post('request-password-reset')
  @HttpCode(202)
  async requestPasswordReset(@Body() dto: RequestPasswordResetDto): Promise<void> {
    await this.authService.requestPasswordReset(dto.email);
  }

  @Post('unlock')
  @HttpCode(204)
  async unlock(@Body() dto: UnlockDto): Promise<void> {
    await this.authService.unlock(dto.token);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() req: Request & { cookies?: Record<string, string> },
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const cookie = req.cookies?.[SessionCookieHelper.COOKIE_NAME];
    await this.authService.logoutSideEffects(cookie);
    res.setHeader('Set-Cookie', this.sessionCookieHelper.toClearingCookie());
  }

  @Get('me')
  @UseGuards(FirebaseSessionGuard)
  async me(@Req() req: AuthenticatedRequest): Promise<MeResponse> {
    const user = req.user!;
    return this.authService.getMe(user.uid, {
      email: user.email,
      emailVerified: user.emailVerified,
    });
  }
}
```

- [ ] **Step 4: Delete `session.dto.ts`**

Run:

```bash
rm libs/api-auth/src/lib/dto/session.dto.ts
```

- [ ] **Step 5: Run the tests to verify they pass**

Run:

```bash
pnpm nx test api-auth -- --run auth.controller
```

Expected: PASS for all controller tests.

Then run the full api-auth suite to surface any cross-test regressions:

```bash
pnpm nx test api-auth
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/api-auth/src/lib/auth.controller.ts \
        libs/api-auth/src/lib/auth.controller.spec.ts \
        libs/api-auth/src/lib/dto/
git commit -m "feat(api-auth): controller endpoints for login, resend, reset, unlock"
```

---

## Task 15: `AuthModule` wiring

**Files:**
- Modify: `libs/api-auth/src/lib/auth.module.ts`

- [ ] **Step 1: Update the providers list**

Replace `libs/api-auth/src/lib/auth.module.ts` with:

```ts
import { Module } from '@nestjs/common';

import { AuthAttemptsRepository } from './auth-attempts.repository';
import { AuthController } from './auth.controller';
import { AuthExceptionFilter } from './auth.exception-filter';
import { AuthService } from './auth.service';
import { ConsoleEmailTransport } from './email-transport/console-email-transport';
import { EMAIL_TRANSPORT } from './email-transport/email-transport';
import { resolveEmailTransport } from './email-transport/email-transport.factory';
import { FirebaseAuthRestClient } from './firebase-auth-rest-client';
import { FirebaseSessionGuard } from './firebase-session.guard';
import { PasswordPolicyService } from './password-policy.service';
import { SessionCookieHelper } from './session-cookie.helper';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthAttemptsRepository,
    AuthExceptionFilter,
    ConsoleEmailTransport, // fallback class registration; factory chooses concrete impl
    FirebaseAuthRestClient,
    FirebaseSessionGuard,
    PasswordPolicyService,
    SessionCookieHelper,
    {
      provide: EMAIL_TRANSPORT,
      useFactory: () => resolveEmailTransport(),
    },
  ],
  exports: [FirebaseSessionGuard],
})
export class AuthModule {}
```

- [ ] **Step 2: Verify the API typechecks and starts**

Run:

```bash
pnpm nx typecheck api-auth api
```

Expected: PASS.

Then start the API against the emulator and verify the new endpoint surface:

```bash
# Terminal 1
pnpm emulators
# Terminal 2
pnpm secrets:render
pnpm secrets:run -- pnpm start:api
```

In a third terminal:

```bash
curl -i http://localhost:3333/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"nobody@example.com","password":"x"}'
```

Expected: `401` with `{"error":{"code":"INVALID_CREDENTIALS",...}}`. (Both INVALID_CREDENTIALS path: no user, plus a counter increment under the hood.)

- [ ] **Step 3: Commit**

```bash
git add libs/api-auth/src/lib/auth.module.ts
git commit -m "feat(api-auth): wire AuthAttemptsRepository, REST client, EmailTransport"
```

---

## Task 16: Firestore rules — production + emulator

**Files:**
- Modify: `firestore.rules`
- Modify: `firestore.emulator.rules`

- [ ] **Step 1: Add the `auth_attempts` rule to both files**

Open `firestore.rules` and insert the rule above the `match /{document=**}` deny-all:

```diff
     match /users/{userId} {
       allow read:   if isOwner(userId) || isAdmin();
       allow create: if false;
       allow update: if false;
       allow delete: if false;
     }
+
+    match /auth_attempts/{emailHash} {
+      allow read, write: if false;
+    }

     // Deny-by-default for everything else.
     match /{document=**} {
       allow read, write: if false;
     }
```

Apply the same diff to `firestore.emulator.rules`.

- [ ] **Step 2: Validate Firebase rule syntax**

Run:

```bash
pnpm exec firebase emulators:exec --only firestore "true"
```

Expected: emulator starts cleanly. If the rules file has a syntax error, the emulator fails to load it with a parse error.

- [ ] **Step 3: Commit**

```bash
git add firestore.rules firestore.emulator.rules
git commit -m "feat(rules): deny-all on auth_attempts collection"
```

---

## Task 17: Firestore rules e2e test

**Files:**
- Modify: `apps/api-e2e/src/firestore-rules.e2e-spec.ts`

- [ ] **Step 1: Add the new tests**

Append the following tests to `apps/api-e2e/src/firestore-rules.e2e-spec.ts`:

```ts
import {
  // existing imports...
} from 'firebase/firestore';

test('anonymous client cannot read /auth_attempts/{anyHash}', async () => {
  const ctx = testEnv.unauthenticatedContext();
  await assertFails(getDoc(doc(ctx.firestore(), 'auth_attempts', 'abcd1234')));
});

test('anonymous client cannot write /auth_attempts/{anyHash}', async () => {
  const ctx = testEnv.unauthenticatedContext();
  await assertFails(
    setDoc(doc(ctx.firestore(), 'auth_attempts', 'abcd1234'), { failedCount: 1 }),
  );
});

test('authenticated client cannot read /auth_attempts/{anyHash}', async () => {
  const ctx = testEnv.authenticatedContext('A', { role: 'STUDENT' });
  await assertFails(getDoc(doc(ctx.firestore(), 'auth_attempts', 'abcd1234')));
});

test('authenticated client cannot write /auth_attempts/{anyHash}', async () => {
  const ctx = testEnv.authenticatedContext('A', { role: 'STUDENT' });
  await assertFails(
    setDoc(doc(ctx.firestore(), 'auth_attempts', 'abcd1234'), { failedCount: 1 }),
  );
});

test('admin cannot read /auth_attempts/{anyHash}', async () => {
  const ctx = testEnv.authenticatedContext('admin-1', { role: 'ADMIN' });
  await assertFails(getDoc(doc(ctx.firestore(), 'auth_attempts', 'abcd1234')));
});
```

The admin test confirms the rule is unconditional `if false` — even ADMIN has no client-side access.

- [ ] **Step 2: Run the rules e2e**

Start the emulator suite if not already running:

```bash
pnpm emulators
```

In another terminal:

```bash
pnpm nx run api-e2e:e2e -- --grep "auth_attempts"
```

Expected: all five new assertions PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api-e2e/src/firestore-rules.e2e-spec.ts
git commit -m "test(rules): assert deny-all on auth_attempts"
```

---

## Task 18: Adapt the existing api-e2e auth happy-path

**Files:**
- Modify: `apps/api-e2e/src/auth.e2e-spec.ts`

The existing `register → session → me → logout` test had a flaky `users/{uid}` race because session-cookie minting happened in a second round-trip. After Task 14, register itself sets the cookie — the round-trip is gone, so the race is gone too.

- [ ] **Step 1: Replace the happy-path test**

Open `apps/api-e2e/src/auth.e2e-spec.ts`. Delete the `signInViaAuthEmulator` helper (no longer needed) and replace the happy-path test with:

```ts
import { expect, test } from '@playwright/test';

const API_BASE = 'http://localhost:3333/api';

const uniqueEmail = () => `auth-e2e-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;

test('register → me → logout end-to-end (cookie set on register)', async ({ request }) => {
  const email = uniqueEmail();
  const password = 'Aa1!aaaaaaaa';
  const displayName = 'E2E Tester';

  const reg = await request.post(`${API_BASE}/auth/register`, {
    data: { email, password, displayName },
  });
  expect(reg.status()).toBe(201);
  const regBody = await reg.json();
  expect(regBody).toMatchObject({ email, role: 'STUDENT', emailVerified: false });
  expect(regBody.uid).toEqual(expect.any(String));

  const sessionCookie = reg.headers()['set-cookie'];
  expect(sessionCookie).toContain('__session=');
  expect(sessionCookie).toContain('HttpOnly');
  expect(sessionCookie).toContain('SameSite=Strict');

  const match = sessionCookie!.match(/__session=([^;]+)/);
  expect(match).not.toBeNull();
  const cookieHeader = `__session=${match![1]}`;

  const me = await request.get(`${API_BASE}/auth/me`, {
    headers: { cookie: cookieHeader },
  });
  expect(me.status()).toBe(200);
  const meBody = await me.json();
  expect(meBody).toMatchObject({
    uid: regBody.uid,
    email,
    displayName,
    role: 'STUDENT',
    emailVerified: false,
  });

  const out = await request.post(`${API_BASE}/auth/logout`, {
    headers: { cookie: cookieHeader },
  });
  expect(out.status()).toBe(204);

  const meAfter = await request.get(`${API_BASE}/auth/me`, {
    headers: { cookie: cookieHeader },
  });
  expect(meAfter.status()).toBe(401);
});

test('register rejects duplicate email with EMAIL_ALREADY_EXISTS', async ({ request }) => {
  const email = uniqueEmail();
  const password = 'Aa1!aaaaaaaa';
  const displayName = 'Dup';
  const first = await request.post(`${API_BASE}/auth/register`, {
    data: { email, password, displayName },
  });
  expect(first.status()).toBe(201);

  const dup = await request.post(`${API_BASE}/auth/register`, {
    data: { email, password, displayName },
  });
  expect(dup.status()).toBe(409);
  expect((await dup.json()).error.code).toBe('EMAIL_ALREADY_EXISTS');
});

test('register rejects a weak password with WEAK_PASSWORD and unmetRequirements', async ({ request }) => {
  const email = uniqueEmail();
  const reg = await request.post(`${API_BASE}/auth/register`, {
    data: { email, password: 'short', displayName: 'X' },
  });
  expect(reg.status()).toBe(400);
  const body = await reg.json();
  expect(body.error.code).toBe('WEAK_PASSWORD');
  expect(body.error.details.unmetRequirements).toContain('MIN_LENGTH');
});
```

- [ ] **Step 2: Run the e2e against the emulator suite**

```bash
pnpm emulators
# new terminal
pnpm secrets:render
pnpm nx run api-e2e:e2e -- --grep "register"
```

Expected: all three tests PASS, deterministically (no flake).

- [ ] **Step 3: Commit**

```bash
git add apps/api-e2e/src/auth.e2e-spec.ts
git commit -m "test(api-e2e): adapt happy-path to single-trip register"
```

---

## Task 19: New api-e2e tests for hardening features

**Files:**
- Modify: `apps/api-e2e/src/auth.e2e-spec.ts`

Six new tests covering the spec §6.2 list. They need a small Admin-SDK helper to flip `emailVerified` on demand (the auth emulator default is `false`).

- [ ] **Step 1: Add the test-only Admin SDK helper**

At the top of `apps/api-e2e/src/auth.e2e-spec.ts`, after the existing imports:

```ts
import * as admin from 'firebase-admin';

if (admin.apps.length === 0) {
  process.env['FIREBASE_AUTH_EMULATOR_HOST'] = '127.0.0.1:9099';
  process.env['FIRESTORE_EMULATOR_HOST'] = '127.0.0.1:8080';
  admin.initializeApp({ projectId: 'demo-learnwren' });
}

async function markEmailVerified(uid: string): Promise<void> {
  await admin.auth().updateUser(uid, { emailVerified: true });
}

async function readAuthAttempts(emailHash: string): Promise<{ unlockToken: string } | null> {
  const snap = await admin.firestore().collection('auth_attempts').doc(emailHash).get();
  if (!snap.exists) return null;
  return snap.data() as { unlockToken: string };
}

import { createHash } from 'node:crypto';
const emailHash = (email: string) =>
  createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
```

`firebase-admin` should already be a workspace dependency (used by `libs/api-firebase`). Confirm:

```bash
pnpm list firebase-admin
```

If absent, run `pnpm add firebase-admin` and commit `package.json` + lockfile separately.

- [ ] **Step 2: Add the lockout flow test**

```ts
test('lockout flow: 3 wrong passwords → 423 → unlock token works → login succeeds', async ({ request }) => {
  const email = uniqueEmail();
  const password = 'Aa1!aaaaaaaa';
  const reg = await request.post(`${API_BASE}/auth/register`, {
    data: { email, password, displayName: 'Locker' },
  });
  expect(reg.status()).toBe(201);
  await markEmailVerified((await reg.json()).uid);

  for (let i = 0; i < 2; i++) {
    const r = await request.post(`${API_BASE}/auth/login`, {
      data: { email, password: 'wrong-1!aaaaaaa' },
    });
    expect(r.status()).toBe(401);
    expect((await r.json()).error.code).toBe('INVALID_CREDENTIALS');
  }

  const third = await request.post(`${API_BASE}/auth/login`, {
    data: { email, password: 'wrong-1!aaaaaaa' },
  });
  expect(third.status()).toBe(423);
  expect((await third.json()).error.code).toBe('ACCOUNT_LOCKED');

  const attempt = await request.post(`${API_BASE}/auth/login`, {
    data: { email, password },
  });
  expect(attempt.status()).toBe(423);

  const stored = await readAuthAttempts(emailHash(email));
  expect(stored?.unlockToken).toBeTruthy();

  const unlock = await request.post(`${API_BASE}/auth/unlock`, {
    data: { token: stored!.unlockToken },
  });
  expect(unlock.status()).toBe(204);

  const ok = await request.post(`${API_BASE}/auth/login`, { data: { email, password } });
  expect(ok.status()).toBe(200);
});
```

- [ ] **Step 3: Add the verification-gate test**

```ts
test('verification gate: unverified login → 403 → flip emailVerified → 200', async ({ request }) => {
  const email = uniqueEmail();
  const password = 'Aa1!aaaaaaaa';
  const reg = await request.post(`${API_BASE}/auth/register`, {
    data: { email, password, displayName: 'Gated' },
  });
  expect(reg.status()).toBe(201);

  const blocked = await request.post(`${API_BASE}/auth/login`, { data: { email, password } });
  expect(blocked.status()).toBe(403);
  expect((await blocked.json()).error.code).toBe('EMAIL_NOT_VERIFIED');

  await markEmailVerified((await reg.json()).uid);

  const ok = await request.post(`${API_BASE}/auth/login`, { data: { email, password } });
  expect(ok.status()).toBe(200);
});
```

- [ ] **Step 4: Add the resend-throttle test**

```ts
test('resend-verification throttle: second call within 60s returns 429', async ({ request }) => {
  const email = uniqueEmail();
  const reg = await request.post(`${API_BASE}/auth/register`, {
    data: { email, password: 'Aa1!aaaaaaaa', displayName: 'R' },
  });
  expect(reg.status()).toBe(201);

  const first = await request.post(`${API_BASE}/auth/resend-verification`, { data: { email } });
  expect(first.status()).toBe(202);

  const second = await request.post(`${API_BASE}/auth/resend-verification`, { data: { email } });
  expect(second.status()).toBe(429);
});
```

- [ ] **Step 5: Add the password-reset request test**

```ts
test('password-reset request: returns 202 for any email', async ({ request }) => {
  const email = uniqueEmail();
  const reg = await request.post(`${API_BASE}/auth/register`, {
    data: { email, password: 'Aa1!aaaaaaaa', displayName: 'Reset' },
  });
  expect(reg.status()).toBe(201);

  const real = await request.post(`${API_BASE}/auth/request-password-reset`, { data: { email } });
  expect(real.status()).toBe(202);

  const ghost = await request.post(`${API_BASE}/auth/request-password-reset`, {
    data: { email: 'nobody-' + email },
  });
  expect(ghost.status()).toBe(202);
});
```

- [ ] **Step 6: Add the reset-does-not-clear-lockout test**

```ts
test('reset request does NOT clear an active lockout', async ({ request }) => {
  const email = uniqueEmail();
  const password = 'Aa1!aaaaaaaa';
  const reg = await request.post(`${API_BASE}/auth/register`, {
    data: { email, password, displayName: 'L+R' },
  });
  expect(reg.status()).toBe(201);
  await markEmailVerified((await reg.json()).uid);

  for (let i = 0; i < 3; i++) {
    await request.post(`${API_BASE}/auth/login`, {
      data: { email, password: 'wrong-1!aaaaaaa' },
    });
  }

  const reset = await request.post(`${API_BASE}/auth/request-password-reset`, { data: { email } });
  expect(reset.status()).toBe(202);

  const stillLocked = await request.post(`${API_BASE}/auth/login`, { data: { email, password } });
  expect(stillLocked.status()).toBe(423);
});
```

- [ ] **Step 7: Add the enumeration-resistance test**

```ts
test('enumeration resistance: ghost email and unverified email yield identical login responses', async ({ request }) => {
  const ghost = await request.post(`${API_BASE}/auth/login`, {
    data: { email: 'ghost-' + uniqueEmail(), password: 'Aa1!aaaaaaaa' },
  });
  expect(ghost.status()).toBe(401);
  expect((await ghost.json()).error.code).toBe('INVALID_CREDENTIALS');

  // An unverified extant user with a wrong password also reports INVALID_CREDENTIALS
  // (the verification gate is checked AFTER the password is verified correct).
  const realEmail = uniqueEmail();
  const reg = await request.post(`${API_BASE}/auth/register`, {
    data: { email: realEmail, password: 'Aa1!aaaaaaaa', displayName: 'X' },
  });
  expect(reg.status()).toBe(201);
  const wrong = await request.post(`${API_BASE}/auth/login`, {
    data: { email: realEmail, password: 'definitely-Wrong-1!' },
  });
  expect(wrong.status()).toBe(401);
  expect((await wrong.json()).error.code).toBe('INVALID_CREDENTIALS');
});
```

- [ ] **Step 8: Run all e2e auth tests**

```bash
pnpm emulators
# new terminal
pnpm secrets:render
pnpm nx run api-e2e:e2e -- --grep "auth"
```

Expected: all PASS. The lockout test creates an `auth_attempts/{emailHash}` doc — verify it's cleaned up after the test by re-running and ensuring the assertions on counter increments still pass (each test uses a fresh `uniqueEmail()`).

- [ ] **Step 9: Commit**

```bash
git add apps/api-e2e/src/auth.e2e-spec.ts
git commit -m "test(api-e2e): lockout, verification gate, throttle, reset, enumeration tests"
```

---

## Task 20: Refactor the web `AuthService` (remove Firebase SDK)

**Files:**
- Modify: `libs/web-auth/src/lib/auth.service.ts`
- Modify: `libs/web-auth/src/lib/auth.service.spec.ts`

After this task, the web `AuthService` posts to the API for login / register / logout and uses no Firebase client. The signal contract (`currentUser`, `isAuthenticated`) is unchanged.

- [ ] **Step 1: Write failing tests against `HttpTestingController`**

Replace `libs/web-auth/src/lib/auth.service.spec.ts` with:

```ts
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach } from 'vitest';

import { AuthService } from './auth.service';

const baseUser = {
  uid: 'u-1',
  email: 'a@b.c',
  displayName: 'A',
  role: 'STUDENT' as const,
  emailVerified: true,
};

describe('AuthService.login', () => {
  let svc: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  it('happy path: posts /auth/login, sets currentUser, returns ok', async () => {
    const promise = svc.login('a@b.c', 'pw');
    const req = httpMock.expectOne({ method: 'POST', url: '/api/auth/login' });
    expect(req.request.body).toEqual({ email: 'a@b.c', password: 'pw' });
    req.flush({ uid: 'u-1', role: 'STUDENT', displayName: 'A', emailVerified: true });
    // currentUser refresh is via /auth/me
    const me = httpMock.expectOne({ method: 'GET', url: '/api/auth/me' });
    me.flush(baseUser);
    const result = await promise;
    expect(result).toEqual({ ok: true });
    expect(svc.currentUser()).toEqual(baseUser);
  });

  it('returns ok=false with code on 401', async () => {
    const promise = svc.login('a@b.c', 'pw');
    const req = httpMock.expectOne({ method: 'POST', url: '/api/auth/login' });
    req.flush({ error: { code: 'INVALID_CREDENTIALS' } }, { status: 401, statusText: 'Unauthorized' });
    const result = await promise;
    expect(result).toEqual({ ok: false, code: 'INVALID_CREDENTIALS' });
    expect(svc.currentUser()).toBeNull();
  });

  it('returns ok=false with EMAIL_NOT_VERIFIED on 403', async () => {
    const promise = svc.login('a@b.c', 'pw');
    httpMock.expectOne('/api/auth/login').flush(
      { error: { code: 'EMAIL_NOT_VERIFIED', details: { resendAvailable: true } } },
      { status: 403, statusText: 'Forbidden' },
    );
    expect(await promise).toEqual({
      ok: false,
      code: 'EMAIL_NOT_VERIFIED',
      details: { resendAvailable: true },
    });
  });

  it('returns ok=false with ACCOUNT_LOCKED on 423', async () => {
    const promise = svc.login('a@b.c', 'pw');
    httpMock.expectOne('/api/auth/login').flush(
      {
        error: {
          code: 'ACCOUNT_LOCKED',
          details: { unlockAvailableAt: '2026-05-06T01:00:00.000Z' },
        },
      },
      { status: 423, statusText: 'Locked' },
    );
    expect(await promise).toEqual({
      ok: false,
      code: 'ACCOUNT_LOCKED',
      details: { unlockAvailableAt: '2026-05-06T01:00:00.000Z' },
    });
  });
});

describe('AuthService.register', () => {
  let svc: AuthService;
  let httpMock: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  it('happy path: posts /auth/register, then refreshes currentUser via /auth/me', async () => {
    const promise = svc.register({ email: 'a@b.c', password: 'pw', displayName: 'A' });
    httpMock.expectOne('/api/auth/register').flush({
      uid: 'u-1',
      email: 'a@b.c',
      role: 'STUDENT',
      emailVerified: false,
    });
    httpMock.expectOne('/api/auth/me').flush({ ...baseUser, emailVerified: false });
    expect(await promise).toEqual({ ok: true });
    expect(svc.currentUser()?.emailVerified).toBe(false);
  });
});

describe('AuthService.resendVerification / requestPasswordReset / unlock', () => {
  let svc: AuthService;
  let httpMock: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  it('resendVerification posts to /auth/resend-verification', async () => {
    const promise = svc.resendVerification('a@b.c');
    const req = httpMock.expectOne('/api/auth/resend-verification');
    expect(req.request.body).toEqual({ email: 'a@b.c' });
    req.flush(null, { status: 202, statusText: 'Accepted' });
    await promise;
  });

  it('requestPasswordReset posts to /auth/request-password-reset', async () => {
    const promise = svc.requestPasswordReset('a@b.c');
    const req = httpMock.expectOne('/api/auth/request-password-reset');
    expect(req.request.body).toEqual({ email: 'a@b.c' });
    req.flush(null, { status: 202, statusText: 'Accepted' });
    await promise;
  });

  it('unlock posts to /auth/unlock and returns ok on 204', async () => {
    const promise = svc.unlock('TOK');
    const req = httpMock.expectOne('/api/auth/unlock');
    expect(req.request.body).toEqual({ token: 'TOK' });
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(await promise).toEqual({ ok: true });
  });

  it('unlock returns ok=false with INVALID_UNLOCK_TOKEN on 400', async () => {
    const promise = svc.unlock('BAD');
    httpMock
      .expectOne('/api/auth/unlock')
      .flush({ error: { code: 'INVALID_UNLOCK_TOKEN' } }, { status: 400, statusText: 'Bad Request' });
    expect(await promise).toEqual({ ok: false, code: 'INVALID_UNLOCK_TOKEN' });
  });

  it('unlock returns ok=false with UNLOCK_TOKEN_EXPIRED on 410', async () => {
    const promise = svc.unlock('OLD');
    httpMock
      .expectOne('/api/auth/unlock')
      .flush({ error: { code: 'UNLOCK_TOKEN_EXPIRED' } }, { status: 410, statusText: 'Gone' });
    expect(await promise).toEqual({ ok: false, code: 'UNLOCK_TOKEN_EXPIRED' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm nx test web-auth -- --run auth.service
```

Expected: FAIL — methods missing or call shape wrong.

- [ ] **Step 3: Replace `auth.service.ts`**

Overwrite `libs/web-auth/src/lib/auth.service.ts` with:

```ts
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { AuthenticatedUser } from './types/authenticated-user';
import type { ApiAuthErrorBody, ApiAuthErrorCode } from './types/api-error';

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
}

export type LoginErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_NOT_VERIFIED'
  | 'ACCOUNT_LOCKED'
  | 'WEAK_PASSWORD'
  | 'EMAIL_ALREADY_EXISTS'
  | 'INTERNAL';

export type LoginResult =
  | { ok: true }
  | { ok: false; code: LoginErrorCode; details?: Record<string, unknown> };

export type UnlockResult =
  | { ok: true }
  | { ok: false; code: 'INVALID_UNLOCK_TOKEN' | 'UNLOCK_TOKEN_EXPIRED' | 'INTERNAL' };

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly currentUserSignal = signal<AuthenticatedUser | null | undefined>(undefined);

  readonly currentUser: Signal<AuthenticatedUser | null | undefined> =
    this.currentUserSignal.asReadonly();
  readonly isAuthenticated = computed(() => Boolean(this.currentUserSignal()));

  async register(input: RegisterInput): Promise<LoginResult> {
    try {
      await firstValueFrom(this.http.post('/api/auth/register', input));
      await this.refresh();
      return { ok: true };
    } catch (err) {
      return this.toLoginErr(err);
    }
  }

  async login(email: string, password: string): Promise<LoginResult> {
    try {
      await firstValueFrom(this.http.post('/api/auth/login', { email, password }));
      await this.refresh();
      return { ok: true };
    } catch (err) {
      return this.toLoginErr(err);
    }
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post('/api/auth/logout', {}));
    } catch {
      // Server-side cookie clear is best-effort; we still clear local state.
    }
    this.currentUserSignal.set(null);
  }

  async refresh(): Promise<void> {
    try {
      const me = await firstValueFrom(
        this.http.get<AuthenticatedUser>('/api/auth/me'),
      );
      this.currentUserSignal.set(me);
    } catch (err) {
      if (this.isHttpStatus(err, 401)) {
        this.currentUserSignal.set(null);
        return;
      }
      throw err;
    }
  }

  async resendVerification(email: string): Promise<void> {
    await firstValueFrom(this.http.post('/api/auth/resend-verification', { email }));
  }

  async requestPasswordReset(email: string): Promise<void> {
    await firstValueFrom(this.http.post('/api/auth/request-password-reset', { email }));
  }

  async unlock(token: string): Promise<UnlockResult> {
    try {
      await firstValueFrom(this.http.post('/api/auth/unlock', { token }));
      return { ok: true };
    } catch (err) {
      if (err instanceof HttpErrorResponse) {
        const code = (err.error as ApiAuthErrorBody | undefined)?.error?.code;
        if (code === 'INVALID_UNLOCK_TOKEN' || code === 'UNLOCK_TOKEN_EXPIRED') {
          return { ok: false, code };
        }
      }
      return { ok: false, code: 'INTERNAL' };
    }
  }

  private toLoginErr(err: unknown): LoginResult {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as ApiAuthErrorBody | undefined;
      const code = body?.error?.code;
      if (
        code === 'INVALID_CREDENTIALS' ||
        code === 'EMAIL_NOT_VERIFIED' ||
        code === 'ACCOUNT_LOCKED' ||
        code === 'WEAK_PASSWORD' ||
        code === 'EMAIL_ALREADY_EXISTS'
      ) {
        return { ok: false, code, details: body?.error?.details };
      }
    }
    return { ok: false, code: 'INTERNAL' };
  }

  private isHttpStatus(err: unknown, status: number): boolean {
    return err instanceof HttpErrorResponse && err.status === status;
  }
}
```

- [ ] **Step 4: Update the `ApiAuthErrorCode` union if it constrains values**

Open `libs/web-auth/src/lib/types/api-error.ts`. If it lists codes, append:

```ts
| 'INVALID_CREDENTIALS'
| 'EMAIL_NOT_VERIFIED'
| 'ACCOUNT_LOCKED'
| 'TOO_MANY_REQUESTS'
| 'INVALID_UNLOCK_TOKEN'
| 'UNLOCK_TOKEN_EXPIRED'
```

If it's a free-form `string`, no change needed.

- [ ] **Step 5: Run the tests to verify they pass**

Run:

```bash
pnpm nx test web-auth -- --run auth.service
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/web-auth/src/lib/auth.service.ts \
        libs/web-auth/src/lib/auth.service.spec.ts \
        libs/web-auth/src/lib/types/api-error.ts
git commit -m "refactor(web-auth): API-mediated AuthService — no Firebase SDK"
```

---

## Task 21: Update `LoginPageComponent`

**Files:**
- Modify: `libs/web-auth/src/lib/login-page/login-page.component.ts`
- Modify: `libs/web-auth/src/lib/login-page/login-page.component.html`
- Modify: `libs/web-auth/src/lib/login-page/login-page.component.spec.ts`

- [ ] **Step 1: Replace the component class**

Overwrite `libs/web-auth/src/lib/login-page/login-page.component.ts`:

```ts
import { Component, computed, inject, signal } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';

import { AuthService } from '../auth.service';

type LoginErrorState =
  | { kind: 'none' }
  | { kind: 'invalid' }
  | { kind: 'unverified'; resendSent: boolean }
  | { kind: 'locked'; unlockAvailableAt: string }
  | { kind: 'generic'; message: string };

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login-page.component.html',
})
export class LoginPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  readonly busy = signal(false);
  readonly errorState = signal<LoginErrorState>({ kind: 'none' });

  private readonly queryParams = toSignal(this.route.queryParamMap);

  readonly justResetPassword = computed(() => this.queryParams()?.get('reset') === 'ok');

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.busy.set(true);
    this.errorState.set({ kind: 'none' });
    try {
      const result = await this.auth.login(
        this.form.controls.email.value,
        this.form.controls.password.value,
      );
      if (result.ok) {
        await this.router.navigateByUrl('/dashboard');
        return;
      }
      this.errorState.set(this.toErrorState(result));
    } finally {
      this.busy.set(false);
    }
  }

  async resendVerification(): Promise<void> {
    const email = this.form.controls.email.value;
    if (!email) return;
    try {
      await this.auth.resendVerification(email);
      this.errorState.set({ kind: 'unverified', resendSent: true });
    } catch {
      this.errorState.set({ kind: 'generic', message: 'Could not send. Please try again.' });
    }
  }

  unlockAvailableAtLocal(iso: string): string {
    return new Date(iso).toLocaleTimeString();
  }

  private toErrorState(result: Extract<Awaited<ReturnType<AuthService['login']>>, { ok: false }>): LoginErrorState {
    if (result.code === 'INVALID_CREDENTIALS') return { kind: 'invalid' };
    if (result.code === 'EMAIL_NOT_VERIFIED') return { kind: 'unverified', resendSent: false };
    if (result.code === 'ACCOUNT_LOCKED') {
      const unlockAvailableAt = String(
        (result.details as { unlockAvailableAt?: string } | undefined)?.unlockAvailableAt ?? '',
      );
      return { kind: 'locked', unlockAvailableAt };
    }
    return { kind: 'generic', message: 'Something went wrong. Please try again.' };
  }
}
```

- [ ] **Step 2: Replace the template**

Overwrite `libs/web-auth/src/lib/login-page/login-page.component.html`:

```html
<section class="mx-auto mt-12 max-w-md rounded border border-slate-200 bg-white p-6">
  <h1 class="text-xl font-semibold mb-4">Sign in</h1>
  <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-3">
    <label class="block">
      <span class="text-sm font-medium">Email</span>
      <input
        type="email"
        formControlName="email"
        autocomplete="email"
        class="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
        required
      />
    </label>

    <label class="block">
      <span class="text-sm font-medium">Password</span>
      <input
        type="password"
        formControlName="password"
        autocomplete="current-password"
        class="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
        required
      />
    </label>

    @switch (errorState().kind) {
      @case ('invalid') {
        <p class="text-sm text-red-700" role="alert">Invalid email or password.</p>
      }
      @case ('unverified') {
        <div role="alert" class="space-y-1">
          <p class="text-sm text-red-700">
            Please verify your email address before logging in.
          </p>
          @if (errorState().resendSent) {
            <p class="text-sm text-emerald-700">Verification email sent. Check your inbox.</p>
          } @else {
            <button
              type="button"
              class="text-sm text-blue-700 underline"
              (click)="resendVerification()"
            >
              Resend verification email
            </button>
          }
        </div>
      }
      @case ('locked') {
        <div role="alert" class="space-y-1">
          <p class="text-sm text-red-700">
            Your account is temporarily locked. Try again at
            {{ unlockAvailableAtLocal(errorState().unlockAvailableAt) }},
            or check your email to unlock now.
          </p>
          @if (justResetPassword()) {
            <p class="text-sm text-amber-700">
              If you've just reset your password, use the unlock link in your
              "account locked" email or wait until
              {{ unlockAvailableAtLocal(errorState().unlockAvailableAt) }}.
            </p>
          }
        </div>
      }
      @case ('generic') {
        <p class="text-sm text-red-700" role="alert">{{ errorState().message }}</p>
      }
    }

    <button
      type="submit"
      class="w-full rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      [disabled]="form.invalid || busy()"
    >
      @if (busy()) { Signing in… } @else { Sign in }
    </button>
  </form>

  <p class="mt-4 text-sm text-slate-700">
    <a routerLink="/forgot-password" class="text-blue-700 underline">Forgot password?</a>
  </p>

  <p class="mt-2 text-sm text-slate-700">
    No account? <a routerLink="/register" class="text-blue-700 underline">Register</a>
  </p>
</section>
```

- [ ] **Step 3: Update the component spec**

Replace `libs/web-auth/src/lib/login-page/login-page.component.spec.ts` with:

```ts
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';

import { LoginPageComponent } from './login-page.component';

function setup(queryParamMap: Map<string, string> = new Map()) {
  TestBed.configureTestingModule({
    imports: [LoginPageComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { queryParamMap: of({ get: (k: string) => queryParamMap.get(k) ?? null }) } },
    ],
  });
  const fixture = TestBed.createComponent(LoginPageComponent);
  fixture.detectChanges();
  return {
    fixture,
    httpMock: TestBed.inject(HttpTestingController),
  };
}

describe('LoginPageComponent error states', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders "Invalid email or password" on 401', async () => {
    const { fixture, httpMock } = setup();
    const cmp = fixture.componentInstance;
    cmp.form.setValue({ email: 'a@b.c', password: 'pw' });
    const submitPromise = cmp.submit();
    httpMock.expectOne('/api/auth/login').flush(
      { error: { code: 'INVALID_CREDENTIALS' } },
      { status: 401, statusText: 'Unauthorized' },
    );
    await submitPromise;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Invalid email or password.');
  });

  it('renders the resend affordance on 403 EMAIL_NOT_VERIFIED', async () => {
    const { fixture, httpMock } = setup();
    const cmp = fixture.componentInstance;
    cmp.form.setValue({ email: 'a@b.c', password: 'pw' });
    const submitPromise = cmp.submit();
    httpMock.expectOne('/api/auth/login').flush(
      { error: { code: 'EMAIL_NOT_VERIFIED', details: { resendAvailable: true } } },
      { status: 403, statusText: 'Forbidden' },
    );
    await submitPromise;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      'Please verify your email address',
    );
    expect(fixture.nativeElement.textContent).toContain('Resend verification email');
  });

  it('renders the lockout time on 423 ACCOUNT_LOCKED', async () => {
    const { fixture, httpMock } = setup();
    const cmp = fixture.componentInstance;
    cmp.form.setValue({ email: 'a@b.c', password: 'pw' });
    const submitPromise = cmp.submit();
    const unlockAvailableAt = new Date('2026-05-06T01:00:00.000Z').toISOString();
    httpMock.expectOne('/api/auth/login').flush(
      { error: { code: 'ACCOUNT_LOCKED', details: { unlockAvailableAt } } },
      { status: 423, statusText: 'Locked' },
    );
    await submitPromise;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('temporarily locked');
  });

  it('shows the just-reset hint when ?reset=ok and lockout fires', async () => {
    const { fixture, httpMock } = setup(new Map([['reset', 'ok']]));
    const cmp = fixture.componentInstance;
    cmp.form.setValue({ email: 'a@b.c', password: 'pw' });
    const submitPromise = cmp.submit();
    httpMock.expectOne('/api/auth/login').flush(
      {
        error: {
          code: 'ACCOUNT_LOCKED',
          details: { unlockAvailableAt: '2026-05-06T01:00:00.000Z' },
        },
      },
      { status: 423, statusText: 'Locked' },
    );
    await submitPromise;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("just reset your password");
  });
});
```

- [ ] **Step 4: Run the tests**

Run:

```bash
pnpm nx test web-auth -- --run login-page
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/web-auth/src/lib/login-page/
git commit -m "feat(web-auth): login page handles unverified, locked, just-reset states"
```

---

## Task 22: `RegisterConfirmPageComponent`

**Files:**
- Create: `libs/web-auth/src/lib/register-confirm-page/register-confirm-page.component.ts`
- Create: `libs/web-auth/src/lib/register-confirm-page/register-confirm-page.component.html`
- Create: `libs/web-auth/src/lib/register-confirm-page/register-confirm-page.component.spec.ts`

After registration the user lands here with `?email=...` in the query string. The page shows a "check your email" confirmation, a Resend button, and a "Continue to dashboard" link (since the session cookie is already set, they can proceed even though they're unverified).

- [ ] **Step 1: Create the component class**

```ts
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';

import { AuthService } from '../auth.service';

@Component({
  selector: 'app-register-confirm-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './register-confirm-page.component.html',
})
export class RegisterConfirmPageComponent {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  readonly busy = signal(false);
  readonly resentAt = signal<Date | null>(null);

  private readonly queryParams = toSignal(this.route.queryParamMap);
  readonly email = computed(() => this.queryParams()?.get('email') ?? '');

  readonly cooldownActive = computed(() => {
    const last = this.resentAt();
    if (!last) return false;
    return Date.now() - last.getTime() < 60_000;
  });

  async resend(): Promise<void> {
    const email = this.email();
    if (!email || this.cooldownActive()) return;
    this.busy.set(true);
    try {
      await this.auth.resendVerification(email);
      this.resentAt.set(new Date());
    } finally {
      this.busy.set(false);
    }
  }
}
```

- [ ] **Step 2: Create the template**

```html
<section class="mx-auto mt-12 max-w-md rounded border border-slate-200 bg-white p-6 space-y-3">
  <h1 class="text-xl font-semibold">Check your email</h1>
  <p class="text-sm text-slate-700">
    We sent a verification email
    @if (email()) { to <strong>{{ email() }}</strong> }
    . Click the link in that email to verify your address.
  </p>

  @if (resentAt()) {
    <p class="text-sm text-emerald-700">Verification email sent.</p>
  }

  <button
    type="button"
    class="rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50"
    [disabled]="busy() || cooldownActive() || !email()"
    (click)="resend()"
  >
    @if (busy()) { Sending… } @else { Didn't get the email? Resend }
  </button>

  <p class="text-sm text-slate-700">
    <a routerLink="/dashboard" class="text-blue-700 underline">Continue to dashboard</a>
  </p>
</section>
```

- [ ] **Step 3: Create the spec**

```ts
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { describe, expect, it, beforeEach } from 'vitest';
import { of } from 'rxjs';

import { RegisterConfirmPageComponent } from './register-confirm-page.component';

function setup(email = 'a@b.c') {
  TestBed.configureTestingModule({
    imports: [RegisterConfirmPageComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { queryParamMap: of({ get: (k: string) => (k === 'email' ? email : null) }) },
      },
    ],
  });
  const fixture = TestBed.createComponent(RegisterConfirmPageComponent);
  fixture.detectChanges();
  return { fixture, httpMock: TestBed.inject(HttpTestingController) };
}

describe('RegisterConfirmPageComponent', () => {
  beforeEach(() => undefined);

  it('renders the confirmation prose with the email from the query', () => {
    const { fixture } = setup('alice@example.com');
    expect(fixture.nativeElement.textContent).toContain('alice@example.com');
  });

  it('Resend posts to /auth/resend-verification', async () => {
    const { fixture, httpMock } = setup();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    button.click();
    const req = httpMock.expectOne('/api/auth/resend-verification');
    expect(req.request.body).toEqual({ email: 'a@b.c' });
    req.flush(null, { status: 202, statusText: 'Accepted' });
    await Promise.resolve();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Verification email sent');
  });
});
```

- [ ] **Step 4: Run the tests**

```bash
pnpm nx test web-auth -- --run register-confirm-page
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/web-auth/src/lib/register-confirm-page/
git commit -m "feat(web-auth): RegisterConfirmPageComponent with resend cooldown"
```

---

## Task 23: Update `RegisterPageComponent` to redirect to `/register/confirm`

**Files:**
- Modify: `libs/web-auth/src/lib/register-page/register-page.component.ts`
- Modify: `libs/web-auth/src/lib/register-page/register-page.component.spec.ts`

- [ ] **Step 1: Update the navigation target**

In `libs/web-auth/src/lib/register-page/register-page.component.ts`, change the success branch of `submit`:

```ts
async submit(): Promise<void> {
  if (this.form.invalid) return;
  this.busy.set(true);
  this.error.set(null);
  try {
    const result = await this.auth.register(this.form.getRawValue());
    if (result.ok) {
      await this.router.navigateByUrl(
        `/register/confirm?email=${encodeURIComponent(this.form.controls.email.value)}`,
      );
      return;
    }
    this.error.set(this.toMessage(result));
  } finally {
    this.busy.set(false);
  }
}

private toMessage(
  result: Extract<Awaited<ReturnType<AuthService['register']>>, { ok: false }>,
): string {
  if (result.code === 'EMAIL_ALREADY_EXISTS') {
    return 'Unable to complete registration. Please check your details.';
  }
  if (result.code === 'WEAK_PASSWORD') {
    const unmet = (result.details as { unmetRequirements?: PolicyRequirement[] } | undefined)
      ?.unmetRequirements;
    if (unmet?.length) {
      const list = unmet.map((r) => REQUIREMENT_PROSE[r]).join('; ');
      return `Password must include: ${list}.`;
    }
  }
  return 'Something went wrong. Please try again.';
}
```

The old `toMessage(err: unknown)` signature changes. Remove the `HttpErrorResponse` import (no longer used) and the `ApiAuthErrorBody` import (the service result already carries the typed details).

- [ ] **Step 2: Update the existing spec**

The existing `register-page.component.spec.ts` likely asserts navigation to `/dashboard`. Find that assertion and update it to expect `/register/confirm?email=alice%40example.com`. Run:

```bash
grep -n "navigateByUrl\|/dashboard" libs/web-auth/src/lib/register-page/register-page.component.spec.ts
```

Adjust each match to `/register/confirm?email=...` (URL-encoded). Also adjust any test that mocked `signInWithEmailAndPassword` — that path no longer exists; mock the `/api/auth/register` POST instead.

- [ ] **Step 3: Run the tests**

```bash
pnpm nx test web-auth -- --run register-page
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add libs/web-auth/src/lib/register-page/
git commit -m "feat(web-auth): register page redirects to /register/confirm"
```

---

## Task 24: `ForgotPasswordPageComponent`

**Files:**
- Create: `libs/web-auth/src/lib/forgot-password-page/forgot-password-page.component.ts`
- Create: `libs/web-auth/src/lib/forgot-password-page/forgot-password-page.component.html`
- Create: `libs/web-auth/src/lib/forgot-password-page/forgot-password-page.component.spec.ts`

- [ ] **Step 1: Create the component**

```ts
import { Component, inject, signal } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AuthService } from '../auth.service';

@Component({
  selector: 'app-forgot-password-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './forgot-password-page.component.html',
})
export class ForgotPasswordPageComponent {
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  readonly busy = signal(false);
  readonly submitted = signal(false);

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.busy.set(true);
    try {
      await this.auth.requestPasswordReset(this.form.controls.email.value);
      this.submitted.set(true);
    } finally {
      this.busy.set(false);
    }
  }
}
```

- [ ] **Step 2: Create the template**

```html
<section class="mx-auto mt-12 max-w-md rounded border border-slate-200 bg-white p-6 space-y-3">
  <h1 class="text-xl font-semibold">Reset your password</h1>

  @if (submitted()) {
    <p class="text-sm text-slate-700">
      If an account exists for that address, we've sent reset instructions.
      Please check your inbox.
    </p>
    <p class="text-sm">
      <a routerLink="/login" class="text-blue-700 underline">Back to sign in</a>
    </p>
  } @else {
    <p class="text-sm text-slate-700">
      Enter your email and we'll send you a link to set a new password.
    </p>
    <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-3">
      <label class="block">
        <span class="text-sm font-medium">Email</span>
        <input
          type="email"
          formControlName="email"
          autocomplete="email"
          class="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
          required
        />
      </label>
      <button
        type="submit"
        class="w-full rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        [disabled]="form.invalid || busy()"
      >
        @if (busy()) { Sending… } @else { Send reset email }
      </button>
    </form>
    <p class="text-sm">
      <a routerLink="/login" class="text-blue-700 underline">Cancel</a>
    </p>
  }
</section>
```

- [ ] **Step 3: Create the spec**

```ts
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { ForgotPasswordPageComponent } from './forgot-password-page.component';

function setup() {
  TestBed.configureTestingModule({
    imports: [ForgotPasswordPageComponent],
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  const fixture = TestBed.createComponent(ForgotPasswordPageComponent);
  fixture.detectChanges();
  return { fixture, httpMock: TestBed.inject(HttpTestingController) };
}

describe('ForgotPasswordPageComponent', () => {
  it('posts to /auth/request-password-reset and shows the generic confirmation', async () => {
    const { fixture, httpMock } = setup();
    fixture.componentInstance.form.setValue({ email: 'a@b.c' });
    const submitPromise = fixture.componentInstance.submit();
    const req = httpMock.expectOne('/api/auth/request-password-reset');
    expect(req.request.body).toEqual({ email: 'a@b.c' });
    req.flush(null, { status: 202, statusText: 'Accepted' });
    await submitPromise;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('If an account exists');
  });

  it('still shows the generic confirmation on a network error', async () => {
    const { fixture, httpMock } = setup();
    fixture.componentInstance.form.setValue({ email: 'a@b.c' });
    const submitPromise = fixture.componentInstance.submit();
    httpMock
      .expectOne('/api/auth/request-password-reset')
      .flush({ error: { code: 'INTERNAL' } }, { status: 500, statusText: 'Server Error' });
    await submitPromise.catch(() => undefined);
    fixture.detectChanges();
    // The component does not surface the error code (enumeration resistance);
    // it shows the same confirmation regardless.
    expect(fixture.nativeElement.textContent).toContain(
      'If an account exists',
    );
  });
});
```

The second test will pass because we always set `submitted.set(true)` *after* `await this.auth.requestPasswordReset(...)`. If that throws, `submitted` stays false. **This contradicts the enumeration-resistance prose** — fix the component:

In the component class, change `submit()`:

```ts
async submit(): Promise<void> {
  if (this.form.invalid) return;
  this.busy.set(true);
  try {
    await this.auth.requestPasswordReset(this.form.controls.email.value).catch(() => undefined);
  } finally {
    this.busy.set(false);
    this.submitted.set(true);
  }
}
```

The `.catch(() => undefined)` swallows transport errors so the UI surface is identical regardless. Network failures are silent at the UI level; logs and metrics surface them server-side.

- [ ] **Step 4: Run the tests**

```bash
pnpm nx test web-auth -- --run forgot-password-page
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/web-auth/src/lib/forgot-password-page/
git commit -m "feat(web-auth): ForgotPasswordPageComponent with enumeration-resistant UI"
```

---

## Task 25: `UnlockPageComponent`

**Files:**
- Create: `libs/web-auth/src/lib/unlock-page/unlock-page.component.ts`
- Create: `libs/web-auth/src/lib/unlock-page/unlock-page.component.html`
- Create: `libs/web-auth/src/lib/unlock-page/unlock-page.component.spec.ts`

- [ ] **Step 1: Create the component**

```ts
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { AuthService, type UnlockResult } from '../auth.service';

type UnlockState =
  | { kind: 'pending' }
  | { kind: 'ok' }
  | { kind: 'expired' }
  | { kind: 'invalid' }
  | { kind: 'error' };

@Component({
  selector: 'app-unlock-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './unlock-page.component.html',
})
export class UnlockPageComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  readonly state = signal<UnlockState>({ kind: 'pending' });

  async ngOnInit(): Promise<void> {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.state.set({ kind: 'invalid' });
      return;
    }
    const result = await this.auth.unlock(token);
    this.state.set(this.toState(result));
  }

  private toState(result: UnlockResult): UnlockState {
    if (result.ok) return { kind: 'ok' };
    if (result.code === 'UNLOCK_TOKEN_EXPIRED') return { kind: 'expired' };
    if (result.code === 'INVALID_UNLOCK_TOKEN') return { kind: 'invalid' };
    return { kind: 'error' };
  }
}
```

- [ ] **Step 2: Create the template**

```html
<section class="mx-auto mt-12 max-w-md rounded border border-slate-200 bg-white p-6 space-y-3">
  @switch (state().kind) {
    @case ('pending') {
      <p class="text-sm text-slate-700">Unlocking your account…</p>
    }
    @case ('ok') {
      <h1 class="text-xl font-semibold">Account unlocked</h1>
      <p class="text-sm text-slate-700">You can sign in now.</p>
      <p>
        <a routerLink="/login" class="text-blue-700 underline">Continue to sign in</a>
      </p>
    }
    @case ('expired') {
      <h1 class="text-xl font-semibold">This unlock link has expired</h1>
      <p class="text-sm text-slate-700">
        You can reset your password to regain access.
      </p>
      <p>
        <a routerLink="/forgot-password" class="text-blue-700 underline">Reset password</a>
      </p>
    }
    @case ('invalid') {
      <h1 class="text-xl font-semibold">This unlock link is invalid</h1>
      <p>
        <a routerLink="/login" class="text-blue-700 underline">Back to sign in</a>
      </p>
    }
    @case ('error') {
      <p class="text-sm text-red-700" role="alert">
        Something went wrong. Please try again or
        <a routerLink="/forgot-password" class="text-blue-700 underline">reset your password</a>.
      </p>
    }
  }
</section>
```

- [ ] **Step 3: Create the spec**

```ts
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { UnlockPageComponent } from './unlock-page.component';

function setup(token: string | null) {
  TestBed.configureTestingModule({
    imports: [UnlockPageComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { queryParamMap: { get: (k: string) => (k === 'token' ? token : null) } },
        },
      },
    ],
  });
  return TestBed;
}

describe('UnlockPageComponent', () => {
  it('shows invalid state when token query param is missing', () => {
    setup(null).createComponent(UnlockPageComponent).detectChanges();
    const fixture = TestBed.createComponent(UnlockPageComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toMatch(/invalid/i);
  });

  it('shows ok state on 204', async () => {
    const tb = setup('GOOD');
    const fixture = tb.createComponent(UnlockPageComponent);
    fixture.detectChanges();
    const httpMock = tb.inject(HttpTestingController);
    httpMock.expectOne('/api/auth/unlock').flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Account unlocked');
  });

  it('shows expired state on 410', async () => {
    const tb = setup('OLD');
    const fixture = tb.createComponent(UnlockPageComponent);
    fixture.detectChanges();
    const httpMock = tb.inject(HttpTestingController);
    httpMock
      .expectOne('/api/auth/unlock')
      .flush({ error: { code: 'UNLOCK_TOKEN_EXPIRED' } }, { status: 410, statusText: 'Gone' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('expired');
  });
});
```

- [ ] **Step 4: Run the tests**

```bash
pnpm nx test web-auth -- --run unlock-page
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/web-auth/src/lib/unlock-page/
git commit -m "feat(web-auth): UnlockPageComponent for /auth/unlock?token=..."
```

---

## Task 26: Update `web-auth` library exports + app routes

**Files:**
- Modify: `libs/web-auth/src/index.ts`
- Modify: `apps/web/src/app/app.routes.ts`

- [ ] **Step 1: Export the new components**

Replace `libs/web-auth/src/index.ts` with:

```ts
export { AuthService, type LoginResult, type UnlockResult } from './lib/auth.service';
export { authGuard } from './lib/auth.guard';
export { withCredentialsInterceptor } from './lib/with-credentials.interceptor';
export { LoginPageComponent } from './lib/login-page/login-page.component';
export { RegisterPageComponent } from './lib/register-page/register-page.component';
export { RegisterConfirmPageComponent } from './lib/register-confirm-page/register-confirm-page.component';
export { ForgotPasswordPageComponent } from './lib/forgot-password-page/forgot-password-page.component';
export { UnlockPageComponent } from './lib/unlock-page/unlock-page.component';
export { passwordPolicyValidator } from './lib/password-policy.validator';
export type { AuthenticatedUser, WebUserRole } from './lib/types/authenticated-user';
export type { ApiAuthErrorBody, ApiAuthErrorCode } from './lib/types/api-error';
```

- [ ] **Step 2: Add routes to `apps/web/src/app/app.routes.ts`**

Replace the file contents with:

```ts
import { Route } from '@angular/router';

import { authGuard } from '@learnwren/web-auth';

export const appRoutes: Route[] = [
  {
    path: 'login',
    loadComponent: () =>
      import('@learnwren/web-auth').then((m) => m.LoginPageComponent),
  },
  {
    path: 'register',
    loadComponent: () =>
      import('@learnwren/web-auth').then((m) => m.RegisterPageComponent),
  },
  {
    path: 'register/confirm',
    loadComponent: () =>
      import('@learnwren/web-auth').then((m) => m.RegisterConfirmPageComponent),
  },
  {
    path: 'forgot-password',
    loadComponent: () =>
      import('@learnwren/web-auth').then((m) => m.ForgotPasswordPageComponent),
  },
  {
    path: 'auth/unlock',
    loadComponent: () =>
      import('@learnwren/web-auth').then((m) => m.UnlockPageComponent),
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  { path: '', pathMatch: 'full', redirectTo: '/login' },
];
```

- [ ] **Step 3: Verify build**

```bash
pnpm nx build web
```

Expected: PASS. Routes lazy-load correctly.

- [ ] **Step 4: Commit**

```bash
git add libs/web-auth/src/index.ts apps/web/src/app/app.routes.ts
git commit -m "feat(web): wire confirm + forgot-password + unlock routes"
```

---

## Task 27: Remove Firebase from the web bundle

**Files:**
- Modify: `apps/web/src/app/app.config.ts`
- Delete: `apps/web/src/environments/environment.ts`
- Delete: `apps/web/src/environments/firebase-target.ts`
- Delete: `apps/web/src/environments/firebase-target.spec.ts`
- Delete: `tools/web/build-environment.ts` (if exists)
- Modify: `package.json`
- Modify: `.env.tpl`

- [ ] **Step 1: Replace `app.config.ts` with the trimmed version**

```ts
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { AuthService, withCredentialsInterceptor } from '@learnwren/web-auth';

import { appRoutes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes),
    provideHttpClient(withInterceptors([withCredentialsInterceptor])),
    provideAppInitializer(async () => {
      const auth = inject(AuthService);
      try {
        await auth.refresh();
      } catch {
        // Bootstrap probe failed — leave currentUser as undefined.
      }
    }),
  ],
};
```

- [ ] **Step 2: Delete the environments files and the build script**

```bash
rm -rf apps/web/src/environments
rm -f tools/web/build-environment.ts
# Confirm the tools/web dir is now empty; if so, remove it.
[ -d tools/web ] && rmdir tools/web 2>/dev/null || true
```

If `apps/web/project.json` had a `generate-environment` target referencing the deleted script, remove the target:

```bash
grep -n "generate-environment\|build-environment" apps/web/project.json
```

If found, edit `apps/web/project.json` to remove the entire target stanza.

- [ ] **Step 3: Remove Firebase deps from `package.json`**

```bash
pnpm remove firebase @angular/fire
```

- [ ] **Step 4: Trim the `LEARNWREN_WEB_FIREBASE_*` lines from `.env.tpl`**

Open `.env.tpl`. Delete the entire `# ── Web SDK config (target=production) ──────────────────────` block (the six `LEARNWREN_WEB_FIREBASE_*` lines and their preamble). Keep the API-side and email-transport lines you added in Task 2.

Re-render:

```bash
pnpm secrets:render
```

Expected: PASS. The new `.env` no longer contains `LEARNWREN_WEB_FIREBASE_*` keys.

- [ ] **Step 5: Verify the web app still builds**

```bash
pnpm nx build web
```

Expected: PASS. Bundle should be measurably smaller; verify with `ls -lh dist/apps/web/browser/*.js | head` before-and-after. The drop should be ~80–120 KB compressed.

- [ ] **Step 6: Verify lint and typecheck across the workspace**

```bash
pnpm nx run-many -t lint typecheck
```

Expected: PASS. If any unused-import warning appears in `apps/web` (e.g., for now-orphan environment imports), remove the import line.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/app.config.ts \
        apps/web/src/environments \
        apps/web/project.json \
        tools/web \
        package.json pnpm-lock.yaml \
        .env.tpl
git commit -m "refactor(web): remove Firebase Auth client SDK and environments build"
```

(`git add` of deleted directories records the deletions if they were tracked.)

---

## Task 28: Migration script for unverified accounts

**Files:**
- Create: `tools/migrate-auth-2026-05-cleanup-unverified.ts`

- [ ] **Step 1: Write the script**

```ts
#!/usr/bin/env tsx
/**
 * tools/migrate-auth-2026-05-cleanup-unverified.ts
 *
 * Pre-deploy cleanup. Lists every Firebase Auth user with emailVerified=false,
 * and (if --confirm is passed) deletes the user and the matching users/{uid}
 * Firestore doc. Idempotent.
 *
 * Usage:
 *   tsx tools/migrate-auth-2026-05-cleanup-unverified.ts          # dry run, lists only
 *   tsx tools/migrate-auth-2026-05-cleanup-unverified.ts --confirm # deletes
 *
 * Requires: FIREBASE_SERVICE_ACCOUNT_JSON_PATH + LEARNWREN_API_FIREBASE_PROJECT_ID
 * for prod, or running against the emulator with FIREBASE_AUTH_EMULATOR_HOST +
 * FIRESTORE_EMULATOR_HOST exported.
 */

import * as admin from 'firebase-admin';

async function main(): Promise<void> {
  const confirm = process.argv.includes('--confirm');

  const projectId =
    process.env['LEARNWREN_API_FIREBASE_PROJECT_ID'] ?? 'demo-learnwren';
  const credentialPath = process.env['FIREBASE_SERVICE_ACCOUNT_JSON_PATH'];

  if (admin.apps.length === 0) {
    if (credentialPath) {
      admin.initializeApp({ projectId, credential: admin.credential.cert(credentialPath) });
    } else {
      admin.initializeApp({ projectId });
    }
  }

  const auth = admin.auth();
  const firestore = admin.firestore();

  const unverified: { uid: string; email: string }[] = [];
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const user of page.users) {
      if (!user.emailVerified) {
        unverified.push({ uid: user.uid, email: user.email ?? '(no email)' });
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);

  console.log(`[migrate] Found ${unverified.length} unverified user(s):`);
  for (const u of unverified) {
    console.log(`  - ${u.uid}  ${u.email}`);
  }

  if (!confirm) {
    console.log('\n[migrate] Dry run. Re-run with --confirm to delete.');
    return;
  }

  let deleted = 0;
  for (const u of unverified) {
    try {
      await auth.deleteUser(u.uid);
    } catch (err) {
      console.warn(`[migrate] auth.deleteUser ${u.uid} failed: ${String(err)}`);
    }
    try {
      await firestore.collection('users').doc(u.uid).delete();
    } catch (err) {
      console.warn(`[migrate] firestore users/${u.uid} delete failed: ${String(err)}`);
    }
    deleted += 1;
  }
  console.log(`[migrate] Deleted ${deleted} user(s).`);
}

main().catch((err) => {
  console.error('[migrate] fatal:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Smoke-test against the emulator**

```bash
pnpm emulators
# new terminal
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
pnpm exec tsx tools/migrate-auth-2026-05-cleanup-unverified.ts
```

Expected: prints "Found N unverified user(s)" (zero on a clean emulator). Re-run with `--confirm` to verify the deletion path; on a clean emulator this is a no-op.

- [ ] **Step 3: Commit**

```bash
git add tools/migrate-auth-2026-05-cleanup-unverified.ts
git commit -m "chore(tools): pre-deploy cleanup of unverified Firebase Auth users"
```

---

## Task 29: Documentation updates

**Files:**
- Modify: `README.md`
- Modify: `docs/development.md` (if exists) or create

- [ ] **Step 1: Update the README**

Read the current README:

```bash
sed -n '1,60p' README.md
```

Append a section under the auth slice's existing "Auth slice" section (or create one if absent):

```markdown
### Auth hardening (2026-05-06)

After the auth slice (registration + login), this slice adds:

- **Strict email-verification gate.** `/auth/login` returns `403 EMAIL_NOT_VERIFIED` until the user clicks the link in their verification email.
- **Brute-force lockout.** Three consecutive `INVALID_CREDENTIALS` failures lock the account for 15 minutes; the user gets an unlock email with a one-time link, or the lock auto-expires.
- **Logged-out password reset.** "Forgot password?" link on the login page; Firebase sends the templated reset email.
- **API-mediated login.** The Firebase Auth client SDK is no longer in the web bundle. `POST /auth/login` accepts `{ email, password }` and the server verifies credentials via Firebase's REST API.

The unlock email is the only one we send ourselves (via Nodemailer). Configure with `LEARNWREN_EMAIL_TRANSPORT=console|smtp` and the `SMTP_*` env vars when `smtp`.
```

- [ ] **Step 2: Update or create `docs/development.md`**

Add a section for running the hardening flows locally:

```markdown
## Auth hardening — local development

To exercise the lockout flow against the local emulator suite:

1. Start the emulators: `pnpm emulators`
2. In another terminal: `pnpm secrets:render && pnpm start`
3. Register a user via the UI at `http://localhost:4200/register`. Verify the user's email by clicking the link in the Auth emulator UI (`http://127.0.0.1:4000/auth`).
4. Trigger a lockout: enter the right email + wrong password three times on `/login`. The third attempt returns 423.
5. Check the API server logs for the unlock URL printed by `ConsoleEmailTransport`. Open it in a browser to land on `/auth/unlock?token=...`.

To switch to SMTP email transport, set `LEARNWREN_EMAIL_TRANSPORT=smtp` and configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` in `.env`.
```

- [ ] **Step 3: Commit**

```bash
git add README.md docs/development.md
git commit -m "docs: auth hardening — gate, lockout, reset, transport config"
```

---

## Task 30: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Lint and typecheck the workspace**

```bash
pnpm nx run-many -t lint typecheck
```

Expected: PASS for every project. Fix any issue inline before continuing.

- [ ] **Step 2: Unit tests across the workspace**

```bash
pnpm nx run-many -t test
```

Expected: PASS.

- [ ] **Step 3: Build everything**

```bash
pnpm nx run-many -t build
```

Expected: PASS. The web bundle should be smaller than before by ~80–120 KB compressed (Firebase SDK removal).

- [ ] **Step 4: e2e against the emulator suite**

```bash
pnpm emulators
# new terminal
pnpm secrets:render
pnpm e2e
```

Expected: PASS for both `web-e2e` and `api-e2e`. The api-e2e auth happy-path that was previously flaky should now pass deterministically.

- [ ] **Step 5: Manual checklist (spec §6.4)**

Open the dev environment (`pnpm start` against the emulator suite) and walk through each of the seven flows in spec §6.4:

1. Register → confirm email arrives → click verification link → log in.
2. Try to log in before verifying → confirm `EMAIL_NOT_VERIFIED` UI + Resend works.
3. Three wrong passwords → confirm `423` UI with sensible local time → confirm unlock email.
4. Click the unlock link → land on `/auth/unlock` → log in.
5. Lock again, fast-forward `lockedUntil` (or wait), log in via auto-expiry.
6. Click "Forgot password?" → submit → confirm reset email → click the link → confirm redirect to `/login?reset=ok` → log in with new password.
7. Trigger lockout, immediately request reset, attempt login → confirm `423` with the just-reset hint.

If any flow fails, file an issue and revisit the relevant task.

- [ ] **Step 6: Run the migration in dry-run mode against the production project**

When you're ready to deploy:

```bash
LEARNWREN_FIREBASE_TARGET=production \
LEARNWREN_API_FIREBASE_PROJECT_ID=learn-wren \
FIREBASE_SERVICE_ACCOUNT_JSON_PATH=/path/to/sa.json \
pnpm exec tsx tools/migrate-auth-2026-05-cleanup-unverified.ts
```

Review the printed list of unverified accounts. Re-run with `--confirm` only after you've verified each entry is a dev/test account. Production users (none yet) get re-registration parity, not deletion.

- [ ] **Step 7: Final commit (if anything was tweaked during verification)**

```bash
git status
# if anything to add:
git add ...
git commit -m "chore: post-verification cleanup"
```

---

## Done

All spec sections covered, all tasks committed, no placeholders, no TODOs.

The slice ships:

- `POST /auth/register`, `/auth/login`, `/auth/resend-verification`, `/auth/request-password-reset`, `/auth/unlock` — all API-mediated.
- `auth_attempts/{emailHash}` Firestore collection with deny-all client rules.
- `EmailTransport` with console + SMTP implementations, switchable by env var.
- Web `AuthService` posts to the API with no Firebase client; `firebase` and `@angular/fire` are removed from the web bundle.
- New components: `RegisterConfirmPageComponent`, `ForgotPasswordPageComponent`, `UnlockPageComponent`. Login page handles `INVALID_CREDENTIALS`, `EMAIL_NOT_VERIFIED` (with Resend), `ACCOUNT_LOCKED` (with optional just-reset hint).
- e2e coverage for lockout, verification gate, throttle, password reset, reset-doesn't-clear-lockout, enumeration resistance.
- Pre-deploy migration script for unverified accounts.

Next slice candidates: UC-01-03 (profile editing — relaxes `users/{uid}` write rule, adds password change while logged-in, email change with re-verification), UC-01-04 (instructor role request).

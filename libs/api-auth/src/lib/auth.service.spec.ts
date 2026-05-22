import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FIREBASE_AUTH, FIRESTORE } from '@learnwren/api-firebase';

import { AuthAttemptsRepository } from './auth-attempts.repository';
import { AuthService } from './auth.service';
import { EMAIL_TRANSPORT, type EmailTransport } from './email-transport/email-transport';
import { FirebaseAuthRestClient } from './firebase-auth-rest-client';
import { PasswordPolicyService } from './password-policy.service';
import {
  AccountLockedException,
  EmailAlreadyExistsException,
  EmailNotVerifiedException,
  InvalidCredentialsException,
  InvalidDisplayNameException,
  InvalidEmailException,
  InternalAuthException,
  InvalidUnlockTokenException,
  TooManyRequestsException,
  UnlockTokenExpiredException,
  WeakPasswordException,
} from './errors/auth.exception';

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

interface FakeFirestore {
  collection: ReturnType<typeof vi.fn>;
  _set: ReturnType<typeof vi.fn>;
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

function buildFakeFirestore(overrides: { setShouldFail?: boolean } = {}): FakeFirestore {
  const set = overrides.setShouldFail
    ? vi.fn(async () => {
        throw new Error('firestore down');
      })
    : vi.fn(async () => undefined);
  const doc = vi.fn(() => ({ set }));
  const collection = vi.fn(() => ({ doc }));
  return { collection, _set: set };
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

/**
 * A fake FirebaseAuth that models Firebase's whole-second session-cookie
 * revocation: a cookie is rejected by a checkRevoked verify only once the
 * user's validSince second is *strictly greater* than the cookie's `iat`
 * second. `revokeRefreshTokens` stamps validSince at the current second.
 *
 * `stampLagMs` encodes the real, unavoidable slop between the API process
 * clock and the second the validSince stamp is actually floored into — a
 * correct logout must tolerate it instead of racing the second boundary.
 */
function buildRevocationModelAuth(cookieIatSec: number, stampLagMs = 10) {
  let validSinceSec: number | null = null;
  const verifySessionCookie = vi.fn(async (_cookie: string, checkRevoked: boolean) => {
    if (checkRevoked && validSinceSec !== null && cookieIatSec < validSinceSec) {
      throw new Error('auth/session-cookie-revoked');
    }
    return { uid: 'uid-abc', iat: cookieIatSec, auth_time: cookieIatSec };
  });
  const revokeRefreshTokens = vi.fn(async () => {
    validSinceSec = Math.floor((Date.now() - stampLagMs) / 1000);
  });
  return { ...buildFakeAuth(), verifySessionCookie, revokeRefreshTokens };
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
      { provide: EMAIL_TRANSPORT, useValue: { sendUnlockEmail: vi.fn(async () => undefined) } },
    ],
  }).compile();
  return moduleRef.get(AuthService);
}

describe('AuthService.register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['LEARNWREN_PUBLIC_URL'];
  });

  const validInput = {
    email: 'alice@example.com',
    password: 'Aa1!aaaaaaaa',
    displayName: 'Alice',
  };

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

  it('rollback: mintSessionCookie verifyIdToken failure produces InternalAuthException + delete', async () => {
    // Inside mintSessionCookie, a failed verifyIdToken must rethrow as
    // InternalAuthException. A BlockStatement mutant emptying that catch
    // would let register return without a cookie or with an unrelated error.
    const auth = buildFakeAuth({
      verifyIdToken: vi.fn(async () => {
        throw new Error('verifyIdToken failed');
      }),
    });
    const firestore = buildFakeFirestore();
    const service = await buildModule(auth, firestore);

    await expect(service.register(validInput)).rejects.toBeInstanceOf(InternalAuthException);
    expect(auth.deleteUser).toHaveBeenCalledWith('uid-123');
  });

  it('rollback: mintSessionCookie createSessionCookie failure produces InternalAuthException + delete', async () => {
    const auth = buildFakeAuth({
      createSessionCookie: vi.fn(async () => {
        throw new Error('createSessionCookie failed');
      }),
    });
    const firestore = buildFakeFirestore();
    const service = await buildModule(auth, firestore);

    await expect(service.register(validInput)).rejects.toBeInstanceOf(InternalAuthException);
    expect(auth.deleteUser).toHaveBeenCalledWith('uid-123');
  });

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

  it('rejects with WeakPasswordException before any SDK call when password fails policy', async () => {
    const auth = buildFakeAuth();
    const firestore = buildFakeFirestore();
    const service = await buildModule(auth, firestore);

    await expect(service.register({ ...validInput, password: 'short' })).rejects.toBeInstanceOf(
      WeakPasswordException,
    );
    expect(auth.createUser).not.toHaveBeenCalled();
  });

  it('rejects with InvalidDisplayNameException for an empty display name', async () => {
    const auth = buildFakeAuth();
    const firestore = buildFakeFirestore();
    const service = await buildModule(auth, firestore);

    await expect(service.register({ ...validInput, displayName: '   ' })).rejects.toBeInstanceOf(
      InvalidDisplayNameException,
    );
    expect(auth.createUser).not.toHaveBeenCalled();
  });

  it('rejects with InvalidEmailException for a malformed email', async () => {
    const auth = buildFakeAuth();
    const firestore = buildFakeFirestore();
    const service = await buildModule(auth, firestore);

    await expect(service.register({ ...validInput, email: 'not-an-email' })).rejects.toBeInstanceOf(
      InvalidEmailException,
    );
    expect(auth.createUser).not.toHaveBeenCalled();
  });

  it.each([
    ['leading garbage', 'xx alice@example.com'],
    ['trailing garbage', 'alice@example.com extra'],
    ['no @', 'aliceexample.com'],
    ['no .', 'alice@examplecom'],
  ])('rejects with InvalidEmailException — %s', async (_label, badEmail) => {
    // Pins the EMAIL_REGEX anchors `^...$` so a Regex mutant dropping either
    // anchor is caught — it would otherwise accept emails with surrounding text.
    const auth = buildFakeAuth();
    const firestore = buildFakeFirestore();
    const service = await buildModule(auth, firestore);

    await expect(service.register({ ...validInput, email: badEmail })).rejects.toBeInstanceOf(
      InvalidEmailException,
    );
    expect(auth.createUser).not.toHaveBeenCalled();
  });

  it('rejects with InvalidDisplayNameException when displayName exceeds 80 characters', async () => {
    // Pins the upper bound: a ConditionalExpression mutant that strips this
    // guard would let arbitrarily long names through to Firebase.
    const auth = buildFakeAuth();
    const firestore = buildFakeFirestore();
    const service = await buildModule(auth, firestore);
    const tooLong = 'a'.repeat(81);

    await expect(
      service.register({ ...validInput, displayName: tooLong }),
    ).rejects.toBeInstanceOf(InvalidDisplayNameException);
    expect(auth.createUser).not.toHaveBeenCalled();
  });

  it('accepts a displayName at the 80-character boundary', async () => {
    // Lower-bound counterpart: displayName.length === 80 is valid; the guard
    // is `> DISPLAY_NAME_MAX`, not `>=`.
    const auth = buildFakeAuth();
    const firestore = buildFakeFirestore();
    const rest = buildFakeRestClient();
    const service = await buildModule(auth, firestore, rest);
    const justFits = 'a'.repeat(80);

    await expect(
      service.register({ ...validInput, displayName: justFits }),
    ).resolves.toMatchObject({ uid: 'uid-123' });
  });

  it('maps a non-email-already-exists Firebase error to InternalAuthException with rollback skipped', async () => {
    // The catch branches on `err.code === 'auth/email-already-exists'` —
    // mutants flipping this to `true` or `||` would either misclassify any
    // failure as duplicate-email or strip the magic-code guard. Send a
    // different code through and assert it falls through to internal error.
    const auth = buildFakeAuth({
      createUser: vi.fn(async () => {
        const e = new Error('quota');
        (e as unknown as { code: string }).code = 'auth/quota-exceeded';
        throw e;
      }),
    });
    const firestore = buildFakeFirestore();
    const service = await buildModule(auth, firestore);

    await expect(service.register(validInput)).rejects.toBeInstanceOf(InternalAuthException);
    // No user was created, so no rollback to call.
    expect(auth.deleteUser).not.toHaveBeenCalled();
  });

  it('does not crash when a non-object value is thrown by createUser', async () => {
    // `isFirebaseError` checks `typeof err === 'object' && err !== null`.
    // Without those guards, `'code' in err` would TypeError on a primitive
    // throw — register would reject with a TypeError instead of
    // InternalAuthException.
    const auth = buildFakeAuth({
      createUser: vi.fn(async () => {
        throw 'string-not-error';
      }),
    });
    const firestore = buildFakeFirestore();
    const service = await buildModule(auth, firestore);

    await expect(service.register(validInput)).rejects.toBeInstanceOf(InternalAuthException);
  });

  it('writes the user doc to `users/{uid}` with role STUDENT and the validated email/displayName', async () => {
    // Pins both the collection path and the doc shape: ObjectLiteral / String
    // mutants would either drop fields from the set payload or change the
    // collection name (e.g. `''` instead of `'users'`).
    const auth = buildFakeAuth();
    const firestore = buildFakeFirestore();
    const service = await buildModule(auth, firestore);

    await service.register(validInput);

    expect(firestore.collection).toHaveBeenCalledWith('users');
    expect(firestore._set).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'uid-123',
        email: validInput.email,
        displayName: validInput.displayName,
        role: 'STUDENT',
      }),
    );
  });

  it('grants the STUDENT custom claim and sends the verification link to the registered email', async () => {
    // Pins setCustomUserClaims args (the `'STUDENT'` string) and the
    // generateEmailVerificationLink options object (its url field).
    const auth = buildFakeAuth();
    const firestore = buildFakeFirestore();
    const service = await buildModule(auth, firestore);

    await service.register(validInput);

    expect(auth.setCustomUserClaims).toHaveBeenCalledWith('uid-123', { role: 'STUDENT' });
    expect(auth.generateEmailVerificationLink).toHaveBeenCalledWith(
      validInput.email,
      { url: 'http://localhost:4200/login' },
    );
  });

  it('maps auth/email-already-exists to EmailAlreadyExistsException with no rollback', async () => {
    const auth = buildFakeAuth({
      createUser: vi.fn(async () => {
        const e = new Error('exists');
        (e as unknown as { code: string }).code = 'auth/email-already-exists';
        throw e;
      }),
    });
    const firestore = buildFakeFirestore();
    const service = await buildModule(auth, firestore);

    await expect(service.register(validInput)).rejects.toBeInstanceOf(EmailAlreadyExistsException);
    expect(auth.deleteUser).not.toHaveBeenCalled();
  });

  it('rolls back the Auth user when Firestore write fails', async () => {
    const auth = buildFakeAuth();
    const firestore = buildFakeFirestore({ setShouldFail: true });
    const service = await buildModule(auth, firestore);

    await expect(service.register(validInput)).rejects.toBeInstanceOf(InternalAuthException);
    expect(auth.deleteUser).toHaveBeenCalledWith('uid-123');
  });

  it('rolls back the Auth user when setCustomUserClaims fails', async () => {
    const auth = buildFakeAuth({
      setCustomUserClaims: vi.fn(async () => {
        throw new Error('claim failure');
      }),
    });
    const firestore = buildFakeFirestore();
    const service = await buildModule(auth, firestore);

    await expect(service.register(validInput)).rejects.toBeInstanceOf(InternalAuthException);
    expect(auth.deleteUser).toHaveBeenCalledWith('uid-123');
  });

  it('does NOT roll back when only generateEmailVerificationLink fails; returns 201 with emailVerificationSent: false', async () => {
    const auth = buildFakeAuth({
      generateEmailVerificationLink: vi.fn(async () => {
        throw new Error('smtp down');
      }),
    });
    const firestore = buildFakeFirestore();
    const service = await buildModule(auth, firestore);

    const result = await service.register(validInput);
    expect(result).toMatchObject({
      uid: 'uid-123',
      email: 'alice@example.com',
      role: 'STUDENT',
      cookie: 'COOKIE-VALUE',
      maxAgeSeconds: 5 * 24 * 60 * 60,
      emailVerificationSent: false,
    });
    expect(auth.deleteUser).not.toHaveBeenCalled();
  });
});

describe('AuthService.logoutSideEffects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('revokes the session cookie even when logout runs in the same wall-second it was minted', async () => {
    vi.useFakeTimers();
    try {
      const cookieIatSec = 1_700_000_000;
      // Clock sits 300ms into the cookie's own second — logout races the
      // second boundary, the exact condition that produced the e2e flake.
      vi.setSystemTime(new Date(cookieIatSec * 1000 + 300));
      const auth = buildRevocationModelAuth(cookieIatSec);
      const service = await buildModule(auth as unknown as FakeAuth, buildFakeFirestore());

      const pending = service.logoutSideEffects('valid.cookie');
      await vi.advanceTimersByTimeAsync(5000);
      await pending;

      // Contract: after logout, a checkRevoked verify must reject the cookie.
      await expect(auth.verifySessionCookie('valid.cookie', true)).rejects.toThrow();
      // The first revoke landed in the cookie's own second; logout must retry.
      expect(auth.revokeRefreshTokens.mock.calls.length).toBeGreaterThanOrEqual(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('revokes on the first attempt when the cookie was minted in an earlier second', async () => {
    // Cookie iat is well in the past, so the very first revokeRefreshTokens
    // stamps a validSince strictly greater than it — no retry, no sleep.
    const cookieIatSec = Math.floor(Date.now() / 1000) - 3600;
    const auth = buildRevocationModelAuth(cookieIatSec);
    const service = await buildModule(auth as unknown as FakeAuth, buildFakeFirestore());

    await service.logoutSideEffects('valid.cookie');

    expect(auth.verifySessionCookie).toHaveBeenCalledWith('valid.cookie', true);
    expect(auth.revokeRefreshTokens).toHaveBeenCalledTimes(1);
    // Revocation must target the uid decoded from the cookie — a StringLiteral
    // mutant on `decoded['uid']` would call revokeRefreshTokens(undefined),
    // revoking nothing while still reporting success.
    expect(auth.revokeRefreshTokens).toHaveBeenCalledWith('uid-abc');
    await expect(auth.verifySessionCookie('valid.cookie', true)).rejects.toThrow();
  });

  it('gives up after LOGOUT_REVOKE_MAX_ATTEMPTS when revocation never confirms', async () => {
    // verifySessionCookie never rejects, so isSessionCookieRevoked stays false
    // and the retry loop runs to exhaustion. Pins the loop bound exactly: a
    // `<` → `<=` mutant would revoke 5×, and an `attempt++` → `attempt--`
    // mutant would loop forever (Stryker kills that one via timeout).
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(1_700_000_000 * 1000 + 300));
      const verifySessionCookie = vi.fn(async () => ({ uid: 'uid-abc', iat: 1_700_000_000 }));
      const revokeRefreshTokens = vi.fn(async () => undefined);
      const auth = { ...buildFakeAuth(), verifySessionCookie, revokeRefreshTokens };
      const service = await buildModule(auth as unknown as FakeAuth, buildFakeFirestore());

      const pending = service.logoutSideEffects('stubborn.cookie');
      await vi.advanceTimersByTimeAsync(20_000);
      await pending;

      expect(revokeRefreshTokens).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('is a no-op when the cookie is undefined', async () => {
    const auth = {
      ...buildFakeAuth(),
      verifySessionCookie: vi.fn(),
      revokeRefreshTokens: vi.fn(),
    };
    const firestore = buildFakeFirestore();
    const service = await buildModule(auth as unknown as FakeAuth, firestore);

    await service.logoutSideEffects(undefined);
    expect(auth.verifySessionCookie).not.toHaveBeenCalled();
    expect(auth.revokeRefreshTokens).not.toHaveBeenCalled();
  });

  it('silently swallows verifySessionCookie failures (does not call revoke)', async () => {
    const auth = {
      ...buildFakeAuth(),
      verifySessionCookie: vi.fn(async () => {
        throw new Error('expired');
      }),
      revokeRefreshTokens: vi.fn(),
    };
    const firestore = buildFakeFirestore();
    const service = await buildModule(auth as unknown as FakeAuth, firestore);

    await expect(service.logoutSideEffects('expired.cookie')).resolves.toBeUndefined();
    expect(auth.revokeRefreshTokens).not.toHaveBeenCalled();
  });
});

describe('AuthService.getMe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads the users/{uid} doc and returns the merged shape', async () => {
    const docData = {
      id: 'uid-xyz',
      email: 'me@example.com',
      displayName: 'Me',
      role: 'STUDENT',
      createdAt: '2026-05-04T00:00:00.000Z',
      updatedAt: '2026-05-04T00:00:00.000Z',
    };
    const get = vi.fn(async () => ({ exists: true, data: () => docData }));
    const docFn = vi.fn(() => ({ get }));
    const collectionFn = vi.fn(() => ({ doc: docFn }));
    const firestore = { collection: collectionFn, _set: vi.fn() } as unknown as FakeFirestore;
    const auth = buildFakeAuth();
    const service = await buildModule(auth, firestore);

    const result = await service.getMe('uid-xyz', { email: 'me@example.com', emailVerified: true });

    expect(collectionFn).toHaveBeenCalledWith('users');
    expect(docFn).toHaveBeenCalledWith('uid-xyz');
    expect(result).toEqual({
      uid: 'uid-xyz',
      email: 'me@example.com',
      displayName: 'Me',
      role: 'STUDENT',
      emailVerified: true,
    });
  });

  it('throws InternalAuthException when the users/{uid} doc is missing', async () => {
    const get = vi.fn(async () => ({ exists: false, data: () => undefined }));
    const docFn = vi.fn(() => ({ get }));
    const collectionFn = vi.fn(() => ({ doc: docFn }));
    const firestore = { collection: collectionFn, _set: vi.fn() } as unknown as FakeFirestore;
    const auth = buildFakeAuth();
    const service = await buildModule(auth, firestore);

    await expect(
      service.getMe('uid-missing', { email: 'x@y.z', emailVerified: false }),
    ).rejects.toMatchObject({ code: 'INTERNAL' });
  });
});

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

describe('AuthService.login', () => {
  beforeEach(() => vi.clearAllMocks());

  const validInput = { email: 'alice@example.com', password: 'Aa1!aaaaaaaa' };

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
        { provide: EMAIL_TRANSPORT, useValue: { sendUnlockEmail: vi.fn(async () => undefined) } },
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

  it('reads the user doc at users/{uid} and verifies the ID token with checkRevoked=true', async () => {
    // Pins both collection name and the verifyIdToken second arg. A
    // BooleanLiteral mutant flipping `true` to `false` would silently disable
    // revocation checking — a security regression.
    const auth = buildFakeAuth({
      verifyIdToken: vi.fn(async () => ({
        uid: 'uid-123',
        email: 'alice@example.com',
        role: 'STUDENT',
        email_verified: true,
      })),
    });
    (auth as unknown as { getUser: ReturnType<typeof vi.fn> }).getUser = vi.fn(async () => ({
      uid: 'uid-123',
      email: 'alice@example.com',
      emailVerified: true,
      displayName: 'Alice',
    }));
    const firestore = fsWithUser();
    const rest = buildFakeRestClient('ID-TOKEN');
    const { repo: attempts } = buildAttemptsMock();
    const service = await buildLoginModule(auth, firestore, rest, attempts);

    await service.login(validInput);

    // verifyIdToken is called twice: once for the email-verification gate at
    // login (must be checkRevoked=true) and once inside mintSessionCookie.
    // Pin the first call specifically — a BooleanLiteral mutant flipping the
    // gate's `true` to `false` would silently disable revocation checking.
    expect(auth.verifyIdToken).toHaveBeenNthCalledWith(1, 'ID-TOKEN', true);
    expect(firestore.collection).toHaveBeenCalledWith('users');
  });

  it('throws InternalAuthException when the user doc is missing on login', async () => {
    // The `if (!userDoc.exists)` guard rejects logins for users that exist in
    // Firebase Auth but not Firestore. A ConditionalExpression mutant flipping
    // it to `false` would let a malformed account return a session.
    const auth = buildFakeAuth({
      verifyIdToken: vi.fn(async () => ({
        uid: 'uid-orphan',
        email: 'alice@example.com',
        role: 'STUDENT',
        email_verified: true,
      })),
    });
    (auth as unknown as { getUser: ReturnType<typeof vi.fn> }).getUser = vi.fn(async () => ({
      uid: 'uid-orphan',
      email: 'alice@example.com',
      emailVerified: true,
      displayName: 'Alice',
    }));
    const fs = buildFakeFirestore();
    fs.collection = vi.fn(() => ({
      doc: vi.fn(() => ({
        get: vi.fn(async () => ({ exists: false, data: () => undefined })),
        set: fs._set,
      })),
    })) as unknown as FakeFirestore['collection'];
    const rest = buildFakeRestClient('ID-TOKEN');
    const { repo: attempts } = buildAttemptsMock();
    const service = await buildLoginModule(auth, fs, rest, attempts);

    await expect(service.login(validInput)).rejects.toBeInstanceOf(InternalAuthException);
  });

  it('propagates a non-InvalidCredentials error from REST without incrementing failure counter', async () => {
    // The `if (err instanceof InvalidCredentialsException)` branch records a
    // failure attempt; a ConditionalExpression mutant flipping it to `true`
    // would record a failure for any upstream error (e.g. transient network).
    const { repo: attempts, spies } = buildAttemptsMock();
    const auth = buildFakeAuth();
    const firestore = fsWithUser();
    const rest = {
      signInWithPassword: vi.fn(async () => {
        throw new InternalAuthException();
      }),
    } as unknown as FirebaseAuthRestClient;
    const service = await buildLoginModule(auth, firestore, rest, attempts);

    await expect(service.login(validInput)).rejects.toBeInstanceOf(InternalAuthException);
    expect(spies.recordFailure).not.toHaveBeenCalled();
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

describe('AuthService.resendVerification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['LEARNWREN_PUBLIC_URL'];
  });

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
        { provide: EMAIL_TRANSPORT, useValue: { sendUnlockEmail: vi.fn(async () => undefined) } },
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
    // Pin the exact URL — kills LogicalOperator + StringLiteral mutants on
    // the `process.env['LEARNWREN_PUBLIC_URL'] ?? 'http://localhost:4200'`
    // default, and ObjectLiteral mutants on the link options.
    expect(auth.generateEmailVerificationLink).toHaveBeenCalledWith(
      'alice@example.com',
      { url: 'http://localhost:4200/login' },
    );
  });

  it('propagates a non-user-not-found Firebase error from getUserByEmail (does not silently succeed)', async () => {
    // The catch only swallows `auth/user-not-found` for enumeration resistance.
    // A ConditionalExpression mutant flipping the guard to `true` would
    // silently swallow ANY Firebase error and return success.
    const { service, auth } = await buildResendModule({});
    (auth as unknown as { getUserByEmail: ReturnType<typeof vi.fn> }).getUserByEmail = vi.fn(
      async () => {
        throw Object.assign(new Error('quota'), { code: 'auth/quota-exceeded' });
      },
    );
    await expect(service.resendVerification('alice@example.com')).rejects.toMatchObject({
      code: 'auth/quota-exceeded',
    });
  });

  it('throws InternalAuthException when generateEmailVerificationLink fails', async () => {
    // The catch around the Firebase call rethrows InternalAuthException. A
    // BlockStatement mutant emptying the catch body would let the original
    // failure bubble up unmapped — losing the consistent error contract.
    const { service, auth } = await buildResendModule({});
    auth.generateEmailVerificationLink = vi.fn(async () => {
      throw new Error('Admin SDK timeout');
    });
    await expect(service.resendVerification('alice@example.com')).rejects.toBeInstanceOf(
      InternalAuthException,
    );
  });
});

describe('AuthService.requestPasswordReset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['LEARNWREN_PUBLIC_URL'];
  });

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
        { provide: EMAIL_TRANSPORT, useValue: { sendUnlockEmail: vi.fn(async () => undefined) } },
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
    // Pin the full URL so a StringLiteral mutant cannot drop `?reset=ok` (the
    // signal the front-end uses to render the success state).
    expect(fn).toHaveBeenCalledWith(
      'alice@example.com',
      { url: 'http://localhost:4200/login?reset=ok' },
    );
  });

  it('propagates a non-user-not-found Firebase error from getUserByEmail (does not silently succeed)', async () => {
    const { service, auth } = await build({});
    (auth as unknown as { getUserByEmail: ReturnType<typeof vi.fn> }).getUserByEmail = vi.fn(
      async () => {
        throw Object.assign(new Error('quota'), { code: 'auth/quota-exceeded' });
      },
    );
    await expect(service.requestPasswordReset('alice@example.com')).rejects.toMatchObject({
      code: 'auth/quota-exceeded',
    });
  });

  it('throws InternalAuthException when generatePasswordResetLink fails', async () => {
    // Same contract as resendVerification — the catch must rethrow as
    // InternalAuthException, not let the Admin SDK error bubble up unmapped.
    const { service, auth } = await build({});
    (auth as unknown as { generatePasswordResetLink: ReturnType<typeof vi.fn> })
      .generatePasswordResetLink = vi.fn(async () => {
      throw new Error('Admin SDK timeout');
    });
    await expect(service.requestPasswordReset('alice@example.com')).rejects.toBeInstanceOf(
      InternalAuthException,
    );
  });

  it('does NOT clear lockout state when called for a locked email', async () => {
    const { service, spies } = await build({});
    await service.requestPasswordReset('alice@example.com');
    expect(spies.clear).not.toHaveBeenCalled();
  });
});

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
        { provide: EMAIL_TRANSPORT, useValue: { sendUnlockEmail: vi.fn(async () => undefined) } },
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

describe('AuthService.login — lock-fired email send', () => {
  beforeEach(() => vi.clearAllMocks());

  function fsWithUser(uid = 'uid-123', role = 'STUDENT', displayName = 'Alice'): FakeFirestore {
    const fs = buildFakeFirestore();
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

  it('does NOT send an unlock email when the locked-out email maps to no user', async () => {
    // dispatchUnlockEmail catches getUserByEmail and returns. A BlockStatement
    // mutant emptying the catch block would skip the early return and call
    // sendUnlockEmail with `to=undefined`, sending mail nowhere (or worse,
    // spraying it through the transport).
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
    const sendUnlockEmail = vi.fn(async () => undefined);
    const emailTransport = { sendUnlockEmail } as unknown as EmailTransport;

    // The brute-force attempt was against a typo'd address: getUserByEmail
    // throws auth/user-not-found.
    (auth as unknown as { getUserByEmail: ReturnType<typeof vi.fn> }).getUserByEmail = vi.fn(
      async () => {
        throw Object.assign(new Error('not found'), { code: 'auth/user-not-found' });
      },
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
      service.login({ email: 'typo@example.com', password: 'pw' }),
    ).rejects.toBeInstanceOf(AccountLockedException);

    expect(sendUnlockEmail).not.toHaveBeenCalled();
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

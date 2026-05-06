import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FIREBASE_AUTH, FIRESTORE } from '@learnwren/api-firebase';

import { AuthAttemptsRepository } from './auth-attempts.repository';
import { AuthService } from './auth.service';
import { FirebaseAuthRestClient } from './firebase-auth-rest-client';
import { PasswordPolicyService } from './password-policy.service';
import {
  EmailAlreadyExistsException,
  InvalidDisplayNameException,
  InvalidEmailException,
  InternalAuthException,
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

describe('AuthService.register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('verifies the cookie then revokes refresh tokens for the uid', async () => {
    const auth = {
      ...buildFakeAuth(),
      // iat far in the past → no second-boundary sleep needed.
      verifySessionCookie: vi.fn(async () => ({ uid: 'uid-abc', iat: 1000 })),
      revokeRefreshTokens: vi.fn(async () => undefined),
    };
    const firestore = buildFakeFirestore();
    const service = await buildModule(auth as unknown as FakeAuth, firestore);

    await service.logoutSideEffects('valid.cookie');

    expect(auth.verifySessionCookie).toHaveBeenCalledWith('valid.cookie', true);
    expect(auth.revokeRefreshTokens).toHaveBeenCalledWith('uid-abc');
  });

  it('sleeps to the next second boundary before revoking when the cookie was minted in the current wall-second', async () => {
    vi.useFakeTimers();
    // Pin clock to 1_700_000_000_250ms — 250ms into second 1_700_000_000.
    vi.setSystemTime(new Date(1_700_000_000_250));
    const auth = {
      ...buildFakeAuth(),
      // iat == current wall-second → must sleep until the next second.
      verifySessionCookie: vi.fn(async () => ({ uid: 'uid-abc', iat: 1_700_000_000 })),
      revokeRefreshTokens: vi.fn(async () => undefined),
    };
    const firestore = buildFakeFirestore();
    const service = await buildModule(auth as unknown as FakeAuth, firestore);

    const pending = service.logoutSideEffects('valid.cookie');
    // Verify hasn't been called yet (it's awaited synchronously); revoke must wait.
    await vi.advanceTimersByTimeAsync(0);
    expect(auth.revokeRefreshTokens).not.toHaveBeenCalled();
    // Advance just under the boundary — still no revoke.
    await vi.advanceTimersByTimeAsync(749);
    expect(auth.revokeRefreshTokens).not.toHaveBeenCalled();
    // Cross the 750ms boundary (1000 − 250) — revoke now fires.
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(auth.revokeRefreshTokens).toHaveBeenCalledWith('uid-abc');
    vi.useRealTimers();
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

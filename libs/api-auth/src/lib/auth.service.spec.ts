import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FIREBASE_AUTH, FIRESTORE } from '@learnwren/api-firebase';

import { AuthService } from './auth.service';
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
  verifyIdToken?: ReturnType<typeof vi.fn>;
  createSessionCookie?: ReturnType<typeof vi.fn>;
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

async function buildModule(auth: FakeAuth, firestore: FakeFirestore) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      AuthService,
      PasswordPolicyService,
      { provide: FIREBASE_AUTH, useValue: auth },
      { provide: FIRESTORE, useValue: firestore },
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

  it('happy path: createUser → set Firestore doc → setCustomUserClaims → generate verification link', async () => {
    const auth = buildFakeAuth();
    const firestore = buildFakeFirestore();
    const service = await buildModule(auth, firestore);

    const result = await service.register(validInput);

    expect(result).toEqual({
      uid: 'uid-123',
      email: 'alice@example.com',
      emailVerificationSent: true,
    });

    expect(auth.createUser).toHaveBeenCalledWith({
      email: 'alice@example.com',
      password: 'Aa1!aaaaaaaa',
      displayName: 'Alice',
    });
    expect(firestore.collection).toHaveBeenCalledWith('users');
    expect(firestore._set).toHaveBeenCalledWith(expect.objectContaining({
      id: 'uid-123',
      email: 'alice@example.com',
      displayName: 'Alice',
      role: 'STUDENT',
    }));
    expect(auth.setCustomUserClaims).toHaveBeenCalledWith('uid-123', { role: 'STUDENT' });
    expect(auth.generateEmailVerificationLink).toHaveBeenCalledWith('alice@example.com');
    expect(auth.deleteUser).not.toHaveBeenCalled();
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
    expect(result).toEqual({
      uid: 'uid-123',
      email: 'alice@example.com',
      emailVerificationSent: false,
    });
    expect(auth.deleteUser).not.toHaveBeenCalled();
  });
});

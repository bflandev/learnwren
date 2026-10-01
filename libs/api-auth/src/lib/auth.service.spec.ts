import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DOCUMENT_STORE } from '@learnwren/api-document-store';

import { AccountRecoveryService } from './account-recovery.service';
import { AuthAttemptsRepository } from './auth-attempts.repository';
import { AuthService } from './auth.service';
import { EMAIL_TRANSPORT, type EmailTransport } from './email-transport/email-transport';
import {
  AccountLockedException,
  EmailAlreadyExistsException,
  EmailNotVerifiedException,
  EmailTooLongException,
  InvalidCredentialsException,
  InvalidDisplayNameException,
  InvalidEmailException,
  InternalAuthException,
  PasswordTooLongException,
  WeakPasswordException,
} from './errors/auth.exception';
import { EmailInUseError } from './identity/identity.errors';
import { IDENTITY_PROVIDER, type IdentityProvider } from './identity/identity-provider.port';
import { PasswordPolicyService } from './password-policy.service';
import { PasswordVerificationService } from './password-verification.service';
import { SessionCookieService } from './session-cookie.service';

interface FakeFirestore {
  collection: ReturnType<typeof vi.fn>;
  _set: ReturnType<typeof vi.fn>;
  _delete?: ReturnType<typeof vi.fn>;
}

function buildIdentity(overrides: Partial<IdentityProvider> = {}): IdentityProvider {
  return {
    createUser: vi.fn(async () => 'uid-123'),
    getUser: vi.fn(async () => ({ uid: 'uid-123', email: 'alice@example.com', emailVerified: true })),
    getUserByEmail: vi.fn(async () => ({ uid: 'uid-123', email: 'alice@example.com', emailVerified: true })),
    updateUser: vi.fn(async () => undefined),
    deleteUser: vi.fn(async () => undefined),
    setRole: vi.fn(async () => undefined),
    verifyPassword: vi.fn(async () => ({ uid: 'uid-123' })),
    createSession: vi.fn(async () => ({ token: 'COOKIE-VALUE', maxAgeSeconds: 5 * 24 * 60 * 60 })),
    verifySession: vi.fn(async () => null),
    endSession: vi.fn(async () => undefined),
    revokeAllSessions: vi.fn(async () => undefined),
    createEmailActionLink: vi.fn(async () => 'https://verify/abc'),
    ...overrides,
  } as unknown as IdentityProvider;
}

function buildFakeFirestore(overrides: { setShouldFail?: boolean } = {}): FakeFirestore {
  const set = overrides.setShouldFail
    ? vi.fn(async () => {
        throw new Error('firestore down');
      })
    : vi.fn(async () => undefined);
  const del = vi.fn(async () => undefined);
  const doc = vi.fn(() => ({ set, delete: del }));
  const collection = vi.fn(() => ({ doc }));
  return { collection, _set: set, _delete: del };
}

function buildEmailTransportMock(): EmailTransport {
  return {
    sendUnlockEmail: vi.fn(async () => undefined),
    sendVerificationEmail: vi.fn(async () => undefined),
    sendPasswordResetEmail: vi.fn(async () => undefined),
  };
}

async function buildModule(
  identity: IdentityProvider,
  firestore: FakeFirestore,
): Promise<AuthService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      AuthService,
      PasswordPolicyService,
      PasswordVerificationService,
      AuthAttemptsRepository,
      AccountRecoveryService,
      SessionCookieService,
      { provide: IDENTITY_PROVIDER, useValue: identity },
      { provide: DOCUMENT_STORE, useValue: firestore },
      { provide: EMAIL_TRANSPORT, useValue: buildEmailTransportMock() },
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
    const identity = buildIdentity();
    const firestore = buildFakeFirestore();
    const service = await buildModule(identity, firestore);

    const result = await service.register(validInput);

    expect(identity.createUser).toHaveBeenCalledWith({
      email: validInput.email,
      password: validInput.password,
      displayName: validInput.displayName,
    });
    expect(firestore._set).toHaveBeenCalled();
    expect(identity.setRole).toHaveBeenCalledWith('uid-123', 'STUDENT');
    expect(identity.verifyPassword).toHaveBeenCalledWith(validInput.email, validInput.password);
    expect(identity.createSession).toHaveBeenCalledWith({ uid: 'uid-123' });
    expect(result).toMatchObject({
      uid: 'uid-123',
      email: validInput.email,
      role: 'STUDENT',
      cookie: 'COOKIE-VALUE',
      maxAgeSeconds: 5 * 24 * 60 * 60,
      emailVerificationSent: true,
    });
  });

  it('rollback: auto-login createSession failure produces InternalAuthException + delete', async () => {
    // Inside SessionCookieService.mint, a failed createSession must rethrow as
    // InternalAuthException. A BlockStatement mutant emptying that catch
    // would let register return without a cookie or with an unrelated error.
    const identity = buildIdentity({
      createSession: vi.fn(async () => {
        throw new Error('createSession failed');
      }),
    });
    const firestore = buildFakeFirestore();
    const service = await buildModule(identity, firestore);

    await expect(service.register(validInput)).rejects.toBeInstanceOf(InternalAuthException);
    expect(identity.deleteUser).toHaveBeenCalledWith('uid-123');
  });

  it('rollback: verifyPassword failure deletes the just-created user', async () => {
    const identity = buildIdentity({
      verifyPassword: vi.fn(async () => {
        throw new InternalAuthException();
      }),
    });
    const firestore = buildFakeFirestore();
    const service = await buildModule(identity, firestore);

    await expect(service.register(validInput)).rejects.toBeInstanceOf(InternalAuthException);
    expect(identity.deleteUser).toHaveBeenCalledWith('uid-123');
  });

  it('rejects with WeakPasswordException before any SDK call when password fails policy', async () => {
    const identity = buildIdentity();
    const firestore = buildFakeFirestore();
    const service = await buildModule(identity, firestore);

    await expect(service.register({ ...validInput, password: 'short' })).rejects.toBeInstanceOf(
      WeakPasswordException,
    );
    expect(identity.createUser).not.toHaveBeenCalled();
  });

  it('rejects with InvalidDisplayNameException for an empty display name', async () => {
    const identity = buildIdentity();
    const firestore = buildFakeFirestore();
    const service = await buildModule(identity, firestore);

    await expect(service.register({ ...validInput, displayName: '   ' })).rejects.toBeInstanceOf(
      InvalidDisplayNameException,
    );
    expect(identity.createUser).not.toHaveBeenCalled();
  });

  it('rejects with InvalidEmailException for a malformed email', async () => {
    const identity = buildIdentity();
    const firestore = buildFakeFirestore();
    const service = await buildModule(identity, firestore);

    await expect(service.register({ ...validInput, email: 'not-an-email' })).rejects.toBeInstanceOf(
      InvalidEmailException,
    );
    expect(identity.createUser).not.toHaveBeenCalled();
  });

  it.each([
    ['leading garbage', 'xx alice@example.com'],
    ['trailing garbage', 'alice@example.com extra'],
    ['no @', 'aliceexample.com'],
    ['no .', 'alice@examplecom'],
  ])('rejects with InvalidEmailException — %s', async (_label, badEmail) => {
    // Pins the EMAIL_REGEX anchors `^...$` so a Regex mutant dropping either
    // anchor is caught — it would otherwise accept emails with surrounding text.
    const identity = buildIdentity();
    const firestore = buildFakeFirestore();
    const service = await buildModule(identity, firestore);

    await expect(service.register({ ...validInput, email: badEmail })).rejects.toBeInstanceOf(
      InvalidEmailException,
    );
    expect(identity.createUser).not.toHaveBeenCalled();
  });

  it('rejects with InvalidDisplayNameException when displayName exceeds 80 characters', async () => {
    const identity = buildIdentity();
    const firestore = buildFakeFirestore();
    const service = await buildModule(identity, firestore);
    const tooLong = 'a'.repeat(81);

    await expect(
      service.register({ ...validInput, displayName: tooLong }),
    ).rejects.toBeInstanceOf(InvalidDisplayNameException);
    expect(identity.createUser).not.toHaveBeenCalled();
  });

  it('rejects with EmailTooLongException when the email exceeds 254 characters', async () => {
    const identity = buildIdentity();
    const firestore = buildFakeFirestore();
    const service = await buildModule(identity, firestore);
    const longEmail = `${'a'.repeat(250)}@x.co`; // 255 chars, valid format

    await expect(
      service.register({ ...validInput, email: longEmail }),
    ).rejects.toBeInstanceOf(EmailTooLongException);
    expect(identity.createUser).not.toHaveBeenCalled();
  });

  it('rejects with PasswordTooLongException when the password exceeds 256 characters', async () => {
    const identity = buildIdentity();
    const firestore = buildFakeFirestore();
    const service = await buildModule(identity, firestore);
    const longPassword = `Aa1!${'a'.repeat(260)}`; // 264 chars, satisfies complexity

    await expect(
      service.register({ ...validInput, password: longPassword }),
    ).rejects.toBeInstanceOf(PasswordTooLongException);
    expect(identity.createUser).not.toHaveBeenCalled();
  });

  it('accepts an email at the 254-character boundary', async () => {
    const identity = buildIdentity();
    const firestore = buildFakeFirestore();
    const service = await buildModule(identity, firestore);
    const boundaryEmail = `${'a'.repeat(249)}@x.co`; // exactly 254 chars, valid format
    expect(boundaryEmail.length).toBe(254);

    await expect(
      service.register({ ...validInput, email: boundaryEmail }),
    ).resolves.toMatchObject({ uid: 'uid-123' });
    expect(identity.createUser).toHaveBeenCalled();
  });

  it('accepts a password at the 256-character boundary', async () => {
    const identity = buildIdentity();
    const firestore = buildFakeFirestore();
    const service = await buildModule(identity, firestore);
    const boundaryPassword = `Aa1!${'a'.repeat(252)}`; // exactly 256 chars, satisfies complexity
    expect(boundaryPassword.length).toBe(256);

    await expect(
      service.register({ ...validInput, password: boundaryPassword }),
    ).resolves.toMatchObject({ uid: 'uid-123' });
    expect(identity.createUser).toHaveBeenCalled();
  });

  it('swallows a deleteUser failure during rollback and still rejects with the triggering error', async () => {
    const identity = buildIdentity({
      deleteUser: vi.fn(async () => {
        throw new Error('deleteUser exploded');
      }),
    });
    const firestore = buildFakeFirestore({ setShouldFail: true });
    const service = await buildModule(identity, firestore);

    await expect(service.register(validInput)).rejects.toBeInstanceOf(InternalAuthException);
    expect(identity.deleteUser).toHaveBeenCalledWith('uid-123');
  });

  it('accepts a displayName at the 80-character boundary', async () => {
    const identity = buildIdentity();
    const firestore = buildFakeFirestore();
    const service = await buildModule(identity, firestore);
    const justFits = 'a'.repeat(80);

    await expect(
      service.register({ ...validInput, displayName: justFits }),
    ).resolves.toMatchObject({ uid: 'uid-123' });
  });

  it('maps a non-EmailInUseError failure to InternalAuthException with rollback skipped', async () => {
    const identity = buildIdentity({
      createUser: vi.fn(async () => {
        const e = new Error('quota');
        (e as unknown as { code: string }).code = 'auth/quota-exceeded';
        throw e;
      }),
    });
    const firestore = buildFakeFirestore();
    const service = await buildModule(identity, firestore);

    await expect(service.register(validInput)).rejects.toBeInstanceOf(InternalAuthException);
    // No user was created, so no rollback to call.
    expect(identity.deleteUser).not.toHaveBeenCalled();
  });

  it('does not crash when a non-object value is thrown by createUser', async () => {
    const identity = buildIdentity({
      createUser: vi.fn(async () => {
        throw 'string-not-error';
      }),
    });
    const firestore = buildFakeFirestore();
    const service = await buildModule(identity, firestore);

    await expect(service.register(validInput)).rejects.toBeInstanceOf(InternalAuthException);
  });

  it('writes the user doc to `users/{uid}` with role STUDENT and the validated email/displayName', async () => {
    const identity = buildIdentity();
    const firestore = buildFakeFirestore();
    const service = await buildModule(identity, firestore);

    await service.register(validInput);

    expect(firestore.collection).toHaveBeenCalledWith('users');
    expect(firestore._set).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'uid-123',
        email: validInput.email,
        displayName: validInput.displayName,
        biography: '',
        role: 'STUDENT',
      }),
    );
  });

  it('grants the STUDENT role and sends the verification link to the registered email', async () => {
    const identity = buildIdentity();
    const firestore = buildFakeFirestore();
    const service = await buildModule(identity, firestore);

    await service.register(validInput);

    expect(identity.setRole).toHaveBeenCalledWith('uid-123', 'STUDENT');
    expect(identity.createEmailActionLink).toHaveBeenCalledWith('verify-email', validInput.email, '/login');
  });

  it('maps EmailInUseError to EmailAlreadyExistsException with no rollback', async () => {
    const identity = buildIdentity({
      createUser: vi.fn(async () => {
        throw new EmailInUseError();
      }),
    });
    const firestore = buildFakeFirestore();
    const service = await buildModule(identity, firestore);

    await expect(service.register(validInput)).rejects.toBeInstanceOf(EmailAlreadyExistsException);
    expect(identity.deleteUser).not.toHaveBeenCalled();
  });

  it('rolls back the identity user when Firestore write fails', async () => {
    const identity = buildIdentity();
    const firestore = buildFakeFirestore({ setShouldFail: true });
    const service = await buildModule(identity, firestore);

    await expect(service.register(validInput)).rejects.toBeInstanceOf(InternalAuthException);
    expect(identity.deleteUser).toHaveBeenCalledWith('uid-123');
  });

  it('rolls back the identity user when setRole fails', async () => {
    const identity = buildIdentity({
      setRole: vi.fn(async () => {
        throw new Error('claim failure');
      }),
    });
    const firestore = buildFakeFirestore();
    const service = await buildModule(identity, firestore);

    await expect(service.register(validInput)).rejects.toBeInstanceOf(InternalAuthException);
    expect(identity.deleteUser).toHaveBeenCalledWith('uid-123');
  });

  it('rollback also deletes the orphaned users/{uid} doc when setRole fails', async () => {
    const identity = buildIdentity({
      setRole: vi.fn(async () => {
        throw new Error('claim failure');
      }),
    });
    const firestore = buildFakeFirestore();
    const service = await buildModule(identity, firestore);

    await expect(service.register(validInput)).rejects.toBeInstanceOf(InternalAuthException);
    expect(firestore._delete).toHaveBeenCalledTimes(1);
  });

  it('rollback also deletes the orphaned users/{uid} doc when auto-login fails', async () => {
    const identity = buildIdentity({
      verifyPassword: vi.fn(async () => {
        throw new InternalAuthException();
      }),
    });
    const firestore = buildFakeFirestore();
    const service = await buildModule(identity, firestore);

    await expect(service.register(validInput)).rejects.toBeInstanceOf(InternalAuthException);
    expect(identity.deleteUser).toHaveBeenCalledWith('uid-123');
    expect(firestore._delete).toHaveBeenCalledTimes(1);
  });

  it('swallows a Firestore doc-delete failure during rollback and still rejects with the triggering error', async () => {
    const identity = buildIdentity({
      setRole: vi.fn(async () => {
        throw new Error('claim failure');
      }),
    });
    const firestore = buildFakeFirestore();
    firestore._delete!.mockRejectedValue(new Error('firestore delete exploded'));
    const service = await buildModule(identity, firestore);

    await expect(service.register(validInput)).rejects.toBeInstanceOf(InternalAuthException);
    expect(identity.deleteUser).toHaveBeenCalledWith('uid-123');
  });

  it('does NOT roll back when only createEmailActionLink fails; returns 201 with emailVerificationSent: false', async () => {
    const identity = buildIdentity({
      createEmailActionLink: vi.fn(async () => {
        throw new Error('smtp down');
      }),
    });
    const firestore = buildFakeFirestore();
    const service = await buildModule(identity, firestore);

    const result = await service.register(validInput);
    expect(result).toMatchObject({
      uid: 'uid-123',
      email: 'alice@example.com',
      role: 'STUDENT',
      cookie: 'COOKIE-VALUE',
      maxAgeSeconds: 5 * 24 * 60 * 60,
      emailVerificationSent: false,
    });
    expect(identity.deleteUser).not.toHaveBeenCalled();
  });
});

describe('AuthService.getMe', () => {
  beforeEach(() => vi.clearAllMocks());

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
    const identity = buildIdentity();
    const service = await buildModule(identity, firestore);

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
    const identity = buildIdentity();
    const service = await buildModule(identity, firestore);

    await expect(
      service.getMe('uid-missing', { email: 'x@y.z', emailVerified: false }),
    ).rejects.toMatchObject({ code: 'INTERNAL' });
  });

  it('includes photoUrl in MeResponse when the user doc carries one', async () => {
    const docData = {
      id: 'u1',
      email: 'a@b.com',
      displayName: 'Ada',
      role: 'STUDENT',
      photoUrl: 'https://example.com/p/u1/avatar.jpg?v=2026-05-28T00:00:00.000Z',
    };
    const get = vi.fn(async () => ({ exists: true, data: () => docData }));
    const docFn = vi.fn(() => ({ get }));
    const collectionFn = vi.fn(() => ({ doc: docFn }));
    const firestore = { collection: collectionFn, _set: vi.fn() } as unknown as FakeFirestore;
    const identity = buildIdentity();
    const service = await buildModule(identity, firestore);

    const me = await service.getMe('u1', { email: 'a@b.com', emailVerified: true });

    expect(me.photoUrl).toBe('https://example.com/p/u1/avatar.jpg?v=2026-05-28T00:00:00.000Z');
  });

  it('omits photoUrl in MeResponse when the user doc has none', async () => {
    const docData = {
      id: 'u1',
      email: 'a@b.com',
      displayName: 'Ada',
      role: 'STUDENT',
    };
    const get = vi.fn(async () => ({ exists: true, data: () => docData }));
    const docFn = vi.fn(() => ({ get }));
    const collectionFn = vi.fn(() => ({ doc: docFn }));
    const firestore = { collection: collectionFn, _set: vi.fn() } as unknown as FakeFirestore;
    const identity = buildIdentity();
    const service = await buildModule(identity, firestore);

    const me = await service.getMe('u1', { email: 'a@b.com', emailVerified: true });

    expect(me.photoUrl).toBeUndefined();
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

async function buildLoginModule(
  identity: IdentityProvider,
  firestore: FakeFirestore,
  attempts: AuthAttemptsRepository,
  emailTransport: EmailTransport = buildEmailTransportMock(),
): Promise<AuthService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      AuthService,
      PasswordPolicyService,
      PasswordVerificationService,
      AccountRecoveryService,
      SessionCookieService,
      { provide: IDENTITY_PROVIDER, useValue: identity },
      { provide: DOCUMENT_STORE, useValue: firestore },
      { provide: AuthAttemptsRepository, useValue: attempts },
      { provide: EMAIL_TRANSPORT, useValue: emailTransport },
    ],
  }).compile();
  return moduleRef.get(AuthService);
}

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

describe('AuthService.login', () => {
  beforeEach(() => vi.clearAllMocks());

  const validInput = { email: 'alice@example.com', password: 'Aa1!aaaaaaaa' };

  it('happy path: returns uid + role + cookie and clears lockout doc', async () => {
    const identity = buildIdentity({
      verifyPassword: vi.fn(async () => ({ uid: 'uid-123' })),
      getUser: vi.fn(async () => ({ uid: 'uid-123', email: 'alice@example.com', emailVerified: true })),
    });
    const firestore = fsWithUser();
    const { repo: attempts, spies } = buildAttemptsMock();
    const service = await buildLoginModule(identity, firestore, attempts);

    const result = await service.login(validInput);

    expect(spies.emailHash).toHaveBeenCalledWith('alice@example.com');
    expect(spies.read).toHaveBeenCalledWith('HASH');
    expect(identity.verifyPassword).toHaveBeenCalledWith(validInput.email, validInput.password);
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

    const identity = buildIdentity();
    const firestore = fsWithUser();
    const service = await buildLoginModule(identity, firestore, attempts);

    await expect(service.login(validInput)).rejects.toBeInstanceOf(AccountLockedException);
    expect(identity.verifyPassword).not.toHaveBeenCalled();
    expect(spies.recordFailure).not.toHaveBeenCalled();
  });

  it('throws INVALID_CREDENTIALS and increments counter on bad password', async () => {
    const { repo: attempts, spies } = buildAttemptsMock();
    const identity = buildIdentity({
      verifyPassword: vi.fn(async () => {
        throw new InvalidCredentialsException();
      }),
    });
    const firestore = fsWithUser();
    const service = await buildLoginModule(identity, firestore, attempts);

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

    const identity = buildIdentity({
      verifyPassword: vi.fn(async () => {
        throw new InvalidCredentialsException();
      }),
    });
    const firestore = fsWithUser();
    const service = await buildLoginModule(identity, firestore, attempts);

    await expect(service.login(validInput)).rejects.toBeInstanceOf(AccountLockedException);
  });

  it('reads the user doc at users/{uid} and looks up the identity by the proof uid', async () => {
    const identity = buildIdentity({
      verifyPassword: vi.fn(async () => ({ uid: 'uid-123' })),
      getUser: vi.fn(async () => ({ uid: 'uid-123', email: 'alice@example.com', emailVerified: true })),
    });
    const firestore = fsWithUser();
    const { repo: attempts } = buildAttemptsMock();
    const service = await buildLoginModule(identity, firestore, attempts);

    await service.login(validInput);

    expect(identity.getUser).toHaveBeenCalledWith('uid-123');
    expect(firestore.collection).toHaveBeenCalledWith('users');
  });

  it('throws InternalAuthException when identity.getUser resolves null (identity missing)', async () => {
    // A null user from the identity provider is an internal error, not
    // EMAIL_NOT_VERIFIED — the password check already succeeded.
    const identity = buildIdentity({
      verifyPassword: vi.fn(async () => ({ uid: 'uid-ghost' })),
      getUser: vi.fn(async () => null),
    });
    const firestore = fsWithUser();
    const { repo: attempts } = buildAttemptsMock();
    const service = await buildLoginModule(identity, firestore, attempts);

    await expect(service.login(validInput)).rejects.toBeInstanceOf(InternalAuthException);
    expect(identity.createSession).not.toHaveBeenCalled();
  });

  it('throws InternalAuthException when the user doc is missing on login', async () => {
    const identity = buildIdentity({
      verifyPassword: vi.fn(async () => ({ uid: 'uid-orphan' })),
      getUser: vi.fn(async () => ({ uid: 'uid-orphan', email: 'alice@example.com', emailVerified: true })),
    });
    const fs = buildFakeFirestore();
    fs.collection = vi.fn(() => ({
      doc: vi.fn(() => ({
        get: vi.fn(async () => ({ exists: false, data: () => undefined })),
        set: fs._set,
      })),
    })) as unknown as FakeFirestore['collection'];
    const { repo: attempts } = buildAttemptsMock();
    const service = await buildLoginModule(identity, fs, attempts);

    await expect(service.login(validInput)).rejects.toBeInstanceOf(InternalAuthException);
  });

  it('propagates a non-InvalidCredentials error from identity.verifyPassword without incrementing failure counter', async () => {
    const { repo: attempts, spies } = buildAttemptsMock();
    const identity = buildIdentity({
      verifyPassword: vi.fn(async () => {
        throw new InternalAuthException();
      }),
    });
    const firestore = fsWithUser();
    const service = await buildLoginModule(identity, firestore, attempts);

    await expect(service.login(validInput)).rejects.toBeInstanceOf(InternalAuthException);
    expect(spies.recordFailure).not.toHaveBeenCalled();
  });

  it('throws EMAIL_NOT_VERIFIED without incrementing the counter when emailVerified=false', async () => {
    const { repo: attempts, spies } = buildAttemptsMock();
    const identity = buildIdentity({
      verifyPassword: vi.fn(async () => ({ uid: 'uid-123' })),
      getUser: vi.fn(async () => ({ uid: 'uid-123', email: 'alice@example.com', emailVerified: false })),
    });
    const firestore = fsWithUser();
    const service = await buildLoginModule(identity, firestore, attempts);

    await expect(service.login(validInput)).rejects.toBeInstanceOf(EmailNotVerifiedException);
    expect(spies.recordFailure).not.toHaveBeenCalled();
    expect(spies.clear).not.toHaveBeenCalled();
    expect(identity.createSession).not.toHaveBeenCalled();
  });
});

describe('AuthService.login — lazy heal of a stale users/{uid}.email', () => {
  beforeEach(() => vi.clearAllMocks());

  const validInput = { email: 'new@example.com', password: 'Aa1!aaaaaaaa' };

  /** Identity stub whose canonical (post-change) email is `authEmail`. */
  function identityWithEmail(authEmail: string): IdentityProvider {
    return buildIdentity({
      verifyPassword: vi.fn(async () => ({ uid: 'uid-123' })),
      getUser: vi.fn(async () => ({ uid: 'uid-123', email: authEmail, emailVerified: true })),
    });
  }

  /** Firestore stub with a full user doc (including email) and an update spy. */
  function fsWithUserEmail(
    docEmail: string,
    updateImpl: () => Promise<void> = async () => undefined,
  ): { fs: FakeFirestore; update: ReturnType<typeof vi.fn> } {
    const update = vi.fn(updateImpl);
    const fs = buildFakeFirestore();
    fs.collection = vi.fn(() => ({
      doc: vi.fn(() => ({
        get: vi.fn(async () => ({
          exists: true,
          data: () => ({ id: 'uid-123', displayName: 'Alice', role: 'STUDENT', email: docEmail }),
        })),
        set: fs._set,
        update,
      })),
    })) as unknown as FakeFirestore['collection'];
    return { fs, update };
  }

  it('syncs the doc email (+updatedAt) when the identity email differs — verify link opened without a session', async () => {
    const identity = identityWithEmail('new@example.com');
    const { fs, update } = fsWithUserEmail('old@example.com');
    const { repo: attempts } = buildAttemptsMock();
    const service = await buildLoginModule(identity, fs, attempts);

    const result = await service.login(validInput);

    expect(update).toHaveBeenCalledWith({ email: 'new@example.com', updatedAt: expect.any(String) });
    expect(result.email).toBe('new@example.com');
  });

  it('does not touch the doc when the emails already match', async () => {
    const identity = identityWithEmail('same@example.com');
    const { fs, update } = fsWithUserEmail('same@example.com');
    const { repo: attempts } = buildAttemptsMock();
    const service = await buildLoginModule(identity, fs, attempts);

    await service.login({ ...validInput, email: 'same@example.com' });
    expect(update).not.toHaveBeenCalled();
  });

  it('a failed email sync must NOT fail the login (best-effort)', async () => {
    const identity = identityWithEmail('new@example.com');
    const { fs, update } = fsWithUserEmail('old@example.com', async () => {
      throw new Error('firestore down');
    });
    const { repo: attempts } = buildAttemptsMock();
    const service = await buildLoginModule(identity, fs, attempts);

    const result = await service.login(validInput);
    expect(update).toHaveBeenCalled();
    expect(result.uid).toBe('uid-123');
    expect(result.cookie).toBe('COOKIE-VALUE');
  });
});

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

    const identity = buildIdentity({
      verifyPassword: vi.fn(async () => {
        throw new InvalidCredentialsException();
      }),
      getUserByEmail: vi.fn(async () => ({ uid: 'uid-123', email: 'alice@example.com', emailVerified: true })),
    });
    const firestore = fsWithUser();

    const sendUnlockEmail = vi.fn(async () => undefined);
    const emailTransport = {
      ...buildEmailTransportMock(),
      sendUnlockEmail,
    } as unknown as EmailTransport;

    const service = await buildLoginModule(identity, firestore, attempts, emailTransport);

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
    const { repo: attempts, spies } = buildAttemptsMock();
    const lockedUntil = new Date(Date.now() + 15 * 60_000);
    spies.recordFailure = vi.fn(async () => ({
      locked: true,
      unlockToken: 'utok',
      lockedUntil,
    }));

    const identity = buildIdentity({
      verifyPassword: vi.fn(async () => {
        throw new InvalidCredentialsException();
      }),
      // The brute-force attempt was against a typo'd address: the port
      // contract resolves null for an unknown user.
      getUserByEmail: vi.fn(async () => null),
    });
    const firestore = fsWithUser();
    const sendUnlockEmail = vi.fn(async () => undefined);
    const emailTransport = {
      ...buildEmailTransportMock(),
      sendUnlockEmail,
    } as unknown as EmailTransport;

    const service = await buildLoginModule(identity, firestore, attempts, emailTransport);

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

    const identity = buildIdentity({
      verifyPassword: vi.fn(async () => {
        throw new InvalidCredentialsException();
      }),
      getUserByEmail: vi.fn(async () => ({ uid: 'uid-123', email: 'alice@example.com', emailVerified: true })),
    });
    const firestore = fsWithUser();
    const emailTransport = {
      ...buildEmailTransportMock(),
      sendUnlockEmail: vi.fn(async () => {
        throw new Error('SMTP down');
      }),
    } as unknown as EmailTransport;

    const service = await buildLoginModule(identity, firestore, attempts, emailTransport);

    await expect(
      service.login({ email: 'alice@example.com', password: 'pw' }),
    ).rejects.toBeInstanceOf(AccountLockedException);
  });
});

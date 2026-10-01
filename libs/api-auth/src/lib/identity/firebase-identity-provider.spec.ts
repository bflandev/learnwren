import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InvalidCredentialsException } from '../errors/auth.exception';
import type { FirebaseAuthRestClient } from '../firebase-auth-rest-client';
import { FirebaseIdentityProvider } from './firebase-identity-provider';
import { EmailInUseError } from './identity.errors';
import type { PasswordProof } from './identity-provider.port';

interface FakeAuth {
  createUser: ReturnType<typeof vi.fn>;
  getUser: ReturnType<typeof vi.fn>;
  getUserByEmail: ReturnType<typeof vi.fn>;
  updateUser: ReturnType<typeof vi.fn>;
  deleteUser: ReturnType<typeof vi.fn>;
  setCustomUserClaims: ReturnType<typeof vi.fn>;
  verifyIdToken: ReturnType<typeof vi.fn>;
  createSessionCookie: ReturnType<typeof vi.fn>;
  verifySessionCookie: ReturnType<typeof vi.fn>;
  revokeRefreshTokens: ReturnType<typeof vi.fn>;
  generateEmailVerificationLink: ReturnType<typeof vi.fn>;
  generatePasswordResetLink: ReturnType<typeof vi.fn>;
  generateVerifyAndChangeEmailLink: ReturnType<typeof vi.fn>;
}

function buildFakeAuth(overrides: Partial<FakeAuth> = {}): FakeAuth {
  return {
    createUser: vi.fn(async () => ({ uid: 'uid-123' })),
    getUser: vi.fn(async () => ({ uid: 'uid-123', email: 'alice@example.com', emailVerified: false })),
    getUserByEmail: vi.fn(async () => ({ uid: 'uid-123', email: 'alice@example.com', emailVerified: false })),
    updateUser: vi.fn(async () => undefined),
    deleteUser: vi.fn(async () => undefined),
    setCustomUserClaims: vi.fn(async () => undefined),
    generateEmailVerificationLink: vi.fn(async () => 'https://verify/abc'),
    generatePasswordResetLink: vi.fn(async () => 'https://reset/abc'),
    generateVerifyAndChangeEmailLink: vi.fn(async () => 'https://change-email/abc'),
    verifyIdToken: vi.fn(async () => ({
      uid: 'uid-123',
      email: 'alice@example.com',
      role: 'STUDENT',
      email_verified: false,
    })),
    createSessionCookie: vi.fn(async () => 'COOKIE-VALUE'),
    verifySessionCookie: vi.fn(async () => ({ uid: 'uid-123' })),
    revokeRefreshTokens: vi.fn(async () => undefined),
    ...overrides,
  };
}

function buildFakeRest(overrides: Partial<{ signInWithPassword: ReturnType<typeof vi.fn> }> = {}) {
  return {
    signInWithPassword: vi.fn(async () => ({
      idToken: 'ID-TOKEN',
      localId: 'uid-123',
      email: 'alice@example.com',
      registered: true,
    })),
    ...overrides,
  };
}

function buildProvider(auth: FakeAuth, rest = buildFakeRest()): FirebaseIdentityProvider {
  return new FirebaseIdentityProvider(auth as never, rest as unknown as FirebaseAuthRestClient);
}

function err(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code });
}

/**
 * Models Firebase's whole-second session-cookie revocation: a checkRevoked
 * verify rejects only once the user's validSince second is *strictly
 * greater* than the cookie's `iat` second. `revokeRefreshTokens` stamps
 * validSince at the current second. `stampLagMs` encodes the real,
 * unavoidable slop between the process clock and the second the validSince
 * stamp is actually floored into.
 */
function buildRevocationModelAuth(uid: string, cookieIatSec: number, stampLagMs = 10) {
  let validSinceSec: number | null = null;
  const verifySessionCookie = vi.fn(async (_cookie: string, checkRevoked: boolean) => {
    if (checkRevoked && validSinceSec !== null && cookieIatSec < validSinceSec) {
      throw new Error('auth/session-cookie-revoked');
    }
    return { uid, iat: cookieIatSec, auth_time: cookieIatSec };
  });
  const revokeRefreshTokens = vi.fn(async () => {
    validSinceSec = Math.floor((Date.now() - stampLagMs) / 1000);
  });
  return { ...buildFakeAuth(), verifySessionCookie, revokeRefreshTokens };
}

beforeEach(() => vi.clearAllMocks());

describe('FirebaseIdentityProvider.createUser', () => {
  it('returns the created uid', async () => {
    const auth = buildFakeAuth();
    const provider = buildProvider(auth);

    const uid = await provider.createUser({ email: 'a@example.com', password: 'pw', displayName: 'Ada' });

    expect(uid).toBe('uid-123');
    expect(auth.createUser).toHaveBeenCalledWith({ email: 'a@example.com', password: 'pw', displayName: 'Ada' });
  });

  it('maps auth/email-already-exists to EmailInUseError', async () => {
    const auth = buildFakeAuth({
      createUser: vi.fn(async () => {
        throw err('auth/email-already-exists');
      }),
    });
    const provider = buildProvider(auth);

    await expect(
      provider.createUser({ email: 'a@example.com', password: 'pw', displayName: 'Ada' }),
    ).rejects.toBeInstanceOf(EmailInUseError);
  });

  it('rethrows other error codes unchanged', async () => {
    const boom = err('auth/internal-error');
    const auth = buildFakeAuth({
      createUser: vi.fn(async () => {
        throw boom;
      }),
    });
    const provider = buildProvider(auth);

    await expect(
      provider.createUser({ email: 'a@example.com', password: 'pw', displayName: 'Ada' }),
    ).rejects.toBe(boom);
  });
});

describe('FirebaseIdentityProvider.getUser / getUserByEmail', () => {
  it('getUser resolves the user', async () => {
    const auth = buildFakeAuth();
    const provider = buildProvider(auth);

    expect(await provider.getUser('uid-123')).toEqual({
      uid: 'uid-123',
      email: 'alice@example.com',
      emailVerified: false,
    });
  });

  it('getUser resolves null for auth/user-not-found', async () => {
    const auth = buildFakeAuth({
      getUser: vi.fn(async () => {
        throw err('auth/user-not-found');
      }),
    });
    const provider = buildProvider(auth);

    expect(await provider.getUser('missing')).toBeNull();
  });

  it('getUser rethrows other codes', async () => {
    const boom = err('auth/internal-error');
    const auth = buildFakeAuth({
      getUser: vi.fn(async () => {
        throw boom;
      }),
    });
    const provider = buildProvider(auth);

    await expect(provider.getUser('uid-123')).rejects.toBe(boom);
  });

  it('getUserByEmail resolves the user', async () => {
    const auth = buildFakeAuth();
    const provider = buildProvider(auth);

    expect(await provider.getUserByEmail('alice@example.com')).toEqual({
      uid: 'uid-123',
      email: 'alice@example.com',
      emailVerified: false,
    });
  });

  it('getUserByEmail resolves null for auth/user-not-found', async () => {
    const auth = buildFakeAuth({
      getUserByEmail: vi.fn(async () => {
        throw err('auth/user-not-found');
      }),
    });
    const provider = buildProvider(auth);

    expect(await provider.getUserByEmail('missing@example.com')).toBeNull();
  });

  it('getUserByEmail rethrows other codes', async () => {
    const boom = err('auth/internal-error');
    const auth = buildFakeAuth({
      getUserByEmail: vi.fn(async () => {
        throw boom;
      }),
    });
    const provider = buildProvider(auth);

    await expect(provider.getUserByEmail('alice@example.com')).rejects.toBe(boom);
  });
});

describe('FirebaseIdentityProvider.deleteUser', () => {
  it('tolerates auth/user-not-found', async () => {
    const auth = buildFakeAuth({
      deleteUser: vi.fn(async () => {
        throw err('auth/user-not-found');
      }),
    });
    const provider = buildProvider(auth);

    await expect(provider.deleteUser('missing')).resolves.toBeUndefined();
  });

  it('rethrows other codes', async () => {
    const boom = err('auth/internal-error');
    const auth = buildFakeAuth({
      deleteUser: vi.fn(async () => {
        throw boom;
      }),
    });
    const provider = buildProvider(auth);

    await expect(provider.deleteUser('uid-123')).rejects.toBe(boom);
  });
});

describe('FirebaseIdentityProvider.setRole', () => {
  it('sets the role custom claim', async () => {
    const auth = buildFakeAuth();
    const provider = buildProvider(auth);

    await provider.setRole('uid-123', 'INSTRUCTOR');

    expect(auth.setCustomUserClaims).toHaveBeenCalledWith('uid-123', { role: 'INSTRUCTOR' });
  });
});

describe('FirebaseIdentityProvider.verifyPassword / createSession', () => {
  it('maps the REST result to a proof whose uid is localId', async () => {
    const auth = buildFakeAuth();
    const rest = buildFakeRest();
    const provider = buildProvider(auth, rest);

    const proof = await provider.verifyPassword('alice@example.com', 'pw');

    expect(rest.signInWithPassword).toHaveBeenCalledWith({ email: 'alice@example.com', password: 'pw' });
    expect(proof.uid).toBe('uid-123');
  });

  it('createSession verifies the ID token and mints a 5-day cookie', async () => {
    const auth = buildFakeAuth();
    const rest = buildFakeRest();
    const provider = buildProvider(auth, rest);

    const proof = await provider.verifyPassword('alice@example.com', 'pw');
    const session = await provider.createSession(proof);

    expect(auth.verifyIdToken).toHaveBeenCalledWith('ID-TOKEN', true);
    expect(auth.createSessionCookie).toHaveBeenCalledWith('ID-TOKEN', { expiresIn: 432_000_000 });
    expect(session).toEqual({ token: 'COOKIE-VALUE', maxAgeSeconds: 5 * 24 * 60 * 60 });
  });
});

describe('FirebaseIdentityProvider.verifySession', () => {
  it('maps email_verified and role', async () => {
    const auth = buildFakeAuth({
      verifySessionCookie: vi.fn(async () => ({
        uid: 'uid-123',
        email: 'alice@example.com',
        role: 'INSTRUCTOR',
        email_verified: true,
      })),
    });
    const provider = buildProvider(auth);

    expect(await provider.verifySession('COOKIE-VALUE')).toEqual({
      uid: 'uid-123',
      email: 'alice@example.com',
      role: 'INSTRUCTOR',
      emailVerified: true,
    });
    expect(auth.verifySessionCookie).toHaveBeenCalledWith('COOKIE-VALUE', true);
  });

  it('returns null when the cookie is rejected', async () => {
    const auth = buildFakeAuth({
      verifySessionCookie: vi.fn(async () => {
        throw new Error('expired');
      }),
    });
    const provider = buildProvider(auth);

    expect(await provider.verifySession('bad.cookie')).toBeNull();
  });
});

describe('FirebaseIdentityProvider.createEmailActionLink', () => {
  it('verify-email calls generateEmailVerificationLink with the public URL', async () => {
    const auth = buildFakeAuth();
    const provider = buildProvider(auth);

    const link = await provider.createEmailActionLink('verify-email', 'a@example.com', '/login');

    expect(auth.generateEmailVerificationLink).toHaveBeenCalledWith('a@example.com', {
      url: 'http://localhost:4200/login',
    });
    expect(link).toBe('https://verify/abc');
  });

  it('reset-password calls generatePasswordResetLink with the public URL', async () => {
    const auth = buildFakeAuth();
    const provider = buildProvider(auth);

    const link = await provider.createEmailActionLink('reset-password', 'a@example.com', '/login');

    expect(auth.generatePasswordResetLink).toHaveBeenCalledWith('a@example.com', {
      url: 'http://localhost:4200/login',
    });
    expect(link).toBe('https://reset/abc');
  });

  it('change-email calls generateVerifyAndChangeEmailLink with the public URL', async () => {
    const auth = buildFakeAuth();
    const provider = buildProvider(auth);

    const link = await provider.createEmailActionLink('change-email', 'a@example.com', '/settings', 'b@example.com');

    expect(auth.generateVerifyAndChangeEmailLink).toHaveBeenCalledWith('a@example.com', 'b@example.com', {
      url: 'http://localhost:4200/settings',
    });
    expect(link).toBe('https://change-email/abc');
  });

  it('maps auth/email-already-exists on the change-email link to EmailInUseError', async () => {
    const auth = buildFakeAuth({
      generateVerifyAndChangeEmailLink: vi.fn(async () => {
        throw err('auth/email-already-exists');
      }),
    });
    const provider = buildProvider(auth);

    await expect(
      provider.createEmailActionLink('change-email', 'a@example.com', '/settings', 'taken@example.com'),
    ).rejects.toBeInstanceOf(EmailInUseError);
  });

  it('rethrows other codes on the change-email link', async () => {
    const boom = err('auth/internal-error');
    const auth = buildFakeAuth({
      generateVerifyAndChangeEmailLink: vi.fn(async () => {
        throw boom;
      }),
    });
    const provider = buildProvider(auth);

    await expect(
      provider.createEmailActionLink('change-email', 'a@example.com', '/settings', 'b@example.com'),
    ).rejects.toBe(boom);
  });
});

// Mirrors session-cookie.service.spec.ts's 'SessionCookieService.mint' describe block, against createSession.
describe('FirebaseIdentityProvider.createSession — error surface unchanged from SessionCookieService.mint', () => {
  it('verifyIdToken failures propagate (createSession has no internal catch — unlike the old mint, the caller now owns translation)', async () => {
    const auth = buildFakeAuth({
      verifyIdToken: vi.fn(async () => {
        throw new Error('bad token');
      }),
    });
    const provider = buildProvider(auth);

    await expect(provider.createSession({ uid: 'uid-123', idToken: 'BAD' } as PasswordProof)).rejects.toThrow(
      'bad token',
    );
    expect(auth.createSessionCookie).not.toHaveBeenCalled();
  });
});

// Mirrors session-cookie.service.spec.ts's 'SessionCookieService.revokeFromCookie' describe block, against endSession.
describe('FirebaseIdentityProvider.endSession', () => {
  it('revokes the session even when logout runs in the same wall-second it was minted', async () => {
    vi.useFakeTimers();
    try {
      const cookieIatSec = 1_700_000_000;
      // Clock sits 300ms into the cookie's own second — logout races the
      // second boundary, the exact condition that produced the e2e flake.
      vi.setSystemTime(new Date(cookieIatSec * 1000 + 300));
      const auth = buildRevocationModelAuth('uid-abc', cookieIatSec);
      const provider = buildProvider(auth);

      const pending = provider.endSession('valid.cookie');
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
    const cookieIatSec = Math.floor(Date.now() / 1000) - 3600;
    const auth = buildRevocationModelAuth('uid-abc', cookieIatSec);
    const provider = buildProvider(auth);

    await provider.endSession('valid.cookie');

    expect(auth.verifySessionCookie).toHaveBeenCalledWith('valid.cookie', true);
    expect(auth.revokeRefreshTokens).toHaveBeenCalledTimes(1);
    expect(auth.revokeRefreshTokens).toHaveBeenCalledWith('uid-abc');
    await expect(auth.verifySessionCookie('valid.cookie', true)).rejects.toThrow();
  });

  it('gives up after LOGOUT_REVOKE_MAX_ATTEMPTS when revocation never confirms', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(1_700_000_000 * 1000 + 300));
      const verifySessionCookie = vi.fn(async () => ({ uid: 'uid-abc', iat: 1_700_000_000 }));
      const revokeRefreshTokens = vi.fn(async () => undefined);
      const auth = { ...buildFakeAuth(), verifySessionCookie, revokeRefreshTokens };
      const provider = buildProvider(auth);

      const pending = provider.endSession('stubborn.cookie');
      await vi.advanceTimersByTimeAsync(20_000);
      await pending;

      expect(revokeRefreshTokens).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('treats an already-invalid token as a silent no-op (no revoke call)', async () => {
    const verifySessionCookie = vi.fn(async () => {
      throw new Error('auth/session-cookie-revoked');
    });
    const revokeRefreshTokens = vi.fn(async () => undefined);
    const auth = { ...buildFakeAuth(), verifySessionCookie, revokeRefreshTokens };
    const provider = buildProvider(auth);

    await expect(provider.endSession('already.revoked')).resolves.toBeUndefined();
    expect(verifySessionCookie).toHaveBeenCalledWith('already.revoked', true);
    expect(revokeRefreshTokens).not.toHaveBeenCalled();
  });

  it('sleeps exactly to the next-second boundary plus the margin before retrying', async () => {
    vi.useFakeTimers();
    try {
      const cookieIatSec = 1_700_000_000;
      vi.setSystemTime(new Date(cookieIatSec * 1000 + 300));
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

      let confirmCalls = 0;
      const verifySessionCookie = vi.fn(async () => {
        confirmCalls++;
        if (confirmCalls === 1) return { uid: 'uid-abc', iat: cookieIatSec }; // initial decode
        if (confirmCalls === 2) return { uid: 'uid-abc', iat: cookieIatSec }; // first confirm: NOT revoked
        throw new Error('revoked'); // second confirm: revoked
      });
      const revokeRefreshTokens = vi.fn(async () => undefined);
      const auth = { ...buildFakeAuth(), verifySessionCookie, revokeRefreshTokens };
      const provider = buildProvider(auth);

      const pending = provider.endSession('valid.cookie');
      await vi.advanceTimersByTimeAsync(5000);
      await pending;

      const sleepDelays = setTimeoutSpy.mock.calls.map((c) => c[1]);
      expect(sleepDelays).toContain(950);
      expect(sleepDelays).not.toContain(1550);
    } finally {
      vi.useRealTimers();
    }
  });

  it('is a no-op when the token is already invalid (no uid to revoke)', async () => {
    const auth = {
      ...buildFakeAuth(),
      verifySessionCookie: vi.fn(async () => {
        throw new Error('expired');
      }),
      revokeRefreshTokens: vi.fn(),
    };
    const provider = buildProvider(auth);

    await provider.endSession('expired.cookie');
    expect(auth.revokeRefreshTokens).not.toHaveBeenCalled();
  });
});

// Mirrors revoke-sessions.spec.ts's 'revokeAllUserSessions' describe block, against revokeAllSessions.
describe('FirebaseIdentityProvider.revokeAllSessions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    delete process.env['FIREBASE_AUTH_EMULATOR_HOST'];
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env['FIREBASE_AUTH_EMULATOR_HOST'];
  });

  it('revokes twice, the second strictly past the next second boundary', async () => {
    vi.setSystemTime(new Date('2026-07-12T12:00:00.400Z'));
    const auth = buildFakeAuth();
    const provider = buildProvider(auth);

    const done = provider.revokeAllSessions('u1');
    await vi.advanceTimersByTimeAsync(0);
    expect(auth.revokeRefreshTokens).toHaveBeenCalledTimes(1);

    // 600ms remain to the boundary + margin — not yet elapsed at 500ms.
    await vi.advanceTimersByTimeAsync(500);
    expect(auth.revokeRefreshTokens).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(400);
    await done;
    expect(auth.revokeRefreshTokens).toHaveBeenCalledTimes(2);
    expect(auth.revokeRefreshTokens).toHaveBeenNthCalledWith(1, 'u1');
    expect(auth.revokeRefreshTokens).toHaveBeenNthCalledWith(2, 'u1');
  });

  it('revokes once with no sleep in emulator mode (revocation checks are ignored there)', async () => {
    process.env['FIREBASE_AUTH_EMULATOR_HOST'] = '127.0.0.1:9099';
    const auth = buildFakeAuth();
    const provider = buildProvider(auth);

    await provider.revokeAllSessions('u1');

    expect(auth.revokeRefreshTokens).toHaveBeenCalledTimes(1);
  });

  it('propagates a revoke failure to the caller (callers decide best-effort vs fatal)', async () => {
    const auth = buildFakeAuth({
      revokeRefreshTokens: vi.fn(async () => {
        throw new Error('revoke boom');
      }),
    });
    const provider = buildProvider(auth);

    await expect(provider.revokeAllSessions('u1')).rejects.toThrow('revoke boom');
  });
});

describe('InvalidCredentialsException passthrough (verifyPassword translation lives in FirebaseAuthRestClient)', () => {
  it('propagates InvalidCredentialsException from the REST client unchanged', async () => {
    const auth = buildFakeAuth();
    const rest = buildFakeRest({
      signInWithPassword: vi.fn(async () => {
        throw new InvalidCredentialsException();
      }),
    });
    const provider = buildProvider(auth, rest);

    await expect(provider.verifyPassword('a@example.com', 'wrong')).rejects.toBeInstanceOf(
      InvalidCredentialsException,
    );
  });
});

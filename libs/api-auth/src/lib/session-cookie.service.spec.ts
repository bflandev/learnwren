import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FIREBASE_AUTH } from '@learnwren/api-firebase';

import { InternalAuthException } from './errors/auth.exception';
import { SessionCookieService } from './session-cookie.service';

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

async function buildService(auth: FakeAuth): Promise<SessionCookieService> {
  const moduleRef = await Test.createTestingModule({
    providers: [SessionCookieService, { provide: FIREBASE_AUTH, useValue: auth }],
  }).compile();
  return moduleRef.get(SessionCookieService);
}

describe('SessionCookieService.mint', () => {
  beforeEach(() => vi.clearAllMocks());

  it('verifies the ID token with checkRevoked=true and returns the minted cookie', async () => {
    const auth = buildFakeAuth();
    const service = await buildService(auth);

    const result = await service.mint('ID-TOKEN');

    expect(auth.verifyIdToken).toHaveBeenCalledWith('ID-TOKEN', true);
    expect(auth.createSessionCookie).toHaveBeenCalledWith('ID-TOKEN', {
      expiresIn: 5 * 24 * 60 * 60 * 1000,
    });
    expect(result).toEqual({ cookie: 'COOKIE-VALUE', maxAgeSeconds: 5 * 24 * 60 * 60 });
  });

  it('throws InternalAuthException when verifyIdToken fails', async () => {
    const auth = buildFakeAuth({
      verifyIdToken: vi.fn(async () => {
        throw new Error('bad token');
      }),
    });
    const service = await buildService(auth);
    await expect(service.mint('BAD')).rejects.toBeInstanceOf(InternalAuthException);
    expect(auth.createSessionCookie).not.toHaveBeenCalled();
  });

  it('throws InternalAuthException when createSessionCookie fails', async () => {
    const auth = buildFakeAuth({
      createSessionCookie: vi.fn(async () => {
        throw new Error('mint failed');
      }),
    });
    const service = await buildService(auth);
    await expect(service.mint('ID-TOKEN')).rejects.toBeInstanceOf(InternalAuthException);
  });
});

describe('SessionCookieService.revokeFromCookie', () => {
  beforeEach(() => vi.clearAllMocks());

  it('revokes the session cookie even when logout runs in the same wall-second it was minted', async () => {
    vi.useFakeTimers();
    try {
      const cookieIatSec = 1_700_000_000;
      // Clock sits 300ms into the cookie's own second — logout races the
      // second boundary, the exact condition that produced the e2e flake.
      vi.setSystemTime(new Date(cookieIatSec * 1000 + 300));
      const auth = buildRevocationModelAuth(cookieIatSec);
      const service = await buildService(auth as unknown as FakeAuth);

      const pending = service.revokeFromCookie('valid.cookie');
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
    const service = await buildService(auth as unknown as FakeAuth);

    await service.revokeFromCookie('valid.cookie');

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
      const service = await buildService(auth as unknown as FakeAuth);

      const pending = service.revokeFromCookie('stubborn.cookie');
      await vi.advanceTimersByTimeAsync(20_000);
      await pending;

      expect(revokeRefreshTokens).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('treats an already-revoked cookie as a silent no-op (initial verify uses checkRevoked=true)', async () => {
    // The decode at the top of revokeFromCookie verifies with checkRevoked=true,
    // so a cookie that was already revoked elsewhere lands in the catch and the
    // method returns WITHOUT calling revokeRefreshTokens again. A BooleanLiteral
    // mutant flipping that `true` to `false` would let the stale cookie decode
    // and trigger a needless re-revoke.
    const verifySessionCookie = vi.fn(async (_cookie: string, checkRevoked: boolean) => {
      if (checkRevoked) throw new Error('auth/session-cookie-revoked');
      return { uid: 'uid-abc', iat: 1 };
    });
    const revokeRefreshTokens = vi.fn(async () => undefined);
    const auth = { ...buildFakeAuth(), verifySessionCookie, revokeRefreshTokens };
    const service = await buildService(auth as unknown as FakeAuth);

    await expect(service.revokeFromCookie('already.revoked')).resolves.toBeUndefined();
    expect(verifySessionCookie).toHaveBeenCalledWith('already.revoked', true);
    expect(revokeRefreshTokens).not.toHaveBeenCalled();
  });

  it('sleeps exactly to the next-second boundary plus the margin before retrying', async () => {
    // sleepPastNextSecond waits `1000 - (now % 1000) + LOGOUT_REVOKE_MARGIN_MS`.
    // An ArithmeticOperator mutant flipping the `-` to `+` would overshoot the
    // boundary by up to a full extra second. Pin the exact setTimeout delay: at
    // 300ms into a second the correct wait is 700 + 250 = 950ms (the mutant
    // would schedule 300 + 250 + 1000 = 1550ms).
    vi.useFakeTimers();
    try {
      const cookieIatSec = 1_700_000_000;
      vi.setSystemTime(new Date(cookieIatSec * 1000 + 300));
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

      // First confirm-after-revoke fails (forcing one sleep), second succeeds.
      let confirmCalls = 0;
      const verifySessionCookie = vi.fn(async (_cookie: string, checkRevoked: boolean) => {
        if (!checkRevoked) return { uid: 'uid-abc', iat: cookieIatSec };
        // checkRevoked path = the initial decode (call 1, succeeds) and the
        // post-revoke confirmation calls. Let the first confirm fail, the
        // second succeed.
        confirmCalls++;
        if (confirmCalls === 1) return { uid: 'uid-abc', iat: cookieIatSec }; // initial decode
        if (confirmCalls === 2) return { uid: 'uid-abc', iat: cookieIatSec }; // first confirm: NOT revoked
        throw new Error('revoked'); // second confirm: revoked
      });
      const revokeRefreshTokens = vi.fn(async () => undefined);
      const auth = { ...buildFakeAuth(), verifySessionCookie, revokeRefreshTokens };
      const service = await buildService(auth as unknown as FakeAuth);

      const pending = service.revokeFromCookie('valid.cookie');
      await vi.advanceTimersByTimeAsync(5000);
      await pending;

      const sleepDelays = setTimeoutSpy.mock.calls.map((c) => c[1]);
      expect(sleepDelays).toContain(950);
      expect(sleepDelays).not.toContain(1550);
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
    const service = await buildService(auth as unknown as FakeAuth);

    await service.revokeFromCookie(undefined);
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
    const service = await buildService(auth as unknown as FakeAuth);

    await expect(service.revokeFromCookie('expired.cookie')).resolves.toBeUndefined();
    expect(auth.revokeRefreshTokens).not.toHaveBeenCalled();
  });
});

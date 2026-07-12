import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FirebaseAuthHandle } from '@learnwren/api-firebase';

import { isAuthEmulator, revokeAllUserSessions } from './revoke-sessions';

function makeAuth() {
  return { revokeRefreshTokens: vi.fn(async () => undefined) };
}

describe('revokeAllUserSessions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    delete process.env['FIREBASE_AUTH_EMULATOR_HOST'];
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env['FIREBASE_AUTH_EMULATOR_HOST'];
  });

  it('revokes twice, the second strictly past the next second boundary', async () => {
    // Revocation has whole-second granularity: a cookie minted in the same
    // wall-second as the first revoke survives it. The second revoke's stamp
    // must land in a LATER second than the first.
    vi.setSystemTime(new Date('2026-07-12T12:00:00.400Z'));
    const auth = makeAuth();

    const done = revokeAllUserSessions(auth as unknown as FirebaseAuthHandle, 'u1');
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
    const auth = makeAuth();

    await revokeAllUserSessions(auth as unknown as FirebaseAuthHandle, 'u1');

    expect(auth.revokeRefreshTokens).toHaveBeenCalledTimes(1);
  });

  it('propagates a revoke failure to the caller (callers decide best-effort vs fatal)', async () => {
    const auth = makeAuth();
    auth.revokeRefreshTokens.mockRejectedValue(new Error('revoke boom'));

    await expect(
      revokeAllUserSessions(auth as unknown as FirebaseAuthHandle, 'u1'),
    ).rejects.toThrow('revoke boom');
  });
});

describe('isAuthEmulator', () => {
  afterEach(() => {
    delete process.env['FIREBASE_AUTH_EMULATOR_HOST'];
  });

  it('reflects the FIREBASE_AUTH_EMULATOR_HOST env var', () => {
    delete process.env['FIREBASE_AUTH_EMULATOR_HOST'];
    expect(isAuthEmulator()).toBe(false);
    process.env['FIREBASE_AUTH_EMULATOR_HOST'] = '127.0.0.1:9099';
    expect(isAuthEmulator()).toBe(true);
  });
});

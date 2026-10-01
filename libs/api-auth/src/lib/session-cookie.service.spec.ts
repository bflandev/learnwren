import { describe, expect, it, vi } from 'vitest';

import { InternalAuthException } from './errors/auth.exception';
import type { IdentityProvider, PasswordProof } from './identity/identity-provider.port';
import { SessionCookieService } from './session-cookie.service';

const PROOF: PasswordProof = { uid: 'uid-123' };

function buildIdentity(overrides: Partial<IdentityProvider> = {}): IdentityProvider {
  return {
    createSession: vi.fn(async () => ({ token: 'COOKIE-VALUE', maxAgeSeconds: 5 * 24 * 60 * 60 })),
    endSession: vi.fn(async () => undefined),
    ...overrides,
  } as unknown as IdentityProvider;
}

describe('SessionCookieService.mint', () => {
  it('mints a session via identity.createSession and returns {cookie, maxAgeSeconds}', async () => {
    const identity = buildIdentity();
    const service = new SessionCookieService(identity);

    const result = await service.mint(PROOF);

    expect(identity.createSession).toHaveBeenCalledWith(PROOF);
    expect(result).toEqual({ cookie: 'COOKIE-VALUE', maxAgeSeconds: 5 * 24 * 60 * 60 });
  });

  it('throws InternalAuthException when identity.createSession fails, without leaking the raw error', async () => {
    // Controller notes: the error surface must not change — a raw failure
    // from the identity provider becomes a typed 500, never the original.
    const identity = buildIdentity({
      createSession: vi.fn(async () => {
        throw new Error('createSessionCookie failed');
      }),
    });
    const service = new SessionCookieService(identity);

    await expect(service.mint(PROOF)).rejects.toBeInstanceOf(InternalAuthException);
  });
});

describe('SessionCookieService.revokeFromCookie', () => {
  it('is a no-op when the cookie is undefined', async () => {
    const identity = buildIdentity();
    const service = new SessionCookieService(identity);

    await service.revokeFromCookie(undefined);

    expect(identity.endSession).not.toHaveBeenCalled();
  });

  it('delegates to identity.endSession when a cookie is present', async () => {
    const identity = buildIdentity();
    const service = new SessionCookieService(identity);

    await service.revokeFromCookie('valid.cookie');

    expect(identity.endSession).toHaveBeenCalledWith('valid.cookie');
  });
});

import { describe, expect, it } from 'vitest';

import { InvalidIdTokenException, RecentSignInRequiredException } from './auth.exception';

describe('auth exceptions', () => {
  it('InvalidIdTokenException carries the 401 contract', () => {
    const e = new InvalidIdTokenException();
    expect(e.code).toBe('INVALID_ID_TOKEN');
    expect(e.status).toBe(401);
    expect(e.message).toBe('ID token is invalid or has been revoked.');
  });

  it('RecentSignInRequiredException carries the 401 contract', () => {
    const e = new RecentSignInRequiredException();
    expect(e.code).toBe('RECENT_SIGN_IN_REQUIRED');
    expect(e.status).toBe(401);
    expect(e.message).toBe('Recent sign-in required to mint a session cookie.');
  });
});

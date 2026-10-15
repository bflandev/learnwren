import { describe, expect, it } from 'vitest';
import { ProfileInvalidException } from './profile.exception';
import * as profileErrors from './profile.exception';
import { PROFILE_ERROR_CODES } from './profile-error.codes';

describe('ProfileInvalidException', () => {
  it('carries code, status, and field+reason details', () => {
    const ex = new ProfileInvalidException('displayName', 'must be 1-80 characters');
    expect(ex.code).toBe('PROFILE_INVALID');
    expect(ex.status).toBe(400);
    expect(ex.message).toBe('Profile is invalid.');
    expect(ex.details).toEqual({ field: 'displayName', reason: 'must be 1-80 characters' });
  });
});

describe('PROFILE_ERROR_CODES', () => {
  it('lists exactly the codes the profile exceptions carry', () => {
    const thrown = new Set([new profileErrors.ProfileInvalidException('displayName', 'x')].map((e) => e.code));
    expect([...PROFILE_ERROR_CODES].sort()).toEqual([...thrown].sort());
  });
});

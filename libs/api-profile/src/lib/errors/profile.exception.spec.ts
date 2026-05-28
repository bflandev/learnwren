import { describe, expect, it } from 'vitest';
import { ProfileInvalidException } from './profile.exception';

describe('ProfileInvalidException', () => {
  it('carries code, status, and field+reason details', () => {
    const ex = new ProfileInvalidException('displayName', 'must be 1-80 characters');
    expect(ex.code).toBe('PROFILE_INVALID');
    expect(ex.status).toBe(400);
    expect(ex.message).toBe('Profile is invalid.');
    expect(ex.details).toEqual({ field: 'displayName', reason: 'must be 1-80 characters' });
  });
});

import { describe, expect, it } from 'vitest';
import { PROFILE_INVALID, type ProfileView, type UpdateProfileInput } from './profile';

describe('profile types', () => {
  it('PROFILE_INVALID is the wire error code', () => {
    expect(PROFILE_INVALID).toBe('PROFILE_INVALID');
  });

  it('ProfileView shape compiles with all required fields', () => {
    const view: ProfileView = {
      uid: 'u-1' as ProfileView['uid'],
      email: 'a@b.c',
      displayName: 'A',
      biography: '',
      role: 'STUDENT',
      emailVerified: true,
    };
    expect(view.displayName).toBe('A');
  });

  it('UpdateProfileInput shape compiles with displayName + biography', () => {
    const input: UpdateProfileInput = { displayName: 'A', biography: 'hi' };
    expect(input.biography).toBe('hi');
  });
});

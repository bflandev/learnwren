import { describe, expect, it } from 'vitest';
import {
  PROFILE_INVALID,
  PROFILE_PICTURE_DIMENSIONS_TOO_SMALL,
  PROFILE_PICTURE_DECODE_FAILED,
  PROFILE_PICTURE_TOO_LARGE,
  UNSUPPORTED_PROFILE_PICTURE_FORMAT,
  EMAIL_INVALID,
  EMAIL_UNCHANGED,
  CURRENT_PASSWORD_INVALID,
  EMAIL_ALREADY_IN_USE,
  EMAIL_CHANGE_FAILED,
  type ProfileView,
  type UpdateProfileInput,
  type ChangeEmailRequest,
  type ConfirmEmailChangeResponse,
  type EmailChangeErrorBody,
} from './profile';

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

describe('ProfileView — photoUrl', () => {
  it('accepts a view with photoUrl set', () => {
    const v: ProfileView = {
      uid: 'u1' as ProfileView['uid'],
      email: 'a@b.com',
      displayName: 'Ada',
      biography: '',
      photoUrl: 'https://example.com/p/u1/avatar.jpg?v=…',
      role: 'STUDENT',
      emailVerified: true,
    };
    expect(v.photoUrl).toContain('avatar.jpg');
  });

  it('accepts a view without photoUrl', () => {
    const v: ProfileView = {
      uid: 'u1' as ProfileView['uid'],
      email: 'a@b.com',
      displayName: 'Ada',
      biography: '',
      role: 'STUDENT',
      emailVerified: true,
    };
    expect(v.photoUrl).toBeUndefined();
  });
});

describe('Picture wire-error codes', () => {
  it('exposes the four picture codes as string literals', () => {
    expect(PROFILE_PICTURE_DIMENSIONS_TOO_SMALL).toBe('PROFILE_PICTURE_DIMENSIONS_TOO_SMALL');
    expect(PROFILE_PICTURE_DECODE_FAILED).toBe('PROFILE_PICTURE_DECODE_FAILED');
    expect(PROFILE_PICTURE_TOO_LARGE).toBe('PROFILE_PICTURE_TOO_LARGE');
    expect(UNSUPPORTED_PROFILE_PICTURE_FORMAT).toBe('UNSUPPORTED_PROFILE_PICTURE_FORMAT');
  });
});

describe('email-change wire types', () => {
  it('exposes the five email-change error code constants', () => {
    expect([
      EMAIL_INVALID,
      EMAIL_UNCHANGED,
      CURRENT_PASSWORD_INVALID,
      EMAIL_ALREADY_IN_USE,
      EMAIL_CHANGE_FAILED,
    ]).toEqual([
      'EMAIL_INVALID',
      'EMAIL_UNCHANGED',
      'CURRENT_PASSWORD_INVALID',
      'EMAIL_ALREADY_IN_USE',
      'EMAIL_CHANGE_FAILED',
    ]);
  });

  it('shapes the request, confirm response, and error body', () => {
    const req: ChangeEmailRequest = { newEmail: 'new@x.com', currentPassword: 'pw' };
    const ok: ConfirmEmailChangeResponse = { changed: true, email: 'new@x.com' };
    const noop: ConfirmEmailChangeResponse = { changed: false };
    const err: EmailChangeErrorBody = {
      error: { code: EMAIL_ALREADY_IN_USE, message: 'taken', details: { field: 'newEmail' } },
    };
    expect(req.newEmail).toBe('new@x.com');
    expect(ok.changed).toBe(true);
    expect(noop.changed).toBe(false);
    expect(err.error.details?.field).toBe('newEmail');
  });
});

import { describe, expect, it } from 'vitest';

import { EmailActionInvalidError, EmailInUseError } from './identity.errors';

describe('EmailInUseError', () => {
  it('names and messages itself', () => {
    const err = new EmailInUseError();
    expect(err.name).toBe('EmailInUseError');
    expect(err.message).toBe('Email already in use');
  });
});

describe('EmailActionInvalidError', () => {
  it('names and messages itself', () => {
    const err = new EmailActionInvalidError();
    expect(err.name).toBe('EmailActionInvalidError');
    expect(err.message).toBe('Email action token is invalid or expired');
  });
});

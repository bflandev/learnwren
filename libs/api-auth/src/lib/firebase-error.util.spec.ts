import { describe, expect, it } from 'vitest';

import { isFirebaseError } from './firebase-error.util';

describe('isFirebaseError', () => {
  it('is true for an object carrying a string code', () => {
    expect(isFirebaseError({ code: 'auth/user-not-found' })).toBe(true);
    expect(
      isFirebaseError(Object.assign(new Error('x'), { code: 'auth/internal-error' })),
    ).toBe(true);
  });

  it('is false for an object with no code property', () => {
    expect(isFirebaseError({})).toBe(false);
    expect(isFirebaseError(new Error('plain'))).toBe(false);
  });

  it('is false for null and undefined', () => {
    expect(isFirebaseError(null)).toBe(false);
    expect(isFirebaseError(undefined)).toBe(false);
  });

  it('is false for primitive throws (string, number, boolean)', () => {
    expect(isFirebaseError('auth/user-not-found')).toBe(false);
    expect(isFirebaseError(42)).toBe(false);
    expect(isFirebaseError(true)).toBe(false);
  });
});

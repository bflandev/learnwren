import { describe, expect, it } from 'vitest';

import { firebaseTargetMode } from './firebase-target';

describe('firebaseTargetMode', () => {
  it('returns "emulator" when the input is undefined', () => {
    expect(firebaseTargetMode(undefined)).toBe('emulator');
  });

  it('returns "emulator" when the input is the empty string', () => {
    expect(firebaseTargetMode('')).toBe('emulator');
  });

  it('returns "production" when the input is exactly "production"', () => {
    expect(firebaseTargetMode('production')).toBe('production');
  });

  it('returns "emulator" when the input is "emulator"', () => {
    expect(firebaseTargetMode('emulator')).toBe('emulator');
  });

  it('returns "emulator" when the input is a garbage value', () => {
    expect(firebaseTargetMode('banana')).toBe('emulator');
  });

  it('treats casing strictly — "PRODUCTION" is not "production"', () => {
    expect(firebaseTargetMode('PRODUCTION')).toBe('emulator');
  });
});

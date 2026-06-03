import { describe, expect, it } from 'vitest';

import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_REQUIREMENT_ORDER,
  evaluatePasswordPolicy,
} from './password-policy';

describe('evaluatePasswordPolicy', () => {
  it('exposes the canonical min length and requirement order', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(12);
    expect(PASSWORD_REQUIREMENT_ORDER).toEqual([
      'MIN_LENGTH',
      'UPPERCASE',
      'LOWERCASE',
      'DIGIT',
      'SPECIAL',
    ]);
  });

  it('returns [] when all requirements are met at exactly length 12', () => {
    expect(evaluatePasswordPolicy('Aa1!aaaaaaaa')).toEqual([]);
  });

  it('flags MIN_LENGTH at length 11 (boundary)', () => {
    expect(evaluatePasswordPolicy('Aa1!aaaaaaa')).toEqual(['MIN_LENGTH']);
  });

  it('flags every requirement for an empty string', () => {
    expect(evaluatePasswordPolicy('')).toEqual([
      'MIN_LENGTH',
      'UPPERCASE',
      'LOWERCASE',
      'DIGIT',
      'SPECIAL',
    ]);
  });

  it('flags UPPERCASE only', () => {
    expect(evaluatePasswordPolicy('aaa1!aaaaaaaa')).toEqual(['UPPERCASE']);
  });

  it('flags LOWERCASE only', () => {
    expect(evaluatePasswordPolicy('AAA1!AAAAAAAA')).toEqual(['LOWERCASE']);
  });

  it('flags DIGIT only', () => {
    expect(evaluatePasswordPolicy('AaaaaA!aaaaaa')).toEqual(['DIGIT']);
  });

  it('flags SPECIAL only', () => {
    expect(evaluatePasswordPolicy('Aaaaa1aaaaaaa')).toEqual(['SPECIAL']);
  });

  it('preserves canonical order regardless of which checks fail', () => {
    expect(evaluatePasswordPolicy('aaaaa!aaaaaaa')).toEqual([
      'UPPERCASE',
      'DIGIT',
    ]);
  });
});

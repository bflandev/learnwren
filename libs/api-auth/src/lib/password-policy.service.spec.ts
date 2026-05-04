import { describe, expect, it } from 'vitest';

import { PasswordPolicyService } from './password-policy.service';

const svc = new PasswordPolicyService();

describe('PasswordPolicyService', () => {
  it('accepts a password meeting all four char-class requirements at length 12', () => {
    expect(svc.validate('Aa1!aaaaaaaa')).toEqual({ valid: true });
  });

  it('rejects an 11-char password as MIN_LENGTH', () => {
    expect(svc.validate('Aa1!aaaaaaa')).toEqual({
      valid: false,
      unmet: ['MIN_LENGTH'],
    });
  });

  it('flags MIN_LENGTH and the missing classes for an empty string', () => {
    expect(svc.validate('')).toEqual({
      valid: false,
      unmet: ['MIN_LENGTH', 'UPPERCASE', 'LOWERCASE', 'DIGIT', 'SPECIAL'],
    });
  });

  it('flags UPPERCASE when missing', () => {
    expect(svc.validate('aaa1!aaaaaaaa')).toEqual({
      valid: false,
      unmet: ['UPPERCASE'],
    });
  });

  it('flags LOWERCASE when missing', () => {
    expect(svc.validate('AAA1!AAAAAAAA')).toEqual({
      valid: false,
      unmet: ['LOWERCASE'],
    });
  });

  it('flags DIGIT when missing', () => {
    expect(svc.validate('AaaaaA!aaaaaa')).toEqual({
      valid: false,
      unmet: ['DIGIT'],
    });
  });

  it('flags SPECIAL when missing', () => {
    expect(svc.validate('Aaaaa1aaaaaaa')).toEqual({
      valid: false,
      unmet: ['SPECIAL'],
    });
  });

  it('preserves the policy-requirement order in unmet[] regardless of input ordering', () => {
    const result = svc.validate('aaaaa!aaaaaaa');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.unmet).toEqual(['UPPERCASE', 'DIGIT']);
    }
  });
});

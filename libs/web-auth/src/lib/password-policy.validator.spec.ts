import { FormControl } from '@angular/forms';
import { describe, expect, it } from 'vitest';

import {
  PASSWORD_REQUIREMENT_PROSE,
  passwordPolicyValidator,
} from './password-policy.validator';

describe('PASSWORD_REQUIREMENT_PROSE', () => {
  it('maps every policy requirement to its exact prose', () => {
    expect(PASSWORD_REQUIREMENT_PROSE).toEqual({
      MIN_LENGTH: 'at least 12 characters',
      UPPERCASE: 'at least one uppercase letter',
      LOWERCASE: 'at least one lowercase letter',
      DIGIT: 'at least one digit',
      SPECIAL: 'at least one special character',
    });
  });
});

describe('passwordPolicyValidator', () => {
  const validator = passwordPolicyValidator();

  it('returns null for a password meeting all four char-class requirements at length 12', () => {
    expect(validator(new FormControl('Aa1!aaaaaaaa'))).toBeNull();
  });

  it('returns { passwordPolicy: { unmet: ["MIN_LENGTH"] } } for length 11', () => {
    expect(validator(new FormControl('Aa1!aaaaaaa'))).toEqual({
      passwordPolicy: { unmet: ['MIN_LENGTH'] },
    });
  });

  it('flags all five requirements for an empty string', () => {
    expect(validator(new FormControl(''))).toEqual({
      passwordPolicy: {
        unmet: ['MIN_LENGTH', 'UPPERCASE', 'LOWERCASE', 'DIGIT', 'SPECIAL'],
      },
    });
  });

  it('flags UPPERCASE only', () => {
    expect(validator(new FormControl('aaa1!aaaaaaaa'))).toEqual({
      passwordPolicy: { unmet: ['UPPERCASE'] },
    });
  });

  it('returns null for a non-string null control value (lets Required validator handle it)', () => {
    expect(validator(new FormControl(null))).toBeNull();
  });
});

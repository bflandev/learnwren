import { describe, expect, it } from 'vitest';

import {
  CurrentPasswordInvalidException,
  NewPasswordWeakException,
  PasswordChangeException,
  PasswordChangeFailedException,
  PasswordUnchangedException,
} from './password-change.exception';

describe('password-change exceptions', () => {
  it('CURRENT_PASSWORD_INVALID maps to 400 on the currentPassword field', () => {
    const e = new CurrentPasswordInvalidException();
    expect(e).toBeInstanceOf(PasswordChangeException);
    expect(e.code).toBe('CURRENT_PASSWORD_INVALID');
    expect(e.status).toBe(400);
    expect(e.details).toEqual({ field: 'currentPassword' });
  });

  it('NEW_PASSWORD_WEAK carries the unmet requirements on the newPassword field', () => {
    const e = new NewPasswordWeakException(['MIN_LENGTH', 'DIGIT']);
    expect(e.code).toBe('NEW_PASSWORD_WEAK');
    expect(e.status).toBe(400);
    expect(e.details).toEqual({ field: 'newPassword', unmetRequirements: ['MIN_LENGTH', 'DIGIT'] });
  });

  it('PASSWORD_UNCHANGED maps to 400 on the newPassword field', () => {
    const e = new PasswordUnchangedException();
    expect(e.code).toBe('PASSWORD_UNCHANGED');
    expect(e.status).toBe(400);
    expect(e.details).toEqual({ field: 'newPassword' });
  });

  it('PASSWORD_CHANGE_FAILED maps to 500 with no details', () => {
    const e = new PasswordChangeFailedException();
    expect(e.code).toBe('PASSWORD_CHANGE_FAILED');
    expect(e.status).toBe(500);
    expect(e.details).toBeUndefined();
  });
});

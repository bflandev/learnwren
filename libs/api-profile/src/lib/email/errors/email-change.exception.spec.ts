import { describe, expect, it } from 'vitest';

import {
  CurrentPasswordInvalidException,
  EmailAlreadyInUseException,
  EmailChangeFailedException,
  EmailInvalidException,
  EmailUnchangedException,
} from './email-change.exception';

describe('email-change exceptions', () => {
  it('maps each exception to its code, status, and field', () => {
    expect(new EmailInvalidException()).toMatchObject({
      code: 'EMAIL_INVALID', status: 400, details: { field: 'newEmail' },
    });
    expect(new EmailUnchangedException()).toMatchObject({
      code: 'EMAIL_UNCHANGED', status: 400, details: { field: 'newEmail' },
    });
    expect(new CurrentPasswordInvalidException()).toMatchObject({
      code: 'CURRENT_PASSWORD_INVALID', status: 400, details: { field: 'currentPassword' },
    });
    expect(new EmailAlreadyInUseException()).toMatchObject({
      code: 'EMAIL_ALREADY_IN_USE', status: 409, details: { field: 'newEmail' },
    });
    expect(new EmailChangeFailedException()).toMatchObject({
      code: 'EMAIL_CHANGE_FAILED', status: 500,
    });
  });
});

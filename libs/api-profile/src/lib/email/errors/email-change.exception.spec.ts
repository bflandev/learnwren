import { describe, expect, it } from 'vitest';

import {
  CurrentPasswordInvalidException,
  EmailAlreadyInUseException,
  EmailChangeFailedException,
  EmailInvalidException,
  EmailUnchangedException,
} from './email-change.exception';
import * as emailErrors from './email-change.exception';
import { EMAIL_CHANGE_ERROR_CODES } from './email-change-error.codes';

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

describe('EMAIL_CHANGE_ERROR_CODES', () => {
  it('lists exactly the codes the email-change exceptions carry', () => {
    const thrown = new Set([new emailErrors.EmailInvalidException(), new emailErrors.EmailUnchangedException(), new emailErrors.CurrentPasswordInvalidException(), new emailErrors.EmailAlreadyInUseException(), new emailErrors.EmailChangeFailedException()].map((e) => e.code));
    expect([...EMAIL_CHANGE_ERROR_CODES].sort()).toEqual([...thrown].sort());
  });
});

import type { PolicyRequirement } from '@learnwren/api-auth';

import type { PasswordChangeErrorCode } from './password-change-error.codes';

export class PasswordChangeException extends Error {
  constructor(
    public readonly code: PasswordChangeErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'PasswordChangeException';
  }
}

export class CurrentPasswordInvalidException extends PasswordChangeException {
  constructor() {
    super('CURRENT_PASSWORD_INVALID', 'Current password is incorrect.', 400, {
      field: 'currentPassword',
    });
  }
}

export class NewPasswordWeakException extends PasswordChangeException {
  constructor(unmetRequirements: PolicyRequirement[]) {
    super('NEW_PASSWORD_WEAK', 'New password does not meet complexity requirements.', 400, {
      field: 'newPassword',
      unmetRequirements,
    });
  }
}

export class PasswordUnchangedException extends PasswordChangeException {
  constructor() {
    super('PASSWORD_UNCHANGED', 'New password must be different from the current password.', 400, {
      field: 'newPassword',
    });
  }
}

export class PasswordChangeFailedException extends PasswordChangeException {
  constructor(options?: ErrorOptions) {
    super(
      'PASSWORD_CHANGE_FAILED',
      'We could not change your password. Please try again.',
      500,
      undefined,
      options,
    );
  }
}

import type { EmailChangeErrorCode } from './email-change-error.codes';

export class EmailChangeException extends Error {
  constructor(
    public readonly code: EmailChangeErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'EmailChangeException';
  }
}

export class EmailInvalidException extends EmailChangeException {
  constructor() {
    super('EMAIL_INVALID', 'Enter a valid email address.', 400, { field: 'newEmail' });
  }
}

export class EmailUnchangedException extends EmailChangeException {
  constructor() {
    super('EMAIL_UNCHANGED', 'That is already your email address.', 400, { field: 'newEmail' });
  }
}

export class CurrentPasswordInvalidException extends EmailChangeException {
  constructor() {
    super('CURRENT_PASSWORD_INVALID', 'Current password is incorrect.', 400, {
      field: 'currentPassword',
    });
  }
}

export class EmailAlreadyInUseException extends EmailChangeException {
  constructor() {
    super('EMAIL_ALREADY_IN_USE', 'That email address is already in use.', 409, {
      field: 'newEmail',
    });
  }
}

export class EmailChangeFailedException extends EmailChangeException {
  constructor(options?: ErrorOptions) {
    super(
      'EMAIL_CHANGE_FAILED',
      'We could not process the email change. Please try again.',
      500,
      undefined,
      options,
    );
  }
}

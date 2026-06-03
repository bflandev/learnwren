import type { AdminUsersErrorCode } from '@learnwren/shared-data-models';

export class AdminUsersException extends Error {
  constructor(
    public readonly code: AdminUsersErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'AdminUsersException';
  }
}

export class UserNotFoundException extends AdminUsersException {
  constructor() {
    super('USER_NOT_FOUND', 'No such user.', 404);
  }
}

import type { AdminInstructorApplicationErrorCode } from '@learnwren/shared-data-models';

export class AdminInstructorApplicationException extends Error {
  constructor(
    public readonly code: AdminInstructorApplicationErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AdminInstructorApplicationException';
  }
}

export class ApplicationNotFoundException extends AdminInstructorApplicationException {
  constructor() {
    super('APPLICATION_NOT_FOUND', 'No such instructor application.', 404);
  }
}

export class ApplicationNotPendingException extends AdminInstructorApplicationException {
  constructor() {
    super('APPLICATION_NOT_PENDING', 'This application has already been resolved.', 409);
  }
}

export class ApplicantNotVerifiedException extends AdminInstructorApplicationException {
  constructor() {
    super('APPLICANT_NOT_VERIFIED', 'The applicant must verify their email before approval.', 409);
  }
}

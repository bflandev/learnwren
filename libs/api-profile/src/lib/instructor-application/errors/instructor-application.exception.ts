import type { InstructorApplicationErrorCode } from './instructor-application-error.codes';

export class InstructorApplicationException extends Error {
  constructor(
    public readonly code: InstructorApplicationErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'InstructorApplicationException';
  }
}

export class InstructorApplicationInvalidException extends InstructorApplicationException {
  constructor(field: 'statement' | 'expertise') {
    super('INSTRUCTOR_APPLICATION_INVALID', 'Both fields are required.', 400, { field });
  }
}

export class InstructorApplicationExistsException extends InstructorApplicationException {
  constructor() {
    super(
      'INSTRUCTOR_APPLICATION_EXISTS',
      'You already have an application under review.',
      409,
    );
  }
}

export class AlreadyInstructorException extends InstructorApplicationException {
  constructor() {
    super('ALREADY_INSTRUCTOR', 'You are already an instructor.', 409);
  }
}

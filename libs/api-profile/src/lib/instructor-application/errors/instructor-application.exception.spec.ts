import { describe, expect, it } from 'vitest';

import {
  AlreadyInstructorException,
  InstructorApplicationExistsException,
  InstructorApplicationInvalidException,
} from './instructor-application.exception';

describe('instructor-application exceptions', () => {
  it('maps each exception to its code, status, and details', () => {
    expect(new InstructorApplicationInvalidException('statement')).toMatchObject({
      code: 'INSTRUCTOR_APPLICATION_INVALID',
      status: 400,
      details: { field: 'statement' },
    });
    expect(new InstructorApplicationInvalidException('expertise')).toMatchObject({
      code: 'INSTRUCTOR_APPLICATION_INVALID',
      status: 400,
      details: { field: 'expertise' },
    });
    expect(new InstructorApplicationExistsException()).toMatchObject({
      code: 'INSTRUCTOR_APPLICATION_EXISTS',
      status: 409,
    });
    expect(new AlreadyInstructorException()).toMatchObject({
      code: 'ALREADY_INSTRUCTOR',
      status: 409,
    });
  });
});

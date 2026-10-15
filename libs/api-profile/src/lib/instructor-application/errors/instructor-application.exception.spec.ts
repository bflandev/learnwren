import { describe, expect, it } from 'vitest';

import {
  AlreadyInstructorException,
  InstructorApplicationExistsException,
  InstructorApplicationInvalidException,
} from './instructor-application.exception';
import * as applicationErrors from './instructor-application.exception';
import { INSTRUCTOR_APPLICATION_ERROR_CODES } from './instructor-application-error.codes';

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

describe('INSTRUCTOR_APPLICATION_ERROR_CODES', () => {
  it('lists exactly the codes the instructor-application exceptions carry', () => {
    const thrown = new Set([new applicationErrors.InstructorApplicationInvalidException('statement'), new applicationErrors.InstructorApplicationExistsException(), new applicationErrors.AlreadyInstructorException()].map((e) => e.code));
    expect([...INSTRUCTOR_APPLICATION_ERROR_CODES].sort()).toEqual([...thrown].sort());
  });
});

import { describe, it, expect } from 'vitest';

import {
  ApplicationNotFoundException,
  ApplicationNotPendingException,
  ApplicantNotVerifiedException,
  DeclineReasonInvalidException,
  InvalidStatusFilterException,
} from './admin-instructor-application.exception';

describe('admin instructor-application exceptions', () => {
  it('NotFound -> 404 / APPLICATION_NOT_FOUND', () => {
    const e = new ApplicationNotFoundException();
    expect([e.code, e.status]).toEqual(['APPLICATION_NOT_FOUND', 404]);
  });
  it('NotPending -> 409 / APPLICATION_NOT_PENDING', () => {
    const e = new ApplicationNotPendingException();
    expect([e.code, e.status]).toEqual(['APPLICATION_NOT_PENDING', 409]);
  });
  it('NotVerified -> 409 / APPLICANT_NOT_VERIFIED', () => {
    const e = new ApplicantNotVerifiedException();
    expect([e.code, e.status]).toEqual(['APPLICANT_NOT_VERIFIED', 409]);
  });
  it('DeclineReasonInvalid and InvalidStatusFilter carry a readable message and the base name', () => {
    const reason = new DeclineReasonInvalidException();
    const filter = new InvalidStatusFilterException();
    expect(reason.message).toContain('2000 characters');
    expect(filter.message).toContain('PENDING, APPROVED or DECLINED');
    expect(reason.name).toBe('AdminInstructorApplicationException');
  });
});

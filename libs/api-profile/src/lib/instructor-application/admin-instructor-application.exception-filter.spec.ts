import { describe, expect, it, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';

import { AdminInstructorApplicationExceptionFilter } from './admin-instructor-application.exception-filter';
import {
  ApplicationNotFoundException,
  ApplicationNotPendingException,
  ApplicantNotVerifiedException,
} from './errors/admin-instructor-application.exception';
import { AuthException } from '@learnwren/api-auth';

function mockHost() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('AdminInstructorApplicationExceptionFilter', () => {
  it('renders ApplicationNotFoundException as HTTP 404 with APPLICATION_NOT_FOUND', () => {
    const { host, status, json } = mockHost();
    new AdminInstructorApplicationExceptionFilter().catch(
      new ApplicationNotFoundException(),
      host,
    );
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'APPLICATION_NOT_FOUND',
        message: 'No such instructor application.',
      },
    });
  });

  it('renders ApplicationNotPendingException as HTTP 409 with APPLICATION_NOT_PENDING', () => {
    const { host, status, json } = mockHost();
    new AdminInstructorApplicationExceptionFilter().catch(
      new ApplicationNotPendingException(),
      host,
    );
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'APPLICATION_NOT_PENDING',
        message: 'This application has already been resolved.',
      },
    });
  });

  it('renders ApplicantNotVerifiedException as HTTP 409 with APPLICANT_NOT_VERIFIED', () => {
    const { host, status, json } = mockHost();
    new AdminInstructorApplicationExceptionFilter().catch(
      new ApplicantNotVerifiedException(),
      host,
    );
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'APPLICANT_NOT_VERIFIED',
        message: 'The applicant must verify their email before approval.',
      },
    });
  });

  it('maps a generic HttpException to its status code', () => {
    const { host, status, json } = mockHost();
    new AdminInstructorApplicationExceptionFilter().catch(new HttpException('nope', 403), host);
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'FORBIDDEN', message: 'nope' },
    });
  });

  it('maps an AuthException (e.g. guard 401) to its status code', () => {
    const { host, status, json } = mockHost();
    new AdminInstructorApplicationExceptionFilter().catch(
      new AuthException('UNAUTHENTICATED', 'Not authenticated.', 401),
      host,
    );
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'UNAUTHENTICATED', message: 'Not authenticated.' },
    });
  });
});

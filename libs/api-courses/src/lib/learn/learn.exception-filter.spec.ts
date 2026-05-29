import { ArgumentsHost, BadRequestException, HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { InsufficientRoleException } from '@learnwren/api-auth';

import { LessonNotFoundException, NotLessonOwnerException } from './errors/learn.exception';
import { LearnExceptionFilter } from './learn.exception-filter';

function buildHost(): {
  host: ArgumentsHost;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
} {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({}),
      getNext: () => undefined,
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('LearnExceptionFilter', () => {
  it('maps a LessonNotFoundException to 404 LESSON_NOT_FOUND', () => {
    const filter = new LearnExceptionFilter();
    const { host, status, json } = buildHost();
    filter.catch(new LessonNotFoundException(), host);
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'LESSON_NOT_FOUND', message: 'Lesson not found.' },
    });
  });

  it('maps a NotLessonOwnerException to 403 NOT_LESSON_OWNER', () => {
    const filter = new LearnExceptionFilter();
    const { host, status, json } = buildHost();
    filter.catch(new NotLessonOwnerException(), host);
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'NOT_LESSON_OWNER', message: 'You do not have access to this lesson.' },
    });
  });

  it('maps a NestJS BadRequestException (DTO validation) to VALIDATION_FAILED with fieldErrors', () => {
    const filter = new LearnExceptionFilter();
    const { host, status, json } = buildHost();
    const dtoErr = new BadRequestException({
      message: ['lessonId must be a string'],
      error: 'Bad Request',
      statusCode: 400,
    });
    filter.catch(dtoErr, host);
    expect(status).toHaveBeenCalledWith(400);
    const body = json.mock.calls[0][0];
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details?.fieldErrors).toBeTruthy();
  });

  it('delegates an InsufficientRoleException (AuthException subclass) to a 403 INSUFFICIENT_ROLE', () => {
    const filter = new LearnExceptionFilter();
    const { host, status, json } = buildHost();
    filter.catch(new InsufficientRoleException(), host);
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'INSUFFICIENT_ROLE', message: 'Insufficient role.' },
    });
  });

  it('falls back to INTERNAL for unknown exceptions', () => {
    const filter = new LearnExceptionFilter();
    const { host, status, json } = buildHost();
    filter.catch(new Error('boom'), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL', message: 'An internal error occurred.' },
    });
  });
});

describe('LearnExceptionFilter — HttpException status → code mapping', () => {
  // Pins every branch of the shared codeForStatus() helper (api-http-errors),
  // exercised through the filter. BadRequestException
  // is intercepted upstream into VALIDATION_FAILED, so the 400 branch here is
  // reached only by a plain HttpException base instance. 418 pins the default.
  it.each<[number, string]>([
    [400, 'BAD_REQUEST'],
    [401, 'UNAUTHORIZED'],
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
    [409, 'CONFLICT'],
    [422, 'VALIDATION_ERROR'],
    [418, 'HTTP_ERROR'],
  ])('maps a plain HttpException(%i) to %s', (statusCode, code) => {
    const filter = new LearnExceptionFilter();
    const { host, status, json } = buildHost();
    filter.catch(new HttpException('http err', statusCode), host);
    expect(status).toHaveBeenCalledWith(statusCode);
    expect(json).toHaveBeenCalledWith({
      error: { code, message: 'http err' },
    });
  });
});

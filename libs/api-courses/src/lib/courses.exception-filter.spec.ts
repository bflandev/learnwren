import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { InsufficientRoleException } from '@learnwren/api-auth';

import { CoursesExceptionFilter } from './courses.exception-filter';
import {
  CourseNotFoundException,
  StaleReorderException,
} from './errors/courses.exception';

function buildHost(): { host: ArgumentsHost; status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } {
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

describe('CoursesExceptionFilter', () => {
  it('maps a CoursesException to its declared status and code', () => {
    const filter = new CoursesExceptionFilter();
    const { host, status, json } = buildHost();
    filter.catch(new CourseNotFoundException(), host);
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'COURSE_NOT_FOUND', message: 'Course not found.' },
    });
  });

  it('preserves details when present', () => {
    const filter = new CoursesExceptionFilter();
    const { host, status, json } = buildHost();
    filter.catch(new StaleReorderException(), host);
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'STALE_REORDER',
        message: 'Reorder body does not match current children — refetch and retry.',
      },
    });
  });

  it('maps a NestJS BadRequestException (DTO validation) to VALIDATION_FAILED with fieldErrors', () => {
    const filter = new CoursesExceptionFilter();
    const { host, status, json } = buildHost();
    // class-validator + APP_PIPE produces this shape:
    const dtoErr = new BadRequestException({
      message: ['title must be longer than or equal to 1 characters'],
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
    const filter = new CoursesExceptionFilter();
    const { host, status, json } = buildHost();
    filter.catch(new InsufficientRoleException(), host);
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'INSUFFICIENT_ROLE', message: 'Instructor role required.' },
    });
  });

  it('falls back to INTERNAL for unknown exceptions', () => {
    const filter = new CoursesExceptionFilter();
    const { host, status, json } = buildHost();
    filter.catch(new Error('boom'), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL', message: 'An internal error occurred.' },
    });
  });
});

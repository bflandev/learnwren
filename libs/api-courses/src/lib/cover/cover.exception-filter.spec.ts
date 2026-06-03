import { describe, expect, it, vi } from 'vitest';
import type { ArgumentsHost } from '@nestjs/common';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  PayloadTooLargeException,
  UnauthorizedException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';

import { AuthException, InsufficientRoleException } from '@learnwren/api-auth';

import { NotCourseOwnerException } from '../errors/courses.exception';
import { CoverDimensionsTooSmallException, CoverException } from './errors/cover.exception';
import { CoverExceptionFilter } from './cover.exception-filter';

function makeHost(): { host: ArgumentsHost; status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('CoverExceptionFilter', () => {
  it('maps a CoverException to its status + machine code + details', () => {
    const { host, status, json } = makeHost();
    const filter = new CoverExceptionFilter();
    filter.catch(new CoverDimensionsTooSmallException({ width: 800, height: 600 }), host);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'COVER_DIMENSIONS_TOO_SMALL',
        message: 'Cover image must be JPEG or PNG, at least 1280x720 pixels.',
        details: { width: 800, height: 600 },
      },
    });
  });

  it('passes through plain HttpException with a status-derived code', () => {
    const { host, status, json } = makeHost();
    const filter = new CoverExceptionFilter();
    filter.catch(new NotFoundException('Course not found.'), host);
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'NOT_FOUND', message: 'Course not found.' },
    });
  });

  it('delegates a NotCourseOwnerException (CoursesException from CourseOwnerGuard) to 403', () => {
    // Regression: the per-route CourseOwnerGuard throws a CoursesException, which
    // must render as 403, not leak as a 500.
    const { host, status, json } = makeHost();
    new CoverExceptionFilter().catch(new NotCourseOwnerException(), host);
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'NOT_COURSE_OWNER', message: 'You do not own this course.' },
    });
  });

  it('delegates an AuthException (FirebaseSessionGuard 401) to 401', () => {
    const { host, status, json } = makeHost();
    new CoverExceptionFilter().catch(new AuthException('UNAUTHENTICATED', 'Not signed in.', 401), host);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'UNAUTHENTICATED', message: 'Not signed in.' },
    });
  });

  it('delegates an InsufficientRoleException (InstructorRoleGuard 403) to 403', () => {
    const { host, status, json } = makeHost();
    new CoverExceptionFilter().catch(new InsufficientRoleException(), host);
    expect(status).toHaveBeenCalledWith(403);
    expect(json.mock.calls[0]![0].error.code).toBe('INSUFFICIENT_ROLE');
  });

  it('falls back to 500 INTERNAL for unknown errors', () => {
    const { host, status, json } = makeHost();
    const filter = new CoverExceptionFilter();
    filter.catch(new Error('boom'), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL', message: 'An internal error occurred.' },
    });
  });
});

describe('CoverExceptionFilter — codeForStatus branches', () => {
  function mapHttpException(exc: HttpException): { status: number; code: string } {
    const { host, status, json } = makeHost();
    new CoverExceptionFilter().catch(exc, host);
    const statusArg = status.mock.calls[0]![0] as number;
    const body = json.mock.calls[0]![0] as { error: { code: string } };
    return { status: statusArg, code: body.error.code };
  }

  it('maps 400 → BAD_REQUEST', () => {
    expect(mapHttpException(new BadRequestException('x'))).toEqual({ status: 400, code: 'BAD_REQUEST' });
  });
  it('maps 401 → UNAUTHORIZED', () => {
    expect(mapHttpException(new UnauthorizedException('x'))).toEqual({ status: 401, code: 'UNAUTHORIZED' });
  });
  it('maps 403 → FORBIDDEN', () => {
    expect(mapHttpException(new ForbiddenException('x'))).toEqual({ status: 403, code: 'FORBIDDEN' });
  });
  it('maps 413 → PAYLOAD_TOO_LARGE', () => {
    expect(mapHttpException(new PayloadTooLargeException('x'))).toEqual({ status: 413, code: 'PAYLOAD_TOO_LARGE' });
  });
  it('maps 415 → UNSUPPORTED_MEDIA_TYPE', () => {
    expect(mapHttpException(new UnsupportedMediaTypeException('x'))).toEqual({ status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
  });
  it('defaults unknown statuses to HTTP_ERROR', () => {
    expect(mapHttpException(new HttpException('teapot', 418))).toEqual({ status: 418, code: 'HTTP_ERROR' });
  });
});

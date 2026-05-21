import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { InsufficientRoleException } from '@learnwren/api-auth';

import {
  InvalidVideoStateException,
  VideoNotFoundException,
} from './errors/video.exception';
import { VideoExceptionFilter } from './video.exception-filter';

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

describe('VideoExceptionFilter', () => {
  it('maps a VideoException to its declared status and code', () => {
    const filter = new VideoExceptionFilter();
    const { host, status, json } = buildHost();
    filter.catch(new VideoNotFoundException(), host);
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'VIDEO_NOT_FOUND', message: 'Video not found.' },
    });
  });

  it('preserves details when present', () => {
    const filter = new VideoExceptionFilter();
    const { host, status, json } = buildHost();
    filter.catch(new InvalidVideoStateException('TRANSCODING'), host);
    expect(status).toHaveBeenCalledWith(409);
    const body = json.mock.calls[0][0];
    expect(body.error.code).toBe('INVALID_VIDEO_STATE');
    expect(body.error.details?.currentState).toBe('TRANSCODING');
  });

  it('maps a NestJS BadRequestException (DTO validation) to VALIDATION_FAILED with fieldErrors', () => {
    const filter = new VideoExceptionFilter();
    const { host, status, json } = buildHost();
    const dtoErr = new BadRequestException({
      message: ['sizeBytes must not be greater than 10000000000'],
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
    const filter = new VideoExceptionFilter();
    const { host, status, json } = buildHost();
    filter.catch(new InsufficientRoleException(), host);
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'INSUFFICIENT_ROLE', message: 'Instructor role required.' },
    });
  });

  it('falls back to INTERNAL for unknown exceptions', () => {
    const filter = new VideoExceptionFilter();
    const { host, status, json } = buildHost();
    filter.catch(new Error('boom'), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL', message: 'An internal error occurred.' },
    });
  });
});

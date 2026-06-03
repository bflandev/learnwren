import { describe, expect, it, vi } from 'vitest';
import type { ArgumentsHost } from '@nestjs/common';
import { BadRequestException, HttpException } from '@nestjs/common';

import { AuthException } from '@learnwren/api-auth';

import { ProfileInvalidException, ProfileException } from './errors/profile.exception';
import { ProfileExceptionFilter } from './profile.exception-filter';

function makeHost(): { host: ArgumentsHost; status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('ProfileExceptionFilter', () => {
  it('maps ProfileInvalidException to 400 with code + field + reason', () => {
    const { host, status, json } = makeHost();
    new ProfileExceptionFilter().catch(
      new ProfileInvalidException('displayName', 'must be 1-80 characters'),
      host,
    );
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'PROFILE_INVALID',
        message: 'Profile is invalid.',
        details: { field: 'displayName', reason: 'must be 1-80 characters' },
      },
    });
  });

  it('passes through plain HttpException with a status-derived code', () => {
    const { host, status, json } = makeHost();
    new ProfileExceptionFilter().catch(new BadRequestException('bad'), host);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'BAD_REQUEST', message: 'bad' },
    });
  });

  it('delegates an AuthException (FirebaseSessionGuard 401) to 401', () => {
    // Regression: an unauthenticated GET/PATCH /profile must render 401, not leak
    // as a 500.
    const { host, status, json } = makeHost();
    new ProfileExceptionFilter().catch(new AuthException('UNAUTHENTICATED', 'Not signed in.', 401), host);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'UNAUTHENTICATED', message: 'Not signed in.' },
    });
  });

  it('maps anything else to 500 INTERNAL', () => {
    const { host, status, json } = makeHost();
    new ProfileExceptionFilter().catch(new Error('boom'), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL', message: 'An internal error occurred.' },
    });
  });
});

import { describe, expect, it, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';

import { EmailChangeExceptionFilter } from './email.exception-filter';
import { EmailAlreadyInUseException } from './errors/email-change.exception';
import { AuthException } from '@learnwren/api-auth';

function mockHost() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('EmailChangeExceptionFilter', () => {
  it('serializes an EmailChangeException with code + details', () => {
    const { host, status, json } = mockHost();
    new EmailChangeExceptionFilter().catch(new EmailAlreadyInUseException(), host);
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'EMAIL_ALREADY_IN_USE',
        message: 'That email address is already in use.',
        details: { field: 'newEmail' },
      },
    });
  });

  it('maps a generic HttpException to its status code', () => {
    const { host, status, json } = mockHost();
    new EmailChangeExceptionFilter().catch(new HttpException('nope', 401), host);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'UNAUTHORIZED', message: 'nope' },
    });
  });

  it('maps an AuthException (e.g. guard 401) to its status code', () => {
    const { host, status, json } = mockHost();
    new EmailChangeExceptionFilter().catch(
      new AuthException('UNAUTHENTICATED', 'Not authenticated.', 401),
      host,
    );
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'UNAUTHENTICATED', message: 'Not authenticated.' },
    });
  });
});

import { ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { AuthExceptionFilter } from './auth.exception-filter';
import {
  AuthException,
  EmailAlreadyExistsException,
  WeakPasswordException,
} from './errors/auth.exception';

function buildHost(): { host: ArgumentsHost; status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn>; setHeader: ReturnType<typeof vi.fn> } {
  const json = vi.fn();
  const setHeader = vi.fn();
  const status = vi.fn(() => ({ json }));
  const response = { status, setHeader };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({}),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json, setHeader };
}

describe('AuthExceptionFilter', () => {
  const filter = new AuthExceptionFilter();

  it('serializes a WeakPasswordException as a 400 with details.unmetRequirements', () => {
    const { host, status, json } = buildHost();
    filter.catch(new WeakPasswordException(['UPPERCASE', 'DIGIT']), host);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'WEAK_PASSWORD',
        message: expect.any(String),
        details: { unmetRequirements: ['UPPERCASE', 'DIGIT'] },
      },
    });
  });

  it('serializes an EmailAlreadyExistsException as a 409', () => {
    const { host, status, json } = buildHost();
    filter.catch(new EmailAlreadyExistsException(), host);
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'EMAIL_ALREADY_EXISTS', message: expect.any(String) },
    });
  });

  it('falls through to a 500 INTERNAL for unknown errors', () => {
    const { host, status, json } = buildHost();
    filter.catch(new Error('boom'), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL', message: expect.any(String) },
    });
  });

  it('still serializes a generic AuthException with no details', () => {
    class CustomException extends AuthException {
      constructor() {
        super('UNAUTHENTICATED', 'unauth msg', 401);
      }
    }
    const { host, status, json } = buildHost();
    filter.catch(new CustomException(), host);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'UNAUTHENTICATED', message: 'unauth msg' },
    });
  });
});

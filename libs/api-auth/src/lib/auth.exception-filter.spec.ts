import { ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { AuthExceptionFilter } from './auth.exception-filter';
import {
  AccountLockedException,
  AuthException,
  EmailAlreadyExistsException,
  EmailNotVerifiedException,
  InvalidCredentialsException,
  InvalidUnlockTokenException,
  TooManyRequestsException,
  UnlockTokenExpiredException,
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
    // Vitest's toHaveBeenCalledWith treats { details: undefined } as matching
    // { } — so explicitly check the body has no details key when the exception
    // doesn't carry any. Without this, an `if (true)` mutant on `if (details)`
    // can slip through.
    const body = (json.mock.calls[0]![0] as { error: Record<string, unknown> }).error;
    expect(Object.prototype.hasOwnProperty.call(body, 'details')).toBe(false);
  });

  it('emits the exact INTERNAL message for unknown errors (not just any string)', () => {
    // Pins the user-facing message so that a StringLiteral mutant on
    // 'An internal error occurred.' cannot replace it with the empty string
    // and still pass.
    const { host, status, json } = buildHost();
    filter.catch(new Error('boom'), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL', message: 'An internal error occurred.' },
    });
  });
});

describe('AuthExceptionFilter — hardening exceptions', () => {
  function makeHost(captured: { status?: number; body?: unknown }) {
    const res = {
      status: vi.fn((code: number) => {
        captured.status = code;
        return res;
      }),
      json: vi.fn((body: unknown) => {
        captured.body = body;
      }),
    };
    return {
      switchToHttp: () => ({ getResponse: () => res }),
    } as unknown as Parameters<AuthExceptionFilter['catch']>[1];
  }

  it.each([
    [new InvalidCredentialsException(), 401, 'INVALID_CREDENTIALS', undefined],
    [new EmailNotVerifiedException(), 403, 'EMAIL_NOT_VERIFIED', { resendAvailable: true }],
    [
      new AccountLockedException(new Date('2026-05-06T01:00:00.000Z')),
      423,
      'ACCOUNT_LOCKED',
      { unlockAvailableAt: '2026-05-06T01:00:00.000Z' },
    ],
    [new TooManyRequestsException(), 429, 'TOO_MANY_REQUESTS', undefined],
    [new InvalidUnlockTokenException(), 400, 'INVALID_UNLOCK_TOKEN', undefined],
    [
      new UnlockTokenExpiredException(),
      410,
      'UNLOCK_TOKEN_EXPIRED',
      { canRequestPasswordReset: true },
    ],
  ])('maps %s', (exception, status, code, details) => {
    const filter = new AuthExceptionFilter();
    const captured: { status?: number; body?: unknown } = {};
    filter.catch(exception, makeHost(captured));
    expect(captured.status).toBe(status);
    expect(captured.body).toMatchObject({
      error: details ? { code, details } : { code },
    });
  });
});

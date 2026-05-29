import { describe, expect, it, vi } from 'vitest';
import { HttpException, Logger } from '@nestjs/common';

import { AuthException } from '@learnwren/api-auth';

import { PasswordChangeExceptionFilter } from './password.exception-filter';
import {
  CurrentPasswordInvalidException,
  NewPasswordWeakException,
  PasswordChangeFailedException,
  PasswordUnchangedException,
} from './errors/password-change.exception';

function mockHost() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as never;
  return { host, status, json };
}

describe('PasswordChangeExceptionFilter', () => {
  it('serializes a PasswordChangeException with its code, status and details', () => {
    const { host, status, json } = mockHost();
    new PasswordChangeExceptionFilter().catch(new NewPasswordWeakException(['DIGIT']), host);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'NEW_PASSWORD_WEAK',
        message: 'New password does not meet complexity requirements.',
        details: { field: 'newPassword', unmetRequirements: ['DIGIT'] },
      },
    });
  });

  it('serializes a PasswordChangeException without details when none are present', () => {
    const { host, status, json } = mockHost();
    // PasswordChangeFailedException carries no details → details key omitted (L32 conditional)
    new PasswordChangeExceptionFilter().catch(new PasswordChangeFailedException(), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'PASSWORD_CHANGE_FAILED',
        message: 'We could not change your password. Please try again.',
      },
    });
  });

  it.each([
    [new CurrentPasswordInvalidException(), 400, 'CURRENT_PASSWORD_INVALID'],
    [new PasswordUnchangedException(), 400, 'PASSWORD_UNCHANGED'],
  ] as const)(
    'serializes each PasswordChangeException subtype to its status + code (%#)',
    (exception, expectedStatus, expectedCode) => {
      const { host, status, json } = mockHost();
      new PasswordChangeExceptionFilter().catch(exception, host);
      expect(status).toHaveBeenCalledWith(expectedStatus);
      expect(json).toHaveBeenCalledWith({
        error: expect.objectContaining({ code: expectedCode }),
      });
    },
  );

  it('maps an AuthException (e.g. unauthenticated) to its own status, code and message', () => {
    const { host, status, json } = mockHost();
    new PasswordChangeExceptionFilter().catch(
      new AuthException('UNAUTHENTICATED', 'no', 401),
      host,
    );
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'UNAUTHENTICATED', message: 'no' },
    });
  });

  it.each([
    [400, 'BAD_REQUEST'],
    [401, 'UNAUTHORIZED'],
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
    [409, 'CONFLICT'],
    [418, 'ERROR'],
    [500, 'ERROR'],
  ])('maps a generic HttpException status %i via codeForStatus', (httpStatus, expectedCode) => {
    const { host, status, json } = mockHost();
    new PasswordChangeExceptionFilter().catch(new HttpException('boom', httpStatus), host);
    expect(status).toHaveBeenCalledWith(httpStatus);
    expect(json).toHaveBeenCalledWith({
      error: { code: expectedCode, message: 'boom' },
    });
  });

  it('falls back to a 500 INTERNAL body for an unknown Error and logs its stack', () => {
    const { host, status, json } = mockHost();
    const logSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const error = new Error('kaboom');
    new PasswordChangeExceptionFilter().catch(error, host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL', message: 'An internal error occurred.' },
    });
    expect(logSpy).toHaveBeenCalledWith(error.stack);
    logSpy.mockRestore();
  });

  it('falls back to a 500 INTERNAL body for a non-Error thrown value (String branch)', () => {
    const { host, status, json } = mockHost();
    const logSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    new PasswordChangeExceptionFilter().catch('plain string failure', host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL', message: 'An internal error occurred.' },
    });
    expect(logSpy).toHaveBeenCalledWith('plain string failure');
    logSpy.mockRestore();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { HttpException } from '@nestjs/common';

import { AuthException } from '@learnwren/api-auth';

import { PasswordChangeExceptionFilter } from './password.exception-filter';
import { NewPasswordWeakException } from './errors/password-change.exception';

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

  it('maps an AuthException (e.g. unauthenticated) to its own status', () => {
    const { host, status } = mockHost();
    new PasswordChangeExceptionFilter().catch(new AuthException('UNAUTHENTICATED', 'no', 401), host);
    expect(status).toHaveBeenCalledWith(401);
  });

  it('maps a generic HttpException via codeForStatus', () => {
    const { host, status, json } = mockHost();
    new PasswordChangeExceptionFilter().catch(new HttpException('nope', 404), host);
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ error: { code: 'NOT_FOUND', message: 'nope' } });
  });
});

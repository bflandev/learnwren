import { describe, expect, it, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';

import { AuthException, InsufficientRoleException } from '@learnwren/api-auth';

import { AdminUsersExceptionFilter } from './admin-users.exception-filter';
import { UserNotFoundException } from './errors/admin-users.exception';

function mockHost() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('AdminUsersExceptionFilter', () => {
  it('renders UserNotFoundException as HTTP 404 with USER_NOT_FOUND', () => {
    const { host, status, json } = mockHost();
    new AdminUsersExceptionFilter().catch(new UserNotFoundException(), host);
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'USER_NOT_FOUND', message: 'No such user.' },
    });
  });

  it('maps the AdminRoleGuard rejection (InsufficientRoleException) to 403', () => {
    const { host, status, json } = mockHost();
    new AdminUsersExceptionFilter().catch(new InsufficientRoleException(), host);
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'INSUFFICIENT_ROLE', message: 'Insufficient role.' },
    });
  });

  it('maps a guard 401 (AuthException) to its status code', () => {
    const { host, status, json } = mockHost();
    new AdminUsersExceptionFilter().catch(
      new AuthException('UNAUTHENTICATED', 'Not authenticated.', 401),
      host,
    );
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'UNAUTHENTICATED', message: 'Not authenticated.' },
    });
  });

  it('maps a generic HttpException to its status code', () => {
    const { host, status, json } = mockHost();
    new AdminUsersExceptionFilter().catch(new HttpException('nope', 403), host);
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ error: { code: 'FORBIDDEN', message: 'nope' } });
  });
});

import { describe, expect, it } from 'vitest';

import {
  AdminUsersException,
  InvalidRoleTransitionException,
  UserNotFoundException,
} from './admin-users.exception';

describe('AdminUsersException', () => {
  it('UserNotFoundException carries code USER_NOT_FOUND and status 404', () => {
    const err = new UserNotFoundException();
    expect(err).toBeInstanceOf(AdminUsersException);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('USER_NOT_FOUND');
    expect(err.status).toBe(404);
    expect(err.message).toBe('No such user.');
    expect(err.name).toBe('AdminUsersException');
  });

  it('InvalidRoleTransitionException carries code INVALID_ROLE_TRANSITION, status 409, details', () => {
    const err = new InvalidRoleTransitionException('ADMIN', 'INSTRUCTOR');
    expect(err).toBeInstanceOf(AdminUsersException);
    expect(err.code).toBe('INVALID_ROLE_TRANSITION');
    expect(err.status).toBe(409);
    expect(err.message).toBe('Invalid role transition.');
    expect(err.details).toEqual({ currentRole: 'ADMIN', attempted: 'INSTRUCTOR' });
  });
});

import { describe, expect, it } from 'vitest';

import { AdminUsersException, UserNotFoundException } from './admin-users.exception';

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
});

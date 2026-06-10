import { describe, expect, it } from 'vitest';
import type { CourseId } from '@learnwren/shared-data-models';

import {
  AdminUsersException,
  CannotActOnSelfException,
  InvalidRoleTransitionException,
  InvalidStatusTransitionException,
  LastAdminException,
  UserHasCoursesException,
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

  it('CannotActOnSelfException carries code CANNOT_ACT_ON_SELF and status 409', () => {
    const err = new CannotActOnSelfException();
    expect(err).toBeInstanceOf(AdminUsersException);
    expect(err.code).toBe('CANNOT_ACT_ON_SELF');
    expect(err.status).toBe(409);
  });

  it('LastAdminException carries code LAST_ADMIN and status 409', () => {
    const err = new LastAdminException();
    expect(err).toBeInstanceOf(AdminUsersException);
    expect(err.code).toBe('LAST_ADMIN');
    expect(err.status).toBe(409);
  });

  it('UserHasCoursesException carries code USER_HAS_COURSES, status 409, and course details', () => {
    const ids = ['c1', 'c2'] as CourseId[];
    const err = new UserHasCoursesException(2, ids);
    expect(err).toBeInstanceOf(AdminUsersException);
    expect(err.code).toBe('USER_HAS_COURSES');
    expect(err.status).toBe(409);
    expect(err.details?.courseCount).toBe(2);
    expect(err.details?.courseIds).toEqual(ids);
  });

  it('InvalidStatusTransitionException carries code INVALID_STATUS_TRANSITION, status 409, details', () => {
    const err = new InvalidStatusTransitionException('ACTIVE', 'SUSPENDED');
    expect(err).toBeInstanceOf(AdminUsersException);
    expect(err.code).toBe('INVALID_STATUS_TRANSITION');
    expect(err.status).toBe(409);
    expect(err.details).toEqual({ currentStatus: 'ACTIVE', attempted: 'SUSPENDED' });
  });
});

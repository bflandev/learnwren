import type { AdminUsersErrorCode, CourseId, UserRole, UserStatus } from '@learnwren/shared-data-models';

export class AdminUsersException extends Error {
  constructor(
    public readonly code: AdminUsersErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'AdminUsersException';
  }
}

export class UserNotFoundException extends AdminUsersException {
  constructor() {
    super('USER_NOT_FOUND', 'No such user.', 404);
  }
}

export class InvalidRoleTransitionException extends AdminUsersException {
  constructor(currentRole: UserRole, attempted: UserRole) {
    super('INVALID_ROLE_TRANSITION', 'Invalid role transition.', 409, { currentRole, attempted });
  }
}

export class CannotActOnSelfException extends AdminUsersException {
  constructor() {
    super('CANNOT_ACT_ON_SELF', 'Administrators cannot perform this action on their own account.', 409);
  }
}

export class LastAdminException extends AdminUsersException {
  constructor() {
    super('LAST_ADMIN', 'Cannot perform this action: the platform must retain at least one active administrator.', 409);
  }
}

export class UserHasCoursesException extends AdminUsersException {
  constructor(
    courseCount: number,
    courseIds: CourseId[],
    // Per-throw-site message: the delete and demote paths share the code but
    // must not claim the wrong action.
    message = 'Cannot delete an instructor who owns courses. Resolve the courses first.',
  ) {
    super('USER_HAS_COURSES', message, 409, {
      courseCount,
      courseIds,
    });
  }
}

export class RoleChangeTargetNotActiveException extends AdminUsersException {
  constructor(currentStatus: UserStatus, attempted: UserRole) {
    super('INVALID_ROLE_TRANSITION', 'Cannot change the role of a user who is not active.', 409, {
      currentStatus,
      attempted,
    });
  }
}

export class InvalidStatusTransitionException extends AdminUsersException {
  constructor(currentStatus: UserStatus, attempted: 'SUSPENDED' | 'ACTIVE') {
    super('INVALID_STATUS_TRANSITION', 'Invalid status transition.', 409, { currentStatus, attempted });
  }
}

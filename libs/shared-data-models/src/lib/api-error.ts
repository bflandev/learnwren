// Cross-stack API error contracts. The domain code unions below are the single
// source of truth shared by the API exception classes (which throw them) and the
// web error-narrowing helpers (which match on them). Adding a code here is a
// compile-time prompt on BOTH sides — previously each web lib re-declared its own
// hand-maintained copy that silently drifted from what the API actually threw.

/** The canonical error envelope every API exception filter emits. */
export interface ApiErrorBody<Code extends string = string> {
  error: {
    code: Code;
    message: string;
    details?: Record<string, unknown>;
  };
}

/** Authoritative courses-domain error codes (the `code` of every CoursesException). */
export type CoursesErrorCode =
  | 'VALIDATION_FAILED'
  | 'NOT_COURSE_OWNER'
  | 'COURSE_NOT_FOUND'
  | 'MODULE_NOT_FOUND'
  | 'LESSON_NOT_FOUND'
  | 'STALE_REORDER'
  | 'INVALID_TRANSITION'
  | 'PUBLISH_NOT_ELIGIBLE'
  | 'COURSE_ARCHIVED'
  | 'COURSE_NOT_AVAILABLE'
  | 'CANNOT_ENROLL_OWN_COURSE'
  | 'NOT_ENROLLED'
  | 'INTERNAL'
  | 'COURSE_NOT_PUBLISHED_FOR_NOTIFY'
  | 'MODULE_HAS_NO_LESSONS'
  | 'MODULE_ALREADY_NOTIFIED';

/**
 * Codes a web client may receive from a courses-domain endpoint: the domain
 * codes plus the cross-cutting guard codes (auth) those routes surface.
 */
export type CoursesApiErrorCode = CoursesErrorCode | 'INSUFFICIENT_ROLE' | 'UNAUTHENTICATED';

export type CoursesApiErrorBody = ApiErrorBody<CoursesApiErrorCode>;

/** Authoritative auth-domain error codes (the `code` of every AuthException). */
export type AuthErrorCode =
  | 'INVALID_EMAIL'
  | 'EMAIL_TOO_LONG'
  | 'WEAK_PASSWORD'
  | 'PASSWORD_TOO_LONG'
  | 'INVALID_DISPLAY_NAME'
  | 'EMAIL_ALREADY_EXISTS'
  | 'INVALID_ID_TOKEN'
  | 'RECENT_SIGN_IN_REQUIRED'
  | 'UNAUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_NOT_VERIFIED'
  | 'ACCOUNT_LOCKED'
  | 'TOO_MANY_REQUESTS'
  | 'INVALID_UNLOCK_TOKEN'
  | 'UNLOCK_TOKEN_EXPIRED'
  | 'INSUFFICIENT_ROLE'
  | 'INTERNAL';

/** Codes a web client may receive from an auth-domain endpoint. */
export type ApiAuthErrorCode = AuthErrorCode;

export type ApiAuthErrorBody = ApiErrorBody<ApiAuthErrorCode>;

/** Authoritative admin-users-domain error codes (the `code` of every AdminUsersException). */
export type AdminUsersErrorCode = 'USER_NOT_FOUND' | 'INTERNAL';

/**
 * Codes a web client may receive from an admin-users endpoint: the domain codes
 * plus the cross-cutting guard codes those ADMIN-guarded routes surface.
 */
export type AdminUsersApiErrorCode = AdminUsersErrorCode | 'INSUFFICIENT_ROLE' | 'UNAUTHENTICATED';

export type AdminUsersApiErrorBody = ApiErrorBody<AdminUsersApiErrorCode>;

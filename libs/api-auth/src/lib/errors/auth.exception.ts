import { AuthErrorCode } from './auth-error.codes';
import type { PolicyRequirement } from '../password-policy.service';

export interface AuthErrorDetails {
  unmetRequirements?: PolicyRequirement[];
}

export class AuthException extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: AuthErrorDetails,
  ) {
    super(message);
    this.name = 'AuthException';
  }
}

export class WeakPasswordException extends AuthException {
  constructor(unmetRequirements: PolicyRequirement[]) {
    super('WEAK_PASSWORD', 'Password does not meet complexity requirements.', 400, {
      unmetRequirements,
    });
  }
}

export class InvalidEmailException extends AuthException {
  constructor() {
    super('INVALID_EMAIL', 'Email address is not valid.', 400);
  }
}

export class InvalidDisplayNameException extends AuthException {
  constructor() {
    super('INVALID_DISPLAY_NAME', 'Display name is required and must be 80 characters or fewer.', 400);
  }
}

export class EmailAlreadyExistsException extends AuthException {
  constructor() {
    super('EMAIL_ALREADY_EXISTS', 'Unable to complete registration.', 409);
  }
}

export class InvalidIdTokenException extends AuthException {
  constructor() {
    super('INVALID_ID_TOKEN', 'ID token is invalid or has been revoked.', 401);
  }
}

export class RecentSignInRequiredException extends AuthException {
  constructor() {
    super('RECENT_SIGN_IN_REQUIRED', 'Recent sign-in required to mint a session cookie.', 401);
  }
}

export class UnauthenticatedException extends AuthException {
  constructor() {
    super('UNAUTHENTICATED', 'Not authenticated.', 401);
  }
}

export class InternalAuthException extends AuthException {
  constructor() {
    super('INTERNAL', 'An internal error occurred.', 500);
  }
}

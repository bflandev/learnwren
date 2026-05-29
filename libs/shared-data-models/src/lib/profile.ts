import type { UserId } from './common';
import type { UserRole } from './user';

/** Body of `GET /api/profile`. */
export interface ProfileView {
  uid: UserId;
  email: string;
  displayName: string;
  biography: string;
  photoUrl?: string;
  role: UserRole;
  emailVerified: boolean;
}

/** Body of `PATCH /api/profile`. */
export interface UpdateProfileInput {
  displayName: string;
  biography: string;
}

/** Wire error code returned by `PATCH /api/profile` on validation failure. */
export const PROFILE_INVALID = 'PROFILE_INVALID';
export type ProfileInvalidCode = typeof PROFILE_INVALID;

/** Body of a 400 from `PATCH /api/profile`. */
export interface ProfileInvalidErrorBody {
  error: {
    code: ProfileInvalidCode;
    message: string;
    details?: { field: 'displayName' | 'biography'; reason: string };
  };
}

/** Wire error codes returned by `PUT /api/profile/picture` on validation/processing failure. */
export const PROFILE_PICTURE_DIMENSIONS_TOO_SMALL = 'PROFILE_PICTURE_DIMENSIONS_TOO_SMALL';
export type ProfilePictureDimensionsTooSmallCode = typeof PROFILE_PICTURE_DIMENSIONS_TOO_SMALL;

export const PROFILE_PICTURE_DECODE_FAILED = 'PROFILE_PICTURE_DECODE_FAILED';
export type ProfilePictureDecodeFailedCode = typeof PROFILE_PICTURE_DECODE_FAILED;

export const PROFILE_PICTURE_TOO_LARGE = 'PROFILE_PICTURE_TOO_LARGE';
export type ProfilePictureTooLargeCode = typeof PROFILE_PICTURE_TOO_LARGE;

export const UNSUPPORTED_PROFILE_PICTURE_FORMAT = 'UNSUPPORTED_PROFILE_PICTURE_FORMAT';
export type UnsupportedProfilePictureFormatCode = typeof UNSUPPORTED_PROFILE_PICTURE_FORMAT;

export type ProfilePictureErrorCode =
  | ProfilePictureDimensionsTooSmallCode
  | ProfilePictureDecodeFailedCode
  | ProfilePictureTooLargeCode
  | UnsupportedProfilePictureFormatCode;

/** Body of `POST /api/profile/email`. */
export interface ChangeEmailRequest {
  newEmail: string;
  currentPassword: string;
}

/** Body of `POST /api/profile/email/confirm`. */
export interface ConfirmEmailChangeResponse {
  changed: boolean;
  email?: string;
}

/** Wire error codes returned by the email-change endpoints (UC-01-03 ext 3b). */
export const EMAIL_INVALID = 'EMAIL_INVALID';
export const EMAIL_UNCHANGED = 'EMAIL_UNCHANGED';
export const CURRENT_PASSWORD_INVALID = 'CURRENT_PASSWORD_INVALID';
export const EMAIL_ALREADY_IN_USE = 'EMAIL_ALREADY_IN_USE';
export const EMAIL_CHANGE_FAILED = 'EMAIL_CHANGE_FAILED';

export type EmailChangeErrorCode =
  | typeof EMAIL_INVALID
  | typeof EMAIL_UNCHANGED
  | typeof CURRENT_PASSWORD_INVALID
  | typeof EMAIL_ALREADY_IN_USE
  | typeof EMAIL_CHANGE_FAILED;

/** Body of a non-2xx from the email-change endpoints. */
export interface EmailChangeErrorBody {
  error: {
    code: EmailChangeErrorCode;
    message: string;
    details?: { field: 'newEmail' | 'currentPassword' };
  };
}

/**
 * Canonical password-complexity requirement union (UC-01-01 step 4 policy).
 * This is the wire contract surfaced in NEW_PASSWORD_WEAK details and the
 * registration WEAK_PASSWORD details. `api-auth`'s PasswordPolicyService
 * re-exports this type so the backend has a single source of truth.
 */
export type PolicyRequirement =
  | 'MIN_LENGTH'
  | 'UPPERCASE'
  | 'LOWERCASE'
  | 'DIGIT'
  | 'SPECIAL';

/** Body of `POST /api/profile/password` (UC-01-03 ext 3c). */
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

/** Wire error codes returned by `POST /api/profile/password`. */
// CURRENT_PASSWORD_INVALID is already declared above (shared with email change).
export const NEW_PASSWORD_WEAK = 'NEW_PASSWORD_WEAK';
export const PASSWORD_UNCHANGED = 'PASSWORD_UNCHANGED';
export const PASSWORD_CHANGE_FAILED = 'PASSWORD_CHANGE_FAILED';

export type PasswordChangeErrorCode =
  | typeof CURRENT_PASSWORD_INVALID
  | typeof NEW_PASSWORD_WEAK
  | typeof PASSWORD_UNCHANGED
  | typeof PASSWORD_CHANGE_FAILED;

/** Body of a non-2xx from `POST /api/profile/password`. */
export interface PasswordChangeErrorBody {
  error: {
    code: PasswordChangeErrorCode;
    message: string;
    details?: {
      field?: 'currentPassword' | 'newPassword';
      unmetRequirements?: PolicyRequirement[];
    };
  };
}

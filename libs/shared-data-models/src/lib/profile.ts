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

import type { UserId } from './common';
import type { UserRole } from './user';

/** Body of `GET /api/profile`. */
export interface ProfileView {
  uid: UserId;
  email: string;
  displayName: string;
  biography: string;
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

import type { ProfileErrorCode } from './profile-error.codes';

export type ProfileField = 'displayName' | 'biography';

export interface ProfileErrorDetails {
  field: ProfileField;
  reason: string;
  [key: string]: unknown;
}

export class ProfileException extends Error {
  constructor(
    public readonly code: ProfileErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: ProfileErrorDetails,
  ) {
    super(message);
    this.name = 'ProfileException';
  }
}

export class ProfileInvalidException extends ProfileException {
  constructor(field: ProfileField, reason: string) {
    super('PROFILE_INVALID', 'Profile is invalid.', 400, { field, reason });
  }
}

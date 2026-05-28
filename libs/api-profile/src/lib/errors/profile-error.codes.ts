export const PROFILE_ERROR_CODES = ['PROFILE_INVALID'] as const;
export type ProfileErrorCode = (typeof PROFILE_ERROR_CODES)[number];

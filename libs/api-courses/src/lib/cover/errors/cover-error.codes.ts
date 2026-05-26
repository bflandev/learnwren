export const COVER_ERROR_CODES = [
  'COVER_DIMENSIONS_TOO_SMALL',
  'COVER_DECODE_FAILED',
  'COVER_TOO_LARGE',
  'UNSUPPORTED_COVER_FORMAT',
] as const;

export type CoverErrorCode = (typeof COVER_ERROR_CODES)[number];

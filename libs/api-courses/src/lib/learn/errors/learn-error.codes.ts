export const LEARN_ERROR_CODES = [
  'LESSON_NOT_FOUND',
  'NOT_LESSON_OWNER',
  'NOT_ENROLLED_LESSON',
  'INVALID_POSITION',
] as const;
export type LearnErrorCode = (typeof LEARN_ERROR_CODES)[number];

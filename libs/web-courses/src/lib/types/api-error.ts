export type CoursesApiErrorCode =
  | 'VALIDATION_FAILED'
  | 'INSUFFICIENT_ROLE'
  | 'NOT_COURSE_OWNER'
  | 'COURSE_NOT_FOUND'
  | 'MODULE_NOT_FOUND'
  | 'LESSON_NOT_FOUND'
  | 'STALE_REORDER'
  | 'INTERNAL';

export interface CoursesApiErrorBody {
  error: {
    code: CoursesApiErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

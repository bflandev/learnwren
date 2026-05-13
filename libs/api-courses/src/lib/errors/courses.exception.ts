import type { CoursesErrorCode } from './courses-error.codes';

export class CoursesException extends Error {
  constructor(
    public readonly code: CoursesErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'CoursesException';
  }
}

export class NotCourseOwnerException extends CoursesException {
  constructor() {
    super('NOT_COURSE_OWNER', 'You do not own this course.', 403);
  }
}

export class CourseNotFoundException extends CoursesException {
  constructor() {
    super('COURSE_NOT_FOUND', 'Course not found.', 404);
  }
}

export class ModuleNotFoundException extends CoursesException {
  constructor() {
    super('MODULE_NOT_FOUND', 'Module not found.', 404);
  }
}

export class LessonNotFoundException extends CoursesException {
  constructor() {
    super('LESSON_NOT_FOUND', 'Lesson not found.', 404);
  }
}

export class StaleReorderException extends CoursesException {
  constructor() {
    super(
      'STALE_REORDER',
      'Reorder body does not match current children — refetch and retry.',
      409,
    );
  }
}

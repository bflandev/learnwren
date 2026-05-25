import type { LearnErrorCode } from './learn-error.codes';

export class LearnException extends Error {
  constructor(
    public readonly code: LearnErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'LearnException';
  }
}

export class LessonNotFoundException extends LearnException {
  constructor() {
    super('LESSON_NOT_FOUND', 'Lesson not found.', 404);
  }
}

export class NotLessonOwnerException extends LearnException {
  constructor() {
    super('NOT_LESSON_OWNER', 'You do not have access to this lesson.', 403);
  }
}

export class NotEnrolledLessonException extends LearnException {
  constructor() {
    super(
      'NOT_ENROLLED_LESSON',
      'You must be enrolled in this course to mark lessons complete.',
      403,
    );
  }
}

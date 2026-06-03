import type { CoursesErrorCode } from './courses-error.codes';
import type { CourseStatus, PublishBlockReason } from '@learnwren/shared-data-models';

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

export class InvalidTransitionException extends CoursesException {
  constructor(currentState: CourseStatus, requested: CourseStatus) {
    super(
      'INVALID_TRANSITION',
      `Cannot transition from ${currentState} to ${requested}.`,
      409,
      { currentState, requested },
    );
  }
}

export class PublishNotEligibleException extends CoursesException {
  constructor(reasons: PublishBlockReason[]) {
    super(
      'PUBLISH_NOT_ELIGIBLE',
      'Course does not meet publish requirements.',
      409,
      { reasons },
    );
  }
}

export class CourseArchivedException extends CoursesException {
  constructor() {
    super('COURSE_ARCHIVED', 'Cannot check publish eligibility on an archived course.', 409);
  }
}

export class CourseNotAvailableException extends CoursesException {
  constructor() {
    super('COURSE_NOT_AVAILABLE', 'This course is no longer available.', 409);
  }
}

export class CannotEnrollOwnCourseException extends CoursesException {
  constructor() {
    super('CANNOT_ENROLL_OWN_COURSE', 'You cannot enroll in a course you own.', 409);
  }
}

export class NotEnrolledException extends CoursesException {
  constructor() {
    super('NOT_ENROLLED', 'You are not enrolled in this course.', 404);
  }
}

export class CourseNotPublishedForNotifyException extends CoursesException {
  constructor() {
    super(
      'COURSE_NOT_PUBLISHED_FOR_NOTIFY',
      'Only a published course can notify its enrolled students.',
      409,
    );
  }
}

export class ModuleHasNoLessonsException extends CoursesException {
  constructor() {
    super(
      'MODULE_HAS_NO_LESSONS',
      'A module must have at least one lesson before students are notified.',
      409,
    );
  }
}

export class ModuleAlreadyNotifiedException extends CoursesException {
  constructor() {
    super('MODULE_ALREADY_NOTIFIED', 'Students have already been notified about this module.', 409);
  }
}

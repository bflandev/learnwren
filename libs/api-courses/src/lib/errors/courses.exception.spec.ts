import { describe, expect, it } from 'vitest';

import {
  CannotEnrollOwnCourseException,
  CourseArchivedException,
  CourseNotFoundException,
  CourseNotAvailableException,
  CoursesException,
  CourseNotPublishedForNotifyException,
  InvalidTransitionException,
  LessonNotFoundException,
  ModuleAlreadyNotifiedException,
  ModuleHasNoLessonsException,
  ModuleNotFoundException,
  NotCourseOwnerException,
  NotEnrolledException,
  PublishNotEligibleException,
  StaleReorderException,
} from './courses.exception';
import type { PublishBlockReason } from '@learnwren/shared-data-models';

describe('CoursesException family', () => {
  it('CoursesException carries code, message, status, name, and optional details', () => {
    const ex = new CoursesException('VALIDATION_FAILED', 'bad input', 400, { foo: 'bar' });
    expect(ex.code).toBe('VALIDATION_FAILED');
    expect(ex.message).toBe('bad input');
    expect(ex.status).toBe(400);
    expect(ex.details).toEqual({ foo: 'bar' });
    // `name` is read by exception filters that dispatch on the constructor
    // name — a StringLiteral mutant blanking it would break that dispatch.
    expect(ex.name).toBe('CoursesException');
  });

  it('NotCourseOwnerException is 403 with code NOT_COURSE_OWNER', () => {
    const ex = new NotCourseOwnerException();
    expect(ex.code).toBe('NOT_COURSE_OWNER');
    expect(ex.status).toBe(403);
    expect(ex.message).toBe('You do not own this course.');
  });

  it('CourseNotFoundException is 404 with code COURSE_NOT_FOUND', () => {
    const ex = new CourseNotFoundException();
    expect(ex.code).toBe('COURSE_NOT_FOUND');
    expect(ex.status).toBe(404);
    expect(ex.message).toBe('Course not found.');
  });

  it('ModuleNotFoundException is 404 with code MODULE_NOT_FOUND', () => {
    const ex = new ModuleNotFoundException();
    expect(ex.code).toBe('MODULE_NOT_FOUND');
    expect(ex.status).toBe(404);
    expect(ex.message).toBe('Module not found.');
  });

  it('LessonNotFoundException is 404 with code LESSON_NOT_FOUND', () => {
    const ex = new LessonNotFoundException();
    expect(ex.code).toBe('LESSON_NOT_FOUND');
    expect(ex.status).toBe(404);
    expect(ex.message).toBe('Lesson not found.');
  });

  it('StaleReorderException is 409 with code STALE_REORDER', () => {
    const ex = new StaleReorderException();
    expect(ex.code).toBe('STALE_REORDER');
    expect(ex.status).toBe(409);
  });
});

describe('slice D exceptions', () => {
  it('InvalidTransitionException carries currentState + requested as details and is HTTP 409', () => {
    // Distinct from/to values pin the message template's interpolation order.
    const e = new InvalidTransitionException('ARCHIVED', 'DRAFT');
    expect(e.code).toBe('INVALID_TRANSITION');
    expect(e.status).toBe(409);
    expect(e.details).toEqual({ currentState: 'ARCHIVED', requested: 'DRAFT' });
    expect(e.message).toBe('Cannot transition from ARCHIVED to DRAFT.');
  });

  it('PublishNotEligibleException carries reasons[] as details and is HTTP 409', () => {
    const reasons: PublishBlockReason[] = [{ kind: 'COURSE_HAS_NO_MODULES' }];
    const e = new PublishNotEligibleException(reasons);
    expect(e.code).toBe('PUBLISH_NOT_ELIGIBLE');
    expect(e.status).toBe(409);
    expect(e.details).toEqual({ reasons });
    expect(e.message).toBe('Course does not meet publish requirements.');
  });

  it('CourseArchivedException is HTTP 409 with code COURSE_ARCHIVED', () => {
    const e = new CourseArchivedException();
    expect(e.code).toBe('COURSE_ARCHIVED');
    expect(e.status).toBe(409);
    expect(e.message).toBe('Cannot check publish eligibility on an archived course.');
  });
});

describe('slice B enrollment exceptions', () => {
  it('CourseNotAvailableException is 409 with code COURSE_NOT_AVAILABLE', () => {
    const e = new CourseNotAvailableException();
    expect(e.code).toBe('COURSE_NOT_AVAILABLE');
    expect(e.status).toBe(409);
    expect(e.message).toBe('This course is no longer available.');
  });

  it('CannotEnrollOwnCourseException is 409 with code CANNOT_ENROLL_OWN_COURSE', () => {
    const e = new CannotEnrollOwnCourseException();
    expect(e.code).toBe('CANNOT_ENROLL_OWN_COURSE');
    expect(e.status).toBe(409);
    expect(e.message).toBe('You cannot enroll in a course you own.');
  });

  it('NotEnrolledException is 404 with code NOT_ENROLLED', () => {
    const e = new NotEnrolledException();
    expect(e.code).toBe('NOT_ENROLLED');
    expect(e.status).toBe(404);
    expect(e.message).toBe('You are not enrolled in this course.');
  });
});

describe('Slice C notification exceptions', () => {
  it('CourseNotPublishedForNotifyException → COURSE_NOT_PUBLISHED_FOR_NOTIFY / 409', () => {
    const e = new CourseNotPublishedForNotifyException();
    expect(e.code).toBe('COURSE_NOT_PUBLISHED_FOR_NOTIFY');
    expect(e.status).toBe(409);
    expect(e.message).toBe('Only a published course can notify its enrolled students.');
  });
  it('ModuleHasNoLessonsException → MODULE_HAS_NO_LESSONS / 409', () => {
    const e = new ModuleHasNoLessonsException();
    expect(e.code).toBe('MODULE_HAS_NO_LESSONS');
    expect(e.status).toBe(409);
    expect(e.message).toBe('A module must have at least one lesson before students are notified.');
  });
  it('ModuleAlreadyNotifiedException → MODULE_ALREADY_NOTIFIED / 409', () => {
    const e = new ModuleAlreadyNotifiedException();
    expect(e.code).toBe('MODULE_ALREADY_NOTIFIED');
    expect(e.status).toBe(409);
    expect(e.message).toBe('Students have already been notified about this module.');
  });
});

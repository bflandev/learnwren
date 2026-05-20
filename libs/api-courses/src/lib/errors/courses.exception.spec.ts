import { describe, expect, it } from 'vitest';

import {
  CourseArchivedException,
  CourseNotFoundException,
  CoursesException,
  InvalidTransitionException,
  LessonNotFoundException,
  ModuleNotFoundException,
  NotCourseOwnerException,
  PublishNotEligibleException,
  StaleReorderException,
} from './courses.exception';
import type { PublishBlockReason } from '@learnwren/shared-data-models';

describe('CoursesException family', () => {
  it('CoursesException carries code, message, status, and optional details', () => {
    const ex = new CoursesException('VALIDATION_FAILED', 'bad input', 400, { foo: 'bar' });
    expect(ex.code).toBe('VALIDATION_FAILED');
    expect(ex.message).toBe('bad input');
    expect(ex.status).toBe(400);
    expect(ex.details).toEqual({ foo: 'bar' });
  });

  it('NotCourseOwnerException is 403 with code NOT_COURSE_OWNER', () => {
    const ex = new NotCourseOwnerException();
    expect(ex.code).toBe('NOT_COURSE_OWNER');
    expect(ex.status).toBe(403);
  });

  it('CourseNotFoundException is 404 with code COURSE_NOT_FOUND', () => {
    const ex = new CourseNotFoundException();
    expect(ex.code).toBe('COURSE_NOT_FOUND');
    expect(ex.status).toBe(404);
  });

  it('ModuleNotFoundException is 404 with code MODULE_NOT_FOUND', () => {
    const ex = new ModuleNotFoundException();
    expect(ex.code).toBe('MODULE_NOT_FOUND');
    expect(ex.status).toBe(404);
  });

  it('LessonNotFoundException is 404 with code LESSON_NOT_FOUND', () => {
    const ex = new LessonNotFoundException();
    expect(ex.code).toBe('LESSON_NOT_FOUND');
    expect(ex.status).toBe(404);
  });

  it('StaleReorderException is 409 with code STALE_REORDER', () => {
    const ex = new StaleReorderException();
    expect(ex.code).toBe('STALE_REORDER');
    expect(ex.status).toBe(409);
  });
});

describe('slice D exceptions', () => {
  it('InvalidTransitionException carries currentState + requested as details and is HTTP 409', () => {
    const e = new InvalidTransitionException('PUBLISHED', 'PUBLISHED');
    expect(e.code).toBe('INVALID_TRANSITION');
    expect(e.status).toBe(409);
    expect(e.details).toEqual({ currentState: 'PUBLISHED', requested: 'PUBLISHED' });
  });

  it('PublishNotEligibleException carries reasons[] as details and is HTTP 409', () => {
    const reasons: PublishBlockReason[] = [{ kind: 'COURSE_HAS_NO_MODULES' }];
    const e = new PublishNotEligibleException(reasons);
    expect(e.code).toBe('PUBLISH_NOT_ELIGIBLE');
    expect(e.status).toBe(409);
    expect(e.details).toEqual({ reasons });
  });

  it('CourseArchivedException is HTTP 409 with code COURSE_ARCHIVED', () => {
    const e = new CourseArchivedException();
    expect(e.code).toBe('COURSE_ARCHIVED');
    expect(e.status).toBe(409);
  });
});

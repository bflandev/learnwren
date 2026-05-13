import { describe, expect, it } from 'vitest';

import { InsufficientRoleException } from '@learnwren/api-auth';

import {
  CourseNotFoundException,
  CoursesException,
  LessonNotFoundException,
  ModuleNotFoundException,
  NotCourseOwnerException,
  StaleReorderException,
} from './courses.exception';

describe('CoursesException family', () => {
  it('CoursesException carries code, message, status, and optional details', () => {
    const ex = new CoursesException('VALIDATION_FAILED', 'bad input', 400, { foo: 'bar' });
    expect(ex.code).toBe('VALIDATION_FAILED');
    expect(ex.message).toBe('bad input');
    expect(ex.status).toBe(400);
    expect(ex.details).toEqual({ foo: 'bar' });
  });

  it('InsufficientRoleException is 403 with code INSUFFICIENT_ROLE', () => {
    const ex = new InsufficientRoleException();
    expect(ex.code).toBe('INSUFFICIENT_ROLE');
    expect(ex.status).toBe(403);
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

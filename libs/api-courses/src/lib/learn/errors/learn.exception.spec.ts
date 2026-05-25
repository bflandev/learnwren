import { describe, expect, it } from 'vitest';

import { LessonNotFoundException, NotLessonOwnerException } from './learn.exception';

describe('Learn exceptions', () => {
  it('LessonNotFoundException carries code LESSON_NOT_FOUND and status 404', () => {
    const err = new LessonNotFoundException();
    expect(err.code).toBe('LESSON_NOT_FOUND');
    expect(err.status).toBe(404);
  });

  it('NotLessonOwnerException carries code NOT_LESSON_OWNER and status 403', () => {
    const err = new NotLessonOwnerException();
    expect(err.code).toBe('NOT_LESSON_OWNER');
    expect(err.status).toBe(403);
  });
});

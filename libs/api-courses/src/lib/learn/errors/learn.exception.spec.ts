import { describe, expect, it } from 'vitest';

import {
  InvalidPositionException,
  LessonNotFoundException,
  NotEnrolledLessonException,
  NotLessonOwnerException,
} from './learn.exception';

describe('Learn exceptions', () => {
  it('LessonNotFoundException carries code LESSON_NOT_FOUND and status 404', () => {
    const err = new LessonNotFoundException();
    expect(err.code).toBe('LESSON_NOT_FOUND');
    expect(err.status).toBe(404);
    expect(err.name).toBe('LearnException');
    expect(err.message).toBe('Lesson not found.');
  });

  it('NotLessonOwnerException carries code NOT_LESSON_OWNER and status 403', () => {
    const err = new NotLessonOwnerException();
    expect(err.code).toBe('NOT_LESSON_OWNER');
    expect(err.status).toBe(403);
    expect(err.name).toBe('LearnException');
    expect(err.message).toBe('You do not have access to this lesson.');
  });

  it('every Learn exception sets name to LearnException (kills the name StringLiteral)', () => {
    expect(new LessonNotFoundException().name).toBe('LearnException');
    expect(new NotLessonOwnerException().name).toBe('LearnException');
    expect(new NotEnrolledLessonException().name).toBe('LearnException');
    expect(new InvalidPositionException().name).toBe('LearnException');
  });
});

describe('NotEnrolledLessonException', () => {
  it('has code NOT_ENROLLED_LESSON and HTTP 403', () => {
    const err = new NotEnrolledLessonException();
    expect(err.code).toBe('NOT_ENROLLED_LESSON');
    expect(err.status).toBe(403);
    expect(err.message).toBe('You must be enrolled in this course to mark lessons complete.');
  });
});

describe('InvalidPositionException', () => {
  it('has code INVALID_POSITION and HTTP 400', () => {
    const err = new InvalidPositionException();
    expect(err.code).toBe('INVALID_POSITION');
    expect(err.status).toBe(400);
    expect(err.message).toBe('Playback position must be a finite non-negative number.');
  });
});

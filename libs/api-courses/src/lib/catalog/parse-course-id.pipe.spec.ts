import { describe, expect, it } from 'vitest';

import { CourseNotFoundException } from '../errors/courses.exception';
import { ParseCourseIdPipe } from './parse-course-id.pipe';

const meta = { type: 'param' } as never;

describe('ParseCourseIdPipe', () => {
  const pipe = new ParseCourseIdPipe();

  it('accepts a Firestore auto-id-shaped string', () => {
    // Firestore auto-IDs are 20 chars of [A-Za-z0-9].
    expect(pipe.transform('aBcDeFgHiJ0123456789', meta)).toBe('aBcDeFgHiJ0123456789');
  });

  it('accepts shorter IDs and IDs with hyphen/underscore', () => {
    expect(pipe.transform('a_b-1', meta)).toBe('a_b-1');
  });

  it('rejects empty strings', () => {
    expect(() => pipe.transform('', meta)).toThrow(CourseNotFoundException);
  });

  it('rejects strings exceeding the 64-char cap', () => {
    expect(() => pipe.transform('a'.repeat(65), meta)).toThrow(CourseNotFoundException);
  });

  it('rejects path traversal attempts', () => {
    expect(() => pipe.transform('../admin', meta)).toThrow(CourseNotFoundException);
    expect(() => pipe.transform('foo/bar', meta)).toThrow(CourseNotFoundException);
  });

  it('rejects whitespace and other non-id-safe characters', () => {
    expect(() => pipe.transform('foo bar', meta)).toThrow(CourseNotFoundException);
    expect(() => pipe.transform('foo.bar', meta)).toThrow(CourseNotFoundException);
    expect(() => pipe.transform('foo$', meta)).toThrow(CourseNotFoundException);
  });

  it('rejects non-string inputs (kills the `typeof value !== string` left operand)', () => {
    // Drives the first operand of the `||` to TRUE on its own. A regex-only
    // check would call PATTERN.test(123) (coerced to "123", which passes) and
    // wrongly accept it.
    expect(() => pipe.transform(123 as never, meta)).toThrow(CourseNotFoundException);
    expect(() => pipe.transform(null as never, meta)).toThrow(CourseNotFoundException);
    expect(() => pipe.transform(undefined as never, meta)).toThrow(CourseNotFoundException);
  });

  it('accepts a valid id without throwing (kills the condition -> true mutant)', () => {
    // Forcing the whole guard condition to `true` would reject this valid id;
    // forcing it to `false` is killed by the rejection tests above.
    expect(pipe.transform('valid-Course_01', meta)).toBe('valid-Course_01');
  });
});

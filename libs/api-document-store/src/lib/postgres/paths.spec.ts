import { escapeLike, splitPath } from './paths';

describe('splitPath', () => {
  it('splits a top-level document path', () => {
    expect(splitPath('courses/c1')).toEqual({ parent: 'courses', collection: 'courses', id: 'c1' });
  });

  it('splits a nested document path', () => {
    expect(splitPath('courses/c1/modules/m1')).toEqual({
      parent: 'courses/c1/modules',
      collection: 'modules',
      id: 'm1',
    });
  });
});

describe('escapeLike', () => {
  it('escapes the three LIKE metacharacters and nothing else', () => {
    expect(escapeLike('a_b%c\\d/e-f')).toBe('a\\_b\\%c\\\\d/e-f');
  });

  it('leaves a plain path untouched', () => {
    expect(escapeLike('courses/c1')).toBe('courses/c1');
  });
});

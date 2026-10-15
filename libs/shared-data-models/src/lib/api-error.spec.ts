import { describe, expect, it } from 'vitest';

import { apiErrorOf } from './api-error';

describe('apiErrorOf', () => {
  it('returns the envelope error of a rejected HttpClient call', () => {
    const body = { code: 'NOT_COURSE_OWNER', message: 'no' };
    expect(apiErrorOf({ error: { error: body } })).toBe(body);
  });

  it('returns undefined for null, undefined, or a non-envelope rejection', () => {
    expect(apiErrorOf(null)).toBeUndefined();
    expect(apiErrorOf(undefined)).toBeUndefined();
    expect(apiErrorOf(new Error('network'))).toBeUndefined();
    expect(apiErrorOf({ error: 'text body' })).toBeUndefined();
  });
});

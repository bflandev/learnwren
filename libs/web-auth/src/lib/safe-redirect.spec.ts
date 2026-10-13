import { describe, expect, it } from 'vitest';

import { isSafeRedirect, safeRedirectParam } from './safe-redirect';

describe('safe redirects', () => {
  it.each([
    ['/', true],
    ['/catalog/c-1?enroll=1', true],
    ['', false],
    ['catalog', false],
    ['//evil.example', false],
    ['/\\evil.example', false],
  ])('isSafeRedirect(%j) is %s', (r, ok) => {
    expect(isSafeRedirect(r)).toBe(ok);
  });

  it('safeRedirectParam reads only a safe redirect param', () => {
    const params = (r: string | null) => ({ get: (k: string) => (k === 'redirect' ? r : null) });
    expect(safeRedirectParam(params('/x'))).toBe('/x');
    expect(safeRedirectParam(params('//x'))).toBeNull();
    expect(safeRedirectParam(params(null))).toBeNull();
    expect(safeRedirectParam(undefined)).toBeNull();
  });
});

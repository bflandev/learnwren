import { describe, expect, it } from 'vitest';

import { nowIso } from './time';

describe('nowIso', () => {
  it('returns the current instant as a parseable ISO 8601 string', () => {
    const before = Date.now();
    const value = nowIso();
    const after = Date.now();
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    const parsed = Date.parse(value);
    expect(parsed).toBeGreaterThanOrEqual(before);
    expect(parsed).toBeLessThanOrEqual(after);
  });
});

import { describe, expect, it } from 'vitest';

import { secondsToClock } from './seconds-to-clock.util';

describe('secondsToClock', () => {
  it('formats sub-minute as 0:SS', () => {
    expect(secondsToClock(5)).toBe('0:05');
    expect(secondsToClock(0)).toBe('0:00');
  });

  it('formats minutes as M:SS', () => {
    expect(secondsToClock(65)).toBe('1:05');
    expect(secondsToClock(600)).toBe('10:00');
  });

  it('formats past an hour as H:MM:SS', () => {
    expect(secondsToClock(3661)).toBe('1:01:01');
  });

  it('rounds fractional seconds and floors negatives to 0:00', () => {
    expect(secondsToClock(59.6)).toBe('1:00');
    expect(secondsToClock(-5)).toBe('0:00');
  });
});

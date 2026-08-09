import { describe, expect, it } from 'vitest';

import { BROADBAND, SAMPLE_COUNT, STUB_DELAY_MS, median } from './perf-measure';

describe('median', () => {
  it('returns the middle value of an odd-length array', () => {
    expect(median([300, 100, 200])).toBe(200);
  });

  it('averages the two middle values of an even-length array', () => {
    expect(median([100, 200, 300, 400])).toBe(250);
  });

  it('returns the single value of a one-element array', () => {
    expect(median([42])).toBe(42);
  });

  it('does not mutate the caller\'s array', () => {
    const input = [300, 100, 200];
    median(input);
    expect(input).toEqual([300, 100, 200]);
  });

  it('throws on an empty array rather than returning NaN', () => {
    expect(() => median([])).toThrow(/empty/i);
  });
});

describe('BROADBAND profile', () => {
  // Load-bearing: these values are the acceptance criterion's "standard
  // broadband connection", NOT Lighthouse's slow-4G mobile default. A
  // well-meaning "fix" toward Lighthouse defaults would silently change
  // what every budget in the suite means.
  it('models desktop broadband, not throttled mobile', () => {
    expect(BROADBAND).toEqual({
      downloadKbps: 10_000,
      uploadKbps: 5_000,
      latencyMs: 40,
      cpuThrottleRate: 1,
    });
  });
});

describe('sampling constants', () => {
  it('samples three times per route', () => {
    expect(SAMPLE_COUNT).toBe(3);
  });

  it('delays stubbed API responses by a fixed 150ms', () => {
    expect(STUB_DELAY_MS).toBe(150);
  });
});

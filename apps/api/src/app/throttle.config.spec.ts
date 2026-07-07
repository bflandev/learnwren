import { describe, expect, it } from 'vitest';

import { resolveThrottleTiers } from './throttle.config';

describe('resolveThrottleTiers', () => {
  it('returns the production defaults when no env overrides are set', () => {
    expect(resolveThrottleTiers({})).toEqual([
      { name: 'burst', ttl: 10_000, limit: 100 },
      { name: 'sustained', ttl: 60_000, limit: 1000 },
    ]);
  });

  it('overrides the burst limit from LEARNWREN_THROTTLE_BURST_LIMIT', () => {
    const tiers = resolveThrottleTiers({ LEARNWREN_THROTTLE_BURST_LIMIT: '10000' });
    expect(tiers[0]).toEqual({ name: 'burst', ttl: 10_000, limit: 10_000 });
    expect(tiers[1].limit).toBe(1000);
  });

  it('overrides the sustained limit from LEARNWREN_THROTTLE_SUSTAINED_LIMIT', () => {
    const tiers = resolveThrottleTiers({ LEARNWREN_THROTTLE_SUSTAINED_LIMIT: '50000' });
    expect(tiers[1]).toEqual({ name: 'sustained', ttl: 60_000, limit: 50_000 });
    expect(tiers[0].limit).toBe(100);
  });

  it.each(['banana', '', '0', '-5', '2.5'])(
    'falls back to the default when the override is invalid (%j)',
    (raw) => {
      const tiers = resolveThrottleTiers({
        LEARNWREN_THROTTLE_BURST_LIMIT: raw,
        LEARNWREN_THROTTLE_SUSTAINED_LIMIT: raw,
      });
      expect(tiers[0].limit).toBe(100);
      expect(tiers[1].limit).toBe(1000);
    },
  );
});

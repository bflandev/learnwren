import { describe, expect, it } from 'vitest';

import {
  FEATURED_COURSES,
  FEATURES,
  HERO_CONTENT,
  PRICING_CTA_ROUTE,
  PRICING_TIERS,
  STATS,
  STEPS,
} from './landing-content';

describe('landing-content', () => {
  it('has four stats, four courses, three steps, four features, three tiers', () => {
    expect(STATS).toHaveLength(4);
    expect(FEATURED_COURSES).toHaveLength(4);
    expect(STEPS).toHaveLength(3);
    expect(FEATURES).toHaveLength(4);
    expect(PRICING_TIERS).toHaveLength(3);
  });

  it('wires the hero CTAs to real routes', () => {
    expect(HERO_CONTENT.primaryCta.route).toBe('/register');
    expect(HERO_CONTENT.secondaryCta.route).toBe('/catalog');
  });

  it('marks exactly one pricing tier as featured and sends all CTAs to register', () => {
    expect(PRICING_TIERS.filter((t) => t.featured)).toHaveLength(1);
    expect(PRICING_CTA_ROUTE).toBe('/register');
  });

  it('assigns each course a valid cover tone', () => {
    const tones = new Set(['ochre', 'moss', 'clay', 'ink', 'paper', 'bark']);
    for (const c of FEATURED_COURSES) expect(tones.has(c.tone)).toBe(true);
  });
});

import { expect, test } from '@playwright/test';

import { PERF_ROUTES } from '../_helpers/route-inventory';
import { stubAuth } from '../_helpers/route-stubs';
import {
  SAMPLE_COUNT,
  applyBroadbandThrottle,
  measureLcp,
  median,
} from '../_helpers/perf-measure';

/**
 * US-09-01: "The course catalogue page must load within 2 seconds on a
 * standard broadband connection."
 *
 * The catalogue's 2000 ms comes from that acceptance criterion and is not
 * negotiable by measurement. The other three budgets are derived from
 * measured medians x 1.4 — see section 5 of
 * docs/superpowers/specs/2026-08-08-us-09-01-performance-design.md, which
 * records the raw measurements these came from.
 *
 * Metric is Largest Contentful Paint, asserted on the median of
 * SAMPLE_COUNT navigations. Scope is honest and narrow: this measures
 * client render cost and bundle weight under a modelled 10 Mbps / 40 ms
 * link with stubbed API responses. It proves nothing about real API
 * latency, CDN behaviour, cold starts, or concurrency.
 */
const BUDGETS_MS: Record<string, number> = {
  landing: 1850,
  catalogue: 2000, // <- from the acceptance criterion; do not widen
  'course detail': 2200,
  'learn page': 2200,
};

for (const route of PERF_ROUTES) {
  // BUDGETS_MS[route.name] is `number | undefined` under
  // noUncheckedIndexedAccess; `?? 0` gives the guard assertion below a
  // concrete number to fail on for any PERF_ROUTES entry without a budget.
  const budget = BUDGETS_MS[route.name] ?? 0;

  test(`${route.name} (${route.path}) renders within ${budget}ms`, async ({ page }) => {
    expect(
      budget,
      `no budget defined for route "${route.name}" — every PERF_ROUTES entry needs one`,
    ).toBeGreaterThan(0);

    await applyBroadbandThrottle(page);
    await stubAuth(page, route.role);
    await route.stubs?.(page);

    const samples: number[] = [];
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      samples.push(await measureLcp(page, route.path));

      // Prove the route rendered its REAL content, not an error or empty
      // state. A stubbed page settles on an error paragraph just as fast as
      // on real data — faster, in fact — so without this guard a
      // fixture-shape bug reads as a performance WIN. Same contract as the
      // a11y and responsive sweeps; scoped to <main> because the header
      // precedes it and can otherwise satisfy the check on its own.
      if (route.expectText) {
        await expect(
          page.locator('main').getByText(route.expectText).first(),
        ).toBeVisible();
      }
    }

    const observed = Math.round(median(samples));
    expect(
      observed,
      `${route.name} LCP median ${observed}ms over budget ${budget}ms ` +
        `(samples: ${samples.map(Math.round).join(', ')}ms)`,
    ).toBeLessThanOrEqual(budget);
  });
}

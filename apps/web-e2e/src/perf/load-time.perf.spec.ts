import { expect, test } from '@playwright/test';

import { PERF_ROUTES } from '../_helpers/route-inventory';
import { stubAuth } from '../_helpers/route-stubs';
import {
  SAMPLE_COUNT,
  applyBroadbandThrottle,
  measureLcp,
  measureTimeToContent,
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
 * Two metrics, both asserted on the median of SAMPLE_COUNT navigations:
 *
 * - Largest Contentful Paint: the only paint-cost signal on the landing
 *   page, which has no stubbed data at all — nothing "loads", so there is
 *   no content visibility to time.
 * - Time to content (elapsed time until the route's `expectText` is visible
 *   inside `<main>`): added because LCP alone can lock onto static shell
 *   markup that paints before any stubbed API resolves. The catalogue's
 *   `<h1>` is exactly that — it paints before `/api/catalog` responds, so
 *   LCP never moved even when a 3s delay was injected into that stub during
 *   this gate's development. Time to content is what "loads within N
 *   seconds" means to a student, and it is the metric that can actually
 *   fail for a catalog-data-load regression.
 *
 * Routes with no `expectText` (landing) have no time-to-content measurement
 * — there is nothing whose visibility marks "the real content arrived".
 *
 * Scope is honest and narrow: this measures client render cost and bundle
 * weight (LCP) plus stubbed-API-to-visible-content latency (time to
 * content) under a modelled 10 Mbps / 40 ms link. It proves nothing about
 * real API latency, CDN behaviour, cold starts, or concurrency.
 */
const BUDGETS_MS: Record<string, number> = {
  landing: 1850,
  catalogue: 2000, // <- from the acceptance criterion; do not widen
  'course detail': 2800,
  'learn page': 2800,
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

    const lcpSamples: number[] = [];
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      lcpSamples.push(await measureLcp(page, route.path));

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
    const observedLcp = Math.round(median(lcpSamples));
    // Log every run, pass or fail: today this only prints on assertion
    // failure, so a passing run gives no idea how much budget margin is
    // left. One grep-able line per route per metric lets CI calibration
    // (and future budget tuning) read medians straight out of the logs
    // without needing a failing run first.
    console.log(
      `[perf] ${route.name} LCP samples=[${lcpSamples.map(Math.round).join(',')}]ms ` +
        `median=${observedLcp}ms budget=${budget}ms`,
    );
    expect(
      observedLcp,
      `${route.name} LCP median ${observedLcp}ms over budget ${budget}ms ` +
        `(samples: ${lcpSamples.map(Math.round).join(', ')}ms)`,
    ).toBeLessThanOrEqual(budget);

    // No expectText (landing) means no stubbed content to wait on — LCP
    // above is the only signal for this route.
    if (!route.expectText) {
      return;
    }

    const ttcSamples: number[] = [];
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      ttcSamples.push(await measureTimeToContent(page, route.path, route.expectText));
    }
    const observedTtc = Math.round(median(ttcSamples));
    // Same rationale as the LCP log line above.
    console.log(
      `[perf] ${route.name} TTC samples=[${ttcSamples.map(Math.round).join(',')}]ms ` +
        `median=${observedTtc}ms budget=${budget}ms`,
    );
    expect(
      observedTtc,
      `${route.name} time-to-content median ${observedTtc}ms over budget ${budget}ms ` +
        `(samples: ${ttcSamples.map(Math.round).join(', ')}ms)`,
    ).toBeLessThanOrEqual(budget);
  });
}

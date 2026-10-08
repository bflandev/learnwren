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
 * records the raw measurements these came from (calibrated on the GitHub
 * Actions runner CI actually gates on, not just a local machine).
 *
 * Two metrics, both measured and logged on the median of SAMPLE_COUNT
 * navigations, but not always both GATED — see GATED_METRICS below:
 *
 * - Largest Contentful Paint: the paint-cost signal, and the only GATED
 *   metric on the landing page — that route has no stubbed data, so its
 *   time-to-content measures render alone and carries no budget of its own.
 * - Time to content (elapsed time until the route's `expectText` is visible
 *   inside `<main>`): added because LCP alone can lock onto static shell
 *   markup that paints before any stubbed API resolves. The catalogue's
 *   `<h1>` is exactly that — it paints before `/api/catalog` responds, so
 *   LCP never moved even when a 3s delay was injected into that stub during
 *   this gate's development. Time to content is what "loads within N
 *   seconds" means to a student.
 *
 * EVERY route carries an `expectText`, so every one of these tests has a
 * render guard. Without one a route that rendered nothing but the app
 * header would still produce an LCP and pass its budget — a broken page
 * reading as a performance result.
 *
 * Scope is honest and narrow: this measures client render cost and bundle
 * weight (LCP) plus stubbed-API-to-visible-content latency (time to
 * content) under a modelled 10 Mbps / 40 ms link. It proves nothing about
 * real API latency, CDN behaviour, cold starts, or concurrency.
 */
const BUDGETS_MS: Record<string, number> = {
  landing: 1900,
  catalogue: 2000, // <- from the acceptance criterion; do not widen
  'course detail': 2800,
  'learn page': 2800,
};

type Metric = 'lcp' | 'ttc';

/**
 * Which of the two measured metrics actually gate a route's test. A metric
 * omitted here is still measured, still logged, still checked for a
 * render-guard where applicable — just not asserted against the budget.
 *
 * Every route gates LCP. Landing gates LCP only — it has no stubbed data,
 * so its time to content measures render alone.
 *
 * The catalogue's TTC was ungated from 2026-08-08 to 2026-10-08: CI measured
 * it at 1989ms against the hard 2000ms budget, and every content route sat
 * in the same ~1980ms band — the cost was cold bundle download, not anything
 * catalogue-specific. The cause was hls.js (~500 KB) statically reachable
 * from the initial bundle through the lib barrels; loading it lazily
 * (HLS_LOADER in web-video) dropped the initial bundle from 1.23 MB to
 * ~710 KB and catalogue TTC to ~1620ms, so the AC is now gated end to end.
 * Do NOT widen the budget to fix a red here — find what grew the bundle.
 */
const GATED_METRICS: Record<string, readonly Metric[]> = {
  landing: ['lcp'],
  catalogue: ['lcp', 'ttc'],
  'course detail': ['lcp', 'ttc'],
  'learn page': ['lcp', 'ttc'],
};

for (const route of PERF_ROUTES) {
  // BUDGETS_MS[route.name] is `number | undefined` under
  // noUncheckedIndexedAccess; `?? 0` gives the guard assertion below a
  // concrete number to fail on for any PERF_ROUTES entry without a budget.
  const budget = BUDGETS_MS[route.name] ?? 0;
  const gatedMetrics = GATED_METRICS[route.name] ?? [];

  test(`${route.name} (${route.path}) renders within ${budget}ms`, async ({ page }) => {
    expect(
      budget,
      `no budget defined for route "${route.name}" — every PERF_ROUTES entry needs one`,
    ).toBeGreaterThan(0);
    expect(
      gatedMetrics.length,
      `every PERF_ROUTES entry must gate at least one metric — "${route.name}" gates none`,
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
      // precedes it and can otherwise satisfy the check on its own. This
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
        `median=${observedLcp}ms budget=${budget}ms ` +
        `gated=${gatedMetrics.includes('lcp')}`,
    );
    if (gatedMetrics.includes('lcp')) {
      expect(
        observedLcp,
        `${route.name} LCP median ${observedLcp}ms over budget ${budget}ms ` +
          `(samples: ${lcpSamples.map(Math.round).join(', ')}ms)`,
      ).toBeLessThanOrEqual(budget);
    }

    // Every PERF_ROUTES entry has an expectText today; the guard keeps the
    // type narrowing honest and would skip TTC for any future entry added
    // without one.
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
        `median=${observedTtc}ms budget=${budget}ms ` +
        `gated=${gatedMetrics.includes('ttc')}`,
    );
    if (gatedMetrics.includes('ttc')) {
      expect(
        observedTtc,
        `${route.name} time-to-content median ${observedTtc}ms over budget ${budget}ms ` +
          `(samples: ${ttcSamples.map(Math.round).join(', ')}ms)`,
      ).toBeLessThanOrEqual(budget);
    }
  });
}

import type { Page } from '@playwright/test';

/**
 * The acceptance criterion says "a standard broadband connection", so this
 * models desktop broadband: 10 Mbps down, 5 Mbps up, 40 ms RTT, no CPU
 * throttle.
 *
 * This is a DELIBERATE departure from Lighthouse's default profile (slow
 * 4G, 4x CPU throttle), which models a mid-tier phone on cellular. Do not
 * "correct" these toward Lighthouse defaults: every budget in the perf
 * suite is calibrated against this profile, so changing it silently
 * changes what all of them mean. See
 * docs/superpowers/specs/2026-08-08-us-09-01-performance-design.md section 4.
 */
export const BROADBAND = {
  downloadKbps: 10_000,
  uploadKbps: 5_000,
  latencyMs: 40,
  cpuThrottleRate: 1,
} as const;

/**
 * Each route is navigated this many times and asserted on the MEDIAN. A
 * real regression moves the median; a single GC pause or cold-cache
 * outlier does not.
 */
export const SAMPLE_COUNT = 3;

/**
 * Fixed delay applied to every stubbed /api response. Without it the client
 * renders against an impossibly instant server and the measurement flatters
 * itself. Fixed rather than random so the median converges.
 */
export const STUB_DELAY_MS = 150;

export function median(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error('median() called with an empty array');
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Apply the broadband network and CPU profile to `page` over CDP. */
export async function applyBroadbandThrottle(page: Page): Promise<void> {
  const client = await page.context().newCDPSession(page);
  await client.send('Network.enable');
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: (BROADBAND.downloadKbps * 1000) / 8,
    uploadThroughput: (BROADBAND.uploadKbps * 1000) / 8,
    latency: BROADBAND.latencyMs,
  });
  await client.send('Emulation.setCPUThrottlingRate', {
    rate: BROADBAND.cpuThrottleRate,
  });
}

/**
 * Navigate to `path` and return Largest Contentful Paint in milliseconds,
 * relative to navigation start.
 *
 * LCP rather than the `load` event because LCP tracks when the user sees
 * the page's main content, which is what "the page must load within 2
 * seconds" means to a student. The observer is installed via
 * addInitScript so it is running before the first paint.
 */
export async function measureLcp(page: Page, path: string): Promise<number> {
  await page.addInitScript(() => {
    (window as unknown as { __lcp: number }).__lcp = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        (window as unknown as { __lcp: number }).__lcp = entry.startTime;
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  });

  await page.goto(path);
  // LCP is only final once the page stops loading new candidates; network
  // idle is the practical settling point for this app's stubbed routes.
  await page.waitForLoadState('networkidle');

  const lcp = await page.evaluate(
    () => (window as unknown as { __lcp: number }).__lcp,
  );
  if (lcp === 0) {
    throw new Error(
      `No LCP entry recorded for "${path}". The page probably rendered ` +
        `nothing — check the route stubs before trusting any budget.`,
    );
  }
  return lcp;
}

/**
 * Navigate to `path` and return the elapsed time, in milliseconds, from
 * navigation start until `expectText` is visible inside `<main>`.
 *
 * LCP alone can lock onto static shell markup — a heading or nav chrome
 * that paints before any stubbed API resolves — understating how long a
 * student actually waits for the page's real content (see the catalogue
 * route: its LCP candidate is the `<h1>`, painted before `/api/catalog`
 * resolves, so LCP never moves no matter how slow that call is). Time to
 * content is the honest version of "the page must load within N seconds":
 * it can only complete once the stubbed data has actually rendered.
 *
 * Scoped to `<main>` for the same reason as the a11y/responsive sweeps —
 * the app header precedes `<main>` and could otherwise satisfy a text match
 * on its own.
 *
 * The clock starts immediately before `page.goto`, the same navigation-start
 * zero point `measureLcp`'s `entry.startTime` values are relative to (that
 * one is `performance.now()`-based inside the page; this one is
 * `Date.now()`-based in the test process — both anchor to this navigation's
 * start, not to some earlier wall-clock moment).
 */
export async function measureTimeToContent(
  page: Page,
  path: string,
  expectText: string,
): Promise<number> {
  const start = Date.now();
  await page.goto(path);
  try {
    await page
      .locator('main')
      .getByText(expectText)
      .first()
      .waitFor({ state: 'visible' });
  } catch (error) {
    // Default is a bare 30s timeout with no hint of what was expected —
    // name the route and the text so a fixture-shape regression explains
    // itself instead of reading as a generic hang. Timeout itself is
    // untouched; this only rewraps the failure.
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Timed out waiting for "${expectText}" to become visible in <main> on ` +
        `"${path}" — the route probably rendered an error or empty state ` +
        `instead of the stubbed content. ${reason}`,
    );
  }
  return Date.now() - start;
}

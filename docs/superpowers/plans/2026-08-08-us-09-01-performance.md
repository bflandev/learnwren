# US-09-01 Performance Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hermetic Playwright performance gate (`nx run web-e2e:perf`) that measures LCP on four student-journey routes against the production build and click-to-first-frame on a real HLS video, and wire it into CI.

**Architecture:** A third standalone Playwright suite alongside the existing `a11y` and `responsive` sweeps, sharing their `page.route` stubbing helpers. It differs from them in one way that matters: it serves the **production build** through a small `node:http` static server instead of the Angular dev server, because dev-server bundles make timing measurements meaningless. Each route is measured three times and asserted on the median. Video timing is backed by a committed 2-second AES-128 HLS fixture served entirely through route interception.

**Tech Stack:** Playwright (`@playwright/test`), Chrome DevTools Protocol for network throttling, `PerformanceObserver` for LCP, Node `node:http`/`node:fs` for the static server, vitest for the unit-testable helpers, `ffmpeg` (authoring-time only, never in CI).

**Spec:** `docs/superpowers/specs/2026-08-08-us-09-01-performance-design.md`

## Global Constraints

- **Node 22, pnpm.** Every command runs through Nx: `pnpm exec nx …`. Never call `playwright` or `tsc` directly.
- **Throttle profile is fixed** and must not be "corrected" to Lighthouse defaults: **10 Mbps down, 5 Mbps up, 40 ms latency, CPU throttle 1×**. The AC says "standard broadband"; Lighthouse's default models a mid-tier phone on slow 4G.
- **Stubbed `/api` responses carry a fixed 150 ms delay.** Fixed, never random — the median-of-3 must converge.
- **Two budgets come from the epic and are not negotiable by measurement:** catalogue LCP **2000 ms**, video start **3000 ms**.
- **The other three route budgets are derived**, not invented: `ceil(median_of_5 × 1.4 / 50) × 50` ms, measured in Task 5, and the measured medians must be written back into the spec.
- **Playwright route handlers match in REVERSE registration order.** Register broad globs FIRST, specific paths LAST. This trap is already documented at `apps/web-e2e/src/_helpers/route-stubs.ts:72-75`.
- **CI must never need `ffmpeg`.** The HLS fixture is generated once locally and committed as bytes.
- **The repo is on branch `main` and work happens in a git worktree** per the project's branch-isolation convention. Symlink `node_modules` to the parent; never `git add -A` in a worktree.
- **Commit format:** `<type>: <description>` (feat, fix, refactor, docs, test, chore, perf, ci).

---

## File Structure

**New files**

| Path | Responsibility |
| :--- | :--- |
| `apps/web-e2e/src/_helpers/static-server.ts` | Serve a built directory over `node:http` with SPA fallback and a traversal guard. No Playwright imports — pure Node, so it is unit-testable. |
| `apps/web-e2e/src/_helpers/static-server.spec.ts` | vitest unit tests for path resolution, traversal rejection, SPA fallback, content types. |
| `apps/web-e2e/src/_helpers/perf-measure.ts` | Throttle constants, `applyBroadbandThrottle`, `measureLcp`, `median`. |
| `apps/web-e2e/src/_helpers/perf-measure.spec.ts` | vitest unit tests for `median` only (the rest need a browser). |
| `apps/web-e2e/src/_helpers/hls-fixture.ts` | Register the four `page.route` handlers that serve the committed HLS fixture. |
| `apps/web-e2e/src/fixtures/hls/master.m3u8` | Master playlist. |
| `apps/web-e2e/src/fixtures/hls/720p.m3u8` | Rendition playlist. |
| `apps/web-e2e/src/fixtures/hls/key.bin` | 16-byte AES-128 key. |
| `apps/web-e2e/src/fixtures/hls/seg0.ts.bin` | Segment bytes. `.bin` suffix so TypeScript tooling never treats it as source. |
| `apps/web-e2e/src/fixtures/hls/README.md` | The exact ffmpeg command that regenerates the fixture. |
| `apps/web-e2e/playwright.perf.config.ts` | Perf suite config; static-server `webServer`, `testDir: './src/perf'`. |
| `apps/web-e2e/src/perf/load-time.perf.spec.ts` | Four-route median-of-3 LCP gate. |
| `apps/web-e2e/src/perf/video-start.perf.spec.ts` | Click-to-first-frame gate. |

**Modified files**

| Path | Change |
| :--- | :--- |
| `apps/web-e2e/src/_helpers/route-stubs.ts` | Add an optional `delayMs` parameter to `stubJson`. |
| `apps/web-e2e/src/_helpers/route-inventory.ts` | Add `LESSON_PAYLOAD_READY` and `PERF_ROUTES`. |
| `apps/web-e2e/project.json` | Add the `perf` target with `dependsOn: ["web:build"]`. |
| `.github/workflows/ci.yml` | Add the perf gate job. |
| `docs/epics/09-non-functional-requirements.md` | Amend the two deferred ACs. |
| `README.md` | US-09-01 entry with honest scope. |
| `docs/USER_GUIDE.md` | Performance entry. |
| `docs/superpowers/specs/2026-08-08-us-09-01-performance-design.md` | Write measured baselines back into §5. |

---

### Task 1: Static file server

The perf suite cannot use `nx serve web` (dev bundles are several times production size and carry dev-mode change detection), so it needs something to serve `dist/apps/web/browser`. This is a pure-Node module with no Playwright dependency, which is what makes it unit-testable.

**Files:**
- Create: `apps/web-e2e/src/_helpers/static-server.ts`
- Test: `apps/web-e2e/src/_helpers/static-server.spec.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `export function resolveRequestPath(rootDir: string, urlPath: string): string | null` — returns an absolute file path inside `rootDir`, or `null` if the request escapes the root. A path with no file extension resolves to `<rootDir>/index.html` (SPA fallback).
  - `export function contentTypeFor(filePath: string): string`
  - `export async function startStaticServer(rootDir: string, port: number): Promise<{ url: string; close: () => Promise<void> }>`

- [ ] **Step 1: Write the failing test**

Create `apps/web-e2e/src/_helpers/static-server.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

import { contentTypeFor, resolveRequestPath } from './static-server';

const ROOT = '/tmp/build-output';

describe('resolveRequestPath', () => {
  it('resolves a real asset path under the root', () => {
    expect(resolveRequestPath(ROOT, '/main-ABC123.js')).toBe(join(ROOT, 'main-ABC123.js'));
  });

  it('falls back to index.html for an extensionless SPA route', () => {
    expect(resolveRequestPath(ROOT, '/catalog/c-1')).toBe(join(ROOT, 'index.html'));
  });

  it('resolves the bare root to index.html', () => {
    expect(resolveRequestPath(ROOT, '/')).toBe(join(ROOT, 'index.html'));
  });

  it('strips a query string before resolving', () => {
    expect(resolveRequestPath(ROOT, '/main-ABC.js?v=2')).toBe(join(ROOT, 'main-ABC.js'));
  });

  it('returns null for a traversal attempt that escapes the root', () => {
    expect(resolveRequestPath(ROOT, '/../../etc/passwd')).toBeNull();
  });

  it('returns null for an encoded traversal attempt', () => {
    expect(resolveRequestPath(ROOT, '/%2e%2e/%2e%2e/etc/passwd')).toBeNull();
  });
});

describe('contentTypeFor', () => {
  it.each([
    ['/x/index.html', 'text/html; charset=utf-8'],
    ['/x/main.js', 'text/javascript; charset=utf-8'],
    ['/x/styles.css', 'text/css; charset=utf-8'],
    ['/x/tokens.json', 'application/json; charset=utf-8'],
    ['/x/logo.svg', 'image/svg+xml'],
    ['/x/photo.jpg', 'image/jpeg'],
    ['/x/icon.png', 'image/png'],
    ['/x/font.woff2', 'font/woff2'],
  ])('maps %s to %s', (path, expected) => {
    expect(contentTypeFor(path)).toBe(expected);
  });

  it('falls back to octet-stream for an unknown extension', () => {
    expect(contentTypeFor('/x/thing.xyz')).toBe('application/octet-stream');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec nx test web-e2e --testPathPattern=static-server`

Expected: FAIL — cannot resolve module `./static-server`.

> If `web-e2e` has no `test` target (it is a Playwright-only project), run the file through the workspace vitest instead: `pnpm exec vitest run apps/web-e2e/src/_helpers/static-server.spec.ts`. Check with `pnpm exec nx show project web-e2e --web` before assuming. If no vitest target covers `apps/web-e2e`, add the spec under an existing tested lib is **not** acceptable — instead add a minimal `test` target to `apps/web-e2e/project.json` using `@nx/vitest:vitest` mirroring another project's config, and say so in the commit message.

- [ ] **Step 3: Write the implementation**

Create `apps/web-e2e/src/_helpers/static-server.ts`:

```typescript
import { createServer, type Server } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

/**
 * Serves a built Angular browser bundle for the performance suite.
 *
 * The a11y and responsive sweeps serve `nx serve web` — the dev server —
 * which is fine for axe scans and overflow checks and useless for timing:
 * dev bundles are unminified, untree-shaken, and run dev-mode change
 * detection. The perf gate measures the artefact the deploy actually ships,
 * so it serves `dist/apps/web/browser` statically instead.
 *
 * Deliberately dependency-free (node:http + node:fs). The workspace has no
 * static server and `express` is only present transitively under
 * @nestjs/platform-express; adding `serve` or `http-server` would buy
 * nothing these ~60 lines do not already do for this single use.
 */

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

export function contentTypeFor(filePath: string): string {
  return CONTENT_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * Map a request path to a file inside `rootDir`, or null if it escapes.
 *
 * Extensionless paths fall back to index.html so Angular's client-side
 * routes (/catalog/c-1, /learn/c-1/l-1) resolve — without this every perf
 * navigation past the root would 404 and the LCP measurement would time a
 * "not found" page.
 */
export function resolveRequestPath(rootDir: string, urlPath: string): string | null {
  const withoutQuery = urlPath.split('?')[0] ?? '/';
  let decoded: string;
  try {
    decoded = decodeURIComponent(withoutQuery);
  } catch {
    // Malformed percent-encoding is not a path we are willing to guess at.
    return null;
  }

  const root = resolve(rootDir);
  // SPA fallback BEFORE the traversal check: an extensionless path never
  // touches the filesystem shape, it always becomes index.html.
  if (!extname(decoded)) {
    return join(root, 'index.html');
  }

  const candidate = resolve(root, '.' + normalize(decoded));
  if (candidate !== root && !candidate.startsWith(root + sep)) {
    return null;
  }
  return candidate;
}

export async function startStaticServer(
  rootDir: string,
  port: number,
): Promise<{ url: string; close: () => Promise<void> }> {
  const root = resolve(rootDir);
  if (!existsSync(join(root, 'index.html'))) {
    throw new Error(
      `Static server root "${root}" has no index.html. ` +
        `Run \`pnpm exec nx build web\` first — the perf target declares ` +
        `dependsOn: ["web:build"], so this means the build output moved.`,
    );
  }

  const server: Server = createServer((req, res) => {
    const filePath = resolveRequestPath(root, req.url ?? '/');
    if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentTypeFor(filePath) });
    createReadStream(filePath).pipe(res);
  });

  await new Promise<void>((done) => server.listen(port, done));

  return {
    url: `http://localhost:${port}`,
    close: () => new Promise<void>((done, fail) =>
      server.close((err) => (err ? fail(err) : done())),
    ),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec nx test web-e2e --testPathPattern=static-server` (or the vitest fallback from Step 2)

Expected: PASS, all 14 assertions.

- [ ] **Step 5: Lint and typecheck**

Run: `pnpm exec nx lint web-e2e && pnpm exec nx typecheck web-e2e`

Expected: both clean. If `typecheck` complains that the spec file is not in a tsconfig's `include`, add it to `apps/web-e2e/tsconfig.json` — do not silence the error.

- [ ] **Step 6: Commit**

```bash
git add apps/web-e2e/src/_helpers/static-server.ts apps/web-e2e/src/_helpers/static-server.spec.ts
git commit -m "feat(web-e2e): static file server for the perf suite

The perf gate must measure the production bundle, not the dev server, so
it needs something to serve dist/apps/web/browser. Dependency-free
node:http with SPA fallback and a traversal guard."
```

---

### Task 2: Perf measurement helpers

Throttle constants, the LCP observer, and the median. Separated from the specs so both perf specs share one definition of "standard broadband" — if it lived in each spec they could drift.

**Files:**
- Create: `apps/web-e2e/src/_helpers/perf-measure.ts`
- Test: `apps/web-e2e/src/_helpers/perf-measure.spec.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `export const BROADBAND: { downloadKbps: number; uploadKbps: number; latencyMs: number; cpuThrottleRate: number }`
  - `export const SAMPLE_COUNT: number` (= 3)
  - `export const STUB_DELAY_MS: number` (= 150)
  - `export function median(values: readonly number[]): number` — throws on an empty array.
  - `export async function applyBroadbandThrottle(page: Page): Promise<void>`
  - `export async function measureLcp(page: Page, path: string): Promise<number>` — installs the observer, navigates, returns LCP in ms.

- [ ] **Step 1: Write the failing test**

Create `apps/web-e2e/src/_helpers/perf-measure.spec.ts`:

```typescript
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec nx test web-e2e --testPathPattern=perf-measure`

Expected: FAIL — cannot resolve module `./perf-measure`.

- [ ] **Step 3: Write the implementation**

Create `apps/web-e2e/src/_helpers/perf-measure.ts`:

```typescript
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec nx test web-e2e --testPathPattern=perf-measure`

Expected: PASS, all 9 assertions.

- [ ] **Step 5: Lint and typecheck**

Run: `pnpm exec nx lint web-e2e && pnpm exec nx typecheck web-e2e`

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web-e2e/src/_helpers/perf-measure.ts apps/web-e2e/src/_helpers/perf-measure.spec.ts
git commit -m "feat(web-e2e): broadband throttle profile and LCP measurement helpers

The throttle profile intentionally models desktop broadband rather than
Lighthouse's slow-4G default, because the acceptance criterion says
'standard broadband'. A test pins the values so the departure survives."
```

---

### Task 3: Delayed stubs and the perf route inventory

The perf suite reuses the existing stubbing helpers but needs two things they do not have: a response delay, and a lesson fixture whose video is actually `READY`.

**Files:**
- Modify: `apps/web-e2e/src/_helpers/route-stubs.ts` (the `stubJson` function, currently at lines 56-70)
- Modify: `apps/web-e2e/src/_helpers/route-inventory.ts` (append new exports)

**Interfaces:**
- Consumes: `STUB_DELAY_MS` from Task 2.
- Produces:
  - `stubJson(page, urlGlob, body, status?, delayMs?)` — a fifth optional parameter, defaulting to `0` so every existing call site is unchanged.
  - `export const LESSON_PAYLOAD_READY` — `LESSON_PAYLOAD` with `videoId: 'v-1'`, `videoState: 'READY'`.
  - `export const PERF_ROUTES: RouteFixture[]` — the four routes from spec §5, with `stubs` registered through the delayed variant.

- [ ] **Step 1: Add the delay parameter to `stubJson`**

In `apps/web-e2e/src/_helpers/route-stubs.ts`, replace the `stubJson` function with:

```typescript
/**
 * Fulfil a URL glob with a JSON body.
 *
 * `delayMs` exists for the performance suite: an instantly-fulfilled stub
 * makes the client render against an impossibly fast server, which flatters
 * the LCP measurement. The a11y and responsive sweeps pass nothing and keep
 * the old instant behaviour — they measure DOM, not time.
 */
export async function stubJson(
  page: Page,
  urlGlob: string,
  body: unknown,
  status = 200,
  delayMs = 0,
): Promise<void> {
  await page.route(urlGlob, async (route) => {
    if (delayMs > 0) {
      await new Promise((done) => setTimeout(done, delayMs));
    }
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}
```

Note the handler became `async` and now `await`s `route.fulfill` rather than firing `void route.fulfill(...)`. That is required: with a delay, a fire-and-forget fulfil can race the handler returning.

- [ ] **Step 2: Verify no existing suite regressed**

Run: `pnpm exec nx run web-e2e:a11y`

Expected: PASS, same test count as before the change. This proves the default `delayMs = 0` really is behaviour-preserving for the two existing sweeps.

- [ ] **Step 3: Add the perf fixtures to the route inventory**

Append to `apps/web-e2e/src/_helpers/route-inventory.ts`:

```typescript
// ---------------------------------------------------------------------------
// Performance suite (US-09-01). See
// docs/superpowers/specs/2026-08-08-us-09-01-performance-design.md.
// ---------------------------------------------------------------------------

/**
 * LESSON_PAYLOAD deliberately has videoId/videoState null so the a11y sweep
 * covers the "processing" state. The perf suite needs the opposite: a lesson
 * whose video is READY, so VideoPlayerComponent actually mounts and there is
 * something to time.
 */
export const LESSON_PAYLOAD_READY = {
  ...LESSON_PAYLOAD,
  lesson: { ...LESSON_PAYLOAD.lesson, videoId: 'v-1', videoState: 'READY' },
};

/**
 * The four student-journey routes the load-time gate measures. Deliberately
 * NOT the full 23-route inventory the a11y and responsive sweeps use: 23
 * throttled median-of-3 navigations is slow, and each one is a flake
 * surface. These four are the routes a student actually waits on.
 *
 * Stubs mirror the same routes' entries in GUEST_ROUTES/AUTHED_ROUTES but
 * pass STUB_DELAY_MS. Broad globs FIRST, specific paths LAST — Playwright
 * matches handlers in reverse registration order.
 */
export const PERF_ROUTES: RouteFixture[] = [
  { name: 'landing', path: '/', role: 'guest' },
  {
    name: 'catalogue',
    path: '/catalog',
    role: 'guest',
    stubs: async (page) => {
      await stubJson(page, '**/api/categories', CATEGORIES, 200, STUB_DELAY_MS);
      await stubJson(page, '**/api/catalog**', CATALOG_LIST, 200, STUB_DELAY_MS);
    },
    expectText: COURSE_CARD.title,
  },
  {
    name: 'course detail',
    path: '/catalog/c-1',
    role: 'guest',
    stubs: async (page) => {
      await stubJson(page, '**/api/catalog**', CATALOG_LIST, 200, STUB_DELAY_MS);
      await stubJson(page, '**/api/catalog/c-1', COURSE_DETAIL, 200, STUB_DELAY_MS);
    },
    expectText: 'Welcome to Wren',
  },
  {
    name: 'learn page',
    path: '/learn/c-1/l-1',
    role: 'student',
    stubs: async (page) => {
      await stubJson(page, '**/api/playback/config', { fakePlayback: false }, 200, STUB_DELAY_MS);
      await stubJson(
        page,
        '**/api/learn/courses/c-1/lessons/l-1',
        LESSON_PAYLOAD,
        200,
        STUB_DELAY_MS,
      );
    },
    // Not the lesson title — it renders in both the <h1> and the matching
    // outline row, which is a Playwright strict-mode violation.
    expectText: 'Module 1',
  },
];
```

Add `STUB_DELAY_MS` to the existing import from `./route-stubs`… it lives in `./perf-measure`, so add a new import line at the top of the file:

```typescript
import { STUB_DELAY_MS } from './perf-measure';
```

- [ ] **Step 4: Typecheck**

Run: `pnpm exec nx lint web-e2e && pnpm exec nx typecheck web-e2e`

Expected: clean. If `typecheck` reports that `LESSON_PAYLOAD_READY` is unused, that is expected — Task 6 consumes it. Leave it.

- [ ] **Step 5: Commit**

```bash
git add apps/web-e2e/src/_helpers/route-stubs.ts apps/web-e2e/src/_helpers/route-inventory.ts
git commit -m "feat(web-e2e): delayed API stubs and the perf route inventory

stubJson gains an optional delay so the perf suite renders against a
plausible server rather than an instant one; default 0 leaves the a11y and
responsive sweeps byte-identical."
```

---

### Task 4: Perf Playwright config and Nx target

Wire the suite up so it can run at all, with a placeholder spec. This is a separate task from the real specs because a reviewer could reasonably approve the plumbing and reject the measurements, or the reverse.

**Files:**
- Create: `apps/web-e2e/playwright.perf.config.ts`
- Create: `apps/web-e2e/src/perf/smoke.perf.spec.ts` (temporary — deleted in Task 5)
- Modify: `apps/web-e2e/project.json`

**Interfaces:**
- Consumes: `startStaticServer` from Task 1 — but see Step 1, the config uses a CLI entry point rather than importing it directly.
- Produces: a runnable `pnpm exec nx run web-e2e:perf`.

- [ ] **Step 1: Create the server entry point**

Playwright's `webServer.command` runs a shell command, so `startStaticServer` needs a CLI wrapper. Create `apps/web-e2e/src/_helpers/static-server.cli.ts`:

```typescript
/**
 * CLI entry point so playwright.perf.config.ts can start the static server
 * through `webServer.command`. Kept separate from static-server.ts so that
 * module stays a pure, unit-testable library with no side effects on import.
 */
import { startStaticServer } from './static-server';

const root = process.argv[2];
const port = Number(process.argv[3]);

if (!root || !Number.isInteger(port)) {
  console.error('usage: static-server.cli.ts <rootDir> <port>');
  process.exit(1);
}

startStaticServer(root, port)
  .then(({ url }) => console.log(`static server listening on ${url}`))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
```

- [ ] **Step 2: Create the Playwright config**

Create `apps/web-e2e/playwright.perf.config.ts`:

```typescript
import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { workspaceRoot } from '@nx/devkit';
import { join } from 'node:path';

/**
 * Standalone config for the performance suite (US-09-01).
 *
 * Differs from playwright.a11y.config.ts and playwright.responsive.config.ts
 * in one way that matters: it serves the PRODUCTION BUILD through a static
 * server rather than running `nx serve web`. Dev-server bundles are
 * unminified, untree-shaken, and run dev-mode change detection, so an LCP
 * measured against them describes the dev server and not the product.
 * `web-e2e:perf` declares dependsOn: ["web:build"] so the bundle exists.
 *
 * Like the other two suites it is hermetic — every /api call is stubbed via
 * page.route — so it needs neither the NestJS api nor the Firebase emulators.
 *
 * RETRIES ARE DISABLED HERE, unlike the other two suites. A perf budget that
 * passes on the third attempt has not been met; retrying a timing assertion
 * launders a real regression into a green checkmark. Flakiness is instead
 * absorbed by the median-of-3 sampling INSIDE each test (see
 * _helpers/perf-measure.ts), which is a statistic rather than a do-over.
 */
const webPort = Number(process.env['PERF_WEB_PORT'] || 4310);
const baseURL = process.env['BASE_URL'] || `http://localhost:${webPort}`;
const buildOutput = join(workspaceRoot, 'dist/apps/web/browser');
const cliEntry = join(workspaceRoot, 'apps/web-e2e/src/_helpers/static-server.cli.ts');

export default defineConfig({
  ...nxE2EPreset(__filename, { testDir: './src/perf' }),
  retries: 0,
  // Timing tests must not run concurrently: parallel workers contend for CPU
  // and network, which is exactly the noise the median is meant to exclude.
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: `pnpm exec tsx ${cliEntry} ${buildOutput} ${webPort}`,
      url: baseURL,
      reuseExistingServer: !process.env['CI'],
      cwd: workspaceRoot,
      timeout: 30_000,
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

> **Check `tsx` is available** before accepting this: run `pnpm exec tsx --version`. If it is not installed, do **not** add it as a dependency. Instead compile-free alternatives in order of preference: (a) use `node --experimental-strip-types` if Node 22 in this workspace supports it — verify with `node --experimental-strip-types -e "const x: number = 1; console.log(x)"`; (b) write `static-server.cli.ts` as `static-server.cli.mjs` in plain JavaScript importing the compiled helper. Record which you chose in the commit message.

- [ ] **Step 3: Write a placeholder spec so the config has something to run**

Create `apps/web-e2e/src/perf/smoke.perf.spec.ts`:

```typescript
import { expect, test } from '@playwright/test';

/**
 * Temporary: proves the static server serves the PRODUCTION bundle before
 * the real perf specs land. Deleted in Task 5.
 */
test('serves the production build, not the dev server', async ({ page }) => {
  await page.goto('/');
  const html = await page.content();
  // Production output uses hashed bundle filenames (outputHashing: "all" in
  // apps/web/project.json). The dev server serves unhashed ones.
  expect(html).toMatch(/main-[A-Z0-9]{8,}\.js/i);
  // And the dev server injects a live-reload client the static server cannot.
  expect(html).not.toContain('webpack-dev-server');
});
```

- [ ] **Step 4: Add the Nx target**

In `apps/web-e2e/project.json`, add to `targets` alongside `a11y` and `responsive`:

```json
    "perf": {
      "executor": "@nx/playwright:playwright",
      "dependsOn": ["web:build"],
      "options": {
        "config": "apps/web-e2e/playwright.perf.config.ts"
      }
    }
```

- [ ] **Step 5: Run it**

Run: `pnpm exec nx run web-e2e:perf`

Expected: PASS, 1 test. Nx builds `web` first (watch for the production build in the output). If the run fails with "Static server root … has no index.html", confirm the actual output directory with `ls dist/apps/web` and correct `buildOutput` in the config — the Angular application builder emits under `browser/`, but verify rather than assume.

- [ ] **Step 6: Commit**

```bash
git add apps/web-e2e/playwright.perf.config.ts apps/web-e2e/src/_helpers/static-server.cli.ts apps/web-e2e/src/perf/smoke.perf.spec.ts apps/web-e2e/project.json
git commit -m "feat(web-e2e): perf suite config serving the production build

Retries are disabled deliberately: a budget met on the third attempt was
not met. Noise is absorbed by median-of-3 sampling inside each test."
```

---

### Task 5: The load-time gate

**Files:**
- Create: `apps/web-e2e/src/perf/load-time.perf.spec.ts`
- Delete: `apps/web-e2e/src/perf/smoke.perf.spec.ts`
- Modify: `docs/superpowers/specs/2026-08-08-us-09-01-performance-design.md` (write baselines into §5)

**Interfaces:**
- Consumes: `PERF_ROUTES` (Task 3), `applyBroadbandThrottle` / `measureLcp` / `median` / `SAMPLE_COUNT` (Task 2), `stubAuth` (existing).
- Produces: nothing consumed downstream.

- [ ] **Step 1: Measure the baselines**

Before writing any budget, get real numbers. Create the spec with a temporary reporting-only body:

```typescript
import { test } from '@playwright/test';

import { PERF_ROUTES } from '../_helpers/route-inventory';
import { stubAuth } from '../_helpers/route-stubs';
import { applyBroadbandThrottle, measureLcp, median } from '../_helpers/perf-measure';

for (const route of PERF_ROUTES) {
  test(`BASELINE ${route.name}`, async ({ page }) => {
    await applyBroadbandThrottle(page);
    await stubAuth(page, route.role);
    await route.stubs?.(page);
    const samples: number[] = [];
    for (let i = 0; i < 5; i++) {
      samples.push(await measureLcp(page, route.path));
    }
    console.log(`${route.name}: samples=${samples.map(Math.round).join(',')} median=${Math.round(median(samples))}`);
  });
}
```

Run it on a quiet machine (close other applications — this is a measurement, not a test):

`pnpm exec nx run web-e2e:perf`

Record the four medians. Run it **twice** and use the higher median per route; a single cold run understates nothing but a single warm run overstates confidence.

- [ ] **Step 2: Compute and record the budgets**

For the three non-catalogue routes: `budget = ceil(median * 1.4 / 50) * 50`.
The catalogue budget is **2000** regardless of what it measures — it comes from the acceptance criterion.

**If the catalogue's measured median already exceeds 2000 ms, stop and report it.** That is a genuine finding: the product does not meet its own acceptance criterion, and the correct response is optimisation work, not a wider budget. Do not proceed to Step 3 with a failing catalogue.

Write both the measured medians and the derived budgets into spec §5, replacing the "baseline × 1.4" placeholders with the real numbers and a line naming the machine and date they were measured on.

- [ ] **Step 3: Write the real spec**

Replace `apps/web-e2e/src/perf/load-time.perf.spec.ts` entirely (substituting the four real budget numbers from Step 2 into `BUDGETS_MS`):

```typescript
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
  landing: 0, // <- replace with the derived budget from Step 2
  catalogue: 2000, // <- from the acceptance criterion; do not widen
  'course detail': 0, // <- replace with the derived budget from Step 2
  'learn page': 0, // <- replace with the derived budget from Step 2
};

for (const route of PERF_ROUTES) {
  const budget = BUDGETS_MS[route.name];

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
```

- [ ] **Step 4: Run it and verify it passes**

Run: `pnpm exec nx run web-e2e:perf`

Expected: PASS, 4 tests.

- [ ] **Step 5: Prove the gate can fail**

A perf gate that has never been seen to go red is not known to be a gate. Temporarily add a 3-second delay to the catalogue's stub — in `route-inventory.ts`, change the catalogue's `stubJson(page, '**/api/catalog**', CATALOG_LIST, 200, STUB_DELAY_MS)` to use `3000` instead of `STUB_DELAY_MS`.

Run: `pnpm exec nx run web-e2e:perf`

Expected: the catalogue test FAILS with the "LCP median … over budget 2000ms" message and the sample list. Confirm the other three still pass.

**Revert the change** before continuing.

- [ ] **Step 6: Delete the placeholder spec**

```bash
git rm apps/web-e2e/src/perf/smoke.perf.spec.ts
```

Run `pnpm exec nx run web-e2e:perf` once more. Expected: PASS, 4 tests (the smoke test is gone).

- [ ] **Step 7: Commit**

```bash
git add apps/web-e2e/src/perf/load-time.perf.spec.ts docs/superpowers/specs/2026-08-08-us-09-01-performance-design.md
git commit -m "feat(web-e2e): LCP gate on the four student-journey routes

Catalogue holds the epic's hard 2000ms; the other three budgets are derived
from measured medians recorded in the spec. Verified red by injecting a 3s
stub delay before landing."
```

---

### Task 6: The video-start gate

**Files:**
- Create: `apps/web-e2e/src/fixtures/hls/` (master.m3u8, 720p.m3u8, key.bin, seg0.ts.bin, README.md)
- Create: `apps/web-e2e/src/_helpers/hls-fixture.ts`
- Create: `apps/web-e2e/src/perf/video-start.perf.spec.ts`

**Interfaces:**
- Consumes: `LESSON_PAYLOAD_READY` (Task 3), `stubAuth` / `stubJson` (existing), `applyBroadbandThrottle` / `median` / `SAMPLE_COUNT` / `STUB_DELAY_MS` (Task 2).
- Produces: `export async function stubHlsFixture(page: Page, videoId: string): Promise<void>`.

- [ ] **Step 1: Generate the HLS fixture**

Run locally (requires ffmpeg; CI never does). From the workspace root:

```bash
mkdir -p apps/web-e2e/src/fixtures/hls
cd apps/web-e2e/src/fixtures/hls

# A deterministic 2-second 640x360 test pattern with a silent audio track.
ffmpeg -y \
  -f lavfi -i testsrc=duration=2:size=640x360:rate=25 \
  -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 \
  -t 2 -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac \
  -shortest raw.mp4

# 16-byte AES-128 key plus the keyinfo file ffmpeg needs.
openssl rand 16 > key.bin
printf '/api/playback/keys/v-1\nkey.bin\n' > key.keyinfo

ffmpeg -y -i raw.mp4 \
  -c copy -f hls -hls_time 2 -hls_playlist_type vod \
  -hls_key_info_file key.keyinfo \
  -hls_segment_filename 'seg%d.ts' \
  720p.m3u8

rm raw.mp4 key.keyinfo
mv seg0.ts seg0.ts.bin
```

Then hand-edit `720p.m3u8` so its segment line reads `/perf-fixture/seg0.ts` instead of `seg0.ts` — the rendition playlist production serves has absolute segment URLs, and a rooted path is what the route handler intercepts.

Create `master.m3u8` by hand:

```
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=1200000,RESOLUTION=640x360
/api/playback/manifest/v-1/rendition/720p
```

Verify the result: `cat 720p.m3u8` should show `#EXT-X-KEY:METHOD=AES-128,URI="/api/playback/keys/v-1",IV=…`, one `#EXTINF`, and the `/perf-fixture/seg0.ts` line. If ffmpeg produced more than one segment, either accept them all (stub `**/perf-fixture/*.ts` covers them) or re-run with a larger `-hls_time`.

- [ ] **Step 2: Document the regeneration**

Create `apps/web-e2e/src/fixtures/hls/README.md` containing the exact command block from Step 1, prefaced with:

```markdown
# HLS perf fixture

A 2-second AES-128 encrypted HLS asset used by
`apps/web-e2e/src/perf/video-start.perf.spec.ts` to measure click-to-first-frame
(US-09-01: "video playback must begin within 3 seconds of clicking play").

Committed as bytes so **CI never needs ffmpeg**. Regenerate only if the player
changes in a way this no longer exercises — the numbers in the perf gate are
calibrated against these exact bytes, so a regeneration invalidates them.

`seg0.ts.bin` carries a `.bin` suffix so TypeScript tooling never mistakes an
MPEG transport stream for a `.ts` source file.
```

…followed by the command block.

- [ ] **Step 3: Write the fixture route handlers**

Create `apps/web-e2e/src/_helpers/hls-fixture.ts`:

```typescript
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

/**
 * Serve the committed HLS fixture through page.route, mirroring the four
 * endpoints the player actually walks in production (verified against
 * libs/api-courses/src/lib/video/playback/playback.controller.ts and
 * manifest.rewriter.ts):
 *
 *   master playlist -> rendition playlist -> AES key -> segments
 *
 * Segment URIs are a synthetic /perf-fixture/ path rather than the absolute
 * signed GCS URLs production emits, because a signed URL is unstubbable by
 * design. The shape the PLAYER sees is identical: "the playlist hands me
 * URLs, I fetch them".
 */
const FIXTURE_DIR = join(__dirname, '..', 'fixtures', 'hls');
const M3U8 = 'application/vnd.apple.mpegurl';

function read(name: string): Buffer {
  return readFileSync(join(FIXTURE_DIR, name));
}

export async function stubHlsFixture(page: Page, videoId: string): Promise<void> {
  // Broad glob FIRST, specific paths LAST — Playwright matches route
  // handlers in REVERSE registration order.
  await page.route(`**/api/playback/manifest/${videoId}`, (route) =>
    route.fulfill({ status: 200, contentType: M3U8, body: read('master.m3u8') }),
  );
  await page.route(`**/api/playback/manifest/${videoId}/rendition/720p`, (route) =>
    route.fulfill({ status: 200, contentType: M3U8, body: read('720p.m3u8') }),
  );
  await page.route(`**/api/playback/keys/${videoId}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/octet-stream',
      body: read('key.bin'),
    }),
  );
  await page.route('**/perf-fixture/*.ts', (route) => {
    const name = route.request().url().split('/').pop()!;
    route.fulfill({
      status: 200,
      contentType: 'video/mp2t',
      body: read(`${name}.bin`),
    });
  });
}
```

- [ ] **Step 4: Write the failing spec**

Create `apps/web-e2e/src/perf/video-start.perf.spec.ts`:

```typescript
import { expect, test } from '@playwright/test';

import { LESSON_PAYLOAD_READY } from '../_helpers/route-inventory';
import { stubAuth, stubJson } from '../_helpers/route-stubs';
import { stubHlsFixture } from '../_helpers/hls-fixture';
import {
  SAMPLE_COUNT,
  STUB_DELAY_MS,
  applyBroadbandThrottle,
  median,
} from '../_helpers/perf-measure';

/**
 * US-09-01: "Video playback must begin within 3 seconds of clicking play on
 * a standard broadband connection."
 *
 * This is also the first thing in the repo that proves playback starts AT
 * ALL. videos.spec.ts:257-258 records that the fake playback seam returns
 * gs-stub:// segment URIs hls.js cannot fetch, so until now no CI run had
 * ever decoded a frame.
 */
const BUDGET_MS = 3000;
const VIDEO_ID = 'v-1';

test(`playback begins within ${BUDGET_MS}ms of play()`, async ({ page }) => {
  await applyBroadbandThrottle(page);
  await stubAuth(page, 'student');
  // fakePlayback MUST be false: in fake mode VideoPlayerComponent renders a
  // dev placeholder and never mounts hls.js
  // (video-player.component.html:14-21), so the gate would time nothing.
  await stubJson(page, '**/api/playback/config', { fakePlayback: false }, 200, STUB_DELAY_MS);
  await stubJson(
    page,
    '**/api/learn/courses/c-1/lessons/l-1',
    LESSON_PAYLOAD_READY,
    200,
    STUB_DELAY_MS,
  );
  await stubHlsFixture(page, VIDEO_ID);

  const samples: number[] = [];

  for (let i = 0; i < SAMPLE_COUNT; i++) {
    await page.goto('/learn/c-1/l-1');

    const player = page.locator('[data-testid="video-player"]');
    await expect(player).toBeAttached();
    // If the player fell into its error state the timing below would hang
    // until the test timeout, reporting a useless "exceeded 30000ms" rather
    // than the actual cause. Fail loudly instead.
    await expect(page.locator('[data-testid="video-player-error"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="video-player-dev-placeholder"]')).toHaveCount(0);

    // The player uses native <video controls>, whose buttons live in the
    // browser's shadow UI and are not reliably clickable from Playwright.
    // Calling play() starts the same clock at the same point in the
    // pipeline; it is the honest equivalent of the user's click, not a
    // real pointer event.
    const elapsed = await player.evaluate(async (el) => {
      const video = el as HTMLVideoElement;
      const started = performance.now();
      const firstFrame = new Promise<number>((resolveFrame) => {
        const onTimeUpdate = () => {
          if (video.currentTime > 0) {
            video.removeEventListener('timeupdate', onTimeUpdate);
            resolveFrame(performance.now() - started);
          }
        };
        video.addEventListener('timeupdate', onTimeUpdate);
      });
      await video.play();
      return firstFrame;
    });

    samples.push(elapsed);
  }

  const observed = Math.round(median(samples));
  expect(
    observed,
    `time-to-first-frame median ${observed}ms over budget ${BUDGET_MS}ms ` +
      `(samples: ${samples.map(Math.round).join(', ')}ms)`,
  ).toBeLessThanOrEqual(BUDGET_MS);
});
```

- [ ] **Step 5: Run it**

Run: `pnpm exec nx run web-e2e:perf`

Expected: PASS, 5 tests (4 load-time + 1 video-start).

If the video test times out, diagnose in this order before touching the budget:
1. Does the learn page render a player at all? Add `await page.pause()` locally, or assert on `[data-testid="video-processing"]` — if that is present, `LESSON_PAYLOAD_READY` is not reaching the component.
2. Is autoplay policy blocking `play()`? Chromium blocks audible autoplay, but this is a user-gesture-free `play()` on a muted-by-default-silent track. If it rejects, add `video.muted = true` before `play()` and note it in a comment.
3. Is hls.js erroring? Check `page.on('console')` output for the fatal-error path.

- [ ] **Step 6: Prove the gate can fail**

Temporarily break the key: in `hls-fixture.ts`, change the key handler to return `status: 404`.

Run: `pnpm exec nx run web-e2e:perf`

Expected: the video test FAILS (either the error-state assertion trips, or the first-frame promise never resolves and the test times out). Either is an acceptable failure — what matters is that it does not pass. Confirm it does not.

**Revert the change.**

- [ ] **Step 7: Lint, typecheck, and commit**

Run: `pnpm exec nx lint web-e2e && pnpm exec nx typecheck web-e2e`

```bash
git add apps/web-e2e/src/fixtures/hls apps/web-e2e/src/_helpers/hls-fixture.ts apps/web-e2e/src/perf/video-start.perf.spec.ts
git commit -m "feat(web-e2e): click-to-first-frame gate on a real HLS fixture

First CI coverage that decodes a video frame at all — the fake playback
seam returns gs-stub:// URIs hls.js cannot fetch, so playback was never
exercised. Fixture committed as bytes; CI needs no ffmpeg."
```

---

### Task 7: CI wiring

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: the `web-e2e:perf` target from Task 4.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Read the existing responsive gate job**

Run: `sed -n '105,135p' .github/workflows/ci.yml`

The perf job mirrors it exactly, changing only the job id, name, and the final command. Copy the real steps from the file rather than from this plan — checkout action versions and cache setup must match the neighbouring jobs, and they may have drifted since this plan was written.

- [ ] **Step 2: Add the job**

Append a job after the responsive gate, structured identically to it, with:

- `name: Performance gate (LCP + video start)`
- The same checkout / pnpm / Node 22 / `pnpm install --frozen-lockfile` / `pnpm exec playwright install --with-deps chromium` steps as the responsive job
- Final step:

```yaml
      - name: Run performance gate
        run: pnpm exec nx run web-e2e:perf
```

No Java or emulator setup — the suite is hermetic. Nx builds `web` via the target's `dependsOn`, so no explicit build step is needed either.

- [ ] **Step 3: Validate the workflow parses**

Run: `pnpm exec nx run web-e2e:perf` one final time locally to confirm nothing regressed, and check the YAML with `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml'))"`.

Expected: no output from the YAML check (valid), perf suite green.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: gate on the US-09-01 performance suite"
```

---

### Task 8: Documentation and the deferred-AC amendment

Two of the story's four acceptance criteria are not met by this work. Leaving them silently unmet would be the dishonest option; they get amended on the record instead, exactly as US-09-05 handled its touch-target criterion.

**Files:**
- Modify: `docs/epics/09-non-functional-requirements.md`
- Modify: `README.md`
- Modify: `docs/USER_GUIDE.md`

**Interfaces:** none.

- [ ] **Step 1: Amend the epic**

In `docs/epics/09-non-functional-requirements.md`, under US-09-01, replace the two load-related acceptance criteria bullets with amended versions. Preserve the `> [!NOTE] DOCUMENT STATUS: DRAFT` banner at the top of the file.

```markdown
- All non-video pages must achieve a Time to First Byte (TTFB) of under 500 ms for 95% of requests under normal load. **Deferred 2026-08-08:** verifying this requires a load harness (k6 or equivalent) driving the deployed production API. It cannot be checked in the shipped CI gate, which is hermetic. Measuring it against the Firebase emulators would be worse than not measuring it: emulator throughput has no relationship to production Cloud Functions — no cold starts, no autoscaling, none of Firestore's real latency profile — so a green emulator result would read as evidence while proving nothing. Closing this criterion requires a load-test pass against production. See `docs/superpowers/specs/2026-08-08-us-09-01-performance-design.md` §7.
- The course catalogue page must load within 2 seconds on a standard broadband connection. **Gated in CI since 2026-08-08** (`nx run web-e2e:perf`).
- Video playback must begin within 3 seconds of clicking play on a standard broadband connection. **Gated in CI since 2026-08-08** (`nx run web-e2e:perf`).
- The platform must support at least 100 concurrent users without degradation in response time. **Deferred 2026-08-08:** same reason as the TTFB criterion above — needs a load harness against production, not the emulators.
```

(Keep the criteria in the epic's existing order; the two gated ones are shown here beside their deferred neighbours only to make the amendment legible.)

- [ ] **Step 2: Update the README**

Add a bullet to the shipped-slices list in `README.md`, matching the voice and honest-scope habit of the neighbouring US-09-03 and US-09-05 entries (lines 27 and 29). It must state:

- What is gated: LCP on landing / catalogue / course detail / learn page, and click-to-first-frame on a real HLS fixture, via `nx run web-e2e:perf` on each CI run.
- The catalogue's 2000 ms and video's 3000 ms come from the acceptance criteria; the other three budgets are derived from measured medians recorded in the spec.
- That this suite is the first to serve the **production build** rather than the dev server, and why.
- That it is the first CI coverage to decode a video frame at all.
- Honest scope: it measures client render cost under a modelled 10 Mbps / 40 ms link with stubbed APIs. It proves nothing about real API latency, CDN behaviour, cold starts, or concurrency.
- That **US-09-01's TTFB and 100-concurrent-user criteria remain deferred**, and **US-09-04 (self-hosting) remains open** — with US-09-04 now the only wholly-unstarted story in the spec.

Also update the trailing sentence of the US-09-05 bullet (line 29), which currently reads "US-09-01 (performance) and US-09-04 (self-hosting) remain open" — it is now stale.

- [ ] **Step 3: Update the USER_GUIDE**

Add a performance entry to `docs/USER_GUIDE.md` in the same register as its accessibility and responsiveness entries — what a user can rely on, not how it is implemented. Check the file's existing structure first (`grep -n "Accessibility\|Responsive" docs/USER_GUIDE.md`) and match it.

- [ ] **Step 4: Verify no doc contradicts another**

Run: `grep -rn "US-09-01\|performance" README.md docs/USER_GUIDE.md docs/epics/09-non-functional-requirements.md`

Read every hit. The README is the authoritative feature record; nothing may claim performance is unaddressed, and nothing may claim the deferred criteria are met.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/USER_GUIDE.md docs/epics/09-non-functional-requirements.md
git commit -m "docs: record the US-09-01 performance gate and its two deferred criteria

TTFB-at-p95 and 100-concurrent-users are amended as deferred with the
reason: emulator throughput says nothing about production Cloud Functions,
so a green emulator gate would read as evidence while proving nothing."
```

---

### Task 9: Full-suite verification and landing

**Files:** none created or modified — this task is verification.

- [ ] **Step 1: Run the full affected build**

Run: `pnpm exec nx affected -t lint test build typecheck --base=main`

Expected: all green.

- [ ] **Step 2: Run all three browser gates**

Run each in turn:

```bash
pnpm exec nx run web-e2e:a11y
pnpm exec nx run web-e2e:responsive
pnpm exec nx run web-e2e:perf
```

Expected: a11y green with its usual test count, responsive green at 103 tests, perf green at 5 tests. A changed count in the first two means Task 3's `stubJson` change was not behaviour-preserving after all — investigate rather than accept.

- [ ] **Step 3: Confirm the perf suite is genuinely hermetic**

With **no emulators and no api running**, run `pnpm exec nx run web-e2e:perf`. Expected: still green. If it needs either, a stub is missing and a real request is escaping.

- [ ] **Step 4: Land the slice**

Use the project's `land-slice` skill, which covers the pre-merge gates, the docs sync, and the memory record. Merge to `main` with a local `--no-ff` merge from the main checkout (not from inside the worktree), then clean up the worktree only after a status check.

---

## Self-Review

**Spec coverage**

| Spec section | Task |
| :--- | :--- |
| §3 Production-build serving basis | Tasks 1, 4 |
| §4 Broadband profile + 150 ms stub delay | Tasks 2, 3 |
| §5 Load-time gate, four routes, median-of-3, derived budgets | Tasks 3, 5 |
| §6 Video-start gate, HLS fixture, `fakePlayback: false`, `LESSON_PAYLOAD_READY` | Tasks 3, 6 |
| §7 Deferred criteria amendment | Task 8 |
| §8 File list | Tasks 1–8 (all files accounted for) |
| §9 Testing — gate proven red, static-server units, existing suites unaffected | Tasks 1, 3 (Step 2), 5 (Step 5), 6 (Step 6), 9 |
| §10 Honest scope | Tasks 5, 8 (in code comments and the README) |
| §11 Risks | Mitigations appear as concrete steps: budget headroom (Task 5), fixture regeneration README (Task 6), build-output fail-fast (Task 1), throttle-profile pinning test (Task 2) |

**Open decisions deliberately left to the implementer**, each with a stated decision procedure rather than a guess: whether `web-e2e` has a vitest target (Task 1 Step 2), whether `tsx` is available (Task 4 Step 2), and the exact `dist` output subdirectory (Task 4 Step 5). These depend on workspace state that must be checked rather than assumed.

**One finding this plan may surface:** if the catalogue's measured LCP already exceeds 2000 ms (Task 5 Step 2), the product does not meet its own acceptance criterion and the slice stops for a decision. The plan says so explicitly rather than quietly widening the budget.

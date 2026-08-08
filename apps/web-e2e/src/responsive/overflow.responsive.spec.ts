import { expect, test } from '@playwright/test';

import { GUEST_ROUTES, AUTHED_ROUTES, type RouteFixture } from '../_helpers/route-inventory';
import { stubAuth } from '../_helpers/route-stubs';
import { expectNoHorizontalOverflow } from '../_helpers/overflow';

/**
 * US-09-05: "Text is legible without horizontal scrolling on any supported
 * screen width" (320 px – 2560 px).
 *
 * 320 and 2560 are the endpoints named in the acceptance criterion. 768 is
 * the Tailwind `md` boundary, where the header swaps between its collapsed
 * and expanded layouts — the width most likely to expose an off-by-one in a
 * breakpoint. 1280 is standard desktop.
 *
 * Exported because header.responsive.spec.ts drives the same widths; one
 * definition means the two specs cannot drift apart.
 */
export const VIEWPORTS = [
  { name: '320 (small mobile)', width: 320, height: 640 },
  { name: '768 (tablet / md boundary)', width: 768, height: 1024 },
  { name: '1280 (desktop)', width: 1280, height: 800 },
  { name: '2560 (large desktop)', width: 2560, height: 1440 },
] as const;

function register(route: RouteFixture): void {
  test.describe(`${route.name} (${route.path})`, () => {
    for (const viewport of VIEWPORTS) {
      test(`has no horizontal overflow at ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await stubAuth(page, route.role);
        await route.stubs?.(page);
        await page.goto(route.path);

        await page.waitForSelector(route.readySelector ?? 'h1, h2, [role="heading"]');

        // Prove the route rendered its REAL content, not an error/empty
        // state — a stubbed page settles on an error paragraph just as fast
        // as on real data, and an error page is narrow enough to pass an
        // overflow check trivially. Without this guard a fixture-shape bug
        // turns into a silently-passing test. Same contract as the a11y
        // sweep; see RouteFixture.expectText in _helpers/route-inventory.ts.
        if (route.expectText) {
          // Scoped to <main>, not the whole page: <app-header> precedes
          // <main> in app.html, and some routes' expectText also appears in
          // the header (e.g. /settings/profile's display name duplicates the
          // header's name chip at >=md), which would otherwise let the
          // header satisfy this guard even if the page body itself errored
          // out — making the overflow assertion below vacuous at any width
          // where the header chip is visible.
          const locator = page.locator('main').getByText(route.expectText);
          if (route.expectAttached) {
            await expect(locator.first()).toBeAttached();
          } else {
            await expect(locator.first()).toBeVisible();
          }
        }

        await expectNoHorizontalOverflow(page, `${route.name} @ ${viewport.width}px`);
      });
    }
  });
}

test.describe('guest routes', () => {
  GUEST_ROUTES.forEach(register);
});

test.describe('authenticated routes', () => {
  AUTHED_ROUTES.forEach(register);
});

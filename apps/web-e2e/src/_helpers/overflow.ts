import { expect, type Page } from '@playwright/test';

/**
 * The one honestly machine-verifiable claim in US-09-05. Everything else in
 * the story ("renders correctly", "touch-friendly") is subjective; gating on
 * a proxy for it would overstate what CI proves. See the spec, §4.5.
 *
 * Lives in _helpers (not inside overflow.responsive.spec.ts) because
 * Playwright refuses to let one test file import another — `header.
 * responsive.spec.ts` needs this same check for the nav sheet's own layout.
 */
export async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => {
    const el = document.documentElement;
    return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
  });

  expect(
    overflow.scrollWidth,
    `${label}: page scrolls horizontally — content is ${
      overflow.scrollWidth - overflow.clientWidth
    }px wider than the ${overflow.clientWidth}px viewport`,
  ).toBeLessThanOrEqual(overflow.clientWidth);
}

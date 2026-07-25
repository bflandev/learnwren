import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  HlmPagination,
  type PaginationItem,
  buildPaginationItems,
} from './hlm-pagination.component';

// Table-drive the pure window math. Each row pins the (page, pageCount,
// siblingCount) input against the canonical PaginationItem list. The window
// algorithm is the high-value coverage — the rest of the component is just
// `@for`/`@switch` wiring around it.
describe('buildPaginationItems', () => {
  type Row = [number, number, number, PaginationItem[], string];
  const rows: Row[] = [
    [1, 1, 1, [1], 'single page'],
    [1, 5, 1, [1, 2, 3, 4, 5], 'small total — no ellipsis'],
    [3, 7, 1, [1, 2, 3, 4, 5, 6, 7], 'exactly at the no-ellipsis ceiling'],
    [
      1,
      10,
      1,
      [1, 2, 3, 4, 5, 'ellipsis', 10],
      'leading window — trailing ellipsis',
    ],
    [
      10,
      10,
      1,
      [1, 'ellipsis', 6, 7, 8, 9, 10],
      'trailing window — leading ellipsis',
    ],
    [
      5,
      10,
      1,
      [1, 'ellipsis', 4, 5, 6, 'ellipsis', 10],
      'middle window — both ellipses',
    ],
    [
      5,
      10,
      2,
      [1, 'ellipsis', 3, 4, 5, 6, 7, 'ellipsis', 10],
      'siblingCount=2 widens the centre window',
    ],
    [
      5,
      9,
      2,
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
      'siblingCount=2 collapses ellipses when totalPageNumbers ≥ pageCount',
    ],
    [
      3,
      10,
      1,
      [1, 2, 3, 4, 5, 'ellipsis', 10],
      'leftSibling exactly 2 — the single-page gap is shown, not elided',
    ],
    [
      8,
      10,
      1,
      [1, 'ellipsis', 6, 7, 8, 9, 10],
      'rightSibling exactly pageCount-1 — the single-page gap is shown, not elided',
    ],
    [
      1,
      10,
      2,
      [1, 2, 3, 4, 5, 6, 7, 'ellipsis', 10],
      'siblingCount=2 leading window spans 3 + 2·siblings pages',
    ],
    [
      10,
      10,
      2,
      [1, 'ellipsis', 4, 5, 6, 7, 8, 9, 10],
      'siblingCount=2 trailing window spans 3 + 2·siblings pages',
    ],
  ];
  it.each(rows)(
    'page=%i / count=%i / siblings=%i → %j  (%s)',
    (page, count, sib, expected) => {
      expect(buildPaginationItems(page, count, sib)).toEqual(expected);
    },
  );
});

// Component-level: pageCount derivation, two-way `page` model via prev/next
// click and number click, edge clamping, and the ARIA contract.
@Component({
  standalone: true,
  imports: [HlmPagination],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hlm-pagination
      [total]="total()"
      [pageSize]="pageSize()"
      [siblingCount]="siblingCount()"
      [(page)]="page"
    />
  `,
})
class TestHost {
  readonly total = signal(95);
  readonly pageSize = signal(10);
  readonly siblingCount = signal(1);
  // `page` is a signal so we can both read it (assertions) and set() it
  // (driving the component's model() input under zoneless change detection).
  readonly page = signal(1);
}

function setup() {
  const fixture = TestBed.createComponent(TestHost);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const nav = root.querySelector('nav[aria-label="pagination"]') as HTMLElement;
  return {
    fixture,
    nav,
    nums: () =>
      Array.from(
        nav.querySelectorAll('button[aria-label^="Go to page"]'),
      ) as HTMLButtonElement[],
    prev: () =>
      nav.querySelector(
        'button[aria-label="Go to previous page"]',
      ) as HTMLButtonElement,
    next: () =>
      nav.querySelector(
        'button[aria-label="Go to next page"]',
      ) as HTMLButtonElement,
  };
}

describe('HlmPagination', () => {
  it('marks the nav as a "pagination" landmark', () => {
    const { nav } = setup();
    expect(nav).not.toBeNull();
    expect(nav.getAttribute('aria-label')).toBe('pagination');
    expect(nav.getAttribute('role')).toBe('navigation');
  });

  it('derives pageCount = ceil(total / pageSize) and floors at 1', () => {
    const { fixture, nums } = setup();
    // total=95 / pageSize=10 → 10 pages. With siblingCount=1, page=1 surfaces
    // [1..5, ellipsis, 10] (six numbered buttons).
    expect(nums().length).toBe(6);
    // Empty list → still 1 page.
    fixture.componentInstance.total.set(0);
    fixture.detectChanges();
    expect(nums().length).toBe(1);
  });

  it('marks the active page button with aria-current="page"', () => {
    const { fixture, nums } = setup();
    expect(nums()[0].getAttribute('aria-current')).toBe('page');
    fixture.componentInstance.page.set(2);
    fixture.detectChanges();
    const second = nums().find((b) => b.textContent?.trim() === '2');
    expect(second?.getAttribute('aria-current')).toBe('page');
  });

  it('paints the active page with a visually distinct (outline) variant', () => {
    const { nums } = setup();
    const active = nums().find(
      (b) => b.getAttribute('data-current') === 'page',
    );
    const inactive = nums().find(
      (b) =>
        b.getAttribute('data-current') === null &&
        b.textContent?.trim() === '2',
    );
    expect(active).toBeTruthy();
    // The active page rides HlmButton `outline` (border + transparent fill,
    // lw-adopt C2); the inactive pages ride `ghost` (no border/fill).
    // Asserting the affordance is visible — not just announced via
    // aria-current — locks WCAG 2.4.8.
    expect(active?.classList.contains('bg-transparent')).toBe(true);
    expect(active?.classList.contains('border-line')).toBe(true);
    expect(inactive?.classList.contains('bg-transparent')).toBe(false);
  });

  it('clamps a non-finite total to pageCount=1 (no literal "NaN" button)', () => {
    const { fixture, nums } = setup();
    fixture.componentInstance.total.set(Number.NaN);
    fixture.detectChanges();
    expect(nums().length).toBe(1);
    expect(nums()[0].textContent?.trim()).toBe('1');
  });

  it('disables Previous at the first page and Next at the last page', () => {
    const { fixture, prev, next } = setup();
    expect(prev().disabled).toBe(true);
    expect(next().disabled).toBe(false);
    fixture.componentInstance.page.set(10);
    fixture.detectChanges();
    expect(prev().disabled).toBe(false);
    expect(next().disabled).toBe(true);
  });

  it('clicking Next advances page; Previous goes back; clamping holds at edges', () => {
    const { fixture, prev, next } = setup();
    next().click();
    fixture.detectChanges();
    expect(fixture.componentInstance.page()).toBe(2);
    prev().click();
    fixture.detectChanges();
    expect(fixture.componentInstance.page()).toBe(1);
    // Already at first; Previous is disabled and the model doesn't change.
    prev().click();
    fixture.detectChanges();
    expect(fixture.componentInstance.page()).toBe(1);
  });

  it('clicking a numbered button writes that page into the two-way model', () => {
    const { fixture, nums } = setup();
    const five = nums().find((b) => b.textContent?.trim() === '5');
    five?.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.page()).toBe(5);
  });

  it('labels the Previous/Next buttons with their visible default text', () => {
    const { prev, next } = setup();
    expect(prev().textContent?.trim()).toBe('Previous');
    expect(next().textContent?.trim()).toBe('Next');
  });

  it('carries the exported BASE classes on nav, list, and ellipsis', () => {
    const { nav } = setup();
    // PAGINATION_BASE on the nav.
    for (const cls of ['mx-auto', 'flex', 'w-full', 'justify-center']) {
      expect(nav.classList.contains(cls), `nav missing \`${cls}\``).toBe(true);
    }
    // PAGINATION_LIST_BASE on the list.
    const list = nav.querySelector('ul') as HTMLElement;
    for (const cls of ['flex', 'flex-row', 'items-center', 'gap-1']) {
      expect(list.classList.contains(cls), `list missing \`${cls}\``).toBe(
        true,
      );
    }
    // PAGINATION_ELLIPSIS_BASE on the ellipsis cell (default setup shows one).
    const glyph = nav.querySelector('span[aria-hidden="true"]') as HTMLElement;
    const ellipsis = glyph.closest('li') as HTMLElement;
    for (const cls of ['h-9', 'w-9', 'items-center', 'text-ink-3']) {
      expect(
        ellipsis.classList.contains(cls),
        `ellipsis missing \`${cls}\``,
      ).toBe(true);
    }
  });

  it('hides only the decorative glyph while the SR-only label announces', () => {
    const { nav } = setup();
    // The <li> is no longer hidden, so the label is exposed to AT...
    expect(nav.querySelector('li[aria-hidden="true"]')).toBeNull();
    // ...only the … glyph is aria-hidden.
    const glyph = nav.querySelector('span[aria-hidden="true"]') as HTMLElement;
    expect(glyph?.textContent).toBe('…');
    expect(nav.querySelector('.sr-only')?.textContent).toBe('More pages');
  });
});

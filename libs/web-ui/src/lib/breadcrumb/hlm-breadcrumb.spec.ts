import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  BREADCRUMB_ELLIPSIS_BASE,
  BREADCRUMB_ITEM_BASE,
  BREADCRUMB_LINK_BASE,
  BREADCRUMB_LIST_BASE,
  BREADCRUMB_PAGE_BASE,
  BREADCRUMB_SEPARATOR_BASE,
  HlmBreadcrumbImports,
} from './hlm-breadcrumb.directive';

// Mirrors the lib's other directive specs (Vitest globals + jsdom). A small
// host exercises every member of the breadcrumb anatomy. The interesting
// surface is the role/aria contract — the painted classes are linted by
// the lib-wide token-discipline spec.
@Component({
  standalone: true,
  imports: [HlmBreadcrumbImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav hlmBreadcrumb>
      <ol hlmBreadcrumbList>
        <li hlmBreadcrumbItem>
          <a hlmBreadcrumbLink href="/" [class]="linkCls">Home</a>
        </li>
        <li hlmBreadcrumbSeparator>/</li>
        <li hlmBreadcrumbItem>
          <span hlmBreadcrumbEllipsis>…</span>
        </li>
        <li hlmBreadcrumbSeparator>/</li>
        <li hlmBreadcrumbItem>
          <span hlmBreadcrumbPage>Details</span>
        </li>
      </ol>
    </nav>
  `,
})
class TestHost {
  linkCls = '';
}

function setup(linkCls = '') {
  const fixture = TestBed.createComponent(TestHost);
  fixture.componentInstance.linkCls = linkCls;
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    root,
    nav: root.querySelector('nav[hlmBreadcrumb]') as HTMLElement,
    list: root.querySelector('ol[hlmBreadcrumbList]') as HTMLElement,
    items: Array.from(
      root.querySelectorAll('li[hlmBreadcrumbItem]'),
    ) as HTMLElement[],
    separators: Array.from(
      root.querySelectorAll('li[hlmBreadcrumbSeparator]'),
    ) as HTMLElement[],
    link: root.querySelector('a[hlmBreadcrumbLink]') as HTMLElement,
    page: root.querySelector('span[hlmBreadcrumbPage]') as HTMLElement,
    ellipsis: root.querySelector('span[hlmBreadcrumbEllipsis]') as HTMLElement,
  };
}

describe('HlmBreadcrumb', () => {
  it('marks the nav as a "breadcrumb" landmark for assistive tech', () => {
    const { nav } = setup();
    expect(nav.getAttribute('aria-label')).toBe('breadcrumb');
  });

  it('renders the current page as plain text with aria-current="page"', () => {
    const { page } = setup();
    expect(page.getAttribute('aria-current')).toBe('page');
    // WAI-ARIA APG: the current crumb is not a link, so it carries neither a
    // link role nor aria-disabled.
    expect(page.getAttribute('role')).toBeNull();
    expect(page.getAttribute('aria-disabled')).toBeNull();
  });

  it('hides separators from the AT tree', () => {
    const { separators } = setup();
    for (const sep of separators) {
      expect(sep.getAttribute('aria-hidden')).toBe('true');
      expect(sep.getAttribute('role')).toBe('presentation');
    }
  });

  it('keeps the ellipsis presentational but announceable (not aria-hidden)', () => {
    const { ellipsis } = setup();
    // role=presentation drops the span's own semantics, but the host stays in
    // the AT tree so a projected sr-only label can announce.
    expect(ellipsis.getAttribute('role')).toBe('presentation');
    expect(ellipsis.getAttribute('aria-hidden')).toBeNull();
  });

  it('paints the BASE classes on each anatomy member', () => {
    const { list, items, link, page, separators, ellipsis } = setup();
    for (const cls of BREADCRUMB_LIST_BASE.split(/\s+/)) {
      expect(list.classList.contains(cls), `list missing \`${cls}\``).toBe(
        true,
      );
    }
    for (const cls of BREADCRUMB_ITEM_BASE.split(/\s+/)) {
      expect(items[0].classList.contains(cls)).toBe(true);
    }
    for (const cls of BREADCRUMB_LINK_BASE.split(/\s+/)) {
      expect(link.classList.contains(cls), `link missing \`${cls}\``).toBe(
        true,
      );
    }
    for (const cls of BREADCRUMB_PAGE_BASE.split(/\s+/)) {
      expect(page.classList.contains(cls)).toBe(true);
    }
    for (const cls of BREADCRUMB_SEPARATOR_BASE.split(/\s+/)) {
      expect(separators[0].classList.contains(cls)).toBe(true);
    }
    for (const cls of BREADCRUMB_ELLIPSIS_BASE.split(/\s+/)) {
      expect(ellipsis.classList.contains(cls)).toBe(true);
    }
  });

  it('merges a consumer class onto the root nav', () => {
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [HlmBreadcrumbImports],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `<nav hlmBreadcrumb class="custom-nav"></nav>`,
    })
    class NavHost {}
    const fixture = TestBed.createComponent(NavHost);
    fixture.detectChanges();
    const nav = fixture.nativeElement.querySelector('nav') as HTMLElement;
    expect(nav.classList.contains('custom-nav')).toBe(true);
  });

  it('merges a consumer class onto the link (cn last-wins)', () => {
    const { link } = setup('text-ochre mx-2');
    expect(link.classList.contains('text-ochre')).toBe(true);
    expect(link.classList.contains('mx-2')).toBe(true);
    // The base hover class still rides.
    expect(link.classList.contains('hover:text-ink')).toBe(true);
  });
});

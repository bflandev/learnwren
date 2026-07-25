import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HlmSidebarImports } from './index';

// A small host drives the two-way `open` model and renders an in-panel trigger.
@Component({
  standalone: true,
  imports: [HlmSidebarImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hlm-sidebar
      [(open)]="open"
      [side]="side"
      [width]="width()"
      [collapsible]="collapsible()"
      aria-label="Tokens"
    >
      <hlm-sidebar-header>
        <span>Tokens</span>
        <button hlmSidebarTrigger data-test="collapse" aria-label="Collapse">
          x
        </button>
      </hlm-sidebar-header>
      <hlm-sidebar-content>Body</hlm-sidebar-content>
      <hlm-sidebar-footer>Foot</hlm-sidebar-footer>
    </hlm-sidebar>
  `,
})
class TestHost {
  readonly open = signal(true);
  side: 'left' | 'right' = 'right';
  readonly width = signal<'sm' | 'md' | 'lg' | 'xl'>('md');
  readonly collapsible = signal<'offcanvas' | 'icon'>('offcanvas');
}

function setup(open = true, side: 'left' | 'right' = 'right') {
  const fixture = TestBed.createComponent(TestHost);
  fixture.componentInstance.open.set(open);
  fixture.componentInstance.side = side;
  fixture.detectChanges();
  const el = fixture.nativeElement.querySelector('hlm-sidebar') as HTMLElement;
  return { fixture, el };
}

describe('HlmSidebar', () => {
  it('is a complementary landmark with the open state + base surface', () => {
    const { el } = setup(true);
    expect(el.getAttribute('role')).toBe('complementary');
    expect(el.getAttribute('aria-label')).toBe('Tokens');
    expect(el.getAttribute('data-state')).toBe('open');
    expect(el.classList.contains('bg-bg-2')).toBe(true);
  });

  it('expands to w-72 with a left border on the right side', () => {
    const { el } = setup(true, 'right');
    expect(el.classList.contains('w-72')).toBe(true);
    expect(el.classList.contains('border-l')).toBe(true);
    expect(el.classList.contains('w-0')).toBe(false);
  });

  it('applies the open-state width variant (default md = w-72, xl = w-144)', () => {
    const { fixture, el } = setup(true, 'right');
    expect(el.classList.contains('w-72')).toBe(true);
    fixture.componentInstance.width.set('xl');
    fixture.detectChanges();
    expect(el.classList.contains('w-144')).toBe(true);
    expect(el.classList.contains('w-72')).toBe(false);
  });

  it('collapses to w-0, drops the border, and goes inert', () => {
    const { el } = setup(false, 'right');
    expect(el.getAttribute('data-state')).toBe('collapsed');
    expect(el.classList.contains('w-0')).toBe(true);
    expect(el.classList.contains('w-72')).toBe(false);
    expect(el.classList.contains('border-l')).toBe(false);
    expect(el.hasAttribute('inert')).toBe(true);
  });

  it('borders on the right edge when side=left', () => {
    const { el } = setup(true, 'left');
    expect(el.classList.contains('border-r')).toBe(true);
    expect(el.classList.contains('border-l')).toBe(false);
  });

  it('the in-panel trigger toggles the two-way open model', () => {
    const { fixture, el } = setup(true);
    const trigger = el.querySelector(
      'button[data-test="collapse"]',
    ) as HTMLButtonElement;
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    trigger.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.open()).toBe(false);
    expect(el.getAttribute('data-state')).toBe('collapsed');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('paints the header / content / footer part bases', () => {
    const { el } = setup(true);
    const header = el.querySelector('hlm-sidebar-header') as HTMLElement;
    const content = el.querySelector('hlm-sidebar-content') as HTMLElement;
    const footer = el.querySelector('hlm-sidebar-footer') as HTMLElement;
    expect(header.classList.contains('border-b')).toBe(true);
    expect(content.classList.contains('overflow-y-auto')).toBe(true);
    expect(footer.classList.contains('border-t')).toBe(true);
  });

  describe('collapsible="icon" (persistent rail)', () => {
    function railSetup(open: boolean) {
      const fixture = TestBed.createComponent(TestHost);
      fixture.componentInstance.collapsible.set('icon');
      fixture.componentInstance.open.set(open);
      fixture.detectChanges();
      const el = fixture.nativeElement.querySelector(
        'hlm-sidebar',
      ) as HTMLElement;
      return { fixture, el };
    }

    it('closes to a navigable rail (w-14, keeps border, NOT inert)', () => {
      const { el } = railSetup(false);
      expect(el.getAttribute('data-state')).toBe('rail');
      expect(el.classList.contains('w-14')).toBe(true);
      expect(el.classList.contains('w-0')).toBe(false);
      expect(el.classList.contains('border-l')).toBe(true);
      expect(el.hasAttribute('inert')).toBe(false);
    });

    it('reports data-state=open and full width when open in icon mode', () => {
      const { el } = railSetup(true);
      expect(el.getAttribute('data-state')).toBe('open');
      expect(el.classList.contains('w-72')).toBe(true);
      expect(el.classList.contains('w-14')).toBe(false);
    });

    it('centres + tightens the header and content parts in the rail', () => {
      const { el } = railSetup(false);
      const header = el.querySelector('hlm-sidebar-header') as HTMLElement;
      const content = el.querySelector('hlm-sidebar-content') as HTMLElement;
      expect(header.classList.contains('justify-center')).toBe(true);
      expect(header.classList.contains('justify-between')).toBe(false);
      expect(content.classList.contains('items-center')).toBe(true);
      expect(content.classList.contains('p-2')).toBe(true);
    });

    it('the in-panel trigger reopens the rail (stays interactive)', () => {
      const { fixture, el } = railSetup(false);
      const trigger = el.querySelector(
        'button[data-test="collapse"]',
      ) as HTMLButtonElement;
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      trigger.click();
      fixture.detectChanges();
      expect(fixture.componentInstance.open()).toBe(true);
      expect(el.getAttribute('data-state')).toBe('open');
    });
  });
});

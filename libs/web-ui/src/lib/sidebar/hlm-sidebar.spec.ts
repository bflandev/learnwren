import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { HlmSidebar } from './hlm-sidebar.component';
import {
  HlmSidebarContent,
  HlmSidebarFooter,
  HlmSidebarHeader,
} from './hlm-sidebar.parts';
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

  describe('defaults and identity (unbound host)', () => {
    @Component({
      standalone: true,
      imports: [HlmSidebarImports],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `
        <hlm-sidebar id="custom-id">A</hlm-sidebar>
        <hlm-sidebar>B</hlm-sidebar>
        <hlm-sidebar>C</hlm-sidebar>
      `,
    })
    class BareHost {}

    function bareSetup() {
      const fixture = TestBed.createComponent(BareHost);
      fixture.detectChanges();
      const els = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('hlm-sidebar'),
      ) as HTMLElement[];
      const dirs = fixture.debugElement
        .queryAll(By.directive(HlmSidebar))
        .map((de) => de.componentInstance as HlmSidebar);
      return { fixture, els, dirs };
    }

    it('prefers a consumer-provided id for aria-controls wiring', () => {
      const { els, dirs } = bareSetup();
      expect(dirs[0].resolvedId).toBe('custom-id');
      expect(els[0].id).toBe('custom-id');
    });

    it('mints unique, well-formed fallback ids when none is provided', () => {
      const { dirs } = bareSetup();
      expect(dirs[1].resolvedId).toMatch(/^hlm-sidebar-\d+$/);
      expect(dirs[2].resolvedId).toMatch(/^hlm-sidebar-\d+$/);
      expect(dirs[1].resolvedId).not.toBe(dirs[2].resolvedId);
    });

    it('defaults to open, right-docked, md width, offcanvas collapse', () => {
      const { els, dirs } = bareSetup();
      expect(els[1].getAttribute('data-state')).toBe('open');
      expect(els[1].classList.contains('w-72')).toBe(true);
      expect(els[1].classList.contains('border-l')).toBe(true);
      expect(dirs[1].side()).toBe('right');
      expect(dirs[1].width()).toBe('md');
      expect(dirs[1].collapsible()).toBe('offcanvas');
    });
  });

  it('adds no stray class tokens in the collapsed state', () => {
    const { el } = setup(false);
    expect(el.className).not.toContain('Stryker');
  });

  it('paints the exact trigger base classes on the in-panel trigger', () => {
    const { el } = setup(true);
    const trigger = el.querySelector(
      'button[data-test="collapse"]',
    ) as HTMLButtonElement;
    expect(trigger.className.split(/\s+/).sort()).toEqual(
      'inline-flex items-center justify-center rounded-md text-ink-3 transition-colors hover:text-ink focus-ring'
        .split(' ')
        .sort(),
    );
  });

  it('keeps the header/content open-state paint (no rail overrides leak)', () => {
    const { el } = setup(true);
    const header = el.querySelector('hlm-sidebar-header') as HTMLElement;
    const content = el.querySelector('hlm-sidebar-content') as HTMLElement;
    expect(header.classList.contains('justify-between')).toBe(true);
    expect(header.classList.contains('p-4')).toBe(true);
    expect(header.classList.contains('justify-center')).toBe(false);
    expect(header.className).not.toContain('Stryker');
    expect(content.classList.contains('p-4')).toBe(true);
    expect(content.classList.contains('items-center')).toBe(false);
    expect(content.className).not.toContain('Stryker');
  });

  it('renders the parts standalone (outside any sidebar) on their bases', () => {
    @Component({
      standalone: true,
      imports: [HlmSidebarHeader, HlmSidebarContent, HlmSidebarFooter],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `
        <hlm-sidebar-header>H</hlm-sidebar-header>
        <hlm-sidebar-content>C</hlm-sidebar-content>
        <hlm-sidebar-footer>F</hlm-sidebar-footer>
      `,
    })
    class PartsHost {}
    const fixture = TestBed.createComponent(PartsHost);
    expect(() => fixture.detectChanges()).not.toThrow();
    const root = fixture.nativeElement as HTMLElement;
    const header = root.querySelector('hlm-sidebar-header') as HTMLElement;
    const content = root.querySelector('hlm-sidebar-content') as HTMLElement;
    expect(header.classList.contains('border-b')).toBe(true);
    expect(header.classList.contains('justify-between')).toBe(true);
    expect(content.classList.contains('overflow-y-auto')).toBe(true);
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

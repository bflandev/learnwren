import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  BUTTON_GROUP_BASE,
  HlmButtonGroup,
  HlmButtonGroupImports,
} from './hlm-button-group.directive';

// Mirrors the lib's other directive specs (Vitest globals + jsdom). HlmButtonGroup
// is a CSS-only connected-container directive: no brain primitive, no selection
// state. These tests pin the host contract (role + data-orientation), that it
// paints the BASE + per-orientation collapse recipe, and that it merges a consumer
// class — the styling is the whole behaviour, so the class output IS the contract.
@Component({
  standalone: true,
  imports: [HlmButtonGroupImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div hlmButtonGroup [orientation]="orientation()" [class]="cls()">
      <button>One</button>
      <button>Two</button>
    </div>
    <hlm-button-group aria-label="Element form">
      <button>A</button>
    </hlm-button-group>
  `,
})
class TestHost {
  readonly orientation = signal<'horizontal' | 'vertical'>('horizontal');
  readonly cls = signal('');
}

function setup() {
  const fixture = TestBed.createComponent(TestHost);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const group = root.querySelector('div[hlmButtonGroup]') as HTMLElement;
  return { fixture, root, group };
}

describe('HlmButtonGroup', () => {
  it('sets role=group and reflects data-orientation (default horizontal)', () => {
    const { group } = setup();
    expect(group.getAttribute('role')).toBe('group');
    expect(group.getAttribute('data-orientation')).toBe('horizontal');
  });

  it('paints the BASE plus the horizontal collapse recipe by default', () => {
    const { group } = setup();
    for (const token of BUTTON_GROUP_BASE.split(' ')) {
      expect(group.classList.contains(token)).toBe(true);
    }
    // Non-first items drop their start border; non-last square their end corner.
    expect(group.className).toContain('[&>*:not(:first-child)]:border-s-0');
    expect(group.className).toContain('[&>*:not(:last-child)]:rounded-e-none');
  });

  it('swaps to the vertical recipe + data-orientation when orientation=vertical', () => {
    const { fixture, group } = setup();
    fixture.componentInstance.orientation.set('vertical');
    fixture.detectChanges();
    expect(group.getAttribute('data-orientation')).toBe('vertical');
    expect(group.className).toContain('flex-col');
    expect(group.className).toContain('[&>*:not(:first-child)]:border-t-0');
    // The horizontal-only border-collapse must not linger.
    expect(group.className).not.toContain('[&>*:not(:first-child)]:border-s-0');
  });

  it('supports the element selector form (hlm-button-group)', () => {
    const { root } = setup();
    const el = root.querySelector('hlm-button-group') as HTMLElement;
    expect(el.getAttribute('role')).toBe('group');
    expect(el.classList.contains('inline-flex')).toBe(true);
  });

  it('merges a consumer class onto the host (cn last-wins)', () => {
    const { fixture, group } = setup();
    fixture.componentInstance.cls.set('mt-4 gap-2');
    fixture.detectChanges();
    expect(group.classList.contains('mt-4')).toBe(true);
    expect(group.classList.contains('gap-2')).toBe(true);
  });

  it('is referenceable as a template variable via exportAs', () => {
    const { fixture } = setup();
    expect(
      fixture.debugElement.query(By.directive(HlmButtonGroup)),
    ).not.toBeNull();
  });
});

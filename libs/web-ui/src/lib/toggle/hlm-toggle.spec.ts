import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { BrnToggle } from '@spartan-ng/brain/toggle';
import { HlmToggle, HlmToggleImports } from './hlm-toggle.directive';

// Mirrors the lib's other directive specs (Vitest globals + jsdom). A small host
// drives the press state via the `[(hlmToggle)]` model the directive re-exposes
// from brain's BrnToggle. brain owns the click-to-toggle + data-state / aria-pressed
// wiring; these tests pin that the helm layer composes the brain primitive, paints
// the styled chip, and forwards the model both ways.
@Component({
  standalone: true,
  imports: [HlmToggleImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button [(hlmToggle)]="state" aria-label="Bold" [class]="cls()">B</button>
  `,
})
class TestHost {
  readonly state = signal<'on' | 'off'>('off');
  readonly cls = signal('');
}

function setup(state: 'on' | 'off' = 'off', cls = '') {
  const fixture = TestBed.createComponent(TestHost);
  fixture.componentInstance.state.set(state);
  fixture.componentInstance.cls.set(cls);
  // Two passes: brain sets up the host bindings on the first, then stamps
  // data-state / aria-pressed on the next cycle.
  fixture.detectChanges();
  fixture.detectChanges();
  // `[(hlmToggle)]` is a property binding (no DOM attribute), so resolve the
  // button through the directive rather than an attribute selector.
  const btn = fixture.debugElement.query(By.directive(HlmToggle))
    .nativeElement as HTMLButtonElement;
  return { fixture, btn };
}

describe('HlmToggle', () => {
  it('composes the brain BrnToggle primitive', () => {
    const { fixture } = setup();
    expect(fixture.debugElement.query(By.directive(BrnToggle))).not.toBeNull();
  });

  it('paints the BASE chip classes', () => {
    const { btn } = setup();
    expect(btn.classList.contains('rounded-md')).toBe(true);
    expect(btn.classList.contains('bg-bg-3')).toBe(true);
    expect(btn.classList.contains('data-[state=on]:bg-ochre')).toBe(true);
  });

  it('reflects the bound state via data-state / aria-pressed', () => {
    const { btn } = setup('on');
    expect(btn.getAttribute('data-state')).toBe('on');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('toggles on click and writes the new state back to the model', () => {
    const { fixture, btn } = setup('off');
    // brain wires (click) → toggle(); two passes flush the model write + re-stamp.
    btn.click();
    fixture.detectChanges();
    fixture.detectChanges();
    expect(btn.getAttribute('data-state')).toBe('on');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(fixture.componentInstance.state()).toBe('on');
  });

  it('forwards aria-label to the button for screen readers', () => {
    const { btn } = setup();
    expect(btn.getAttribute('aria-label')).toBe('Bold');
  });

  it('merges a consumer class onto the host (cn last-wins)', () => {
    const { btn } = setup('off', 'mx-2 bg-secondary');
    expect(btn.classList.contains('mx-2')).toBe(true);
    expect(btn.classList.contains('bg-secondary')).toBe(true);
  });

  it('is referenceable as a template variable via exportAs', () => {
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [HlmToggleImports],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `<button [hlmToggle]="'off'" #t="hlmToggle">B</button>`,
    })
    class ExportHost {}
    const fixture = TestBed.createComponent(ExportHost);
    expect(() => fixture.detectChanges()).not.toThrow();
    expect(fixture.debugElement.query(By.directive(HlmToggle))).not.toBeNull();
  });
});

import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HlmCheckbox } from './hlm-checkbox.directive';

// Mirrors the lib's other directive specs (Vitest globals + jsdom). The host
// binds the re-exposed `class` input to a real checkbox so the merged host
// classes can be asserted.
@Component({
  standalone: true,
  imports: [HlmCheckbox],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<input
    type="checkbox"
    hlmCheckbox
    [class]="cls"
    [disabled]="disabled"
  />`,
})
class TestHost {
  cls = '';
  disabled = false;
}

function setup(cls = '', disabled = false) {
  const fixture = TestBed.createComponent(TestHost);
  fixture.componentInstance.cls = cls;
  fixture.componentInstance.disabled = disabled;
  fixture.detectChanges();
  const host = fixture.nativeElement.querySelector('input') as HTMLInputElement;
  return { fixture, host };
}

describe('HlmCheckbox', () => {
  it('carries the helm BASE classes on the native checkbox', () => {
    const { host } = setup();
    expect(host.classList.contains('size-4')).toBe(true);
    expect(host.classList.contains('shrink-0')).toBe(true);
    expect(host.classList.contains('cursor-pointer')).toBe(true);
  });

  it('is appearance-none and restyled as a slightly-rounded accent-fill box', () => {
    const { host } = setup();
    expect(host.classList.contains('appearance-none')).toBe(true);
    // Softly rounded corners: rounded-xs (--lw-radius-xs, 2px = 0.2rem).
    expect(host.classList.contains('rounded-xs')).toBe(true);
    expect(host.classList.contains('rounded-none')).toBe(false);
    expect(host.classList.contains('rounded-md')).toBe(false);
    expect(host.classList.contains('border-input-border')).toBe(true);
    // Unchecked fill is the dark-inset checkbox role, not the plain surface.
    expect(host.classList.contains('bg-checkbox-bg')).toBe(true);
    expect(host.classList.contains('bg-bg-2')).toBe(false);
    expect(host.classList.contains('checked:bg-ochre')).toBe(true);
    expect(host.classList.contains('checked:border-ochre')).toBe(true);
    expect(host.classList.contains('indeterminate:bg-ochre')).toBe(true);
    // The old native accent-color tint is gone.
    expect(host.classList.contains('accent-ochre')).toBe(false);
  });

  it('carries the focus-ring + disabled dimming classes', () => {
    const { host } = setup();
    // PVED-10593 — promoted to the token-driven `focus-ring` @utility.
    expect(host.classList.contains('focus-ring')).toBe(true);
    expect(host.classList.contains('disabled:cursor-not-allowed')).toBe(true);
    expect(host.classList.contains('disabled:opacity-50')).toBe(true);
  });

  it('merges a consumer class token onto the host', () => {
    const { host } = setup('mr-2');
    expect(host.classList.contains('mr-2')).toBe(true);
    expect(host.classList.contains('size-4')).toBe(true);
  });

  it('lets a consumer override the BASE size (last-wins via cn)', () => {
    const { host } = setup('size-5');
    expect(host.classList.contains('size-5')).toBe(true);
    expect(host.classList.contains('size-4')).toBe(false);
  });

  it('reflects the native disabled attribute (presentational directive does not block it)', () => {
    const { host } = setup('', true);
    expect(host.disabled).toBe(true);
  });

  it('drives the native indeterminate property from the input', () => {
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [HlmCheckbox],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `<input type="checkbox" hlmCheckbox [indeterminate]="ind()" />`,
    })
    class IndHost {
      readonly ind = signal(true);
    }
    const fixture = TestBed.createComponent(IndHost);
    fixture.detectChanges();
    const host = fixture.nativeElement.querySelector(
      'input',
    ) as HTMLInputElement;
    expect(host.indeterminate).toBe(true);
    fixture.componentInstance.ind.set(false);
    fixture.detectChanges();
    expect(host.indeterminate).toBe(false);
  });
});

import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { HlmInput } from './hlm-input.directive';

// Mirrors the lib's other directive specs (Vitest globals + jsdom). A small
// host drives the `class` signal input the [hlmInput] directive re-exposes and
// binds it to a real <input> so the merged host classes can be asserted.
@Component({
  standalone: true,
  imports: [HlmInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<input
    hlmInput
    type="text"
    [class]="cls"
    [disabled]="disabled"
    [selectAllOnFocus]="selectAll"
  />`,
})
class TestHost {
  cls = '';
  disabled = false;
  selectAll = true;
}

function setup(cls = '', disabled = false) {
  const fixture = TestBed.createComponent(TestHost);
  fixture.componentInstance.cls = cls;
  fixture.componentInstance.disabled = disabled;
  fixture.detectChanges();
  const host = fixture.nativeElement.querySelector('input') as HTMLInputElement;
  return { fixture, host };
}

describe('HlmInput', () => {
  it('carries the helm BASE classes on the host input (flex, w-full, rounded-control)', () => {
    const { host } = setup();
    expect(host.classList.contains('flex')).toBe(true);
    expect(host.classList.contains('w-full')).toBe(true);
    expect(host.classList.contains('rounded-control')).toBe(true);
  });

  it('carries the DS field-role surface classes (bg-input, border-input-border)', () => {
    const { host } = setup();
    expect(host.classList.contains('bg-input')).toBe(true);
    expect(host.classList.contains('border-input-border')).toBe(true);
    expect(host.classList.contains('placeholder:text-input-placeholder')).toBe(
      true,
    );
  });

  it('carries the focus-ring + disabled dimming classes from the helm BASE', () => {
    const { host } = setup();
    // PVED-10593 — the legacy focus-visible:ring-2 + focus-visible:ring-ochre
    // chain was replaced by the token-driven `focus-ring` @utility (box-shadow
    // built on --lw-ochre + --lw-focus-ring-glow). One class instead of four.
    expect(host.classList.contains('focus-ring')).toBe(true);
    expect(host.classList.contains('disabled:cursor-not-allowed')).toBe(true);
    expect(host.classList.contains('disabled:opacity-50')).toBe(true);
  });

  it('merges a consumer class token onto the host', () => {
    const { host } = setup('mt-2');
    expect(host.classList.contains('mt-2')).toBe(true);
    expect(host.classList.contains('flex')).toBe(true);
  });

  // cn()'s tailwind-merge resolves the bg- color group last-wins, so a consumer
  // bg- token collapses the BASE bg-input. Pins that the merge (not raw concat)
  // is in effect — the showcase relies on it for overrides.
  it('lets a consumer class override the BASE surface (last-wins via cn)', () => {
    const { host } = setup('bg-bg-2');
    expect(host.classList.contains('bg-bg-2')).toBe(true);
    expect(host.classList.contains('bg-input')).toBe(false);
  });

  it('reflects the native disabled attribute (presentational directive does not block it)', () => {
    const { host } = setup('', true);
    expect(host.disabled).toBe(true);
  });

  // PVED-10656: select-all-on-focus is on by default so the first keystroke
  // replaces the value (and a masked field's revealed skeleton is highlighted).
  // The select() is deferred a macrotask, driven here with fake timers.
  it('selects the whole field on focus by default', () => {
    const { host } = setup();
    host.value = 'breaking';
    const spy = vi.spyOn(host, 'select');
    vi.useFakeTimers();
    host.dispatchEvent(new FocusEvent('focus'));
    vi.runAllTimers();
    vi.useRealTimers();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does not select on focus when selectAllOnFocus is false', () => {
    const fixture = TestBed.createComponent(TestHost);
    fixture.componentInstance.selectAll = false;
    fixture.detectChanges();
    const host = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    const spy = vi.spyOn(host, 'select');
    vi.useFakeTimers();
    host.dispatchEvent(new FocusEvent('focus'));
    vi.runAllTimers();
    vi.useRealTimers();
    expect(spy).not.toHaveBeenCalled();
  });
});

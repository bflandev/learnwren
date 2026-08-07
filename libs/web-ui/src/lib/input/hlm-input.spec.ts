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
  //
  // Uses host.focus() (not a synthetic FocusEvent dispatch) so
  // document.activeElement is actually the host when the deferred callback's
  // guard checks it — see the directive's onFocus() comment: the callback
  // now only calls select() if this element is still the focused one, which
  // a bare `dispatchEvent(new FocusEvent('focus'))` does not satisfy in
  // jsdom (it fires the listener without moving activeElement).
  it('selects the whole field on focus by default', () => {
    const { host } = setup();
    host.value = 'breaking';
    const spy = vi.spyOn(host, 'select');
    vi.useFakeTimers();
    host.focus();
    vi.runAllTimers();
    vi.useRealTimers();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  // Regression test for the focus-steal bug (Fix round 2, task-7-report.md):
  // an unconditional deferred select() re-focuses its target even after the
  // user has tabbed away, silently redirecting subsequent keystrokes into
  // the field they just left. Simulates exactly that: focus this field
  // (queues the deferred select()), blur it (as Tab would) BEFORE the timer
  // fires, and assert select() is never called on the stale reference.
  it('does not select a field that has already lost focus by the time the deferred callback runs', () => {
    const { host } = setup();
    host.value = 'breaking';
    const spy = vi.spyOn(host, 'select');
    vi.useFakeTimers();
    host.focus();
    host.blur();
    vi.runAllTimers();
    vi.useRealTimers();
    expect(spy).not.toHaveBeenCalled();
  });

  // The directive can sit on any element via [hlmInput]; the typeof-select
  // guard keeps the deferred select() from exploding on non-input hosts.
  it('tolerates focus on a host element without a select() method', () => {
    // Arrange
    @Component({
      standalone: true,
      imports: [HlmInput],
      template: `<div hlmInput tabindex="0">not an input</div>`,
    })
    class NonInputHost {}
    const fixture = TestBed.createComponent(NonInputHost);
    fixture.detectChanges();
    const host = fixture.nativeElement.querySelector('div') as HTMLElement;
    // Act / Assert — without the guard the deferred callback would call
    // undefined() and the timer flush would throw.
    vi.useFakeTimers();
    host.focus();
    expect(() => vi.runAllTimers()).not.toThrow();
    vi.useRealTimers();
  });

  it('does not select on focus when selectAllOnFocus is false', () => {
    const fixture = TestBed.createComponent(TestHost);
    fixture.componentInstance.selectAll = false;
    fixture.detectChanges();
    const host = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    const spy = vi.spyOn(host, 'select');
    vi.useFakeTimers();
    host.focus();
    vi.runAllTimers();
    vi.useRealTimers();
    expect(spy).not.toHaveBeenCalled();
  });
});

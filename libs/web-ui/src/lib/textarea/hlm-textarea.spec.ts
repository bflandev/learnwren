import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HlmTextarea } from './hlm-textarea.directive';

// Mirrors [hlmInput]'s spec (Vitest globals + jsdom).
@Component({
  standalone: true,
  imports: [HlmTextarea],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<textarea
    hlmTextarea
    [class]="cls"
    [disabled]="disabled"
  ></textarea>`,
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
  const host = fixture.nativeElement.querySelector(
    'textarea',
  ) as HTMLTextAreaElement;
  return { fixture, host };
}

describe('HlmTextarea', () => {
  it('carries the helm BASE classes on the native textarea (multi-line min-height)', () => {
    const { host } = setup();
    expect(host.classList.contains('min-h-20')).toBe(true);
    expect(host.classList.contains('w-full')).toBe(true);
    expect(host.classList.contains('rounded-control')).toBe(true);
  });

  it('carries the DS field-role surface classes (bg-input, border-input-border)', () => {
    const { host } = setup();
    expect(host.classList.contains('bg-input')).toBe(true);
    expect(host.classList.contains('border-input-border')).toBe(true);
  });

  it('carries the focus-ring + disabled dimming classes', () => {
    const { host } = setup();
    // PVED-10593 — promoted to the token-driven `focus-ring` @utility.
    expect(host.classList.contains('focus-ring')).toBe(true);
    expect(host.classList.contains('disabled:opacity-50')).toBe(true);
  });

  it('merges a consumer class token onto the host', () => {
    const { host } = setup('mt-2');
    expect(host.classList.contains('mt-2')).toBe(true);
    expect(host.classList.contains('min-h-20')).toBe(true);
  });

  it('lets a consumer override the BASE surface (last-wins via cn)', () => {
    const { host } = setup('bg-bg-2');
    expect(host.classList.contains('bg-bg-2')).toBe(true);
    expect(host.classList.contains('bg-input')).toBe(false);
  });

  it('reflects the native disabled attribute', () => {
    const { host } = setup('', true);
    expect(host.disabled).toBe(true);
  });
});

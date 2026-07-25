import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HlmRadio } from './hlm-radio.directive';

// Mirrors the lib's other directive specs (Vitest globals + jsdom).
@Component({
  standalone: true,
  imports: [HlmRadio],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<input
    type="radio"
    hlmRadio
    name="g"
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

describe('HlmRadio', () => {
  it('carries the helm BASE classes on the native radio', () => {
    const { host } = setup();
    expect(host.classList.contains('size-4')).toBe(true);
    expect(host.classList.contains('shrink-0')).toBe(true);
    expect(host.classList.contains('cursor-pointer')).toBe(true);
  });

  it('tints the native control to the DS primary role via accent-color', () => {
    const { host } = setup();
    expect(host.classList.contains('accent-ochre')).toBe(true);
  });

  it('carries the focus-ring + disabled dimming classes', () => {
    const { host } = setup();
    // PVED-10593 — promoted to the token-driven `focus-ring` @utility.
    expect(host.classList.contains('focus-ring')).toBe(true);
    expect(host.classList.contains('disabled:opacity-50')).toBe(true);
  });

  it('merges a consumer class token onto the host', () => {
    const { host } = setup('ml-1');
    expect(host.classList.contains('ml-1')).toBe(true);
    expect(host.classList.contains('size-4')).toBe(true);
  });

  it('reflects the native disabled attribute', () => {
    const { host } = setup('', true);
    expect(host.disabled).toBe(true);
  });
});

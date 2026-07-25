import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HlmSeparator } from './hlm-separator.component';

// Mirrors hlm-avatar.spec.ts (Vitest globals + jsdom). A small host drives the
// signal inputs that the hosted BrnSeparator brain directive re-exposes.
@Component({
  standalone: true,
  imports: [HlmSeparator],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<hlm-separator
    [orientation]="orientation"
    [decorative]="decorative"
  ></hlm-separator>`,
})
class TestHost {
  orientation: 'horizontal' | 'vertical' = 'horizontal';
  decorative = false;
}

function setup(
  orientation: 'horizontal' | 'vertical' = 'horizontal',
  decorative = false,
) {
  const fixture = TestBed.createComponent(TestHost);
  fixture.componentInstance.orientation = orientation;
  fixture.componentInstance.decorative = decorative;
  fixture.detectChanges();
  const host = fixture.nativeElement.querySelector(
    'hlm-separator',
  ) as HTMLElement;
  return { fixture, host };
}

describe('HlmSeparator', () => {
  it("exposes brain's separator role when not decorative", () => {
    const { host } = setup('horizontal', false);
    expect(host.getAttribute('role')).toBe('separator');
  });

  it('omits aria-orientation for a horizontal separator (ARIA default)', () => {
    const { host } = setup('horizontal', false);
    expect(host.getAttribute('aria-orientation')).toBeNull();
  });

  it('sets aria-orientation="vertical" for a vertical separator', () => {
    const { host } = setup('vertical', false);
    expect(host.getAttribute('aria-orientation')).toBe('vertical');
  });

  it('reports role="none" (decorative) when decorative is true', () => {
    const { host } = setup('horizontal', true);
    expect(host.getAttribute('role')).toBe('none');
  });

  it('inherits brain\'s decorative=true default (role="none") with no input set', () => {
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [HlmSeparator],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `<hlm-separator></hlm-separator>`,
    })
    class BareHost {}
    const fixture = TestBed.createComponent(BareHost);
    fixture.detectChanges();
    const host = fixture.nativeElement.querySelector(
      'hlm-separator',
    ) as HTMLElement;
    expect(host.getAttribute('role')).toBe('none');
  });

  it('carries the cn() base classes on the host (shrink-0, bg-line)', () => {
    const { host } = setup('horizontal', false);
    expect(host.classList.contains('shrink-0')).toBe(true);
    expect(host.classList.contains('bg-line')).toBe(true);
  });

  it('uses horizontal base classes (h-px w-full) for a horizontal separator', () => {
    const { host } = setup('horizontal', false);
    expect(host.classList.contains('h-px')).toBe(true);
    expect(host.classList.contains('w-full')).toBe(true);
    expect(host.classList.contains('h-full')).toBe(false);
    expect(host.classList.contains('w-px')).toBe(false);
    // self-stretch is the vertical-only flex cross-axis fill.
    expect(host.classList.contains('self-stretch')).toBe(false);
  });

  it('switches to vertical base classes (h-full w-px self-stretch) for a vertical separator', () => {
    const { host } = setup('vertical', false);
    expect(host.classList.contains('h-full')).toBe(true);
    expect(host.classList.contains('w-px')).toBe(true);
    // self-stretch lets the vertical rule fill a flex row's cross-axis without
    // an explicit parent height.
    expect(host.classList.contains('self-stretch')).toBe(true);
    expect(host.classList.contains('h-px')).toBe(false);
    expect(host.classList.contains('w-full')).toBe(false);
  });

  it('merges a consumer class input with the base classes', () => {
    TestBed.resetTestingModule();
    @Component({
      standalone: true,
      imports: [HlmSeparator],
      changeDetection: ChangeDetectionStrategy.OnPush,
      template: `<hlm-separator class="my-4"></hlm-separator>`,
    })
    class ClassHost {}
    const fixture = TestBed.createComponent(ClassHost);
    fixture.detectChanges();
    const host = fixture.nativeElement.querySelector(
      'hlm-separator',
    ) as HTMLElement;
    expect(host.classList.contains('my-4')).toBe(true);
    expect(host.classList.contains('bg-line')).toBe(true);
  });
});

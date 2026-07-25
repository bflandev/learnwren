import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HlmSpinner } from './hlm-spinner.component';
import { SPINNER_SIZES, SPINNER_SIZE_MAP } from './hlm-spinner.variants';

// Mirrors the lib's other component specs (Vitest globals + jsdom). `size` is
// typed `unknown` so the guardrail test can feed a value the public SpinnerSize
// type would reject.
@Component({
  standalone: true,
  imports: [HlmSpinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<hlm-spinner [size]="$any(size)" [label]="label" [class]="cls" />`,
})
class TestHost {
  size: unknown = undefined;
  label = 'Loading';
  cls = '';
}

function setup(size: unknown = undefined, label = 'Loading', cls = '') {
  const fixture = TestBed.createComponent(TestHost);
  fixture.componentInstance.size = size;
  fixture.componentInstance.label = label;
  fixture.componentInstance.cls = cls;
  fixture.detectChanges();
  const host = fixture.nativeElement.querySelector(
    'hlm-spinner',
  ) as HTMLElement;
  return { fixture, host };
}

describe('HlmSpinner', () => {
  it('renders the default md size with the spin animation', () => {
    const { host } = setup();
    expect(host.classList.contains('animate-spin')).toBe(true);
    expect(host.classList.contains('rounded-full')).toBe(true);
    expect(host.classList.contains('size-6')).toBe(true);
    expect(host.classList.contains('border-2')).toBe(true);
  });

  it('exposes the busy state to assistive tech (role=status + aria-label)', () => {
    const { host } = setup();
    expect(host.getAttribute('role')).toBe('status');
    expect(host.getAttribute('aria-label')).toBe('Loading');
  });

  it('announces with the default "Loading" label when none is bound', () => {
    // Arrange / Act — a bare spinner so the component's own default applies.
    @Component({
      standalone: true,
      imports: [HlmSpinner],
      template: `<hlm-spinner />`,
    })
    class BareHost {}
    const fixture = TestBed.createComponent(BareHost);
    fixture.detectChanges();
    const host = fixture.nativeElement.querySelector(
      'hlm-spinner',
    ) as HTMLElement;
    // Assert
    expect(host.getAttribute('aria-label')).toBe('Loading');
    expect(host.getAttribute('role')).toBe('status');
  });

  it('reflects a custom label on aria-label', () => {
    const { host } = setup('md', 'Saving changes');
    expect(host.getAttribute('aria-label')).toBe('Saving changes');
  });

  it('is decorative (role null, aria-hidden=true) when label is empty', () => {
    const { host } = setup('md', '');
    expect(host.getAttribute('role')).toBeNull();
    expect(host.getAttribute('aria-label')).toBeNull();
    expect(host.getAttribute('aria-hidden')).toBe('true');
  });

  it('switches to the lg size when size="lg"', () => {
    const { host } = setup('lg');
    expect(host.classList.contains('size-10')).toBe(true);
    expect(host.classList.contains('border-4')).toBe(true);
    expect(host.classList.contains('size-6')).toBe(false);
  });

  it('falls back to the default size for an unknown/garbage size', () => {
    const { host } = setup('not-a-real-size');
    expect(host.classList.contains('size-6')).toBe(true);
  });

  it('merges a consumer class token onto the host', () => {
    const { host } = setup(undefined, 'Loading', 'text-ochre');
    expect(host.classList.contains('text-ochre')).toBe(true);
    expect(host.classList.contains('animate-spin')).toBe(true);
  });

  it('keeps SPINNER_SIZES exhaustive against the cva size map', () => {
    expect([...SPINNER_SIZES]).toEqual(['inline', 'sm', 'md', 'lg']);
    expect([...SPINNER_SIZES]).toEqual(Object.keys(SPINNER_SIZE_MAP));
  });
});

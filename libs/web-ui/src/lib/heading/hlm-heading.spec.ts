import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HlmHeading } from './hlm-heading.directive';
import { HEADING_VARIANTS, HEADING_VARIANT_MAP } from './hlm-heading.variants';

// Mirrors the lib's other directive specs (Vitest globals + jsdom). `variant` is
// typed `unknown` so the guardrail test can feed a value the public HeadingVariant
// type would reject.
@Component({
  standalone: true,
  imports: [HlmHeading],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h2 hlmHeading [variant]="$any(variant)" [class]="cls">Title</h2>`,
})
class TestHost {
  variant: unknown = undefined;
  cls = '';
}

function setup(variant: unknown = undefined, cls = '') {
  const fixture = TestBed.createComponent(TestHost);
  fixture.componentInstance.variant = variant;
  fixture.componentInstance.cls = cls;
  fixture.detectChanges();
  const host = fixture.nativeElement.querySelector('h2') as HTMLElement;
  return { fixture, host };
}

describe('HlmHeading', () => {
  it('applies the default section-title role on the native heading', () => {
    const { host } = setup();
    expect(host.classList.contains('text-section-title')).toBe(true);
    expect(host.classList.contains('text-ink')).toBe(true);
  });

  it('switches to the page-title role when variant="page-title"', () => {
    const { host } = setup('page-title');
    expect(host.classList.contains('text-page-title')).toBe(true);
    expect(host.classList.contains('text-section-title')).toBe(false);
  });

  it('falls back to the default role for an unknown/garbage variant', () => {
    const { host } = setup('not-a-real-variant');
    expect(host.classList.contains('text-section-title')).toBe(true);
  });

  it('falls back to the default role for variant={null}', () => {
    const { host } = setup(null);
    expect(host.classList.contains('text-section-title')).toBe(true);
  });

  it("falls back to the default role for variant='' (empty string)", () => {
    const { host } = setup('');
    expect(host.classList.contains('text-section-title')).toBe(true);
  });

  it('merges a consumer class token onto the host', () => {
    const { host } = setup(undefined, 'mb-2');
    expect(host.classList.contains('mb-2')).toBe(true);
    expect(host.classList.contains('text-section-title')).toBe(true);
  });

  it('keeps HEADING_VARIANTS exhaustive against the cva variant map', () => {
    expect([...HEADING_VARIANTS]).toEqual([
      'page-title',
      'section-title',
      'field-label',
    ]);
    expect([...HEADING_VARIANTS]).toEqual(Object.keys(HEADING_VARIANT_MAP));
  });
});

import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { LandingPricingComponent } from './landing-pricing.component';

function render(): HTMLElement {
  TestBed.configureTestingModule({
    imports: [LandingPricingComponent],
    providers: [provideRouter([])],
  });
  const fixture = TestBed.createComponent(LandingPricingComponent);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('LandingPricingComponent', () => {
  it('renders the heading and three price points', () => {
    const el = render();
    expect(el.querySelector('h2')?.textContent).toContain('One price. The whole shelf.');
    const text = el.textContent ?? '';
    for (const p of ['$9', '$84', 'Free']) expect(text).toContain(p);
  });

  it('points every pricing CTA at /register', () => {
    const el = render();
    const ctas = Array.from(el.querySelectorAll('a')).filter(
      (a) => a.textContent?.includes('Start for free'),
    );
    expect(ctas).toHaveLength(3);
    for (const a of ctas) expect(a.getAttribute('href')).toBe('/register');
  });

  it('marks the annual tier as featured', () => {
    const el = render();
    expect(el.querySelector('[data-featured="true"]')?.textContent).toContain('$84');
  });
});

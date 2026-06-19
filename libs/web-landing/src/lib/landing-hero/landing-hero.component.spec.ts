import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { LandingHeroComponent } from './landing-hero.component';

function render(): HTMLElement {
  TestBed.configureTestingModule({
    imports: [LandingHeroComponent],
    providers: [provideRouter([])],
  });
  const fixture = TestBed.createComponent(LandingHeroComponent);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('LandingHeroComponent', () => {
  it('renders the headline as the single h1', () => {
    const el = render();
    const h1s = el.querySelectorAll('h1');
    expect(h1s).toHaveLength(1);
    expect(h1s[0]?.textContent).toContain('Slow lessons, made for small communities.');
  });

  it('links the primary CTA to /register and the secondary CTA to /catalog', () => {
    const el = render();
    const primary = el.querySelector('a[href="/register"]');
    const secondary = el.querySelector('a[href="/catalog"]');
    expect(primary?.textContent).toContain('Start for free');
    expect(secondary?.textContent).toContain('Browse the shelf');
  });
});

import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { LandingFooterComponent } from './landing-footer.component';

describe('LandingFooterComponent', () => {
  it('renders the wordmark and tagline', () => {
    TestBed.configureTestingModule({ imports: [LandingFooterComponent] });
    const fixture = TestBed.createComponent(LandingFooterComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('lw-wordmark')).not.toBeNull();
    expect(el.textContent).toContain('Slow lessons for small communities.');
  });
});

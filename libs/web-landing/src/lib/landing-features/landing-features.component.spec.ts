import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { LandingFeaturesComponent } from './landing-features.component';

describe('LandingFeaturesComponent', () => {
  it('renders the heading and all four feature columns', () => {
    TestBed.configureTestingModule({ imports: [LandingFeaturesComponent] });
    const fixture = TestBed.createComponent(LandingFeaturesComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h2')?.textContent).toContain('makes itself small');
    const text = el.textContent ?? '';
    expect(text).toContain('DRM-protected video');
    expect(text).toContain('Built for households');
    expect(text).toContain('Downloadable materials');
    expect(text).toContain('Open source, self-hostable');
  });
});

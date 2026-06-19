import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { LandingStatsComponent } from './landing-stats.component';

describe('LandingStatsComponent', () => {
  it('renders every stat value and label', () => {
    TestBed.configureTestingModule({ imports: [LandingStatsComponent] });
    const fixture = TestBed.createComponent(LandingStatsComponent);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    for (const value of ['8', '1,402', '4.8', '12']) expect(text).toContain(value);
    expect(text).toContain('members this season');
    expect(text).toContain('instructors in residence');
  });
});

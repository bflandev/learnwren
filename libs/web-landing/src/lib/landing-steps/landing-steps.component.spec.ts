import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { LandingStepsComponent } from './landing-steps.component';

describe('LandingStepsComponent', () => {
  it('renders the heading and all three numbered steps', () => {
    TestBed.configureTestingModule({ imports: [LandingStepsComponent] });
    const fixture = TestBed.createComponent(LandingStepsComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h2')?.textContent).toContain('Three small steps');
    const text = el.textContent ?? '';
    for (const n of ['01', '02', '03']) expect(text).toContain(n);
    expect(text).toContain('Join the community');
    expect(text).toContain('Make the thing');
  });
});

import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { LandingTestimonialComponent } from './landing-testimonial.component';

describe('LandingTestimonialComponent', () => {
  it('renders the quote, attribution and an avatar', () => {
    TestBed.configureTestingModule({ imports: [LandingTestimonialComponent] });
    const fixture = TestBed.createComponent(LandingTestimonialComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const text = el.textContent ?? '';
    expect(text).toContain('I wanted a place where my course could just sit');
    expect(text).toContain('Etta Holloway');
    expect(el.querySelector('hlm-avatar')).not.toBeNull();
  });
});

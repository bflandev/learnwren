import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { LandingPageComponent } from './landing-page.component';

describe('LandingPageComponent', () => {
  function render(): HTMLElement {
    TestBed.configureTestingModule({
      imports: [LandingPageComponent],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(LandingPageComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('assembles all eight sections in order', () => {
    const el = render();
    for (const tag of [
      'lib-landing-hero',
      'lib-landing-stats',
      'lib-landing-shelf',
      'lib-landing-steps',
      'lib-landing-features',
      'lib-landing-testimonial',
      'lib-landing-pricing',
      'lib-landing-footer',
    ]) {
      expect(el.querySelector(tag)).not.toBeNull();
    }
  });

  it('sets the document title', () => {
    render();
    expect(TestBed.inject(Title).getTitle()).toContain('Learn Wren');
  });
});

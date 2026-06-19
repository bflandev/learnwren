import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { LandingShelfComponent } from './landing-shelf.component';

function render(): HTMLElement {
  TestBed.configureTestingModule({
    imports: [LandingShelfComponent],
    providers: [provideRouter([])],
  });
  const fixture = TestBed.createComponent(LandingShelfComponent);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('LandingShelfComponent', () => {
  it('renders four course cards with their titles and instructors', () => {
    const el = render();
    expect(el.querySelectorAll('lw-cover')).toHaveLength(4);
    const text = el.textContent ?? '';
    expect(text).toContain("Reading the Wren's Song");
    expect(text).toContain('Letterpress for Small Editions');
    expect(text).toContain('Etta Holloway');
  });

  it('renders the section heading and the browse-all link to /catalog', () => {
    const el = render();
    expect(el.querySelector('h2')?.textContent).toContain('A short shelf, considered.');
    const link = el.querySelector('a[href="/catalog"]');
    expect(link?.textContent).toContain('Browse all 8 courses');
  });

  it('applies each course cover tone to its lw-cover', () => {
    const el = render();
    const tones = Array.from(el.querySelectorAll('lw-cover')).map((c) =>
      c.getAttribute('data-tone'),
    );
    expect(tones).toEqual(['moss', 'clay', 'bark', 'paper']);
  });
});

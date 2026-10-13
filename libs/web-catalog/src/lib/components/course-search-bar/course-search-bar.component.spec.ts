import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CourseSearchBarComponent } from './course-search-bar.component';

describe('CourseSearchBarComponent', () => {
  let navigate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CourseSearchBarComponent],
      providers: [provideRouter([])],
    });
    navigate = vi.fn();
    vi.spyOn(TestBed.inject(Router), 'navigate').mockImplementation(navigate);
  });

  it('caps the query at the api limit (a longer one showed the error state, not results)', () => {
    const fixture = TestBed.createComponent(CourseSearchBarComponent);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('input')?.getAttribute('maxlength')).toBe('100');
  });

  it('initialises the query signal to an empty string', () => {
    const fixture = TestBed.createComponent(CourseSearchBarComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.query()).toBe('');
  });

  it('navigates to /catalog on submit when the query was never typed', () => {
    // Pins the empty initial value: a non-empty default would route to /search.
    const fixture = TestBed.createComponent(CourseSearchBarComponent);
    fixture.detectChanges();
    fixture.componentInstance.submit();
    expect(navigate).toHaveBeenCalledWith(['/catalog']);
  });

  it('navigates to /search with the query on submit', () => {
    const fixture = TestBed.createComponent(CourseSearchBarComponent);
    fixture.detectChanges();
    fixture.componentInstance.query.set('  rust  ');
    fixture.componentInstance.submit();
    expect(navigate).toHaveBeenCalledWith(['/search'], { queryParams: { q: 'rust' } });
  });

  it('navigates to /catalog when the query is blank', () => {
    const fixture = TestBed.createComponent(CourseSearchBarComponent);
    fixture.detectChanges();
    fixture.componentInstance.query.set('   ');
    fixture.componentInstance.submit();
    expect(navigate).toHaveBeenCalledWith(['/catalog']);
  });
});

describe('CourseSearchBarComponent — follows the URL', () => {
  @Component({ template: '' })
  class Blank {}

  async function at(url: string): Promise<CourseSearchBarComponent> {
    TestBed.configureTestingModule({
      imports: [CourseSearchBarComponent],
      providers: [provideRouter([{ path: 'search', component: Blank }, { path: 'catalog', component: Blank }])],
    });
    const cmp = TestBed.createComponent(CourseSearchBarComponent).componentInstance;
    await TestBed.inject(Router).navigateByUrl(url);
    return cmp;
  }

  it('shows the q of the search page on screen (Back/Forward, pasted link)', async () => {
    const cmp = await at('/search?q=angular');
    expect(cmp.query()).toBe('angular');
    await TestBed.inject(Router).navigateByUrl('/search?q=nest');
    expect(cmp.query()).toBe('nest');
  });

  it('keeps half-typed text across a navigation that does not change q', async () => {
    const cmp = await at('/catalog');
    cmp.query.set('half-typ');
    await TestBed.inject(Router).navigateByUrl('/catalog?page=2');
    expect(cmp.query()).toBe('half-typ');
  });

  it('clears when leaving the search page, and ignores q on other pages', async () => {
    const cmp = await at('/search?q=angular');
    await TestBed.inject(Router).navigateByUrl('/catalog?q=stray');
    expect(cmp.query()).toBe('');
  });
});


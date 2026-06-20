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

import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { CoursesListPageComponent } from './courses-list-page.component';

describe('CoursesListPageComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CoursesListPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('renders the empty state when there are no courses', async () => {
    const fixture = TestBed.createComponent(CoursesListPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/courses').flush([]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No courses yet');
  });

  it('renders course titles when the list is non-empty', async () => {
    const fixture = TestBed.createComponent(CoursesListPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/courses').flush([
      { id: 'cid-1', title: 'Course One', description: 'D', status: 'DRAFT' },
      { id: 'cid-2', title: 'Course Two', description: 'D', status: 'DRAFT' },
    ]);
    await fixture.whenStable();
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Course One');
    expect(text).toContain('Course Two');
  });

  it('renders a Create Course link', () => {
    const fixture = TestBed.createComponent(CoursesListPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/courses').flush([]);
    fixture.detectChanges();
    const anchor = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
      '[data-testid="create-course"]',
    );
    expect(anchor).not.toBeNull();
    expect(anchor!.getAttribute('routerLink')).toBe('/courses/new');
  });
});

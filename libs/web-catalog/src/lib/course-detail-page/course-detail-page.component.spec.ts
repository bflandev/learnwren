import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, type ParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { CourseDetailPageComponent } from './course-detail-page.component';

// The detail page reads the `:id` route parameter. A controllable fake
// ActivatedRoute is the simplest deterministic way to supply it — the
// component injects nothing else from the router (no RouterLink).
function setup(id: string | null): HttpTestingController {
  const paramMap = new BehaviorSubject<ParamMap>(
    convertToParamMap(id === null ? {} : { id }),
  );
  TestBed.configureTestingModule({
    imports: [CourseDetailPageComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: ActivatedRoute, useValue: { paramMap: paramMap.asObservable() } },
    ],
  });
  return TestBed.inject(HttpTestingController);
}

describe('CourseDetailPageComponent', () => {
  it('renders the course detail with the module outline', async () => {
    const http = setup('c-1');
    const fixture = TestBed.createComponent(CourseDetailPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/catalog/c-1').flush({
      id: 'c-1',
      title: 'Learn Rust',
      description: 'short',
      longDescription: 'the long description',
      instructorDisplayName: 'Ada Lovelace',
      difficulty: 'BEGINNER',
      lessonCount: 2,
      modules: [{ title: 'Module 1', lessons: [{ title: 'Intro' }, { title: 'Setup' }] }],
      publishedAt: '2026-01-01T00:00:00.000Z',
    });
    await fixture.whenStable();
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Learn Rust');
    expect(text).toContain('Ada Lovelace');
    expect(text).toContain('the long description');
    expect(text).toContain('Intro');
    expect(text).toContain('2 lessons');
  });

  it('renders the not-found state on a 404', async () => {
    const http = setup('c-missing');
    const fixture = TestBed.createComponent(CourseDetailPageComponent);
    fixture.detectChanges();
    http
      .expectOne('/api/catalog/c-missing')
      .flush({ error: { code: 'COURSE_NOT_FOUND' } }, { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Course not found');
    expect(el.querySelector('a[href="/catalog"]')).not.toBeNull();
  });

  it('renders the not-found state when there is no id param', async () => {
    setup(null);
    const fixture = TestBed.createComponent(CourseDetailPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Course not found');
  });

  it('renders a distinct error state on a non-404 failure', async () => {
    const http = setup('c-1');
    const fixture = TestBed.createComponent(CourseDetailPageComponent);
    fixture.detectChanges();
    http
      .expectOne('/api/catalog/c-1')
      .flush('boom', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Something went wrong');
    expect(text).not.toContain('Course not found');
  });
});

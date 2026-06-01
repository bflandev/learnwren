import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';

import type { CourseRosterView } from '@learnwren/shared-data-models';

import { CourseStudentsPageComponent } from './course-students-page.component';

const VIEW: CourseRosterView = {
  courseId: 'course-1' as never,
  totalLessons: 10,
  students: [
    {
      userId: 'u1' as never,
      displayName: 'Ada',
      email: 'ada@example.com',
      enrolledAt: '2026-05-20T00:00:00.000Z' as never,
      completedLessons: 5,
      totalLessons: 10,
      progressPercent: 50,
    },
    {
      userId: 'u2' as never,
      displayName: 'Bo',
      email: 'bo@example.com',
      enrolledAt: '2026-05-25T00:00:00.000Z' as never,
      completedLessons: 9,
      totalLessons: 10,
      progressPercent: 90,
    },
  ],
};

function setup() {
  TestBed.configureTestingModule({
    imports: [CourseStudentsPageComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { paramMap: of(new Map([['id', 'course-1']])) } },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(CourseStudentsPageComponent);
  fixture.detectChanges();
  return { http, fixture };
}

describe('CourseStudentsPageComponent', () => {
  let http: HttpTestingController;

  it('renders a row per enrolled student with name, email and progress', async () => {
    const s = setup();
    http = s.http;
    http.expectOne('/api/courses/course-1/students').flush(VIEW);
    await s.fixture.whenStable();
    s.fixture.detectChanges();
    const text = (s.fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Ada');
    expect(text).toContain('ada@example.com');
    expect(text).toContain('90%');
  });

  it('defaults to newest-first by enrollment date', async () => {
    const s = setup();
    http = s.http;
    http.expectOne('/api/courses/course-1/students').flush(VIEW);
    await s.fixture.whenStable();
    s.fixture.detectChanges();
    const names = Array.from(
      (s.fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="student-name"]'),
    ).map((el) => el.textContent?.trim());
    expect(names).toEqual(['Bo', 'Ada']); // Bo enrolled 05-25, Ada 05-20
  });

  it('sorts by progress ascending when the progress header is toggled', async () => {
    const s = setup();
    http = s.http;
    http.expectOne('/api/courses/course-1/students').flush(VIEW);
    await s.fixture.whenStable();
    s.fixture.detectChanges();
    const comp = s.fixture.componentInstance;
    comp.toggleSort('progress'); // first toggle on a new key => ascending
    s.fixture.detectChanges();
    const names = Array.from(
      (s.fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="student-name"]'),
    ).map((el) => el.textContent?.trim());
    expect(names).toEqual(['Ada', 'Bo']); // 50% then 90%
  });

  it('shows the empty state when no students are enrolled', async () => {
    const s = setup();
    http = s.http;
    http.expectOne('/api/courses/course-1/students').flush({
      courseId: 'course-1',
      totalLessons: 10,
      students: [],
    } as CourseRosterView);
    await s.fixture.whenStable();
    s.fixture.detectChanges();
    expect((s.fixture.nativeElement as HTMLElement).textContent).toContain(
      'No students enrolled yet',
    );
  });

  it('shows an error state when the load fails', async () => {
    const s = setup();
    http = s.http;
    http
      .expectOne('/api/courses/course-1/students')
      .flush('boom', { status: 500, statusText: 'Server Error' });
    await s.fixture.whenStable();
    s.fixture.detectChanges();
    expect((s.fixture.nativeElement as HTMLElement).textContent?.toLowerCase()).toContain(
      'could not load',
    );
  });

  it('exposes an Export CSV control', async () => {
    const s = setup();
    http = s.http;
    http.expectOne('/api/courses/course-1/students').flush(VIEW);
    await s.fixture.whenStable();
    s.fixture.detectChanges();
    expect(
      (s.fixture.nativeElement as HTMLElement).querySelector('[data-testid="export-csv"]'),
    ).not.toBeNull();
  });
});

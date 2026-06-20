import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { Subject, of } from 'rxjs';
import { describe, expect, it } from 'vitest';

import type { CourseAnalyticsView } from '@learnwren/shared-data-models';

import { CourseAnalyticsPageComponent } from './course-analytics-page.component';

const VIEW: CourseAnalyticsView = {
  courseId: 'course-1' as never,
  enrolledTotal: 4,
  averageCompletionPercent: 55,
  newEnrollments: { last7Days: 1, last30Days: 2, last90Days: 3 },
  totalLessons: 2,
  lessons: [
    {
      lessonId: 'l1' as never,
      moduleId: 'm1' as never,
      title: 'Getting started',
      completionRatePercent: 75,
      watchedStudents: 4,
      averageWatchedSeconds: 100,
      durationSec: 200,
      averageWatchedPercent: 50,
    },
    {
      lessonId: 'l2' as never,
      moduleId: 'm1' as never,
      title: 'No video yet',
      completionRatePercent: 0,
      watchedStudents: 0,
      averageWatchedSeconds: 0,
      durationSec: null,
      averageWatchedPercent: null,
    },
  ],
  generatedAt: '2026-06-01T00:00:00.000Z' as never,
};

function setup() {
  TestBed.configureTestingModule({
    imports: [CourseAnalyticsPageComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { paramMap: of(new Map([['id', 'course-1']])) } },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(CourseAnalyticsPageComponent);
  fixture.detectChanges();
  return { http, fixture };
}

describe('CourseAnalyticsPageComponent', () => {
  it('renders the course summary figures', async () => {
    const s = setup();
    s.http.expectOne('/api/courses/course-1/analytics').flush(VIEW);
    await s.fixture.whenStable();
    s.fixture.detectChanges();
    const text = (s.fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('4'); // enrolled total
    expect(text).toContain('55%'); // average completion
    expect(text).toContain('1'); // last 7 days
  });

  it('renders a per-lesson row with completion and avg progress', async () => {
    const s = setup();
    s.http.expectOne('/api/courses/course-1/analytics').flush(VIEW);
    await s.fixture.whenStable();
    s.fixture.detectChanges();
    const text = (s.fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Getting started');
    expect(text).toContain('75%'); // completion rate
    expect(text).toContain('1:40'); // 100s avg watched, secondsToClock
    expect(text).toContain('3:20'); // 200s duration
  });

  it('shows an em-dash for a lesson with no duration', async () => {
    const s = setup();
    s.http.expectOne('/api/courses/course-1/analytics').flush(VIEW);
    await s.fixture.whenStable();
    s.fixture.detectChanges();
    const rows = (s.fixture.nativeElement as HTMLElement).querySelectorAll(
      '[data-testid="lesson-duration"]',
    );
    // Second lesson has null duration -> rendered as "—".
    expect(rows[1].textContent).toContain('—');
  });

  it('shows the no-lessons empty state', async () => {
    const s = setup();
    s.http.expectOne('/api/courses/course-1/analytics').flush({
      ...VIEW,
      totalLessons: 0,
      lessons: [],
    } as CourseAnalyticsView);
    await s.fixture.whenStable();
    s.fixture.detectChanges();
    expect((s.fixture.nativeElement as HTMLElement).textContent).toContain('No lessons yet');
  });

  it('shows an error state when the load fails', async () => {
    const s = setup();
    s.http
      .expectOne('/api/courses/course-1/analytics')
      .flush('boom', { status: 500, statusText: 'Server Error' });
    await s.fixture.whenStable();
    s.fixture.detectChanges();
    expect((s.fixture.nativeElement as HTMLElement).textContent?.toLowerCase()).toContain(
      'could not load',
    );
  });

  it('renders the loading state before the response arrives', () => {
    const s = setup();
    // Do NOT flush yet — the component is mid-request, state === 'loading'.
    expect((s.fixture.nativeElement as HTMLElement).textContent).toContain('Loading');
    // state must literally be 'loading' before the request resolves.
    expect(s.fixture.componentInstance.state()).toBe('loading');
    // Now satisfy the outstanding request so the test ends cleanly.
    s.http.expectOne('/api/courses/course-1/analytics').flush(VIEW);
  });

  it('cid() is empty (no throw) when the paramMap signal has not emitted yet', () => {
    // A never-emitting paramMap keeps toSignal() undefined; cid() must use the
    // optional-chain fallback rather than dereferencing undefined.
    TestBed.configureTestingModule({
      imports: [CourseAnalyticsPageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: new Subject() } },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(CourseAnalyticsPageComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.cid()).toBe('');
    http.expectOne('/api/courses//analytics').flush({
      courseId: '',
      enrolledTotal: 0,
      averageCompletionPercent: 0,
      newEnrollments: { last7Days: 0, last30Days: 0, last90Days: 0 },
      totalLessons: 0,
      lessons: [],
      generatedAt: '2026-06-01T00:00:00.000Z',
    } as never);
  });

  it('falls back to an empty course id when the route has no id param', () => {
    TestBed.configureTestingModule({
      imports: [CourseAnalyticsPageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: of(new Map()) } },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(CourseAnalyticsPageComponent);
    fixture.detectChanges();
    // cid() === '' so the request URL has an empty id segment.
    http.expectOne('/api/courses//analytics').flush({
      courseId: '',
      enrolledTotal: 0,
      averageCompletionPercent: 0,
      newEnrollments: { last7Days: 0, last30Days: 0, last90Days: 0 },
      totalLessons: 0,
      lessons: [],
      generatedAt: '2026-06-01T00:00:00.000Z',
    } as never);
  });
});

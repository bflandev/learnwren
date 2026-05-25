import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, type ParamMap } from '@angular/router';
import { signal } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import type { EnrollmentStatusView } from '@learnwren/shared-data-models';
import { AuthService } from '@learnwren/web-auth';
import { EnrollmentService } from '@learnwren/web-enrollment';

import { CourseDetailPageComponent } from './course-detail-page.component';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal course payload with modules + lessons for CTA tests. */
const COURSE_WITH_LESSONS = {
  id: 'c-1',
  title: 'Learn Rust',
  description: 'short',
  longDescription: 'the long description',
  instructorDisplayName: 'Ada Lovelace',
  difficulty: 'BEGINNER',
  lessonCount: 2,
  modules: [
    {
      title: 'Module 1',
      lessons: [
        { id: 'L_FIRST', title: 'Intro' },
        { id: 'L_SECOND', title: 'Setup' },
      ],
    },
  ],
  publishedAt: '2026-01-01T00:00:00.000Z',
};

/** Course payload with no lessons (empty modules). */
const COURSE_NO_LESSONS = {
  ...COURSE_WITH_LESSONS,
  lessonCount: 0,
  modules: [],
};

type SetupOptions = {
  id: string | null;
  /** Falsy → guest (currentUser returns null). */
  isAuthenticated?: boolean;
  /** What getEnrollmentStatus should resolve to. */
  enrollmentView?: EnrollmentStatusView;
};

/**
 * The detail page reads the `:id` route parameter. A controllable fake
 * ActivatedRoute is the simplest deterministic way to supply it.
 *
 * For CTA tests we also need to control AuthService.currentUser() and
 * EnrollmentService.getEnrollmentStatus(). We provide lightweight fakes for
 * both rather than hitting the real HTTP endpoints in isolation.
 */
function setup({ id, isAuthenticated = false, enrollmentView }: SetupOptions): HttpTestingController {
  const paramMap = new BehaviorSubject<ParamMap>(
    convertToParamMap(id === null ? {} : { id }),
  );

  const fakeCurrentUser = isAuthenticated ? ({ uid: 'u-1' } as unknown) : null;
  const authServiceFake = { currentUser: signal(fakeCurrentUser) };

  const enrollmentServiceFake = {
    getEnrollmentStatus: (): Promise<EnrollmentStatusView> =>
      enrollmentView
        ? Promise.resolve(enrollmentView)
        : Promise.reject(new Error('no enrollment view configured')),
  };

  TestBed.configureTestingModule({
    imports: [CourseDetailPageComponent],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: ActivatedRoute,
        useValue: {
          paramMap: paramMap.asObservable(),
          snapshot: { paramMap: convertToParamMap(id === null ? {} : { id }) },
        },
      },
      { provide: AuthService, useValue: authServiceFake },
      { provide: EnrollmentService, useValue: enrollmentServiceFake },
    ],
  });
  return TestBed.inject(HttpTestingController);
}

// ---------------------------------------------------------------------------
// Existing tests (preserved)
// ---------------------------------------------------------------------------

describe('CourseDetailPageComponent', () => {
  it('renders the course detail with the module outline', async () => {
    const http = setup({ id: 'c-1' });
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
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('lib-course-enrollment-panel'),
    ).not.toBeNull();
  });

  it('renders the not-found state on a 404', async () => {
    const http = setup({ id: 'c-missing' });
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
    setup({ id: null });
    const fixture = TestBed.createComponent(CourseDetailPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Course not found');
  });

  it('renders a distinct error state on a non-404 failure', async () => {
    const http = setup({ id: 'c-1' });
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

  // -------------------------------------------------------------------------
  // Start Learning CTA tests
  // -------------------------------------------------------------------------

  it('shows Start Learning with correct routerLink for an enrolled student', async () => {
    const enrollmentView: EnrollmentStatusView = {
      enrollment: {
        id: 'u-1__c-1' as never,
        userId: 'u-1' as never,
        courseId: 'c-1' as never,
        status: 'ACTIVE',
        progress: [],
        withdrawnAt: null,
        createdAt: '2026-01-01T00:00:00.000Z' as never,
        updatedAt: '2026-01-01T00:00:00.000Z' as never,
      },
      isOwner: false,
    };
    const http = setup({ id: 'c-1', isAuthenticated: true, enrollmentView });
    const fixture = TestBed.createComponent(CourseDetailPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/catalog/c-1').flush(COURSE_WITH_LESSONS);
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const btn = el.querySelector('[data-testid="start-learning"]');
    expect(btn).not.toBeNull();
    // routerLink renders as href on the anchor after the router processes it
    const href = btn?.getAttribute('href') ?? '';
    expect(href).toContain('learn');
    expect(href).toContain('c-1');
    expect(href).toContain('L_FIRST');
  });

  it('shows Start Learning for the course owner', async () => {
    const enrollmentView: EnrollmentStatusView = { enrollment: null, isOwner: true };
    const http = setup({ id: 'c-1', isAuthenticated: true, enrollmentView });
    const fixture = TestBed.createComponent(CourseDetailPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/catalog/c-1').flush(COURSE_WITH_LESSONS);
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="start-learning"]')).not.toBeNull();
  });

  it('hides Start Learning for a guest (unauthenticated) user', async () => {
    const http = setup({ id: 'c-1', isAuthenticated: false });
    const fixture = TestBed.createComponent(CourseDetailPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/catalog/c-1').flush(COURSE_WITH_LESSONS);
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="start-learning"]')).toBeNull();
  });

  it('hides Start Learning for an authenticated but unenrolled student', async () => {
    const enrollmentView: EnrollmentStatusView = { enrollment: null, isOwner: false };
    const http = setup({ id: 'c-1', isAuthenticated: true, enrollmentView });
    const fixture = TestBed.createComponent(CourseDetailPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/catalog/c-1').flush(COURSE_WITH_LESSONS);
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="start-learning"]')).toBeNull();
  });

  it('shows the "No lessons yet" disabled state for an enrolled student with zero lessons', async () => {
    const enrollmentView: EnrollmentStatusView = {
      enrollment: {
        id: 'u-1__c-1' as never,
        userId: 'u-1' as never,
        courseId: 'c-1' as never,
        status: 'ACTIVE',
        progress: [],
        withdrawnAt: null,
        createdAt: '2026-01-01T00:00:00.000Z' as never,
        updatedAt: '2026-01-01T00:00:00.000Z' as never,
      },
      isOwner: false,
    };
    const http = setup({ id: 'c-1', isAuthenticated: true, enrollmentView });
    const fixture = TestBed.createComponent(CourseDetailPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/catalog/c-1').flush(COURSE_NO_LESSONS);
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="start-learning"]')).toBeNull();
    expect(el.querySelector('[data-testid="no-lessons"]')).not.toBeNull();
  });

  it('resolves the href to the FIRST lesson id (not the second)', async () => {
    const enrollmentView: EnrollmentStatusView = { enrollment: null, isOwner: true };
    const http = setup({ id: 'c-1', isAuthenticated: true, enrollmentView });
    const fixture = TestBed.createComponent(CourseDetailPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/catalog/c-1').flush(COURSE_WITH_LESSONS);
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const btn = el.querySelector('[data-testid="start-learning"]');
    expect(btn).not.toBeNull();
    const href = btn?.getAttribute('href') ?? '';
    expect(href).toContain('L_FIRST');
    expect(href).not.toContain('L_SECOND');
  });
});

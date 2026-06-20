import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, type ParamMap } from '@angular/router';
import { signal } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

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
  instructorId: 'u-1',
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
type SetupHandles = {
  http: HttpTestingController;
  /** Push a new route param map to simulate SPA navigation between courses. */
  setRouteId: (nextId: string) => void;
};

function setup({ id, isAuthenticated = false, enrollmentView }: SetupOptions): SetupHandles {
  // Single source of truth for the route param map. The observable and the
  // snapshot both read from this subject, so tests can never get them out of
  // sync. `snapshot.paramMap` is exposed via a getter that defers to
  // `paramMap$.getValue()` — no mutation of object literals required.
  const paramMap$ = new BehaviorSubject<ParamMap>(
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

  const routeFake = {
    paramMap: paramMap$.asObservable(),
    snapshot: {
      get paramMap(): ParamMap {
        return paramMap$.getValue();
      },
    },
  };

  TestBed.configureTestingModule({
    imports: [CourseDetailPageComponent],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: ActivatedRoute, useValue: routeFake },
      { provide: AuthService, useValue: authServiceFake },
      { provide: EnrollmentService, useValue: enrollmentServiceFake },
    ],
  });
  return {
    http: TestBed.inject(HttpTestingController),
    setRouteId: (nextId: string) => paramMap$.next(convertToParamMap({ id: nextId })),
  };
}

// ---------------------------------------------------------------------------
// Existing tests (preserved)
// ---------------------------------------------------------------------------

describe('CourseDetailPageComponent', () => {
  it('renders the course detail with the module outline', async () => {
    const { http } = setup({ id: 'c-1' });
    const fixture = TestBed.createComponent(CourseDetailPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/catalog/c-1').flush({
      id: 'c-1',
      title: 'Learn Rust',
      description: 'short',
      longDescription: 'the long description',
      instructorId: 'u-1',
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
    const { http } = setup({ id: 'c-missing' });
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
    const { http } = setup({ id: 'c-1' });
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
  // Instructor card (UC-01-03 Slice B — biography surface)
  // -------------------------------------------------------------------------

  it('renders the instructor card with avatar and biography', async () => {
    const { http } = setup({ id: 'c-1' });
    const fixture = TestBed.createComponent(CourseDetailPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/catalog/c-1').flush({
      ...COURSE_WITH_LESSONS,
      instructorPhotoUrl: 'https://example.com/u-1.jpg',
      instructorBiography: 'Mathematician.',
    });
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const card = el.querySelector('[data-test="instructor-card"]');
    expect(card).not.toBeNull();
    expect(card!.querySelector('lw-avatar img')).not.toBeNull();
    expect(card!.textContent).toContain('Ada Lovelace');
    expect(card!.textContent).toContain('Mathematician.');
    expect(el.querySelector('[data-test="instructor-bio"]')).not.toBeNull();
  });

  it('hides the biography paragraph when instructorBiography is undefined', async () => {
    const { http } = setup({ id: 'c-1' });
    const fixture = TestBed.createComponent(CourseDetailPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/catalog/c-1').flush({
      ...COURSE_WITH_LESSONS,
      // no instructorBiography, no instructorPhotoUrl
    });
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-test="instructor-card"]')).not.toBeNull();
    expect(el.querySelector('[data-test="instructor-bio"]')).toBeNull();
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
    const { http } = setup({ id: 'c-1', isAuthenticated: true, enrollmentView });
    const fixture = TestBed.createComponent(CourseDetailPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/catalog/c-1').flush(COURSE_WITH_LESSONS);
    await fixture.whenStable();
    // Second tick: load() awaits the enrollment-status promise AFTER the
    // catalog response resolves, so a single whenStable settles only the
    // catalog HTTP. A second whenStable lets the enrollment promise flush.
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
    const { http } = setup({ id: 'c-1', isAuthenticated: true, enrollmentView });
    const fixture = TestBed.createComponent(CourseDetailPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/catalog/c-1').flush(COURSE_WITH_LESSONS);
    await fixture.whenStable();
    // Second tick: load() awaits the enrollment-status promise AFTER the
    // catalog response resolves, so a single whenStable settles only the
    // catalog HTTP. A second whenStable lets the enrollment promise flush.
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="start-learning"]')).not.toBeNull();
  });

  it('hides Start Learning for a guest (unauthenticated) user', async () => {
    const { http } = setup({ id: 'c-1', isAuthenticated: false });
    const fixture = TestBed.createComponent(CourseDetailPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/catalog/c-1').flush(COURSE_WITH_LESSONS);
    await fixture.whenStable();
    // Second tick: load() awaits the enrollment-status promise AFTER the
    // catalog response resolves, so a single whenStable settles only the
    // catalog HTTP. A second whenStable lets the enrollment promise flush.
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="start-learning"]')).toBeNull();
  });

  it('does NOT fetch enrollment status for a guest (unauthenticated) user', async () => {
    // Pins `if (this.auth.currentUser())` in load(). With the guard mutated to
    // always-true, a guest would still issue the enrollment-status request.
    const getStatusSpy = vi.fn(() => Promise.resolve({ enrollment: null, isOwner: false }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CourseDetailPageComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: new BehaviorSubject<ParamMap>(convertToParamMap({ id: 'c-1' })),
          },
        },
        { provide: AuthService, useValue: { currentUser: signal(null) } },
        { provide: EnrollmentService, useValue: { getEnrollmentStatus: getStatusSpy } },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(CourseDetailPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/catalog/c-1').flush(COURSE_WITH_LESSONS);
    await fixture.whenStable();
    await fixture.whenStable();
    expect(getStatusSpy).not.toHaveBeenCalled();
  });

  it('DOES fetch enrollment status for an authenticated user', async () => {
    // Drives the true side of the same guard so killing it requires BOTH cases.
    const getStatusSpy = vi.fn(() => Promise.resolve({ enrollment: null, isOwner: false }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CourseDetailPageComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: new BehaviorSubject<ParamMap>(convertToParamMap({ id: 'c-1' })),
          },
        },
        { provide: AuthService, useValue: { currentUser: signal({ uid: 'u-1' } as unknown) } },
        { provide: EnrollmentService, useValue: { getEnrollmentStatus: getStatusSpy } },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(CourseDetailPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/catalog/c-1').flush(COURSE_WITH_LESSONS);
    await fixture.whenStable();
    await fixture.whenStable();
    expect(getStatusSpy).toHaveBeenCalledWith('c-1');
  });

  it('hides Start Learning for an authenticated but unenrolled student', async () => {
    const enrollmentView: EnrollmentStatusView = { enrollment: null, isOwner: false };
    const { http } = setup({ id: 'c-1', isAuthenticated: true, enrollmentView });
    const fixture = TestBed.createComponent(CourseDetailPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/catalog/c-1').flush(COURSE_WITH_LESSONS);
    await fixture.whenStable();
    // Second tick: load() awaits the enrollment-status promise AFTER the
    // catalog response resolves, so a single whenStable settles only the
    // catalog HTTP. A second whenStable lets the enrollment promise flush.
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
    const { http } = setup({ id: 'c-1', isAuthenticated: true, enrollmentView });
    const fixture = TestBed.createComponent(CourseDetailPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/catalog/c-1').flush(COURSE_NO_LESSONS);
    await fixture.whenStable();
    // Second tick: load() awaits the enrollment-status promise AFTER the
    // catalog response resolves, so a single whenStable settles only the
    // catalog HTTP. A second whenStable lets the enrollment promise flush.
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="start-learning"]')).toBeNull();
    expect(el.querySelector('[data-testid="no-lessons"]')).not.toBeNull();
  });

  it('shows the "No lessons yet" disabled state for the course owner with zero lessons', async () => {
    const enrollmentView: EnrollmentStatusView = { enrollment: null, isOwner: true };
    const { http } = setup({ id: 'c-1', isAuthenticated: true, enrollmentView });
    const fixture = TestBed.createComponent(CourseDetailPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/catalog/c-1').flush(COURSE_NO_LESSONS);
    await fixture.whenStable();
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="start-learning"]')).toBeNull();
    expect(el.querySelector('[data-testid="no-lessons"]')).not.toBeNull();
  });

  it('hides "No lessons yet" for an unenrolled authenticated student with zero lessons', async () => {
    const enrollmentView: EnrollmentStatusView = { enrollment: null, isOwner: false };
    const { http } = setup({ id: 'c-1', isAuthenticated: true, enrollmentView });
    const fixture = TestBed.createComponent(CourseDetailPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/catalog/c-1').flush(COURSE_NO_LESSONS);
    await fixture.whenStable();
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="start-learning"]')).toBeNull();
    expect(el.querySelector('[data-testid="no-lessons"]')).toBeNull();
  });

  it('hides "No lessons yet" for a guest user with zero lessons', async () => {
    const { http } = setup({ id: 'c-1', isAuthenticated: false });
    const fixture = TestBed.createComponent(CourseDetailPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/catalog/c-1').flush(COURSE_NO_LESSONS);
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="start-learning"]')).toBeNull();
    expect(el.querySelector('[data-testid="no-lessons"]')).toBeNull();
  });

  it('resolves the href to the FIRST lesson id (not the second)', async () => {
    const enrollmentView: EnrollmentStatusView = { enrollment: null, isOwner: true };
    const { http } = setup({ id: 'c-1', isAuthenticated: true, enrollmentView });
    const fixture = TestBed.createComponent(CourseDetailPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/catalog/c-1').flush(COURSE_WITH_LESSONS);
    await fixture.whenStable();
    // Second tick: load() awaits the enrollment-status promise AFTER the
    // catalog response resolves, so a single whenStable settles only the
    // catalog HTTP. A second whenStable lets the enrollment promise flush.
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const btn = el.querySelector('[data-testid="start-learning"]');
    expect(btn).not.toBeNull();
    const href = btn?.getAttribute('href') ?? '';
    expect(href).toContain('L_FIRST');
    expect(href).not.toContain('L_SECOND');
  });

  // -------------------------------------------------------------------------
  // enrollmentStatus reset on route change
  // -------------------------------------------------------------------------

  it('resets enrollmentStatus to null when the course route changes (before new HTTP resolves)', async () => {
    // Start on course A — the enrolled student case so enrollmentStatus
    // resolves to a non-null value.
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
    const { http, setRouteId } = setup({ id: 'c-1', isAuthenticated: true, enrollmentView });
    const fixture = TestBed.createComponent(CourseDetailPageComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    http.expectOne('/api/catalog/c-1').flush(COURSE_WITH_LESSONS);
    await fixture.whenStable();
    // Second tick: load() awaits the enrollment-status promise AFTER the
    // catalog response resolves, so a single whenStable settles only the
    // catalog HTTP. A second whenStable lets the enrollment promise flush.
    await fixture.whenStable();
    fixture.detectChanges();

    // Sanity: enrollmentStatus is populated from course A.
    expect(component.enrollmentStatus()).not.toBeNull();

    // SPA navigate to course B. The route param change triggers load(), which
    // must reset enrollmentStatus synchronously BEFORE the new enrollment
    // status request resolves — otherwise the Start Learning CTA would
    // briefly reflect course A's state on course B's page.
    setRouteId('c-2');
    expect(component.enrollmentStatus()).toBeNull();

    // Drain pending HTTP so HttpTestingController.verify() in teardown is happy.
    http.expectOne('/api/catalog/c-2').flush({ ...COURSE_WITH_LESSONS, id: 'c-2' });
    await fixture.whenStable();
  });

  // -------------------------------------------------------------------------
  // Continue Learning CTA tests (Slice C)
  // -------------------------------------------------------------------------

  it('shows Continue Learning when enrollment.lastAccessedLessonId resolves to a live lesson', async () => {
    const enrollmentView: EnrollmentStatusView = {
      enrollment: {
        id: 'u-1__c-1' as never,
        userId: 'u-1' as never,
        courseId: 'c-1' as never,
        status: 'ACTIVE',
        progress: [],
        withdrawnAt: null,
        lastAccessedLessonId: 'L_SECOND' as never,
        lastAccessedAt: '2026-05-25T12:00:00.000Z' as never,
        createdAt: '2026-01-01T00:00:00.000Z' as never,
        updatedAt: '2026-01-01T00:00:00.000Z' as never,
      },
      isOwner: false,
    };
    const { http } = setup({ id: 'c-1', isAuthenticated: true, enrollmentView });
    const fixture = TestBed.createComponent(CourseDetailPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/catalog/c-1').flush(COURSE_WITH_LESSONS);
    await fixture.whenStable();
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const cta = el.querySelector('[data-testid="continue-learning"]') as HTMLAnchorElement | null;
    expect(cta).not.toBeNull();
    expect(cta!.textContent).toContain('Continue Learning');
    const href = cta!.getAttribute('href') ?? '';
    expect(href).toContain('learn');
    expect(href).toContain('c-1');
    expect(href).toContain('L_SECOND');
    expect(el.querySelector('[data-testid="start-learning"]')).toBeNull();
  });

  it('shows Start Learning when lastAccessedLessonId is null', async () => {
    const enrollmentView: EnrollmentStatusView = {
      enrollment: {
        id: 'u-1__c-1' as never,
        userId: 'u-1' as never,
        courseId: 'c-1' as never,
        status: 'ACTIVE',
        progress: [],
        withdrawnAt: null,
        lastAccessedLessonId: null,
        lastAccessedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z' as never,
        updatedAt: '2026-01-01T00:00:00.000Z' as never,
      },
      isOwner: false,
    };
    const { http } = setup({ id: 'c-1', isAuthenticated: true, enrollmentView });
    const fixture = TestBed.createComponent(CourseDetailPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/catalog/c-1').flush(COURSE_WITH_LESSONS);
    await fixture.whenStable();
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const cta = el.querySelector('[data-testid="start-learning"]') as HTMLAnchorElement | null;
    expect(cta).not.toBeNull();
    expect(cta!.textContent).toContain('Start Learning');
    const href = cta!.getAttribute('href') ?? '';
    expect(href).toContain('L_FIRST');
    expect(el.querySelector('[data-testid="continue-learning"]')).toBeNull();
  });

  it('falls back to Start Learning + first lesson when lastAccessedLessonId no longer resolves', async () => {
    const enrollmentView: EnrollmentStatusView = {
      enrollment: {
        id: 'u-1__c-1' as never,
        userId: 'u-1' as never,
        courseId: 'c-1' as never,
        status: 'ACTIVE',
        progress: [],
        withdrawnAt: null,
        lastAccessedLessonId: 'deleted-lesson-id' as never,
        lastAccessedAt: '2026-05-25T12:00:00.000Z' as never,
        createdAt: '2026-01-01T00:00:00.000Z' as never,
        updatedAt: '2026-01-01T00:00:00.000Z' as never,
      },
      isOwner: false,
    };
    const { http } = setup({ id: 'c-1', isAuthenticated: true, enrollmentView });
    const fixture = TestBed.createComponent(CourseDetailPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/catalog/c-1').flush(COURSE_WITH_LESSONS);
    await fixture.whenStable();
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const cta = el.querySelector('[data-testid="start-learning"]') as HTMLAnchorElement | null;
    expect(cta).not.toBeNull();
    expect(cta!.textContent).toContain('Start Learning');
    const href = cta!.getAttribute('href') ?? '';
    expect(href).toContain('L_FIRST');
    expect(el.querySelector('[data-testid="continue-learning"]')).toBeNull();
  });

  it('owner sees Start Learning regardless of lastAccessedLessonId (owners have no enrolment)', async () => {
    const enrollmentView: EnrollmentStatusView = { enrollment: null, isOwner: true };
    const { http } = setup({ id: 'c-1', isAuthenticated: true, enrollmentView });
    const fixture = TestBed.createComponent(CourseDetailPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/catalog/c-1').flush(COURSE_WITH_LESSONS);
    await fixture.whenStable();
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const cta = el.querySelector('[data-testid="start-learning"]') as HTMLAnchorElement | null;
    expect(cta).not.toBeNull();
    expect(cta!.textContent).toContain('Start Learning');
    expect(el.querySelector('[data-testid="continue-learning"]')).toBeNull();
  });

  it('refetches enrollment status on SPA navigation between two enrolled courses', async () => {
    // Both c-1 and c-2 are ACTIVE-enrolled for this user; the fake
    // EnrollmentService returns the same view regardless of which course is
    // requested. That's fine — the assertion under test is that the CTA is
    // visible on BOTH pages, which requires enrollmentStatus to be re-resolved
    // after the route change. Without the fix, enrollmentStatus stays null on
    // c-2 because resolveEnrollmentStatus is only called from ngOnInit.
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
    const { http, setRouteId } = setup({ id: 'c-1', isAuthenticated: true, enrollmentView });
    const fixture = TestBed.createComponent(CourseDetailPageComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    http.expectOne('/api/catalog/c-1').flush(COURSE_WITH_LESSONS);
    await fixture.whenStable();
    // Second tick: load() awaits the enrollment-status promise AFTER the
    // catalog response resolves, so a single whenStable settles only the
    // catalog HTTP. A second whenStable lets the enrollment promise flush.
    await fixture.whenStable();
    fixture.detectChanges();

    // CTA visible on c-1.
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="start-learning"]')).not.toBeNull();

    // SPA-navigate to c-2.
    setRouteId('c-2');
    // The reset is synchronous; this guards against a regression where the
    // status from c-1 leaks into c-2's first paint.
    expect(component.enrollmentStatus()).toBeNull();

    http.expectOne('/api/catalog/c-2').flush({ ...COURSE_WITH_LESSONS, id: 'c-2' });
    await fixture.whenStable();
    // Second tick so the c-2 enrollment-status promise settles before assert.
    await fixture.whenStable();
    fixture.detectChanges();

    // CTA visible on c-2 too — only possible if enrollmentStatus was re-resolved
    // after the route change.
    expect(component.enrollmentStatus()).not.toBeNull();
    expect(el.querySelector('[data-testid="start-learning"]')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Computed-level unit tests
//
// These create the component against a route whose paramMap NEVER emits, so
// load() never runs and the public signals can be driven directly. This pins
// the pure computeds (coverTone, firstLessonHref, resumeTarget, resumeHref,
// resumeLabel, showNoLessons) and the onEnrollmentStatusChanged refetch hook,
// independent of the HTTP/route choreography exercised above.
// ---------------------------------------------------------------------------

type Course = (typeof COURSE_WITH_LESSONS) & { id: string };

function makeComponent(opts: {
  enrollmentView?: EnrollmentStatusView;
  getStatusSpy?: ReturnType<typeof vi.fn>;
} = {}): CourseDetailPageComponent {
  const getEnrollmentStatus =
    opts.getStatusSpy ??
    vi.fn(() =>
      opts.enrollmentView
        ? Promise.resolve(opts.enrollmentView)
        : Promise.reject(new Error('none')),
    );
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [CourseDetailPageComponent],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      // paramMap never emits -> load() is never invoked.
      { provide: ActivatedRoute, useValue: { paramMap: new Subject<ParamMap>() } },
      { provide: AuthService, useValue: { currentUser: signal(null) } },
      { provide: EnrollmentService, useValue: { getEnrollmentStatus } },
    ],
  });
  return TestBed.createComponent(CourseDetailPageComponent).componentInstance;
}

function activeEnrollment(over: Record<string, unknown> = {}): EnrollmentStatusView {
  return {
    enrollment: {
      id: 'u-1__c-1' as never,
      userId: 'u-1' as never,
      courseId: 'c-1' as never,
      status: 'ACTIVE',
      progress: [],
      withdrawnAt: null,
      createdAt: '2026-01-01T00:00:00.000Z' as never,
      updatedAt: '2026-01-01T00:00:00.000Z' as never,
      ...over,
    },
    isOwner: false,
  } as EnrollmentStatusView;
}

describe('CourseDetailPageComponent computeds', () => {
  it('initialises notFound and error to false', () => {
    const c = makeComponent();
    expect(c.notFound()).toBe(false);
    expect(c.error()).toBe(false);
  });

  it('coverTone falls back to "ink" when there is no course', () => {
    const c = makeComponent();
    expect(c.course()).toBeNull();
    expect(c.coverTone()).toBe('ink');
  });

  it('coverTone derives a non-ink tone from the course id when a course is present', () => {
    const c = makeComponent();
    c.course.set({ ...COURSE_WITH_LESSONS } as unknown as Course);
    // The computed body must actually run coverToneForId — a stubbed-out body
    // would leave coverTone returning undefined.
    const tone = c.coverTone();
    expect(tone).toBeDefined();
    expect(typeof tone).toBe('string');
  });

  it('firstLessonHref is null when there is no course', () => {
    const c = makeComponent();
    expect(c.firstLessonHref()).toBeNull();
  });

  it('firstLessonHref is null when the course has no modules', () => {
    const c = makeComponent();
    c.course.set({ ...COURSE_WITH_LESSONS, modules: [] } as unknown as Course);
    expect(c.firstLessonHref()).toBeNull();
  });

  it('firstLessonHref is null when the modules property is absent (optional-chaining guard)', () => {
    // `modules` undefined: `c?.modules?.[0]` must short-circuit. Without the
    // second `?.` the mutant `c?.modules[0]` throws on undefined.
    const c = makeComponent();
    c.course.set({ ...COURSE_WITH_LESSONS, modules: undefined } as unknown as Course);
    expect(c.firstLessonHref()).toBeNull();
  });

  it('firstLessonHref is null when the first module has no lessons', () => {
    const c = makeComponent();
    c.course.set({
      ...COURSE_WITH_LESSONS,
      modules: [{ title: 'M', lessons: [] }],
    } as unknown as Course);
    expect(c.firstLessonHref()).toBeNull();
  });

  it('firstLessonHref is null when the first module lacks a lessons property (optional-chaining guard)', () => {
    // `lessons` undefined: `firstModule?.lessons?.[0]` must short-circuit.
    const c = makeComponent();
    c.course.set({
      ...COURSE_WITH_LESSONS,
      modules: [{ title: 'M' }],
    } as unknown as Course);
    expect(c.firstLessonHref()).toBeNull();
  });

  it('firstLessonHref points at the first lesson of the first module', () => {
    const c = makeComponent();
    c.course.set({ ...COURSE_WITH_LESSONS } as unknown as Course);
    expect(c.firstLessonHref()).toEqual(['/learn', 'c-1', 'L_FIRST']);
  });

  it('resumeTarget is null when there is no enrollment (optional-chaining guard)', () => {
    const c = makeComponent();
    c.course.set({ ...COURSE_WITH_LESSONS } as unknown as Course);
    c.enrollmentStatus.set({ enrollment: null, isOwner: true });
    expect(c.resumeHref()).toEqual(['/learn', 'c-1', 'L_FIRST']);
    expect(c.resumeLabel()).toBe('Start Learning');
  });

  it('resumeTarget is null when the enrollment is not ACTIVE', () => {
    const c = makeComponent();
    c.course.set({ ...COURSE_WITH_LESSONS } as unknown as Course);
    c.enrollmentStatus.set(
      activeEnrollment({ status: 'WITHDRAWN', lastAccessedLessonId: 'L_SECOND' }),
    );
    expect(c.resumeLabel()).toBe('Start Learning');
    expect(c.resumeHref()).toEqual(['/learn', 'c-1', 'L_FIRST']);
  });

  it('resumeTarget is null when lastAccessedLessonId is absent', () => {
    const c = makeComponent();
    c.course.set({ ...COURSE_WITH_LESSONS } as unknown as Course);
    c.enrollmentStatus.set(activeEnrollment({ lastAccessedLessonId: null }));
    expect(c.resumeLabel()).toBe('Start Learning');
  });

  it('resumeTarget resolves to lastAccessedLessonId when it matches a live lesson', () => {
    const c = makeComponent();
    c.course.set({ ...COURSE_WITH_LESSONS } as unknown as Course);
    c.enrollmentStatus.set(activeEnrollment({ lastAccessedLessonId: 'L_SECOND' }));
    expect(c.resumeLabel()).toBe('Continue Learning');
    expect(c.resumeHref()).toEqual(['/learn', 'c-1', 'L_SECOND']);
  });

  it('resumeTarget is null when lastAccessedLessonId no longer matches any lesson (some over modules+lessons)', () => {
    const c = makeComponent();
    c.course.set({ ...COURSE_WITH_LESSONS } as unknown as Course);
    c.enrollmentStatus.set(activeEnrollment({ lastAccessedLessonId: 'GONE' }));
    // Every module/lesson is scanned; none match -> fall back to first lesson.
    expect(c.resumeLabel()).toBe('Start Learning');
    expect(c.resumeHref()).toEqual(['/learn', 'c-1', 'L_FIRST']);
  });

  it('resumeHref reads safely when enrollmentStatus is null (optional-chaining guard)', () => {
    // `this.enrollmentStatus()?.enrollment` with a null status: dropping the
    // `?.` (mutant `this.enrollmentStatus().enrollment`) throws here. A course
    // is present so the computed advances to the enrollment read.
    const c = makeComponent();
    c.course.set({ ...COURSE_WITH_LESSONS } as unknown as Course);
    c.enrollmentStatus.set(null);
    expect(c.resumeHref()).toEqual(['/learn', 'c-1', 'L_FIRST']);
    expect(c.resumeLabel()).toBe('Start Learning');
  });

  it('resumeTarget reads safely when the course has no modules property (optional-chaining guard)', () => {
    // ACTIVE enrollment + lastAccessedLessonId so the `found` line runs, but
    // `modules` is undefined: `c.modules?.some(...)` must short-circuit.
    const c = makeComponent();
    c.course.set({ ...COURSE_WITH_LESSONS, modules: undefined } as unknown as Course);
    c.enrollmentStatus.set(activeEnrollment({ lastAccessedLessonId: 'L_SECOND' }));
    expect(c.resumeHref()).toBeNull();
    expect(c.resumeLabel()).toBe('Start Learning');
  });

  it('resumeTarget reads safely when a module lacks a lessons property (optional-chaining guard)', () => {
    // `m.lessons?.some(...)` must short-circuit when a module has no lessons.
    const c = makeComponent();
    c.course.set({
      ...COURSE_WITH_LESSONS,
      modules: [{ title: 'M-empty' }],
    } as unknown as Course);
    c.enrollmentStatus.set(activeEnrollment({ lastAccessedLessonId: 'L_SECOND' }));
    expect(c.resumeHref()).toBeNull();
    expect(c.resumeLabel()).toBe('Start Learning');
  });

  it('resumeTarget matches a lesson in a NON-first module (some must scan all modules)', () => {
    const c = makeComponent();
    c.course.set({
      ...COURSE_WITH_LESSONS,
      modules: [
        { title: 'M1', lessons: [{ id: 'L_FIRST', title: 'a' }] },
        { title: 'M2', lessons: [{ id: 'L_DEEP', title: 'b' }] },
      ],
    } as unknown as Course);
    c.enrollmentStatus.set(activeEnrollment({ lastAccessedLessonId: 'L_DEEP' }));
    // If `.some` were replaced with `.every`, the first module (no L_DEEP) would
    // short-circuit to false and this would fall back to Start Learning.
    expect(c.resumeLabel()).toBe('Continue Learning');
    expect(c.resumeHref()).toEqual(['/learn', 'c-1', 'L_DEEP']);
  });

  it('showNoLessons is false when there IS a first lesson, regardless of ownership', () => {
    const c = makeComponent();
    c.course.set({ ...COURSE_WITH_LESSONS } as unknown as Course);
    c.enrollmentStatus.set({ enrollment: null, isOwner: true });
    expect(c.showNoLessons()).toBe(false);
  });

  it('showNoLessons is true for an owner of a lessonless course', () => {
    const c = makeComponent();
    c.course.set({ ...COURSE_WITH_LESSONS, modules: [] } as unknown as Course);
    c.enrollmentStatus.set({ enrollment: null, isOwner: true });
    expect(c.showNoLessons()).toBe(true);
  });

  it('showNoLessons is false for a guest viewing a lessonless course', () => {
    const c = makeComponent();
    c.course.set({ ...COURSE_WITH_LESSONS, modules: [] } as unknown as Course);
    c.enrollmentStatus.set(null);
    expect(c.showNoLessons()).toBe(false);
  });

  it('onEnrollmentStatusChanged refetches enrollment status when a course is loaded', async () => {
    const getStatusSpy = vi.fn(() =>
      Promise.resolve(activeEnrollment({ lastAccessedLessonId: 'L_SECOND' })),
    );
    const c = makeComponent({ getStatusSpy });
    c.course.set({ ...COURSE_WITH_LESSONS } as unknown as Course);

    await c['onEnrollmentStatusChanged']();

    expect(getStatusSpy).toHaveBeenCalledWith('c-1');
    expect(c.enrollmentStatus()).not.toBeNull();
    expect(c.resumeLabel()).toBe('Continue Learning');
  });

  it('onEnrollmentStatusChanged is a no-op when no course is loaded (id optional-chaining + guard)', async () => {
    const getStatusSpy = vi.fn(() => Promise.resolve(activeEnrollment()));
    const c = makeComponent({ getStatusSpy });
    expect(c.course()).toBeNull();

    await c['onEnrollmentStatusChanged']();

    expect(getStatusSpy).not.toHaveBeenCalled();
    expect(c.enrollmentStatus()).toBeNull();
  });
});

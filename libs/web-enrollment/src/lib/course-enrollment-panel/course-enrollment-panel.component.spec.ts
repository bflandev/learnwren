import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '@learnwren/web-auth';

import { CourseEnrollmentPanelComponent } from './course-enrollment-panel.component';

type User = { uid: string } | null | undefined;

function configure(opts: { user: User; enroll?: string | null }) {
  const navigate = vi.fn().mockResolvedValue(true);
  TestBed.configureTestingModule({
    imports: [CourseEnrollmentPanelComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: AuthService, useValue: { currentUser: () => opts.user } },
      { provide: Router, useValue: { navigate } },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { queryParamMap: convertToParamMap(opts.enroll ? { enroll: opts.enroll } : {}) },
        },
      },
    ],
  });
  return { navigate };
}

function create(courseId = 'c-1'): {
  fixture: ComponentFixture<CourseEnrollmentPanelComponent>;
  http: HttpTestingController;
} {
  const fixture = TestBed.createComponent(CourseEnrollmentPanelComponent);
  (fixture.componentRef as ComponentRef<CourseEnrollmentPanelComponent>).setInput(
    'courseId',
    courseId,
  );
  fixture.detectChanges();
  return { fixture, http: TestBed.inject(HttpTestingController) };
}

const text = (f: ComponentFixture<unknown>) =>
  (f.nativeElement as HTMLElement).textContent ?? '';

describe('CourseEnrollmentPanelComponent — guest', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows Enroll and makes no HTTP call when there is no user', async () => {
    configure({ user: null });
    const { fixture, http } = create();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text(fixture)).toContain('Enroll');
    http.expectNone(() => true);
  });

  it('navigates to /login with a redirect back to this course (enroll=1)', async () => {
    const { navigate } = configure({ user: null });
    const { fixture } = create('c-9');
    await fixture.whenStable();
    fixture.componentInstance.goToLogin();
    expect(navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { redirect: '/catalog/c-9?enroll=1' },
    });
  });
});

describe('CourseEnrollmentPanelComponent — authenticated', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the owner note when the caller owns the course', async () => {
    configure({ user: { uid: 'u1' } });
    const { fixture, http } = create();
    http.expectOne('/api/enrollments/c-1').flush({ enrollment: null, isOwner: true });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text(fixture)).toContain('You own this course');
  });

  it('shows the Enrolled state for an ACTIVE enrollment', async () => {
    configure({ user: { uid: 'u1' } });
    const { fixture, http } = create();
    http
      .expectOne('/api/enrollments/c-1')
      .flush({ enrollment: { status: 'ACTIVE' }, isOwner: false });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text(fixture)).toContain('Enrolled');
    expect(text(fixture)).toContain('Leave course');
  });

  it('shows Enroll for a WITHDRAWN enrollment', async () => {
    configure({ user: { uid: 'u1' } });
    const { fixture, http } = create();
    http
      .expectOne('/api/enrollments/c-1')
      .flush({ enrollment: { status: 'WITHDRAWN' }, isOwner: false });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text(fixture)).toContain('Enroll');
    expect(text(fixture)).not.toContain('Leave course');
  });

  it('enrolls on click and transitions to the Enrolled state', async () => {
    configure({ user: { uid: 'u1' } });
    const { fixture, http } = create();
    http.expectOne('/api/enrollments/c-1').flush({ enrollment: null, isOwner: false });
    await fixture.whenStable();
    fixture.detectChanges();

    void fixture.componentInstance.enroll();
    const post = http.expectOne('/api/enrollments');
    expect(post.request.method).toBe('POST');
    post.flush({ id: 'c-1__u1', status: 'ACTIVE' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text(fixture)).toContain('Leave course');
  });

  it('redirects to /catalog when enroll fails with COURSE_NOT_AVAILABLE', async () => {
    const { navigate } = configure({ user: { uid: 'u1' } });
    const { fixture, http } = create();
    http.expectOne('/api/enrollments/c-1').flush({ enrollment: null, isOwner: false });
    await fixture.whenStable();

    void fixture.componentInstance.enroll();
    http
      .expectOne('/api/enrollments')
      .flush(
        { error: { code: 'COURSE_NOT_AVAILABLE' } },
        { status: 409, statusText: 'Conflict' },
      );
    await fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith(['/catalog']);
  });

  it('shows the Completed badge when the enrollment is stamped', async () => {
    configure({ user: { uid: 'u1' } });
    const { fixture, http } = create();
    http.expectOne('/api/enrollments/c-1').flush({
      enrollment: { status: 'ACTIVE', completedAt: '2026-07-09T00:00:00.000Z' },
      isOwner: false,
    });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-testid="course-completed-badge"]'),
    ).toBeTruthy();
  });

  it('shows no badge for an unstamped active enrollment', async () => {
    configure({ user: { uid: 'u1' } });
    const { fixture, http } = create();
    http
      .expectOne('/api/enrollments/c-1')
      .flush({ enrollment: { status: 'ACTIVE', completedAt: null }, isOwner: false });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-testid="course-completed-badge"]'),
    ).toBeNull();
  });

  it('shows an inline error when enroll fails for another reason', async () => {
    configure({ user: { uid: 'u1' } });
    const { fixture, http } = create();
    http.expectOne('/api/enrollments/c-1').flush({ enrollment: null, isOwner: false });
    await fixture.whenStable();

    void fixture.componentInstance.enroll();
    http
      .expectOne('/api/enrollments')
      .flush('boom', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text(fixture)).toContain('Something went wrong');
  });

  it('leaves the course after confirmation and returns to the Enroll state', async () => {
    configure({ user: { uid: 'u1' } });
    const { fixture, http } = create();
    http
      .expectOne('/api/enrollments/c-1')
      .flush({ enrollment: { status: 'ACTIVE' }, isOwner: false });
    await fixture.whenStable();
    fixture.detectChanges();

    fixture.componentInstance.openConfirm();
    fixture.detectChanges();
    expect(text(fixture)).toContain('Leave this course?');

    void fixture.componentInstance.confirmLeave();
    http.expectOne('/api/enrollments/c-1').flush(null);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text(fixture)).toContain('Enroll');
    expect(text(fixture)).not.toContain('Leave this course?');
    expect(fixture.componentInstance.completed()).toBe(false);
  });

  it('shows a load error with a retry when the status request fails', async () => {
    configure({ user: { uid: 'u1' } });
    const { fixture, http } = create();
    http
      .expectOne('/api/enrollments/c-1')
      .flush('boom', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text(fixture)).toContain("Couldn't load");
    expect(text(fixture)).toContain('Retry');
  });

  it('auto-enrolls when enroll=1 is present and the caller is enrollable', async () => {
    const { navigate } = configure({ user: { uid: 'u1' }, enroll: '1' });
    const { fixture, http } = create();
    http.expectOne('/api/enrollments/c-1').flush({ enrollment: null, isOwner: false });
    await fixture.whenStable();

    const post = http.expectOne('/api/enrollments');
    expect(post.request.body).toEqual({ courseId: 'c-1' });
    post.flush({ id: 'c-1__u1', status: 'ACTIVE' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text(fixture)).toContain('Leave course');
    // enroll=1 is stripped from the URL after a successful auto-enroll.
    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        queryParams: { enroll: null },
        replaceUrl: true,
        queryParamsHandling: 'merge',
      }),
    );
  });

  it('does not auto-enroll an owner even when enroll=1 is present', async () => {
    configure({ user: { uid: 'u1' }, enroll: '1' });
    const { fixture, http } = create();
    http.expectOne('/api/enrollments/c-1').flush({ enrollment: null, isOwner: true });
    await fixture.whenStable();
    http.expectNone('/api/enrollments');
  });

  it('does not fire a duplicate auto-enroll POST when resolveStatus runs a second time', async () => {
    // Models a transient load error followed by Retry while `?enroll=1` is
    // still in the URL: the first resolveStatus fires auto-enroll, then the
    // retry sees ENROLLABLE + enroll=1 again. Without the autoEnrollFired
    // guard, the second pass would POST /api/enrollments a second time and
    // the backend would either reject as duplicate or double-create.
    configure({ user: { uid: 'u1' }, enroll: '1' });
    const { fixture, http } = create();
    http.expectOne('/api/enrollments/c-1').flush({ enrollment: null, isOwner: false });
    await fixture.whenStable();

    // First (and only) auto-enroll POST — leave it pending so retry() runs
    // while the auto-enroll is still in flight.
    const post = http.expectOne('/api/enrollments');

    // Force a second resolveStatus pass via retry(). It must NOT fire a
    // second POST even though `?enroll=1` is still present.
    fixture.componentInstance.retry();
    http.expectOne('/api/enrollments/c-1').flush({ enrollment: null, isOwner: false });
    await fixture.whenStable();
    http.expectNone('/api/enrollments');

    // Resolve the original POST so the test cleanup doesn't leak a pending req.
    post.flush({ id: 'c-1__u1', status: 'ACTIVE' });
    await fixture.whenStable();
  });

  it('starts in LOADING with busy=false before the status request resolves', async () => {
    configure({ user: { uid: 'u1' } });
    const { fixture, http } = create();
    // ngOnInit kicked off resolveStatus(), but the HTTP is still pending.
    expect(fixture.componentInstance.state()).toBe('LOADING');
    expect(fixture.componentInstance.busy()).toBe(false);
    http.expectOne('/api/enrollments/c-1').flush({ enrollment: null, isOwner: false });
    await fixture.whenStable();
  });

  it('sets busy during enroll and clears it once the POST settles', async () => {
    configure({ user: { uid: 'u1' } });
    const { fixture, http } = create();
    http.expectOne('/api/enrollments/c-1').flush({ enrollment: null, isOwner: false });
    await fixture.whenStable();

    const p = fixture.componentInstance.enroll();
    expect(fixture.componentInstance.busy()).toBe(true);
    http.expectOne('/api/enrollments').flush({ id: 'c-1__u1', status: 'ACTIVE' });
    await p;
    expect(fixture.componentInstance.busy()).toBe(false);
  });

  it('cancelConfirm closes the leave-confirmation dialog', async () => {
    configure({ user: { uid: 'u1' } });
    const { fixture, http } = create();
    http
      .expectOne('/api/enrollments/c-1')
      .flush({ enrollment: { status: 'ACTIVE' }, isOwner: false });
    await fixture.whenStable();

    fixture.componentInstance.openConfirm();
    expect(fixture.componentInstance.showConfirm()).toBe(true);
    fixture.componentInstance.cancelConfirm();
    expect(fixture.componentInstance.showConfirm()).toBe(false);
  });

  it('sets busy during confirmLeave and shows an error message when it fails', async () => {
    configure({ user: { uid: 'u1' } });
    const { fixture, http } = create();
    http
      .expectOne('/api/enrollments/c-1')
      .flush({ enrollment: { status: 'ACTIVE' }, isOwner: false });
    await fixture.whenStable();

    const p = fixture.componentInstance.confirmLeave();
    expect(fixture.componentInstance.busy()).toBe(true);
    http
      .expectOne('/api/enrollments/c-1')
      .flush('boom', { status: 500, statusText: 'Server Error' });
    await p;
    expect(fixture.componentInstance.actionError()).toBe(
      'Could not leave the course. Please try again.',
    );
    expect(fixture.componentInstance.busy()).toBe(false);
  });

  it('retry resets the state to LOADING before re-fetching', async () => {
    configure({ user: { uid: 'u1' } });
    const { fixture, http } = create();
    http
      .expectOne('/api/enrollments/c-1')
      .flush('boom', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    expect(fixture.componentInstance.state()).toBe('LOAD_ERROR');

    fixture.componentInstance.retry();
    expect(fixture.componentInstance.state()).toBe('LOADING');
    http.expectOne('/api/enrollments/c-1').flush({ enrollment: null, isOwner: false });
    await fixture.whenStable();
  });

  it('does NOT strip enroll=1 when the auto-enroll POST fails (state stays ENROLLABLE)', async () => {
    const { navigate } = configure({ user: { uid: 'u1' }, enroll: '1' });
    const { fixture, http } = create();
    http.expectOne('/api/enrollments/c-1').flush({ enrollment: null, isOwner: false });
    await fixture.whenStable();
    http
      .expectOne('/api/enrollments')
      .flush('boom', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    // clearEnrollParam() (navigate([], ...)) must only run when state === 'ENROLLED'.
    expect(navigate).not.toHaveBeenCalledWith([], expect.anything());
  });

  it('treats a null error body as a generic failure, not COURSE_NOT_AVAILABLE', async () => {
    // errorCode() must safely read through a null err.error (optional chaining).
    configure({ user: { uid: 'u1' } });
    const { fixture, http } = create();
    http.expectOne('/api/enrollments/c-1').flush({ enrollment: null, isOwner: false });
    await fixture.whenStable();

    void fixture.componentInstance.enroll();
    http.expectOne('/api/enrollments').flush(null, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    expect(fixture.componentInstance.actionError()).toBe('Something went wrong. Please try again.');
  });
});

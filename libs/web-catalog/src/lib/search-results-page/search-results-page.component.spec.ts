import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '@learnwren/web-auth';
import { EnrollmentService } from '@learnwren/web-enrollment';

import { SearchResultsPageComponent } from './search-results-page.component';

describe('SearchResultsPageComponent', () => {
  let http: HttpTestingController;
  let router: Router;
  let authMock: { currentUser: ReturnType<typeof vi.fn> };
  let enrollmentsMock: { listMyEnrollments: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    authMock = { currentUser: vi.fn().mockReturnValue(null) };
    enrollmentsMock = { listMyEnrollments: vi.fn() };

    TestBed.configureTestingModule({
      imports: [SearchResultsPageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'search', component: SearchResultsPageComponent },
          { path: 'catalog', component: SearchResultsPageComponent },
        ]),
        { provide: AuthService, useValue: authMock },
        { provide: EnrollmentService, useValue: enrollmentsMock },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  it('renders search results for the query', async () => {
    await router.navigate(['/search'], { queryParams: { q: 'rust' } });
    const fixture = TestBed.createComponent(SearchResultsPageComponent);
    fixture.detectChanges();
    const req = http.expectOne((r) => r.url === '/api/catalog/search');
    expect(req.request.params.get('q')).toBe('rust');
    req.flush({
      items: [
        {
          id: 'c-1',
          title: 'Rust Basics',
          description: 'd',
          instructorId: 'u-1',
          instructorDisplayName: 'Ada',
          publishedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Rust Basics');
  });

  it('renders the no-results state with a catalogue link', async () => {
    await router.navigate(['/search'], { queryParams: { q: 'zzzznope' } });
    const fixture = TestBed.createComponent(SearchResultsPageComponent);
    fixture.detectChanges();
    http
      .expectOne((r) => r.url === '/api/catalog/search')
      .flush({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('No courses found for your search');
    expect(el.querySelector('a[href="/catalog"]')).not.toBeNull();
  });

  it('redirects to /catalog when the query is blank', async () => {
    await router.navigate(['/search'], { queryParams: { q: '   ' } });
    const fixture = TestBed.createComponent(SearchResultsPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    http.expectNone((r) => r.url === '/api/catalog/search');
    expect(router.url).toContain('/catalog');
  });

  it('marks cards of completed courses when signed in (US-06-02 parity with the catalog)', async () => {
    authMock.currentUser.mockReturnValue({ uid: 'u1' } as never);
    enrollmentsMock.listMyEnrollments.mockResolvedValue({
      enrollments: [
        { courseId: 'c-1', courseTitle: 'Rust Basics', completedAt: '2026-07-09T00:00:00.000Z' },
      ],
    });
    await router.navigate(['/search'], { queryParams: { q: 'rust' } });
    const fixture = TestBed.createComponent(SearchResultsPageComponent);
    fixture.detectChanges();
    http.expectOne((r) => r.url === '/api/catalog/search').flush({
      items: [
        {
          id: 'c-1',
          title: 'Rust Basics',
          description: 'd',
          instructorId: 'u-1',
          instructorDisplayName: 'Ada',
          publishedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.completedCourseIds().has('c-1')).toBe(true);
    const pill = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="card-completed-pill"]',
    );
    expect(pill?.textContent).toContain('Completed');
  });

  it('does not call the enrollments API for guests', async () => {
    authMock.currentUser.mockReturnValue(null);
    await router.navigate(['/search'], { queryParams: { q: 'rust' } });
    const fixture = TestBed.createComponent(SearchResultsPageComponent);
    fixture.detectChanges();
    http
      .expectOne((r) => r.url === '/api/catalog/search')
      .flush({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
    await fixture.whenStable();

    expect(enrollmentsMock.listMyEnrollments).not.toHaveBeenCalled();
  });

  it('a failed enrollments load leaves the results rendered without badges', async () => {
    authMock.currentUser.mockReturnValue({ uid: 'u1' } as never);
    enrollmentsMock.listMyEnrollments.mockRejectedValue(new Error('boom'));
    await router.navigate(['/search'], { queryParams: { q: 'rust' } });
    const fixture = TestBed.createComponent(SearchResultsPageComponent);
    fixture.detectChanges();
    http
      .expectOne((r) => r.url === '/api/catalog/search')
      .flush({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No courses found');
    expect(fixture.componentInstance.completedCourseIds().size).toBe(0);
  });

  it('renders the error state when the request fails', async () => {
    await router.navigate(['/search'], { queryParams: { q: 'rust' } });
    const fixture = TestBed.createComponent(SearchResultsPageComponent);
    fixture.detectChanges();
    http
      .expectOne((r) => r.url === '/api/catalog/search')
      .flush('boom', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Something went wrong');
  });

  it('renders the pagination nav and goToPage navigates to the requested page', async () => {
    await router.navigate(['/search'], { queryParams: { q: 'rust' } });
    const fixture = TestBed.createComponent(SearchResultsPageComponent);
    fixture.detectChanges();
    // Flush with a two-page response so the pagination nav is rendered.
    http.expectOne((r) => r.url === '/api/catalog/search').flush({
      items: [
        {
          id: 'c-1',
          title: 'Rust Basics',
          description: 'd',
          instructorId: 'u-1',
          instructorDisplayName: 'Ada',
          publishedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      page: 1,
      pageSize: 20,
      total: 25,
      totalPages: 2,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Page 1 of 2');

    // Navigate to page 2 and drain the follow-up request.
    fixture.componentInstance.goToPage(2);
    await fixture.whenStable();
    http
      .match((r) => r.url === '/api/catalog/search')
      .forEach((req) => req.flush({ items: [], page: 2, pageSize: 20, total: 25, totalPages: 2 }));
    await fixture.whenStable();

    expect(router.url).toContain('page=2');
  });

  it('exposes the default initial signal values before any query params arrive', () => {
    // A route whose queryParamMap never emits lets us observe the initial
    // signal values BEFORE load() overwrites them — pinning signal('') for
    // query and signal(false) for error.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [SearchResultsPageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { queryParamMap: new Subject() } },
        { provide: AuthService, useValue: authMock },
        { provide: EnrollmentService, useValue: enrollmentsMock },
      ],
    });
    const fixture = TestBed.createComponent(SearchResultsPageComponent);
    const c = fixture.componentInstance;
    expect(c.query()).toBe('');
    expect(c.error()).toBe(false);
    expect(c.result()).toBeNull();
  });

  it('ignores a stale search response that resolves after a newer request', async () => {
    // Race guard: a slow earlier page request must not overwrite the newer one.
    await router.navigate(['/search'], { queryParams: { q: 'rust', page: 1 } });
    const fixture = TestBed.createComponent(SearchResultsPageComponent);
    fixture.detectChanges();
    const reqA = http.expectOne(
      (r) => r.url === '/api/catalog/search' && r.params.get('page') === '1',
    );

    // Paginate before the first request resolves -> request B.
    fixture.componentInstance.goToPage(2);
    await fixture.whenStable();
    const reqB = http.expectOne(
      (r) => r.url === '/api/catalog/search' && r.params.get('page') === '2',
    );

    // Newer (B) resolves first, then the stale (A) resolves last.
    reqB.flush({ items: [], page: 2, pageSize: 20, total: 40, totalPages: 2 });
    await fixture.whenStable();
    reqA.flush({ items: [], page: 1, pageSize: 20, total: 40, totalPages: 2 });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.result()?.page).toBe(2);
  });

  it('ignores a stale FAILED search response so a superseded error does not surface', async () => {
    // Race guard on the catch branch: an older request failing after a newer
    // one succeeded must not flip error to true.
    await router.navigate(['/search'], { queryParams: { q: 'rust', page: 1 } });
    const fixture = TestBed.createComponent(SearchResultsPageComponent);
    fixture.detectChanges();
    const reqA = http.expectOne(
      (r) => r.url === '/api/catalog/search' && r.params.get('page') === '1',
    );

    fixture.componentInstance.goToPage(2);
    await fixture.whenStable();
    const reqB = http.expectOne(
      (r) => r.url === '/api/catalog/search' && r.params.get('page') === '2',
    );

    reqB.flush({ items: [], page: 2, pageSize: 20, total: 40, totalPages: 2 });
    await fixture.whenStable();
    reqA.flush('boom', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.error()).toBe(false);
    expect(fixture.componentInstance.result()?.page).toBe(2);
  });
});

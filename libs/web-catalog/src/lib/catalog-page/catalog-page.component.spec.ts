import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CourseCatalogPage } from '@learnwren/shared-data-models';
import { AuthService } from '@learnwren/web-auth';
import { EnrollmentService } from '@learnwren/web-enrollment';

import { CatalogPageComponent } from './catalog-page.component';

function page(over: Partial<CourseCatalogPage> = {}): CourseCatalogPage {
  return { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0, ...over };
}

describe('CatalogPageComponent', () => {
  let http: HttpTestingController;
  let router: Router;
  let authMock: { currentUser: ReturnType<typeof vi.fn> };
  let enrollmentsMock: { listMyEnrollments: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    authMock = { currentUser: vi.fn().mockReturnValue(null) };
    enrollmentsMock = { listMyEnrollments: vi.fn() };

    TestBed.configureTestingModule({
      imports: [CatalogPageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        // A real route makes /catalog navigable so query params reach the
        // root ActivatedRoute the directly-created component injects.
        provideRouter([{ path: 'catalog', component: CatalogPageComponent }]),
        { provide: AuthService, useValue: authMock },
        { provide: EnrollmentService, useValue: enrollmentsMock },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  it('loads the admin-managed categories once for the filter bar (US-08-02)', async () => {
    await router.navigate(['/catalog']);
    const fixture = TestBed.createComponent(CatalogPageComponent);
    fixture.detectChanges();
    // Empty until the fetch resolves — the catalogue must not depend on it.
    expect(fixture.componentInstance.categories()).toEqual([]);
    const design = { id: 'DESIGN', name: 'Design', createdAt: 'x', updatedAt: 'x' };
    http.expectOne('/api/categories').flush([design]);
    await fixture.whenStable();
    expect(fixture.componentInstance.categories()).toEqual([design]);
    http.expectOne((r) => r.url === '/api/catalog').flush(page());
  });

  it('renders course cards from the catalogue response', async () => {
    await router.navigate(['/catalog']);
    const fixture = TestBed.createComponent(CatalogPageComponent);
    fixture.detectChanges();
    http.expectOne((r) => r.url === '/api/catalog').flush(
      page({
        total: 1,
        totalPages: 1,
        items: [
          {
            id: 'c-1',
            title: 'Learn Rust',
            description: 'd',
            instructorId: 'u-1' as never,
            instructorDisplayName: 'Ada',
            publishedAt: '2026-01-01T00:00:00.000Z' as never,
          },
        ],
      }),
    );
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Learn Rust');
  });

  it('renders the empty-catalogue state when there are no courses', async () => {
    await router.navigate(['/catalog']);
    const fixture = TestBed.createComponent(CatalogPageComponent);
    fixture.detectChanges();
    http.expectOne((r) => r.url === '/api/catalog').flush(page());
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No courses');
  });

  it('renders the no-match state when filters return nothing', async () => {
    await router.navigate(['/catalog'], { queryParams: { category: 'DESIGN' } });
    const fixture = TestBed.createComponent(CatalogPageComponent);
    fixture.detectChanges();
    http.expectOne((r) => r.url === '/api/catalog').flush(page());
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'No courses match your filters',
    );
  });

  it('renders an error state when the request fails', async () => {
    await router.navigate(['/catalog']);
    const fixture = TestBed.createComponent(CatalogPageComponent);
    fixture.detectChanges();
    http
      .expectOne((r) => r.url === '/api/catalog')
      .flush('boom', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Something went wrong');
  });

  it('removes a filter param from the URL when onFilterChange is called with undefined', async () => {
    await router.navigate(['/catalog'], { queryParams: { category: 'PROGRAMMING' } });
    const fixture = TestBed.createComponent(CatalogPageComponent);
    fixture.detectChanges();
    // Flush the initial load triggered by the category=PROGRAMMING params.
    http.expectOne((r) => r.url === '/api/catalog').flush(page());
    await fixture.whenStable();
    fixture.detectChanges();

    // Clear the category filter — onFilterChange also resets page to 1.
    fixture.componentInstance.onFilterChange({ category: undefined });
    await fixture.whenStable();

    // A second /api/catalog request is triggered by the navigation; drain it.
    http.match((r) => r.url === '/api/catalog').forEach((req) => req.flush(page()));
    await fixture.whenStable();

    expect(router.url).not.toContain('category');
    expect(router.url).toContain('page=1');
  });

  it('renders the pagination nav and goToPage navigates to the requested page', async () => {
    await router.navigate(['/catalog']);
    const fixture = TestBed.createComponent(CatalogPageComponent);
    fixture.detectChanges();
    // Flush with a two-page response so the pagination nav is rendered.
    http.expectOne((r) => r.url === '/api/catalog').flush(
      page({
        total: 25,
        totalPages: 2,
        page: 1,
        items: [
          {
            id: 'c-1',
            title: 'Learn Rust',
            description: 'd',
            instructorId: 'u-1' as never,
            instructorDisplayName: 'Ada',
            publishedAt: '2026-01-01T00:00:00.000Z' as never,
          },
        ],
      }),
    );
    await fixture.whenStable();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Page 1 of 2');
    expect(text).toContain('Next');

    // Navigate to page 2 and drain the follow-up request.
    fixture.componentInstance.goToPage(2);
    await fixture.whenStable();
    http.match((r) => r.url === '/api/catalog').forEach((req) => req.flush(page()));
    await fixture.whenStable();

    expect(router.url).toContain('page=2');
  });

  it('passes through category, difficulty, sort and page query params to the catalog service', async () => {
    await router.navigate(['/catalog'], {
      queryParams: {
        category: 'PROGRAMMING',
        difficulty: 'INTERMEDIATE',
        sort: 'TITLE_ASC',
        page: 3,
      },
    });
    const fixture = TestBed.createComponent(CatalogPageComponent);
    fixture.detectChanges();

    const req = http.expectOne((r) => r.url === '/api/catalog');
    // The catalog service composes these into the request URL — pinning the
    // load() method's query-param parsing.
    expect(req.request.params.get('category')).toBe('PROGRAMMING');
    expect(req.request.params.get('difficulty')).toBe('INTERMEDIATE');
    expect(req.request.params.get('sort')).toBe('TITLE_ASC');
    expect(req.request.params.get('page')).toBe('3');
    req.flush(page());
    await fixture.whenStable();
  });

  it('defaults sort to NEWEST and page to 1 when neither is present in the URL', async () => {
    await router.navigate(['/catalog']);
    const fixture = TestBed.createComponent(CatalogPageComponent);
    fixture.detectChanges();
    const req = http.expectOne((r) => r.url === '/api/catalog');
    expect(req.request.params.get('sort')).toBe('NEWEST');
    expect(req.request.params.get('page')).toBe('1');
    req.flush(page());
    await fixture.whenStable();
  });

  it('falls back to page 1 when the page query param is non-numeric', async () => {
    // Pins the `Number(...) || 1` fallback. If the `|| 1` arm is mutated the
    // request would send page=NaN.
    await router.navigate(['/catalog'], { queryParams: { page: 'banana' } });
    const fixture = TestBed.createComponent(CatalogPageComponent);
    fixture.detectChanges();
    const req = http.expectOne((r) => r.url === '/api/catalog');
    expect(req.request.params.get('page')).toBe('1');
    req.flush(page());
    await fixture.whenStable();
  });

  it('marks filtersActive as true when a category-only filter is set', async () => {
    // Drives the false side of `category !== undefined || difficulty !== undefined`
    // with one operand true and the other false.
    await router.navigate(['/catalog'], { queryParams: { category: 'PROGRAMMING' } });
    const fixture = TestBed.createComponent(CatalogPageComponent);
    fixture.detectChanges();
    http.expectOne((r) => r.url === '/api/catalog').flush(page());
    await fixture.whenStable();
    expect(fixture.componentInstance.filtersActive()).toBe(true);
  });

  it('marks filtersActive as true when a difficulty-only filter is set', async () => {
    // Drives the partial-true case of the logical OR from the other side.
    await router.navigate(['/catalog'], { queryParams: { difficulty: 'BEGINNER' } });
    const fixture = TestBed.createComponent(CatalogPageComponent);
    fixture.detectChanges();
    http.expectOne((r) => r.url === '/api/catalog').flush(page());
    await fixture.whenStable();
    expect(fixture.componentInstance.filtersActive()).toBe(true);
  });

  it('marks filtersActive as false when no filter params are present', async () => {
    // Drives the all-false case of the logical OR — without this, mutating
    // `||` to `&&` would still pass on both-true and one-true cases above.
    await router.navigate(['/catalog']);
    const fixture = TestBed.createComponent(CatalogPageComponent);
    fixture.detectChanges();
    http.expectOne((r) => r.url === '/api/catalog').flush(page());
    await fixture.whenStable();
    expect(fixture.componentInstance.filtersActive()).toBe(false);
  });

  it('initialises error and result signals before issuing the request', async () => {
    // Pins the result/error reset before each load — a mutation removing
    // `this.error.set(false)` after a prior failed load would leak the old
    // error into a successful subsequent load.
    await router.navigate(['/catalog']);
    const fixture = TestBed.createComponent(CatalogPageComponent);
    fixture.detectChanges();
    http.expectOne((r) => r.url === '/api/catalog').flush('boom', {
      status: 500,
      statusText: 'Server Error',
    });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.error()).toBe(true);

    // Now retry by navigating again — error should reset to false during load.
    fixture.componentInstance.goToPage(1);
    await fixture.whenStable();
    // After the new navigation but before the new response, error reset.
    http.match((r) => r.url === '/api/catalog').forEach((req) => req.flush(page()));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.error()).toBe(false);
    expect(fixture.componentInstance.result()).not.toBeNull();
  });

  it('exposes the default initial signal values before any query params arrive', () => {
    // A route whose queryParamMap never emits lets us observe the initial
    // signal values BEFORE load() overwrites them — pinning signal(false) for
    // error/filtersActive and signal('NEWEST') for sort.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CatalogPageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { queryParamMap: new Subject() } },
      ],
    });
    const fixture = TestBed.createComponent(CatalogPageComponent);
    const c = fixture.componentInstance;
    expect(c.error()).toBe(false);
    expect(c.filtersActive()).toBe(false);
    expect(c.sort()).toBe('NEWEST');
    expect(c.result()).toBeNull();
  });

  it('merges query params (not replace) when changing filters via onFilterChange', async () => {
    await router.navigate(['/catalog'], { queryParams: { sort: 'TITLE_ASC' } });
    const fixture = TestBed.createComponent(CatalogPageComponent);
    fixture.detectChanges();
    http.expectOne((r) => r.url === '/api/catalog').flush(page());
    await fixture.whenStable();

    const spy = vi.spyOn(router, 'navigate');
    fixture.componentInstance.onFilterChange({ category: 'PROGRAMMING' });
    expect(spy).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParamsHandling: 'merge' }),
    );
    http.match((r) => r.url === '/api/catalog').forEach((req) => req.flush(page()));
    await fixture.whenStable();
  });

  it('merges query params (not replace) when paginating via goToPage', async () => {
    await router.navigate(['/catalog']);
    const fixture = TestBed.createComponent(CatalogPageComponent);
    fixture.detectChanges();
    http.expectOne((r) => r.url === '/api/catalog').flush(page());
    await fixture.whenStable();

    const spy = vi.spyOn(router, 'navigate');
    fixture.componentInstance.goToPage(2);
    expect(spy).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParamsHandling: 'merge' }),
    );
    http.match((r) => r.url === '/api/catalog').forEach((req) => req.flush(page()));
    await fixture.whenStable();
  });

  it('ignores a stale catalogue response that resolves after a newer request', async () => {
    // Race guard: the HTTP wrapper returns a non-cancellable Promise. If the
    // user paginates while an earlier request is still in flight and the older
    // response arrives last, it must NOT overwrite the newer page's data.
    await router.navigate(['/catalog'], { queryParams: { page: 1 } });
    const fixture = TestBed.createComponent(CatalogPageComponent);
    fixture.detectChanges();
    // Request A (page 1) is in flight — capture without flushing.
    const reqA = http.expectOne((r) => r.url === '/api/catalog' && r.params.get('page') === '1');

    // The user clicks to page 2 before page 1 resolves -> request B.
    fixture.componentInstance.goToPage(2);
    await fixture.whenStable();
    const reqB = http.expectOne((r) => r.url === '/api/catalog' && r.params.get('page') === '2');

    // The newer request (B) resolves FIRST with page-2 data.
    reqB.flush(page({ page: 2, total: 40, totalPages: 2 }));
    await fixture.whenStable();

    // Then the STALE request (A) resolves with page-1 data — must be discarded.
    reqA.flush(page({ page: 1, total: 40, totalPages: 2 }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.result()?.page).toBe(2);
  });

  it('ignores a stale FAILED response so a superseded error does not surface', async () => {
    // Race guard on the catch branch: if request A (older) fails AFTER request B
    // (newer) succeeds, the stale failure must NOT flip error to true.
    await router.navigate(['/catalog'], { queryParams: { page: 1 } });
    const fixture = TestBed.createComponent(CatalogPageComponent);
    fixture.detectChanges();
    const reqA = http.expectOne((r) => r.url === '/api/catalog' && r.params.get('page') === '1');

    fixture.componentInstance.goToPage(2);
    await fixture.whenStable();
    const reqB = http.expectOne((r) => r.url === '/api/catalog' && r.params.get('page') === '2');

    // Newer (B) succeeds first.
    reqB.flush(page({ page: 2, total: 40, totalPages: 2 }));
    await fixture.whenStable();
    // Stale (A) fails last — must be discarded by the catch-branch guard.
    reqA.flush('boom', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.error()).toBe(false);
    expect(fixture.componentInstance.result()?.page).toBe(2);
  });

  it('marks cards of completed courses when signed in', async () => {
    authMock.currentUser.mockReturnValue({ uid: 'u1' } as never);
    enrollmentsMock.listMyEnrollments.mockResolvedValue({
      enrollments: [
        { courseId: 'c1', courseTitle: 'One', completedAt: '2026-07-09T00:00:00.000Z' },
        { courseId: 'c2', courseTitle: 'Two', completedAt: null },
      ],
    });
    await router.navigate(['/catalog']);
    const fixture = TestBed.createComponent(CatalogPageComponent);
    fixture.detectChanges();
    http.expectOne((r) => r.url === '/api/catalog').flush(
      page({
        total: 2,
        totalPages: 1,
        items: [
          {
            id: 'c1',
            title: 'One',
            description: 'd',
            instructorId: 'u-1' as never,
            instructorDisplayName: 'Ada',
            publishedAt: '2026-01-01T00:00:00.000Z' as never,
          },
          {
            id: 'c2',
            title: 'Two',
            description: 'd',
            instructorId: 'u-1' as never,
            instructorDisplayName: 'Ada',
            publishedAt: '2026-01-01T00:00:00.000Z' as never,
          },
        ],
      }),
    );
    await fixture.whenStable();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    expect(component.completedCourseIds().has('c1')).toBe(true);
    expect(component.completedCourseIds().has('c2')).toBe(false);
  });

  it('does not call the enrollments API for guests', async () => {
    authMock.currentUser.mockReturnValue(null);
    await router.navigate(['/catalog']);
    const fixture = TestBed.createComponent(CatalogPageComponent);
    fixture.detectChanges();
    http.expectOne((r) => r.url === '/api/catalog').flush(page());
    await fixture.whenStable();

    expect(enrollmentsMock.listMyEnrollments).not.toHaveBeenCalled();
  });

  it('a failed enrollments load leaves the catalog rendered without badges', async () => {
    authMock.currentUser.mockReturnValue({ uid: 'u1' } as never);
    enrollmentsMock.listMyEnrollments.mockRejectedValue(new Error('boom'));
    await router.navigate(['/catalog']);
    const fixture = TestBed.createComponent(CatalogPageComponent);
    fixture.detectChanges();
    http.expectOne((r) => r.url === '/api/catalog').flush(page());
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No courses');
    expect(fixture.componentInstance.completedCourseIds().size).toBe(0);
  });
});

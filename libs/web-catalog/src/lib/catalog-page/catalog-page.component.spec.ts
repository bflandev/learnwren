import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import type { CourseCatalogPage } from '@learnwren/shared-data-models';

import { CatalogPageComponent } from './catalog-page.component';

function page(over: Partial<CourseCatalogPage> = {}): CourseCatalogPage {
  return { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0, ...over };
}

describe('CatalogPageComponent', () => {
  let http: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CatalogPageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        // A real route makes /catalog navigable so query params reach the
        // root ActivatedRoute the directly-created component injects.
        provideRouter([{ path: 'catalog', component: CatalogPageComponent }]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
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
});

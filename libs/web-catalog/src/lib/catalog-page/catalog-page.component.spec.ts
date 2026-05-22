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
});

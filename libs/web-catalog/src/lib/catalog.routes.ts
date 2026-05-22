import type { Route } from '@angular/router';

export const catalogRoutes: Route[] = [
  {
    path: 'catalog',
    loadComponent: () =>
      import('./catalog-page/catalog-page.component').then((m) => m.CatalogPageComponent),
  },
  {
    path: 'catalog/:id',
    loadComponent: () =>
      import('./course-detail-page/course-detail-page.component').then(
        (m) => m.CourseDetailPageComponent,
      ),
  },
  {
    path: 'search',
    loadComponent: () =>
      import('./search-results-page/search-results-page.component').then(
        (m) => m.SearchResultsPageComponent,
      ),
  },
];

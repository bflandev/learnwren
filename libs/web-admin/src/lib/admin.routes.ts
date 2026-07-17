import type { Route } from '@angular/router';

import { adminRoleGuard } from './admin-role.guard';

export const adminRoutes: Route[] = [
  {
    path: 'admin',
    canActivate: [adminRoleGuard],
    children: [
      {
        path: 'users',
        loadComponent: () =>
          import('./admin-users-page/admin-users-page.component').then(
            (m) => m.AdminUsersPageComponent,
          ),
      },
      {
        path: 'users/:uid',
        loadComponent: () =>
          import('./admin-user-detail-page/admin-user-detail-page.component').then(
            (m) => m.AdminUserDetailPageComponent,
          ),
      },
      {
        path: 'categories',
        loadComponent: () =>
          import('./admin-categories-page/admin-categories-page.component').then(
            (m) => m.AdminCategoriesPageComponent,
          ),
      },
      {
        path: 'health',
        loadComponent: () =>
          import('./admin-health-page/admin-health-page.component').then(
            (m) => m.AdminHealthPageComponent,
          ),
      },
      {
        path: 'instructor-applications',
        loadComponent: () =>
          import(
            './admin-instructor-applications-page/admin-instructor-applications-page.component'
          ).then((m) => m.AdminInstructorApplicationsPageComponent),
      },
      { path: '', pathMatch: 'full', redirectTo: 'instructor-applications' },
    ],
  },
];

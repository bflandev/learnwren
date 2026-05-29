import type { Route } from '@angular/router';

import { adminRoleGuard } from './admin-role.guard';

export const adminRoutes: Route[] = [
  {
    path: 'admin',
    canMatch: [adminRoleGuard],
    children: [
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

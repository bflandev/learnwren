import type { Route } from '@angular/router';

import { instructorRoleGuard } from './instructor-role.guard';

export const coursesRoutes: Route[] = [
  {
    // canActivate (not canMatch): the guard is a CanActivateFn that reads
    // state.url to build the ?redirect= param. canMatch passes UrlSegment[] as
    // the 2nd arg, so state.url would be undefined and the redirect lost. This
    // matches how adminRoutes gates its role-guarded path.
    path: 'courses',
    canActivate: [instructorRoleGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./courses-list-page/courses-list-page.component').then(
            (m) => m.CoursesListPageComponent,
          ),
      },
      {
        path: 'new',
        loadComponent: () =>
          import('./course-create-page/course-create-page.component').then(
            (m) => m.CourseCreatePageComponent,
          ),
      },
      {
        path: ':id/edit',
        loadComponent: () =>
          import('./course-editor-page/course-editor-page.component').then(
            (m) => m.CourseEditorPageComponent,
          ),
      },
      {
        path: ':id/students',
        loadComponent: () =>
          import('./course-students-page/course-students-page.component').then(
            (m) => m.CourseStudentsPageComponent,
          ),
      },
      {
        path: ':id/analytics',
        loadComponent: () =>
          import('./course-analytics-page/course-analytics-page.component').then(
            (m) => m.CourseAnalyticsPageComponent,
          ),
      },
    ],
  },
];

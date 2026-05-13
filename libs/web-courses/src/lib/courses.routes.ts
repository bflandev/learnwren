import type { Route } from '@angular/router';

import { instructorRoleGuard } from './instructor-role.guard';

export const coursesRoutes: Route[] = [
  {
    path: 'courses',
    canMatch: [instructorRoleGuard],
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
    ],
  },
];

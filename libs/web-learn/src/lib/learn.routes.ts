import type { Route } from '@angular/router';

import { authGuard } from '@learnwren/web-auth';

export const learnRoutes: Route[] = [
  {
    path: 'learn/:courseId/:lessonId',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./lesson-player-page/lesson-player-page.component').then(
        (m) => m.LessonPlayerPageComponent,
      ),
  },
];

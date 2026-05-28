import type { Route } from '@angular/router';

import { authGuard } from '@learnwren/web-auth';

export const profileRoutes: Route[] = [
  {
    path: 'settings/profile',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./profile-page/profile-page.component').then((m) => m.ProfilePageComponent),
  },
];

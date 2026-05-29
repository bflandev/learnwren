import type { Route } from '@angular/router';

import { authGuard } from '@learnwren/web-auth';

export const profileRoutes: Route[] = [
  {
    path: 'settings/profile',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./profile-page/profile-page.component').then((m) => m.ProfilePageComponent),
  },
  {
    path: 'settings/profile/email-changed',
    loadComponent: () =>
      import('./email/email-changed/email-changed.component').then((m) => m.EmailChangedComponent),
  },
];

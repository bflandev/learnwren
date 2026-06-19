import type { Route } from '@angular/router';

import { landingGuard } from './landing.guard';

export const landingRoutes: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    canActivate: [landingGuard],
    loadComponent: () =>
      import('./landing-page/landing-page.component').then((m) => m.LandingPageComponent),
  },
];

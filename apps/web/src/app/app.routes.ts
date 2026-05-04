import { Route } from '@angular/router';

import { authGuard } from '@learnwren/web-auth';

export const appRoutes: Route[] = [
  {
    path: 'login',
    loadComponent: () =>
      import('@learnwren/web-auth').then((m) => m.LoginPageComponent),
  },
  {
    path: 'register',
    loadComponent: () =>
      import('@learnwren/web-auth').then((m) => m.RegisterPageComponent),
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  { path: '', pathMatch: 'full', redirectTo: '/login' },
];

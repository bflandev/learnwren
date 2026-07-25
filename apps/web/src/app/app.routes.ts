import { isDevMode } from '@angular/core';
import { Route } from '@angular/router';

import {
  authGuard,
  ForgotPasswordPageComponent,
  LoginPageComponent,
  RegisterConfirmPageComponent,
  RegisterPageComponent,
  UnlockPageComponent,
} from '@learnwren/web-auth';
import { adminRoutes } from '@learnwren/web-admin';
import { catalogRoutes } from '@learnwren/web-catalog';
import { coursesRoutes } from '@learnwren/web-courses';
import { landingRoutes } from '@learnwren/web-landing';
import { learnRoutes } from '@learnwren/web-learn';
import { profileRoutes } from '@learnwren/web-profile';

export const appRoutes: Route[] = [
  {
    path: 'login',
    component: LoginPageComponent,
  },
  {
    path: 'register',
    component: RegisterPageComponent,
  },
  {
    path: 'register/confirm',
    component: RegisterConfirmPageComponent,
  },
  {
    path: 'forgot-password',
    component: ForgotPasswordPageComponent,
  },
  {
    path: 'auth/unlock',
    component: UnlockPageComponent,
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  // Dev-only design-system showcase — guard-free and unlinked from any nav.
  // App-local component, lazily loaded: it imports every hlm component, and a
  // lazy chunk keeps that entire surface out of the initial bundle (the shell
  // itself only pays for the components it actually uses).
  ...(isDevMode()
    ? [
        {
          path: 'showcase',
          loadComponent: () =>
            import('./showcase/hlm-showcase.component').then(
              (m) => m.HlmShowcaseComponent,
            ),
        },
      ]
    : []),
  ...catalogRoutes,
  ...coursesRoutes,
  ...adminRoutes,
  ...learnRoutes,
  ...profileRoutes,
  ...landingRoutes,
];

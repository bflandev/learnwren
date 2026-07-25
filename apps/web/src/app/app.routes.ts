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
import { HlmShowcaseComponent } from '@learnwren/web-ui';
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
  // Dev-only design-system showcase — guard-free and unlinked from any nav;
  // the route is not registered in production builds (isDevMode() is
  // compile-time false there). Static import rather than loadComponent: the
  // shell already imports web-ui statically, so lazy-loading it is a no-op and
  // @nx/enforce-module-boundaries forbids mixing the two styles.
  ...(isDevMode() ? [{ path: 'showcase', component: HlmShowcaseComponent }] : []),
  ...catalogRoutes,
  ...coursesRoutes,
  ...adminRoutes,
  ...learnRoutes,
  ...profileRoutes,
  ...landingRoutes,
];

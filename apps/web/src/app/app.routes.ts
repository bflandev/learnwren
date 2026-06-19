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
  ...catalogRoutes,
  ...coursesRoutes,
  ...adminRoutes,
  ...learnRoutes,
  ...profileRoutes,
  ...landingRoutes,
];

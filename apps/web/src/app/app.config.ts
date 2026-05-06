import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { AuthService, withCredentialsInterceptor } from '@learnwren/web-auth';

import { appRoutes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes),
    provideHttpClient(withInterceptors([withCredentialsInterceptor])),
    provideAppInitializer(async () => {
      const auth = inject(AuthService);
      try {
        await auth.refresh();
      } catch {
        // Bootstrap probe failed — leave currentUser as undefined.
      }
    }),
  ],
};

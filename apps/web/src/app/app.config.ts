import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import {
  connectAuthEmulator,
  getAuth,
  provideAuth,
} from '@angular/fire/auth';
import {
  connectFirestoreEmulator,
  getFirestore,
  provideFirestore,
} from '@angular/fire/firestore';
import {
  connectStorageEmulator,
  getStorage,
  provideStorage,
} from '@angular/fire/storage';

import {
  AuthService,
  withCredentialsInterceptor,
} from '@learnwren/web-auth';

import { environment } from '../environments/environment';
import { appRoutes } from './app.routes';

if (environment.firebaseTargetMode === 'production') {
  // Single, deliberate signal that we're not pointed at the emulator.
  // eslint-disable-next-line no-console
  console.warn('[learnwren] Firebase target = production');
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes),
    provideHttpClient(withInterceptors([withCredentialsInterceptor])),
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideAuth(() => {
      const auth = getAuth();
      if (environment.firebaseTargetMode === 'emulator') {
        connectAuthEmulator(auth, environment.emulatorHosts.auth, {
          disableWarnings: true,
        });
      }
      return auth;
    }),
    provideFirestore(() => {
      const db = getFirestore();
      if (environment.firebaseTargetMode === 'emulator') {
        connectFirestoreEmulator(
          db,
          environment.emulatorHosts.firestore.host,
          environment.emulatorHosts.firestore.port,
        );
      }
      return db;
    }),
    provideStorage(() => {
      const storage = getStorage();
      if (environment.firebaseTargetMode === 'emulator') {
        connectStorageEmulator(
          storage,
          environment.emulatorHosts.storage.host,
          environment.emulatorHosts.storage.port,
        );
      }
      return storage;
    }),
    provideAppInitializer(async () => {
      const auth = inject(AuthService);
      try {
        await auth.refresh();
      } catch {
        // Bootstrap probe failed — leave currentUser as undefined and let the
        // guard or first route attempt re-trigger refresh.
      }
    }),
  ],
};

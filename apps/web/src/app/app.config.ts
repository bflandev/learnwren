import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
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

import { appRoutes } from './app.routes';

// TODO(auth-spec): replace the hardcoded demo project ID and emulator hosts
// with environment-driven config when the real Firebase project arrives.
const FIREBASE_CONFIG = { projectId: 'demo-learnwren' } as const;

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes),
    provideFirebaseApp(() => initializeApp(FIREBASE_CONFIG)),
    provideAuth(() => {
      const auth = getAuth();
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', {
        disableWarnings: true,
      });
      return auth;
    }),
    provideFirestore(() => {
      const db = getFirestore();
      connectFirestoreEmulator(db, '127.0.0.1', 8080);
      return db;
    }),
    provideStorage(() => {
      const storage = getStorage();
      connectStorageEmulator(storage, '127.0.0.1', 9199);
      return storage;
    }),
  ],
};

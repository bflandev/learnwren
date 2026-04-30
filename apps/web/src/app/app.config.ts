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

import { environment } from '../environments/environment';
import { appRoutes } from './app.routes';

const { firebaseTargetMode, firebase, emulatorHosts } = environment;

if (firebaseTargetMode === 'production') {
  // Single, deliberate signal that we're not pointed at the emulator.
  // eslint-disable-next-line no-console
  console.warn('[learnwren] Firebase target = production');
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes),
    provideFirebaseApp(() => initializeApp(firebase)),
    provideAuth(() => {
      const auth = getAuth();
      if (firebaseTargetMode === 'emulator') {
        connectAuthEmulator(auth, emulatorHosts.auth, {
          disableWarnings: true,
        });
      }
      return auth;
    }),
    provideFirestore(() => {
      const db = getFirestore();
      if (firebaseTargetMode === 'emulator') {
        connectFirestoreEmulator(
          db,
          emulatorHosts.firestore.host,
          emulatorHosts.firestore.port,
        );
      }
      return db;
    }),
    provideStorage(() => {
      const storage = getStorage();
      if (firebaseTargetMode === 'emulator') {
        connectStorageEmulator(
          storage,
          emulatorHosts.storage.host,
          emulatorHosts.storage.port,
        );
      }
      return storage;
    }),
  ],
};

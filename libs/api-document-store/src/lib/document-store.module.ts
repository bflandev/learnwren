import { Global, Module } from '@nestjs/common';
import { FIRESTORE, type FirestoreHandle } from '@learnwren/api-firebase';

import { DOCUMENT_STORE } from './document-store.port';
import { FirestoreDocumentStore } from './firestore-document-store';

/**
 * Global: feature modules inject DOCUMENT_STORE and never a database SDK.
 * Firestore only until D2 adds the LEARNWREN_DATA_STORE selector.
 */
@Global()
@Module({
  providers: [
    {
      provide: DOCUMENT_STORE,
      inject: [FIRESTORE],
      useFactory: (db: FirestoreHandle) => new FirestoreDocumentStore(db),
    },
  ],
  exports: [DOCUMENT_STORE],
})
export class DocumentStoreModule {}

import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FIRESTORE } from '@learnwren/api-firebase';

import { DocumentStoreModule } from './document-store.module';
import { DOCUMENT_STORE } from './document-store.port';
import { FirestoreDocumentStore } from './firestore-document-store';

// Stands in for FirebaseAdminModule, which is global in production.
@Global()
@Module({ providers: [{ provide: FIRESTORE, useValue: {} }], exports: [FIRESTORE] })
class FakeFirebaseModule {}

describe('DocumentStoreModule', () => {
  it('provides DOCUMENT_STORE as a FirestoreDocumentStore over the FIRESTORE handle', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [FakeFirebaseModule, DocumentStoreModule],
    }).compile();
    expect(moduleRef.get(DOCUMENT_STORE)).toBeInstanceOf(FirestoreDocumentStore);
  });
});

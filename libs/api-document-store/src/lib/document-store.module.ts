import { Global, Logger, Module } from '@nestjs/common';
import { FIRESTORE, type FirestoreHandle } from '@learnwren/api-firebase';
import { Pool } from 'pg';

import { DATA_STORE_CONFIG, readDataStoreConfigFromEnv, type DataStoreConfig } from './data-store.config';
import { DOCUMENT_STORE, type DocumentStore } from './document-store.port';
import { FirestoreDocumentStore } from './firestore-document-store';
import { PostgresDocumentStore } from './postgres/postgres-document-store';

const logger = new Logger('DocumentStore');

const defaultPool = (url: string): Pool => new Pool({ connectionString: url });

/** Picks the adapter from LEARNWREN_DATA_STORE (spec §3.1). Postgres creates its schema before the app serves. */
export async function makeDocumentStore(
  cfg: DataStoreConfig,
  firestore: FirestoreHandle,
  makePool: (url: string) => Pool = defaultPool,
): Promise<DocumentStore> {
  if (cfg.kind === 'firestore') return new FirestoreDocumentStore(firestore);
  const pool = makePool(cfg.url);
  // An idle pooled client can fail (server restart); unhandled, that event kills the process.
  pool.on('error', (err) => logger.error(`idle Postgres client error: ${err.message}`));
  const store = new PostgresDocumentStore(pool);
  await store.ensureSchema();
  return store;
}

/** Global: feature modules inject DOCUMENT_STORE and never a database SDK. */
@Global()
@Module({
  providers: [
    { provide: DATA_STORE_CONFIG, useFactory: () => readDataStoreConfigFromEnv(process.env) },
    {
      provide: DOCUMENT_STORE,
      inject: [DATA_STORE_CONFIG, FIRESTORE],
      useFactory: (cfg: DataStoreConfig, firestore: FirestoreHandle) => makeDocumentStore(cfg, firestore),
    },
  ],
  exports: [DOCUMENT_STORE],
})
export class DocumentStoreModule {}

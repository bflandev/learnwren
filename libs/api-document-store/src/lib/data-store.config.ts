export const DATA_STORE_CONFIG = Symbol.for('learnwren.api-document-store.config');

export type DataStoreConfig = { kind: 'firestore' } | { kind: 'postgres'; url: string };

/**
 * `LEARNWREN_DATA_STORE=firestore` (default: Firestore or its emulator) or
 * `postgres` (self-hosted; needs LEARNWREN_POSTGRES_URL). Spec 2026-10-01 §3.1.
 */
export function readDataStoreConfigFromEnv(env: Record<string, string | undefined>): DataStoreConfig {
  const raw = env['LEARNWREN_DATA_STORE'] ?? 'firestore';
  if (raw === 'firestore') return { kind: 'firestore' };
  if (raw !== 'postgres') {
    throw new Error(`LEARNWREN_DATA_STORE must be "firestore" or "postgres", got "${raw}".`);
  }
  const url = env['LEARNWREN_POSTGRES_URL'];
  if (!url) throw new Error('LEARNWREN_POSTGRES_URL is required when LEARNWREN_DATA_STORE=postgres.');
  return { kind: 'postgres', url };
}

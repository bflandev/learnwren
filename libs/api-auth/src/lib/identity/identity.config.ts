import type { DocumentStore } from '@learnwren/api-document-store';

import { FirebaseIdentityProvider } from './firebase-identity-provider';
import type { IdentityProvider } from './identity-provider.port';
import { LocalIdentityProvider } from './local-identity-provider';

export type IdentityKind = 'firebase' | 'local';

/** LEARNWREN_IDENTITY=firebase (default) | local (self-hosted; needs LEARNWREN_DATA_STORE=postgres). */
export function readIdentityConfigFromEnv(env: Record<string, string | undefined>): IdentityKind {
  const raw = env['LEARNWREN_IDENTITY'] ?? 'firebase';
  if (raw === 'firebase') return 'firebase';
  if (raw !== 'local') throw new Error(`LEARNWREN_IDENTITY must be "firebase" or "local", got "${raw}".`);
  if (env['LEARNWREN_DATA_STORE'] !== 'postgres') {
    throw new Error('LEARNWREN_IDENTITY=local requires LEARNWREN_DATA_STORE=postgres.');
  }
  return 'local';
}

/**
 * Picks the identity adapter. Exactly one LocalIdentityProvider must exist per
 * app (its issued-proof WeakSet only works within one instance), so this is
 * the only place one may be constructed — see AuthModule's IDENTITY_PROVIDER
 * factory, the sole caller.
 */
export function makeIdentityProvider(
  kind: IdentityKind,
  firebase: FirebaseIdentityProvider,
  store: DocumentStore,
): IdentityProvider {
  return kind === 'local' ? new LocalIdentityProvider(store) : firebase;
}

import type { UserStatus } from '@learnwren/shared-data-models';

/** Resolved status (absent Firestore field ≡ ACTIVE). */
export function resolveStatus(raw?: string): UserStatus {
  if (raw === 'SUSPENDED' || raw === 'DELETED') return raw;
  return 'ACTIVE';
}

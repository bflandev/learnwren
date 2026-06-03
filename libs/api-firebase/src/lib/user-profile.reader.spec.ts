import { describe, expect, it, vi } from 'vitest';

import { readStoredUserProfiles } from './user-profile.reader';
import type { FirestoreHandle } from './firebase.tokens';

function makeFirestore(
  users: Record<string, Record<string, unknown> | null>,
  onGet?: (uid: string) => void,
): FirestoreHandle {
  return {
    collection: vi.fn(() => ({
      doc: vi.fn((uid: string) => ({
        get: vi.fn(async () => {
          onGet?.(uid);
          const data = users[uid];
          return { exists: data != null, data: () => data ?? undefined };
        }),
      })),
    })),
  } as unknown as FirestoreHandle;
}

describe('readStoredUserProfiles', () => {
  it('returns the stored profile for each existing user', async () => {
    const firestore = makeFirestore({
      u1: { displayName: 'Ada', email: 'ada@example.com' },
      u2: { displayName: 'Bo', photoUrl: 'p.jpg', biography: 'Hi' },
    });
    const map = await readStoredUserProfiles(firestore, ['u1', 'u2']);
    expect(map.get('u1')).toEqual({ displayName: 'Ada', email: 'ada@example.com' });
    expect(map.get('u2')).toEqual({ displayName: 'Bo', photoUrl: 'p.jpg', biography: 'Hi' });
  });

  it('omits missing documents from the map (caller applies its own fallback)', async () => {
    const firestore = makeFirestore({ u1: { displayName: 'Ada' }, ghost: null });
    const map = await readStoredUserProfiles(firestore, ['u1', 'ghost']);
    expect(map.has('u1')).toBe(true);
    expect(map.has('ghost')).toBe(false);
  });

  it('deduplicates ids and reads each user at most once', async () => {
    const counts = new Map<string, number>();
    const firestore = makeFirestore({ u1: { displayName: 'Ada' } }, (uid) =>
      counts.set(uid, (counts.get(uid) ?? 0) + 1),
    );
    await readStoredUserProfiles(firestore, ['u1', 'u1', 'u1']);
    expect(counts.get('u1')).toBe(1);
  });

  it('treats a bare snapshot without an `exists` field as present', async () => {
    // Mirrors mocks that return only `{ data }`; only an explicit exists:false is missing.
    const firestore = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          get: vi.fn(async () => ({ data: () => ({ displayName: 'Ada' }) })),
        })),
      })),
    } as unknown as FirestoreHandle;
    const map = await readStoredUserProfiles(firestore, ['u1']);
    expect(map.get('u1')).toEqual({ displayName: 'Ada' });
  });
});

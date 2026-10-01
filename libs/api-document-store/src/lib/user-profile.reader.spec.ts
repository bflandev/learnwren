import { describe, expect, it, vi } from 'vitest';

import { readStoredUserProfiles, scanStoredUserProfiles } from './user-profile.reader';
import type { StoredUserRecord } from './user-profile.reader';
import { DOCUMENT_ID, type DocumentStore } from './document-store.port';

function makeFirestore(
  users: Record<string, Record<string, unknown> | null>,
  onGet?: (uid: string) => void,
): DocumentStore {
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
  } as unknown as DocumentStore;
}

describe('readStoredUserProfiles', () => {
  it('returns the stored profile for each existing user', async () => {
    const store = makeFirestore({
      u1: { displayName: 'Ada', email: 'ada@example.com' },
      u2: { displayName: 'Bo', photoUrl: 'p.jpg', biography: 'Hi' },
    });
    const map = await readStoredUserProfiles(store, ['u1', 'u2']);
    expect(map.get('u1')).toEqual({ displayName: 'Ada', email: 'ada@example.com' });
    expect(map.get('u2')).toEqual({ displayName: 'Bo', photoUrl: 'p.jpg', biography: 'Hi' });
  });

  it('omits missing documents from the map (caller applies its own fallback)', async () => {
    const store = makeFirestore({ u1: { displayName: 'Ada' }, ghost: null });
    const map = await readStoredUserProfiles(store, ['u1', 'ghost']);
    expect(map.has('u1')).toBe(true);
    expect(map.has('ghost')).toBe(false);
  });

  it('deduplicates ids and reads each user at most once', async () => {
    const counts = new Map<string, number>();
    const store = makeFirestore({ u1: { displayName: 'Ada' } }, (uid) =>
      counts.set(uid, (counts.get(uid) ?? 0) + 1),
    );
    await readStoredUserProfiles(store, ['u1', 'u1', 'u1']);
    expect(counts.get('u1')).toBe(1);
  });

  it('reads from the "users" collection (not any other name)', async () => {
    const collectionSpy = vi.fn(() => ({
      doc: vi.fn(() => ({
        get: vi.fn(async () => ({ exists: true, data: () => ({ displayName: 'Ada' }) })),
      })),
    }));
    const store = { collection: collectionSpy } as unknown as DocumentStore;
    await readStoredUserProfiles(store, ['u1']);
    expect(collectionSpy).toHaveBeenCalledWith('users');
  });

  it('treats an explicit exists:false as missing even when data() still returns a value', async () => {
    // The guard is `snap.exists === false ? undefined : snap.data()`. A stale
    // backend can report exists:false yet still hand back a data() payload; the
    // reader must honour exists:false and omit the doc.
    const store = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          get: vi.fn(async () => ({ exists: false, data: () => ({ displayName: 'Stale' }) })),
        })),
      })),
    } as unknown as DocumentStore;
    const map = await readStoredUserProfiles(store, ['u1']);
    expect(map.has('u1')).toBe(false);
  });

  it('treats a bare snapshot without an `exists` field as present', async () => {
    // Mirrors mocks that return only `{ data }`; only an explicit exists:false is missing.
    const store = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          get: vi.fn(async () => ({ data: () => ({ displayName: 'Ada' }) })),
        })),
      })),
    } as unknown as DocumentStore;
    const map = await readStoredUserProfiles(store, ['u1']);
    expect(map.get('u1')).toEqual({ displayName: 'Ada' });
  });
});

describe('scanStoredUserProfiles', () => {
  function fakeFirestore(docs: Array<{ id: string; data: Record<string, unknown> }>) {
    let capturedLimit = -1;
    const orderBy = vi.fn(() => ({
      limit: (n: number) => {
        capturedLimit = n;
        return {
          get: async () => ({
            docs: docs.slice(0, n).map((d) => ({ id: d.id, data: () => d.data })),
          }),
        };
      },
    }));
    const handle = {
      collection: () => ({ orderBy }),
      get capturedLimit() {
        return capturedLimit;
      },
      orderBy,
    };
    return handle as unknown as Parameters<typeof scanStoredUserProfiles>[0] & {
      capturedLimit: number;
      orderBy: typeof orderBy;
    };
  }

  it('maps each doc to a record carrying the doc key as id plus its fields', async () => {
    const fs = fakeFirestore([
      { id: 'u1', data: { displayName: 'Ada', email: 'ada@x.com', role: 'STUDENT', createdAt: '2026-06-01T00:00:00.000Z' } },
      { id: 'u2', data: { displayName: 'Bob', email: 'bob@x.com', role: 'INSTRUCTOR', createdAt: '2026-06-02T00:00:00.000Z' } },
    ]);
    const records: StoredUserRecord[] = await scanStoredUserProfiles(fs, 5001);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ id: 'u1', displayName: 'Ada', role: 'STUDENT' });
    expect(records[1]?.id).toBe('u2');
    expect(fs.capturedLimit).toBe(5001);
    expect(fs.orderBy).toHaveBeenCalledWith(DOCUMENT_ID);
  });

  it('honours the limit argument', async () => {
    const fs = fakeFirestore(
      Array.from({ length: 10 }, (_, i) => ({ id: `u${i}`, data: { email: `u${i}@x.com` } })),
    );
    const records = await scanStoredUserProfiles(fs, 3);
    expect(records).toHaveLength(3);
  });
});

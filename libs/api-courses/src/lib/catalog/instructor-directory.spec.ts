import { describe, expect, it } from 'vitest';

import type { UserId } from '@learnwren/shared-data-models';

import { createFakeFirestore } from '../testing/fake-firestore';
import { InstructorDirectory } from './instructor-directory';

describe('InstructorDirectory', () => {
  it('resolves display names for the given user ids', async () => {
    const firestore = createFakeFirestore({
      'users/u-1': { id: 'u-1', displayName: 'Ada Lovelace' },
      'users/u-2': { id: 'u-2', displayName: 'Grace Hopper' },
    });
    const directory = new InstructorDirectory(firestore as never);

    const names = await directory.displayNamesFor(['u-1', 'u-2'] as UserId[]);

    expect(names.get('u-1' as UserId)).toBe('Ada Lovelace');
    expect(names.get('u-2' as UserId)).toBe('Grace Hopper');
  });

  it('falls back to "Instructor" when a user document is missing', async () => {
    const firestore = createFakeFirestore({});
    const directory = new InstructorDirectory(firestore as never);

    const names = await directory.displayNamesFor(['u-ghost'] as UserId[]);

    expect(names.get('u-ghost' as UserId)).toBe('Instructor');
  });

  it('deduplicates ids and reads each user at most once', async () => {
    const firestore = createFakeFirestore({
      'users/u-1': { id: 'u-1', displayName: 'Ada Lovelace' },
    });

    // Wrap the fake in a thin counting proxy so we can assert that `get()` is
    // called exactly once for `users/u-1` even though the input contains the id
    // twice.  A naïve implementation without `[...new Set(uids)]` would call
    // `get()` twice, and this counter would catch it.
    const getCounts = new Map<string, number>();
    const countingFirestore = {
      ...firestore,
      collection(name: string) {
        const col = firestore.collection(name);
        return {
          ...col,
          doc(id?: string) {
            const docRef = col.doc(id);
            return {
              ...docRef,
              async get() {
                getCounts.set(docRef.path, (getCounts.get(docRef.path) ?? 0) + 1);
                return docRef.get();
              },
            };
          },
        };
      },
    };

    const directory = new InstructorDirectory(countingFirestore as never);

    const names = await directory.displayNamesFor(['u-1', 'u-1'] as UserId[]);

    expect(names.get('u-1' as UserId)).toBe('Ada Lovelace');
    expect(getCounts.get('users/u-1')).toBe(1);
  });
});

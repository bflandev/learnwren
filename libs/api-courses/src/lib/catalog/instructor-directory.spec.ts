import { describe, expect, it } from 'vitest';

import type { UserId } from '@learnwren/shared-data-models';

import { createFakeFirestore } from '../testing/fake-firestore';
import { InstructorDirectory } from './instructor-directory';

describe('InstructorDirectory.instructorRefsFor', () => {
  it('returns photoUrl and biography when present on the user doc', async () => {
    const firestore = createFakeFirestore({
      'users/u-1': {
        id: 'u-1',
        displayName: 'Ada',
        role: 'STUDENT',
        photoUrl: 'https://example.com/p/u-1/avatar.jpg?v=1',
        biography: 'Mathematician.',
      },
    });
    const directory = new InstructorDirectory(firestore as never);

    const refs = await directory.instructorRefsFor(['u-1'] as UserId[]);

    expect(refs.get('u-1' as UserId)).toEqual({
      displayName: 'Ada',
      photoUrl: 'https://example.com/p/u-1/avatar.jpg?v=1',
      biography: 'Mathematician.',
    });
  });

  it('omits photoUrl and biography when absent', async () => {
    const firestore = createFakeFirestore({
      'users/u-1': { id: 'u-1', displayName: 'Ada', role: 'STUDENT' },
    });
    const directory = new InstructorDirectory(firestore as never);

    const refs = await directory.instructorRefsFor(['u-1'] as UserId[]);

    expect(refs.get('u-1' as UserId)).toEqual({ displayName: 'Ada' });
  });

  it('returns fallback ref for unknown ids', async () => {
    const firestore = createFakeFirestore({});
    const directory = new InstructorDirectory(firestore as never);

    const refs = await directory.instructorRefsFor(['u-ghost'] as UserId[]);

    expect(refs.get('u-ghost' as UserId)).toEqual({ displayName: 'Instructor' });
  });

  it('deduplicates ids and reads each user at most once', async () => {
    const firestore = createFakeFirestore({
      'users/u-1': { id: 'u-1', displayName: 'Ada', role: 'STUDENT' },
    });

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

    const refs = await directory.instructorRefsFor(['u-1', 'u-1'] as UserId[]);

    expect(refs.get('u-1' as UserId)).toEqual({ displayName: 'Ada' });
    expect(getCounts.get('users/u-1')).toBe(1);
  });
});

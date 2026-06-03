import { describe, expect, it } from 'vitest';
import type { FirestoreHandle } from '@learnwren/api-firebase';
import type { CourseId, UserId } from '@learnwren/shared-data-models';

import { AdminUsersRepository } from './admin-users.repository';

/**
 * Minimal Firestore fake covering the calls AdminUsersRepository makes:
 *  - collection(name).where(field,'==',value).get() -> { docs }
 *  - collection(name).doc(id).get() -> { exists, data() }
 */
function fakeFirestore(opts: {
  enrollments?: Array<Record<string, unknown>>;
  authored?: Array<Record<string, unknown>>;
  coursesById?: Record<string, Record<string, unknown> | undefined>;
  usersById?: Record<string, Record<string, unknown> | undefined>;
}): FirestoreHandle {
  return {
    collection: (name: string) => ({
      where: (_field: string, _op: string, _value: unknown) => ({
        get: async () => ({
          docs:
            name === 'enrollments'
              ? (opts.enrollments ?? []).map((d) => ({ data: () => d }))
              : (opts.authored ?? []).map((d) => ({ data: () => d })),
        }),
      }),
      doc: (id: string) => ({
        get: async () => {
          const map = name === 'courses' ? opts.coursesById : opts.usersById;
          const data = map?.[id];
          return { exists: data !== undefined, data: () => data };
        },
      }),
    }),
  } as unknown as FirestoreHandle;
}

describe('AdminUsersRepository', () => {
  it('listEnrollmentsByUser maps enrollment docs', async () => {
    const repo = new AdminUsersRepository(
      fakeFirestore({
        enrollments: [
          { id: 'u1__c1', userId: 'u1', courseId: 'c1', status: 'ACTIVE', createdAt: '2026-06-02T00:00:00.000Z' },
        ],
      }),
    );
    const rows = await repo.listEnrollmentsByUser('u1' as UserId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.courseId).toBe('c1');
  });

  it('getCourseTitle returns the title when the course exists', async () => {
    const repo = new AdminUsersRepository(
      fakeFirestore({ coursesById: { c1: { id: 'c1', title: 'Intro', status: 'PUBLISHED' } } }),
    );
    expect(await repo.getCourseTitle('c1' as CourseId)).toBe('Intro');
  });

  it('getCourseTitle returns null for a deleted course', async () => {
    const repo = new AdminUsersRepository(fakeFirestore({ coursesById: {} }));
    expect(await repo.getCourseTitle('gone' as CourseId)).toBeNull();
  });

  it('listAuthoredCourses maps course docs', async () => {
    const repo = new AdminUsersRepository(
      fakeFirestore({ authored: [{ id: 'c2', title: 'Adv', status: 'DRAFT', instructorId: 'u1' }] }),
    );
    const rows = await repo.listAuthoredCourses('u1' as UserId);
    expect(rows[0]?.id).toBe('c2');
  });

  it('getUser returns the record with id merged when the user exists', async () => {
    const repo = new AdminUsersRepository(
      fakeFirestore({ usersById: { u1: { displayName: 'Ada', email: 'ada@x.com', role: 'STUDENT' } } }),
    );
    const rec = await repo.getUser('u1' as UserId);
    expect(rec).toMatchObject({ id: 'u1', displayName: 'Ada' });
  });

  it('getUser returns null when the user doc is missing', async () => {
    const repo = new AdminUsersRepository(fakeFirestore({ usersById: {} }));
    expect(await repo.getUser('nope' as UserId)).toBeNull();
  });
});

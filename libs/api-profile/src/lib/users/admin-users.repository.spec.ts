import { describe, expect, it, vi } from 'vitest';
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
  /** Admin users by uid (for countActiveAdmins tests). */
  adminUsers?: Array<Record<string, unknown>>;
}): FirestoreHandle {
  return {
    collection: (name: string) => ({
      where: (_field: string, _op: string, _value: unknown) => ({
        get: async () => ({
          docs:
            name === 'enrollments'
              ? (opts.enrollments ?? []).map((d) => ({ data: () => d }))
              : name === 'users'
                ? (opts.adminUsers ?? []).map((d) => ({ data: () => d }))
                : (opts.authored ?? []).map((d) => ({ data: () => d })),
        }),
      }),
      doc: (id: string) => ({
        id,
        get: async () => {
          const map = name === 'courses' ? opts.coursesById : opts.usersById;
          const data = map?.[id];
          return { exists: data !== undefined, data: () => data };
        },
      }),
    }),
  } as unknown as FirestoreHandle;
}

/** Build a minimal Transaction stub for txn-path tests. */
function makeTxn(opts: {
  userDocResult?: { exists: boolean; data: () => unknown };
  queryResult?: { docs: Array<{ data: () => unknown }> };
}) {
  return {
    get: vi.fn(async (refOrQuery: unknown) => {
      const asRef = refOrQuery as { id?: string };
      if (asRef.id) {
        // DocumentReference path.
        return opts.userDocResult ?? { exists: false, data: () => undefined };
      }
      // Query path.
      return opts.queryResult ?? { docs: [] };
    }),
  };
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

  // ---------------------------------------------------------------------------
  // getUserInTxn
  // ---------------------------------------------------------------------------

  it('getUserInTxn returns the record when the doc exists', async () => {
    const firestore = fakeFirestore({ usersById: { u1: { displayName: 'Ada', email: 'ada@x.com', role: 'STUDENT' } } });
    const repo = new AdminUsersRepository(firestore);
    const txn = makeTxn({
      userDocResult: { exists: true, data: () => ({ displayName: 'Ada', email: 'ada@x.com', role: 'STUDENT' }) },
    });
    const rec = await repo.getUserInTxn(txn as never, 'u1' as UserId);
    expect(rec).toMatchObject({ id: 'u1', displayName: 'Ada' });
    expect(txn.get).toHaveBeenCalled();
  });

  it('getUserInTxn returns null when the doc does not exist', async () => {
    const firestore = fakeFirestore({ usersById: {} });
    const repo = new AdminUsersRepository(firestore);
    const txn = makeTxn({ userDocResult: { exists: false, data: () => undefined } });
    const rec = await repo.getUserInTxn(txn as never, 'nope' as UserId);
    expect(rec).toBeNull();
    expect(txn.get).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // listAuthoredCoursesInTxn
  // ---------------------------------------------------------------------------

  it('listAuthoredCoursesInTxn maps course docs via the transaction', async () => {
    const firestore = fakeFirestore({ authored: [{ id: 'c2', title: 'Adv', instructorId: 'u1' }] });
    const repo = new AdminUsersRepository(firestore);
    const txn = makeTxn({
      queryResult: { docs: [{ data: () => ({ id: 'c2', title: 'Adv', instructorId: 'u1' }) }] },
    });
    const rows = await repo.listAuthoredCoursesInTxn(txn as never, 'u1' as UserId);
    expect(rows[0]?.id).toBe('c2');
    expect(txn.get).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // countActiveAdmins
  // ---------------------------------------------------------------------------

  it('countActiveAdmins without txn counts active admin users via direct query', async () => {
    const repo = new AdminUsersRepository(
      fakeFirestore({
        adminUsers: [
          { role: 'ADMIN', status: 'ACTIVE' },
          { role: 'ADMIN', status: 'SUSPENDED' },
          { role: 'ADMIN' }, // absent status ≡ ACTIVE
        ],
      }),
    );
    const count = await repo.countActiveAdmins();
    expect(count).toBe(2);
  });

  it('countActiveAdmins with txn routes the query through txn.get', async () => {
    const firestore = fakeFirestore({ adminUsers: [] });
    const repo = new AdminUsersRepository(firestore);
    const txn = makeTxn({
      queryResult: {
        docs: [
          { data: () => ({ role: 'ADMIN', status: 'ACTIVE' }) },
          { data: () => ({ role: 'ADMIN', status: 'SUSPENDED' }) },
        ],
      },
    });
    const count = await repo.countActiveAdmins(txn as never);
    expect(count).toBe(1);
    // The query MUST have gone through txn.get, not a direct firestore get.
    expect(txn.get).toHaveBeenCalled();
  });

  it('countActiveAdmins with txn counts only non-SUSPENDED, non-DELETED admins', async () => {
    const firestore = fakeFirestore({ adminUsers: [] });
    const repo = new AdminUsersRepository(firestore);
    const txn = makeTxn({
      queryResult: {
        docs: [
          { data: () => ({ role: 'ADMIN' }) },           // absent ≡ ACTIVE
          { data: () => ({ role: 'ADMIN', status: 'ACTIVE' }) },
          { data: () => ({ role: 'ADMIN', status: 'SUSPENDED' }) },
          { data: () => ({ role: 'ADMIN', status: 'DELETED' }) },
        ],
      },
    });
    const count = await repo.countActiveAdmins(txn as never);
    expect(count).toBe(2);
  });
});

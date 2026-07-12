import { describe, expect, it, vi } from 'vitest';
import { FieldValue } from 'firebase-admin/firestore';
import type { FirestoreHandle } from '@learnwren/api-firebase';
import type { CourseId, UserId } from '@learnwren/shared-data-models';

import { AdminUsersRepository } from './admin-users.repository';

/**
 * Records every Firestore interaction so tests can assert the EXACT collection
 * name, where() field/op/value, doc() id, orderBy/limit, batch deletes and
 * update payloads the repository issues. This is what kills the string-literal,
 * query-operator and call-shape mutants.
 */
interface Recorder {
  collections: string[];
  wheres: Array<{ collection: string; field: string; op: string; value: unknown }>;
  docs: Array<{ collection: string; id: string }>;
  orderBys: number;
  limits: number[];
  /** Doc ids passed to batch.delete (each as `${collection}/${id}`). */
  batchDeletes: string[];
  batchCommits: number;
  updates: Array<{ collection: string; id: string; payload: Record<string, unknown> }>;
  docDeletes: string[];
}

function makeRecorder(): Recorder {
  return {
    collections: [],
    wheres: [],
    docs: [],
    orderBys: 0,
    limits: [],
    batchDeletes: [],
    batchCommits: 0,
    updates: [],
    docDeletes: [],
  };
}

function fakeFirestore(
  opts: {
    enrollments?: Array<Record<string, unknown>>;
    authored?: Array<Record<string, unknown>>;
    coursesById?: Record<string, Record<string, unknown> | undefined>;
    /** Raw snapshot override for courses/{id}.get() (full control of exists+data). */
    courseSnapshots?: Record<string, { exists: boolean; data: () => unknown }>;
    usersById?: Record<string, Record<string, unknown> | undefined>;
    /** Admin users by uid (for countActiveAdmins tests). */
    adminUsers?: Array<Record<string, unknown>>;
    /** Docs returned by the scanUsers orderBy().limit().get() path. */
    scanDocs?: Array<{ id: string; data: Record<string, unknown> }>;
    /** Docs returned by enrollment where().get() for delete-all (have ids). */
    enrollmentDocs?: Array<{ id: string; data: Record<string, unknown> }>;
    /** Raw snapshot override for enrollments/{id}.get() inside a transaction. */
    enrollmentSnapshots?: Record<string, { exists: boolean; data: () => unknown }>;
    /** Existence of the instructorApplications/{uid} doc. */
    applicationExists?: boolean;
  },
  rec: Recorder = makeRecorder(),
): { handle: FirestoreHandle; rec: Recorder } {
  const handle = {
    collection: (name: string) => {
      rec.collections.push(name);
      return {
        where: (field: string, op: string, value: unknown) => {
          rec.wheres.push({ collection: name, field, op, value });
          return {
            get: async () => ({
              docs:
                name === 'enrollments'
                  ? opts.enrollmentDocs
                    ? opts.enrollmentDocs.map((d) => ({ id: d.id, data: () => d.data }))
                    : (opts.enrollments ?? []).map((d, i) => ({ id: `e${i}`, data: () => d }))
                  : name === 'users'
                    ? (opts.adminUsers ?? []).map((d, i) => ({ id: `u${i}`, data: () => d }))
                    : (opts.authored ?? []).map((d, i) => ({ id: `c${i}`, data: () => d })),
            }),
          };
        },
        orderBy: () => {
          rec.orderBys++;
          return {
            limit: (n: number) => {
              rec.limits.push(n);
              return {
                get: async () => ({
                  docs: (opts.scanDocs ?? []).map((d) => ({ id: d.id, data: () => d.data })),
                }),
              };
            },
          };
        },
        doc: (id: string) => {
          rec.docs.push({ collection: name, id });
          return {
            id,
            get: async () => {
              if (name === 'instructorApplications') {
                return { exists: opts.applicationExists ?? false, data: () => undefined };
              }
              if (name === 'enrollments') {
                if (opts.enrollmentSnapshots?.[id]) return opts.enrollmentSnapshots[id];
                const found = opts.enrollmentDocs?.find((d) => d.id === id);
                return { exists: found !== undefined, data: () => found?.data };
              }
              if (name === 'courses' && opts.courseSnapshots?.[id]) {
                return opts.courseSnapshots[id];
              }
              const map = name === 'courses' ? opts.coursesById : opts.usersById;
              const data = map?.[id];
              return { exists: data !== undefined, data: () => data };
            },
            update: async (payload: Record<string, unknown>) => {
              rec.updates.push({ collection: name, id, payload });
            },
            delete: async () => {
              rec.docDeletes.push(`${name}/${id}`);
            },
          };
        },
      };
    },
    batch: () => ({
      delete: (ref: { __key?: string }) => {
        rec.batchDeletes.push(ref.__key ?? 'unknown');
      },
      commit: async () => {
        rec.batchCommits++;
      },
    }),
    // Minimal Transaction stub: get/update/delete delegate to the ref built by
    // collection().doc() above, so all interactions land in the recorder.
    runTransaction: async (fn: (txn: unknown) => Promise<unknown>) =>
      fn({
        get: (ref: { get: () => Promise<unknown> }) => ref.get(),
        update: (ref: { update: (p: Record<string, unknown>) => Promise<void> }, payload: Record<string, unknown>) => {
          void ref.update(payload);
        },
        delete: (ref: { delete: () => Promise<void> }) => {
          void ref.delete();
        },
      }),
  } as unknown as FirestoreHandle;
  return { handle, rec };
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
  // ---------------------------------------------------------------------------
  // scanUsers
  // ---------------------------------------------------------------------------

  it('scanUsers scans the users collection ordered+limited and merges the doc id', async () => {
    const { handle, rec } = fakeFirestore({
      scanDocs: [
        { id: 'u1', data: { displayName: 'Ada', email: 'ada@x.com', role: 'STUDENT' } },
        { id: 'u2', data: { displayName: 'Bo', email: 'bo@x.com', role: 'ADMIN' } },
      ],
    });
    const repo = new AdminUsersRepository(handle);
    const rows = await repo.scanUsers(50);
    expect(rows).toEqual([
      { id: 'u1', displayName: 'Ada', email: 'ada@x.com', role: 'STUDENT' },
      { id: 'u2', displayName: 'Bo', email: 'bo@x.com', role: 'ADMIN' },
    ]);
    // Delegates to scanStoredUserProfiles: users collection, ordered, limited to N.
    expect(rec.collections).toContain('users');
    expect(rec.orderBys).toBe(1);
    expect(rec.limits).toEqual([50]);
  });

  // ---------------------------------------------------------------------------
  // listEnrollmentsByUser
  // ---------------------------------------------------------------------------

  it('listEnrollmentsByUser queries enrollments by userId and maps docs', async () => {
    const { handle, rec } = fakeFirestore({
      enrollments: [
        { id: 'u1__c1', userId: 'u1', courseId: 'c1', status: 'ACTIVE', createdAt: '2026-06-02T00:00:00.000Z' },
      ],
    });
    const repo = new AdminUsersRepository(handle);
    const rows = await repo.listEnrollmentsByUser('u1' as UserId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.courseId).toBe('c1');
    expect(rec.wheres).toEqual([{ collection: 'enrollments', field: 'userId', op: '==', value: 'u1' }]);
  });

  // ---------------------------------------------------------------------------
  // getCourseTitle
  // ---------------------------------------------------------------------------

  it('getCourseTitle returns the title and reads courses/{id}', async () => {
    const { handle, rec } = fakeFirestore({ coursesById: { c1: { id: 'c1', title: 'Intro', status: 'PUBLISHED' } } });
    const repo = new AdminUsersRepository(handle);
    expect(await repo.getCourseTitle('c1' as CourseId)).toBe('Intro');
    expect(rec.docs).toContainEqual({ collection: 'courses', id: 'c1' });
  });

  it('getCourseTitle returns null for a deleted course', async () => {
    const { handle } = fakeFirestore({ coursesById: {} });
    const repo = new AdminUsersRepository(handle);
    expect(await repo.getCourseTitle('gone' as CourseId)).toBeNull();
  });

  it('getCourseTitle returns null when the existing doc has no title field', async () => {
    const { handle } = fakeFirestore({ coursesById: { c1: { id: 'c1', status: 'PUBLISHED' } } });
    const repo = new AdminUsersRepository(handle);
    expect(await repo.getCourseTitle('c1' as CourseId)).toBeNull();
  });

  it('getCourseTitle returns null on the missing path EVEN IF the snapshot still carries data', async () => {
    // Pins the `if (snap.exists === false) return null` early return: when exists
    // is false we must NOT fall through to read data().title (which here is a real
    // title). Removing the guard would return 'Ghost' instead of null.
    const { handle } = fakeFirestore({
      courseSnapshots: { c1: { exists: false, data: () => ({ title: 'Ghost' }) } },
    });
    const repo = new AdminUsersRepository(handle);
    expect(await repo.getCourseTitle('c1' as CourseId)).toBeNull();
  });

  it('getCourseTitle returns null when an existing snapshot has undefined data', async () => {
    // Kills the `data?.title` optional-chaining survivor: exists is true but data()
    // is undefined, so `data.title` (without ?.) would throw a TypeError.
    const { handle } = fakeFirestore({
      courseSnapshots: { c1: { exists: true, data: () => undefined } },
    });
    const repo = new AdminUsersRepository(handle);
    expect(await repo.getCourseTitle('c1' as CourseId)).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // listAuthoredCourses
  // ---------------------------------------------------------------------------

  it('listAuthoredCourses queries courses by instructorId and maps docs', async () => {
    const { handle, rec } = fakeFirestore({
      authored: [{ id: 'c2', title: 'Adv', status: 'DRAFT', instructorId: 'u1' }],
    });
    const repo = new AdminUsersRepository(handle);
    const rows = await repo.listAuthoredCourses('u1' as UserId);
    expect(rows[0]?.id).toBe('c2');
    expect(rec.wheres).toEqual([{ collection: 'courses', field: 'instructorId', op: '==', value: 'u1' }]);
  });

  // ---------------------------------------------------------------------------
  // getUser
  // ---------------------------------------------------------------------------

  it('getUser returns the record with id merged when the user exists', async () => {
    const { handle } = fakeFirestore({
      usersById: { u1: { displayName: 'Ada', email: 'ada@x.com', role: 'STUDENT' } },
    });
    const repo = new AdminUsersRepository(handle);
    const rec = await repo.getUser('u1' as UserId);
    expect(rec).toEqual({ id: 'u1', displayName: 'Ada', email: 'ada@x.com', role: 'STUDENT' });
  });

  it('getUser returns null when the user doc is missing', async () => {
    const { handle } = fakeFirestore({ usersById: {} });
    const repo = new AdminUsersRepository(handle);
    expect(await repo.getUser('nope' as UserId)).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // getUserInTxn
  // ---------------------------------------------------------------------------

  it('getUserInTxn reads users/{uid} via the transaction and merges the id', async () => {
    const { handle, rec } = fakeFirestore({ usersById: {} });
    const repo = new AdminUsersRepository(handle);
    const txn = makeTxn({
      userDocResult: { exists: true, data: () => ({ displayName: 'Ada', email: 'ada@x.com', role: 'STUDENT' }) },
    });
    const rec2 = await repo.getUserInTxn(txn as never, 'u1' as UserId);
    expect(rec2).toEqual({ id: 'u1', displayName: 'Ada', email: 'ada@x.com', role: 'STUDENT' });
    expect(txn.get).toHaveBeenCalled();
    // The ref must come from users/{uid}.
    expect(rec.docs).toContainEqual({ collection: 'users', id: 'u1' });
  });

  it('getUserInTxn returns null when the doc does not exist', async () => {
    const { handle } = fakeFirestore({ usersById: {} });
    const repo = new AdminUsersRepository(handle);
    const txn = makeTxn({ userDocResult: { exists: false, data: () => undefined } });
    const rec = await repo.getUserInTxn(txn as never, 'nope' as UserId);
    expect(rec).toBeNull();
    expect(txn.get).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // listAuthoredCoursesInTxn
  // ---------------------------------------------------------------------------

  it('listAuthoredCoursesInTxn queries courses by instructorId and maps via the transaction', async () => {
    const { handle, rec } = fakeFirestore({});
    const repo = new AdminUsersRepository(handle);
    const txn = makeTxn({
      queryResult: { docs: [{ data: () => ({ id: 'c2', title: 'Adv', instructorId: 'u1' }) }] },
    });
    const rows = await repo.listAuthoredCoursesInTxn(txn as never, 'u1' as UserId);
    expect(rows).toEqual([{ id: 'c2', title: 'Adv', instructorId: 'u1' }]);
    expect(txn.get).toHaveBeenCalled();
    expect(rec.wheres).toEqual([{ collection: 'courses', field: 'instructorId', op: '==', value: 'u1' }]);
  });

  // ---------------------------------------------------------------------------
  // countActiveAdmins
  // ---------------------------------------------------------------------------

  it('countActiveAdmins without txn queries users role==ADMIN and counts active', async () => {
    const { handle, rec } = fakeFirestore({
      adminUsers: [
        { role: 'ADMIN', status: 'ACTIVE' },
        { role: 'ADMIN', status: 'SUSPENDED' },
        { role: 'ADMIN' }, // absent status ≡ ACTIVE
      ],
    });
    const repo = new AdminUsersRepository(handle);
    const count = await repo.countActiveAdmins();
    expect(count).toBe(2);
    expect(rec.wheres).toEqual([{ collection: 'users', field: 'role', op: '==', value: 'ADMIN' }]);
  });

  it('countActiveAdmins with txn routes the query through txn.get (not direct get)', async () => {
    const { handle } = fakeFirestore({ adminUsers: [{ role: 'ADMIN', status: 'ACTIVE' }] });
    const repo = new AdminUsersRepository(handle);
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
    // The query MUST have gone through txn.get; the direct firestore docs (1 active)
    // would have yielded a different count, so this also proves the txn path is taken.
    expect(txn.get).toHaveBeenCalled();
  });

  it('countActiveAdmins counts only non-SUSPENDED, non-DELETED admins (absent ≡ ACTIVE)', async () => {
    const { handle } = fakeFirestore({ adminUsers: [] });
    const repo = new AdminUsersRepository(handle);
    const txn = makeTxn({
      queryResult: {
        docs: [
          { data: () => ({ role: 'ADMIN' }) }, // absent ≡ ACTIVE
          { data: () => ({ role: 'ADMIN', status: 'ACTIVE' }) },
          { data: () => ({ role: 'ADMIN', status: 'SUSPENDED' }) },
          { data: () => ({ role: 'ADMIN', status: 'DELETED' }) },
        ],
      },
    });
    const count = await repo.countActiveAdmins(txn as never);
    expect(count).toBe(2);
  });

  it('countActiveAdmins counts a status that is neither SUSPENDED nor DELETED (e.g. PENDING)', async () => {
    // Distinguishes `!== 'SUSPENDED' && !== 'DELETED'` from variants: any other
    // status string must still count.
    const { handle } = fakeFirestore({ adminUsers: [] });
    const repo = new AdminUsersRepository(handle);
    const txn = makeTxn({
      queryResult: { docs: [{ data: () => ({ role: 'ADMIN', status: 'PENDING' }) }] },
    });
    expect(await repo.countActiveAdmins(txn as never)).toBe(1);
  });

  it('countActiveAdmins does not count a DELETED admin', async () => {
    // Pins the DELETED branch independently of SUSPENDED.
    const { handle } = fakeFirestore({ adminUsers: [] });
    const repo = new AdminUsersRepository(handle);
    const txn = makeTxn({
      queryResult: { docs: [{ data: () => ({ role: 'ADMIN', status: 'DELETED' }) }] },
    });
    expect(await repo.countActiveAdmins(txn as never)).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // deleteAllEnrollmentsForUser
  // ---------------------------------------------------------------------------

  it('deleteAllEnrollmentsForUser queries by userId and batch-deletes every enrollment doc', async () => {
    const { handle, rec } = fakeFirestore({
      enrollmentDocs: [
        { id: 'e1', data: { userId: 'u1' } },
        { id: 'e2', data: { userId: 'u1' } },
        { id: 'e3', data: { userId: 'u1' } },
      ],
    });
    const repo = new AdminUsersRepository(handle);
    await repo.deleteAllEnrollmentsForUser('u1' as UserId);
    expect(rec.wheres).toEqual([{ collection: 'enrollments', field: 'userId', op: '==', value: 'u1' }]);
    // One chunk (3 < 500) → one commit, three deletes against enrollments/{id}.
    expect(rec.batchCommits).toBe(1);
    expect(rec.docs.filter((d) => d.collection === 'enrollments')).toEqual([
      { collection: 'enrollments', id: 'e1' },
      { collection: 'enrollments', id: 'e2' },
      { collection: 'enrollments', id: 'e3' },
    ]);
  });

  it('deleteAllEnrollmentsForUser does nothing when there are no enrollments', async () => {
    // Drives the loop's `i < refs.length` false-on-entry branch.
    const { handle, rec } = fakeFirestore({ enrollmentDocs: [] });
    const repo = new AdminUsersRepository(handle);
    await repo.deleteAllEnrollmentsForUser('u1' as UserId);
    expect(rec.batchCommits).toBe(0);
    expect(rec.docs.filter((d) => d.collection === 'enrollments')).toEqual([]);
  });

  it('deleteAllEnrollmentsForUser chunks deletes into batches of 500', async () => {
    // 501 docs ⇒ exactly two commits (500 + 1). Distinguishes the chunk size,
    // the `i += 500` step, and the `i + 500` slice end from off-by-one mutants.
    const enrollmentDocs = Array.from({ length: 501 }, (_, i) => ({ id: `e${i}`, data: { userId: 'u1' } }));
    const { handle, rec } = fakeFirestore({ enrollmentDocs });
    const repo = new AdminUsersRepository(handle);
    await repo.deleteAllEnrollmentsForUser('u1' as UserId);
    expect(rec.batchCommits).toBe(2);
    // All 501 docs deleted exactly once.
    const deleted = rec.docs.filter((d) => d.collection === 'enrollments');
    expect(deleted).toHaveLength(501);
    expect(deleted[0]).toEqual({ collection: 'enrollments', id: 'e0' });
    expect(deleted[500]).toEqual({ collection: 'enrollments', id: 'e500' });
  });

  // ---------------------------------------------------------------------------
  // deleteAllEnrollmentsForUser — ACTIVE enrollments must also decrement the
  // course's enrollmentCount (kept by enroll +1 / withdraw −1 in api-courses);
  // otherwise POPULAR catalog ranking inflates permanently.
  // ---------------------------------------------------------------------------

  it('decrements courses/{courseId}.enrollmentCount when purging an ACTIVE enrollment', async () => {
    const { handle, rec } = fakeFirestore({
      enrollmentDocs: [
        { id: 'u1__c1', data: { userId: 'u1', courseId: 'c1', status: 'ACTIVE' } },
      ],
      coursesById: { c1: { id: 'c1', title: 'Intro', enrollmentCount: 5 } },
    });
    const repo = new AdminUsersRepository(handle);
    await repo.deleteAllEnrollmentsForUser('u1' as UserId);
    // Enrollment deleted atomically with the decrement (via the transaction).
    expect(rec.docDeletes).toContain('enrollments/u1__c1');
    expect(rec.updates).toContainEqual({
      collection: 'courses',
      id: 'c1',
      payload: { enrollmentCount: 4 },
    });
    // The ACTIVE path never uses the (non-atomic) batch.
    expect(rec.batchCommits).toBe(0);
  });

  it('floors enrollmentCount at 0 and treats a missing count as 0', async () => {
    const { handle, rec } = fakeFirestore({
      enrollmentDocs: [
        { id: 'u1__c1', data: { userId: 'u1', courseId: 'c1', status: 'ACTIVE' } },
        { id: 'u1__c2', data: { userId: 'u1', courseId: 'c2', status: 'ACTIVE' } },
      ],
      coursesById: {
        c1: { id: 'c1', enrollmentCount: 0 },
        c2: { id: 'c2' }, // pre-Slice-B doc without the field
      },
    });
    const repo = new AdminUsersRepository(handle);
    await repo.deleteAllEnrollmentsForUser('u1' as UserId);
    expect(rec.updates).toContainEqual({ collection: 'courses', id: 'c1', payload: { enrollmentCount: 0 } });
    expect(rec.updates).toContainEqual({ collection: 'courses', id: 'c2', payload: { enrollmentCount: 0 } });
  });

  it('tolerates a missing course doc: deletes the dangling ACTIVE enrollment, no course write', async () => {
    const { handle, rec } = fakeFirestore({
      enrollmentDocs: [
        { id: 'u1__gone', data: { userId: 'u1', courseId: 'gone', status: 'ACTIVE' } },
      ],
      coursesById: {},
    });
    const repo = new AdminUsersRepository(handle);
    await repo.deleteAllEnrollmentsForUser('u1' as UserId);
    expect(rec.docDeletes).toContain('enrollments/u1__gone');
    expect(rec.updates).toEqual([]);
  });

  it('skips an ACTIVE enrollment already purged by a previous attempt (no double-decrement on retry)', async () => {
    const { handle, rec } = fakeFirestore({
      enrollmentDocs: [
        { id: 'u1__c1', data: { userId: 'u1', courseId: 'c1', status: 'ACTIVE' } },
      ],
      // In-txn re-read: the doc vanished between the query and the transaction.
      enrollmentSnapshots: { u1__c1: { exists: false, data: () => undefined } },
      coursesById: { c1: { id: 'c1', enrollmentCount: 5 } },
    });
    const repo = new AdminUsersRepository(handle);
    await repo.deleteAllEnrollmentsForUser('u1' as UserId);
    expect(rec.docDeletes).toEqual([]);
    expect(rec.updates).toEqual([]);
  });

  it('does NOT decrement for WITHDRAWN enrollments (already decremented at withdraw)', async () => {
    const { handle, rec } = fakeFirestore({
      enrollmentDocs: [
        { id: 'u1__c1', data: { userId: 'u1', courseId: 'c1', status: 'WITHDRAWN' } },
        { id: 'u1__c2', data: { userId: 'u1', courseId: 'c2', status: 'ACTIVE' } },
      ],
      coursesById: {
        c1: { id: 'c1', enrollmentCount: 5 },
        c2: { id: 'c2', enrollmentCount: 5 },
      },
    });
    const repo = new AdminUsersRepository(handle);
    await repo.deleteAllEnrollmentsForUser('u1' as UserId);
    // Only the ACTIVE enrollment's course is decremented.
    expect(rec.updates).toEqual([{ collection: 'courses', id: 'c2', payload: { enrollmentCount: 4 } }]);
    // The WITHDRAWN one still gets batch-deleted.
    expect(rec.batchCommits).toBe(1);
    expect(rec.docDeletes).toContain('enrollments/u1__c2');
  });

  // ---------------------------------------------------------------------------
  // anonymiseUser
  // ---------------------------------------------------------------------------

  it('anonymiseUser updates users/{uid} with the tombstone payload', async () => {
    const { handle, rec } = fakeFirestore({});
    const repo = new AdminUsersRepository(handle);
    await repo.anonymiseUser('u1' as UserId, '2026-06-20T00:00:00.000Z');
    expect(rec.updates).toHaveLength(1);
    const u = rec.updates[0];
    expect(u?.collection).toBe('users');
    expect(u?.id).toBe('u1');
    expect(u?.payload).toEqual({
      displayName: 'Deleted user',
      email: '',
      biography: '',
      photoUrl: FieldValue.delete(),
      updatedAt: '2026-06-20T00:00:00.000Z',
    });
  });

  // ---------------------------------------------------------------------------
  // deleteInstructorApplication
  // ---------------------------------------------------------------------------

  it('deleteInstructorApplication deletes the doc when it exists', async () => {
    const { handle, rec } = fakeFirestore({ applicationExists: true });
    const repo = new AdminUsersRepository(handle);
    await repo.deleteInstructorApplication('u1' as UserId);
    expect(rec.docDeletes).toEqual(['instructorApplications/u1']);
    expect(rec.docs).toContainEqual({ collection: 'instructorApplications', id: 'u1' });
  });

  it('deleteInstructorApplication does NOT delete when the doc is absent', async () => {
    const { handle, rec } = fakeFirestore({ applicationExists: false });
    const repo = new AdminUsersRepository(handle);
    await repo.deleteInstructorApplication('u1' as UserId);
    expect(rec.docDeletes).toEqual([]);
  });
});

import { describe, expect, it, vi } from 'vitest';

import type {
  Course,
  Enrollment,
  ISODateString,
  LessonId,
  UserId,
  CourseId,
} from '@learnwren/shared-data-models';

import {
  CannotEnrollOwnCourseException,
  CourseNotAvailableException,
  NotEnrolledException,
} from '../errors/courses.exception';
import { createFakeFirestore } from '../testing/fake-firestore';
import { EnrollmentRepository, enrollmentId } from './enrollment.repository';

const UID = 'student-1' as UserId;
const CID = 'course-1' as CourseId;
const ID = enrollmentId(UID, CID);

function course(over: Partial<Course> = {}): Course {
  return {
    id: CID,
    title: 'Course 1',
    description: 'desc',
    instructorId: 'owner-1' as UserId,
    status: 'PUBLISHED',
    createdAt: '2026-01-01T00:00:00.000Z' as ISODateString,
    updatedAt: '2026-01-01T00:00:00.000Z' as ISODateString,
    ...over,
  };
}

function repoWith(seed: Record<string, unknown>) {
  const db = createFakeFirestore(seed as Record<string, Record<string, unknown>>);
  return { repo: new EnrollmentRepository(db as never), db };
}

describe('enrollmentId', () => {
  it('builds the deterministic composite id', () => {
    expect(enrollmentId(UID, CID)).toBe('student-1__course-1');
  });
});

describe('EnrollmentRepository.enroll', () => {
  it('creates an ACTIVE enrollment with empty progress and increments the counter', async () => {
    const { repo, db } = repoWith({ [`courses/${CID}`]: course() });
    const result = await repo.enroll(UID, CID);
    expect(result.status).toBe('ACTIVE');
    expect(result.progress).toEqual([]);
    expect(result.withdrawnAt).toBeNull();
    expect(result.id).toBe(ID);
    expect(db.__store.get(`courses/${CID}`)?.['enrollmentCount']).toBe(1);
  });

  it('restores a WITHDRAWN enrollment, preserves progress, re-increments the counter', async () => {
    const withdrawn: Enrollment = {
      id: ID,
      userId: UID,
      courseId: CID,
      status: 'WITHDRAWN',
      progress: [{ lessonId: 'l1' as LessonId, completedAt: null, lastWatchedSeconds: 42 }],
      withdrawnAt: '2026-02-01T00:00:00.000Z' as ISODateString,
      createdAt: '2026-01-01T00:00:00.000Z' as ISODateString,
      updatedAt: '2026-02-01T00:00:00.000Z' as ISODateString,
    };
    const { repo, db } = repoWith({
      [`courses/${CID}`]: course({ enrollmentCount: 3 }),
      [`enrollments/${ID}`]: withdrawn,
    });
    const result = await repo.enroll(UID, CID);
    expect(result.status).toBe('ACTIVE');
    expect(result.withdrawnAt).toBeNull();
    expect(result.progress).toEqual(withdrawn.progress);
    expect(db.__store.get(`courses/${CID}`)?.['enrollmentCount']).toBe(4);
  });

  it('persists the restore update to the STORED doc (status ACTIVE, withdrawnAt null)', async () => {
    // Kills the L109 ObjectLiteral `{}` and StringLiteral `'ACTIVE'` mutants:
    // an empty update (or a non-'ACTIVE' status) would leave the stored doc
    // WITHDRAWN even though the returned object looks restored.
    const withdrawn: Enrollment = {
      id: ID,
      userId: UID,
      courseId: CID,
      status: 'WITHDRAWN',
      progress: [{ lessonId: 'l1' as LessonId, completedAt: null, lastWatchedSeconds: 42 }],
      withdrawnAt: '2026-02-01T00:00:00.000Z' as ISODateString,
      createdAt: '2026-01-01T00:00:00.000Z' as ISODateString,
      updatedAt: '2026-02-01T00:00:00.000Z' as ISODateString,
    };
    const { repo, db } = repoWith({
      [`courses/${CID}`]: course({ enrollmentCount: 3 }),
      [`enrollments/${ID}`]: withdrawn,
    });

    await repo.enroll(UID, CID);

    const stored = db.__store.get(`enrollments/${ID}`);
    expect(stored?.['status']).toBe('ACTIVE');
    expect(stored?.['withdrawnAt']).toBeNull();
    expect(stored?.['updatedAt']).toEqual(expect.any(String));
    expect(stored?.['updatedAt']).not.toBe('2026-02-01T00:00:00.000Z');
  });

  it('is idempotent when already ACTIVE — no second counter increment', async () => {
    const { repo, db } = repoWith({ [`courses/${CID}`]: course({ enrollmentCount: 5 }) });
    await repo.enroll(UID, CID);
    await repo.enroll(UID, CID);
    expect(db.__store.get(`courses/${CID}`)?.['enrollmentCount']).toBe(6);
  });

  it('throws CourseNotAvailableException when the course is missing', async () => {
    const { repo } = repoWith({});
    await expect(repo.enroll(UID, CID)).rejects.toBeInstanceOf(CourseNotAvailableException);
  });

  it('throws CourseNotAvailableException when the course is not PUBLISHED', async () => {
    const { repo } = repoWith({ [`courses/${CID}`]: course({ status: 'DRAFT' }) });
    await expect(repo.enroll(UID, CID)).rejects.toBeInstanceOf(CourseNotAvailableException);
  });

  it('rejects an owner self-enroll inside the transaction (counter NOT incremented)', async () => {
    // Defense-in-depth: the EnrollmentService.enroll advisory check can be
    // bypassed if any future caller skips the service layer. The repository
    // must reject owner self-enrollment atomically so the POPULAR sort can
    // never be inflated by the course author themselves.
    const owner = 'owner-1' as UserId;
    const { repo, db } = repoWith({
      [`courses/${CID}`]: course({ instructorId: owner, enrollmentCount: 0 }),
    });
    await expect(repo.enroll(owner, CID)).rejects.toBeInstanceOf(
      CannotEnrollOwnCourseException,
    );
    expect(db.__store.get(`courses/${CID}`)?.['enrollmentCount']).toBe(0);
    expect(db.__store.get(`enrollments/${enrollmentId(owner, CID)}`)).toBeUndefined();
  });
});

describe('EnrollmentRepository.withdraw', () => {
  it('flips ACTIVE to WITHDRAWN, stamps withdrawnAt, decrements the counter', async () => {
    const { repo, db } = repoWith({ [`courses/${CID}`]: course() });
    await repo.enroll(UID, CID);
    await repo.withdraw(UID, CID);
    const stored = db.__store.get(`enrollments/${ID}`);
    expect(stored?.['status']).toBe('WITHDRAWN');
    expect(stored?.['withdrawnAt']).toEqual(expect.any(String));
    expect(db.__store.get(`courses/${CID}`)?.['enrollmentCount']).toBe(0);
  });

  it('clamps the counter at 0 on withdraw (kills Math.max -> Math.min)', async () => {
    // ACTIVE enrollment but the course counter is already 0 (drifted). The
    // withdraw must clamp at Math.max(0, 0 - 1) = 0. The Math.min mutant would
    // write -1.
    const active: Enrollment = {
      id: ID,
      userId: UID,
      courseId: CID,
      status: 'ACTIVE',
      progress: [],
      withdrawnAt: null,
      lastAccessedLessonId: null,
      lastAccessedAt: null,
      createdAt: '2026-01-01T00:00:00.000Z' as ISODateString,
      updatedAt: '2026-01-01T00:00:00.000Z' as ISODateString,
    };
    const { repo, db } = repoWith({
      [`courses/${CID}`]: course({ enrollmentCount: 0 }),
      [`enrollments/${ID}`]: active,
    });

    await repo.withdraw(UID, CID);

    expect(db.__store.get(`courses/${CID}`)?.['enrollmentCount']).toBe(0);
  });

  it('treats a missing enrollmentCount as 0 on withdraw (kills the `?? 0` -> non-0 mutant)', async () => {
    // Course has NO enrollmentCount field. Withdraw must read it as 0 and clamp
    // to Math.max(0, 0 - 1) = 0. A `?? null`/dropped-default mutant would yield
    // NaN (null - 1) and Math.max(0, NaN) = NaN, not 0.
    const active: Enrollment = {
      id: ID,
      userId: UID,
      courseId: CID,
      status: 'ACTIVE',
      progress: [],
      withdrawnAt: null,
      lastAccessedLessonId: null,
      lastAccessedAt: null,
      createdAt: '2026-01-01T00:00:00.000Z' as ISODateString,
      updatedAt: '2026-01-01T00:00:00.000Z' as ISODateString,
    };
    const { repo, db } = repoWith({
      [`courses/${CID}`]: course(), // no enrollmentCount
      [`enrollments/${ID}`]: active,
    });

    await repo.withdraw(UID, CID);

    expect(db.__store.get(`courses/${CID}`)?.['enrollmentCount']).toBe(0);
  });

  it('throws NotEnrolledException when there is no enrollment', async () => {
    const { repo } = repoWith({ [`courses/${CID}`]: course() });
    await expect(repo.withdraw(UID, CID)).rejects.toBeInstanceOf(NotEnrolledException);
  });

  it('throws NotEnrolledException when the enrollment is already WITHDRAWN', async () => {
    const { repo } = repoWith({ [`courses/${CID}`]: course() });
    await repo.enroll(UID, CID);
    await repo.withdraw(UID, CID);
    await expect(repo.withdraw(UID, CID)).rejects.toBeInstanceOf(NotEnrolledException);
  });

  it('succeeds when the course document is missing (force-deleted while student was enrolled)', async () => {
    const now = new Date().toISOString() as ISODateString;
    const active: Enrollment = {
      id: ID,
      userId: UID,
      courseId: CID,
      status: 'ACTIVE',
      progress: [],
      withdrawnAt: null,
      lastAccessedLessonId: null,
      lastAccessedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const { repo, db } = repoWith({});
    db.__store.set(`enrollments/${ID}`, active as unknown as Record<string, unknown>);
    await expect(repo.withdraw(UID, CID)).resolves.toBeUndefined();
    expect(db.__store.get(`enrollments/${ID}`)?.['status']).toBe('WITHDRAWN');
  });
});

describe('EnrollmentRepository.markLessonComplete', () => {
  const baseEnrollment = (over: Partial<Enrollment> = {}): Enrollment => ({
    id: enrollmentId('u' as UserId, 'c' as CourseId),
    userId: 'u' as UserId,
    courseId: 'c' as CourseId,
    status: 'ACTIVE',
    progress: [],
    withdrawnAt: null,
    createdAt: 't0' as ISODateString,
    updatedAt: 't0' as ISODateString,
    ...over,
  });

  it('appends a new LessonProgress row with completedAt when none exists', async () => {
    const enrollId = enrollmentId('u' as UserId, 'c' as CourseId);
    const { repo, db } = repoWith({
      [`enrollments/${enrollId}`]: baseEnrollment(),
    });
    const result = await repo.markLessonComplete(
      'u' as UserId,
      'c' as CourseId,
      'l1' as LessonId,
      '2026-05-25T12:00:00.000Z' as ISODateString,
      async () => ['l1', 'other-lesson'] as LessonId[],
    );
    expect(result.completedAt).toBe('2026-05-25T12:00:00.000Z');
    const after = db.__store.get(`enrollments/${enrollId}`);
    expect(after?.['progress']).toEqual([
      { lessonId: 'l1', completedAt: '2026-05-25T12:00:00.000Z', lastWatchedSeconds: 0 },
    ]);
    expect(after?.['updatedAt']).toBe('2026-05-25T12:00:00.000Z');
  });

  it('updates completedAt on an existing row with completedAt: null', async () => {
    const enrollId = enrollmentId('u' as UserId, 'c' as CourseId);
    const { repo, db } = repoWith({
      [`enrollments/${enrollId}`]: baseEnrollment({
        progress: [{ lessonId: 'l1' as LessonId, completedAt: null, lastWatchedSeconds: 42 }],
      }),
    });
    const result = await repo.markLessonComplete(
      'u' as UserId,
      'c' as CourseId,
      'l1' as LessonId,
      '2026-05-25T12:00:00.000Z' as ISODateString,
      async () => ['l1', 'other-lesson'] as LessonId[],
    );
    expect(result.completedAt).toBe('2026-05-25T12:00:00.000Z');
    const after = db.__store.get(`enrollments/${enrollId}`);
    expect(after?.['progress']).toEqual([
      { lessonId: 'l1', completedAt: '2026-05-25T12:00:00.000Z', lastWatchedSeconds: 42 },
    ]);
    expect(after?.['updatedAt']).toBe('2026-05-25T12:00:00.000Z');
  });

  it('is idempotent: a second call returns the original completedAt and does not bump updatedAt', async () => {
    const enrollId = enrollmentId('u' as UserId, 'c' as CourseId);
    const { repo, db } = repoWith({
      [`enrollments/${enrollId}`]: baseEnrollment({
        progress: [
          { lessonId: 'l1' as LessonId, completedAt: '2026-05-25T08:00:00.000Z' as ISODateString, lastWatchedSeconds: 99 },
        ],
      }),
    });
    const result = await repo.markLessonComplete(
      'u' as UserId,
      'c' as CourseId,
      'l1' as LessonId,
      '2026-05-25T12:00:00.000Z' as ISODateString,
      async () => ['l1', 'other-lesson'] as LessonId[],
    );
    expect(result.completedAt).toBe('2026-05-25T08:00:00.000Z');
    const after = db.__store.get(`enrollments/${enrollId}`);
    expect(after?.['progress'][0].lastWatchedSeconds).toBe(99); // untouched
    expect(after?.['updatedAt']).toBe('t0'); // no write
  });

  it('appends a row when the enrolment has NO progress field (kills the `?? []` -> `[]`? no-op)', async () => {
    // The enrolment document predates the progress field. `[...(existing.progress ?? [])]`
    // must coalesce undefined to []. Exercises the `?? []` fallback (L147) on the
    // nullish branch that other tests never hit.
    const enrollId = enrollmentId('u' as UserId, 'c' as CourseId);
    const noProgress = baseEnrollment();
    delete (noProgress as { progress?: unknown }).progress;
    const { repo, db } = repoWith({ [`enrollments/${enrollId}`]: noProgress });

    const result = await repo.markLessonComplete(
      'u' as UserId,
      'c' as CourseId,
      'l1' as LessonId,
      '2026-05-25T12:00:00.000Z' as ISODateString,
      async () => ['l1', 'other-lesson'] as LessonId[],
    );

    expect(result.completedAt).toBe('2026-05-25T12:00:00.000Z');
    expect(db.__store.get(`enrollments/${enrollId}`)?.['progress']).toEqual([
      { lessonId: 'l1', completedAt: '2026-05-25T12:00:00.000Z', lastWatchedSeconds: 0 },
    ]);
  });

  it('throws NotEnrolledException when the enrolment doc is missing', async () => {
    const { repo } = repoWith({});
    await expect(
      repo.markLessonComplete(
        'u' as UserId,
        'c' as CourseId,
        'l1' as LessonId,
        '2026-05-25T12:00:00.000Z' as ISODateString,
        async () => ['l1', 'other-lesson'] as LessonId[],
      ),
    ).rejects.toBeInstanceOf(NotEnrolledException);
  });

  it('throws NotEnrolledException when the enrolment is WITHDRAWN', async () => {
    const enrollId = enrollmentId('u' as UserId, 'c' as CourseId);
    const { repo } = repoWith({
      [`enrollments/${enrollId}`]: baseEnrollment({
        status: 'WITHDRAWN',
        progress: [{ lessonId: 'l1' as LessonId, completedAt: null, lastWatchedSeconds: 0 }],
        withdrawnAt: 't0' as ISODateString,
      }),
    });
    await expect(
      repo.markLessonComplete(
        'u' as UserId,
        'c' as CourseId,
        'l1' as LessonId,
        '2026-05-25T12:00:00.000Z' as ISODateString,
        async () => ['l1', 'other-lesson'] as LessonId[],
      ),
    ).rejects.toBeInstanceOf(NotEnrolledException);
  });

  it('does not touch unrelated LessonProgress rows', async () => {
    const enrollId = enrollmentId('u' as UserId, 'c' as CourseId);
    const { repo, db } = repoWith({
      [`enrollments/${enrollId}`]: baseEnrollment({
        progress: [
          { lessonId: 'la' as LessonId, completedAt: '2026-05-20T00:00:00.000Z' as ISODateString, lastWatchedSeconds: 10 },
          { lessonId: 'lb' as LessonId, completedAt: null, lastWatchedSeconds: 22 },
        ],
      }),
    });
    await repo.markLessonComplete(
      'u' as UserId,
      'c' as CourseId,
      'lb' as LessonId,
      '2026-05-25T12:00:00.000Z' as ISODateString,
      async () => ['la', 'lb', 'other-lesson'] as LessonId[],
    );
    const after = db.__store.get(`enrollments/${enrollId}`);
    expect(after?.['progress']).toEqual([
      { lessonId: 'la', completedAt: '2026-05-20T00:00:00.000Z', lastWatchedSeconds: 10 },
      { lessonId: 'lb', completedAt: '2026-05-25T12:00:00.000Z', lastWatchedSeconds: 22 },
    ]);
  });

  it('stamps completedAt when the marked lesson is the last incomplete one', async () => {
    const enrollId = enrollmentId('u' as UserId, 'c' as CourseId);
    const { repo, db } = repoWith({
      [`enrollments/${enrollId}`]: baseEnrollment({
        progress: [
          { lessonId: 'l1' as LessonId, completedAt: '2026-07-01T00:00:00.000Z' as ISODateString, lastWatchedSeconds: 10 },
          { lessonId: 'l2' as LessonId, completedAt: null, lastWatchedSeconds: 5 },
        ],
      }),
    });
    await repo.markLessonComplete(
      'u' as UserId,
      'c' as CourseId,
      'l2' as LessonId,
      '2026-07-09T00:00:00.000Z' as ISODateString,
      async () => ['l1', 'l2'] as LessonId[],
    );
    expect(db.__store.get(`enrollments/${enrollId}`)?.['completedAt']).toBe(
      '2026-07-09T00:00:00.000Z',
    );
  });

  it('does not stamp when other lessons remain incomplete', async () => {
    const enrollId = enrollmentId('u' as UserId, 'c' as CourseId);
    const { repo, db } = repoWith({ [`enrollments/${enrollId}`]: baseEnrollment() });
    await repo.markLessonComplete(
      'u' as UserId,
      'c' as CourseId,
      'l1' as LessonId,
      '2026-07-09T00:00:00.000Z' as ISODateString,
      async () => ['l1', 'l2'] as LessonId[],
    );
    expect(db.__store.get(`enrollments/${enrollId}`)?.['completedAt']).toBeUndefined();
  });

  it('does not stamp when another lesson has an explicit null completedAt row', async () => {
    // Distinct from the previous test: l2 is already PRESENT in `progress` with
    // completedAt: null (not merely absent), so it exercises the
    // `p.completedAt != null` check in the doneByLesson map rather than a
    // missing-key lookup.
    const enrollId = enrollmentId('u' as UserId, 'c' as CourseId);
    const { repo, db } = repoWith({
      [`enrollments/${enrollId}`]: baseEnrollment({
        progress: [{ lessonId: 'l2' as LessonId, completedAt: null, lastWatchedSeconds: 0 }],
      }),
    });
    await repo.markLessonComplete(
      'u' as UserId,
      'c' as CourseId,
      'l1' as LessonId,
      '2026-07-09T00:00:00.000Z' as ISODateString,
      async () => ['l1', 'l2'] as LessonId[],
    );
    expect(db.__store.get(`enrollments/${enrollId}`)?.['completedAt']).toBeUndefined();
  });

  it('does not overwrite an existing stamp when a later-added lesson completes the course again', async () => {
    // A course completed earlier, then the instructor adds a new lesson (l3).
    // Completing l3 makes "every lesson complete" true again, but the original
    // stamp must be preserved verbatim — no restamping (decision 1).
    const enrollId = enrollmentId('u' as UserId, 'c' as CourseId);
    const { repo, db } = repoWith({
      [`enrollments/${enrollId}`]: baseEnrollment({
        completedAt: '2026-06-01T00:00:00.000Z' as ISODateString,
        progress: [
          { lessonId: 'l1' as LessonId, completedAt: '2026-06-01T00:00:00.000Z' as ISODateString, lastWatchedSeconds: 10 },
        ],
      }),
    });
    await repo.markLessonComplete(
      'u' as UserId,
      'c' as CourseId,
      'l3' as LessonId,
      '2026-07-09T00:00:00.000Z' as ISODateString,
      async () => ['l1', 'l3'] as LessonId[],
    );
    expect(db.__store.get(`enrollments/${enrollId}`)?.['completedAt']).toBe(
      '2026-06-01T00:00:00.000Z',
    );
  });

  it('does not restamp an already-stamped enrollment (idempotent re-mark)', async () => {
    const enrollId = enrollmentId('u' as UserId, 'c' as CourseId);
    const { repo, db } = repoWith({
      [`enrollments/${enrollId}`]: baseEnrollment({
        completedAt: '2026-07-01T00:00:00.000Z' as ISODateString,
        progress: [
          { lessonId: 'l1' as LessonId, completedAt: '2026-07-01T00:00:00.000Z' as ISODateString, lastWatchedSeconds: 10 },
        ],
      }),
    });
    await repo.markLessonComplete(
      'u' as UserId,
      'c' as CourseId,
      'l1' as LessonId,
      '2026-07-09T00:00:00.000Z' as ISODateString,
      async () => ['l1'] as LessonId[],
    );
    expect(db.__store.get(`enrollments/${enrollId}`)?.['completedAt']).toBe(
      '2026-07-01T00:00:00.000Z',
    );
  });

  it('does not stamp when the lesson list is empty', async () => {
    const enrollId = enrollmentId('u' as UserId, 'c' as CourseId);
    const { repo, db } = repoWith({
      [`enrollments/${enrollId}`]: baseEnrollment({ progress: [] }),
    });
    await repo.markLessonComplete(
      'u' as UserId,
      'c' as CourseId,
      'l1' as LessonId,
      '2026-07-09T00:00:00.000Z' as ISODateString,
      async () => [] as LessonId[],
    );
    expect(db.__store.get(`enrollments/${enrollId}`)?.['completedAt']).toBeUndefined();
  });

  it('does not stamp when the in-txn lesson list contains a lesson added concurrently', async () => {
    // The rollup denominator is read INSIDE the transaction: a lesson (l3)
    // created between the caller's outline read and this transaction must
    // suppress the stamp, not be silently missed.
    const enrollId = enrollmentId('u' as UserId, 'c' as CourseId);
    const { repo, db } = repoWith({
      [`enrollments/${enrollId}`]: baseEnrollment({
        progress: [
          { lessonId: 'l1' as LessonId, completedAt: '2026-07-01T00:00:00.000Z' as ISODateString, lastWatchedSeconds: 10 },
          { lessonId: 'l2' as LessonId, completedAt: null, lastWatchedSeconds: 5 },
        ],
      }),
    });
    await repo.markLessonComplete(
      'u' as UserId,
      'c' as CourseId,
      'l2' as LessonId,
      '2026-07-09T00:00:00.000Z' as ISODateString,
      async () => ['l1', 'l2', 'l3'] as LessonId[],
    );
    const after = db.__store.get(`enrollments/${enrollId}`);
    expect(after?.['completedAt']).toBeUndefined();
    // The lesson-progress write itself still lands.
    expect(after?.['progress']).toContainEqual({
      lessonId: 'l2',
      completedAt: '2026-07-09T00:00:00.000Z',
      lastWatchedSeconds: 5,
    });
  });

  it('does not call the lesson lister when the enrollment is already stamped', async () => {
    // Already-stamped enrollments never restamp, so the denominator read is
    // skipped — no wasted module/lesson reads inside the transaction.
    const enrollId = enrollmentId('u' as UserId, 'c' as CourseId);
    const { repo } = repoWith({
      [`enrollments/${enrollId}`]: baseEnrollment({
        completedAt: '2026-06-01T00:00:00.000Z' as ISODateString,
        progress: [
          { lessonId: 'l1' as LessonId, completedAt: '2026-06-01T00:00:00.000Z' as ISODateString, lastWatchedSeconds: 10 },
        ],
      }),
    });
    const lister = vi.fn(async () => ['l1', 'l3'] as LessonId[]);
    await repo.markLessonComplete(
      'u' as UserId,
      'c' as CourseId,
      'l3' as LessonId,
      '2026-07-09T00:00:00.000Z' as ISODateString,
      lister,
    );
    expect(lister).not.toHaveBeenCalled();
  });
});

describe('EnrollmentRepository.isEnrolled / getEnrollment', () => {
  it('isEnrolled is true only for an ACTIVE enrollment', async () => {
    const { repo } = repoWith({ [`courses/${CID}`]: course() });
    expect(await repo.isEnrolled(UID, CID)).toBe(false);
    await repo.enroll(UID, CID);
    expect(await repo.isEnrolled(UID, CID)).toBe(true);
    await repo.withdraw(UID, CID);
    expect(await repo.isEnrolled(UID, CID)).toBe(false);
  });

  it('getEnrollment returns the document as-is, or null when absent', async () => {
    const { repo } = repoWith({ [`courses/${CID}`]: course() });
    expect(await repo.getEnrollment(UID, CID)).toBeNull();
    await repo.enroll(UID, CID);
    expect((await repo.getEnrollment(UID, CID))?.status).toBe('ACTIVE');
  });

  it('getEnrollment returns a WITHDRAWN record as-is (not null)', async () => {
    const { repo } = repoWith({ [`courses/${CID}`]: course() });
    await repo.enroll(UID, CID);
    await repo.withdraw(UID, CID);
    const result = await repo.getEnrollment(UID, CID);
    expect(result).not.toBeNull();
    expect(result?.status).toBe('WITHDRAWN');
  });
});

describe('EnrollmentRepository.touchLastAccessed', () => {
  const NOW = '2026-05-25T12:00:00.000Z' as ISODateString;
  const LID = 'lesson-x' as LessonId;

  function active(over: Partial<Enrollment> = {}): Enrollment {
    return {
      id: ID,
      userId: UID,
      courseId: CID,
      status: 'ACTIVE',
      progress: [],
      withdrawnAt: null,
      lastAccessedLessonId: null,
      lastAccessedAt: null,
      createdAt: '2026-05-01T00:00:00.000Z' as ISODateString,
      updatedAt: '2026-05-01T00:00:00.000Z' as ISODateString,
      ...over,
    };
  }

  it('sets lastAccessedLessonId and lastAccessedAt on an ACTIVE enrolment', async () => {
    const { repo, db } = repoWith({ [`enrollments/${ID}`]: active() });
    await repo.touchLastAccessed(UID, CID, LID, NOW);
    const stored = db.__store.get(`enrollments/${ID}`) as Enrollment;
    expect(stored.lastAccessedLessonId).toBe(LID);
    expect(stored.lastAccessedAt).toBe(NOW);
    expect(stored.updatedAt).toBe(NOW);
  });

  it('overwrites a prior lastAccessedLessonId on each call', async () => {
    const seeded = active({ lastAccessedLessonId: 'old' as LessonId, lastAccessedAt: '2026-05-20T00:00:00.000Z' as ISODateString });
    const { repo, db } = repoWith({ [`enrollments/${ID}`]: seeded });
    await repo.touchLastAccessed(UID, CID, LID, NOW);
    const stored = db.__store.get(`enrollments/${ID}`) as Enrollment;
    expect(stored.lastAccessedLessonId).toBe(LID);
  });

  it('throws NotEnrolledException when the enrolment is WITHDRAWN', async () => {
    const { repo } = repoWith({ [`enrollments/${ID}`]: active({ status: 'WITHDRAWN', withdrawnAt: NOW }) });
    await expect(repo.touchLastAccessed(UID, CID, LID, NOW)).rejects.toBeInstanceOf(NotEnrolledException);
  });

  it('throws NotEnrolledException when no enrolment exists', async () => {
    const { repo } = repoWith({});
    await expect(repo.touchLastAccessed(UID, CID, LID, NOW)).rejects.toBeInstanceOf(NotEnrolledException);
  });
});

describe('EnrollmentRepository.setLastWatchedSeconds', () => {
  const LID = 'lesson-x' as LessonId;

  function activeWith(progress: Enrollment['progress'] = []): Enrollment {
    return {
      id: ID,
      userId: UID,
      courseId: CID,
      status: 'ACTIVE',
      progress,
      withdrawnAt: null,
      lastAccessedLessonId: null,
      lastAccessedAt: null,
      createdAt: '2026-05-01T00:00:00.000Z' as ISODateString,
      updatedAt: '2026-05-01T00:00:00.000Z' as ISODateString,
    };
  }

  it('inserts a new LessonProgress row when none exists for the lesson', async () => {
    const { repo, db } = repoWith({ [`enrollments/${ID}`]: activeWith() });
    const out = await repo.setLastWatchedSeconds(UID, CID, LID, 42);
    expect(out).toEqual({ lastWatchedSeconds: 42 });
    const stored = db.__store.get(`enrollments/${ID}`) as Enrollment;
    expect(stored.progress).toEqual([{ lessonId: LID, completedAt: null, lastWatchedSeconds: 42 }]);
  });

  it('updates an existing row when the inbound value is larger', async () => {
    const seed = activeWith([{ lessonId: LID, completedAt: null, lastWatchedSeconds: 10 }]);
    const { repo, db } = repoWith({ [`enrollments/${ID}`]: seed });
    const out = await repo.setLastWatchedSeconds(UID, CID, LID, 25);
    expect(out).toEqual({ lastWatchedSeconds: 25 });
    const stored = db.__store.get(`enrollments/${ID}`) as Enrollment;
    expect(stored.progress[0].lastWatchedSeconds).toBe(25);
  });

  it('preserves completedAt when bumping lastWatchedSeconds', async () => {
    const seed = activeWith([{ lessonId: LID, completedAt: '2026-05-20T00:00:00.000Z' as ISODateString, lastWatchedSeconds: 0 }]);
    const { repo, db } = repoWith({ [`enrollments/${ID}`]: seed });
    await repo.setLastWatchedSeconds(UID, CID, LID, 60);
    const stored = db.__store.get(`enrollments/${ID}`) as Enrollment;
    const row = stored.progress[0];
    expect(row.completedAt).toBe('2026-05-20T00:00:00.000Z');
    expect(row.lastWatchedSeconds).toBe(60);
  });

  it('is a no-op (returns stored value) when inbound equals stored', async () => {
    const seed = activeWith([{ lessonId: LID, completedAt: null, lastWatchedSeconds: 30 }]);
    const stamp = seed.updatedAt;
    const { repo, db } = repoWith({ [`enrollments/${ID}`]: seed });
    const out = await repo.setLastWatchedSeconds(UID, CID, LID, 30);
    expect(out).toEqual({ lastWatchedSeconds: 30 });
    expect((db.__store.get(`enrollments/${ID}`) as Enrollment).updatedAt).toBe(stamp);
  });

  it('is a no-op (returns stored value) when inbound is smaller (monotonic regression)', async () => {
    const seed = activeWith([{ lessonId: LID, completedAt: null, lastWatchedSeconds: 100 }]);
    const stamp = seed.updatedAt;
    const { repo, db } = repoWith({ [`enrollments/${ID}`]: seed });
    const out = await repo.setLastWatchedSeconds(UID, CID, LID, 50);
    expect(out).toEqual({ lastWatchedSeconds: 100 });
    expect((db.__store.get(`enrollments/${ID}`) as Enrollment).updatedAt).toBe(stamp);
  });

  it('updates ONLY the matching lesson row and preserves the others', async () => {
    // Two pre-existing rows. findIndex must locate LID specifically (kills the
    // `p.lessonId === lessonId` predicate -> true/false mutants: a constant-true
    // would match the first row 'other'; a constant-false would never match and
    // append a duplicate). The non-matching row must be left untouched.
    const seed = activeWith([
      { lessonId: 'other' as LessonId, completedAt: null, lastWatchedSeconds: 7 },
      { lessonId: LID, completedAt: null, lastWatchedSeconds: 10 },
    ]);
    const { repo, db } = repoWith({ [`enrollments/${ID}`]: seed });

    const out = await repo.setLastWatchedSeconds(UID, CID, LID, 25);

    expect(out).toEqual({ lastWatchedSeconds: 25 });
    const stored = db.__store.get(`enrollments/${ID}`) as Enrollment;
    expect(stored.progress).toEqual([
      { lessonId: 'other', completedAt: null, lastWatchedSeconds: 7 },
      { lessonId: LID, completedAt: null, lastWatchedSeconds: 25 },
    ]);
  });

  it('appends to existing rows rather than replacing them (kills the `?? []` -> drop)', async () => {
    // A different lesson already has progress; writing LID must APPEND, keeping
    // the prior row. The `idx >= 0 ? ... : undefined` else-branch (no match =>
    // push) is exercised, and the spread of existing.progress must be preserved.
    const seed = activeWith([
      { lessonId: 'kept' as LessonId, completedAt: null, lastWatchedSeconds: 5 },
    ]);
    const { repo, db } = repoWith({ [`enrollments/${ID}`]: seed });

    await repo.setLastWatchedSeconds(UID, CID, LID, 42);

    const stored = db.__store.get(`enrollments/${ID}`) as Enrollment;
    expect(stored.progress).toEqual([
      { lessonId: 'kept', completedAt: null, lastWatchedSeconds: 5 },
      { lessonId: LID, completedAt: null, lastWatchedSeconds: 42 },
    ]);
  });

  it('inserts a row when the enrolment has NO progress field (kills the `?? []` fallback)', async () => {
    const seed = activeWith();
    delete (seed as { progress?: unknown }).progress;
    const { repo, db } = repoWith({ [`enrollments/${ID}`]: seed });

    const out = await repo.setLastWatchedSeconds(UID, CID, LID, 33);

    expect(out).toEqual({ lastWatchedSeconds: 33 });
    expect((db.__store.get(`enrollments/${ID}`) as Enrollment).progress).toEqual([
      { lessonId: LID, completedAt: null, lastWatchedSeconds: 33 },
    ]);
  });

  it('throws NotEnrolledException when WITHDRAWN', async () => {
    const seed = activeWith();
    seed.status = 'WITHDRAWN';
    seed.withdrawnAt = '2026-05-20T00:00:00.000Z' as ISODateString;
    const { repo } = repoWith({ [`enrollments/${ID}`]: seed });
    await expect(repo.setLastWatchedSeconds(UID, CID, LID, 10)).rejects.toBeInstanceOf(NotEnrolledException);
  });

  it('throws NotEnrolledException when no enrolment exists', async () => {
    const { repo } = repoWith({});
    await expect(repo.setLastWatchedSeconds(UID, CID, LID, 10)).rejects.toBeInstanceOf(NotEnrolledException);
  });
});

describe('EnrollmentRepository.listActiveByCourse', () => {
  const NOW = '2026-01-01T00:00:00.000Z' as ISODateString;

  function enrollment(userId: string, courseId: string, status: 'ACTIVE' | 'WITHDRAWN'): Enrollment {
    const uid = userId as UserId;
    const cid = courseId as CourseId;
    const id = enrollmentId(uid, cid);
    return {
      id,
      userId: uid,
      courseId: cid,
      status,
      progress: [],
      withdrawnAt: status === 'WITHDRAWN' ? NOW : null,
      lastAccessedLessonId: null,
      lastAccessedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    };
  }

  it('returns only ACTIVE enrollments scoped to the requested course', async () => {
    const e1 = enrollment('u1', 'course-1', 'ACTIVE');
    const e2 = enrollment('u2', 'course-1', 'ACTIVE');
    const e3 = enrollment('u3', 'course-1', 'WITHDRAWN');
    const e4 = enrollment('u4', 'course-2', 'ACTIVE');
    const { repo } = repoWith({
      [`enrollments/${e1.id}`]: e1,
      [`enrollments/${e2.id}`]: e2,
      [`enrollments/${e3.id}`]: e3,
      [`enrollments/${e4.id}`]: e4,
    });

    const rows = await repo.listActiveByCourse('course-1' as CourseId);

    expect(rows.map((r) => r.userId).sort()).toEqual(['u1', 'u2']);
    expect(rows.every((r) => r.status === 'ACTIVE')).toBe(true);
  });

  it('scopes strictly by courseId (kills the courseId field-name empty-string mutant)', async () => {
    // A different course with an ACTIVE enrollment must NOT appear. If the
    // `.where('courseId', ...)` field name is blanked, the filter matches every
    // doc and the foreign enrollment leaks in.
    const mine = enrollment('u1', 'course-1', 'ACTIVE');
    const foreign = enrollment('u9', 'course-2', 'ACTIVE');
    const { repo } = repoWith({
      [`enrollments/${mine.id}`]: mine,
      [`enrollments/${foreign.id}`]: foreign,
    });

    const rows = await repo.listActiveByCourse('course-1' as CourseId);

    expect(rows.map((r) => r.userId)).toEqual(['u1']);
  });

  it('excludes WITHDRAWN in the SAME course (kills the status field-name empty-string mutant)', async () => {
    // Same course, one ACTIVE and one WITHDRAWN. Blanking the `status` field
    // name (or the 'ACTIVE' value) would let the WITHDRAWN row through.
    const a = enrollment('u1', 'course-1', 'ACTIVE');
    const w = enrollment('u2', 'course-1', 'WITHDRAWN');
    const { repo } = repoWith({
      [`enrollments/${a.id}`]: a,
      [`enrollments/${w.id}`]: w,
    });

    const rows = await repo.listActiveByCourse('course-1' as CourseId);

    expect(rows.map((r) => r.userId)).toEqual(['u1']);
  });
});

describe('EnrollmentRepository.deleteAllForCourse', () => {
  const NOW = '2026-01-01T00:00:00.000Z' as ISODateString;

  function enrollment(userId: string, courseId: string, status: 'ACTIVE' | 'WITHDRAWN'): Enrollment {
    const uid = userId as UserId;
    const cid = courseId as CourseId;
    const id = enrollmentId(uid, cid);
    return {
      id,
      userId: uid,
      courseId: cid,
      status,
      progress: [],
      withdrawnAt: status === 'WITHDRAWN' ? NOW : null,
      lastAccessedLessonId: null,
      lastAccessedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    };
  }

  it('deletes all enrollments (ACTIVE and WITHDRAWN) for the given course', async () => {
    const e1 = enrollment('u1', 'course-1', 'ACTIVE');
    const e2 = enrollment('u2', 'course-1', 'WITHDRAWN');
    const e3 = enrollment('u3', 'course-2', 'ACTIVE'); // different course — must survive
    const { repo, db } = repoWith({
      [`enrollments/${e1.id}`]: e1,
      [`enrollments/${e2.id}`]: e2,
      [`enrollments/${e3.id}`]: e3,
    });

    await repo.deleteAllForCourse('course-1' as CourseId);

    expect(db.__store.has(`enrollments/${e1.id}`)).toBe(false);
    expect(db.__store.has(`enrollments/${e2.id}`)).toBe(false);
    // Different course must NOT be deleted.
    expect(db.__store.has(`enrollments/${e3.id}`)).toBe(true);
  });

  it('is a no-op when no enrollments exist for the course', async () => {
    const { repo } = repoWith({});
    await expect(repo.deleteAllForCourse('course-none' as CourseId)).resolves.toBeUndefined();
  });

  it('scopes deletion strictly by courseId (kills the courseId field-name mutant)', async () => {
    // Blanking the `.where('courseId', ...)` field name would match (and delete)
    // every enrollment in the collection, including a foreign course's.
    const mine = enrollment('u1', 'course-1', 'ACTIVE');
    const foreign = enrollment('u2', 'course-2', 'ACTIVE');
    const { repo, db } = repoWith({
      [`enrollments/${mine.id}`]: mine,
      [`enrollments/${foreign.id}`]: foreign,
    });

    await repo.deleteAllForCourse('course-1' as CourseId);

    expect(db.__store.has(`enrollments/${mine.id}`)).toBe(false);
    expect(db.__store.has(`enrollments/${foreign.id}`)).toBe(true);
  });

  it('commits exactly one batch for exactly BATCH_SIZE (500) docs (kills `i < len` -> `i <= len`)', async () => {
    // With 500 docs the `<` loop runs once (i=0). The `<=` mutant runs a second,
    // empty iteration (i=500 <= 500), committing a redundant empty batch.
    const seed: Record<string, unknown> = {};
    for (let i = 0; i < 500; i++) {
      const e = enrollment(`user-${i}`, 'exact-course', 'ACTIVE');
      seed[`enrollments/${e.id}`] = e;
    }
    const base = createFakeFirestore(seed as Record<string, Record<string, unknown>>);
    let batchCount = 0;
    const counting = { ...base, batch: () => { batchCount++; return base.batch(); } };
    const repo = new EnrollmentRepository(counting as never);

    await repo.deleteAllForCourse('exact-course' as CourseId);

    expect(batchCount).toBe(1);
    expect([...base.__store.keys()].filter((k) => k.startsWith('enrollments/'))).toHaveLength(0);
  });

  it('slices each chunk so no doc is processed twice (kills `docs.slice(...)` -> `docs`)', async () => {
    // 501 docs => two chunks of 500 + 1 = 501 total deletes. Dropping the slice
    // makes every batch process ALL 501 docs => 1002 delete calls.
    const seed: Record<string, unknown> = {};
    for (let i = 0; i < 501; i++) {
      const e = enrollment(`user-${i}`, 'slice-course', 'ACTIVE');
      seed[`enrollments/${e.id}`] = e;
    }
    const base = createFakeFirestore(seed as Record<string, Record<string, unknown>>);
    let deleteCalls = 0;
    const counting = {
      ...base,
      batch: () => {
        const b = base.batch();
        return { ...b, delete: (ref: unknown) => { deleteCalls++; return b.delete(ref as never); } };
      },
    };
    const repo = new EnrollmentRepository(counting as never);

    await repo.deleteAllForCourse('slice-course' as CourseId);

    expect(deleteCalls).toBe(501);
  });

  it('handles >500 docs across two batches (chunking boundary)', async () => {
    // Seed 501 enrollments for the same course. Each needs a unique userId.
    const seed: Record<string, unknown> = {};
    for (let i = 0; i < 501; i++) {
      const uid = `user-${i}` as UserId;
      const cid = 'big-course' as CourseId;
      const id = enrollmentId(uid, cid);
      const e: Enrollment = {
        id,
        userId: uid,
        courseId: cid,
        status: 'ACTIVE',
        progress: [],
        withdrawnAt: null,
        lastAccessedLessonId: null,
        lastAccessedAt: null,
        createdAt: NOW,
        updatedAt: NOW,
      };
      seed[`enrollments/${id}`] = e;
    }
    const { repo, db } = repoWith(seed as Record<string, Record<string, unknown>>);

    await repo.deleteAllForCourse('big-course' as CourseId);

    // All 501 enrollment docs must be gone.
    const surviving = [...db.__store.keys()].filter((k) => k.startsWith('enrollments/'));
    expect(surviving).toHaveLength(0);
  });
});

describe('EnrollmentRepository.enroll (Slice C fields)', () => {
  it('seeds lastAccessedLessonId=null and lastAccessedAt=null on first enrol', async () => {
    const { repo } = repoWith({ [`courses/${CID}`]: course() });
    const result = await repo.enroll(UID, CID);
    expect(result.lastAccessedLessonId).toBeNull();
    expect(result.lastAccessedAt).toBeNull();
  });

  it('preserves lastAccessedLessonId and lastAccessedAt across WITHDRAWN -> ACTIVE re-enrol', async () => {
    const withdrawn: Enrollment = {
      id: ID,
      userId: UID,
      courseId: CID,
      status: 'WITHDRAWN',
      progress: [{ lessonId: 'l1' as LessonId, completedAt: null, lastWatchedSeconds: 42 }],
      withdrawnAt: '2026-02-01T00:00:00.000Z' as ISODateString,
      lastAccessedLessonId: 'l1' as LessonId,
      lastAccessedAt: '2026-02-01T00:00:00.000Z' as ISODateString,
      createdAt: '2026-01-01T00:00:00.000Z' as ISODateString,
      updatedAt: '2026-02-01T00:00:00.000Z' as ISODateString,
    };
    const { repo } = repoWith({
      [`courses/${CID}`]: course({ enrollmentCount: 0 }),
      [`enrollments/${ID}`]: withdrawn,
    });
    const result = await repo.enroll(UID, CID);
    expect(result.status).toBe('ACTIVE');
    expect(result.lastAccessedLessonId).toBe('l1');
    expect(result.lastAccessedAt).toBe('2026-02-01T00:00:00.000Z');
    expect(result.progress[0].lastWatchedSeconds).toBe(42);
  });
});

describe('EnrollmentRepository.stampCompleted', () => {
  function activeEnrollment(over: Partial<Enrollment> = {}): Enrollment {
    return {
      id: ID,
      userId: UID,
      courseId: CID,
      status: 'ACTIVE',
      progress: [],
      withdrawnAt: null,
      lastAccessedLessonId: null,
      lastAccessedAt: null,
      createdAt: '2026-01-01T00:00:00.000Z' as ISODateString,
      updatedAt: '2026-01-01T00:00:00.000Z' as ISODateString,
      ...over,
    };
  }

  const fullProgress = [
    { lessonId: 'l1' as LessonId, completedAt: '2026-07-01T00:00:00.000Z' as ISODateString, lastWatchedSeconds: 10 },
  ];

  it('stamps an unstamped enrollment whose progress covers every lesson', async () => {
    const { repo, db } = repoWith({
      [`enrollments/${ID}`]: activeEnrollment({ progress: fullProgress }),
    });
    await repo.stampCompleted(UID, CID, '2026-07-09T00:00:00.000Z' as ISODateString, async () => [
      'l1' as LessonId,
    ]);
    expect(db.__store.get(`enrollments/${ID}`)?.['completedAt']).toBe('2026-07-09T00:00:00.000Z');
  });

  it('leaves an existing stamp untouched', async () => {
    const { repo, db } = repoWith({
      [`enrollments/${ID}`]: {
        ...activeEnrollment({ progress: fullProgress }),
        completedAt: '2026-07-01T00:00:00.000Z',
      },
    });
    await repo.stampCompleted(UID, CID, '2026-07-09T00:00:00.000Z' as ISODateString, async () => [
      'l1' as LessonId,
    ]);
    expect(db.__store.get(`enrollments/${ID}`)?.['completedAt']).toBe('2026-07-01T00:00:00.000Z');
  });

  it('does not stamp a WITHDRAWN enrollment', async () => {
    // The ACTIVE check must live inside the transaction: a withdrawal that
    // lands between the caller's read and this transaction wins.
    const { repo, db } = repoWith({
      [`enrollments/${ID}`]: activeEnrollment({
        status: 'WITHDRAWN',
        progress: fullProgress,
        withdrawnAt: '2026-07-08T00:00:00.000Z' as ISODateString,
      }),
    });
    await repo.stampCompleted(UID, CID, '2026-07-09T00:00:00.000Z' as ISODateString, async () => [
      'l1' as LessonId,
    ]);
    expect(db.__store.get(`enrollments/${ID}`)?.['completedAt']).toBeUndefined();
  });

  it('does not stamp when the in-txn lesson list reveals an incomplete lesson', async () => {
    // A lesson added between the caller's outline read and this transaction
    // must suppress the backfill stamp.
    const { repo, db } = repoWith({
      [`enrollments/${ID}`]: activeEnrollment({ progress: fullProgress }),
    });
    await repo.stampCompleted(UID, CID, '2026-07-09T00:00:00.000Z' as ISODateString, async () =>
      ['l1', 'l2'] as LessonId[],
    );
    expect(db.__store.get(`enrollments/${ID}`)?.['completedAt']).toBeUndefined();
  });

  it('does not stamp when the lesson list is empty', async () => {
    const { repo, db } = repoWith({
      [`enrollments/${ID}`]: activeEnrollment({ progress: [] }),
    });
    await repo.stampCompleted(
      UID,
      CID,
      '2026-07-09T00:00:00.000Z' as ISODateString,
      async () => [] as LessonId[],
    );
    expect(db.__store.get(`enrollments/${ID}`)?.['completedAt']).toBeUndefined();
  });
});

describe('EnrollmentRepository.listActiveByUser', () => {
  function activeEnrollment(over: Partial<Enrollment> = {}): Enrollment {
    return {
      id: ID,
      userId: UID,
      courseId: CID,
      status: 'ACTIVE',
      progress: [],
      withdrawnAt: null,
      lastAccessedLessonId: null,
      lastAccessedAt: null,
      createdAt: '2026-01-01T00:00:00.000Z' as ISODateString,
      updatedAt: '2026-01-01T00:00:00.000Z' as ISODateString,
      ...over,
    };
  }

  it("returns only the caller's ACTIVE enrollments", async () => {
    const other = { ...activeEnrollment(), id: 'u2__c1', userId: 'u2' as UserId };
    const withdrawn = { ...activeEnrollment(), id: `${UID}__c2`, courseId: 'c2' as CourseId, status: 'WITHDRAWN' as const, withdrawnAt: '2026-01-01T00:00:00.000Z' as ISODateString };
    const { repo } = repoWith({
      [`enrollments/${ID}`]: activeEnrollment(),
      ['enrollments/u2__c1']: other,
      [`enrollments/${UID}__c2`]: withdrawn,
    });
    const rows = await repo.listActiveByUser(UID);
    expect(rows.map((r) => r.id)).toEqual([ID]);
  });
});

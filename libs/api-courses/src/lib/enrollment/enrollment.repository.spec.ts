import { describe, expect, it } from 'vitest';

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
    );
    expect(result.completedAt).toBe('2026-05-25T08:00:00.000Z');
    const after = db.__store.get(`enrollments/${enrollId}`);
    expect(after?.['progress'][0].lastWatchedSeconds).toBe(99); // untouched
    expect(after?.['updatedAt']).toBe('t0'); // no write
  });

  it('throws NotEnrolledException when the enrolment doc is missing', async () => {
    const { repo } = repoWith({});
    await expect(
      repo.markLessonComplete(
        'u' as UserId,
        'c' as CourseId,
        'l1' as LessonId,
        '2026-05-25T12:00:00.000Z' as ISODateString,
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
    );
    const after = db.__store.get(`enrollments/${enrollId}`);
    expect(after?.['progress']).toEqual([
      { lessonId: 'la', completedAt: '2026-05-20T00:00:00.000Z', lastWatchedSeconds: 10 },
      { lessonId: 'lb', completedAt: '2026-05-25T12:00:00.000Z', lastWatchedSeconds: 22 },
    ]);
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

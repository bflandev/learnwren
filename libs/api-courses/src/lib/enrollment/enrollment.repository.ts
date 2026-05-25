import { Inject, Injectable } from '@nestjs/common';

import { FIRESTORE, type FirestoreHandle } from '@learnwren/api-firebase';
import type {
  Course,
  CourseId,
  Enrollment,
  EnrollmentId,
  ISODateString,
  LessonId,
  UserId,
} from '@learnwren/shared-data-models';

import {
  CannotEnrollOwnCourseException,
  CourseNotAvailableException,
  NotEnrolledException,
} from '../errors/courses.exception';

const ENROLLMENTS = 'enrollments';
const COURSES = 'courses';

function nowIso(): ISODateString {
  return new Date().toISOString() as ISODateString;
}

/**
 * Validates that a course exists, is PUBLISHED, and the caller is not its
 * instructor. Returns the typed Course on success; throws on any rejection.
 *
 * Must be invoked from inside a Firestore transaction callback. The
 * owner-self-enroll check is duplicated here (the service layer has an
 * advisory pre-check) because that pre-check can be raced — or skipped by
 * any future caller that bypasses the service — which would otherwise let
 * an instructor inflate their own POPULAR rank by enrolling in their own
 * course.
 */
function assertEnrollable(
  courseSnap: { exists: boolean; data: () => unknown },
  userId: UserId,
): Course {
  const course = courseSnap.exists ? (courseSnap.data() as Course) : null;
  if (!course || course.status !== 'PUBLISHED') {
    throw new CourseNotAvailableException();
  }
  if (course.instructorId === userId) {
    throw new CannotEnrollOwnCourseException();
  }
  return course;
}

/** Deterministic composite document id for an enrollment. */
export function enrollmentId(userId: UserId, courseId: CourseId): EnrollmentId {
  return `${userId}__${courseId}` as EnrollmentId;
}

@Injectable()
export class EnrollmentRepository {
  constructor(@Inject(FIRESTORE) private readonly db: FirestoreHandle) {}

  async getEnrollment(userId: UserId, courseId: CourseId): Promise<Enrollment | null> {
    const snap = await this.db
      .collection(ENROLLMENTS)
      .doc(enrollmentId(userId, courseId))
      .get();
    return snap.exists ? (snap.data() as Enrollment) : null;
  }

  /** True only when an ACTIVE enrollment exists. Consumed by the access guards. */
  async isEnrolled(userId: UserId, courseId: CourseId): Promise<boolean> {
    const enrollment = await this.getEnrollment(userId, courseId);
    return enrollment?.status === 'ACTIVE';
  }

  async enroll(userId: UserId, courseId: CourseId): Promise<Enrollment> {
    const enrollmentRef = this.db.collection(ENROLLMENTS).doc(enrollmentId(userId, courseId));
    const courseRef = this.db.collection(COURSES).doc(courseId);

    return this.db.runTransaction(async (t) => {
      // MUST be called from inside runTransaction — the owner-self-enroll
      // check it performs is otherwise raceable (see assertEnrollable).
      const course = assertEnrollable(await t.get(courseRef), userId);

      const enrollSnap = await t.get(enrollmentRef);
      const existing = enrollSnap.exists ? (enrollSnap.data() as Enrollment) : null;

      if (existing?.status === 'ACTIVE') {
        return existing; // idempotent — no counter change
      }

      const now = nowIso();
      const nextCount = (course.enrollmentCount ?? 0) + 1;

      if (existing) {
        // WITHDRAWN -> ACTIVE; progress is left untouched.
        const restored: Enrollment = {
          ...existing,
          status: 'ACTIVE',
          withdrawnAt: null,
          updatedAt: now,
        };
        t.update(enrollmentRef, { status: 'ACTIVE', withdrawnAt: null, updatedAt: now });
        t.update(courseRef, { enrollmentCount: nextCount });
        return restored;
      }

      const created: Enrollment = {
        id: enrollmentId(userId, courseId),
        userId,
        courseId,
        status: 'ACTIVE',
        progress: [],
        withdrawnAt: null,
        lastAccessedLessonId: null,
        lastAccessedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      t.set(enrollmentRef, created);
      t.update(courseRef, { enrollmentCount: nextCount });
      return created;
    });
  }

  async markLessonComplete(
    userId: UserId,
    courseId: CourseId,
    lessonId: LessonId,
    completedAtIso: ISODateString,
  ): Promise<{ completedAt: ISODateString }> {
    const enrollmentRef = this.db.collection(ENROLLMENTS).doc(enrollmentId(userId, courseId));

    return this.db.runTransaction(async (t) => {
      const snap = await t.get(enrollmentRef);
      const existing = snap.exists ? (snap.data() as Enrollment) : null;
      if (!existing || existing.status !== 'ACTIVE') {
        throw new NotEnrolledException();
      }

      const progress = [...(existing.progress ?? [])];
      const idx = progress.findIndex((p) => p.lessonId === lessonId);
      const existingRow = idx >= 0 ? progress[idx] : undefined;

      if (existingRow && existingRow.completedAt != null) {
        // Already complete — idempotent no-op. Return the prior value, write nothing.
        return { completedAt: existingRow.completedAt };
      }

      if (existingRow) {
        progress[idx] = { ...existingRow, completedAt: completedAtIso };
      } else {
        progress.push({ lessonId, completedAt: completedAtIso, lastWatchedSeconds: 0 });
      }

      t.update(enrollmentRef, { progress, updatedAt: completedAtIso });
      return { completedAt: completedAtIso };
    });
  }

  async withdraw(userId: UserId, courseId: CourseId): Promise<void> {
    const enrollmentRef = this.db.collection(ENROLLMENTS).doc(enrollmentId(userId, courseId));
    const courseRef = this.db.collection(COURSES).doc(courseId);

    await this.db.runTransaction(async (t) => {
      // All reads before any writes (Firestore transaction rule).
      const enrollSnap = await t.get(enrollmentRef);
      const courseSnap = await t.get(courseRef);

      const existing = enrollSnap.exists ? (enrollSnap.data() as Enrollment) : null;
      if (!existing || existing.status !== 'ACTIVE') {
        throw new NotEnrolledException();
      }

      const now = nowIso();
      t.update(enrollmentRef, { status: 'WITHDRAWN', withdrawnAt: now, updatedAt: now });

      // If the course was deleted while the student was enrolled, the
      // withdrawal still proceeds — there is no counter left to correct.
      if (courseSnap.exists) {
        const course = courseSnap.data() as Course;
        const nextCount = Math.max(0, (course.enrollmentCount ?? 0) - 1);
        t.update(courseRef, { enrollmentCount: nextCount });
      }
    });
  }

  async touchLastAccessed(
    userId: UserId,
    courseId: CourseId,
    lessonId: LessonId,
    nowIso: ISODateString,
  ): Promise<void> {
    const enrollmentRef = this.db.collection(ENROLLMENTS).doc(enrollmentId(userId, courseId));

    await this.db.runTransaction(async (t) => {
      const snap = await t.get(enrollmentRef);
      const existing = snap.exists ? (snap.data() as Enrollment) : null;
      if (!existing || existing.status !== 'ACTIVE') {
        throw new NotEnrolledException();
      }
      t.update(enrollmentRef, {
        lastAccessedLessonId: lessonId,
        lastAccessedAt: nowIso,
        updatedAt: nowIso,
      });
    });
  }

  async setLastWatchedSeconds(
    userId: UserId,
    courseId: CourseId,
    lessonId: LessonId,
    seconds: number,
  ): Promise<{ lastWatchedSeconds: number }> {
    const enrollmentRef = this.db.collection(ENROLLMENTS).doc(enrollmentId(userId, courseId));

    return this.db.runTransaction(async (t) => {
      const snap = await t.get(enrollmentRef);
      const existing = snap.exists ? (snap.data() as Enrollment) : null;
      if (!existing || existing.status !== 'ACTIVE') {
        throw new NotEnrolledException();
      }

      const progress = [...(existing.progress ?? [])];
      const idx = progress.findIndex((p) => p.lessonId === lessonId);
      const existingRow = idx >= 0 ? progress[idx] : undefined;

      if (existingRow && existingRow.lastWatchedSeconds >= seconds) {
        // Equal value (idempotent) or monotonic regression — drop the write.
        return { lastWatchedSeconds: existingRow.lastWatchedSeconds };
      }

      if (existingRow) {
        progress[idx] = { ...existingRow, lastWatchedSeconds: seconds };
      } else {
        progress.push({ lessonId, completedAt: null, lastWatchedSeconds: seconds });
      }

      const now = nowIso();
      t.update(enrollmentRef, { progress, updatedAt: now });
      return { lastWatchedSeconds: seconds };
    });
  }
}
